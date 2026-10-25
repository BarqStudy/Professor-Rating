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
  universities: [{id:1,name:"جامعة الملك سعود",city:"الرياض"},{id:2,name:"جامعة الملك خالد",city:"أبها"},{id:3,name:"جامعة نجران",city:"نجران"}],
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
    name: "خالد محمد الحربي",
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
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], calls = [];
    const publicReviews=[{id:501,subject:"ميكانيكا",comment:"التقييم القديم المنشور",scores:[80,80,80],date:new Date().toISOString()},{id:502,subject:"رياضيات",comment:"تجربة مادة الرياضيات",scores:[90,90,90],date:new Date().toISOString()}];
    const own={id:501,doctor_id:17,doctor_name:"أحمد محمد العتيبي",subject:"ميكانيكا",comment:"التقييم القديم المنشور",explanation:80,treatment:80,grading:80,status:"published",edit_status:null};
    let pendingEdits=[], pendingReports=[], notifyPublished=false;
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
          });
          let result = { ok: true };
          if (body.action === "catalogue") result = catalogue;
          if (body.action === "me") result = me;
          if (body.action === "reviews") result = body.doctor===17 ? publicReviews.filter((row)=>!body.subject||row.subject===body.subject) : [];
          if (body.action === "mine") result=[own];
          if (body.action === "notifications") result=notifyPublished&&body.doctors.includes(18)?[{review_id:601,doctor_id:18,doctor_name:"خالد محمد الحربي",published_at:new Date(Date.now()+10000).toISOString()}]:[];
          if (body.action === "doctor.request") result={id:55,status:"pending",existing:false};
          if (body.action === "report") { pendingReports.push({id:701,review_id:body.review,reason:body.reason,details:body.details,doctor_name:own.doctor_name,subject:"رياضيات",comment:"تجربة مادة الرياضيات"});result={id:701,status:"pending"}; }
          if (body.action === "edit") {
            pendingEdits.push({id:801,review_id:body.review,doctor_name:own.doctor_name,old_subject:own.subject,old_comment:own.comment,old_explanation:own.explanation,old_treatment:own.treatment,old_grading:own.grading,subject:body.subject,comment:body.comment,explanation:body.scores[0],treatment:body.scores[1],grading:body.scores[2]});
            own.edit_status="pending";result={id:801,status:"pending"};
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
          if (body.operation === "doctor.add") {
            if (body.name === "ناصر سعيد الغامدي" && failBulk) {
              failBulk = false;
              return route.fulfill({ status: 503, json: { error: "انقطاع تجريبي" } });
            }
            catalogue.doctors.push({ ...catalogue.doctors[0], id: 100 + catalogue.doctors.length, name: body.name, major_id: body.majorId });
          }
          if (body.operation === "queue") result = { doctors: [], reviews: [], edits:pendingEdits, reports:pendingReports };
          return route.fulfill({ json: result });
        }
        return route.fulfill({
          status: 404,
          json: { error: "Unexpected mock endpoint" },
        });
      },
    );
    await page.goto(url);
    await page.locator(".connection-banner.live").waitFor();
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
    assert.equal(await page.locator(".action-decoration svg").count(),1);
    assert.ok(!(await page.locator(".action-decoration").innerText()).includes("✳"));
    assert.equal(await page.locator("[data-college]").count(), 0);
    assert.equal(await page.locator(".doctor-card").count(), 3);
    assert.deepEqual(await page.locator(".doctor-card .doctor-name [data-doctor]").evaluateAll((buttons) => buttons.map((button) => Number(button.dataset.doctor))), [20, 19, 18]);
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
    const email = page.locator('.university-request a[href^="mailto:"]');
    assert.match(await email.getAttribute("href"), /^mailto:info@miyar\.website/);
    assert.equal(await page.locator(".stats + .university-request").count(),1);
    for(const id of [20,19,18]) await page.locator(`[data-compare="${id}"]`).click();
    await page.locator("#compare-now").click();
    assert.equal(await page.locator(".comparison-table thead th").count(),4);
    assert.match(await page.locator(".comparison-table").innerText(),/المساعدة بالدرجات/);
    await page.locator(".close-modal").click();
    await page.locator(".modal-backdrop").waitFor({state:"detached"});
    await page.locator("#compare-clear").click();
    await page.locator("[data-page=ratings]").first().click();
    assert.equal(await page.locator("[data-college]").count(), 2);
    assert.equal(await page.locator("[data-major]").count(), 3);
    assert.equal(await page.locator(".doctor-card").count(), 4);
    await page.locator('[data-college="كلية الهندسة"]').click();
    assert.equal(await page.locator(".doctor-card").count(), 4);
    for(const id of [17,18,19,21]) await page.locator(`[data-compare="${id}"]`).click();
    assert.equal(await page.locator('[data-compare][aria-pressed="true"]').count(),3);
    await page.locator("#compare-clear").click();
    assert.equal(await page.locator('[data-major="الفيزياء"]').count(), 0);
    await page.locator('[data-major="الهندسة الكهربائية"]').click();
    assert.equal(await page.locator(".doctor-card").count(), 1);
    assert.match(
      await page.locator(".doctor-card").innerText(),
      /عبدالله سعد القحطاني/,
    );
    await page.locator('[data-college="كلية العلوم"]').click();
    assert.equal(await page.locator(".doctor-card").count(), 1);
    assert.equal(
      await page.locator('[data-major="الهندسة المدنية"]').count(),
      0,
    );
    await page.locator('[data-college="كلية الهندسة"]').click();
    assert.equal(
      await page.locator('[data-major="الكل"]').getAttribute("aria-pressed"),
      "true",
    );
    await page.waitForFunction(() =>
      !document.querySelector("#doctors-next").disabled
    );
    await page.locator("#doctors-next").click();
    await page.waitForFunction(() =>
      Math.abs(document.querySelector("#doctor-grid").scrollLeft) > 20
    );
    await page.locator("#doctors-previous").click();
    await page.waitForFunction(() =>
      document.querySelector("#doctors-previous").disabled
    );
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
    await page.locator("#google-signin").waitFor();
    await page.locator("#google-signin").click();
    await page.getByText("تسجيل الدخول باستخدام Google لم يُفعّل بعد. جرّب لاحقًا.")
      .waitFor();
    assert.equal(page.url(), url + "#review");
    googleEnabled = true;
    await page.locator("#google-signin").click();
    await page.waitForURL("**/auth/v1/authorize?**");
    const oauth = new URL(page.url());
    assert.equal(oauth.searchParams.get("provider"), "google");
    assert.equal(oauth.searchParams.get("redirect_to"), url);
    assert.equal(oauth.searchParams.get("code_challenge_method"), "s256");
    assert.ok(oauth.searchParams.get("code_challenge"));
    await page.goto(url + "?code=mock-authorization-code");
    await page.getByRole("heading", { level: 1 }).filter({ hasText: "سارة" })
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.has("code"), false);
    assert.ok(
      calls.some((c) =>
        c.action === "exchange" && c.auth_code === "mock-authorization-code" &&
        c.code_verifier
      ),
    );
    await page.locator("#university-choice").waitFor();
    assert.equal(await page.locator(".mandatory-university .close-modal").count(), 0);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#university-choice").isVisible(), true);
    await page.reload();
    await page.locator("#university-choice").waitFor();
    await page.locator('#university-choice select').selectOption("3");
    await page.locator('#university-choice button').click();
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

    assert.equal(new URL(page.url()).hash, "#review");
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
    await page.locator("#open-settings").click();
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
    await page.locator('#university-choice select').selectOption("1");
    await page.locator('#university-choice button').click();
    await page.locator(".modal-backdrop").waitFor({state:"detached"});
    assert.equal(await page.locator(".doctor-card").count(),0);
    assert.match(await page.locator("#doctor-grid").innerText(), /لم تُضف كليات جامعتك/);
    await page.locator("#search").fill("أحمد محمد العتيبي");
    assert.equal(await page.locator(".doctor-card").count(),0);
    await page.locator("#clear-search").click();
    await page.reload();
    await page.locator(".connection-banner.live").waitFor();
    assert.match(await page.locator(".connection-banner.live").innerText(),/جامعة الملك سعود/);
    assert.equal(await page.locator("#university-choice").count(),0);
    await page.locator("#open-settings").click();
    assert.equal(await page.locator('#settings-form [name=major] option').count(),1);
    await page.locator("#change-university").click();
    await page.locator('#university-choice select').selectOption("3");
    await page.locator('#university-choice button').click();
    await page.locator(".modal-backdrop").waitFor({state:"detached"});
    await page.locator('[data-request-doctor]').click();
    await page.locator('#doctor-request-form [name=name]').fill("زياد محمد الشهري");
    await page.locator('#doctor-request-form [type=submit]').click();
    await page.getByText("وصل طلب إضافة الدكتور إلى الإدارة دون إنشاء أي تقييم.").waitFor();
    assert.ok(calls.some((call)=>call.action==='doctor.request'&&call.majorId===1&&!('scores' in call)));
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('[data-save="18"]').click();
    await page.waitForFunction(()=>!!localStorage.getItem('miyar-bookmark-times-11111111-1111-4111-8111-111111111111'));
    notifyPublished=true;
    await page.locator('#notice').click();
    await page.getByText('تقييم جديد للدكتور خالد محمد الحربي').waitFor();
    await page.locator('#read-notifications').click();
    await page.getByText('لا توجد تقييمات جديدة لدكاترتك المحفوظين حتى الآن.').waitFor();
    assert.equal(await page.locator('.notification-badge').count(),0);
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('[data-save="18"]').click();
    await page.locator('#search').fill('أحمد محمد العتيبي');
    await page.locator('.card-detail[data-doctor="17"]').click();
    await page.locator('#review-subject-filter').waitFor();
    await page.locator('#review-subject-filter').selectOption('رياضيات');
    await page.locator('#review-subject-filter').waitFor();
    assert.equal(await page.locator('#published-reviews .review-comment').count(),1);
    assert.match(await page.locator('#published-reviews').innerText(),/تجربة مادة الرياضيات/);
    await page.locator('[data-report-review="502"]').click();
    await page.locator('#report-review-form [name=reason]').selectOption('personal');
    await page.locator('#report-review-form [type=submit]').click();
    await page.getByText('وصل بلاغك إلى الإدارة لمراجعة التقييم.').waitFor();
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('#open-settings').click();
    await page.locator('#my-reviews-settings').click();
    await page.locator('[data-edit-review="501"]').click();
    await page.locator('#edit-review-form [name=comment]').fill('التقييم الجديد المقترح');
    await page.locator('#edit-review-form [type=submit]').click();
    await page.getByText('وصل طلب التعديل. يبقى تقييمك القديم كما هو إلى أن توافق الإدارة على البديل.').waitFor();
    assert.equal(publicReviews[0].comment,'التقييم القديم المنشور');
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator("[data-page=admin]").click();
    await page.getByText("لا توجد طلبات معلّقة.").waitFor();
    await page.locator('[data-cloud-operation="edit.reject"]').click();
    await page.getByText('لا توجد طلبات تعديل معلّقة.').waitFor();
    assert.equal(publicReviews[0].comment,'التقييم القديم المنشور');
    await page.locator('[data-cloud-operation="report.dismiss"]').click();
    await page.getByText('لا توجد بلاغات معلّقة.').waitFor();
    await page.locator('#open-settings').click();await page.locator('#my-reviews-settings').click();
    await page.locator('[data-edit-review="501"]').click();
    await page.locator('#edit-review-form [name=comment]').fill('التقييم البديل المعتمد');
    await page.locator('#edit-review-form [type=submit]').click();
    await page.getByText('وصل طلب التعديل. يبقى تقييمك القديم كما هو إلى أن توافق الإدارة على البديل.').waitFor();
    await page.locator('.close-modal').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
    await page.locator('#refresh-cloud-admin').click();
    await page.locator('[data-cloud-operation="edit.approve"]').click();
    await page.getByText('لا توجد طلبات تعديل معلّقة.').waitFor();
    assert.equal(publicReviews[0].comment,'التقييم البديل المعتمد');
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
    assert.match(await page.locator('.modal a[href^="mailto:"]').getAttribute("href"), /^mailto:info@miyar\.website/);
    await page.locator(".close-modal").click();
    await page.locator(".modal-backdrop").waitFor({ state: "detached" });
    await page.locator("#page-close").click();
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
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Comparison limits/table, subject filters, report submission/moderation, edit rejection/approval preserving old content, saved publication alerts, independent doctor requests, SVG decoration, admin selection persistence, dedicated page navigation, modal blur and inert background, batch import validation/deduplication/partial retry without reviews, college/major filtering, RTL carousel controls, mobile illustration, simplified account header, slider endpoints/colors, Google PKCE login, protected API, profile persistence, logout and outage/retry. Auth and API network mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
