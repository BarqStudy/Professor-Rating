import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {courseNameWords,knownCourseMatches,reviewedCourseKeys,courseNameKey} from '../src/course-names.js';
const courses=[{id:'p/drawing',name:'الرسم الهندسي',code:'رسم 101'},{id:'p/circuits1',name:'الدوائر الكهربائية 1',code:'كهر 216'},{id:'p/circuits2',name:'الدوائر الكهربائية 2',code:'كهر 217'},{id:'p/fluids',name:'ميكانيكا الموائع',code:'مدن 211'}];
const ids=(query,items=courses)=>knownCourseMatches(query,items).map(c=>c.id);

test('catalogue names, shorthand tokens and codes suggest explicit choices without conflating numbered or ambiguous courses',()=>{
 for(const value of ['رسم','رسم هندسي','الرسم الهندسي','رَسْم هَنْدَسِي','رسم101'])assert.deepEqual(ids(value),['p/drawing']);
 assert.deepEqual(ids('دوائر ١'),['p/circuits1']);assert.deepEqual(ids('الدوائر الكهربائية ۲'),['p/circuits2']);assert.deepEqual(ids('دوائر'),['p/circuits1','p/circuits2']);assert.deepEqual(ids('كهر216'),['p/circuits1']);
 assert.deepEqual(ids('ميكانيكا المواد'),[]);assert.deepEqual(ids('مادة جديدة مستقلة'),[]);assert.deepEqual(ids('1'),[]);
 assert.ok(reviewedCourseKeys(['رسم'],courses).has(courseNameKey('الرسم الهندسي')));
 const ambiguous=[...courses,{id:'p/architectural',name:'الرسم المعماري',code:'عمر 105'}];
 assert.deepEqual(ids('رسم',ambiguous),['p/drawing','p/architectural']);assert.ok(!reviewedCourseKeys(['رسم'],ambiguous).has(courseNameKey('الرسم الهندسي')),'ambiguous historical shorthand cannot automatically block a different specific course');
 assert.deepEqual(ids('الرسم الهندسي',[...courses,{id:'p/mechanical',name:'الرسم الهندسي الميكانيكي',code:'هرس 101'}]),['p/drawing'],'full exact names take precedence over partial matches');
 assert.deepEqual(ids('Engineering Drawing',[{id:'p/en',name:'Engineering Drawing',code:'ED101'}]),['p/en']);
});

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const rpc=(db,name,args)=>db.query(`select ${name==='miyar_known_course_matches'?'* from ':''}${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})${name==='miyar_known_course_matches'?'':' result'}`,args).then(r=>name==='miyar_known_course_matches'?r.rows:r.rows[0].result);
test('server requires real catalogue selections on all current member/guest submit paths and reserves unambiguous historical aliases',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  for(const id of [a,b]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const guest=await rpc(db,'miyar_open_guest',['a'.repeat(64),null]);await rpc(db,'miyar_choose_university',[null,guest.id,3]);
  const d=(await db.query("insert into miyar_doctors(major_id,name,status) values(1,'أحمد محمد العتيبي','approved') returning id")).rows[0].id;
  await db.exec("update miyar_study_courses set linkable=false where name like '%رسم%';insert into miyar_study_courses(id,plan_id,code,name,linkable) values('najran-ce-2025/drawing-test','najran-ce-2025','رسم 101','الرسم الهندسي',true)");
  for(const value of ['رسم','رسم هندسي','الرسم الهندسي','رسم101','الدوائر الكهربائية ١','دوائر ۲']){
   assert.deepEqual(await rpc(db,'miyar_course_words',[value]),courseNameWords(value));
   assert.ok((await rpc(db,'miyar_known_course_matches',[3,value])).length>0);
   for(const [actor,existing,name] of [[a,true,'miyar_submit_existing_google_review'],[guest.id,true,'miyar_submit_existing_guest_review'],[a,false,'miyar_submit_google_review'],[guest.id,false,'miyar_guest_submit']]){
    const args=existing?[actor,d,value,90,80,80,80,'',[],false,null,true]:[actor,'كلية الهندسة','الهندسة المدنية','أحمد محمد العتيبي',value,90,80,80,80,'',[],false,null,true];
    await assert.rejects(rpc(db,name,args),/STUDY_COURSE_SELECTION_REQUIRED/);
   }
  }
  assert.equal((await db.query('select count(*)::int n from miyar_reviews')).rows[0].n,0,'rejected names never create a review');
  const old=await rpc(db,'miyar_submit_existing_google_review',[a,d,'رسم',90,80,80,80,'',[],false,null]);
  assert.equal((await rpc(db,'miyar_review_eligibility',[a,null,d,'الرسم الهندسي'])).eligible,false);
  assert.ok((await rpc(db,'miyar_review_eligibility',[a,null,d,null])).reviewedSubjects.includes('الرسم الهندسي'));
  await assert.rejects(rpc(db,'miyar_submit_existing_google_review',[a,d,'الرسم الهندسي',90,80,80,80,'',[],false,'najran-ce-2025/drawing-test',true]),/REVIEW_ALREADY_EXISTS/);
  assert.deepEqual((await db.query('select subject,course_id from miyar_reviews where id=$1',[old.id])).rows[0],{subject:'رسم',course_id:null},'historical names and original links stay intact');
  const c1=await rpc(db,'miyar_submit_existing_google_review',[b,d,'دوائر كهربائية ١',90,80,80,80,'',[],false,'najran-ee-2025/ee216',true]);
  await rpc(db,'miyar_submit_existing_google_review',[b,d,'دوائر كهربائية 2',90,80,80,80,'',[],false,'najran-ee-2025/ee217',true]);
  assert.equal((await db.query('select subject from miyar_reviews where id=$1',[c1.id])).rows[0].subject,'الدوائر الكهربائية 1','selected official spelling is saved');
  await assert.rejects(rpc(db,'miyar_submit_existing_google_review',[b,d,'رسم',90,80,80,80,'',[],false,'najran-ce-2025/ge101',true]),/INVALID_STUDY_COURSE/);
  await rpc(db,'miyar_submit_existing_guest_review',[guest.id,d,'مادة فريدة خارج القائمة',90,80,80,80,'',[],false,null,true]);
  assert.deepEqual(await rpc(db,'miyar_known_course_matches',[1,'الرسم الهندسي']),[],'another university never supplies a local match');
  await db.exec("update miyar_study_courses set linkable=true where id='najran-arc-2026/arc121'");
  const drawing=await rpc(db,'miyar_known_course_matches',[3,'رسم']);assert.ok(new Set(drawing.map(c=>courseNameKey(c.name))).size>1);
  assert.equal(await rpc(db,'miyar_review_subject_name',[3,'رسم']),'رسم','ambiguous shorthand is never assigned automatically');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_known_course_matches',[3,'رسم']),/permission denied/);await assert.rejects(rpc(db,'miyar_require_course_choice',[3,'رسم',null]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
