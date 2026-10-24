begin;

-- Add Google/Supabase Auth accounts without deleting or reassigning legacy reviews.
create table public.miyar_accounts (
  auth_id uuid primary key references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  major_id bigint references public.miyar_majors(id) on delete set null,
  level smallint check (level between 1 and 12),
  status text not null default 'active' check (status in ('active','restricted','banned')),
  created_at timestamptz not null default now()
);
alter table public.miyar_accounts enable row level security;
revoke all on public.miyar_accounts from public,anon,authenticated;
grant all on public.miyar_accounts to service_role;

alter table public.miyar_doctors add column submitted_by_account uuid references public.miyar_accounts(auth_id) on delete set null;
alter table public.miyar_reviews add column account_id uuid references public.miyar_accounts(auth_id) on delete restrict;
alter table public.miyar_reviews alter column user_id drop not null;
alter table public.miyar_reviews add constraint miyar_review_single_identity check (num_nonnulls(user_id,account_id)=1);
create unique index miyar_one_google_review_per_subject on public.miyar_reviews(account_id,doctor_id,lower(subject)) where account_id is not null;
create index miyar_google_review_rate on public.miyar_reviews(account_id,created_at desc) where account_id is not null;

-- The retired submission function remains in migration history but cannot be invoked by the live service.
revoke execute on function public.miyar_submit_review(bigint,text,text,text,text,int,int,int,int,text) from service_role;

create function public.miyar_submit_google_review(
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
    where m.name=p_major and c.name=p_college;
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
revoke execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text) from public,anon,authenticated;
grant execute on function public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text) to service_role;

commit;
