import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {ApiError} from '../supabase/functions/miyar/security.js';
import {guestTokenHash} from '../supabase/functions/miyar/guest.js';
const account='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);

test('individual grades require the new notice, remain anonymous and moderated, and never expose historical private grades',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  for(const id of [account,other]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'اسم خاص',3)",[id]);}
  const d=(await db.query("insert into miyar_doctors(major_id,name,status) values(1,'أحمد محمد العتيبي','approved') returning id")).rows[0].id;
  const submit=(subject,publish=true)=>rpc(db,'miyar_submit_existing_google_review',[account,d,subject,92,80,80,80,'',[],false,null,publish]);
  const old=await rpc(db,'miyar_submit_existing_google_review',[other,d,'استاتيكا',100,80,80,80,'',[],true,'najran-ce-2025/ge101']);
  await db.query("update miyar_reviews set status='published' where id=$1",[old.id]);
  let rows=await rpc(db,'miyar_public_reviews',[d,null]);assert.equal(rows.length,1);assert.ok(!('grade' in rows[0]),'old statistical consent cannot expose an individual grade');
  const fresh=await rpc(db,'miyar_submit_existing_google_review',[account,d,'الاستاتيكا',92,80,80,80,'',[],false,'najran-ce-2025/ge101',true]);
  assert.equal((await rpc(db,'miyar_public_reviews',[d,null])).length,1,'pending grades stay hidden');
  await db.query("update miyar_reviews set status='published' where id=$1",[fresh.id]);
  rows=await rpc(db,'miyar_public_reviews',[d,'الإستاتيكا']);assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id===fresh.id).grade,92);assert.ok(!('grade' in rows.find(r=>r.id===old.id)));
  const planRows=await rpc(db,'miyar_course_reviews',['najran-ce-2025/ge101',d]);assert.equal(planRows.find(r=>r.id===fresh.id).grade,92);assert.ok(!('grade' in planRows.find(r=>r.id===old.id)));
  const serialized=JSON.stringify([rows,planRows]);for(const secret of [account,other,'account_id','guest_id','public_grade_notice_at','اسم خاص'])assert.ok(!serialized.includes(secret));
  await assert.rejects(submit('استاتيكا'),/REVIEW_ALREADY_EXISTS/);
  for(let i=0;i<8;i++)await submit('مقرر '+i);
  const circuits1=await submit('دوائر كهربائية ١');await submit('دوائر كهربائية 2');await assert.rejects(submit('الدوائر الكهربائية 1'),/REVIEW_ALREADY_EXISTS/);
  await db.query("update miyar_reviews set status='rejected' where id=$1",[fresh.id]);assert.ok((await rpc(db,'miyar_public_reviews',[d,null])).every(r=>r.id!==fresh.id));
  await assert.rejects(rpc(db,'miyar_request_edit',[account,circuits1.id,'مادة ثانية','',80,80,80,[]]),/REVIEW_UNAVAILABLE/);
  const g=await rpc(db,'miyar_open_guest',['a'.repeat(64),null]),foreign=await rpc(db,'miyar_open_guest',['b'.repeat(64),null]);await rpc(db,'miyar_choose_university',[null,g.id,3]);await rpc(db,'miyar_choose_university',[null,foreign.id,3]);
  const gr=await rpc(db,'miyar_submit_existing_guest_review',[g.id,d,'مادة زائر',87,80,80,80,'',[],false,null,true]);
  await db.query("update miyar_reviews set status='published' where id=$1",[gr.id]);assert.equal((await rpc(db,'miyar_public_reviews',[d,'مادة زائر']))[0].grade,87);
  assert.equal((await rpc(db,'miyar_review_eligibility',[null,g.id,d,'مادة زائر'])).canEdit,true);
  await assert.rejects(rpc(db,'miyar_request_guest_edit',[foreign.id,gr.id,'مادة زائر','',70,70,70,[]]),/REVIEW_UNAVAILABLE/);
  await assert.rejects(rpc(db,'miyar_request_guest_edit',[g.id,gr.id,'مادة أخرى','',70,70,70,[]]),/REVIEW_SUBJECT_LOCKED/);
  const edit=await rpc(db,'miyar_request_guest_edit',[g.id,gr.id,'مادة زائر','تجربة معدّلة',70,70,70,['متعاون ومتفهم']]);
  assert.equal((await rpc(db,'miyar_guest_reviews',[g.id]))[0].edit_status,'pending');assert.equal((await rpc(db,'miyar_public_reviews',[d,'مادة زائر']))[0].comment,'');
  await rpc(db,'miyar_moderate_edit',[edit.id,true]);assert.equal((await rpc(db,'miyar_public_reviews',[d,'مادة زائر']))[0].comment,'تجربة معدّلة');
  await rpc(db,'miyar_link_review_identity',[account,g.id]);assert.ok((await rpc(db,'miyar_my_reviews',[account])).some(r=>r.id===gr.id));
  const linkedEdit=await rpc(db,'miyar_request_edit',[account,gr.id,'مادة زائر','تعديل بالحساب',60,60,60,[]]);await rpc(db,'miyar_moderate_edit',[linkedEdit.id,true]);assert.equal((await rpc(db,'miyar_public_reviews',[d,'مادة زائر']))[0].comment,'تعديل بالحساب');
  // A forged moderation row cannot overwrite another identity's evaluation.
  const forged=(await db.query("insert into miyar_review_edits(account_id,review_id,subject,comment,explanation,treatment,grading) values($1,$2,'مادة زائر','تعديل مزور',0,0,0) returning id",[other,gr.id])).rows[0].id;
  await assert.rejects(rpc(db,'miyar_moderate_edit',[forged,true]),/REVIEW_UNAVAILABLE/);
  await db.query("update miyar_doctors set status='archived' where id=$1",[d]);await assert.rejects(rpc(db,'miyar_public_reviews',[d,null]),/DOCTOR_UNAVAILABLE/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select grade from miyar_reviews'),/permission denied/);await assert.rejects(rpc(db,'miyar_public_reviews',[d,null]),/permission denied/);await assert.rejects(rpc(db,'miyar_guest_reviews',[g.id]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('new-grade notice and subject checks bind verified identities; retired grade map routes are unavailable',async()=>{
 const token='a'.repeat(64),guest='33333333-3333-4333-8333-333333333333',digest=await guestTokenHash(token),calls=[];
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:account,status:'active',university_id:3}];if(path.startsWith('miyar_guest_sessions?'))return path.includes(digest)?[{id:guest,status:'active',university_id:3}]:[];if(path==='rpc/miyar_guest_reviews')return[];return{id:1,status:'pending',eligible:true};};
 const handle=createHandler({db,env:{},authenticate:async request=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:account};}});
 const req=(body,headers={})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify(body)});
 const review={college:'كلية الهندسة',major:'الهندسة المدنية',name:'أحمد محمد العتيبي',subject:'استاتيكا',grade:92,scores:[80,80,80],comment:'',pledged:true,publishGrade:true,existingDoctorId:1};
 for(const [action,headers,actor,key]of [['submit',{authorization:'Bearer verified'},account,'p_account'],['guest.submit',{'x-miyar-guest':token},guest,'p_guest']]){
  assert.equal((await handle(req({...review,action,accountId:other,guestId:other},headers))).status,201);
  const call=calls.findLast(c=>c.path.includes('submit_existing'));assert.equal(call.body[key],actor);assert.equal(call.body.p_public_grade,true);
  assert.equal((await handle(req({...review,action,publishGrade:'true'},headers))).status,400);
  assert.equal((await handle(req({action:action==='submit'?'review.eligibility':'guest.review.eligibility',doctor:1,subject:'استاتيكا'},headers))).status,200);
  assert.equal(calls.findLast(c=>c.path==='rpc/miyar_review_eligibility').body.p_subject,'استاتيكا');
 }
 for(const action of ['doctor.grades','grade.consent','grade.participation','guest.grade.consent','guest.grade.participation'])assert.equal((await handle(req({action,doctor:1}))).status,404);
 assert.equal((await handle(req({action:'guest.mine'},{'x-miyar-guest':token}))).status,200);assert.equal(calls.findLast(c=>c.path==='rpc/miyar_guest_reviews').body.p_guest,guest);
 assert.equal((await handle(req({...review,action:'guest.edit',review:1,guestId:other},{'x-miyar-guest':token}))).status,201);assert.equal(calls.findLast(c=>c.path==='rpc/miyar_request_guest_edit').body.p_guest,guest);
 assert.equal((await handle(req({...review,action:'guest.edit',review:1},{'x-miyar-guest':'b'.repeat(64)}))).status,401);
});
