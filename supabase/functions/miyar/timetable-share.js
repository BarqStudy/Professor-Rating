import {normalizeTimetable} from './timetable-format.js';
import {ApiError} from './security.js';
export const validShareToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{12}$/.test(value);
export async function createTimetableShare(body,guest,db){
 let snapshot;try{snapshot=normalizeTimetable(body.schedule);}catch(e){throw new ApiError(400,e.message);}
 if(!snapshot.courses.length)throw new ApiError(400,'أضف مادة قبل مشاركة الجدول.');
 // Nine cryptographically random bytes yield a 12-character, URL-safe identifier.
 for(let attempt=0;attempt<3;attempt++){
  const token=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9)))).replace(/\+/g,'-').replace(/\//g,'_');
  try{return await db('rpc/miyar_create_timetable_share',{method:'POST',body:{p_guest:guest.id,p_token:token,p_snapshot:snapshot}});}
  catch(e){if(e.status!==409||attempt===2)throw e;}
 }
}
export async function readTimetableShare(body,db){
 if(!validShareToken(body.token))throw new ApiError(400,'رابط الجدول غير صالح.');
 const rows=await db(`miyar_timetable_shares?token=eq.${body.token}&select=snapshot&limit=1`);
 if(!rows[0])throw new ApiError(404,'لم نعثر على هذا الجدول. تأكد من اكتمال الرابط.');
 return {schedule:normalizeTimetable(rows[0].snapshot)};
}
