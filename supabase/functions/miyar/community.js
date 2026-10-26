import {requestInstitution,requestCourseDoctor} from './requests.js';
import { buildReviewSummary } from './summary.js';
import { ApiError, integer, text, validateReview } from './security.js';
const id = (value) => integer(value,1,Number.MAX_SAFE_INTEGER,'المعرّف');
const rpc = (db,name,body) => db('rpc/'+name,{method:'POST',body});
export async function studentCommunity(action,body,user,account,db) {
  if (!['mine','notifications','report','edit','doctor.request','requests','request.updates','institution.request'].includes(action)) return null;
  if(action==='requests') return {data:await rpc(db,'miyar_my_requests',{p_account:account})};
  if(action==='request.updates') return {data:await rpc(db,'miyar_request_updates',{p_account:account})};
  if(action==='mine') return {data:await rpc(db,'miyar_my_reviews',{p_account:account})};
  if(action==='notifications') {
    if(!Array.isArray(body.doctors) || body.doctors.length>100) throw new ApiError(400,'اختر حتى ١٠٠ دكتور محفوظ.');
    const doctors=[...new Set(body.doctors.map(id))];
    return {data: user.university_id ? await rpc(db,'miyar_saved_updates',{p_university:user.university_id,p_doctors:doctors}) : []};
  }
  if(user.status!=='active') throw new ApiError(403,'حسابك مقيّد عن الإرسال.');
  if(action==='institution.request')return {status:201,data:await requestInstitution(body,account,null,db)};
  if(!user.university_id) throw new ApiError(400,'اختر جامعتك أولًا.');
  if(action==='doctor.request') {
    if(body.courseId)return {status:201,data:await requestCourseDoctor(body,account,null,db)};
    const name=text(body.name,8,100,'اسم الدكتور الثلاثي');
    if(name.split(/\s+/).length<3) throw new ApiError(400,'اكتب اسم الدكتور الثلاثي.');
    return {status:201,data:await rpc(db,'miyar_request_doctor',{p_account:account,p_major:id(body.majorId),p_name:name})};
  }
  if(action==='report') {
    if(!['abuse','personal','irrelevant'].includes(body.reason)) throw new ApiError(400,'اختر سبب البلاغ.');
    return {status:201,data:await rpc(db,'miyar_submit_report',{p_account:account,p_review:id(body.review),p_reason:body.reason,p_details:text(body.details||'',0,600,'تفاصيل البلاغ')})};
  }
  if(body.pledged!==true)throw new ApiError(400,"وافق على تعهّد التقييم أولًا.");
  // Reuse the existing content filters; edits cannot change the doctor, author, or private grade.
  const review=validateReview({...body,college:'كلية',major:'تخصص',name:'اسم دكتور كامل',grade:0});
  return {status:201,data:await rpc(db,'miyar_request_edit',{p_account:account,p_review:id(body.review),p_subject:review.subject,p_comment:review.comment,p_explanation:review.scores[0],p_treatment:review.scores[1],p_grading:review.scores[2],p_tags:review.tags})};
}
export async function adminCommunity(operation,body,db) {
  if(['doctor.approve','doctor.reject','edit.approve','edit.reject'].includes(operation)) {
    const approve=operation.endsWith('.approve');
    const reason=text(body.reason||'',approve?0:3,300,'سبب الرفض');
    await rpc(db,'miyar_decide_request',{p_kind:operation.startsWith('doctor.')?'doctor':'edit',p_id:id(body.id),p_approve:approve,p_reason:reason});
    return {ok:true};
  }
  if(operation==='doctor.bulk') {
    if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>100||!['verify','unverify','archive'].includes(body.operationType))throw new ApiError(400,'حدد الدكاترة والإجراء الجماعي.');
    return await rpc(db,'miyar_bulk_doctors',{p_ids:[...new Set(body.ids.map(id))],p_operation:body.operationType});
  }
  if(['report.remove','report.dismiss'].includes(operation)) {
    await rpc(db,'miyar_moderate_report',{p_id:id(body.id),p_remove:operation==='report.remove'});
    return {ok:true};
  }
  return null;
}

export async function publicSummary(body,db) {
 const doctor=id(body.doctor);
 const found=await db(`miyar_doctors?id=eq.${doctor}&status=eq.approved&select=id`);
 if(!found.length)throw new ApiError(404,'الدكتور غير موجود.');
 const sample=await rpc(db,'miyar_summary_comments',{p_doctor:doctor,p_subject:body.subject?text(body.subject,2,120,'المادة'):null});
 return buildReviewSummary(sample.rows||[],sample.total||0);
}
