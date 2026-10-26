import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {normalizePublishedPlan} from '../supabase/functions/miyar/plan-format.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';import {ApiError} from '../supabase/functions/miyar/security.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
const course=(code,name,level=1)=>({code,name,credits:3,level,kind:'course',pool:null,prerequisites:[],corequisites:[],anyPrerequisites:[],minimumCredits:null,completedLevel:null,allPrevious:false,review:null,page:1});
const draft=()=>({id:'plan-12345678-1234-4234-8234-123456789012',title:'الخطة الدراسية للتخصص',fileLabel:'خطة ١٤٤٨',scopeNote:'',sha256:'a'.repeat(64),warnings:[],courses:[course('MATH 101','حساب التفاضل',1),{...course('ENG 202','الرياضيات الهندسية',2),prerequisites:['math101']}]});
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));return db;}

test('publication keeps Arabic names, stable course IDs and exact prerequisite codes, and rejects duplicates, self/cyclic requirements and unresolved elective slots',async()=>{
 const plan=await normalizePublishedPlan(draft());
 assert.equal(plan.courses[1].prerequisites[0],'MATH 101');assert.equal(plan.firstLevel,1);assert.equal(plan.scopeNote,'');
 assert.deepEqual(await normalizePublishedPlan(draft()),plan);
 for(const name of ['Calculus','حساب التفاضل Calculus','حساب <script>'])await assert.rejects(normalizePublishedPlan({...draft(),courses:[course('MATH 101',name)]}),/بالعربية فقط/);
 await assert.rejects(normalizePublishedPlan({...draft(),courses:[course('A 1','مادة أولى'),course('a1','مادة أخرى')]}),/مكرر/);
 await assert.rejects(normalizePublishedPlan({...draft(),courses:[{...course('A 1','مادة أولى'),prerequisites:['a1']}]}),/لنفسه/);
 await assert.rejects(normalizePublishedPlan({...draft(),courses:[{...course('A 1','مادة أولى'),prerequisites:['B 2']},{...course('B 2','مادة ثانية'),prerequisites:['A 1']}]}),/دائري/);
 await assert.rejects(normalizePublishedPlan({...draft(),courses:[{...course('SLOT','متطلب اختياري'),kind:'slot',pool:'اختياري تخصص'}]}),/بدائل/);
 const elective=await normalizePublishedPlan({...draft(),courses:[course('A','مادة أساسية'),{...course('SLOT','متطلب اختياري'),kind:'slot',pool:'اختياري تخصص'},{...course('E 1','مادة اختيارية',0),pool:'اختياري تخصص'}]});
 assert.equal(elective.groups.length,1);assert.equal(elective.courses[1].pool,elective.courses[2].pool);
 assert.equal(elective.courses[1].linkable,false);
});

test('uploaded plans publish atomically under the selected major, remain idempotent, appear publicly without importer identity and retain original plans',async()=>{
 const db=await database();try{
  await db.query('insert into auth.users(id) values($1)',[admin]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'الإدارة',3)",[admin]);
  const major=(await db.query("select major_id from miyar_study_plans where id='najran-ce-2025'")).rows[0].major_id;
  const plan=await normalizePublishedPlan({...draft(),university:'جامعة خاطئة',major:'تخصص خاطئ',fileData:'never-store-file'});
  let result=await rpc(db,'miyar_publish_study_plan',[admin,major,plan]);assert.equal(result.alreadySaved,false);
  result=await rpc(db,'miyar_publish_study_plan',[admin,major,plan]);assert.equal(result.alreadySaved,true);
  const uploaded=await rpc(db,'miyar_uploaded_study_plans',[]);assert.equal(uploaded.length,1);assert.equal(uploaded[0].university,'جامعة نجران');assert.equal(uploaded[0].major,'الهندسة المدنية');
  assert.equal(uploaded[0].courses.length,2);assert.deepEqual(await rpc(db,'miyar_course_doctors',[plan.courses[0].id]),[]);assert.equal((await db.query('select count(*)::int n from miyar_study_plans')).rows[0].n,6);
  assert.ok(!JSON.stringify(uploaded).includes(admin));assert.ok(!JSON.stringify(uploaded).includes('never-store-file'));
  await assert.rejects(rpc(db,'miyar_publish_study_plan',[admin,major,{...plan,id:'plan-99999999-9999-4999-8999-999999999999'}]),/STUDY_PLAN_EXISTS/);
  const broken=structuredClone(plan);broken.id='plan-99999999-9999-4999-8999-999999999999';broken.fileLabel='خطة أخرى';broken.versionKey='خطة أخرى';broken.courses[0].name='English only';
  await assert.rejects(rpc(db,'miyar_publish_study_plan',[admin,major,broken]),/INVALID_STUDY_PLAN/);
  assert.equal((await db.query('select count(*)::int n from miyar_study_plans')).rows[0].n,6);
  assert.equal((await db.query('select count(*)::int n from miyar_study_courses where plan_id=$1',[plan.id])).rows[0].n,2);
  await rpc(db,'miyar_reserve_plan_import',[admin]);await rpc(db,'miyar_reserve_plan_import',[admin]);await assert.rejects(rpc(db,'miyar_reserve_plan_import',[admin]),/PLAN_IMPORT_RATE/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_publish_study_plan',[admin,major,plan]),/permission denied/);await assert.rejects(db.query('select * from miyar_plan_import_attempts'),/permission denied/);await assert.rejects(rpc(db,'miyar_uploaded_study_plans',[]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

function fixture(){let actor=admin,finish='STOP',providerStatus=200;const calls=[],modelCalls=[];
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status:'active',university_id:3}];if(path==='rpc/miyar_study_import_target')return{majorId:1,major:'الهندسة المدنية',college:'كلية الهندسة',university:'جامعة نجران'};if(path==='rpc/miyar_uploaded_study_plans')return[];return{ok:true};};
 const aiFetch=async(url,options)=>{modelCalls.push({url,...options});if(providerStatus!==200)return new Response(JSON.stringify({error:{message:'secret-provider-error'}}),{status:providerStatus});return new Response(JSON.stringify({candidates:[{finishReason:finish,content:{parts:[{text:JSON.stringify(draft())}]}}]}),{status:200});};
 const handle=createHandler({db,env:{ADMIN_AUTH_IDS:admin,AI_PROVIDER:'gemini',GEMINI_API_KEY:'private-test-key'},authenticate:async request=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:actor};},aiFetch});
 const upload=(bytes='%PDF-1.7\nfixture',auth=true)=>{const form=new FormData();form.set('file',new Blob([bytes],{type:'application/pdf'}),'mixed-plan.pdf');form.set('majorId','1');form.set('fileLabel','خطة ١٤٤٨');return new Request('https://test?study=extract',{method:'POST',headers:auth?{authorization:'Bearer verified'}:{},body:form});};
 return {handle,calls,modelCalls,upload,setActor:value=>actor=value,setFinish:value=>finish=value,setStatus:value=>providerStatus=value};
}

test('only verified administrators may upload; authorization occurs before reading a large body and ordinary API limits remain unchanged',async()=>{
 const f=fixture();let read=false;const request=f.upload();Object.defineProperty(request,'body',{get(){read=true;throw new Error('must not consume non-admin upload');}});f.setActor(student);
 assert.equal((await f.handle(request)).status,403);assert.equal(read,false);assert.equal(f.modelCalls.length,0);
 assert.equal((await f.handle(f.upload(undefined,false))).status,401);
 assert.equal((await f.handle(new Request('https://test',{method:'POST',body:JSON.stringify({action:'admin',padding:'x'.repeat(18000)})}))).status,413);
 f.setActor(admin);assert.equal((await f.handle(f.upload('<html>not PDF</html>'))).status,400);assert.equal(f.modelCalls.length,0);
 const huge=new Uint8Array(6*1024*1024+1);assert.equal((await f.handle(f.upload(huge))).status,400);assert.equal(f.modelCalls.length,0);
});

test('native PDF extraction uses the existing private Gemini configuration, returns an editable Arabic draft and never publishes automatically',async()=>{
 const f=fixture();const bytes=await readFile(new URL('../public/plans/CE-2025.pdf',import.meta.url));
 const response=await f.handle(f.upload(bytes));assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.draft.courses.length,2);assert.equal(result.draft.majorId,1);assert.equal(result.draft.sha256.length,64);assert.equal(result.target.university,'جامعة نجران');
 assert.equal(f.modelCalls.length,1);const request=JSON.parse(f.modelCalls[0].body);assert.equal(request.contents[0].parts[1].inlineData.mimeType,'application/pdf');
 assert.equal(request.contents[0].parts[1].inlineData.data,bytes.toString('base64'));
 assert.ok(request.systemInstruction.parts[0].text.includes('لا تترجم'));assert.equal(request.tools,undefined);
 assert.ok(!JSON.stringify(result).includes('private-test-key'));assert.equal(f.calls.some(c=>c.path==='rpc/miyar_publish_study_plan'),false);
 assert.equal(f.calls.filter(c=>c.path==='rpc/miyar_reserve_plan_import').length,1);
 f.setFinish('MAX_TOKENS');assert.equal((await f.handle(f.upload())).status,503);f.setFinish('STOP');f.setStatus(429);assert.equal((await f.handle(f.upload())).status,429);
});

test('admin publication validates editable Arabic rows, binds the verified admin and exposes uploaded curricula to visitors',async()=>{
 const f=fixture();const request=d=>new Request('https://test?study=publish',{method:'POST',headers:{authorization:'Bearer verified','Content-Type':'application/json'},body:JSON.stringify({majorId:1,draft:d,adminId:student})});
 const response=await f.handle(request(draft()));assert.equal(response.status,200);
 const saved=f.calls.find(c=>c.path==='rpc/miyar_publish_study_plan');assert.equal(saved.body.p_admin,admin);assert.equal(saved.body.p_major,1);assert.equal(saved.body.p_plan.courses[1].prerequisites[0],'MATH 101');
 assert.equal((await f.handle(request({...draft(),courses:[course('A','English only')]}))).status,400);
 assert.equal(f.calls.filter(c=>c.path==='rpc/miyar_publish_study_plan').length,1);
 assert.equal((await f.handle(new Request('https://test',{method:'POST',body:JSON.stringify({action:'study.plans'})}))).status,200);
 const many={...draft(),courses:Array.from({length:90},(_,i)=>course('C '+i,'مادة دراسية '+i))};assert.ok(JSON.stringify(many).length>16384);assert.equal((await f.handle(request(many))).status,200);
});


test('OpenAI receives native image/PDF data privately and incomplete responses are rejected',async()=>{
 const {extractStudyPlan}=await import('../supabase/functions/miyar/plan-import.js');
 const db=async path=>path==='rpc/miyar_study_import_target'?{majorId:1,major:'الهندسة المدنية',college:'كلية الهندسة',university:'جامعة نجران'}:{ok:true};
 const calls=[];let status='completed';
 const fetcher=async(url,options)=>{calls.push({url,...options});return new Response(JSON.stringify({status,output:[{content:[{type:'output_text',text:JSON.stringify(draft())}]}]}));};
 const env={AI_PROVIDER:'openai',OPENAI_API_KEY:'private-openai-test'};
 for(const [bytes,mime] of [[new Uint8Array([137,80,78,71,13,10,26,10,1]),'image/png'],[new TextEncoder().encode('%PDF-1.7'),'application/pdf']]){
  const form=new FormData();form.set('majorId','1');form.set('fileLabel','خطة جديدة');form.set('file',new Blob([bytes],{type:mime}),'plan');
  const result=await extractStudyPlan(form,admin,db,env,fetcher);assert.equal(result.draft.courses.length,2);
  const body=JSON.parse(calls.at(-1).body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.tools,undefined);
  const file=body.input[0].content[1];assert.equal(file.type,mime==='application/pdf'?'input_file':'input_image');assert.ok((file.file_data||file.image_url).startsWith('data:'+mime+';base64,'));
  status='incomplete';await assert.rejects(extractStudyPlan(form,admin,db,env,fetcher),/لم تكتمل/);status='completed';
 }
});
