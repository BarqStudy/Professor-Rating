import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {guestTokenHash} from '../supabase/functions/miyar/guest.js';
import {validateReview} from '../supabase/functions/miyar/security.js';
const account='11111111-1111-4111-8111-111111111111',tab1='22222222-2222-4222-8222-222222222222',tab2='33333333-3333-4333-8333-333333333333';
const review={college:'كلية الهندسة',major:'الهندسة المدنية',name:'أحمد محمد العتيبي',subject:'ميكانيكا',grade:95,scores:[90,80,70],comment:'',tags:['يوصل المعلومة'],pledged:true};
test('optional comments and explicit descriptors are validated without inventing prose',()=>{
 assert.equal(validateReview(review).comment,'');assert.deepEqual(validateReview(review).tags,['يوصل المعلومة']);
 assert.equal(validateReview({...review,comment:undefined}).comment,'');
 assert.throws(()=>validateReview({...review,tags:['وصف غير مسموح']}));
 assert.throws(()=>validateReview({...review,tags:['محاضرة ممتعة','محاضرة مملة']}));
 assert.throws(()=>validateReview({...review,comment:'غبي'}));
});
test('guest reviews are private, moderated, university-scoped and rate-limited; presence counts distinct recent visible sessions',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);');
  for(const name of ['202610240001_miyar.sql','202610240002_google_auth.sql','202610250001_universities.sql','202610250002_community.sql','202610250003_experience.sql','202610250004_guest_ratings.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  const guest=await rpc('miyar_open_guest',['a'.repeat(64),null]);const other=await rpc('miyar_open_guest',['b'.repeat(64),null]);
  assert.equal((await rpc('miyar_touch_presence',[guest.id,tab1,true])).online,1);
  assert.equal((await rpc('miyar_touch_presence',[guest.id,tab2,true])).online,1);
  assert.equal((await rpc('miyar_touch_presence',[other.id,tab1,true])).online,2);
  assert.equal((await rpc('miyar_touch_presence',[guest.id,tab1,false])).online,2);
  assert.equal((await rpc('miyar_touch_presence',[guest.id,tab2,false])).online,1);
  await db.query("update miyar_presence set seen_at=now()-interval '91 seconds' where guest_id=$1",[other.id]);
  assert.equal((await rpc('miyar_touch_presence',[guest.id,tab1,true])).online,1);
  const submit=async(id,subject='ميكانيكا')=>rpc('miyar_guest_submit',[id,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي',subject,95,90,80,70,'',['يوصل المعلومة']]);
  await assert.rejects(submit(guest.id),/UNIVERSITY_REQUIRED/);
  await db.query('update miyar_guest_sessions set university_id=3 where id=$1',[guest.id]);
  const result=await submit(guest.id);assert.equal(result.status,'pending');
  let row=(await db.query('select * from miyar_reviews where id=$1',[result.id])).rows[0];
  assert.equal(row.comment,'');assert.equal(row.account_id,null);assert.equal(row.guest_id,guest.id);assert.ok(row.pledged_at);assert.deepEqual(row.tags,['يوصل المعلومة']);
  await assert.rejects(submit(guest.id),/unique constraint/);
  for(let i=0;i<4;i++)await submit(guest.id,'مادة '+i);
  await assert.rejects(submit(guest.id,'مادة زائدة'),/RATE_LIMIT/);
  await db.query('update miyar_guest_sessions set university_id=1 where id=$1',[other.id]);
  await assert.rejects(submit(other.id),/INVALID_MAJOR/);
  await db.query("update miyar_guest_sessions set status='restricted' where id=$1",[guest.id]);
  await assert.rejects(submit(guest.id,'مادة أخرى'),/ACCOUNT_RESTRICTED/);
  await db.query("update miyar_guest_sessions set status='banned' where id=$1",[guest.id]);
  assert.equal((await rpc('miyar_touch_presence',[other.id,tab2,true])).online,1);
  await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published'");
  const catalogue=await rpc('miyar_catalogue',[]);assert.ok(!JSON.stringify(catalogue).includes(guest.id));assert.ok(!JSON.stringify(catalogue).includes('token_hash'));
  await db.query('insert into auth.users values($1)',[account]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[account]);
  const google=await rpc('miyar_submit_google_review',[account,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي','مادة حساب',90,90,90,90,'',['متعاون ومتفهم']]);
  row=(await db.query('select * from miyar_reviews where id=$1',[google.id])).rows[0];assert.equal(row.guest_id,null);assert.equal(row.account_id,account);assert.ok(row.pledged_at);
  await assert.rejects(db.query('update miyar_reviews set guest_id=$1 where id=$2',[other.id,google.id]),/miyar_review_single_identity/);
  await db.query("update miyar_reviews set status='published' where id=$1",[google.id]);
  const edit=await rpc('miyar_request_edit',[account,google.id,'مادة حساب','',80,80,80,['محاضرة ممتعة']]);
  await rpc('miyar_decide_request',['edit',edit.id,true,'']);
  const edited=(await rpc('miyar_my_reviews',[account])).find((item)=>item.id===google.id);
  assert.deepEqual(edited.tags,['محاضرة ممتعة']);assert.equal(edited.comment,'');
  await assert.rejects(rpc('miyar_submit_google_review',[account,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي','يجب التراجع',90,90,90,90,'',['غير مسموح']]),/miyar_review_tags/);
  assert.equal((await db.query("select count(*)::int as n from miyar_reviews where subject='يجب التراجع'")).rows[0].n,0);

  for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['miyar_guest_sessions','miyar_presence'])await assert.rejects(db.query('select * from '+table),/permission denied/);await assert.rejects(db.query("select miyar_touch_presence($1,$2,true)",[guest.id,tab1]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
test('guest HTTP writes require an unguessable session and pledge; cannot impersonate accounts/admins or forge presence counts',async()=>{
 const calls=[];let digest='',status='active';
 const db=async(path,options={})=>{calls.push({path,...options});if(path==='rpc/miyar_open_guest'){digest=options.body.p_token_hash;assert.equal(options.body.p_network_hash.length,64);return{id:account,university_id:3,status};}if(path.startsWith('miyar_guest_sessions?token_hash='))return path.includes(digest)?[{id:account,university_id:3,status}]:[];if(path==='rpc/miyar_touch_presence')return{online:2};if(path==='rpc/miyar_guest_submit')return{id:12,status:'pending'};return[];};
 const handle=createHandler({env:{GUEST_PEPPER:'server-only-test-key'},db});
 const req=(body,token='')=>new Request('https://test',{method:'POST',headers:{'x-forwarded-for':'192.0.2.1',...(token?{'x-miyar-guest':token}:{})},body:JSON.stringify(body)});
 const opened=await handle(req({action:'guest.start'}));const session=await opened.json();assert.match(session.token,/^[a-f0-9]{64}$/);assert.equal(await guestTokenHash(session.token),digest);assert.ok(!JSON.stringify(session).includes(digest));
 assert.equal((await handle(req({action:'guest.submit',...review,guestId:tab1,accountId:tab2,isAdmin:true},session.token))).status,201);
 const call=calls.find((entry)=>entry.path==='rpc/miyar_guest_submit');assert.equal(call.body.p_guest,account);assert.equal(call.body.p_comment,'');assert.deepEqual(call.body.p_tags,['يوصل المعلومة']);assert.ok(!('status' in call.body));
 assert.equal((await handle(req({action:'guest.submit',...review,pledged:false},session.token))).status,400);
 assert.equal((await handle(req({action:'guest.submit',...review},'c'.repeat(64)))).status,401);
 const presence=await handle(req({action:'guest.presence',tabId:tab1,visible:true,online:80},session.token));assert.equal((await presence.json()).online,2);
 assert.equal((await handle(req({action:'admin',operation:'doctor.bulk',ids:[1],operationType:'archive'},session.token))).status,401);
 status='banned';assert.equal((await handle(req({action:'guest.submit',...review},session.token))).status,403);
});
