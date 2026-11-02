const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../dist'),member='22222222-2222-4222-8222-222222222222';
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/Professor-Rating\/?/,'');
 const target=path.resolve(root,relative||'index.html');if(!target.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(target,(error,body)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.otf':'font/otf','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[path.extname(target)]||'application/octet-stream');res.end(body);});
});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const url=`http://127.0.0.1:${server.address().port}/Professor-Rating/`,errors=[];
  async function setup({university=3,enabled=true,width=390,hash='',fail=false,delayed=false,signedIn=true,motion='no-preference'}={}){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:motion}),page=await context.newPage(),calls=[];
   const gates={catalogue:deferred(),me:deferred(),guest:deferred()},reached={catalogue:deferred(),me:deferred(),guest:deferred()};
   if(!delayed)Object.values(gates).forEach(gate=>gate.resolve());
   const profile={id:member,name:'طالب مسجّل',university_id:university,major_id:1,level:2,status:'active',isAdmin:false};
   const guest={id:'33333333-3333-4333-8333-333333333333',university_id:null,status:'active'};
   const catalogue={universities:[{id:3,name:'جامعة نجران',enabled},{id:1,name:'جامعة الملك سعود',enabled:true}],colleges:[{id:1,name:'كلية الهندسة',university_id:3}],majors:[{id:1,name:'الهندسة المدنية',college_id:1}],doctors:[],stats:{doctors:0,reviews:0}};
   await context.addInitScript(({signedIn,member})=>{
    if(signedIn){const expires=Math.floor(Date.now()/1000)+3600;localStorage.setItem('sb-bbnsorjxgehvoddluvyo-auth-token',JSON.stringify({access_token:'header.'+btoa(JSON.stringify({sub:member,exp:expires}))+'.mock',refresh_token:'mock-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id:member,email:'student@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب مسجّل'},identities:[]}}));}
    window.gateAppearances=0;new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&n.matches('.university-entrance'))window.gateAppearances++;}).observe(document,{childList:true,subtree:true});window.automaticDirectories=[];window.allowUniversityDirectory=false;
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(!window.allowUniversityDirectory&&node.nodeType===1&&(node.matches('.university-entry,#university-directory')||node.querySelector('.university-entry,#university-directory')))window.automaticDirectories.push(location.hash||'home');}}).observe(document,{childList:true,subtree:true});
   },{signedIn,member});
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('https://bbnsorjxgehvoddluvyo.supabase.co/**',async route=>{
    const body=route.request().postDataJSON()||{};calls.push(body);let result={ok:true};
    if(body.action==='catalogue'){reached.catalogue.resolve();await gates.catalogue.promise;if(fail)return route.fulfill({status:503,json:{error:'تعذّر تحميل الدليل. حاول مجددًا.'}});result=catalogue;}
    if(body.action==='study.plans')result=[];
    if(body.action==='me'){reached.me.resolve();await gates.me.promise;result=profile;}
    if(body.action==='guest.start'||body.action==='guest.me'){reached.guest.resolve();await gates.guest.promise;result=body.action==='guest.start'?{...guest,token:'ab'.repeat(32)}:guest;}
    if(body.action==='university'){assert.equal(catalogue.universities.find(item=>item.id===body.universityId).enabled,true);profile.university_id=body.universityId;profile.major_id=null;}
    if(body.action==='guest.university'){guest.university_id=body.universityId;result=guest;}
    if(body.action==='guest.presence')result={online:1};if(body.action==='ai.status')result={enabled:false};
    if(['notifications','request.updates','requests','reviews','course.doctors','course.reviews'].includes(body.action))result=[];
    await route.fulfill({json:result});
   });
   await page.goto(url+hash);return {page,context,calls,gates,reached,profile};
  }

  const test=await setup({delayed:true}),{page}=test;
  await test.reached.catalogue.promise;await test.reached.me.promise;
  await page.locator('.university-entrance').waitFor();
  assert.equal(await page.locator('.startup-block').count(),0);
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.university-entrance.is-opening').count(),0);
  test.gates.catalogue.resolve();test.gates.me.resolve();
  await page.locator('.connection-banner.live').waitFor();
  await page.locator('.university-entrance.is-opening').waitFor();
  await page.locator('.university-entrance').waitFor({state:'detached'});
  test.gates.guest.resolve();
  // Reload always gets a fresh gate, independent of stored first-visit flags.
  await page.reload();await page.locator('.connection-banner.live').waitFor();
  await page.locator('.university-entrance').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>window.gateAppearances),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.gateAppearances),1);
  await page.locator('#header-change-university').click();
  await page.locator('.university-entrance').waitFor();
  assert.equal(await page.locator('.university-entrance.is-opening').count(),0);
  await page.locator('.university-entrance').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>window.gateAppearances),2);
  await test.context.close();

  // A stalled request reveals an actionable fallback instead of a locked gate.
  const slow=await setup({signedIn:false,delayed:true});
  await slow.page.locator('.university-entrance').waitFor();
  await slow.page.locator('.university-entrance').waitFor({state:'detached',timeout:9000});
  await slow.page.locator('#startup-retry').waitFor({state:'visible'});
  assert.equal(await slow.page.locator('.startup-block').count(),0);
  Object.values(slow.gates).forEach(g=>g.resolve());
  await slow.page.locator('#university-directory').waitFor();
  assert.equal(await slow.page.locator('.university-entrance').count(),0);
  await slow.context.close();

  for(const motion of ['reduce','no-preference']){
   const failed=await setup({fail:true,motion});
   await failed.page.locator('.connection-banner.error').waitFor();
   await failed.page.locator('.university-entrance').waitFor({state:'detached'});
   assert.equal(await failed.page.locator('.platform-startup').count(),0);
   await failed.context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: gate follows real startup, no grey placeholders, every reload, no foreground replay, university-change replay, slow/offline fallback, reduced motion and API failures.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
