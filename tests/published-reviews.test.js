import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
const admin='11111111-1111-4111-8111-111111111111',students=Array.from({length:22},(_,i)=>'22222222-2222-4222-8222-'+String(i+1).padStart(12,'0'));
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(result=>result.rows[0].result);
test('published-review removal updates all public evidence, closes pending edits/reports, preserves duplicate protection and hides private grades and history',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(file=>file.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  for(const id of [admin,...students]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'حساب اختبار',3)",[id]);}
  const major=(await db.query("select major_id from miyar_study_plans where id='najran-ce-2025'")).rows[0].major_id;
  const doctors=(await db.query("insert into miyar_doctors(major_id,name,status) values($1,'أحمد محمد العتيبي','approved'),($1,'محمد علي القحطاني','approved') returning id",[major])).rows.map(row=>row.id);
  let target;
  for(const [index,student] of students.entries()){
   if(index<10){const value=index?80:20;const result=await db.query("insert into miyar_reviews(account_id,doctor_id,subject,grade,explanation,treatment,grading,comment,status,share_grade,grade_consented_at,course_id) values($1,$2,'ميكانيكا الموائع',93,$3,$3,$3,'تجربة الطالب','published',true,now(),'najran-ce-2025/ce211') returning id",[student,doctors[0],value]);if(!index)target=result.rows[0].id;}
   await db.query("insert into miyar_reviews(account_id,doctor_id,subject,grade,explanation,treatment,grading,comment,status) values($1,$2,'الاستاتيكا',97,80,80,80,'تعليق منشور','published')",[student,doctors[1]]);
  }
  const pending=(await db.query("insert into miyar_reviews(account_id,doctor_id,subject,grade,explanation,treatment,grading,comment,status) values($1,$2,'مادة معلقة',99,80,80,80,'لا تظهر بالقائمة','pending') returning id",[admin,doctors[1]])).rows[0].id;
  const first=await rpc(db,'miyar_published_review_list',[null,'',null]);assert.equal(first.rows.length,25);assert.equal(first.total,32);assert.equal(first.hasMore,true);const second=await rpc(db,'miyar_published_review_list',[null,'',first.nextCursor]);assert.equal(second.rows.length,7);assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,32);
  const filtered=await rpc(db,'miyar_published_review_list',[3,'الموائع',null]);assert.equal(filtered.total,10);assert.equal((await rpc(db,'miyar_published_review_list',[1,'',null])).total,0);
  for(const privateField of ['account_id','guest_id','user_id','share_grade','"grade":',students[0]])assert.ok(!JSON.stringify(filtered).includes(privateField));
  const edit=await rpc(db,'miyar_request_edit',[students[0],target,'ميكانيكا الموائع','نص مقترح',70,70,70,[]]);const report=await rpc(db,'miyar_submit_report',[students[1],target,'irrelevant','بلاغ اختبار']);
  assert.equal((await rpc(db,'miyar_grade_distribution',[doctors[0],'ميكانيكا الموائع'])).available,true);assert.equal((await rpc(db,'miyar_course_doctors',['najran-ce-2025/ce211']))[0].count,10);
  await db.exec('set role service_role');const result=await rpc(db,'miyar_remove_published_review',[admin,target,'مراجعة الإدارة']);await db.exec('reset role');assert.equal(result.alreadyRemoved,false);
  assert.equal((await db.query('select status from miyar_reviews where id=$1',[target])).rows[0].status,'rejected');assert.equal((await db.query('select status from miyar_review_edits where id=$1',[edit.id])).rows[0].status,'rejected');assert.equal((await db.query('select status from miyar_reports where id=$1',[report.id])).rows[0].status,'resolved');
  assert.equal((await rpc(db,'miyar_grade_distribution',[doctors[0],'ميكانيكا الموائع'])).available,false);const course=(await rpc(db,'miyar_course_doctors',['najran-ce-2025/ce211']))[0];assert.equal(course.count,9);assert.equal(course.score,80);
  const catalogue=await rpc(db,'miyar_catalogue',[]);assert.equal(catalogue.doctors.find(doctor=>doctor.id===doctors[0]).count,9);assert.equal(catalogue.doctors.find(doctor=>doctor.id===doctors[0]).score,80);assert.equal(catalogue.stats.reviews,31);
  assert.equal((await rpc(db,'miyar_review_eligibility',[students[0],null,doctors[0],'ميكانيكا الموائع'])).eligible,false);assert.equal((await rpc(db,'miyar_remove_published_review',[admin,target,'إعادة محاولة'])).alreadyRemoved,true);assert.equal((await db.query('select count(*)::int n from miyar_review_removals')).rows[0].n,1);
  assert.equal((await rpc(db,'miyar_published_review_list',[null,'',null])).total,31);await assert.rejects(rpc(db,'miyar_remove_published_review',[admin,pending,'']),/REVIEW_UNAVAILABLE/);await assert.rejects(rpc(db,'miyar_decide_request',['edit',edit.id,true,'']),/REQUEST_NOT_FOUND/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_remove_published_review',[admin,target,'']),/permission denied/);await assert.rejects(rpc(db,'miyar_published_review_list',[null,'',null]),/permission denied/);await assert.rejects(db.query('select * from miyar_review_removals'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('published-review administration binds the verified administrator and rejects non-admin, restricted, malformed or forged requests',async()=>{
 let actor=students[0],status='active';const calls=[];const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status}];return{ok:true};};const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:actor})});
 const call=body=>handle(new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',...body})}));
 for(const operation of ['review.remove','review.published.list'])assert.equal((await call({operation,id:1,adminId:admin})).status,403);
 actor=admin;status='restricted';assert.equal((await call({operation:'review.remove',id:1})).status,403);status='active';
 assert.equal((await call({operation:'review.remove',id:1,adminId:students[0],reason:'تم التحقق'})).status,200);assert.deepEqual(calls.at(-1).body,{p_admin:admin,p_review:1,p_reason:'تم التحقق'});
 assert.equal((await call({operation:'review.remove',id:-1})).status,400);assert.equal((await call({operation:'review.published.list',before:'x'})).status,400);assert.equal((await call({operation:'review.remove',id:1,reason:'x'.repeat(301)})).status,400);
 assert.equal((await call({operation:'review.published.list',universityId:3,query:'الاستاتيكا',before:26})).status,200);assert.deepEqual(calls.at(-1).body,{p_university:3,p_query:'الاستاتيكا',p_before:26});
});
