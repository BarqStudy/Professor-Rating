// Conservative spelling equivalence; course numbers and meaningful words stay.
export function courseNameKey(value){
 return String(value??'').normalize('NFKC').toLowerCase()
  .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u0640]/g,'')
  .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[کك]/g,'ك')
  .replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0)))
  .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/(^|\s)ال/g,'$1').replace(/\s/g,'');
}
export function courseRequirementLabel(plan,code){
 const course=plan.courses.find(c=>c.code===code&&c.kind==='course');
 return course?`${course.name} (${code})`:`مقرر غير مدرج (${code})`;
}

// A shorthand suggests existing catalogue entries; it never invents a course
// identity or chooses between numbered/otherwise ambiguous subjects.
export function courseNameWords(value){
 const words=String(value??'').normalize('NFKC').toLowerCase()
  .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u0640]/g,'')
  .replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0)))
  .replace(/(\p{L})(\p{N})/gu,'$1 $2').replace(/(\p{N})(\p{L})/gu,'$1 $2')
  .split(/[^\p{L}\p{N}]+/u).map(courseNameKey).filter(word=>word&&!['ماده','مقرر','course'].includes(word));
 return [...new Set(words)].sort();
}
const courseSearchCache=new WeakMap();
function courseSearchEntry(course){
 let entry=courseSearchCache.get(course);
 if(!entry||entry.name!==course.name||entry.code!==course.code){entry={name:course.name,code:course.code,nameKey:courseNameKey(course.name),codeKey:courseNameKey(course.code)};courseSearchCache.set(course,entry);}
 return entry;
}
export function knownCourseMatches(value,courses){
 const key=courseNameKey(value);if(!key)return [];
 const exact=courses.filter(course=>{const entry=courseSearchEntry(course);return entry.nameKey===key||entry.codeKey===key;});
 if(exact.length)return exact;
 const words=courseNameWords(value);
 if(!words.some(word=>word.length>=3&&/\p{L}/u.test(word)))return [];
 return courses.filter(course=>{const entry=courseSearchEntry(course);entry.words??=new Set(courseNameWords(course.name+' '+(course.code||'')));return words.every(word=>entry.words.has(word));});
}
export function reviewedCourseKeys(subjects,courses){
 const keys=new Set(subjects.map(courseNameKey));
 for(const subject of subjects){
  const matches=knownCourseMatches(subject,courses),canonical=new Set(matches.map(course=>courseNameKey(course.name)));
  if(canonical.size===1)keys.add([...canonical][0]);
 }
 return keys;
}
