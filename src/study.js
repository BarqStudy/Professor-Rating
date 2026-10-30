import {courseNameKey,courseRequirementLabel,knownCourseMatches,reviewedCourseKeys} from './course-names.js';
import {groupedCourseOptions} from './course-options.js';
import {officeBadge} from './doctor-office.js';
import {getStudyPlans} from './study-catalogue.js';
import {storage,readJSON} from './storage.js';
import {cleanProgress,courseStatus,progressSummary,selectedCourse,choiceCandidates} from './study-engine.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('en-US');
export function createStudyPlanner({api,modal,icon,universityName,ownerKey,majorName,studentPlans,doctorsForPlan,onReview,onAdvisor,onRequestDoctor,closeModal,toast}) {
 let filter='all',search='';
 const available=()=>studentPlans?.()??getStudyPlans().filter(p=>!universityName()||p.university===universityName());
 const selectionKey=()=>`miyar-study-selected:${ownerKey()}:${universityName()||'all'}`;
 function current(){const list=available();return list.find(p=>p.id===storage.getItem(selectionKey()))||list.find(p=>[p.major,...(p.majorAliases||[])].includes(majorName()))||list[0];}
 const progressKey=plan=>`miyar-study-v1:${ownerKey()}:${plan.id}`;
 const progress=plan=>cleanProgress(plan,readJSON(progressKey(plan),{}));
 const save=(plan,state)=>storage.setItem(progressKey(plan),JSON.stringify(cleanProgress(plan,state)));
 function page(){
  const plan=current();
  return `<section class="study-page"><div class="study-intro"><span class="eyebrow">خطوة أقرب للتخرج</span><h1>خطتي إلى التخرج</h1><p>حدد ما اجتزته، واعرف ما تبقّى لك، واكتشف دكاترة كل مادة.</p></div>${!plan?`<section class="panel"><h2>خطة تخصصك لم تُضف بعد</h2><p>ابدأ بطلب إضافة خطة تخصصك عبر <a href="mailto:info@miyar.website">info@miyar.website</a>.</p></section>`:`<section class="panel study-setup"><label>خطة تخصصك<select id="study-plan-select">${available().map(p=>`<option value="${p.id}" ${p.id===plan.id?'selected':''}>${esc(p.title)} · ${esc(p.fileLabel)}</option>`).join('')}</select></label><p class="study-local-note">${esc(plan.university)} · تقدمك محفوظ على هذا الجهاز${ownerKey().startsWith('member:')?' لهذا الحساب':''}. لا يُرسل إلى خدمة الذكاء الاصطناعي.</p></section><div id="study-progress-content">${content(plan)}</div>`}</section>`;
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
  return `<article class="study-course ${done?'is-completed':''}" data-study-course="${item.id}"><div class="study-course-top"><label class="study-complete"><input type="checkbox" data-study-complete="${item.id}" ${done?'checked':''} ${!course?'disabled':''}><span>${done?'اجتزت المادة':'حددها إذا اجتزتها'}</span></label><span class="study-status status-${status.key}">${esc(status.label)}</span></div><h3>${esc(item.kind==='slot'?item.name:course.name)}</h3>${item.kind==='slot'?`<label class="study-elective-label">${item.requirementType==='university'?'مواد متطلبات الجامعة':item.requirementType==='required'?'المقررات الإجبارية':'المادة المختارة'}<select data-study-elective="${item.id}"><option value="">${choiceLabel}</option>${choices.map(c=>`<option value="${c.id}" ${state.electiveChoices[item.id]===c.id?'selected':''} ${used.has(c.id)||!c.linkable?'disabled':''}>${esc((c.platformAddition&&c.code==='DRAWING'?'':c.code+' · ')+c.name)}${!c.linkable?' · رمز يحتاج مراجعة':''}${used.has(c.id)?' · مختارة مسبقًا':''}</option>`).join('')}</select></label>`:''}<div class="study-course-meta"><span>${course?.platformAddition&&course.code==='DRAWING'?'رمز المقرر لم يُحدد':esc(course?.code||'اختياري')}</span><span>${item.credits==null?'ساعات تحتاج تأكيدًا':number(item.credits)+' ساعات'}</span></div>${course?.preparatoryEligible?`<button type="button" class="secondary study-preparatory-button" data-study-preparatory="${item.id}" aria-pressed="${state.preparatoryCompleted.includes(item.id)}">${icon('check')} درستها في السنة التحضيرية</button>`:''}${requirements.length?`<p class="study-requirements">${requirements.map(esc).join(' · ')}</p>`:''}${reasons.length?`<ul class="study-reasons">${reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`:''}${selectedDoctor?`<div class="study-selected-doctor"><span>الدكتور: <strong>${esc(selectedDoctor.name)}</strong> ${officeBadge(selectedDoctor)}</span><button type="button" class="text-button" data-study-remove-doctor="${course.id}" aria-label="إزالة اختيار الدكتور لهذه المادة">${icon('close')}</button></div>`:''}${course?.linkable?`<div class="study-course-actions">${selectedDoctor?`<button type="button" class="text-button" data-study-review="${course.id}">${icon('star')} تقييم الدكتور المختار</button>`:''}<button type="button" class="text-button study-doctors-button" data-study-doctors="${course.id}">${icon('profile')} ${selectedDoctor?'تغيير الدكتور':'اختيار الدكتور'} ${icon('arrow')}</button><button type="button" class="text-button" data-study-advisor="${course.id}">${icon('star')} اختيار الدكتور المناسب</button></div>`:''}</article>`;
 }
 function content(plan){
  const state=progress(plan),summary=progressSummary(plan,state),required=plan.courses.filter(c=>c.level>0);
  const statuses=new Map(required.map(c=>[c.id,courseStatus(plan,c,state)]));
  const ready=required.filter(c=>['ready','concurrent'].includes(statuses.get(c.id).key)).length;
  const shown=required.filter(c=>(filter==='all'||(filter==='remaining'?statuses.get(c.id).key!=='completed':filter==='ready'?['ready','concurrent'].includes(statuses.get(c.id).key):statuses.get(c.id).key===filter))&&(!search||[c.name,c.code,selectedCourse(plan,c,state)?.name].filter(Boolean).some(s=>courseNameKey(s).includes(courseNameKey(search)))));
  return `<section class="panel study-overview"><div class="study-progress-heading"><div><span class="eyebrow">إنجازك في الخطة</span><h2>${number(summary.completed)} من ${number(summary.total)} متطلبًا</h2></div><strong>${number(summary.percent)}٪</strong></div><div class="study-progress-track" role="progressbar" aria-label="متطلبات الخطة المكتملة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.percent}"><span style="width:${summary.percent}%"></span></div><div class="study-metrics"><div><b>${number(summary.remaining)}</b><span>متطلب متبقٍ</span></div><div><b>${number(ready)}</b><span>متاحة مبدئيًا أو بتزامن</span></div><div><b>${number(summary.completedCredits)}</b><span>ساعة مكتملة${summary.uncertainCredits?' · دون غير المحسومة':''}</span></div></div>${(plan.scopeNote??'الخطة لا تشمل المسار الهندسي.')?`<p class="study-advisory">${esc(plan.scopeNote??'الخطة لا تشمل المسار الهندسي.')}</p>`:''}</section><section class="study-directory"><div class="study-tools"><div class="study-filters" role="group" aria-label="تصفية مواد الخطة">${[['all','جميع المواد'],['remaining','المتبقية'],['ready','المتاحة مبدئيًا'],['completed','المكتملة'],['review','تحتاج تأكيدًا']].map(([id,label])=>`<button type="button" class="chip ${id===filter?'selected':''}" data-study-filter="${id}" aria-pressed="${id===filter}">${label}</button>`).join('')}</div><label class="study-search">${icon('search')}<input id="study-search" placeholder="ابحث باسم المادة أو رمزها" aria-label="البحث في الخطة" value="${esc(search)}"><button type="button" id="study-clear-search" class="icon-btn" aria-label="مسح بحث الخطة" ${search?'':'hidden'}>${icon('close')}</button></label></div><div class="study-results" aria-live="polite">${number(shown.length)} متطلبًا</div>${shown.length?[...new Set(shown.map(c=>c.level))].sort((a,b)=>a-b).map(level=>`<section class="study-level"><h2>المستوى ${number(level)}</h2><div class="study-courses-grid">${shown.filter(c=>c.level===level).map(c=>courseCard(plan,c,state)).join('')}</div></section>`).join(''):'<p class="panel empty">لا توجد مواد تطابق هذا الاختيار.</p>'}</section>`;
 }
 function bindContent(plan){
  const root=document.querySelector('#study-progress-content');if(!root)return;
  function update(change,focusId){const state=progress(plan);change(state);save(plan,state);root.innerHTML=content(plan);bindContent(plan);if(focusId)root.querySelector(focusId)?.focus({preventScroll:true});}
  root.querySelectorAll('[data-study-complete]').forEach(input=>input.onchange=()=>update(s=>{s.completed=input.checked?[...s.completed,input.dataset.studyComplete]:s.completed.filter(id=>id!==input.dataset.studyComplete);if(!input.checked)s.preparatoryCompleted=s.preparatoryCompleted.filter(id=>id!==input.dataset.studyComplete);},`[data-study-complete="${input.dataset.studyComplete}"]`));
  root.querySelectorAll('[data-study-preparatory]').forEach(button=>button.onclick=()=>update(s=>{const id=button.dataset.studyPreparatory,was=s.preparatoryCompleted.includes(id);s.preparatoryCompleted=was?s.preparatoryCompleted.filter(value=>value!==id):[...s.preparatoryCompleted,id];s.completed=was?s.completed.filter(value=>value!==id):[...new Set([...s.completed,id])];},`[data-study-preparatory="${button.dataset.studyPreparatory}"]`));
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
  modal('اختيار دكتور المادة',`<div id="study-course-doctors"><div class="study-doctor-heading"><span class="eyebrow">${esc(plan.university)} · ${esc(plan.title)}</span><h3>${esc(course.name)}</h3>${course.platformAddition&&course.code==='DRAWING'?'':`<p>${esc(course.code)}</p>`}</div><p class="muted">ابحث بين دكاترة جامعتك من جميع الكليات. اختيارك يُحفظ في خطتك؛ يمكنك تقييم الدكتور من خطتك أو من قسم التقييمات؛ يُحفظ تقييم واحد للدكتور في كل مادة، ويمكن طلب تعديل تقييم المادة نفسها.</p><label class="study-search">${icon('search')}<input id="study-doctor-search" type="search" placeholder="ابحث باسم الدكتور…" aria-label="البحث عن دكتور لخطة التخرج" autocomplete="off"></label><div id="study-doctor-options" class="study-doctor-options" aria-live="polite"></div><section class="missing-course-doctor"><h3>ألم تجد دكتور المادة؟</h3><p>أرسل بيانات الدكتور للإدارة، وأضف تقييمًا إذا رغبت.</p><button type="button" class="primary" id="study-request-doctor">أضف الدكتور الآن</button></section></div>`);
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
  paint();root.querySelector('#study-doctor-search').focus();
 }
 function attachReview(form,{university,college,major,courseId,studentOnly=false,reviewedSubjects=[],checkingSubjects=false,onEdit}={}){
  const subject=form.querySelector('[name=subject]');
  if(!subject)return;
  const reviewPlans=studentOnly?available():getStudyPlans().filter(p=>p.university===university);
  if(studentOnly&&!reviewPlans.some(p=>p.courses.some(c=>c.id===courseId)))courseId=undefined;
  // Historical shorthand must remain ambiguous across the entire university;
  // limiting this lookup to one specialty could reserve the wrong old subject.
  const allCourses=getStudyPlans().filter(p=>p.university===university).flatMap(p=>p.courses.filter(c=>c.kind==='course'&&c.linkable).map(c=>({...c,planId:p.id,planTitle:p.title})));
  const catalogue=()=>allCourses;
  let blocked=reviewedCourseKeys(reviewedSubjects,catalogue()),loading=checkingSubjects;
  const section=document.createElement('div');section.className='study-review-selection';subject.closest('.form-grid').before(section);
  const note=document.createElement('p');note.className='reviewed-subject-note';note.innerHTML='المواد التي سبق تقييمها لهذا الدكتور غير متاحة لتقييم جديد. <button type="button" class="text-button">طلب تعديل تقييم سابق</button>';
  subject.closest('.form-grid').after(note);note.querySelector('button').onclick=()=>onEdit?.();
  const suggestions=document.createElement('div');suggestions.className='known-course-suggestions';suggestions.setAttribute('aria-live','polite');const subjectLabel=subject.closest('label'),subjectField=document.createElement('div');subjectField.className='review-subject-field';subjectLabel.replaceWith(subjectField);subjectField.append(subjectLabel,suggestions);
  const validate=()=>{
   const select=section.querySelector('#review-study-course');
   const matches=studentOnly||select?.value?[]:knownCourseMatches(subject.value,catalogue());
   const previous=blocked.has(courseNameKey(subject.value));
   subject.setCustomValidity(previous?'سبق أن قيّمت هذا الدكتور في المادة نفسها. اختر مادة أخرى أو اطلب تعديل تقييمك.':matches.length?'هذه المادة موجودة في القائمة. اختر اسم المقرر ورمزه من القائمة بدل كتابته يدويًا.':'');
   suggestions.replaceChildren();suggestions.hidden=!matches.length;
   if(!matches.length)return;
   const message=document.createElement('small');message.textContent=matches.length>1?'هذه المادة موجودة في الخطط. اختر المقرر المقصود باسمه ورمزه:':'هذه المادة موجودة في القائمة؛ اخترها لربط تقييمك بالمقرر الصحيح:';suggestions.append(message);
   const currentPlan=section.querySelector('#review-study-plan')?.value;
   matches.sort((a,b)=>Number(b.planId===currentPlan)-Number(a.planId===currentPlan));
   for(const course of matches.slice(0,6)){
    const button=document.createElement('button');button.type='button';button.className='known-course-choice';button.dataset.pickReviewCourse=course.id;
    const rated=blocked.has(courseNameKey(course.name));button.disabled=loading||rated;button.textContent=`${course.name} · ${course.code} · ${course.planTitle}${rated?' — سبق تقييمها':''}`;
    button.onclick=()=>{
     const planSelect=section.querySelector('#review-study-plan');planSelect.value=course.planId;planSelect.dispatchEvent(new Event('change'));
     const courseSelect=section.querySelector('#review-study-course');courseSelect.value=course.id;courseSelect.dispatchEvent(new Event('change'));courseSelect.focus({preventScroll:true});
    };suggestions.append(button);
   }
   if(matches.length>6){const more=document.createElement('small');more.textContent='يمكنك عرض بقية المقررات من قائمة خطة المادة.';suggestions.append(more);}
  };
  subject.addEventListener('input',validate);
  const apply=()=>{
    note.hidden=!blocked.size;
    const select=section.querySelector('#review-study-course');
    if(select){
      select.disabled=loading;select.setAttribute('aria-busy',String(loading));
      for(const option of select.options){
        const disabled=!!option.dataset.subject&&blocked.has(courseNameKey(option.dataset.subject));
        option.disabled=disabled;option.classList.toggle('reviewed-course',disabled);
        option.textContent=option.dataset.label+(disabled?' — سبق تقييمها':'');
      }
      if(select.selectedOptions[0]?.disabled){select.value='';subject.value='';subject.readOnly=studentOnly;}
    }
    validate();
  };
  function update(preselect){
   const choices=reviewPlans;
   section.hidden=!choices.length&&!studentOnly;
   section.innerHTML=choices.length?`<label ${studentOnly?'hidden':''}>خطة المادة<select id="review-study-plan">${choices.map(p=>`<option value="${p.id}" ${preselect?.startsWith(p.id+'/')||(!preselect&&p.id===current()?.id)?'selected':''}>${esc(p.title)} · ${esc(p.fileLabel)}</option>`).join('')}</select></label><label>المادة من خطتك<select name="courseId" id="review-study-course" ${studentOnly?'required':''}><option value="">${studentOnly?'اختر المادة من خطتك':'مادة أخرى أو غير محددة في الخطة'}</option></select></label><small class="muted">${studentOnly?esc(current()?.title||'')+' · تظهر مواد تخصصك المحفوظ.':'اختيار مادة من الخطة يربط هذا الدكتور بها بعد اعتماد التقييم.'}</small>`:studentOnly?'<p role="status">خطة تخصصك لم تُضف بعد. يمكنك طلب إضافتها عبر <a href="mailto:info@miyar.website">info@miyar.website</a>، أو تغيير تخصصك من الإعدادات.</p>':'';
   subjectLabel.hidden=studentOnly;
   subject.readOnly=studentOnly;subject.placeholder=choices.length?'اسم مادة غير موجودة في القائمة':'اسم المادة';
   if(!choices.length){apply();if(studentOnly)subject.setCustomValidity('خطة تخصصك لم تُضف بعد.');return;}
   const fill=()=>{
    const plan=choices.find(p=>p.id===section.querySelector('#review-study-plan').value);
    section.querySelector('#review-study-course').innerHTML=`<option value="" data-label="${studentOnly?'اختر المادة من خطتك':'مادة أخرى أو غير محددة في الخطة'}">${studentOnly?'اختر المادة من خطتك':'مادة أخرى أو غير محددة في الخطة'}</option>`+groupedCourseOptions(plan,plan.courses.filter(c=>c.kind==='course'&&c.linkable),c=>`<option value="${c.id}" data-subject="${esc(c.name)}" data-label="${esc((c.platformAddition&&c.code==='DRAWING'?'':c.code+' · ')+c.name)}" ${preselect===c.id?'selected':''}>${esc((c.platformAddition&&c.code==='DRAWING'?'':c.code+' · ')+c.name)}</option>`);
    const select=section.querySelector('#review-study-course');
    const sync=()=>{const c=plan.courses.find(c=>c.id===select.value);if(c&&blocked.has(courseNameKey(c.name))){select.value='';subject.value='';subject.readOnly=studentOnly;}else{subject.readOnly=studentOnly||!!c;if(c)subject.value=c.name;else if(studentOnly)subject.value='';}validate();};select.onchange=sync;apply();sync();
   };
   section.querySelector('#review-study-plan').onchange=()=>{preselect=null;subject.value='';fill();};fill();
  }
  // The teaching department can differ from the student's course department.
  if(college&&major){const c=form.querySelector('[name=college]'),m=form.querySelector('[name=major]');c.value=college;c.dispatchEvent(new Event('change'));m.value=major;}
  update(courseId);
  return {setReviewedSubjects(subjects){blocked=reviewedCourseKeys(subjects,catalogue());apply();},setLoading(value){loading=value;apply();}};
 }
 return {page,bind,attachReview,current,available};
}
