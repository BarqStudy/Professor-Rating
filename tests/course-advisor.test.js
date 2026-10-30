import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {courseNameKey,courseRequirementLabel} from '../src/course-names.js';
import {cleanProgress} from '../src/study-engine.js';
import {officeLabel,officeBadge} from '../src/doctor-office.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';import {ApiError} from '../supabase/functions/miyar/security.js';
const plans=JSON.parse(await readFile(new URL('../data/study-plans.json',import.meta.url),'utf8'));
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));return db;}
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);

test('course search equates article/diacritic/digit variations while preserving distinct materials and personal doctor selections',()=>{
 for(const name of ['الاستاتيكا','الإِسْتَاتِيْكَا','استاتيكا '])assert.equal(courseNameKey(name),courseNameKey('استاتيكا'));
 assert.equal(courseNameKey('الدوائر الكهربائية ١'),courseNameKey('دوائر كهربائية 1'));
 assert.notEqual(courseNameKey('دوائر كهربائية 1'),courseNameKey('دوائر كهربائية 2'));
 assert.notEqual(courseNameKey('ميكانيكا الموائع'),courseNameKey('ميكانيكا المواد'));
 const plan=plans.find(p=>p.id==='najran-me-2026');
 assert.equal(courseRequirementLabel(plan,'فيز 105'),'الفيزياء المتقدمة (فيز 105)');
 const p=cleanProgress(plan,{doctorChoices:{'najran-me-2026/me231':42,'najran-ce-2025/ce211':52,'najran-me-2026/me221':'42'}});
 assert.deepEqual(p.doctorChoices,{'najran-me-2026/me231':42});
 assert.equal(officeLabel({office_role:'head'}),'رئيس قسم');assert.equal(officeLabel({office_role:'dean',office_college:'كلية العلوم'}),'عميد كلية العلوم');
 assert.ok(!officeBadge({office_role:'dean',office_college:'<img src=x>'}).includes('<img'));
});

test('recommendations include shared subjects across university departments and plans, preserve distinct courses and deduplicate identities',async()=>{
 const db=await database();try{
  const key=value=>rpc(db,'miyar_course_key',[value]);
  for(const name of ['استاتيكا','الاستاتيكا','الإِسْتَاتِيْكَا','دوائر كهربائية ١','الدوائر الكهربائية 1','دوائر كهربائية 2'])assert.equal(await key(name),courseNameKey(name));
  const accounts=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
  for(const id of accounts){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const majors=(await db.query('select id,name from miyar_majors')).rows;
  const civil=majors.find(m=>m.name==='الهندسة المدنية').id,mechanical=majors.find(m=>m.name==='الهندسة الميكانيكية').id;
  const addDoctor=async(major,name)=>(await db.query("insert into miyar_doctors(major_id,name,status) values($1,$2,'approved') returning id",[major,name])).rows[0].id;
  const a=await addDoctor(civil,'أحمد محمد العتيبي'),b=await addDoctor(civil,'خالد عبدالله القحطاني'),other=await addDoctor(mechanical,'سعد علي القحطاني');
  const review=async(account,doctor,subject,score,course=null,status='published')=>(await db.query("insert into miyar_reviews(account_id,doctor_id,subject,grade,explanation,treatment,grading,comment,status,course_id) values($1,$2,$3,99,$4,$4,$4,'شرح واضح',$5,$6) returning id",[account,doctor,subject,score,status,course])).rows[0].id;
  await review(accounts[0],a,'استاتيكا',90);await review(accounts[1],a,'الاستاتيكا',80);
  await review(accounts[0],b,'الإستاتيكا',95);await review(accounts[1],b,'الاستاتيكا',95);
  await review(accounts[0],other,'الاستاتيكا',100); // shared subject from a different department is included
  await review(accounts[2],a,'الاستاتيكا',1,null,'pending');
  let rows=await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101']);
  assert.deepEqual(rows.map(r=>r.id),[other,b,a]);assert.equal(rows[0].score,100);assert.equal(rows[2].score,85);assert.equal(rows[2].count,2);
  assert.equal((await rpc(db,'miyar_course_reviews',['najran-ce-2025/ge101',other])).length,1);
  // A matching name in another university is not evidence for this university.
  const foreignCollege=(await db.query("insert into miyar_colleges(university_id,name) values(1,'كلية الهندسة') returning id")).rows[0].id;
  const foreignMajor=(await db.query("insert into miyar_majors(college_id,name) values($1,'الميكانيكا') returning id",[foreignCollege])).rows[0].id;
  await db.exec('update miyar_universities set enabled=true where id=1');
  const foreign=await addDoctor(foreignMajor,'أحمد خالد محمد');await review(accounts[0],foreign,'استاتيكا',100);
  assert.ok((await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101'])).every(r=>r.id!==foreign));
  // The same professor may teach a civil course while belonging to another college.
  const science=(await db.query("insert into miyar_colleges(university_id,name) values(3,'كلية العلوم') returning id")).rows[0].id;
  const physics=(await db.query("insert into miyar_majors(college_id,name) values($1,'الفيزياء') returning id",[science])).rows[0].id;
  const cross=await addDoctor(physics,'عبدالله حسن القحطاني');
  const linked=await review(accounts[0],cross,'الاستاتيكا',97,'najran-ce-2025/ge101');
  await db.query("update miyar_reviews set subject='الإستاتيكا' where id=$1",[linked]);
  assert.equal((await db.query('select course_id from miyar_reviews where id=$1',[linked])).rows[0].course_id,'najran-ce-2025/ge101','equivalent spelling edits retain an explicit course link');
  rows=await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101']);assert.deepEqual(rows.map(r=>r.id),[other,cross,b,a]);assert.equal(rows.find(r=>r.id===cross).college,'كلية العلوم');
  const publicReviews=await rpc(db,'miyar_course_reviews',['najran-ce-2025/ge101',a]);assert.equal(publicReviews.length,2);
  assert.ok(publicReviews.every(review=>Number.isInteger(review.grade)));assert.ok(rows.every(doctor=>!('grade' in doctor)));const serialized=JSON.stringify([rows,publicReviews]);for(const value of ['account_id','guest_id',...accounts])assert.ok(!serialized.includes(value));
  // Historical rows from before the one-review rule remain readable and deduplicated.
  // New submissions cannot recreate those duplicates.
  await review(accounts[0],a,'مادة أخرى',70);
  await assert.rejects(review(accounts[0],a,'الإستاتيكا',70),/REVIEW_ALREADY_EXISTS/);
  const legacyReview=async(...args)=>{await db.exec('alter table miyar_reviews disable trigger miyar_single_review');try{return await review(...args);}finally{await db.exec('alter table miyar_reviews enable trigger miyar_single_review');}};
  // Same identity + equivalent spelling counts only the latest published experience.
  await legacyReview(accounts[0],a,' الإِسْتَاتِيكا ',70);
  rows=await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101']);assert.equal(rows.find(r=>r.id===a).count,2);assert.equal(rows.find(r=>r.id===a).score,75);
  // Explicit links stay on their original plans, but shared subject recommendations span plans.
  await legacyReview(accounts[2],a,'استاتيكا',100,'najran-me-2026/ge101');
  rows=await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101']);assert.equal(rows.find(r=>r.id===a).count,3);assert.equal(rows.find(r=>r.id===a).score,83.3);
  assert.equal((await rpc(db,'miyar_course_reviews',['najran-ce-2025/ge101',a])).length,3);
  const mechanicalRows=await rpc(db,'miyar_course_doctors',['najran-me-2026/ge101']);assert.deepEqual(mechanicalRows.map(r=>r.id),[other,cross,b,a]);
  assert.equal((await db.query("select course_id from miyar_reviews where account_id=$1 and doctor_id=$2",[accounts[2],a])).rows[0].course_id,'najran-me-2026/ge101');
  // A removed/disabled linked course cannot supply cross-plan evidence.
  await db.exec("update miyar_study_courses set linkable=false where id='najran-me-2026/ge101'");
  assert.equal((await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101'])).find(r=>r.id===a).count,2);
  await db.exec("update miyar_study_courses set linkable=true where id='najran-me-2026/ge101'");
  // Numbered courses cannot merge just because the base name matches.
  await legacyReview(accounts[0],a,'دوائر كهربائية 2',100);
  assert.deepEqual(await rpc(db,'miyar_course_doctors',['najran-me-2026/ee216']),[]);
  // Ambiguous normalized names in one plan require explicit course IDs.
  await db.exec("insert into miyar_study_courses values('najran-ce-2025/duplicate-statics','najran-ce-2025','هعم 999','الاستاتيكا',true);");
  rows=await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101']);assert.deepEqual(rows.map(r=>r.id),[cross]);
  await db.query("update miyar_doctors set status='archived' where id=$1",[cross]);assert.deepEqual(await rpc(db,'miyar_course_doctors',['najran-ce-2025/ge101']),[]);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_course_evidence',['najran-ce-2025/ge101']),/permission denied/);await assert.rejects(rpc(db,'miyar_course_reviews',['najran-ce-2025/ge101',a]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('office titles are admin-controlled presentation data, scoped to the professor university, and preserve verification',async()=>{
 const db=await database();try{
  const d=(await db.query("insert into miyar_doctors(major_id,name,status,verified) select major_id,'أحمد محمد العتيبي','approved',true from miyar_study_plans where id='najran-ce-2025' returning id")).rows[0].id;
  await rpc(db,'miyar_set_doctor_office',[d,'head',null]);
  let cat=await rpc(db,'miyar_catalogue',[]);assert.equal(cat.doctors[0].office_role,'head');assert.equal(cat.doctors[0].verified,true);
  const college=(await db.query("select id from miyar_colleges where university_id=3 limit 1")).rows[0].id;
  await rpc(db,'miyar_set_doctor_office',[d,'dean',college]);cat=await rpc(db,'miyar_catalogue',[]);assert.equal(cat.doctors[0].office_college,'كلية الهندسة');
  const foreign=(await db.query("insert into miyar_colleges(university_id,name) values(1,'كلية العلوم') returning id")).rows[0].id;
  await assert.rejects(rpc(db,'miyar_set_doctor_office',[d,'dean',foreign]),/INVALID_DOCTOR_OFFICE/);
  await assert.rejects(rpc(db,'miyar_set_doctor_office',[d,'head',college]),/INVALID_DOCTOR_OFFICE/);
  await assert.rejects(rpc(db,'miyar_set_doctor_office',[d,'admin',null]),/INVALID_DOCTOR_OFFICE/);
  await rpc(db,'miyar_set_doctor_office',[d,null,null]);cat=await rpc(db,'miyar_catalogue',[]);assert.equal(cat.doctors[0].office_role,null);assert.equal(cat.doctors[0].verified,true);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_set_doctor_office',[d,'head',null]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('public course reviews expose curated fields and only verified administrators can assign offices',async()=>{
 const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',calls=[];let actor=student;
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status:'active',university_id:3}];if(path==='rpc/miyar_course_reviews')return[];return{ok:true};};
 const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async request=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:actor};}});
 const req=(body,auth=false)=>new Request('https://test',{method:'POST',headers:auth?{authorization:'Bearer verified'}:{},body:JSON.stringify(body)});
 assert.equal((await handle(req({action:'course.reviews',courseId:'najran-ce-2025/ge101',doctor:4}))).status,200);
 const office={action:'admin',operation:'doctor.office',id:4,role:'head',isAdmin:true};
 assert.equal((await handle(req(office))).status,401);assert.equal((await handle(req(office,true))).status,403);
 assert.equal(calls.filter(c=>c.path==='rpc/miyar_set_doctor_office').length,0);actor=admin;
 assert.equal((await handle(req(office,true))).status,200);assert.equal(calls.at(-1).body.p_role,'head');
 for(const role of ['admin','verified',undefined])assert.equal((await handle(req({...office,role},true))).status,400);
 assert.equal((await handle(req({...office,role:'dean',collegeId:'1'},true))).status,400);
 assert.equal((await handle(req({...office,role:'dean',collegeId:1},true))).status,200);
});
