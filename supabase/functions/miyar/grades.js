import { ApiError } from './security.js';
// Compatibility with older clients: statistical consent does not authorize
// publishing an individual grade. Only the new publication notice does.
export function gradeConsent(value) {
 if(value===undefined)return false;
 if(typeof value!=='boolean')throw new ApiError(400,'تحقق من اختيار مشاركة الدرجة.');
 return value;
}
export function publicGradeNotice(value) {
 if(value===undefined)return false;
 if(typeof value!=='boolean')throw new ApiError(400,'تحقق من تنبيه نشر الدرجة دون اسم.');
 return value;
}
