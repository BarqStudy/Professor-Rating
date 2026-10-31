import {courseNameKey} from './course-names.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createReviewLinker({api,modal,ownerKey,onLinked}){
 let sequence=0;
 async function open(id){
  const token=++sequence,owner=ownerKey();
  modal('ربط بمادة موجودة',`<div id="review-course-link"><p role="status">جارٍ تحميل مواد جامعة الدكتور…</p></div>`);
  const root=document.querySelector('#review-course-link'),current=()=>token===sequence&&owner===ownerKey()&&root.isConnected;
  try{
   const courses=await api('admin',{operation:'review.course.options',id});if(!current())return;
   root.innerHTML=`<p>اختر المقرر الصحيح لتوحيد اسم المادة وربط التقييم به. الربط لا ينشر التقييم المعلّق ولا يغيّر درجاته أو صاحبه.</p><form id="review-course-link-form"><label>البحث باسم المادة أو رمزها<input type="search" id="review-link-search" placeholder="ابحث عن المادة…"></label><label>المادة<select name="course" required></select></label><p class="muted" id="review-link-empty" hidden>لا توجد مواد مطابقة.</p><p class="form-error" role="alert"></p><button type="submit" class="primary">تأكيد ربط التقييم</button></form>`;
   const form=root.querySelector('form'),select=form.elements.course;
   const paint=()=>{const query=courseNameKey(root.querySelector('#review-link-search').value),selected=select.value;const rows=courses.filter(c=>courseNameKey([c.name,c.code,c.plan].join(' ')).includes(query));const groups=new Map();for(const c of rows){if(!groups.has(c.plan))groups.set(c.plan,[]);groups.get(c.plan).push(c);}select.innerHTML='<option value="">اختر المادة</option>'+[...groups].map(([plan,items])=>`<optgroup label="${esc(plan)}">${items.map(c=>`<option value="${esc(c.id)}">${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</optgroup>`).join('');if(rows.some(c=>c.id===selected))select.value=selected;root.querySelector('#review-link-empty').hidden=rows.length>0;};
   paint();root.querySelector('#review-link-search').oninput=paint;
   form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled||!select.value)return;button.disabled=true;form.querySelector('.form-error').textContent='';
    try{await api('admin',{operation:'review.course.link',id,courseId:select.value});if(!current())return;root.innerHTML='<p role="status">تم ربط التقييم بالمادة.</p>';await onLinked?.();}
    catch(error){if(current()){form.querySelector('.form-error').textContent=error.message;button.disabled=false;}}
   };
  }catch(error){if(current()){root.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary">إعادة المحاولة</button>`;root.querySelector('button').onclick=()=>open(id);}}
 }
 return {open};
}
