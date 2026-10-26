import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import nodemailer from 'nodemailer';
import {createInstitutionMailer,institutionMessage,institutionMailStatus,mailError} from '../supabase/functions/miyar/institution-mail.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
const env={ADMIN_AUTH_IDS:admin,SMTP_USER:'info@miyar.website',SMTP_PASSWORD:'test-password-keep-private'};
const record={id:1,name:'جامعة نجران',request_kind:'college',colleges:[{name:'كلية العلوم',majors:['الفيزياء']}],contact_email:'student@example.test'};
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
async function database(backfill=false){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');const dir=new URL('../supabase/migrations/',import.meta.url);const migrations=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();for(const name of migrations.filter(n=>!backfill||!n.endsWith('_institution_mail.sql')))await db.exec(await readFile(new URL(name,dir),'utf8'));await db.query('insert into auth.users values($1,$2)',[student,'student@example.test']);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[student]);if(backfill){await rpc(db,'miyar_request_institution_contact',[student,null,3,null,record.colleges,'college',record.contact_email]);await db.exec(await readFile(new URL(migrations.find(n=>n.endsWith('_institution_mail.sql')),dir),'utf8'));}return db;}

test('migration makes previously missed pending requests available for retry',async()=>{const db=await database(true);try{const rows=await db.query('select r.contact_email,m.status,m.attempts from miyar_institution_requests r join miyar_institution_mail m on m.request_id=r.id');assert.deepEqual(rows.rows,[{contact_email:record.contact_email,status:'pending',attempts:0}]);}finally{await db.close();}});

test('private durable outbox leases, fences stale workers and never resends recorded success',async()=>{
 const db=await database();try{
 const req=await rpc(db,'miyar_request_institution_contact',[student,null,3,null,record.colleges,'college',record.contact_email]);
 const state=()=>db.query('select * from miyar_institution_mail where request_id=$1',[req.id]).then(r=>r.rows[0]);
 assert.equal((await state()).status,'pending');const claim=await rpc(db,'miyar_claim_institution_mail',[req.id]);assert.equal(claim.request.contact_email,record.contact_email);assert.equal((await state()).attempts,1);
 assert.equal(await rpc(db,'miyar_claim_institution_mail',[req.id]),null);
 assert.equal(await rpc(db,'miyar_finish_institution_mail',[req.id,admin,true,null]),false);
 assert.equal(await rpc(db,'miyar_finish_institution_mail',[req.id,claim.lease,false,'safe failure']),true);assert.equal((await state()).status,'failed');assert.equal(await rpc(db,'miyar_claim_institution_mail',[req.id]),null);
 await db.query("update miyar_institution_mail set retry_after=now()-interval '1 second' where request_id=$1",[req.id]);const second=await rpc(db,'miyar_claim_institution_mail',[req.id]);assert.notEqual(second.lease,claim.lease);
 assert.equal(await rpc(db,'miyar_finish_institution_mail',[req.id,claim.lease,true,null]),false);
 await rpc(db,'miyar_finish_institution_mail',[req.id,second.lease,true,null]);assert.equal((await state()).status,'sent');assert.equal(await rpc(db,'miyar_claim_institution_mail',[req.id]),null);
 assert.ok(!JSON.stringify(await rpc(db,'miyar_catalogue',[])).includes(record.contact_email));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from miyar_institution_mail'),/permission denied/);await assert.rejects(rpc(db,'miyar_claim_institution_mail',[req.id]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('SMTP uses verified TLS465, a fixed recipient and stored contact; errors preserve request and redact provider details',async()=>{
 const calls=[],options=[];let fail=false,claim=true,closed=0;
 const db=async(path,args)=>{calls.push({path,...args});if(path==='rpc/miyar_claim_institution_mail')return claim?{lease:admin,request:record}:null;return true;};
 const mailer=createInstitutionMailer({db,env,transportFactory:async config=>{options.push(config);return {sendMail:async message=>{assert.equal(message.to,'info@miyar.website');assert.equal(message.replyTo,record.contact_email);assert.ok(message.text.includes('كلية العلوم'));if(fail)throw Object.assign(new Error(env.SMTP_PASSWORD),{code:'EAUTH'});return {accepted:['info@miyar.website']};},verify:async()=>true,close:()=>closed++};}});
 assert.equal((await mailer.deliver(1)).sent,true);assert.equal(options[0].port,465);assert.equal(options[0].secure,true);assert.equal(options[0].tls.rejectUnauthorized,true);assert.equal(calls.at(-1).body.p_sent,true);
 fail=true;const failed=await mailer.deliver(1);assert.equal(failed.sent,false);assert.ok(!JSON.stringify(failed).includes(env.SMTP_PASSWORD));assert.equal(calls.at(-1).body.p_sent,false);assert.equal(closed,2);
 claim=false;assert.equal((await mailer.deliver(1)).skipped,true);assert.equal(options.length,2);
 const offline=createInstitutionMailer({db:()=>assert.fail('must not claim without configuration'),env:{}});assert.equal((await offline.deliver(1)).pending,true);assert.deepEqual(institutionMailStatus({}).missing,['SMTP_USER','SMTP_PASSWORD']);assert.equal(institutionMailStatus({...env,SMTP_USER:'bad\r\nBcc:x@example.test'}).configured,false);
 assert.ok(!mailError(new Error(env.SMTP_PASSWORD)).includes(env.SMTP_PASSWORD));
});

test('Arabic notification composes valid MIME with a single fixed envelope recipient and rejects header-injected reply-to',async()=>{
 const message=institutionMessage({...record,contact_email:'student@example.test\r\nBcc: bad@example.test'},env.SMTP_USER);assert.equal(message.replyTo,undefined);
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});const mime=await transport.sendMail(institutionMessage(record,env.SMTP_USER));
 assert.deepEqual(mime.envelope.to,['info@miyar.website']);assert.equal(mime.envelope.from,env.SMTP_USER);const raw=mime.message.toString();assert.ok(raw.includes('Content-Type: text/plain; charset=utf-8'));assert.ok(raw.includes('Reply-To: student@example.test'));assert.ok(raw.includes('Message-ID: <institution-request-1@miyar.website>'));assert.ok(!raw.includes(env.SMTP_PASSWORD));
});

test('only active admins can check or retry SMTP; forged recipient and account flags are ignored',async()=>{
 let actor=student,status='active',sent=0,claimed=0;
 const db=async(path)=>{if(path.startsWith('miyar_accounts?'))return[{status,university_id:3}];if(path==='rpc/miyar_claim_institution_mail'){claimed++;return {lease:admin,request:record};}return true;};
 const handle=createHandler({db,env,authenticate:async()=>({id:actor}),mailTransport:async()=>({verify:async()=>true,sendMail:async message=>{sent++;assert.equal(message.to,'info@miyar.website');return {accepted:['info@miyar.website']};},close(){}})});
 const request=operation=>new Request('https://test',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify({action:'admin',operation,id:1,isAdmin:true,to:'attacker@example.test',account:admin})});
 assert.equal((await handle(request('institution.mail.retry'))).status,403);assert.equal(claimed,0);actor=admin;status='restricted';assert.equal((await handle(request('institution.mail.retry'))).status,403);status='active';
 assert.equal((await handle(request('institution.mail.check'))).status,200);assert.equal(sent,0);assert.equal((await handle(request('institution.mail.retry'))).status,200);assert.equal(sent,1);
});

test('member and guest requests schedule notifications only after saving and keep their successful response on SMTP failure',async()=>{
 for(const guest of [false,true]){
 const order=[],tasks=[];const db=async(path)=>{order.push(path);if(path.startsWith('miyar_accounts?'))return[{status:'active',university_id:3}];if(path.startsWith('miyar_guest_sessions?'))return[{id:student,status:'active',university_id:3}];if(path==='rpc/miyar_request_institution_contact')return {id:1,status:'pending'};if(path==='rpc/miyar_claim_institution_mail')return {lease:admin,request:record};return true;};
 const handle=createHandler({db,env,authenticate:async()=>({id:student}),background:p=>tasks.push(p),mailTransport:async()=>({sendMail:async()=>{throw Object.assign(new Error('secret error'),{code:'EAUTH'});},close(){}})});
 const response=await handle(new Request('https://test',{method:'POST',headers:guest?{'x-miyar-guest':'ab'.repeat(32)}:{authorization:'Bearer valid'},body:JSON.stringify({action:guest?'guest.institution.request':'institution.request',kind:'college',universityId:3,colleges:record.colleges,email:record.contact_email})}));
 assert.equal(response.status,201);assert.equal((await response.json()).id,1);await Promise.all(tasks);assert.equal(tasks.length,1);assert.ok(order.indexOf('rpc/miyar_request_institution_contact')<order.indexOf('rpc/miyar_claim_institution_mail'));assert.ok(order.includes('rpc/miyar_finish_institution_mail'));
 }
});
