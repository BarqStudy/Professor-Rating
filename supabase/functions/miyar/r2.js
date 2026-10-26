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
export async function signedR2Request(config,{method,key='',body,headers={},now=Date.now()}){
 const url=objectUrl(config,key),date=time(now),payloadHash=await digest(body||new Uint8Array());
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
export async function checkR2(env,fetcher=fetch){
 const config=r2Configuration(env);
 if(!config.enabled)return {provider:'r2',configured:false,ready:false,missing:config.missing,message:config.missing.length?'أضف إعدادات R2 في أسرار Supabase: '+config.missing.join('، '):'إعدادات R2 غير صالحة. راجع معرّف الحساب واسم الحاوية والمفاتيح.'};
 const request=await signedR2Request(config,{method:'HEAD'});
 try{
  const response=await fetcher(request.url,{...request.options,signal:AbortSignal.timeout(12000),redirect:'error'});await response.body?.cancel();
  return {provider:'r2',configured:true,ready:response.ok,message:response.ok?'تم الاتصال بحاوية R2. يمكنك رفع الملفات؛ فحص الاتصال لم ينشئ أي ملف.':response.status===403?'رفض R2 الوصول. راجع المفاتيح وصلاحيات الحاوية.':response.status===404?'حاوية R2 غير موجودة. راجع اسم الحاوية والحساب.':'لم يقبل R2 فحص الاتصال. أعد المحاولة لاحقًا.'};
 }catch{return {provider:'r2',configured:true,ready:false,message:'تعذّر الاتصال بـR2 أثناء الفحص. أعد المحاولة.'};}
}
