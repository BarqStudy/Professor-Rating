import { ApiError } from './security.js';
export const MIYAR_HELP = [
 { id:'help-rating',label:'إضافة تقييم',href:'#ratings',text:'يمكن التقييم كزائر دون Google. اختر جامعتك والدكتور ثم وافق على التعهّد. قيّم الشرح والتعامل والمساعدة بالدرجات، واكتب المادة ودرجتك الخاصة. التعليق والأوصاف اختياريان، والهوية والدرجة لا تظهران للعامة. كل التقييمات تنتظر مراجعة الإدارة.' },
 { id:'help-university',label:'الجامعة والإعدادات',href:'#home',text:'اختر الجامعة عند التسجيل أو قبل أول تقييم كزائر. يمكنك تغييرها من الإعدادات ثم تغيير الجامعة. تعرض القوائم كليات جامعتك وتخصصاتها؛ إحصائيات الرئيسية تشمل كل الجامعات. تتوفر ألوان أزرق وأخضر ووردي وتفاحي، ومظهر نهاري وليلي وحجم خط من الإعدادات.' },
 { id:'help-compare',label:'المقارنة والمحفوظات',href:'#ratings',text:'من بطاقات الدكاترة اختر قارن الدكتور لدكتورين أو ثلاثة، ثم اعرض المقارنة للشرح والتعامل والمساعدة بالدرجات وعدد التقييمات. يمكنك حفظ الدكتور من علامة المحفوظات. مع حساب Google تصلك إشعارات داخل المنصة عند نشر تقييم جديد لدكتور محفوظ. المحفوظات والمظهر محفوظة على الجهاز.' },
 { id:'help-requests',label:'الطلبات وتصحيح البيانات',href:'#requests',text:'طلب إضافة دكتور بدون تقييم متاح في صفحة التقييمات بعد الدخول بحساب Google. زر اقتراح تصحيح بيانات الدكتور داخل تفاصيله يصحح الاسم أو التخصص بعد اعتماد الإدارة. متابعة طلباتي تعرض حالة الطلب وسبب القرار. تعديل التقييم للحساب صاحبه يُرسل للمراجعة ويظل المنشور كما هو حتى الاعتماد. يمكن الإبلاغ عن تقييم مسيء أو بيانات شخصية أو محتوى غير مرتبط.' },
 { id:'help-university-request',label:'إضافة جامعة أو كلية',href:'#developer',text:'طلب إضافة جامعة أو كلية يكون عبر info@miyar.website. اذكر اسم الجامعة والكلية والتخصصات المطلوبة. مِعيار منصة سعودية لتجارب الطلاب وليست بوابة رسمية للجامعات. سفراء مِعيار تعيّنهم الإدارة، ويقترحون إضافات وتصحيحات داخل جامعات تكليفهم فقط؛ اعتمادها عند الإدارة.' },
 { id:'help-data',label:'فهم المؤشرات',href:'#ratings',text:'مؤشرات الدكتور هي متوسطات تقييمات الطلاب المنشورة من صفر إلى مئة. قلة التقييمات تعني محدودية التجارب. لا تعني الدرجة ضمانًا لتجربتك أو لدرجتك الأكاديمية. يمكنك تصفية التقييمات حسب المادة. ملخص التجربة يستند إلى أوصاف متكررة عند كفاية التقييمات. الدكتور الذي لا يملك تقييمات لا يُقدّم كتوصية بناء على درجة صفر.' },
];
const normalize=(value)=>String(value||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
const ignored=new Set(['كيف','ممكن','ابغي','ابغى','ابي','اريد','وش','ايش','عندي','عن','في','من','الي','على','هذا','هذه','دكتور','الدكتور','دكاتره','تقييم','التقييم','التقييمات','معيار','اعطني','هل','هو','هي','الى','اللي','افضل']);
export function validateAiQuestion(body) {
 const question=typeof body.question==='string'?body.question.trim():'';
 if(question.length<2||question.length>1200)throw new ApiError(400,'اكتب سؤالًا من حرفين إلى ١٢٠٠ حرف.');
 const history=body.history??[];
 if(!Array.isArray(history)||history.length>6||history.some((item)=>!item||!['user','assistant'].includes(item.role)||typeof item.text!=='string'||item.text.length>4000))throw new ApiError(400,'المحادثة أطول من المسموح. ابدأ محادثة جديدة.');
 if(history.reduce((sum,item)=>sum+item.text.length,0)>8000)throw new ApiError(400,'ابدأ محادثة جديدة لتكمل أسئلتك.');
 return {question,history:history.map(({role,text})=>({role,text}))};
}
export async function buildAiContext(db,universityId,question,history=[]) {
 const catalogue=await db('rpc/miyar_catalogue',{method:'POST',body:{}});
 const universities=(catalogue.universities||[]).map(({id,name,city})=>({id,name,city}));
 const colleges=(catalogue.colleges||[]).filter((college)=>!universityId||college.university_id===universityId).map(({id,name,university_id})=>({id,name,university_id}));
 const majors=(catalogue.majors||[]).filter((major)=>colleges.some((college)=>college.id===major.college_id)).map(({id,name,college_id})=>({id,name,college_id}));
 const terms=[...new Set(normalize(question+' '+history.filter((item)=>item.role==='user').slice(-1).map((item)=>item.text).join(' ')).match(/[\p{L}\p{N}]{2,}/gu)||[])].filter((word)=>!ignored.has(word));
 const allowed=(catalogue.doctors||[]).filter((doctor)=>majors.some((major)=>major.id===doctor.major_id));
 const ranking=/(اعلي|افضل|الاكثر تقييما|اكثر التقييمات)/.test(normalize(question));
 let candidates=allowed.map((doctor)=>{
  const name=normalize(doctor.name),extra=normalize(`${doctor.major} ${doctor.college} ${(doctor.subjects||[]).join(' ')}`);
  return {doctor,relevance:(normalize(question).includes(name)?100:0)+terms.reduce((sum,term)=>sum+(name.includes(term)?3:extra.includes(term)?1:0),0)};
 });
 const matches=candidates.filter((row)=>row.relevance>0);
 const exact=candidates.filter((row)=>row.relevance>=100);
 if(ranking)candidates=(matches.length?matches:candidates).filter(({doctor})=>doctor.count>0).sort((a,b)=>b.doctor.score-a.doctor.score||b.doctor.count-a.doctor.count);
 else candidates=(exact.length?exact:matches).sort((a,b)=>b.relevance-a.relevance||b.doctor.count-a.doctor.count);
 const ranked=candidates.slice(0,4);
 const doctors=await Promise.all(ranked.map(async({doctor})=>{
  const rows=await db(`miyar_reviews?doctor_id=eq.${doctor.id}&status=eq.published&select=subject,comment,tags&order=created_at.desc&limit=3`);
  return {sourceId:`doctor-${doctor.id}`,id:doctor.id,name:doctor.name,major:doctor.major,college:doctor.college,count:doctor.count,score:doctor.score,scores:doctor.scores,subjects:doctor.subjects,experiences:rows.map(({subject,comment,tags})=>({subject,comment:String(comment||'').slice(0,350),tags:tags||[]}))};
 }));
 const sources=[...MIYAR_HELP.map(({id,label,href})=>({id,label,href})),...doctors.map((doctor)=>({id:doctor.sourceId,label:`د. ${doctor.name}`,href:`?doctor=${doctor.id}`}))];
 return {data:{help:MIYAR_HELP,universities:universities.slice(0,30),selectedUniversity:universities.find((university)=>university.id===universityId)?.name||null,colleges:colleges.slice(0,30),majors:majors.slice(0,50),doctors,globalStatistics:{colleges:(catalogue.colleges||[]).length,doctors:catalogue.stats?.doctors,reviews:catalogue.stats?.reviews},scopeCollegeCount:colleges.length,searchScope:universityId?'جامعة الطالب المختارة':'الجامعات المتاحة في مِعيار',note:ranking?'هذه أعلى المتوسطات بين الدكاترة المتاحين في الدليل المسترجع ذوي التقييمات المنشورة؛ ليست ضمانًا للأفضلية. قوائم الكليات والتخصصات المعروضة محدودة.':'الدكاترة المسترجعون نتائج بحث محدودة، وليست قائمة كل الدكاترة أو ترتيبًا للأفضل. قوائم الكليات والتخصصات المعروضة محدودة.'},sources};
}
