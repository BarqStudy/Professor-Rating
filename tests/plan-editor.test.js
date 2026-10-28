import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {normalizeEditedPlan} from '../supabase/functions/miyar/plan-editor.js';
import {normalizePublishedPlan} from '../supabase/functions/miyar/plan-format.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {cleanProgress,progressSummary} from '../src/study-engine.js';
import {setUploadedStudyPlans,getStudyPlans} from '../src/study-catalogue.js';
const originalPlans=JSON.parse(await readFile(new URL('../data/study-plans.json',import.meta.url),'utf8'));
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
const row=(code,name,level=1)=>({code,name,credits:3,level,kind:'course',pool:null,prerequisites:[],corequisites:[],anyPrerequisites:[],allPrevious:false});
const plan=async()=>normalizePublishedPlan({id:'plan-12345678-1234-4234-8234-123456789012',title:'خطة التخصص',fileLabel:'نسخة أصلية',sha256:'a'.repeat(64),courses:[row('CE101','أساسيات الهندسة'),{...row('CE201','ميكانيكا الموائع',2),prerequisites:['CE101']},row('CE301','تقنيات العرض',3)]});
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(result=>result.rows[0].result);
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(file=>file.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));return db;}

test('all five original curricula remain editable without removing legacy ambiguities; IDs and choice groups stay stable',async()=>{
 for(const base of originalPlans){const before=structuredClone(base),edited=await normalizeEditedPlan(base,base,0);assert.deepEqual(base,before);assert.deepEqual(new Set(edited.courses.map(row=>row.id)),new Set(base.courses.map(row=>row.id)));assert.ok(base.groups.every(group=>edited.groups.some(item=>item.id===group.id)));assert.equal(edited.courses.length,base.courses.length);}
 const arc=originalPlans.find(plan=>plan.id==='najran-arc-2026');const draft=structuredClone(arc);draft.courses.find(row=>row.code==='عمر 356').code='عمر 999';const edited=await normalizeEditedPlan(arc,draft,0);assert.ok(edited.courses.filter(row=>['عمر 356','عمر 999'].includes(row.code)).every(row=>row.linkable));
});

test('code edits rewrite prerequisites once, additions/deletions and levels keep surviving progress and doctor choices',async()=>{
 const base=await plan(),draft=structuredClone(base),first=base.courses[0],last=base.courses[2];draft.courses[0].code='ce ـ ١٠٢';draft.courses[0].credits=4;draft.courses[0].level=2;draft.courses=draft.courses.filter(row=>row.id!==last.id);draft.courses.push(row('CE401','التصميم المتقدم',4));draft.levels=[1,2,4,5];
 const edited=await normalizeEditedPlan(base,draft,0);assert.equal(edited.courses.find(row=>row.id===first.id).code,'CE 102');assert.deepEqual(edited.courses.find(row=>row.code==='CE 201').prerequisites,['CE 102']);assert.deepEqual(edited.levels,[1,2,4,5]);assert.equal(edited.revision,1);
 const state=cleanProgress(edited,{completed:[first.id,last.id],doctorChoices:{[first.id]:10,[last.id]:11}});assert.deepEqual(state.completed,[first.id]);assert.deepEqual(state.doctorChoices,{[first.id]:10});assert.equal(progressSummary(edited,state).completedCredits,4);
 const newCourse=edited.courses.find(course=>course.code==='CE 401');assert.ok(newCourse.id.startsWith(base.id+'/c-'));assert.equal(edited.courses.find(course=>course.code==='CE 201').id,base.courses[1].id);
});

test('editor blocks new duplicates, cycles, foreign IDs, invalid hours and dangling deletions without altering source',async()=>{
 const base=await plan(),before=structuredClone(base);
 for(const mutate of [draft=>draft.courses[1].code='CE101',draft=>draft.courses[0].credits=-1,draft=>draft.courses[0].id='another-plan/course',draft=>draft.courses[0].kind='slot',draft=>draft.courses[0].prerequisites=['CE201'],draft=>draft.courses.splice(0,1),draft=>{draft.courses[0].id=null;draft.courses[0].name='بديل مختلف';}]){
  const draft=structuredClone(base);mutate(draft);await assert.rejects(normalizeEditedPlan(base,draft,0));
 }
 assert.deepEqual(base,before);
});

test('updated bundled plans override their static copy exactly once, while a failed catalogue refresh retains the update',async()=>{
 const base=originalPlans[0],draft=structuredClone(base);draft.courses[0].credits=4;const edited=await normalizeEditedPlan(base,draft,0);
 try{setUploadedStudyPlans([edited]);assert.equal(getStudyPlans().length,5);assert.equal(getStudyPlans().find(plan=>plan.id===base.id).courses[0].credits,4);setUploadedStudyPlans(null);assert.equal(getStudyPlans().find(plan=>plan.id===base.id).revision,1);}finally{setUploadedStudyPlans([]);}
});

test('database edits are atomic, fenced by revision, archive removed identities without deleting reviews, and protect the private audit history',async()=>{
 const db=await database();try{
  await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'الإدارة',3),($2,'طالب',3)",[admin,student]);
  const major=(await db.query("select major_id from miyar_study_plans where id='najran-ce-2025'")).rows[0].major_id;
  let base=await plan();await rpc(db,'miyar_publish_study_plan',[admin,major,base]);base=(await db.query('select metadata from miyar_study_plans where id=$1',[base.id])).rows[0].metadata;
  const target=base.courses[2];const submitted=await rpc(db,'miyar_submit_google_review',[student,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي',target.name,90,80,80,80,'',[],false,target.id]);
  await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published';");
  const draft=structuredClone(base);draft.courses[0].code='CE102';draft.courses[0].credits=4;draft.courses=draft.courses.filter(row=>row.id!==target.id);draft.courses.push(row('CE401','مقرر جديد',4));
  const edited=await normalizeEditedPlan(base,draft,0);await db.exec('set role service_role');const saved=await rpc(db,'miyar_update_study_plan',[admin,base.id,0,edited]);assert.equal((await rpc(db,'miyar_admin_study_plans',[])).length,6);await db.exec('reset role');assert.equal(saved.revision,1);
  const identity=(await db.query('select code,linkable from miyar_study_courses where id=$1',[base.courses[0].id])).rows[0];assert.equal(identity.code,'CE 102');
  assert.equal((await db.query('select linkable from miyar_study_courses where id=$1',[target.id])).rows[0].linkable,false);
  assert.equal((await db.query('select course_id,status from miyar_reviews where id=$1',[submitted.id])).rows[0].course_id,target.id);assert.equal((await db.query('select status from miyar_reviews where id=$1',[submitted.id])).rows[0].status,'published');
  await assert.rejects(rpc(db,'miyar_update_study_plan',[admin,base.id,0,edited]),/STUDY_PLAN_EDIT_CONFLICT/);
  const audit=(await db.query('select * from miyar_study_plan_edits where plan_id=$1',[base.id])).rows;assert.equal(audit.length,1);assert.equal(audit[0].before_metadata.courses.length,3);
  const publicPlans=await rpc(db,'miyar_uploaded_study_plans',[]);assert.equal(publicPlans.find(plan=>plan.id===base.id).revision,1);assert.ok(!JSON.stringify(publicPlans).includes(admin));
  const bad=structuredClone(edited);bad.revision=2;bad.courses[0].id='foreign-plan/c-aaaaaaaaaaaaaaaaaaaa';await assert.rejects(rpc(db,'miyar_update_study_plan',[admin,base.id,1,bad]),/INVALID_STUDY_PLAN/);assert.equal((await db.query('select revision from miyar_study_plans where id=$1',[base.id])).rows[0].revision,1);
  const seed=(await db.query('select metadata from miyar_study_plans where id=$1',[originalPlans[0].id])).rows[0].metadata,seedDraft=structuredClone(seed);seedDraft.courses[0].credits=4;const seedEdit=await normalizeEditedPlan(seed,seedDraft,0);await rpc(db,'miyar_update_study_plan',[admin,seed.id,0,seedEdit]);assert.ok((await rpc(db,'miyar_uploaded_study_plans',[])).some(plan=>plan.id===seed.id&&plan.revision===1));
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_update_study_plan',[admin,base.id,1,edited]),/permission denied/);await assert.rejects(rpc(db,'miyar_admin_study_plans',[]),/permission denied/);await assert.rejects(db.query('select * from miyar_study_plan_edits'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('editing API authenticates an active administrator before reading a large body, and binds the actor and stored plan',async()=>{
 const base=await plan();let actor=student,status='active',revision=0;const calls=[];
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status}];if(path.startsWith('miyar_study_plans?'))return[{id:base.id,metadata:base,revision}];if(path==='rpc/miyar_admin_study_plans')return[{id:base.id}];return{ok:true};};
 const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:actor})});
 const request=body=>new Request('https://test?study=update',{method:'POST',body:JSON.stringify(body)});
 let read=false;const unauthorized=request({});Object.defineProperty(unauthorized,'body',{get(){read=true;throw Error('do not read');}});assert.equal((await handle(unauthorized)).status,403);assert.equal(read,false);
 actor=admin;status='restricted';assert.equal((await handle(request({id:base.id,revision:0,draft:base}))).status,403);status='active';
 const draft=structuredClone(base);draft.courses[0].credits=4;draft.actor=student;draft.id='foreign-plan';
 assert.equal((await handle(request({id:base.id,revision:0,draft,adminId:student}))).status,200);assert.equal(calls.at(-1).body.p_admin,admin);assert.equal(calls.at(-1).body.p_plan.id,base.id);
 revision=1;assert.equal((await handle(request({id:base.id,revision:0,draft}))).status,409);
 const call=operation=>handle(new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',operation,id:base.id})}));
 assert.equal((await call('study.get')).status,200);assert.equal((await call('study.list')).status,200);actor=student;assert.equal((await call('study.get')).status,403);assert.equal((await call('study.list')).status,403);
});

test('plan renaming retains progress and review identities; deletion hides bundled and uploaded plans, fences stale writers and permits a fresh version upload',async()=>{
 const db=await database();try{
  await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'الإدارة',3),($2,'طالب',3)",[admin,student]);
  const major=(await db.query("select major_id from miyar_study_plans where id='najran-ce-2025'")).rows[0].major_id;let base=await plan();await rpc(db,'miyar_publish_study_plan',[admin,major,base]);base=(await db.query('select metadata from miyar_study_plans where id=$1',[base.id])).rows[0].metadata;
  const course=base.courses[0],submitted=await rpc(db,'miyar_submit_google_review',[student,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي',course.name,90,80,80,80,'',[],false,course.id]);await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published';");
  const title='خطة الهندسة المحدثة Engineering',renamed=await normalizeEditedPlan(base,{...base,title},0);assert.equal(renamed.title,title);assert.deepEqual(renamed.courses.map(row=>row.id),base.courses.map(row=>row.id));assert.deepEqual(cleanProgress(renamed,{completed:[course.id]}).completed,[course.id]);
  await rpc(db,'miyar_update_study_plan',[admin,base.id,0,renamed]);assert.equal((await rpc(db,'miyar_admin_study_plans',[])).find(plan=>plan.id===base.id).title,title);
  await assert.rejects(normalizeEditedPlan(base,{...base,title:'<script>bad</script>'},0),/اسم مقرر صالح/);await assert.rejects(normalizeEditedPlan(base,{...base,title:''},0));
  await assert.rejects(rpc(db,'miyar_delete_study_plan',[admin,base.id,0]),/STUDY_PLAN_EDIT_CONFLICT/);assert.equal((await db.query('select linkable from miyar_study_courses where id=$1',[course.id])).rows[0].linkable,true);
  await db.exec('set role service_role');const removed=await rpc(db,'miyar_delete_study_plan',[admin,base.id,1]);await db.exec('reset role');assert.equal(removed.revision,2);assert.equal((await rpc(db,'miyar_delete_study_plan',[admin,base.id,1])).alreadyDeleted,true);
  assert.equal((await db.query('select count(*)::int n from miyar_study_courses where plan_id=$1 and linkable',[base.id])).rows[0].n,0);assert.equal((await db.query('select status,course_id from miyar_reviews where id=$1',[submitted.id])).rows[0].status,'published');assert.equal((await db.query('select course_id from miyar_reviews where id=$1',[submitted.id])).rows[0].course_id,course.id);
  assert.ok(!(await rpc(db,'miyar_admin_study_plans',[])).some(plan=>plan.id===base.id));const tombstone=(await rpc(db,'miyar_uploaded_study_plans',[])).find(plan=>plan.id===base.id);assert.deepEqual(tombstone,{id:base.id,deleted:true,revision:2});assert.equal((await db.query('select count(*)::int n from miyar_study_plan_edits where plan_id=$1',[base.id])).rows[0].n,2);
  await assert.rejects(rpc(db,'miyar_update_study_plan',[admin,base.id,1,renamed]),/STUDY_PLAN_NOT_FOUND/);await assert.rejects(rpc(db,'miyar_publish_study_plan',[admin,major,base]),/STUDY_PLAN_NOT_FOUND/);
  const replacement=await normalizePublishedPlan({...base,id:'plan-99999999-9999-4999-8999-999999999999'});assert.equal((await rpc(db,'miyar_publish_study_plan',[admin,major,replacement])).alreadySaved,false);
  const seed=originalPlans[0];await rpc(db,'miyar_delete_study_plan',[admin,seed.id,0]);const publicPlans=await rpc(db,'miyar_uploaded_study_plans',[]);setUploadedStudyPlans(publicPlans);assert.ok(!getStudyPlans().some(plan=>plan.id===seed.id||plan.id===base.id));assert.ok(getStudyPlans().some(plan=>plan.id===replacement.id));setUploadedStudyPlans(null);assert.ok(!getStudyPlans().some(plan=>plan.id===seed.id));
  assert.equal((await rpc(db,'miyar_catalogue',[])).stats.reviews,1);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_delete_study_plan',[admin,replacement.id,0]),/permission denied/);await db.exec('reset role');}
 }finally{setUploadedStudyPlans([]);await db.close();}
});

test('plan deletion requires explicit confirmation and an active verified administrator; removed plans cannot be loaded',async()=>{
 let actor=student,status='active';const calls=[];const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status}];if(path.startsWith('miyar_study_plans?')){assert.ok(path.includes('deleted_at=is.null'));return [];}return{ok:true};};const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:actor})});
 const call=body=>handle(new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',operation:'study.delete',id:'najran-ce-2025',revision:0,...body})}));
 assert.equal((await call({confirmed:true,isAdmin:true,adminId:admin})).status,403);actor=admin;status='restricted';assert.equal((await call({confirmed:true})).status,403);status='active';assert.equal((await call({})).status,400);
 assert.equal((await call({confirmed:true,adminId:student})).status,200);assert.deepEqual(calls.at(-1).body,{p_admin:admin,p_id:'najran-ce-2025',p_revision:0});assert.equal((await call({confirmed:true,revision:-1})).status,400);
 assert.equal((await call({operation:'study.get'})).status,404);
});
