import {ApiError,integer} from './security.js';
const recipient='info@miyar.website';
const email=/^[A-Za-z0-9.!#$%&'*+\/=\?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
export function institutionMailStatus(env){
 const missing=['SMTP_USER','SMTP_PASSWORD'].filter(key=>!env[key]);
 const valid=Boolean(env.SMTP_USER&&email.test(env.SMTP_USER.trim()));
 return {configured:!missing.length&&valid,recipient,missing,message:missing.length?'أضف أسرار البريد في Supabase: '+missing.join('، '):!valid?'راجع صيغة SMTP_USER؛ يجب أن يكون عنوان بريد إلكتروني.':'إعدادات البريد موجودة. افحص الاتصال للتأكد من قبول تسجيل الدخول.'};
}
// Optional institution/email metadata must not disable professor moderation.
export async function institutionInbox(db,env){
 const result={institutionMail:institutionMailStatus(env),institutionRequests:[]};
 let rows;
 try{rows=await db('miyar_institution_requests?status=eq.pending&select=id,name,colleges,contact_email,request_kind,account_id,guest_id,created_at&order=created_at.asc&limit=100');if(!Array.isArray(rows))throw new Error('INVALID_INBOX');}
 catch{result.institutionRequestsError='تعذّر تحميل طلبات الجامعات والكليات. أعد تحديث القائمة.';return result;}
 result.institutionRequests=rows;
 const ids=rows.map(r=>r.id).filter(id=>Number.isSafeInteger(id)&&id>0);
 if(!ids.length)return result;
 try{
  const deliveries=await db(`miyar_institution_mail?request_id=in.(${ids.join(',')})&select=request_id,status,attempts,last_error,sent_at,retry_after`);
  if(!Array.isArray(deliveries))throw new Error('INVALID_MAIL_STATUS');
  const byId=new Map(deliveries.map(row=>[row.request_id,row]));
  result.institutionRequests=rows.map(row=>({...row,miyar_institution_mail:byId.get(row.id)||null}));
 }catch{result.institutionMail.deliveryError='تعذّر تحميل حالة إرسال البريد. الطلبات محفوظة ويمكن مراجعتها، ثم إعادة تحديث القائمة.';}
 return result;
}
export function mailError(error){
 if(error?.code==='EAUTH'||error?.responseCode===535)return 'رفض خادم البريد تسجيل الدخول. راجع SMTP_USER وكلمة مرور صندوق البريد في SMTP_PASSWORD.';
 if(error?.code==='EENVELOPE')return 'رفض خادم البريد عنوان المرسل أو المستلم. راجع صلاحية الإرسال من صندوق مِعيار.';
 return 'تعذّر الاتصال بخادم البريد أو إرسال الرسالة. حاول مجددًا وتحقق من إعدادات IONOS وTLS على المنفذ 465.';
}
export function institutionMessage(record,user){
 const colleges=Array.isArray(record.colleges)?record.colleges:[];
 const kind=record.request_kind==='university'?'جامعة':'كلية';
 const lines=['وصل طلب جديد إلى مِعيار','',`نوع الطلب: إضافة ${kind}`,`الجامعة: ${record.name}`,...colleges.flatMap(c=>[`الكلية: ${c.name}`,`التخصصات: ${(c.majors||[]).join('، ')||'لم تُذكر تخصصات'}`]),`بريد التواصل: ${record.contact_email||'لم يُذكر'}`,`رقم الطلب: ${record.id}`,'','راجع الطلب واعتمده أو ارفضه من لوحة الإدارة:','https://miyar.website/#admin'];
 return {from:{name:'مِعيار',address:user},to:recipient,...(email.test(record.contact_email||'')?{replyTo:record.contact_email}:{}),subject:`مِعيار — طلب إضافة ${kind}`,text:lines.join('\n'),messageId:`<institution-request-${record.id}@miyar.website>`,disableFileAccess:true,disableUrlAccess:true};
}
async function bounded(client,operation){
 let timer;
 try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>{client.close();reject(new Error('SMTP_TIMEOUT'));},14000);})]);}
 finally{clearTimeout(timer);}
}
export function createInstitutionMailer({db,env,transportFactory}){
 async function transport(){
  const config=institutionMailStatus(env);if(!config.configured)throw new ApiError(503,config.message);
  if(!transportFactory)throw new ApiError(503,'لم يكتمل إعداد إرسال البريد في الخادم.');
  // Supabase blocks outgoing 25/587. IONOS supports implicit TLS on 465.
  return transportFactory({host:'smtp.ionos.com',port:465,secure:true,auth:{user:env.SMTP_USER.trim(),pass:env.SMTP_PASSWORD},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:4000,greetingTimeout:4000,socketTimeout:8000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
 }
 async function deliver(id){
  if(!institutionMailStatus(env).configured)return {sent:false,pending:true};
  const claim=await db('rpc/miyar_claim_institution_mail',{method:'POST',body:{p_id:id}});
  if(!claim)return {sent:false,skipped:true,message:'أُرسلت الرسالة سابقًا أو يجري إرسالها. انتظر قليلًا قبل إعادة المحاولة.'};
  let client,sent=false,error=null;
  try{client=await transport();const result=await bounded(client,()=>client.sendMail(institutionMessage(claim.request,env.SMTP_USER.trim())));sent=Array.isArray(result.accepted)&&result.accepted.some(address=>String(address).toLowerCase()===recipient);if(!sent)throw new Error('Recipient not accepted');}
  catch(failure){error=mailError(failure);}
  finally{client?.close();}
  // A fenced update prevents a stale attempt from overwriting a newer lease.
  await db('rpc/miyar_finish_institution_mail',{method:'POST',body:{p_id:id,p_lease:claim.lease,p_sent:sent,p_error:error}});
  return {sent,message:sent?'قَبِل خادم البريد الرسالة إلى '+recipient+'؛ راجع الوارد والرسائل غير المرغوب فيها.':error};
 }
 return {deliver,async admin(operation,body){
  if(operation==='institution.mail.check'){
   let client;try{client=await transport();await bounded(client,()=>client.verify());return {ok:true,message:'نجح الاتصال الآمن وتسجيل الدخول إلى خادم IONOS. الإرسال الفعلي يظهر في حالة كل طلب.'};}catch(error){throw new ApiError(503,error instanceof ApiError?error.message:mailError(error));}finally{client?.close();}
  }
  if(operation==='institution.mail.retry'){
   if(!institutionMailStatus(env).configured)throw new ApiError(503,institutionMailStatus(env).message);
   return deliver(integer(body.id,1,Number.MAX_SAFE_INTEGER,'الطلب'));
  }
  return null;
 }};
}
