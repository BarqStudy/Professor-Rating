begin;
-- Requests are private and cannot change the public catalogue before administrator approval.
create table public.miyar_institution_requests(
 id bigint generated always as identity primary key,
 account_id uuid references public.miyar_accounts(auth_id) on delete restrict,
 guest_id uuid references public.miyar_guest_sessions(id) on delete restrict,
 university_id bigint references public.miyar_universities(id) on delete restrict,
 name text not null check(char_length(name) between 2 and 100),
 colleges jsonb not null check(jsonb_typeof(colleges)='array' and jsonb_array_length(colleges) between 1 and 5),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid references public.miyar_accounts(auth_id) on delete restrict,
 reason text not null default '' check(char_length(reason)<=300),
 check((account_id is null)<>(guest_id is null))
);
create index miyar_institution_inbox on public.miyar_institution_requests(status,created_at);
alter table public.miyar_institution_requests enable row level security;
revoke all on public.miyar_institution_requests from public,anon,authenticated;
grant all on public.miyar_institution_requests to service_role;
grant usage,select on sequence public.miyar_institution_requests_id_seq to service_role;
create function public.miyar_request_institution(p_account uuid,p_guest uuid,p_university bigint,p_name text,p_colleges jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_name text; v_id bigint; c jsonb; m jsonb;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then
  perform 1 from miyar_accounts where auth_id=p_account and status='active' for update;
 else perform 1 from miyar_guest_sessions where id=p_guest and status='active' for update;
 end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_university is not null then select name into v_name from miyar_universities where id=p_university; if not found then raise exception 'UNIVERSITY_REQUIRED'; end if;
 else v_name=trim(p_name); end if;
 if v_name is null or char_length(v_name) not between 2 and 100 or jsonb_typeof(p_colleges) is distinct from 'array' then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 if jsonb_array_length(p_colleges) not between 1 and 5 then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 for c in select value from jsonb_array_elements(p_colleges) loop
  if jsonb_typeof(c) is distinct from 'object' or not(c?&array['name','majors']) or char_length(trim(c->>'name')) not between 2 and 100 or jsonb_typeof(c->'name') is distinct from 'string' or jsonb_typeof(c->'majors') is distinct from 'array' then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
  if jsonb_array_length(c->'majors')>10 then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
  for m in select value from jsonb_array_elements(c->'majors') loop
   if jsonb_typeof(m) is distinct from 'string' or char_length(trim(m#>>'{}')) not between 2 and 100 then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_colleges) item group by item.value->>'name' having count(*)>1) then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 select id into v_id from miyar_institution_requests where (account_id=p_account or guest_id=p_guest) and name=v_name and colleges=p_colleges and status='pending';
 if found then return jsonb_build_object('id',v_id,'existing',true,'status','pending'); end if;
 if (select count(*) from miyar_institution_requests where (account_id=p_account or guest_id=p_guest) and created_at>now()-interval '24 hours')>=3 then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_institution_requests(account_id,guest_id,university_id,name,colleges) values(p_account,p_guest,p_university,v_name,p_colleges) returning id into v_id;
 return jsonb_build_object('id',v_id,'existing',false,'status','pending');
end; $$;
create function public.miyar_decide_institution(p_actor uuid,p_id bigint,p_approve boolean,p_reason text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r miyar_institution_requests%rowtype; u bigint; cid bigint; c jsonb; m text;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_actor and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_approve is null or p_reason is null or char_length(p_reason)>300 or (not p_approve and char_length(trim(p_reason))<3) then raise exception 'REASON_REQUIRED'; end if;
 select * into r from miyar_institution_requests where id=p_id for update;
 if not found or r.status<>'pending' then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_approve then
  if r.university_id is not null then u=r.university_id;
  else insert into miyar_universities(name) values(r.name) on conflict(name) do update set name=excluded.name returning id into u; end if;
  for c in select value from jsonb_array_elements(r.colleges) loop
   insert into miyar_colleges(name,university_id) values(trim(c->>'name'),u) on conflict(university_id,name) do update set name=excluded.name returning id into cid;
   for m in select jsonb_array_elements_text(c->'majors') loop
    insert into miyar_majors(name,college_id) values(trim(m),cid) on conflict(college_id,name) do nothing;
   end loop;
  end loop;
 end if;
 update miyar_institution_requests set status=case when p_approve then 'approved' else 'rejected' end,reason=p_reason,decided_by=p_actor,decided_at=now() where id=r.id;
 if r.account_id is not null then
  insert into miyar_request_decisions(account_id,kind,request_id,title,status,reason) values(r.account_id,'institution',r.id,r.name,case when p_approve then 'approved' else 'rejected' end,p_reason);
 end if;
 return jsonb_build_object('ok',true);
end; $$;
alter table public.miyar_request_decisions drop constraint miyar_request_decisions_kind_check;
alter table public.miyar_request_decisions add constraint miyar_request_decisions_kind_check check(kind in ('doctor','edit','catalogue','institution'));
alter function public.miyar_my_requests(uuid) rename to miyar_my_before_institution_requests;
create function public.miyar_my_requests(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x->>'created_at' desc),'[]'::jsonb) from (
  select x from (
   select value x from jsonb_array_elements(miyar_my_before_institution_requests(p_account))
   union all
   select jsonb_build_object('id',id,'kind','institution','title',name,'status',status,'reason',reason,'created_at',created_at,'decided_at',decided_at,'university',name) from miyar_institution_requests where account_id=p_account
  ) q order by x->>'created_at' desc limit 100
 ) requests;
$$;
-- A request from a course stores context for moderation, never a fabricated review or recommendation.
alter table public.miyar_doctors add column requested_course text references public.miyar_study_courses(id) on delete restrict;
create function public.miyar_request_course_doctor(p_account uuid,p_guest uuid,p_major bigint,p_name text,p_course text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare u bigint; d bigint; state text;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then select university_id into u from miyar_accounts where auth_id=p_account and status='active' for update;
 else select university_id into u from miyar_guest_sessions where id=p_guest and status='active' for update; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if u is null then raise exception 'UNIVERSITY_REQUIRED'; end if;
 if char_length(p_name) not between 8 and 100 or array_length(regexp_split_to_array(trim(p_name),'\s+'),1)<3 then raise exception 'INVALID_NAME'; end if;
 if not exists(select 1 from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.id=p_major and c.university_id=u) then raise exception 'INVALID_MAJOR'; end if;
 if p_course is not null and not exists(select 1 from miyar_study_courses s join miyar_study_plans p on p.id=s.plan_id join miyar_majors m on m.id=p.major_id join miyar_colleges c on c.id=m.college_id where s.id=p_course and s.linkable and c.university_id=u) then raise exception 'INVALID_STUDY_COURSE'; end if;
 select id,status into d,state from miyar_doctors where major_id=p_major and name=p_name;
 if found then return jsonb_build_object('id',d,'existing',true,'status',state); end if;
 if (select count(*) from miyar_doctors where (submitted_by_account=p_account or submitted_by_guest=p_guest) and created_at>now()-interval '24 hours')>=5 then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_doctors(major_id,name,submitted_by_account,submitted_by_guest,requested_course) values(p_major,p_name,p_account,p_guest,p_course) returning id into d;
 return jsonb_build_object('id',d,'status','pending','existing',false);
end; $$;
revoke execute on function public.miyar_request_institution(uuid,uuid,bigint,text,jsonb),public.miyar_decide_institution(uuid,bigint,boolean,text),public.miyar_my_requests(uuid),public.miyar_request_course_doctor(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.miyar_request_institution(uuid,uuid,bigint,text,jsonb),public.miyar_decide_institution(uuid,bigint,boolean,text),public.miyar_my_requests(uuid),public.miyar_request_course_doctor(uuid,uuid,bigint,text,text) to service_role;
commit;
