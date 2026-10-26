import {ApiError,uuid} from './security.js';
import {readPlatformFile} from './file-format.js';
import {r2Configuration,putR2File,r2DownloadUrl,checkR2} from './r2.js';
const rpc=(db,name,body)=>db('rpc/'+name,{method:'POST',body});
export async function storePlatformFile(file,admin,db,env,fetcher=fetch,{id=crypto.randomUUID(),purpose='files'}={}){
 const config=r2Configuration(env);if(!config.enabled)throw new ApiError(503,'أكمل إعداد R2 في أسرار Supabase قبل حفظ الملفات.');
 const record=await rpc(db,'miyar_begin_file_upload',{p_id:uuid(id,'معرّف الملف'),p_actor:admin,p_name:file.name,p_mime:file.mime,p_size:file.size,p_sha256:file.sha256,p_purpose:purpose});
 if(record.status!=='ready'){
  try{const etag=await putR2File(config,record.object_key,file,fetcher);await rpc(db,'miyar_finish_file_upload',{p_id:record.id,p_actor:admin,p_etag:etag});}
  catch(error){await rpc(db,'miyar_fail_file_upload',{p_id:record.id,p_actor:admin}).catch(()=>{});throw error;}
 }
 return {id:record.id,name:record.name,size:record.byte_size,mime:record.mime_type,status:'ready',provider:'r2'};
}
export async function uploadPlatformFile(form,admin,db,env,fetcher=fetch){
 const id=uuid(form.get('id'),'معرّف الملف'),file=await readPlatformFile(form.get('file'));
 return storePlatformFile(file,admin,db,env,fetcher,{id});
}
export async function adminFiles(operation,body,admin,db,env,fetcher=fetch){
 if(operation==='storage.status'){
  const config=r2Configuration(env);return {provider:'r2',configured:config.enabled,missing:config.missing,message:config.enabled?'إعدادات R2 موجودة. افحص الاتصال للتحقق من الحاوية والصلاحيات.':config.missing.length?'تخزين الملفات ينتظر إعداد R2 في أسرار Supabase.':'إعدادات R2 تحتاج تصحيحًا قبل الرفع.'};
 }
 if(operation==='storage.check')return checkR2(env,fetcher);
 if(operation==='files.list')return db('miyar_files?select=id,name,mime_type,byte_size,purpose,status,created_at&order=created_at.desc&limit=100');
 if(operation==='files.download'){
  const id=uuid(body.id,'معرّف الملف'),rows=await db(`miyar_files?id=eq.${id}&status=eq.ready&select=object_key,name`);
  if(!rows.length)throw new ApiError(404,'الملف غير متاح للتنزيل.');
  return r2DownloadUrl(r2Configuration(env),rows[0].object_key,rows[0].name);
 }
 return null;
}
