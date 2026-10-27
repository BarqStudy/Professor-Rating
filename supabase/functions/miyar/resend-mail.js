import {ApiError} from './security.js';

// The recipient and message content come from the saved request, never the client.
export function createResendMailer({key,from,request=fetch}){
 async function api(path,options={}){
  let response;
  try{response=await request('https://api.resend.com'+path,{...options,redirect:'error',headers:{Authorization:'Bearer '+key.trim(),'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});}
  catch{throw new ApiError(503,'تعذّر الاتصال بخدمة Resend. أعد المحاولة لاحقًا.');}
  if(!response.ok){
   const message=response.status===401?'رفضت Resend مفتاح الإرسال. راجع RESEND_API_KEY في أسرار Supabase.':response.status===403?'رفضت Resend صلاحية العملية. تأكد من توثيق نطاق الإرسال وصلاحية المفتاح؛ فحص النطاق يحتاج مفتاح Full access.':response.status===429?'بلغ الإرسال حد خدمة Resend مؤقتًا. راجع حدود حسابك وحاول لاحقًا.':response.status===422?'رفضت Resend إعدادات الرسالة. راجع عنوان RESEND_FROM_EMAIL وتوثيق نطاقه.':'تعذّر تنفيذ طلب البريد لدى Resend. أعد المحاولة لاحقًا.';
   throw new ApiError(503,message);
  }
  try{return await response.json();}catch{throw new ApiError(503,'تعذّر قراءة نتيجة خدمة Resend. أعد المحاولة لاحقًا.');}
 }
 return {
  async check(){
   const domain=from.split('@')[1].toLowerCase();
   const result=await api('/domains?limit=100');
   const found=result?.data?.find(item=>item.name?.toLowerCase()===domain);
   if(!found||found.status!=='verified')throw new ApiError(503,'نطاق الإرسال '+domain+' غير موثّق في Resend. أضف سجلات DNS التي تعرضها Resend وانتظر ظهور Verified. لا تغيّر سجلات استقبال بريدك الحالي.');
   return {ok:true,message:'نجح الاتصال بـ Resend ونطاق الإرسال موثّق. لم تُرسل رسالة أثناء الفحص؛ أرسل إشعار أحد الطلبات للتحقق من وصوله.'};
  },
  async send(message,id){
   const result=await api('/emails',{method:'POST',headers:{'Idempotency-Key':'miyar-institution-'+id},body:JSON.stringify({from:'مِعيار <'+from+'>',to:[message.to],subject:message.subject,text:message.text,...(message.replyTo?{reply_to:message.replyTo}:{}),headers:{'Message-ID':message.messageId}})});
   if(typeof result?.id!=='string'||!result.id)throw new ApiError(503,'لم تؤكد Resend قبول الرسالة. أعد المحاولة لاحقًا.');
  }
 };
}
