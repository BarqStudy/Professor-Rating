export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function uuid(value, label = "معرّف الحساب") {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
      .test(value)
  ) throw new ApiError(400, `تحقق من ${label}.`);
  return value.toLowerCase();
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
  const result = new Set();
  for (const item of (value || "").split(",")) {
    try {
      result.add(uuid(item.trim()));
    } catch { /* Invalid entries grant no permissions. */ }
  }
  return result;
}
