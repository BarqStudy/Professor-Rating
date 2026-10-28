import {createInstitutionMailer,institutionMailStatus,institutionInbox} from './institution-mail.js';
import {uploadPlatformFile,adminFiles} from './files.js';
import {extractStudyPlan,publishStudyPlan} from './plan-import.js';
import {loadEditablePlan,updateStudyPlan,deleteStudyPlan} from './plan-editor.js';
import {publishedReviewAdmin} from './published-reviews.js';
import {majorAdministration} from './major-removal.js';
import { studyCourse, courseDoctors, courseReviews, doctorOffice, existingDoctorReview } from "./study.js";
import { handleGuest, verifiedGuest } from "./guest.js";
import { gradeConsent, gradeParticipation, publicGrades } from "./grades.js";
import { handleAi, checkAiConnection } from "./ai.js";
import { catalogueProposal, ambassadorAdmin } from "./ambassadors.js";
import { studentCommunity, adminCommunity, publicSummary } from "./community.js";
import {
  adminIds,
  ApiError,
  integer,
  text,
  uuid,
  validateReview,
} from "./security.js";

export function createHandler({ db, env, authenticate, aiFetch = fetch, storageFetch = fetch, mailTransport, mailFetch=fetch, background }) {
  const mailer=createInstitutionMailer({db,env,transportFactory:mailTransport,mailFetch});
  const notifyInstitution=id=>{if(!id||!institutionMailStatus(env).configured)return;const task=mailer.deliver(id).catch(()=>{});if(background)background(task);return task;};
  const origins = (env.ALLOWED_ORIGINS || "https://barqstudy.github.io").split(
    ",",
  ).map((x) => x.trim());
  const admins = adminIds(env.ADMIN_AUTH_IDS);
  return async function handler(request) {
    const origin = request.headers.get("origin");
    const cors = {
      "Access-Control-Allow-Origin": origins.includes(origin)
        ? origin
        : origins[0],
      "Access-Control-Allow-Headers":
        "content-type, apikey, authorization, x-client-info, x-miyar-guest",
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
      const query=new URL(request.url).searchParams,studyOperation=query.get('study'),fileOperation=query.get('files');
      if(fileOperation!==null&&fileOperation!=='upload')throw new ApiError(400,'عملية ملف غير معروفة.');
      if(fileOperation!==null&&studyOperation!==null)throw new ApiError(400,'اختر عملية واحدة للرفع.');
      let studyAdmin=null;
      if(studyOperation!==null||fileOperation!==null){
        if(studyOperation!==null&&!['extract','publish','update'].includes(studyOperation))throw new ApiError(400,'عملية خطة غير معروفة.');
        if(!authenticate)throw new ApiError(401,'سجّل الدخول باستخدام Google.');
        const identity=await authenticate(request);
        if(!admins.has(String(identity.id)))throw new ApiError(403,'رفع الملفات واستيراد الخطط متاحان للأدمن فقط.');
        const rows=await db(`miyar_accounts?auth_id=eq.${identity.id}&select=auth_id,status`);
        if(rows[0]?.status!=='active')throw new ApiError(403,'حساب الإدارة غير متاح للاستيراد.');
        studyAdmin=identity.id;
      }
      const limit=fileOperation==='upload'?21*1024*1024:studyOperation==='extract'?8*1024*1024:['publish','update'].includes(studyOperation)?768*1024:16384;
      let size = 0;
      const chunks = [];
      const reader = request.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
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
      if(studyOperation==='extract'||fileOperation==='upload'){
        const contentType=request.headers.get('content-type')||'';
        if(!contentType.toLowerCase().startsWith('multipart/form-data;'))throw new ApiError(400,'ارفع ملف الخطة من لوحة الإدارة.');
        let form;
        try{form=await new Response(bytes,{headers:{'Content-Type':contentType}}).formData();}
        catch{throw new ApiError(400,'ملف الرفع غير صالح.');}
        if(fileOperation==='upload')return respond(await uploadPlatformFile(form,studyAdmin,db,env,storageFetch),201);
        return respond(await extractStudyPlan(form,studyAdmin,db,env,aiFetch,storageFetch));
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
      if(studyOperation==='publish')return respond(await publishStudyPlan(body,studyAdmin,db));
      if(studyOperation==='update')return respond(await updateStudyPlan(body,studyAdmin,db));
      const action = body.action;
      const aiResult = await handleAi(request, body, db, env, aiFetch);
      if (aiResult) return respond(aiResult);
      const guestResult = await handleGuest(request, body, db, env.GUEST_PEPPER);
      if (guestResult) {if(action==='guest.institution.request'){const task=notifyInstitution(guestResult.data?.id);if(!background)await task;}return respond(guestResult.data, guestResult.status || 200);}
      if(action==='study.plans')return respond(await db('rpc/miyar_uploaded_study_plans',{method:'POST',body:{}}));
      if (action === "catalogue") {
        return respond(
          await db("rpc/miyar_catalogue", { method: "POST", body: {} }),
        );
      }
      if (action === "doctor.summary") return respond(await publicSummary(body, db));
      if (action === "doctor.grades") return respond(await publicGrades(body, db));
      if (action === "course.doctors") return respond(await courseDoctors(body, db));
      if (action === "course.reviews") return respond(await courseReviews(body, db));
      if (action === "reviews") {
        const id = integer(body.doctor, 1, Number.MAX_SAFE_INTEGER, "الدكتور");
        const doctors = await db(
          `miyar_doctors?id=eq.${id}&status=eq.approved&select=id`,
        );
        if (!doctors.length) throw new ApiError(404, "الدكتور غير موجود.");
        const rows = await db(
          `miyar_reviews?doctor_id=eq.${id}&status=eq.published${body.subject ? `&subject=eq.${encodeURIComponent(text(body.subject,2,120,"المادة"))}` : ""}&select=id,subject,comment,tags,explanation,treatment,grading,created_at&order=created_at.desc&limit=100`,
        );
        return respond(
          rows.map((r) => ({
            id: r.id,
            subject: r.subject,
            comment: r.comment,
            tags: r.tags || [],
            scores: [r.explanation, r.treatment, r.grading],
            date: r.created_at,
          })),
        );
      }
      // Identity comes only from a Supabase-verified Google session.
      if (!authenticate) throw new ApiError(401, "سجّل الدخول باستخدام Google.");
      const identity = await authenticate(request);
      let rows = await db(
        `miyar_accounts?auth_id=eq.${identity.id}&select=auth_id,name,major_id,level,status,university_id`,
      );
      if (!rows.length) {
        rows = await db("miyar_accounts?on_conflict=auth_id", {
          method: "POST",
          prefer: "resolution=ignore-duplicates,return=representation",
          body: {
            auth_id: identity.id,
            name: identity.name || "طالب",
          },
        });
        if (!rows?.length) {
          rows = await db(
            `miyar_accounts?auth_id=eq.${identity.id}&select=auth_id,name,major_id,level,status,university_id`,
          );
        }
      }
      const user = rows[0];
      // Owners can withdraw statistical sharing even while their account is restricted.
      if (user && ['grade.participation','grade.consent'].includes(action)) {
        const participation = await gradeParticipation(action, body, db, identity.id);
        return respond(participation.data);
      }
      if (!user || user.status === "banned") {
        throw new ApiError(403, "هذا الحساب محظور من المنصة.");
      }
      if(['me','submit','review.eligibility'].includes(action)&&user.status==='active'&&request.headers.has('x-miyar-guest')){
        let guest;try{guest=await verifiedGuest(request,db,true);}catch(error){if(error.status!==401)throw error;}
        if(guest?.status==='active')await db('rpc/miyar_link_review_identity',{method:'POST',body:{p_account:identity.id,p_guest:guest.id}});
      }
      const isAdmin = admins.has(String(identity.id));
      if (action === "me") {
        const memberships = user.status === 'active' ? await db(`miyar_ambassadors?account_id=eq.${identity.id}&select=university_id`) : [];
        const assistance=user.status==='active'?await db(`miyar_assistants?account_id=eq.${identity.id}&select=college_id`):[];
        return respond({
          id: identity.id,
          name: user.name,
          major_id: user.major_id,
          university_id: user.university_id,
          level: user.level,
          status: user.status,
          isAdmin,
          ambassadorUniversities: memberships.map((row) => row.university_id),
          assistantColleges:Array.isArray(assistance)?assistance.map(row=>row.college_id):[],
        });
      }
      if(action==='review.eligibility')return respond(await db('rpc/miyar_review_eligibility',{method:'POST',body:{p_account:identity.id,p_guest:null,p_doctor:integer(body.doctor,1,Number.MAX_SAFE_INTEGER,'الدكتور')}}));
      if (action === "university") {
        const university = integer(body.universityId, 1, Number.MAX_SAFE_INTEGER, "الجامعة");
        await db('rpc/miyar_choose_university',{method:'POST',body:{p_account:identity.id,p_guest:null,p_university:university}});
        return respond({ ok: true, university_id: university });
      }
      if (action === "profile") {
        const name = text(body.name, 1, 60, "الاسم");
        const level = integer(body.level, 1, 12, "المستوى");
        const major = body.majorId == null ? null : integer(body.majorId, 1, Number.MAX_SAFE_INTEGER, "التخصص");
        if (!user.university_id) throw new ApiError(400, "اختر جامعتك أولًا.");
        if (major !== null) {
          const found = await db(`miyar_majors?id=eq.${major}&deleted_at=is.null&select=id,miyar_colleges!inner(university_id)&miyar_colleges.university_id=eq.${user.university_id}`);
          if (!found.length) throw new ApiError(400, "التخصص لا يتبع جامعتك المختارة.");
        }
        await db(`miyar_accounts?auth_id=eq.${identity.id}`, {
          method: "PATCH",
          body: { name, major_id: major, level },
        });
        return respond({ ok: true });
      }
      const proposal = await catalogueProposal(action, body, user, identity.id, db);
      if (proposal) return respond(proposal.data, proposal.status);
      const community = await studentCommunity(action, body, user, identity.id, db);
      if (community) {if(action==='institution.request'){const task=notifyInstitution(community.data?.id);if(!background)await task;}return respond(community.data, community.status || 200);}
      if (action === "submit") {
        if (user.status !== "active") {
          throw new ApiError(403, "حسابك مقيّد عن إضافة التقييمات.");
        }
        if (!user.university_id) throw new ApiError(400, "اختر جامعتك أولًا.");
        if(body.pledged!==true) throw new ApiError(400,"وافق على تعهّد التقييم أولًا.");
        const r = validateReview(body);
        const existing = existingDoctorReview(body,r,identity.id);
        if (existing) return respond(await db('rpc/'+existing.name,{method:'POST',body:existing.body}),201);
        const result = await db("rpc/miyar_submit_google_review", {
          method: "POST",
          body: {
            p_account: identity.id,
            p_college: r.college,
            p_major: r.major,
            p_name: r.name,
            p_subject: r.subject,
            p_grade: r.grade,
            p_explanation: r.scores[0],
            p_treatment: r.scores[1],
            p_grading: r.scores[2],
            p_comment: r.comment,
            p_tags: r.tags,
            p_share_grade: gradeConsent(body.shareGrade),
            ...studyCourse(body.courseId),
          },
        });
        return respond(result, 201);
      }
      if (action !== "admin") throw new ApiError(400, "العملية غير معروفة.");
      if (!isAdmin) throw new ApiError(403, "هذه العملية متاحة للأدمن فقط.");
      const operation = body.operation;
      if(['major.preview-delete','major.delete','major.add'].includes(operation)){
        if(user.status!=='active')throw new ApiError(403,'حساب الإدارة مقيّد.');
        return respond(await majorAdministration(operation,body,identity.id,db));
      }
      if(['review.published.list','review.remove'].includes(operation)){
        if(user.status!=='active')throw new ApiError(403,'حساب الإدارة مقيّد.');
        return respond(await publishedReviewAdmin(operation,body,identity.id,db));
      }
      if(['study.list','study.get','study.delete'].includes(operation)){
        if(user.status!=='active')throw new ApiError(403,'حساب الإدارة مقيّد.');
        if(operation==='study.delete')return respond(await deleteStudyPlan(body,identity.id,db));
        return respond(operation==='study.list'?await db('rpc/miyar_admin_study_plans',{method:'POST',body:{}}):await loadEditablePlan(body.id,db));
      }
      if(typeof operation==='string'&&operation.startsWith('institution.mail.')){
        if(user.status!=='active')throw new ApiError(403,'حساب الإدارة مقيّد.');
        const result=await mailer.admin(operation,body);if(result!==null)return respond(result);
      }
      if(operation==='university.enable'){
        if(typeof body.enabled!=='boolean')throw new ApiError(400,'اختر حالة الجامعة.');
        return respond(await db('rpc/miyar_set_university_enabled',{method:'POST',body:{p_id:integer(body.id,1,Number.MAX_SAFE_INTEGER,'الجامعة'),p_enabled:body.enabled}}));
      }
      if(['institution.approve','institution.reject'].includes(operation))return respond(await db('rpc/miyar_decide_institution',{method:'POST',body:{p_actor:identity.id,p_id:integer(body.id,1,Number.MAX_SAFE_INTEGER,'الطلب'),p_approve:operation==='institution.approve',p_reason:text(body.reason||'',operation==='institution.reject'?3:0,300,'سبب الرفض')}}));
      if(typeof operation==='string'&&(operation.startsWith('files.')||operation.startsWith('storage.'))&&user.status!=='active')throw new ApiError(403,'حساب الإدارة مقيّد عن الوصول للملفات.');
      const fileResult=await adminFiles(operation,body,identity.id,db,env,storageFetch);
      if(fileResult!==null)return respond(fileResult);
      if (operation === 'doctor.office') return respond(await doctorOffice(body,db));
      if (operation === 'ai.check') return respond(await checkAiConnection(env, aiFetch));
      const ambassadorResult = await ambassadorAdmin(operation, body, identity.id, db);
      if (ambassadorResult) return respond(ambassadorResult);
      const communityResult = await adminCommunity(operation, body, db);
      if (communityResult) return respond(communityResult);
      if (operation === "queue") {
        const [doctors, reviews] = await Promise.all([
          db(
            "miyar_doctors?status=eq.pending&select=id,name,major_id,submitted_by_account,submitted_by_guest,requested_course,created_at&order=created_at.asc&limit=100",
          ),
          db(
            "miyar_reviews?status=eq.pending&select=id,doctor_id,account_id,guest_id,subject,comment,tags,explanation,treatment,grading,created_at&order=created_at.asc&limit=100",
          ),
        ]);
        const [extra, catalogueRequests, ambassadors, institutions,assistants] = await Promise.all([
          db("rpc/miyar_community_queue", {method:"POST",body:{}}),
          db("rpc/miyar_catalogue_queue", {method:"POST",body:{}}),
          db("rpc/miyar_ambassador_list", {method:"POST",body:{}}),
          institutionInbox(db,env),
          db('rpc/miyar_assistant_list',{method:'POST',body:{}}),
        ]);
        // Grade is deliberately excluded even from the moderation response.
        return respond({
          ...institutions,
          edits: extra?.edits || [], reports: extra?.reports || [],
          catalogueRequests: catalogueRequests || [], ambassadors: ambassadors || [], assistants:Array.isArray(assistants)?assistants:[],
          doctors: doctors.map((
            { id, name, major_id, submitted_by_account, submitted_by_guest, requested_course, created_at },
          ) => ({
            id,
            name,
            major_id,
            submitted_by: submitted_by_account || submitted_by_guest,
            identity_type: submitted_by_guest ? "guest" : "google",
            requested_course,
            created_at,
          })),
          reviews: reviews.map((
            {
              id,
              doctor_id,
              account_id,
              guest_id,
              subject,
              comment,
              tags,
              explanation,
              treatment,
              grading,
              created_at,
            },
          ) => ({
            id,
            doctor_id,
            user_id: account_id || guest_id,
            identity_type: guest_id ? "guest" : "google",
            subject,
            comment,
            tags: tags || [],
            explanation,
            treatment,
            grading,
            created_at,
          })),
        });
      }
      if (operation === "university.add") {
        await db("miyar_universities", { method: "POST", body: { name: text(body.name, 2, 100, "الجامعة") } });
      } else if (operation === "university.delete") {
        await db('rpc/miyar_delete_university', { method: 'POST', body: { p_id: validId(body.id) } });
      } else if (operation === "college.add") {
        await db("miyar_colleges", {
          method: "POST",
          body: { name: text(body.name, 2, 100, "الكلية"), university_id: validId(body.universityId) },
        });
      } else if (operation === "college.delete") {
        await db(`miyar_colleges?id=eq.${validId(body.id)}`, {
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
        const target = uuid(body.userId);
        if (admins.has(String(target))) {
          throw new ApiError(400, "لا يمكن حظر أو تقييد حساب أدمن.");
        }
        if (!["active", "restricted", "banned"].includes(body.status)) {
          throw new ApiError(400, "حالة المستخدم غير صالحة.");
        }
        if(body.identityType && !["google","guest"].includes(body.identityType))throw new ApiError(400,"نوع الحساب غير صالح.");
        const targetPath=body.identityType==="guest" ? `miyar_guest_sessions?id=eq.${target}` : `miyar_accounts?auth_id=eq.${target}`;
        const found = await db(targetPath, {
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
