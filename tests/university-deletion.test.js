import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
test('empty university deletion atomically resets selections while preserving accounts, visitor identities and reviews; real academic data stays protected',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter((name)=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
  const rpc=async(name,values)=>(await db.query(`select ${name}(${values.map((_,index)=>'$'+(index+1)).join(',')}) as result`,values)).rows[0].result;
  for(const [id,uni,status] of [[first,1,'restricted'],[second,2,'active']]){
   await db.query('insert into auth.users values($1,$2)',[id,id+'@example.test']);
   await db.query("insert into miyar_accounts(auth_id,name,university_id,status) values($1,'طالب',$2,$3)",[id,uni,status]);
  }
  const visitor=await rpc('miyar_open_guest',['a'.repeat(64),null]),other=await rpc('miyar_open_guest',['b'.repeat(64),null]);
  await db.query("update miyar_guest_sessions set university_id=1,status='banned' where id=$1",[visitor.id]);
  await db.query('update miyar_guest_sessions set university_id=2 where id=$1',[other.id]);
  const doctor=(await db.query("insert into miyar_doctors(name,major_id,status) values('أحمد محمد العتيبي',1,'approved') returning id")).rows[0].id;
  await db.query("insert into miyar_reviews(doctor_id,account_id,subject,grade,explanation,treatment,grading,comment,status) values($1,$2,'رياضيات',90,80,80,80,'','published')",[doctor,first]);
  await db.query("insert into miyar_reviews(doctor_id,guest_id,subject,grade,explanation,treatment,grading,comment,status) values($1,$2,'ميكانيكا',95,90,90,90,'','published')",[doctor,visitor.id]);
  await assert.rejects(rpc('miyar_delete_university',[3]),/UNIVERSITY_HAS_COLLEGES/);
  assert.equal((await db.query('select university_id from miyar_accounts where auth_id=$1',[first])).rows[0].university_id,1);
  // An unexpected future FK must roll back preference resets, too.
  await db.exec('create table deletion_guard(university_id bigint references miyar_universities(id) on delete restrict);insert into deletion_guard values(1);');
  await assert.rejects(rpc('miyar_delete_university',[1]),/foreign key constraint/);
  assert.equal((await db.query('select university_id from miyar_accounts where auth_id=$1',[first])).rows[0].university_id,1);
  assert.equal((await db.query('select university_id from miyar_guest_sessions where id=$1',[visitor.id])).rows[0].university_id,1);
  await db.exec('drop table deletion_guard');
  await db.query('insert into miyar_ambassadors(account_id,university_id,granted_by) values($1,2,$2)',[second,first]);
  await assert.rejects(rpc('miyar_delete_university',[2]),/UNIVERSITY_HAS_AMBASSADORS/);
  await db.query('delete from miyar_ambassadors where account_id=$1',[second]);
  await db.query("insert into miyar_catalogue_requests(account_id,university_id,kind,name,ambassador,status) values($1,2,'college.add','كلية مقترحة',true,'rejected')",[second]);
  await assert.rejects(rpc('miyar_delete_university',[2]),/UNIVERSITY_HAS_REQUESTS/);
  assert.equal((await db.query('select university_id from miyar_accounts where auth_id=$1',[second])).rows[0].university_id,2);
  await db.exec('delete from miyar_catalogue_requests');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc('miyar_delete_university',[1]),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');
  assert.deepEqual(await rpc('miyar_delete_university',[1]),{ok:true,accountsReset:1,guestsReset:1});
  assert.deepEqual(await rpc('miyar_delete_university',[2]),{ok:true,accountsReset:1,guestsReset:1});
  await db.exec('reset role');
  await assert.rejects(rpc('miyar_delete_university',[1]),/UNIVERSITY_NOT_FOUND/);
  const accounts=(await db.query('select auth_id,university_id,major_id,status from miyar_accounts order by auth_id')).rows;
  assert.equal(accounts.length,2);assert.ok(accounts.every((row)=>row.university_id===null&&row.major_id===null));
  assert.equal(accounts[0].status,'restricted');assert.equal(accounts[1].status,'active');
  const visitors=(await db.query('select * from miyar_guest_sessions')).rows;
  assert.equal(visitors.length,2);assert.ok(visitors.every((row)=>row.university_id===null));assert.equal(visitors.find((row)=>row.id===visitor.id).status,'banned');
  const reviews=(await db.query('select * from miyar_reviews')).rows;assert.equal(reviews.length,2);assert.ok(reviews.some((row)=>row.account_id===first));assert.ok(reviews.some((row)=>row.guest_id===visitor.id));
  const catalogue=await rpc('miyar_catalogue',[]);assert.ok(catalogue.universities.some(row=>row.name==='جامعة نجران'));assert.ok(catalogue.universities.every(row=>row.id!==1&&row.id!==2));assert.equal(catalogue.doctors[0].count,2);
 }finally{await db.close();}
});
