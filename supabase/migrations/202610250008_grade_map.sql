begin;
alter table public.miyar_reviews add column share_grade boolean not null default false;
alter table public.miyar_reviews add column grade_consented_at timestamptz;
alter table public.miyar_reviews add constraint miyar_grade_consent_record
 check ((share_grade and grade_consented_at is not null) or (not share_grade and grade_consented_at is null));
create index miyar_shared_grade_cohorts on public.miyar_reviews(doctor_id,subject) where status='published' and share_grade;

-- Old submission signatures stay private and default to no statistical sharing.
create function public.miyar_submit_google_review(p_account uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_share_grade is null then raise exception 'INVALID_GRADE_CONSENT'; end if;
 result=miyar_submit_google_review(p_account,p_college,p_major,p_name,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags);
 update miyar_reviews set share_grade=p_share_grade,grade_consented_at=case when p_share_grade then now() end where id=(result->>'id')::bigint and account_id=p_account;
 return result;
end; $$;
create function public.miyar_guest_submit(p_guest uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_share_grade is null then raise exception 'INVALID_GRADE_CONSENT'; end if;
 result=miyar_guest_submit(p_guest,p_college,p_major,p_name,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags);
 update miyar_reviews set share_grade=p_share_grade,grade_consented_at=case when p_share_grade then now() end where id=(result->>'id')::bigint and guest_id=p_guest;
 return result;
end; $$;

create function public.miyar_grade_subject(p_subject text) returns text language sql immutable strict security invoker set search_path=public as $$
 select lower(regexp_replace(btrim(p_subject),'[[:space:]]+',' ','g'));
$$;
-- Moving a review to another course needs a fresh choice about the old grade.
create function public.miyar_grade_course_change() returns trigger language plpgsql set search_path=public as $$
begin
 if miyar_grade_subject(new.subject) is distinct from miyar_grade_subject(old.subject) then
  new.share_grade=false;new.grade_consented_at=null;
 end if;
 return new;
end; $$;
create trigger miyar_grade_course_changed before update of subject on public.miyar_reviews for each row execute function public.miyar_grade_course_change();
create function public.miyar_grade_distribution(p_doctor bigint,p_subject text default null) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare subjects jsonb; total integer; average numeric; high numeric; bins jsonb; normalized text;
begin
 if not exists(select 1 from miyar_doctors where id=p_doctor and status='approved') then raise exception 'GRADE_DOCTOR_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(label order by label),'[]'::jsonb) into subjects from (
  select min(regexp_replace(btrim(subject),'[[:space:]]+',' ','g')) as label from miyar_reviews
  where doctor_id=p_doctor and status='published' group by miyar_grade_subject(subject) order by label limit 100
 ) s;
 if p_subject is null then return jsonb_build_object('minimum',10,'available',false,'subject',null,'subjects',subjects); end if;
 normalized=miyar_grade_subject(p_subject);
 -- Count one latest published, opted-in contribution per identity and course.
 with eligible as (
  select distinct on (coalesce('account:'||r.account_id::text,'guest:'||r.guest_id::text,'legacy:'||r.user_id::text)) r.grade
  from miyar_reviews r
  where r.doctor_id=p_doctor and r.status='published' and r.share_grade and miyar_grade_subject(r.subject)=normalized
   and (r.account_id is null or exists(select 1 from miyar_accounts a where a.auth_id=r.account_id and a.status<>'banned'))
   and (r.guest_id is null or exists(select 1 from miyar_guest_sessions g where g.id=r.guest_id and g.status<>'banned'))
  order by coalesce('account:'||r.account_id::text,'guest:'||r.guest_id::text,'legacy:'||r.user_id::text),r.created_at desc,r.id desc
 ), stats as (
  select count(*)::int n,round(avg(grade),1) mean,
   count(*) filter(where grade>=90)::int high_count,
   count(*) filter(where grade between 80 and 89)::int b80,
   count(*) filter(where grade between 70 and 79)::int b70,
   count(*) filter(where grade between 60 and 69)::int b60,
   count(*) filter(where grade<60)::int b0 from eligible
 ) select n,mean,round(100.0*high_count/greatest(n,1)),jsonb_build_array(
  jsonb_build_object('band','90–100','count',high_count,'percent',round(100.0*high_count/greatest(n,1))),
  jsonb_build_object('band','80–89','count',b80,'percent',round(100.0*b80/greatest(n,1))),
  jsonb_build_object('band','70–79','count',b70,'percent',round(100.0*b70/greatest(n,1))),
  jsonb_build_object('band','60–69','count',b60,'percent',round(100.0*b60/greatest(n,1))),
  jsonb_build_object('band','0–59','count',b0,'percent',round(100.0*b0/greatest(n,1)))
 ) into total,average,high,bins from stats;
 -- No small-cohort counts, individual grades or all-course aggregate can escape.
 if total<10 then return jsonb_build_object('minimum',10,'available',false,'subject',p_subject,'subjects',subjects); end if;
 return jsonb_build_object('minimum',10,'available',true,'subject',p_subject,'subjects',subjects,'total',total,'average',average,'highPercent',high,'bins',bins);
end; $$;

create function public.miyar_grade_participation(p_account uuid,p_guest uuid,p_before bigint default null) returns jsonb language plpgsql stable security invoker set search_path=public as $$
begin
 if num_nonnulls(p_account,p_guest)<>1 then raise exception 'INVALID_GRADE_CONSENT'; end if;
 return (select coalesce(jsonb_agg(x order by x.id desc),'[]'::jsonb) from (
  select r.id,r.subject,r.share_grade,r.status,d.name as doctor_name,u.name as university
  from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id
  join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id
  where ((p_account is not null and r.account_id=p_account) or (p_guest is not null and r.guest_id=p_guest))
   and (p_before is null or r.id<p_before) order by r.id desc limit 51
 ) x);
end; $$;
create function public.miyar_set_grade_consent(p_account uuid,p_guest uuid,p_review bigint,p_consent boolean,p_subject text default null) returns jsonb language plpgsql security invoker set search_path=public as $$
declare state text; current_subject text;
begin
 if num_nonnulls(p_account,p_guest)<>1 or p_consent is null then raise exception 'INVALID_GRADE_CONSENT'; end if;
 if p_account is not null then select status into state from miyar_accounts where auth_id=p_account;
 else select status into state from miyar_guest_sessions where id=p_guest; end if;
 if state is null or (p_consent and state<>'active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select subject into current_subject from miyar_reviews where id=p_review and ((p_account is not null and account_id=p_account) or (p_guest is not null and guest_id=p_guest)) for update;
 if not found then raise exception 'GRADE_REVIEW_NOT_FOUND'; end if;
 if p_consent and (p_subject is null or miyar_grade_subject(p_subject) is distinct from miyar_grade_subject(current_subject)) then raise exception 'GRADE_SUBJECT_CHANGED'; end if;
 update miyar_reviews set share_grade=p_consent,grade_consented_at=case when p_consent then coalesce(grade_consented_at,now()) end
 where id=p_review and ((p_account is not null and account_id=p_account) or (p_guest is not null and guest_id=p_guest));
 if not found then raise exception 'GRADE_REVIEW_NOT_FOUND'; end if;
 return jsonb_build_object('ok',true,'shareGrade',p_consent);
end; $$;

revoke execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean),public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean),public.miyar_grade_subject(text),public.miyar_grade_course_change(),public.miyar_grade_distribution(bigint,text),public.miyar_grade_participation(uuid,uuid,bigint),public.miyar_set_grade_consent(uuid,uuid,bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean),public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean),public.miyar_grade_subject(text),public.miyar_grade_course_change(),public.miyar_grade_distribution(bigint,text),public.miyar_grade_participation(uuid,uuid,bigint),public.miyar_set_grade_consent(uuid,uuid,bigint,boolean,text) to service_role;
commit;
