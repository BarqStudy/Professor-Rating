begin;
-- University selections are preferences, not ownership of account/review data.
-- Clear those preferences and delete the empty university in one transaction.
create function public.miyar_delete_university(p_id bigint) returns jsonb language plpgsql security invoker set search_path=public as $$
declare accounts_reset int; guests_reset int;
begin
 perform 1 from miyar_universities where id=p_id for update;
 if not found then raise exception 'UNIVERSITY_NOT_FOUND'; end if;
 if exists(select 1 from miyar_colleges where university_id=p_id) then raise exception 'UNIVERSITY_HAS_COLLEGES'; end if;
 if exists(select 1 from miyar_catalogue_requests where university_id=p_id) then raise exception 'UNIVERSITY_HAS_REQUESTS'; end if;
 if exists(select 1 from miyar_ambassadors where university_id=p_id) then raise exception 'UNIVERSITY_HAS_AMBASSADORS'; end if;
 update miyar_accounts set university_id=null,major_id=null where university_id=p_id;
 get diagnostics accounts_reset=row_count;
 update miyar_guest_sessions set university_id=null where university_id=p_id;
 get diagnostics guests_reset=row_count;
 delete from miyar_universities where id=p_id;
 return jsonb_build_object('ok',true,'accountsReset',accounts_reset,'guestsReset',guests_reset);
end; $$;
revoke execute on function public.miyar_delete_university(bigint) from public,anon,authenticated;
grant execute on function public.miyar_delete_university(bigint) to service_role;
commit;
