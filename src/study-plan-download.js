import {canvasPdf,downloadFile} from './timetable-export.js';
import {drawStudyPlanPage,studyPlanPages} from './study-plan-pdf.js';
import {loadPlanLogo} from './study-plan-logo.js';
import './study-plan-download.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fontsReady=()=>Promise.all([
 document.fonts.load('400 24px Thmanyah','الخطة الدراسية'),
 document.fonts.load('700 43px Thmanyah','الخطة الدراسية'),
]);

export function createStudyPlanDownload({timetable,currentPlan,loadPlans,needsMajor,chooseMajor,icon}){
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
  if(needsMajor()){
   content.innerHTML='<p>اختر تخصصك لعرض خطتك الدراسية.</p><button type="button" class="primary">اختيار التخصص</button>';
   content.querySelector('button').onclick=chooseMajor;
   return;
  }
  content.innerHTML='<p role="status">جارٍ تحميل الخطة الدراسية…</p>';
  try{await loadPlans();}
  catch{
   if(!content.isConnected)return;
   content.innerHTML='<p role="alert">تعذّر تحميل الخطة الدراسية.</p><button type="button" class="secondary">إعادة المحاولة</button>';
   content.querySelector('button').onclick=()=>prepare(content);
   return;
  }
  if(!content.isConnected)return;
  const plan=currentPlan();
  if(!plan){
   content.innerHTML='<p role="status">لا توجد خطة معتمدة لتخصصك حاليًا.</p>';
   return;
  }
  const badge=(name,tone)=>`<span class="study-control-icon study-control-icon-${tone}" aria-hidden="true">${icon(name)}</span>`;
  content.innerHTML=`<div class="study-download-layout">
    <form id="study-pdf-customize" class="study-download-controls">
     <div class="study-control-heading">
      ${badge('book','green')}
      <div><h2>${esc(plan.title||plan.major)}</h2>${plan.university?`<small>${esc(plan.university)}</small>`:''}</div>
     </div>
     <label class="study-control-row study-download-color">
      ${badge('sun','rose')}<span>لون القالب</span>
      <input name="color" type="color" value="#df302f">
     </label>
     <label class="study-control-row">
      ${badge('cap','blue')}<span>شعار الجامعة<small>اختياري عند عدم توفره تلقائيًا</small></span>
      <input name="logo" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg">
     </label>
     <label class="study-control-row">
      ${badge('profile','violet')}<span>اسم أو نص على الخطة<small>اختياري</small></span>
      <input name="note" maxlength="80" placeholder="مثال: خطة سارة الدراسية" dir="auto">
     </label>
     <button type="submit" class="primary study-download-submit"><span aria-hidden="true">${icon('arrow')}</span> تحميل الخطة PDF</button>
     <p class="form-error" role="alert"></p>
    </form>
   <figure class="study-download-preview" hidden>
    <figcaption><span class="study-preview-title">${badge('book','blue')} معاينة الخطة</span><span data-study-page-count dir="ltr"></span></figcaption>
    <canvas role="img" aria-label="معاينة صفحة من الخطة الدراسية"></canvas>
    <div class="study-preview-navigation">
     <button type="button" class="secondary" data-plan-preview="-1">الصفحة السابقة</button>
     <button type="button" class="secondary" data-plan-preview="1">الصفحة التالية</button>
    </div>
   </figure>
  </div>`;
  const form=content.querySelector('#study-pdf-customize'),preview=content.querySelector('canvas');
  const fields=form.elements,button=form.querySelector('button'),message=form.querySelector('[role=alert]');
  let previewIndex=0,logo=null,logoRevision=0,exporting=false;
  const options=()=>({color:fields.color.value,note:fields.note.value.trim(),logo});
  function update(){
   button.disabled=exporting;
   preview.closest('figure').hidden=false;
   const pages=studyPlanPages(plan);
   previewIndex=Math.min(previewIndex,pages.length-1);
   drawStudyPlanPage(preview,plan,pages,previewIndex,options());
   content.querySelector('[data-study-page-count]').textContent=`${previewIndex+1} / ${pages.length}`;
   content.querySelector('[data-plan-preview="-1"]').disabled=previewIndex===0;
   content.querySelector('[data-plan-preview="1"]').disabled=previewIndex===pages.length-1;
  }
  async function refreshLogo(){
   const revision=++logoRevision;
   const file=fields.logo.files[0];
   let url;
   logo=null;update();
   try{
    if(file&&(!['image/png','image/jpeg'].includes(file.type)||file.size>2*1024*1024)){
     fields.logo.value='';
     message.textContent='اختر شعار PNG أو JPG بحجم لا يتجاوز ٢ ميجابايت.';
    }else if(file)url=URL.createObjectURL(file);
    const result=await loadPlanLogo(plan.university,url);
    if(revision===logoRevision&&content.isConnected){
     if(url&&!result)message.textContent='تعذّرت قراءة صورة الشعار.';
     logo=result;update();
    }
   }finally{if(url)URL.revokeObjectURL(url);}
  }
  let logoPending;
  const setLogo=()=>{logoPending=refreshLogo().catch(()=>{message.textContent='تعذّرت قراءة صورة الشعار.';});};
  fields.logo.onchange=()=>{message.textContent='';setLogo();};
  fields.color.oninput=update;
  fields.note.oninput=update;
  content.querySelectorAll('[data-plan-preview]').forEach(control=>control.onclick=()=>{
   previewIndex+=Number(control.dataset.planPreview);update();
  });
  form.onsubmit=async event=>{
   event.preventDefault();
   if(exporting)return;
   exporting=true;button.disabled=true;message.textContent='';
   try{
    await Promise.all([fontsReady(),logoPending]);
    if(!content.isConnected)return;
    const pages=studyPlanPages(plan),settings=options();
    const canvases=pages.map((_,index)=>{
     const canvas=document.createElement('canvas');
     drawStudyPlanPage(canvas,plan,pages,index,settings);
     return canvas;
    });
    downloadFile(canvasPdf(canvases,{width:842,height:595}),'miyar-study-plan.pdf');
   }catch{message.textContent='تعذّر إنشاء ملف PDF. أعد المحاولة.';}
   finally{exporting=false;update();}
  };
  setLogo();
  void fontsReady().then(()=>{if(content.isConnected)update();}).catch(()=>{});
 }

 return {page,bind,back};
}
