import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {setUploadedStudyPlans,getStudyPlans} from '../src/study-catalogue.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
const rpc=(db,name,args=[])=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(result=>result.rows[0].result);
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(file=>file.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));return db;}

test('specialty removal previews dependent records, fences changes, archives atomically and preserves reviews, accounts and course IDs',async()=>{
 const db=await database();try{
  await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);
  const major=(await db.query("select major_id from miyar_study_plans where id='najran-ce-2025'")).rows[0].major_id;
  await db.query("insert into miyar_accounts(auth_id,name,university_id,major_id) values($1,'الإدارة',3,$3),($2,'طالب',3,$3)",[admin,student,major]);
  await assert.rejects(db.query('delete from miyar_majors where id=$1',[major]),/foreign key constraint/);
  const review=await rpc(db,'miyar_submit_google_review',[student,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي','استاتيكا',90,80,80,80,'',[],false,'najran-ce-2025/ge101']);
  await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published';");
  let preview=await rpc(db,'miyar_major_removal_preview',[major]);assert.equal(preview.name,'الهندسة المدنية');assert.equal(preview.doctors,1);assert.equal(preview.plans,1);assert.equal(preview.reviews,1);assert.ok(!JSON.stringify(preview).includes(student));
  const initial=preview.snapshot;await db.query("insert into miyar_doctors(name,major_id,status) values('خالد علي القحطاني',$1,'pending')",[major]);
  await assert.rejects(rpc(db,'miyar_delete_major',[admin,major,initial]),/MAJOR_DELETE_CONFLICT/);assert.equal((await db.query('select deleted_at from miyar_majors where id=$1',[major])).rows[0].deleted_at,null);
  preview=await rpc(db,'miyar_major_removal_preview',[major]);assert.equal(preview.doctors,2);
  await db.exec('set role service_role');assert.equal((await rpc(db,'miyar_delete_major',[admin,major,preview.snapshot])).alreadyRemoved,false);assert.equal((await rpc(db,'miyar_delete_major',[admin,major,preview.snapshot])).alreadyRemoved,true);await db.exec('reset role');
  assert.equal((await db.query('select status,course_id from miyar_reviews where id=$1',[review.id])).rows[0].status,'published');assert.equal((await db.query('select course_id from miyar_reviews where id=$1',[review.id])).rows[0].course_id,'najran-ce-2025/ge101');
  assert.equal((await db.query('select count(*)::int n from miyar_accounts where university_id=3 and major_id is null')).rows[0].n,2);
  assert.ok((await db.query('select status from miyar_doctors where major_id=$1',[major])).rows.every(row=>row.status==='archived'));
  const catalogue=await rpc(db,'miyar_catalogue');assert.ok(!catalogue.majors.some(item=>item.id===major));assert.equal(catalogue.doctors.length,0);assert.equal(catalogue.stats.reviews,0);assert.ok(catalogue.universities.some(item=>item.id===3));
  const plans=await rpc(db,'miyar_uploaded_study_plans');assert.deepEqual(plans.find(plan=>plan.id==='najran-ce-2025'),{id:'najran-ce-2025',deleted:true,revision:1});setUploadedStudyPlans(plans);assert.ok(!getStudyPlans().some(plan=>plan.id==='najran-ce-2025'));
  assert.equal((await db.query('select count(*)::int n from miyar_major_removals')).rows[0].n,1);
  for(const sql of ["insert into miyar_doctors(name,major_id) values('جديد',$1)","update miyar_doctors set status='approved' where major_id=$1","update miyar_accounts set major_id=$1"]){await assert.rejects(db.query(sql,[major]),/MAJOR_UNAVAILABLE/);}
  await assert.rejects(rpc(db,'miyar_study_import_target',[major]),/INVALID_MAJOR/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_major_removal_preview',[major]),/permission denied/);await assert.rejects(rpc(db,'miyar_delete_major',[admin,major,preview.snapshot]),/permission denied/);await assert.rejects(db.query('select * from miyar_major_removals'),/permission denied/);await db.exec('reset role');}
  const college=(await db.query('select college_id from miyar_majors where id=$1',[major])).rows[0].college_id;
  assert.equal((await rpc(db,'miyar_add_major',[admin,college,'الهندسة المدنية'])).restored,true);assert.ok((await rpc(db,'miyar_catalogue')).majors.some(item=>item.id===major));assert.equal((await rpc(db,'miyar_catalogue')).doctors.length,0);assert.ok(!(await rpc(db,'miyar_admin_study_plans')).some(plan=>plan.id==='najran-ce-2025'));
  await assert.rejects(rpc(db,'miyar_delete_major',[admin,major,preview.snapshot]),/MAJOR_DELETE_CONFLICT/);
  const restored=await rpc(db,'miyar_major_removal_preview',[major]);assert.equal(restored.plans,0);assert.equal(restored.doctors,0);await rpc(db,'miyar_delete_major',[admin,major,restored.snapshot]);assert.equal((await db.query('select count(*)::int n from miyar_reviews')).rows[0].n,1);
 }finally{setUploadedStudyPlans([]);await db.close();}
});

test('major removal API requires explicit current confirmation and an active verified administrator',async()=>{
 let actor=student,status='active';const calls=[];const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status}];return {ok:true};};const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:actor})});
 const call=extra=>handle(new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',operation:'major.delete',id:1,confirmed:true,snapshot:'a'.repeat(32),...extra})}));
 assert.equal((await call({isAdmin:true,adminId:admin})).status,403);actor=admin;status='restricted';assert.equal((await call({})).status,403);status='active';assert.equal((await call({confirmed:false})).status,400);assert.equal((await call({snapshot:'invalid'})).status,400);assert.equal((await call({id:-1})).status,400);
 assert.equal((await call({adminId:student})).status,200);assert.equal(calls.at(-1).path,'rpc/miyar_delete_major');assert.deepEqual(calls.at(-1).body,{p_actor:admin,p_id:1,p_snapshot:'a'.repeat(32)});
 assert.equal((await call({operation:'major.preview-delete'})).status,200);assert.equal(calls.at(-1).path,'rpc/miyar_major_removal_preview');assert.equal((await call({operation:'major.add',collegeId:2,name:'تخصص جديد'})).status,200);assert.deepEqual(calls.at(-1).body,{p_actor:admin,p_college:2,p_name:'تخصص جديد'});assert.ok(!calls.some(call=>call.method==='DELETE'));
});
