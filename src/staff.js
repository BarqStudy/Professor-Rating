const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const hasStaffRole=me=>Boolean(me?.ambassadorUniversities?.length||me?.assistantColleges?.length);
export function staffUniversityIds(me,catalogue){return [...new Set([...(me?.ambassadorUniversities||[]),...(catalogue?.colleges||[]).filter(c=>me?.assistantColleges?.includes(c.id)).map(c=>c.university_id)])];}
export function staffColleges(me,catalogue,university){return (catalogue?.colleges||[]).filter(c=>c.university_id===university&&(me?.ambassadorUniversities?.includes(university)||me?.assistantColleges?.includes(c.id)));}
export function roleBadge(me,catalogue){
 if(!me)return '';
 const labels=me.isAdmin?['مطور المنصة']:[...(me.ambassadorUniversities||[]).map(id=>'سفير '+(catalogue?.universities?.find(u=>u.id===id)?.name||'الجامعة')),...(me.assistantColleges||[]).map(id=>{const c=catalogue?.colleges?.find(c=>c.id===id);return 'مساعد '+(c?.name||'الكلية')+' · '+(catalogue?.universities?.find(u=>u.id===c?.university_id)?.name||'');})];
 return labels.length?`<span class="account-role-tag ${me.isAdmin?'is-developer':me.ambassadorUniversities?.length?'is-ambassador':'is-assistant'}" title="${esc(labels.join(' / '))}">${esc(labels[0])}</span>`:'';
}
export function staffAdminPanel(queue,catalogue){
 const universities=catalogue?.universities||[],colleges=catalogue?.colleges||[];
 const members=[...(queue?.ambassadors||[]).map(r=>({...r,role:'ambassador'})),...(queue?.assistants||[]).map(r=>({...r,role:'assistant'}))];
 return `<section class="panel ambassador-management"><h2>فريق مِعيار — السفراء والمساعدون</h2><p class="muted">السفير مسؤول عن جامعة كاملة، والمساعد عن كلية محددة داخلها. يدخل صاحب البريد بحسابه في Google أولًا. تظل الإضافات والتصحيحات بانتظار اعتماد الإدارة.</p><form id="assign-ambassador"><label>الدور<select name="role"><option value="ambassador">سفير جامعة</option><option value="assistant">مساعد كلية</option></select></label><label>البريد الإلكتروني<input name="email" type="email" required maxlength="254" dir="ltr" autocomplete="off" placeholder="student@example.com"></label><label>الجامعة<select name="universityId" required>${universities.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><label id="assistant-college-label" hidden>كلية المساعد<select name="collegeId"></select></label><p class="form-error" role="alert"></p><button class="primary" type="submit">تعيين سفير</button></form><div class="admin-record-list" role="region" tabindex="0" aria-label="السفراء والمساعدون المعيّنون">${!queue?'<p role="status">جارٍ التحميل…</p>':members.length?members.map(m=>`<div class="admin-row"><span><strong>${esc(m.name)}</strong><small>${m.role==='assistant'?'مساعد '+esc(colleges.find(c=>c.id===m.college_id)?.name||'الكلية'):'سفير'} · ${esc(universities.find(u=>u.id===m.university_id)?.name||'')}</small><small><bdi>${esc(m.email)}</bdi>${m.status!=='active'?' · الحساب مقيّد أو محظور':''}</small></span><button class="danger" data-revoke-staff="${esc(m.email)}" ${m.role==='ambassador'?`data-revoke-ambassador="${esc(m.email)}"`:''} data-role="${m.role}" data-university="${m.university_id}" data-college="${m.college_id||''}">سحب الصلاحية</button></div>`).join(''):'<p class="muted">لم تُعيّن أعضاء للفريق بعد.</p>'}</div></section>`;
}
export function bindStaffAdmin({me,catalogue,onAction,modal,storage}){
 const form=document.querySelector('#assign-ambassador');if(!form||!me?.isAdmin)return;
 const key='miyar-ambassador-admin-university-'+me.id,university=form.elements.universityId,role=form.elements.role,college=form.elements.collegeId;
 const previous=storage.getItem(key);if([...university.options].some(o=>o.value===previous))university.value=previous;
 const sync=()=>{
  const before=college.value;college.innerHTML=(catalogue?.colleges||[]).filter(c=>c.university_id===Number(university.value)).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if([...college.options].some(o=>o.value===before))college.value=before;
  const assistant=role.value==='assistant';form.querySelector('#assistant-college-label').hidden=!assistant;college.required=assistant;college.disabled=!assistant;
  form.querySelector('[type=submit]').textContent=assistant?'تعيين مساعد':'تعيين سفير';form.querySelector('[type=submit]').disabled=assistant&&!college.options.length;
  form.querySelector('.form-error').textContent=assistant&&!college.options.length?'أضف كلية لهذه الجامعة أولًا.':'';storage.setItem(key,university.value);
 };
 university.onchange=sync;role.onchange=sync;sync();
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{await onAction(role.value==='assistant'?'assistant.set':'ambassador.set',{email:form.elements.email.value,universityId:Number(university.value),collegeId:Number(college.value),active:true});}finally{if(form.isConnected)sync();}};
 document.querySelectorAll('[data-revoke-staff]').forEach(button=>button.onclick=()=>{
  modal('سحب صلاحية عضو الفريق','<p>تُسحب صلاحية الإرسال ضمن هذا النطاق، وتبقى الطلبات السابقة للمراجعة.</p><button class="primary" id="confirm-revoke-ambassador">تأكيد سحب الصلاحية</button>');
  document.querySelector('#confirm-revoke-ambassador').onclick=async event=>{event.currentTarget.disabled=true;await onAction(button.dataset.role==='assistant'?'assistant.set':'ambassador.set',{email:button.dataset.revokeStaff,universityId:Number(button.dataset.university),collegeId:Number(button.dataset.college),active:false});};
 });
}
