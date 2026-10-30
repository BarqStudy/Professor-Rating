begin;
-- Candidate matching is separate from the conservative identity normalizer.
-- Partial names suggest choices; ambiguous names never merge course identities.
create function public.miyar_course_words(p_subject text) returns text[]
language sql immutable strict security invoker set search_path=public as $$
 select coalesce(array_agg(distinct word order by word) filter(where word<>'' and word not in ('ماده','مقرر','course')),'{}'::text[])
 from (
  select miyar_course_key(token) as word from regexp_split_to_table(
   regexp_replace(regexp_replace(
    translate(regexp_replace(normalize(p_subject,NFKC),'[ؐ-ًؚ-ٰٟـ]','','g'),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),
    '([[:alpha:]])([0-9])','\1 \2','g'),'([0-9])([[:alpha:]])','\1 \2','g'),
   '[^[:alnum:]]+') token
 ) words;
$$;
create index miyar_study_course_review_words on public.miyar_study_courses using gin(miyar_course_words(name||' '||code)) where linkable;
create index miyar_study_course_review_name on public.miyar_study_courses(miyar_course_key(name)) where linkable;
create index miyar_study_course_review_code on public.miyar_study_courses(miyar_course_key(code)) where linkable;

create function public.miyar_known_course_matches(p_university bigint,p_subject text)
returns table(id text,name text,code text,plan_id text)
language sql stable security invoker set search_path=public as $$
 with exact as (
  select c.id,c.name,c.code,c.plan_id from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
  join miyar_majors m on m.id=p.major_id join miyar_colleges college on college.id=m.college_id
  where c.linkable and p.deleted_at is null and m.deleted_at is null and college.university_id=p_university
   and miyar_course_key(p_subject)<>'' and (miyar_course_key(c.name)=miyar_course_key(p_subject) or miyar_course_key(c.code)=miyar_course_key(p_subject))
 )
 select * from exact
 union all
 select c.id,c.name,c.code,c.plan_id from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
 join miyar_majors m on m.id=p.major_id join miyar_colleges college on college.id=m.college_id
 where c.linkable and p.deleted_at is null and m.deleted_at is null and college.university_id=p_university
  and not exists(select 1 from exact)
  and exists(select 1 from unnest(miyar_course_words(p_subject)) word where char_length(word)>=3 and word~'[[:alpha:]]')
  and miyar_course_words(c.name||' '||c.code) @> miyar_course_words(p_subject);
$$;

create function public.miyar_review_subject_name(p_university bigint,p_subject text) returns text
language sql stable security invoker set search_path=public as $$
 select case when count(distinct miyar_course_key(name))=1 then min(name) else p_subject end
 from miyar_known_course_matches(p_university,p_subject);
$$;

create function public.miyar_require_course_choice(p_university bigint,p_subject text,p_course text) returns text
language plpgsql stable security invoker set search_path=public as $$
declare canonical text;
begin
 if p_course is not null then
  select c.name into canonical from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
  join miyar_majors m on m.id=p.major_id join miyar_colleges college on college.id=m.college_id
  where c.id=p_course and c.linkable and p.deleted_at is null and m.deleted_at is null and college.university_id=p_university;
  if not found or miyar_course_key(canonical) is distinct from miyar_course_key(p_subject) then raise exception 'INVALID_STUDY_COURSE'; end if;
  return canonical;
 end if;
 if exists(select 1 from miyar_known_course_matches(p_university,p_subject)) then raise exception 'STUDY_COURSE_SELECTION_REQUIRED'; end if;
 return p_subject;
end; $$;

create or replace function public.miyar_submit_google_review(
 p_account uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,
 p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; canonical text; university bigint;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 select university_id into university from miyar_accounts where auth_id=p_account;
 canonical=miyar_require_course_choice(university,p_subject,p_course);
 result=miyar_submit_google_review(p_account,p_college,p_major,p_name,canonical,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and account_id=p_account;
 return result;
end; $$;
revoke execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;
create or replace function public.miyar_submit_existing_google_review(
 p_account uuid,p_doctor bigint,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; canonical text; university bigint;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 select university_id into university from miyar_accounts where auth_id=p_account;
 canonical=miyar_require_course_choice(university,p_subject,p_course);
 result=miyar_submit_existing_google_review(p_account,p_doctor,canonical,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and account_id=p_account;
 return result;
end; $$;
revoke execute on function public.miyar_submit_existing_google_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_submit_existing_google_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;
create or replace function public.miyar_guest_submit(
 p_guest uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,
 p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; canonical text; university bigint;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 select university_id into university from miyar_guest_sessions where id=p_guest;
 canonical=miyar_require_course_choice(university,p_subject,p_course);
 result=miyar_guest_submit(p_guest,p_college,p_major,p_name,canonical,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and guest_id=p_guest;
 return result;
end; $$;
revoke execute on function public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;
create or replace function public.miyar_submit_existing_guest_review(
 p_guest uuid,p_doctor bigint,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text,p_public_grade boolean
 ) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; canonical text; university bigint;
begin
 if p_public_grade is null then raise exception 'INVALID_PUBLIC_GRADE_NOTICE'; end if;
 select university_id into university from miyar_guest_sessions where id=p_guest;
 canonical=miyar_require_course_choice(university,p_subject,p_course);
 result=miyar_submit_existing_guest_review(p_guest,p_doctor,canonical,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
 update miyar_reviews set public_grade_notice_at=case when p_public_grade then now() end where id=(result->>'id')::bigint and guest_id=p_guest;
 return result;
end; $$;
revoke execute on function public.miyar_submit_existing_guest_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.miyar_submit_existing_guest_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text,boolean) to service_role;


create or replace function public.miyar_one_review_per_doctor() returns trigger
language plpgsql security invoker set search_path=public as $$
declare owner_account uuid; subject_key text; university bigint;
begin
 if tg_op='UPDATE' and new.account_id is not distinct from old.account_id
  and new.guest_id is not distinct from old.guest_id and new.doctor_id=old.doctor_id
  and miyar_course_key(new.subject)=miyar_course_key(old.subject) then return new; end if;
 owner_account=new.account_id;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=new.guest_id; end if;
 select c.university_id into university from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=new.doctor_id;
 subject_key=miyar_course_key(miyar_review_subject_name(university,new.subject));
 perform pg_advisory_xact_lock(hashtextextended('miyar-review:'||coalesce(owner_account::text,'guest:'||new.guest_id::text)||':'||new.doctor_id::text,0));
 if exists(select 1 from miyar_reviews r where r.id is distinct from new.id and r.doctor_id=new.doctor_id
  and miyar_course_key(miyar_review_subject_name(university,r.subject))=subject_key and (
   (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account)))
   or (new.guest_id is not null and r.guest_id=new.guest_id)
 )) then raise exception 'REVIEW_ALREADY_EXISTS'; end if;
 return new;
end; $$;

create or replace function public.miyar_review_eligibility(p_account uuid,p_guest uuid,p_doctor bigint,p_subject text) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare owner_account uuid; university bigint; previous record; reviewed_subjects jsonb;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then select university_id into university from miyar_accounts where auth_id=p_account and status='active';
 else select university_id into university from miyar_guest_sessions where id=p_guest and status='active'; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if not exists(select 1 from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=p_doctor and d.status='approved' and c.university_id=university) then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 owner_account=p_account;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=p_guest; end if;
 -- Only this verified identity's subjects for this professor are returned.
 -- Pending/rejected evaluations also reserve their subject against duplicates.
 select coalesce(jsonb_agg(distinct names.subject),'[]'::jsonb) into reviewed_subjects from miyar_reviews r
 cross join lateral (values(r.subject),(miyar_review_subject_name(university,r.subject))) names(subject)
 where r.doctor_id=p_doctor and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 );
 if p_subject is null or btrim(p_subject)='' then return jsonb_build_object('eligible',true,'reviewedSubjects',reviewed_subjects); end if;
 select r.id,r.status,r.account_id,r.guest_id into previous from miyar_reviews r where r.doctor_id=p_doctor
  and miyar_course_key(miyar_review_subject_name(university,r.subject))=miyar_course_key(miyar_review_subject_name(university,p_subject)) and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 ) order by r.created_at desc,r.id desc limit 1;
 if found then return jsonb_build_object('eligible',false,'reviewedSubjects',reviewed_subjects,'status',previous.status,'canEdit',previous.status='published' and (p_account is not null or previous.guest_id=p_guest)); end if;
 return jsonb_build_object('eligible',true,'reviewedSubjects',reviewed_subjects);
end; $$;
revoke execute on function public.miyar_course_words(text),public.miyar_known_course_matches(bigint,text),public.miyar_review_subject_name(bigint,text),public.miyar_require_course_choice(bigint,text,text) from public,anon,authenticated;
grant execute on function public.miyar_course_words(text),public.miyar_known_course_matches(bigint,text),public.miyar_review_subject_name(bigint,text),public.miyar_require_course_choice(bigint,text,text) to service_role;
commit;
