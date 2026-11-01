import {ApiError,integer} from './security.js';
import {institutionMailStatus,mailError} from './institution-mail.js';
import {createResendMailer} from './resend-mail.js';
const validEmail=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function rejectionMessage(record,from,id){
 return {from:{name:'مِعيار',address:from},to:record.recipient,replyTo:'info@miyar.website',
  subject:'مِعيار — سبب رفض تقييمك',
  text:['تمت مراجعة تقييمك في مِعيار.',`الدكتور: ${record.doctor}`,`المادة: ${record.subject}`,'','سبب الرفض:',record.reason,'','يمكنك مراجعة السبب من الإعدادات ← تقييماتي وطلبات التعديل.','https://miyar.website/#ratings'].join('\n'),
  messageId:`<review-rejection-${id}@miyar.website>`,disableFileAccess:true,disableUrlAccess:true};
}
export function createReviewRejectionMailer({db,env,transportFactory,mailFetch=fetch}){
 // Institution inbox routing must never affect a student's verified recipient.
 const settings=()=>{
  const shared={...env,INSTITUTION_NOTIFICATION_EMAIL:'info@miyar.website'},config=institutionMailStatus(shared);
  // A configured mailbox can deliver student mail when Resend is still in test mode.
  return config.testSender&&env.SMTP_USER&&env.SMTP_PASSWORD?institutionMailStatus({...shared,RESEND_API_KEY:undefined}):config;
 };
 function status(){const config=settings();return {configured:config.configured&&!config.testSender,provider:config.provider,message:config.testSender?'إرسال أسباب الرفض للطلاب يحتاج مرسلًا من نطاق موثّق؛ المرسل التجريبي لا يدعم ذلك.':config.message};}
 async function deliver(id){
  const claim=await db('rpc/miyar_claim_review_rejection_mail',{method:'POST',body:{p_id:id}});
  if(!claim)return {sent:false,skipped:true};
  let client,sent=false,error=null,timer;
  try{
   const config=settings(),readiness=status();
   if(!readiness.configured)throw new ApiError(503,readiness.message);
   if(typeof claim.recipient!=='string'||claim.recipient.length>254||!validEmail.test(claim.recipient))throw new ApiError(503,'لا يوجد بريد موثّق صالح لصاحب التقييم.');
   const message=rejectionMessage(claim,config.from||env.SMTP_USER.trim(),id);
   if(config.provider==='resend'){
    await createResendMailer({key:env.RESEND_API_KEY,from:config.from,request:mailFetch,category:'review-rejection'}).send(message,id);sent=true;
   }else{
    if(!transportFactory)throw new ApiError(503,'لم يكتمل إعداد إرسال البريد في الخادم.');
    client=await transportFactory({host:'smtp.ionos.com',port:465,secure:true,auth:{user:env.SMTP_USER.trim(),pass:env.SMTP_PASSWORD},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:4000,greetingTimeout:4000,socketTimeout:8000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
    const result=await Promise.race([client.sendMail(message),new Promise((_,reject)=>{timer=setTimeout(()=>{try{client.close();}catch{}reject(new Error('SMTP_TIMEOUT'));},14000);})]);
    sent=Array.isArray(result.accepted)&&result.accepted.some(address=>String(address).toLowerCase()===claim.recipient.toLowerCase());
    if(!sent)throw new Error('RECIPIENT_NOT_ACCEPTED');
   }
  }catch(failure){error=failure instanceof ApiError?failure.message:settings().provider==='smtp'?mailError(failure):'تعذّر إرسال إشعار الرفض عبر Resend. أعد المحاولة لاحقًا.';}
  finally{clearTimeout(timer);try{client?.close();}catch{}}
  await db('rpc/miyar_finish_review_rejection_mail',{method:'POST',body:{p_id:id,p_lease:claim.lease,p_sent:sent,p_error:error}});
  return {sent,message:sent?'قَبِلت خدمة البريد رسالة سبب الرفض.':error};
 }
 return {status,deliver,async admin(operation,body){
  if(operation==='review.rejection-mail.list')return {rows:await db('rpc/miyar_review_rejection_mail_list',{method:'POST',body:{}}),mail:status()};
  if(operation==='review.rejection-mail.retry')return deliver(integer(body.id,1,Number.MAX_SAFE_INTEGER,'التقييم'));
  return null;
 }};
}
