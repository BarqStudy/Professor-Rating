import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {ApiError} from '../supabase/functions/miyar/security.js';
import {guestTokenHash} from '../supabase/functions/miyar/guest.js';

test('grade map requires explicit consent and ten distinct published contributors per course; withdrawal and moderation take effect immediately',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const accounts=Array.from({length:13},(_,i)=>`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`);
  for(const id of accounts){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const submit=async(actor,subject,grade,consent)=>rpc('miyar_submit_google_review',[actor,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي',subject,grade,80,80,80,'',[],consent]);
  const reviews=[];
  for(let i=0;i<9;i++)reviews.push(await submit(accounts[i],i%2?'ميكانيكا':' ميكانيكا ',i<5?95:75,true));
  const d=(await db.query('select id from miyar_doctors limit 1')).rows[0].id;
  await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published';");
  let map=await rpc('miyar_grade_distribution',[d,'ميكانيكا']);
  assert.equal(map.available,false);for(const key of ['total','average','highPercent','bins'])assert.ok(!(key in map));
  const privateReview=await submit(accounts[9],'ميكانيكا',100,false);await db.query("update miyar_reviews set status='published' where id=$1",[privateReview.id]);
  assert.equal((await rpc('miyar_grade_distribution',[d,'ميكانيكا'])).available,false);
  await rpc('miyar_set_grade_consent',[accounts[9],null,privateReview.id,true,'ميكانيكا']);
  map=await rpc('miyar_grade_distribution',[d,'ميكانيكا']);
  assert.equal(map.total,10);assert.equal(map.average,87.5);assert.equal(map.highPercent,60);
  await assert.rejects(rpc('miyar_set_grade_consent',[accounts[9],null,privateReview.id,true,'مادة تغيرت']),/GRADE_SUBJECT_CHANGED/);
  assert.deepEqual(map.bins.map(b=>b.count),[6,0,4,0,0]);
  for(const value of [...accounts,'account_id','guest_id','created_at'])assert.ok(!JSON.stringify(map).includes(value));
  assert.equal((await rpc('miyar_grade_distribution',[d,null])).available,false);
  assert.equal((await rpc('miyar_grade_distribution',[d,'مادة أخرى'])).available,false);
  const duplicate=await submit(accounts[0],'  ميكانيكا  ',55,true);await db.query("update miyar_reviews set status='published' where id=$1",[duplicate.id]);
  assert.equal((await rpc('miyar_grade_distribution',[d,'ميكانيكا'])).total,10,'one identity cannot inflate a course sample');
  await rpc('miyar_set_grade_consent',[accounts[9],null,privateReview.id,false]);
  assert.equal((await rpc('miyar_grade_distribution',[d,'ميكانيكا'])).available,false);
  await assert.rejects(rpc('miyar_set_grade_consent',[accounts[8],null,privateReview.id,true,'ميكانيكا']),/GRADE_REVIEW_NOT_FOUND/);
  await assert.rejects(rpc('miyar_set_grade_consent',[accounts[9],accounts[8],privateReview.id,true,'ميكانيكا']),/INVALID_GRADE_CONSENT/);
  await db.query("update miyar_accounts set status='restricted' where auth_id=$1",[accounts[9]]);
  await assert.rejects(rpc('miyar_set_grade_consent',[accounts[9],null,privateReview.id,true,'ميكانيكا']),/ACCOUNT_RESTRICTED/);
  await rpc('miyar_set_grade_consent',[accounts[9],null,privateReview.id,false]);
  await db.query("update miyar_accounts set status='active' where auth_id=$1",[accounts[9]]);
  await rpc('miyar_set_grade_consent',[accounts[9],null,privateReview.id,true,'ميكانيكا']);
  await db.query("update miyar_reviews set status='rejected' where id=$1",[privateReview.id]);
  assert.equal((await rpc('miyar_grade_distribution',[d,'ميكانيكا'])).available,false);
  const guest=await rpc('miyar_open_guest',['a'.repeat(64),null]);await db.query('update miyar_guest_sessions set university_id=3 where id=$1',[guest.id]);
  const gr=await rpc('miyar_guest_submit',[guest.id,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي','ميكانيكا',90,80,80,80,'',[],true]);
  assert.equal((await rpc('miyar_grade_distribution',[d,'ميكانيكا'])).available,false,'pending grades never count');
  await db.query("update miyar_reviews set status='published' where id=$1",[gr.id]);assert.equal((await rpc('miyar_grade_distribution',[d,'ميكانيكا'])).total,10);
  const own=await rpc('miyar_grade_participation',[null,guest.id,null]);assert.equal(own.length,1);assert.equal(own[0].share_grade,true);assert.ok(!('grade' in own[0]));
  assert.deepEqual(await rpc('miyar_grade_participation',[accounts[12],null,null]),[]);
  await db.query("update miyar_reviews set subject='مادة مصححة' where id=$1",[gr.id]);
  assert.equal((await rpc('miyar_grade_participation',[null,guest.id,null]))[0].share_grade,false,'a corrected course does not silently reuse an earlier grade consent');
  await rpc('miyar_set_grade_consent',[null,guest.id,gr.id,false]);assert.equal((await rpc('miyar_grade_distribution',[d,'ميكانيكا'])).available,false);
  const legacy=await rpc('miyar_submit_google_review',[accounts[11],'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي','قديم',95,80,80,80,'',[]]);
  assert.equal((await db.query('select share_grade from miyar_reviews where id=$1',[legacy.id])).rows[0].share_grade,false);
  await db.query("update miyar_doctors set status='archived' where id=$1",[d]);await assert.rejects(rpc('miyar_grade_distribution',[d,'ميكانيكا']),/GRADE_DOCTOR_NOT_FOUND/);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select grade,share_grade from miyar_reviews'),/permission denied/);
   await assert.rejects(db.query('select miyar_grade_distribution($1,$2)',[d,'ميكانيكا']),/permission denied/);
   await assert.rejects(db.query('select miyar_set_grade_consent($1,null,$2,true)',[accounts[0],reviews[0].id]),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});

test('grade HTTP routes bind verified owners, enforce consent types and expose only thresholded RPC output',async()=>{
 const account='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222',token='a'.repeat(64),digest=await guestTokenHash(token),calls=[];
 const db=async(path,options={})=>{
  calls.push({path,...options});
  if(path.startsWith('miyar_accounts?'))return[{auth_id:account,status:'active',university_id:3}];
  if(path.startsWith('miyar_guest_sessions?'))return path.includes(digest)?[{id:guest,status:'active',university_id:3}]:[];
  if(path==='rpc/miyar_grade_participation')return[];
  if(path==='rpc/miyar_grade_distribution')return{available:false,minimum:10,subjects:[],subject:'ميكانيكا'};
  return{ok:true};
 };
 const handle=createHandler({db,env:{},authenticate:async(request)=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:account};}});
 const req=(body,headers={})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal((await handle(req({action:'doctor.grades',doctor:1,subject:'ميكانيكا'}))).status,200);
 assert.equal((await handle(req({action:'grade.consent',review:1,shareGrade:true}))).status,401);
 assert.equal((await handle(req({action:'grade.consent',review:1,shareGrade:true,subject:'ميكانيكا',accountId:guest},{authorization:'Bearer verified'}))).status,200);
 assert.equal(calls.find(c=>c.path==='rpc/miyar_set_grade_consent').body.p_account,account);
 for(const shareGrade of [undefined,'true',1,null])assert.equal((await handle(req({action:'grade.consent',review:1,shareGrade},{authorization:'Bearer verified'}))).status,400);
 assert.equal((await handle(req({action:'guest.grade.consent',review:2,shareGrade:false,guestId:account},{'x-miyar-guest':token}))).status,200);
 assert.equal(calls.filter(c=>c.path==='rpc/miyar_set_grade_consent').at(-1).body.p_guest,guest);
 assert.equal((await handle(req({action:'guest.grade.participation'},{'x-miyar-guest':'b'.repeat(64)}))).status,401);
 assert.equal((await handle(req({action:'doctor.grades',doctor:1,subject:'x'}))).status,400);
});
