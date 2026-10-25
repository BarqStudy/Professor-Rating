begin;
alter table public.miyar_reviews add column published_at timestamptz;
update public.miyar_reviews set published_at=created_at where status='published';
create function public.miyar_publication_time() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then new.published_at=now(); end if;
  return new;
end; $$;
create trigger miyar_review_publication before insert or update on public.miyar_reviews for each row execute function public.miyar_publication_time();
create table public.miyar_review_edits (
 id bigint generated always as identity primary key,
 review_id bigint not null references public.miyar_reviews(id) on delete restrict,
 account_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 subject text not null check(char_length(subject) between 2 and 120),
 comment text not null check(char_length(comment) between 3 and 600),
 explanation smallint not null check(explanation between 0 and 100),
 treatment smallint not null check(treatment between 0 and 100),
 grading smallint not null check(grading between 0 and 100),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now()
);
create unique index miyar_one_pending_edit on public.miyar_review_edits(review_id) where status='pending';
create table public.miyar_reports (
 id bigint generated always as identity primary key,
 review_id bigint not null references public.miyar_reviews(id) on delete restrict,
 account_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 reason text not null check(reason in ('abuse','personal','irrelevant')),
 details text not null default '' check(char_length(details)<=600),
 status text not null default 'pending' check(status in ('pending','resolved','dismissed')),
 created_at timestamptz not null default now(),
 unique(account_id,review_id)
);
alter table public.miyar_review_edits enable row level security;
alter table public.miyar_reports enable row level security;
revoke all on public.miyar_review_edits,public.miyar_reports from public,anon,authenticated;
grant all on public.miyar_review_edits,public.miyar_reports to service_role;
grant usage,select on sequence public.miyar_review_edits_id_seq,public.miyar_reports_id_seq to service_role;
create index miyar_pending_edits on public.miyar_review_edits(status,created_at);
create index miyar_pending_reports on public.miyar_reports(status,created_at);
create index miyar_latest_publications on public.miyar_reviews(doctor_id,published_at desc) where status='published';

create function public.miyar_community_account(p_account uuid) returns bigint language plpgsql security invoker set search_path=public as $$
declare u bigint; s text;
begin
 select university_id,status into u,s from miyar_accounts where auth_id=p_account for update;
 if s is distinct from 'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if u is null then raise exception 'UNIVERSITY_REQUIRED'; end if;
 return u;
end; $$;
create function public.miyar_request_doctor(p_account uuid,p_major bigint,p_name text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare u bigint; d bigint; state text;
begin
 u=miyar_community_account(p_account);
 if not exists(select 1 from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.id=p_major and c.university_id=u) then raise exception 'INVALID_MAJOR'; end if;
 select id,status into d,state from miyar_doctors where major_id=p_major and name=p_name;
 if d is not null then return jsonb_build_object('id',d,'existing',true,'status',state); end if;
 if (select count(*) from miyar_doctors where submitted_by_account=p_account and created_at>now()-interval '24 hours')>=5 then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_doctors(major_id,name,submitted_by_account) values(p_major,p_name,p_account) returning id into d;
 return jsonb_build_object('id',d,'status','pending','existing',false);
end; $$;
create function public.miyar_request_edit(p_account uuid,p_review bigint,p_subject text,p_comment text,p_explanation int,p_treatment int,p_grading int) returns jsonb language plpgsql security invoker set search_path=public as $$
declare u bigint; result bigint;
begin
 u=miyar_community_account(p_account);
 perform 1 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where r.id=p_review and r.account_id=p_account and r.status='published' and d.status='approved' and c.university_id=u;
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 if exists(select 1 from miyar_review_edits where review_id=p_review and status='pending') then raise exception 'PENDING_EDIT'; end if;
 if (select count(*) from miyar_review_edits where account_id=p_account and created_at>now()-interval '24 hours')>=5 then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_review_edits(review_id,account_id,subject,comment,explanation,treatment,grading) values(p_review,p_account,p_subject,p_comment,p_explanation,p_treatment,p_grading) returning id into result;
 return jsonb_build_object('id',result,'status','pending');
end; $$;
create function public.miyar_submit_report(p_account uuid,p_review bigint,p_reason text,p_details text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare u bigint; result bigint;
begin
 u=miyar_community_account(p_account);
 if not exists(select 1 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where r.id=p_review and r.status='published' and d.status='approved' and c.university_id=u) then raise exception 'REVIEW_UNAVAILABLE'; end if;
 if exists(select 1 from miyar_reports where review_id=p_review and account_id=p_account) then raise exception 'ALREADY_REPORTED'; end if;
 if (select count(*) from miyar_reports where account_id=p_account and created_at>now()-interval '24 hours')>=10 then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_reports(review_id,account_id,reason,details) values(p_review,p_account,p_reason,p_details) returning id into result;
 return jsonb_build_object('id',result,'status','pending');
end; $$;
create function public.miyar_moderate_edit(p_id bigint,p_approve boolean) returns void language plpgsql security invoker set search_path=public as $$
declare e miyar_review_edits%rowtype; r miyar_reviews%rowtype;
begin
 select * into e from miyar_review_edits where id=p_id and status='pending';
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 select * into r from miyar_reviews where id=e.review_id for update;
 select * into e from miyar_review_edits where id=p_id and status='pending' for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_approve then
  if r.status<>'published' or r.account_id is distinct from e.account_id or not exists(select 1 from miyar_doctors where id=r.doctor_id and status='approved') then raise exception 'REVIEW_UNAVAILABLE'; end if;
  update miyar_reviews set subject=e.subject,comment=e.comment,explanation=e.explanation,treatment=e.treatment,grading=e.grading where id=r.id;
 end if;
 update miyar_review_edits set status=case when p_approve then 'approved' else 'rejected' end where id=p_id;
end; $$;
create function public.miyar_moderate_report(p_id bigint,p_remove boolean) returns void language plpgsql security invoker set search_path=public as $$
declare target bigint;
begin
 select review_id into target from miyar_reports where id=p_id and status='pending' for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if p_remove then
  update miyar_reviews set status='rejected' where id=target;
  update miyar_review_edits set status='rejected' where review_id=target and status='pending';
 end if;
 update miyar_reports set status=case when p_remove then 'resolved' else 'dismissed' end where id=p_id;
end; $$;
create function public.miyar_my_reviews(p_account uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select r.id,r.doctor_id,d.name as doctor_name,r.subject,r.comment,r.explanation,r.treatment,r.grading,r.status,r.created_at,
 (select e.status from miyar_review_edits e where e.review_id=r.id order by e.id desc limit 1) as edit_status
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.account_id=p_account and c.university_id=(select university_id from miyar_accounts where auth_id=p_account) order by r.created_at desc limit 100
 ) x;
$$;
create function public.miyar_saved_updates(p_university bigint,p_doctors bigint[]) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.published_at desc),'[]'::jsonb) from (
 select r.id as review_id,d.id as doctor_id,d.name as doctor_name,r.published_at
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where d.id=any(p_doctors) and c.university_id=p_university and r.status='published' and d.status='approved' and r.published_at>now()-interval '90 days'
 order by r.published_at desc,r.id desc limit 100
 ) x;
$$;
create function public.miyar_community_queue() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'edits',coalesce((select jsonb_agg(x order by x.created_at) from (
 select e.id,e.review_id,e.subject,e.comment,e.explanation,e.treatment,e.grading,e.created_at,d.name as doctor_name,r.subject as old_subject,r.comment as old_comment,r.explanation as old_explanation,r.treatment as old_treatment,r.grading as old_grading
 from miyar_review_edits e join miyar_reviews r on r.id=e.review_id join miyar_doctors d on d.id=r.doctor_id where e.status='pending' order by e.created_at limit 100) x),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(x order by x.created_at) from (
 select p.id,p.review_id,p.reason,p.details,p.created_at,d.name as doctor_name,r.subject,r.comment
 from miyar_reports p join miyar_reviews r on r.id=p.review_id join miyar_doctors d on d.id=r.doctor_id where p.status='pending' order by p.created_at limit 100) x),'[]'::jsonb)
 );
$$;
-- These functions are usable only by the server; authenticated browser roles cannot invoke moderation.
revoke execute on function public.miyar_publication_time(),public.miyar_community_account(uuid),public.miyar_request_doctor(uuid,bigint,text),public.miyar_request_edit(uuid,bigint,text,text,int,int,int),public.miyar_submit_report(uuid,bigint,text,text),public.miyar_moderate_edit(bigint,boolean),public.miyar_moderate_report(bigint,boolean),public.miyar_my_reviews(uuid),public.miyar_saved_updates(bigint,bigint[]),public.miyar_community_queue() from public,anon,authenticated;
grant execute on function public.miyar_publication_time(),public.miyar_community_account(uuid),public.miyar_request_doctor(uuid,bigint,text),public.miyar_request_edit(uuid,bigint,text,text,int,int,int),public.miyar_submit_report(uuid,bigint,text,text),public.miyar_moderate_edit(bigint,boolean),public.miyar_moderate_report(bigint,boolean),public.miyar_my_reviews(uuid),public.miyar_saved_updates(bigint,bigint[]),public.miyar_community_queue() to service_role;
commit;
