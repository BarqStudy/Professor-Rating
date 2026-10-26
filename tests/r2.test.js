import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
import {r2Configuration,signedR2Request,r2DownloadUrl,checkR2} from '../supabase/functions/miyar/r2.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';import {ApiError} from '../supabase/functions/miyar/security.js';import {normalizePublishedPlan} from '../supabase/functions/miyar/plan-format.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',fileId='33333333-3333-4333-8333-333333333333';
const env={ADMIN_AUTH_IDS:admin,R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET_NAME:'miyar-files',R2_ACCESS_KEY_ID:'k'.repeat(32),R2_SECRET_ACCESS_KEY:'s'.repeat(64)};
const key='miyar/files/11111111-1111-4111-8111-111111111111/'+'b'.repeat(64)+'.pdf';
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));return db;}
const req=(body,auth=true)=>new Request('https://test',{method:'POST',headers:auth?{authorization:'Bearer verified'}:{},body:JSON.stringify(body)});
const upload=(bytes='%PDF-1.7',auth=true)=>{const form=new FormData();form.set('file',new Blob([bytes],{type:'application/pdf'}),'خطة.pdf');form.set('id',fileId);return new Request('https://test?files=upload',{method:'POST',headers:auth?{authorization:'Bearer verified'}:{},body:form});};

test('R2 SigV4 PUT and short private download links match independently calculated Python HMAC vectors',async()=>{
 const config=r2Configuration(env),now=Date.UTC(2026,9,26,12);
 const put=await signedR2Request(config,{method:'PUT',key,body:new TextEncoder().encode('%PDF-1.7'),headers:{'content-type':'application/pdf'},now});
 assert.equal(put.url,`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/miyar-files/${key}`);
 assert.ok(put.options.headers.Authorization.endsWith('Signature=6737ec3a216b2bf06e05ec7a8d8e10a9d4a6b81567d538edd2886a61cb7d88fe'));
 assert.equal(put.options.headers['x-amz-date'],'20261026T120000Z');assert.equal(put.options.headers.host,undefined);assert.ok(!JSON.stringify(put).includes(env.R2_SECRET_ACCESS_KEY));
 const list=await signedR2Request(config,{method:'GET',query:[['max-keys','1'],['list-type','2']],now});
 assert.equal(new URL(list.url).search,'?list-type=2&max-keys=1');
 assert.ok(list.options.headers.Authorization.endsWith('Signature=71c606fe94c98a8f1864a1639630b9af5bbdab9c6a6169360764481e907e92d7'));
 const get=await r2DownloadUrl(config,key,'خطة.pdf',{now});const url=new URL(get.url);
 assert.equal(url.searchParams.get('X-Amz-Signature'),'40b282cb68f5a2f2b48a4f6f266f0ff19f49b6a0f76de75672bb51243c4d2fad');assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.equal(get.expiresAt,'2026-10-26T12:05:00.000Z');assert.ok(url.searchParams.get('response-content-disposition').startsWith('attachment;'));assert.ok(!get.url.includes(env.R2_SECRET_ACCESS_KEY));
 for(const path of ['../file.pdf','miyar/files/../../file','https://evil.test/a.pdf'])await assert.rejects(r2DownloadUrl(config,path,'file.pdf'),/معرّف الملف/);
 await assert.rejects(r2DownloadUrl(config,key,'file.pdf',{expires:99999}),/مدة/);
});

test('R2 setup checks are admin-readable metadata only and use a signed read-only bucket request',async()=>{
 let count=0;const missing=await checkR2({},()=>{count++;throw Error('must not call');});assert.equal(missing.configured,false);assert.equal(count,0);assert.deepEqual(missing.missing,['R2_ACCOUNT_ID','R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']);
 assert.equal(r2Configuration({...env,R2_ACCOUNT_ID:'https://evil.test'}).enabled,false);
 assert.equal(r2Configuration({...env,R2_BUCKET_NAME:'../../secret'}).enabled,false);
 const ready=await checkR2(env,async(url,options)=>{count++;assert.equal(options.method,'GET');assert.equal(new URL(url).search,'?list-type=2&max-keys=1');assert.equal(options.body,undefined);assert.equal(options.redirect,'manual');assert.ok(options.headers.Authorization.startsWith('AWS4-HMAC-SHA256'));return new Response('<ListBucketResult><Contents><Key>private-file.pdf</Key></Contents></ListBucketResult>',{status:200});});assert.equal(ready.ready,true);assert.ok(!JSON.stringify(ready).includes('private-file'));
 const denied=await checkR2(env,async()=>new Response(null,{status:403}));assert.equal(denied.ready,false);assert.match(denied.message,/رفض/);assert.ok(!JSON.stringify([ready,denied]).includes(env.R2_SECRET_ACCESS_KEY));
});

test('R2 check explains provider failures without reflecting private XML or following redirects',async()=>{
 for(const [status,code,expected]of [[400,'SignatureDoesNotMatch',/التوقيع غير مطابق/],[403,'InvalidAccessKeyId',/Access Key ID غير صحيح/],[403,'AccessDenied',/Object Read & Write/],[404,'NoSuchBucket',/غير موجودة/],[400,'AuthorizationHeaderMalformed',/بيانات توقيع/],[503,'SlowDown',/تقليل/]]){
  const result=await checkR2(env,async()=>new Response(`<Error><Code>${code}</Code><Message>${env.R2_SECRET_ACCESS_KEY}</Message><Resource>private-file.pdf</Resource></Error>`,{status}));
  assert.equal(result.ready,false);assert.equal(result.configured,true);assert.equal(result.httpStatus,status);assert.equal(result.errorCode,code);assert.match(result.message,expected);assert.ok(!JSON.stringify(result).includes(env.R2_SECRET_ACCESS_KEY));assert.ok(!JSON.stringify(result).includes('private-file'));
 }
 const unknown=await checkR2(env,async()=>new Response(`<Error><Code>${env.R2_SECRET_ACCESS_KEY}</Code><Message>private-file</Message></Error>`,{status:400}));assert.equal(unknown.errorCode,undefined);assert.match(unknown.message,/HTTP 400/);assert.ok(!JSON.stringify(unknown).includes(env.R2_SECRET_ACCESS_KEY));
 let cancelled=false;const oversized=await checkR2(env,async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(9000)));},cancel(){cancelled=true;}}),{status:502}));assert.equal(cancelled,true);assert.equal(oversized.httpStatus,502);
 let requests=0;const moved=await checkR2(env,async(_,options)=>{requests++;assert.equal(options.redirect,'manual');return new Response(null,{status:307,headers:{location:'https://untrusted.example'}});});assert.equal(requests,1);assert.match(moved.message,/Jurisdiction/);assert.ok(!JSON.stringify(moved).includes('untrusted.example'));
 const network=await checkR2(env,async()=>{throw Error(env.R2_SECRET_ACCESS_KEY);});assert.equal(network.ready,false);assert.ok(!JSON.stringify(network).includes(env.R2_SECRET_ACCESS_KEY));
});

test('file metadata has private RLS, atomic retries, owner/hash binding and links original study files without exposing them publicly',async()=>{
 const db=await database();try{
  for(const id of [admin,student]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const args=[fileId,admin,'خطة.pdf','application/pdf',100,'a'.repeat(64),'study'];
  const initial=await rpc(db,'miyar_begin_file_upload',args);assert.equal(initial.status,'uploading');assert.match(initial.object_key,/^miyar\/study\//);
  assert.equal((await rpc(db,'miyar_begin_file_upload',args)).id,fileId);assert.equal((await db.query('select count(*)::int n from miyar_files')).rows[0].n,1);
  await assert.rejects(rpc(db,'miyar_begin_file_upload',[fileId,student,...args.slice(2)]),/FILE_UPLOAD_CONFLICT/);
  await assert.rejects(rpc(db,'miyar_begin_file_upload',[fileId,admin,'other.pdf',...args.slice(3)]),/FILE_UPLOAD_CONFLICT/);
  await rpc(db,'miyar_fail_file_upload',[fileId,admin]);assert.equal((await rpc(db,'miyar_begin_file_upload',args)).status,'uploading');
  await rpc(db,'miyar_finish_file_upload',[fileId,admin,'"etag"']);await rpc(db,'miyar_fail_file_upload',[fileId,admin]);assert.equal((await rpc(db,'miyar_begin_file_upload',args)).status,'ready');
  const draft={id:'plan-12345678-1234-4234-8234-123456789012',title:'خطة دراسية',fileLabel:'خطة جديدة',sha256:'a'.repeat(64),courses:[{code:'ABC 101',name:'مهارات AI',credits:3,level:1,kind:'course',pool:null,prerequisites:[],corequisites:[],anyPrerequisites:[],allPrevious:false,page:1}]};
  const plan=await normalizePublishedPlan(draft),major=(await db.query("select major_id from miyar_study_plans where id='najran-ce-2025'")).rows[0].major_id;
  await rpc(db,'miyar_publish_study_plan',[admin,major,plan,fileId]);assert.equal((await db.query('select source_file_id from miyar_study_plans where id=$1',[plan.id])).rows[0].source_file_id,fileId);assert.ok(!JSON.stringify(await rpc(db,'miyar_uploaded_study_plans',[])).includes(fileId));
  const invalid=await normalizePublishedPlan({...draft,id:'plan-99999999-9999-4999-8999-999999999999',fileLabel:'نسخة أخرى',sha256:'b'.repeat(64)});await assert.rejects(rpc(db,'miyar_publish_study_plan',[admin,major,invalid,fileId]),/INVALID_FILE/);
  await assert.rejects(rpc(db,'miyar_publish_study_plan',[student,major,plan,fileId]),/INVALID_FILE/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from miyar_files'),/permission denied/);await assert.rejects(rpc(db,'miyar_begin_file_upload',args),/permission denied/);await assert.rejects(rpc(db,'miyar_finish_file_upload',[fileId,admin,'']),/permission denied/);await db.exec('reset role');}
  await db.query("update miyar_accounts set status='restricted' where auth_id=$1",[student]);await assert.rejects(rpc(db,'miyar_begin_file_upload',[crypto.randomUUID(),student,...args.slice(2)]),/ACCOUNT_RESTRICTED/);
  for(let i=1;i<20;i++)await rpc(db,'miyar_begin_file_upload',[crypto.randomUUID(),...args.slice(1)]);await assert.rejects(rpc(db,'miyar_begin_file_upload',[crypto.randomUUID(),...args.slice(1)]),/FILE_UPLOAD_RATE/);
 }finally{await db.close();}
});

test('HTTP R2 uploads authorize before reading large bodies, validate bytes, keep ordinary limits and retry the same immutable object',async()=>{
 let actor=admin,networkCalls=0,failed=false;const rows=new Map(),calls=[];
 const db=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('miyar_accounts?'))return[{auth_id:actor,status:'active',university_id:3}];
  if(path==='rpc/miyar_begin_file_upload'){const b=options.body;if(!rows.has(b.p_id))rows.set(b.p_id,{id:b.p_id,status:'uploading',object_key:`miyar/files/${b.p_id}/${b.p_sha256}.pdf`,name:b.p_name,byte_size:b.p_size,mime_type:b.p_mime});return rows.get(b.p_id);}
  if(path==='rpc/miyar_finish_file_upload')rows.get(options.body.p_id).status='ready';if(path==='rpc/miyar_fail_file_upload')rows.get(options.body.p_id).status='failed';
  if(path.startsWith('miyar_files?id=')){const row=rows.get(fileId);return row?.status==='ready'?[row]:[];}if(path.startsWith('miyar_files?'))return[...rows.values()];return{ok:true};};
 const fetcher=async(url,options)=>{networkCalls++;assert.ok(url.startsWith(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/`));assert.equal(options.method,'PUT');assert.ok(options.headers.Authorization);assert.equal(new TextDecoder().decode(options.body),'%PDF-1.7');return failed?new Response(JSON.stringify({error:env.R2_SECRET_ACCESS_KEY}),{status:403}):new Response(null,{status:200,headers:{etag:'"hash"'}});};
 const handler=createHandler({db,env,storageFetch:fetcher,authenticate:async request=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:actor};}});
 const large=upload();let read=false;Object.defineProperty(large,'body',{get(){read=true;throw Error('do not read');}});actor=student;assert.equal((await handler(large)).status,403);assert.equal(read,false);assert.equal(networkCalls,0);
 assert.equal((await handler(req({action:'admin',operation:'files.download',id:fileId}))).status,403);actor=admin;
 assert.equal((await handler(upload(undefined,false))).status,401);assert.equal((await handler(upload('<html>fake PDF</html>'))).status,400);assert.equal(networkCalls,0);
 assert.equal((await handler(new Request('https://test',{method:'POST',body:JSON.stringify({action:'catalogue',padding:'x'.repeat(18000)})}))).status,413);
 failed=true;let result=await handler(upload());assert.equal(result.status,503);assert.ok(!(await result.text()).includes(env.R2_SECRET_ACCESS_KEY));assert.equal(rows.get(fileId).status,'failed');failed=false;
 result=await handler(upload());assert.equal(result.status,201);assert.equal((await result.json()).provider,'r2');assert.equal(rows.size,1);assert.equal(rows.get(fileId).status,'ready');const count=networkCalls;assert.equal((await handler(upload())).status,201);assert.equal(networkCalls,count,'a completed retry does not reupload the object');
 result=await handler(req({action:'admin',operation:'files.download',id:fileId,key:'../ignored',expires:99999}));assert.equal(result.status,200);const link=await result.json();assert.equal(new URL(link.url).searchParams.get('X-Amz-Expires'),'300');assert.ok(!JSON.stringify(link).includes(env.R2_SECRET_ACCESS_KEY));
 const noConfig=createHandler({db,env:{ADMIN_AUTH_IDS:admin},authenticate:async()=>({id:admin}),storageFetch:fetcher});assert.equal((await noConfig(upload())).status,503);assert.equal((await (await noConfig(req({action:'admin',operation:'storage.status'}))).json()).configured,false);
});

test('study extraction archives original bytes only when R2 is configured, and publication binds its private file ID',async()=>{
 const {extractStudyPlan,publishStudyPlan}=await import('../supabase/functions/miyar/plan-import.js');const calls=[];
 const course={code:'ABC 101',name:'برمجة AI',credits:3,level:1,kind:'course',pool:null,prerequisites:[],corequisites:[],anyPrerequisites:[],allPrevious:false,page:1};
 const db=async(path,options={})=>{calls.push({path,...options});if(path==='rpc/miyar_study_import_target')return{majorId:1,major:'تخصص',college:'كلية',university:'جامعة'};if(path==='rpc/miyar_begin_file_upload'){const b=options.body;return{id:b.p_id,name:b.p_name,mime_type:b.p_mime,byte_size:b.p_size,status:'uploading',object_key:`miyar/study/${b.p_id}/${b.p_sha256}.pdf`};}return{ok:true};};
 const form=new FormData();form.set('file',new Blob(['%PDF-1.7'],{type:'application/pdf'}),'plan.pdf');form.set('majorId','1');form.set('fileLabel','خطة');
 const ai=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title:'خطة عربية',scopeNote:'',warnings:[],courses:[course]})}]}}]}));
 let uploaded=0;const store=async(_,options)=>{uploaded++;assert.equal(new TextDecoder().decode(options.body),'%PDF-1.7');return new Response(null,{status:200});};
 const result=await extractStudyPlan(form,admin,db,{...env,AI_PROVIDER:'gemini',GEMINI_API_KEY:'private-ai-test'},ai,store);assert.equal(uploaded,1);assert.equal(result.storage.stored,true);assert.ok(result.draft.sourceFileId);assert.equal(calls.find(c=>c.path==='rpc/miyar_begin_file_upload').body.p_purpose,'study');
 await publishStudyPlan({majorId:1,draft:result.draft},admin,db);const saved=calls.at(-1).body;assert.equal(saved.p_file,result.draft.sourceFileId);assert.equal(saved.p_plan.sourceFileId,undefined);
 const ordinary=await extractStudyPlan(form,admin,db,{AI_PROVIDER:'gemini',GEMINI_API_KEY:'private-ai-test'},ai,store);assert.equal(ordinary.storage.stored,false);assert.equal(ordinary.draft.sourceFileId,undefined);assert.equal(uploaded,1);
});
