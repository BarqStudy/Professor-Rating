import { ApiError, integer, text, validateReview } from './security.js';
const id = (value) => integer(value,1,Number.MAX_SAFE_INTEGER,'المعرّف');
const rpc = (db,name,body) => db('rpc/'+name,{method:'POST',body});
export async function studentCommunity(action,body,user,account,db) {
  if (!['mine','notifications','report','edit','doctor.request'].includes(action)) return null;
  if(action==='mine') return {data:await rpc(db,'miyar_my_reviews',{p_account:account})};
  if(action==='notifications') {
    if(!Array.isArray(body.doctors) || body.doctors.length>100) throw new ApiError(400,'اختر حتى ١٠٠ دكتور محفوظ.');
    const doctors=[...new Set(body.doctors.map(id))];
    return {data: user.university_id ? await rpc(db,'miyar_saved_updates',{p_university:user.university_id,p_doctors:doctors}) : []};
  }
  if(user.status!=='active') throw new ApiError(403,'حسابك مقيّد عن الإرسال.');
  if(!user.university_id) throw new ApiError(400,'اختر جامعتك أولًا.');
  if(action==='doctor.request') {
    const name=text(body.name,8,100,'اسم الدكتور الثلاثي');
    if(name.split(/\s+/).length<3) throw new ApiError(400,'اكتب اسم الدكتور الثلاثي.');
    return {status:201,data:await rpc(db,'miyar_request_doctor',{p_account:account,p_major:id(body.majorId),p_name:name})};
  }
  if(action==='report') {
    if(!['abuse','personal','irrelevant'].includes(body.reason)) throw new ApiError(400,'اختر سبب البلاغ.');
    return {status:201,data:await rpc(db,'miyar_submit_report',{p_account:account,p_review:id(body.review),p_reason:body.reason,p_details:text(body.details||'',0,600,'تفاصيل البلاغ')})};
  }
  // Reuse the existing content filters; edits cannot change the doctor, author, or private grade.
  const review=validateReview({...body,college:'كلية',major:'تخصص',name:'اسم دكتور كامل',grade:0});
  return {status:201,data:await rpc(db,'miyar_request_edit',{p_account:account,p_review:id(body.review),p_subject:review.subject,p_comment:review.comment,p_explanation:review.scores[0],p_treatment:review.scores[1],p_grading:review.scores[2]})};
}
export async function adminCommunity(operation,body,db) {
  if(['edit.approve','edit.reject'].includes(operation)) {
    await rpc(db,'miyar_moderate_edit',{p_id:id(body.id),p_approve:operation==='edit.approve'});
    return {ok:true};
  }
  if(['report.remove','report.dismiss'].includes(operation)) {
    await rpc(db,'miyar_moderate_report',{p_id:id(body.id),p_remove:operation==='report.remove'});
    return {ok:true};
  }
  return null;
}
