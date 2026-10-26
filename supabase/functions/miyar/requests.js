import {integer,text,ApiError} from './security.js';
import {studyCourse} from './study.js';
export function institutionData(body){
 const universityId=body.universityId==null?null:integer(body.universityId,1,Number.MAX_SAFE_INTEGER,'الجامعة');
 const university=universityId?null:text(body.university,2,100,'اسم الجامعة');
 const kind=body.kind==='university'?'university':body.kind==='college'?'college':null;
 const email=text(body.email,3,254,'البريد الإلكتروني للتواصل').toLowerCase();
 if(!kind||!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))throw new ApiError(400,'اختر نوع الطلب واكتب بريدًا إلكترونيًا صالحًا للتواصل.');
 if(!Array.isArray(body.colleges)||body.colleges.length<(kind==='college'?1:0)||body.colleges.length>5||kind==='college'&&!universityId)throw new ApiError(400,'اختر جامعة الكلية وأضف بياناتها.');
 const colleges=body.colleges.map(c=>{if(!c||!Array.isArray(c.majors)||c.majors.length>10)throw new ApiError(400,'أضف حتى ١٠ تخصصات لكل كلية.');return {name:text(c.name,2,100,'اسم الكلية'),majors:[...new Set(c.majors.map(m=>text(m,2,100,'اسم التخصص')))]};});
 if(new Set(colleges.map(c=>c.name)).size!==colleges.length)throw new ApiError(400,'اسم الكلية مكرر في الطلب.');
 return {p_university:universityId,p_name:university,p_colleges:colleges,p_kind:kind,p_email:email};
}
export function requestInstitution(body,account,guest,db){return db('rpc/miyar_request_institution_contact',{method:'POST',body:{p_account:account,p_guest:guest,...institutionData(body)}});}
export function requestCourseDoctor(body,account,guest,db){
 const name=text(body.name,8,100,'اسم الدكتور الثلاثي');if(name.split(/\s+/).length<3)throw new ApiError(400,'اكتب اسم الدكتور الثلاثي.');
 return db('rpc/miyar_request_course_doctor',{method:'POST',body:{p_account:account,p_guest:guest,p_major:integer(body.majorId,1,Number.MAX_SAFE_INTEGER,'التخصص'),p_name:name,p_course:studyCourse(body.courseId).p_course||null}});
}
