begin;
create or replace function public.miyar_review_eligibility(p_account uuid,p_guest uuid,p_doctor bigint,p_subject text) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare owner_account uuid; university bigint; previous record; reviewed_subjects jsonb;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then select university_id into university from miyar_accounts where auth_id=p_account and status='active';
 else select university_id into university from miyar_guest_sessions where id=p_guest and status='active'; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if not exists(select 1 from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=p_doctor and d.status='approved' and c.university_id=university) then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 owner_account=p_account;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=p_guest; end if;
 -- Only this verified identity's subjects for this professor are returned.
 -- Pending/rejected evaluations also reserve their subject against duplicates.
 select coalesce(jsonb_agg(distinct r.subject),'[]'::jsonb) into reviewed_subjects from miyar_reviews r
 where r.doctor_id=p_doctor and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 );
 if p_subject is null or btrim(p_subject)='' then return jsonb_build_object('eligible',true,'reviewedSubjects',reviewed_subjects); end if;
 select r.id,r.status,r.account_id,r.guest_id into previous from miyar_reviews r where r.doctor_id=p_doctor
  and miyar_course_key(r.subject)=miyar_course_key(p_subject) and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 ) order by r.created_at desc,r.id desc limit 1;
 if found then return jsonb_build_object('eligible',false,'reviewedSubjects',reviewed_subjects,'status',previous.status,'canEdit',previous.status='published' and (p_account is not null or previous.guest_id=p_guest)); end if;
 return jsonb_build_object('eligible',true,'reviewedSubjects',reviewed_subjects);
end; $$;
revoke execute on function public.miyar_review_eligibility(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.miyar_review_eligibility(uuid,uuid,bigint,text) to service_role;
commit;
