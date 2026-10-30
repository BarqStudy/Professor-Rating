import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupCourseOptions,groupedCourseOptions} from '../src/course-options.js';

test('late-added courses are grouped by numeric level, preserving identities and stable order within a level',()=>{
 const courses=[{id:'last',level:11},{id:'ten',level:10},{id:'a',level:3},{id:'four',level:4},{id:'drawing',level:3}],before=structuredClone(courses);
 const groups=groupCourseOptions({},courses);
 assert.deepEqual(groups.map(g=>g.label),['المستوى 3','المستوى 4','المستوى 10','المستوى 11']);
 assert.deepEqual(groups[0].courses.map(c=>c.id),['a','drawing']);assert.deepEqual(courses,before);
 assert.strictEqual(groups[0].courses[1],courses[4]);
});

test('unscheduled choice pools stay separate after levels; filtered lists have no empty headings and group names are escaped',()=>{
 const plan={groups:[{id:'elective',name:'مجموعة 1'},{id:'uni',name:'لغة <"أجنبية">'}]},courses=[
  {id:'u',level:0,pool:'uni',requirementType:'university'},{id:'ten',level:10},{id:'e',level:0,pool:'elective'},
  {id:'three',level:3},{id:'r',level:0,pool:'elective',requirementType:'required'},{id:'unknown',level:null},
 ];
 const groups=groupCourseOptions(plan,courses);
 assert.deepEqual(groups.map(g=>g.label),['المستوى 3','المستوى 10','متطلبات الجامعة · لغة <"أجنبية">','مقررات اختيارية · مجموعة 1','متطلبات إجبارية · مجموعة 1','مقررات غير محددة المستوى']);
 const markup=groupedCourseOptions(plan,courses.filter(c=>c.id==='u'),()=>'<option value="u" disabled>لغة</option>');
 assert.match(markup,/label="متطلبات الجامعة · لغة &lt;&quot;أجنبية&quot;&gt;"/);assert.ok(!markup.includes('المستوى'));assert.match(markup,/<option value="u" disabled>/);
 assert.equal(groupedCourseOptions(plan,[],()=>''),'');
});

test('every current specialty puts general drawing in level 3 even when the server appends it last',async()=>{
 const plans=JSON.parse(await readFile(new URL('../data/study-plans.json',import.meta.url),'utf8'));
 for(const plan of plans){
  const drawing=plan.courses.find(c=>c.id.endsWith('/engineering-drawing'));
  const courses=plan.courses.filter(c=>c.kind==='course'&&c.linkable&&c.id!==drawing.id).concat(drawing);
  const groups=groupCourseOptions(plan,courses),levels=groups.filter(g=>g.level).map(g=>g.level);
  assert.equal(levels[0],3);assert.deepEqual(levels,[...levels].sort((a,b)=>a-b));assert.equal(levels.at(-1),Math.max(...courses.map(c=>c.level)));
  assert.ok(groups.find(g=>g.level===3).courses.some(c=>c.id===drawing.id));assert.equal(groups.flatMap(g=>g.courses).length,courses.length);
 }
});
