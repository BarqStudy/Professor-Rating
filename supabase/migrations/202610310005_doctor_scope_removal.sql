begin;
-- Re-addition restores the same archived identity and its existing review links.
create function public.miyar_admin_add_doctor(p_major bigint,p_name text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare doctor bigint; state text;
begin
 if p_name is null or char_length(p_name) not between 8 and 100 or array_length(regexp_split_to_array(btrim(p_name),'\s+'),1)<3 then raise exception 'INVALID_NAME'; end if;
 if not exists(select 1 from miyar_majors m join miyar_colleges c on c.id=m.college_id where m.id=p_major and m.deleted_at is null) then raise exception 'INVALID_MAJOR'; end if;
 insert into miyar_doctors(major_id,name,status) values(p_major,p_name,'approved') on conflict(major_id,name) do nothing returning id into doctor;
 if found then return jsonb_build_object('id',doctor,'restored',false); end if;
 select id,status into doctor,state from miyar_doctors where major_id=p_major and name=p_name for update;
 if state is distinct from 'archived' then raise exception 'DOCTOR_ALREADY_EXISTS'; end if;
 update miyar_doctors set status='approved' where id=doctor;
 return jsonb_build_object('id',doctor,'restored',true);
end; $$;

-- The reviewed ID set is locked and checked again before applying the scope.
-- Explicit captured IDs exclude professors added after this transaction's snapshot.
create function public.miyar_doctor_scope_removal(p_admin uuid,p_scope text,p_id bigint,p_confirm boolean,p_fingerprint text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target_name text; college text; university text; ids bigint[]; fingerprint text; sample jsonb;
begin
 if not exists(select 1 from miyar_accounts where auth_id=p_admin and status='active') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_scope is null or p_scope not in ('college','major') or p_id is null or p_id<=0 or p_confirm is null then raise exception 'INVALID_DOCTOR_SCOPE'; end if;
 if p_scope='college' then
  select c.name,c.name,u.name into target_name,college,university from miyar_colleges c join miyar_universities u on u.id=c.university_id where c.id=p_id;
 else
  select m.name,c.name,u.name into target_name,college,university from miyar_majors m join miyar_colleges c on c.id=m.college_id join miyar_universities u on u.id=c.university_id where m.id=p_id and m.deleted_at is null;
 end if;
 if not found then raise exception 'INVALID_DOCTOR_SCOPE'; end if;
 select coalesce(array_agg(id order by id),'{}'::bigint[]) into ids from (
  select d.id from miyar_doctors d join miyar_majors m on m.id=d.major_id
  where d.status='approved' and m.deleted_at is null and (case when p_scope='major' then m.id=p_id else m.college_id=p_id end)
  order by d.id for update of d
 ) locked;
 fingerprint=md5(p_scope||':'||p_id::text||':'||target_name||':'||college||':'||university||':'||array_to_string(ids,','));
 if p_confirm then
  if p_fingerprint is null or p_fingerprint is distinct from fingerprint then raise exception 'DOCTOR_SCOPE_CHANGED'; end if;
  update miyar_doctors set status='archived' where id=any(ids);
  return jsonb_build_object('updated',cardinality(ids));
 end if;
 select coalesce(jsonb_agg(x order by x.id),'[]'::jsonb) into sample from (select id,name from miyar_doctors where id=any(ids) order by id limit 8) x;
 return jsonb_build_object('scope',p_scope,'id',p_id,'name',target_name,'college',college,'university',university,'count',cardinality(ids),'sample',sample,'fingerprint',fingerprint);
end; $$;
revoke execute on function public.miyar_admin_add_doctor(bigint,text),public.miyar_doctor_scope_removal(uuid,text,bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.miyar_admin_add_doctor(bigint,text),public.miyar_doctor_scope_removal(uuid,text,bigint,boolean,text) to service_role;
commit;
