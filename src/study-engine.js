// Eligibility is advisory and never guesses equivalence between course codes.
export function choiceCandidates(plan,item){
 return plan.courses.filter(c=>c.kind==='course'&&c.level===0&&c.pool===item.pool&&c.credits===item.credits&&(c.requirementType||null)===(item.requirementType||null));
}
export function cleanProgress(plan,raw={}) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
 const required=new Set(plan.courses.filter(c=>c.level>0).map(c=>c.id));
 const electiveChoices={};
 for(const slot of plan.courses.filter(c=>c.kind==='slot')){
  const candidate=choiceCandidates(plan,slot).find(c=>c.id===raw.electiveChoices?.[slot.id]&&c.linkable);
  if(candidate&&!Object.values(electiveChoices).includes(candidate.id))electiveChoices[slot.id]=candidate.id;
 }
 const knownCodes=new Set(plan.courses.map(c=>c.code));
 const externalCodes=new Set(plan.courses.flatMap(c=>[...c.prerequisites,...c.corequisites,...(c.anyPrerequisites||[])]).filter(code=>!knownCodes.has(code)));
 return {
  completed:[...new Set(Array.isArray(raw.completed)?raw.completed.filter(id=>required.has(id)):[])],
  preparatoryCompleted:[...new Set(Array.isArray(raw.preparatoryCompleted)?raw.preparatoryCompleted.filter(id=>required.has(id)&&plan.courses.some(c=>c.id===id&&c.preparatoryEligible===true)&&Array.isArray(raw.completed)&&raw.completed.includes(id)):[])],
  electiveChoices,
  doctorChoices:Object.fromEntries(Object.entries(raw.doctorChoices&&typeof raw.doctorChoices==='object'?raw.doctorChoices:{}).filter(([id,doctor])=>plan.courses.some(c=>c.id===id&&c.kind==='course'&&c.linkable)&&Number.isSafeInteger(doctor)&&doctor>0)),
  foundation:raw.foundation===true,
  extraCredits:Number.isInteger(raw.extraCredits)?Math.max(0,Math.min(100,raw.extraCredits)):0,
  externalPassed:[...new Set(Array.isArray(raw.externalPassed)?raw.externalPassed.filter(code=>externalCodes.has(code)):[])],
 };
}
export function selectedCourse(plan,item,state) {
 if(item.kind!=='slot')return item;
 const course=choiceCandidates(plan,item).find(c=>c.id===state.electiveChoices[item.id]&&c.linkable);
 if(!course)return course;
 const slotAny=item.anyPrerequisites||[],courseAny=course.anyPrerequisites||[];
 const conflictingAlternatives=slotAny.length&&courseAny.length&&(slotAny.length!==courseAny.length||slotAny.some(code=>!courseAny.includes(code)));
 return {...course,prerequisites:[...new Set([...item.prerequisites,...course.prerequisites])],corequisites:[...new Set([...item.corequisites,...course.corequisites])],anyPrerequisites:slotAny.length?slotAny:courseAny,
  ...(conflictingAlternatives?{review:'للخانة والمادة مجموعتان مختلفتان من المتطلبات البديلة؛ تأكد من القسم.'}:{})};
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
 if(state.completed.includes(item.id)&&course)return {key:'completed',label:state.preparatoryCompleted.includes(item.id)?'مكتملة في السنة التحضيرية':'مكتملة',reasons:[]};
 if(!course)return {key:'choice',label:item.requirementType?'اختر مادة المتطلب':'اختر المقرر الاختياري',reasons:['اختر مادة من القائمة قبل تحديدها كمكتملة.']};
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
 if(minimum&&(summary.completedCredits<minimum||summary.uncertainCredits))return {key:'review',label:'تحتاج تأكيد القسم',reasons:['تحقق من شرط إكمال '+minimum+' ساعة معتمدة لدى القسم؛ يعتمد الشرط على الساعات المعتمدة في سجلك الأكاديمي.']};
 const limit=item.allPrevious?item.level-1:item.completedLevel;
 if(limit&&plan.courses.some(c=>c.level>0&&c.level<=limit&&(!state.completed.includes(c.id)||!selectedCourse(plan,c,state))))reasons.push('اجتياز جميع المواد حتى المستوى '+limit+'.');
 if(reasons.length)return {key:'locked',label:'متطلبات لم تكتمل',reasons};
 const corequisites=course.corequisites.filter(code=>!done.has(code));
 if(corequisites.length)return {key:'concurrent',label:'متاحة بشرط التزامن',reasons:corequisites.map(code=>'تسجيل '+code+' بالتزامن أو اجتيازه مسبقًا.')};
 return {key:'ready',label:'متاحة مبدئيًا',reasons:[]};
}
