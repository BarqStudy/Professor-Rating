import { ApiError, integer, text } from './security.js';
export function gradeConsent(value, required = false) {
  if (value === undefined && !required) return false;
  if (typeof value !== 'boolean') throw new ApiError(400, 'حدد موافقتك على مشاركة الدرجة إحصائيًا.');
  return value;
}
export async function publicGrades(body, db) {
  return await db('rpc/miyar_grade_distribution', {method:'POST',body:{
    p_doctor:integer(body.doctor,1,Number.MAX_SAFE_INTEGER,'الدكتور'),
    p_subject:body.subject == null || body.subject === '' ? null : text(body.subject,2,120,'المادة'),
  }});
}
export async function gradeParticipation(action, body, db, account = null, guest = null) {
  if (!['grade.participation','grade.consent','guest.grade.participation','guest.grade.consent'].includes(action)) return null;
  const actor = {p_account:account,p_guest:guest};
  if (action.endsWith('participation')) {
    const rows=await db('rpc/miyar_grade_participation',{method:'POST',body:{...actor,p_before:body.before == null ? null : integer(body.before,1,Number.MAX_SAFE_INTEGER,'آخر مشاركة')}});
    const items=rows.slice(0,50);
    return {data:{items,nextBefore:rows.length>50 ? items.at(-1).id : null}};
  }
  const consent=gradeConsent(body.shareGrade,true);
  return {data:await db('rpc/miyar_set_grade_consent',{method:'POST',body:{...actor,
    p_review:integer(body.review,1,Number.MAX_SAFE_INTEGER,'التقييم'),p_consent:consent,p_subject:consent?text(body.subject,2,120,'المادة التي وافقت على مشاركتها'):null,
  }})};
}
