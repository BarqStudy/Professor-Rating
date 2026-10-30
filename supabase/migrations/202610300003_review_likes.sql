begin;
create table public.miyar_review_likes (
 id bigint generated always as identity primary key,
 review_id bigint not null references public.miyar_reviews(id) on delete restrict,
 account_id uuid references public.miyar_accounts(auth_id) on delete restrict,
 guest_id uuid references public.miyar_guest_sessions(id) on delete restrict,
 created_at timestamptz not null default now(),
 constraint miyar_like_single_identity check(num_nonnulls(account_id,guest_id)=1)
);
create unique index miyar_like_account on public.miyar_review_likes(review_id,account_id) where account_id is not null;
create unique index miyar_like_guest on public.miyar_review_likes(review_id,guest_id) where guest_id is not null;
alter table public.miyar_review_likes enable row level security;
revoke all on public.miyar_review_likes from public,anon,authenticated;
grant all on public.miyar_review_likes to service_role;
grant usage,select on sequence public.miyar_review_likes_id_seq to service_role;

create function public.miyar_review_like_count(p_review bigint) returns integer
language sql stable security invoker set search_path=public as $$
 select count(distinct coalesce('account:'||coalesce(l.account_id,i.account_id)::text,'guest:'||l.guest_id::text))::integer
 from miyar_review_likes l left join miyar_review_identities i on i.guest_id=l.guest_id
 left join miyar_accounts a on a.auth_id=coalesce(l.account_id,i.account_id)
 left join miyar_guest_sessions g on g.id=l.guest_id
 where l.review_id=p_review and (a.auth_id is null or a.status<>'banned') and (g.id is null or g.status<>'banned');
$$;

create function public.miyar_review_like_states(p_account uuid,p_guest uuid,p_reviews bigint[]) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare university bigint; owner_account uuid;
begin
 if num_nonnulls(p_account,p_guest)<>1 then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_reviews is null or cardinality(p_reviews)>100 then raise exception 'INVALID_REVIEW_LIKES'; end if;
 if p_account is not null then select university_id into university from miyar_accounts where auth_id=p_account and status<>'banned';
 else select university_id into university from miyar_guest_sessions where id=p_guest and status<>'banned'; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 owner_account=p_account;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=p_guest; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('review',r.id,'likes',miyar_review_like_count(r.id),'liked',exists(
  select 1 from miyar_review_likes l where l.review_id=r.id and (
   (owner_account is not null and (l.account_id=owner_account or l.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or l.guest_id=p_guest
  )
 )) order by r.id),'[]'::jsonb)
 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.id=any(p_reviews) and r.status='published' and d.status='approved' and c.university_id=university);
end; $$;

create function public.miyar_set_review_like(p_account uuid,p_guest uuid,p_review bigint,p_liked boolean) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare university bigint; owner_account uuid;
begin
 if num_nonnulls(p_account,p_guest)<>1 then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_liked is null then raise exception 'INVALID_REVIEW_LIKES'; end if;
 if p_account is not null then select university_id into university from miyar_accounts where auth_id=p_account and status='active';
 else select university_id into university from miyar_guest_sessions where id=p_guest and status='active'; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 owner_account=p_account;
 if owner_account is null then select account_id into owner_account from miyar_review_identities where guest_id=p_guest; end if;
 if owner_account is not null and not exists(select 1 from miyar_accounts where auth_id=owner_account and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 -- Serialize writes to the review and hold its publication/doctor state stable.
 perform pg_advisory_xact_lock(hashtextextended('miyar-review-like:'||p_review::text,0));
 perform 1 from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.id=p_review and r.status='published' and d.status='approved' and c.university_id=university for share of r,d;
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 if p_liked then
  if not exists(select 1 from miyar_review_likes l where l.review_id=p_review and (
   (owner_account is not null and (l.account_id=owner_account or l.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or l.guest_id=p_guest
  )) then insert into miyar_review_likes(review_id,account_id,guest_id) values(p_review,p_account,p_guest) on conflict do nothing; end if;
 else
  delete from miyar_review_likes l where l.review_id=p_review and (
   (owner_account is not null and (l.account_id=owner_account or l.guest_id in(select guest_id from miyar_review_identities where account_id=owner_account))) or l.guest_id=p_guest
  );
 end if;
 return jsonb_build_object('review',p_review,'likes',miyar_review_like_count(p_review),'liked',p_liked);
end; $$;

create or replace function public.miyar_public_review(p_review public.miyar_reviews) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('id',p_review.id,'subject',p_review.subject,'comment',p_review.comment,'tags',p_review.tags,
  'scores',jsonb_build_array(p_review.explanation,p_review.treatment,p_review.grading),'date',p_review.created_at,'likes',miyar_review_like_count(p_review.id))
  || case when p_review.public_grade_notice_at is not null then jsonb_build_object('grade',p_review.grade) else '{}'::jsonb end;
$$;
revoke execute on function public.miyar_review_like_count(bigint),public.miyar_review_like_states(uuid,uuid,bigint[]),public.miyar_set_review_like(uuid,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.miyar_review_like_count(bigint),public.miyar_review_like_states(uuid,uuid,bigint[]),public.miyar_set_review_like(uuid,uuid,bigint,boolean) to service_role;
commit;
