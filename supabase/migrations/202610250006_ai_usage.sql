begin;
-- Only counters are stored; questions and AI answers are never written here.
create table public.miyar_ai_usage (
 day date not null,
 scope text not null,
 count integer not null default 0 check(count>=0),
 primary key(day,scope)
);
alter table public.miyar_ai_usage enable row level security;
revoke all on public.miyar_ai_usage from public,anon,authenticated;
grant all on public.miyar_ai_usage to service_role;
create function public.miyar_reserve_ai(p_guest uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare visitor miyar_guest_sessions%rowtype; current_day date=(now() at time zone 'UTC')::date; remaining integer;
begin
 select * into visitor from miyar_guest_sessions where id=p_guest for update;
 if visitor.status is distinct from 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
 -- A locked global counter serializes quota reservations across concurrent requests.
 insert into miyar_ai_usage(day,scope) values(current_day,'global') on conflict do nothing;
 perform 1 from miyar_ai_usage where day=current_day and scope='global' for update;
 if (select count from miyar_ai_usage where day=current_day and scope='global')>=200 then raise exception 'AI_GLOBAL_LIMIT'; end if;
 if coalesce((select count from miyar_ai_usage where day=current_day and scope='guest:'||p_guest::text),0)>=10 then raise exception 'AI_GUEST_LIMIT'; end if;
 if visitor.network_hash is not null and coalesce((select count from miyar_ai_usage where day=current_day and scope='network:'||visitor.network_hash),0)>=30 then raise exception 'AI_NETWORK_LIMIT'; end if;
 insert into miyar_ai_usage(day,scope,count) values(current_day,'guest:'||p_guest::text,1) on conflict(day,scope) do update set count=miyar_ai_usage.count+1 returning 10-count into remaining;
 if visitor.network_hash is not null then
  insert into miyar_ai_usage(day,scope,count) values(current_day,'network:'||visitor.network_hash,1) on conflict(day,scope) do update set count=miyar_ai_usage.count+1;
 end if;
 update miyar_ai_usage set count=count+1 where day=current_day and scope='global';
 delete from miyar_ai_usage where day<current_day-7;
 return jsonb_build_object('remaining',remaining,'university_id',visitor.university_id);
end; $$;
revoke execute on function public.miyar_reserve_ai(uuid) from public,anon,authenticated;
grant execute on function public.miyar_reserve_ai(uuid) to service_role;
commit;
