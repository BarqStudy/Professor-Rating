begin;
-- Only metadata lives in PostgreSQL; file bytes live in a private R2 bucket.
create table public.miyar_files(
 id uuid primary key,
 uploaded_by uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 name text not null check(char_length(name) between 1 and 120),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size bigint not null check(byte_size between 1 and 20971520),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 object_key text not null unique check(object_key~'^miyar/(files|study)/[a-f0-9-]{36}/[a-f0-9]{64}\.(pdf|png|jpg)$'),
 purpose text not null check(purpose in ('files','study')),
 status text not null default 'uploading' check(status in ('uploading','ready','failed')),
 etag text not null default '' check(char_length(etag)<=256),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index miyar_file_upload_rate on public.miyar_files(uploaded_by,created_at desc);
alter table public.miyar_files enable row level security;
revoke all on public.miyar_files from public,anon,authenticated;
grant all on public.miyar_files to service_role;
create function public.miyar_begin_file_upload(p_id uuid,p_actor uuid,p_name text,p_mime text,p_size bigint,p_sha256 text,p_purpose text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare existing miyar_files%rowtype; extension text; object_path text;
begin
 perform 1 from miyar_accounts where auth_id=p_actor and status='active' for update;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_id is null or p_name is null or char_length(p_name) not between 1 and 120 or p_name~'[[:cntrl:]/\\]'
 or p_mime is null or p_mime not in ('application/pdf','image/png','image/jpeg') or p_size is null or p_size not between 1 and 20971520
 or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' or p_purpose is null or p_purpose not in ('files','study') then raise exception 'INVALID_FILE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('r2-file:'||p_id::text,0));
 select * into existing from miyar_files where id=p_id for update;
 if found then
  if existing.uploaded_by<>p_actor or existing.name<>p_name or existing.mime_type<>p_mime or existing.byte_size<>p_size or existing.sha256<>p_sha256 or existing.purpose<>p_purpose then raise exception 'FILE_UPLOAD_CONFLICT'; end if;
  if existing.status='failed' then update miyar_files set status='uploading',updated_at=now() where id=p_id returning * into existing; end if;
  return to_jsonb(existing);
 end if;
 if (select count(*) from miyar_files where uploaded_by=p_actor and created_at>now()-interval '24 hours')>=20 then raise exception 'FILE_UPLOAD_RATE'; end if;
 extension=case p_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' else 'jpg' end;
 object_path='miyar/'||p_purpose||'/'||p_id::text||'/'||p_sha256||'.'||extension;
 insert into miyar_files(id,uploaded_by,name,mime_type,byte_size,sha256,object_key,purpose) values(p_id,p_actor,p_name,p_mime,p_size,p_sha256,object_path,p_purpose) returning * into existing;
 return to_jsonb(existing);
end; $$;
create function public.miyar_finish_file_upload(p_id uuid,p_actor uuid,p_etag text) returns void language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_actor and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 update miyar_files set status='ready',etag=p_etag,updated_at=now() where id=p_id and uploaded_by=p_actor;
 if not found then raise exception 'INVALID_FILE'; end if;
end; $$;
create function public.miyar_fail_file_upload(p_id uuid,p_actor uuid) returns void language plpgsql security invoker set search_path=public as $$
begin
 update miyar_files set status='failed',updated_at=now() where id=p_id and uploaded_by=p_actor and status<>'ready';
end; $$;
alter table public.miyar_study_plans add column source_file_id uuid references public.miyar_files(id) on delete restrict;
-- Preserve the existing publication transaction and validation, and add a private original-file association.
alter function public.miyar_publish_study_plan(uuid,bigint,jsonb) rename to miyar_publish_study_plan_data;
create function public.miyar_publish_study_plan(p_admin uuid,p_major bigint,p_plan jsonb,p_file uuid default null) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; prior uuid;
begin
 if p_file is not null and not exists(select 1 from miyar_files where id=p_file and uploaded_by=p_admin and status='ready' and purpose='study' and sha256=p_plan->>'sha256') then raise exception 'INVALID_FILE'; end if;
 result=miyar_publish_study_plan_data(p_admin,p_major,p_plan);
 if p_file is not null then
  select source_file_id into prior from miyar_study_plans where id=p_plan->>'id' for update;
  if prior is not null and prior<>p_file then raise exception 'FILE_UPLOAD_CONFLICT'; end if;
  update miyar_study_plans set source_file_id=p_file where id=p_plan->>'id';
 end if;
 return result;
end; $$;
revoke execute on function public.miyar_begin_file_upload(uuid,uuid,text,text,bigint,text,text),public.miyar_finish_file_upload(uuid,uuid,text),public.miyar_fail_file_upload(uuid,uuid),public.miyar_publish_study_plan(uuid,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.miyar_begin_file_upload(uuid,uuid,text,text,bigint,text,text),public.miyar_finish_file_upload(uuid,uuid,text),public.miyar_fail_file_upload(uuid,uuid),public.miyar_publish_study_plan(uuid,bigint,jsonb,uuid) to service_role;
commit;
