const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Number(value).toLocaleString('ar-SA-u-nu-arab', {maximumFractionDigits:1});
const percent = value => Math.max(0,Math.min(100,Number(value)||0));
const normalize = value => String(value).trim().replace(/\s+/g,' ').toLowerCase();
const explanation = 'درجات أبلغ عنها الطلاب باختيارهم، وليست نتائج جامعية رسمية أو ضمانًا لنتيجتك. لا تُعرض الدرجات الفردية أو هويات أصحابها.';
const unavailable = 'تظهر النتائج بعد ١٠ مشاركات اختيارية معتمدة للمادة نفسها على الأقل. لا نعرض عدد المشاركات في العينات الصغيرة.';
const subjectSelect = (subjects,subject,label='اختر المادة لعرض خريطة الدرجات') => `<label class="grade-subject-label">${label}<select class="grade-subject"><option value="">اختر المادة</option>${subjects.map(name=>`<option value="${escape(name)}" ${normalize(name)===normalize(subject)?'selected':''}>${escape(name)}</option>`).join('')}</select></label>`;
const metrics = data => `<div class="grade-metrics"><div><strong>${number(data.highPercent)}٪</strong><span>حصلوا على ٩٠ فأعلى</span></div><div><strong>${number(data.average)}<small>/١٠٠</small></strong><span>متوسط الدرجات المبلّغ عنها</span></div><div><strong>${number(data.total)}</strong><span>مشاركة اختيارية معتمدة</span></div></div>`;

export function createGradeMap({api,modal,ensureGuestSession,isMember,identityKey,configured,icon}) {
  let invalidateManagement=null;
  window.addEventListener('miyar-auth',()=>queueMicrotask(()=>invalidateManagement?.()));
  async function mount(root,doctor,initialSubject='') {
    if(!root)return;
    let revision=0;
    const load=async(subject='')=>{
      const current=++revision;
      root.setAttribute('aria-busy','true');
      root.innerHTML='<p class="muted" role="status">جارٍ تحميل خريطة الدرجات…</p>';
      try{
        const data=await api('doctor.grades',{doctor,subject});
        if(!root.isConnected||current!==revision)return;
        root.innerHTML=`<div class="grade-heading"><span class="grade-map-icon" aria-hidden="true">${icon('chart')}</span><div><h3>خريطة الدرجات</h3><p>نتائج المشاركين في المادة، بصورة مجمّعة</p></div></div>${subjectSelect(data.subjects||[],subject)}${data.available?`${metrics(data)}<h4>توزيع الدرجات</h4><ol class="grade-distribution" aria-label="توزيع الدرجات المبلّغ عنها">${data.bins.map(bin=>`<li><div><b dir="ltr">${escape(bin.band)}</b><span>${number(bin.percent)}٪ · ${number(bin.count)} مشاركة</span></div><div class="grade-track" aria-hidden="true"><span style="width:${percent(bin.percent)}%"></span></div></li>`).join('')}</ol>`:`<p class="grade-empty">${subject?unavailable:'اختر مادة للاطلاع على نتائج المشاركين فيها. '+unavailable}</p>`}<p class="grade-disclaimer">${explanation}</p><button type="button" class="text-button" data-grade-manage>${icon('shield')} إدارة مشاركة درجتي</button>`;
        root.querySelector('.grade-subject').onchange=event=>load(event.target.value);
        root.querySelector('[data-grade-manage]').onclick=manage;
      }catch(error){
        if(root.isConnected&&current===revision){
          root.innerHTML=`<h3>خريطة الدرجات</h3><p role="alert">${escape(error.message)}</p><button type="button" class="secondary">إعادة المحاولة</button>`;
          root.querySelector('button').onclick=()=>load(subject);
        }
      }finally{if(root.isConnected&&current===revision)root.removeAttribute('aria-busy');}
    };
    await load(initialSubject);
  }

  async function comparison(root,doctors) {
    if(!root)return;
    let revision=0,subjects=[];
    const load=async(subject='')=>{
      const current=++revision;
      root.setAttribute('aria-busy','true');
      root.innerHTML='<p class="muted" role="status">جارٍ تحميل مقارنة الدرجات…</p>';
      try{
        const maps=await Promise.all(doctors.map(doctor=>api('doctor.grades',{doctor:doctor.id,subject})));
        if(!root.isConnected||current!==revision)return;
        if(!subject)subjects=(maps[0]?.subjects||[]).filter(name=>maps.every(map=>(map.subjects||[]).some(other=>normalize(other)===normalize(name))));
        root.innerHTML=`<h3>قارن خريطة الدرجات للمادة نفسها</h3>${subjects.length?subjectSelect(subjects,subject,'المادة المشتركة بين الدكاترة'):'<p class="grade-empty">لا توجد مادة مشتركة منشورة بين الدكاترة المحددين حاليًا.</p>'}${subject?`<div class="comparison-table-wrap"><table class="comparison-table grade-comparison-table"><caption>${escape(subject)} · المشاركات الاختيارية المعتمدة</caption><thead><tr><th scope="col">المؤشر</th>${doctors.map(d=>`<th scope="col">${escape(d.name)}</th>`).join('')}</tr></thead><tbody>${[['نسبة ٩٠ فأعلى','highPercent','٪'],['متوسط الدرجة','average',' / ١٠٠'],['عدد المشاركات','total','']].map(([label,key,suffix])=>`<tr><th scope="row">${label}</th>${maps.map(map=>`<td>${map.available?number(map[key])+suffix:'بيانات غير كافية'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}<p class="grade-disclaimer">${explanation} تختلف أحجام العينات، ولا تظهر نتائج أي دكتور قبل اكتمال ١٠ مشاركات للمادة.</p>`;
        root.querySelector('.grade-subject')?.addEventListener('change',event=>load(event.target.value));
      }catch(error){
        if(root.isConnected&&current===revision){root.innerHTML=`<p role="alert">${escape(error.message)}</p><button class="secondary" type="button">إعادة تحميل المقارنة</button>`;root.querySelector('button').onclick=()=>load(subject);}
      }finally{if(root.isConnected&&current===revision)root.removeAttribute('aria-busy');}
    };
    await load();
  }

  async function manage() {
    if(!configured()){modal('مشاركة الدرجات','<p>إدارة مشاركة الدرجات متاحة عند الاتصال بالمنصة.</p>');return;}
    const member=isMember(),prefix=member?'':'guest.';
    modal('مشاركة الدرجات',`<div id="grade-participation"><p role="status">جارٍ تحميل مشاركاتك…</p></div>`);
    const root=document.querySelector('#grade-participation');
    let rows=[],nextBefore=null,busy=false,changing=0,owner=identityKey(),ownerReady=member;
    const currentOwner=()=>{
      if(!root.isConnected)return false;
      if(member!==isMember()||(ownerReady&&owner!==identityKey())){
        root.innerHTML='<p role="status">تغيّرت جلسة الدخول. أعد فتح مشاركة الدرجات من الإعدادات.</p>';
        return false;
      }
      return true;
    };
    invalidateManagement=()=>{if(!currentOwner())invalidateManagement=null;};
    const paint=()=>{
      root.innerHTML=`<p>المشاركة اختيارية. بموافقتك تُستخدم درجتك المحفوظة في إحصائيات مجمّعة بعد اكتمال ١٠ مشاركات معتمدة للمادة. سحب الموافقة يستبعدها من الحسابات القادمة فورًا.</p>${!member?'<p class="muted">تظهر هنا مساهمات جلسة الزائر الحالية على هذا المتصفح.</p>':''}<div class="grade-sharing-list">${rows.map(row=>`<article class="grade-sharing-item"><h3>${escape(row.doctor_name)}</h3><p>${escape(row.subject)} · ${escape(row.university)}</p><label class="grade-consent"><input type="checkbox" data-grade-consent="${row.id}" ${row.share_grade?'checked':''}><span>أوافق على استخدام درجتي في إحصائيات المادة المجمّعة<small>${row.status==='published'?'التقييم منشور':'تُحتسب الدرجة بعد اعتماد التقييم ونشره فقط.'}</small></span></label></article>`).join('')||'<p class="empty">لا توجد تقييمات مرتبطة بحسابك أو جلستك الحالية. يمكنك اختيار المشاركة بدرجتك عند إرسال تقييم.</p>'}</div><p class="grade-sharing-feedback" role="status"></p>${nextBefore?'<button type="button" class="secondary" data-grade-more>عرض المزيد</button>':''}`;
      root.querySelectorAll('[data-grade-consent]').forEach(input=>input.onchange=async()=>{
        if(!currentOwner())return;
        const row=rows.find(item=>item.id===Number(input.dataset.gradeConsent)),requested=input.checked;
        input.disabled=true;changing++;
        const more=root.querySelector('[data-grade-more]');if(more)more.disabled=true;
        const feedback=root.querySelector('.grade-sharing-feedback');feedback.textContent='جارٍ حفظ اختيارك…';
        try{
          await api(prefix+'grade.consent',{review:row.id,shareGrade:requested,subject:row.subject});row.share_grade=requested;
          if(currentOwner())feedback.textContent=requested?'حُفظت موافقتك على المشاركة الإحصائية.':'سُحبت الموافقة واستُبعدت الدرجة من الإحصائيات.';
        }catch(error){if(currentOwner()){input.checked=row.share_grade;feedback.textContent=error.message;}}
        finally{changing--;if(input.isConnected)input.disabled=false;if(more?.isConnected&&!changing)more.disabled=false;}
      });
      root.querySelector('[data-grade-more]')?.addEventListener('click',()=>load(nextBefore));
    };
    const load=async(before=null)=>{
      if(busy||changing||!currentOwner())return;busy=true;
      const more=root.querySelector('[data-grade-more]');if(more)more.disabled=true;
      root.querySelectorAll('[data-grade-consent]').forEach(input=>input.disabled=true);
      try{
        if(!member&&!ownerReady){await ensureGuestSession();owner=identityKey();ownerReady=true;}
        const data=await api(prefix+'grade.participation',{before});
        if(!currentOwner())return;
        rows.push(...data.items);nextBefore=data.nextBefore;paint();
      }catch(error){
        if(currentOwner()){
          if(!rows.length){root.innerHTML=`<p role="alert">${escape(error.message)}</p><button type="button" class="secondary" data-grade-retry>إعادة المحاولة</button>`;root.querySelector('[data-grade-retry]').onclick=()=>load(before);}
          else root.querySelector('.grade-sharing-feedback').textContent=error.message;
        }
      }finally{busy=false;if(more?.isConnected)more.disabled=false;root.querySelectorAll('[data-grade-consent]').forEach(input=>input.disabled=false);}
    };
    await load();
  }
  return {mount,comparison,manage};
}
