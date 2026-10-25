import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildReviewSummary} from '../supabase/functions/miyar/summary.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
const account='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('summary counts independent published comments conservatively, ignores negation and suppresses thin evidence',()=>{
 const sample=[{comment:'شرحه واضح جدا وشرح واضح ومتعاون'},{comment:'شرح واضح والدكتور متعاون'},{comment:'شرح غير واضح وغيرمتعاون واختباراته مو صعبة'}];
 const summary=buildReviewSummary(sample,9);
 assert.equal(summary.reviewCount,3);assert.equal(summary.totalPublished,9);
 assert.equal(summary.themes.find((theme)=>theme.label==='إشادة بالشرح').count,2);
 assert.equal(summary.themes.find((theme)=>theme.label==='إشادة بالتعامل أو التعاون').count,2);
 assert.ok(!summary.themes.some((theme)=>theme.label.includes('اختبارات')));
 assert.equal(buildReviewSummary(sample.slice(0,2)).insufficient,true);
 assert.deepEqual(buildReviewSummary(sample.slice(0,2)).themes,[]);
 assert.equal(buildReviewSummary(Array.from({length:3},()=>({comment:"",tags:["يوصل المعلومة"]}))).themes[0].count,3);
});
test('request decisions preserve reasons and ownership, bulk actions are atomic, and summary inputs include only published reviews',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);');
  for(const name of ['202610240001_miyar.sql','202610240002_google_auth.sql','202610250001_universities.sql','202610250002_community.sql','202610250003_experience.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  for(const id of [account,other]){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  const doctor=await rpc('miyar_request_doctor',[account,1,'أحمد محمد العتيبي']);
  await assert.rejects(rpc('miyar_decide_request',['doctor',doctor.id,false,'']),/REASON_REQUIRED/);
  await rpc('miyar_decide_request',['doctor',doctor.id,false,'الاسم يحتاج إلى تصحيح']);
  let requests=await rpc('miyar_my_requests',[account]);
  assert.equal(requests[0].reason,'الاسم يحتاج إلى تصحيح');assert.equal(requests[0].status,'rejected');
  assert.deepEqual(await rpc('miyar_my_requests',[other]),[]);
  let events=await rpc('miyar_request_updates',[account]);assert.equal(events.length,1);assert.ok(!('account_id' in events[0]));
  const approved=await rpc('miyar_request_doctor',[account,1,'خالد عبدالله الحربي']);
  await rpc('miyar_decide_request',['doctor',approved.id,true,'']);
  const review=await rpc('miyar_submit_google_review',[account,'كلية الهندسة','الهندسة المدنية','خالد عبدالله الحربي','ميكانيكا',90,80,80,80,'شرح واضح ومتعاون']);
  assert.equal((await rpc('miyar_summary_comments',[approved.id,null])).total,0);
  await db.query("update miyar_reviews set status='published' where id=$1",[review.id]);
  assert.equal((await rpc('miyar_summary_comments',[approved.id,'ميكانيكا'])).total,1);
  assert.equal((await rpc('miyar_summary_comments',[approved.id,'رياضيات'])).total,0);
  const edit=await rpc('miyar_request_edit',[account,review.id,'ميكانيكا','شرح جديد وواضح',90,90,90]);
  await rpc('miyar_decide_request',['edit',edit.id,false,'التعليق يحتاج تفاصيل أكثر']);
  assert.equal((await db.query('select comment from miyar_reviews where id=$1',[review.id])).rows[0].comment,'شرح واضح ومتعاون');
  requests=await rpc('miyar_my_requests',[account]);assert.equal(requests.find((request)=>request.kind==='edit').reason,'التعليق يحتاج تفاصيل أكثر');
  const edit2=await rpc('miyar_request_edit',[account,review.id,'ميكانيكا','تعديل آخر للتجربة',80,80,80]);
  const report=await rpc('miyar_submit_report',[other,review.id,'personal','']);
  await rpc('miyar_moderate_report',[report.id,true]);
  const automaticallyRejected=(await rpc('miyar_my_requests',[account])).find((request)=>request.kind==='edit'&&request.id===edit2.id);
  assert.equal(automaticallyRejected.status,'rejected');assert.match(automaticallyRejected.reason,/التقييم الأصلي أُخفي/);
  await assert.rejects(rpc('miyar_bulk_doctors',[[approved.id,9999],'verify']),/DOCTOR_UNAVAILABLE/);
  assert.equal((await db.query('select verified from miyar_doctors where id=$1',[approved.id])).rows[0].verified,false);
  assert.equal((await rpc('miyar_bulk_doctors',[[approved.id],'verify'])).updated,1);
  assert.equal((await db.query('select verified from miyar_doctors where id=$1',[approved.id])).rows[0].verified,true);
  await assert.rejects(rpc('miyar_bulk_doctors',[[approved.id,approved.id],'archive']),/INVALID_BULK/);
  await assert.rejects(rpc('miyar_bulk_doctors',[[approved.id],'delete']),/INVALID_BULK/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from miyar_request_decisions'),/permission denied/);await assert.rejects(db.query("select miyar_bulk_doctors(array[1]::bigint[],'verify')"),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
test('HTTP decisions require admin and rejection reason; request history ignores forged account IDs',async()=>{
 const calls=[];const env={ADMIN_AUTH_IDS:other};
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts'))return[{auth_id:account,status:'active',university_id:3}];return[];};
 const req=(body)=>new Request('https://test',{method:'POST',body:JSON.stringify(body)});
 const student=createHandler({env,db,authenticate:async()=>({id:account})});
 assert.equal((await student(req({action:'admin',operation:'doctor.bulk',ids:[1],operationType:'verify'}))).status,403);
 await student(req({action:'requests',accountId:other}));assert.equal(calls.find((call)=>call.path==='rpc/miyar_my_requests').body.p_account,account);
 const admin=createHandler({env,db,authenticate:async()=>({id:other})});
 assert.equal((await admin(req({action:'admin',operation:'doctor.reject',id:1}))).status,400);
 assert.equal((await admin(req({action:'admin',operation:'doctor.reject',id:1,reason:'الاسم غير مكتمل'}))).status,200);
 assert.equal(calls.find((call)=>call.path==='rpc/miyar_decide_request').body.p_reason,'الاسم غير مكتمل');
});
