const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('en-US');
export function createDoctorScopeRemoval({api,catalogue,modal,ownerKey,onRemoved,enabled=()=>true}){
 let sequence=0;
 function panel(){return `<section class="bulk-doctors doctor-scope-removal" id="admin-doctor-scope-removal"><h3>حذف دكاترة كلية أو تخصص</h3>${enabled()?`<p class="muted">اختر النطاق ثم راجع العدد وأكّد الحذف. تُخفى بطاقات الدكاترة وتقييماتهم من الدليل، مع الاحتفاظ بسجلاتهم لإمكانية إعادة إضافتهم.</p><form id="doctor-scope-form"><div class="form-grid"><label>الجامعة<select name="university" required><option value="">اختر الجامعة</option>${(catalogue()?.universities||[]).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><label>الكلية<select name="college" required><option value="">اختر الجامعة أولًا</option></select></label><label>نطاق الحذف<select name="scope"><option value="major">تخصص / قسم كامل</option><option value="college">كلية كاملة</option></select></label><label id="doctor-scope-major-label">التخصص / القسم<select name="major" required><option value="">اختر الكلية أولًا</option></select></label></div><button type="submit" class="secondary danger">مراجعة الدكاترة قبل الحذف</button></form>`:'<p class="muted">الحذف الجماعي جاهز، ويحتاج اكتمال تفعيل تحديث المنصة قبل استخدامه.</p>'}</section>`;}
 function bind(){const form=document.querySelector('#doctor-scope-form');if(!form)return;
  const fillMajors=()=>{form.elements.major.innerHTML='<option value="">اختر التخصص</option>'+(catalogue()?.majors||[]).filter(m=>m.college_id===Number(form.elements.college.value)).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');};
  form.elements.university.onchange=()=>{form.elements.college.innerHTML='<option value="">اختر الكلية</option>'+(catalogue()?.colleges||[]).filter(c=>c.university_id===Number(form.elements.university.value)).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');fillMajors();};
  form.elements.college.onchange=fillMajors;
  form.elements.scope.onchange=()=>{const major=form.elements.scope.value==='major';form.elements.major.disabled=!major;form.elements.major.required=major;form.querySelector('#doctor-scope-major-label').hidden=!major;};
  form.onsubmit=event=>{event.preventDefault();preview({scope:form.elements.scope.value,id:Number(form.elements[form.elements.scope.value].value)});};
 }
 async function preview(scope){
  const token=++sequence,owner=ownerKey();modal('تأكيد حذف دكاترة النطاق', '<div id="doctor-scope-confirm"><p role="status">جارٍ تجهيز معاينة الحذف…</p></div>');
  const root=document.querySelector('#doctor-scope-confirm'),current=()=>token===sequence&&owner===ownerKey()&&root.isConnected;
  try{
   const snapshot=await api('admin',{operation:'doctor.scope.preview',...scope});if(!current())return;
   root.innerHTML=`<p>${esc(snapshot.university)} · ${esc(snapshot.college)}${scope.scope==='major'?' · '+esc(snapshot.name):''}</p><p><strong>${number(snapshot.count)} دكتور</strong> ${scope.scope==='college'?'في الكلية كاملة':'في التخصص كاملًا'}.</p>${snapshot.count?`<ul>${snapshot.sample.map(d=>`<li>${esc(d.name)}</li>`).join('')}</ul>${snapshot.count>snapshot.sample.length?`<p class="muted">و${number(snapshot.count-snapshot.sample.length)} دكتورًا آخر ضمن النطاق.</p>`:''}<p>ستختفي بطاقاتهم وتقييماتهم من المنصة. تبقى السجلات محفوظة، وتعود عند إعادة إضافة الدكتور.</p><form id="confirm-doctor-scope-form"><label class="doctor-scope-consent"><input type="checkbox" name="confirm" required><span>راجعت النطاق والعدد وأؤكد حذف جميع دكاترته.</span></label><p class="form-error" role="alert"></p><button type="submit" class="primary doctor-scope-submit" disabled>تأكيد حذف ${number(snapshot.count)} دكتور</button></form>`:'<p class="muted">لا يوجد دكاترة ظاهرون لحذفهم في هذا النطاق.</p>'}`;
   const form=root.querySelector('form');if(!form)return;const button=form.querySelector('[type=submit]');let busy=false;
   form.elements.confirm.onchange=()=>button.disabled=busy||!form.elements.confirm.checked;
   form.onsubmit=async event=>{event.preventDefault();if(busy||!form.elements.confirm.checked)return;busy=true;button.disabled=true;
    try{const result=await api('admin',{operation:'doctor.scope.remove',...scope,confirm:true,fingerprint:snapshot.fingerprint});if(!current())return;root.innerHTML=`<p role="status">حُذف ${number(result.updated)} دكتور من الدليل.</p>`;await onRemoved?.(result.updated);}
    catch(error){if(current()){form.querySelector('.form-error').textContent=error.message;const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary';refresh.textContent='تحديث المعاينة';refresh.onclick=()=>preview(scope);form.replaceChildren(form.querySelector('.form-error'),refresh);}}
   };
  }catch(error){if(current()){root.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary">إعادة المحاولة</button>`;root.querySelector('button').onclick=()=>preview(scope);}}
 }
 return {panel,bind};
}
