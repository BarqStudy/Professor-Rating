import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  ApiError,
  validateReview,
  verifyTelegram,
} from "../supabase/functions/miyar/security.js";
import { createHandler } from "../supabase/functions/miyar/handler.js";
import { createDatabase } from "../supabase/functions/miyar/database.js";

const token = "test-bot-token-not-a-real-credential";
function signed(id = 123, extra = {}) {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: "طالب", username: "student" }),
    ...extra,
  });
  const data = [...p.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", createHmac("sha256", secret).update(data).digest("hex"));
  return p.toString();
}
const review = {
  college: "كلية الهندسة",
  major: "الهندسة المدنية",
  name: "أحمد محمد العتيبي",
  subject: "الإنشاءات",
  grade: 92,
  scores: [90, 80, 70],
  comment: "تجربة مفيدة وشرح واضح",
};
const env = {
  TELEGRAM_BOT_TOKEN: token,
  ADMIN_TELEGRAM_IDS: "999",
  ALLOWED_ORIGINS: "https://barqstudy.github.io",
};
function request(body, origin = "https://barqstudy.github.io") {
  return new Request("https://test.supabase.co/functions/v1/miyar", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
function userDb(status = "active", calls = []) {
  return async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path.startsWith("miyar_users?")) {
      return [{
        telegram_id: 123,
        name: "طالب",
        major_id: null,
        level: null,
        status,
      }];
    }
    if (path === "rpc/miyar_submit_review") return { id: 8, status: "pending" };
    return [];
  };
}

test("Telegram HMAC accepts a valid signed identity", async () => {
  assert.equal((await verifyTelegram(signed(), token)).id, 123);
});
test("forged identity, duplicate fields, expired and future signatures fail", async () => {
  await assert.rejects(
    verifyTelegram(signed().replace("student", "admin"), token),
    { status: 401 },
  );
  await assert.rejects(verifyTelegram(signed() + "&auth_date=1", token), {
    status: 401,
  });
  await assert.rejects(
    verifyTelegram(
      signed(123, { auth_date: String(Math.floor(Date.now() / 1000) - 3601) }),
      token,
    ),
    { status: 401 },
  );
  await assert.rejects(
    verifyTelegram(
      signed(123, { auth_date: String(Math.floor(Date.now() / 1000) + 60) }),
      token,
    ),
    { status: 401 },
  );
  await assert.rejects(verifyTelegram(signed(-1), token), { status: 401 });
  await assert.rejects(verifyTelegram("", token), { status: 401 });
});
test("review validation checks integer grades, all sliders, names, obscured abuse and personal contacts", () => {
  assert.deepEqual(validateReview(review).scores, [90, 80, 70]);
  for (
    const changed of [
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
  ) assert.throws(() => validateReview({ ...review, ...changed }), ApiError);
});
test("anonymous submissions and forged client admin roles do not touch protected operations", async () => {
  const calls = [];
  const handle = createHandler({ db: userDb("active", calls), env });
  let r = await handle(
    request({ action: "submit", ...review, userId: 999, isAdmin: true }),
  );
  assert.equal(r.status, 401);
  assert.equal(calls.length, 0);
  r = await handle(
    request({
      action: "admin",
      operation: "college.delete",
      id: 1,
      initData: signed(),
      isAdmin: true,
    }),
  );
  assert.equal(r.status, 403);
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
});
test("banned and restricted users cannot submit, including forged statuses", async () => {
  for (const status of ["banned", "restricted"]) {
    let writes = 0;
    const db = userDb(status);
    const handle = createHandler({
      env,
      db: async (p, o) => {
        if (p.startsWith("rpc/")) writes++;
        return db(p, o);
      },
    });
    const r = await handle(
      request({
        action: "submit",
        ...review,
        initData: signed(),
        status: "active",
      }),
    );
    assert.equal(r.status, 403);
    assert.equal(writes, 0);
  }
});
test("authenticated submissions bind the verified user ID, ignore moderation fields and stay pending", async () => {
  const calls = [];
  const handle = createHandler({ db: userDb("active", calls), env });
  const r = await handle(
    request({
      action: "submit",
      ...review,
      initData: signed(),
      userId: 999,
      status: "published",
    }),
  );
  assert.equal(r.status, 201);
  assert.equal((await r.json()).status, "pending");
  const call = calls.find((c) => c.path === "rpc/miyar_submit_review");
  assert.equal(call.body.p_user, 123);
  assert.equal(call.body.p_grade, 92);
  assert.ok(!("status" in call.body));
});
test("public review response removes identity and grade even if database adapter returns them", async () => {
  const handle = createHandler({
    env,
    db: async (path) =>
      path.startsWith("miyar_doctors") ? [{ id: 1 }] : [{
        id: 1,
        subject: "مادة",
        comment: "تجربة مفيدة",
        explanation: 90,
        treatment: 80,
        grading: 70,
        created_at: "2026-10-24",
        user_id: 123,
        grade: 92,
      }],
  });
  const r = await handle(request({ action: "reviews", doctor: 1 }));
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(!JSON.stringify(data).includes("user_id"));
  assert.ok(!JSON.stringify(data).includes("grade"));
  assert.equal(data[0].scores[0], 90);
});
test("only allowlisted admins can moderate; review approval requires an approved doctor", async () => {
  const calls = [];
  const handle = createHandler({
    env,
    db: async (path, options) => {
      calls.push({ path, ...options });
      if (path.startsWith("miyar_users")) {
        return [{ status: "active", name: "مدير" }];
      }
      if (path.startsWith("miyar_reviews")) {
        return [{ id: 1, doctor_id: 2, comment: "مفيد" }];
      }
      return [];
    },
  });
  const r = await handle(
    request({
      action: "admin",
      operation: "review.approve",
      id: 1,
      initData: signed(999),
    }),
  );
  assert.equal(r.status, 409);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
});
test("untrusted origins, oversized requests and raw database errors are rejected safely", async () => {
  const handle = createHandler({ db: userDb(), env });
  assert.equal(
    (await handle(request({ action: "catalogue" }, "https://attacker.test")))
      .status,
    403,
  );
  assert.equal(
    (await handle(request({ action: "catalogue", padding: "x".repeat(17000) })))
      .status,
    413,
  );
  const db = createDatabase(
    "https://test.supabase.co",
    "not-a-real-key",
    async () =>
      new Response(JSON.stringify({ message: "secret database internals" }), {
        status: 500,
      }),
  );
  await assert.rejects(
    db("test"),
    (e) => e.status === 502 && !e.message.includes("secret"),
  );
});

test("admin moderation response omits private grade, including unexpected adapter fields", async () => {
  const handle = createHandler({
    env,
    db: async (path) => {
      if (path.startsWith("miyar_users")) {
        return [{ status: "active", name: "مدير" }];
      }
      if (path.startsWith("miyar_doctors")) {
        return [{
          id: 1,
          name: "أحمد محمد العتيبي",
          major_id: 1,
          submitted_by: 123,
          grade: 92,
        }];
      }
      return [{
        id: 2,
        doctor_id: 1,
        user_id: 123,
        subject: "مادة",
        comment: "مفيد",
        explanation: 80,
        treatment: 70,
        grading: 60,
        grade: 92,
      }];
    },
  });
  const response = await handle(
    request({ action: "admin", operation: "queue", initData: signed(999) }),
  );
  assert.equal(response.status, 200);
  const queue = await response.json();
  assert.ok(!("grade" in queue.reviews[0]));
  assert.ok(!("grade" in queue.doctors[0]));
  assert.equal(queue.reviews[0].user_id, 123);
});
