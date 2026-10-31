import {courseNameKey} from './course-names.js';
import {readJSON,storage} from './storage.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('en-US');
export const ADMIN_SECTIONS=[
 {id:'overview',title:'نظرة عامة',icon:'chart',panels:[]},
 {id:'inbox',title:'الطلبات والمراجعة',icon:'bell',description:'اختر نوع الطلب لمراجعته واتخاذ القرار.',panels:[['admin-pending-reviews','تقييمات جديدة','reviews'],['admin-pending-doctors','إضافة دكتور','doctors'],['admin-institutions','جامعات وكليات','institutionRequests'],['admin-review-edits','تعديل تقييم','edits'],['admin-review-reports','البلاغات','reports'],['admin-proposals','تصحيح البيانات','catalogueRequests']]},
 {id:'academics',title:'الجامعات والكليات',icon:'cap',description:'إدارة الجامعات وتفعيلها، وإضافة الكليات والتخصصات.',panels:[['admin-universities','الجامعات'],['admin-colleges','الكليات'],['admin-majors','التخصصات']]},
 {id:'doctors',title:'الدكاترة',icon:'profile',description:'إضافة الدكاترة والبحث عنهم وتحديث بياناتهم.',panels:[['admin-doctors','إدارة الدكاترة']]},
 {id:'plans',title:'الخطط والمقررات',icon:'book',description:'تعديل الخطط الحالية أو قراءة خطة جديدة وحفظها.',panels:[['study-editor','تعديل الخطط والمقررات'],['admin-study-import','استيراد خطة جديدة']]},
 {id:'published',title:'التقييمات المنشورة',icon:'star',description:'البحث في التقييمات المنشورة ومراجعتها وإزالتها.',panels:[['published-review-management','التقييمات المنشورة']]},
 {id:'people',title:'الفريق والمستخدمون',icon:'users',description:'تعيين السفراء والمساعدين وإدارة حالة المستخدم.',panels:[['admin-team','السفراء والمساعدون'],['admin-users','إدارة المستخدمين']]},
 {id:'files',title:'ملفات المنصة',icon:'bookmark',description:'رفع الملفات وإدارتها وفحص اتصال التخزين.',panels:[['file-management','ملفات المنصة']]},
 {id:'settings',title:'الربط والإعدادات',icon:'settings',description:'إعدادات البريد وفحص المساعد.',panels:[['admin-mail','البريد والإشعارات'],['admin-ai','المساعد والذكاء الاصطناعي']]},
];
export const ADMIN_TOOLS=[
 ['review','inbox','admin-pending-reviews','مراجعة التقييمات','نشر التقييمات الجديدة أو رفضها','قبول اعتماد تقييم مراجعة تعليق'],
 ['doctor-requests','inbox','admin-pending-doctors','طلبات إضافة الدكاترة','مراجعة الدكاترة الذين اقترحهم الطلاب','قبول رفض دكتور طلبات'],
 ['institution-requests','inbox','admin-institutions','طلبات الجامعات والكليات','مراجعة طلبات إضافة الجهات الجديدة','نموذج تسجيل طلب جامعة كلية ايميل'],
 ['review-edits','inbox','admin-review-edits','طلبات تعديل التقييمات','مراجعة التعديلات المقترحة قبل نشرها','طلب تعديل تقييم'],
 ['reports','inbox','admin-review-reports','بلاغات التقييمات','مراجعة البلاغات وإخفاء المحتوى المخالف','ابلاغ بلاغ اساءة حذف'],
 ['proposals','inbox','admin-proposals','تصحيح بيانات الدليل','مقترحات الطلاب وفريق مِعيار','تصحيح بيانات سفير اسم كلية تخصص'],
 ['universities','academics','admin-universities','إدارة الجامعات','إضافة جامعة وتفعيلها أو إيقافها','تفعيل تعطيل حذف اضافة جامعة', '#cloud-add-university'],
 ['colleges','academics','admin-colleges','إدارة الكليات','إضافة كلية أو حذفها','اضافة حذف كلية','#cloud-add-college'],
 ['majors','academics','admin-majors','إدارة التخصصات','إضافة تخصص أو حذفه','اضافة حذف تخصص','#cloud-add-major'],
 ['add-doctor','doctors','admin-doctors','إضافة دكتور','إضافة دكتور إلى الدليل مباشرة','دكتور جديد اضافة','#cloud-add-doctor'],
 ['bulk-doctors','doctors','admin-doctors','إضافة دكاترة دفعة واحدة','إضافة مجموعة أسماء إلى تخصص واحد','جماعي مجموعة دفعة استيراد دكاترة','#bulk-doctors'],
 ['doctor-directory','doctors','admin-doctors','بحث وإدارة الدكاترة','الاسم والتخصص والتوثيق والمناصب','بحث تعديل توثيق حذف دكتور عميد رئيس قسم','#admin-doctor-search'],
 ['edit-plan','plans','study-editor','تعديل خطة ومقرراتها','الرموز والساعات والمستويات واسم الخطة وحذفها','تغيير اسم حذف خطة مقرر مادة مستوى ساعات رمز','#study-editor-plan'],
 ['import-plan','plans','admin-study-import','استيراد خطة جديدة','قراءة ملف الخطة بالذكاء الاصطناعي وحفظه','اضافة خطة تخصص رفع pdf قراءة ai','#study-import-form'],
 ['published','published','published-review-management','التقييمات المنشورة','البحث عن تقييم منشور وحذفه','حذف تقييم ازالة تقييمات منشورة','#published-review-search'],
 ['team','people','admin-team','تعيين سفير أو مساعد','توزيع صلاحيات الجامعة والكلية','سفراء مساعد صلاحية فريق تعيين','#assign-ambassador'],
 ['users','people','admin-users','إدارة المستخدمين','الحظر والتقييد وفك الحظر','حظر طالب مستخدم تقييد حساب زائر','#cloud-user-status'],
 ['files','files','file-management','ملفات المنصة','رفع الملفات وتنزيلها وفحص R2','ملف ملفات تخزين r2 كلاود رفع تنزيل'],
 ['mail','settings','admin-mail','البريد والإشعارات','إعداد بريد الطلبات وفحص الاتصال','ايميل بريد resend smtp اشعار ربط سر سكرت'],
 ['ai','settings','admin-ai','فحص المساعد','فحص ربط خدمة الذكاء الاصطناعي','ذكاء اصطناعي مساعد gemini openai api مفتاح'],
].map(([id,section,panel,title,description,keywords,target])=>({id,section,panel,title,description,keywords,target}));
export function findAdminTools(query){
 const words=String(query||'').trim().split(/\s+/).map(courseNameKey).filter(Boolean);
 return words.length?ADMIN_TOOLS.filter(tool=>{const text=courseNameKey(tool.title+' '+tool.description+' '+tool.keywords);return words.every(word=>text.includes(word));}):[];
}
export function createAdminWorkspace({ownerKey,icon}){
 let stopLayout=()=>{};
 function dispose(){stopLayout();stopLayout=()=>{};}
 function mount(root,{queue,catalogue,onPanelShown}={}){
  if(!root||root.dataset.adminWorkspace)return;
  dispose();
  const owner=ownerKey(),key='miyar-admin-workspace:'+owner,stored=readJSON(key,{}),state=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
  const panels=[...root.children].filter(node=>node.matches('.panel'));
  // Keep request decisions next to the requests; move the long setup guide to
  // settings. The original nodes and their handlers remain intact.
  const mail=root.querySelector('.institution-mail-settings');
  if(mail){const panel=document.createElement('section');panel.className='panel';panel.id='admin-mail';panel.innerHTML='<h2>البريد والإشعارات</h2>';panel.append(mail);panels.push(panel);}
  const count=kind=>queue&&!queue.error&&!(kind==='institutionRequests'&&queue.institutionRequestsError)&&Array.isArray(queue[kind])?queue[kind].length:null;
  const pending=ADMIN_SECTIONS.find(s=>s.id==='inbox').panels.map(p=>count(p[2])),total=pending.every(value=>value!==null)?pending.reduce((sum,value)=>sum+value,0):null;
  const badge=value=>value===null?'':`<span class="admin-count">${number(value)}</span>`;
  const toolButton=tool=>`<button type="button" class="admin-tool-card" data-admin-tool="${tool.id}"><span class="admin-tool-icon">${icon(ADMIN_SECTIONS.find(s=>s.id===tool.section).icon)}</span><span><strong>${esc(tool.title)}</strong><small>${esc(tool.description)}</small></span>${icon('arrow')}</button>`;
  const metrics=[['reviews','review','تقييمات للمراجعة'],['doctors','doctor-requests','طلبات دكاترة'],['institutionRequests','institution-requests','جامعات وكليات'],['reports','reports','بلاغات للمراجعة']];
  root.className='admin-workspace';root.dataset.adminWorkspace='true';
  root.innerHTML=`<div class="admin-workspace-search"><label>${icon('search')}<span class="sr-only">ابحث عن أداة في لوحة التحكم</span><input type="search" id="admin-tool-search" placeholder="ابحث عن أداة… مثل تعديل خطة أو حذف تقييم" autocomplete="off" aria-controls="admin-search-results"><button type="button" class="icon-btn" id="admin-tool-clear" aria-label="مسح بحث الأدوات" hidden>${icon('close')}</button></label><span>وصول سريع لكل أدواتك</span><div id="admin-search-results" hidden></div></div><div class="admin-workspace-nav" role="navigation" aria-label="أقسام لوحة التحكم">${ADMIN_SECTIONS.map(s=>`<button type="button" data-admin-section="${s.id}" aria-controls="admin-view-${s.id}">${icon(s.icon)}<span>${s.title}</span>${s.id==='inbox'?badge(total):''}</button>`).join('')}</div><div class="admin-workspace-body">${queue?.error?`<div class="admin-workspace-error" role="alert">${esc(queue.error)}<button type="button" class="secondary" data-admin-refresh>إعادة تحميل الطلبات</button></div>`:''}<section id="admin-view-overview" class="admin-workspace-view" data-admin-view="overview" aria-label="نظرة عامة"><div class="admin-section-heading"><span class="eyebrow">مساحة الإدارة</span><h2>ماذا تريد إنجازه؟</h2><p>ابدأ بالطلبات التي تحتاج مراجعتك، أو انتقل مباشرة إلى الأداة المطلوبة.</p></div><div class="admin-overview-counts">${metrics.map(([kind,tool,title])=>`<button type="button" data-admin-tool="${tool}"><span>${title}</span><strong>${count(kind)===null?'—':number(count(kind))}</strong>${icon('arrow')}</button>`).join('')}</div><div class="admin-overview-label"><h3>اختصارات سريعة</h3><span>حسب قائمة الطلبات الحالية</span></div><div class="admin-quick-tools">${['review','add-doctor','edit-plan','published','universities','import-plan','team','mail'].map(id=>toolButton(ADMIN_TOOLS.find(t=>t.id===id))).join('')}</div><div class="admin-overview-summary"><span>${number(catalogue?.universities?.filter(u=>u.enabled).length||0)} جامعة مفعّلة</span><span>${number(catalogue?.colleges?.length||0)} كلية</span><span>${number(catalogue?.doctors?.length||0)} دكتور في الدليل</span></div></section>${ADMIN_SECTIONS.filter(s=>s.id!=='overview').map(s=>`<section id="admin-view-${s.id}" class="admin-workspace-view" data-admin-view="${s.id}" aria-label="${s.title}" hidden><div class="admin-section-heading"><h2>${s.title}</h2><p>${s.description}</p></div>${s.panels.length>1?`<div class="admin-subnav" role="group" aria-label="أدوات ${s.title}">${s.panels.map(([id,label,kind])=>`<button type="button" data-admin-panel="${id}" aria-pressed="false">${label}${kind?badge(count(kind)):''}</button>`).join('')}</div>`:''}<div class="admin-grid"></div></section>`).join('')}</div>`;
  const panelMap=new Map(panels.map((panel,index)=>[panel.id||'unlisted-'+index,panel])),views=new Map();
  for(const section of ADMIN_SECTIONS.filter(s=>s.id!=='overview')){
   const view=root.querySelector(`[data-admin-view="${section.id}"]`);views.set(section.id,view);
   for(const [id] of section.panels){const panel=panelMap.get(id);if(panel){panel.hidden=true;view.querySelector('.admin-grid').append(panel);panelMap.delete(id);}}
  }
  // Preserve any future administrative panel even before navigation is extended.
  for(const panel of panelMap.values())views.get('settings').querySelector('.admin-grid').append(panel);
  const savedPanels=state.panels&&typeof state.panels==='object'&&!Array.isArray(state.panels)?state.panels:{};
  const selections={};for(const s of ADMIN_SECTIONS)if(s.panels.length)selections[s.id]=s.panels.some(p=>p[0]===savedPanels[s.id])?savedPanels[s.id]:s.panels[0][0];
  let active=ADMIN_SECTIONS.some(s=>s.id===state.section)?state.section:'overview';
  const live=()=>root.isConnected&&owner===ownerKey();
  function open(sectionId,panelId,{focus=false,target}={}){
   if(!live())return;
   const section=ADMIN_SECTIONS.find(s=>s.id===sectionId);if(!section)return;
   active=sectionId;if(section.panels.some(p=>p[0]===panelId))selections[active]=panelId;
   root.querySelectorAll('[data-admin-view]').forEach(node=>node.hidden=node.dataset.adminView!==active);
   root.querySelectorAll('[data-admin-section]').forEach(button=>{if(button.dataset.adminSection===active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
   const view=root.querySelector(`[data-admin-view="${active}"]`);
   if(section.panels.length){
    const id=selections[active];view.querySelectorAll('.admin-grid > .panel').forEach(panel=>panel.hidden=section.panels.some(p=>p[0]===panel.id)&&panel.id!==id);
    view.querySelectorAll('[data-admin-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.adminPanel===id)));
    onPanelShown?.(id);
   }
   storage.setItem(key,JSON.stringify({section:active,panels:selections}));
   if(focus){
    const panel=section.panels.length?view.querySelector('#'+selections[active]):view;
    const destination=target?panel?.querySelector(target):null;
    const node=destination?.matches('input,select,textarea,button')?destination:destination?.querySelector('input,select,textarea')||panel?.querySelector('h2');
    if(node){if(!node.matches('input,select,textarea,button'))node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({block:'start',behavior:'instant'});}
   }
  }
  const input=root.querySelector('#admin-tool-search'),results=root.querySelector('#admin-search-results'),clear=root.querySelector('#admin-tool-clear');
  function search(){const query=input.value.trim();clear.hidden=!query;results.hidden=!query;if(!query){results.replaceChildren();return;}const matches=findAdminTools(query);results.innerHTML=`<p role="status">${matches.length?number(matches.length)+' أداة تطابق بحثك':'لم نجد أداة بهذا الاسم. جرّب «خطة» أو «دكتور» أو «بريد».'}</p><div class="admin-search-tools">${matches.map(toolButton).join('')}</div>`;}
  input.oninput=search;clear.onclick=()=>{input.value='';search();input.focus();};
  input.onkeydown=event=>{if(event.key==='Escape'){input.value='';search();event.stopPropagation();}};
  root.addEventListener('click',event=>{
   if(!live())return;
   const toolButton=event.target.closest('[data-admin-tool]'),sectionButton=event.target.closest('[data-admin-section]'),panelButton=event.target.closest('[data-admin-panel]');
   if(toolButton){const tool=ADMIN_TOOLS.find(t=>t.id===toolButton.dataset.adminTool);if(!tool)return;input.value='';search();open(tool.section,tool.panel,{focus:true,target:tool.target});}
   else if(sectionButton)open(sectionButton.dataset.adminSection,undefined,{focus:true});
   else if(panelButton)open(active,panelButton.dataset.adminPanel,{focus:true});
   else if(event.target.closest('[data-admin-refresh]'))document.querySelector('#refresh-cloud-admin')?.click();
  });
  const layout=()=>{if(!live())return;const header=document.querySelector('.main-wrap>header');root.style.setProperty('--admin-nav-top',Math.ceil((header?.offsetHeight||85)+28)+'px');};
  layout();window.addEventListener('resize',layout,{passive:true});stopLayout=()=>window.removeEventListener('resize',layout);
  open(active);
 }
 return {mount,dispose};
}
