let installEvent=null;
window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();installEvent=event;});
export function setupPwa(){
 if(import.meta.env.DEV||!('serviceWorker' in navigator))return;
 const register=()=>navigator.serviceWorker.register(new URL('sw.js',new URL(import.meta.env.BASE_URL,location.href)),{scope:new URL(import.meta.env.BASE_URL,location.href).pathname}).catch(()=>{});
 if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
}
export async function installPlatform(modal,toast){
 if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone){toast('مِعيار مثبتة بالفعل على جهازك.');return;}
 if(installEvent){const event=installEvent;installEvent=null;await event.prompt();const choice=await event.userChoice;if(choice.outcome==='accepted')toast('تم طلب تثبيت مِعيار.');return;}
 modal('تثبيت مِعيار على جهازك','<div class="install-guide"><p>افتح قائمة المتصفح أو زر المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».</p><p>على iPhone وiPad: اضغط المشاركة ثم «إضافة إلى الشاشة الرئيسية». إذا لم يظهر الخيار، افتح الموقع في Safari.</p><p class="muted">تحتاج اتصالًا بالإنترنت لتحميل التقييمات وإرسال الطلبات.</p></div>');
}
