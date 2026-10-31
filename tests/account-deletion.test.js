import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const rpc=(db,name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args).then(r=>r.rows[0].result);
test('account deletion removes only its own and linked guest data, keeps public curricula and other students, and cannot be called by browser roles',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);');
  const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  for(const id of [a,b]){await db.query('insert into auth.users values($1,$2)',[id,id+'@example.test']);await db.query("insert into miyar_accounts(auth_id,name,university_id) values($1,'طالب',3)",[id]);}
  const doctor=(await db.query("insert into miyar_doctors(major_id,name,status,submitted_by_account) values(1,'أحمد محمد العتيبي','approved',$1) returning id",[a])).rows[0].id;
  const own=await rpc(db,'miyar_submit_existing_google_review',[a,doctor,'استاتيكا',92,80,80,80,'تجربة مفيدة',[],false,'najran-ce-2025/ge101',true]);
  const other=await rpc(db,'miyar_submit_existing_google_review',[b,doctor,'استاتيكا',82,80,80,80,'تجربة أخرى',[],false,'najran-ce-2025/ge101',true]);
  const guest=await rpc(db,'miyar_open_guest',['a'.repeat(64),null]);await rpc(db,'miyar_choose_university',[null,guest.id,3]);
  const guestReview=await rpc(db,'miyar_submit_existing_guest_review',[guest.id,doctor,'رسم هندسي',77,70,70,70,'تجربة زائر',[],false,'najran-ce-2025/engineering-drawing',true]);
  await rpc(db,'miyar_link_review_identity',[a,guest.id]);await db.query("update miyar_reviews set status='published' where id=any($1)",[[own.id,other.id,guestReview.id]]);
  await rpc(db,'miyar_set_review_like',[a,null,other.id,true]);await rpc(db,'miyar_set_review_like',[b,null,own.id,true]);
  await db.query('insert into miyar_ambassadors(account_id,university_id,granted_by) values($1,3,$2)',[b,a]);
  await db.query('update miyar_study_plans set imported_by=$1 where id=$2',[a,'najran-ce-2025']);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'miyar_delete_account',[a]),/permission denied/);await db.exec('reset role');}
  await db.query("update miyar_accounts set status='banned' where auth_id=$1",[a]);
  assert.deepEqual(await rpc(db,'miyar_delete_account',[a]),{deleted:true});
  assert.deepEqual((await db.query('select id from auth.users order by id')).rows.map(r=>r.id),[b]);
  assert.deepEqual((await db.query('select id from miyar_reviews')).rows.map(r=>r.id),[other.id]);
  for(const table of ['miyar_review_likes','miyar_review_identities','miyar_guest_sessions'])assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,0);
  assert.equal((await db.query('select submitted_by_account from miyar_doctors where id=$1',[doctor])).rows[0].submitted_by_account,null);
  assert.equal((await db.query('select granted_by from miyar_ambassadors where account_id=$1',[b])).rows[0].granted_by,null);
  assert.equal((await db.query('select imported_by from miyar_study_plans where id=$1',['najran-ce-2025'])).rows[0].imported_by,null);
  assert.ok((await rpc(db,'miyar_public_reviews',[doctor,null])).some(r=>r.id===other.id));
  await assert.rejects(rpc(db,'miyar_delete_account',[a]),/ACCOUNT_RESTRICTED/);
 }finally{await db.close();}
});
