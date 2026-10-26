import { ApiError, text } from './security.js';
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
