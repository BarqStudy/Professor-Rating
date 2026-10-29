const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../dist'),key='sb-bbnsorjxgehvoddluvyo-auth-token',member='22222222-2222-4222-8222-222222222222',second='33333333-3333-4333-8333-333333333333',third='44444444-4444-4444-8444-444444444444';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const session=(id=member,expired=false,revision=1)=>{const exp=Math.floor(Date.now()/1000)+(expired?-10:3600);return{access_token:'header.'+Buffer.from(JSON.stringify({sub:id,exp,revision})).toString('base64url')+'.mock',refresh_token:'mock-refresh-'+revision,expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب'},identities:[]}};};
const server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/Professor-Rating\/?/,'')||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.otf':'font/otf','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const url=`http://127.0.0.1:${server.address().port}/Professor-Rating/`,errors=[];
 async function setup({expired=false,delayed=false,hash='',storageState}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference',...(storageState?{storageState}:{})}),page=await context.newPage(),calls=[],gates={catalogue:deferred(),me:deferred(),guest:deferred()},reached={catalogue:deferred(),me:deferred(),guest:deferred()},ownerGates=new Map(),plansGate=deferred();let refreshes=0,detailGate=null,planRows=[];
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
   if(body.action==='guest.presence')result={online:1};if(body.action==='study.plans'){await plansGate.promise;result=planRows;}if(body.action==='ai.status')result={enabled:false};if(['request.updates','notifications','requests'].includes(body.action))result=[];
   await route.fulfill({json:result});
  });
  await page.goto(url+hash);return{context,page,calls,gates,reached,ownerGates,refreshes:()=>refreshes,releasePlans(rows=[]){planRows=rows;plansGate.resolve();},pauseDetails(){detailGate=deferred();return detailGate;}};
 }


 const test=await setup(),{page}=test;await page.locator('.welcome').waitFor();
 // A blocked plans endpoint must not hold up home, the directory, or a review draft.
 assert.equal(await page.locator('#google-account,.platform-startup').count(),0);
 assert.equal(await page.evaluate(()=>window.applicationPaints.length),1);
 await page.evaluate(()=>document.fonts.ready);
 const fonts=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/\.(?:otf|woff2?)(?:$|\?)/.test(r.name)).map(r=>({url:r.name,bytes:r.decodedBodySize})));
 assert.ok(fonts.length>=3);assert.ok(fonts.every(font=>font.url.endsWith('.woff2')));
 assert.equal(fonts.filter(font=>font.url.includes('-Regular.woff2')).length,1,'preload and CSS must share the regular font URL');
 assert.ok(fonts.reduce((sum,font)=>sum+font.bytes,0)<400000,'home font downloads stay below 400 KB');
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/admin-tools-'))),false);
 await page.locator('aside [data-page=ratings]').click();await page.locator('.directory-section').waitFor();
 await page.locator('#search').fill('أحمد');assert.equal(await page.locator('.doctor-card').count(),1);
 await page.locator('aside [data-page=home]').click();await page.locator('.welcome').waitFor();
 const beforeDraft=await page.evaluate(()=>window.applicationPaints.length);
 await page.locator('#new-review').click();await page.locator('#review-form').waitFor();
 await page.locator('#review-form [name=doctor]').fill('محمد خالد أحمد');await page.locator('[name=includeReview]').click();await page.locator('#accept-review-pledge').click();
 await page.locator('#review-form [name=subject]').fill('مادة كتبتها بنفسي');
 test.releasePlans();await page.locator('#review-study-plan').waitFor();
 assert.equal(await page.locator('#review-form [name=doctor]').inputValue(),'محمد خالد أحمد');
 assert.equal(await page.locator('#review-form [name=subject]').inputValue(),'مادة كتبتها بنفسي');
 assert.equal(await page.evaluate(()=>window.applicationPaints.length),beforeDraft,'plan arrival cannot rerender home or discard a draft');
 await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
 for(const width of [320,360,390,430,820]){
  await page.setViewportSize({width,height:900});
  const edges=await page.locator('.quick-actions .action-arrow').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect(),circle=getComputedStyle(node,'::before');const diameter=parseFloat(circle.width)+parseFloat(circle.borderLeftWidth)+parseFloat(circle.borderRightWidth);return box.left+box.width/2-diameter/2;}));
  assert.ok(edges.every(left=>left>=10),'protruding arrow circles need a visible mobile gutter');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('header').evaluate(node=>getComputedStyle(node).backdropFilter),'none');
 }
 await page.setViewportSize({width:390,height:900});await page.locator('.quick-actions .action-card').first().scrollIntoViewIfNeeded();await page.waitForTimeout(350);await page.screenshot({path:'/tmp/miyar-performance-mobile.png'});
 assert.equal(await page.locator('.hero-art').evaluate(node=>node.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length),0,'mobile illustration must not animate continuously');
 assert.deepEqual(errors,[]);await test.context.close();
 // Navigating to a plan joins the pending request and never flashes stale bundled data.
 const waiting=await setup();await waiting.page.locator('.welcome').waitFor();await waiting.page.locator('aside [data-page=plan]').click();
 await waiting.page.locator('.study-loading').waitFor();assert.equal(await waiting.page.locator('#study-plan-select').count(),0);
 waiting.releasePlans([{id:'najran-ce-2025',deleted:true,revision:2}]);await waiting.page.locator('#study-plan-select').waitFor();
 assert.equal(await waiting.page.locator('#study-plan-select option[value="najran-ce-2025"]').count(),0);
 assert.equal(waiting.calls.filter(call=>call.action==='study.plans').length,1);
 await waiting.context.close();assert.deepEqual(errors,[]);
 console.log('PASS: home/directory/form remain usable while plans are delayed; deferred plan choices preserve drafts; plan screens wait for tombstones without stale bundled-plan flashes; one shared compact font URL; admin tools excluded from student loading; mobile blur/continuous paint removed; protruding arrows retain a safe gutter across 320–820px. API/auth mocked.');
 }finally{await browser.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
