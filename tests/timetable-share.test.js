import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {normalizeTimetable} from '../supabase/functions/miyar/timetable-format.js';
const guest='33333333-3333-4333-8333-333333333333';
const schedule={title:'جدولي',courses:[{name:'رياضيات',sessions:[{day:0,start:'08:00',end:'09:00'}]}],privateData:'not-stored'};
test('short timetable links validate snapshots, bind a verified active guest, and expose only the public snapshot',async()=>{
 let stored,reads=0,status='active';
 const db=async(path,options)=>{if(path.startsWith('miyar_guest_sessions?'))return [{id:guest,status}];if(path==='rpc/miyar_create_timetable_share'){stored=options.body;return {token:stored.p_token};}if(path.startsWith('miyar_timetable_shares?')){reads++;assert.match(path,/&select=snapshot&limit=1$/);return stored?[{snapshot:stored.p_snapshot}]:[];}throw new Error(path);};
 const handle=createHandler({db,env:{}}),request=(path,body,headers={})=>handle(new Request('https://test/'+path,{method:'POST',headers,body:JSON.stringify(body)}));
 assert.equal((await request('?schedule=share',{schedule})).status,401);
 status='restricted';assert.equal((await request('?schedule=share',{schedule},{'x-miyar-guest':'a'.repeat(64)})).status,403);status='active';
 assert.equal((await request('?schedule=share',{schedule:{courses:[]}},{'x-miyar-guest':'a'.repeat(64)})).status,400);
 assert.equal((await request('?schedule=share',{schedule:{courses:[{}]}},{'x-miyar-guest':'a'.repeat(64)})).status,400);
 const response=await request('?schedule=share',{schedule,guest:'forged'},{'x-miyar-guest':'a'.repeat(64)}),result=await response.json();assert.equal(response.status,201);assert.match(result.token,/^[A-Za-z0-9_-]{12}$/);assert.equal(stored.p_guest,guest);assert.deepEqual(stored.p_snapshot,normalizeTimetable(schedule));
 const publicResult=await (await request('',{action:'timetable.get',token:result.token})).json();assert.deepEqual(publicResult,{schedule:normalizeTimetable(schedule)});assert.ok(!JSON.stringify(publicResult).includes(guest));
 assert.equal((await request('',{action:'timetable.get',token:'bad&select=*'})).status,400);assert.equal(reads,1);
 stored=null;assert.equal((await request('',{action:'timetable.get',token:result.token})).status,404);
 const oversized=await request('?schedule=share',{schedule,padding:'x'.repeat(524288)},{'x-miyar-guest':'a'.repeat(64)});assert.equal(oversized.status,413);
});
test('stored previews are immutable, reuse unchanged snapshots, enforce the daily creation cap and deny direct client access',async()=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table miyar_guest_sessions(id uuid primary key,status text);insert into miyar_guest_sessions values('"+guest+"','active');");
  await db.exec(await readFile(new URL('../supabase/migrations/202611050001_timetable_shares.sql',import.meta.url),'utf8'));
  const create=(token,data)=>db.query('select miyar_create_timetable_share($1,$2,$3) result',[guest,token,data]).then(r=>r.rows[0].result);
  const snapshot=normalizeTimetable(schedule),token='AbCdEf123_-x';assert.deepEqual(await create(token,snapshot),{token});assert.deepEqual(await create('different123',snapshot),{token});
  for(let i=1;i<30;i++)await create(String(i).padStart(12,'x'),{...snapshot,title:'جدول '+i});
  await assert.rejects(create('overlimit123',{...snapshot,title:'جديد'}),/TIMETABLE_SHARE_LIMIT/);assert.deepEqual(await create('existing1234',snapshot),{token});
  assert.deepEqual((await db.query('select snapshot from miyar_timetable_shares where token=$1',[token])).rows[0].snapshot,snapshot);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from miyar_timetable_shares'),/permission denied/);await assert.rejects(create('forbidden123',snapshot),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');await assert.rejects(db.query("update miyar_timetable_shares set snapshot='{}'"),/permission denied/);await db.exec('reset role');
  await db.query("update miyar_guest_sessions set status='banned' where id=$1",[guest]);await assert.rejects(create(token,snapshot),/ACCOUNT_RESTRICTED/);
 }finally{await db.close();}
});
