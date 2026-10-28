import {ApiError,integer,text} from './security.js';
export async function majorAdministration(operation,body,actor,db){
 if(operation==='major.preview-delete')return db('rpc/miyar_major_removal_preview',{method:'POST',body:{p_id:integer(body.id,1,Number.MAX_SAFE_INTEGER,'التخصص')}});
 if(operation==='major.delete'){
  if(body.confirmed!==true)throw new ApiError(400,'حدّث لوحة الإدارة وأكّد إزالة التخصص بعد مراجعة السجلات المرتبطة.');
  const snapshot=text(body.snapshot,32,32,'تفاصيل تأكيد الحذف');if(!/^[a-f0-9]{32}$/.test(snapshot))throw new ApiError(400,'أعد فتح تأكيد حذف التخصص.');
  return db('rpc/miyar_delete_major',{method:'POST',body:{p_actor:actor,p_id:integer(body.id,1,Number.MAX_SAFE_INTEGER,'التخصص'),p_snapshot:snapshot}});
 }
 if(operation==='major.add')return db('rpc/miyar_add_major',{method:'POST',body:{p_actor:actor,p_college:integer(body.collegeId,1,Number.MAX_SAFE_INTEGER,'الكلية'),p_name:text(body.name,2,100,'التخصص')}});
 return null;
}
