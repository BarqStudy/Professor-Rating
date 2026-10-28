import test from 'node:test';
import assert from 'node:assert/strict';
import {repairPlanDraft} from '../supabase/functions/miyar/plan-repair.js';
import {normalizePublishedPlan} from '../supabase/functions/miyar/plan-format.js';
import {choiceCandidates,cleanProgress,progressSummary,selectedCourse,courseStatus} from '../src/study-engine.js';

const course=(code,name,level=1,extra={})=>({code,name,level,credits:3,kind:'course',pool:null,prerequisites:[],corequisites:[],anyPrerequisites:[],minimumCredits:null,completedLevel:null,allPrevious:false,review:null,page:1,...extra});
const draft=courses=>({id:'plan-12345678-1234-4234-8234-123456789012',title:'خطة الهندسة',fileLabel:'نسخة الاختبار',sha256:'a'.repeat(64),courses});

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
