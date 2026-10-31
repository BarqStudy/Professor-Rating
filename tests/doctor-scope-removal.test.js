import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
test('full department/college removal is confirmed against a fresh scope, exceeds 100 and preserves reviews and other scopes; re-addition restores the original identity',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  for(const id of [admin,student]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'حساب',3)",[id]);}
  const college=(await db.query('select college_id from miyar_majors where id=1')).rows[0].college_id;
  const otherMajor=(await db.query("insert into miyar_majors(college_id,name) values($1,'تخصص اختبار آخر') returning id",[college])).rows[0].id;
  const otherCollege=(await db.query("insert into miyar_colleges(university_id,name) values(3,'كلية اختبار أخرى') returning id")).rows[0].id;
  const outsideMajor=(await db.query("insert into miyar_majors(college_id,name) values($1,'تخصص خارج النطاق') returning id",[otherCollege])).rows[0].id;
  await db.exec("insert into miyar_doctors(major_id,name,status) select 1,'د. أحمد محمد '||n,'approved' from generate_series(1,153) n");
  const first=(await db.query("select id from miyar_doctors where major_id=1 order by id limit 1")).rows[0].id;
  await db.query("insert into miyar_reviews(account_id,doctor_id,subject,grade,explanation,treatment,grading,status,comment) values($1,$2,'مادة محفوظة',90,80,80,80,'published','تجربة')",[student,first]);
  await rpc(db,'miyar_admin_add_doctor',[otherMajor,'محمد عبدالله علي']);await rpc(db,'miyar_admin_add_doctor',[outsideMajor,'خالد عبدالله علي']);
  await db.exec("insert into miyar_doctors(major_id,name,status) values(1,'دكتور غير معتمد','pending'),(1,'دكتور تم رفضه','rejected')");
  let preview=await rpc(db,'miyar_doctor_scope_removal',[admin,'major',1,false,null]);assert.equal(preview.count,153);assert.equal(preview.sample.length,8);assert.equal((await rpc(db,'miyar_catalogue',[])).doctors.length,155,'preview never deletes');
  await assert.rejects(rpc(db,'miyar_doctor_scope_removal',[admin,'major',1,true,null]),/DOCTOR_SCOPE_CHANGED/);
  await rpc(db,'miyar_admin_add_doctor',[1,'دكتور أضيف بعد المعاينة']);await assert.rejects(rpc(db,'miyar_doctor_scope_removal',[admin,'major',1,true,preview.fingerprint]),/DOCTOR_SCOPE_CHANGED/);
  preview=await rpc(db,'miyar_doctor_scope_removal',[admin,'major',1,false,null]);assert.equal(preview.count,154);
  await assert.rejects(rpc(db,'miyar_doctor_scope_removal',[admin,'college',college,true,preview.fingerprint]),/DOCTOR_SCOPE_CHANGED/);
  assert.equal((await rpc(db,'miyar_doctor_scope_removal',[admin,'major',1,true,preview.fingerprint])).updated,154);
  assert.equal((await db.query("select count(*)::int n from miyar_doctors where major_id=1 and status='approved'")).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from miyar_doctors where major_id=1 and status in('pending','rejected')")).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from miyar_reviews where doctor_id=$1',[first])).rows[0].n,1);
  const collegePreview=await rpc(db,'miyar_doctor_scope_removal',[admin,'college',college,false,null]);assert.equal(collegePreview.count,1);await rpc(db,'miyar_doctor_scope_removal',[admin,'college',college,true,collegePreview.fingerprint]);assert.equal((await rpc(db,'miyar_catalogue',[])).doctors.length,1);
  const name=(await db.query('select name from miyar_doctors where id=$1',[first])).rows[0].name;
  const restored=await rpc(db,'miyar_admin_add_doctor',[1,name]);assert.equal(restored.id,first);assert.equal(restored.restored,true);assert.equal((await rpc(db,'miyar_catalogue',[])).doctors.find(d=>d.id===first).count,1);
  await assert.rejects(rpc(db,'miyar_admin_add_doctor',[1,name]),/DOCTOR_ALREADY_EXISTS/);await assert.rejects(rpc(db,'miyar_admin_add_doctor',[1,'دكتور تم رفضه']),/DOCTOR_ALREADY_EXISTS/);
  assert.equal((await db.query('select count(*)::int n from miyar_doctors where major_id=1 and name=$1',[name])).rows[0].n,1);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_admin_add_doctor',[1,name]),/permission denied/);await assert.rejects(rpc(db,'miyar_doctor_scope_removal',[admin,'major',1,false,null]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
test('scope HTTP requests bind the admin, reject unconfirmed or malformed deletions and restore through the private RPC',async()=>{
 let actor=student,status='active';const calls=[];const db=async(path,opts={})=>{calls.push({path,...opts});return path.startsWith('miyar_accounts?')?[{auth_id:actor,status}]:{ok:true};};const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:actor})});
 const call=body=>handle(new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',...body})}));
 for(const operation of ['doctor.scope.preview','doctor.scope.remove','doctor.add'])assert.equal((await call({operation,scope:'major',id:1,name:'محمد عبدالله علي',majorId:1})).status,403);
 actor=admin;status='restricted';assert.equal((await call({operation:'doctor.scope.preview',scope:'major',id:1})).status,403);status='active';
 assert.equal((await call({operation:'doctor.scope.remove',scope:'major',id:1,fingerprint:'a'.repeat(32)})).status,400);
 for(const fields of [{scope:'university',id:1},{scope:'major',id:0},{scope:'college',id:'x'}])assert.equal((await call({operation:'doctor.scope.preview',...fields})).status,400);
 assert.equal((await call({operation:'doctor.scope.remove',scope:'college',id:1,confirm:true,fingerprint:'a'.repeat(32),adminId:student})).status,200);assert.deepEqual(calls.at(-1).body,{p_admin:admin,p_scope:'college',p_id:1,p_confirm:true,p_fingerprint:'a'.repeat(32)});
 assert.equal((await call({operation:'doctor.add',name:'محمد عبدالله علي',majorId:1})).status,200);assert.equal(calls.at(-1).path,'rpc/miyar_admin_add_doctor');assert.deepEqual(calls.at(-1).body,{p_major:1,p_name:'محمد عبدالله علي'});
});
