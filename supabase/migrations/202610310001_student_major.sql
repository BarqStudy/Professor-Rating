begin;
alter table public.miyar_guest_sessions add column major_id bigint references public.miyar_majors(id) on delete set null;

-- Lock the actor first, so simultaneous university and specialty changes cannot
-- save a specialty from the previously selected university.
create function public.miyar_choose_major(p_account uuid,p_guest uuid,p_major bigint) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare university bigint;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then
  select university_id into university from miyar_accounts where auth_id=p_account and status='active' for update;
 else
  select university_id into university from miyar_guest_sessions where id=p_guest and status='active' for update;
 end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if university is null then raise exception 'UNIVERSITY_REQUIRED'; end if;
 perform 1 from miyar_majors m join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id
 where m.id=p_major and m.deleted_at is null and c.university_id=university and u.enabled for share of m,c,u;
 if not found then raise exception 'INVALID_UNIVERSITY_MAJOR'; end if;
 if p_account is not null then update miyar_accounts set major_id=p_major where auth_id=p_account;
 else update miyar_guest_sessions set major_id=p_major where id=p_guest; end if;
 return jsonb_build_object('university_id',university,'major_id',p_major);
end; $$;

create or replace function public.miyar_choose_university(p_account uuid,p_guest uuid,p_university bigint) returns jsonb
language plpgsql security invoker set search_path=public as $$
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then
  perform 1 from miyar_accounts where auth_id=p_account and status='active' for update;
 else perform 1 from miyar_guest_sessions where id=p_guest and status='active' for update; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 perform 1 from miyar_universities where id=p_university and enabled for share;
 if not found then raise exception 'UNIVERSITY_INACTIVE'; end if;
 if p_account is not null then
  update miyar_accounts set major_id=case when university_id=p_university then major_id else null end,university_id=p_university where auth_id=p_account;
 else
  update miyar_guest_sessions set major_id=case when university_id=p_university then major_id else null end,university_id=p_university where id=p_guest;
 end if;
 return jsonb_build_object('university_id',p_university);
end; $$;
revoke execute on function public.miyar_choose_major(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.miyar_choose_major(uuid,uuid,bigint) to service_role;
commit;
