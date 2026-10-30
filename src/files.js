const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=bytes=>(bytes>=1048576?Number(bytes/1048576).toLocaleString('ar',{maximumFractionDigits:1})+' ميجابايت':Math.ceil(bytes/1024).toLocaleString('en-US')+' كيلوبايت');
export function createFileManager({api,upload,ownerKey}){
 let owner='',busy=false,status=null,files=[],error='',progressMessage='',uploadId=null,revision=0;
 function ensureOwner(){if(owner!==ownerKey()){owner=ownerKey();busy=false;status=null;files=[];error='';progressMessage='';uploadId=null;revision++;}}
 function panel(){ensureOwner();return `<section class="panel file-management" id="file-management"><h2>ملفات المنصة — Cloudflare R2</h2><p class="muted">تُحفظ الملفات في حاوية خاصة بـR2، وبيانات الفهرسة فقط في Supabase. هذا القسم متاح للإدارة.</p><p id="file-storage-status" role="status" aria-live="polite">${esc(status?.message||'جارٍ قراءة إعدادات التخزين…')}</p><button type="button" class="secondary" id="check-file-storage" ${busy?'disabled':''}>فحص اتصال R2</button><details class="file-storage-setup"><summary>إعداد التخزين لأول مرة</summary><p>أنشئ حساب Cloudflare وحاوية R2 خاصة، ثم مفتاح S3 بصلاحية Object Read &amp; Write لهذه الحاوية فقط. أضف القيم في Supabase → Edge Functions → Secrets:</p><ul>${['R2_ACCOUNT_ID','R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'].map(name=>`<li><bdi>${name}</bdi></li>`).join('')}</ul><p>احفظ المفاتيح في أسرار الخادم. بعد إضافتها، اضغط فحص الاتصال هنا.</p></details><form id="platform-file-form"><fieldset ${busy||(!status?.configured||status.ready===false)?'disabled':''}><label>رفع ملف<input name="file" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" required><small>PDF أو صورة PNG أو JPG، حتى ٢٠ ميجابايت. الملفات المرفوعة لا تُنشر للطلاب تلقائيًا.</small></label><button type="submit" class="primary">رفع وحفظ في R2</button></fieldset></form><p id="platform-file-progress" role="status" aria-live="polite">${esc(progressMessage)}</p><p id="platform-file-error" class="form-error" role="alert">${esc(error)}</p><div id="platform-files-list" class="admin-record-list" role="region" tabindex="0" aria-label="ملفات المنصة">${rows()}</div><button type="button" class="text-button" id="refresh-platform-files">تحديث قائمة الملفات</button></section>`;}
 function rows(){return files.length?files.map(file=>`<article class="admin-row platform-file-row"><span><strong>${esc(file.name)}</strong><small>${size(file.byte_size)} · ${file.purpose==='study'?'أصل خطة دراسية':'ملف منصة'} · ${file.status==='ready'?'محفوظ في R2':file.status==='failed'?'لم يكتمل الرفع؛ أعد المحاولة بنفس الملف':'رفع لم يكتمل بعد'}</small></span>${file.status==='ready'?`<div><button type="button" class="secondary" data-download-platform-file="${esc(file.id)}">تجهيز التنزيل</button></div>`:''}</article>`).join(''):'<p class="muted">لا توجد ملفات محفوظة في الفهرس بعد. تظهر هنا الملفات الجديدة وأصول الخطط المؤرشفة بعد تفعيل R2. تُعرض أحدث 100 نتيجة.</p>';}
 function bind(){ensureOwner();const root=document.querySelector('#file-management');if(!root)return;
  const currentOwner=owner;
  const owned=()=>ownerKey()===currentOwner;
  const activeRoot=()=>owned()?document.querySelector('#file-management'):null;
  const showError=message=>{if(!owned())return;error=message;const node=activeRoot()?.querySelector('#platform-file-error');if(node)node.textContent=message;};
  const progress=message=>{if(!owned())return;progressMessage=message;const node=activeRoot()?.querySelector('#platform-file-progress');if(node)node.textContent=message;};
  function controls(){const node=activeRoot();if(!node)return;node.querySelector('#platform-file-form fieldset').disabled=busy||(!status?.configured||status.ready===false);node.querySelector('#check-file-storage').disabled=busy;node.querySelector('#refresh-platform-files').disabled=busy;}
  function paint(){const node=activeRoot();if(!node)return;node.querySelector('#file-storage-status').textContent=status?.message||'إعدادات التخزين غير متاحة الآن.';node.querySelector('#platform-files-list').innerHTML=rows();controls();bindDownloads();}
  async function load(check=false){const token=++revision,node=activeRoot();if(node)node.querySelector('#check-file-storage').disabled=true;
   try{const [state,list]=await Promise.all([api('admin',{operation:check?'storage.check':'storage.status'}),api('admin',{operation:'files.list'})]);if(!owned()||token!==revision)return;status=state;files=Array.isArray(list)?list:[];showError('');paint();}
   catch(e){if(owned()&&token===revision)showError(e.message);}finally{if(owned()&&token===revision)controls();}
  }
  function bindDownloads(){activeRoot()?.querySelectorAll('[data-download-platform-file]').forEach(button=>button.onclick=async()=>{
   button.disabled=true;try{const result=await api('admin',{operation:'files.download',id:button.dataset.downloadPlatformFile});if(!owned())return;
    if(!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\//i.test(result.url||''))throw new Error('تعذّر تجهيز رابط التنزيل.');
    const current=activeRoot()?.querySelector(`[data-download-platform-file="${button.dataset.downloadPlatformFile}"]`);if(!current)return;
    const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';link.className='secondary';link.textContent='تنزيل الملف — الرابط صالح ٥ دقائق';current.replaceWith(link);
   }catch(e){if(owned()){showError(e.message);button.disabled=false;}}
  });}
  root.querySelector('#check-file-storage').onclick=()=>load(true);root.querySelector('#refresh-platform-files').onclick=()=>load();
  const form=root.querySelector('#platform-file-form');form.elements.file.onchange=()=>uploadId=crypto.randomUUID();
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;const file=form.elements.file.files[0];if(!file||file.size>20*1024*1024){showError('ارفع ملفًا حتى ٢٠ ميجابايت.');return;}const id=uploadId||=crypto.randomUUID();busy=true;showError('');controls();progress('جارٍ رفع الملف إلى R2…');
   try{await upload(file,id);if(!owned())return;uploadId=null;activeRoot()?.querySelector('#platform-file-form').reset();progress('حُفظ الملف في R2. يمكنك تجهيز رابط تنزيل مؤقت من القائمة.');await load();}
   catch(e){if(owned()){showError(e.message);progress('لم يكتمل حفظ الملف؛ يمكنك إعادة الرفع بنفس الاختيار.');}}
   finally{if(owned()){busy=false;controls();}}
  };
  bindDownloads();void load();
 }
 return {panel,bind};
}
