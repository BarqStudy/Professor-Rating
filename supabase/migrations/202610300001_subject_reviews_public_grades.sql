begin;
-- Reviews are unique per university professor, normalized subject and verified
-- identity. Existing rows, moderation states and guest links are retained.
create or replace function public.miyar_one_review_per_doctor() returns trigger
language plpgsql security invoker set search_path=public as $$
declare owner_account uuid; subject_key text;
begin
 if tg_op='UPDATE' and new.account_id is not distinct from old.account_id
  and new.guest_id is not distinct from old.guest_id and new.doctor_id=old.doctor_id
  and miyar_course_key(new.subject)=miyar_course_key(old.subject) then return new; end if;
 owner_account=new.account_id;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=new.guest_id; end if;
 subject_key=miyar_course_key(new.subject);
 perform pg_advisory_xact_lock(hashtextextended('miyar-review:'||coalesce(owner_account::text,'guest:'||new.guest_id::text)||':'||new.doctor_id::text||':'||subject_key,0));
 if exists(select 1 from miyar_reviews r where r.id is distinct from new.id and r.doctor_id=new.doctor_id
  and miyar_course_key(r.subject)=subject_key and (
   (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account)))
   or (new.guest_id is not null and r.guest_id=new.guest_id)
 )) then raise exception 'REVIEW_ALREADY_EXISTS'; end if;
 return new;
end; $$;
drop trigger miyar_single_review on public.miyar_reviews;
create trigger miyar_single_review before insert or update of subject,doctor_id,account_id,guest_id on public.miyar_reviews
 for each row execute function public.miyar_one_review_per_doctor();
create index miyar_review_identity_subject on public.miyar_reviews(doctor_id,miyar_course_key(subject),account_id,guest_id);

create function public.miyar_review_eligibility(p_account uuid,p_guest uuid,p_doctor bigint,p_subject text) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare owner_account uuid; university bigint; previous record;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then select university_id into university from miyar_accounts where auth_id=p_account and status='active';
 else select university_id into university from miyar_guest_sessions where id=p_guest and status='active'; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if not exists(select 1 from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=p_doctor and d.status='approved' and c.university_id=university) then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 -- The general form can open before a subject is chosen.
 if p_subject is null or btrim(p_subject)='' then return jsonb_build_object('eligible',true); end if;
 owner_account=p_account;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=p_guest; end if;
 select r.id,r.status,r.account_id,r.guest_id into previous from miyar_reviews r where r.doctor_id=p_doctor
  and miyar_course_key(r.subject)=miyar_course_key(p_subject) and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 ) order by r.created_at desc,r.id desc limit 1;
 if found then return jsonb_build_object('eligible',false,'status',previous.status,'canEdit',previous.status='published' and (p_account is not null or previous.guest_id=p_guest)); end if;
 return jsonb_build_object('eligible',true);
end; $$;
create or replace function public.miyar_review_eligibility(p_account uuid,p_guest uuid,p_doctor bigint) returns jsonb
language sql stable security invoker set search_path=public as $$
 select miyar_review_eligibility(p_account,p_guest,p_doctor,null);
$$;

-- Grades collected under the earlier private-grade notice remain private.
alter table public.miyar_reviews add column public_grade_notice_at timestamptz;

create or replace function public.miyar_submit_google_review(
  p_account uuid,p_college text,p_major text,p_name text,p_subject text,
  p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_major bigint; v_doctor bigint; v_status text; v_review bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  select status into v_status from miyar_accounts where auth_id=p_account for update;
  if v_status is distinct from 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
  select m.id into v_major from miyar_majors m join miyar_colleges c on c.id=m.college_id
    where m.name=p_major and c.name=p_college
      and c.university_id=(select university_id from miyar_accounts where auth_id=p_account);
  if v_major is null then raise exception 'INVALID_MAJOR'; end if;
  insert into miyar_doctors(major_id,name,submitted_by_account) values(v_major,p_name,p_account)
    on conflict(major_id,name) do nothing;
  select id,status into v_doctor,v_status from miyar_doctors where major_id=v_major and name=p_name;
  if v_status not in ('pending','approved') then raise exception 'DOCTOR_UNAVAILABLE'; end if;
  insert into miyar_reviews(doctor_id,account_id,subject,grade,explanation,treatment,grading,comment)
    values(v_doctor,p_account,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment)
    returning id into v_review;
  return jsonb_build_object('id',v_review,'status','pending','newDoctor',v_status='pending');
end;
$$;

create or replace function public.miyar_guest_submit(p_guest uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[]) returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor miyar_guest_sessions%rowtype; major bigint; doctor bigint; state text; result bigint;
begin
 select * into actor from miyar_guest_sessions where id=p_guest for update;
 if not found or actor.status<>'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if actor.university_id is null then raise exception 'UNIVERSITY_REQUIRED'; end if;
 select m.id into major from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.name=p_major and c.name=p_college and c.university_id=actor.university_id;
 if major is null then raise exception 'INVALID_MAJOR'; end if;
 insert into miyar_doctors(major_id,name,submitted_by_guest) values(major,p_name,p_guest) on conflict(major_id,name) do nothing;
 select id,status into doctor,state from miyar_doctors where major_id=major and name=p_name;
 if state not in ('pending','approved') then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 insert into miyar_reviews(doctor_id,guest_id,subject,grade,explanation,treatment,grading,comment,tags,pledged_at) values(doctor,p_guest,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,now()) returning id into result;
 return jsonb_build_object('id',result,'status','pending','newDoctor',state='pending');
end; $$;

create function public.miyar_submit_google_review(
 p_account uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,
 p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 result=miyar_submit_google_review(p_account,p_college,p_major,p_name,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and account_id=p_account;
 return result;
end; $$;
revoke execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;
create function public.miyar_submit_existing_google_review(
 p_account uuid,p_doctor bigint,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 result=miyar_submit_existing_google_review(p_account,p_doctor,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and account_id=p_account;
 return result;
end; $$;
revoke execute on function public.miyar_submit_existing_google_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_submit_existing_google_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;
create function public.miyar_guest_submit(
 p_guest uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,
 p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 result=miyar_guest_submit(p_guest,p_college,p_major,p_name,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and guest_id=p_guest;
 return result;
end; $$;
revoke execute on function public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;
create function public.miyar_submit_existing_guest_review(
 p_guest uuid,p_doctor bigint,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 result=miyar_submit_existing_guest_review(p_guest,p_doctor,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and guest_id=p_guest;
 return result;
end; $$;
revoke execute on function public.miyar_submit_existing_guest_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_submit_existing_guest_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;

-- Editing keeps the review on its subject. A different subject gets its own review.
create function public.miyar_review_edit_subject() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if exists(select 1 from miyar_reviews where id=new.review_id and miyar_course_key(subject) is distinct from miyar_course_key(new.subject)) then raise exception 'REVIEW_SUBJECT_LOCKED'; end if;
 return new;
end; $$;
create trigger miyar_review_edit_subject_check before insert or update of subject on public.miyar_review_edits
 for each row execute function public.miyar_review_edit_subject();

-- Guest evaluations can be amended from the same browser capability. Linking
-- that capability to a verified account also makes those evaluations editable.
alter table public.miyar_review_edits alter column account_id drop not null;
alter table public.miyar_review_edits add column guest_id uuid references public.miyar_guest_sessions(id) on delete restrict;
alter table public.miyar_review_edits add constraint miyar_edit_single_identity check(num_nonnulls(account_id,guest_id)=1);
create function public.miyar_request_guest_edit(p_guest uuid,p_review bigint,p_subject text,p_comment text,p_explanation int,p_treatment int,p_grading int,p_tags text[]) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare result bigint;
begin
 perform 1 from miyar_guest_sessions where id=p_guest and status='active' for update;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 perform 1 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.id=p_review and r.guest_id=p_guest and r.status='published' and d.status='approved' and c.university_id=(select university_id from miyar_guest_sessions where id=p_guest) for update of r;
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 if exists(select 1 from miyar_review_edits where review_id=p_review and status='pending') then raise exception 'PENDING_EDIT'; end if;
 insert into miyar_review_edits(review_id,guest_id,subject,comment,explanation,treatment,grading,tags) values(p_review,p_guest,p_subject,p_comment,p_explanation,p_treatment,p_grading,p_tags) returning id into result;
 return jsonb_build_object('id',result,'status','pending');
end; $$;
create function public.miyar_guest_reviews(p_guest uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select r.id,r.doctor_id,d.name as doctor_name,r.subject,r.comment,r.tags,r.explanation,r.treatment,r.grading,r.status,r.created_at,
 (select e.status from miyar_review_edits e where e.review_id=r.id order by e.id desc limit 1) as edit_status
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.guest_id=p_guest and c.university_id=(select university_id from miyar_guest_sessions where id=p_guest) order by r.created_at desc,r.id desc limit 100
 ) x;
$$;
create or replace function public.miyar_moderate_edit(p_id bigint,p_approve boolean) returns void language plpgsql security invoker set search_path=public as $$
declare e miyar_review_edits%rowtype; r miyar_reviews%rowtype;
begin
 select * into e from miyar_review_edits where id=p_id and status='pending';
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 select * into r from miyar_reviews where id=e.review_id for update;
 select * into e from miyar_review_edits where id=p_id and status='pending' for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_approve then
  if r.status<>'published' or not coalesce(((e.account_id is not null and (r.account_id=e.account_id or exists(select 1 from miyar_review_identities where guest_id=r.guest_id and account_id=e.account_id))) or (e.guest_id is not null and r.guest_id=e.guest_id)),false) or not exists(select 1 from miyar_doctors where id=r.doctor_id and status='approved') then raise exception 'REVIEW_UNAVAILABLE'; end if;
  update miyar_reviews set subject=e.subject,comment=e.comment,explanation=e.explanation,treatment=e.treatment,grading=e.grading,tags=e.tags where id=r.id;
 end if;
 update miyar_review_edits set status=case when p_approve then 'approved' else 'rejected' end where id=p_id;
end; $$;
create or replace function public.miyar_request_edit(p_account uuid,p_review bigint,p_subject text,p_comment text,p_explanation int,p_treatment int,p_grading int) returns jsonb language plpgsql security invoker set search_path=public as $$
declare u bigint; result bigint;
begin
 u=miyar_community_account(p_account);
 perform 1 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where r.id=p_review and (r.account_id=p_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=p_account)) and r.status='published' and d.status='approved' and c.university_id=u;
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 if exists(select 1 from miyar_review_edits where review_id=p_review and status='pending') then raise exception 'PENDING_EDIT'; end if;
 if (select count(*) from miyar_review_edits where account_id=p_account and created_at>now()-interval '24 hours')>=5 then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_review_edits(review_id,account_id,subject,comment,explanation,treatment,grading) values(p_review,p_account,p_subject,p_comment,p_explanation,p_treatment,p_grading) returning id into result;
 return jsonb_build_object('id',result,'status','pending');
end; $$;
create or replace function public.miyar_my_reviews(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select r.id,r.doctor_id,d.name as doctor_name,r.subject,r.comment,r.tags,r.explanation,r.treatment,r.grading,r.status,r.created_at,
 (select e.status from miyar_review_edits e where e.review_id=r.id order by e.id desc limit 1) as edit_status
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where (r.account_id=p_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=p_account)) and c.university_id=(select university_id from miyar_accounts where auth_id=p_account) order by r.created_at desc limit 100
 ) x;
$$;
revoke execute on function public.miyar_request_guest_edit(uuid,bigint,text,text,int,int,int,text[]),public.miyar_guest_reviews(uuid) from public,anon,authenticated;
grant execute on function public.miyar_request_guest_edit(uuid,bigint,text,text,int,int,int,text[]),public.miyar_guest_reviews(uuid) to service_role;

-- A single safe projection for both the directory and plan/advisor reviews.
create function public.miyar_public_review(p_review public.miyar_reviews) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('id',p_review.id,'subject',p_review.subject,'comment',p_review.comment,'tags',p_review.tags,
  'scores',jsonb_build_array(p_review.explanation,p_review.treatment,p_review.grading),'date',p_review.created_at)
  || case when p_review.public_grade_notice_at is not null then jsonb_build_object('grade',p_review.grade) else '{}'::jsonb end;
$$;
create function public.miyar_public_reviews(p_doctor bigint,p_subject text default null) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_doctors where id=p_doctor and status='approved') then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 return (select coalesce(jsonb_agg(miyar_public_review(r) order by r.created_at desc,r.id desc),'[]'::jsonb) from (
  select * from miyar_reviews where doctor_id=p_doctor and status='published' and (p_subject is null or miyar_course_key(subject)=miyar_course_key(p_subject)) order by created_at desc,id desc limit 100
 ) r);
end; $$;
create or replace function public.miyar_course_reviews(p_course text,p_doctor bigint) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_study_courses where id=p_course and linkable) then raise exception 'STUDY_COURSE_NOT_FOUND'; end if;
 return (select coalesce(jsonb_agg(miyar_public_review(r) order by r.created_at desc,r.id desc),'[]'::jsonb) from (
  select * from miyar_course_evidence(p_course) where doctor_id=p_doctor order by created_at desc,id desc limit 100
 ) r);
end; $$;
revoke execute on function public.miyar_review_eligibility(uuid,uuid,bigint,text),public.miyar_review_edit_subject(),public.miyar_public_review(public.miyar_reviews),public.miyar_public_reviews(bigint,text) from public,anon,authenticated;
grant execute on function public.miyar_review_eligibility(uuid,uuid,bigint,text),public.miyar_review_edit_subject(),public.miyar_public_review(public.miyar_reviews),public.miyar_public_reviews(bigint,text) to service_role;
commit;
