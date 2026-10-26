begin;
-- Private durable delivery record; saving a student request never depends on SMTP.
create table public.miyar_institution_mail (
 request_id bigint primary key references public.miyar_institution_requests(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 lease uuid,
 retry_after timestamptz,
 last_error text,
 sent_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.miyar_institution_mail enable row level security;
revoke all on public.miyar_institution_mail from public,anon,authenticated;
grant all on public.miyar_institution_mail to service_role;
create function public.miyar_enqueue_institution_mail() returns trigger language plpgsql security invoker set search_path=public as $$
begin insert into miyar_institution_mail(request_id) values(new.id); return new; end; $$;
create trigger miyar_institution_mail_enqueue after insert on public.miyar_institution_requests for each row execute function public.miyar_enqueue_institution_mail();
insert into public.miyar_institution_mail(request_id) select id from public.miyar_institution_requests where status='pending';

create function public.miyar_claim_institution_mail(p_id bigint) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_lease uuid=gen_random_uuid(); r miyar_institution_requests%rowtype;
begin
 update miyar_institution_mail set status='sending',attempts=attempts+1,lease=v_lease,retry_after=now()+interval '2 minutes',updated_at=now()
 where request_id=p_id and status<>'sent' and (retry_after is null or retry_after<=now());
 if not found then return null; end if;
 select * into r from miyar_institution_requests where id=p_id;
 return jsonb_build_object('lease',v_lease,'request',jsonb_build_object('id',r.id,'name',r.name,'colleges',r.colleges,'contact_email',r.contact_email,'request_kind',r.request_kind,'created_at',r.created_at));
end; $$;
create function public.miyar_finish_institution_mail(p_id bigint,p_lease uuid,p_sent boolean,p_error text) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update miyar_institution_mail set status=case when p_sent then 'sent' else 'failed' end,
 sent_at=case when p_sent then now() else null end,last_error=case when p_sent then null else left(p_error,300) end,
 lease=null,retry_after=case when p_sent then null else now()+interval '30 seconds' end,updated_at=now()
 where request_id=p_id and lease=p_lease and status='sending';
 return found;
end; $$;
revoke execute on function public.miyar_enqueue_institution_mail(),public.miyar_claim_institution_mail(bigint),public.miyar_finish_institution_mail(bigint,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.miyar_enqueue_institution_mail(),public.miyar_claim_institution_mail(bigint),public.miyar_finish_institution_mail(bigint,uuid,boolean,text) to service_role;
commit;
