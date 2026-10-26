const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../dist');
const catalogue={universities:[{id:3,name:'جامعة نجران'},{id:4,name:'جامعة أخرى'}],colleges:[{id:1,name:'كلية الهندسة',university_id:3},{id:2,name:'كلية الهندسة',university_id:4}],majors:[{id:1,name:'الهندسة المدنية',college_id:1},{id:2,name:'الهندسة الميكانيكية',college_id:1},{id:3,name:'الهندسة الكيميائية',college_id:1},{id:4,name:'الهندسة الكهربائية',college_id:1},{id:5,name:'العمارة',college_id:1}],doctors:[{id:17,name:'أحمد محمد العتيبي',major_id:1,major:'الهندسة المدنية',college:'كلية الهندسة',count:1,score:88,scores:[90,85,89],subjects:['ميكانيكا الموائع'],verified:false},{id:18,name:'خالد عبدالله القحطاني',major_id:2,major:'الهندسة الميكانيكية',college:'كلية الهندسة',count:1,score:81,scores:[80,82,81],subjects:['ميكانيكا الموائع'],verified:false}],stats:{doctors:2,reviews:2}};
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/Professor-Rating\/?/,'');const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.otf':'font/otf','.pdf':'application/pdf','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),calls=[],errors=[];
  const guest={id:'44444444-4444-4444-8444-444444444444',status:'active',university_id:3};let failCourses=false,activeMember=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://bbnsorjxgehvoddluvyo.supabase.co/**',async route=>{
   const request=route.request(),body=request.postDataJSON()||{};calls.push({...body,headers:request.headers()});let result={ok:true};
   if(body.action==='catalogue')result=catalogue;
   if(body.action==='me')result={id:activeMember,name:'طالب الحساب',major_id:2,university_id:3,status:'active',isAdmin:false,ambassadorUniversities:[],level:3};
   if(body.action==='guest.start')result={...guest,token:'ab'.repeat(32)};
   if(body.action==='guest.me')result=guest;
   if(body.action==='guest.university'){guest.university_id=body.universityId;result=guest;}
   if(body.action==='guest.presence')result={online:1};
   if(body.action==='ai.status')result={enabled:false};
   if(body.action==='course.doctors'){
    if(failCourses)return route.fulfill({status:503,json:{error:'تعذر جلب الدكاترة الآن'}});
    result=body.courseId==='najran-ce-2025/ce211'?[catalogue.doctors[0]]:body.courseId==='najran-me-2026/me231'?[catalogue.doctors[1]]:[];
   }
   if(body.action==='guest.submit')result={id:50,status:'pending'};
   if(body.action==='reviews')result=[];
   if(body.action==='doctor.summary')result={insufficient:true,totalPublished:0,themes:[]};
   if(body.action==='doctor.grades')result={available:false,minimum:10,subjects:[]};
   return route.fulfill({json:result});
  });
  const url=`http://127.0.0.1:${server.address().port}/Professor-Rating/`;
  await page.goto(url);await page.locator('.doctor-card').first().waitFor();await page.waitForTimeout(250);
  await page.locator('.study-home-link [data-page=plan]').click();
  await page.locator('#study-plan-select').selectOption('najran-me-2026');
  assert.equal(await page.locator('#study-plan-select option').count(),5);
  assert.equal(await page.locator('[data-study-course="najran-me-2026/me231"] .study-status').innerText(),'متطلبات لم تكتمل');
  await page.locator('#study-foundation').check();
  await page.locator('[data-study-complete="najran-me-2026/me221"]').check();
  assert.equal(await page.locator('[data-study-course="najran-me-2026/me231"] .study-status').innerText(),'متاحة مبدئيًا');
  await page.reload();await page.locator('[data-study-complete="najran-me-2026/me221"]:checked').waitFor();
  assert.equal(await page.locator('#study-foundation').isChecked(),true);
  await page.locator('[data-study-filter=ready]').click();
  assert.ok(await page.locator('[data-study-course="najran-me-2026/me231"]').count()>0);
  assert.equal(await page.locator('.status-locked').count(),0);
  await page.locator('#study-search').fill('ميكانيكا الموائع');
  assert.equal(await page.locator('.study-course').count(),1);
  await page.locator('#study-clear-search').click();assert.ok(await page.locator('.study-course').count()>1);
  await page.locator('[data-study-filter=all]').click();
  await page.locator('#study-plan-select').selectOption('najran-ce-2025');
  assert.equal(await page.locator('#study-foundation').isChecked(),false,'each plan has independent progress');
  await page.locator('[data-study-doctors="najran-ce-2025/ce211"]').click();
  await page.locator('#study-course-doctors .study-doctor-result').waitFor();
  assert.match(await page.locator('#study-course-doctors').innerText(),/أحمد محمد العتيبي/);
  assert.ok(!(await page.locator('#study-course-doctors').innerText()).includes('خالد عبدالله'));
  await page.locator('[data-study-rate="17"]').click();await page.locator('#accept-review-pledge').click();
  await page.locator('#review-form').waitFor();
  assert.equal(await page.locator('#review-study-course').inputValue(),'najran-ce-2025/ce211');
  assert.equal(await page.locator('[name=subject]').inputValue(),'ميكانيكا الموائع');
  assert.equal(await page.locator('[name=subject]').getAttribute('readonly'),'');
  assert.equal(await page.locator('[name=major]').inputValue(),'الهندسة المدنية');
  await page.locator('[name=grade]').fill('91');
  await page.locator('.submit-review').click();await page.locator('.study-home-link').waitFor();
  const submitted=calls.find(c=>c.action==='guest.submit');
  assert.equal(submitted.courseId,'najran-ce-2025/ce211');assert.equal(submitted.major,'الهندسة المدنية');
  assert.equal(submitted.shareGrade,false);assert.equal(submitted.pledged,true);assert.equal(submitted.headers['x-miyar-guest'],'ab'.repeat(32));
  await page.locator('.study-home-link [data-page=plan]').click();await page.locator('#study-plan-select').selectOption('najran-me-2026');
  await page.locator('[data-study-doctors="najran-me-2026/me231"]').click();await page.locator('#study-course-doctors .study-doctor-result').waitFor();
  assert.match(await page.locator('#study-course-doctors').innerText(),/خالد عبدالله/);
  assert.ok(!(await page.locator('#study-course-doctors').innerText()).includes('أحمد محمد'));
  await page.locator('.close-modal').click();
  failCourses=true;await page.locator('[data-study-doctors="najran-me-2026/me231"]').click();await page.locator('#study-doctors-retry').waitFor();
  failCourses=false;await page.locator('#study-doctors-retry').click();await page.locator('.study-doctor-result').waitFor();await page.locator('.close-modal').click();
  await page.locator('#study-plan-select').selectOption('najran-arc-2026');
  const slot1=page.locator('[data-study-elective="najran-arc-2026/slot-arc1-1"]'),slot2=page.locator('[data-study-elective="najran-arc-2026/slot-arc1-2"]');
  await slot1.selectOption('najran-arc-2026/arc355');
  assert.equal(await slot2.locator('option[value="najran-arc-2026/arc355"]').evaluate(el=>el.disabled),true);
  await page.locator('[data-study-complete="najran-arc-2026/slot-arc1-1"]').check();
  await slot1.selectOption('najran-arc-2026/arc364');assert.equal(await page.locator('[data-study-complete="najran-arc-2026/slot-arc1-1"]').isChecked(),false,'changing an elective does not reuse its previous completion');
  assert.equal(await slot1.locator('option[value="najran-arc-2026/ambiguous-gis"]').evaluate(el=>el.disabled),true);
  await page.locator('#study-plan-select').selectOption('najran-ee-2025');await page.locator('#study-foundation').check();
  assert.equal(await page.locator('[data-study-course="najran-ee-2025/ee252"] .study-status').innerText(),'متاحة بشرط التزامن');
  await page.locator('[data-study-filter=ready]').click();
  for(const width of [390,820,1440]){
   await page.setViewportSize({width,height:950});
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${theme} overflow`);
    assert.equal(await page.locator('.study-course').first().evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.screenshot({path:`/tmp/miyar-study-${width}-${theme}.png`,fullPage:false});
   }
  }
  // Navigating through settings reopens the same plan; another university sees no Najran plans.
  await page.locator('#open-settings').click();await page.locator('#study-settings-link').click();await page.locator('#study-plan-select').waitFor();
  await page.locator('#open-settings').click();await page.locator('#change-university').click();await page.locator('#university-choice select').selectOption('4');await page.locator('#university-choice .primary').click();
  await page.locator('.study-home-link [data-page=plan]').click();
  assert.equal(await page.locator('#study-plan-select').count(),0);assert.match(await page.locator('.study-page').innerText(),/خطط جامعتك لم تُضف/);
  // Completed courses remain isolated between Google accounts and guest browsing.
  const accountA='11111111-1111-4111-8111-111111111111',accountB='22222222-2222-4222-8222-222222222222';
  async function signInMock(id){
   activeMember=id;
   await page.evaluate(id=>{
    const expires=Math.floor(Date.now()/1000)+3600;
    localStorage.setItem('sb-bbnsorjxgehvoddluvyo-auth-token',JSON.stringify({access_token:'header.'+btoa(JSON.stringify({sub:id,exp:expires})) + '.mock',refresh_token:'mock-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب الحساب'},identities:[]}}));
   },id);
   await page.reload();await page.locator('aside .user b').filter({hasText:'طالب الحساب'}).waitFor();
  }
  await signInMock(accountA);
  assert.equal(await page.locator('#study-plan-select').inputValue(),'najran-me-2026');
  assert.equal(await page.locator('[data-study-complete="najran-me-2026/me221"]').isChecked(),false,'guest progress is not imported into a member account');
  await page.locator('#study-foundation').check();await page.locator('[data-study-complete="najran-me-2026/me221"]').check();
  await signInMock(accountB);
  assert.equal(await page.locator('[data-study-complete="najran-me-2026/me221"]').isChecked(),false);
  assert.equal(await page.locator('#study-foundation').isChecked(),false);
  await signInMock(accountA);
  assert.equal(await page.locator('[data-study-complete="najran-me-2026/me221"]').isChecked(),true);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: local plan progress, prerequisite/corequisite availability, elective deduplication, university scope, exact course selection and guest submission, scoped professor results, error retry and responsive day/night layouts. API network mocked.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
