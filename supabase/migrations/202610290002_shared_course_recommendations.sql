begin;
-- A subject can be taught by professors from any department in its university.
-- Match full normalized names, including course numbers, without rewriting the
-- original plan/course links or personal progress. Ambiguous plan names still
-- require an exact course link.
create index miyar_review_shared_subject_key
 on public.miyar_reviews(miyar_course_key(subject),doctor_id) where status='published';
create index miyar_study_course_name_key
 on public.miyar_study_courses(plan_id,miyar_course_key(name)) where linkable;

create or replace function public.miyar_course_evidence(p_course text) returns setof public.miyar_reviews
language sql stable security invoker set search_path=public as $$
 select distinct on (r.doctor_id,coalesce('account:'||r.account_id::text,'guest:'||r.guest_id::text,'legacy:'||r.user_id::text)) r.*
 from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id and p.deleted_at is null
 join miyar_majors pm on pm.id=p.major_id join miyar_colleges pc on pc.id=pm.college_id
 join miyar_reviews r on r.status='published'
 join miyar_doctors d on d.id=r.doctor_id and d.status='approved'
 join miyar_majors dm on dm.id=d.major_id join miyar_colleges dc on dc.id=dm.college_id and dc.university_id=pc.university_id
 left join miyar_study_courses linked on linked.id=r.course_id
 left join miyar_study_plans linked_plan on linked_plan.id=linked.plan_id
 left join miyar_majors linked_major on linked_major.id=linked_plan.major_id
 left join miyar_colleges linked_college on linked_college.id=linked_major.college_id
 where c.id=p_course and c.linkable and (
  r.course_id=c.id or (
   miyar_course_key(c.name)<>'' and miyar_course_key(r.subject)=miyar_course_key(c.name)
   and (select count(*) from miyar_study_courses other where other.plan_id=c.plan_id and other.linkable and miyar_course_key(other.name)=miyar_course_key(c.name))=1
   and (
    r.course_id is null or (
     linked.linkable and linked_plan.deleted_at is null
     and linked_college.university_id=pc.university_id
     and miyar_course_key(linked.name)=miyar_course_key(c.name)
     and (select count(*) from miyar_study_courses other where other.plan_id=linked.plan_id and other.linkable and miyar_course_key(other.name)=miyar_course_key(linked.name))=1
    )
   )
  )
 )
 order by r.doctor_id,coalesce('account:'||r.account_id::text,'guest:'||r.guest_id::text,'legacy:'||r.user_id::text),r.created_at desc,r.id desc;
$$;
revoke execute on function public.miyar_course_evidence(text) from public,anon,authenticated;
grant execute on function public.miyar_course_evidence(text) to service_role;
commit;
