import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {plansForStudent} from '../src/student-major.js';
import {handleGuest,guestTokenHash} from '../supabase/functions/miyar/guest.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
const account='11111111-1111-4111-8111-111111111111';
test('student plans match the selected university, college and specialty including explicit aliases',()=>{
 const plan={id:'civil',university:'جامعة نجران',college:'كلية الهندسة',major:'الهندسة المدنية'};
 const list=[plan,{...plan,id:'foreign',university:'جامعة ثانية'},{...plan,id:'other-college',college:'كلية ثانية'},{...plan,id:'mechanics',major:'الهندسة الميكانيكية'},{...plan,id:'architecture',major:'العمارة',majorAliases:['الهندسة المعمارية']}];
 assert.deepEqual(plansForStudent(list,plan),[plan]);assert.deepEqual(plansForStudent(list,{...plan,major:'الْهَنْدَسَة المَدَنِيَّة'}),[plan]);
 assert.deepEqual(plansForStudent(list,{...plan,major:'الهندسة المعمارية'}).map(p=>p.id),['architecture']);
 assert.deepEqual(plansForStudent(list,{...plan,major:'تخصص غير مضاف'}),[]);assert.deepEqual(plansForStudent(list,{...plan,major:null}),[]);
});
test('member and guest specialties persist privately, reject foreign or archived majors and reset only on actual university changes',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  await db.query('insert into auth.users(id) values($1)',[account]);await db.query("insert into miyar_accounts(auth_id,name,level) values($1,'اسم الطالب',5)",[account]);
  const token='a'.repeat(64),guest=await rpc('miyar_open_guest',[await guestTokenHash(token),null]);
  const university=(await db.query("insert into miyar_universities(name,enabled) values('جامعة الاختبار',true) returning id")).rows[0].id;
  const college=(await db.query("insert into miyar_colleges(name,university_id) values('كلية اختبار',$1) returning id",[university])).rows[0].id;
  const foreign=(await db.query("insert into miyar_majors(name,college_id) values('تخصص اختبار',$1) returning id",[college])).rows[0].id;
  const removed=(await db.query("insert into miyar_majors(name,college_id,deleted_at) values('تخصص محذوف',1,now()) returning id")).rows[0].id;
  for(const actor of [[account,null],[null,guest.id]]){
   await assert.rejects(rpc('miyar_choose_major',[...actor,1]),/UNIVERSITY_REQUIRED/);
   await rpc('miyar_choose_university',[...actor,3]);
   assert.equal((await rpc('miyar_choose_major',[...actor,1])).major_id,1);
   await assert.rejects(rpc('miyar_choose_major',[...actor,foreign]),/INVALID_UNIVERSITY_MAJOR/);await assert.rejects(rpc('miyar_choose_major',[...actor,removed]),/INVALID_UNIVERSITY_MAJOR/);
   await rpc('miyar_choose_university',[...actor,3]);
   const table=actor[0]?'miyar_accounts':'miyar_guest_sessions',field=actor[0]?'auth_id':'id',id=actor[0]||actor[1];
   assert.equal((await db.query(`select major_id from ${table} where ${field}=$1`,[id])).rows[0].major_id,1);
   await rpc('miyar_choose_university',[...actor,university]);assert.equal((await db.query(`select major_id from ${table} where ${field}=$1`,[id])).rows[0].major_id,null);
   await rpc('miyar_choose_university',[...actor,3]);
  }
  assert.deepEqual((await db.query('select name,level from miyar_accounts where auth_id=$1',[account])).rows[0],{name:'اسم الطالب',level:5});
  await assert.rejects(rpc('miyar_choose_major',[account,guest.id,1]),/ACCOUNT_RESTRICTED/);
  await db.query("update miyar_guest_sessions set status='restricted' where id=$1",[guest.id]);await assert.rejects(rpc('miyar_choose_major',[null,guest.id,1]),/ACCOUNT_RESTRICTED/);
  await db.exec("set role anon");await assert.rejects(rpc('miyar_choose_major',[account,null,1]),/permission denied/);await assert.rejects(db.query('select major_id from miyar_guest_sessions'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('major endpoints bind verified identities and expose the saved specialty only to its guest',async()=>{
 const calls=[],guest={id:account,university_id:3,major_id:1,status:'active'},db=async(path,options)=>{calls.push({path,options});if(path.startsWith('miyar_guest_sessions?'))return [guest];if(path.startsWith('miyar_accounts?'))return [{auth_id:account,status:'active',university_id:3}];if(path==='rpc/miyar_choose_major')return {university_id:3,major_id:options.body.p_major};return [];};
 const request=new Request('https://miyar.test',{headers:{'x-miyar-guest':'a'.repeat(64)}});
 assert.equal((await handleGuest(request,{action:'guest.me'},db)).data.major_id,1);
 assert.equal((await handleGuest(request,{action:'guest.major',majorId:2,guest:'forged'},db)).data.major_id,2);
 assert.deepEqual(calls.at(-1).options.body,{p_account:null,p_guest:account,p_major:2});
 const handler=createHandler({db,env:{},authenticate:async()=>({id:account})});
 const response=await handler(new Request('https://miyar.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'major',majorId:2,account:'forged'})}));
 assert.equal(response.status,200);assert.deepEqual(calls.at(-1).options.body,{p_account:account,p_guest:null,p_major:2});
});
