import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {normalizePublishedPlan} from '../supabase/functions/miyar/plan-format.js';
import {repairCourseCode} from '../supabase/functions/miyar/plan-repair.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {ApiError} from '../supabase/functions/miyar/security.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));for(const [id,email]of [[admin,'admin@example.test'],[student,'student@example.test']]){await db.query('insert into auth.users values($1,$2)',[id,email]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}return db;}
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
const doctor=db=>db.query("insert into miyar_doctors(major_id,name,status) values(1,'مهندس أحمد محمد العتيبي','approved') returning id").then(r=>r.rows[0].id);
const existing=(db,actor,id,subject,guest=false)=>rpc(db,guest?'miyar_submit_existing_guest_review':'miyar_submit_existing_google_review',[actor,id,subject,90,80,80,80,'',[],false,null]);

test('one review per professor and normalized subject spans moderation states, routes and linked identities without a daily limit',async()=>{
 const db=await database();try{
  const d=await doctor(db),g=await rpc(db,'miyar_open_guest',['a'.repeat(64),null]);await rpc(db,'miyar_choose_university',[null,g.id,3]);
  const review=await existing(db,g.id,d,'الاستاتيكا',true);assert.equal(review.status,'pending');
  assert.equal((await rpc(db,'miyar_review_eligibility',[null,g.id,d])).eligible,true,'general form does not block another subject');
  assert.equal((await rpc(db,'miyar_review_eligibility',[null,g.id,d,'استاتيكا'])).eligible,false);
  await assert.rejects(existing(db,g.id,d,'الإِسْتَاتِيكا',true),/REVIEW_ALREADY_EXISTS/);
  for(let i=0;i<8;i++)await existing(db,g.id,d,'مادة مختلفة '+i,true);
  await rpc(db,'miyar_link_review_identity',[student,g.id]);
  assert.equal((await rpc(db,'miyar_review_eligibility',[student,null,d,'استاتيكا'])).eligible,false);
  await assert.rejects(existing(db,student,d,'استاتيكا'),/REVIEW_ALREADY_EXISTS/);
  await assert.rejects(rpc(db,'miyar_submit_google_review',[student,'كلية الهندسة','الهندسة المدنية','مهندس أحمد محمد العتيبي','استاتيكا',90,80,80,80,'',[],false]),/REVIEW_ALREADY_EXISTS/);
  for(let i=0;i<8;i++)await existing(db,student,d,'مقرر جديد '+i);
  const own=await existing(db,admin,d,'ميكانيكا');await db.query("update miyar_reviews set status='published' where id=$1",[own.id]);
  assert.equal((await rpc(db,'miyar_review_eligibility',[admin,null,d,'ميكانيكا'])).canEdit,true);
  await db.query("update miyar_reviews set status='rejected' where id=$1",[own.id]);await assert.rejects(existing(db,admin,d,'الميكانيكا'),/REVIEW_ALREADY_EXISTS/);
  await existing(db,admin,d,'مختلفة');
  await rpc(db,'miyar_link_review_identity',[admin,g.id]);assert.equal((await db.query('select account_id from miyar_review_identities where guest_id=$1',[g.id])).rows[0].account_id,student);
  await assert.rejects(db.query("update miyar_reviews set subject='استاتيكا' where account_id=$1 and subject='مقرر جديد 0'",[student]),/REVIEW_ALREADY_EXISTS/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from miyar_review_identities'),/permission denied/);await assert.rejects(rpc(db,'miyar_review_eligibility',[student,null,d,'استاتيكا']),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('college assistants can propose only within their assigned college; ambassadors cover a university and revocation blocks approval',async()=>{
 const db=await database();try{
  const college=(await db.query('select college_id from miyar_majors where id=1')).rows[0].college_id;
  const science=(await db.query("insert into miyar_colleges(name,university_id) values('كلية العلوم',3) returning id")).rows[0].id;
  const major=(await db.query("insert into miyar_majors(name,college_id) values('فيزياء', $1) returning id",[science])).rows[0].id;
  const outsider=(await db.query("insert into miyar_doctors(name,major_id,status) values('أحمد حسن محمد سالم',$1,'approved') returning id",[major])).rows[0].id;
  await rpc(db,'miyar_set_assistant',[admin,'student@example.test',college,true]);
  const proposal=(kind,target,parent,name)=>rpc(db,'miyar_propose_catalogue',[student,kind,3,target,parent,name,'',true]);
  const valid=await proposal('major.add',null,college,'هندسة جديدة');await rpc(db,'miyar_decide_catalogue',[admin,valid.id,true,'']);
  assert.equal((await db.query("select count(*)::int n from miyar_majors where college_id=$1 and name='هندسة جديدة'",[college])).rows[0].n,1);
  await assert.rejects(proposal('major.add',null,science,'تخصص آخر'),/AMBASSADOR_SCOPE/);
  await assert.rejects(proposal('college.add',null,null,'كلية أخرى'),/AMBASSADOR_SCOPE/);
  await assert.rejects(proposal('doctor.correct',outsider,1,'أحمد حسن محمد القحطاني'),/AMBASSADOR_SCOPE/);
  await rpc(db,'miyar_set_ambassador',[admin,'student@example.test',3,true]);assert.equal((await proposal('major.add',null,science,'فيزياء جديدة')).status,'pending');
  await rpc(db,'miyar_set_ambassador',[admin,'student@example.test',3,false]);
  const pending=await proposal('major.add',null,college,'هندسة أخرى');await rpc(db,'miyar_set_assistant',[admin,'student@example.test',college,false]);
  await assert.rejects(rpc(db,'miyar_decide_catalogue',[admin,pending.id,true,'']),/AMBASSADOR_REVOKED/);
  assert.equal((await db.query("select count(*)::int n from miyar_majors where name='هندسة أخرى'")).rows[0].n,0);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_set_assistant',[admin,'student@example.test',college,true]),/permission denied/);await assert.rejects(db.query('select * from miyar_assistants'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('government university activation gates server selection, new approvals stay disabled and contact email remains private',async()=>{
 const db=await database();try{
  const cat=await rpc(db,'miyar_catalogue',[]);assert.equal(cat.universities.length,28);assert.deepEqual(cat.universities.filter(u=>u.enabled).map(u=>u.name),['جامعة نجران']);
  const guest=await rpc(db,'miyar_open_guest',['b'.repeat(64),null]);
  await assert.rejects(rpc(db,'miyar_choose_university',[student,null,1]),/UNIVERSITY_INACTIVE/);await assert.rejects(rpc(db,'miyar_choose_university',[null,guest.id,1]),/UNIVERSITY_INACTIVE/);
  await rpc(db,'miyar_set_university_enabled',[1,true]);await db.query('update miyar_accounts set major_id=1 where auth_id=$1',[student]);await rpc(db,'miyar_choose_university',[student,null,1]);
  assert.deepEqual((await db.query('select university_id,major_id from miyar_accounts where auth_id=$1',[student])).rows[0],{university_id:1,major_id:null});
  await rpc(db,'miyar_choose_university',[null,guest.id,1]);assert.equal((await db.query('select university_id from miyar_guest_sessions where id=$1',[guest.id])).rows[0].university_id,1);
  await rpc(db,'miyar_set_university_enabled',[1,false]);await assert.rejects(rpc(db,'miyar_choose_university',[student,null,1]),/UNIVERSITY_INACTIVE/);
  const req=await rpc(db,'miyar_request_institution_contact',[student,null,null,'جامعة حكومية جديدة',[],'university','contact@example.test']);
  await rpc(db,'miyar_decide_institution',[admin,req.id,true,'']);assert.equal((await db.query("select enabled from miyar_universities where name='جامعة حكومية جديدة'")).rows[0].enabled,false);
  const college=await rpc(db,'miyar_request_institution_contact',[null,guest.id,3,null,[{name:'كلية جديدة',majors:[]}],'college','visitor@example.test']);await rpc(db,'miyar_decide_institution',[admin,college.id,true,'']);
  assert.equal((await db.query("select count(*)::int n from miyar_colleges where university_id=3 and name='كلية جديدة'")).rows[0].n,1);
  const stored=(await db.query('select contact_email from miyar_institution_requests where id=$1',[college.id])).rows[0];assert.equal(stored.contact_email,'visitor@example.test');assert.ok(!JSON.stringify(await rpc(db,'miyar_catalogue',[])).includes('visitor@example.test'));
  await assert.rejects(rpc(db,'miyar_request_institution_contact',[student,null,null,'جامعة خطأ',[],'university','bad-email']),/INVALID_INSTITUTION_REQUEST/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_set_university_enabled',[1,true]),/permission denied/);await assert.rejects(db.query('select contact_email from miyar_institution_requests'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('plan saving repairs Unicode spacing, separators, Arabic digits, references and duplicate translation rows without guessing academic conflicts',async()=>{
 assert.equal(repairCourseCode(' (ce — ١٠١) '),'CE 101');assert.equal(repairCourseCode('فيـز\u200f ١٠٥'),'فيز 105');
 const course=(code,name,level=1)=>({code,name,level,credits:'٣',kind:'course',pool:null,prerequisites:'لا يوجد',corequisites:[],anyPrerequisites:[],allPrevious:false});
 const input={id:'plan-12345678-1234-4234-8234-123456789012',sha256:'a'.repeat(64),title:'خطة دراسية',fileLabel:'١٤٤٨',courses:[course('(ce — ١٠١)','Introduction'),course('ce101','مقدمة'),{...course('CE ٢٠١','مقرر متقدم',2),prerequisites:'ce-١٠١، CE101'}]};
 const before=structuredClone(input),plan=await normalizePublishedPlan(input);assert.deepEqual(input,before);assert.equal(plan.courses.length,2);assert.equal(plan.courses[0].name,'مقدمة');assert.equal(plan.courses[0].credits,3);assert.deepEqual(plan.courses[1].prerequisites,['CE 101']);assert.ok(plan.autoCorrections.length>0);
 await assert.rejects(normalizePublishedPlan({...input,courses:[course('CE 101','مادة'),{...course('CE-101','مادة'),credits:4}]}),/مكرر/);
 await assert.rejects(normalizePublishedPlan({...input,courses:[{...course('CE 101','مادة'),prerequisites:['CE201']},{...course('CE201','أخرى',2),prerequisites:['CE101']}]}),/دائري/);
});

test('assistant and university admin actions reject forged roles and bind trusted identities',async()=>{
 let actor=student;const calls=[];
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status:'active',university_id:3}];if(path.startsWith('miyar_ambassadors?'))return[];if(path.startsWith('miyar_assistants?'))return[{college_id:1}];return{ok:true};};
 const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async req=>{if(!req.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:actor};}});
 const req=body=>new Request('https://test',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify(body)});
 for(const body of [{operation:'assistant.set',email:'student@example.test',collegeId:1,active:true},{operation:'university.enable',id:1,enabled:true}])assert.equal((await handle(req({action:'admin',isAdmin:true,...body}))).status,403);
 const me=await (await handle(req({action:'me',isAdmin:true}))).json();assert.equal(me.isAdmin,false);assert.deepEqual(me.assistantColleges,[1]);
 actor=admin;assert.equal((await handle(req({action:'admin',operation:'assistant.set',email:'student@example.test',collegeId:1,active:true,actor:student}))).status,200);assert.equal(calls.at(-1).body.p_actor,admin);
 assert.equal((await handle(req({action:'admin',operation:'university.enable',id:1,enabled:'true'}))).status,400);
 assert.equal((await handle(req({action:'admin',operation:'university.enable',id:1,enabled:true}))).status,200);assert.deepEqual(calls.at(-1).body,{p_id:1,p_enabled:true});
});

test('review preflight links a verified guest capability even when the guest session was created after Google sign-in',async()=>{
 const calls=[],guest='33333333-3333-4333-8333-333333333333';
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:student,status:'active',university_id:3}];if(path.startsWith('miyar_guest_sessions?'))return[{id:guest,status:'active',university_id:3}];if(path==='rpc/miyar_review_eligibility')return{eligible:false,status:'pending'};return{ok:true};};
 const handle=createHandler({db,env:{},authenticate:async()=>({id:student})});
 const response=await handle(new Request('https://test',{method:'POST',headers:{authorization:'Bearer verified','x-miyar-guest':'ab'.repeat(32)},body:JSON.stringify({action:'review.eligibility',doctor:1,accountId:admin,guestId:admin})}));
 assert.equal(response.status,200);assert.equal((await response.json()).eligible,false);assert.deepEqual(calls.find(c=>c.path==='rpc/miyar_link_review_identity').body,{p_account:student,p_guest:guest});
 assert.ok(calls.findIndex(c=>c.path==='rpc/miyar_link_review_identity')<calls.findIndex(c=>c.path==='rpc/miyar_review_eligibility'));
});
