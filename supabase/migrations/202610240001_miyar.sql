begin;

create table public.miyar_colleges (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 2 and 100)
);
create table public.miyar_majors (
  id bigint generated always as identity primary key,
  college_id bigint not null references public.miyar_colleges(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 100),
  unique(college_id, name)
);
create table public.miyar_users (
  telegram_id bigint primary key check (telegram_id > 0),
  username text,
  name text not null check (char_length(name) between 1 and 60),
  major_id bigint references public.miyar_majors(id) on delete set null,
  level smallint check (level between 1 and 12),
  status text not null default 'active' check (status in ('active','restricted','banned')),
  created_at timestamptz not null default now()
);
create table public.miyar_doctors (
  id bigint generated always as identity primary key,
  major_id bigint not null references public.miyar_majors(id) on delete restrict,
  name text not null check (char_length(name) between 8 and 100),
  verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  submitted_by bigint references public.miyar_users(telegram_id) on delete set null,
  created_at timestamptz not null default now(),
  unique(major_id, name)
);
create table public.miyar_reviews (
  id bigint generated always as identity primary key,
  doctor_id bigint not null references public.miyar_doctors(id) on delete restrict,
  user_id bigint not null references public.miyar_users(telegram_id) on delete restrict,
  subject text not null check (char_length(subject) between 2 and 120),
  grade smallint not null check (grade between 0 and 100),
  explanation smallint not null check (explanation between 0 and 100),
  treatment smallint not null check (treatment between 0 and 100),
  grading smallint not null check (grading between 0 and 100),
  comment text not null check (char_length(comment) between 3 and 600),
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  created_at timestamptz not null default now()
);
create unique index miyar_one_review_per_subject on public.miyar_reviews(user_id,doctor_id,lower(subject));
create index miyar_review_moderation on public.miyar_reviews(status,created_at desc);
create index miyar_review_doctor on public.miyar_reviews(doctor_id,status);
create index miyar_review_rate on public.miyar_reviews(user_id,created_at desc);

-- No browser role can read or write these tables, including identity and grade.
-- Only the Edge Function's service role uses the database.
alter table public.miyar_colleges enable row level security;
alter table public.miyar_majors enable row level security;
alter table public.miyar_users enable row level security;
alter table public.miyar_doctors enable row level security;
alter table public.miyar_reviews enable row level security;
revoke all on public.miyar_colleges, public.miyar_majors, public.miyar_users,
  public.miyar_doctors, public.miyar_reviews from anon, authenticated;
grant all on public.miyar_colleges, public.miyar_majors, public.miyar_users,
  public.miyar_doctors, public.miyar_reviews to service_role;
grant usage, select on sequence public.miyar_colleges_id_seq, public.miyar_majors_id_seq,
  public.miyar_doctors_id_seq, public.miyar_reviews_id_seq to service_role;

create function public.miyar_catalogue() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'colleges', coalesce((select jsonb_agg(c order by c.id) from miyar_colleges c),'[]'::jsonb),
    'majors', coalesce((select jsonb_agg(m order by m.id) from miyar_majors m),'[]'::jsonb),
    'doctors', coalesce((select jsonb_agg(d order by d.score desc nulls last,d.id) from (
      select d.id,d.name,d.major_id,d.verified,m.name as major,c.name as college,
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

-- Atomic, per-user rate limits; a concurrent submission cannot bypass the limit.
create function public.miyar_submit_review(
  p_user bigint,p_college text,p_major text,p_name text,p_subject text,
  p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_major bigint; v_doctor bigint; v_status text; v_review bigint;
begin
  perform pg_advisory_xact_lock(p_user);
  select status into v_status from miyar_users where telegram_id=p_user for update;
  if v_status is distinct from 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if (select count(*) from miyar_reviews where user_id=p_user and created_at>now()-interval '24 hours')>=5 then
    raise exception 'RATE_LIMIT';
  end if;
  select m.id into v_major from miyar_majors m join miyar_colleges c on c.id=m.college_id
    where m.name=p_major and c.name=p_college;
  if v_major is null then raise exception 'INVALID_MAJOR'; end if;
  insert into miyar_doctors(major_id,name,submitted_by) values(v_major,p_name,p_user)
    on conflict(major_id,name) do nothing;
  select id,status into v_doctor,v_status from miyar_doctors where major_id=v_major and name=p_name;
  if v_status not in ('pending','approved') then raise exception 'DOCTOR_UNAVAILABLE'; end if;
  insert into miyar_reviews(doctor_id,user_id,subject,grade,explanation,treatment,grading,comment)
    values(v_doctor,p_user,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment)
    returning id into v_review;
  return jsonb_build_object('id',v_review,'status','pending','newDoctor',v_status='pending');
end;
$$;

create function public.miyar_moderate_doctor(p_id bigint,p_approve boolean) returns void
language plpgsql security invoker set search_path=public as $$
begin
  update miyar_doctors set status=case when p_approve then 'approved' else 'rejected' end where id=p_id and status='pending';
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  -- Doctor approval does not publish comments; each review is moderated separately.
  if not p_approve then update miyar_reviews set status='rejected' where doctor_id=p_id and status='pending'; end if;
end;
$$;

revoke execute on function public.miyar_catalogue() from public,anon,authenticated;
revoke execute on function public.miyar_submit_review(bigint,text,text,text,text,int,int,int,int,text) from public,anon,authenticated;
revoke execute on function public.miyar_moderate_doctor(bigint,boolean) from public,anon,authenticated;
grant execute on function public.miyar_catalogue() to service_role;
grant execute on function public.miyar_submit_review(bigint,text,text,text,text,int,int,int,int,text) to service_role;
grant execute on function public.miyar_moderate_doctor(bigint,boolean) to service_role;

insert into public.miyar_colleges(name) values('كلية الهندسة');
insert into public.miyar_majors(college_id,name)
  select c.id,n from public.miyar_colleges c cross join
    unnest(array['الهندسة المدنية','الهندسة الكهربائية','الهندسة الميكانيكية','الهندسة الصناعية','هندسة الحاسب']) n
  where c.name='كلية الهندسة';
-- No fictitious doctors, reviews, users, or grades are seeded in the live database.
commit;
