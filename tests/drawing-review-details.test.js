import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {courseNameKey,knownCourseMatches} from '../src/course-names.js';
import {cleanProgress,courseStatus,progressSummary} from '../src/study-engine.js';
import {normalizeEditedPlan} from '../supabase/functions/miyar/plan-editor.js';
import {reviewDate} from '../src/review-date.js';
const original=JSON.parse(await readFile(new URL('../data/study-plans.json',import.meta.url),'utf8'));
const account='11111111-1111-4111-8111-111111111111',custom='plan-44444444-4444-4444-8444-444444444444';
test('all bundled plans have independent general drawing in level 3; preparatory completion persists separately without completing mechanical drawing or inventing credits',async()=>{
 for(const plan of original){
  const drawings=plan.courses.filter(c=>courseNameKey(c.name)===courseNameKey('الرسم الهندسي'));assert.equal(drawings.length,1);
  const drawing=drawings[0];assert.equal(drawing.level,3);assert.equal(drawing.preparatoryEligible,true);assert.equal(drawing.credits,null);assert.equal(drawing.page,null);
  const raw={completed:[drawing.id],preparatoryCompleted:[drawing.id,'bad'],doctorChoices:{[drawing.id]:17}};
  const state=cleanProgress(plan,JSON.parse(JSON.stringify(raw)));assert.deepEqual(state.preparatoryCompleted,[drawing.id]);assert.equal(courseStatus(plan,drawing,state).label,'مكتملة في السنة التحضيرية');assert.equal(progressSummary(plan,state).completed,1);assert.equal(progressSummary(plan,state).completedCredits,0);
  assert.deepEqual(cleanProgress(plan,{...raw,completed:[]}).preparatoryCompleted,[]);assert.deepEqual(cleanProgress(plan,{...raw,completed:{}}).preparatoryCompleted,[]);
  const edited=await normalizeEditedPlan(plan,plan,0);assert.equal(edited.courses.find(c=>c.id===drawing.id).preparatoryEligible,true);assert.equal(edited.courses.find(c=>c.id===drawing.id).platformAddition,true);assert.equal(edited.courses.find(c=>c.id===drawing.id).page,null);
 }
 const mechanical=original.find(p=>p.id==='najran-me-2026'),general=mechanical.courses.find(c=>c.id.endsWith('/engineering-drawing')),special=mechanical.courses.find(c=>c.name==='الرسم الهندسي الميكانيكي');
 assert.notEqual(courseNameKey(general.name),courseNameKey(special.name));assert.equal(courseStatus(mechanical,special,{completed:[general.id],preparatoryCompleted:[general.id]}).key,'ready');
 assert.deepEqual(knownCourseMatches('رسم هندسي',mechanical.courses).map(c=>c.id),[general.id]);assert.deepEqual(knownCourseMatches('رسم هندسي ميكانيكي',mechanical.courses).map(c=>c.id),[special.id]);
});
test('review dates always use Gregorian DD/MM/YYYY and Latin digits with the original Saudi-local calendar day',()=>{
 assert.equal(reviewDate('2026-11-16T10:00:00Z'),'16/11/2026');assert.equal(reviewDate('2026-11-15T22:30:00Z'),'16/11/2026');assert.equal(reviewDate('2024-02-29'),'29/02/2024');
 assert.equal(reviewDate(null),'التاريخ غير متاح');assert.equal(reviewDate('invalid'),'التاريخ غير متاح');
});
test('migration adds general drawing to live original/imported plans, keeps existing IDs and review dates/consent history, and separates public evidence for the two drawing subjects',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const dir=new URL('../supabase/migrations/',import.meta.url);let old,doctor;
  const course={id:custom+'/general',code:'GE101',name:'الرسم الهندسي',kind:'course',level:5,credits:2,linkable:true,prerequisites:[],corequisites:[],pool:null};
  for(const file of (await readdir(dir)).filter(file=>file.endsWith('.sql')).sort()){
   if(file==='202610310002_drawing_and_review_details.sql'){
    await db.query('insert into auth.users(id) values($1)',[account]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'اسم خاص',3)",[account]);
    await db.query('insert into miyar_study_plans(id,major_id,metadata) values($1,1,$2)',[custom,{id:custom,courses:[course],levels:[5]}]);await db.query('insert into miyar_study_courses values($1,$2,$3,$4,true)',[course.id,custom,course.code,course.name]);
    doctor=(await db.query("insert into miyar_doctors(major_id,name,status) values(1,'أحمد محمد العتيبي','approved') returning id")).rows[0].id;
    old=await rpc('miyar_submit_existing_google_review',[account,doctor,course.name,74,80,80,80,'تجربة قديمة',[],false,course.id]);
    await db.query("update miyar_reviews set status='published',created_at='2024-02-29T10:00:00Z' where id=$1",[old.id]);
    await db.query("insert into miyar_study_plans(id,major_id,metadata,deleted_at) values('deleted-drawing-plan',1,$1,now())",[{deleted:true,courses:[]}]);
   }
   await db.exec(await readFile(new URL(file,dir),'utf8'));
  }
  const rows=(await db.query('select id,revision,metadata from miyar_study_plans where deleted_at is null')).rows;
  for(const plan of rows){const drawings=plan.metadata.courses.filter(c=>courseNameKey(c.name)===courseNameKey('الرسم الهندسي'));assert.equal(drawings.length,1);assert.equal(drawings[0].level,3);assert.equal(drawings[0].preparatoryEligible,true);assert.equal(plan.revision,1);assert.ok((await db.query('select linkable from miyar_study_courses where id=$1',[drawings[0].id])).rows[0].linkable);}
  const existing=rows.find(p=>p.id===custom).metadata.courses[0];assert.equal(existing.id,course.id);assert.equal(existing.code,'GE101');assert.equal(existing.credits,2);
  assert.deepEqual((await db.query("select metadata from miyar_study_plans where id='deleted-drawing-plan'")).rows[0].metadata,{deleted:true,courses:[]});
  const publicOld=(await rpc('miyar_public_reviews',[doctor,null]))[0];assert.equal(publicOld.grade,74);assert.equal(reviewDate(publicOld.date),'29/02/2024');assert.equal((await db.query('select public_grade_notice_at from miyar_reviews where id=$1',[old.id])).rows[0].public_grade_notice_at,null);
  for(const secret of [account,'اسم خاص','account_id','guest_id','public_grade_notice_at'])assert.ok(!JSON.stringify(publicOld).includes(secret));
  const mechanical='najran-me-2026/me101',general='najran-me-2026/engineering-drawing';
  assert.equal((await rpc('miyar_review_eligibility',[account,null,doctor,'الرسم الهندسي الميكانيكي'])).eligible,true);
  const review=await rpc('miyar_submit_existing_google_review',[account,doctor,'الرسم الهندسي الميكانيكي',91,90,90,90,'تجربة ميكانيكية',[],false,mechanical,true]);
  assert.deepEqual((await rpc('miyar_course_reviews',[general,doctor])).map(r=>r.id),[old.id]);assert.deepEqual(await rpc('miyar_course_reviews',[mechanical,doctor]),[],'pending review stays private');
  await db.query("update miyar_reviews set status='published' where id=$1",[review.id]);assert.deepEqual((await rpc('miyar_course_reviews',[mechanical,doctor])).map(r=>r.id),[review.id]);assert.deepEqual((await rpc('miyar_course_reviews',[general,doctor])).map(r=>r.id),[old.id]);
 }finally{await db.close();}
});
