import originalPlans from '../data/study-plans.json' with {type:'json'};
let uploaded=[];
export function setUploadedStudyPlans(value){
 if(!Array.isArray(value))return;
 uploaded=value.filter(p=>p&&typeof p.id==='string'&&(/^plan-[a-f0-9-]{36}$/.test(p.id)||originalPlans.some(original=>original.id===p.id))&&typeof p.university==='string'&&typeof p.major==='string'&&Array.isArray(p.courses)&&p.courses.length>0&&p.courses.length<=240&&p.courses.every(c=>c&&typeof c.id==='string'&&Array.isArray(c.prerequisites)&&Array.isArray(c.corequisites)));
}
export const getStudyPlans=()=>[...new Map([...originalPlans,...uploaded].map(plan=>[plan.id,plan])).values()];
