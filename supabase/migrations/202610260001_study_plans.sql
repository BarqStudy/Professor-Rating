begin;
create table public.miyar_study_plans (
 id text primary key check(char_length(id) between 3 and 80),
 major_id bigint not null references public.miyar_majors(id) on delete restrict,
 metadata jsonb not null check(jsonb_typeof(metadata)='object')
);
create table public.miyar_study_courses (
 id text primary key check(char_length(id) between 5 and 150),
 plan_id text not null references public.miyar_study_plans(id) on delete restrict,
 code text not null,
 name text not null check(char_length(name) between 2 and 120),
 linkable boolean not null default true
);
create index miyar_study_courses_plan on public.miyar_study_courses(plan_id);
alter table public.miyar_study_plans enable row level security;
alter table public.miyar_study_courses enable row level security;
revoke all on public.miyar_study_plans,public.miyar_study_courses from public,anon,authenticated;
grant all on public.miyar_study_plans,public.miyar_study_courses to service_role;
alter table public.miyar_reviews add column course_id text references public.miyar_study_courses(id) on delete restrict;
create index miyar_review_study_course on public.miyar_reviews(course_id,doctor_id) where status='published' and course_id is not null;
-- No backfill by subject name: old free-text reviews do not identify a plan/version.
create function public.miyar_check_review_course() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' and miyar_grade_subject(new.subject) is distinct from miyar_grade_subject(old.subject) then
  new.course_id=null;
 end if;
 if new.course_id is not null and not exists (
  select 1 from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
  join miyar_doctors d on d.id=new.doctor_id and d.major_id=p.major_id
  where c.id=new.course_id and c.linkable and miyar_grade_subject(c.name)=miyar_grade_subject(new.subject)
 ) then raise exception 'INVALID_STUDY_COURSE'; end if;
 return new;
end; $$;
create trigger miyar_review_course_check before insert or update of subject,course_id,doctor_id on public.miyar_reviews for each row execute function public.miyar_check_review_course();
-- Preserve existing transactional limits/moderation and append the explicit course.
create function public.miyar_submit_google_review(
 p_account uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,
 p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 result=miyar_submit_google_review(p_account,p_college,p_major,p_name,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade);
 update miyar_reviews set course_id=p_course where id=(result->>'id')::bigint;
 return result;
end; $$;
create function public.miyar_guest_submit(
 p_guest uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,
 p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 result=miyar_guest_submit(p_guest,p_college,p_major,p_name,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade);
 update miyar_reviews set course_id=p_course where id=(result->>'id')::bigint;
 return result;
end; $$;
create function public.miyar_course_doctors(p_course text) returns jsonb language plpgsql stable security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_study_courses where id=p_course and linkable) then raise exception 'STUDY_COURSE_NOT_FOUND'; end if;
 return (select coalesce(jsonb_agg(x order by x.score desc,x.count desc,x.id),'[]'::jsonb) from (
  select d.id,d.name,d.verified,count(r.id)::int as count,
   round(avg((r.explanation+r.treatment+r.grading)/3.0))::int as score,
   jsonb_build_array(round(avg(r.explanation)),round(avg(r.treatment)),round(avg(r.grading))) as scores
  from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
  join miyar_doctors d on d.major_id=p.major_id and d.status='approved'
  join miyar_reviews r on r.doctor_id=d.id and r.course_id=c.id and r.status='published'
  where c.id=p_course and c.linkable group by d.id order by score desc,count desc,d.id limit 100
 ) x);
end; $$;
revoke execute on function public.miyar_check_review_course(),public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text),public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text),public.miyar_course_doctors(text) from public,anon,authenticated;
grant execute on function public.miyar_check_review_course(),public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text),public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[],boolean,text),public.miyar_course_doctors(text) to service_role;
commit;
