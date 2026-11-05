begin;
create table if not exists public.miyar_timetable_shares (
 token text primary key check (token ~ '^[A-Za-z0-9_-]{12}$'),
 guest_id uuid references public.miyar_guest_sessions(id) on delete set null,
 snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=524288),
 created_at timestamptz not null default now()
);
create index if not exists miyar_timetable_shares_guest on public.miyar_timetable_shares(guest_id,created_at);
alter table public.miyar_timetable_shares enable row level security;
revoke all on public.miyar_timetable_shares from public,anon,authenticated;
grant select,insert on public.miyar_timetable_shares to service_role;
create or replace function public.miyar_create_timetable_share(p_guest uuid,p_token text,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing text;
begin
 perform 1 from miyar_guest_sessions where id=p_guest and status='active' for update;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select token into existing from miyar_timetable_shares where guest_id=p_guest and snapshot=p_snapshot limit 1;
 if existing is not null then return jsonb_build_object('token',existing); end if;
 if (select count(*) from miyar_timetable_shares where guest_id=p_guest and created_at>now()-interval '24 hours')>=30 then raise exception 'TIMETABLE_SHARE_LIMIT'; end if;
 insert into miyar_timetable_shares(token,guest_id,snapshot) values(p_token,p_guest,p_snapshot);
 return jsonb_build_object('token',p_token);
end $$;
revoke all on function public.miyar_create_timetable_share(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.miyar_create_timetable_share(uuid,text,jsonb) to service_role;
commit;
