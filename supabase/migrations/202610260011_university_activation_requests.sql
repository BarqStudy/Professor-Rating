begin;
alter table public.miyar_universities add column enabled boolean not null default false;
update public.miyar_universities set enabled=true where name='جامعة نجران';
insert into public.miyar_universities(name,city) values
 ('جامعة حائل','حائل'),
 ('جامعة الإمام محمد بن سعود الإسلامية','الرياض'),
 ('جامعة الملك سعود بن عبدالعزيز للعلوم الصحية','الرياض'),
 ('جامعة الملك سعود','الرياض'),
 ('جامعة المجمعة','المجمعة'),
 ('جامعة الأميرة نورة بنت عبدالرحمن','الرياض'),
 ('جامعة الأمير سطام بن عبدالعزيز','الخرج'),
 ('جامعة القصيم','القصيم'),
 ('الجامعة السعودية الإلكترونية','الرياض'),
 ('جامعة شقراء','شقراء'),
 ('جامعة حفر الباطن','حفر الباطن'),
 ('جامعة الإمام عبدالرحمن بن فيصل','الدمام'),
 ('جامعة الملك فهد للبترول والمعادن','الظهران'),
 ('جامعة الملك فيصل','الأحساء'),
 ('جامعة الجوف','سكاكا'),
 ('جامعة الحدود الشمالية','عرعر'),
 ('جامعة تبوك','تبوك'),
 ('جامعة الباحة','الباحة'),
 ('جامعة بيشة','بيشة'),
 ('جامعة جازان','جازان'),
 ('جامعة الملك خالد','أبها'),
 ('جامعة نجران','نجران'),
 ('الجامعة الإسلامية','المدينة المنورة'),
 ('جامعة جدة','جدة'),
 ('جامعة الملك عبدالعزيز','جدة'),
 ('جامعة طيبة','المدينة المنورة'),
 ('جامعة الطائف','الطائف'),
 ('جامعة أم القرى','مكة المكرمة')
on conflict(name) do nothing;

create function public.miyar_choose_university(p_account uuid,p_guest uuid,p_university bigint) returns jsonb
language plpgsql security invoker set search_path=public as $$
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 perform 1 from miyar_universities where id=p_university and enabled for share;
 if not found then raise exception 'UNIVERSITY_INACTIVE'; end if;
 if p_account is not null then
  update miyar_accounts set university_id=p_university,major_id=null where auth_id=p_account and status='active';
 else update miyar_guest_sessions set university_id=p_university where id=p_guest and status='active'; end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 return jsonb_build_object('university_id',p_university);
end; $$;

create function public.miyar_set_university_enabled(p_id bigint,p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path=public as $$
begin
 if p_enabled is null then raise exception 'INVALID_UNIVERSITY'; end if;
 update miyar_universities set enabled=p_enabled where id=p_id;
 if not found then raise exception 'UNIVERSITY_NOT_FOUND'; end if;
 return jsonb_build_object('ok',true);
end; $$;

-- The email is private contact information for the request, never catalogue data.
alter table public.miyar_institution_requests add column contact_email text check(contact_email is null or char_length(contact_email) between 3 and 254);
alter table public.miyar_institution_requests add column request_kind text not null default 'college' check(request_kind in ('university','college'));
alter table public.miyar_institution_requests drop constraint miyar_institution_requests_colleges_check;
alter table public.miyar_institution_requests add constraint miyar_institution_requests_colleges_check check(jsonb_typeof(colleges)='array' and jsonb_array_length(colleges) between 0 and 5);

create or replace function public.miyar_request_institution(p_account uuid,p_guest uuid,p_university bigint,p_name text,p_colleges jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_name text; v_id bigint; c jsonb; m jsonb;
begin
 if (p_account is null)=(p_guest is null) then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_account is not null then
  perform 1 from miyar_accounts where auth_id=p_account and status='active' for update;
 else perform 1 from miyar_guest_sessions where id=p_guest and status='active' for update;
 end if;
 if not found then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_university is not null then select name into v_name from miyar_universities where id=p_university; if not found then raise exception 'UNIVERSITY_REQUIRED'; end if;
 else v_name=trim(p_name); end if;
 if v_name is null or char_length(v_name) not between 2 and 100 or jsonb_typeof(p_colleges) is distinct from 'array' then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 if jsonb_array_length(p_colleges) not between 0 and 5 then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 for c in select value from jsonb_array_elements(p_colleges) loop
  if jsonb_typeof(c) is distinct from 'object' or not(c?&array['name','majors']) or char_length(trim(c->>'name')) not between 2 and 100 or jsonb_typeof(c->'name') is distinct from 'string' or jsonb_typeof(c->'majors') is distinct from 'array' then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
  if jsonb_array_length(c->'majors')>10 then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
  for m in select value from jsonb_array_elements(c->'majors') loop
   if jsonb_typeof(m) is distinct from 'string' or char_length(trim(m#>>'{}')) not between 2 and 100 then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_colleges) item group by item.value->>'name' having count(*)>1) then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 select id into v_id from miyar_institution_requests where (account_id=p_account or guest_id=p_guest) and name=v_name and colleges=p_colleges and status='pending';
 if found then return jsonb_build_object('id',v_id,'existing',true,'status','pending'); end if;
 if (select count(*) from miyar_institution_requests where (account_id=p_account or guest_id=p_guest) and created_at>now()-interval '24 hours')>=3 then raise exception 'RATE_LIMIT'; end if;
 insert into miyar_institution_requests(account_id,guest_id,university_id,name,colleges) values(p_account,p_guest,p_university,v_name,p_colleges) returning id into v_id;
 return jsonb_build_object('id',v_id,'existing',false,'status','pending');
end; $$;

create function public.miyar_request_institution_contact(p_account uuid,p_guest uuid,p_university bigint,p_name text,p_colleges jsonb,p_kind text,p_email text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_kind is null or p_kind not in ('university','college') or p_email is null or char_length(trim(p_email)) not between 3 and 254 or trim(p_email)!~'^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$' then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 if p_kind='college' and (p_university is null or jsonb_array_length(p_colleges)<1) then raise exception 'INVALID_INSTITUTION_REQUEST'; end if;
 result=miyar_request_institution(p_account,p_guest,p_university,p_name,p_colleges);
 update miyar_institution_requests set contact_email=lower(trim(p_email)),request_kind=p_kind where id=(result->>'id')::bigint;
 return result;
end; $$;
create function public.miyar_review_active_university() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from miyar_doctors d join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id where d.id=new.doctor_id and u.enabled) then raise exception 'UNIVERSITY_INACTIVE'; end if;
 return new;
end; $$;
create trigger miyar_review_university_active before insert on miyar_reviews for each row execute function miyar_review_active_university();
revoke execute on function public.miyar_choose_university(uuid,uuid,bigint),public.miyar_set_university_enabled(bigint,boolean),public.miyar_request_institution_contact(uuid,uuid,bigint,text,jsonb,text,text),public.miyar_review_active_university() from public,anon,authenticated;
grant execute on function public.miyar_choose_university(uuid,uuid,bigint),public.miyar_set_university_enabled(bigint,boolean),public.miyar_request_institution_contact(uuid,uuid,bigint,text,jsonb,text,text),public.miyar_review_active_university() to service_role;
commit;
