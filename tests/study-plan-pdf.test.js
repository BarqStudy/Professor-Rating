import test from 'node:test';
import assert from 'node:assert/strict';
import {drawStudyPlanPage,studyPlanPages} from '../src/study-plan-pdf.js';

test('the PDF distinguishes a scheduled elective requirement from its unscheduled alternatives',()=>{
 const plan={
  courses:[
   {name:'المهارات الرقمية',code:'نال 101',level:3,credits:2,kind:'course'},
   {name:'اختيارية (٢)',code:'REQ-S-1',level:3,credits:2,kind:'slot',pool:'electives'},
   {name:'أمن الشبكات',code:'شال 301',level:0,credits:2,kind:'course',pool:'electives'},
  ],
  groups:[{id:'electives',name:'اختياري التخصص'}],
 };
 const pages=studyPlanPages(plan);
 assert.equal(pages[1].heading,'المستوى 3');
 assert.deepEqual(pages[1].courses,plan.courses.slice(0,2));
 assert.equal(pages[1].credits,4);
 assert.deepEqual(pages[3].courses,plan.courses.slice(2));
 const labels=[];
 const context={beginPath(){},roundRect(){},fill(){},save(){},restore(){},fillText(value){labels.push(value);}};
 const canvas={getContext:()=>context};
 drawStudyPlanPage(canvas,plan,pages,1,{color:'#209b8d'});
 assert.ok(labels.includes('خانة اختيار'));
 assert.ok(labels.includes('اختر مقررًا من قائمة «اختياري التخصص»'));
 assert.ok(labels.includes('المقررات: 1 · خانات الاختيار: 1'));
 assert.ok(!labels.includes('REQ-S-1'));
 assert.ok(!labels.includes('أمن الشبكات'));
});
