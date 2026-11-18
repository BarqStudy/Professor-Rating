import {canvasPdf,downloadFile} from './timetable-export.js';
import {drawStudyPlanPage,planThemes,studyPlanPages} from './study-plan-pdf.js';
import './study-plan-download.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fontsReady=()=>Promise.all([
 document.fonts.load('400 24px Thmanyah','الخطة الدراسية'),
 document.fonts.load('700 43px Thmanyah','الخطة الدراسية'),
]);

export function createStudyPlanDownload({timetable,plans,currentPlan,loadPlans,icon}){
 let active='schedule';
 function page(){
  return `<div class="study-desk">
   <nav class="study-desk-nav" aria-label="أقسام جدولي">
    <button type="button" data-study-desk="schedule" aria-pressed="${active==='schedule'}" aria-controls="study-desk-schedule">
     ${icon('calendar')}<span><strong>الجدول الدراسي</strong><small>رتّب موادك ومواعيدك الأسبوعية</small></span>
    </button>
    <button type="button" data-study-desk="download" aria-pressed="${active==='download'}" aria-controls="study-desk-download">
     ${icon('book')}<span><strong>تحميل الخطة الدراسية</strong><small>خصّص قالب خطتك ونزّلها PDF</small></span>
    </button>
   </nav>
   <div id="study-desk-schedule" ${active==='schedule'?'':'hidden'}>${timetable.page()}</div>
   <section id="study-desk-download" class="panel study-desk-download" aria-labelledby="study-download-title" ${active==='download'?'':'hidden'}>
    <h1 id="study-download-title">تحميل الخطة الدراسية</h1>
    <div data-study-download-content></div>
   </section>
  </div>`;
 }
 function bind(){
  timetable.bind();
  const root=document.querySelector('.study-desk');
  const schedule=root.querySelector('#study-desk-schedule'),download=root.querySelector('#study-desk-download');
  let loaded=false;
  function show(section){
   active=section;
   root.querySelectorAll('[data-study-desk]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studyDesk===section)));
   schedule.hidden=section!=='schedule';
   download.hidden=section!=='download';
   if(section==='download'&&!loaded){loaded=true;void prepare(download.querySelector('[data-study-download-content]'));}
  }
  root.querySelectorAll('[data-study-desk]').forEach(button=>button.onclick=()=>show(button.dataset.studyDesk));
  show(active);
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

 return {page,bind};
}
