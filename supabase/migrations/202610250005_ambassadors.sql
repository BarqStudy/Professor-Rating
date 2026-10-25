begin;
create table public.miyar_ambassadors (
 account_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 university_id bigint not null references public.miyar_universities(id) on delete restrict,
 granted_by uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 created_at timestamptz not null default now(),
 primary key(account_id,university_id)
);
create table public.miyar_catalogue_requests (
 id bigint generated always as identity primary key,
 account_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 university_id bigint not null references public.miyar_universities(id) on delete restrict,
 kind text not null check(kind in ('doctor.add','college.add','major.add','doctor.correct','college.correct','major.correct')),
 target_id bigint,
 parent_id bigint,
 name text not null check(char_length(name) between 2 and 100),
 details text not null default '' check(char_length(details)<=600),
 original jsonb not null default '{}',
 ambassador boolean not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 decided_by uuid references public.miyar_accounts(auth_id) on delete restrict,
 created_at timestamptz not null default now(),
 check((kind like '%.correct' and target_id is not null) or (kind like '%.add' and target_id is null)),
 check((kind like 'college.%' and parent_id is null) or (kind not like 'college.%' and parent_id is not null))
);
create index miyar_catalogue_request_queue on public.miyar_catalogue_requests(status,created_at);
create index miyar_catalogue_request_author on public.miyar_catalogue_requests(account_id,created_at desc);
create unique index miyar_catalogue_request_duplicate on public.miyar_catalogue_requests(account_id,university_id,kind,coalesce(target_id,0),name,coalesce(parent_id,0)) where status='pending';
alter table public.miyar_ambassadors enable row level security;
alter table public.miyar_catalogue_requests enable row level security;
revoke all on public.miyar_ambassadors,public.miyar_catalogue_requests from public,anon,authenticated;
grant all on public.miyar_ambassadors,public.miyar_catalogue_requests to service_role;
grant usage,select on sequence public.miyar_catalogue_requests_id_seq to service_role;
alter table public.miyar_request_decisions drop constraint miyar_request_decisions_kind_check;
alter table public.miyar_request_decisions add check(kind in ('doctor','edit','catalogue'));

-- Role assignment is an admin-only server action, never a profile-editable field.
create function public.miyar_set_ambassador(p_actor uuid,p_email text,p_university bigint,p_active boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
 if p_active is null then raise exception 'INVALID_PROPOSAL'; end if;
 select a.auth_id into target from miyar_accounts a join auth.users u on u.id=a.auth_id where lower(u.email)=lower(trim(p_email)) for update of a;
 if target is null then raise exception 'AMBASSADOR_ACCOUNT_REQUIRED'; end if;
 if not exists(select 1 from miyar_universities where id=p_university) then raise exception 'INVALID_UNIVERSITY'; end if;
 if p_active then
  if not exists(select 1 from miyar_accounts where auth_id=target and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
  insert into miyar_ambassadors(account_id,university_id,granted_by) values(target,p_university,p_actor) on conflict(account_id,university_id) do nothing;
 else delete from miyar_ambassadors where account_id=target and university_id=p_university;
 end if;
 return jsonb_build_object('ok',true);
end; $$;

create function public.miyar_ambassador_list() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select b.account_id,b.university_id,b.created_at,a.name,u.email,a.status
 from miyar_ambassadors b join miyar_accounts a on a.auth_id=b.account_id join auth.users u on u.id=b.account_id
 ) x;
$$;

-- Each proposal is scoped again in the database; payload IDs never establish authority.
create function public.miyar_propose_catalogue(p_account uuid,p_kind text,p_university bigint,p_target bigint,p_parent bigint,p_name text,p_details text,p_ambassador boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
declare a miyar_accounts%rowtype; old jsonb='{}'; target_uni bigint; result bigint;
begin
 select * into a from miyar_accounts where auth_id=p_account for update;
 if a.status is distinct from 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_kind is null or p_kind not in ('doctor.add','college.add','major.add','doctor.correct','college.correct','major.correct') then raise exception 'INVALID_PROPOSAL'; end if;
 if p_university is null or not exists(select 1 from miyar_universities where id=p_university) then raise exception 'INVALID_UNIVERSITY'; end if;
 if p_ambassador is true then
  if not exists(select 1 from miyar_ambassadors where account_id=p_account and university_id=p_university) then raise exception 'AMBASSADOR_SCOPE'; end if;
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

create function public.miyar_catalogue_queue() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at),'[]'::jsonb) from (
 select r.*,a.name as author_name,u.name as university from miyar_catalogue_requests r join miyar_accounts a on a.auth_id=r.account_id join miyar_universities u on u.id=r.university_id where r.status='pending' order by r.created_at limit 100
 ) x;
$$;

-- Approval and publication are one transaction, with stale-data detection.
create function public.miyar_decide_catalogue(p_actor uuid,p_id bigint,p_approve boolean,p_reason text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r miyar_catalogue_requests%rowtype; current_data jsonb; target_uni bigint;
begin
 select * into r from miyar_catalogue_requests where id=p_id and status='pending' for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_approve is null or p_reason is null or char_length(p_reason)>300 or (not p_approve and char_length(trim(p_reason))<3) then raise exception 'REASON_REQUIRED'; end if;
 if p_approve then
  if r.ambassador then
   perform 1 from miyar_accounts where auth_id=r.account_id and status='active' for share;
   if not found or not exists(select 1 from miyar_ambassadors where account_id=r.account_id and university_id=r.university_id) then raise exception 'AMBASSADOR_REVOKED'; end if;
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

-- Preserve old request history, adding catalogue proposals to the same inbox.
alter function public.miyar_my_requests(uuid) rename to miyar_my_previous_requests;
create function public.miyar_my_requests(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x->>'created_at' desc),'[]'::jsonb) from (
 select x from (
  select value as x from jsonb_array_elements(miyar_my_previous_requests(p_account))
  union all
  select jsonb_build_object('id',r.id,'kind','catalogue','proposal_kind',r.kind,'title',r.name,'status',r.status,'reason',d.reason,'created_at',r.created_at,'decided_at',d.decided_at,'university',u.name)
  from miyar_catalogue_requests r join miyar_universities u on u.id=r.university_id left join miyar_request_decisions d on d.kind='catalogue' and d.request_id=r.id where r.account_id=p_account
 ) q order by x->>'created_at' desc limit 100
 ) requests;
$$;
revoke execute on function public.miyar_set_ambassador(uuid,text,bigint,boolean),public.miyar_ambassador_list(),public.miyar_propose_catalogue(uuid,text,bigint,bigint,bigint,text,text,boolean),public.miyar_catalogue_queue(),public.miyar_decide_catalogue(uuid,bigint,boolean,text),public.miyar_my_requests(uuid) from public,anon,authenticated;
grant execute on function public.miyar_set_ambassador(uuid,text,bigint,boolean),public.miyar_ambassador_list(),public.miyar_propose_catalogue(uuid,text,bigint,bigint,bigint,text,text,boolean),public.miyar_catalogue_queue(),public.miyar_decide_catalogue(uuid,bigint,boolean,text),public.miyar_my_requests(uuid) to service_role;
commit;
