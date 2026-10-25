begin;
create table public.miyar_guest_sessions (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(char_length(token_hash)=64),
 network_hash text check(network_hash is null or char_length(network_hash)=64),
 university_id bigint references public.miyar_universities(id) on delete restrict,
 status text not null default 'active' check(status in ('active','restricted','banned')),
 created_at timestamptz not null default now()
);
create index miyar_guest_network_creation on public.miyar_guest_sessions(network_hash,created_at);
create table public.miyar_presence (
 guest_id uuid not null references public.miyar_guest_sessions(id) on delete cascade,
 tab_id uuid not null,
 seen_at timestamptz not null default now(),
 primary key(guest_id,tab_id)
);
create index miyar_presence_recent on public.miyar_presence(seen_at);
alter table public.miyar_guest_sessions enable row level security;
alter table public.miyar_presence enable row level security;
revoke all on public.miyar_guest_sessions,public.miyar_presence from public,anon,authenticated;
grant all on public.miyar_guest_sessions,public.miyar_presence to service_role;
alter table public.miyar_doctors add column submitted_by_guest uuid references public.miyar_guest_sessions(id) on delete set null;
alter table public.miyar_reviews add column guest_id uuid references public.miyar_guest_sessions(id) on delete restrict;
alter table public.miyar_reviews drop constraint miyar_review_single_identity;
alter table public.miyar_reviews add constraint miyar_review_single_identity check(num_nonnulls(user_id,account_id,guest_id)=1);
create unique index miyar_one_guest_review_per_subject on public.miyar_reviews(guest_id,doctor_id,lower(subject)) where guest_id is not null;
create index miyar_guest_review_rate on public.miyar_reviews(guest_id,created_at);
alter table public.miyar_reviews drop constraint miyar_reviews_comment_check;
alter table public.miyar_reviews add constraint miyar_reviews_comment_check check(char_length(comment) between 0 and 600);
alter table public.miyar_review_edits drop constraint miyar_review_edits_comment_check;
alter table public.miyar_review_edits add constraint miyar_review_edits_comment_check check(char_length(comment) between 0 and 600);
alter table public.miyar_reviews add column tags text[] not null default '{}';
alter table public.miyar_review_edits add column tags text[] not null default '{}';
alter table public.miyar_reviews add column pledged_at timestamptz;
alter table public.miyar_review_edits add column pledged_at timestamptz;
alter table public.miyar_reviews add constraint miyar_review_tags check(cardinality(tags)<=6 and tags <@ array['محاضرة ممتعة','محاضرة مملة','يعطي بونس','يعطيك حقك','واجبات كثيرة','ما يرد على الإيميل','اختبارات صعبة','شديد في التصحيح','متعاون ومتفهم','يوصل المعلومة','يختصر لك المعلومة']::text[]);
alter table public.miyar_review_edits add constraint miyar_edit_tags check(cardinality(tags)<=6 and tags <@ array['محاضرة ممتعة','محاضرة مملة','يعطي بونس','يعطيك حقك','واجبات كثيرة','ما يرد على الإيميل','اختبارات صعبة','شديد في التصحيح','متعاون ومتفهم','يوصل المعلومة','يختصر لك المعلومة']::text[]);
create function public.miyar_open_guest(p_token_hash text,p_network_hash text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result uuid;
begin
 if p_network_hash is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_network_hash,1));
  if (select count(*) from miyar_guest_sessions where network_hash=p_network_hash and created_at>now()-interval '1 hour')>=250 then raise exception 'RATE_LIMIT'; end if;
 end if;
 insert into miyar_guest_sessions(token_hash,network_hash) values(p_token_hash,p_network_hash) returning id into result;
 return jsonb_build_object('id',result,'university_id',null,'status','active');
end; $$;
create function public.miyar_touch_presence(p_guest uuid,p_tab uuid,p_visible boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_guest_sessions where id=p_guest and status in ('active','restricted')) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_visible then insert into miyar_presence(guest_id,tab_id) values(p_guest,p_tab) on conflict(guest_id,tab_id) do update set seen_at=now();
 else delete from miyar_presence where guest_id=p_guest and tab_id=p_tab; end if;
 delete from miyar_presence where seen_at<now()-interval '5 minutes';
 return jsonb_build_object('online',(select count(distinct p.guest_id) from miyar_presence p join miyar_guest_sessions g on g.id=p.guest_id where p.seen_at>now()-interval '90 seconds' and g.status in ('active','restricted')));
end; $$;
create function public.miyar_guest_submit(p_guest uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[]) returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor miyar_guest_sessions%rowtype; major bigint; doctor bigint; state text; result bigint;
begin
 select * into actor from miyar_guest_sessions where id=p_guest for update;
 if not found or actor.status<>'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if actor.university_id is null then raise exception 'UNIVERSITY_REQUIRED'; end if;
 if (select count(*) from miyar_reviews where guest_id=p_guest and created_at>now()-interval '24 hours')>=5 then raise exception 'RATE_LIMIT'; end if;
 if actor.network_hash is not null then
  perform pg_advisory_xact_lock(hashtextextended(actor.network_hash,2));
  if (select count(*) from miyar_reviews r join miyar_guest_sessions g on g.id=r.guest_id where g.network_hash=actor.network_hash and r.created_at>now()-interval '1 hour')>=200 then raise exception 'RATE_LIMIT'; end if;
 end if;
 select m.id into major from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.name=p_major and c.name=p_college and c.university_id=actor.university_id;
 if major is null then raise exception 'INVALID_MAJOR'; end if;
 insert into miyar_doctors(major_id,name,submitted_by_guest) values(major,p_name,p_guest) on conflict(major_id,name) do nothing;
 select id,status into doctor,state from miyar_doctors where major_id=major and name=p_name;
 if state not in ('pending','approved') then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 insert into miyar_reviews(doctor_id,guest_id,subject,grade,explanation,treatment,grading,comment,tags,pledged_at) values(doctor,p_guest,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment,p_tags,now()) returning id into result;
 return jsonb_build_object('id',result,'status','pending','newDoctor',state='pending');
end; $$;
-- Keep the original service-only submission routines as the atomic core.
create function public.miyar_submit_google_review(p_account uuid,p_college text,p_major text,p_name text,p_subject text,p_grade int,p_explanation int,p_treatment int,p_grading int,p_comment text,p_tags text[]) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 result=miyar_submit_google_review(p_account,p_college,p_major,p_name,p_subject,p_grade,p_explanation,p_treatment,p_grading,p_comment);
 update miyar_reviews set tags=p_tags,pledged_at=now() where id=(result->>'id')::bigint and account_id=p_account;
 return result;
end; $$;
create function public.miyar_request_edit(p_account uuid,p_review bigint,p_subject text,p_comment text,p_explanation int,p_treatment int,p_grading int,p_tags text[]) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 result=miyar_request_edit(p_account,p_review,p_subject,p_comment,p_explanation,p_treatment,p_grading);
 update miyar_review_edits set tags=p_tags,pledged_at=now() where id=(result->>'id')::bigint and account_id=p_account;
 return result;
end; $$;
create or replace function public.miyar_moderate_edit(p_id bigint,p_approve boolean) returns void language plpgsql security invoker set search_path=public as $$
declare e miyar_review_edits%rowtype; r miyar_reviews%rowtype;
begin
 select * into e from miyar_review_edits where id=p_id and status='pending';
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 select * into r from miyar_reviews where id=e.review_id for update;
 select * into e from miyar_review_edits where id=p_id and status='pending' for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_approve then
  if r.status<>'published' or r.account_id is distinct from e.account_id or not exists(select 1 from miyar_doctors where id=r.doctor_id and status='approved') then raise exception 'REVIEW_UNAVAILABLE'; end if;
  update miyar_reviews set subject=e.subject,comment=e.comment,explanation=e.explanation,treatment=e.treatment,grading=e.grading,tags=e.tags where id=r.id;
 end if;
 update miyar_review_edits set status=case when p_approve then 'approved' else 'rejected' end where id=p_id;
end; $$;
create or replace function public.miyar_community_queue() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'edits',coalesce((select jsonb_agg(x order by x.created_at) from (
 select e.id,e.review_id,e.subject,e.comment,e.explanation,e.treatment,e.grading,e.tags,e.created_at,d.name as doctor_name,r.subject as old_subject,r.comment as old_comment,r.explanation as old_explanation,r.treatment as old_treatment,r.grading as old_grading,r.tags as old_tags
 from miyar_review_edits e join miyar_reviews r on r.id=e.review_id join miyar_doctors d on d.id=r.doctor_id where e.status='pending' order by e.created_at limit 100) x),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(x order by x.created_at) from (
 select p.id,p.review_id,p.reason,p.details,p.created_at,d.name as doctor_name,r.subject,r.comment
 from miyar_reports p join miyar_reviews r on r.id=p.review_id join miyar_doctors d on d.id=r.doctor_id where p.status='pending' order by p.created_at limit 100) x),'[]'::jsonb)
 );
$$;
create or replace function public.miyar_summary_comments(p_doctor bigint,p_subject text default null) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('total',(select count(*) from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where d.id=p_doctor and d.status='approved' and r.status='published' and (p_subject is null or r.subject=p_subject)),
 'rows',coalesce((select jsonb_agg(x) from (select r.comment,r.tags from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id where d.id=p_doctor and d.status='approved' and r.status='published' and (p_subject is null or r.subject=p_subject) order by r.created_at desc limit 500) x),'[]'::jsonb));
$$;
create or replace function public.miyar_my_reviews(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select r.id,r.doctor_id,d.name as doctor_name,r.subject,r.comment,r.tags,r.explanation,r.treatment,r.grading,r.status,r.created_at,
 (select e.status from miyar_review_edits e where e.review_id=r.id order by e.id desc limit 1) as edit_status
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.account_id=p_account and c.university_id=(select university_id from miyar_accounts where auth_id=p_account) order by r.created_at desc limit 100
 ) x;
$$;
revoke execute on function public.miyar_open_guest(text,text),public.miyar_touch_presence(uuid,uuid,boolean),public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[]),public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[]),public.miyar_request_edit(uuid,bigint,text,text,int,int,int,text[]) from public,anon,authenticated;
grant execute on function public.miyar_open_guest(text,text),public.miyar_touch_presence(uuid,uuid,boolean),public.miyar_guest_submit(uuid,text,text,text,text,int,int,int,int,text,text[]),public.miyar_submit_google_review(uuid,text,text,text,text,int,int,int,int,text,text[]),public.miyar_request_edit(uuid,bigint,text,text,int,int,int,text[]) to service_role;
commit;
