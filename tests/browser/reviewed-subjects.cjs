const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../dist');
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/Professor-Rating\/?/,'');const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const url=`http://127.0.0.1:${server.address().port}/Professor-Rating/`,errors=[];
 for(const member of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),calls=[];
  const id='22222222-2222-4222-8222-222222222222',profile={id,name:'طالب',university_id:3,major_id:1,status:'active',level:3};
  if(member)await context.addInitScript(id=>{const exp=Math.floor(Date.now()/1000)+3600;localStorage.setItem('sb-bbnsorjxgehvoddluvyo-auth-token',JSON.stringify({access_token:'header.'+btoa(JSON.stringify({sub:id,exp}))+'.mock',refresh_token:'mock',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,email:'student@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'طالب'},identities:[]}}));},id);
  let slowDoctor=null,releaseSlow;const slow=new Promise(resolve=>releaseSlow=resolve);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://bbnsorjxgehvoddluvyo.supabase.co/**',async route=>{
   const body=route.request().postDataJSON()||{};calls.push(body);let result={ok:true};
   if(body.action==='catalogue')result={universities:[{id:3,name:'جامعة نجران',enabled:true}],colleges:[{id:1,name:'كلية الهندسة',university_id:3}],majors:[{id:1,name:'الهندسة المدنية',college_id:1}],doctors:[{id:17,name:'أحمد محمد العتيبي',major:'الهندسة المدنية',major_id:1,college:'كلية الهندسة',university_id:3,count:1,score:80,scores:[80,80,80],subjects:['استاتيكا']},{id:19,name:'خالد علي القحطاني',major:'الهندسة المدنية',major_id:1,college:'كلية الهندسة',university_id:3,count:1,score:80,scores:[80,80,80],subjects:[]}],stats:{doctors:2,reviews:1}};
   if(['me','guest.me'].includes(body.action))result=profile;if(body.action==='guest.start')result={...profile,token:'ab'.repeat(32)};
   if(body.action==='guest.presence')result={online:1};if(body.action==='ai.status')result={enabled:false};
   if(['study.plans','reviews','course.doctors','course.reviews','notifications','request.updates','requests'].includes(body.action))result=[];
   if(body.action==='doctor.summary')result={insufficient:true,totalPublished:0,themes:[]};
   if(body.action?.endsWith('review.eligibility')){if(body.doctor===slowDoctor)await slow;result={eligible:true,reviewedSubjects:body.doctor===17?['الإِسْتَاتِيكا','الفيزياء المتقدمة']:[]};}
   if(['mine','guest.mine'].includes(body.action))result=[{id:50,doctor_id:17,doctor_name:'أحمد محمد العتيبي',subject:'استاتيكا',comment:'تجربة سابقة',status:'published',explanation:80,treatment:80,grading:80}];
   if(['submit','guest.submit'].includes(body.action))result={id:51,status:'pending'};
   await route.fulfill({json:result});
  });
  await page.goto(url);await page.locator('.welcome').waitFor();
  async function open(doctor){await page.locator(`[data-doctor="${doctor}"]`).first().click();await page.locator('#detail-rate').click();await page.locator('#accept-review-pledge').click();await page.locator('#review-form').waitFor();await page.locator('#review-study-course').waitFor();}
  async function close(){await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});}
  await open(17);const course=page.locator('#review-study-course'),statics=course.locator('[value="najran-ce-2025/ge101"]');
  assert.equal(await statics.evaluate(node=>node.disabled),true);assert.match(await statics.innerText(),/سبق تقييمها/);assert.equal(await statics.evaluate(node=>getComputedStyle(node).opacity),'0.45');
  assert.equal(await course.locator('[value="najran-ce-2025/phys105"]').evaluate(node=>node.disabled),true);assert.equal(await course.locator('[value="najran-ce-2025/chem101"]').evaluate(node=>node.disabled),false);
  // Native keyboard navigation and a forged change event cannot choose a reserved subject.
  await course.evaluate(node=>{node.value='najran-ce-2025/ge101';node.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await course.inputValue(),'');
  assert.equal(await page.locator('[name=subject]').isVisible(),false);await page.locator('[name=grade]').fill('92');await page.locator('.submit-review').click();assert.equal(calls.filter(c=>['submit','guest.submit'].includes(c.action)).length,0);assert.equal(await course.evaluate(node=>node.validity.valueMissing),true);
  assert.deepEqual(await page.locator('#review-study-plan option').evaluateAll(nodes=>nodes.map(n=>n.value)),['najran-ce-2025']);
  await course.selectOption('najran-ce-2025/chem101');assert.equal(await page.locator('[name=subject]').inputValue(),'الكيمياء العامة');await page.screenshot({path:`/tmp/miyar-reviewed-subjects-${member?'member':'guest'}.png`});
  await page.locator('.reviewed-subject-note button').click();await page.locator('[data-edit-review="50"]').waitFor();await close();
  await open(19);assert.equal(await course.locator('[value="najran-ce-2025/ge101"]').evaluate(node=>node.disabled),false,'same subject is available for a different professor');await close();
  // An existing professor typed in the add-doctor form gets the same restrictions;
  // a stale response must never disable the next professor's courses or erase a draft.
  await page.locator('#new-review').click();await page.locator('[name=includeReview]').click();await page.locator('#accept-review-pledge').click();await page.locator('#review-study-course').waitFor();
  slowDoctor=17;await page.locator('[name=doctor]').fill('أحمد محمد العتيبي');await page.waitForFunction(()=>document.querySelector('#review-study-course').disabled);await page.waitForTimeout(220);
  await page.locator('[name=doctor]').fill('خالد علي القحطاني');await page.locator('[name=comment]').fill('مسودة محفوظة');await page.waitForFunction(()=>!document.querySelector('#review-study-course').disabled);releaseSlow();await page.waitForTimeout(100);
  assert.equal(await course.locator('[value="najran-ce-2025/ge101"]').evaluate(node=>node.disabled),false);assert.equal(await page.locator('[name=comment]').inputValue(),'مسودة محفوظة');
  await page.locator('[name=doctor]').fill('أحمد محمد العتيبي');await page.waitForFunction(()=>document.querySelector('#review-study-course option[value="najran-ce-2025/ge101"]').disabled);assert.equal(await page.locator('[name=comment]').inputValue(),'مسودة محفوظة');await close();
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: guest/member reviewed subjects are faded and disabled, spelling aliases stay blocked, the saved specialty is automatic, and forged selections cannot bypass the rule, other professors remain selectable, edit access is preserved, and typed-professor lookup ignores stale responses without losing drafts. All API/auth mocked.');
}finally{await browser.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
