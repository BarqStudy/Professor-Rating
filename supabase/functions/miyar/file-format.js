import {ApiError} from './security.js';
export const FILE_LIMIT=20*1024*1024;
export async function readPlatformFile(file,limit=FILE_LIMIT){
 if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>limit)throw new ApiError(400,`ارفع PDF أو صورة PNG أو JPG بحجم لا يتجاوز ${limit/1024/1024} ميجابايت.`);
 const bytes=new Uint8Array(await file.arrayBuffer());let mime='',extension='';
 if(new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-'){mime='application/pdf';extension='pdf';}
 else if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)){mime='image/png';extension='png';}
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){mime='image/jpeg';extension='jpg';}
 if(!mime)throw new ApiError(400,'صيغة الملف غير مدعومة. ارفع PDF أو صورة PNG أو JPG.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const original=String(file.name||'file').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069/\\]/g,'').trim()||'file';
 const trimmed=Array.from(original).slice(0,110).join('');
 const name=/\.(pdf|png|jpe?g)$/i.test(trimmed)?trimmed.replace(/\.[^.]+$/,'.'+extension):trimmed+'.'+extension;
 return {bytes,mime,extension,sha256,name,size:bytes.length};
}
