import {ApiError,integer,text} from './security.js';
import {repairCourseCode,repairPlanDraft} from './plan-repair.js';
const arabic=/[ء-ي]/u;
const arabicOnly=/^[\p{Script=Arabic}\p{M}\p{N}\p{P}\p{Zs}\s]+$/u;
export const PLAN_COURSE_LIMIT=240;
const issue=message=>new ApiError(400,message);
const codeKey=value=>value.toUpperCase().replace(/\s/g,'');
export function arabicLabel(value,min,max,label){
 const clean=text(value,min,max,label);
 if(!arabic.test(clean)||!arabicOnly.test(clean))throw issue(`${label}: اكتب النص بالعربية فقط.`);
 return clean;
}
export function courseLabel(value,min,max,label){
 const clean=text(value,min,max,label);
 if(!/[ء-يA-Za-z]/u.test(clean)||!(/^[\p{Script=Arabic}\p{Script=Latin}\p{M}\p{N}\p{P}\p{Zs}\s+&]+$/u).test(clean))throw issue(`${label}: اكتب اسم مقرر صالحًا بالعربية أو الإنجليزية.`);
 return clean;
}
export function planCode(value,label='رمز المقرر'){
 const code=text(repairCourseCode(value),1,50,label);
 if(!/^[\p{L}\p{N}\s._/-]+$/u.test(code))throw issue(`تحقق من ${label}.`);
 return code;
}
function list(value,label){
 if(!Array.isArray(value)||value.length>12)throw issue(`تحقق من ${label}.`);
 return [...new Set(value.map(code=>planCode(code,label)))];
}
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function normalizePublishedPlan(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw issue('تحقق من بيانات الخطة.');
 const repaired=repairPlanDraft(input);input=repaired.draft;
 const id=typeof input.id==='string'&&/^plan-[a-f0-9-]{36}$/.test(input.id)?input.id:null;
 if(!id)throw issue('أعد قراءة ملف الخطة قبل حفظه.');
 const title=arabicLabel(input.title,2,100,'اسم الخطة');
 const fileLabel=text(input.fileLabel,1,80,'إصدار الخطة');
 const scopeNote=input.scopeNote?arabicLabel(input.scopeNote,2,240,'نطاق الخطة'):'';
 if(!Array.isArray(input.courses)||!input.courses.length||input.courses.length>PLAN_COURSE_LIMIT)throw issue('يجب أن تحتوي الخطة على ١ إلى ٢٤٠ مقررًا.');
 if(!/^[a-f0-9]{64}$/.test(input.sha256||''))throw issue('أعد قراءة ملف الخطة قبل حفظه.');
 const courses=[],codes=new Map(),groupNames=new Map(),groupTypes=new Map();
 if(input.requirementLists!=null&&typeof input.requirementLists!=='boolean')throw issue('تحقق من خيار قوائم المتطلبات.');
 const requirementLists=input.requirementLists===true;
 for(const [index,row] of input.courses.entries()){
  const label=`المقرر ${index+1}`;
  if(!row||typeof row!=='object'||Array.isArray(row))throw issue(`تحقق من ${label}.`);
  const kind=row.kind==='slot'?'slot':row.kind==='course'?'course':null;
  if(!kind)throw issue(`${label}: اختر نوع المقرر.`);
  const name=courseLabel(row.name,2,120,`${label} — الاسم`);
  const code=planCode(row.code,`${label} — الرمز`);
  const credits=row.credits===null?null:integer(row.credits,0,30,`${label} — الساعات`);
  const level=integer(row.level,0,20,`${label} — المستوى`);
  const pool=row.pool?arabicLabel(row.pool,2,100,`${label} — المجموعة الاختيارية`):null;
  const requirementType=row.requirementType||null;
  if(![null,'university','required'].includes(requirementType))throw issue(`${label}: اختر قائمة متطلبات صحيحة.`);
  if(requirementType&&(!requirementLists||!pool||(kind==='course'&&level!==0)))throw issue(`${label}: فعّل قوائم المتطلبات وحدد الخانة أو مادة القائمة بالمستوى صفر.`);
  if(pool&&groupTypes.has(pool)&&groupTypes.get(pool)!==requirementType)throw issue(`${label}: افصل قائمة متطلبات الجامعة عن قائمة المقررات الإجبارية والاختيارية.`);
  if(pool)groupTypes.set(pool,requirementType);
  if((kind==='slot'||level===0)&&!pool)throw issue(`تعذّر ربط «${name}» بقائمة واحدة من الملف. أعد قراءة الخطة مع صفحات القوائم كاملة؛ اختيار المادة لاحقًا للطالب.`);
  if(kind==='slot'&&level===0)throw issue(`${label}: حدد مستوى المتطلب الاختياري.`);
  const prerequisites=list(row.prerequisites,`${label} — المتطلبات السابقة`),corequisites=list(row.corequisites,`${label} — المتطلبات المتزامنة`),anyPrerequisites=list(row.anyPrerequisites,`${label} — المتطلبات البديلة`);
  if(kind==='course'&&codes.has(codeKey(code)))throw issue(`${label}: الرمز ${code} مكرر؛ راجع المواد المكررة قبل الحفظ.`);
  if(kind==='course')codes.set(codeKey(code),code);
  if([...prerequisites,...corequisites,...anyPrerequisites].some(value=>codeKey(value)===codeKey(code)))throw issue(`${label}: المقرر لا يمكن أن يكون متطلبًا لنفسه.`);
  if(pool)groupNames.set(pool,'group-'+(await hash(pool)).slice(0,16));
  const review=row.review?arabicLabel(row.review,2,300,`${label} — الملاحظة`):null;
  if(row.allPrevious!==true&&row.allPrevious!==false)throw issue(`${label}: تحقق من شرط إكمال المقررات السابقة.`);
  const course={id:id+'/c-'+(await hash(kind==='course'?codeKey(code):`${code}:${name}:${index}`)).slice(0,20),code,name,credits,level,kind,pool:pool?groupNames.get(pool):null,
   prerequisites,corequisites,anyPrerequisites,...(requirementType?{requirementType}:{}),linkable:kind==='course',review,
   ...(row.minimumCredits==null?{}:{minimumCredits:integer(row.minimumCredits,1,400,`${label} — الحد الأدنى للساعات`)}),
   ...(row.completedLevel==null?{}:{completedLevel:integer(row.completedLevel,1,20,`${label} — المستوى المطلوب`)}),
   ...(row.allPrevious?{allPrevious:true}:{}),page:Number.isInteger(row.page)&&row.page>0&&row.page<=200?row.page:1};
  courses.push(course);
 }
 for(const course of courses){
  for(const field of ['prerequisites','corequisites','anyPrerequisites'])course[field]=course[field].map(code=>codes.get(codeKey(code))||code);
  if(course.completedLevel&&course.level>0&&course.completedLevel>=course.level)throw issue(`المقرر «${course.name}»: شرط المستوى يتضمن المقرر نفسه؛ راجعه قبل الحفظ.`);
 }
 const byCode=new Map(courses.filter(c=>c.kind==='course').map(c=>[c.code,c])),visiting=new Set(),visited=new Set();
 function visit(course){if(visited.has(course.code))return;if(visiting.has(course.code))throw issue(`يوجد تعارض دائري في متطلبات «${course.name}»؛ صححه قبل الحفظ.`);visiting.add(course.code);for(const code of course.prerequisites){const previous=byCode.get(code);if(previous)visit(previous);}visiting.delete(course.code);visited.add(course.code);}
 for(const course of byCode.values())visit(course);
 if(!courses.some(c=>c.level>0))throw issue('الخطة تحتاج مقررات أساسية بمستويات محددة.');
 for(const course of courses.filter(c=>c.kind==='slot')){
  const alternatives=courses.filter(c=>c.level===0&&c.kind==='course'&&c.pool===course.pool);
  if(course.credits===null)throw issue(`لم تتضح ساعات المتطلب «${course.name}» لمطابقتها بالبدائل. أعد قراءة صفحة الخانة من الملف الأصلي.`);
  if(!alternatives.length)throw issue(`لم تُقرأ بدائل المجموعة المرتبطة بالمتطلب «${course.name}». أعد القراءة بصفحات قوائم الاختيار كاملة.`);
  if(!alternatives.some(c=>c.credits===course.credits)){
   const hours=[...new Set(alternatives.map(c=>c.credits===null?'غير واضحة':String(c.credits)))].join('، ');
   throw issue(`المتطلب «${course.name}» مسجل بـ ${course.credits} ساعات، بينما ساعات بدائل مجموعته: ${hours}. أعد قراءة الخانة وقائمتها للتحقق؛ لا تُغيّر الساعات لتجاوز الخطأ.`);
  }
 }
 for(const [name,type] of groupTypes)if(type&&!courses.some(c=>c.kind==='slot'&&c.pool===groupNames.get(name)))throw issue(`القائمة «${name}» تحتاج خانة متطلب مرتبطة بها في الخطة.`);
 const warnings=Array.isArray(input.warnings)?input.warnings.slice(0,30).map(w=>arabicLabel(w,2,300,'ملاحظة الخطة')):[];
 courses.sort((a,b)=>(a.level||99)-(b.level||99));
 return {id,title,fileLabel,version:fileLabel,versionKey:fileLabel.normalize('NFKC').toLowerCase().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0))).replace(/\s+/g,' '),scopeNote,sha256:input.sha256,managed:'admin',requirementLists,firstLevel:Math.min(...courses.filter(c=>c.level>0).map(c=>c.level)),
  courses,autoCorrections:repaired.corrections,notes:[...warnings,...repaired.corrections],groups:[...groupNames].map(([name,id])=>({id,name,...(groupTypes.get(name)?{requirementType:groupTypes.get(name)}:{}),slots:courses.filter(c=>c.kind==='slot'&&c.pool===id).map(c=>c.id)})),uncertainCredits:courses.some(c=>c.credits===null)};
}
