begin;
alter table public.miyar_study_plans add column revision integer not null default 0 check(revision>=0);
create table public.miyar_study_plan_edits (
 plan_id text not null references public.miyar_study_plans(id) on delete restrict,
 revision integer not null,
 edited_by uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 before_metadata jsonb not null,
 after_metadata jsonb not null,
 created_at timestamptz not null default now(),
 primary key(plan_id,revision)
);
alter table public.miyar_study_plan_edits enable row level security;
revoke all on public.miyar_study_plan_edits from public,anon,authenticated;
grant all on public.miyar_study_plan_edits to service_role;

create function public.miyar_admin_study_plans() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'revision',p.revision,'title',p.metadata->>'title',
  'version',coalesce(p.metadata->>'fileLabel',p.metadata->>'version'),'major',m.name,'college',c.name,'university',u.name,
  'courseCount',jsonb_array_length(p.metadata->'courses')) order by u.name,c.name,m.name,p.id),'[]'::jsonb)
 from miyar_study_plans p join miyar_majors m on m.id=p.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id;
$$;

create function public.miyar_update_study_plan(p_admin uuid,p_id text,p_revision integer,p_plan jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare previous jsonb; current_revision integer; course jsonb; cid text;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select metadata,revision into previous,current_revision from miyar_study_plans where id=p_id for update;
 if not found then raise exception 'STUDY_PLAN_NOT_FOUND'; end if;
 if p_revision is null or p_revision<>current_revision then raise exception 'STUDY_PLAN_EDIT_CONFLICT'; end if;
 if jsonb_typeof(p_plan) is distinct from 'object' or p_plan->>'id' is distinct from p_id
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

-- Updated bundled plans override their static counterpart by the same ID.
create or replace function public.miyar_uploaded_study_plans() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(p.metadata||jsonb_build_object('university',u.name,'college',c.name,'major',m.name,'revision',p.revision) order by p.id),'[]'::jsonb)
 from miyar_study_plans p join miyar_majors m on m.id=p.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id
 where p.metadata->>'managed'='admin' or p.revision>0;
$$;
revoke execute on function public.miyar_admin_study_plans(),public.miyar_update_study_plan(uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.miyar_admin_study_plans(),public.miyar_update_study_plan(uuid,text,integer,jsonb) to service_role;
commit;
