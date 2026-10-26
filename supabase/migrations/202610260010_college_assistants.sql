begin;
create table public.miyar_assistants(
 account_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 college_id bigint not null references public.miyar_colleges(id) on delete restrict,
 granted_by uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 created_at timestamptz not null default now(),
 primary key(account_id,college_id)
);
alter table public.miyar_assistants enable row level security;
revoke all on public.miyar_assistants from public,anon,authenticated;
grant all on public.miyar_assistants to service_role;

create function public.miyar_set_assistant(p_actor uuid,p_email text,p_college bigint,p_active boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
 if p_active is null then raise exception 'INVALID_PROPOSAL'; end if;
 if not exists(select 1 from miyar_accounts where auth_id=p_actor and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select a.auth_id into target from miyar_accounts a join auth.users u on u.id=a.auth_id where lower(u.email)=lower(trim(p_email)) for update of a;
 if target is null then raise exception 'AMBASSADOR_ACCOUNT_REQUIRED'; end if;
 if not exists(select 1 from miyar_colleges where id=p_college) then raise exception 'INVALID_MAJOR'; end if;
 if p_active then
  if not exists(select 1 from miyar_accounts where auth_id=target and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
  insert into miyar_assistants(account_id,college_id,granted_by) values(target,p_college,p_actor) on conflict(account_id,college_id) do nothing;
 else delete from miyar_assistants where account_id=target and college_id=p_college; end if;
 return jsonb_build_object('ok',true);
end; $$;
create function public.miyar_assistant_list() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select s.account_id,s.college_id,c.university_id,s.created_at,a.name,u.email,a.status
 from miyar_assistants s join miyar_accounts a on a.auth_id=s.account_id join auth.users u on u.id=s.account_id join miyar_colleges c on c.id=s.college_id
 ) x;
$$;
-- Membership determines both the source and destination of a correction.
create function public.miyar_staff_scope(p_account uuid,p_kind text,p_university bigint,p_target bigint,p_parent bigint) returns boolean
language plpgsql stable security invoker set search_path=public as $$
declare destination bigint; origin bigint;
begin
 if exists(select 1 from miyar_ambassadors where account_id=p_account and university_id=p_university) then return true; end if;
 if p_kind='college.add' then return false; end if;
 if p_kind like 'college.%' then destination=p_target;
 elsif p_kind like 'major.%' then destination=p_parent;
 elsif p_kind like 'doctor.%' then select college_id into destination from miyar_majors where id=p_parent;
 else return false; end if;
 if not exists(select 1 from miyar_assistants s join miyar_colleges c on c.id=s.college_id where s.account_id=p_account and s.college_id=destination and c.university_id=p_university) then return false; end if;
 if p_kind like '%.correct' then
  if p_kind='college.correct' then origin=p_target;
  elsif p_kind='major.correct' then select college_id into origin from miyar_majors where id=p_target;
  else select m.college_id into origin from miyar_doctors d join miyar_majors m on m.id=d.major_id where d.id=p_target; end if;
  if origin is distinct from destination then return false; end if;
 end if;
 return true;
end; $$;
revoke execute on function public.miyar_set_assistant(uuid,text,bigint,boolean),public.miyar_assistant_list(),public.miyar_staff_scope(uuid,text,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.miyar_set_assistant(uuid,text,bigint,boolean),public.miyar_assistant_list(),public.miyar_staff_scope(uuid,text,bigint,bigint,bigint) to service_role;

create or replace function public.miyar_propose_catalogue(p_account uuid,p_kind text,p_university bigint,p_target bigint,p_parent bigint,p_name text,p_details text,p_ambassador boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
declare a miyar_accounts%rowtype; old jsonb='{}'; target_uni bigint; result bigint;
begin
 select * into a from miyar_accounts where auth_id=p_account for update;
 if a.status is distinct from 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_kind is null or p_kind not in ('doctor.add','college.add','major.add','doctor.correct','college.correct','major.correct') then raise exception 'INVALID_PROPOSAL'; end if;
 if p_university is null or not exists(select 1 from miyar_universities where id=p_university) then raise exception 'INVALID_UNIVERSITY'; end if;
 if p_ambassador is true then
  if not miyar_staff_scope(p_account,p_kind,p_university,p_target,p_parent) then raise exception 'AMBASSADOR_SCOPE'; end if;
 elsif p_ambassador is distinct from false or p_kind<>'doctor.correct' or a.university_id is distinct from p_university then raise exception 'AMBASSADOR_SCOPE'; end if;
 if char_length(trim(p_name)) not between 2 and 100 or p_name is null or p_details is null or char_length(p_details)>600 then raise exception 'INVALID_PROPOSAL'; end if;
 if p_kind like 'doctor.%' and (char_length(trim(p_name))<8 or array_length(regexp_split_to_array(trim(p_name),'\s+'),1)<3) then raise exception 'INVALID_PROPOSAL'; end if;
 if (p_kind like '%.add' and p_target is not null) or (p_kind like '%.correct' and p_target is null) then raise exception 'INVALID_PROPOSAL'; end if;
 if p_kind like 'college.%' then
  if p_parent is not null then raise exception 'INVALID_PROPOSAL'; end if;
 elsif p_kind like 'major.%' then
  if not exists(select 1 from miyar_colleges where id=p_parent and university_id=p_university) then raise exception 'INVALID_MAJOR'; end if;
 else
  if not exists(select 1 from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.id=p_parent and c.university_id=p_university) then raise exception 'INVALID_MAJOR'; end if;
 end if;
 if p_kind='college.correct' then
  select jsonb_build_object('name',name,'parent_id',null),university_id into old,target_uni from miyar_colleges where id=p_target for share;
 elsif p_kind='major.correct' then
  select jsonb_build_object('name',m.name,'parent_id',m.college_id),c.university_id into old,target_uni from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.id=p_target for share of m,c;
 elsif p_kind='doctor.correct' then
  select jsonb_build_object('name',d.name,'parent_id',d.major_id),c.university_id into old,target_uni from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=p_target and d.status='approved' for share of d,m,c;
 end if;
 if p_kind like '%.correct' then
  if old is null or target_uni is distinct from p_university then raise exception 'PROPOSAL_TARGET_UNAVAILABLE'; end if;
  if old=jsonb_build_object('name',trim(p_name),'parent_id',p_parent) then raise exception 'PROPOSAL_UNCHANGED'; end if;
 end if;
 if (select count(*) from miyar_catalogue_requests where account_id=p_account and created_at>now()-interval '24 hours') >= (case when p_ambassador then 20 else 5 end) then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_catalogue_requests(account_id,university_id,kind,target_id,parent_id,name,details,original,ambassador)
 values(p_account,p_university,p_kind,p_target,p_parent,trim(p_name),p_details,old,p_ambassador) returning id into result;
 return jsonb_build_object('id',result,'status','pending');
end; $$;

create or replace function public.miyar_decide_catalogue(p_actor uuid,p_id bigint,p_approve boolean,p_reason text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r miyar_catalogue_requests%rowtype; current_data jsonb; target_uni bigint;
begin
 select * into r from miyar_catalogue_requests where id=p_id and status='pending' for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_approve is null or p_reason is null or char_length(p_reason)>300 or (not p_approve and char_length(trim(p_reason))<3) then raise exception 'REASON_REQUIRED'; end if;
 if p_approve then
  if r.ambassador then
   perform 1 from miyar_accounts where auth_id=r.account_id and status='active' for share;
   if not found or not miyar_staff_scope(r.account_id,r.kind,r.university_id,r.target_id,r.parent_id) then raise exception 'AMBASSADOR_REVOKED'; end if;
  end if;
  if r.kind like 'college.%' then
   if r.kind='college.correct' then
    select jsonb_build_object('name',name,'parent_id',null),university_id into current_data,target_uni from miyar_colleges where id=r.target_id for update;
   end if;
  elsif r.kind like 'major.%' then
   perform 1 from miyar_colleges where id=r.parent_id and university_id=r.university_id for share;
   if not found then raise exception 'PROPOSAL_TARGET_UNAVAILABLE'; end if;
   if r.kind='major.correct' then
    select jsonb_build_object('name',m.name,'parent_id',m.college_id),c.university_id into current_data,target_uni from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.id=r.target_id for update of m;
   end if;
  else
   perform 1 from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.id=r.parent_id and c.university_id=r.university_id for share of m,c;
   if not found then raise exception 'PROPOSAL_TARGET_UNAVAILABLE'; end if;
   if r.kind='doctor.correct' then
    select jsonb_build_object('name',d.name,'parent_id',d.major_id),c.university_id into current_data,target_uni from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=r.target_id and d.status='approved' for update of d;
   end if;
  end if;
  if r.kind like '%.correct' and (current_data is distinct from r.original or target_uni is distinct from r.university_id) then raise exception 'PROPOSAL_STALE'; end if;
  case r.kind
   when 'college.add' then insert into miyar_colleges(name,university_id) values(r.name,r.university_id);
   when 'major.add' then insert into miyar_majors(name,college_id) values(r.name,r.parent_id);
   when 'doctor.add' then insert into miyar_doctors(name,major_id,status) values(r.name,r.parent_id,'approved');
   when 'college.correct' then update miyar_colleges set name=r.name where id=r.target_id;
   when 'major.correct' then update miyar_majors set name=r.name,college_id=r.parent_id where id=r.target_id;
   when 'doctor.correct' then update miyar_doctors set name=r.name,major_id=r.parent_id where id=r.target_id;
  end case;
 end if;
 update miyar_catalogue_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=p_actor where id=r.id;
 insert into miyar_request_decisions(account_id,kind,request_id,title,status,reason) values(r.account_id,'catalogue',r.id,r.name,case when p_approve then 'approved' else 'rejected' end,p_reason);
 return jsonb_build_object('ok',true);
end; $$;

commit;
