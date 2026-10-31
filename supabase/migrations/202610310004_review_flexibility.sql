begin;
-- An omitted grade is absent data, never a fabricated zero or a public secret.
alter table public.miyar_reviews alter column grade drop not null;
alter table public.miyar_reviews add column removed_at timestamptz;
update public.miyar_reviews r set removed_at=x.removed_at from public.miyar_review_removals x where x.review_id=r.id;
update public.miyar_reviews r set removed_at=now() where r.status='rejected' and r.removed_at is null
 and exists(select 1 from public.miyar_reports p where p.review_id=r.id and p.status='resolved');
create function public.miyar_mark_removed_review() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.status='published' and new.status='rejected' then new.removed_at=coalesce(old.removed_at,now()); end if;
 return new;
end; $$;
create trigger miyar_mark_review_removal before update of status on public.miyar_reviews for each row execute function public.miyar_mark_removed_review();
alter table public.miyar_reviews add constraint miyar_removed_review_state check(removed_at is null or status='rejected');
drop index public.miyar_one_review_per_subject;
drop index public.miyar_one_google_review_per_subject;
drop index public.miyar_one_guest_review_per_subject;
create unique index miyar_one_review_per_subject on public.miyar_reviews(user_id,doctor_id,lower(subject)) where removed_at is null and user_id is not null;
create unique index miyar_one_google_review_per_subject on public.miyar_reviews(account_id,doctor_id,lower(subject)) where removed_at is null and account_id is not null;
create unique index miyar_one_guest_review_per_subject on public.miyar_reviews(guest_id,doctor_id,lower(subject)) where removed_at is null and guest_id is not null;

create or replace function public.miyar_one_review_per_doctor() returns trigger
language plpgsql security invoker set search_path=public as $$
declare owner_account uuid; subject_key text; university bigint;
begin
 if new.removed_at is not null then return new; end if;
 if tg_op='UPDATE' and new.account_id is not distinct from old.account_id
  and new.guest_id is not distinct from old.guest_id and new.doctor_id=old.doctor_id
  and miyar_course_key(new.subject)=miyar_course_key(old.subject) then return new; end if;
 owner_account=new.account_id;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=new.guest_id; end if;
 select c.university_id into university from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=new.doctor_id;
 subject_key=miyar_course_key(miyar_review_subject_name(university,new.subject));
 perform pg_advisory_xact_lock(hashtextextended('miyar-review:'||coalesce(owner_account::text,'guest:'||new.guest_id::text)||':'||new.doctor_id::text,0));
 if exists(select 1 from miyar_reviews r where r.removed_at is null and r.id is distinct from new.id and r.doctor_id=new.doctor_id
  and miyar_course_key(miyar_review_subject_name(university,r.subject))=subject_key and (
   (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account)))
   or (new.guest_id is not null and r.guest_id=new.guest_id)
 )) then raise exception 'REVIEW_ALREADY_EXISTS'; end if;
 return new;
end; $$;

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
 select coalesce(jsonb_agg(distinct names.subject),'[]'::jsonb) into reviewed_subjects from miyar_reviews r
 cross join lateral (values(r.subject),(miyar_review_subject_name(university,r.subject))) names(subject)
 where r.removed_at is null and r.doctor_id=p_doctor and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 );
 if p_subject is null or btrim(p_subject)='' then return jsonb_build_object('eligible',true,'reviewedSubjects',reviewed_subjects); end if;
 select r.id,r.status,r.account_id,r.guest_id into previous from miyar_reviews r where r.removed_at is null and r.doctor_id=p_doctor
  and miyar_course_key(miyar_review_subject_name(university,r.subject))=miyar_course_key(miyar_review_subject_name(university,p_subject)) and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 ) order by r.created_at desc,r.id desc limit 1;
 if found then return jsonb_build_object('eligible',false,'reviewedSubjects',reviewed_subjects,'status',previous.status,'canEdit',previous.status='published' and (p_account is not null or previous.guest_id=p_guest)); end if;
 return jsonb_build_object('eligible',true,'reviewedSubjects',reviewed_subjects);
end; $$;
alter table public.miyar_reviews drop constraint miyar_review_tags;
alter table public.miyar_reviews add constraint miyar_review_tags check(cardinality(tags)<=6 and tags <@ array['محاضرة ممتعة','محاضرة مملة','يعطي بونس','يعطيك حقك','واجبات كثيرة','ما يرد على الإيميل','اختبارات صعبة','شديد في التصحيح','متعاون ومتفهم','يوصل المعلومة','يختصر لك المعلومة','أمثلة وتطبيقات واضحة','يتقبل الأسئلة','يربط المادة بالتطبيق','يشجع المشاركة','ساعات مكتبية مفيدة','ملتزم بالمواعيد','تصحيح واضح','يعطي تغذية راجعة','الواجبات مفيدة','اختباراته من المحتوى','سريع في الشرح','يعتمد على التعلم الذاتي','قليل الأمثلة','صعب التواصل معه']::text[]);
alter table public.miyar_review_edits drop constraint miyar_edit_tags;
alter table public.miyar_review_edits add constraint miyar_edit_tags check(cardinality(tags)<=6 and tags <@ array['محاضرة ممتعة','محاضرة مملة','يعطي بونس','يعطيك حقك','واجبات كثيرة','ما يرد على الإيميل','اختبارات صعبة','شديد في التصحيح','متعاون ومتفهم','يوصل المعلومة','يختصر لك المعلومة','أمثلة وتطبيقات واضحة','يتقبل الأسئلة','يربط المادة بالتطبيق','يشجع المشاركة','ساعات مكتبية مفيدة','ملتزم بالمواعيد','تصحيح واضح','يعطي تغذية راجعة','الواجبات مفيدة','اختباراته من المحتوى','سريع في الشرح','يعتمد على التعلم الذاتي','قليل الأمثلة','صعب التواصل معه']::text[]);
-- Keep explicit administrative relinks when both the name and ID change.
create or replace function public.miyar_check_review_course() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' and miyar_course_key(new.subject) is distinct from miyar_course_key(old.subject)
  and new.course_id is not distinct from old.course_id
  and not exists(select 1 from miyar_study_courses where id=new.course_id and miyar_course_key(name)=miyar_course_key(new.subject)) then new.course_id=null; end if;
 if new.course_id is not null and not exists (
  select 1 from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
  join miyar_majors pm on pm.id=p.major_id join miyar_colleges pc on pc.id=pm.college_id
  join miyar_doctors d on d.id=new.doctor_id join miyar_majors dm on dm.id=d.major_id
  join miyar_colleges dc on dc.id=dm.college_id and dc.university_id=pc.university_id
  where c.id=new.course_id and c.linkable and p.deleted_at is null and pm.deleted_at is null
   and miyar_course_key(c.name)<>'' and miyar_course_key(c.name)=miyar_course_key(new.subject)
 ) then raise exception 'INVALID_STUDY_COURSE'; end if;
 return new;
end; $$;
create table public.miyar_review_course_links (
 id bigint generated always as identity primary key,
 review_id bigint not null references public.miyar_reviews(id) on delete cascade,
 linked_by uuid references public.miyar_accounts(auth_id) on delete set null,
 old_subject text not null,old_course text,new_course text not null references public.miyar_study_courses(id),
 created_at timestamptz not null default now()
);
alter table public.miyar_review_course_links enable row level security;
revoke all on public.miyar_review_course_links from public,anon,authenticated;
grant all on public.miyar_review_course_links to service_role;
grant usage,select on sequence public.miyar_review_course_links_id_seq to service_role;
create function public.miyar_review_course_options(p_review bigint) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare university bigint;
begin
 select college.university_id into university from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id
 join miyar_majors m on m.id=d.major_id join miyar_colleges college on college.id=m.college_id
 where r.id=p_review and r.removed_at is null and r.status in('pending','published');
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 return (select coalesce(jsonb_agg(x order by x.plan,x.name,x.code),'[]'::jsonb) from (
  select c.id,c.name,c.code,coalesce(p.metadata->>'title',m.name) as plan
  from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id join miyar_majors m on m.id=p.major_id
  join miyar_colleges college on college.id=m.college_id
  where c.linkable and p.deleted_at is null and m.deleted_at is null and college.university_id=university
 ) x);
end; $$;
create function public.miyar_link_review_course(p_admin uuid,p_review bigint,p_course text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare r miyar_reviews%rowtype; course record; university bigint; actor uuid;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select * into r from miyar_reviews where id=p_review;
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 actor=r.account_id;
 if actor is null then select account_id into actor from miyar_review_identities where guest_id=r.guest_id; end if;
 perform pg_advisory_xact_lock(hashtextextended('miyar-review:'||coalesce(actor::text,'guest:'||r.guest_id::text)||':'||r.doctor_id::text,0));
 select * into r from miyar_reviews where id=p_review for update;
 if r.removed_at is not null or r.status not in('pending','published') then raise exception 'REVIEW_UNAVAILABLE'; end if;
 select college.university_id into university from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges college on college.id=m.college_id where d.id=r.doctor_id;
 select c.id,c.name into course from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
 join miyar_majors m on m.id=p.major_id join miyar_colleges college on college.id=m.college_id
 where c.id=p_course and c.linkable and p.deleted_at is null and m.deleted_at is null and college.university_id=university;
 if not found then raise exception 'INVALID_STUDY_COURSE'; end if;
 if r.subject=course.name and r.course_id=course.id then return jsonb_build_object('ok',true,'id',p_review,'subject',course.name); end if;
 update miyar_reviews set subject=course.name,course_id=course.id where id=p_review;
 -- Pending amendments follow the canonical subject; the original audit remains.
 update miyar_review_edits set subject=course.name where review_id=p_review and status='pending';
 insert into miyar_review_course_links(review_id,linked_by,old_subject,old_course,new_course) values(p_review,p_admin,r.subject,r.course_id,course.id);
 return jsonb_build_object('ok',true,'id',p_review,'subject',course.name);
end; $$;
revoke execute on function public.miyar_mark_removed_review(),public.miyar_review_course_options(bigint),public.miyar_link_review_course(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.miyar_mark_removed_review(),public.miyar_review_course_options(bigint),public.miyar_link_review_course(uuid,bigint,text) to service_role;
-- Handwritten names are reviewable by administration; explicit IDs still require a real same-university match.
create or replace function public.miyar_require_course_choice(p_university bigint,p_subject text,p_course text) returns text
language plpgsql stable security invoker set search_path=public as $$
declare canonical text;
begin
 if p_course is not null then
  select c.name into canonical from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
  join miyar_majors m on m.id=p.major_id join miyar_colleges college on college.id=m.college_id
  where c.id=p_course and c.linkable and p.deleted_at is null and m.deleted_at is null and college.university_id=p_university;
  if not found or miyar_course_key(canonical) is distinct from miyar_course_key(p_subject) then raise exception 'INVALID_STUDY_COURSE'; end if;
  return canonical;
 end if;
 return p_subject;
end; $$;
commit;
