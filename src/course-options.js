const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Display order is independent of database insertion order. Unscheduled choice
// pools keep their own labels instead of being assigned an invented level.
export function groupCourseOptions(plan,courses){
 const levels=new Map(),pools=new Map(),unknown=[];
 for(const course of courses){
  if(Number.isInteger(course.level)&&course.level>0){
   if(!levels.has(course.level))levels.set(course.level,[]);
   levels.get(course.level).push(course);
  }else if(course.level===0){
   const key=JSON.stringify([course.requirementType||'',course.pool||'']);
   if(!pools.has(key)){
    const name=plan.groups?.find(group=>group.id===course.pool)?.name||course.pool||'';
    const type=course.requirementType==='university'?'متطلبات الجامعة':course.requirementType==='required'?'متطلبات إجبارية':'مقررات اختيارية';
    pools.set(key,{label:name&&name!==type?`${type} · ${name}`:type,courses:[]});
   }
   pools.get(key).courses.push(course);
  }else unknown.push(course);
 }
 return [...levels].sort(([a],[b])=>a-b).map(([level,courses])=>({label:`المستوى ${level}`,level,courses}))
  .concat([...pools.values()],unknown.length?[{label:'مقررات غير محددة المستوى',courses:unknown}]:[]);
}
export function groupedCourseOptions(plan,courses,renderOption){
 return groupCourseOptions(plan,courses).map(group=>`<optgroup label="${esc(group.label)}">${group.courses.map(renderOption).join('')}</optgroup>`).join('');
}
