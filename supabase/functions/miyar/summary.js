// Conservative phrase matching: each published review counts at most once per theme.
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ').toLowerCase();
const themes = [
 {label:'إشادة بالشرح',tags:['يوصل المعلومة','يختصر لك المعلومة'],yes:/(شرح(?:ه)? (?:واضح|ممتاز|مبسط|مفهوم)|يبسط (?:المعلوم|الشرح)|يوضح المعلوم)/,no:/(غير واضح|مو واضح|مش واضح|ليس واضح|ما يوضح|لا يوضح|غير مفهوم|مو مفهوم)/},
 {label:'إشادة بالتعامل أو التعاون',tags:['متعاون ومتفهم'],yes:/(متعاون|تعامل(?:ه)? (?:ممتاز|محترم|راقي)|محترم جدا)/,no:/(غير\s*متعاون|مو\s*متعاون|ليس\s*متعاون|لا يتعاون|ما يتعاون|غير محترم|مو محترم)/},
 {label:'اختبارات تحتاج استعدادًا',tags:['اختبارات صعبة'],yes:/(اختبارات(?:ه)? (?:صعب|تحتاج (?:مذاكر|استعداد))|الاختبارات صعب|الاختبار صعب)/,no:/(غير صعب|مو صعب|ليست صعب|ليس صعب|مش صعب)/},
 {label:'إشادة بالتنظيم أو المواعيد',yes:/(منظم|ملتزم بالمواعيد|يلتزم بالمواعيد|محاضرات(?:ه)? منتظم)/,no:/(غير منظم|مو منظم|لا يلتزم|ما يلتزم|غير ملتزم|مو ملتزم)/},
 {label:'محاضرة ممتعة',tags:['محاضرة ممتعة'],yes:/$^/,no:/$^/},
 {label:'محاضرة مملة',tags:['محاضرة مملة'],yes:/$^/,no:/$^/},
 {label:'ذكر منح درجات إضافية',tags:['يعطي بونس'],yes:/$^/,no:/$^/},
 {label:'استجابة للاستفسارات',yes:/(يرد علي الاسئل|يجيب علي الاسئل|يجيب عن الاسئل|متاح في الساعات المكتبي)/,no:/(لا يرد|ما يرد|لا يجيب|ما يجيب|غير متاح|مو متاح)/},
];
export function buildReviewSummary(rows,total=rows.length) {
 const comments=rows.map((row)=>normalize(row.comment));
 const points=themes.map((theme)=>({label:theme.label,count:rows.filter((row,index)=>(Array.isArray(row.tags)&&theme.tags?.some((tag)=>row.tags.includes(tag)))||(theme.yes.test(comments[index])&&!theme.no.test(comments[index]))).length})).filter((theme)=>theme.count>=2).sort((a,b)=>b.count-a.count).slice(0,4);
 return {reviewCount:rows.length,totalPublished:Number(total),themes:rows.length>=3?points:[],insufficient:rows.length<3,method:'published-phrases-and-descriptors'};
}
