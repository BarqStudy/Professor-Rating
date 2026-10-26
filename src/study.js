import plans from '../data/study-plans.json';
import {storage,readJSON} from './storage.js';
import {cleanProgress,courseStatus,progressSummary,selectedCourse} from './study-engine.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('ar');
export function createStudyPlanner({api,modal,icon,universityName,ownerKey,majorName,onReview,onDoctor,configured}) {
 let filter='all',search='';
 const available=()=>plans.filter(p=>!universityName()||p.university===universityName());
 const selectionKey=()=>`miyar-study-selected:${ownerKey()}:${universityName()||'all'}`;
 function current(){const list=available();return list.find(p=>p.id===storage.getItem(selectionKey()))||list.find(p=>[p.major,...(p.majorAliases||[])].includes(majorName()))||list[0];}
 const progressKey=plan=>`miyar-study-v1:${ownerKey()}:${plan.id}`;
 const progress=plan=>cleanProgress(plan,readJSON(progressKey(plan),{}));
 const save=(plan,state)=>storage.setItem(progressKey(plan),JSON.stringify(cleanProgress(plan,state)));
 const source=(plan,page)=>`${import.meta.env.BASE_URL}plans/${encodeURIComponent(plan.source)}${page?'#page='+page:''}`;
 function page(){
  const plan=current();
  return `<section class="study-page"><div class="study-intro"><span class="eyebrow">خطوة أقرب للتخرج</span><h1>خطتي إلى التخرج</h1><p>حدد ما اجتزته، واعرف ما تبقّى لك، واكتشف دكاترة كل مادة.</p></div>${!plan?`<section class="panel"><h2>خطط جامعتك لم تُضف بعد</h2><p>ابدأ بطلب إضافة خطة تخصصك عبر <a href="mailto:info@miyar.website">info@miyar.website</a>.</p></section>`:`<section class="panel study-setup"><label>اختر خطة تخصصك<select id="study-plan-select">${available().map(p=>`<option value="${p.id}" ${p.id===plan.id?'selected':''}>${esc(p.title)} · ${esc(p.fileLabel)}</option>`).join('')}</select></label><a class="secondary" href="${source(plan)}" target="_blank" rel="noopener">${icon('book')} ملف الخطة</a><p class="study-local-note">${esc(plan.university)} · تقدمك محفوظ على هذا الجهاز${ownerKey().startsWith('member:')?' لهذا الحساب':''}. لا يُرسل إلى خدمة الذكاء الاصطناعي.</p></section><div id="study-progress-content">${content(plan)}</div>`}</section>`;
 }
 function courseCard(plan,item,state){
  const course=selectedCourse(plan,item,state),status=courseStatus(plan,item,state),done=status.key==='completed';
  const requirements=course?[...course.prerequisites.map(c=>'سابق: '+c),...(course.anyPrerequisites?.length?['أحد: '+course.anyPrerequisites.join(' أو ')]:[]),...course.corequisites.map(c=>'متزامن: '+c)]:[];
  const choices=item.kind==='slot'?plan.courses.filter(c=>c.level===0&&c.pool===item.pool&&c.credits===item.credits):[];
  const used=new Set(Object.entries(state.electiveChoices).filter(([slot])=>slot!==item.id).map(([,id])=>id));
  return `<article class="study-course ${done?'is-completed':''}" data-study-course="${item.id}"><div class="study-course-top"><label class="study-complete"><input type="checkbox" data-study-complete="${item.id}" ${done?'checked':''} ${!course?'disabled':''}><span>${done?'اجتزت المادة':'حددها إذا اجتزتها'}</span></label><span class="study-status status-${status.key}">${esc(status.label)}</span></div><h3>${esc(item.kind==='slot'?item.name:course.name)}</h3>${item.kind==='slot'?`<label class="study-elective-label">المادة المختارة<select data-study-elective="${item.id}"><option value="">اختر من المجموعة</option>${choices.map(c=>`<option value="${c.id}" ${state.electiveChoices[item.id]===c.id?'selected':''} ${used.has(c.id)||!c.linkable?'disabled':''}>${esc(c.code+' · '+c.name)}${!c.linkable?' · رمز يحتاج مراجعة':''}${used.has(c.id)?' · مختارة مسبقًا':''}</option>`).join('')}</select></label>`:''}<div class="study-course-meta"><span>${esc(course?.code||'اختياري')}</span><span>${item.credits==null?'ساعات تحتاج تأكيدًا':number(item.credits)+' ساعات'}</span><a href="${source(plan,item.page)}" target="_blank" rel="noopener">المصدر · ص ${number(item.page)}</a></div>${requirements.length?`<p class="study-requirements">${requirements.map(esc).join(' · ')}</p>`:''}${status.reasons.length?`<ul class="study-reasons">${status.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`:''}${course?.linkable?`<button type="button" class="text-button study-doctors-button" data-study-doctors="${course.id}">${icon('users')} الدكاترة والتقييمات ${icon('arrow')}</button>`:''}</article>`;
 }
 function content(plan){
  const state=progress(plan),summary=progressSummary(plan,state),required=plan.courses.filter(c=>c.level>0);
  const statuses=new Map(required.map(c=>[c.id,courseStatus(plan,c,state)]));
  const ready=required.filter(c=>['ready','concurrent'].includes(statuses.get(c.id).key)).length;
  const shown=required.filter(c=>(filter==='all'||(filter==='remaining'?statuses.get(c.id).key!=='completed':filter==='ready'?['ready','concurrent'].includes(statuses.get(c.id).key):statuses.get(c.id).key===filter))&&(!search||[c.name,c.code,selectedCourse(plan,c,state)?.name].filter(Boolean).some(s=>s.includes(search))));
  const codes=new Set(plan.courses.map(c=>c.code));
  const external=[...new Set(plan.courses.flatMap(c=>[...c.prerequisites,...c.corequisites,...(c.anyPrerequisites||[])]).filter(c=>!codes.has(c)))];
  return `<section class="panel study-overview"><div class="study-progress-heading"><div><span class="eyebrow">إنجازك في المواد الواردة بالملف</span><h2>${number(summary.completed)} من ${number(summary.total)} متطلبًا</h2></div><strong>${number(summary.percent)}٪</strong></div><div class="study-progress-track" role="progressbar" aria-label="المتطلبات المكتملة في الملف" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.percent}"><span style="width:${summary.percent}%"></span></div><div class="study-metrics"><div><b>${number(summary.remaining)}</b><span>متطلب متبقٍ</span></div><div><b>${number(ready)}</b><span>متاحة مبدئيًا أو بتزامن</span></div><div><b>${number(summary.completedCredits)}</b><span>ساعة مكتملة داخل الملف${summary.uncertainCredits?' · دون غير المحسومة':''}</span></div></div><p class="study-advisory">هذا تقدمك في الملف المرفوع، وليس نسبة إكمال الدرجة الجامعية كاملة. إتاحة المادة مبدئية وتخضع لشروط القسم وطرح الشُعب.</p></section><details class="panel study-prerequisite-settings" ${state.foundation?'':'open'}><summary>المسار الهندسي والمتطلبات خارج الملف</summary><p>الملف يبدأ من المستوى الثالث. أدخل ما أنجزته فعليًا؛ لا تُحتسب أي مادة تلقائيًا.</p><label class="study-foundation"><input type="checkbox" id="study-foundation" ${state.foundation?'checked':''}><span>اجتزت مقررات المسار الهندسي أو السنة التحضيرية المطلوبة لتخصصي</span></label><label class="study-extra-credits">ساعات معتمدة أنجزتها خارج المواد المدرجة في هذا الملف<input type="number" id="study-extra-credits" min="0" max="100" step="1" value="${state.extraCredits}"><small>لشروط مشروع التخرج فقط. لا تُدخل ساعات المواد التي حددتها أعلاه مرة أخرى.</small></label>${external.length?`<p>رموز متطلبات وردت في الملف دون مادة مطابقة. حدد ما اجتزته فقط بعد التأكد من الرمز مع القسم؛ لا نفترض معادلة الرموز:</p><div class="study-external">${external.map(code=>`<label><input type="checkbox" data-study-external="${esc(code)}" ${state.externalPassed.includes(code)?'checked':''}><span>تحققت من الرمز واجتزت ${esc(code)}</span></label>`).join('')}</div>`:''}</details><details class="panel study-source-notes"><summary>نطاق الخطة وملاحظات المصدر</summary><ul>${plan.notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul><a href="${source(plan)}" target="_blank" rel="noopener">مراجعة ملف ${esc(plan.fileLabel)}</a></details><section class="study-directory"><div class="study-tools"><div class="study-filters" role="group" aria-label="تصفية مواد الخطة">${[['all','جميع المواد'],['remaining','المتبقية'],['ready','المتاحة مبدئيًا'],['completed','المكتملة'],['review','تحتاج تأكيدًا']].map(([id,label])=>`<button type="button" class="chip ${id===filter?'selected':''}" data-study-filter="${id}" aria-pressed="${id===filter}">${label}</button>`).join('')}</div><label class="study-search">${icon('search')}<input id="study-search" placeholder="ابحث باسم المادة أو رمزها" aria-label="البحث في الخطة" value="${esc(search)}"><button type="button" id="study-clear-search" class="icon-btn" aria-label="مسح بحث الخطة" ${search?'':'hidden'}>${icon('close')}</button></label></div><div class="study-results" aria-live="polite">${number(shown.length)} متطلبًا</div>${shown.length?[...new Set(shown.map(c=>c.level))].map(level=>`<section class="study-level"><h2>المستوى ${number(level)}</h2><div class="study-courses-grid">${shown.filter(c=>c.level===level).map(c=>courseCard(plan,c,state)).join('')}</div></section>`).join(''):'<p class="panel empty">لا توجد مواد تطابق هذا الاختيار.</p>'}</section>`;
 }
 function bindContent(plan){
  const root=document.querySelector('#study-progress-content');if(!root)return;
  function update(change,focusId){const state=progress(plan);change(state);save(plan,state);root.innerHTML=content(plan);bindContent(plan);if(focusId)root.querySelector(focusId)?.focus({preventScroll:true});}
  root.querySelectorAll('[data-study-complete]').forEach(input=>input.onchange=()=>update(s=>{s.completed=input.checked?[...s.completed,input.dataset.studyComplete]:s.completed.filter(id=>id!==input.dataset.studyComplete);},`[data-study-complete="${input.dataset.studyComplete}"]`));
  root.querySelectorAll('[data-study-elective]').forEach(select=>select.onchange=()=>update(s=>{s.electiveChoices[select.dataset.studyElective]=select.value;s.completed=s.completed.filter(id=>id!==select.dataset.studyElective);},`[data-study-elective="${select.dataset.studyElective}"]`));
  root.querySelector('#study-foundation').onchange=e=>update(s=>{s.foundation=e.target.checked;},'#study-foundation');
  root.querySelector('#study-extra-credits').onchange=e=>{if(e.target.checkValidity())update(s=>{s.extraCredits=Number(e.target.value);},'#study-extra-credits');else e.target.reportValidity();};
  root.querySelectorAll('[data-study-external]').forEach(input=>input.onchange=()=>update(s=>{s.externalPassed=input.checked?[...s.externalPassed,input.dataset.studyExternal]:s.externalPassed.filter(c=>c!==input.dataset.studyExternal);},`[data-study-external="${input.dataset.studyExternal}"]`));
  root.querySelectorAll('[data-study-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.studyFilter;update(()=>{},`[data-study-filter="${filter}"]`);});
  root.querySelector('#study-search').oninput=e=>{search=e.target.value;const pos=e.target.selectionStart;root.innerHTML=content(plan);bindContent(plan);const input=root.querySelector('#study-search');input.focus({preventScroll:true});input.setSelectionRange(pos,pos);};
  root.querySelector('#study-clear-search').onclick=()=>{search='';update(()=>{},'#study-search');};
  root.querySelectorAll('[data-study-doctors]').forEach(button=>button.onclick=()=>showDoctors(plan,plan.courses.find(c=>c.id===button.dataset.studyDoctors)));
 }
 function bind(){const select=document.querySelector('#study-plan-select');if(!select)return;const plan=current();select.onchange=()=>{storage.setItem(selectionKey(),select.value);filter='all';search='';document.querySelector('#study-progress-content').innerHTML=content(current());document.querySelector('.study-setup .secondary').href=source(current());bindContent(current());};bindContent(plan);}
 async function showDoctors(plan,course){
  modal('دكاترة المادة',`<div id="study-course-doctors"><p role="status">جارٍ تحميل دكاترة ${esc(course.name)}…</p></div>`);
  const root=document.querySelector('#study-course-doctors');
  try {
   const rows=configured()?await api('course.doctors',{courseId:course.id}):[];
   if(!root.isConnected)return;
   if(!Array.isArray(rows))throw new Error('تعذّر تحميل دكاترة المادة.');
   root.innerHTML=`<div class="study-doctor-heading"><span class="eyebrow">${esc(plan.university)} · ${esc(plan.title)}</span><h3>${esc(course.name)}</h3><p>${esc(course.code)} · ${esc(plan.fileLabel)}</p></div><p class="muted">دكاترة وردت لهم تقييمات منشورة مرتبطة بهذه المادة وهذه الخطة. المؤشرات أدناه لهذه المادة فقط.</p>${rows.length?rows.map(d=>`<article class="study-doctor-result"><span class="avatar" aria-hidden="true">${icon('profile')}</span><div><h3>${esc(d.name)}</h3><p>${number(d.count)} تقييمًا منشورًا · متوسط ${number(d.score)} / ١٠٠</p><p class="study-course-scores">${['الشرح','التعامل','المساعدة بالدرجات'].map((label,i)=>`${label}: ${number(d.scores[i])}`).join(' · ')}</p></div><button type="button" class="secondary" data-study-rate="${Number(d.id)}">قيّم الدكتور</button><button type="button" class="text-button" data-study-view="${Number(d.id)}">استعرض التقييمات</button></article>`).join(''):'<p class="study-no-doctors">لا توجد تقييمات منشورة مرتبطة بهذه المادة بعد. الدكاترة والتقييمات القديمة لا تُربط اعتمادًا على تشابه الاسم.</p>'}<button type="button" class="primary" id="study-new-doctor">${icon('plus')} إضافة دكتور بتقييم لهذه المادة</button>`;
   root.querySelectorAll('[data-study-rate]').forEach(button=>button.onclick=()=>onReview(Number(button.dataset.studyRate),course,plan));
   root.querySelectorAll('[data-study-view]').forEach(button=>button.onclick=()=>onDoctor(Number(button.dataset.studyView),course));
   root.querySelector('#study-new-doctor').onclick=()=>onReview(null,course,plan);
  }catch(error){if(root.isConnected){root.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary" id="study-doctors-retry">إعادة المحاولة</button>`;root.querySelector('button').onclick=()=>showDoctors(plan,course);}}
 }
 function attachReview(form,{university,college,major,courseId}={}){
  const subject=form.querySelector('[name=subject]');
  if(!subject)return;
  const section=document.createElement('div');section.className='study-review-selection';subject.closest('.form-grid').before(section);
  function update(preselect){
   const selectedCollege=form.querySelector('[name=college]').value,selectedMajor=form.querySelector('[name=major]').value;
   const choices=plans.filter(p=>p.university===university&&p.college===selectedCollege&&[p.major,...(p.majorAliases||[])].includes(selectedMajor));
   section.hidden=!choices.length;
   section.innerHTML=choices.length?`<label>خطة المادة<select id="review-study-plan">${choices.map(p=>`<option value="${p.id}" ${preselect?.startsWith(p.id+'/')?'selected':''}>${esc(p.fileLabel)}</option>`).join('')}</select></label><label>المادة من الخطة<select name="courseId" id="review-study-course"><option value="">مادة أخرى أو غير محددة في الخطة</option></select></label><small class="muted">اختيار مادة من الخطة يربط هذا الدكتور بها بعد اعتماد التقييم.</small>`:'';
   subject.readOnly=false;
   if(!choices.length)return;
   const fill=()=>{
    const plan=choices.find(p=>p.id===section.querySelector('#review-study-plan').value);
    section.querySelector('#review-study-course').innerHTML='<option value="">مادة أخرى أو غير محددة في الخطة</option>'+plan.courses.filter(c=>c.kind==='course'&&c.linkable).map(c=>`<option value="${c.id}" ${preselect===c.id?'selected':''}>${esc(c.code+' · '+c.name)}</option>`).join('');
    const select=section.querySelector('#review-study-course');
    const sync=()=>{const c=plan.courses.find(c=>c.id===select.value);subject.readOnly=!!c;if(c)subject.value=c.name;};select.onchange=sync;sync();
   };
   section.querySelector('#review-study-plan').onchange=()=>{preselect=null;subject.value='';fill();};fill();
  }
  // A selected plan can set the new doctor's department; subsequent changes clear the link.
  if(college&&major){const c=form.querySelector('[name=college]'),m=form.querySelector('[name=major]');c.value=college;c.dispatchEvent(new Event('change'));m.value=major;}
  update(courseId);
  for(const name of ['college','major'])form.querySelector(`[name=${name}]`).addEventListener('change',()=>{subject.value='';update();});
 }
 return {page,bind,attachReview};
}
