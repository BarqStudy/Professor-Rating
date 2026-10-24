const encoder = new TextEncoder();
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function hmac(key, data) {
  const imported = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, encoder.encode(data)),
  );
}
export async function verifyTelegram(
  initData,
  botToken,
  now = Math.floor(Date.now() / 1000),
) {
  if (!botToken) throw new ApiError(503, "لم يكتمل إعداد تسجيل الدخول.");
  if (typeof initData !== "string" || !initData || initData.length > 8192) {
    throw new ApiError(401, "افتح مِعيار من داخل بوت تيليجرام.");
  }
  const params = new URLSearchParams(initData);
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key)) throw new ApiError(401, "بيانات دخول غير صالحة.");
    seen.add(key);
  }
  const hash = params.get("hash");
  if (!/^[a-f\d]{64}$/i.test(hash || "")) {
    throw new ApiError(401, "بيانات دخول غير صالحة.");
  }
  params.delete("hash");
  const data = [...params.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  ).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac("WebAppData", botToken);
  const expected = await hmac(secret, data);
  let difference = 0;
  for (let i = 0; i < 32; i++) {
    difference |= expected[i] ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16);
  }
  if (difference !== 0) {
    throw new ApiError(401, "تعذّر التحقق من حساب تيليجرام.");
  }
  const date = Number(params.get("auth_date"));
  if (
    !Number.isInteger(date) || date <= 0 || date > now + 30 || now - date > 3600
  ) throw new ApiError(401, "انتهت جلسة الدخول؛ أغلق الميني آب وافتحه مجددًا.");
  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch { /* Reject below. */ }
  if (
    !user || !Number.isSafeInteger(user.id) || user.id <= 0 ||
    typeof user.first_name !== "string"
  ) throw new ApiError(401, "بيانات المستخدم غير صالحة.");
  return {
    id: user.id,
    name: user.first_name.slice(0, 60),
    username: typeof user.username === "string"
      ? user.username.slice(0, 64)
      : null,
  };
}
export function text(value, min, max, label) {
  if (typeof value !== "string") throw new ApiError(400, `تحقق من ${label}.`);
  const clean = value.normalize("NFKC").replace(
    /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
    "",
  ).trim().replace(/\s+/g, " ");
  if (clean.length < min || clean.length > max) {
    throw new ApiError(400, `تحقق من ${label}.`);
  }
  return clean;
}
export function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ApiError(400, `تحقق من ${label}.`);
  }
  return value;
}
export function validateReview(data) {
  const result = {
    college: text(data.college, 2, 100, "الكلية"),
    major: text(data.major, 2, 100, "التخصص"),
    name: text(data.name, 8, 100, "اسم الدكتور"),
    subject: text(data.subject, 2, 120, "المادة"),
    comment: text(data.comment, 3, 600, "التعليق"),
    grade: integer(data.grade, 0, 100, "الدرجة"),
  };
  if (result.name.split(/\s+/).length < 3) {
    throw new ApiError(400, "اكتب اسم الدكتور الثلاثي.");
  }
  if (!Array.isArray(data.scores) || data.scores.length !== 3) {
    throw new ApiError(400, "أكمل مؤشرات التقييم الثلاثة.");
  }
  result.scores = data.scores.map((v) => integer(v, 0, 100, "التقييم"));
  const normalized = result.comment.normalize("NFKD").replace(
    /[\u064b-\u065f\u0670\u0640]/g,
    "",
  ).toLowerCase();
  if (/(غبي|حمار|كلب|حقير|تافه|لعنة|fuck|shit)/iu.test(normalized)) {
    throw new ApiError(400, "عدّل التعليق وأزل الكلمات المسيئة.");
  }
  // All comments still require manual approval; this filter is only the first layer.
  if (
    /(?:https?:\/\/|www\.|@[a-z\d_]{3,}|\b\d[\d\s+()-]{7,}\d\b)/iu.test(
      result.comment,
    )
  ) {
    throw new ApiError(
      400,
      "احذف الروابط ووسائل التواصل والبيانات الشخصية من تعليقك.",
    );
  }
  return result;
}
export function adminIds(value) {
  return new Set(
    (value || "").split(",").map((s) => s.trim()).filter((s) =>
      /^\d+$/.test(s)
    ),
  );
}
