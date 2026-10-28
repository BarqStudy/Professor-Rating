begin;
alter table public.miyar_majors add column deleted_at timestamptz;
alter table public.miyar_majors add column revision integer not null default 0;
create table public.miyar_major_removals (
 id bigint generated always as identity primary key,
 major_id bigint not null references public.miyar_majors(id) on delete restrict,
 actor_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 snapshot text not null,
 details jsonb not null,
 removed_at timestamptz not null default now()
);
alter table public.miyar_major_removals enable row level security;
revoke all on public.miyar_major_removals from public,anon,authenticated;
grant all on public.miyar_major_removals to service_role;
grant usage,select on sequence public.miyar_major_removals_id_seq to service_role;

create function public.miyar_major_removal_preview(p_id bigint) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare target jsonb; faculty jsonb; curricula jsonb; reviews bigint; published bigint;
begin
 select jsonb_build_object('id',m.id,'name',m.name,'college',c.name,'university',u.name,'revision',m.revision) into target
 from miyar_majors m join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id where m.id=p_id and m.deleted_at is null;
 if target is null then raise exception 'MAJOR_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(jsonb_build_array(id,status) order by id),'[]'::jsonb) into faculty from miyar_doctors where major_id=p_id;
 select coalesce(jsonb_agg(jsonb_build_array(id,revision,deleted_at is not null) order by id),'[]'::jsonb) into curricula from miyar_study_plans where major_id=p_id;
 select count(*),count(*) filter(where r.status='published') into reviews,published from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where d.major_id=p_id;
 return target||jsonb_build_object('doctors',(select count(*) from miyar_doctors where major_id=p_id and status in ('approved','pending')),
  'plans',(select count(*) from miyar_study_plans where major_id=p_id and deleted_at is null),'reviews',reviews,'publishedReviews',published,
  'snapshot',md5(jsonb_build_array(target,faculty,curricula,reviews,published)::text));
end; $$;

create function public.miyar_delete_major(p_actor uuid,p_id bigint,p_snapshot text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare removed_at timestamptz; details jsonb; plan record;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_actor and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select deleted_at into removed_at from miyar_majors where id=p_id for update;
 if not found then raise exception 'MAJOR_NOT_FOUND'; end if;
 if removed_at is not null then
  if exists(select 1 from miyar_major_removals where major_id=p_id and snapshot=p_snapshot) then return jsonb_build_object('ok',true,'id',p_id,'alreadyRemoved',true); end if;
  raise exception 'MAJOR_NOT_FOUND';
 end if;
 perform id from miyar_doctors where major_id=p_id order by id for update;
 perform id from miyar_study_plans where major_id=p_id order by id for update;
 details=miyar_major_removal_preview(p_id);
 if p_snapshot is null or details->>'snapshot'<>p_snapshot then raise exception 'MAJOR_DELETE_CONFLICT'; end if;
 -- Archive children; never cascade-delete students, professors or evaluations.
 update miyar_doctors set status='archived' where major_id=p_id and status in ('approved','pending');
 for plan in select id,revision from miyar_study_plans where major_id=p_id and deleted_at is null order by id loop
  perform miyar_delete_study_plan(p_actor,plan.id,plan.revision);
 end loop;
 update miyar_accounts set major_id=null where major_id=p_id;
 update miyar_users set major_id=null where major_id=p_id;
 update miyar_majors set deleted_at=now(),revision=revision+1 where id=p_id;
 insert into miyar_major_removals(major_id,actor_id,snapshot,details) values(p_id,p_actor,p_snapshot,details);
 return jsonb_build_object('ok',true,'id',p_id,'alreadyRemoved',false);
end; $$;

create function public.miyar_add_major(p_actor uuid,p_college bigint,p_name text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare target bigint; removed_at timestamptz;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_actor and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_name is null or char_length(trim(p_name)) not between 2 and 100 then raise exception 'INVALID_MAJOR'; end if;
 select id,deleted_at into target,removed_at from miyar_majors where college_id=p_college and name=trim(p_name) for update;
 if found then
  if removed_at is null then raise unique_violation using message='Major already exists'; end if;
  -- Re-adding the label does not republish historical faculty or curricula.
  update miyar_majors set deleted_at=null,revision=revision+1 where id=target;
  return jsonb_build_object('ok',true,'id',target,'restored',true);
 end if;
 insert into miyar_majors(college_id,name) values(p_college,trim(p_name)) returning id into target;
 return jsonb_build_object('ok',true,'id',target,'restored',false);
end; $$;

create function public.miyar_require_active_major() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.major_id is null then return new; end if;
 if tg_table_name='miyar_doctors' and tg_op='UPDATE' then
  if new.major_id=old.major_id and new.status in ('archived','rejected') then return new; end if;
 end if;
 if tg_table_name in ('miyar_doctors','miyar_study_plans') then
  perform 1 from miyar_majors where id=new.major_id and deleted_at is null for share;
 else perform 1 from miyar_majors where id=new.major_id and deleted_at is null; end if;
 if not found then raise exception 'MAJOR_UNAVAILABLE'; end if;
 return new;
end; $$;
create trigger miyar_doctor_major_active before insert or update of major_id,status on miyar_doctors for each row execute function miyar_require_active_major();
create trigger miyar_plan_major_active before insert or update of major_id on miyar_study_plans for each row execute function miyar_require_active_major();
create trigger miyar_account_major_active before insert or update of major_id on miyar_accounts for each row execute function miyar_require_active_major();
create trigger miyar_legacy_major_active before insert or update of major_id on miyar_users for each row execute function miyar_require_active_major();

create or replace function public.miyar_study_import_target(p_major bigint) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
 select jsonb_build_object('majorId',m.id,'major',m.name,'college',c.name,'university',u.name) into result
 from miyar_majors m join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id where m.id=p_major and m.deleted_at is null;
 if result is null then raise exception 'INVALID_MAJOR'; end if;
 return result;
end; $$;
revoke execute on function public.miyar_major_removal_preview(bigint),public.miyar_delete_major(uuid,bigint,text),public.miyar_add_major(uuid,bigint,text),public.miyar_require_active_major() from public,anon,authenticated;
grant execute on function public.miyar_major_removal_preview(bigint),public.miyar_delete_major(uuid,bigint,text),public.miyar_add_major(uuid,bigint,text),public.miyar_require_active_major() to service_role;

create or replace function public.miyar_catalogue() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
  'universities',coalesce((select jsonb_agg(u order by u.id) from miyar_universities u),'[]'::jsonb),
  'colleges',coalesce((select jsonb_agg(c order by c.id) from miyar_colleges c),'[]'::jsonb),
  'majors',coalesce((select jsonb_agg(m order by m.id) from miyar_majors m where m.deleted_at is null),'[]'::jsonb),
  'doctors',coalesce((select jsonb_agg(d order by d.score desc nulls last,d.id) from (
   select d.id,d.name,d.major_id,d.verified,d.office_role,d.office_college_id,oc.name as office_college,
    c.id as college_id,c.university_id,m.name as major,c.name as college,count(r.id)::int as count,
    coalesce(round(avg((r.explanation+r.treatment+r.grading)/3.0)),0)::int as score,
    jsonb_build_array(coalesce(round(avg(r.explanation)),0),coalesce(round(avg(r.treatment)),0),coalesce(round(avg(r.grading)),0)) as scores,
    coalesce(jsonb_agg(distinct r.subject) filter(where r.id is not null),'[]'::jsonb) as subjects
   from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
   left join miyar_colleges oc on oc.id=d.office_college_id
   left join miyar_reviews r on r.doctor_id=d.id and r.status='published'
   where d.status='approved' and m.deleted_at is null group by d.id,m.id,c.id,oc.id order by d.id limit 1000
  ) d),'[]'::jsonb),
  'stats',jsonb_build_object('doctors',(select count(*) from miyar_doctors where status='approved'),
   'reviews',(select count(*) from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where r.status='published' and d.status='approved'))
 );
$$;

commit;
