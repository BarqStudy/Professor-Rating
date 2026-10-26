import directory from '../data/saudi-universities.json';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=value=>String(value||'').normalize('NFKC').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064b-\u065fـ\s]/g,'');
const asset=value=>/^https:\/\//.test(value)?value:import.meta.env.BASE_URL+value;
export function universityDirectory(catalogue){
 const records=catalogue?.universities||[],used=new Set();
 const known=directory.map(entry=>{const match=records.find(u=>[entry.name,...entry.aliases].some(name=>key(name)===key(u.name)));if(match)used.add(match.id);return {...entry,id:match?.id||null,enabled:match?.enabled===true};});
 return [...known,...records.filter(u=>!used.has(u.id)).map(u=>({...u,key:'custom-'+u.id,region:'أخرى',logo:null,aliases:[],enabled:u.enabled===true}))].sort((a,b)=>Number(b.enabled)-Number(a.enabled)||a.name.localeCompare(b.name,'ar'));
}
export function createUniversitySelector({catalogue,currentId,select,request,modal,icon,ready}){
 let search='',region='الكل';
 function cards(){
  const rows=universityDirectory(catalogue()).filter(u=>(region==='الكل'||u.region===region)&&(!search||[u.name,u.city,...u.aliases].some(value=>key(value).includes(key(search)))));
  return {count:rows.length,html:rows.map((u,index)=>`<button type="button" class="uni-card ${u.enabled?'is-open':''} ${currentId()===u.id?'is-current':''}" data-select-university="${esc(u.key)}" aria-label="${esc(u.name)} — ${u.enabled?'الدخول إلى الجامعة':'طلب إضافة الجامعة'}" style="--uni-order:${Math.min(index,12)}"><span class="uni-card-state">${u.enabled?'<i aria-hidden="true"></i> متاحة الآن':'طلب الإضافة'}</span><span class="uni-logo">${u.logo?`<img class="${u.logoCrop==='unit-footer'?'uni-university-mark':''}" src="${esc(asset(u.logo))}" alt="شعار ${esc(u.name)}" width="160" height="96" loading="${u.enabled?'eager':'lazy'}" referrerpolicy="no-referrer">`:''}<span class="uni-logo-fallback" ${u.logo?'hidden':''} aria-hidden="true">${icon('cap')}</span></span><strong>${esc(u.name)}</strong><span class="uni-card-city">${esc(u.city||'المملكة العربية السعودية')}<span aria-hidden="true">${icon('arrow')}</span></span></button>`).join('')||'<div class="university-no-results"><h3>لم نجد جامعة بهذا الاسم</h3><p>جرّب اسم الجامعة أو مدينتها، أو أرسل طلب إضافتها.</p><button class="secondary" data-request-another-university>طلب إضافة جامعة أو كلية</button></div>'};
 }
 function content(){const results=cards();return `<section class="university-directory" id="university-directory"><div class="university-introduction"><div><span class="university-eyebrow"><i></i> لكل رحلة، نقطة بداية</span><h1>جامعتك.<br><em>بداية معيارك.</em></h1><p>اختر مكان رحلتك الجامعية؛ نجمع لك دكاترتك، تجارب زملائك، وخطتك في مساحة واحدة.</p></div><div class="university-journey" aria-label="خطوات البداية"><span class="journey-number">٠١</span><h2>اختر جامعتك</h2><p>ثم اكتشف خياراتك بثقة.</p><div class="journey-route"><span class="is-here">الجامعة</span><i></i><span>التخصص</span><i></i><span>رحلتك</span></div><small>${directory.length.toLocaleString('ar')} جامعة حكومية · مساحة تنمو بطلابها</small></div></div><div class="university-directory-tools"><label class="university-directory-search">${icon('search')}<input id="university-search" type="search" placeholder="ابحث باسم الجامعة أو المدينة…" value="${esc(search)}" aria-label="ابحث عن جامعة"><button type="button" id="university-search-clear" aria-label="مسح بحث الجامعة" ${search?'':'hidden'}>${icon('close')}</button></label><div class="university-regions" role="group" aria-label="منطقة الجامعة">${['الكل','الوسطى','الغرب','الشرق','الشمال','الجنوب'].map(r=>`<button type="button" data-university-region="${r}" aria-pressed="${r===region}">${r}</button>`).join('')}</div></div><div class="university-directory-count"><span id="university-result-count" role="status" aria-live="polite">${results.count.toLocaleString('ar')} جامعة</span><span>اختر الشعار لتبدأ ${icon('arrow')}</span></div><p id="university-choice-error" class="form-error" role="alert"></p><div class="university-card-grid" id="university-card-grid">${results.html}</div><div class="university-directory-footer"><p>جامعتك أو كليتك تنتظر مساحة لها في مِعيار؟</p><button class="text-button" type="button" data-request-another-university>اطلب إضافتها الآن ${icon('plus')}</button></div></section>`;}
 function bind(){
  const root=document.querySelector('#university-directory');if(!root)return;
  const error=root.querySelector('#university-choice-error');
  const bindCards=()=>{
   root.querySelectorAll('.uni-logo img').forEach(img=>{img.onerror=()=>{img.hidden=true;img.nextElementSibling.hidden=false;};if(img.complete&&!img.naturalWidth)img.onerror();});
   root.querySelectorAll('[data-request-another-university]').forEach(b=>b.onclick=()=>request({}));
   root.querySelectorAll('[data-select-university]').forEach(button=>button.onclick=async()=>{
    if(!ready()){error.textContent='جارٍ تحميل إعدادات الجامعات؛ أعد المحاولة بعد اكتمال الاتصال.';return;}
    const u=universityDirectory(catalogue()).find(u=>u.key===button.dataset.selectUniversity);if(!u)return;
    if(!u.enabled){modal('جامعتك القادمة في مِعيار',`<div class="university-coming-soon"><span class="eyebrow">نصنع المساحة معكم</span><h2>${esc(u.name)}</h2><p>هذه الجامعة غير مضافة إلى مِعيار بعد. اطلب إضافتها الآن عبر نموذج التسجيل، ونستخدم بريدك للتواصل معك.</p><button class="primary" id="request-this-university">طلب إضافة الجامعة ${icon('arrow')}</button></div>`);document.querySelector('#request-this-university').onclick=()=>request({kind:'university',universityId:u.id,university:u.name});return;}
    root.setAttribute('aria-busy','true');root.querySelectorAll('[data-select-university]').forEach(b=>b.disabled=true);error.textContent='';
    try{await select(u.id);}catch(e){if(root.isConnected)error.textContent=e.message;}finally{if(root.isConnected){root.removeAttribute('aria-busy');root.querySelectorAll('[data-select-university]').forEach(b=>b.disabled=false);}}
   });
  };
  const update=()=>{const result=cards();root.querySelector('#university-card-grid').innerHTML=result.html;root.querySelector('#university-result-count').textContent=result.count.toLocaleString('ar')+' جامعة';root.querySelector('#university-search-clear').hidden=!search;bindCards();};
  root.querySelector('#university-search').oninput=event=>{search=event.target.value;update();};
  root.querySelector('#university-search-clear').onclick=()=>{search='';root.querySelector('#university-search').value='';update();root.querySelector('#university-search').focus();};
  root.querySelectorAll('[data-university-region]').forEach(button=>button.onclick=()=>{region=button.dataset.universityRegion;root.querySelectorAll('[data-university-region]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));update();});
  bindCards();
 }
 return {content,bind};
}
