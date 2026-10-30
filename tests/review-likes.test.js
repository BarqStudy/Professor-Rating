import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {ApiError} from '../supabase/functions/miyar/security.js';
import {guestTokenHash} from '../supabase/functions/miyar/guest.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);

test('helpful votes are idempotent, anonymous and publication-scoped, with one vote per linked guest/member identity',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  for(const id of [a,b]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const d=(await db.query("insert into miyar_doctors(major_id,name,status) values(1,'أحمد محمد العتيبي','approved') returning id")).rows[0].id;
  const review=await rpc(db,'miyar_submit_existing_google_review',[a,d,'استاتيكا',92,80,80,80,'تجربة مفيدة',[],false,'najran-ce-2025/ge101',true]);
  const pending=await rpc(db,'miyar_submit_existing_google_review',[a,d,'مادة أخرى',90,80,80,80,'',[],false,null,true]);
  const set=(account,guest,liked)=>rpc(db,'miyar_set_review_like',[account,guest,review.id,liked]);
  await assert.rejects(set(a,null,true),/REVIEW_UNAVAILABLE/);
  await db.query("update miyar_reviews set status='published' where id=$1",[review.id]);
  assert.deepEqual(await set(a,null,true),{review:review.id,liked:true,likes:1});assert.equal((await set(a,null,true)).likes,1,'retry is not a toggle or an extra vote');
  assert.equal((await set(b,null,true)).likes,2);assert.equal((await set(a,null,false)).likes,1);assert.equal((await set(a,null,false)).likes,1);
  const guest=await rpc(db,'miyar_open_guest',['a'.repeat(64),null]);await rpc(db,'miyar_choose_university',[null,guest.id,3]);
  assert.equal((await set(null,guest.id,true)).likes,2);assert.equal((await set(a,null,true)).likes,3);
  await rpc(db,'miyar_link_review_identity',[a,guest.id]);assert.equal(await rpc(db,'miyar_review_like_count',[review.id]),2,'linking merges guest/member votes without exposing either identity');
  const state=await rpc(db,'miyar_review_like_states',[a,null,[review.id,pending.id]]);assert.deepEqual(state,[{review:review.id,likes:2,liked:true}]);
  assert.equal((await set(a,null,true)).likes,2);assert.equal((await set(null,guest.id,false)).likes,1,'unlike clears both parts of the linked identity');
  assert.equal((await rpc(db,'miyar_review_like_states',[a,null,[review.id]]))[0].liked,false);
  const publicRows=await rpc(db,'miyar_public_reviews',[d,null]),planRows=await rpc(db,'miyar_course_reviews',['najran-ce-2025/ge101',d]);
  assert.equal(publicRows[0].likes,1);assert.equal(planRows[0].likes,1);assert.equal(publicRows[0].grade,92);
  for(const secret of [a,b,guest.id,'account_id','guest_id','public_grade_notice_at'])assert.ok(!JSON.stringify([publicRows,planRows,state]).includes(secret));
  await db.query("update miyar_accounts set status='restricted' where auth_id=$1",[b]);await assert.rejects(set(b,null,false),/ACCOUNT_RESTRICTED/);assert.equal((await rpc(db,'miyar_review_like_states',[b,null,[review.id]]))[0].liked,true);
  await db.query("update miyar_accounts set status='banned' where auth_id=$1",[b]);assert.equal(await rpc(db,'miyar_review_like_count',[review.id]),0);
  await db.query("update miyar_accounts set status='active',university_id=1 where auth_id=$1",[b]);await assert.rejects(set(b,null,true),/REVIEW_UNAVAILABLE/);assert.deepEqual(await rpc(db,'miyar_review_like_states',[b,null,[review.id]]),[]);
  await db.query("update miyar_reviews set status='rejected' where id=$1",[review.id]);await assert.rejects(set(a,null,true),/REVIEW_UNAVAILABLE/);assert.deepEqual(await rpc(db,'miyar_review_like_states',[a,null,[review.id]]),[]);assert.deepEqual(await rpc(db,'miyar_public_reviews',[d,null]),[]);
  await db.query("update miyar_reviews set status='published' where id=$1",[review.id]);await db.query("update miyar_doctors set status='archived' where id=$1",[d]);await assert.rejects(set(a,null,true),/REVIEW_UNAVAILABLE/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from miyar_review_likes'),/permission denied/);await assert.rejects(set(a,null,true),/permission denied/);await assert.rejects(rpc(db,'miyar_review_like_states',[a,null,[review.id]]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('helpful HTTP routes bind verified actors, link guest votes on sign-in and reject forged payloads',async()=>{
 const guest='33333333-3333-4333-8333-333333333333',token='a'.repeat(64),digest=await guestTokenHash(token),calls=[];let status='active';
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:a,status,university_id:3}];if(path.startsWith('miyar_guest_sessions?'))return path.includes(digest)?[{id:guest,status:'active',university_id:3}]:[];if(path==='rpc/miyar_review_like_states')return[{review:51,likes:1,liked:true}];if(path==='rpc/miyar_set_review_like')return{review:51,likes:1,liked:true};return{linked:true};};
 const handle=createHandler({db,env:{},authenticate:async request=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:a};}}),req=(body,headers={})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify(body)});
 const member={authorization:'Bearer verified','x-miyar-guest':token};
 assert.equal((await handle(req({action:'review.like',review:51,liked:true,accountId:b,guestId:b},member))).status,200);
 assert.deepEqual(calls.find(c=>c.path==='rpc/miyar_set_review_like').body,{p_account:a,p_guest:null,p_review:51,p_liked:true});
 assert.ok(calls.findIndex(c=>c.path==='rpc/miyar_link_review_identity')<calls.findIndex(c=>c.path==='rpc/miyar_set_review_like'));
 assert.equal((await handle(req({action:'guest.review.like',review:51,liked:false,guestId:b},{'x-miyar-guest':token}))).status,200);assert.equal(calls.findLast(c=>c.path==='rpc/miyar_set_review_like').body.p_guest,guest);
 for(const liked of [undefined,'true',1,null])assert.equal((await handle(req({action:'review.like',review:51,liked},member))).status,400);
 for(const review of [0,-1,'51',{},1.2])assert.equal((await handle(req({action:'review.like',review,liked:true},member))).status,400);
 assert.equal((await handle(req({action:'review.likes',reviews:[51,51]},member))).status,200);assert.deepEqual(calls.findLast(c=>c.path==='rpc/miyar_review_like_states').body,{p_account:a,p_guest:null,p_reviews:[51]});
 for(const reviews of [null,{},[0],Array(101).fill(51)])assert.equal((await handle(req({action:'review.likes',reviews},member))).status,400);
 assert.equal((await handle(req({action:'review.like',review:51,liked:true}))).status,401);assert.equal((await handle(req({action:'guest.review.like',review:51,liked:true},{'x-miyar-guest':'b'.repeat(64)}))).status,401);
 status='banned';assert.equal((await handle(req({action:'review.like',review:51,liked:true},member))).status,403);
});
