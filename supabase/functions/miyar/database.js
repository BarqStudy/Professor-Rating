import { ApiError } from "./security.js";
export function createDatabase(url, key, fetcher = fetch) {
  if (!url || !key) throw new ApiError(503, "لم يكتمل إعداد قاعدة البيانات.");
  return async function db(
    path,
    { method = "GET", body, prefer = "return=representation" } = {},
  ) {
    const response = await fetcher(
      `${url.replace(/\/$/, "")}/rest/v1/${path}`,
      {
        method,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: prefer,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (error.code === "23505") {
        throw new ApiError(
          409,
          "هذا السجل موجود بالفعل. لا يمكن إضافة نسخة مكررة.",
        );
      }
      if (error.code === "23503") {
        throw new ApiError(
          409,
          "لا يمكن الحذف لوجود سجلات مرتبطة. احذف السجلات التابعة أولًا.",
        );
      }
      const reasons = {
        REVIEW_ALREADY_EXISTS:[409,"سبق أن أرسلت تقييمًا لهذا الدكتور. يمكنك طلب تعديل تقييمك الحالي بدل إرسال تقييم آخر."],
        UNIVERSITY_INACTIVE:[409,"هذه الجامعة غير مفعّلة في مِعيار بعد. يمكنك طلب إضافتها عبر النموذج."],
        STAFF_SCOPE:[403,"الصلاحية لا تشمل هذه الجامعة أو الكلية أو العملية."],
        INVALID_FILE:[400,"الملف غير صالح أو لم يكتمل حفظه أو لا يخص هذه الخطة."],
        FILE_UPLOAD_CONFLICT:[409,"معرّف الرفع مرتبط بملف آخر. اختر الملف مجددًا لبدء رفع جديد."],
        FILE_UPLOAD_RATE:[429,"وصلت إلى حد رفع الملفات: ٢٠ ملفًا خلال ٢٤ ساعة لكل أدمن."],
        INVALID_INSTITUTION_REQUEST:[400,"راجع اسم الجامعة والكليات والتخصصات في الطلب."],
        INVALID_STUDY_COURSE: [400, "المادة لا تتبع جامعة الدكتور أو تغيّر اسمها. اخترها من الخطة مجددًا."],
        PLAN_IMPORT_RATE: [429, "وصلت لحد قراءة الخطط. انتظر قليلًا قبل إعادة المحاولة؛ الحد ٢٠ قراءة يوميًا."],
        INVALID_STUDY_PLAN: [400, "راجع بيانات الخطة العربية والرموز والساعات قبل الحفظ."],
        STUDY_PLAN_EXISTS: [409, "نسخة الخطة موجودة بالفعل. استخدم اسم إصدار آخر لخطة جديدة."],
        INVALID_DOCTOR_OFFICE: [400, "اختر منصبًا صحيحًا وكلية تتبع جامعة الدكتور."],
        STUDY_COURSE_NOT_FOUND: [404, "المادة غير متاحة للربط حتى مراجعة بياناتها."],
        GRADE_DOCTOR_NOT_FOUND: [404, "الدكتور غير متاح."],
        GRADE_SUBJECT_CHANGED: [409, "تغيّرت مادة التقييم. أعد فتح مشاركة الدرجات وراجع اختيارك."],
        GRADE_REVIEW_NOT_FOUND: [404, "المشاركة غير موجودة في حسابك أو جلستك الحالية."],
        INVALID_GRADE_CONSENT: [400, "تحقق من الموافقة على مشاركة الدرجة إحصائيًا."],
        UNIVERSITY_NOT_FOUND: [404, "الجامعة غير موجودة أو حُذفت سابقًا."],
        UNIVERSITY_HAS_COLLEGES: [409, "لا يمكن حذف الجامعة لوجود كليات مرتبطة بها. تُحفظ الكليات والدكاترة والتقييمات."],
        UNIVERSITY_HAS_REQUESTS: [409, "لا يمكن حذف الجامعة لوجود سجل طلبات مرتبط بها. تُحفظ الطلبات وقراراتها."],
        UNIVERSITY_HAS_AMBASSADORS: [409, "اسحب صلاحيات السفراء المعيّنين لهذه الجامعة قبل حذفها."],
        AI_GLOBAL_LIMIT: [429, "وصل مساعد مِعيار للحد اليومي للمنصة. يتجدد تلقائيًا غدًا."],
        AI_GUEST_LIMIT: [429, "استخدمت أسئلتك العشرة لهذا اليوم. تقدر ترجع للمساعد غدًا."],
        AI_NETWORK_LIMIT: [429, "وصل المساعد لحد الاستخدام اليومي لهذه الشبكة. حاول غدًا."],
        AMBASSADOR_ACCOUNT_REQUIRED: [400, "يجب أن يسجّل صاحب هذا البريد الدخول إلى مِعيار أولًا."],
        AMBASSADOR_SCOPE: [403, "صلاحية السفير لا تشمل هذه الجامعة أو العملية."],
        AMBASSADOR_REVOKED: [409, "سُحبت صلاحية السفير أو قُيّد حسابه. ارفض المقترح مع بيان السبب."],
        INVALID_UNIVERSITY: [400, "الجامعة غير موجودة."],
        INVALID_PROPOSAL: [400, "تحقق من بيانات المقترح."],
        PROPOSAL_TARGET_UNAVAILABLE: [409, "السجل المقترح تصحيحه أو القسم المرتبط به غير متاح."],
        PROPOSAL_UNCHANGED: [400, "غيّر الاسم أو القسم قبل إرسال التصحيح."],
        PROPOSAL_STALE: [409, "تغيّرت البيانات منذ إرسال المقترح. راجع البيانات الحالية وارفض الطلب القديم."],
        REASON_REQUIRED: [400, "اكتب سبب رفض الطلب."],
        INVALID_BULK: [400, "حدد الدكاترة والإجراء المطلوب."],
        REVIEW_UNAVAILABLE: [409, "التقييم غير متاح لهذه العملية."],
        PENDING_EDIT: [409, "يوجد طلب تعديل لهذا التقييم قيد المراجعة."],
        ALREADY_REPORTED: [409, "سبق أن أرسلت بلاغًا عن هذا التقييم."],
        UNIVERSITY_REQUIRED: [400, "اختر جامعتك أولًا."],
        RATE_LIMIT: [429, "وصلت للحد اليومي لهذه العملية. حاول لاحقًا."],
        ACCOUNT_RESTRICTED: [403, "الحساب محظور أو مقيّد."],
        INVALID_UNIVERSITY_MAJOR: [400, "التخصص لا يتبع جامعتك المختارة."],
        INVALID_MAJOR: [400, "التخصص لا يتبع الكلية المحددة."],
        DOCTOR_UNAVAILABLE: [409, "هذا الدكتور غير متاح للتقييم."],
        REQUEST_NOT_FOUND: [404, "الطلب غير موجود أو تمت مراجعته."],
      };
      const known = Object.entries(reasons).find(([code]) =>
        String(error.message).includes(code)
      );
      if (known) throw new ApiError(...known[1]);
      throw new ApiError(
        502,
        "تعذّر تنفيذ العملية في قاعدة البيانات. حاول مجددًا.",
      );
    }
    if (
      response.status === 204 || response.headers.get("content-length") === "0"
    ) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  };
}
