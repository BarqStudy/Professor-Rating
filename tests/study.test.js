import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {cleanProgress,courseStatus,progressSummary,selectedCourse} from '../src/study-engine.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {ApiError} from '../supabase/functions/miyar/security.js';
import {guestTokenHash} from '../supabase/functions/miyar/guest.js';
const plans=JSON.parse(await readFile(new URL('../data/study-plans.json',import.meta.url),'utf8'));
const find=id=>plans.find(p=>p.id==='najran-'+id);
const item=(plan,code)=>plan.courses.find(c=>c.code===code);

test('five curricula preserve original PDFs, scoped identities and unresolved source errors',async()=>{
 assert.equal(plans.length,5);const ids=new Set();
 for(const plan of plans){
  const pdf=await readFile(new URL('../public/plans/'+plan.source,import.meta.url));
  assert.equal(createHash('sha256').update(pdf).digest('hex'),plan.sha256);
  assert.equal(plan.firstLevel,3);
  const local=new Set();
  for(const course of plan.courses){
   assert.ok(!ids.has(course.id));ids.add(course.id);local.add(course.id);
   assert.ok(course.id.startsWith(plan.id+'/'));assert.ok(course.page>1);
   assert.ok(!/[\u0000-\u001f\ufffd]/u.test(course.name));
   assert.ok(course.credits===null||Number.isInteger(course.credits)&&course.credits>0);
   if(course.kind==='slot')assert.ok(plan.courses.some(c=>c.level===0&&c.pool===course.pool));
  }
  for(const g of plan.groups)for(const id of g.slots)assert.ok(local.has(id));
 }
 const civil=find('ce-2025'),mechanical=find('me-2026'),chemical=find('che-2025');
 assert.equal(item(civil,'همد 211').name,item(mechanical,'همك 231').name);
 assert.notEqual(item(civil,'همد 211').id,item(mechanical,'همك 231').id);
 assert.notEqual(item(civil,'همد 211').id,item(chemical,'هكم 311').id);
 assert.equal(item(civil,'هعم 204').credits,null);
 assert.equal(find('arc-2026').courses.filter(c=>c.code==='عمر 356'&&!c.linkable).length,2);
});

test('planner unlocks exact prerequisites, preserves corequisites and conservatively blocks uncertain conditions',()=>{
 const plan=find('me-2026');let state=cleanProgress(plan);
 const fluids=item(plan,'همك 231');
 assert.equal(courseStatus(plan,item(plan,'ريض 106'),state).key,'ready','the removed foundation setting no longer locks the whole plan');
 assert.equal(courseStatus(plan,fluids,state).key,'locked');
 state.foundation=true;state.completed=[item(plan,'همك 221').id];
 assert.equal(courseStatus(plan,fluids,state).key,'ready');
 // Another department/code with a similar name cannot satisfy a requirement.
 state=cleanProgress(plan,{foundation:true,completed:[item(find('ce-2025'),'همد 211').id]});
 assert.equal(courseStatus(plan,fluids,state).key,'locked');
 const electrical=find('ee-2025'),lab=item(electrical,'كهر 252');
 state=cleanProgress(electrical,{foundation:true});
 assert.equal(courseStatus(electrical,lab,state).key,'concurrent');
 state.completed=[item(electrical,'كهر 251').id];assert.equal(courseStatus(electrical,lab,state).key,'ready');
 const software=item(electrical,'كهر 253');state.completed=[item(electrical,'هعم 205').id];
 assert.equal(courseStatus(electrical,software,state).key,'review');
 state.externalPassed=['هعم 204'];assert.equal(courseStatus(electrical,software,state).key,'review','hidden legacy external settings cannot certify an unlisted prerequisite');
 assert.equal(courseStatus(find('ce-2025'),item(find('ce-2025'),'همد 455'),{foundation:true}).key,'review');
 const arc=find('arc-2026'),studio=item(arc,'عمر 417');
 assert.equal(courseStatus(arc,studio,{foundation:true,completed:[item(arc,'عمر 491').id]}).key,'ready');
 assert.equal(courseStatus(arc,studio,{foundation:true,completed:[item(arc,'عمر 463').id]}).key,'ready');
 assert.equal(courseStatus(arc,studio,{foundation:true}).key,'locked');
});

test('electives count once per slot, remain department-scoped and cannot bypass level or credit requirements',()=>{
 const plan=find('ee-2025'),slots=plan.courses.filter(c=>c.kind==='slot'&&c.pool==='ee');
 const candidate=item(plan,'كهر 430'),oneCredit=item(plan,'كهر 463');
 let state=cleanProgress(plan,{foundation:true,completed:slots.map(c=>c.id),electiveChoices:{[slots[0].id]:candidate.id,[slots[1].id]:candidate.id,[slots[2].id]:oneCredit.id}});
 assert.equal(Object.keys(state.electiveChoices).length,1);
 assert.equal(progressSummary(plan,state).completed,1);
 assert.equal(progressSummary(plan,state).completedCredits,3);
 assert.equal(selectedCourse(plan,slots[1],state),undefined);
 assert.equal(courseStatus(plan,slots[1],state).key,'choice');
 const mechanical=find('me-2026'),project=item(mechanical,'همك 396');
 state=cleanProgress(mechanical,{foundation:true,extraCredits:100});assert.equal(courseStatus(mechanical,project,state).key,'review');
 state.completed=mechanical.courses.filter(c=>c.level===3).map(c=>c.id);
 assert.equal(courseStatus(mechanical,project,state).key,'review','a plan excluding the engineering track does not certify the external credit requirement');
 const training=item(mechanical,'همك 495');
 state.completed=mechanical.courses.filter(c=>c.level>0&&c.level<10).map(c=>c.id);
 assert.equal(courseStatus(mechanical,training,state).key,'locked','unselected elective slots block completed-level conditions');
 assert.equal(cleanProgress(plan,{extraCredits:999,externalPassed:['هعم 204','fake'],completed:['fake']}).extraCredits,100);
 assert.deepEqual(cleanProgress(plan,{externalPassed:['fake']}).externalPassed,[]);
});

test('database keeps course reviews published-only and atomically rejects cross-university links',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  assert.equal((await db.query('select count(*)::int n from miyar_study_plans')).rows[0].n,5);
  const account='11111111-1111-4111-8111-111111111111';
  await db.query('insert into auth.users(id) values($1)',[account]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[account]);
  const civil='najran-ce-2025/ce211',mechanical='najran-me-2026/me231';
  const submit=(major,course,name='أحمد محمد العتيبي',subject='ميكانيكا الموائع')=>rpc('miyar_submit_google_review',[account,'كلية الهندسة',major,name,subject,92,90,80,70,'',[],false,course]);
  const a=await submit('الهندسة المدنية',civil);
  const b=await submit('الهندسة الميكانيكية',mechanical);
  assert.deepEqual(await rpc('miyar_course_doctors',[civil]),[],'pending data never establishes a public association');
  await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published';");
  const cd=await rpc('miyar_course_doctors',[civil]),md=await rpc('miyar_course_doctors',[mechanical]);
  assert.equal(cd.length,1);assert.equal(md.length,1);assert.notEqual(cd[0].id,md[0].id);
  assert.equal(cd[0].count,1);assert.deepEqual(cd[0].scores,[90,80,70]);
  for(const privateField of ['grade','account_id','guest_id',account])assert.ok(!JSON.stringify(cd).includes(privateField));
  const before=(await db.query('select count(*)::int n from miyar_reviews')).rows[0].n;
  await db.exec("insert into miyar_colleges(university_id,name) values(1,'كلية الهندسة');insert into miyar_majors(college_id,name) select id,'الهندسة المدنية' from miyar_colleges where university_id=1;insert into miyar_study_plans(id,major_id,metadata) select 'saud-ce-2025',m.id,'{}' from miyar_majors m join miyar_colleges c on c.id=m.college_id where c.university_id=1;insert into miyar_study_courses values('saud-ce-2025/ce211','saud-ce-2025','همد 211','ميكانيكا الموائع',true);");
  await assert.rejects(submit('الهندسة المدنية','saud-ce-2025/ce211','خالد محمد العتيبي'),/INVALID_STUDY_COURSE/);
  await assert.rejects(submit('الهندسة المدنية',civil,'خالد محمد العتيبي','ميكانيكا'),/INVALID_STUDY_COURSE/);
  await assert.rejects(submit('الهندسة المدنية','najran-ce-2025/missing','خالد محمد العتيبي'),/INVALID_STUDY_COURSE/);
  assert.equal((await db.query('select count(*)::int n from miyar_reviews')).rows[0].n,before,'invalid links roll back review and doctor insertion');
  assert.equal((await db.query("select count(*)::int n from miyar_doctors where name='خالد محمد العتيبي'")).rows[0].n,0);
  const legacy=await rpc('miyar_submit_google_review',[account,'كلية الهندسة','الهندسة المدنية','خالد محمد العتيبي','مادة غير مرتبطة',90,90,90,90,'',[],false]);
  await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published';");
  assert.equal((await rpc('miyar_course_doctors',[civil])).length,1,'unrelated legacy material names are not linked');
  await db.query("update miyar_reviews set subject='مادة أخرى' where id=$1",[a.id]);
  assert.equal((await db.query('select course_id from miyar_reviews where id=$1',[a.id])).rows[0].course_id,null);
  assert.deepEqual(await rpc('miyar_course_doctors',[civil]),[],'an approved material edit removes stale links');
  const guest=await rpc('miyar_open_guest',['a'.repeat(64),null]);await db.query('update miyar_guest_sessions set university_id=3 where id=$1',[guest.id]);
  const g=await rpc('miyar_guest_submit',[guest.id,'كلية الهندسة','الهندسة المدنية','مهندس محمد علي القحطاني','ميكانيكا الموائع',95,80,80,80,'',[],true,civil]);
  await db.exec("update miyar_doctors set status='approved';update miyar_reviews set status='published';");
  assert.equal((await rpc('miyar_course_doctors',[civil]))[0].count,1);
  await db.query("update miyar_reviews set status='rejected' where id=$1",[g.id]);assert.deepEqual(await rpc('miyar_course_doctors',[civil]),[]);
  // Same name and code in another plan version stays independent.
  await db.exec("insert into miyar_study_plans(id,major_id,metadata) select 'najran-ce-2027',major_id,metadata||jsonb_build_object('fileLabel','CE-2027') from miyar_study_plans where id='najran-ce-2025';insert into miyar_study_courses values('najran-ce-2027/ce211','najran-ce-2027','همد 211','ميكانيكا الموائع',true);");
  assert.deepEqual(await rpc('miyar_course_doctors',['najran-ce-2027/ce211']),[]);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from miyar_study_courses'),/permission denied/);
   await assert.rejects(db.query('select miyar_course_doctors($1)',[civil]),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});

test('course HTTP routes remain public while submissions bind verified Google and guest actors',async()=>{
 const account='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222',token='a'.repeat(64),hash=await guestTokenHash(token),calls=[];
 const db=async(path,options={})=>{
  calls.push({path,...options});
  if(path.startsWith('miyar_accounts?'))return[{auth_id:account,status:'active',university_id:3}];
  if(path.startsWith('miyar_guest_sessions?'))return path.includes(hash)?[{id:guest,status:'active',university_id:3}]:[];
  if(path==='rpc/miyar_course_doctors')return[];
  return {id:1,status:'pending'};
 };
 const handle=createHandler({db,env:{},authenticate:async r=>{if(!r.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:account};}});
 const request=(body,headers={})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal((await handle(request({action:'course.doctors',courseId:'najran-ce-2025/ce211'}))).status,200);
 const data={college:'كلية الهندسة',major:'الهندسة المدنية',name:'أحمد محمد العتيبي',subject:'ميكانيكا الموائع',grade:90,scores:[80,80,80],comment:'',pledged:true,courseId:'najran-ce-2025/ce211'};
 assert.equal((await handle(request({action:'submit',...data}))).status,401);
 assert.equal((await handle(request({action:'submit',...data,accountId:guest},{authorization:'Bearer verified'}))).status,201);
 assert.equal(calls.find(c=>c.path==='rpc/miyar_submit_google_review').body.p_account,account);
 assert.equal(calls.find(c=>c.path==='rpc/miyar_submit_google_review').body.p_course,data.courseId);
 assert.equal((await handle(request({action:'guest.submit',...data,guestId:account},{'x-miyar-guest':token}))).status,201);
 assert.equal(calls.find(c=>c.path==='rpc/miyar_guest_submit').body.p_guest,guest);
 for(const courseId of [123,{},'bad/id?eq=1','../','najran-ce-2025/ce211%'])assert.equal((await handle(request({action:'submit',...data,courseId},{authorization:'Bearer verified'}))).status,400);
});

test('existing professor reviews use one canonical ID and appear in the main catalogue only after approval',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const account='11111111-1111-4111-8111-111111111111';
  await db.query('insert into auth.users(id) values($1)',[account]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[account]);
  const d=(await db.query("insert into miyar_doctors(major_id,name,status) select major_id,'م. أحمد محمد العتيبي','approved' from miyar_study_plans where id='najran-ce-2025' returning id")).rows[0].id;
  const submit=(id=d,course='najran-ce-2025/ce211')=>rpc('miyar_submit_existing_google_review',[account,id,'ميكانيكا الموائع',92,90,80,70,'',[],false,course]);
  const r=await submit();assert.equal(r.newDoctor,false);assert.equal(r.status,'pending');
  assert.equal((await db.query('select doctor_id from miyar_reviews where id=$1',[r.id])).rows[0].doctor_id,d);
  let catalogue=await rpc('miyar_catalogue',[]);assert.equal(catalogue.doctors.length,1);assert.equal(catalogue.doctors[0].count,0);
  await db.query("update miyar_reviews set status='published' where id=$1",[r.id]);
  catalogue=await rpc('miyar_catalogue',[]);assert.equal(catalogue.doctors.length,1);assert.equal(catalogue.doctors[0].count,1);
  await assert.rejects(submit(),/REVIEW_ALREADY_EXISTS/);
  await assert.rejects(submit(d,'najran-me-2026/me231'),/REVIEW_ALREADY_EXISTS|INVALID_STUDY_COURSE/);
  const guest=await rpc('miyar_open_guest',['a'.repeat(64),null]);await db.query('update miyar_guest_sessions set university_id=3 where id=$1',[guest.id]);
  const g=await rpc('miyar_submit_existing_guest_review',[guest.id,d,'ميكانيكا الموائع',87,80,80,80,'',[],false,'najran-ce-2025/ce211']);
  assert.equal(g.newDoctor,false);assert.equal((await db.query('select doctor_id from miyar_reviews where id=$1',[g.id])).rows[0].doctor_id,d);
  await db.query("update miyar_reviews set status='published' where id=$1",[g.id]);
  catalogue=await rpc('miyar_catalogue',[]);assert.equal(catalogue.doctors.length,1);assert.equal(catalogue.doctors[0].count,2);
  // A professor in another university with the same name cannot silently select/create a local namesake.
  await db.exec("insert into miyar_colleges(university_id,name) values(1,'كلية الهندسة');insert into miyar_majors(college_id,name) select id,'الهندسة المدنية' from miyar_colleges where university_id=1;insert into miyar_doctors(major_id,name,status) select m.id,'م. أحمد محمد العتيبي','approved' from miyar_majors m join miyar_colleges c on c.id=m.college_id where c.university_id=1;");
  const foreign=(await db.query('select max(id)::int id from miyar_doctors')).rows[0].id;
  await assert.rejects(submit(foreign),/DOCTOR_UNAVAILABLE/);
  await assert.rejects(rpc('miyar_submit_existing_guest_review',[guest.id,foreign,'مادة أخرى',90,80,80,80,'',[],false,null]),/DOCTOR_UNAVAILABLE/);
  assert.equal((await db.query('select count(*)::int n from miyar_doctors')).rows[0].n,2);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(submit(),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});

test('existing professor HTTP submissions bind trusted actor and ID and ignore stale posted professor names',async()=>{
 const account='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222',token='b'.repeat(64),digest=await guestTokenHash(token),calls=[];
 const db=async(path,options={})=>{
  calls.push({path,...options});
  if(path.startsWith('miyar_accounts?'))return[{auth_id:account,status:'active',university_id:3}];
  if(path.startsWith('miyar_guest_sessions?'))return path.includes(digest)?[{id:guest,status:'active',university_id:3}]:[];
  return{id:1,status:'pending',newDoctor:false};
 };
 const handle=createHandler({db,env:{},authenticate:async r=>{if(!r.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:account};}});
 const data={college:'كلية قديمة',major:'تخصص قديم',name:'اسم دكتور قديم',subject:'ميكانيكا الموائع',grade:90,scores:[80,80,80],comment:'',pledged:true,courseId:'najran-ce-2025/ce211',existingDoctorId:17};
 const request=(action,headers,extra={})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify({...data,...extra,action,accountId:guest,guestId:account})});
 assert.equal((await handle(request('submit',{authorization:'Bearer verified'}))).status,201);
 const google=calls.find(c=>c.path==='rpc/miyar_submit_existing_google_review');assert.equal(google.body.p_account,account);assert.equal(google.body.p_doctor,17);assert.ok(!('p_name' in google.body));assert.ok(!('p_major' in google.body));
 assert.equal((await handle(request('guest.submit',{'x-miyar-guest':token}))).status,201);
 assert.equal(calls.find(c=>c.path==='rpc/miyar_submit_existing_guest_review').body.p_guest,guest);
 for(const existingDoctorId of [0,-1,'17',{},1.2])assert.equal((await handle(request('submit',{authorization:'Bearer verified'},{existingDoctorId}))).status,400);
 assert.equal((await handle(request('submit',{},{}))).status,401);
});
