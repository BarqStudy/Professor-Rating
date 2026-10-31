import {ApiError,integer,text} from './security.js';
export function doctorScopeRemoval(operation,body,admin,db){
 if(!['college','major'].includes(body.scope))throw new ApiError(400,'اختر كلية أو تخصصًا محددًا لحذف دكاترته.');
 const confirm=operation==='doctor.scope.remove';
 if(confirm&&body.confirm!==true)throw new ApiError(400,'أكّد حذف دكاترة النطاق المحدد أولًا.');
 const fingerprint=confirm?text(body.fingerprint,32,32,'معاينة الحذف'):null;
 if(confirm&&!/^[a-f0-9]{32}$/.test(fingerprint))throw new ApiError(400,'أعد مراجعة معاينة الحذف.');
 return db('rpc/miyar_doctor_scope_removal',{method:'POST',body:{p_admin:admin,p_scope:body.scope,p_id:integer(body.id,1,Number.MAX_SAFE_INTEGER,'الكلية أو التخصص'),p_confirm:confirm,p_fingerprint:fingerprint}});
}
