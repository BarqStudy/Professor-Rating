begin;
create table public.miyar_universities (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 2 and 100),
  city text not null default '' check (char_length(city)<=100)
);
alter table public.miyar_universities enable row level security;
revoke all on public.miyar_universities from public,anon,authenticated;
grant all on public.miyar_universities to service_role;
grant usage,select on sequence public.miyar_universities_id_seq to service_role;
insert into public.miyar_universities(name,city) values
 ('جامعة الملك سعود','الرياض'),('جامعة الملك خالد','أبها'),('جامعة نجران','نجران');
alter table public.miyar_colleges add column university_id bigint references public.miyar_universities(id) on delete restrict;
-- The owner confirmed all existing colleges/doctors belong to Najran University.
update public.miyar_colleges set university_id=(select id from public.miyar_universities where name='جامعة نجران');
alter table public.miyar_colleges alter column university_id set not null;
alter table public.miyar_colleges drop constraint miyar_colleges_name_key;
alter table public.miyar_colleges add constraint miyar_college_university_name unique(university_id,name);
alter table public.miyar_accounts add column university_id bigint references public.miyar_universities(id) on delete restrict;
-- Preserve existing profile majors; every account still explicitly chooses its university.
create function public.miyar_check_profile_university() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.university_id is not null and new.major_id is not null and not exists (
    select 1 from miyar_majors m join miyar_colleges c on c.id=m.college_id
    where m.id=new.major_id and c.university_id=new.university_id
  ) then raise exception 'INVALID_UNIVERSITY_MAJOR'; end if;
  return new;
end;
$$;
revoke execute on function public.miyar_check_profile_university() from public,anon,authenticated;
grant execute on function public.miyar_check_profile_university() to service_role;
create trigger miyar_profile_university before insert or update on public.miyar_accounts
 for each row execute function public.miyar_check_profile_university();

create or replace function public.miyar_catalogue() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'universities', coalesce((select jsonb_agg(u order by u.id) from miyar_universities u),'[]'::jsonb),
    'colleges', coalesce((select jsonb_agg(c order by c.id) from miyar_colleges c),'[]'::jsonb),
    'majors', coalesce((select jsonb_agg(m order by m.id) from miyar_majors m),'[]'::jsonb),
    'doctors', coalesce((select jsonb_agg(d order by d.score desc nulls last,d.id) from (
      select d.id,d.name,d.major_id,d.verified,c.id as college_id,c.university_id,m.name as major,c.name as college,
        count(r.id)::int as count,
        coalesce(round(avg((r.explanation+r.treatment+r.grading)/3.0)),0)::int as score,
        jsonb_build_array(coalesce(round(avg(r.explanation)),0),coalesce(round(avg(r.treatment)),0),coalesce(round(avg(r.grading)),0)) as scores,
        coalesce(jsonb_agg(distinct r.subject) filter(where r.id is not null),'[]'::jsonb) as subjects
      from miyar_doctors d join miyar_majors m on m.id=d.major_id
      join miyar_colleges c on c.id=m.college_id
      left join miyar_reviews r on r.doctor_id=d.id and r.status='published'
      where d.status='approved' group by d.id,m.id,c.id
      order by d.id limit 1000
    ) d),'[]'::jsonb),
    'stats',jsonb_build_object('doctors',(select count(*) from miyar_doctors where status='approved'),
      'reviews',(select count(*) from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where r.status='published' and d.status='approved'))
  );
$$;


create or replace function public.miyar_submit_google_review(
  p_account uuid,p_college text,p_major text,p_name text,p_subject text,
  p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_major bigint; v_doctor bigint; v_status text; v_review bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  select status into v_status from miyar_accounts where auth_id=p_account for update;
  if v_status is distinct from 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if (select count(*) from miyar_reviews where account_id=p_account and created_at>now()-interval '24 hours')>=5 then
    raise exception 'RATE_LIMIT';
  end if;
  select m.id into v_major from miyar_majors m join miyar_colleges c on c.id=m.college_id
    where m.name=p_major and c.name=p_college
      and c.university_id=(select university_id from miyar_accounts where auth_id=p_account);
  if v_major is null then raise exception 'INVALID_MAJOR'; end if;
  insert into miyar_doctors(major_id,name,submitted_by_account) values(v_major,p_name,p_account)
    on conflict(major_id,name) do nothing;
  select id,status into v_doctor,v_status from miyar_doctors where major_id=v_major and name=p_name;
  if v_status not in ('pending','approved') then raise exception 'DOCTOR_UNAVAILABLE'; end if;
  insert into miyar_reviews(doctor_id,account_id,subject,grade,explanation,treatment,grading,comment)
    values(v_doctor,p_account,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment)
    returning id into v_review;
  return jsonb_build_object('id',v_review,'status','pending','newDoctor',v_status='pending');
end;
$$;

commit;
