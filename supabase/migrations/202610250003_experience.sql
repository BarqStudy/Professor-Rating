begin;
create table public.miyar_request_decisions (
 id bigint generated always as identity primary key,
 account_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 kind text not null check(kind in ('doctor','edit')),
 request_id bigint not null,
 title text not null,
 status text not null check(status in ('approved','rejected')),
 reason text not null default '' check(char_length(reason)<=300),
 decided_at timestamptz not null default now(),
 unique(kind,request_id)
);
alter table public.miyar_request_decisions enable row level security;
revoke all on public.miyar_request_decisions from public,anon,authenticated;
grant all on public.miyar_request_decisions to service_role;
grant usage,select on sequence public.miyar_request_decisions_id_seq to service_role;
create index miyar_account_decisions on public.miyar_request_decisions(account_id,decided_at desc);
create function public.miyar_decide_request(p_kind text,p_id bigint,p_approve boolean,p_reason text) returns void language plpgsql security invoker set search_path=public as $$
declare author uuid; title text;
begin
 if not p_approve and char_length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
 if char_length(p_reason)>300 then raise exception 'REASON_REQUIRED'; end if;
 if p_kind='doctor' then
  select submitted_by_account,name into author,title from miyar_doctors where id=p_id and status='pending' for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  perform miyar_moderate_doctor(p_id,p_approve);
 elsif p_kind='edit' then
  -- The edit moderation function acquires review/edit locks in a consistent order.
  select e.account_id,d.name into author,title from miyar_review_edits e join miyar_reviews r on r.id=e.review_id join miyar_doctors d on d.id=r.doctor_id where e.id=p_id and e.status='pending';
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  perform miyar_moderate_edit(p_id,p_approve);
 else raise exception 'REQUEST_NOT_FOUND'; end if;
 if author is not null then
  insert into miyar_request_decisions(account_id,kind,request_id,title,status,reason) values(author,p_kind,p_id,title,case when p_approve then 'approved' else 'rejected' end,p_reason);
 end if;
end; $$;
create function public.miyar_my_requests(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select * from (
  select d.id,'doctor'::text as kind,d.name as title,coalesce(k.status,d.status) as status,k.reason,d.created_at,k.decided_at,u.name as university
  from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id left join miyar_request_decisions k on k.kind='doctor' and k.request_id=d.id
  where d.submitted_by_account=p_account
  union all
  select e.id,'edit'::text,d.name,e.status,k.reason,e.created_at,k.decided_at,u.name
  from miyar_review_edits e join miyar_reviews r on r.id=e.review_id join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id left join miyar_request_decisions k on k.kind='edit' and k.request_id=e.id
  where e.account_id=p_account
 ) q order by q.created_at desc limit 100
 ) x;
$$;
create function public.miyar_request_updates(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.decided_at desc),'[]'::jsonb) from (
  select id,kind,request_id,title,status,reason,decided_at from miyar_request_decisions where account_id=p_account and decided_at>now()-interval '90 days' order by decided_at desc limit 100
 ) x;
$$;
create function public.miyar_bulk_doctors(p_ids bigint[],p_operation text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare n int;
begin
 if p_ids is null or p_operation is null or array_position(p_ids,null) is not null or cardinality(p_ids)<1 or cardinality(p_ids)>100 or cardinality(p_ids)<>(select count(distinct i) from unnest(p_ids) i) or p_operation not in ('verify','unverify','archive') then raise exception 'INVALID_BULK'; end if;
 perform id from miyar_doctors where id=any(p_ids) order by id for update;
 select count(*) into n from miyar_doctors where id=any(p_ids) and status='approved';
 if n<>cardinality(p_ids) then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 if p_operation='archive' then update miyar_doctors set status='archived' where id=any(p_ids);
 else update miyar_doctors set verified=(p_operation='verify') where id=any(p_ids); end if;
 return jsonb_build_object('updated',n);
end; $$;
create function public.miyar_summary_comments(p_doctor bigint,p_subject text default null) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('total',(select count(*) from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where d.id=p_doctor and d.status='approved' and r.status='published' and (p_subject is null or r.subject=p_subject)),
 'rows',coalesce((select jsonb_agg(x) from (select r.comment from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where d.id=p_doctor and d.status='approved' and r.status='published' and (p_subject is null or r.subject=p_subject) order by r.created_at desc limit 500) x),'[]'::jsonb));
$$;
-- Hiding a reported review also closes pending edits with a visible reason for the owner.
create or replace function public.miyar_moderate_report(p_id bigint,p_remove boolean) returns void language plpgsql security invoker set search_path=public as $$
declare target bigint;
begin
 select review_id into target from miyar_reports where id=p_id and status='pending' for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_remove then
  update miyar_reviews set status='rejected' where id=target;
  insert into miyar_request_decisions(account_id,kind,request_id,title,status,reason)
   select e.account_id,'edit',e.id,d.name,'rejected','رُفض التعديل لأن التقييم الأصلي أُخفي بقرار الإدارة.'
   from miyar_review_edits e join miyar_reviews r on r.id=e.review_id join miyar_doctors d on d.id=r.doctor_id
   where e.review_id=target and e.status='pending' on conflict(kind,request_id) do nothing;
  update miyar_review_edits set status='rejected' where review_id=target and status='pending';
 end if;
 update miyar_reports set status=case when p_remove then 'resolved' else 'dismissed' end where id=p_id;
end; $$;
revoke execute on function public.miyar_decide_request(text,bigint,boolean,text),public.miyar_my_requests(uuid),public.miyar_request_updates(uuid),public.miyar_bulk_doctors(bigint[],text),public.miyar_summary_comments(bigint,text) from public,anon,authenticated;
grant execute on function public.miyar_decide_request(text,bigint,boolean,text),public.miyar_my_requests(uuid),public.miyar_request_updates(uuid),public.miyar_bulk_doctors(bigint[],text),public.miyar_summary_comments(bigint,text) to service_role;
commit;
