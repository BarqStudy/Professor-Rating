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
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".otf": "font/otf",
};
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, "http://test").pathname)
    .replace(/^\/Professor-Rating\//, "");
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
  const url = `http://127.0.0.1:${server.address().port}/Professor-Rating/`;
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
    let googleEnabled = false,
      fail = false,
      me = {
        id: member,
        name: "سارة",
        major_id: 1,
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
          if (body.action === "reviews") result = [];
          if (body.action === "profile") {
            me = {
              ...me,
              name: body.name,
              major_id: body.majorId,
              level: body.level,
            };
          }
          if (body.action === "submit") result = { id: 8, status: "pending" };
          if (body.operation === "queue") result = { doctors: [], reviews: [] };
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
    await page.locator("#new-review").click();
    await page.locator("#google-signin").waitFor();
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
    await page.getByRole("heading", { level: 1 }).filter({ hasText: "سارة" })
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.has("code"), false);
    assert.ok(
      calls.some((c) =>
        c.action === "exchange" && c.auth_code === "mock-authorization-code" &&
        c.code_verifier
      ),
    );
    assert.equal(await page.locator("[data-page=admin]").count(), 1);
    await page.locator("#new-review").click();
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
    await page.locator("#settings-form [name=name]").fill("سارة محمد");
    await page.locator(".settings-save").click();
    await page.locator(".modal-backdrop").waitFor({ state: "detached" });
    await page.reload();
    await page.getByRole("heading", { level: 1 }).filter({
      hasText: "سارة محمد",
    }).waitFor();
    await page.locator("[data-page=admin]").click();
    await page.getByText("لا توجد طلبات معلّقة.").waitFor();
    await page.locator("#page-close").click();
    await page.setViewportSize({ width: 390, height: 844 });
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
    assert.equal(await page.locator(".doctor-card").count(), 1);
    await page.goto("about:blank");
    await page.goto(url + "#error=access_denied&error_description=cancelled");
    await page.getByText("تعذّر إكمال تسجيل الدخول باستخدام Google. حاول مجددًا.")
      .waitFor();
    assert.equal(await page.locator('script[src*="telegram"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Google-only visitor gate, disabled-provider feedback, PKCE redirect/callback, signed API requests, cloud profile persistence, admin verification, real SDK logout, mobile layout and outage/retry. Auth and API network mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
