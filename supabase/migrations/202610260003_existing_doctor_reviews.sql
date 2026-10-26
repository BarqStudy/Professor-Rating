begin;
-- Resolve an existing professor by ID inside the submission transaction. This
-- prevents stale form names or simultaneous renames from creating another row.
create function public.miyar_submit_existing_google_review(
 p_account uuid,p_doctor bigint,p_subject text,p_grade int,p_explanation int,
 p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare professor record;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
 perform 1 from miyar_accounts where auth_id=p_account for update;
 select d.name,m.name as major,c.name as college into professor
 from miyar_doctors d join miyar_majors m on m.id=d.major_id
 join miyar_colleges c on c.id=m.college_id
 where d.id=p_doctor and d.status='approved'
  and c.university_id=(select university_id from miyar_accounts where auth_id=p_account)
 for share of d,m,c;
 if not found then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 return miyar_submit_google_review(p_account,professor.college,professor.major,professor.name,
  p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
end; $$;
create function public.miyar_submit_existing_guest_review(
 p_guest uuid,p_doctor bigint,p_subject text,p_grade int,p_explanation int,
 p_treatment int,p_grading int,p_comment text,p_tags text[],p_share_grade boolean,p_course text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare professor record;
begin
 perform pg_advisory_xact_lock(hashtextextended('guest:'||p_guest::text,0));
 perform 1 from miyar_guest_sessions where id=p_guest for update;
 select d.name,m.name as major,c.name as college into professor
 from miyar_doctors d join miyar_majors m on m.id=d.major_id
 join miyar_colleges c on c.id=m.college_id
 where d.id=p_doctor and d.status='approved'
  and c.university_id=(select university_id from miyar_guest_sessions where id=p_guest)
 for share of d,m,c;
 if not found then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 return miyar_guest_submit(p_guest,professor.college,professor.major,professor.name,
  p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,p_share_grade,p_course);
end; $$;
revoke execute on function public.miyar_submit_existing_google_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text),public.miyar_submit_existing_guest_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text) from public,anon,authenticated;
grant execute on function public.miyar_submit_existing_google_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text),public.miyar_submit_existing_guest_review(uuid,bigint,text,int,int,int,int,text,text[],boolean,text) to service_role;
commit;
