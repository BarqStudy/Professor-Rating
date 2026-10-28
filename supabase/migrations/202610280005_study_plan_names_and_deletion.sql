begin;
alter table public.miyar_study_plans add column deleted_at timestamptz;
drop index public.miyar_study_plan_version;
create unique index miyar_study_plan_version on public.miyar_study_plans(major_id,lower(coalesce(metadata->>'versionKey',metadata->>'fileLabel')))
 where deleted_at is null and coalesce(metadata->>'versionKey',metadata->>'fileLabel') is not null;
-- Exclude archived identities from editing; keep the original revision fencing.
create or replace function public.miyar_update_study_plan(p_admin uuid,p_id text,p_revision integer,p_plan jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare previous jsonb; current_revision integer; course jsonb; cid text;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select metadata,revision into previous,current_revision from miyar_study_plans where id=p_id and deleted_at is null for update;
 if not found then raise exception 'STUDY_PLAN_NOT_FOUND'; end if;
 if p_revision is null or p_revision<>current_revision then raise exception 'STUDY_PLAN_EDIT_CONFLICT'; end if;
 if jsonb_typeof(p_plan) is distinct from 'object' or p_plan->>'id' is distinct from p_id
  or p_plan->>'title' is null or char_length(p_plan->>'title') not between 2 and 100
  or p_plan->>'sha256' is distinct from previous->>'sha256'
  or p_plan->>'fileLabel' is distinct from previous->>'fileLabel'
  or p_plan->>'version' is distinct from previous->>'version'
  or p_plan->>'major' is distinct from previous->>'major'
  or p_plan->>'university' is distinct from previous->>'university'
  or p_plan->>'college' is distinct from previous->>'college'
  or (p_plan->>'revision')::integer is distinct from current_revision+1
  or jsonb_typeof(p_plan->'courses') is distinct from 'array'
 then raise exception 'INVALID_STUDY_PLAN'; end if;
 if jsonb_array_length(p_plan->'courses') not between 1 and 240
  or not exists(select 1 from jsonb_array_elements(p_plan->'courses') c where (c->>'level')::integer>0)
  or exists(select 1 from jsonb_array_elements(p_plan->'courses') c group by c->>'id' having count(*)>1)
 then raise exception 'INVALID_STUDY_PLAN'; end if;
 for course in select value from jsonb_array_elements(p_plan->'courses') loop
  cid=course->>'id';
  if jsonb_typeof(course) is distinct from 'object' or not(course?&array['id','kind','name','code','level','credits','linkable','prerequisites','corequisites','anyPrerequisites'])
   or cid is null or left(cid,length(p_id)+1)<>p_id||'/' or char_length(cid)>150
   or course->>'kind' is null or course->>'kind' not in ('course','slot') or course->>'name' is null or char_length(course->>'name') not between 2 and 120
   or course->>'code' is null or char_length(course->>'code') not between 1 and 50
   or course->>'level' is null or (course->>'level')::integer not between 0 and 20
   or ((course->>'credits') is not null and (course->>'credits')::integer not between 0 and 30)
   or jsonb_typeof(course->'prerequisites') is distinct from 'array' or jsonb_typeof(course->'corequisites') is distinct from 'array'
   or jsonb_typeof(course->'anyPrerequisites') is distinct from 'array' or jsonb_typeof(course->'linkable') is distinct from 'boolean'
  then raise exception 'INVALID_STUDY_PLAN'; end if;
  if exists(select 1 from jsonb_array_elements(previous->'courses') c where c->>'id'=cid and c->>'kind' is distinct from course->>'kind') then raise exception 'INVALID_STUDY_PLAN'; end if;
  if not exists(select 1 from jsonb_array_elements(previous->'courses') c where c->>'id'=cid and c->>'kind'=course->>'kind') then
   if cid!~('/c-[a-f0-9]{20}$') or exists(select 1 from miyar_study_courses where id=cid) then raise exception 'INVALID_STUDY_PLAN'; end if;
  end if;
 end loop;
 -- Keep removed identities for historical review foreign keys, but stop new links.
 update miyar_study_courses set linkable=false where plan_id=p_id and id not in
  (select c->>'id' from jsonb_array_elements(p_plan->'courses') c where c->>'kind'='course');
 for course in select value from jsonb_array_elements(p_plan->'courses') where value->>'kind'='course' loop
  insert into miyar_study_courses(id,plan_id,code,name,linkable)
   values(course->>'id',p_id,course->>'code',course->>'name',(course->>'linkable')::boolean)
   on conflict(id) do update set code=excluded.code,name=excluded.name,linkable=excluded.linkable;
 end loop;
 insert into miyar_study_plan_edits(plan_id,revision,edited_by,before_metadata,after_metadata)
  values(p_id,current_revision+1,p_admin,previous,p_plan);
 update miyar_study_plans set metadata=p_plan,revision=current_revision+1 where id=p_id;
 return jsonb_build_object('ok',true,'id',p_id,'revision',current_revision+1,'plan',p_plan);
end; $$;


-- A fresh upload may reuse the version label of a removed plan, but never its identity.
create or replace function public.miyar_publish_study_plan_data(p_admin uuid,p_major bigint,p_plan jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
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
 if exists(select 1 from miyar_study_plans where id=v_id and deleted_at is not null) then raise exception 'STUDY_PLAN_NOT_FOUND'; end if;
 select metadata into existing from miyar_study_plans where id=v_id and major_id=p_major;
 if existing is not null then
  if existing=v_plan then return jsonb_build_object('ok',true,'id',v_id,'alreadySaved',true); end if;
  raise exception 'STUDY_PLAN_EXISTS';
 end if;
 if exists(select 1 from miyar_study_plans where major_id=p_major and deleted_at is null and lower(coalesce(metadata->>'versionKey',metadata->>'fileLabel'))=lower(p_plan->>'versionKey')) then raise exception 'STUDY_PLAN_EXISTS'; end if;
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

create or replace function public.miyar_admin_study_plans() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'revision',p.revision,'title',p.metadata->>'title',
  'version',coalesce(p.metadata->>'fileLabel',p.metadata->>'version'),'major',m.name,'college',c.name,'university',u.name,
  'courseCount',jsonb_array_length(p.metadata->'courses')) order by u.name,c.name,m.name,p.id),'[]'::jsonb)
 from miyar_study_plans p join miyar_majors m on m.id=p.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id where p.deleted_at is null;
$$;

create or replace function public.miyar_uploaded_study_plans() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(case when p.deleted_at is not null then jsonb_build_object('id',p.id,'deleted',true,'revision',p.revision)
  else p.metadata||jsonb_build_object('university',u.name,'college',c.name,'major',m.name,'revision',p.revision) end order by p.id),'[]'::jsonb)
 from miyar_study_plans p join miyar_majors m on m.id=p.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id
 where p.metadata->>'managed'='admin' or p.revision>0;
$$;

create function public.miyar_delete_study_plan(p_admin uuid,p_id text,p_revision integer) returns jsonb language plpgsql security invoker set search_path=public as $$
declare previous jsonb; current_revision integer; removed_at timestamptz; next_plan jsonb;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select metadata,revision,deleted_at into previous,current_revision,removed_at from miyar_study_plans where id=p_id for update;
 if not found then raise exception 'STUDY_PLAN_NOT_FOUND'; end if;
 if removed_at is not null then
  if p_revision=current_revision-1 then return jsonb_build_object('ok',true,'id',p_id,'deleted',true,'alreadyDeleted',true,'revision',current_revision); end if;
  raise exception 'STUDY_PLAN_EDIT_CONFLICT';
 end if;
 if p_revision is null or p_revision<>current_revision then raise exception 'STUDY_PLAN_EDIT_CONFLICT'; end if;
 next_plan=previous||jsonb_build_object('deleted',true,'revision',current_revision+1);
 update miyar_study_courses set linkable=false where plan_id=p_id;
 insert into miyar_study_plan_edits(plan_id,revision,edited_by,before_metadata,after_metadata)
  values(p_id,current_revision+1,p_admin,previous,next_plan);
 update miyar_study_plans set deleted_at=now(),revision=current_revision+1,metadata=next_plan where id=p_id;
 return jsonb_build_object('ok',true,'id',p_id,'deleted',true,'alreadyDeleted',false,'revision',current_revision+1);
end; $$;
revoke execute on function public.miyar_delete_study_plan(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.miyar_delete_study_plan(uuid,text,integer) to service_role;
commit;
