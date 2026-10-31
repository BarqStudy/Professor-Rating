import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {validateReview} from '../supabase/functions/miyar/security.js';import {REVIEW_TAGS} from '../supabase/functions/miyar/tags.js';
const admin='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
test('opt-out drops a supplied grade and allows an explicit anonymous general review, preserving required scores',()=>{
 const base={name:'أحمد محمد العتيبي',college:'كلية الهندسة',major:'الهندسة المدنية',scores:[10,30,0],publishGrade:false,withoutSubject:true,grade:95};
 const r=validateReview(base);assert.equal(r.grade,null);assert.equal(r.subject,'بدون مادة');assert.deepEqual(r.scores,[10,30,0]);
 assert.throws(()=>validateReview({...base,publishGrade:true}));assert.throws(()=>validateReview({...base,scores:[10,null,30]}));
 assert.equal(validateReview({...base,subject:'مادة جديدة',tags:REVIEW_TAGS.slice(-6).map(t=>t.label)}).tags.length,6);
});
test('removed evaluations release member, guest and linked identities; anonymous grades and audited course linking stay correct',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  for(const id of [admin,a,b]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const d=(await db.query("insert into miyar_doctors(major_id,name,status) values(1,'أحمد محمد العتيبي','approved') returning id")).rows[0].id;
  const guest=await rpc(db,'miyar_open_guest',['a'.repeat(64),null]);await rpc(db,'miyar_choose_university',[null,guest.id,3]);
  const submit=(actor,name,subject,course=null)=>rpc(db,name,[actor,d,subject,null,10,30,0,'تجربة',[REVIEW_TAGS.at(-1).label],false,course,false]);
  const first=await submit(a,'miyar_submit_existing_google_review','بدون مادة');
  assert.equal((await db.query('select grade from miyar_reviews where id=$1',[first.id])).rows[0].grade,null);
  await db.query("update miyar_reviews set status='published' where id=$1",[first.id]);
  assert.equal((await rpc(db,'miyar_public_reviews',[d,null]))[0].grade,null);
  await rpc(db,'miyar_remove_published_review',[admin,first.id,'سبب إداري']);
  assert.equal((await rpc(db,'miyar_review_eligibility',[a,null,d,'بدون مادة'])).eligible,true);
  const again=await submit(a,'miyar_submit_existing_google_review','بدون مادة');assert.notEqual(first.id,again.id);await assert.rejects(submit(a,'miyar_submit_existing_google_review','بدون مادة'),/REVIEW_ALREADY_EXISTS/);
  const g=await submit(guest.id,'miyar_submit_existing_guest_review','مادة زائر');await db.query("update miyar_reviews set status='published' where id=$1",[g.id]);await rpc(db,'miyar_link_review_identity',[b,guest.id]);await rpc(db,'miyar_remove_published_review',[admin,g.id,'']);
  assert.equal((await rpc(db,'miyar_review_eligibility',[b,null,d,'مادة زائر'])).eligible,true);assert.equal((await rpc(db,'miyar_review_eligibility',[null,guest.id,d,'مادة زائر'])).eligible,true);
  await submit(b,'miyar_submit_existing_google_review','مادة زائر');await assert.rejects(submit(guest.id,'miyar_submit_existing_guest_review','مادة زائر'),/REVIEW_ALREADY_EXISTS/);
  // Deleting a published real course review starts an independent review cycle.
  const staticArgs=[a,d,'الاستاتيكا',92,40,50,60,'تقييم سابق',[],false,'najran-ce-2025/ge101',true];
  const oldStatic=await rpc(db,'miyar_submit_existing_google_review',staticArgs);
  await db.query("update miyar_reviews set status='published',created_at='2026-01-01T00:00:00Z' where id=$1",[oldStatic.id]);
  await rpc(db,'miyar_set_review_like',[b,null,oldStatic.id,true]);assert.equal(await rpc(db,'miyar_review_like_count',[oldStatic.id]),1);
  await rpc(db,'miyar_remove_published_review',[admin,oldStatic.id,'حذف التقييم المنشور']);
  const eligible=await rpc(db,'miyar_review_eligibility',[a,null,d,'استاتيكا']);assert.equal(eligible.eligible,true);assert.ok(!eligible.reviewedSubjects.includes('الاستاتيكا'));
  const freshArgs=[a,d,'الاستاتيكا',31,90,91,92,'تقييم جديد',REVIEW_TAGS.slice(-6).map(t=>t.label),false,'najran-ce-2025/ge101',true];
  const fresh=await rpc(db,'miyar_submit_existing_google_review',freshArgs);assert.notEqual(fresh.id,oldStatic.id);assert.equal(fresh.status,'pending');assert.equal(await rpc(db,'miyar_review_like_count',[fresh.id]),0);
  const saved=(await db.query('select grade,explanation,treatment,grading,comment,tags,created_at from miyar_reviews where id=$1',[fresh.id])).rows[0];assert.equal(saved.grade,31);assert.deepEqual([saved.explanation,saved.treatment,saved.grading],[90,91,92]);assert.equal(saved.comment,'تقييم جديد');assert.deepEqual(saved.tags,REVIEW_TAGS.slice(-6).map(t=>t.label));assert.ok(new Date(saved.created_at)>new Date('2026-01-01T00:00:00Z'));
  await assert.rejects(rpc(db,'miyar_submit_existing_google_review',freshArgs),/REVIEW_ALREADY_EXISTS/);
  await db.query("update miyar_reviews set status='published' where id=$1",[fresh.id]);const publicRows=await rpc(db,'miyar_public_reviews',[d,'الاستاتيكا']);assert.deepEqual(publicRows.map(r=>r.id),[fresh.id]);assert.equal(publicRows[0].likes,0);
  const amendment=await rpc(db,'miyar_request_edit',[a,fresh.id,'الاستاتيكا','تعديل',90,91,92,REVIEW_TAGS.slice(-6).map(t=>t.label)]);assert.equal(amendment.status,'pending');
  const manual=await submit(a,'miyar_submit_existing_google_review','ميكانيك الماىع');
  const foreignCollege=(await db.query("insert into miyar_colleges(name,university_id) values('كلية أخرى',1) returning id")).rows[0].id;const foreignMajor=(await db.query("insert into miyar_majors(name,college_id) values('تخصص آخر',$1) returning id",[foreignCollege])).rows[0].id;await db.query("insert into miyar_study_plans(id,major_id,metadata) values('foreign-test',$1,'{}')",[foreignMajor]);await db.exec("insert into miyar_study_courses(id,plan_id,code,name) values('foreign-test/ge101','foreign-test','G101','استاتيكا')");
  const options=await rpc(db,'miyar_review_course_options',[manual.id]);const course=options.find(c=>c.id==='najran-ce-2025/ce211');assert.ok(course);assert.ok(!options.some(c=>c.id==='foreign-test/ge101'));await assert.rejects(rpc(db,'miyar_link_review_course',[admin,manual.id,'foreign-test/ge101']),/INVALID_STUDY_COURSE/);
  await rpc(db,'miyar_link_review_course',[admin,manual.id,course.id]);let row=(await db.query('select * from miyar_reviews where id=$1',[manual.id])).rows[0];assert.equal(row.subject,course.name);assert.equal(row.course_id,course.id);assert.equal(row.status,'pending');assert.equal(row.grade,null);assert.deepEqual(row.tags,[REVIEW_TAGS.at(-1).label]);
  assert.equal((await db.query('select count(*)::int n from miyar_review_course_links where review_id=$1',[manual.id])).rows[0].n,1);
  await assert.rejects(submit(a,'miyar_submit_existing_google_review',course.name,course.id),/REVIEW_ALREADY_EXISTS/);
  const duplicate=await submit(a,'miyar_submit_existing_google_review','اسم مكتوب مختلف');await assert.rejects(rpc(db,'miyar_link_review_course',[admin,duplicate.id,course.id]),/REVIEW_ALREADY_EXISTS/);assert.equal((await db.query('select subject from miyar_reviews where id=$1',[duplicate.id])).rows[0].subject,'اسم مكتوب مختلف');
  await assert.rejects(rpc(db,'miyar_link_review_course',[admin,duplicate.id,'missing-plan/missing']),/INVALID_STUDY_COURSE/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_review_course_options',[manual.id]),/permission denied/);await assert.rejects(rpc(db,'miyar_link_review_course',[admin,manual.id,course.id]),/permission denied/);await assert.rejects(db.query('select * from miyar_review_course_links'),/permission denied/);await db.exec('reset role');}
  await rpc(db,'miyar_delete_account',[a]);assert.equal((await db.query('select count(*)::int n from miyar_review_course_links')).rows[0].n,0);
 }finally{await db.close();}
});
