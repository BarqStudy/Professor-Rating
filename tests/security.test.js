import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  uuid,
  validateReview,
} from "../supabase/functions/miyar/security.js";
import { createGoogleVerifier } from "../supabase/functions/miyar/auth.js";
import { createHandler } from "../supabase/functions/miyar/handler.js";
import { createDatabase } from "../supabase/functions/miyar/database.js";
const member = "11111111-1111-4111-8111-111111111111",
  admin = "99999999-9999-4999-8999-999999999999";
const token = (id, method = "oauth") =>
  `header.${
    Buffer.from(JSON.stringify({ sub: id, amr: [{ method }] })).toString(
      "base64url",
    )
  }.test-signature`;
const memberToken = token(member), adminToken = token(admin);
const googleUser = (id) => ({
  id,
  email_confirmed_at: "2026-10-24",
  app_metadata: { provider: "google", providers: ["google"] },
  identities: [{ provider: "google" }],
  user_metadata: { full_name: "طالب" },
});
const verify = createGoogleVerifier(
  "https://test.supabase.co",
  "test-service-key",
  async (url, options) => {
    const access = options.headers.Authorization.slice(7);
    if (![memberToken, adminToken].includes(access)) {
      return new Response(
        "{}",
        { status: 401 },
      );
    }
    return Response.json(googleUser(access === adminToken ? admin : member));
  },
);
const env = {
  ADMIN_AUTH_IDS: admin,
  ALLOWED_ORIGINS: "https://barqstudy.github.io",
};
const review = {
  pledged: true,
  college: "كلية الهندسة",
  major: "الهندسة المدنية",
  name: "أحمد محمد العتيبي",
  subject: "ميكانيكا",
  grade: 92,
  scores: [90, 80, 70],
  comment: "شرح واضح وتجربة مفيدة",
};
function request(body, access = "", origin = "https://barqstudy.github.io") {
  return new Request("https://test.supabase.co/functions/v1/miyar", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
function userDb(status = "active", calls = []) {
  return async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path.startsWith("miyar_accounts")) {
      return [{
        auth_id: member,
        name: "طالب",
        status,
        university_id: 3,
        major_id: null,
        level: null,
      }];
    }
    if (path === "rpc/miyar_submit_google_review") {
      return { id: 8, status: "pending" };
    }
    return [];
  };
}
const handler = (db = userDb()) =>
  createHandler({ db, env, authenticate: verify });

test("Google identity is obtained from Supabase Auth for the exact bearer token", async () => {
  let observed;
  const verifier = createGoogleVerifier(
    "https://test.supabase.co",
    "test-service-key",
    async (url, options) => {
      observed = { url, options };
      return Response.json(googleUser(member));
    },
  );
  assert.equal((await verifier(request({}, memberToken))).id, member);
  assert.equal(observed.url, "https://test.supabase.co/auth/v1/user");
  assert.equal(observed.options.headers.Authorization, `Bearer ${memberToken}`);
  assert.equal(observed.options.headers.apikey, "test-service-key");
});
test("missing, forged and expired tokens fail before any database access", async () => {
  const calls = [];
  const handle = handler(userDb("active", calls));
  for (const access of ["", "forged.jwt.token", "expired-token"]) {
    const response = await handle(
      request({
        action: "submit",
        ...review,
        userId: admin,
        isAdmin: true,
        initData: "legacy-input",
      }, access),
    );
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0);
});
test("only verified Google OAuth identities are accepted, including rejection of password-linked sessions", async () => {
  for (
    const user of [
      {
        ...googleUser(member),
        app_metadata: { provider: "email", providers: ["email"] },
      },
      { ...googleUser(member), identities: [{ provider: "email" }] },
      { ...googleUser(member), email_confirmed_at: null },
      { ...googleUser(member), is_anonymous: true },
    ]
  ) {
    const verifier = createGoogleVerifier(
      "https://test.supabase.co",
      "key",
      async () => Response.json(user),
    );
    await assert.rejects(verifier(request({}, memberToken)), { status: 403 });
  }
  const verifier = createGoogleVerifier(
    "https://test.supabase.co",
    "key",
    async () => Response.json(googleUser(member)),
  );
  await assert.rejects(verifier(request({}, token(member, "password"))), {
    status: 403,
  });
  await assert.rejects(verifier(request({}, token(admin))), { status: 403 });
});
test("review validation rejects noninteger grades, malformed sliders, abuse and contact details", () => {
  assert.deepEqual(validateReview(review).scores, [90, 80, 70]);
  for (
    const fields of [
      { grade: 101 },
      { grade: "90" },
      { scores: [80, 90] },
      { scores: [90.5, 20, 30] },
      { name: "أحمد محمد" },
      { comment: "غَــبِي" },
      { comment: "راسلني @student_name" },
      { comment: "اتصل على 0501234567" },
      { comment: "https://example.com" },
    ]
  ) assert.throws(() => validateReview({ ...review, ...fields }), ApiError);
  assert.throws(() => uuid("123"), ApiError);
});
test("client admin flags and forged account IDs cannot grant administrative privileges", async () => {
  const calls = [];
  const response = await handler(userDb("active", calls))(
    request({
      action: "admin",
      operation: "college.delete",
      id: 1,
      userId: admin,
      isAdmin: true,
    }, memberToken),
  );
  assert.equal(response.status, 403);
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
});
test("banned and restricted users cannot submit despite a valid Google token", async () => {
  for (const status of ["banned", "restricted"]) {
    const calls = [];
    const response = await handler(userDb(status, calls))(
      request({ action: "submit", ...review, status: "active" }, memberToken),
    );
    assert.equal(response.status, 403);
    assert.equal(
      calls.filter((c) => c.path === "rpc/miyar_submit_google_review").length,
      0,
    );
  }
});
test("submissions bind the verified account UUID and cannot select published status", async () => {
  const calls = [];
  const response = await handler(userDb("active", calls))(
    request(
      { action: "submit", ...review, userId: admin, status: "published" },
      memberToken,
    ),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, "pending");
  const call = calls.find((c) => c.path === "rpc/miyar_submit_google_review");
  assert.equal(call.body.p_account, member);
  assert.equal(call.body.p_grade, 92);
  assert.ok(!("status" in call.body));
});
test("public reviews exclude private identity and grade fields", async () => {
  const handle = handler(async (path) =>
    path.startsWith("miyar_doctors") ? [{ id: 1 }] : [{
      id: 1,
      subject: "مادة",
      comment: "مفيد",
      explanation: 90,
      treatment: 80,
      grading: 70,
      created_at: "2026-10-24",
      account_id: member,
      grade: 92,
    }]
  );
  const response = await handle(request({ action: "reviews", doctor: 1 }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(!JSON.stringify(data).includes(member));
  assert.ok(!("grade" in data[0]));
  assert.deepEqual(data[0].scores, [90, 80, 70]);
});
test("admin queue excludes private grades, and pending doctors cannot have their reviews published", async () => {
  const calls = [];
  const handle = handler(async (path, options) => {
    calls.push({ path, ...options });
    if (path.startsWith("miyar_accounts")) {
      return [{ status: "active", name: "مدير" }];
    }
    if (path.startsWith("miyar_reviews")) {
      return [{
        id: 2,
        doctor_id: 1,
        account_id: member,
        grade: 92,
        comment: "مفيد",
      }];
    }
    if (path.includes("status=eq.pending")) {
      return [{
        id: 1,
        name: "أحمد محمد العتيبي",
        major_id: 1,
        submitted_by_account: member,
        grade: 92,
      }];
    }
    return [];
  });
  let response = await handle(
    request({ action: "admin", operation: "queue" }, adminToken),
  );
  assert.equal(response.status, 200);
  const queue = await response.json();
  assert.ok(!("grade" in queue.reviews[0]));
  assert.ok(!("grade" in queue.doctors[0]));
  assert.equal(queue.reviews[0].user_id, member);
  assert.equal(queue.doctors[0].submitted_by, member);
  response = await handle(
    request(
      { action: "admin", operation: "review.approve", id: 2 },
      adminToken,
    ),
  );
  assert.equal(response.status, 409);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
});
test("admin user management requires a UUID and cannot restrict another admin", async () => {
  let response = await handler()(
    request({
      action: "admin",
      operation: "user.status",
      userId: admin,
      status: "banned",
    }, adminToken),
  );
  assert.equal(response.status, 400);
  response = await handler()(
    request({
      action: "admin",
      operation: "user.status",
      userId: "123",
      status: "banned",
    }, adminToken),
  );
  assert.equal(response.status, 400);
});
test("bad origins, oversized bodies, auth outages and database internals fail safely", async () => {
  const handle = handler();
  assert.equal(
    (await handle(
      request({ action: "catalogue" }, "", "https://attacker.test"),
    )).status,
    403,
  );
  assert.equal(
    (await handle(request({ action: "catalogue", padding: "x".repeat(17000) })))
      .status,
    413,
  );
  const verifier = createGoogleVerifier(
    "https://test.supabase.co",
    "key",
    async () => {
      throw new Error("private internals");
    },
  );
  await assert.rejects(
    verifier(request({}, memberToken)),
    (e) => e.status === 503 && !e.message.includes("internals"),
  );
  const db = createDatabase(
    "https://test.supabase.co",
    "test-key",
    async () =>
      Response.json({ message: "private internals" }, { status: 500 }),
  );
  await assert.rejects(
    db("test"),
    (e) => e.status === 502 && !e.message.includes("internals"),
  );
});
