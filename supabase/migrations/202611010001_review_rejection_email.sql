begin;
-- Reasons and delivery state are private; no email address is copied into the outbox.
create table public.miyar_review_rejections (
 review_id bigint primary key references public.miyar_reviews(id) on delete cascade,
 actor_id uuid references public.miyar_accounts(auth_id) on delete set null,
 reason text not null check(char_length(btrim(reason)) between 3 and 300),
 created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','no_recipient')),
 attempts int not null default 0,
 lease uuid,retry_after timestamptz,last_error text,sent_at timestamptz
);
alter table public.miyar_review_rejections enable row level security;
revoke all on public.miyar_review_rejections from public,anon,authenticated;
grant all on public.miyar_review_rejections to service_role;

-- Only the private service can resolve an address from Supabase Auth.
create function public.miyar_review_recipient(p_review bigint) returns text
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select btrim(u.email) from public.miyar_reviews r
 left join public.miyar_review_identities i on i.guest_id=r.guest_id
 join auth.users u on u.id=coalesce(r.account_id,i.account_id)
 where r.id=p_review and to_jsonb(u)->>'email_confirmed_at' is not null
  and char_length(u.email) between 3 and 254 and position('@' in u.email)>1 and u.email!~E'[\r\n]';
$$;
create function public.miyar_reject_review(p_admin uuid,p_review bigint,p_reason text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare state text; previous miyar_review_rejections%rowtype; delivery text;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 3 and 300 then raise exception 'REASON_REQUIRED'; end if;
 select status into state from miyar_reviews where id=p_review for update;
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 select * into previous from miyar_review_rejections where review_id=p_review;
 if found then
  if state<>'rejected' or previous.reason<>btrim(p_reason) then raise exception 'REVIEW_ALREADY_DECIDED'; end if;
  return jsonb_build_object('id',p_review,'mailStatus',previous.status,'alreadyRejected',true);
 end if;
 if state<>'pending' then raise exception 'REVIEW_ALREADY_DECIDED'; end if;
 delivery=case when miyar_review_recipient(p_review) is null then 'no_recipient' else 'pending' end;
 update miyar_reviews set status='rejected' where id=p_review;
 insert into miyar_review_rejections(review_id,actor_id,reason,status) values(p_review,p_admin,btrim(p_reason),delivery);
 return jsonb_build_object('id',p_review,'mailStatus',delivery,'alreadyRejected',false);
end; $$;
create function public.miyar_claim_review_rejection_mail(p_id bigint) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare recipient text; token uuid=gen_random_uuid(); r miyar_reviews%rowtype; decision miyar_review_rejections%rowtype; doctor text;
begin
 select * into r from miyar_reviews where id=p_id and status='rejected' for update;
 if not found then return null; end if;
 select * into decision from miyar_review_rejections where review_id=p_id for update;
 if not found or decision.status='sent' or decision.retry_after>now() then return null; end if;
 recipient=miyar_review_recipient(p_id);
 if recipient is null then update miyar_review_rejections set status='no_recipient',lease=null,retry_after=null,last_error=null where review_id=p_id;return null;end if;
 update miyar_review_rejections set status='sending',attempts=attempts+1,lease=token,retry_after=now()+interval '2 minutes',last_error=null where review_id=p_id;
 select name into doctor from miyar_doctors where id=r.doctor_id;
 return jsonb_build_object('lease',token,'recipient',recipient,'doctor',doctor,'subject',r.subject,'reason',decision.reason);
end; $$;
create function public.miyar_finish_review_rejection_mail(p_id bigint,p_lease uuid,p_sent boolean,p_error text) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 if p_sent is null then raise exception 'INVALID_REVIEW_FILTER'; end if;
 update miyar_review_rejections set status=case when p_sent then 'sent' else 'failed' end,
 sent_at=case when p_sent then now() else null end,last_error=case when p_sent then null else left(p_error,300) end,
 lease=null,retry_after=case when p_sent then null else now()+interval '30 seconds' end
 where review_id=p_id and status='sending' and lease=p_lease;
 return found;
end; $$;
create function public.miyar_review_rejection_mail_list() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc,x.id desc),'[]'::jsonb) from (
  select o.review_id as id,d.name as doctor,r.subject,o.reason,o.created_at,o.status,o.attempts,o.last_error,o.sent_at,
   o.retry_after, miyar_review_recipient(r.id) is not null as has_email
  from miyar_review_rejections o join miyar_reviews r on r.id=o.review_id join miyar_doctors d on d.id=r.doctor_id
  order by o.created_at desc,o.review_id desc limit 50
 ) x;
$$;
revoke execute on function public.miyar_review_recipient(bigint),public.miyar_reject_review(uuid,bigint,text),public.miyar_claim_review_rejection_mail(bigint),public.miyar_finish_review_rejection_mail(bigint,uuid,boolean,text),public.miyar_review_rejection_mail_list() from public,anon,authenticated;
grant execute on function public.miyar_review_recipient(bigint),public.miyar_reject_review(uuid,bigint,text),public.miyar_claim_review_rejection_mail(bigint),public.miyar_finish_review_rejection_mail(bigint,uuid,boolean,text),public.miyar_review_rejection_mail_list() to service_role;

create or replace function public.miyar_guest_reviews(p_guest uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select r.id,r.doctor_id,d.name as doctor_name,r.subject,r.comment,r.tags,r.explanation,r.treatment,r.grading,r.status,r.created_at,
 (select reason from miyar_review_rejections where review_id=r.id) as rejection_reason,
 (select e.status from miyar_review_edits e where e.review_id=r.id order by e.id desc limit 1) as edit_status
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.guest_id=p_guest and c.university_id=(select university_id from miyar_guest_sessions where id=p_guest) order by r.created_at desc,r.id desc limit 100
 ) x;
$$;

create or replace function public.miyar_my_reviews(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select r.id,r.doctor_id,d.name as doctor_name,r.subject,r.comment,r.tags,r.explanation,r.treatment,r.grading,r.status,r.created_at,
 (select reason from miyar_review_rejections where review_id=r.id) as rejection_reason,
 (select e.status from miyar_review_edits e where e.review_id=r.id order by e.id desc limit 1) as edit_status
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where (r.account_id=p_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=p_account)) and c.university_id=(select university_id from miyar_accounts where auth_id=p_account) order by r.created_at desc limit 100
 ) x;
$$;
commit;
