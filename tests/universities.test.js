import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../supabase/functions/miyar/handler.js';
import { ApiError } from '../supabase/functions/miyar/security.js';
const account = '11111111-1111-4111-8111-111111111111';
test('only administrators can delete universities, with valid IDs, missing-row detection and linked-data errors',async()=>{
 const admin='22222222-2222-4222-8222-222222222222';let actor=account;
 const remaining=new Set([3,8]),calls=[];
 const handle=createHandler({env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:actor}),db:async(path,options={})=>{
  calls.push({path,...options});
  if(path.startsWith('miyar_accounts'))return[{auth_id:actor,status:'active',university_id:3}];
  if(path==='rpc/miyar_delete_university'){
   const id=options.body.p_id;
   if(id===3)throw new ApiError(409,'Foreign key reference');
   if(!remaining.delete(id))throw new ApiError(404,'الجامعة غير موجودة.');
   return {ok:true};
  }
  return[];
 }});
 const request=(id)=>new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',operation:'university.delete',id,isAdmin:true})});
 assert.equal((await handle(request(8))).status,403);assert.equal(calls.filter((call)=>call.path==='rpc/miyar_delete_university').length,0);
 actor=admin;
 for(const id of [0,-1,'8',null])assert.equal((await handle(request(id))).status,400);
 assert.equal((await handle(request(999))).status,404);
 assert.equal((await handle(request(8))).status,200);assert.ok(!remaining.has(8));
 assert.equal((await handle(request(8))).status,404);
 const blocked=await handle(request(3));assert.equal(blocked.status,409);assert.ok(remaining.has(3));
});
test('university deletion never cascades through colleges, account selections, visitor sessions, ambassadors or proposal history',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter((name)=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  const university=async(name)=>(await db.query('insert into miyar_universities(name) values($1) returning id',[name])).rows[0].id;
  const remove=(id)=>db.query('delete from miyar_universities where id=$1 returning id',[id]);
  const empty=await university('جامعة قابلة للحذف');assert.equal((await remove(empty)).rows.length,1);
  const linked=await university('جامعة مرتبطة');
  await db.query('insert into auth.users values($1,$2)',[account,'student@example.test']);
  await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',$2)",[account,linked]);
  await assert.rejects(remove(linked),/foreign key constraint/);
  await db.query('update miyar_accounts set university_id=3 where auth_id=$1',[account]);
  const visitor=(await db.query("select miyar_open_guest($1,null) as data",['f'.repeat(64)])).rows[0].data;
  await db.query('update miyar_guest_sessions set university_id=$1 where id=$2',[linked,visitor.id]);
  await assert.rejects(remove(linked),/foreign key constraint/);
  await db.query('update miyar_guest_sessions set university_id=null where id=$1',[visitor.id]);
  await db.query('insert into miyar_ambassadors(account_id,university_id,granted_by) values($1,$2,$1)',[account,linked]);
  await assert.rejects(remove(linked),/foreign key constraint/);
  await db.query('delete from miyar_ambassadors where account_id=$1',[account]);
  await db.query("insert into miyar_catalogue_requests(account_id,university_id,kind,name,ambassador,status) values($1,$2,'college.add','كلية مقترحة',true,'rejected')",[account,linked]);
  await assert.rejects(remove(linked),/foreign key constraint/);
  await assert.rejects(remove(3),/foreign key constraint/);
  assert.equal((await db.query('select count(*)::int as n from miyar_colleges')).rows[0].n,1);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(remove(linked),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
test('university migration preserves Najran records, scopes duplicate college names and enforces profile/review university', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
    for (const name of ['202610240001_miyar.sql','202610240002_google_auth.sql']) {
      await db.exec(await readFile(new URL('../supabase/migrations/'+name, import.meta.url), 'utf8'));
    }
    await db.query('insert into auth.users(id) values($1)',[account]);
    await db.query("insert into miyar_accounts(auth_id,name,major_id) values($1,'طالب',1)",[account]);
    const submit = async (subject) => (await db.query("select miyar_submit_google_review($1,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي',$2,90,90,90,90,'تجربة واضحة ومفيدة') as data",[account,subject])).rows[0].data;
    const old = await submit('قديم');
    await db.exec(await readFile(new URL('../supabase/migrations/202610250001_universities.sql', import.meta.url),'utf8'));
    const universities=(await db.query('select * from miyar_universities order by id')).rows;
    const najran=universities.find((u)=>u.name==='جامعة نجران').id;
    const saud=universities.find((u)=>u.name==='جامعة الملك سعود').id;
    assert.equal(universities.length,3);
    assert.equal((await db.query('select university_id from miyar_colleges where id=1')).rows[0].university_id,najran);
    assert.equal((await db.query('select university_id,major_id from miyar_accounts')).rows[0].university_id,null);
    assert.equal((await db.query('select id from miyar_reviews')).rows[0].id,old.id);
    await assert.rejects(submit('بدون جامعة'),/INVALID_MAJOR/);
    await db.query('update miyar_accounts set university_id=$1 where auth_id=$2',[najran,account]);
    const njReview=await submit('نجران');
    const otherCollege=(await db.query("insert into miyar_colleges(university_id,name) values($1,'كلية الهندسة') returning id",[saud])).rows[0].id;
    const otherMajor=(await db.query("insert into miyar_majors(college_id,name) values($1,'الهندسة المدنية') returning id",[otherCollege])).rows[0].id;
    await assert.rejects(db.query('update miyar_accounts set major_id=$1 where auth_id=$2',[otherMajor,account]),/INVALID_UNIVERSITY_MAJOR/);
    await db.query('update miyar_accounts set university_id=$1,major_id=null where auth_id=$2',[saud,account]);
    const saudReview=await submit('سعود');
    const rows=(await db.query('select r.id,c.university_id from miyar_reviews r join miyar_doctors d on d.id=r.doctor_id join miyar_majors m on m.id=d.major_id join miyar_colleges c on c.id=m.college_id')).rows;
    assert.equal(rows.find((r)=>r.id===njReview.id).university_id,najran);
    assert.equal(rows.find((r)=>r.id===saudReview.id).university_id,saud);
    const catalogue=(await db.query('select miyar_catalogue() as data')).rows[0].data;
    assert.equal(catalogue.universities.length,3);
    assert.ok(!JSON.stringify(catalogue).includes(account));
    for(const role of ['anon','authenticated']) {
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from miyar_universities'),/permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
test('only the authenticated account can choose a real university; changing it clears the previous major',async()=>{
  const calls=[];
  const handle=createHandler({env:{ALLOWED_ORIGINS:'https://miyar.website'},authenticate:async()=>({id:account}),db:async(path,options={})=>{
    calls.push({path,...options});
    if(path.startsWith('miyar_accounts') && !options.method) return [{auth_id:account,name:'طالب',status:'active',university_id:3,major_id:1}];
    if(path==='miyar_universities?id=eq.1&select=id') return [{id:1}];
    return [];
  }});
  const request=(body)=>new Request('https://test',{method:'POST',body:JSON.stringify(body)});
  const result=await handle(request({action:'university',universityId:1,userId:'forged',isAdmin:true}));
  assert.equal(result.status,200);
  const patch=calls.find((c)=>c.method==='PATCH');
  assert.equal(patch.path,`miyar_accounts?auth_id=eq.${account}`);
  assert.deepEqual(patch.body,{university_id:1,major_id:null});
  assert.equal((await handle(request({action:'university',universityId:999}))).status,400);
  assert.equal((await handle(request({action:'profile',name:'طالب',majorId:99,level:1}))).status,400);
  assert.equal(calls.filter((c)=>c.method==='PATCH').length,1);
});
