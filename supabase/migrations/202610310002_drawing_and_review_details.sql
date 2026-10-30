begin;
-- Add the requested shared subject to every currently live curriculum. Keep the
-- mechanical drawing identity and all existing review/progress links untouched.
-- DRAWING is a platform identifier, not an invented university course code;
-- hours stay unknown until the administrator supplies the academic information.
do $drawing$
declare plan record; course jsonb; courses jsonb; next_plan jsonb;
begin
 for plan in select * from miyar_study_plans where deleted_at is null and jsonb_typeof(metadata->'courses')='array' for update loop
  select value into course from jsonb_array_elements(plan.metadata->'courses')
   where value->>'kind'='course' and miyar_course_key(value->>'name')=miyar_course_key('الرسم الهندسي')
   and value->>'pool' is null order by value->>'id' limit 1;
  if course is null then
   course=jsonb_build_object('id',plan.id||'/engineering-drawing','code','DRAWING','name','الرسم الهندسي',
    'credits',null,'level',3,'page',null,'prerequisites','[]'::jsonb,'corequisites','[]'::jsonb,
    'anyPrerequisites','[]'::jsonb,'pool',null,'kind','course','linkable',true,'platformAddition',true);
   courses=(plan.metadata->'courses')||jsonb_build_array(course);
  else courses=plan.metadata->'courses'; end if;
  course=course||jsonb_build_object('level',3,'preparatoryEligible',true);
  select jsonb_agg(case when value->>'id'=course->>'id' then course else value end order by position)
   into courses from jsonb_array_elements(courses) with ordinality rows(value,position);
  next_plan=plan.metadata||jsonb_build_object('courses',courses,'revision',plan.revision+1,
   'levels',(select jsonb_agg(level order by level) from (select distinct (value->>'level')::int level from jsonb_array_elements(courses) where (value->>'level')::int>0) levels),
   'uncertainCredits',exists(select 1 from jsonb_array_elements(courses) where value->>'credits' is null));
  insert into miyar_study_courses(id,plan_id,code,name,linkable)
   values(course->>'id',plan.id,course->>'code',course->>'name',coalesce((course->>'linkable')::boolean,true))
   on conflict(id) do update set code=excluded.code,name=excluded.name,linkable=excluded.linkable;
  update miyar_study_plans set metadata=next_plan,revision=plan.revision+1 where id=plan.id;
 end loop;
end; $drawing$;

-- The platform owner requested the stored grades of older published reviews as
-- well. Preserve their actual timestamps and notice/consent history; do not
-- fabricate a new consent event or turn pending/rejected reviews into public ones.
create or replace function public.miyar_public_review(p_review public.miyar_reviews) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('id',p_review.id,'subject',p_review.subject,'comment',p_review.comment,'tags',p_review.tags,
  'scores',jsonb_build_array(p_review.explanation,p_review.treatment,p_review.grading),
  'date',p_review.created_at,'grade',p_review.grade,'likes',miyar_review_like_count(p_review.id));
$$;
commit;
