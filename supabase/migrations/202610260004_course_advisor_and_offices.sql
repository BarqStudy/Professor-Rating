begin;
-- Presentation titles are separate from verification and administrative access.
alter table public.miyar_doctors add column office_role text check(office_role in ('head','dean'));
alter table public.miyar_doctors add column office_college_id bigint references public.miyar_colleges(id) on delete restrict;
alter table public.miyar_doctors add constraint miyar_office_college_required check(
 (office_role is not distinct from 'dean' and office_college_id is not null) or (office_role is distinct from 'dean' and office_college_id is null)
);
create function public.miyar_set_doctor_office(p_doctor bigint,p_role text,p_college bigint default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare university bigint;
begin
 if p_role is not null and p_role not in ('head','dean') then raise exception 'INVALID_DOCTOR_OFFICE'; end if;
 select c.university_id into university from miyar_doctors d join miyar_majors m on m.id=d.major_id
 join miyar_colleges c on c.id=m.college_id where d.id=p_doctor and d.status='approved' for update of d;
 if not found then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 if p_role='dean' and not exists(select 1 from miyar_colleges where id=p_college and university_id=university) then raise exception 'INVALID_DOCTOR_OFFICE'; end if;
 if p_role is distinct from 'dean' and p_college is not null then raise exception 'INVALID_DOCTOR_OFFICE'; end if;
 update miyar_doctors set office_role=p_role,office_college_id=case when p_role='dean' then p_college end where id=p_doctor;
 return jsonb_build_object('ok',true);
end; $$;

-- Match equivalent spelling, not loosely similar subjects. Numerals remain part
-- of the key, so e.g. circuits 1 and 2 cannot merge. No legacy rows are rewritten.
create function public.miyar_course_key(p_subject text) returns text
language sql immutable strict security invoker set search_path=public as $$
 select regexp_replace(regexp_replace(
  regexp_replace(translate(lower(regexp_replace(normalize(p_subject,NFKC),'[ؐ-ًؚ-ٰٟـ]','','g')),
   'أإآٱىةککي٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','اااايهككي01234567890123456789'),
   '[[:punct:]]',' ','g'),
  '(^|[[:space:]])ال','\1','g'),'[[:space:]]','','g');
$$;
create index miyar_review_course_key on public.miyar_reviews(miyar_course_key(subject),doctor_id) where status='published' and course_id is null;

-- Explicit selections may cross departments/colleges in the same university.
create or replace function public.miyar_check_review_course() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' and miyar_course_key(new.subject) is distinct from miyar_course_key(old.subject) then new.course_id=null; end if;
 if new.course_id is not null and not exists (
  select 1 from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
  join miyar_majors pm on pm.id=p.major_id join miyar_colleges pc on pc.id=pm.college_id
  join miyar_doctors d on d.id=new.doctor_id join miyar_majors dm on dm.id=d.major_id
  join miyar_colleges dc on dc.id=dm.college_id and dc.university_id=pc.university_id
  where c.id=new.course_id and c.linkable and miyar_course_key(c.name)<>'' and miyar_course_key(c.name)=miyar_course_key(new.subject)
 ) then raise exception 'INVALID_STUDY_COURSE'; end if;
 return new;
end; $$;

-- Service-only evidence. Legacy free text must match a unique normalized course
-- in the SAME department; explicit course IDs support cross-college teaching.
-- One latest published review per platform identity and professor per course.
create function public.miyar_course_evidence(p_course text) returns setof public.miyar_reviews
language sql stable security invoker set search_path=public as $$
 select distinct on (r.doctor_id,coalesce('account:'||r.account_id::text,'guest:'||r.guest_id::text,'legacy:'||r.user_id::text)) r.*
 from miyar_study_courses c join miyar_study_plans p on p.id=c.plan_id
 join miyar_majors pm on pm.id=p.major_id join miyar_colleges pc on pc.id=pm.college_id
 join miyar_reviews r on r.status='published'
 join miyar_doctors d on d.id=r.doctor_id and d.status='approved'
 join miyar_majors dm on dm.id=d.major_id join miyar_colleges dc on dc.id=dm.college_id and dc.university_id=pc.university_id
 where c.id=p_course and c.linkable and (
  r.course_id=c.id or (
   r.course_id is null and d.major_id=p.major_id
   and miyar_course_key(r.subject)=miyar_course_key(c.name)
   and miyar_course_key(c.name)<>''
   and (select count(*) from miyar_study_courses other where other.plan_id=c.plan_id and other.linkable and miyar_course_key(other.name)=miyar_course_key(c.name))=1
  )
 )
 order by r.doctor_id,coalesce('account:'||r.account_id::text,'guest:'||r.guest_id::text,'legacy:'||r.user_id::text),r.created_at desc,r.id desc;
$$;
create or replace function public.miyar_course_doctors(p_course text) returns jsonb language plpgsql stable security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_study_courses where id=p_course and linkable) then raise exception 'STUDY_COURSE_NOT_FOUND'; end if;
 return (select coalesce(jsonb_agg(x order by x.score desc,x.count desc,x.id),'[]'::jsonb) from (
  select d.id,d.name,d.verified,d.office_role,d.office_college_id,oc.name as office_college,
   m.name as major,c.name as college,count(r.id)::int as count,
   round(avg((r.explanation+r.treatment+r.grading)/3.0),1) as score,
   jsonb_build_array(round(avg(r.explanation)),round(avg(r.treatment)),round(avg(r.grading))) as scores,
   count(*) filter(where r.course_id is null)::int as matched_text_count
  from miyar_course_evidence(p_course) r join miyar_doctors d on d.id=r.doctor_id
  join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
  left join miyar_colleges oc on oc.id=d.office_college_id
  group by d.id,m.id,c.id,oc.id order by score desc,count desc,d.id limit 100
 ) x);
end; $$;
create function public.miyar_course_reviews(p_course text,p_doctor bigint) returns jsonb language plpgsql stable security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_study_courses where id=p_course and linkable) then raise exception 'STUDY_COURSE_NOT_FOUND'; end if;
 return (select coalesce(jsonb_agg(x order by x.date desc,x.id desc),'[]'::jsonb) from (
  select r.id,r.subject,r.comment,r.tags,jsonb_build_array(r.explanation,r.treatment,r.grading) as scores,r.created_at as date
  from miyar_course_evidence(p_course) r where r.doctor_id=p_doctor order by r.created_at desc,r.id desc limit 100
 ) x);
end; $$;

create or replace function public.miyar_catalogue() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
  'universities',coalesce((select jsonb_agg(u order by u.id) from miyar_universities u),'[]'::jsonb),
  'colleges',coalesce((select jsonb_agg(c order by c.id) from miyar_colleges c),'[]'::jsonb),
  'majors',coalesce((select jsonb_agg(m order by m.id) from miyar_majors m),'[]'::jsonb),
  'doctors',coalesce((select jsonb_agg(d order by d.score desc nulls last,d.id) from (
   select d.id,d.name,d.major_id,d.verified,d.office_role,d.office_college_id,oc.name as office_college,
    c.id as college_id,c.university_id,m.name as major,c.name as college,count(r.id)::int as count,
    coalesce(round(avg((r.explanation+r.treatment+r.grading)/3.0)),0)::int as score,
    jsonb_build_array(coalesce(round(avg(r.explanation)),0),coalesce(round(avg(r.treatment)),0),coalesce(round(avg(r.grading)),0)) as scores,
    coalesce(jsonb_agg(distinct r.subject) filter(where r.id is not null),'[]'::jsonb) as subjects
   from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
   left join miyar_colleges oc on oc.id=d.office_college_id
   left join miyar_reviews r on r.doctor_id=d.id and r.status='published'
   where d.status='approved' group by d.id,m.id,c.id,oc.id order by d.id limit 1000
  ) d),'[]'::jsonb),
  'stats',jsonb_build_object('doctors',(select count(*) from miyar_doctors where status='approved'),
   'reviews',(select count(*) from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where r.status='published' and d.status='approved'))
 );
$$;
revoke execute on function public.miyar_set_doctor_office(bigint,text,bigint),public.miyar_course_key(text),public.miyar_course_evidence(text),public.miyar_course_reviews(text,bigint) from public,anon,authenticated;
grant execute on function public.miyar_set_doctor_office(bigint,text,bigint),public.miyar_course_key(text),public.miyar_course_evidence(text),public.miyar_course_reviews(text,bigint) to service_role;
commit;
