import {courseNameKey,knownCourseMatches,reviewedCourseKeys} from './course-names.js';
import {groupedCourseOptions} from './course-options.js';
import {getStudyPlans} from './study-catalogue.js';
import {storage} from './storage.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createStudyPlanner({icon,universityName,ownerKey,majorName,studentPlans}) {
 const available=()=>studentPlans?.()??getStudyPlans().filter(p=>!universityName()||p.university===universityName());
 const selectionKey=()=>`miyar-study-selected:${ownerKey()}:${universityName()||'all'}`;
 function current(){const list=available();return list.find(p=>p.id===storage.getItem(selectionKey()))||list.find(p=>[p.major,...(p.majorAliases||[])].includes(majorName()))||list[0];}
 function attachReview(form,{university,college,major,courseId,studentOnly=false,reviewedSubjects=[],optional=false,allowCustom=true,checkingSubjects=false,onEdit}={}){
  const subject=form.querySelector('[name=subject]');
  if(!subject)return;
  const reviewPlans=studentOnly?available():getStudyPlans().filter(p=>p.university===university);
  if(studentOnly&&!reviewPlans.some(p=>p.courses.some(c=>c.id===courseId)))courseId=undefined;
  // Historical shorthand must remain ambiguous across the entire university;
  // limiting this lookup to one specialty could reserve the wrong old subject.
  const allCourses=getStudyPlans().filter(p=>p.university===university).flatMap(p=>p.courses.filter(c=>c.kind==='course'&&c.linkable).map(c=>({...c,planId:p.id,planTitle:p.title})));
  const catalogue=()=>allCourses;
  let blocked=reviewedCourseKeys(reviewedSubjects,catalogue()),loading=checkingSubjects,optionalReview=optional,customDraft='',selectedOfficial='';
  const gradeGrid=subject.closest('.form-grid');gradeGrid.classList.add('review-grade-grid');
  const section=document.createElement('div');section.className='study-review-selection';gradeGrid.before(section);
  const note=document.createElement('p');note.className='reviewed-subject-note';note.innerHTML='المواد التي سبق تقييمها لهذا الدكتور غير متاحة لتقييم جديد. <button type="button" class="text-button">طلب تعديل تقييم سابق</button>';
  gradeGrid.after(note);note.querySelector('button').onclick=()=>onEdit?.();
  const suggestions=document.createElement('div');suggestions.className='known-course-suggestions';suggestions.setAttribute('aria-live','polite');const subjectLabel=subject.closest('label'),subjectField=document.createElement('div');subjectField.className='review-subject-field';subjectLabel.replaceWith(subjectField);subjectField.append(subjectLabel,suggestions);
  subjectField.id='review-custom-course-field';subject.id='review-custom-course-name';subject.minLength=2;subject.maxLength=120;subjectLabel.firstChild.textContent='اسم المادة غير الموجودة';
  const customHint=document.createElement('small');customHint.className='muted';customHint.textContent='اكتب الاسم كما درسته؛ ستراجعه الإدارة مع التقييم.';subjectField.append(customHint);
  const validate=()=>{
   const select=section.querySelector('#review-study-course');
   const matches=!select||select.value&&select.value!=='__other__'?[]:knownCourseMatches(subject.value,catalogue());
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
     const planSelect=section.querySelector('#review-study-plan');
     if([...planSelect.options].some(option=>option.value===course.planId)){planSelect.value=course.planId;planSelect.dispatchEvent(new Event('change'));}
     const courseSelect=section.querySelector('#review-study-course');
     if(![...courseSelect.options].some(option=>option.value===course.id)){const option=new Option(`${course.code} · ${course.name}`,course.id);option.dataset.subject=course.name;option.dataset.label=option.textContent;courseSelect.append(option);}
     courseSelect.value=course.id;courseSelect.dispatchEvent(new Event('change'));courseSelect.focus({preventScroll:true});
    };suggestions.append(button);
   }
   if(matches.length>6){const more=document.createElement('small');more.textContent='يمكنك عرض بقية المقررات من قائمة خطة المادة.';suggestions.append(more);}
  };
  subject.addEventListener('input',()=>{if(section.querySelector('#review-study-course')?.value==='__other__')customDraft=subject.value;validate();});
  const apply=()=>{
    note.hidden=!blocked.size;
    const add=section.querySelector('#review-add-custom-course');if(add)add.disabled=loading;
    const select=section.querySelector('#review-study-course');
    if(select){
      select.disabled=loading;select.required=!optionalReview;select.setAttribute('aria-busy',String(loading));
      for(const option of select.options){
        const disabled=!!option.dataset.subject&&blocked.has(courseNameKey(option.dataset.subject));
        option.disabled=disabled;option.classList.toggle('reviewed-course',disabled);
        option.textContent=option.dataset.label+(disabled?' — سبق تقييمها':'');
      }
      if(select.selectedOptions[0]?.disabled){select.value='';subject.value='';subject.readOnly=false;}
    }
    validate();
  };
  function update(preselect){
   const choices=reviewPlans;
   section.hidden=!choices.length&&!studentOnly&&!allowCustom;
   section.innerHTML=choices.length?`<label ${studentOnly?'hidden':''}>خطة المادة<select id="review-study-plan">${choices.map(p=>`<option value="${p.id}" ${preselect?.startsWith(p.id+'/')||(!preselect&&p.id===current()?.id)?'selected':''}>${esc(p.title)} · ${esc(p.fileLabel)}</option>`).join('')}</select></label><label>المادة من خطتك<select name="courseId" id="review-study-course"><option value="">${studentOnly?'اختر المادة من خطتك':'مادة أخرى أو غير محددة في الخطة'}</option></select></label>${allowCustom?`<button type="button" class="secondary review-add-custom-course" id="review-add-custom-course" aria-controls="review-custom-course-field" aria-expanded="false">${icon('plus')} أضف مادة غير موجودة</button>`:''}<small class="muted" data-review-course-context>${studentOnly?esc(current()?.title||'')+' · تظهر مواد تخصصك المحفوظ.':'اختيار مادة من الخطة يربط هذا الدكتور بها بعد اعتماد التقييم.'}</small>`:studentOnly?'<p role="status">خطة تخصصك لم تُضف بعد. يمكنك طلب إضافتها عبر <a href="mailto:info@miyar.website">info@miyar.website</a>، أو تغيير تخصصك من الإعدادات.</p>':'';
   section.insertBefore(subjectField,section.querySelector('[data-review-course-context]'));
   subjectField.hidden=subjectLabel.hidden=studentOnly&&(choices.length>0||!allowCustom);
   subject.readOnly=studentOnly&&!allowCustom;subject.placeholder='اكتب اسم المادة…';
   if(!choices.length){apply();subject.required=!optionalReview;return;}
   const fill=()=>{
    const plan=choices.find(p=>p.id===section.querySelector('#review-study-plan').value);
    const placeholder=optionalReview?'بدون تحديد مادة (اختياري)':studentOnly?'اختر المادة من خطتك':'اختر مادة أو اكتب مادة أخرى';
    section.querySelector('#review-study-course').innerHTML=`<option value="" data-label="${placeholder}">${placeholder}</option>${allowCustom?'<option value="__other__" data-label="مادة غير موجودة في القائمة — اكتب اسمها">مادة غير موجودة في القائمة — اكتب اسمها</option>':''}`+groupedCourseOptions(plan,plan.courses.filter(c=>c.kind==='course'&&c.linkable),c=>`<option value="${c.id}" data-subject="${esc(c.name)}" data-label="${esc((c.platformAddition&&c.code==='DRAWING'?'':c.code+' · ')+c.name)}" ${preselect===c.id?'selected':''}>${esc((c.platformAddition&&c.code==='DRAWING'?'':c.code+' · ')+c.name)}</option>`);
    const select=section.querySelector('#review-study-course');
    const sync=()=>{const c=catalogue().find(c=>c.id===select.value),custom=select.value==='__other__';
     if(c&&blocked.has(courseNameKey(c.name))){select.value='';subject.value='';subject.readOnly=false;}
     else{subject.readOnly=!!c;if(c){subject.value=c.name;selectedOfficial=c.id;}else if(custom)subject.value=customDraft;else subject.value='';}
     subjectField.hidden=subjectLabel.hidden=!!c||studentOnly&&!custom;subject.required=custom||!optionalReview;
     const add=section.querySelector('#review-add-custom-course');if(add){add.setAttribute('aria-expanded',String(custom));add.innerHTML=icon(custom?'book':'plus')+(custom?' اختر مادة من القائمة':' أضف مادة غير موجودة');}
     validate();
    };select.onchange=sync;apply();sync();
   };
   section.querySelector('#review-study-plan').onchange=()=>{preselect=null;subject.value='';selectedOfficial='';customDraft='';fill();};
   const add=section.querySelector('#review-add-custom-course');if(add)add.onclick=()=>{
    const select=section.querySelector('#review-study-course'),custom=select.value==='__other__';
    select.value=custom?([...select.options].some(option=>option.value===selectedOfficial&&!option.disabled)?selectedOfficial:''):'__other__';
    select.dispatchEvent(new Event('change',{bubbles:true}));
    if(custom)select.focus({preventScroll:true});else subject.focus();
   };
   fill();
  }
  // The teaching department can differ from the student's course department.
  if(college&&major){const c=form.querySelector('[name=college]'),m=form.querySelector('[name=major]');c.value=college;c.dispatchEvent(new Event('change'));m.value=major;}
  update(courseId);
  return {setOptional(value){optionalReview=value;subject.required=section.querySelector('#review-study-course')?.value==='__other__'||!value;const select=section.querySelector('#review-study-course');if(select){select.required=!value;select.options[0].dataset.label=select.options[0].textContent=value?'بدون تحديد مادة (اختياري)':'اختر المادة من خطتك';}validate();},setReviewedSubjects(subjects){blocked=reviewedCourseKeys(subjects,catalogue());apply();},setLoading(value){loading=value;apply();}};
 }
 return {attachReview,current,available};
}
