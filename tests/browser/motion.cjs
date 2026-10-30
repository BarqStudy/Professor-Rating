const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../dist'),key='sb-bbnsorjxgehvoddluvyo-auth-token',member='22222222-2222-4222-8222-222222222222',second='33333333-3333-4333-8333-333333333333',third='44444444-4444-4444-8444-444444444444';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const session=(id=member,expired=false,revision=1)=>{const exp=Math.floor(Date.now()/1000)+(expired?-10:3600);return{access_token:'header.'+Buffer.from(JSON.stringify({sub:id,exp,revision})).toString('base64url')+'.mock',refresh_token:'mock-refresh-'+revision,expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب'},identities:[]}};};
const server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/Professor-Rating\/?/,'')||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.otf':'font/otf','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const url=`http://127.0.0.1:${server.address().port}/Professor-Rating/`,errors=[];
 async function setup({expired=false,delayed=false,hash='',storageState}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference',...(storageState?{storageState}:{})}),page=await context.newPage(),calls=[],gates={catalogue:deferred(),me:deferred(),guest:deferred()},reached={catalogue:deferred(),me:deferred(),guest:deferred()},ownerGates=new Map();let refreshes=0, detailGate=null;
  if(!delayed)Object.values(gates).forEach(gate=>gate.resolve());
  await context.addInitScript(({key,initial})=>{
   if(initial&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));
   window.authEvents=[];window.applicationPaints=[];window.authorizeRequests=0;
   window.heroFlights=[];window.entryAnimations=[];let nextAnimationId=0;const ids=new WeakMap();
   document.addEventListener('animationstart',event=>{if(['appear','glass-arrive','miyar-reveal'].includes(event.animationName)){if(!ids.has(event.target))ids.set(event.target,++nextAnimationId);window.entryAnimations.push({id:ids.get(event.target),name:event.animationName,classes:event.target.className});}},true);
   window.addEventListener('miyar-auth',event=>window.authEvents.push({event:event.detail.event,id:event.detail.session?.user.id}));
   new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('.hero-flight'))window.heroFlights.push({hidden:node.getAttribute('aria-hidden'),pointerEvents:getComputedStyle(node).pointerEvents,uniqueIds:new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size===document.querySelectorAll('[id]').length});for(const record of records)if(record.target.id==='app')for(const node of record.addedNodes)if(node.nodeType===1&&(node.matches('aside,.university-entry,.signed-out-page')))window.applicationPaints.push({name:document.querySelector('.welcome h1')?.textContent,guest:!!document.querySelector('#google-account'),university:!!document.querySelector('#university-directory')});}).observe(document,{childList:true,subtree:true});
  },{key,initial:storageState?null:session(member,expired)});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://bbnsorjxgehvoddluvyo.supabase.co/**',async route=>{
   const request=route.request(),body=request.postDataJSON()||{},authorization=request.headers().authorization;let owner=member;try{owner=JSON.parse(Buffer.from((authorization||'').split('.')[1],'base64url')).sub;}catch{}
   calls.push({...body,path:new URL(request.url()).pathname,authorization,owner});let result={ok:true};
   if(request.url().includes('/auth/v1/token')){refreshes++;return route.fulfill({json:session(owner,false,refreshes+1)});}
   if(request.url().includes('/auth/v1/logout'))return route.fulfill({json:{}});
   if(body.action==='catalogue'){reached.catalogue.resolve();await gates.catalogue.promise;result={universities:[{id:3,name:'جامعة نجران',enabled:true}],colleges:[{id:1,name:'كلية الهندسة',university_id:3}],majors:[{id:1,name:'الهندسة المدنية',college_id:1}],doctors:[{id:17,name:'أحمد محمد العتيبي',major_id:1,major:'الهندسة المدنية',college:'كلية الهندسة',university_id:3,count:1,score:90,scores:[90,90,90],subjects:['استاتيكا']}],stats:{doctors:1,reviews:1}};}
   if(body.action==='me'){reached.me.resolve();await gates.me.promise;if(ownerGates.has(owner))await ownerGates.get(owner).promise;result={id:owner,name:owner===member?'أحمد طالب':owner===second?'خالد طالب':'زياد طالب',status:'active',university_id:3,major_id:1,level:2,isAdmin:false};}
   if(['guest.start','guest.me'].includes(body.action)){reached.guest.resolve();await gates.guest.promise;result={id:'55555555-5555-4555-8555-555555555555',status:'active',university_id:3,...(body.action==='guest.start'?{token:'ab'.repeat(32)}:{})};}
   if(['reviews','course.doctors','course.reviews'].includes(body.action)){if(body.action==='reviews'&&detailGate){const gate=detailGate;detailGate=null;await gate.promise;}result=[];}if(body.action==='doctor.summary')result={insufficient:true,totalPublished:0,themes:[]};if(body.action==='doctor.grades')result={available:false,minimum:10,subjects:[]};if(body.action==='review.eligibility')result={eligible:true};
   if(body.action==='guest.presence')result={online:1};if(body.action==='study.plans')result=[];if(body.action==='ai.status')result={enabled:false};if(['request.updates','notifications','requests'].includes(body.action))result=[];
   await route.fulfill({json:result});
  });
  await page.goto(url+hash);return{context,page,calls,gates,reached,ownerGates,refreshes:()=>refreshes,pauseDetails(){detailGate=deferred();return detailGate;}};
 }

 const test=await setup(),{page}=test;await page.locator('.welcome h1').filter({hasText:'أحمد'}).waitFor();
 await page.waitForTimeout(1500);
 // The old appear animation used to run on parents and restart on cards after
 // removing the one-by-one classes. Every actual element now enters only once.
 for(const selector of ['.quick-actions','.stats','.doctor-card','.bottom-banner']){await page.locator(selector).first().scrollIntoViewIfNeeded();await page.waitForTimeout(1400);}
 const entries=await page.evaluate(()=>window.entryAnimations);
 assert.ok(entries.some(row=>row.name==='miyar-reveal'));
 assert.deepEqual(entries.filter(row=>row.name!=='miyar-reveal'),[]);
 const counts=new Map();for(const row of entries)counts.set(row.id,(counts.get(row.id)||0)+1);
 assert.ok([...counts.values()].every(value=>value===1),'initial content must not replay');
 assert.equal(await page.evaluate(()=>window.applicationPaints.length),1);
 async function clickHero(selector,target){
  const count=await page.evaluate(()=>window.heroFlights.length);
  await page.locator(selector).first().click();
  await page.waitForFunction(count=>window.heroFlights.length>count,count);
  assert.deepEqual(await page.evaluate(()=>window.heroFlights.at(-1)),{hidden:'true',pointerEvents:'none',uniqueIds:true});
  await page.locator(target).first().waitFor();
 }
 async function settled(){await page.locator('.hero-flight').waitFor({state:'detached'});assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('hero-transition-active')),false);}
 async function close(){await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});}
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  await clickHero('aside [data-page=ratings]','.directory-section');await settled();
  await page.locator('#search').fill('أحمد');assert.equal(await page.locator('.hero-flight').count(),0);
  const details=test.pauseDetails();await clickHero('[data-doctor]','.modal');
  await page.evaluate(()=>window.detailFlight=document.querySelector('.hero-flight'));
  details.resolve();await page.locator('.detail-person').waitFor();
  assert.equal(await page.evaluate(()=>window.detailFlight===document.querySelector('.hero-flight')),true,'loaded content must continue the original flight');
  // Fetched details replace the loading dialog during the same animation.
  await settled();assert.equal(await page.locator('.modal').evaluate(node=>getComputedStyle(node).opacity),'1');
  await page.screenshot({path:`/tmp/miyar-site-hero-detail-${width}.png`});await close();
  await clickHero('aside [data-page=plan]','.study-page');await settled();
  await clickHero('[data-study-doctors]','#study-course-doctors');await settled();await close();
  await clickHero('aside [data-page=saved]','main');await settled();
  await clickHero('aside [data-page=home]','.welcome');await settled();
  await clickHero('#open-settings','.modal');await settled();await close();
  await clickHero('#header-change-university','#university-directory');await settled();
  await clickHero('#university-entry-back','.welcome');await settled();
  await clickHero('.assistant-launcher','.assistant-page');await settled();
  await clickHero('aside [data-page=home]','.welcome');await settled();
  await page.locator('#new-review').click();await page.locator('#review-form').waitFor();assert.equal(await page.locator('.hero-flight').count(),0);
  await page.locator('#review-form [name=doctor]').fill('محمد أحمد');await settled();
  assert.equal(await page.locator('#review-form [name=doctor]').inputValue(),'محمد أحمد');await close();
  assert.equal(await page.locator('#new-review').evaluate(node=>node===document.activeElement),true);
 }
 // An interrupted transition never delays another navigation or leaves layers.
 await clickHero('aside [data-page=ratings]','.directory-section');
 await clickHero('aside [data-page=plan]','.study-page');await settled();
 const back=page.waitForSelector('.hero-flight',{state:'attached'});await page.goBack();await back;await page.locator('.directory-section').waitFor();await settled();
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('aside [data-page=home]').click();await page.locator('.welcome').waitFor();assert.equal(await page.locator('.hero-flight').count(),0);
 await page.locator('#open-settings').click();await page.locator('.modal').waitFor();assert.equal(await page.locator('.hero-flight').count(),0);await close();
 assert.deepEqual(errors,[]);await test.context.close();
 // A delayed compositor finish must not hold the captured page after the
 // visible circle has ended. A capture that never becomes ready has a deadline.
 const appearance=await setup(),themePage=appearance.page;
 await themePage.locator('.welcome').waitFor();
 await themePage.evaluate(()=>{
  window.nativeThemeTransition=document.startViewTransition.bind(document);
  document.startViewTransition=callback=>{const t=window.nativeThemeTransition(callback);return{ready:t.ready,finished:new Promise(()=>{}),skipTransition:()=>t.skipTransition()};};
 });
 await themePage.locator('.mobile-theme').click();
 await themePage.waitForFunction(()=>document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-switching'),null,{timeout:1500});
 assert.equal(await themePage.evaluate(()=>localStorage.getItem('athar-theme')),'dark');
 await themePage.evaluate(()=>{
  document.startViewTransition=callback=>{const t=window.nativeThemeTransition(callback);return{ready:new Promise(resolve=>window.releaseThemeCapture=()=>t.ready.then(resolve)),finished:t.finished,skipTransition:()=>t.skipTransition()};};
 });
 await themePage.locator('.mobile-theme').click();
 await themePage.waitForFunction(()=>document.documentElement.dataset.theme==='light'&&!document.documentElement.classList.contains('theme-switching'),null,{timeout:1500});
 await themePage.evaluate(()=>document.startViewTransition=window.nativeThemeTransition);
 await themePage.locator('.mobile-theme').click();await themePage.evaluate(()=>window.releaseThemeCapture());
 await themePage.waitForFunction(()=>document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-switching'),null,{timeout:1500});
 assert.equal(await themePage.evaluate(()=>localStorage.getItem('athar-theme')),'dark','a late capture cannot undo the newer appearance');
 await appearance.context.close();assert.deepEqual(errors,[]);
 console.log('PASS: a single one-by-one entrance without legacy restarts, site-wide Hero on sidebar/back/university/settings/doctor details/study/assistant/add-doctor, continuous fetched-dialog replacement, editable drafts, restored focus, rapid navigation, unique SVG IDs, reduced motion, mobile/desktop, and bounded appearance transitions despite delayed capture/finish callbacks. Auth/API mocked.');
 }finally{await browser.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
