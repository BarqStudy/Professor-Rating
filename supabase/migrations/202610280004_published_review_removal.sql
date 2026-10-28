begin;
create table public.miyar_review_removals (
 review_id bigint primary key references public.miyar_reviews(id) on delete restrict,
 removed_by uuid not null references public.miyar_accounts(auth_id) on delete restrict,
 reason text not null default '' check(char_length(reason)<=300),
 removed_at timestamptz not null default now()
);
alter table public.miyar_review_removals enable row level security;
revoke all on public.miyar_review_removals from public,anon,authenticated;
grant all on public.miyar_review_removals to service_role;

create function public.miyar_published_review_list(p_university bigint,p_query text,p_before bigint) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; total bigint;
begin
 if char_length(coalesce(p_query,''))>120 or p_university<=0 or p_before<=0 then raise exception 'INVALID_REVIEW_FILTER'; end if;
 select count(*) into total from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id
 where r.status='published' and (p_university is null or c.university_id=p_university)
  and (coalesce(p_query,'')='' or position(miyar_course_key(p_query) in miyar_course_key(d.name||' '||r.subject))>0);
 select coalesce(jsonb_agg(x order by x.id desc),'[]'::jsonb) into result from (
  select r.id,r.doctor_id,d.name as doctor_name,r.subject,r.comment,r.tags,r.created_at,
   jsonb_build_array(r.explanation,r.treatment,r.grading) as scores,u.name as university,c.name as college,m.name as major
  from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id
  where r.status='published' and (p_university is null or c.university_id=p_university) and (p_before is null or r.id<p_before)
   and (coalesce(p_query,'')='' or position(miyar_course_key(p_query) in miyar_course_key(d.name||' '||r.subject))>0)
  order by r.id desc limit 26
 ) x;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(result) with ordinality where ordinality<=25),'[]'::jsonb),
  'total',total,'hasMore',jsonb_array_length(result)>25,'nextCursor',case when jsonb_array_length(result)>25 then (result->24->>'id')::bigint else null end);
end; $$;

create function public.miyar_remove_published_review(p_admin uuid,p_review bigint,p_reason text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare state text; report record; reports bigint[]='{}';
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_reason is null or char_length(p_reason)>300 then raise exception 'INVALID_REVIEW_FILTER'; end if;
 -- Report moderation locks a report before its review; keep that lock order.
 for report in select id from miyar_reports where review_id=p_review and status='pending' order by id for update loop reports=array_append(reports,report.id); end loop;
 select status into state from miyar_reviews where id=p_review for update;
 if not found then raise exception 'REVIEW_UNAVAILABLE'; end if;
 if exists(select 1 from miyar_review_removals where review_id=p_review) then return jsonb_build_object('ok',true,'id',p_review,'alreadyRemoved',true); end if;
 if state<>'published' then raise exception 'REVIEW_UNAVAILABLE'; end if;
 update miyar_reviews set status='rejected' where id=p_review;
 insert into miyar_request_decisions(account_id,kind,request_id,title,status,reason)
  select e.account_id,'edit',e.id,d.name,'rejected','رُفض طلب التعديل لأن التقييم المنشور حُذف بقرار الإدارة.'
  from miyar_review_edits e join miyar_reviews r on r.id=e.review_id join miyar_doctors d on d.id=r.doctor_id
  where e.review_id=p_review and e.status='pending' on conflict(kind,request_id) do nothing;
 update miyar_review_edits set status='rejected' where review_id=p_review and status='pending';
 update miyar_reports set status='resolved' where id=any(reports) and status='pending';
 insert into miyar_review_removals(review_id,removed_by,reason) values(p_review,p_admin,p_reason);
 return jsonb_build_object('ok',true,'id',p_review,'alreadyRemoved',false);
end; $$;
revoke execute on function public.miyar_published_review_list(bigint,text,bigint),public.miyar_remove_published_review(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.miyar_published_review_list(bigint,text,bigint),public.miyar_remove_published_review(uuid,bigint,text) to service_role;
commit;
