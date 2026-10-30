import {reviewLikes} from './review-likes.js';
import {requestInstitution,requestCourseDoctor} from './requests.js';
import { studyCourse, existingDoctorReview } from "./study.js";
import { ApiError, integer, text, uuid, validateReview } from './security.js';
import { gradeConsent, publicGradeNotice } from './grades.js';
const rpc=(db,name,body)=>db('rpc/'+name,{method:'POST',body});
const hex=(value)=>Array.from(new Uint8Array(value),(byte)=>byte.toString(16).padStart(2,'0')).join('');
export const guestTokenHash=async(token)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
async function networkHash(request,pepper){
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
 if(!ip||!pepper)return null;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('miyar-guest-network:'+ip.slice(0,256))));
}
export async function verifiedGuest(request,db,allowBanned=false){
 const token=request.headers.get('x-miyar-guest')||'';
 if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError(401,'تعذّر التحقق من جلسة الزائر. أعد المحاولة.');
 const rows=await db(`miyar_guest_sessions?token_hash=eq.${await guestTokenHash(token)}&select=id,university_id,major_id,status`);
 const guest=rows[0];if(!guest)throw new ApiError(401,'انتهت جلسة الزائر. أعد المحاولة.');
 if(guest.status==='banned'&&!allowBanned)throw new ApiError(403,'جلسة الزائر محظورة من المنصة.');
 return guest;
}
export async function handleGuest(request,body,db,pepper){
 const action=body.action;
 if(!['guest.start','guest.me','guest.university','guest.major','guest.presence','guest.submit','guest.institution.request','guest.doctor.request','guest.review.eligibility','guest.mine','guest.edit','guest.review.likes','guest.review.like'].includes(action))return null;
 if(action==='guest.start'){
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const profile=await rpc(db,'miyar_open_guest',{p_token_hash:await guestTokenHash(token),p_network_hash:await networkHash(request,pepper)});
  return {status:201,data:{...profile,token}};
 }
 const guest=await verifiedGuest(request,db);
 const likes=await reviewLikes(action,body,db,null,guest.id);
 if(likes)return likes;
 if(action==='guest.mine')return {data:await rpc(db,'miyar_guest_reviews',{p_guest:guest.id})};
 if(action==='guest.me')return {data:guest};
 if(action==='guest.presence'){
  if(typeof body.visible!=='boolean')throw new ApiError(400,'حالة الجلسة غير صالحة.');
  return {data:await rpc(db,'miyar_touch_presence',{p_guest:guest.id,p_tab:uuid(body.tabId,'معرّف الصفحة'),p_visible:body.visible})};
 }
 if(action==='guest.university'){
  const university=integer(body.universityId,1,Number.MAX_SAFE_INTEGER,'الجامعة');
  await rpc(db,'miyar_choose_university',{p_account:null,p_guest:guest.id,p_university:university});
  return {data:{...guest,university_id:university,major_id:guest.university_id===university?guest.major_id:null}};
 }
 if(action==='guest.major')return {data:{...guest,...await rpc(db,'miyar_choose_major',{p_account:null,p_guest:guest.id,p_major:integer(body.majorId,1,Number.MAX_SAFE_INTEGER,'التخصص')})}};
 if(guest.status!=='active')throw new ApiError(403,'جلسة الزائر مقيّدة عن إضافة التقييمات.');
 if(action==='guest.review.eligibility')return {data:await rpc(db,'miyar_review_eligibility',{p_account:null,p_guest:guest.id,p_doctor:integer(body.doctor,1,Number.MAX_SAFE_INTEGER,'الدكتور'),p_subject:body.subject?text(body.subject,2,120,'المادة'):null})};
 if(action==='guest.institution.request')return {status:201,data:await requestInstitution(body,null,guest.id,db)};
 if(action==='guest.doctor.request')return {status:201,data:await requestCourseDoctor(body,null,guest.id,db)};
 if(body.pledged!==true)throw new ApiError(400,'وافق على تعهّد التقييم أولًا.');
 if(action==='guest.edit'){
  const review=validateReview({...body,college:'كلية',major:'تخصص',name:'اسم دكتور كامل',grade:0});
  return {status:201,data:await rpc(db,'miyar_request_guest_edit',{p_guest:guest.id,p_review:integer(body.review,1,Number.MAX_SAFE_INTEGER,'التقييم'),p_subject:review.subject,p_comment:review.comment,p_explanation:review.scores[0],p_treatment:review.scores[1],p_grading:review.scores[2],p_tags:review.tags})};
 }
 const review=validateReview(body);
 const existing=existingDoctorReview(body,review,guest.id,true);
 if(existing)return {status:201,data:await rpc(db,existing.name,existing.body)};
 return {status:201,data:await rpc(db,'miyar_guest_submit',{p_guest:guest.id,p_college:review.college,p_major:review.major,p_name:review.name,p_subject:review.subject,p_grade:review.grade,p_explanation:review.scores[0],p_treatment:review.scores[1],p_grading:review.scores[2],p_comment:review.comment,p_tags:review.tags,p_share_grade:gradeConsent(body.shareGrade),p_course:studyCourse(body.courseId).p_course||null,p_public_grade:publicGradeNotice(body.publishGrade)})};
}
