import {ApiError,integer,text} from './security.js';
import {courseLabel,planCode,arabicLabel,PLAN_COURSE_LIMIT} from './plan-format.js';
const key=value=>value.toUpperCase().replace(/\s/g,'');
const fail=message=>{throw new ApiError(400,message);};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const references=(value,label)=>{
 if(!Array.isArray(value)||value.length>12)fail(`تحقق من ${label}.`);
 return [...new Set(value.map(code=>planCode(code,label)))];
};
export function editablePlanId(value){const id=text(value,3,80,'الخطة');if(!/^[a-z0-9-]+$/.test(id))fail('تحقق من معرّف الخطة.');return id;}
export async function loadEditablePlan(id,db){
 const rows=await db(`miyar_study_plans?id=eq.${editablePlanId(id)}&deleted_at=is.null&select=id,metadata,revision`);
 if(!rows?.length)throw new ApiError(404,'الخطة غير موجودة.');
 return {plan:rows[0].metadata,revision:rows[0].revision};
}
export function editorGroups(plan){
 const groups=[...(plan.groups||[])];
 for(const row of plan.courses||[])if(row.pool&&!groups.some(group=>group.id===row.pool))groups.push({id:row.pool,name:'قائمة مواد إضافية',slots:[]});
 return groups;
}
// Published identities are retained even when codes, hours or levels change.
// Legacy source ambiguities may remain unchanged; edits cannot introduce them.
export async function normalizeEditedPlan(base,draft,revision){
 if(!draft||!Array.isArray(draft.courses)||!draft.courses.length||draft.courses.length>PLAN_COURSE_LIMIT)fail('الخطة تحتاج من ١ إلى ٢٤٠ مقررًا وخانة.');
 const originals=new Map(base.courses.map(row=>[row.id,row])),seen=new Set(),courses=[],groups=editorGroups(base);
 const groupIds=new Set(groups.map(group=>group.id));
 const occupied=new Set(draft.courses.filter(Boolean).map(row=>String(row.code||'').toUpperCase().replace(/\s/g,'')));
 for(const [index,row] of draft.courses.entries()){
  const label=`المقرر ${index+1}`;
  if(!row||typeof row!=='object'||Array.isArray(row))fail(`تحقق من ${label}.`);
  const old=row.id?originals.get(row.id):null;
  if(row.id&&!old||row.id&&seen.has(row.id))fail(`${label}: معرّف غير صالح أو مكرر. أعد تحميل الخطة.`);
  const kind=row.kind;if(!['course','slot'].includes(kind)||old&&kind!==old.kind)fail(`${label}: لا تغيّر نوع بند قائم؛ أضف بندًا جديدًا بدلًا منه.`);
  const id=old?.id||base.id+'/c-'+(await digest('edit:'+revision+':'+index+':'+row.code)).slice(0,20);seen.add(id);
  let rawCode=row.code;
  if(kind==='slot'&&(!rawCode||typeof rawCode==='string'&&rawCode.includes('*'))){let serial=index+1;do{rawCode='CHOICE '+serial++;}while(occupied.has(key(rawCode)));occupied.add(key(rawCode));}
  const code=planCode(rawCode,`${label} — الرمز`),name=courseLabel(row.name,2,120,`${label} — الاسم`);
  const level=integer(row.level,0,20,`${label} — المستوى`),credits=row.credits===null?null:integer(row.credits,0,30,`${label} — الساعات`);
  const pool=row.pool||null;
  if(pool&&!groupIds.has(pool))fail(`${label}: اختر قائمة موجودة في الخطة.`);
  const type=groups.find(group=>group.id===pool)?.requirementType||null;
  if(kind==='slot'&&(!pool||!level)||kind==='course'&&level===0&&!pool&&!(old?.level===0&&!old.pool))fail(`${label}: حدد قائمة البدائل ومستوى خانة الاختيار.`);
  if(type&&(!base.requirementLists||kind==='course'&&level!==0))fail(`${label}: مواد قائمة المتطلبات تكون في المستوى صفر.`);
  const course={id,code,name,kind,level,credits,pool,linkable:kind==='course',
   prerequisites:references(row.prerequisites,`${label} — المتطلبات السابقة`),corequisites:references(row.corequisites,`${label} — المتطلبات المتزامنة`),anyPrerequisites:references(row.anyPrerequisites||[],`${label} — المتطلبات البديلة`),
   review:row.review?arabicLabel(row.review,2,300,`${label} — الملاحظة`):null,page:old?.page||1,
   ...(type?{requirementType:type}:{}),...(row.minimumCredits==null?{}:{minimumCredits:integer(row.minimumCredits,1,400,`${label} — شرط الساعات`)}),
   ...(row.completedLevel==null?{}:{completedLevel:integer(row.completedLevel,1,20,`${label} — شرط المستوى`)}),...(row.allPrevious===true?{allPrevious:true}:{})};
  if(row.allPrevious!=null&&typeof row.allPrevious!=='boolean')fail(`${label}: تحقق من شرط المقررات السابقة.`);
  courses.push(course);
 }
 const byCode=new Map();for(const course of courses.filter(row=>row.kind==='course')){const code=key(course.code);if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(course);}
 for(const rows of byCode.values())if(rows.length>1){
  if(!rows.every(row=>{const old=originals.get(row.id);return old?.kind==='course'&&old.linkable===false&&key(old.code)===key(row.code);}))fail(`الرمز ${rows[0].code} مكرر. صحح الرمز قبل الحفظ.`);
  rows.forEach(row=>row.linkable=false);
 }
 const originalCodes=new Map();for(const row of base.courses.filter(row=>row.kind==='course')){const code=key(row.code);if(!originalCodes.has(code))originalCodes.set(code,[]);originalCodes.get(code).push(row);}
 const renamed=new Map();
 for(const course of courses.filter(row=>row.kind==='course')){const old=originals.get(course.id);if(old&&originalCodes.get(key(old.code))?.length===1&&key(old.code)!==key(course.code))renamed.set(key(old.code),course.code);}
 const removed=new Set(base.courses.filter(row=>row.kind==='course'&&!seen.has(row.id)&&!courses.some(current=>current.kind==='course'&&originals.has(current.id)&&key(originals.get(current.id).code)===key(row.code))).map(row=>key(row.code)));
 for(const course of courses){
  for(const field of ['prerequisites','corequisites','anyPrerequisites'])course[field]=[...new Set(course[field].map(code=>renamed.get(key(code))||byCode.get(key(code))?.[0].code||code))];
  const refs=[...course.prerequisites,...course.corequisites,...course.anyPrerequisites];
  if(refs.some(code=>removed.has(key(code))))fail(`«${course.name}» ما زال يتطلب مقررًا حذفته. عدّل متطلباته أو أعد المقرر قبل الحفظ.`);
  if(refs.some(code=>key(code)===key(course.code)))fail(`«${course.name}» لا يمكن أن يكون متطلبًا لنفسه.`);
  if(course.completedLevel&&course.level>0&&course.completedLevel>=course.level)fail(`«${course.name}»: شرط المستوى يتضمن المقرر نفسه.`);
  if(course.kind==='slot'&&(course.credits===null||!courses.some(option=>option.kind==='course'&&option.level===0&&option.pool===course.pool&&option.credits===course.credits)))fail(`«${course.name}» يحتاج مادة في قائمته بنفس الساعات. راجع بدائل القائمة قبل الحفظ.`);
 }
 const visiting=new Set(),visited=new Set();
 function visit(course){if(visited.has(course.id))return;if(visiting.has(course.id))fail(`توجد دائرة في متطلبات «${course.name}».`);visiting.add(course.id);for(const code of course.prerequisites)for(const previous of byCode.get(key(code))||[])visit(previous);visiting.delete(course.id);visited.add(course.id);}
 courses.forEach(visit);
 if(!courses.some(row=>row.level>0))fail('الخطة تحتاج مقررًا واحدًا على الأقل ضمن مستوى.');
 if(draft.levels!=null&&(!Array.isArray(draft.levels)||draft.levels.length>20))fail('تحقق من المستويات.');
 const levels=[...new Set([...(draft.levels||[]).map(level=>integer(level,1,20,'المستوى')),...courses.filter(row=>row.level>0).map(row=>row.level)])].sort((a,b)=>a-b);
 courses.sort((a,b)=>(a.level||99)-(b.level||99));
 return {...base,title:draft.title===undefined?base.title:courseLabel(draft.title,2,100,'اسم الخطة'),courses,levels,groups:groups.map(group=>({...group,slots:courses.filter(row=>row.kind==='slot'&&row.pool===group.id).map(row=>row.id)})),revision:revision+1,firstLevel:Math.min(...courses.filter(row=>row.level>0).map(row=>row.level)),uncertainCredits:courses.some(row=>row.credits===null)};
}
export async function updateStudyPlan(body,admin,db){
 const id=editablePlanId(body.id),revision=integer(body.revision,0,2147483646,'نسخة التعديل');
 const current=await loadEditablePlan(id,db);
 if(current.revision!==revision)throw new ApiError(409,'تغيّرت الخطة منذ فتحها. أعد تحميلها قبل الحفظ حتى لا تفقد تعديلًا آخر.');
 const plan=await normalizeEditedPlan(current.plan,body.draft,revision);
 return db('rpc/miyar_update_study_plan',{method:'POST',body:{p_admin:admin,p_id:id,p_revision:revision,p_plan:plan}});
}
export async function deleteStudyPlan(body,admin,db){
 if(body.confirmed!==true)fail('أكد حذف الخطة أولًا.');
 return db('rpc/miyar_delete_study_plan',{method:'POST',body:{p_admin:admin,p_id:editablePlanId(body.id),p_revision:integer(body.revision,0,2147483646,'نسخة التعديل')}});
}
