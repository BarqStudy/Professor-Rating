import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
test('community workflow keeps published content until approval, enforces ownership/university, moderates reports and emits publication-only saved updates',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  for(const name of ['202610240001_miyar.sql','202610240002_google_auth.sql','202610250001_universities.sql','202610250002_community.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  for(const id of [a,b]){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const rpc=async(name,args)=> (await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  const doctor=await rpc('miyar_request_doctor',[a,1,'أحمد محمد العتيبي']);
  assert.equal(doctor.status,'pending');assert.equal((await db.query('select count(*)::int as n from miyar_reviews')).rows[0].n,0);
  assert.equal((await rpc('miyar_request_doctor',[a,1,'أحمد محمد العتيبي'])).existing,true);
  await db.query("update miyar_doctors set status='approved' where id=$1",[doctor.id]);
  const review=await rpc('miyar_submit_google_review',[a,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي','ميكانيكا',95,90,90,90,'شرح واضح وتجربة مفيدة']);
  assert.deepEqual(await rpc('miyar_saved_updates',[3,[doctor.id]]),[]);
  await db.query("update miyar_reviews set status='published' where id=$1",[review.id]);
  const notifications=await rpc('miyar_saved_updates',[3,[doctor.id]]);
  assert.equal(notifications.length,1);assert.equal(notifications[0].review_id,review.id);
  assert.deepEqual(await rpc('miyar_saved_updates',[1,[doctor.id]]),[]);
  assert.ok(!JSON.stringify(notifications).includes(a));
  const publication=notifications[0].published_at;
  await assert.rejects(rpc('miyar_request_edit',[b,review.id,'ميكانيكا','تعليق غير مصرح',60,60,60]),/REVIEW_UNAVAILABLE/);
  const edit=await rpc('miyar_request_edit',[a,review.id,'ميكانيكا','تجربة محدثة وواضحة',60,70,80]);
  await assert.rejects(rpc('miyar_request_edit',[a,review.id,'ميكانيكا','طلب مكرر',50,50,50]),/PENDING_EDIT/);
  let row=(await db.query('select * from miyar_reviews where id=$1',[review.id])).rows[0];
  assert.equal(row.comment,'شرح واضح وتجربة مفيدة');assert.equal(row.explanation,90);
  const queue=await rpc('miyar_community_queue',[]);
  assert.equal(queue.edits[0].old_comment,row.comment);assert.equal(queue.edits[0].comment,'تجربة محدثة وواضحة');assert.ok(!('grade' in queue.edits[0]));
  await rpc('miyar_moderate_edit',[edit.id,false]);
  assert.equal((await db.query('select comment from miyar_reviews where id=$1',[review.id])).rows[0].comment,row.comment);
  const edit2=await rpc('miyar_request_edit',[a,review.id,'ميكانيكا','تجربة جديدة بعد الموافقة',60,70,80]);
  await rpc('miyar_moderate_edit',[edit2.id,true]);
  row=(await db.query('select * from miyar_reviews where id=$1',[review.id])).rows[0];
  assert.equal(row.comment,'تجربة جديدة بعد الموافقة');assert.equal(row.explanation,60);assert.equal(row.grade,95);assert.equal(row.status,'published');
  assert.equal((await rpc('miyar_saved_updates',[3,[doctor.id]]))[0].published_at,publication);
  await assert.rejects(rpc('miyar_moderate_edit',[edit2.id,true]),/REQUEST_NOT_FOUND/);
  assert.equal((await rpc('miyar_my_reviews',[b])).length,0);
  const mine=await rpc('miyar_my_reviews',[a]);assert.equal(mine[0].edit_status,'approved');assert.ok(!('grade' in mine[0]));
  const report=await rpc('miyar_submit_report',[b,review.id,'personal','تفاصيل البلاغ']);
  await assert.rejects(rpc('miyar_submit_report',[b,review.id,'abuse','']),/ALREADY_REPORTED/);
  await rpc('miyar_moderate_report',[report.id,false]);
  assert.equal((await db.query('select status from miyar_reviews where id=$1',[review.id])).rows[0].status,'published');
  const report2=await rpc('miyar_submit_report',[a,review.id,'irrelevant','']);
  await rpc('miyar_moderate_report',[report2.id,true]);
  assert.equal((await db.query('select status from miyar_reviews where id=$1',[review.id])).rows[0].status,'rejected');
  assert.deepEqual(await rpc('miyar_saved_updates',[3,[doctor.id]]),[]);
  await db.query("update miyar_accounts set university_id=1,major_id=null where auth_id=$1",[b]);
  await assert.rejects(rpc('miyar_request_doctor',[b,1,'خالد عبدالله الحربي']),/INVALID_MAJOR/);
  await db.query("update miyar_accounts set status='restricted' where auth_id=$1",[a]);
  await assert.rejects(rpc('miyar_request_doctor',[a,1,'خالد عبدالله الحربي']),/ACCOUNT_RESTRICTED/);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const table of ['miyar_review_edits','miyar_reports'])await assert.rejects(db.query('select * from '+table),/permission denied/);
   await assert.rejects(db.query('select miyar_moderate_edit(1,true)'),/permission denied/);
   await assert.rejects(db.query('select miyar_my_reviews($1)',[a]),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});
test('community HTTP actions bind authenticated identity and cannot invoke admin moderation',async()=>{
 const calls=[];
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts'))return[{auth_id:a,status:'active',university_id:3}];return{ok:true};};
 const handler=createHandler({env:{},db,authenticate:async()=>({id:a})});
 const request=(body)=>new Request('https://test',{method:'POST',body:JSON.stringify(body)});
 const edit={action:'edit',review:1,subject:'ميكانيكا',comment:'تجربة محدثة وواضحة',scores:[70,80,90],userId:b};
 assert.equal((await handler(request(edit))).status,201);
 assert.equal(calls.find((call)=>call.path==='rpc/miyar_request_edit').body.p_account,a);
 assert.equal((await handler(request({...edit,comment:'غبي'}))).status,400);
 assert.equal((await handler(request({action:'admin',operation:'edit.approve',id:1,isAdmin:true}))).status,403);
 assert.equal((await handler(request({action:'notifications',doctors:Array.from({length:101},(_,i)=>i+1)}))).status,400);
 assert.equal((await handler(request({action:'notifications',doctors:[1],universityId:1}))).status,200);
 assert.equal(calls.find((call)=>call.path==='rpc/miyar_saved_updates').body.p_university,3);
});
