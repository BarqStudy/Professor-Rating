import test from 'node:test';
import assert from 'node:assert/strict';
import {repairCourseCode,repairPlanDraft} from '../supabase/functions/miyar/plan-repair.js';
import {normalizePublishedPlan} from '../supabase/functions/miyar/plan-format.js';
import {choiceCandidates,cleanProgress,progressSummary,selectedCourse,courseStatus} from '../src/study-engine.js';

const course=(code,name,level=1,extra={})=>({code,name,level,credits:3,kind:'course',pool:null,prerequisites:[],corequisites:[],anyPrerequisites:[],minimumCredits:null,completedLevel:null,allPrevious:false,review:null,page:1,...extra});
const draft=courses=>({id:'plan-12345678-1234-4234-8234-123456789012',title:'خطة الهندسة',fileLabel:'نسخة الاختبار',sha256:'a'.repeat(64),courses});

test('asterisk placeholders get distinct organizational slot codes, and complete footnoted codes retain prerequisite identity',async()=>{
 const input=draft([course('CE 101***','مادة أساسية'),course('CHOICE 1','مادة أخرى'),...['***','3-تصد***','تصد***-3'].map((code,index)=>course(code,'مقرر اختياري '+(index+1),3+index,{pool:'اختياري'})),course('CE 501***','مادة متقدمة',0,{pool:'اختياري',prerequisites:['CE101***']})]);
 const original=structuredClone(input),repaired=repairPlanDraft(input),plan=await normalizePublishedPlan(input),slots=plan.courses.filter(row=>row.kind==='slot');
 assert.deepEqual(input,original);assert.equal(slots.length,3);assert.equal(new Set(slots.map(row=>row.code)).size,3);assert.ok(slots.every(row=>!row.code.includes('*')&&row.code!=='CHOICE 1'&&!row.linkable));
 assert.deepEqual(repairPlanDraft(repaired.draft).draft.courses,repaired.draft.courses);
 assert.equal(plan.courses.find(row=>row.name==='مادة أساسية').code,'CE 101');assert.deepEqual(choiceCandidates(plan,slots[0])[0].prerequisites,['CE 101']);
 assert.equal(repairCourseCode('تصـد ٤٧٢***'),'تصد 472');assert.equal(repairCourseCode('***CE101'),'CE 101');assert.equal(repairCourseCode('3-تصد***'),'3-تصد***');
 // No invented identity for a masked, named academic course, nor ignored duplicates.
 await assert.rejects(normalizePublishedPlan(draft([course('تصد***','تصميم المعارض')])) ,/الرمز/);
 await assert.rejects(normalizePublishedPlan(draft([course('CE101***','مادة أولى'),course('CE101','مادة ثانية')])),/مكرر/);
});

test('the owner-confirmed interior-design credit correction applies only to the exact source and three identified courses',async()=>{
 const source='de1cfd1709f4f7af10d0f26872d8a057cd0d259c4e7789bbdd898bce08e5601f';
 const input={...draft([course('3-تصد***','مقرر اختياري (مجموعة 2)',7,{pool:'المجموعة 2',page:8}),...['تقنيات العرض','تنسيق المواقع الداخلية','المهارات الرقمية والوسائط المتعددة'].map((name,index)=>course(index===2?'تصد474-3':'3-تصـد'+(472+index),name,0,{pool:'المجموعة الثانية',credits:'٢',page:13}))]),sha256:source};
 const before=structuredClone(input),repaired=repairPlanDraft(input),plan=await normalizePublishedPlan(input),slot=plan.courses.find(row=>row.kind==='slot');
 assert.deepEqual(input,before);assert.deepEqual(choiceCandidates(plan,slot).map(row=>row.credits),[3,3,3]);assert.equal(progressSummary(plan,cleanProgress(plan,{})).totalCredits,3);
 assert.ok(plan.autoCorrections.some(note=>note.includes('وفق تصحيح صاحب المنصة')));assert.deepEqual(repairPlanDraft(repaired.draft).draft.courses,repaired.draft.courses);
 await assert.rejects(normalizePublishedPlan({...input,sha256:'b'.repeat(64)}),/بدائل مجموعته: 2/);
 const different=structuredClone(input);different.courses[1].name='مقرر آخر';assert.equal(repairPlanDraft(different).draft.courses[1].credits,2);
 different.courses[2].code='3-تصد499';assert.equal(repairPlanDraft(different).draft.courses[2].credits,2);
 different.courses[3].credits=4;assert.equal(repairPlanDraft(different).draft.courses[3].credits,4);
});

test('row 47 missing its elective group is linked automatically to the sole matching appendix without selecting a material',async()=>{
 const input=draft([...Array.from({length:46},(_,i)=>course('CE '+(100+i),'مادة أساسية '+i)),course('EL 1','مقرر اختياري ١',8,{kind:'slot'}),course('CE 901','إدارة المشاريع',0,{pool:'اختياري التخصص'}),course('CE 902','هندسة الطرق',0,{pool:'اختياري التخصص'})]);
 const before=structuredClone(input),plan=await normalizePublishedPlan(input),slot=plan.courses.find(row=>row.kind==='slot');
 assert.deepEqual(input,before);assert.equal(slot.level,8);assert.deepEqual(choiceCandidates(plan,slot).map(row=>row.code),['CE 901','CE 902']);
 assert.equal(progressSummary(plan,cleanProgress(plan,{})).total,47);assert.equal(selectedCourse(plan,slot,cleanProgress(plan,{})),undefined);assert.ok(plan.autoCorrections.length>0);
});

test('missing pool labels and blank placeholder codes are repaired, while appendix materials remain choices and count once',async()=>{
 const input=draft([course('CE 101','مقرر أساسي'),course('','اختياري تخصص ١',3),course('','اختياري تخصص ٢',4),course('CE 501','ميكانيكا متقدمة',0),course('CE 502','هندسة البيئة',0)]);
 const repaired=repairPlanDraft(input),again=repairPlanDraft(repaired.draft);assert.deepEqual(again.draft.courses,repaired.draft.courses);assert.deepEqual(again.corrections,[]);
 const plan=await normalizePublishedPlan(input),slots=plan.courses.filter(row=>row.kind==='slot');assert.equal(slots.length,2);assert.equal(plan.courses.filter(row=>row.level===0).length,2);assert.notEqual(slots[0].code,slots[1].code);
 const options=choiceCandidates(plan,slots[0]);assert.equal(options.length,2);
 const state=cleanProgress(plan,{completed:[slots[0].id,slots[1].id],electiveChoices:{[slots[0].id]:options[0].id,[slots[1].id]:options[0].id}});
 assert.equal(progressSummary(plan,state).total,3);assert.equal(progressSummary(plan,state).completed,1);assert.equal(progressSummary(plan,state).completedCredits,3);assert.equal(selectedCourse(plan,slots[1],state),undefined);
});

test('appendix courses accidentally scheduled at positive levels move to their list, with university and required lists kept separate',async()=>{
 const input={...draft([course('MATH 101','حساب التفاضل والتكامل',1),course('U 1','متطلب جامعة',2,{kind:'slot',requirementType:'university'}),course('R 1','متطلب إجباري',3,{kind:'slot',pool:'المقررات الإجبارية',requirementType:'required'}),course('UNI 101','التواصل Communication',5,{pool:'متطلبات الجامعة',requirementType:'university'}),course('UNI 102','العمل التطوعي',0,{requirementType:'university'}),course('REQ 101','English Language',6,{pool:'المقررات الإجبارية',requirementType:'required'})]),requirementLists:true};
 const plan=await normalizePublishedPlan(input),uni=plan.courses.find(row=>row.code==='U 1'),required=plan.courses.find(row=>row.code==='R 1');
 assert.deepEqual(choiceCandidates(plan,uni).map(row=>row.code),['UNI 101','UNI 102']);assert.deepEqual(choiceCandidates(plan,required).map(row=>row.code),['REQ 101']);assert.equal(plan.courses.find(row=>row.code==='MATH 101').level,1);
 assert.equal(plan.courses.filter(row=>row.level>0).length,3);assert.equal(progressSummary(plan,cleanProgress(plan,{})).totalCredits,9);
});

test('choice-pool aliases and mistranscribed zero-level slot kinds are repaired, not distinct named academic lists',async()=>{
 const plan=await normalizePublishedPlan(draft([course('CE 101','مادة أساسية'),course('EL 1','اختياري تخصص',3,{kind:'slot',pool:'اختياري التخصص'}),course('CE 501','هندسة الطرق',4,{pool:'المقررات الاختيارية للتخصص'}),course('CE 502','ميكانيكا هندسية',0,{pool:'اختياري التخصص',kind:'slot'})]));
 assert.equal(plan.groups.length,1);assert.equal(plan.courses.filter(row=>row.level===0).length,2);assert.equal(choiceCandidates(plan,plan.courses.find(row=>row.kind==='slot')).length,2);
 const distinct=draft([course('CE 101','مادة أساسية'),course('EL 1','اختياري تخصص 1',3,{kind:'slot',pool:'مجموعة تصميم'}),course('EL 2','اختياري تخصص 2',4,{kind:'slot',pool:'مجموعة إنشاءات'}),course('CE 501','تصميم',0,{pool:'مجموعة تصميم'}),course('CE 502','إنشاءات',0,{pool:'مجموعة إنشاءات'})]);
 assert.equal((await normalizePublishedPlan(distinct)).groups.length,2);
 const ambiguous=structuredClone(distinct);ambiguous.courses[1].pool=null;await assert.rejects(normalizePublishedPlan(ambiguous),/تعذّر ربط/);
});

test('ordinary mandatory courses, explicit cross-type conflicts, missing academic data and separate credit choices are not guessed away',async()=>{
 const ordinary=draft([course('UNI 101','الثقافة الإسلامية'),course('CE 101','ميكانيكا الموائع',2)]);assert.deepEqual(repairPlanDraft(ordinary).draft.courses,ordinary.courses);
 const missing=draft([course('CE 101','مادة أساسية'),course('EL 1','اختياري تخصص',3,{kind:'slot'})]);await assert.rejects(normalizePublishedPlan(missing),/بدائل/);
 const types={...draft([course('U 1','متطلب جامعة',2,{kind:'slot',pool:'قائمة مشتركة',requirementType:'university'}),course('REQ 101','English',0,{pool:'قائمة مشتركة',requirementType:'required'})]),requirementLists:true};await assert.rejects(normalizePublishedPlan(types),/افصل قائمة/);
 const credits=draft([course('EL 1','مقرر اختياري',2,{kind:'slot',pool:'اختياري',credits:2}),course('EL 2','مقرر اختياري',3,{kind:'slot',pool:'اختياري',credits:3}),course('UNI 201','مادة بساعتين',0,{pool:'اختياري',credits:2}),course('UNI 301','مادة بثلاث ساعات',0,{pool:'اختياري',credits:3})]);
 const plan=await normalizePublishedPlan(credits);for(const slot of plan.courses.filter(row=>row.kind==='slot'))assert.deepEqual(choiceCandidates(plan,slot).map(row=>row.credits),[slot.credits]);
});

test('a repaired traditional elective keeps both the placeholder and selected material prerequisites',async()=>{
 const input=draft([course('CE 101','مقدمة هندسية'),course('CE 102','رياضيات هندسية'),course('EL 1','مقرر اختياري',3,{prerequisites:['CE 101']}),course('CE 501','موضوع متقدم',0,{prerequisites:['CE 102']})]);
 const plan=await normalizePublishedPlan(input),slot=plan.courses.find(row=>row.kind==='slot'),option=choiceCandidates(plan,slot)[0];
 const state=cleanProgress(plan,{electiveChoices:{[slot.id]:option.id}});
 assert.deepEqual(selectedCourse(plan,slot,state).prerequisites,['CE 101','CE 102']);assert.equal(courseStatus(plan,slot,state).key,'locked');
 state.completed=plan.courses.filter(row=>['CE 101','CE 102'].includes(row.code)).map(row=>row.id);assert.equal(courseStatus(plan,slot,state).key,'ready');
});

test('interior-design style numbered pools unify Arabic digits, ordinal names and Roman labels without mixing group 1 and 2',async()=>{
 const input=draft([course('ID 101','أساسيات التصميم'),course('EL 1','مقرر اختياري (مجموعة 1)',3,{pool:'مجموعة ١',credits:2}),course('EL 2','مقرر اختياري (مجموعة 2)',4,{kind:'slot',pool:'اختياري مجموعة۲',credits:2}),course('ID 201','تصميم الأثاث',0,{pool:'قائمة المجموعة الأولى',credits:2}),course('ID 202','الإضاءة الداخلية',5,{pool:'المجموعة الثانية',credits:2}),course('ID 203','تصميم المعارض',0,{pool:'Elective Group II',credits:2})]);
 const plan=await normalizePublishedPlan(input),one=plan.courses.find(row=>row.code==='EL 1'),two=plan.courses.find(row=>row.code==='EL 2');
 assert.equal(one.kind,'slot');assert.equal(plan.groups.length,2);assert.notEqual(one.pool,two.pool);
 assert.deepEqual(choiceCandidates(plan,one).map(row=>row.code),['ID 201']);assert.deepEqual(choiceCandidates(plan,two).map(row=>row.code),['ID 202','ID 203']);
 const repaired=repairPlanDraft(input);assert.deepEqual(repairPlanDraft(repaired.draft).draft.courses,repaired.draft.courses);
});

test('an explicit group number links a missing placeholder pool even when several groups have identical hours',async()=>{
 const plan=await normalizePublishedPlan(draft([course('ID 101','أساسيات التصميم'),course('EL 2','اختياري 4 — المجموعة الثانية',4,{kind:'slot',credits:2}),course('ID 201','أثاث',0,{pool:'مجموعة 1',credits:2}),course('ID 202','تصميم المعارض',0,{pool:'مجموعة 2',credits:2})]));
 const slot=plan.courses.find(row=>row.kind==='slot');assert.deepEqual(choiceCandidates(plan,slot).map(row=>row.code),['ID 202']);
});

test('same-number university and major pools, and separately named design pools, remain distinct',async()=>{
 const input={...draft([course('U 2','متطلب جامعة (مجموعة 2)',2,{kind:'slot',pool:'متطلبات الجامعة مجموعة2',requirementType:'university',credits:2}),course('D 2','اختياري تخصص (مجموعة2)',4,{kind:'slot',pool:'اختياري تخصص المجموعة الثانية',credits:2}),course('UNI 201','العمل التطوعي',0,{pool:'متطلبات الجامعة Group 2',requirementType:'university',credits:2}),course('ID 202','تصميم الأثاث',0,{pool:'تخصص مجموعة ٢',credits:2})]),requirementLists:true};
 const plan=await normalizePublishedPlan(input);assert.equal(plan.groups.length,2);assert.deepEqual(choiceCandidates(plan,plan.courses.find(row=>row.code==='U 2')).map(row=>row.code),['UNI 201']);assert.deepEqual(choiceCandidates(plan,plan.courses.find(row=>row.code==='D 2')).map(row=>row.code),['ID 202']);
 const inferred=await normalizePublishedPlan({...draft([course('U 2','متطلب جامعة (مجموعة 2)',2,{pool:'مجموعة 2',credits:2}),course('UNI 201','العمل التطوعي',0,{pool:'المجموعة الثانية',credits:2})]),requirementLists:true});assert.ok(inferred.courses.every(row=>row.requirementType==='university'));
 const named=repairPlanDraft(draft([course('A 1','اختياري مجموعة2',3,{kind:'slot',pool:'مجموعة 2 تصميم'}),course('A 2','اختياري مجموعة2',3,{kind:'slot',pool:'مجموعة 2 إنشاءات'})]));assert.notEqual(named.draft.courses[0].pool,named.draft.courses[1].pool);
});

test('real credit mismatches and missing appendix pages give specific diagnostics and never change academic hours',async()=>{
 const input=draft([course('EL 2','مقرر اختياري (مجموعة 2)',4,{kind:'slot',pool:'مجموعة2',credits:2}),course('ID 202','تصميم الأثاث',0,{pool:'المجموعة الثانية',credits:3})]);
 const before=structuredClone(input);await assert.rejects(normalizePublishedPlan(input),error=>/2 ساعات/.test(error.message)&&/بدائل مجموعته: 3/.test(error.message));assert.deepEqual(input,before);
 await assert.rejects(normalizePublishedPlan(draft([course('EL 2','مقرر اختياري (مجموعة 2)',4,{kind:'slot',pool:'مجموعة2',credits:2})])),/لم تُقرأ بدائل/);
 // Uploaded interior-design PDF: page 8 has a 3-credit slot; page 13's
 // three alternative rows each say 2, although its heading says 3 credits.
 const source=draft([course('EL 2','مقرر اختياري (مجموعة 2)',7,{kind:'slot',pool:'المجموعة 2',credits:3,page:8}),...['تقنيات العرض','تنسيق المواقع الداخلية','المهارات الرقمية والوسائط المتعددة'].map((name,index)=>course('تصـد '+(472+index),name,0,{pool:'المجموعة الثانية',credits:2,page:13}))]);
 const original=structuredClone(source);await assert.rejects(normalizePublishedPlan(source),error=>/3 ساعات/.test(error.message)&&/بدائل مجموعته: 2/.test(error.message));assert.deepEqual(source,original);
});
