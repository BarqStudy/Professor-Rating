begin;

-- The Edge Function's service_role can read Miyar's tables, but must not get
-- direct access to auth.users. Match the narrowly scoped ambassador list:
-- execute this fixed query as its owner and expose only staff display fields.
alter function public.miyar_assistant_list() security definer;
alter function public.miyar_assistant_list() set search_path = public, pg_temp;
revoke execute on function public.miyar_assistant_list() from public, anon, authenticated;
grant execute on function public.miyar_assistant_list() to service_role;

commit;
