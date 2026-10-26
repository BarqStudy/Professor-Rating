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
