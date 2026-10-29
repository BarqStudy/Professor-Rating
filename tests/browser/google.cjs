const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(__dirname, "../../dist");
const member = "11111111-1111-4111-8111-111111111111";
const access = `header.${
  Buffer.from(
    JSON.stringify({
      sub: member,
      amr: [{ method: "oauth" }],
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url")
}.mock-signature`;
const authUser = {
  id: member,
  aud: "authenticated",
  role: "authenticated",
  email: "student@example.test",
  email_confirmed_at: "2026-10-24",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { full_name: "سارة" },
  identities: [{
    id: "google-id",
    user_id: member,
    provider: "google",
    identity_data: { email_verified: true },
  }],
};
const session = {
  access_token: access,
  refresh_token: "mock-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: authUser,
};
const catalogue = {
  universities: [{id:1,name:"جامعة الملك سعود",city:"الرياض",enabled:true},{id:2,name:"جامعة الملك خالد",city:"أبها",enabled:true},{id:3,name:"جامعة نجران",city:"نجران",enabled:true}],
  colleges: [{ id: 1, name: "كلية الهندسة" }],
  majors: [{ id: 1, college_id: 1, name: "الهندسة المدنية" }],
  doctors: [{
    id: 17,
    name: "أحمد محمد العتيبي",
    college: "كلية الهندسة",
    major: "الهندسة المدنية",
    major_id: 1,
    count: 0,
    score: 0,
    scores: [0, 0, 0],
    verified: false,
    subjects: [],
  }],
  stats: { doctors: 1, reviews: 0 },
};
catalogue.colleges.push({ id: 2, name: "كلية العلوم" });
catalogue.majors.push({ id: 2, college_id: 1, name: "الهندسة الكهربائية" }, {
  id: 3,
  college_id: 2,
  name: "الفيزياء",
});
for (
  const data of [{
    id: 18,
    name: "م. خالد محمد الحربي",
    major: "الهندسة المدنية",
    major_id: 1,
  }, {
    id: 19,
    name: "عبدالله سعد القحطاني",
    major: "الهندسة الكهربائية",
    major_id: 2,
  }, {
    id: 20,
    name: "محمد علي السالم",
    college: "كلية العلوم",
    major: "الفيزياء",
    major_id: 3,
  }, {
    id: 21,
    name: "فهد محمد العتيبي",
    major: "الهندسة المدنية",
    major_id: 1,
  }]
) catalogue.doctors.push({ ...catalogue.doctors[0], ...data });
for (const [id, score, count] of [[18, 92, 3], [19, 95, 2], [20, 95, 5]]) {
  Object.assign(catalogue.doctors.find((doctor) => doctor.id === id), { score, count });
}
for (const college of catalogue.colleges) college.university_id = 3;
catalogue.doctors[0].subjects = ["ميكانيكا"];
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".otf": "font/otf",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, "http://test").pathname)
    .replace(/^\/Professor-Rating\//, "").replace(/^\//, "");
  const target = path.resolve(root, relative || "index.html");
  if (!target.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(target, (error, buffer) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      mime[path.extname(target)] || "application/octet-stream",
    );
    res.end(buffer);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}${process.env.TEST_SITE_PATH || '/Professor-Rating/'}`;
  const executable = process.env.CHROMIUM_PATH ||
    ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]
      .find((p) => fs.existsSync(p));
  if (!executable) {
    throw new Error("Set CHROMIUM_PATH to an installed Chromium executable.");
  }
  const browser = await chromium.launch({
    executablePath: executable,
    args: ["--no-sandbox"],
  });
  try {
    const policyContext = await browser.newContext({ javaScriptEnabled: false });
    const policyPage = await policyContext.newPage();
    const policyRequests=[];
    policyPage.on('request',(request)=>policyRequests.push(request.url()));
    const policyResponse=await policyPage.goto(new URL('privacy.html',url).href);
    assert.equal(policyResponse.status(),200);
    assert.equal(await policyPage.locator('h1').innerText(),'سياسة الخصوصية');
    assert.equal(await policyPage.locator('script').count(),0);
    assert.ok((await policyPage.locator('a[href="mailto:info@miyar.website"]').count())>0);
    assert.match(await policyPage.locator('body').innerText(),/Google API Services User Data Policy/);
    assert.ok(!policyRequests.some((request)=>request.includes('supabase.co')||request.includes('googleapis.com')));
    for(const width of [390,1440]){
      await policyPage.setViewportSize({width,height:950});
      assert.equal(await policyPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await policyPage.screenshot({path:`/tmp/miyar-privacy-${width}.png`});
    }
    const termsResponse=await policyPage.goto(new URL('terms.html',url).href);
    assert.equal(termsResponse.status(),200);
    assert.equal(await policyPage.locator('h1').innerText(),'شروط الاستخدام');
    assert.equal(await policyPage.locator('script').count(),0);
    assert.ok(await policyPage.locator('a[href="privacy.html"]').count()>0);
    await policyPage.goto(url);
    assert.equal(await policyPage.locator('noscript a[href$="privacy.html"]').count(),1);
    assert.equal(await policyPage.locator('noscript a[href$="terms.html"]').count(),1);
    await policyContext.close();
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], calls = [];
    const publicReviews=[{id:501,subject:"ميكانيكا",comment:"التقييم القديم المنشور",scores:[80,80,80],date:new Date().toISOString()},{id:502,subject:"رياضيات",comment:"تجربة مادة الرياضيات",scores:[90,90,90],date:new Date().toISOString()}];
    const own={id:501,doctor_id:17,doctor_name:"أحمد محمد العتيبي",subject:"ميكانيكا",comment:"التقييم القديم المنشور",explanation:80,treatment:80,grading:80,status:"published",edit_status:null};
    let pendingEdits=[], pendingReports=[], notifyPublished=false;
    const requestHistory=[],requestEvents=[];
    let catalogueRequests=[],ambassadors=[];
    let aiEnabled=false,aiFails=false,guestSharesGrade=true,memberSharesGrade=false;
    const guest={id:"44444444-4444-4444-8444-444444444444",university_id:null,status:"active"};
    const guestToken="ab".repeat(32);
    let googleEnabled = false,
      fail = false,
      failBulk = true,
      me = {
        id: member,
        name: "سارة",
        major_id: 1,
        university_id: null,
        level: 2,
        status: "active",
        isAdmin: true,
      };
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(
      "https://bbnsorjxgehvoddluvyo.supabase.co/**",
      async (route) => {
        const request = route.request(), endpoint = new URL(request.url());
        if (endpoint.pathname === "/auth/v1/settings") {
          return route.fulfill({
            json: { external: { google: googleEnabled } },
          });
        }
        if (endpoint.pathname === "/auth/v1/authorize") {
          return route.fulfill({
            body: "<h1>Mock Google OAuth authorization</h1>",
            contentType: "text/html",
          });
        }
        if (endpoint.pathname === "/auth/v1/token") {
          calls.push({ action: "exchange", ...request.postDataJSON() });
          return route.fulfill({ json: session });
        }
        if (endpoint.pathname === "/auth/v1/user") {
          return route.fulfill({ json: authUser });
        }
        if (endpoint.pathname === "/auth/v1/logout") {
          calls.push({
            action: "logout",
            authorization: request.headers().authorization,
          });
          return route.fulfill({ status: 204 });
        }
        if (endpoint.pathname === "/functions/v1/miyar") {
          if (fail) return route.abort();
          const body = request.postDataJSON();
          calls.push({
            ...body,
            authorization: request.headers().authorization,
            guest_token: request.headers()["x-miyar-guest"],
          });
          let result = { ok: true };
          if (body.action === "catalogue") result = catalogue;
          if(body.action==='ai.status')result={enabled:aiEnabled};
          if(body.operation==='ai.check')result={status:'ready',provider:'gemini',model:'gemini-2.5-flash',keyPresent:true,message:'المفتاح مقبول والنموذج متاح.'};
          if(body.action==='guest.ai.ask'){
            if(aiFails)return route.fulfill({status:429,json:{error:'وصلت للحد اليومي للمساعد.'}});
            result={answer:'اختر الدكتور من صفحة التقييمات ثم أضف تجربتك. <img src=x onerror="window.aiInjected=true">',sources:[{label:'إضافة تقييم',href:'#ratings'}],remaining:9};
          }
          if (body.action === "guest.start") result={...guest,token:guestToken};
          if (body.action === "guest.me") result={...guest};
          if (body.action === "guest.university") {guest.university_id=body.universityId;result={...guest};}
          if (body.action === "guest.presence") result={online:7};
          if (body.action === "guest.submit") result={id:99,status:"pending"};
          if (body.action === 'doctor.grades') {
            const available=body.subject==='ميكانيكا'&&body.doctor!==19;
            result={minimum:10,available,subject:body.subject||null,subjects:['ميكانيكا','رياضيات'],...(available?{total:10,average:87.5,highPercent:60,bins:[{band:'90–100',count:6,percent:60},{band:'80–89',count:2,percent:20},{band:'70–79',count:1,percent:10},{band:'60–69',count:1,percent:10},{band:'0–59',count:0,percent:0}]}:{})};
          }
          if (body.action === 'guest.grade.participation') result={items:[{id:99,doctor_name:catalogue.doctors[0].name,subject:'مادة زائر',university:'جامعة نجران',status:'pending',share_grade:guestSharesGrade}],nextBefore:null};
          if (body.action === 'grade.participation') result={items:body.before?[{id:400,doctor_name:'أحمد عبدالله الغامدي',subject:'مادة سابقة',university:'جامعة الملك خالد',status:'published',share_grade:false}]:[{id:501,doctor_name:catalogue.doctors[0].name,subject:'ميكانيكا',university:'جامعة نجران',status:'published',share_grade:memberSharesGrade}],nextBefore:body.before?null:501};
          if (body.action === 'guest.grade.consent') {guestSharesGrade=body.shareGrade;result={ok:true,shareGrade:body.shareGrade};}
          if (body.action === 'grade.consent') {memberSharesGrade=body.shareGrade;result={ok:true,shareGrade:body.shareGrade};}

          if (body.action === "me") result = me;
          if (body.action === "reviews") result = body.doctor===17 ? publicReviews.filter((row)=>!body.subject||row.subject===body.subject) : [];
          if (body.action === "mine") result=[own];
          if (body.action === "requests") result=requestHistory;
          if (body.action === "request.updates") result=requestEvents;
          if (body.action === "doctor.summary") result={reviewCount:3,totalPublished:3,themes:[{label:"إشادة بالشرح",count:2}],insufficient:false};
          if (body.action === "notifications") result=notifyPublished&&body.doctors.includes(18)?[{review_id:601,doctor_id:18,doctor_name:catalogue.doctors.find((doctor)=>doctor.id===18).name,published_at:new Date(Date.now()+10000).toISOString()}]:[];
          if (body.action === "doctor.request") {requestHistory.push({id:55,kind:"doctor",title:body.name,status:"pending",reason:null,created_at:new Date().toISOString(),university:"جامعة نجران"});result={id:55,status:"pending",existing:false};}
          if (['doctor.correction','ambassador.propose'].includes(body.action)) {
            const kind=body.action==='doctor.correction'?'doctor.correct':body.kind;
            const source=kind.startsWith('doctor.')?catalogue.doctors.find((item)=>item.id===body.targetId):kind.startsWith('college.')?catalogue.colleges.find((item)=>item.id===body.targetId):catalogue.majors.find((item)=>item.id===body.targetId);
            const id=1001+requestHistory.filter((item)=>item.kind==='catalogue').length;
            catalogueRequests.push({id,kind,name:body.name,university_id:body.universityId||3,university:'جامعة نجران',target_id:body.targetId,parent_id:body.parentId,details:body.details,original:{name:source?.name,parent_id:source?.major_id||source?.college_id||null},ambassador:body.action==='ambassador.propose',author_name:'سارة',account_id:member,created_at:new Date().toISOString()});
            requestHistory.push({id,kind:'catalogue',proposal_kind:kind,title:body.name,status:'pending',created_at:new Date().toISOString(),university:'جامعة نجران'});
            result={id,status:'pending'};
          }
          if(body.operation==='ambassador.set'){
            if(body.active&&!ambassadors.some((row)=>row.university_id===body.universityId))ambassadors.push({account_id:member,email:body.email,name:'سارة',university_id:body.universityId,status:'active'});
            if(!body.active)ambassadors=ambassadors.filter((row)=>row.university_id!==body.universityId);
            me.ambassadorUniversities=ambassadors.map((row)=>row.university_id);
          }
          if(['catalogue.approve','catalogue.reject'].includes(body.operation)){
            const proposal=catalogueRequests.find((item)=>item.id===body.id);
            if(body.operation==='catalogue.approve'){
              if(proposal.kind==='doctor.correct'){const doctor=catalogue.doctors.find((item)=>item.id===proposal.target_id);doctor.name=proposal.name;doctor.major_id=proposal.parent_id;}
              if(proposal.kind==='major.add')catalogue.majors.push({id:400,college_id:proposal.parent_id,name:proposal.name});
            }
            const history=requestHistory.find((item)=>item.kind==='catalogue'&&item.id===body.id);
            history.status=body.operation.endsWith('approve')?'approved':'rejected';history.reason=body.reason||'';history.decided_at=new Date().toISOString();
            requestEvents.push({...history,id:900+requestEvents.length,request_id:history.id});
            catalogueRequests=catalogueRequests.filter((item)=>item.id!==body.id);
          }
          if (body.action === "report") { pendingReports.push({id:701,review_id:body.review,reason:body.reason,details:body.details,doctor_name:own.doctor_name,subject:"رياضيات",comment:"تجربة مادة الرياضيات"});result={id:701,status:"pending"}; }
          if (body.action === "edit") {
            pendingEdits.push({id:801+requestHistory.filter((item)=>item.kind==="edit").length,review_id:body.review,doctor_name:own.doctor_name,old_subject:own.subject,old_comment:own.comment,old_explanation:own.explanation,old_treatment:own.treatment,old_grading:own.grading,subject:body.subject,comment:body.comment,explanation:body.scores[0],treatment:body.scores[1],grading:body.scores[2]});
            requestHistory.push({id:pendingEdits.at(-1).id,kind:"edit",title:own.doctor_name,status:"pending",reason:null,created_at:new Date().toISOString(),university:"جامعة نجران"});
            own.edit_status="pending";result={id:pendingEdits.at(-1).id,status:"pending"};
          }
          if (["edit.approve","edit.reject","doctor.approve","doctor.reject"].includes(body.operation)) {
            const request=requestHistory.find((item)=>item.id===body.id&&item.kind===(body.operation.startsWith("edit")?"edit":"doctor"));
            if(request){request.status=body.operation.endsWith("approve")?"approved":"rejected";request.reason=body.reason||"";request.decided_at=new Date().toISOString();requestEvents.push({...request,id:900+requestEvents.length,request_id:request.id});}
          }
          if (body.operation === "doctor.bulk") {
            for(const id of body.ids){const doctor=catalogue.doctors.find((item)=>item.id===id);if(body.operationType==='archive')catalogue.doctors.splice(catalogue.doctors.indexOf(doctor),1);else doctor.verified=body.operationType==='verify';}result={updated:body.ids.length};
          }
          if (body.operation === "edit.approve") { const edit=pendingEdits[0];Object.assign(own,{subject:edit.subject,comment:edit.comment,explanation:edit.explanation,treatment:edit.treatment,grading:edit.grading,edit_status:"approved"});Object.assign(publicReviews[0],{subject:edit.subject,comment:edit.comment,scores:[edit.explanation,edit.treatment,edit.grading]});pendingEdits=[]; }
          if (body.operation === "edit.reject") {pendingEdits=[];own.edit_status="rejected";}
          if (body.operation === "report.dismiss") pendingReports=[];
          if (body.action === "university") {
            me = { ...me, university_id: body.universityId, major_id: null };
            result = { ok: true, university_id: body.universityId };
          }
          if (body.action === "profile") {
            me = {
              ...me,
              name: body.name,
              major_id: body.majorId,
              level: body.level,
            };
          }
          if (body.action === "submit") result = { id: 8, status: "pending" };
          if (body.operation === "major.add") {
            catalogue.majors.push({ id: 20 + catalogue.majors.length, college_id: body.collegeId, name: body.name });
          }
          if (body.operation === "college.add") {
            catalogue.colleges.push({ id: 20 + catalogue.colleges.length, university_id: body.universityId, name: body.name });
          }
          if(body.operation==='university.add')catalogue.universities.push({id:Math.max(...catalogue.universities.map((row)=>row.id))+1,name:body.name,enabled:false});
          if(body.operation==='university.enable')catalogue.universities.find(row=>row.id===body.id).enabled=body.enabled;
          if(body.operation==='university.delete'){
            if(catalogue.colleges.some((row)=>row.university_id===body.id))return route.fulfill({status:409,json:{error:'لا يمكن حذف الجامعة لوجود كليات مرتبطة بها. تُحفظ الكليات والدكاترة والتقييمات.'}});
            if(me.university_id===body.id)me={...me,university_id:null,major_id:null};
            if(guest.university_id===body.id)guest.university_id=null;
            catalogue.universities=catalogue.universities.filter((row)=>row.id!==body.id);
          }
          if (body.operation === "doctor.add") {
            if (body.name === "ناصر سعيد الغامدي" && failBulk) {
              failBulk = false;
              return route.fulfill({ status: 503, json: { error: "انقطاع تجريبي" } });
            }
            catalogue.doctors.push({ ...catalogue.doctors[0], id: 100 + catalogue.doctors.length, name: body.name, major_id: body.majorId });
          }
          if (body.operation === "queue") result = { doctors: requestHistory.filter((item)=>item.kind==="doctor"&&item.status==="pending").map((item)=>({id:item.id,name:item.title,major_id:1,submitted_by:member})), reviews: [], edits:pendingEdits, reports:pendingReports,catalogueRequests,ambassadors };
          return route.fulfill({ json: result });
        }
        return route.fulfill({
          status: 404,
          json: { error: "Unexpected mock endpoint" },
        });
      },
    );
    await page.goto(url);
    await page.locator('#university-search').fill('جامعة نجران');await page.locator('[data-select-university="405"]').click();
    await page.locator(".connection-banner.live").waitFor();
    assert.equal(await page.locator('footer a[href$="privacy.html"]').count(),1);
    assert.equal(await page.locator('footer a[href$="terms.html"]').count(),1);
    assert.equal(await page.locator("[data-page=admin]").count(), 0);
    assert.equal(
      await page.locator(".student-summary,.profile-meta").count(),
      0,
    );
    assert.ok(
      !(await page.locator("body").innerText()).includes(
        "تجارب حقيقية من زملائك",
      ),
    );
    assert.equal(await page.locator(".quick-actions>button").first().getAttribute("data-page"),"ratings");
    assert.equal(await page.locator(".quick-actions>button").first().locator("h2").innerText(),"الدكاترة وتقييماتهم");
    assert.equal(await page.locator(".quick-actions>button").nth(1).locator("h2").innerText(),"إضافة دكتور");
    assert.equal(await page.locator(".action-decoration svg").count(),1);
    assert.ok(!(await page.locator(".action-decoration").innerText()).includes("✳"));
    assert.equal(await page.locator("[data-college]").count(), 0);
    assert.equal(await page.locator(".doctor-card").count(), 3);
    assert.deepEqual(await page.locator(".doctor-card .doctor-name [data-doctor]").evaluateAll((buttons) => buttons.map((button) => Number(button.dataset.doctor))), [20, 19, 18]);
    assert.deepEqual(await page.locator('.doctor-card .doctor-name [data-doctor]').allTextContents(), [20,19,18].map((id)=>catalogue.doctors.find((doctor)=>doctor.id===id).name));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const term of ["أحمد محمد العتيبي", "ميكانيكا"]) {
        await page.locator("#search").fill(term);
        assert.equal(await page.locator(".search-block + .search-results").count(), 1);
        assert.equal(await page.locator(".doctor-card").count(), 1);
        assert.match(await page.locator(".doctor-card").innerText(), /أحمد محمد العتيبي/);
        assert.equal(await page.locator("#search").evaluate((el) => el === document.activeElement), true);
        assert.ok(!(await page.locator(".search-results .section-heading").innerText()).includes("عند التعادل"));
      }
      await page.locator("#search").fill("لا يوجد دكتور مطابق");
      assert.equal(await page.locator(".search-block + .search-results .empty").count(), 1);
      assert.equal(await page.locator("#clear-search").isVisible(), true);
      await page.locator("#clear-search").click();
      assert.equal(await page.locator("#search").inputValue(), "");
      assert.equal(await page.locator("#clear-search").isVisible(), false);
      assert.equal(await page.locator("#search").evaluate((el) => el === document.activeElement), true);
      assert.equal(await page.locator("#home-doctors-slot > .top-doctors").count(), 1);
      assert.equal(await page.locator(".doctor-card").count(), 3);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator("footer .icon").count(), 0);
    assert.equal(await page.locator('.university-request [data-university-request]').count(),1);
    assert.equal(await page.locator(".stats + #home-doctors-slot + .university-request").count(),1);
    for(const id of [20,19,18]) await page.locator(`[data-compare="${id}"]`).click();
    await page.locator("#compare-now").click();
    assert.equal(await page.locator(".comparison-table thead th").count(),4);
    assert.deepEqual(await page.locator('.comparison-table thead th').evaluateAll((cells)=>cells.slice(1).map((cell)=>cell.firstChild.textContent)), [20,19,18].map((id)=>catalogue.doctors.find((doctor)=>doctor.id===id).name));
    assert.match(await page.locator(".comparison-table").innerText(),/المساعدة بالدرجات/);
    await page.locator('#grade-comparison .grade-subject').waitFor();
    await page.locator('#grade-comparison .grade-subject').selectOption('ميكانيكا');
    await page.locator('.grade-comparison-table').waitFor();
    assert.match(await page.locator('.grade-comparison-table').innerText(),/بيانات غير كافية/);
    assert.match(await page.locator('.grade-comparison-table').innerText(),/٦٠٪/);

    await page.locator(".close-modal").click();
    await page.locator(".modal-backdrop").waitFor({state:"detached"});
    await page.locator("#compare-clear").click();
    await page.locator("[data-page=ratings]").first().click();
    assert.equal(await page.locator("[data-college]").count(), 2);
    assert.equal(await page.locator(".directory-major").count(), 2);
    assert.equal(await page.locator("[data-major]").count(), 0);
    assert.equal(await page.locator(".doctor-card").count(), 4);
    await page.locator('[data-college="كلية الهندسة"]').click();
    assert.equal(await page.locator(".doctor-card").count(), 4);
    for(const id of [17,18,19,21]) await page.locator(`[data-compare="${id}"]`).click();
    assert.equal(await page.locator('[data-compare][aria-pressed="true"]').count(),3);
    await page.locator("#compare-clear").click();
    assert.equal(await page.locator('.directory-major').filter({hasText:'الفيزياء'}).count(),0);
    await page.locator('#search').fill('عبدالله سعد القحطاني');
    assert.equal(await page.locator('.doctor-card').count(),1);
    assert.match(await page.locator('.directory-major h3').innerText(),/الهندسة الكهربائية/);
    await page.locator('#clear-search').click();
    await page.locator('[data-college="كلية العلوم"]').click();
    assert.equal(await page.locator('.doctor-card').count(),1);
    assert.equal(await page.locator('.directory-major').count(),1);
    await page.locator('[data-college="كلية الهندسة"]').click();
    assert.equal(await page.locator('.directory-major').count(),2);
    const civil=page.locator('.directory-major').filter({has:page.locator('h3').filter({hasText:'الهندسة المدنية'})});
    await page.setViewportSize({width:390,height:844});
    await civil.locator('[data-carousel-next]').click();
    await page.waitForFunction(()=>Math.abs(document.querySelector('.directory-major .doctor-carousel').scrollLeft)>20);
    await civil.locator('[data-carousel-previous]').click();
    await page.waitForFunction(()=>document.querySelector('[data-carousel-previous]').disabled);
    await page.locator("#page-close").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator(".hero-art").isVisible());
    const headerStyle = await page.locator("header").evaluate((el) => {
      const css = getComputedStyle(el);
      return { blur: css.backdropFilter, radius: css.borderTopLeftRadius, position: css.position };
    });
    assert.match(headerStyle.blur, /blur/);
    assert.equal(headerStyle.radius, "27px");
    assert.equal(headerStyle.position, "sticky");
    await page.evaluate(() => window.scrollTo(0, 600));
    const topBar = await page.locator("header").boundingBox();
    assert.ok(topBar.x >= 12 && topBar.x + topBar.width <= 390 - 12);
    assert.ok(topBar.y >= 0 && topBar.y < 30);
    await page.evaluate(() => window.scrollTo(0, 0));
    const art = await page.locator(".hero-art").boundingBox();
    assert.ok(art.x >= 0 && art.x + art.width <= 390);
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.scrollWidth > innerWidth
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/miyar-updated-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.locator("#new-review").click();
    await page.locator('[name=includeReview]').click();
    await page.locator('#accept-review-pledge').waitFor();
    assert.match(await page.locator('.pledge-card').innerText(),/مخافة الله/);
    assert.equal(await page.locator('#review-form').count(),0);
    assert.equal(await page.locator('#google-signin').count(),0);
    await page.locator('#accept-review-pledge').click();
    await page.locator('#review-form').waitFor();
    assert.equal(await page.locator('#review-form [name=comment]').getAttribute('required'),null);
    assert.equal(await page.locator('#review-form [name=shareGrade]').isChecked(),false);
    await page.locator('#review-form [name=shareGrade]').check();
    await page.locator('[data-rating-tag="محاضرة ممتعة"]').click();
    await page.locator('[data-rating-tag="محاضرة مملة"]').click();
    assert.equal(await page.locator('[data-rating-tag="محاضرة ممتعة"]').getAttribute('aria-pressed'),'false');
    await page.locator('[data-rating-tag="محاضرة مملة"]').click();
    await page.locator('[data-rating-tag="يوصل المعلومة"]').click();
    await page.locator('#review-form [name=doctor]').fill('أحمد محمد العتيبي');
    await page.locator('#review-form [name=subject]').fill('مادة زائر');
    await page.locator('#review-form [name=grade]').fill('90');
    await page.locator('#review-form [type=range]').first().evaluate((input)=>{input.value='75';input.dispatchEvent(new Event('input'));});
    await page.locator('.submit-review').click();
    await page.locator('.modal-backdrop').waitFor({state:'detached'});
    const guestReview=calls.find((call)=>call.action==='guest.submit');
    assert.equal(guestReview.comment,'');assert.deepEqual(guestReview.tags,['يوصل المعلومة']);assert.equal(guestReview.pledged,true);
    assert.equal(guestReview.authorization,undefined);assert.equal(guestReview.guest_token,guestToken);
    assert.equal(guestReview.shareGrade,true);
    await page.locator('#open-settings').click();await page.locator('#grade-sharing-settings').click();
    await page.locator('[data-grade-consent="99"]').waitFor();
    assert.equal(await page.locator('[data-grade-consent="99"]').isChecked(),true);
    await page.locator('[data-grade-consent="99"]').uncheck();
    await page.getByText('سُحبت الموافقة واستُبعدت الدرجة من الإحصائيات.').waitFor();
    assert.ok(calls.some(call=>call.action==='guest.grade.consent'&&call.shareGrade===false&&call.guest_token===guestToken&&!call.authorization));
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});

    await page.waitForFunction(()=>document.querySelector('[data-online-count]').textContent.includes((7).toLocaleString('ar')));
    assert.match(await page.locator('.semester').innerText(),/الأول ١٤٤٨/);
    assert.equal(calls.filter((call)=>call.action==='exchange').length,0);
    await page.locator('[data-page=assistant]').click();
    await page.getByText('مساعد مِعيار قيد التجهيز. سيُتاح بعد اكتمال ربط خدمة الذكاء الاصطناعي.').waitFor();
    assert.equal(await page.locator('#assistant-form [type=submit]').isDisabled(),true);
    assert.equal(await page.locator('#assistant-log').innerText(),'');
    aiEnabled=true;
    await page.locator('#page-close').click();await page.locator('[data-page=assistant]').click();
    await page.getByText('جاهز لمساعدتك · الإجابات تستند إلى بيانات مِعيار المنشورة.').waitFor();
    await page.locator('[data-assistant-prompt]').first().click();
    await page.locator('.assistant-message.assistant').waitFor();
    assert.match(await page.locator('.assistant-message.assistant').innerText(),/اختر الدكتور/);
    assert.equal(await page.locator('#assistant-log img').count(),0);
    assert.equal(await page.evaluate(()=>window.aiInjected),undefined);
    assert.equal(await page.locator('.assistant-sources a').getAttribute('href'),'#ratings');
    const aiCall=calls.find((call)=>call.action==='guest.ai.ask');
    assert.equal(aiCall.guest_token,guestToken);assert.equal(aiCall.authorization,undefined);assert.deepEqual(aiCall.history,[]);
    for(const width of [390,1024]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`/tmp/miyar-assistant-${width}.png`,fullPage:true});
    }
    aiFails=true;
    await page.locator('#assistant-question').fill('كيف أغيّر جامعتي؟');
    await page.locator('#assistant-form [type=submit]').click();
    await page.getByText('وصلت للحد اليومي للمساعد.').waitFor();
    assert.equal(await page.locator('#assistant-question').inputValue(),'كيف أغيّر جامعتي؟');
    assert.equal(await page.locator('.assistant-message').count(),2);
    await page.locator('#assistant-clear').click();assert.equal(await page.locator('.assistant-message').count(),0);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).some((key)=>key.includes('assistant')||key.includes('ai-chat'))),false);
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#page-close').click();
    await page.locator('#google-account').click();
    await page.locator("#google-signin").waitFor();
    assert.equal(await page.locator('.modal a[href$="privacy.html"]').count(),1);
    assert.equal(await page.locator('.modal a[href$="terms.html"]').count(),1);
    await page.locator("#google-signin").click();
    await page.getByText("تسجيل الدخول باستخدام Google لم يُفعّل بعد. جرّب لاحقًا.")
      .waitFor();
    assert.equal(page.url(), url);
    googleEnabled = true;
    await page.locator("#google-signin").click();
    await page.waitForURL("**/auth/v1/authorize?**");
    const oauth = new URL(page.url());
    assert.equal(oauth.searchParams.get("provider"), "google");
    assert.equal(oauth.searchParams.get("redirect_to"), url);
    assert.equal(oauth.searchParams.get("code_challenge_method"), "s256");
    assert.ok(oauth.searchParams.get("code_challenge"));
    await page.goto(url + "?code=mock-authorization-code");
    await page.locator(".welcome h1").filter({hasText:"سارة"}).waitFor();
    assert.equal(new URL(page.url()).searchParams.has("code"), false);
    assert.ok(
      calls.some((c) =>
        c.action === "exchange" && c.auth_code === "mock-authorization-code" &&
        c.code_verifier
      ),
    );
    assert.equal(await page.locator("#university-directory,.university-picker-modal").count(), 0);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".welcome").isVisible(), true);
    await page.reload();
    await page.locator('.connection-banner.live').waitFor();
    assert.equal(await page.locator('#university-directory,.university-picker-modal').count(),0);
    await page.locator('#header-change-university').click();
    await page.locator("#university-directory").waitFor();
    await page.locator('.uni-card.is-open[data-select-university="405"]').waitFor();
    await page.locator('#university-search').fill('جامعة نجران');await page.locator('[data-select-university="405"]').click();
    await page.locator(".modal-backdrop").waitFor({state:"detached"});
    assert.match(await page.locator(".connection-banner.live").innerText(), /جامعة نجران/);
    assert.equal(await page.locator("[data-page=admin]").count(), 1);
    assert.equal(await page.locator("#google-account").count(), 0);
    assert.equal(await page.locator("#open-settings").count(), 1);
    assert.ok(
      !(await page.locator(".welcome").innerText()).includes("المستوى"),
    );
    assert.ok(
      !(await page.locator(".welcome").innerText()).includes("تم تسجيل الدخول"),
    );

    await page.locator("#new-review").click();
    await page.locator('[name=includeReview]').click();
    await page.locator("#accept-review-pledge").click();

    assert.equal(new URL(page.url()).hash, "");
    assert.equal(await page.locator('.review-landing').count(), 0);
    assert.equal(await page.locator(".main-wrap").evaluate((el) => el.inert), true);
    assert.match(await page.locator(".modal-backdrop").evaluate((el) => getComputedStyle(el).backdropFilter), /blur/);
    await page.screenshot({ path: "/tmp/miyar-glass-review.png" });
    const slider = page.locator("[name=score0]");
    await slider.scrollIntoViewIfNeeded();
    let bounds = await slider.boundingBox();
    await page.mouse.click(bounds.x + 5, bounds.y + bounds.height / 2);
    assert.equal(await slider.inputValue(), "0");
    assert.equal(
      await slider.evaluate((e) => e.style.getPropertyValue("--range-color")),
      "#dc655c",
    );
    assert.match(
      await slider.evaluate((e) => getComputedStyle(e).backgroundImage),
      /^linear-gradient\(to right, rgb\(220, 101, 92\)/,
    );
    bounds = await slider.boundingBox();
    await page.mouse.click(
      bounds.x + bounds.width - 5,
      bounds.y + bounds.height / 2,
    );
    assert.equal(await slider.inputValue(), "100");
    assert.equal(
      await slider.evaluate((e) => e.style.getPropertyValue("--range-color")),
      "#22835e",
    );
    await page.locator("#review-form").evaluate((form) =>
      form.scrollIntoView()
    );
    await page.locator("[name=doctor]").fill("أحمد محمد العتيبي");
    await page.locator("[name=subject]").fill("ميكانيكا");
    await page.locator("[name=grade]").fill("92");
    await page.locator("[name=comment]").fill("شرح واضح وتجربة مفيدة");
    await page.locator(".submit-review").click();
    await page.locator(".modal-backdrop").waitFor({ state: "detached" });
    const submission = calls.find((c) => c.action === "submit");
    assert.equal(submission.authorization, `Bearer ${access}`);
    assert.ok(!("initData" in submission));
    assert.equal(submission.grade, 92);
    assert.equal(submission.shareGrade,false);
    await page.locator("#open-settings").click();
    assert.equal(await page.locator('.short-account-id').innerText(),member.slice(0,8).toUpperCase());
    assert.ok(!(await page.locator('.cloud-identity').innerText()).includes(member));
    await page.evaluate(()=>{
      window.accountClipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value)=>{window.copiedAccountId=value;}}});
    });
    await page.locator('#copy-account-id').click();
    assert.equal(await page.evaluate(()=>window.copiedAccountId),member);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard unavailable');}}}));
    await page.locator('#copy-account-id').click();
    assert.equal(await page.locator('#account-id-copy-fallback input').inputValue(),member);
    assert.equal(await page.locator('#account-id-copy-fallback input').evaluate((input)=>input.selectionEnd-input.selectionStart),member.length);
    await page.evaluate(()=>{
      if(window.accountClipboardDescriptor)Object.defineProperty(navigator,'clipboard',window.accountClipboardDescriptor);else delete navigator.clipboard;
      document.querySelector('#account-id-copy-fallback').hidden=true;
    });
    const dayColors = new Set(), nightColors = new Set();
    for (const color of ["blue", "green", "pink", "apple"]) {
      await page.locator(`[data-color-option="${color}"]`).click();
      assert.equal(await page.locator("html").getAttribute("data-color"), color);
      assert.equal(await page.locator(`[data-color-option="${color}"]`).getAttribute("aria-pressed"), "true");
      await page.locator('[data-appearance="light"]').click();
      dayColors.add(await page.locator(".miyar-mark").first().evaluate((el) => getComputedStyle(el).color));
      await page.locator('[data-appearance="dark"]').click();
      assert.equal(await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundImage), "none");
      assert.equal(await page.locator(".modal").evaluate((el) => getComputedStyle(el).backdropFilter), "none");
      nightColors.add(await page.locator(".miyar-mark").first().evaluate((el) => getComputedStyle(el).color));
    }
    assert.equal(dayColors.size, 4);
    assert.equal(nightColors.size, 4);
    await page.locator('[data-color-option="pink"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/miyar-settings-pink-dark.png" });
    await page.locator("#settings-form [name=name]").fill("سارة محمد");
    await page.locator(".settings-save").click();
    await page.locator(".modal-backdrop").waitFor({ state: "detached" });
    await page.reload();
    await page.getByRole("heading", { level: 1 }).filter({
      hasText: "أهلًا سارة",
    }).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-color"), "pink");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator("#open-settings").click();
    assert.equal(await page.locator('[data-color-option="pink"]').getAttribute("aria-pressed"), "true");
    await page.locator('[data-color-option="blue"]').click();
    await page.locator('[data-appearance="light"]').click();
    await page.locator(".close-modal").click();
    await page.locator(".modal-backdrop").waitFor({ state: "detached" });
    await page.locator("#open-settings").click();
    await page.locator("#change-university").click();
    await page.locator('#university-search').fill('جامعة الملك سعود');await page.locator('[data-select-university="104"]').click();
    await page.locator(".modal-backdrop").waitFor({state:"detached"});
    assert.equal(await page.locator(".doctor-card").count(),0);
    assert.match(await page.locator("#doctor-grid").innerText(), /لم تُضف كليات جامعتك/);
    await page.locator('.stats').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-stat-value]')].every(node=>node.textContent===node.dataset.statPrefix+Number(node.dataset.statValue).toLocaleString('ar')));
    assert.equal(await page.locator('.stats>div').nth(0).locator('b [data-stat-value]').innerText(), '+'+catalogue.stats.doctors.toLocaleString('ar'));
    assert.equal(await page.locator('.stats>div').nth(1).locator('b [data-stat-value]').innerText(), '+'+catalogue.stats.reviews.toLocaleString('ar'));
    assert.equal(await page.locator('.stats>div').nth(2).locator('b [data-stat-value]').innerText(), catalogue.colleges.length.toLocaleString('ar'));
    assert.match(await page.locator('.stats .demo-data').innerText(), /جميع الجامعات/);
    await page.locator("#search").fill("أحمد محمد العتيبي");
    assert.equal(await page.locator(".doctor-card").count(),0);
    await page.locator("#clear-search").click();
    await page.reload();
    await page.locator(".connection-banner.live").waitFor();
    assert.match(await page.locator(".connection-banner.live").innerText(),/جامعة الملك سعود/);
    assert.equal(await page.locator("#university-directory").count(),0);
    await page.locator("#open-settings").click();
    assert.equal(await page.locator('#settings-form [name=major] option').count(),1);
    await page.locator("#change-university").click();
    await page.locator('#university-search').fill('جامعة نجران');await page.locator('[data-select-university="405"]').click();
    await page.locator(".modal-backdrop").waitFor({state:"detached"});
    await page.locator('#new-review').click();
    await page.locator('#review-form [name=doctor]').fill("زياد محمد الشهري");
    await page.locator('#review-form [type=submit]').click();
    await page.getByText("وصل طلب إضافة الدكتور إلى الإدارة دون إنشاء أي تقييم.").waitFor();
    assert.ok(calls.some((call)=>call.action==='doctor.request'&&call.majorId===1&&!('scores' in call)));
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('[data-save="18"]').click();
    await page.waitForFunction(()=>!!localStorage.getItem('miyar-bookmark-times-11111111-1111-4111-8111-111111111111'));
    notifyPublished=true;
    await page.locator('#notice').click();
    await page.getByText('تقييم جديد: م. خالد محمد الحربي').waitFor();
    await page.locator('#read-notifications').click();
    await page.getByText('لا توجد تقييمات جديدة لدكاترتك المحفوظين حتى الآن.').waitFor();
    assert.equal(await page.locator('.notification-badge').count(),0);
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('[data-save="18"]').click();
    await page.locator('#search').fill('أحمد محمد العتيبي');
    await page.locator('.card-detail[data-doctor="17"]').click();
    await page.locator('#review-subject-filter').waitFor();
    assert.equal((await page.locator('.detail-person h2').innerText()).trim(),catalogue.doctors.find((doctor)=>doctor.id===17).name);
    await page.locator('#doctor-grade-map .grade-subject').waitFor();
    await page.locator('#doctor-grade-map .grade-subject').selectOption('ميكانيكا');
    await page.locator('.grade-metrics').waitFor();
    assert.match(await page.locator('.grade-metrics').innerText(),/٦٠٪/);
    assert.equal(await page.locator('.grade-distribution li').count(),5);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.locator('#doctor-grade-map').evaluate(el=>el.scrollWidth>el.clientWidth),false);
      await page.locator('#doctor-grade-map').screenshot({path:`/tmp/miyar-grade-map-${width}.png`});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#doctor-grade-map .grade-subject').selectOption('رياضيات');
    await page.locator('.grade-empty').waitFor();
    assert.equal(await page.locator('.grade-metrics').count(),0);
    assert.equal(await page.locator('.grade-distribution').count(),0);

    assert.match(await page.locator('.doctor-summary').innerText(),/إشادة بالشرح/);
    assert.match(await page.locator('.doctor-summary').innerText(),/3 تقييمات/);
    await page.locator('#share-doctor-card').click();
    await page.locator('.share-card-preview').waitFor();
    await page.waitForFunction(()=>document.querySelector('.share-card-preview').complete);
    assert.equal(await page.locator('.share-card-preview').evaluate((image)=>image.naturalWidth),1080);
    assert.equal(await page.locator('.share-card-preview').evaluate((image)=>image.naturalHeight),1350);
    const downloadPromise=page.waitForEvent('download');
    await page.locator('#download-doctor-card').click();
    const download=await downloadPromise;await download.saveAs('/tmp/miyar-doctor-share.png');
    assert.equal(fs.readFileSync('/tmp/miyar-doctor-share.png').subarray(1,4).toString(),'PNG');
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('.card-detail[data-doctor="17"]').click();
    await page.locator('#review-subject-filter').selectOption('رياضيات');
    await page.locator('#review-subject-filter').waitFor();
    assert.equal(await page.locator('#published-reviews .review-comment').count(),1);
    assert.match(await page.locator('#published-reviews').innerText(),/تجربة مادة الرياضيات/);
    await page.locator('[data-report-review="502"]').click();
    await page.locator('#report-review-form [name=reason]').selectOption('personal');
    await page.locator('#report-review-form [type=submit]').click();
    await page.getByText('وصل بلاغك إلى الإدارة لمراجعة التقييم.').waitFor();
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('#open-settings').click();await page.locator('#grade-sharing-settings').click();
    await page.locator('[data-grade-consent="501"]').waitFor();
    await page.locator('[data-grade-consent="501"]').check();
    await page.getByText('حُفظت موافقتك على المشاركة الإحصائية.').waitFor();
    assert.ok(calls.some(call=>call.action==='grade.consent'&&call.review===501&&call.shareGrade===true&&call.subject==='ميكانيكا'&&call.authorization===`Bearer ${access}`));
    await page.locator('[data-grade-more]').click();
    await page.locator('[data-grade-consent="400"]').waitFor();
    assert.equal(await page.locator('.grade-sharing-item').count(),2);
    await page.locator('[data-grade-consent="501"]').uncheck();
    await page.getByText('سُحبت الموافقة واستُبعدت الدرجة من الإحصائيات.').waitFor();
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('#open-settings').click();
    await page.locator('#my-reviews-settings').click();
    await page.locator('[data-edit-review="501"]').click();
    await page.locator("#accept-review-pledge").click();
    await page.locator('#edit-review-form [name=comment]').fill('التقييم الجديد المقترح');
    await page.locator('#edit-review-form [type=submit]').click();
    await page.getByText('وصل طلب التعديل. يبقى تقييمك القديم كما هو إلى أن توافق الإدارة على البديل.').waitFor();
    assert.equal(publicReviews[0].comment,'التقييم القديم المنشور');
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator("[data-page=admin]").click();
    await page.locator('#check-ai-connection').click();
    await page.locator('#ai-diagnostics-result[data-state=ready]').waitFor();
    assert.match(await page.locator('#ai-diagnostics-result').innerText(),/المفتاح مقبول/);
    assert.ok(calls.some((call)=>call.operation==='ai.check'&&call.authorization===`Bearer ${access}`));
    await page.locator('[data-cloud-operation="doctor.approve"]').click();
    await page.getByText("لا توجد طلبات معلّقة.").waitFor();
    await page.locator('[data-cloud-operation="edit.reject"]').click();
    await page.locator('#request-rejection-form [name=reason]').fill('يرجى توضيح التجربة بتفاصيل أكثر');
    await page.locator('#request-rejection-form [type=submit]').click();
    await page.getByText('لا توجد طلبات تعديل معلّقة.').waitFor();
    assert.equal(publicReviews[0].comment,'التقييم القديم المنشور');
    await page.locator('[data-cloud-operation="report.dismiss"]').click();
    await page.getByText('لا توجد بلاغات معلّقة.').waitFor();
    await page.locator('#open-settings').click();await page.locator('#my-reviews-settings').click();
    await page.locator('[data-edit-review="501"]').click();
    await page.locator("#accept-review-pledge").click();
    await page.locator('#edit-review-form [name=comment]').fill('التقييم البديل المعتمد');
    await page.locator('#edit-review-form [type=submit]').click();
    await page.getByText('وصل طلب التعديل. يبقى تقييمك القديم كما هو إلى أن توافق الإدارة على البديل.').waitFor();
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('#refresh-cloud-admin').click();
    await page.locator('[data-cloud-operation="edit.approve"]').click();
    await page.getByText('لا توجد طلبات تعديل معلّقة.').waitFor();
    assert.equal(publicReviews[0].comment,'التقييم البديل المعتمد');
    await page.locator('#notice').click();
    await page.locator('[data-open-requests]').first().waitFor();
    assert.match(await page.locator('.modal').innerText(),/يرجى توضيح التجربة بتفاصيل أكثر/);
    await page.locator('[data-open-requests]').first().click();
    await page.locator('.request-history-card').first().waitFor();
    assert.equal(new URL(page.url()).hash,'#requests');
    assert.equal(await page.locator('.request-history-card').count(),3);
    assert.match(await page.locator('.request-history').innerText(),/يرجى توضيح التجربة بتفاصيل أكثر/);
    await page.locator('[data-page=admin]').click();
    await page.locator('#admin-doctor-search').fill('خالد محمد الحربي');
    assert.equal(await page.locator('.admin-doctor-list .admin-row').count(),1);
    await page.locator('[data-admin-check="18"]').check();
    await page.locator('#admin-apply-bulk').click();
    await page.locator('#confirm-doctor-bulk').click();
    await page.waitForFunction(()=>document.querySelector('#admin-selected-count').textContent.includes('0'));
    assert.equal(catalogue.doctors.find((doctor)=>doctor.id===18).verified,true);
    assert.equal(await page.locator('#admin-doctor-search').inputValue(),'خالد محمد الحربي');
    await page.locator('#admin-doctor-search').fill('');
    await page.locator('[data-admin-filter="college"]').selectOption('2');
    assert.equal(await page.locator('.admin-doctor-list .admin-row').count(),1);
    assert.match(await page.locator('.admin-doctor-list').innerText(),/محمد علي السالم/);
    await page.locator('[data-admin-filter="university"]').selectOption('1');
    assert.equal(await page.locator('.admin-doctor-list .admin-row').count(),0);
    await page.locator('[data-admin-filter="university"]').selectOption('');

    const majorForm = page.locator("#cloud-add-major");
    await majorForm.locator('[name=collegeId]').selectOption("2");
    for (const name of ["الفلك", "الأحياء"]) {
      await majorForm.locator('[name=name]').fill(name);
      await majorForm.locator('button').click();
      await page.waitForFunction(() => document.querySelector('#cloud-add-major [name=name]').value === "");
      assert.equal(await majorForm.locator('[name=collegeId]').inputValue(), "2");
      assert.equal(await majorForm.locator('[name=name]').evaluate((el) => el === document.activeElement), true);
    }
    assert.ok(calls.filter((call) => call.operation === "major.add").every((call) => call.collegeId === 2));
    const collegeForm = page.locator("#cloud-add-college");
    await collegeForm.locator('[name=universityId]').selectOption("3");
    await collegeForm.locator('[name=name]').fill("كلية الطب");
    await collegeForm.locator('button').click();
    await page.waitForFunction(() => document.querySelector('#cloud-add-college [name=name]').value === "");
    assert.equal(await collegeForm.locator('[name=universityId]').inputValue(), "3");
    assert.equal(await majorForm.locator('[name=collegeId]').inputValue(), "2");
    await page.locator("#refresh-cloud-admin").click();
    await page.getByText("لا توجد طلبات معلّقة.").waitFor();
    assert.equal(await majorForm.locator('[name=collegeId]').inputValue(), "2");
    await page.reload();
    await page.locator("#cloud-add-major").waitFor();
    assert.equal(await page.locator('#cloud-add-major [name=collegeId]').inputValue(), "2");
    assert.equal(await page.locator('#cloud-add-college [name=universityId]').inputValue(), "3");
    const batch = page.locator("#bulk-doctors");
    assert.equal(await batch.evaluate((el) => getComputedStyle(el).flexDirection), "column");
    const batchBox = await batch.boundingBox();
    for (const selector of ["h3", "textarea", "select", "button"]) {
      const box = await batch.locator(selector).boundingBox();
      assert.ok(box.width > 100 && box.x >= batchBox.x && box.x + box.width <= batchBox.x + batchBox.width);
    }
    assert.equal(await batch.evaluate((el) => el.scrollWidth > el.clientWidth), false);
    await page.screenshot({ path: "/tmp/miyar-admin-desktop-fixed.png", fullPage: true });
    await batch.locator("[name=names]").fill("اسم غيرصالح");
    await batch.locator("button").click();
    assert.equal(calls.filter((c) => c.operation === "doctor.add").length, 0);
    await batch.locator("[name=names]").fill("أحمد محمد العتيبي\nسالم عبدالله القحطاني\nسالم عبدالله القحطاني\nناصر سعيد الغامدي");
    await batch.locator("button").click();
    await page.getByText(/الأسماء المتبقية محفوظة/).waitFor();
    assert.equal(await batch.locator("[name=names]").inputValue(), "ناصر سعيد الغامدي");
    await batch.locator("button").click();
    await page.waitForFunction(() => document.querySelector("#bulk-doctors [name=names]").value === "");
    assert.equal(catalogue.doctors.filter((d) => d.name === "سالم عبدالله القحطاني").length, 1);
    assert.equal(catalogue.doctors.find((d) => d.name === "ناصر سعيد الغامدي").count, 0);
    assert.ok(calls.filter((c) => c.operation === "doctor.add").every((c) => c.authorization === `Bearer ${access}` && !("scores" in c)));
    await page.locator("[data-page=ratings]").first().click();
    assert.equal(new URL(page.url()).hash, "#ratings");
    await page.reload();
    await page.getByRole("heading", { name: "دليل الدكاترة والتقييمات", exact: false }).waitFor();
    assert.equal(new URL(page.url()).hash, "#ratings");
    assert.equal(await page.locator(".directory-filters").count(), 0);
    assert.equal(await page.getByText("اكتشف دكتورك القادم", { exact: true }).count(), 0);
    assert.equal(await page.locator("#page-close").innerText(), "رجوع");
    await page.locator('[data-save="17"]').click();
    await page.locator("[data-page=saved]").click();
    assert.equal(new URL(page.url()).hash, "#saved");
    assert.equal(await page.locator(".doctor-card").count(), 1);
    await page.reload();
    await page.locator('[data-save="17"]').waitFor();
    assert.equal(await page.locator(".doctor-card").count(), 1);
    await page.locator('[data-save="17"]').click();
    assert.equal(await page.locator(".doctor-card").count(), 0);
    await page.locator("[data-page=developer]").first().click();
    assert.equal(await page.locator(".nav-item.active").innerText(), "من نحن");
    assert.ok(!(await page.locator(".dev-badges").innerText()).includes("نسخة تجريبية"));
    await page.locator("[data-university-request]").click();
    assert.equal(await page.locator('#institution-request-form').count(),1);
    await page.locator(".close-modal").click();
    await page.locator(".modal-backdrop").waitFor({ state: "detached" });
    await page.locator("#page-close").click();
    await page.locator('aside [data-page=home]').click();
    // Corrections preserve the published record until an administrator decides.
    await page.locator('#search').fill('أحمد محمد العتيبي');
    await page.locator('.card-detail[data-doctor="17"]').click();
    await page.locator('#suggest-doctor-correction').click();
    await page.locator('#doctor-correction-form [name=name]').fill('أحمد محمد العتيبي المصحح');
    await page.locator('#doctor-correction-form [name=details]').fill('تصحيح كتابة الاسم في الدليل');
    await page.locator('#doctor-correction-form [type=submit]').click();
    await page.getByRole('heading',{name:'تم استلام طلبك'}).waitFor();
    assert.equal(catalogue.doctors.find((item)=>item.id===17).name,'أحمد محمد العتيبي');
    assert.ok(calls.some((call)=>call.action==='doctor.correction'&&call.targetId===17&&call.parentId===1&&call.authorization===`Bearer ${access}`));
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('[data-page=admin]').click();
    await page.locator('[data-cloud-operation="catalogue.approve"]').click();
    await page.getByText('لا توجد مقترحات بانتظار المراجعة.').waitFor();
    assert.equal(catalogue.doctors.find((item)=>item.id===17).name,'أحمد محمد العتيبي المصحح');
    await page.locator('#assign-ambassador [name=email]').fill('student@example.test');
    await page.locator('#assign-ambassador [name=universityId]').selectOption('3');
    await page.locator('#assign-ambassador [type=submit]').click();
    await page.locator('[data-revoke-ambassador]').waitFor();
    assert.deepEqual(me.ambassadorUniversities,[3]);
    me.isAdmin=false;
    await page.reload();await page.locator('[data-page=ambassador]').waitFor();
    assert.equal(await page.locator('[data-page=admin]').count(),0);
    await page.locator('[data-page=ambassador]').click();
    assert.equal(await page.locator('#ambassador-university option').count(),1);
    assert.equal(await page.locator('#ambassador-university').inputValue(),'3');
    await page.locator('#ambassador-kind').selectOption('major.add');
    await page.locator('#ambassador-proposal-form [name=parentId]').selectOption('2');
    await page.locator('#ambassador-proposal-form [name=name]').fill('الأحياء التطبيقية');
    await page.locator('#ambassador-proposal-form [type=submit]').click();
    await page.getByRole('heading',{name:'تم استلام طلبك'}).waitFor();
    assert.ok(!catalogue.majors.some((item)=>item.name==='الأحياء التطبيقية'));
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.reload();await page.locator('#ambassador-proposal-form').waitFor();
    assert.equal(await page.locator('#ambassador-kind').inputValue(),'major.add');
    assert.equal(await page.locator('#ambassador-proposal-form [name=parentId]').inputValue(),'2');
    await page.locator('#ambassador-kind').selectOption('college.correct');
    await page.locator('#ambassador-proposal-form [name=targetId]').selectOption('1');
    assert.equal(await page.locator('#ambassador-proposal-form [name=name]').inputValue(),'كلية الهندسة');
    await page.locator('#ambassador-proposal-form [name=name]').fill('كلية الهندسة المعدلة');
    await page.locator('#ambassador-proposal-form [type=submit]').click();
    await page.getByRole('heading',{name:'تم استلام طلبك'}).waitFor();
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    for(const width of [390,768,1440]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`/tmp/miyar-ambassador-${width}.png`});
    }
    me.isAdmin=true;
    await page.reload();await page.locator('[data-page=admin]').waitFor();
    await page.locator('[data-page=admin]').click();
    await page.locator('[data-cloud-operation="catalogue.approve"]').first().waitFor();
    await page.locator('.ambassador-management').screenshot({path:'/tmp/miyar-ambassador-management.png'});
    await page.locator('.catalogue-moderation').screenshot({path:'/tmp/miyar-catalogue-moderation.png'});
    await page.locator('[data-cloud-operation="catalogue.approve"]').first().click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-cloud-operation="catalogue.approve"]').length===1);
    assert.ok(catalogue.majors.some((item)=>item.name==='الأحياء التطبيقية'));
    await page.locator('[data-cloud-operation="catalogue.reject"]').click();
    await page.locator('#request-rejection-form [name=reason]').fill('اسم الكلية الحالي مطابق للدليل');
    await page.locator('#request-rejection-form [type=submit]').click();
    await page.getByText('لا توجد مقترحات بانتظار المراجعة.').waitFor();
    assert.equal(catalogue.colleges.find((item)=>item.id===1).name,'كلية الهندسة');
    await page.locator('#open-settings').click();await page.locator('#my-requests-settings').click();
    await page.locator('.request-history-card').first().waitFor();
    assert.match(await page.locator('.request-history').innerText(),/تصحيح بيانات كلية/);
    assert.match(await page.locator('.request-history').innerText(),/اسم الكلية الحالي مطابق للدليل/);
    await page.locator('[data-page=admin]').click();
    await page.locator('[data-revoke-ambassador]').click();await page.locator('#confirm-revoke-ambassador').click();
    await page.getByText('لم تُعيّن أعضاء للفريق بعد.').waitFor();
    assert.deepEqual(me.ambassadorUniversities,[]);
    const deleteUniversity=page.locator('[data-cloud-operation="university.delete"][data-id="3"]');
    await deleteUniversity.click();assert.match(await page.locator('.modal').innerText(),/جامعة نجران/);
    const attempts=calls.filter((call)=>call.operation==='university.delete').length;
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    assert.equal(calls.filter((call)=>call.operation==='university.delete').length,attempts);
    await deleteUniversity.click();await page.locator('#confirm-cloud-delete').click();
    await page.locator('#delete-operation-error').filter({hasText:'لا يمكن حذف الجامعة'}).waitFor();
    assert.equal(await page.locator('#confirm-cloud-delete').isEnabled(),true);
    assert.ok(catalogue.universities.some((row)=>row.id===3));
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    assert.equal(await page.locator('.main-wrap').evaluate((element)=>element.inert),false);
    await page.locator('#cloud-add-university [name=name]').fill('جامعة للاختبار');
    await page.locator('#cloud-add-university button').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="الجامعات المضافة"] .admin-row')].some((row)=>row.innerText.includes('جامعة للاختبار')));
    const temporaryUniversity=catalogue.universities.find((row)=>row.name==='جامعة للاختبار');
    await page.locator(`[data-university-enable="${temporaryUniversity.id}"]`).click();await page.waitForFunction(id=>document.querySelector(`[data-university-enable="${id}"]`)?.dataset.enabled==='true',temporaryUniversity.id);
    await page.locator('#cloud-add-college [name=universityId]').selectOption(String(temporaryUniversity.id));
    await page.locator('#open-settings').click();await page.locator('#change-university').click();
    await page.locator('#university-search').fill(temporaryUniversity.name);await page.locator(`[data-select-university="custom-${temporaryUniversity.id}"]`).click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('[data-page=admin]').click();
    await page.locator(`[data-cloud-operation="university.delete"][data-id="${temporaryUniversity.id}"]`).click();
    await page.locator('#confirm-cloud-delete').click();await page.waitForFunction(()=>!document.querySelector('#confirm-cloud-delete'));await page.locator('#open-settings').click();await page.locator('#change-university').click();await page.locator('#university-directory').waitFor();
    assert.ok(!catalogue.universities.some((row)=>row.id===temporaryUniversity.id));
    assert.equal(me.university_id,null);assert.equal(me.isAdmin,true);
    assert.equal(await page.locator(`[data-select-university="custom-${temporaryUniversity.id}"]`).count(),0);
    await page.locator('#university-search').fill('جامعة نجران');await page.locator('[data-select-university="405"]').click();
    await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('[data-page=admin]').click();
    assert.equal(await page.locator(`[data-cloud-operation="university.delete"][data-id="${temporaryUniversity.id}"]`).count(),0);
    assert.notEqual(await page.locator('#cloud-add-college [name=universityId]').inputValue(),String(temporaryUniversity.id));
    await page.locator('[data-page=home]').click();
    for (const height of [900, 768, 600]) {
      await page.setViewportSize({ width: 1440, height });
      for (const selector of [".theme-toggle", ".user"]) {
        const bounds = await page.locator(selector).boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height, `${selector} must remain visible at height ${height}`);
      }
    }
    await page.locator(".theme-toggle").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator(".theme-toggle").click();
    for (const width of [768, 1024, 1180]) {
      await page.setViewportSize({ width, height: 1024 });
      assert.equal(await page.locator(".main-wrap").evaluate((el) => getComputedStyle(el).marginRight), "0px");
      assert.equal(await page.locator("aside > .brand").isVisible(), false);
      assert.equal(await page.locator(".mobile-brand").isVisible(), true);
      assert.equal(await page.locator("aside nav").evaluate((el) => getComputedStyle(el).flexDirection), "row");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/miyar-navy-tablet-${width}.png` });
    }
    assert.equal(await page.title(), "معيار");
    const greeting = await page.locator(".welcome h1").innerText();
    assert.ok(greeting.includes("سارة") && !greeting.includes("محمد"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/miyar-navy-mobile.png", fullPage: true });
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.scrollWidth > innerWidth
      ),
      false,
    );
    await page.locator("#open-settings").click();
    await page.locator("#logout").click();
    await page.locator("#confirm-logout").click();
    await page.getByRole("heading", { name: "تم تسجيل خروجك" }).waitFor();
    assert.ok(
      calls.some((c) =>
        c.action === "logout" && c.authorization === `Bearer ${access}`
      ),
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("sb-bbnsorjxgehvoddluvyo-auth-token")
      ),
      null,
    );
    await page.reload();
    await page.getByRole("heading", { name: "تم تسجيل خروجك" }).waitFor();
    await page.locator("#browse-guest").click();
    assert.equal(await page.locator("[data-page=admin]").count(), 0);
    fail = true;
    await page.reload();
    await page.locator(".connection-banner.error").waitFor();
    assert.equal(await page.locator(".doctor-card").count(), 0);
    fail = false;
    await page.locator("#retry-cloud").click();
    await page.locator(".connection-banner.live").waitFor();
    assert.equal(
      await page.locator(".doctor-card").count(),
      Math.min(10, catalogue.doctors.filter((doctor) => doctor.count > 0).length),
    );
    await page.goto("about:blank");
    await page.goto(url + "#error=access_denied&error_description=cancelled");
    await page.getByText("تعذّر إكمال تسجيل الدخول باستخدام Google. حاول مجددًا.")
      .waitFor();
    assert.equal(await page.locator('script[src*="telegram"]').count(), 0);
    const manifest=await page.evaluate(async()=>await (await fetch(new URL(document.querySelector('link[rel=manifest]').href))).json());
    assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'معيار');
    assert.ok(manifest.icons.some((icon)=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const cacheKeys=await page.evaluate(async()=>{const keys=await caches.keys();const urls=[];for(const key of keys){const cache=await caches.open(key);urls.push(...(await cache.keys()).map((request)=>request.url));}return urls;});
    assert.ok(!cacheKeys.some((url)=>url.includes('supabase.co')||url.includes('code=')||url.includes('error=')));
    await context.setOffline(true);await page.reload();
    await page.getByRole('heading',{name:'أنت غير متصل بالإنترنت'}).waitFor();
    await context.setOffline(false);await page.reload();
    await page.locator('.connection-banner.live').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Opt-in grade maps and same-course comparisons, hidden small samples, guest/account consent and withdrawal, pagination, responsive grade charts; AI availability gating, grounded chat UI with citations, escaped model output, guest session binding and quota error recovery, Scoped ambassador assignment/revocation, proposal moderation and persistence, student data corrections and history, responsive ambassador workspace, Guest rating without Google, mandatory pledge, optional comments/tags, live server presence and semester, grounded summaries, request decisions/reasons and notifications, admin filters and atomic bulk controls, PNG sharing export, PWA manifest/offline safety, primary action order, comparison limits/table, subject filters, report submission/moderation, edit rejection/approval preserving old content, saved publication alerts, unified optional doctor additions, SVG decoration, admin selection persistence, dedicated page navigation, modal blur and inert background, batch import validation/deduplication/partial retry without reviews, college/major filtering, RTL carousel controls, mobile illustration, simplified account header, slider endpoints/colors, Google PKCE login, protected API, profile persistence, logout and outage/retry. Auth and API network mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
