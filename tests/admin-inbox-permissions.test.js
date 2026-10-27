import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {ApiError} from '../supabase/functions/miyar/security.js';

const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
const fix='202610280001_assistant_list_permissions.sql';

test('restricted service-role admin inbox reproduces auth.users denial, then loads requests and retries mail without granting auth access',async()=>{
 const sql=new PGlite();
 try{
  // Supabase grants schema usage but no direct auth.users SELECT to service_role.
  await sql.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);grant usage on schema auth to service_role;');
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')&&name!==fix).sort())await sql.exec(await readFile(new URL(name,directory),'utf8'));
  for(const [id,email]of [[admin,'admin@example.test'],[student,'student@example.test']]){
   await sql.query('insert into auth.users values($1,$2)',[id,email]);
   await sql.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);
  }
  const rpc=async(name,body={})=>{
   const args=Object.entries(body);
   return (await sql.query(`select public.${name}(${args.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) data`,args.map(([,value])=>value))).rows[0].data;
  };
  const request=await rpc('miyar_request_institution_contact',{p_account:student,p_guest:null,p_university:3,p_name:null,p_colleges:JSON.stringify([{name:'كلية العلوم',majors:[]}]),p_kind:'college',p_email:'requester@example.test'});
  await rpc('miyar_set_assistant',{p_actor:admin,p_email:'student@example.test',p_college:1,p_active:true});
  await sql.exec('set role service_role');
  await assert.rejects(sql.query('select id,email from auth.users'),error=>error.code==='42501');
  await assert.rejects(rpc('miyar_assistant_list'),error=>error.code==='42501'&&/permission denied for table users/.test(error.message));

  // Exercise the actual protected HTTP queue, not mocked staff list responses.
  const queryDb=async(path,{body}={})=>{
   if(path.startsWith('miyar_accounts?'))return(await sql.query('select * from public.miyar_accounts where auth_id=$1',[path.match(/auth_id=eq\.([^&]+)/)[1]])).rows;
   const queries={
    miyar_doctors:"select id,name,major_id,submitted_by_account,submitted_by_guest,requested_course,created_at from public.miyar_doctors where status='pending'",
    miyar_reviews:"select id,doctor_id,account_id,guest_id,subject,comment,tags,explanation,treatment,grading,created_at from public.miyar_reviews where status='pending'",
    miyar_institution_requests:"select id,name,colleges,contact_email,request_kind,account_id,guest_id,created_at from public.miyar_institution_requests where status='pending'",
    miyar_institution_mail:'select request_id,status,attempts,last_error,sent_at,retry_after from public.miyar_institution_mail',
   };
   if(path.includes('?')){const name=path.split('?')[0];assert.ok(queries[name],path);return(await sql.query(queries[name])).rows;}
   assert.match(path,/^rpc\/miyar_[a-z_]+$/);return rpc(path.slice(4),body);
  };
  const db=async(...args)=>{
   try{return await queryDb(...args);}
   catch(error){if(error.code==='42501')throw new ApiError(502,'تعذّر تنفيذ العملية في قاعدة البيانات. حاول مجددًا.');throw error;}
  };
  let actor=admin,sends=0;
  const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin,RESEND_API_KEY:'re_test-private',RESEND_FROM_EMAIL:'onboarding@resend.dev',INSTITUTION_NOTIFICATION_EMAIL:'owner@gmail.com'},authenticate:async()=>({id:actor}),mailFetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.deepEqual(JSON.parse(options.body).to,['owner@gmail.com']);sends++;return Response.json({id:'email-accepted'});}});
  const send=operation=>handle(new Request('https://test',{method:'POST',headers:{authorization:'Bearer verified'},body:JSON.stringify({action:'admin',operation,id:request.id})}));
  const failed=await send('queue');assert.equal(failed.status,502);assert.equal((await failed.json()).error,'تعذّر تنفيذ العملية في قاعدة البيانات. حاول مجددًا.');

  await sql.exec('reset role');await sql.exec(await readFile(new URL(fix,directory),'utf8'));await sql.exec('set role service_role');
  await assert.rejects(sql.query('select id,email from auth.users'),error=>error.code==='42501');
  const response=await send('queue');assert.equal(response.status,200);const queue=await response.json();
  assert.equal(queue.assistants[0].email,'student@example.test');assert.equal(queue.institutionRequests[0].id,request.id);assert.equal(queue.institutionRequests[0].miyar_institution_mail.status,'pending');assert.equal(queue.institutionRequestsError,undefined);
  assert.equal((await send('institution.mail.retry')).status,200);assert.equal(sends,1);
  assert.equal((await (await send('queue')).json()).institutionRequests[0].miyar_institution_mail.status,'sent');
  const catalogue=JSON.stringify(await rpc('miyar_catalogue'));assert.ok(!catalogue.includes('student@example.test'));assert.ok(!catalogue.includes('owner@gmail.com'));

  actor=student;assert.equal((await send('queue')).status,403);assert.equal((await send('institution.mail.retry')).status,403);assert.equal(sends,1);
  for(const role of ['anon','authenticated']){
   await sql.exec('reset role');await sql.exec('set role '+role);
   await assert.rejects(rpc('miyar_assistant_list'),error=>error.code==='42501');
   await assert.rejects(sql.query('select * from public.miyar_assistants'),error=>error.code==='42501');
   await assert.rejects(sql.query('select * from auth.users'),error=>error.code==='42501');
  }
 }finally{await sql.close();}
});
