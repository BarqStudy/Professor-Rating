import {ApiError} from './security.js';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',typeof text==='string'?encoder.encode(text):text));
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const hmac=async(key,value)=>crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',typeof key==='string'?encoder.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']),encoder.encode(value));
const names=['R2_ACCOUNT_ID','R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
export function r2Configuration(env){
 const values=Object.fromEntries(names.map(name=>[name,typeof env[name]==='string'?env[name].trim():'']));
 const missing=names.filter(name=>!values[name]);
 const valid=!missing.length&&/^[a-f0-9]{32}$/i.test(values.R2_ACCOUNT_ID)&&/^(?!.*\.\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(values.R2_BUCKET_NAME)&&/^[A-Za-z0-9]{16,128}$/.test(values.R2_ACCESS_KEY_ID)&&values.R2_SECRET_ACCESS_KEY.length>=32&&values.R2_SECRET_ACCESS_KEY.length<=256;
 return {enabled:valid,missing,account:values.R2_ACCOUNT_ID,bucket:values.R2_BUCKET_NAME,accessKey:values.R2_ACCESS_KEY_ID,secretKey:values.R2_SECRET_ACCESS_KEY};
}
function requireConfig(config){if(!config.enabled)throw new ApiError(503,'تخزين R2 غير مفعّل بعد. أضف إعداداته الخاصة في أسرار Supabase ثم افحص الاتصال من لوحة الإدارة.');}
function objectUrl(config,key=''){
 requireConfig(config);
 if(key&&!/^miyar\/(files|study)\/[a-f0-9-]{36}\/[a-f0-9]{64}\.(pdf|png|jpg)$/.test(key))throw new ApiError(400,'معرّف الملف غير صالح.');
 return new URL(`https://${config.account}.r2.cloudflarestorage.com/${config.bucket}${key?'/'+key:''}`);
}
const time=now=>new Date(now).toISOString().replace(/[:-]|\.\d{3}/g,'');
async function signature(config,date,canonical){
 const scope=date.slice(0,8)+'/any/s3/aws4_request';
 const dateKey=await hmac('AWS4'+config.secretKey,date.slice(0,8)),regionKey=await hmac(dateKey,'any'),serviceKey=await hmac(regionKey,'s3'),signingKey=await hmac(serviceKey,'aws4_request');
 return {scope,value:hex(await hmac(signingKey,'AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+await digest(canonical)))};
}
const queryString=entries=>entries.map(([k,v])=>[encode(k),encode(String(v))]).sort(([ak,av],[bk,bv])=>ak<bk?-1:ak>bk?1:av<bv?-1:av>bv?1:0).map(([k,v])=>k+'='+v).join('&');
export async function signedR2Request(config,{method,key='',query=[],body,headers={},now=Date.now()}){
 const url=objectUrl(config,key),date=time(now),payloadHash=await digest(body||new Uint8Array());
 url.search=queryString(query);
 const canonicalHeaders={host:url.host,'x-amz-date':date,'x-amz-content-sha256':payloadHash};
 for(const [k,v]of Object.entries(headers))canonicalHeaders[k.toLowerCase()]=String(v).trim().replace(/\s+/g,' ');
 const keys=Object.keys(canonicalHeaders).sort(),signedHeaders=keys.join(';');
 const canonical=[method,url.pathname,queryString([...url.searchParams]),keys.map(k=>k+':'+canonicalHeaders[k]).join('\n')+'\n',signedHeaders,payloadHash].join('\n');
 const signed=await signature(config,date,canonical);
 const outgoing={...canonicalHeaders,Authorization:`AWS4-HMAC-SHA256 Credential=${config.accessKey}/${signed.scope}, SignedHeaders=${signedHeaders}, Signature=${signed.value}`};delete outgoing.host;
 return {url:url.href,options:{method,headers:outgoing,...(body?{body}:{})}};
}
function disposition(name){return `attachment; filename="miyar-file"; filename*=UTF-8''${encode(name)}`;}
export async function r2DownloadUrl(config,key,name,{now=Date.now(),expires=300}={}){
 const url=objectUrl(config,key),date=time(now),scope=date.slice(0,8)+'/any/s3/aws4_request';
 if(!Number.isInteger(expires)||expires<1||expires>900)throw new ApiError(400,'مدة رابط التنزيل غير صالحة.');
 const entries=[['X-Amz-Algorithm','AWS4-HMAC-SHA256'],['X-Amz-Credential',config.accessKey+'/'+scope],['X-Amz-Date',date],['X-Amz-Expires',expires],['X-Amz-SignedHeaders','host'],['response-content-disposition',disposition(name)]];
 const canonical=['GET',url.pathname,queryString(entries),'host:'+url.host+'\n','host','UNSIGNED-PAYLOAD'].join('\n');
 const signed=await signature(config,date,canonical);entries.push(['X-Amz-Signature',signed.value]);
 url.search=queryString(entries);return {url:url.href,expiresAt:new Date(Number(now)+expires*1000).toISOString()};
}
export async function putR2File(config,key,file,fetcher=fetch){
 const request=await signedR2Request(config,{method:'PUT',key,body:file.bytes,headers:{'content-type':file.mime,'content-disposition':disposition(file.name),'x-amz-meta-sha256':file.sha256}});
 let response;try{response=await fetcher(request.url,{...request.options,signal:AbortSignal.timeout(45000),redirect:'error'});}catch{throw new ApiError(503,'تعذّر إكمال رفع الملف إلى R2. أعد المحاولة بنفس الملف.');}
 if(!response.ok){await response.body?.cancel();throw new ApiError(response.status===429?429:503,response.status===403?'رفض R2 الرفع. راجع صلاحية Object Read & Write للحاوية المحددة.':'تعذّر حفظ الملف في R2. راجع إعدادات الحاوية ثم أعد المحاولة.');}
 const etag=(response.headers.get('etag')||'').slice(0,256);await response.body?.cancel();return etag;
}
function providerFailure(body,config){
 // Parse only bounded Code/Message fields, never entire XML/HTML or resources.
 let code=body.match(/<(?:[\w]+:)?Code>\s*([A-Za-z]+)\s*<\/(?:[\w]+:)?Code>/)?.[1],message=body.match(/<(?:[\w]+:)?Message>([\s\S]*?)<\/(?:[\w]+:)?Message>/)?.[1]||'';
 try{const data=JSON.parse(body),error=data?.errors?.[0]||data?.error;code=typeof error?.code==='string'?error.code:code;message=typeof error?.message==='string'?error.message:message;}catch{/* R2 normally sends XML. */}
 message=message.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const value=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return value<=0x10ffff?String.fromCodePoint(value):'';}).replace(/&(lt|gt|quot|apos|amp);/g,(_,n)=>({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'})[n]);
 for(const value of [config.secretKey,config.accessKey,config.account,config.bucket]){
  if(!value)continue;
  for(const variant of [value,encodeURIComponent(value)])message=message.replace(new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'[محجوب]');
 }
 message=message.replace(/\b(?:cfat_[A-Za-z0-9_-]+|[a-f0-9]{32,}|[A-Za-z0-9_+\/-]{40,}={0,2})\b/gi,'[محجوب]').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,350);
 return {code,message};
}
export async function checkR2(env,fetcher=fetch){
 const config=r2Configuration(env);
 if(!config.enabled)return {provider:'r2',configured:false,ready:false,missing:config.missing,message:config.missing.length?'أضف إعدادات R2 في أسرار Supabase: '+config.missing.join('، '):'إعدادات R2 غير صالحة. راجع معرّف الحساب واسم الحاوية والمفاتيح.'};
 // List at most one object: object-scoped R2 credentials can list their bucket,
 // and S3 returns a useful error code in XML (HEAD discards that explanation).
 const request=await signedR2Request(config,{method:'GET',query:[['list-type','2'],['max-keys','1']]});
 try{
  const response=await fetcher(request.url,{...request.options,signal:AbortSignal.timeout(12000),redirect:'manual'});
  if(response.ok){await response.body?.cancel();return {provider:'r2',configured:true,ready:true,httpStatus:response.status,message:'تم الاتصال بحاوية R2. يمكنك رفع الملفات؛ فحص الاتصال لم ينشئ أي ملف.'};}
  const explanations={
   InvalidAccessKeyId:'مفتاح Access Key ID غير صحيح أو محذوف. احفظ مفتاح S3 من صفحة R2 API Tokens، وليس API Token العام.',
   SignatureDoesNotMatch:'التوقيع غير مطابق. أعد حفظ Access Key ID وSecret Access Key من زوج S3 نفسه؛ لا تستخدم API Token بدل Secret Access Key.',
   AccessDenied:'رفض R2 الوصول. امنح المفتاح صلاحية Object Read & Write للحاوية المحددة وفي الحساب نفسه.',
   NoSuchBucket:'حاوية R2 غير موجودة. راجع اسم الحاوية ومعرّف الحساب.',
   InvalidBucketName:'اسم حاوية R2 غير صحيح. استخدم اسم الحاوية فقط دون رابط.',
   AuthorizationHeaderMalformed:'بيانات توقيع R2 غير مقبولة. راجع معرّف الحساب وزوج مفاتيح S3.',
   InvalidArgument:'رفض R2 أحد حقول الطلب. راجع التفاصيل المرفقة لتحديد الحقل.',
   InvalidRequest:'صيغة طلب R2 غير مقبولة. راجع التفاصيل المرفقة.',
   AccountProblem:'يوجد قيد على حساب Cloudflare. راجع تفعيل R2 وحالة الحساب في لوحة Cloudflare.',
   RequestTimeTooSkewed:'وقت خادم الطلب لا يطابق وقت R2. أعد الفحص، وإذا استمر الخطأ راجع وقت الخادم.',
   RequestExpired:'انتهت صلاحية توقيع الطلب. أعد فحص الاتصال.',
   ExpiredToken:'انتهت صلاحية مفتاح R2. أنشئ زوج مفاتيح S3 جديدًا للحاوية.',
   InvalidToken:'رمز R2 غير صالح. استخدم Access Key ID وSecret Access Key الخاصين بـS3.',
   PermanentRedirect:'عنوان R2 لا يطابق موقع الحاوية. راجع S3 API endpoint والحساب وإعداد Jurisdiction في Cloudflare.',
   SlowDown:'R2 يطلب تقليل عدد الطلبات. انتظر قليلًا ثم أعد الفحص.',
  };
  // Never reflect raw XML, resources, credentials, or arbitrary error codes.
  const reader=response.body?.getReader();let xml='',size=0;
  try{if(reader){const decoder=new TextDecoder();while(size<8192){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,8192-size);size+=part.length;xml+=decoder.decode(part,{stream:true});}}}finally{await reader?.cancel();}
  const {code:candidate,message:providerMessage}=providerFailure(xml,config);
  const errorCode=candidate&&Object.hasOwn(explanations,candidate)?candidate:null;
  const fallback=response.status===403?explanations.AccessDenied:response.status===404?explanations.NoSuchBucket:response.status>=300&&response.status<400?explanations.PermanentRedirect:response.status===429||response.status>=500?'خدمة R2 غير متاحة مؤقتًا. أعد الفحص لاحقًا.':'راجع معرّف الحساب واسم الحاوية وزوج مفاتيح S3؛ يجب أن يكون المفتاحان من عملية الإنشاء نفسها.';
  return {provider:'r2',configured:true,ready:false,httpStatus:response.status,...(errorCode?{errorCode}:{}),message:`فشل فحص R2 (HTTP ${response.status}${errorCode?' · '+errorCode:''}). ${errorCode?explanations[errorCode]:fallback}${providerMessage?' تفاصيل R2: '+providerMessage:''}`};
 }catch{return {provider:'r2',configured:true,ready:false,message:'تعذّر الاتصال بـR2 أثناء الفحص. أعد المحاولة.'};}
}
