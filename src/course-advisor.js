import {reviewDate} from './review-date.js';
import {groupedCourseOptions} from './course-options.js';
import {reviewLikeButton} from './review-likes.js';
import {reviewCarousel,bindReviewCarousel} from './review-carousel.js';
import {courseNameKey} from './course-names.js';
import {officeBadge} from './doctor-office.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('en-US');
export function createCourseAdvisor({api,modal,icon,plans,currentPlan,onDoctor,onRequestDoctor,onReviewLikes,onCompare,scopeKey=()=>''}){
 let selectedPlan='',selectedCourse='',search='',revision=0;
 function plan(){const list=plans();return list.find(p=>p.id===selectedPlan)||currentPlan()||list[0];}
 function courses(p){return p.courses.filter(c=>c.kind==='course'&&c.linkable);}
 function select(planId,courseId){selectedPlan=planId;selectedCourse=courseId;search='';}
 function page(){
  const p=plan();
  if(!p)return `<section class="course-advisor"><h1>دكاترة المادة</h1><p class="panel empty">خطة تخصصك لم تُضف بعد.</p></section>`;
  selectedPlan=p.id;
  if(!courses(p).some(c=>c.id===selectedCourse))selectedCourse='';
  return `<section class="course-advisor"><div class="study-intro"><span class="eyebrow">اختيارك يبدأ من المادة</span><h1>دكاترة المادة</h1><p>اختر مادتك من خطة تخصصك، وقارن الدكاترة الذين درّسوها من جميع تخصصات وكليات جامعتك.</p></div><section class="panel advisor-controls"><label>خطة التخصص<select id="advisor-plan">${plans().map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.title)} · ${esc(x.fileLabel)}</option>`).join('')}</select></label><label class="study-search">${icon('search')}<input id="advisor-search" type="search" value="${esc(search)}" placeholder="ابحث باسم المادة أو رمزها…" aria-label="البحث عن مادة لاختيار الدكتور"></label><label>المادة<select id="advisor-course">${courseOptions(p)}</select></label><p class="muted">نُظهر دكاترة المادة من جميع تخصصات الجامعة، ونجمع صيغ الاسم مثل «استاتيكا» و«الاستاتيكا». الترتيب يعتمد على تقييمات المادة المنشورة، ويظهر عدد التجارب بجانب كل دكتور.</p></section><div id="advisor-results" aria-live="polite"></div></section>`;
 }
 function card({pending=false,error=''}={}){
  const p=plan(),list=plans();
  const heading=`<div class="course-finder-heading"><span class="course-finder-icon" aria-hidden="true">${icon('cap')}</span><div><h2 id="course-finder-title">مين يدرّس مادتك؟</h2><p>اختر مادتك من خطة تخصصك، وشوف دكاترتها من جميع تخصصات الجامعة.</p></div></div>`;
  let body;
  if(pending)body='<div class="course-finder-message" role="status" aria-busy="true">جارٍ تحميل مواد تخصصك…</div>';
  else if(error)body='<div class="course-finder-message"><p role="alert">تعذّر تحميل مواد تخصصك.</p><button type="button" class="secondary" id="finder-plans-retry">إعادة المحاولة</button></div>';
  else if(!p||!courses(p).length)body='<p class="course-finder-message">خطة تخصصك لم تُضف بعد. ستظهر موادك هنا عند إضافتها.</p>';
  else{
   selectedPlan=p.id;search='';
   if(!courses(p).some(c=>c.id===selectedCourse))selectedCourse='';
   body=`<div class="course-finder-controls">${list.length>1?`<label>نسخة الخطة<select id="finder-plan">${list.map(x=>`<option value="${esc(x.id)}" ${x.id===p.id?'selected':''}>${esc(x.title)} · ${esc(x.fileLabel)}</option>`).join('')}</select></label>`:''}<label for="finder-course">المادة من خطتك</label><select id="finder-course">${courseOptions(p)}</select><p class="course-finder-context">${esc(p.major)} · ${esc(p.university)}</p><p class="course-finder-note">النتائج من تقييمات المادة المنشورة، ولا تعني توفر شعبة حالية.</p></div><div class="course-finder-result" id="finder-result" aria-live="polite"><p class="course-finder-message">اختر المادة لعرض دكاترتها وتقييماتهم.</p></div>`;
  }
  return `<section class="panel course-finder" aria-labelledby="course-finder-title">${heading}${body}</section>`;
 }
 function bindCard(){
  const root=document.querySelector('.course-finder'),control=root?.querySelector('#finder-course');if(!control)return;
  const result=root.querySelector('#finder-result'),owner=scopeKey();let request=0;
  const current=()=>root.isConnected&&scopeKey()===owner;
  root.querySelector('#finder-plan')?.addEventListener('change',event=>{selectedPlan=event.target.value;selectedCourse='';search='';control.innerHTML=courseOptions(plan());root.querySelector('.course-finder-context').textContent=plan().major+' · '+plan().university;void load();});
  control.onchange=()=>{selectedCourse=control.value;void load();};
  async function load(){
   if(!current())return;
   const revision=++request,p=plan(),course=p?courses(p).find(c=>c.id===control.value):null;
   if(!course){result.innerHTML='<p class="course-finder-message">اختر المادة لعرض دكاترتها وتقييماتهم.</p>';return;}
   result.innerHTML='<div class="course-finder-message" role="status" aria-busy="true">جارٍ تحميل دكاترة المادة…</div>';
   try{
    const rows=await api('course.doctors',{courseId:course.id});
    if(revision!==request||!current())return;
    if(!Array.isArray(rows))throw new Error('تعذّر تحميل دكاترة المادة.');
    if(!rows.length){result.innerHTML='<div class="course-finder-message"><p>لا توجد تقييمات منشورة لهذه المادة بعد.</p><button type="button" class="secondary" id="finder-add-doctor">إضافة دكتور المادة</button></div>';result.querySelector('button').onclick=()=>onRequestDoctor?.(course,p);return;}
    result.innerHTML=`<div class="course-finder-results-heading"><p>${number(rows.length)} ${rows.length===1?'دكتور':'دكاترة'} للمادة</p><div class="carousel-controls"><button type="button" class="carousel-control previous" id="finder-previous" aria-label="الدكاترة السابقون للمادة" aria-controls="course-finder-track">${icon('arrow')}</button><button type="button" class="carousel-control" id="finder-next" aria-label="الدكاترة التاليون للمادة" aria-controls="course-finder-track">${icon('arrow')}</button></div></div><div class="course-finder-track" id="course-finder-track" role="region" aria-label="دكاترة ${esc(course.name)}؛ اسحب لعرض الجميع" tabindex="0">${rows.map(doctor=>`<article class="course-finder-doctor" data-finder-doctor="${doctor.id}"><div class="course-finder-person"><span class="avatar" aria-hidden="true">${icon('profile')}</span><div><h3>${esc(doctor.name)} ${officeBadge(doctor)}</h3><p>${[doctor.college,doctor.major].filter(Boolean).map(esc).join(' · ')}</p></div></div><div class="course-finder-score"><div><strong dir="ltr">${number(doctor.score)}<small>/ 100</small></strong><span>${number(doctor.count)} تقييمًا منشورًا لهذه المادة</span></div></div><div class="course-finder-actions"><button type="button" class="primary" data-finder-reviews="${doctor.id}">تقييمات هذه المادة ${icon('book')}</button><button type="button" class="text-button" data-finder-profile="${doctor.id}">بطاقة الدكتور ${icon('arrow')}</button></div></article>`).join('')}</div><button type="button" class="primary course-finder-compare" id="finder-compare">مقارنة تفصيلية لدكاترة المادة ${icon('arrow')}</button>`;
    result.querySelectorAll('[data-finder-profile]').forEach(button=>button.onclick=()=>onDoctor(Number(button.dataset.finderProfile)));
    result.querySelectorAll('[data-finder-reviews]').forEach(button=>button.onclick=()=>reviews(course,rows.find(doctor=>doctor.id===Number(button.dataset.finderReviews))));
    result.querySelector('#finder-compare').onclick=()=>onCompare?.(p,course);
    const track=result.querySelector('.course-finder-track'),previous=result.querySelector('#finder-previous'),next=result.querySelector('#finder-next');
    const update=()=>{if(!track.isConnected)return;const offset=Math.abs(track.scrollLeft),maximum=Math.max(0,track.scrollWidth-track.clientWidth);previous.disabled=offset<=2;next.disabled=offset>=maximum-2;};
    const behavior=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
    const move=direction=>track.scrollBy({left:direction*(track.firstElementChild.getBoundingClientRect().width+(parseFloat(getComputedStyle(track).columnGap)||0)),behavior:behavior()});
    previous.onclick=()=>move(1);next.onclick=()=>move(-1);track.onscroll=update;
    track.onkeydown=event=>{if(event.target!==track)return;if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}else if(event.key==='ArrowRight'){event.preventDefault();move(1);}else if(event.key==='Home'||event.key==='End'){event.preventDefault();track.scrollTo({left:event.key==='Home'?0:-(track.scrollWidth-track.clientWidth),behavior:behavior()});}};
    requestAnimationFrame(update);
   }catch(error){if(revision===request&&current()){result.innerHTML=`<div class="course-finder-message"><p role="alert">${esc(error.message)}</p><button type="button" class="secondary" id="finder-retry">إعادة المحاولة</button></div>`;result.querySelector('button').onclick=load;}}
  }
  void load();
 }
 function courseOptions(p){
  const q=courseNameKey(search);
  const rows=courses(p).filter(c=>!q||courseNameKey(c.name).includes(q)||courseNameKey(c.code).includes(q));
  return `<option value="">${rows.length?'اختر المادة':'لا توجد مادة تطابق البحث'}</option>`+groupedCourseOptions(p,rows,c=>`<option value="${c.id}" ${c.id===selectedCourse?'selected':''}>${esc(c.name)}${c.platformAddition&&c.code==='DRAWING'?'':' · '+esc(c.code)}</option>`);
 }
 function bind(){
  const root=document.querySelector('.course-advisor'),control=root?.querySelector('#advisor-plan');if(!control)return;
  const results=root.querySelector('#advisor-results');
  control.onchange=()=>{selectedPlan=control.value;selectedCourse='';search='';root.querySelector('#advisor-search').value='';root.querySelector('#advisor-course').innerHTML=courseOptions(plan());load();};
  root.querySelector('#advisor-search').oninput=event=>{
   search=event.target.value;selectedCourse='';root.querySelector('#advisor-course').innerHTML=courseOptions(plan());load();
  };
  root.querySelector('#advisor-course').onchange=event=>{selectedCourse=event.target.value;load();};
  async function load(){
   const current=++revision,p=plan(),course=courses(p).find(c=>c.id===selectedCourse);
   if(!course){results.innerHTML='<p class="panel empty">اختر المادة لعرض دكاترتها وتقييماتهم.</p>';return;}
   results.innerHTML='<p class="panel" role="status">جارٍ تحميل تقييمات دكاترة المادة…</p>';
   try{
    const rows=await api('course.doctors',{courseId:course.id});
    if(current!==revision||!root.isConnected)return;
    if(!Array.isArray(rows))throw new Error('تعذّر تحميل تقييمات المادة.');
    results.innerHTML=`<div class="advisor-result-heading"><h2>${esc(course.name)}</h2><p>${number(rows.length)} دكتورًا بتقييمات منشورة لهذه المادة · ${esc(p.title)}</p></div>${rows.length?`<div class="advisor-doctors">${rows.map((d,i)=>`<article class="panel advisor-doctor" data-advisor-doctor="${d.id}"><div class="advisor-doctor-top"><span class="advisor-rank">${number(i+1)}</span><span class="avatar" aria-hidden="true">${icon('profile')}</span><div><h3>${esc(d.name)} ${officeBadge(d)}</h3><p>${esc(d.college||'')} · ${esc(d.major||'')}</p></div></div><div class="advisor-score"><strong>${number(d.score)}<small>/ 100</small></strong><span>${number(d.count)} تقييمًا منشورًا لهذه المادة</span></div><dl class="advisor-metrics">${['الشرح','التعامل','المساعدة بالدرجات'].map((label,j)=>`<div><dt>${label}</dt><dd>${number(d.scores[j])}</dd></div>`).join('')}</dl><div class="advisor-actions"><button type="button" class="secondary" data-advisor-reviews="${d.id}">تقييمات هذه المادة ${icon('book')}</button><button type="button" class="text-button" data-advisor-profile="${d.id}">بطاقة الدكتور ${icon('arrow')}</button></div></article>`).join('')}</div>`:'<p class="panel empty">لا توجد تقييمات منشورة كافية لربط دكتور بهذه المادة بعد.</p>'}<section class="panel missing-course-doctor"><h3>ألم تجد دكتور المادة؟</h3><p>أرسل اسم الدكتور وتخصصه للإدارة لإضافته دون كتابة تقييم.</p><button type="button" class="primary" id="advisor-request-doctor">أضف الدكتور الآن ${icon('plus')}</button></section><p class="advisor-note">الأعلى في متوسط تقييم المادة أولًا، وعند التعادل الأكثر تقييمات. اختلاف عدد التجارب مهم عند المقارنة؛ النتائج تعبّر عن تجارب أصحابها.</p>`;
    results.querySelector('#advisor-request-doctor').onclick=()=>onRequestDoctor?.(course,p);
    results.querySelectorAll('[data-advisor-profile]').forEach(button=>button.onclick=()=>onDoctor(Number(button.dataset.advisorProfile)));
    results.querySelectorAll('[data-advisor-reviews]').forEach(button=>button.onclick=()=>reviews(course,rows.find(d=>d.id===Number(button.dataset.advisorReviews))));
   }catch(error){if(current===revision&&root.isConnected){results.innerHTML=`<section class="panel"><p role="alert">${esc(error.message)}</p><button type="button" class="secondary" id="advisor-retry">إعادة المحاولة</button></section>`;results.querySelector('button').onclick=load;}}
  }
  load();
 }
 async function reviews(course,doctor){
  modal('تقييمات المادة',`<div id="advisor-course-reviews"><h3>${esc(doctor.name)} ${officeBadge(doctor)}</h3><p>${esc(course.name)}${course.platformAddition&&course.code==='DRAWING'?'':' · '+esc(course.code)}</p><div class="advisor-review-list"><p role="status">جارٍ تحميل التقييمات…</p></div></div>`);
  const root=document.querySelector('#advisor-course-reviews');
  async function load(){try{
   const rows=await api('course.reviews',{courseId:course.id,doctor:doctor.id});
   if(!root.isConnected)return;
   if(!Array.isArray(rows))throw new Error('تعذّر تحميل التقييمات.');
   root.querySelector('.advisor-review-list').innerHTML=rows.length?reviewCarousel(rows.map(r=>`<article class="review-comment"><b>${esc(r.subject)}</b>${r.comment?`<p>${esc(r.comment)}</p>`:'<p class="muted">تقييم بالمؤشرات دون تعليق.</p>'}<p class="advisor-review-scores">${['الشرح','التعامل','المساعدة بالدرجات'].map((label,i)=>`${label}: ${number(r.scores[i])}`).join(' · ')}</p>${Number.isInteger(r.grade)?`<p class="published-grade">الدرجة في المادة: <b>${r.grade} / 100</b> · دون اسم</p>`:""}<small>طالب مجهول · تاريخ التقييم: ${reviewDate(r.date)}</small><div class="review-tools">${reviewLikeButton(r)}</div></article>`),'advisor-review-track'):'<p class="empty">لا توجد تقييمات منشورة لهذه المادة.</p>';
   bindReviewCarousel(root.querySelector('.review-carousel'));
   onReviewLikes?.(root.querySelector('.advisor-review-list'));
  }catch(error){if(root.isConnected){root.querySelector('.advisor-review-list').innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary">إعادة المحاولة</button>`;root.querySelector('.advisor-review-list button').onclick=load;}}}
  void load();
 }
 return {page,bind,select,card,bindCard};
}
