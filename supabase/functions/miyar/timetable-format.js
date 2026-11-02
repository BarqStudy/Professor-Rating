const clean=(value,max=120)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
export const DAYS=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
export function minutes(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return null;const [h,m]=value.split(':').map(Number);return h*60+m;}
export function normalizeTimetable(input,{limit=40}={}){
 if(!input||!Array.isArray(input.courses)||input.courses.length>limit)throw new Error(`الجدول يحتاج قائمة مواد لا تتجاوز ${limit} مادة.`);
 return {version:1,title:clean(input.title,80)||'جدولي الدراسي',courses:input.courses.map((c,i)=>{
  if(!c||!clean(c.name)||!Array.isArray(c.sessions)||c.sessions.length>16)throw new Error('بيانات المادة أو مواعيدها غير صالحة.');
  return {id:'c'+i,name:clean(c.name),code:clean(c.code,30),level:Number.isInteger(c.level)&&c.level>=0&&c.level<=20?c.level:null,credits:Number.isFinite(c.credits)&&c.credits>=0&&c.credits<=30?c.credits:null,sessions:c.sessions.map(s=>{
   if(!s||!Number.isInteger(s.day)||s.day<0||s.day>6||minutes(s.start)===null||minutes(s.end)===null||minutes(s.end)<=minutes(s.start))throw new Error('راجع أيام المحاضرات وأوقات البداية والنهاية.');
   return {day:s.day,start:s.start,end:s.end,room:clean(s.room,80),teacher:clean(s.teacher,100)};
  })};
 })};
}
export function timetableConflicts(schedule){
 const rows=schedule.courses.flatMap((c,index)=>c.sessions.map(s=>({...s,course:index,name:c.name}))),conflicts=[];
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i],b=rows[j];if(a.day===b.day&&minutes(a.start)<minutes(b.end)&&minutes(b.start)<minutes(a.end))conflicts.push({day:a.day,a:a.name,b:b.name});}
 return conflicts;
}
