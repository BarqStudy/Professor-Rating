import {repairChoiceRows} from './plan-choices.js';
// Deterministic OCR/format repairs. Academic conflicts still require review.
const digits=value=>value.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0)));
const clean=value=>typeof value==='string'?value.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\s+/g,' ').trim():value;
export function repairCourseCode(value){
 if(typeof value!=='string')return value;
 let code=digits(clean(value)).replace(/[ـ\u064b-\u065f\u0670]/g,'').replace(/[‐‑‒–—−]/g,'-').replace(/^[\s([{"'«]+|[\s)\]}"'»،,؛;]+$/g,'').trim();
 code=code.replace(/^(?:رمز\s*(?:المقرر|المادة)|course\s*code)\s*[:：]\s*/i,'').toUpperCase();
 const standard=code.match(/^([\p{L}][\p{L}\s]*)[\s._-]*(\d+[A-Z]?)$/u);
 if(standard)code=standard[1].replace(/\s/g,'')+' '+standard[2];
 const reversed=code.match(/^(\d+)\s+([\p{Script=Arabic}]+)$/u);
 if(reversed)code=reversed[2]+' '+reversed[1];
 return code.replace(/\s+/g,' ').trim();
}
const absent=value=>/^(?:[-—–]|لا\s*يوجد|لا\s*شيء|بدون|none|null|n\/?a)$/i.test(String(value).trim());
const refs=value=>{
 const rows=Array.isArray(value)?value:typeof value==='string'?value.split(/[,،;؛\n]+/):value==null?[]:value;
 return Array.isArray(rows)?[...new Set(rows.filter(v=>!absent(v)).map(repairCourseCode))]:rows;
};
const numeric=value=>typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(digits(value.trim()))?Number(digits(value.trim())):value;
export function repairPlanDraft(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {draft:input,corrections:[]};
 const draft={...input},corrections=[];
 const record=message=>{if(corrections.length<30&&!corrections.includes(message))corrections.push(message);};
 for(const field of ['title','fileLabel','scopeNote'])draft[field]=clean(draft[field]);
 if(Array.isArray(draft.warnings))draft.warnings=draft.warnings.map(clean).filter(Boolean);
 if(!Array.isArray(input.courses))return {draft,corrections};
 const courses=[];
 for(const original of input.courses){
  if(!original||typeof original!=='object'||Array.isArray(original)){courses.push(original);continue;}
  const row={...original,code:repairCourseCode(original.code),name:clean(original.name),pool:clean(original.pool),review:clean(original.review)};
  for(const field of ['prerequisites','corequisites','anyPrerequisites'])row[field]=refs(original[field]);
  for(const field of ['level','credits','minimumCredits','completedLevel','page'])row[field]=numeric(row[field]);
  if(row.allPrevious==null)row.allPrevious=false;
  if(typeof row.allPrevious==='string'&&/^(true|false)$/i.test(row.allPrevious))row.allPrevious=row.allPrevious.toLowerCase()==='true';
  if(row.kind==='مقرر')row.kind='course';
  if(row.kind==='خانة متطلب')row.kind='slot';
  if(row.code!==original.code)record('وُحّدت رموز المقررات والأرقام والمسافات تلقائيًا.');
  if(['prerequisites','corequisites','anyPrerequisites'].some(k=>JSON.stringify(row[k])!==JSON.stringify(original[k])))record('وُحّدت رموز المتطلبات وحُذفت الفراغات والعناصر المكررة.');
  if(['level','credits','minimumCredits','completedLevel'].some(k=>row[k]!==original[k]))record('حُوّلت الأرقام النصية والعربية إلى قيم رقمية.');
  const previous=row.kind==='course'&&typeof row.code==='string'?courses.find(c=>c?.kind==='course'&&typeof c.code==='string'&&c.code.replace(/\s/g,'')===row.code?.replace(/\s/g,'')):null;
  if(previous&&(previous.name===row.name||typeof previous.name==='string'&&typeof row.name==='string'&&(/[ء-ي]/.test(previous.name)!==/[ء-ي]/.test(row.name)||previous.name.toLowerCase()===row.name.toLowerCase()))&&['level','credits','pool','requirementType','minimumCredits','completedLevel','allPrevious'].every(k=>(previous[k]??null)===(row[k]??null))&&['prerequisites','corequisites','anyPrerequisites'].every(k=>JSON.stringify(previous[k])===JSON.stringify(row[k]))){
   if(!/[ء-ي]/.test(previous.name)&&/[ء-ي]/.test(row.name))previous.name=row.name;
   record('دُمجت الصفوف المكررة للمقرر نفسه بعد مطابقة الساعات والمستوى والمتطلبات.');continue;
  }
  courses.push(row);
 }
 draft.courses=repairChoiceRows(courses,input.requirementLists===true,record);
 return {draft,corrections};
}
