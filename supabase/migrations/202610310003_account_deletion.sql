begin;
-- Platform curricula, files and moderation history survive an administrator's
-- departure without retaining a reference to their deleted personal account.
alter table public.miyar_study_plan_edits alter column edited_by drop not null;
alter table public.miyar_files alter column uploaded_by drop not null;
alter table public.miyar_review_removals alter column removed_by drop not null;
alter table public.miyar_major_removals alter column actor_id drop not null;
alter table public.miyar_ambassadors alter column granted_by drop not null;
alter table public.miyar_assistants alter column granted_by drop not null;

create function public.miyar_delete_account(p_account uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare guests uuid[]; reviews bigint[];
begin
 if p_account is null then raise exception 'ACCOUNT_RESTRICTED'; end if;
 perform 1 from auth.users where id=p_account for update;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 perform 1 from miyar_accounts where auth_id=p_account for update;
 select coalesce(array_agg(guest_id),'{}'::uuid[]) into guests from miyar_review_identities where account_id=p_account;
 perform id from miyar_guest_sessions where id=any(guests) order by id for update;
 select coalesce(array_agg(id),'{}'::bigint[]) into reviews from miyar_reviews where account_id=p_account or guest_id=any(guests);
 delete from miyar_review_likes where account_id=p_account or guest_id=any(guests) or review_id=any(reviews);
 delete from miyar_reports where account_id=p_account or review_id=any(reviews);
 delete from miyar_review_edits where account_id=p_account or guest_id=any(guests) or review_id=any(reviews);
 delete from miyar_review_removals where review_id=any(reviews);
 delete from miyar_reviews where id=any(reviews);
 delete from miyar_catalogue_requests where account_id=p_account;
 delete from miyar_institution_requests where account_id=p_account or guest_id=any(guests);
 delete from miyar_request_decisions where account_id=p_account;
 delete from miyar_ambassadors where account_id=p_account;
 delete from miyar_assistants where account_id=p_account;
 delete from miyar_plan_import_attempts where admin_id=p_account;
 update miyar_catalogue_requests set decided_by=null where decided_by=p_account;
 update miyar_institution_requests set decided_by=null where decided_by=p_account;
 update miyar_study_plans set imported_by=null where imported_by=p_account;
 update miyar_study_plan_edits set edited_by=null where edited_by=p_account;
 update miyar_files set uploaded_by=null where uploaded_by=p_account;
 update miyar_review_removals set removed_by=null where removed_by=p_account;
 update miyar_major_removals set actor_id=null where actor_id=p_account;
 update miyar_ambassadors set granted_by=null where granted_by=p_account;
 update miyar_assistants set granted_by=null where granted_by=p_account;
 delete from miyar_review_identities where account_id=p_account;
 delete from miyar_ai_usage where scope in(select 'guest:'||g::text from unnest(guests) g);
 delete from miyar_guest_sessions where id=any(guests);
 delete from miyar_accounts where auth_id=p_account;
 delete from auth.users where id=p_account;
 return jsonb_build_object('deleted',true);
end; $$;
revoke execute on function public.miyar_delete_account(uuid) from public,anon,authenticated;
grant execute on function public.miyar_delete_account(uuid) to service_role;
commit;
