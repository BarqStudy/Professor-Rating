import {Capacitor} from '@capacitor/core';
export const APP_CALLBACK='website.miyar.app://auth/callback';
export const nativePlatform=()=>Capacitor.isNativePlatform()?Capacitor.getPlatform():'web';
export const isNative=()=>nativePlatform()!=='web';
export function appLink(value){
 try{
  const url=new URL(value);
  if(url.protocol==='website.miyar.app:'&&url.hostname==='auth'&&url.pathname==='/callback'&&!url.hash){
   const code=url.searchParams.get('code');
   if(url.searchParams.has('error'))return {type:'auth-error'};
   return code&&code.length<=4096?{type:'auth',code}:null;
  }
  if(url.protocol==='https:'&&['miyar.website','www.miyar.website'].includes(url.hostname)&&url.pathname==='/'){
   const doctor=Number(url.searchParams.get('doctor'));if(Number.isSafeInteger(doctor)&&doctor>0)return {type:'doctor',doctor};
  }
 }catch{}
 return null;
}
export const publicDoctorUrl=id=>`https://miyar.website/${id?`?doctor=${encodeURIComponent(id)}`:''}`;
export async function openSystemUrl(value){
 const url=new URL(value,location.href);
 if(!['https:','mailto:','tel:'].includes(url.protocol))throw new Error('رابط غير مدعوم.');
 if(!isNative()){window.open(url.href,'_blank','noopener,noreferrer');return;}
 if(url.protocol==='https:'){const {Browser}=await import('@capacitor/browser');await Browser.open({url:url.href});}
 else{const {AppLauncher}=await import('@capacitor/app-launcher');await AppLauncher.openUrl({url:url.href});}
}
export async function shareNativeCard(card,name){
 const {Filesystem,Directory}=await import('@capacitor/filesystem'),{Share}=await import('@capacitor/share');
 const file=await Filesystem.writeFile({path:`miyar-${Date.now()}.png`,data:card.dataUrl.split(',')[1],directory:Directory.Cache});
 try{await Share.share({title:`مِعيار — ${name}`,text:card.url,files:[file.uri],dialogTitle:'مشاركة بطاقة الدكتور'});}
 finally{await Filesystem.deleteFile({path:file.uri}).catch(()=>{});}
}
export async function shareNativeLink(text,id){const {Share}=await import('@capacitor/share');await Share.share({title:'مِعيار',text,url:publicDoctorUrl(id)});}
export async function setupNative({back,onDoctor,onError}){
 if(!isNative())return;
 document.documentElement.classList.add('native-app');document.documentElement.dataset.nativePlatform=nativePlatform();
 const {App}=await import('@capacitor/app');
 await App.addListener('backButton',({canGoBack})=>{if(!back()){if(canGoBack)history.back();else App.exitApp();}});
 await App.addListener('appUrlOpen',({url})=>{const link=appLink(url);if(link?.type==='doctor')onDoctor(link.doctor);});
 const launch=await App.getLaunchUrl();const initial=appLink(launch?.url);if(initial?.type==='doctor')onDoctor(initial.doctor);
 const {StatusBar,Style}=await import('@capacitor/status-bar');
 const appearance=()=>StatusBar.setStyle({style:document.documentElement.dataset.theme==='dark'?Style.Dark:Style.Light}).catch(()=>{});
 appearance();new MutationObserver(appearance).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 document.addEventListener('click',event=>{
  const anchor=event.target.closest?.('a[href]');if(!anchor||event.defaultPrevented)return;
  const url=new URL(anchor.href,location.href);
  if(url.origin===location.origin&&anchor.target!=='_blank')return;
  if(['https:','mailto:','tel:'].includes(url.protocol)){event.preventDefault();openSystemUrl(url.href).catch(error=>onError(error.message));}
 });
 const {SplashScreen}=await import('@capacitor/splash-screen');await SplashScreen.hide();
}
