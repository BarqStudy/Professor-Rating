begin;
-- Require an actual grade for new reviews without inventing values for historical
-- reviews submitted under the old opt-out policy. Moderation/edits remain possible.
create function public.miyar_require_review_grade() returns trigger
language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
 if new.grade is null or new.grade < 0 or new.grade > 100 then
  raise exception 'REVIEW_GRADE_REQUIRED';
 end if;
 return new;
end; $$;
create trigger miyar_require_review_grade before insert on public.miyar_reviews
for each row execute function public.miyar_require_review_grade();
revoke all on function public.miyar_require_review_grade() from public,anon,authenticated;
grant execute on function public.miyar_require_review_grade() to service_role;
commit;
