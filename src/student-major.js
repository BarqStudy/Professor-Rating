import {courseNameKey} from './course-names.js';

// Match both the college and the specialty: identical names at other colleges
// must not silently become the student's plan.
export function plansForStudent(plans,{university,college,major}){
 if(!major)return [];
 const key=courseNameKey(major),collegeKey=courseNameKey(college);
 return plans.filter(p=>p.university===university&&courseNameKey(p.college)===collegeKey&&[p.major,...(p.majorAliases||[])].some(name=>courseNameKey(name)===key));
}
