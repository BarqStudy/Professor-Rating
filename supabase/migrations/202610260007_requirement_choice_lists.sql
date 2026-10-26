begin;
-- Keep published plan versions intact; support bilingual course names and optional scoped requirement lists on new imports.
create or replace function public.miyar_publish_study_plan(p_admin uuid,p_major bigint,p_plan jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare target jsonb; course jsonb; v_plan jsonb; existing jsonb; v_id text; n int; required_count int;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 target=miyar_study_import_target(p_major);
 if jsonb_typeof(p_plan) is distinct from 'object' or not(p_plan?&array['id','title','fileLabel','versionKey','sha256','managed','courses']) then raise exception 'INVALID_STUDY_PLAN'; end if;
 v_id=p_plan->>'id';
 if v_id is null or v_id!~'^plan-[a-f0-9-]{36}$' or p_plan->>'managed'<>'admin' then raise exception 'INVALID_STUDY_PLAN'; end if;
 if jsonb_typeof(p_plan->'courses') is distinct from 'array' then raise exception 'INVALID_STUDY_PLAN'; end if;
 n=jsonb_array_length(p_plan->'courses');
 if n<1 or n>240 or char_length(p_plan->>'title') not between 2 and 100 or p_plan->>'title' !~ '[ء-ي]' or p_plan->>'title' ~ '[A-Za-z]'
 or char_length(p_plan->>'fileLabel') not between 1 and 80 or p_plan->>'sha256'!~'^[a-f0-9]{64}$' then raise exception 'INVALID_STUDY_PLAN'; end if;
 v_plan=p_plan||jsonb_build_object('university',target->>'university','college',target->>'college','major',target->>'major','managed','admin');
 perform pg_advisory_xact_lock(hashtextextended('study-plan:'||p_major::text,0));
 select metadata into existing from miyar_study_plans where id=v_id and major_id=p_major;
 if existing is not null then
  if existing=v_plan then return jsonb_build_object('ok',true,'id',v_id,'alreadySaved',true); end if;
  raise exception 'STUDY_PLAN_EXISTS';
 end if;
 if exists(select 1 from miyar_study_plans where major_id=p_major and lower(coalesce(metadata->>'versionKey',metadata->>'fileLabel'))=lower(p_plan->>'versionKey')) then raise exception 'STUDY_PLAN_EXISTS'; end if;
 required_count=0;
 for course in select value from jsonb_array_elements(p_plan->'courses') loop
  if jsonb_typeof(course) is distinct from 'object' or not(course?&array['id','kind','name','code','level','credits','prerequisites','corequisites','anyPrerequisites']) then raise exception 'INVALID_STUDY_PLAN'; end if;
  if course->>'id' is null or left(course->>'id',length(v_id)+1)<>v_id||'/'
   or course->>'id'!~'^plan-[a-f0-9-]{36}/c-[a-f0-9]{20}$'
   or course->>'kind' not in ('course','slot') or char_length(course->>'code') not between 1 and 50
   or char_length(course->>'name') not between 2 and 120 or course->>'name'!~'[ء-يA-Za-z]'
   or (course->>'level')::int not between 0 and 20
   or ((course->>'credits') is not null and (course->>'credits')::int not between 0 and 30)
   or jsonb_typeof(course->'prerequisites') is distinct from 'array' or jsonb_typeof(course->'corequisites') is distinct from 'array'
   or jsonb_typeof(course->'anyPrerequisites') is distinct from 'array'
  then raise exception 'INVALID_STUDY_PLAN'; end if;
  if course->>'requirementType' is not null and (course->>'requirementType' not in ('university','required') or p_plan->'requirementLists' is distinct from 'true'::jsonb or nullif(course->>'pool','') is null or (course->>'kind'='course' and (course->>'level')::int<>0)) then raise exception 'INVALID_STUDY_PLAN'; end if;
  if (course->>'level')::int>0 then required_count=required_count+1; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_plan->'courses') item where nullif(item.value->>'pool','') is not null group by item.value->>'pool' having count(distinct coalesce(item.value->>'requirementType','elective'))>1) then raise exception 'INVALID_STUDY_PLAN'; end if;
 if required_count=0 then raise exception 'INVALID_STUDY_PLAN'; end if;
 if exists(select 1 from jsonb_array_elements(p_plan->'courses') c group by c->>'id' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_plan->'courses') c where c->>'kind'='course' group by lower(c->>'code') having count(*)>1) then raise exception 'INVALID_STUDY_PLAN'; end if;
 insert into miyar_study_plans(id,major_id,metadata,imported_by) values(v_id,p_major,v_plan,p_admin);
 for course in select value from jsonb_array_elements(p_plan->'courses') loop
  if course->>'kind'='course' then
   insert into miyar_study_courses(id,plan_id,code,name,linkable) values(course->>'id',v_id,course->>'code',course->>'name',true);
  end if;
 end loop;
 return jsonb_build_object('ok',true,'id',v_id,'alreadySaved',false);
end; $$;
commit;
