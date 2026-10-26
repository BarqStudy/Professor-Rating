begin;
-- Retain all historical reviews. New submissions are unique per doctor/identity,
-- across every screen, course spelling and moderation status.
create table public.miyar_review_identities(
 guest_id uuid primary key references public.miyar_guest_sessions(id) on delete restrict,
 account_id uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 created_at timestamptz not null default now()
);
create index miyar_review_identity_account on public.miyar_review_identities(account_id);
alter table public.miyar_review_identities enable row level security;
revoke all on public.miyar_review_identities from public,anon,authenticated;
grant all on public.miyar_review_identities to service_role;

create function public.miyar_link_review_identity(p_account uuid,p_guest uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from miyar_accounts where auth_id=p_account and status='active' for update;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 perform 1 from miyar_guest_sessions where id=p_guest and status='active' for update;
 if not found then return jsonb_build_object('linked',false); end if;
 insert into miyar_review_identities(guest_id,account_id) values(p_guest,p_account) on conflict(guest_id) do nothing;
 return jsonb_build_object('linked',exists(select 1 from miyar_review_identities where guest_id=p_guest and account_id=p_account));
end; $$;

create function public.miyar_one_review_per_doctor() returns trigger
language plpgsql security invoker set search_path=public as $$
declare owner_account uuid;
begin
 owner_account=new.account_id;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=new.guest_id; end if;
 perform pg_advisory_xact_lock(hashtextextended('miyar-review:'||coalesce(owner_account::text,'guest:'||new.guest_id::text)||':'||new.doctor_id::text,0));
 if exists(select 1 from miyar_reviews r where r.doctor_id=new.doctor_id and (
   (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account)))
   or (new.guest_id is not null and r.guest_id=new.guest_id)
 )) then raise exception 'REVIEW_ALREADY_EXISTS'; end if;
 return new;
end; $$;
create trigger miyar_single_review before insert on public.miyar_reviews for each row execute function public.miyar_one_review_per_doctor();

create function public.miyar_review_eligibility(p_account uuid,p_guest uuid,p_doctor bigint) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare owner_account uuid; university bigint; previous record;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then
  select university_id into university from miyar_accounts where auth_id=p_account and status='active';
 else select university_id into university from miyar_guest_sessions where id=p_guest and status='active'; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if not exists(select 1 from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id where d.id=p_doctor and d.status='approved' and c.university_id=university) then raise exception 'DOCTOR_UNAVAILABLE'; end if;
 owner_account=p_account;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=p_guest; end if;
 select r.id,r.status,r.account_id into previous from miyar_reviews r where r.doctor_id=p_doctor and (
  (owner_account is not null and (r.account_id=owner_account or r.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or r.guest_id=p_guest
 ) order by r.created_at desc limit 1;
 if found then return jsonb_build_object('eligible',false,'status',previous.status,'canEdit',p_account is not null and previous.account_id=p_account and previous.status='published'); end if;
 return jsonb_build_object('eligible',true);
end; $$;
revoke execute on function public.miyar_link_review_identity(uuid,uuid),public.miyar_one_review_per_doctor(),public.miyar_review_eligibility(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.miyar_link_review_identity(uuid,uuid),public.miyar_one_review_per_doctor(),public.miyar_review_eligibility(uuid,uuid,bigint) to service_role;
commit;
