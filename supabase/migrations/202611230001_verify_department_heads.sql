begin;

create function public.miyar_verify_department_head() returns trigger
language plpgsql set search_path = public as $$
begin
  new.verified := true;
  return new;
end;
$$;

revoke execute on function public.miyar_verify_department_head() from public, anon, authenticated;

create trigger miyar_verify_department_head
before insert or update of office_role, verified on public.miyar_doctors
for each row when (new.office_role = 'head' and new.verified is not true)
execute function public.miyar_verify_department_head();

update public.miyar_doctors set verified = true
where office_role = 'head' and not verified;

commit;
