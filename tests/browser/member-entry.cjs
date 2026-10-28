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
  async function setup({university=3,enabled=true,width=390,hash='',fail=false,delayed=false,signedIn=true}={}){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),calls=[];
   const gates={catalogue:deferred(),me:deferred(),guest:deferred()},reached={catalogue:deferred(),me:deferred(),guest:deferred()};
   if(!delayed)Object.values(gates).forEach(gate=>gate.resolve());
   const profile={id:member,name:'طالب مسجّل',university_id:university,major_id:1,level:2,status:'active',isAdmin:false};
   const guest={id:'33333333-3333-4333-8333-333333333333',university_id:null,status:'active'};
   const catalogue={universities:[{id:3,name:'جامعة نجران',enabled},{id:1,name:'جامعة الملك سعود',enabled:true}],colleges:[{id:1,name:'كلية الهندسة',university_id:3}],majors:[{id:1,name:'الهندسة المدنية',college_id:1}],doctors:[],stats:{doctors:0,reviews:0}};
   await context.addInitScript(({signedIn,member})=>{
    if(signedIn){const expires=Math.floor(Date.now()/1000)+3600;localStorage.setItem('sb-bbnsorjxgehvoddluvyo-auth-token',JSON.stringify({access_token:'header.'+btoa(JSON.stringify({sub:member,exp:expires}))+'.mock',refresh_token:'mock-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id:member,email:'student@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب مسجّل'},identities:[]}}));}
    window.automaticDirectories=[];window.allowUniversityDirectory=false;
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

  // Observe every DOM insertion, including the first frame before auth resolves.
  // Neither slow catalogue/profile fetches nor background guest setup may show a chooser.
  for(const width of [390,1440]){
   const test=await setup({width,delayed:true,hash:width===1440?'#ratings':''});const {page}=test;
   await page.locator('#header-change-university').waitFor();await test.reached.catalogue.promise;await test.reached.guest.promise;
   assert.equal(await page.locator('#university-directory').count(),0);assert.equal(await page.locator('aside').count(),1);
   test.gates.catalogue.resolve();await test.reached.me.promise;assert.deepEqual(await page.evaluate(()=>window.automaticDirectories),[]);
   if(width===390){await page.locator('#new-review').click();await page.getByText('انتظر اكتمال تحميل المنصة، أو أعد المحاولة.',{exact:true}).waitFor();assert.equal(await page.locator('.modal-backdrop,#university-directory').count(),0);await page.locator('aside [data-page="home"]').click();}
   test.gates.me.resolve();await test.reached.guest.promise;assert.equal(await page.locator('#university-directory').count(),0);
   test.gates.guest.resolve();await page.locator('.connection-banner.live').waitFor();
   assert.equal(new URL(page.url()).hash,width===1440?'#ratings':'');assert.deepEqual(await page.evaluate(()=>window.automaticDirectories),[]);
   await page.reload();await page.locator('.connection-banner.live').waitFor();assert.deepEqual(await page.evaluate(()=>window.automaticDirectories),[]);
   await page.evaluate(()=>{window.allowUniversityDirectory=true;});await page.locator('#header-change-university').click();
   await page.locator('#university-directory').waitFor();assert.equal(new URL(page.url()).hash,'#universities');assert.equal(await page.locator('.university-picker-modal').count(),0);
   await page.locator('#university-entry-back').click();await page.locator('#header-change-university').waitFor();assert.equal(test.calls.filter(call=>call.action==='university').length,0);
   await page.locator('#header-change-university').click();await page.locator('#university-search').fill('جامعة الملك سعود');await page.locator('[data-uni-confirm]').click();
   await page.locator('.connection-banner.live').filter({hasText:'جامعة الملك سعود'}).waitFor();assert.equal(test.calls.filter(call=>call.action==='university').length,1);
   await page.reload();await page.locator('.connection-banner.live').filter({hasText:'جامعة الملك سعود'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.automaticDirectories),[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await test.context.close();
  }

  // Plan progress must not render/edit under the guest owner while restoring a member.
  for(const hash of ['#plan','#advisor']){
   const test=await setup({hash,delayed:true}),{page}=test;
   await page.locator('#header-change-university').waitFor();await test.reached.catalogue.promise;
   assert.equal(await page.locator('#study-plan-select,#advisor-plan').count(),0);
   test.gates.catalogue.resolve();await test.reached.me.promise;
   assert.equal(await page.locator('#study-plan-select,#advisor-plan').count(),0);
   test.gates.me.resolve();test.gates.guest.resolve();
   await page.locator(hash==='#plan'?'#study-plan-select':'#advisor-plan').waitFor();
   if(hash==='#plan')assert.match(await page.locator('.study-local-note').innerText(),/لهذا الحساب/);
   assert.equal(new URL(page.url()).hash,hash);assert.deepEqual(await page.evaluate(()=>window.automaticDirectories),[]);await test.context.close();
  }

  for(const options of [{university:null},{university:3,enabled:false},{fail:true}]){
   const test=await setup(options),{page}=test;await page.locator('.connection-banner.'+(options.fail?'error':'live')).waitFor();
   assert.equal(await page.locator('.welcome').count(),1);assert.equal(await page.locator('#university-directory,.university-picker-modal').count(),0);assert.deepEqual(await page.evaluate(()=>window.automaticDirectories),[]);
   if(!options.fail){await page.locator('#new-review').click();await page.getByText('حدّد جامعتك من زر «تغيير الجامعة» أعلى المنصة لإكمال هذه الخطوة.',{exact:true}).waitFor();assert.equal(await page.locator('#university-directory,.modal-backdrop').count(),0);}
   await page.evaluate(()=>{window.allowUniversityDirectory=true;});await page.locator('#header-change-university').click();await page.locator('#university-entry-back').click();await page.locator('#header-change-university').waitFor();
   assert.equal(test.calls.filter(call=>call.action==='university').length,0);await test.context.close();
  }
  const guest=await setup({signedIn:false});await guest.page.locator('#university-directory').waitFor();assert.equal(await guest.page.locator('.uni-card.is-open').count(),2);await guest.context.close();
  assert.deepEqual(errors,[]);console.log('PASS: no automatic university directory at any member startup frame, slow auth/profile/catalogue and guest setup, reload and direct links, missing/inactive university and outage; explicit full-page change/back/save, persistent server selection, write guard without automatic modal, responsive layout, guest first-visit directory. API/auth network mocked.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
