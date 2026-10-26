import {courseNameKey,courseRequirementLabel} from './course-names.js';
import {officeBadge} from './doctor-office.js';
import {getStudyPlans} from './study-catalogue.js';
import {storage,readJSON} from './storage.js';
import {cleanProgress,courseStatus,progressSummary,selectedCourse,choiceCandidates} from './study-engine.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('ar');
export function createStudyPlanner({api,modal,icon,universityName,ownerKey,majorName,doctorsForPlan,onReview,onAdvisor,onRequestDoctor,closeModal,toast}) {
 let filter='all',search='';
 const available=()=>getStudyPlans().filter(p=>!universityName()||p.university===universityName());
 const selectionKey=()=>`miyar-study-selected:${ownerKey()}:${universityName()||'all'}`;
 function current(){const list=available();return list.find(p=>p.id===storage.getItem(selectionKey()))||list.find(p=>[p.major,...(p.majorAliases||[])].includes(majorName()))||list[0];}
 const progressKey=plan=>`miyar-study-v1:${ownerKey()}:${plan.id}`;
 const progress=plan=>cleanProgress(plan,readJSON(progressKey(plan),{}));
 const save=(plan,state)=>storage.setItem(progressKey(plan),JSON.stringify(cleanProgress(plan,state)));
 function page(){
  const plan=current();
  return `<section class="study-page"><div class="study-intro"><span class="eyebrow">خطوة أقرب للتخرج</span><h1>خطتي إلى التخرج</h1><p>حدد ما اجتزته، واعرف ما تبقّى لك، واكتشف دكاترة كل مادة.</p></div>${!plan?`<section class="panel"><h2>خطط جامعتك لم تُضف بعد</h2><p>ابدأ بطلب إضافة خطة تخصصك عبر <a href="mailto:info@miyar.website">info@miyar.website</a>.</p></section>`:`<section class="panel study-setup"><label>اختر خطة تخصصك<select id="study-plan-select">${available().map(p=>`<option value="${p.id}" ${p.id===plan.id?'selected':''}>${esc(p.title)} · ${esc(p.fileLabel)}</option>`).join('')}</select></label><p class="study-local-note">${esc(plan.university)} · تقدمك محفوظ على هذا الجهاز${ownerKey().startsWith('member:')?' لهذا الحساب':''}. لا يُرسل إلى خدمة الذكاء الاصطناعي.</p></section><div id="study-progress-content">${content(plan)}</div>`}</section>`;
 }
 function courseCard(plan,item,state){
  const course=selectedCourse(plan,item,state),status=courseStatus(plan,item,state),done=status.key==='completed';
  const requirements=course?[
    ...(course.prerequisites.length?['المواد المتطلب اجتيازها: '+[...new Set(course.prerequisites)].map(code=>courseRequirementLabel(plan,code)).join('، ')]:[]),
    ...(course.anyPrerequisites?.length?['المواد المتطلب اجتياز إحداها: '+[...new Set(course.anyPrerequisites)].map(code=>courseRequirementLabel(plan,code)).join(' أو ')]:[]),
    ...(course.corequisites.length?['المتطلبات المتزامنة: '+[...new Set(course.corequisites)].map(code=>courseRequirementLabel(plan,code)).join('، ')]:[]),
  ]:[];
  const repeated=new Set(course?[
   ...course.prerequisites.map(code=>'اجتياز '+code),
   ...(course.anyPrerequisites?.length?['اجتياز أحد: '+course.anyPrerequisites.join(' أو ')]:[]),
   ...course.corequisites.map(code=>'تسجيل '+code+' بالتزامن أو اجتيازه مسبقًا.'),
  ]:[]);
  const reasons=status.reasons.filter(reason=>!repeated.has(reason));
  if(course&&[...course.prerequisites,...course.corequisites].some(code=>!plan.courses.some(c=>c.code===code))&&status.key==='review')reasons.splice(0,reasons.length,'بعض المتطلبات غير مدرجة في الخطة؛ تأكد من القسم.');
  const selectedDoctor=course?doctorsForPlan(plan).find(d=>d.id===state.doctorChoices[course.id]):null;
  const choices=item.kind==='slot'?choiceCandidates(plan,item):[];
  const choiceLabel=item.requirementType==='university'?'اختر من مواد متطلبات الجامعة':item.requirementType==='required'?'اختر من المقررات الإجبارية':'اختر من المجموعة';
  const used=new Set(Object.entries(state.electiveChoices).filter(([slot])=>slot!==item.id).map(([,id])=>id));
  return `<article class="study-course ${done?'is-completed':''}" data-study-course="${item.id}"><div class="study-course-top"><label class="study-complete"><input type="checkbox" data-study-complete="${item.id}" ${done?'checked':''} ${!course?'disabled':''}><span>${done?'اجتزت المادة':'حددها إذا اجتزتها'}</span></label><span class="study-status status-${status.key}">${esc(status.label)}</span></div><h3>${esc(item.kind==='slot'?item.name:course.name)}</h3>${item.kind==='slot'?`<label class="study-elective-label">${item.requirementType==='university'?'مواد متطلبات الجامعة':item.requirementType==='required'?'المقررات الإجبارية':'المادة المختارة'}<select data-study-elective="${item.id}"><option value="">${choiceLabel}</option>${choices.map(c=>`<option value="${c.id}" ${state.electiveChoices[item.id]===c.id?'selected':''} ${used.has(c.id)||!c.linkable?'disabled':''}>${esc(c.code+' · '+c.name)}${!c.linkable?' · رمز يحتاج مراجعة':''}${used.has(c.id)?' · مختارة مسبقًا':''}</option>`).join('')}</select></label>`:''}<div class="study-course-meta"><span>${esc(course?.code||'اختياري')}</span><span>${item.credits==null?'ساعات تحتاج تأكيدًا':number(item.credits)+' ساعات'}</span></div>${requirements.length?`<p class="study-requirements">${requirements.map(esc).join(' · ')}</p>`:''}${reasons.length?`<ul class="study-reasons">${reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`:''}${selectedDoctor?`<div class="study-selected-doctor"><span>الدكتور: <strong>${esc(selectedDoctor.name)}</strong> ${officeBadge(selectedDoctor)}</span><button type="button" class="text-button" data-study-remove-doctor="${course.id}" aria-label="إزالة اختيار الدكتور لهذه المادة">${icon('close')}</button></div>`:''}${course?.linkable?`<div class="study-course-actions">${selectedDoctor?`<button type="button" class="text-button" data-study-review="${course.id}">${icon('star')} تقييم الدكتور المختار</button>`:''}<button type="button" class="text-button study-doctors-button" data-study-doctors="${course.id}">${icon('profile')} ${selectedDoctor?'تغيير الدكتور':'اختيار الدكتور'} ${icon('arrow')}</button><button type="button" class="text-button" data-study-advisor="${course.id}">${icon('star')} اختيار الدكتور المناسب</button></div>`:''}</article>`;
 }
 function content(plan){
  const state=progress(plan),summary=progressSummary(plan,state),required=plan.courses.filter(c=>c.level>0);
  const statuses=new Map(required.map(c=>[c.id,courseStatus(plan,c,state)]));
  const ready=required.filter(c=>['ready','concurrent'].includes(statuses.get(c.id).key)).length;
  const shown=required.filter(c=>(filter==='all'||(filter==='remaining'?statuses.get(c.id).key!=='completed':filter==='ready'?['ready','concurrent'].includes(statuses.get(c.id).key):statuses.get(c.id).key===filter))&&(!search||[c.name,c.code,selectedCourse(plan,c,state)?.name].filter(Boolean).some(s=>courseNameKey(s).includes(courseNameKey(search)))));
  return `<section class="panel study-overview"><div class="study-progress-heading"><div><span class="eyebrow">إنجازك في الخطة</span><h2>${number(summary.completed)} من ${number(summary.total)} متطلبًا</h2></div><strong>${number(summary.percent)}٪</strong></div><div class="study-progress-track" role="progressbar" aria-label="متطلبات الخطة المكتملة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.percent}"><span style="width:${summary.percent}%"></span></div><div class="study-metrics"><div><b>${number(summary.remaining)}</b><span>متطلب متبقٍ</span></div><div><b>${number(ready)}</b><span>متاحة مبدئيًا أو بتزامن</span></div><div><b>${number(summary.completedCredits)}</b><span>ساعة مكتملة${summary.uncertainCredits?' · دون غير المحسومة':''}</span></div></div>${(plan.scopeNote??'الخطة لا تشمل المسار الهندسي.')?`<p class="study-advisory">${esc(plan.scopeNote??'الخطة لا تشمل المسار الهندسي.')}</p>`:''}</section><section class="study-directory"><div class="study-tools"><div class="study-filters" role="group" aria-label="تصفية مواد الخطة">${[['all','جميع المواد'],['remaining','المتبقية'],['ready','المتاحة مبدئيًا'],['completed','المكتملة'],['review','تحتاج تأكيدًا']].map(([id,label])=>`<button type="button" class="chip ${id===filter?'selected':''}" data-study-filter="${id}" aria-pressed="${id===filter}">${label}</button>`).join('')}</div><label class="study-search">${icon('search')}<input id="study-search" placeholder="ابحث باسم المادة أو رمزها" aria-label="البحث في الخطة" value="${esc(search)}"><button type="button" id="study-clear-search" class="icon-btn" aria-label="مسح بحث الخطة" ${search?'':'hidden'}>${icon('close')}</button></label></div><div class="study-results" aria-live="polite">${number(shown.length)} متطلبًا</div>${shown.length?[...new Set(shown.map(c=>c.level))].map(level=>`<section class="study-level"><h2>المستوى ${number(level)}</h2><div class="study-courses-grid">${shown.filter(c=>c.level===level).map(c=>courseCard(plan,c,state)).join('')}</div></section>`).join(''):'<p class="panel empty">لا توجد مواد تطابق هذا الاختيار.</p>'}</section>`;
 }
 function bindContent(plan){
  const root=document.querySelector('#study-progress-content');if(!root)return;
  function update(change,focusId){const state=progress(plan);change(state);save(plan,state);root.innerHTML=content(plan);bindContent(plan);if(focusId)root.querySelector(focusId)?.focus({preventScroll:true});}
  root.querySelectorAll('[data-study-complete]').forEach(input=>input.onchange=()=>update(s=>{s.completed=input.checked?[...s.completed,input.dataset.studyComplete]:s.completed.filter(id=>id!==input.dataset.studyComplete);},`[data-study-complete="${input.dataset.studyComplete}"]`));
  root.querySelectorAll('[data-study-elective]').forEach(select=>select.onchange=()=>update(s=>{s.electiveChoices[select.dataset.studyElective]=select.value;s.completed=s.completed.filter(id=>id!==select.dataset.studyElective);},`[data-study-elective="${select.dataset.studyElective}"]`));
  root.querySelectorAll('[data-study-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.studyFilter;update(()=>{},`[data-study-filter="${filter}"]`);});
  root.querySelector('#study-search').oninput=e=>{search=e.target.value;const pos=e.target.selectionStart;root.innerHTML=content(plan);bindContent(plan);const input=root.querySelector('#study-search');input.focus({preventScroll:true});input.setSelectionRange(pos,pos);};
  root.querySelector('#study-clear-search').onclick=()=>{search='';update(()=>{},'#study-search');};
  root.querySelectorAll('[data-study-doctors]').forEach(button=>button.onclick=()=>showDoctors(plan,plan.courses.find(c=>c.id===button.dataset.studyDoctors)));
  root.querySelectorAll('[data-study-review]').forEach(button=>button.onclick=()=>{const course=plan.courses.find(c=>c.id===button.dataset.studyReview),id=progress(plan).doctorChoices[course.id];onReview(id,course,plan);});
  root.querySelectorAll('[data-study-advisor]').forEach(button=>button.onclick=()=>onAdvisor(plan.courses.find(c=>c.id===button.dataset.studyAdvisor),plan));
  root.querySelectorAll('[data-study-remove-doctor]').forEach(button=>button.onclick=()=>update(s=>{delete s.doctorChoices[button.dataset.studyRemoveDoctor];}));
 }
 function bind(){const select=document.querySelector('#study-plan-select');if(!select)return;const plan=current();select.onchange=()=>{storage.setItem(selectionKey(),select.value);filter='all';search='';document.querySelector('#study-progress-content').innerHTML=content(current());bindContent(current());};bindContent(plan);}
 function showDoctors(plan,course){
  const existing=[...new Map(doctorsForPlan(plan).map(doctor=>[doctor.id,doctor])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  const owner=ownerKey();
  modal('اختيار دكتور المادة',`<div id="study-course-doctors"><div class="study-doctor-heading"><span class="eyebrow">${esc(plan.university)} · ${esc(plan.title)}</span><h3>${esc(course.name)}</h3><p>${esc(course.code)}</p></div><p class="muted">ابحث بين دكاترة جامعتك من جميع الكليات. اختيارك يُحفظ في خطتك؛ يمكنك تقييم الدكتور من خطتك أو من قسم التقييمات؛ يُحفظ تقييم واحد للدكتور.</p><label class="study-search">${icon('search')}<input id="study-doctor-search" type="search" placeholder="ابحث باسم الدكتور…" aria-label="البحث عن دكتور لخطة التخرج" autocomplete="off"></label><div id="study-doctor-options" class="study-doctor-options" aria-live="polite"></div><section class="missing-course-doctor"><h3>ألم تجد دكتور المادة؟</h3><p>أرسل طلب إضافته إلى الإدارة دون كتابة تقييم.</p><button type="button" class="primary" id="study-request-doctor">أضف الدكتور الآن</button></section><button type="button" class="secondary" id="study-new-doctor">${icon('plus')} الدكتور غير موجود؟ أضفه مع تقييم</button></div>`);
  const root=document.querySelector('#study-course-doctors');
  function paint(){
   const q=courseNameKey(root.querySelector('#study-doctor-search').value);
   const rows=existing.filter(d=>!q||courseNameKey(d.name).includes(q));
   root.querySelector('#study-doctor-options').innerHTML=rows.length?rows.map(d=>`<button type="button" class="study-doctor-option" data-study-pick-doctor="${d.id}"><span class="avatar" aria-hidden="true">${icon('profile')}</span><span><strong>${esc(d.name)} ${officeBadge(d)}</strong><small>${esc(d.college||'')} · ${esc(d.major||'')}</small></span><span class="study-pick-label">اختيار ${icon('check')}</span></button>`).join(''):'<p class="empty">لم نجد دكتورًا بهذا الاسم. يمكنك إرسال طلب إضافته إلى الإدارة من الأسفل.</p>';
   root.querySelectorAll('[data-study-pick-doctor]').forEach(button=>button.onclick=()=>{
    if(ownerKey()!==owner||!root.isConnected)return;
    const state=progress(plan);state.doctorChoices[course.id]=Number(button.dataset.studyPickDoctor);save(plan,state);
    const contentRoot=document.querySelector('#study-progress-content');
    if(contentRoot){contentRoot.innerHTML=content(plan);bindContent(plan);}
    closeModal();toast('تم حفظ دكتور المادة في خطتك.');
   });
  }
  root.querySelector('#study-doctor-search').oninput=paint;
  root.querySelector('#study-request-doctor').onclick=()=>onRequestDoctor?.(course,plan,root.querySelector('#study-doctor-search').value);
  root.querySelector('#study-new-doctor').onclick=()=>onReview(null,course,plan);
  paint();root.querySelector('#study-doctor-search').focus();
 }
 function attachReview(form,{university,college,major,courseId}={}){
  const subject=form.querySelector('[name=subject]');
  if(!subject)return;
  const section=document.createElement('div');section.className='study-review-selection';subject.closest('.form-grid').before(section);
  function update(preselect){
    const choices=getStudyPlans().filter(p=>p.university===university);
   section.hidden=!choices.length;
   section.innerHTML=choices.length?`<label>خطة المادة<select id="review-study-plan">${choices.map(p=>`<option value="${p.id}" ${preselect?.startsWith(p.id+'/')||(!preselect&&p.id===current()?.id)?'selected':''}>${esc(p.fileLabel)}</option>`).join('')}</select></label><label>المادة من الخطة<select name="courseId" id="review-study-course"><option value="">مادة أخرى أو غير محددة في الخطة</option></select></label><small class="muted">اختيار مادة من الخطة يربط هذا الدكتور بها بعد اعتماد التقييم.</small>`:'';
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
  // The teaching department can differ from the student's course department.
  // University scope is fixed by the verified session, not by these selects.
 }
 return {page,bind,attachReview,current,available};
}
