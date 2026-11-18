import {canvasPdf,downloadFile} from './timetable-export.js';
import {drawStudyPlanPage,planThemes,studyPlanPages} from './study-plan-pdf.js';
import './study-plan-download.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fontsReady=()=>Promise.all([
 document.fonts.load('400 24px Thmanyah','الخطة الدراسية'),
 document.fonts.load('700 43px Thmanyah','الخطة الدراسية'),
]);

export function createStudyPlanDownload({timetable,plans,currentPlan,loadPlans,icon}){
 let active=null,showSection;
 function page(){
  if(!document.querySelector('.study-desk'))active=null;
  return `<div class="study-desk">
   <section class="study-desk-landing" aria-labelledby="study-desk-title" ${active?'hidden':''}>
    <h1 id="study-desk-title" tabindex="-1">جدولي</h1>
    <div class="study-desk-choices">
     <button type="button" data-study-desk="download" aria-controls="study-desk-download">
      <span class="study-desk-art study-desk-art-plan" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="study-desk-card-copy"><strong>الخطة الدراسية</strong><small>خصّص قالب خطتك ونزّلها PDF</small></span>
      <span class="study-desk-arrow" aria-hidden="true">${icon('arrow')}</span>
     </button>
     <button type="button" data-study-desk="schedule" aria-controls="study-desk-schedule">
      <span class="study-desk-art study-desk-art-schedule" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="study-desk-card-copy"><strong>الجدول الدراسي</strong><small>رتّب موادك ومواعيدك الأسبوعية</small></span>
      <span class="study-desk-arrow" aria-hidden="true">${icon('arrow')}</span>
     </button>
    </div>
   </section>
   <div id="study-desk-schedule" ${active==='schedule'?'':'hidden'}>${timetable.page()}</div>
   <section id="study-desk-download" class="panel study-desk-download" aria-labelledby="study-download-title" ${active==='download'?'':'hidden'}>
    <h1 id="study-download-title">تحميل الخطة الدراسية</h1>
    <div data-study-download-content></div>
   </section>
  </div>`;
 }
 function bind(){
  timetable.bind();
  const root=document.querySelector('.study-desk'),landing=root.querySelector('.study-desk-landing');
  const schedule=root.querySelector('#study-desk-schedule'),download=root.querySelector('#study-desk-download');
  let loaded=false;
  showSection=(section,moveFocus=false)=>{
   const previous=active;
   active=section;
   landing.hidden=Boolean(section);
   schedule.hidden=section!=='schedule';
   download.hidden=section!=='download';
   const backButton=document.querySelector('#page-close');
   backButton?.setAttribute('aria-label',section?'رجوع إلى أقسام جدولي':'رجوع');
   if(section==='download'&&!loaded){loaded=true;void prepare(download.querySelector('[data-study-download-content]'));}
   if(moveFocus){
    const heading=section?(section==='schedule'?schedule:download).querySelector('h1'):landing.querySelector(`[data-study-desk="${previous}"]`);
    if(heading){if(section)heading.tabIndex=-1;heading.focus();}
    window.scrollTo({top:0});
   }
  };
  root.querySelectorAll('[data-study-desk]').forEach(button=>button.onclick=()=>showSection(button.dataset.studyDesk,true));
  showSection(active);
 }
 function back(){
  if(!active)return false;
  showSection(null,true);
  return true;
 }

 async function prepare(content){
  content.innerHTML='<p role="status">جارٍ تحميل الخطط الدراسية…</p>';
  try{await loadPlans();}
  catch{
   if(!content.isConnected)return;
   content.innerHTML='<p role="alert">تعذّر تحميل الخطط الدراسية.</p><button type="button" class="secondary">إعادة المحاولة</button>';
   content.querySelector('button').onclick=()=>prepare(content);
   return;
  }
  if(!content.isConnected)return;
  const available=plans();
  if(!available.length){content.innerHTML='<p>لا توجد خطة متاحة لتخصصك حاليًا.</p>';return;}
  const selected=currentPlan()?.id;
  content.innerHTML=`<div class="study-download-layout">
   <form class="study-download-controls">
    <label>الخطة الدراسية<select name="plan">${available.map(plan=>`<option value="${esc(plan.id)}" ${plan.id===selected?'selected':''}>${esc([plan.title||plan.major,plan.fileLabel||plan.version].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>
    <fieldset><legend>القالب</legend><div class="study-download-themes">
     ${planThemes.map(({id,name},index)=>`<label><input type="radio" name="theme" value="${id}" ${index===0?'checked':''}><span class="plan-theme-sample plan-theme-${id}" aria-hidden="true"><i></i><i></i><i></i></span><span>${name}</span></label>`).join('')}
    </div></fieldset>
    <label class="study-download-color">لون القالب<input name="color" type="color" value="#276659"></label>
    <label>اسم أو نص على الخطة <small>اختياري</small><input name="note" maxlength="80" placeholder="مثال: خطة سارة الدراسية" dir="auto"></label>
    <button type="submit" class="primary">تحميل الخطة PDF</button>
    <p class="form-error" role="alert"></p>
   </form>
   <figure class="study-download-preview">
    <figcaption>معاينة الصفحة الأولى <span data-study-page-count></span></figcaption>
    <canvas role="img" aria-label="معاينة الصفحة الأولى من الخطة الدراسية"></canvas>
   </figure>
  </div>`;
  const form=content.querySelector('form'),preview=content.querySelector('canvas');
  const fields=form.elements,button=form.querySelector('button'),message=form.querySelector('[role=alert]');
  const read=()=>({
   plan:available.find(plan=>plan.id===fields.plan.value),
   options:{theme:fields.theme.value,color:fields.color.value,note:fields.note.value.trim()},
  });
  function update(){
   const {plan,options}=read();
   const pages=studyPlanPages(plan);
   form.style.setProperty('--plan-color',options.color);
   drawStudyPlanPage(preview,plan,pages,0,options);
   content.querySelector('[data-study-page-count]').textContent=`1 / ${pages.length}`;
  }
  form.addEventListener('input',update);
  form.onsubmit=async event=>{
   event.preventDefault();
   if(button.disabled)return;
   const {plan,options}=read();
   button.disabled=true;message.textContent='';
   try{
    await fontsReady();
    const pages=studyPlanPages(plan);
    const canvases=pages.map((_,index)=>{
     const canvas=document.createElement('canvas');
     drawStudyPlanPage(canvas,plan,pages,index,options);
     return canvas;
    });
    downloadFile(canvasPdf(canvases),'miyar-study-plan.pdf');
   }catch{message.textContent='تعذّر إنشاء ملف PDF. أعد المحاولة.';}
   finally{button.disabled=false;}
  };
  update();
  void fontsReady().then(()=>{if(content.isConnected)update();}).catch(()=>{});
 }

 return {page,bind,back};
}
