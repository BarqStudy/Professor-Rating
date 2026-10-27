import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {guestTokenHash} from '../supabase/functions/miyar/guest.js';
import {ApiError} from '../supabase/functions/miyar/security.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',guest='33333333-3333-4333-8333-333333333333';

test('actual service-role HTTP requests create, reuse, approve and reject unreviewed doctors without SMTP or public reviews',async()=>{
 const sql=new PGlite();try{
 await sql.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
 const directory=new URL('../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort())await sql.exec(await readFile(new URL(name,directory),'utf8'));
 for(const id of [admin,student]){await sql.query('insert into auth.users values($1,$2)',[id,id+'@example.test']);await sql.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
 const token='ab'.repeat(32);await sql.query('insert into miyar_guest_sessions(id,token_hash,university_id) values($1,$2,3)',[guest,await guestTokenHash(token)]);
 await sql.exec('set role service_role');
 const paths=[];
 const db=async(path,{body}={})=>{
  paths.push(path);
  if(path.startsWith('miyar_accounts?'))return(await sql.query('select * from miyar_accounts where auth_id=$1',[path.match(/auth_id=eq\.([^&]+)/)[1]])).rows;
  if(path.startsWith('miyar_guest_sessions?'))return(await sql.query('select id,university_id,status from miyar_guest_sessions where token_hash=$1',[path.match(/token_hash=eq\.([^&]+)/)[1]])).rows;
  assert.match(path,/^rpc\/miyar_[a-z_]+$/);const args=Object.entries(body||{});
  return(await sql.query(`select public.${path.slice(4)}(${args.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) data`,args.map(([,value])=>value))).rows[0].data;
 };
 const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async request=>{const actor=request.headers.get('authorization')?.slice(7);if(![admin,student].includes(actor))throw new ApiError(401,'unauthorized');return{id:actor};}});
 const send=(body,actor=student)=>handle(new Request('https://test',{method:'POST',headers:actor===guest?{'x-miyar-guest':token}:{authorization:'Bearer '+actor},body:JSON.stringify(body)}));
 const ids=[];
 for(const [i,actor]of [student,guest,student,guest].entries()){
  const payload={action:actor===guest?'guest.doctor.request':'doctor.request',name:`مهندس أحمد محمد العتيبي ${i}`,majorId:1,...(i>1?{courseId:'najran-ce-2025/ge101'}:{})};
  const response=await send(payload,actor);assert.equal(response.status,201);const result=await response.json();assert.equal(result.status,'pending');ids.push(result.id);
  assert.equal((await send({...payload,accountId:admin},actor)).status,201);assert.equal((await sql.query('select count(*)::int n from miyar_reviews')).rows[0].n,0);
  const record=(await sql.query('select submitted_by_account,submitted_by_guest,requested_course from miyar_doctors where id=$1',[result.id])).rows[0];assert.equal(record.submitted_by_account,actor===student?student:null);assert.equal(record.submitted_by_guest,actor===guest?guest:null);assert.equal(record.requested_course,i>1?'najran-ce-2025/ge101':null);
  const operation=i<2?'doctor.approve':'doctor.reject';assert.equal((await send({action:'admin',operation,id:result.id,reason:i<2?'':'بيانات غير دقيقة'},admin)).status,200);
 }
 const catalogue=await db('rpc/miyar_catalogue',{body:{}});assert.equal(catalogue.doctors.length,2);assert.ok(catalogue.doctors.every(d=>d.count===0));assert.equal((await sql.query('select count(*)::int n from miyar_reviews')).rows[0].n,0);assert.equal((await sql.query("select count(*)::int n from miyar_doctors where status='rejected'")).rows[0].n,2);
 assert.equal(paths.some(path=>path.includes('institution_mail')),false);
 }finally{await sql.close();}
});

test('optional university request or mail lookup failures cannot disable the protected doctor moderation inbox',async()=>{
 for(const failure of ['institution','mail',null]){
  const paths=[];
  const db=async(path)=>{paths.push(path);if(path.startsWith('miyar_accounts?'))return[{status:'active',university_id:3}];if(path.startsWith('miyar_doctors?'))return[{id:9,name:'مهندس أحمد محمد العتيبي',major_id:1,submitted_by_guest:guest}];if(path.startsWith('miyar_reviews?'))return[];if(path==='rpc/miyar_community_queue')return{edits:[],reports:[]};if(path.startsWith('miyar_institution_requests?')){if(failure==='institution')throw new Error('private SQL details');return[{id:7,name:'جامعة نجران',colleges:[],request_kind:'university'}];}if(path.startsWith('miyar_institution_mail?')){if(failure==='mail')throw new Error('private SQL details');return[{request_id:7,status:'sent'}];}return[];};
  const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:admin})});const response=await handle(new Request('https://test',{method:'POST',headers:{authorization:'Bearer verified'},body:JSON.stringify({action:'admin',operation:'queue'})}));
  assert.equal(response.status,200);const queue=await response.json();assert.equal(queue.doctors[0].id,9);assert.equal(queue.institutionMail.configured,false);assert.ok(!JSON.stringify(queue).includes('private SQL details'));
  assert.ok(paths.every(path=>!path.includes('created_at,miyar_institution_mail(')),'no PostgREST embedded relationship is required');
  if(failure==='institution'){assert.ok(queue.institutionRequestsError);assert.deepEqual(queue.institutionRequests,[]);}else if(failure==='mail'){assert.equal(queue.institutionRequests.length,1);assert.ok(queue.institutionMail.deliveryError);}else{assert.equal(queue.institutionRequests[0].miyar_institution_mail.status,'sent');}
 }
 const denied=createHandler({db:()=>assert.fail('public callers must not read the inbox'),env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>{throw new ApiError(401,'unauthorized');}});assert.equal((await denied(new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',operation:'queue'})}))).status,401);
});
