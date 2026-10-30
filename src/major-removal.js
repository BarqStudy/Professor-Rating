const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('en-US');
export async function openMajorRemoval({id,api,modal,remove,ownerKey}){
 const owner=ownerKey();
 modal('حذف التخصص','<div id="major-removal-content"><p role="status">جارٍ قراءة السجلات المرتبطة بالتخصص…</p></div>');
 const root=document.querySelector('#major-removal-content');
 const current=()=>root.isConnected&&ownerKey()===owner;
 async function load(){
  if(!current())return;
  root.innerHTML='<p role="status">جارٍ قراءة السجلات المرتبطة بالتخصص…</p>';
  try{
   const details=await api('admin',{operation:'major.preview-delete',id});if(!current())return;
   root.innerHTML=`<h3>${esc(details.name)}</h3><p class="muted">${esc(details.university)} · ${esc(details.college)}</p><p>سيُزال التخصص من الاختيارات، وتُخفى الدكاترة والخطط المرتبطة به من القوائم.</p><ul class="major-removal-counts"><li>${number(details.doctors)} دكتورًا مرتبطًا سيُخفى</li><li>${number(details.plans)} خطة نشطة ستُزال من القوائم</li><li>${number(details.reviews)} تقييمًا سابقًا سيبقى محفوظًا</li></ul><p class="muted">تبقى حسابات الطلاب والتقييمات والسجلات السابقة محفوظة. تقييمات الدكاترة المخفيين لا تظهر للطلاب.</p><p id="delete-operation-error" class="form-error" role="alert"></p><div class="major-removal-actions"><button type="button" class="primary" id="confirm-delete-operation">تأكيد حذف التخصص</button><button type="button" class="secondary" id="refresh-major-removal">تحديث تفاصيل الحذف</button></div>`;
   root.querySelector('#refresh-major-removal').onclick=load;
   root.querySelector('#confirm-delete-operation').onclick=async()=>{
    const buttons=[...root.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
    const saved=await remove({id,confirmed:true,snapshot:details.snapshot});
    if(!saved&&current())buttons.forEach(button=>button.disabled=false);
   };
  }catch(error){if(current()){root.innerHTML=`<p id="delete-operation-error" class="form-error" role="alert">${esc(error.message)}</p><button class="secondary" type="button" id="retry-major-removal">إعادة المحاولة</button>`;root.querySelector('#retry-major-removal').onclick=load;}}
 }
 await load();
}
