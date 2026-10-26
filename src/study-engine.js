// Eligibility is advisory and never guesses equivalence between course codes.
export function cleanProgress(plan,raw={}) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
 const required=new Set(plan.courses.filter(c=>c.level>0).map(c=>c.id));
 const electiveChoices={};
 for(const slot of plan.courses.filter(c=>c.kind==='slot')){
  const candidate=plan.courses.find(c=>c.id===raw.electiveChoices?.[slot.id]&&c.level===0&&c.pool===slot.pool&&c.credits===slot.credits&&c.linkable);
  if(candidate&&!Object.values(electiveChoices).includes(candidate.id))electiveChoices[slot.id]=candidate.id;
 }
 const knownCodes=new Set(plan.courses.map(c=>c.code));
 const externalCodes=new Set(plan.courses.flatMap(c=>[...c.prerequisites,...c.corequisites,...(c.anyPrerequisites||[])]).filter(code=>!knownCodes.has(code)));
 return {
  completed:[...new Set(Array.isArray(raw.completed)?raw.completed.filter(id=>required.has(id)):[])],
  electiveChoices,
  doctorChoices:Object.fromEntries(Object.entries(raw.doctorChoices&&typeof raw.doctorChoices==='object'?raw.doctorChoices:{}).filter(([id,doctor])=>plan.courses.some(c=>c.id===id&&c.kind==='course'&&c.linkable)&&Number.isSafeInteger(doctor)&&doctor>0)),
  foundation:raw.foundation===true,
  extraCredits:Number.isInteger(raw.extraCredits)?Math.max(0,Math.min(100,raw.extraCredits)):0,
  externalPassed:[...new Set(Array.isArray(raw.externalPassed)?raw.externalPassed.filter(code=>externalCodes.has(code)):[])],
 };
}
export function selectedCourse(plan,item,state) {
 return item.kind==='slot'?plan.courses.find(c=>c.id===state.electiveChoices[item.id]&&c.pool===item.pool&&c.level===0&&c.credits===item.credits&&c.linkable):item;
}
export function completedCodes(plan,state) {
 const codes=new Set(state.externalPassed);
 for(const item of plan.courses.filter(c=>c.level>0&&state.completed.includes(c.id))){
  const course=selectedCourse(plan,item,state);if(course)codes.add(course.code);
 }
 return codes;
}
export function progressSummary(plan,state) {
 const required=plan.courses.filter(c=>c.level>0);
 const finished=required.filter(c=>state.completed.includes(c.id)&&selectedCourse(plan,c,state));
 return {
  total:required.length,completed:finished.length,remaining:required.length-finished.length,
  totalCredits:required.reduce((sum,c)=>sum+(c.credits||0),0),
  completedCredits:finished.reduce((sum,c)=>sum+(c.credits||0),0),
  uncertainCredits:required.some(c=>c.credits==null),
  percent:Math.round(100*finished.length/Math.max(1,required.length)),
 };
}
export function courseStatus(plan,item,raw) {
 const state=cleanProgress(plan,raw),course=selectedCourse(plan,item,state);
 if(state.completed.includes(item.id)&&course)return {key:'completed',label:'مكتملة',reasons:[]};
 if(!course)return {key:'choice',label:'اختر المقرر الاختياري',reasons:['اختر مادة من المجموعة قبل تحديدها كمكتملة.']};
 const notes=[item.review,course!==item?course.review:null].filter(Boolean);
 if(notes.length)return {key:'review',label:'تحتاج تأكيد القسم',reasons:notes};
 const reasons=[];const done=completedCodes(plan,state);
 const listedCodes=new Set(plan.courses.map(c=>c.code));
 const outside=[...course.prerequisites,...course.corequisites].filter(code=>!listedCodes.has(code));
 if(outside.length)return {key:'review',label:'تحتاج تأكيد القسم',reasons:outside.map(code=>'المتطلب '+code+' غير مدرج في الخطة؛ تأكد من اجتيازه مع القسم.')};
 for(const code of course.prerequisites)if(!done.has(code))reasons.push('اجتياز '+code);
 if(course.anyPrerequisites?.length&&!course.anyPrerequisites.some(code=>done.has(code)))reasons.push('اجتياز أحد: '+course.anyPrerequisites.join(' أو '));
 const summary=progressSummary(plan,state);
 const minimum=Math.max(item.minimumCredits||0,course.minimumCredits||0);
 if(minimum&&(summary.completedCredits<minimum||summary.uncertainCredits))return {key:'review',label:'تحتاج تأكيد القسم',reasons:['تحقق من شرط إكمال '+minimum+' ساعة معتمدة لدى القسم؛ الخطة لا تشمل المسار الهندسي.']};
 const limit=item.allPrevious?item.level-1:item.completedLevel;
 if(limit&&plan.courses.some(c=>c.level>0&&c.level<=limit&&(!state.completed.includes(c.id)||!selectedCourse(plan,c,state))))reasons.push('اجتياز جميع المواد حتى المستوى '+limit+'.');
 if(reasons.length)return {key:'locked',label:'متطلبات لم تكتمل',reasons};
 const corequisites=course.corequisites.filter(code=>!done.has(code));
 if(corequisites.length)return {key:'concurrent',label:'متاحة بشرط التزامن',reasons:corequisites.map(code=>'تسجيل '+code+' بالتزامن أو اجتيازه مسبقًا.')};
 return {key:'ready',label:'متاحة مبدئيًا',reasons:[]};
}
