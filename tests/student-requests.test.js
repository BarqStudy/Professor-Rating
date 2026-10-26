import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';import {ApiError} from '../supabase/functions/miyar/security.js';
import {createNavigation} from '../src/navigation.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',guest='44444444-4444-4444-8444-444444444444';
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));return db;}

test('university requests require active identities, preserve the catalogue until approval, reuse existing hierarchy and publish decisions privately',async()=>{
 const db=await database();try{
  for(const id of [admin,student]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name) values($1,'طالب')",[id]);}
  await db.query("insert into miyar_guest_sessions(id,token_hash) values($1,$2)",[guest,'a'.repeat(64)]);
  const colleges=[{name:'كلية العلوم',majors:['الفيزياء','الكيمياء']},{name:'كلية الآداب',majors:[]}];
  const before=(await rpc(db,'miyar_catalogue',[])).universities.length;
  const r=await rpc(db,'miyar_request_institution',[student,null,null,'جامعة جديدة',colleges]);assert.equal(r.status,'pending');
  assert.equal((await rpc(db,'miyar_catalogue',[])).universities.length,before);
  assert.equal((await rpc(db,'miyar_my_requests',[student]))[0].kind,'institution');assert.deepEqual(await rpc(db,'miyar_my_requests',[admin]),[]);
  assert.equal((await rpc(db,'miyar_request_institution',[student,null,null,'جامعة جديدة',colleges])).id,r.id);
  await rpc(db,'miyar_decide_institution',[admin,r.id,true,'']);
  const cat=await rpc(db,'miyar_catalogue',[]),univ=cat.universities.find(u=>u.name==='جامعة جديدة');assert.ok(univ);assert.equal(cat.colleges.filter(c=>c.university_id===univ.id).length,2);
  assert.equal((await rpc(db,'miyar_request_updates',[student]))[0].kind,'institution');
  const again=await rpc(db,'miyar_request_institution',[null,guest,univ.id,null,[colleges[0]]]);await rpc(db,'miyar_decide_institution',[admin,again.id,true,'']);
  assert.equal((await rpc(db,'miyar_catalogue',[])).universities.length,before+1);assert.equal((await db.query("select count(*)::int n from miyar_majors where name='الفيزياء'")).rows[0].n,1);
  const rejected=await rpc(db,'miyar_request_institution',[student,null,null,'جامعة مرفوضة',colleges]);await assert.rejects(rpc(db,'miyar_decide_institution',[admin,rejected.id,false,'']),/REASON_REQUIRED/);await rpc(db,'miyar_decide_institution',[admin,rejected.id,false,'بيانات غير دقيقة']);assert.ok(!(await rpc(db,'miyar_catalogue',[])).universities.some(u=>u.name==='جامعة مرفوضة'));
  assert.equal((await rpc(db,'miyar_my_requests',[student])).find(r=>r.id===rejected.id&&r.kind==='institution').reason,'بيانات غير دقيقة');
  await rpc(db,'miyar_request_institution',[student,null,null,'جامعة ثالثة',colleges]);await assert.rejects(rpc(db,'miyar_request_institution',[student,null,null,'جامعة رابعة',colleges]),/RATE_LIMIT/);
  await assert.rejects(rpc(db,'miyar_request_institution',[student,guest,null,'جامعة أخرى',colleges]),/ACCOUNT_RESTRICTED/);
  await db.query("update miyar_guest_sessions set status='restricted' where id=$1",[guest]);await assert.rejects(rpc(db,'miyar_request_institution',[null,guest,null,'جامعة أخرى',colleges]),/ACCOUNT_RESTRICTED/);
  await assert.rejects(rpc(db,'miyar_request_institution',[student,null,null,'جامعة أخرى',[{name:'كلية',majors:['']}]]),/INVALID_INSTITUTION_REQUEST/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from miyar_institution_requests'),/permission denied/);await assert.rejects(rpc(db,'miyar_decide_institution',[admin,rejected.id,true,'']),/permission denied/);await assert.rejects(rpc(db,'miyar_request_institution',[student,null,null,'جامعة أخرى',colleges]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('missing course professor requests create pending canonical doctors with course context and no reviews',async()=>{
 const db=await database();try{
  for(const id of [admin,student]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  await db.query("insert into miyar_guest_sessions(id,token_hash,university_id) values($1,$2,3)",[guest,'b'.repeat(64)]);
  const major=(await db.query("select major_id from miyar_study_plans where id='najran-me-2026'")).rows[0].major_id;
  const r=await rpc(db,'miyar_request_course_doctor',[null,guest,major,'مهندس أحمد محمد العتيبي','najran-ce-2025/ge101']);
  assert.equal(r.status,'pending');assert.equal((await db.query('select requested_course from miyar_doctors where id=$1',[r.id])).rows[0].requested_course,'najran-ce-2025/ge101');
  assert.equal((await db.query('select count(*)::int n from miyar_reviews')).rows[0].n,0);assert.equal((await rpc(db,'miyar_catalogue',[])).doctors.length,0);
  assert.equal((await rpc(db,'miyar_request_course_doctor',[student,null,major,'مهندس أحمد محمد العتيبي','najran-ce-2025/ge101'])).id,r.id);
  const foreign=(await db.query("insert into miyar_colleges(name,university_id) values('كلية أخرى',1) returning id")).rows[0].id;
  const otherMajor=(await db.query("insert into miyar_majors(name,college_id) values('تخصص آخر',$1) returning id",[foreign])).rows[0].id;
  await assert.rejects(rpc(db,'miyar_request_course_doctor',[student,null,otherMajor,'مهندس خالد علي العتيبي','najran-ce-2025/ge101']),/INVALID_MAJOR/);
  await db.query('update miyar_accounts set university_id=1 where auth_id=$1',[student]);await assert.rejects(rpc(db,'miyar_request_course_doctor',[student,null,otherMajor,'مهندس خالد علي العتيبي','najran-ce-2025/ge101']),/INVALID_STUDY_COURSE/);
  await rpc(db,'miyar_decide_request',['doctor',r.id,true,'']);assert.equal((await rpc(db,'miyar_catalogue',[])).doctors[0].count,0);assert.deepEqual(await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101']),[]);
 }finally{await db.close();}
});

test('HTTP student and guest requests bind verified actors; administrator decisions reject forged permissions and invalid nested forms',async()=>{
 let actor=student;const calls=[];
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status:'active',university_id:null}];if(path.startsWith('miyar_guest_sessions?'))return[{id:guest,status:'active',university_id:3}];return{ok:true};};
 const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async request=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:actor};}});
 const req=(body,headers={})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify(body)}),payload={university:'جامعة جديدة',colleges:[{name:'كلية جديدة',majors:['تخصص جديد']}]};
 assert.equal((await handle(req({action:'institution.request',...payload},{authorization:'Bearer valid'}))).status,201);assert.equal(calls.at(-1).body.p_account,student);assert.equal(calls.at(-1).body.p_guest,null);
 assert.equal((await handle(req({action:'guest.institution.request',...payload,accountId:admin},{'x-miyar-guest':'a'.repeat(64)}))).status,201);assert.equal(calls.at(-1).body.p_guest,guest);assert.equal(calls.at(-1).body.p_account,null);
 assert.equal((await handle(req({action:'guest.doctor.request',name:'مهندس أحمد محمد علي',majorId:1,courseId:'najran-ce-2025/ge101'},{'x-miyar-guest':'a'.repeat(64)}))).status,201);assert.equal(calls.at(-1).body.p_guest,guest);
 assert.equal((await handle(req({action:'guest.institution.request',...payload}))).status,401);
 assert.equal((await handle(req({action:'institution.request',...payload,colleges:[{name:'كلية',majors:'invalid'}]},{authorization:'Bearer valid'}))).status,400);
 const decision={action:'admin',operation:'institution.approve',id:1,isAdmin:true};assert.equal((await handle(req(decision,{authorization:'Bearer valid'}))).status,403);actor=admin;assert.equal((await handle(req(decision,{authorization:'Bearer valid'}))).status,200);assert.equal(calls.at(-1).body.p_actor,admin);
});

test('navigation returns through in-platform history, survives reload and handles a direct-link fallback without leaving the site',()=>{
 let url=new URL('https://miyar.website/#plan'),index=0;const entries=[{url:url.href,state:null}];let y=200;
 const location={get hash(){return url.hash;},get pathname(){return url.pathname;},get search(){return url.search;}};
 const history={get state(){return entries[index].state;},replaceState(state,_,target){if(target)url=new URL(target,url);entries[index]={state,url:url.href};},pushState(state,_,target){url=new URL(target,url);entries.splice(++index,entries.length,{state,url:url.href});},back(){index--;url=new URL(entries[index].url);}};
 let nav=createNavigation({history,location,scrollY:()=>y});nav.push('advisor');assert.equal(location.hash,'#advisor');nav.push('ratings');assert.equal(index,2);
 nav=createNavigation({history,location,scrollY:()=>y});assert.equal(nav.back(),true);assert.equal(location.hash,'#advisor');assert.equal(nav.back(),true);assert.equal(location.hash,'#plan');assert.equal(nav.savedScroll(),200);assert.equal(nav.back(),false);assert.equal(location.hash,'');assert.equal(index,0);history.replaceState(null,'');nav.push('ratings');assert.equal(location.hash,'#ratings');assert.equal(nav.back(),true);assert.equal(location.hash,'');
});
