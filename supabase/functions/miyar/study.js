import { gradeConsent } from './grades.js';
import { ApiError, integer, text } from './security.js';
export function studyCourse(value) {
 if(value==null || value==='')return {};
 if(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{2,79}\/[a-z0-9-]{1,69}$/.test(value)||value.length>150)throw new ApiError(400,'اختر المادة من خطة تخصصك.');
 return {p_course:value};
}
export async function courseDoctors(body,db) {
 const course=text(body.courseId,5,150,'المادة');
 if(!studyCourse(course).p_course)throw new ApiError(400,'اختر المادة.');
 return db('rpc/miyar_course_doctors',{method:'POST',body:{p_course:course}});
}

// Called only after the normal identity, pledge and review validation checks.
export function existingDoctorReview(body,review,actor,isGuest=false) {
 if(body.existingDoctorId==null)return null;
 return {
  name:isGuest?'miyar_submit_existing_guest_review':'miyar_submit_existing_google_review',
  body:{[isGuest?'p_guest':'p_account']:actor,
   p_doctor:integer(body.existingDoctorId,1,Number.MAX_SAFE_INTEGER,'الدكتور'),
   p_subject:review.subject,p_grade:review.grade,p_explanation:review.scores[0],
   p_treatment:review.scores[1],p_grading:review.scores[2],p_comment:review.comment,
   p_tags:review.tags,p_share_grade:gradeConsent(body.shareGrade),p_course:studyCourse(body.courseId).p_course||null,
  },
 };
}

export async function courseReviews(body,db) {
 const course=text(body.courseId,5,150,'المادة');studyCourse(course);
 return db('rpc/miyar_course_reviews',{method:'POST',body:{p_course:course,p_doctor:integer(body.doctor,1,Number.MAX_SAFE_INTEGER,'الدكتور')}});
}
export async function doctorOffice(body,db) {
 if(![null,'head','dean'].includes(body.role))throw new ApiError(400,'اختر المنصب.');
 const college=body.role==='dean'?integer(body.collegeId,1,Number.MAX_SAFE_INTEGER,'الكلية'):null;
 return db('rpc/miyar_set_doctor_office',{method:'POST',body:{p_doctor:integer(body.id,1,Number.MAX_SAFE_INTEGER,'الدكتور'),p_role:body.role,p_college:college}});
}
