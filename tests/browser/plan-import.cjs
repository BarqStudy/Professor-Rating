const {chromium}=require('playwright-core');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../dist'),admin='11111111-1111-4111-8111-111111111111';
const course=(code,name,level)=>({code,name,level,credits:3,kind:'course',pool:null,prerequisites:[],corequisites:[],anyPrerequisites:[],minimumCredits:null,completedLevel:null,allPrevious:false,review:null,page:1});
const draft={id:'plan-12345678-1234-4234-8234-123456789012',majorId:8,title:'خطة اللغة العربية',fileLabel:'خطة ١٤٤٨',scopeNote:'',sha256:'a'.repeat(64),warnings:[],courses:[course('عرب١٠١','النحو العربي Grammar',1),{...course('عرب 202','الصرف العربي',2),prerequisites:['عرب101']}]};

const slot=(code,name,type,pool)=>({...course(code,name,1),kind:'slot',requirementType:type,pool,credits:3});
const alternative=(code,name,type,pool)=>({...course(code,name,0),requirementType:type,pool});
draft.requirementLists=true;
draft.courses.push(slot('REQ-U-1','متطلب جامعة','university','متطلبات الجامعة'),slot('REQ-R-1','متطلب إجباري','required','المقررات الإجبارية'),alternative('UNI 101','مهارات التواصل Communication','university','متطلبات الجامعة'),alternative('UNI 102','العمل التطوعي','university','متطلبات الجامعة'),alternative('REQ 101','English Language','required','المقررات الإجبارية'),alternative('REQ 102','التفكير الناقد','required','المقررات الإجبارية'));
const target={majorId:8,major:'اللغة العربية',college:'كلية الآداب',university:'جامعة أخرى'};
const catalogue={universities:[{id:3,name:'جامعة نجران'},{id:4,name:'جامعة أخرى'}],colleges:[{id:1,name:'كلية الهندسة',university_id:3},{id:2,name:'كلية الآداب',university_id:4}],majors:[{id:1,name:'الهندسة المدنية',college_id:1},{id:8,name:'اللغة العربية',college_id:2}],doctors:[{id:17,name:'أحمد محمد العتيبي',major:'الهندسة المدنية',college:'كلية الهندسة',major_id:1,count:1,score:80,scores:[80,80,80],subjects:[],verified:false}],stats:{doctors:1,reviews:1}};
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/Professor-Rating\/?/,'');const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.otf':'font/otf','.pdf':'application/pdf','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const {normalizePublishedPlan}=await import('../../supabase/functions/miyar/plan-format.js');
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),calls=[],errors=[],uploaded=[];
 const me={id:admin,name:'طالب الإدارة',major_id:1,university_id:3,level:3,status:'active',isAdmin:true,ambassadorUniversities:[]};
 await context.addInitScript(id=>{const expires=Math.floor(Date.now()/1000)+3600;localStorage.setItem('sb-bbnsorjxgehvoddluvyo-auth-token',JSON.stringify({access_token:'header.'+btoa(JSON.stringify({sub:id,exp:expires}))+'.mock',refresh_token:'mock-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب الإدارة'},identities:[]}}));},admin);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://bbnsorjxgehvoddluvyo.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),operation=url.searchParams.get('study');
  if(operation==='extract'){
   const request=new Request(req.url(),{method:'POST',headers:req.headers(),body:req.postDataBuffer()});const form=await request.formData();
   calls.push({operation,majorId:form.get('majorId'),version:form.get('fileLabel'),mime:form.get('file').type,requirementLists:form.get('requirementLists'),authorization:req.headers().authorization});
   return route.fulfill({json:{draft:structuredClone(draft),target}});
  }
  if(operation==='publish'){
   const body=req.postDataJSON();calls.push({operation,...body});
   try{const plan=await normalizePublishedPlan(body.draft);uploaded.splice(0,uploaded.length,{...plan,university:target.university,college:target.college,major:target.major});return route.fulfill({json:{ok:true,id:plan.id}});}
   catch(error){return route.fulfill({status:400,json:{error:error.message}});}
  }
  const body=req.postDataJSON()||{};calls.push(body);let result={ok:true};
  if(body.action==='catalogue')result=catalogue;
  if(body.action==='study.plans')result=uploaded;
  if(body.action==='me')result=me;
  if(body.action==='admin'&&body.operation==='queue')result={doctors:[],reviews:[],edits:[],reports:[],catalogueRequests:[],ambassadors:[]};
  if(body.action==='guest.start')result={id:'44444444-4444-4444-8444-444444444444',status:'active',university_id:3,token:'ab'.repeat(32)};
  if(body.action==='guest.me')result={id:'44444444-4444-4444-8444-444444444444',status:'active',university_id:3};
  if(body.action==='guest.presence')result={online:1};if(body.action==='ai.status')result={enabled:true};
  if(body.action==='university'){me.university_id=body.universityId;me.major_id=null;result={ok:true,university_id:body.universityId};}
  if(body.action==='course.doctors')result=[];
  return route.fulfill({json:result});
 });
 const url=`http://127.0.0.1:${server.address().port}/Professor-Rating/`;
 await page.goto(url);await page.locator('aside [data-page=admin]').waitFor();await page.locator('aside [data-page=admin]').click();await page.locator('#study-import-form').waitFor();
 await page.locator('#study-import-form [name=university]').selectOption('4');await page.locator('#study-import-form [name=college]').selectOption('2');await page.locator('#study-import-form [name=majorId]').selectOption('8');await page.locator('#study-import-form [name=fileLabel]').fill('خطة ١٤٤٨');
 assert.equal(await page.locator('#study-import-form [name=requirementLists]').isChecked(),false);await page.locator('#study-import-form [name=requirementLists]').check();
 await page.locator('#study-import-form [name=file]').setInputFiles(path.resolve(__dirname,'../../public/plans/CE-2025.pdf'));await page.locator('#read-study-plan').click();await page.locator('#study-publish-form').waitFor();
 assert.equal(calls.filter(c=>c.operation==='publish').length,0);assert.equal(calls.find(c=>c.operation==='extract').majorId,'8');assert.ok(calls.find(c=>c.operation==='extract').authorization);
 assert.equal(await page.locator('[data-import-row]').count(),8);await page.locator('[data-import-row="0"] summary').click();
 await page.locator('[data-import-row="0"] [data-field=credits]').fill('4');await page.locator('#add-import-course').click();assert.equal(await page.locator('[data-import-row]').count(),9);assert.equal(await page.locator('[data-import-row="0"] [data-field=credits]').inputValue(),'4');
 await page.locator('[data-remove-import-course="8"]').click();assert.equal(await page.locator('[data-import-row]').count(),8);
 // Mixed English names are retained; a duplicated code still blocks publication.
 await page.locator('[data-import-row="0"] summary').click();await page.locator('[data-import-row="0"] [data-field=code]').fill('UNI 101');
 await page.locator('#publish-study-plan').click();await page.waitForFunction(()=>document.querySelector('#study-import-error')?.textContent.includes('مكرر'));assert.equal(uploaded.length,0);
 await page.locator('[data-import-row="0"] [data-field=code]').fill('عرب١٠١');
 assert.equal(await page.locator('[data-import-row="0"] [data-field=name]').inputValue(),'النحو العربي Grammar');
 assert.equal(await page.locator('#import-plan-requirement-lists').isChecked(),true);assert.equal(calls.find(c=>c.operation==='extract').requirementLists,'true');
 for(const width of [390,820,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);await page.locator('#study-publish-form').screenshot({path:`/tmp/miyar-plan-preview-${width}.png`});}
 await page.locator('#publish-study-plan').click();await page.waitForFunction(()=>document.querySelector('#study-publish-form fieldset')?.disabled&&document.querySelector('#study-import-status')?.textContent.includes('محفوظة'));
 assert.equal(uploaded.length,1);assert.equal(uploaded[0].courses[0].name,'النحو العربي Grammar');assert.equal(uploaded[0].courses[0].credits,4);assert.equal(await page.locator('#read-study-plan').isDisabled(),false);
 await page.locator('#open-settings').click();await page.locator('#change-university').click();await page.locator('#university-choice select').selectOption('4');await page.locator('#university-choice .primary').click();
 await page.locator('aside [data-page=plan]').click();await page.locator(`#study-plan-select option[value="${draft.id}"]`).waitFor({state:'attached'});
 assert.equal(await page.locator('#study-plan-select option').count(),1);assert.equal(await page.locator('.study-advisory').count(),0,'a complete non-engineering plan must not show the old engineering-track notice');
 assert.match(await page.locator('.study-page').innerText(),/النحو العربي/);assert.ok((await page.locator('.study-page').innerText()).includes('Grammar'));
 const first=uploaded[0].courses[0],second=uploaded[0].courses.find(c=>c.code==='عرب 202');await page.locator(`[data-study-complete="${first.id}"]`).check();assert.equal(await page.locator(`[data-study-course="${second.id}"] .study-status`).innerText(),'متاحة مبدئيًا');
 const uni=uploaded[0].courses.find(c=>c.code==='REQ-U-1'),required=uploaded[0].courses.find(c=>c.code==='REQ-R-1'),uOption=uploaded[0].courses.find(c=>c.code==='UNI 101'),rOption=uploaded[0].courses.find(c=>c.code==='REQ 101');
 assert.equal(await page.locator(`[data-study-complete="${uni.id}"]`).isDisabled(),true);
 assert.deepEqual(await page.locator(`[data-study-elective="${uni.id}"] option`).evaluateAll(nodes=>nodes.slice(1).map(n=>n.textContent)),['UNI 101 · مهارات التواصل Communication','UNI 102 · العمل التطوعي']);
 assert.deepEqual(await page.locator(`[data-study-elective="${required.id}"] option`).evaluateAll(nodes=>nodes.slice(1).map(n=>n.textContent)),['REQ 101 · English Language','REQ 102 · التفكير الناقد']);
 await page.locator(`[data-study-elective="${uni.id}"]`).selectOption(uOption.id);await page.locator(`[data-study-complete="${uni.id}"]`).check();await page.locator(`[data-study-elective="${required.id}"]`).selectOption(rOption.id);await page.locator(`[data-study-complete="${required.id}"]`).check();
 assert.equal(await page.locator('.study-course').count(),4,'only scheduled requirements appear, not all appendix alternatives');
 await page.reload();await page.locator(`#study-plan-select option[value="${draft.id}"]`).waitFor({state:'attached'});assert.equal(await page.locator(`[data-study-complete="${first.id}"]`).isChecked(),true);
 assert.equal(await page.locator(`[data-study-elective="${uni.id}"]`).inputValue(),uOption.id);assert.equal(await page.locator(`[data-study-complete="${required.id}"]`).isChecked(),true);
 await page.locator(`[data-study-advisor="${first.id}"]`).click();await page.locator('#advisor-course').waitFor();assert.equal(await page.locator('#advisor-course').inputValue(),first.id);assert.match(await page.locator('#advisor-plan').innerText(),/اللغة العربية/);
 assert.deepEqual(errors,[]);await context.close();console.log('PASS: mixed-name publication, opt-in university and required appendix lists kept separate with persisted course choices, admin PDF upload and editable review, validation errors, add/remove without lost edits, publication, dynamic cross-university student plans, persisted progress, adviser integration and responsive preview. AI and API network mocked.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
