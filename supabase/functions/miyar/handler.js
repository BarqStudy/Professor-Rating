import {
  adminIds,
  ApiError,
  integer,
  text,
  validateReview,
  verifyTelegram,
} from "./security.js";

export function createHandler({ db, env }) {
  const origins = (env.ALLOWED_ORIGINS || "https://barqstudy.github.io").split(
    ",",
  ).map((x) => x.trim());
  const admins = adminIds(env.ADMIN_TELEGRAM_IDS);
  return async function handler(request) {
    const origin = request.headers.get("origin");
    const cors = {
      "Access-Control-Allow-Origin": origins.includes(origin)
        ? origin
        : origins[0],
      "Access-Control-Allow-Headers":
        "content-type, apikey, authorization, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
      });
    try {
      if (origin && !origins.includes(origin)) {
        throw new ApiError(403, "مصدر الطلب غير مسموح.");
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method !== "POST") {
        throw new ApiError(405, "استخدم طلب POST.");
      }
      let size = 0;
      const chunks = [];
      const reader = request.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16384) {
            await reader.cancel();
            throw new ApiError(413, "حجم الطلب أكبر من المسموح.");
          }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new ApiError(400, "طلب غير صالح.");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new ApiError(400, "طلب غير صالح.");
      }
      const action = body.action;
      if (action === "catalogue") {
        return respond(
          await db("rpc/miyar_catalogue", { method: "POST", body: {} }),
        );
      }
      if (action === "reviews") {
        const id = integer(body.doctor, 1, Number.MAX_SAFE_INTEGER, "الدكتور");
        const doctors = await db(
          `miyar_doctors?id=eq.${id}&status=eq.approved&select=id`,
        );
        if (!doctors.length) throw new ApiError(404, "الدكتور غير موجود.");
        const rows = await db(
          `miyar_reviews?doctor_id=eq.${id}&status=eq.published&select=id,subject,comment,explanation,treatment,grading,created_at&order=created_at.desc&limit=100`,
        );
        return respond(
          rows.map((r) => ({
            id: r.id,
            subject: r.subject,
            comment: r.comment,
            scores: [r.explanation, r.treatment, r.grading],
            date: r.created_at,
          })),
        );
      }
      // A Telegram ID, username, or client flag by itself never grants access.
      const identity = await verifyTelegram(
        body.initData,
        env.TELEGRAM_BOT_TOKEN,
      );
      let rows = await db(
        `miyar_users?telegram_id=eq.${identity.id}&select=telegram_id,name,username,major_id,level,status`,
      );
      if (!rows.length) {
        rows = await db("miyar_users?on_conflict=telegram_id", {
          method: "POST",
          prefer: "resolution=ignore-duplicates,return=representation",
          body: {
            telegram_id: identity.id,
            name: identity.name || "طالب",
            username: identity.username,
          },
        });
        if (!rows?.length) {
          rows = await db(
            `miyar_users?telegram_id=eq.${identity.id}&select=telegram_id,name,username,major_id,level,status`,
          );
        }
      }
      const user = rows[0];
      if (!user || user.status === "banned") {
        throw new ApiError(403, "هذا الحساب محظور من المنصة.");
      }
      const isAdmin = admins.has(String(identity.id));
      if (action === "me") {
        return respond({
          id: identity.id,
          name: user.name,
          major_id: user.major_id,
          level: user.level,
          status: user.status,
          isAdmin,
        });
      }
      if (action === "profile") {
        const name = text(body.name, 1, 60, "الاسم");
        const level = integer(body.level, 1, 12, "المستوى");
        const major = integer(
          body.majorId,
          1,
          Number.MAX_SAFE_INTEGER,
          "التخصص",
        );
        const found = await db(`miyar_majors?id=eq.${major}&select=id`);
        if (!found.length) throw new ApiError(400, "التخصص غير موجود.");
        await db(`miyar_users?telegram_id=eq.${identity.id}`, {
          method: "PATCH",
          body: { name, major_id: major, level },
        });
        return respond({ ok: true });
      }
      if (action === "submit") {
        if (user.status !== "active") {
          throw new ApiError(403, "حسابك مقيّد عن إضافة التقييمات.");
        }
        const r = validateReview(body);
        const result = await db("rpc/miyar_submit_review", {
          method: "POST",
          body: {
            p_user: identity.id,
            p_college: r.college,
            p_major: r.major,
            p_name: r.name,
            p_subject: r.subject,
            p_grade: r.grade,
            p_explanation: r.scores[0],
            p_treatment: r.scores[1],
            p_grading: r.scores[2],
            p_comment: r.comment,
          },
        });
        return respond(result, 201);
      }
      if (action !== "admin") throw new ApiError(400, "العملية غير معروفة.");
      if (!isAdmin) throw new ApiError(403, "هذه العملية متاحة للأدمن فقط.");
      const operation = body.operation;
      if (operation === "queue") {
        const [doctors, reviews] = await Promise.all([
          db(
            "miyar_doctors?status=eq.pending&select=id,name,major_id,submitted_by,created_at&order=created_at.asc&limit=100",
          ),
          db(
            "miyar_reviews?status=eq.pending&select=id,doctor_id,user_id,subject,comment,explanation,treatment,grading,created_at&order=created_at.asc&limit=100",
          ),
        ]);
        // Grade is deliberately excluded even from the moderation response.
        return respond({
          doctors: doctors.map((
            { id, name, major_id, submitted_by, created_at },
          ) => ({ id, name, major_id, submitted_by, created_at })),
          reviews: reviews.map((
            {
              id,
              doctor_id,
              user_id,
              subject,
              comment,
              explanation,
              treatment,
              grading,
              created_at,
            },
          ) => ({
            id,
            doctor_id,
            user_id,
            subject,
            comment,
            explanation,
            treatment,
            grading,
            created_at,
          })),
        });
      }
      if (operation === "college.add") {
        await db("miyar_colleges", {
          method: "POST",
          body: { name: text(body.name, 2, 100, "الكلية") },
        });
      } else if (operation === "college.delete") {
        await db(`miyar_colleges?id=eq.${validId(body.id)}`, {
          method: "DELETE",
        });
      } else if (operation === "major.add") {
        await db("miyar_majors", {
          method: "POST",
          body: {
            college_id: validId(body.collegeId),
            name: text(body.name, 2, 100, "التخصص"),
          },
        });
      } else if (operation === "major.delete") {
        await db(`miyar_majors?id=eq.${validId(body.id)}`, {
          method: "DELETE",
        });
      } else if (operation === "doctor.add") {
        const name = text(body.name, 8, 100, "الاسم الثلاثي");
        if (name.split(/\s+/).length < 3) {
          throw new ApiError(400, "اكتب الاسم الثلاثي.");
        }
        await db("miyar_doctors", {
          method: "POST",
          body: { name, major_id: validId(body.majorId), status: "approved" },
        });
      } else if (operation === "doctor.delete") {
        await db(`miyar_doctors?id=eq.${validId(body.id)}`, {
          method: "PATCH",
          body: { status: "archived" },
        });
      } else if (operation === "doctor.verify") {
        if (typeof body.verified !== "boolean") {
          throw new ApiError(400, "قيمة التوثيق غير صالحة.");
        }
        await db(`miyar_doctors?id=eq.${validId(body.id)}`, {
          method: "PATCH",
          body: { verified: body.verified },
        });
      } else if (
        operation === "doctor.approve" || operation === "doctor.reject"
      ) {
        await db("rpc/miyar_moderate_doctor", {
          method: "POST",
          body: {
            p_id: validId(body.id),
            p_approve: operation === "doctor.approve",
          },
        });
      } else if (
        operation === "review.approve" || operation === "review.reject"
      ) {
        const id = validId(body.id);
        const rows = await db(
          `miyar_reviews?id=eq.${id}&status=eq.pending&select=id,doctor_id,comment`,
        );
        if (!rows.length) {
          throw new ApiError(404, "التقييم غير موجود أو تمت مراجعته.");
        }
        if (operation === "review.approve") {
          const doctor = await db(
            `miyar_doctors?id=eq.${
              rows[0].doctor_id
            }&status=eq.approved&select=id`,
          );
          if (!doctor.length) {
            throw new ApiError(409, "وافق على إضافة الدكتور أولًا.");
          }
        }
        await db(`miyar_reviews?id=eq.${id}&status=eq.pending`, {
          method: "PATCH",
          body: {
            status: operation === "review.approve" ? "published" : "rejected",
          },
        });
      } else if (operation === "user.status") {
        const target = validId(body.telegramId);
        if (admins.has(String(target))) {
          throw new ApiError(400, "لا يمكن حظر أو تقييد حساب أدمن.");
        }
        if (!["active", "restricted", "banned"].includes(body.status)) {
          throw new ApiError(400, "حالة المستخدم غير صالحة.");
        }
        const found = await db(`miyar_users?telegram_id=eq.${target}`, {
          method: "PATCH",
          body: { status: body.status },
        });
        if (!found?.length) {
          throw new ApiError(404, "المستخدم لم يدخل المنصة بعد.");
        }
      } else throw new ApiError(400, "عملية الإدارة غير معروفة.");
      return respond({ ok: true });
    } catch (error) {
      return respond({
        error: error instanceof ApiError
          ? error.message
          : "تعذّر الاتصال بالخدمة. حاول مجددًا.",
      }, error instanceof ApiError ? error.status : 500);
    }
  };
}
function validId(value) {
  return integer(value, 1, Number.MAX_SAFE_INTEGER, "المعرّف");
}
