const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../dist');
const catalogue={universities:[{id:3,name:'جامعة نجران',enabled:true},{id:4,name:'جامعة أخرى',enabled:true}],colleges:[{id:1,name:'كلية الهندسة',university_id:3},{id:2,name:'كلية الهندسة',university_id:4},{id:3,name:'كلية العلوم',university_id:3}],majors:[{id:1,name:'الهندسة المدنية',college_id:1},{id:2,name:'الهندسة الميكانيكية',college_id:1},{id:3,name:'الهندسة الكيميائية',college_id:1},{id:4,name:'الهندسة الكهربائية',college_id:1},{id:5,name:'العمارة',college_id:1},{id:6,name:'الفيزياء',college_id:3},{id:7,name:'الهندسة المدنية',college_id:2}],doctors:[{id:17,name:'أحمد محمد العتيبي',major_id:1,major:'الهندسة المدنية',college:'كلية الهندسة',university_id:3,count:2,score:88,scores:[90,85,89],subjects:['استاتيكا'],verified:true,office_role:'head'},{id:18,name:'خالد عبدالله القحطاني',major_id:2,major:'الهندسة الميكانيكية',college:'كلية الهندسة',university_id:3,count:1,score:81,scores:[80,82,81],subjects:['ميكانيكا الموائع'],verified:false},{id:21,name:'سعد علي القحطاني',major_id:6,major:'الفيزياء',college:'كلية العلوم',university_id:3,count:3,score:94,scores:[95,93,94],subjects:['الاستاتيكا'],verified:false,office_role:'dean',office_college_id:3,office_college:'كلية العلوم'},{id:22,name:'أستاذ جامعة أخرى',major_id:7,major:'الهندسة المدنية',college:'كلية الهندسة',university_id:4,count:1,score:99,scores:[99,99,99],subjects:[],verified:false}],stats:{doctors:4,reviews:7}};
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/Professor-Rating\/?/,'');const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.otf':'font/otf','.pdf':'application/pdf','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),calls=[],errors=[];
  const pendingDoctors=[],institutionRequests=[];
  const guest={id:'44444444-4444-4444-8444-444444444444',status:'active',university_id:3};let failCourses=false,activeMember=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://bbnsorjxgehvoddluvyo.supabase.co/**',async route=>{
   const request=route.request(),body=request.postDataJSON()||{};calls.push({...body,headers:request.headers()});let result={ok:true};
   if(body.action==='catalogue')result=catalogue;
   if(body.action==='me')result={id:activeMember,name:'طالب الحساب',major_id:2,university_id:3,status:'active',isAdmin:activeMember?.startsWith('1111'),ambassadorUniversities:[],level:3};
   if(body.action==='guest.start')result={...guest,token:'ab'.repeat(32)};
   if(body.action==='guest.me')result=guest;
   if(body.action==='guest.university'){guest.university_id=body.universityId;result=guest;}
   if(body.action==='guest.presence')result={online:1};
   if(body.action==='ai.status')result={enabled:false};
   if(body.action==='course.doctors'){
    if(failCourses)return route.fulfill({status:503,json:{error:'تعذر جلب الدكاترة الآن'}});
    result=body.courseId==='najran-ce-2025/ge101'?[catalogue.doctors[2],catalogue.doctors[0]]:[];
   }
   if(body.action==='course.reviews')result=[{id:501,subject:'الاستاتيكا',comment:'تجربة منشورة لهذه المادة',scores:[95,93,94],date:'2026-10-26T00:00:00Z'}];
   if(body.action==='guest.doctor.request'){const d={id:99,name:body.name,major_id:body.majorId,requested_course:body.courseId,submitted_by:guest.id,identity_type:'guest'};pendingDoctors.push(d);result={id:d.id,status:'pending'};}
   if(body.action==='guest.institution.request'){institutionRequests.push({id:1,name:body.university,colleges:body.colleges,guest_id:guest.id});result={id:1,status:'pending'};}
   if(body.action==='guest.submit')result={id:50,status:'pending'};
   if(body.action==='reviews')result=[];
   if(body.action==='doctor.summary')result={insufficient:true,totalPublished:0,themes:[]};
   if(body.action==='doctor.grades')result={available:false,minimum:10,subjects:[]};
   if(body.action==='admin'&&body.operation==='queue')result={doctors:pendingDoctors,reviews:[],edits:[],reports:[],catalogueRequests:[],ambassadors:[],institutionRequests};
   if(body.action==='admin'&&body.operation==='doctor.office'){
    const d=catalogue.doctors.find(d=>d.id===body.id);d.office_role=body.role;d.office_college_id=body.role==='dean'?body.collegeId:null;d.office_college=body.role==='dean'?catalogue.colleges.find(c=>c.id===body.collegeId).name:null;
   }
   return route.fulfill({json:result});
  });
  const url=`http://127.0.0.1:${server.address().port}/Professor-Rating/`;
  await page.goto(url);await page.locator('.doctor-card').first().waitFor();await page.waitForTimeout(250);
  assert.deepEqual(await page.locator('aside nav [data-page]').evaluateAll(nodes=>nodes.slice(0,5).map(n=>n.dataset.page)),['home','ratings','plan','saved','developer']);
  await page.locator('.university-request [data-university-request]').click();
  await page.locator('#institution-request-form [name=kind]').selectOption('university');await page.locator('#institution-request-form [name=name]').fill('جامعة الطلب الجديدة');await page.locator('#institution-request-form [name=email]').fill('requester@example.test');
  for(const width of [390,820,1440]){await page.setViewportSize({width,height:950});assert.equal(await page.locator('.modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
  await page.locator('#institution-request-form [type=submit]').click();await page.getByRole('heading',{name:'تم استلام طلبك'}).waitFor();
  const institution=calls.find(c=>c.action==='guest.institution.request');assert.equal(institution.kind,'university');assert.equal(institution.email,'requester@example.test');assert.deepEqual(institution.colleges,[]);assert.ok(!catalogue.universities.some(u=>u.name==='جامعة الطلب الجديدة'));
  await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
  await page.locator('aside [data-page=plan]').click();await page.locator('#study-plan-select').selectOption('najran-me-2026');
  assert.equal(await page.locator('.study-source-notes,.study-prerequisite-settings,.study-course-meta a,.study-setup a').count(),0);
  assert.equal(await page.locator('.study-advisory').innerText(),'الخطة لا تشمل المسار الهندسي.');
  const circuits=page.locator('[data-study-course="najran-me-2026/ee216"]');
  assert.match(await circuits.locator('.study-requirements').innerText(),/المواد المتطلب اجتيازها: الفيزياء المتقدمة \(فيز 105\)/);
  assert.equal((await circuits.innerText()).match(/فيز 105/g).length,1,'a prerequisite appears once with name and code');
  await page.locator('[data-study-complete="najran-me-2026/me221"]').check();
  assert.equal(await page.locator('[data-study-course="najran-me-2026/me231"] .study-status').innerText(),'متاحة مبدئيًا');
  await page.locator('[data-study-doctors="najran-me-2026/me231"]').click();
  assert.equal(await page.locator('[data-study-pick-doctor="22"]').count(),0,'other university professors are not selectable');
  await page.locator('#study-doctor-search').fill('سعد علي');
  assert.equal(await page.locator('[data-study-pick-doctor]').count(),1);
  for(const width of [390,820,1440]){await page.setViewportSize({width,height:950});assert.equal(await page.locator('.modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:`/tmp/miyar-personal-doctor-${width}.png`});}
  await page.locator('[data-study-pick-doctor="21"]').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
  assert.match(await page.locator('[data-study-course="najran-me-2026/me231"] .study-selected-doctor').innerText(),/سعد علي القحطاني/);
  assert.equal(calls.filter(c=>c.action==='guest.submit'||c.action==='submit').length,0,'choosing a professor does not create a review or public course link');
  assert.equal(await page.locator('#review-form,#accept-review-pledge').count(),0);
  await page.reload();await page.locator('[data-study-course="najran-me-2026/me231"] .study-selected-doctor').waitFor();
  await page.locator('[data-study-doctors="najran-me-2026/me231"]').click();await page.locator('#study-doctor-search').fill('مهندس زياد خالد الشهري');await page.locator('#study-request-doctor').click();
  assert.equal(await page.locator('#review-form [name=doctor]').inputValue(),'مهندس زياد خالد الشهري');await page.locator('#review-form [type=submit]').click();await page.getByRole('heading',{name:'تم استلام طلبك'}).waitFor();
  const requestCall=calls.find(c=>c.action==='guest.doctor.request');assert.equal(requestCall.courseId,'najran-me-2026/me231');assert.equal(requestCall.majorId,2);assert.equal(calls.filter(c=>c.action==='guest.submit').length,0);assert.ok(!catalogue.doctors.some(d=>d.id===99));
  await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
  // The same add-doctor form offers an optional rating with preserved course context.
  await page.locator('[data-study-doctors="najran-me-2026/me231"]').click();await page.locator('#study-doctor-search').fill('اسم غير مضاف');
  assert.equal(await page.locator('[data-study-pick-doctor]').count(),0);await page.locator('#study-request-doctor').click();await page.locator('[name=includeReview]').click();await page.locator('#accept-review-pledge').click();
  assert.equal(await page.locator('#review-study-course').inputValue(),'najran-me-2026/me231');
  await page.locator('[name=doctor]').fill('محمد عبدالرحمن القحطاني');await page.locator('[name=grade]').fill('91');await page.locator('.submit-review').click();await page.locator('#review-success-another').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});await page.locator('.study-page').waitFor();
  const submitted=calls.find(c=>c.action==='guest.submit');assert.equal(submitted.courseId,'najran-me-2026/me231');assert.equal(submitted.existingDoctorId,undefined);assert.equal(submitted.pledged,true);assert.equal(submitted.publishGrade,true);
  // Recommendation search accepts the definite article but keeps plan context.
  await page.locator('#study-plan-select').selectOption('najran-ce-2025');await page.locator('[data-study-advisor="najran-ce-2025/ge101"]').click();
  await page.locator('[data-advisor-doctor="21"]').waitFor();
  assert.deepEqual(await page.locator('[data-advisor-doctor]').evaluateAll(nodes=>nodes.map(n=>n.dataset.advisorDoctor)),['21','17']);
  assert.match(await page.locator('[data-advisor-doctor="21"] .office-badge').innerText(),/عميد كلية العلوم/);
  await page.locator('#advisor-search').fill('الإستاتيكا');assert.equal(await page.locator('#advisor-course option').count(),2);await page.locator('#advisor-course').selectOption('najran-ce-2025/ge101');await page.locator('[data-advisor-doctor="21"]').waitFor();
  await page.locator('[data-advisor-reviews="21"]').click();await page.locator('#advisor-course-reviews .review-comment').waitFor();assert.match(await page.locator('#advisor-course-reviews').innerText(),/تجربة منشورة/);await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
  await page.locator('#advisor-search').fill('');
  failCourses=true;await page.locator('#advisor-course').selectOption('najran-ce-2025/chem101');await page.locator('#advisor-retry').waitFor();failCourses=false;await page.locator('#advisor-retry').click();await page.locator('#advisor-results .empty').waitFor();
  await page.locator('#advisor-course').selectOption('najran-ce-2025/ge101');await page.locator('[data-advisor-doctor="21"]').waitFor();
  await page.locator('#page-close').click();await page.locator('.study-page').waitFor();assert.equal(new URL(page.url()).hash,'#plan');
  await page.goForward();await page.locator('[data-advisor-doctor="21"]').waitFor();assert.equal(new URL(page.url()).hash,'#advisor');
  await page.evaluate(()=>{const link=document.createElement('a');link.href='#ratings';link.textContent='مصدر التقييمات';document.querySelector('main').prepend(link);link.click();});
  await page.getByRole('heading',{name:'دليل الدكاترة والتقييمات',exact:false}).waitFor();assert.equal(new URL(page.url()).hash,'#ratings');await page.locator('#page-close').click();await page.locator('[data-advisor-doctor="21"]').waitFor();assert.equal(new URL(page.url()).hash,'#advisor');
  for(const width of [390,820,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:950});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('.advisor-doctor').first().evaluate(el=>el.scrollWidth>el.clientWidth),false);
   await page.screenshot({path:`/tmp/miyar-advisor-${width}-${theme}.png`});
  }
  await page.locator('aside [data-page=plan]').click();await page.locator('#study-plan-select').selectOption('najran-arc-2026');
  const slot1=page.locator('[data-study-elective="najran-arc-2026/slot-arc1-1"]'),slot2=page.locator('[data-study-elective="najran-arc-2026/slot-arc1-2"]');
  await slot1.selectOption('najran-arc-2026/arc355');assert.equal(await slot2.locator('option[value="najran-arc-2026/arc355"]').evaluate(el=>el.disabled),true);
  await page.locator('[data-study-complete="najran-arc-2026/slot-arc1-1"]').check();await slot1.selectOption('najran-arc-2026/arc364');assert.equal(await page.locator('[data-study-complete="najran-arc-2026/slot-arc1-1"]').isChecked(),false);
  // Isolate private plan choices between accounts; then exercise admin office controls.
  const accountA='11111111-1111-4111-8111-111111111111',accountB='22222222-2222-4222-8222-222222222222';
  async function signInMock(id){activeMember=id;await page.evaluate(id=>{const expires=Math.floor(Date.now()/1000)+3600;localStorage.setItem('sb-bbnsorjxgehvoddluvyo-auth-token',JSON.stringify({access_token:'header.'+btoa(JSON.stringify({sub:id,exp:expires}))+'.mock',refresh_token:'mock-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب الحساب'},identities:[]}}));},id);await page.reload();await page.locator('aside .user b').filter({hasText:'طالب الحساب'}).waitFor();}
  await signInMock(accountA);assert.equal(await page.locator('#study-plan-select').inputValue(),'najran-me-2026');assert.equal(await page.locator('.study-selected-doctor').count(),0);await page.locator('[data-study-complete="najran-me-2026/me221"]').check();
  await signInMock(accountB);assert.equal(await page.locator('[data-study-complete="najran-me-2026/me221"]').isChecked(),false);
  await signInMock(accountA);assert.equal(await page.locator('[data-study-complete="najran-me-2026/me221"]').isChecked(),true);
  await page.locator('aside [data-page=admin]').click();await page.locator('[data-cloud-operation="institution.approve"][data-id="1"]').waitFor();assert.match(await page.locator('[aria-label="طلبات الجامعات والكليات"]').innerText(),/جامعة الطلب الجديدة/);assert.match(await page.locator('.moderation-panel').filter({has:page.getByRole('heading',{name:'طلبات إضافة دكتور',exact:true})}).innerText(),/طلب من مادة: ميكانيكا الموائع/);
  await page.locator('[data-cloud-operation="doctor.head"][data-id="17"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-cloud-operation="doctor.head"][data-id="17"]')?.getAttribute('aria-pressed')==='false');
  await page.locator('[data-cloud-operation="doctor.head"][data-id="17"]').click();await page.waitForFunction(()=>document.querySelector('[data-cloud-operation="doctor.head"][data-id="17"]')?.getAttribute('aria-pressed')==='true');
  await page.locator('[data-cloud-operation="doctor.dean"][data-id="17"]').click();await page.locator('#doctor-dean-form select').selectOption('3');await page.locator('#doctor-dean-form .primary').click();await page.locator('#doctor-dean-form').waitFor({state:'detached'});
  assert.ok(calls.some(c=>c.action==='admin'&&c.operation==='doctor.office'&&c.role==='dean'&&c.collegeId===3));
  await page.locator('aside [data-page=home]').click();assert.match(await page.locator('.doctor-card').filter({hasText:'أحمد محمد العتيبي'}).locator('.office-badge').innerText(),/عميد كلية العلوم/);
  assert.equal(await page.locator('.doctor-card').filter({hasText:'أحمد محمد العتيبي'}).locator('.verified').count(),1);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: guest institution and course-professor requests to admin without reviews, previous-page history with forward navigation, personal cross-college searchable professor choices without reviews, optional missing-professor rating, intelligent course advice and material-specific comments, prerequisite deduplication, centered plan navigation, office badges/admin toggles, owner isolation and responsive day/night layouts. API network mocked.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
