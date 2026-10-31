import {isNative,APP_CALLBACK,appLink} from './native.js';
// PKCE code verifiers stay in this app's storage. Tokens are never accepted from
// a deep-link fragment; only the Auth server can exchange the single-use code.
export function createNativeAuth({native=isNative,loadApp=()=>import('@capacitor/app'),loadBrowser=()=>import('@capacitor/browser'),onError=()=>{}}={}){
 let initialized=null;const exchanges=new Map();
 async function consume(client,value){
  const link=appLink(value);if(!link||!['auth','auth-error'].includes(link.type))return;
  if(link.type==='auth-error'){onError('لم يكتمل تسجيل الدخول. حاول مجددًا.');return;}
  if(exchanges.has(link.code))return exchanges.get(link.code);
  const task=(async()=>{
   try{const {error}=await client.auth.exchangeCodeForSession(link.code);
    if(error)throw new Error('تعذّر إكمال تسجيل الدخول. حاول مجددًا.');
   }finally{const {Browser}=await loadBrowser();await Browser.close().catch(()=>{});}
  })();exchanges.set(link.code,task);if(exchanges.size>20)exchanges.delete(exchanges.keys().next().value);return task;
 }
 function initialize(client){
  if(!native())return Promise.resolve();
  if(initialized)return initialized;
  initialized=(async()=>{const {App}=await loadApp();await App.addListener('appUrlOpen',({url})=>{consume(client,url).catch(error=>onError(error.message));});await App.addListener('appStateChange',({isActive})=>{if(isActive)client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();});const launch=await App.getLaunchUrl();await consume(client,launch?.url).catch(error=>onError(error.message));})();return initialized;
 }
 async function signIn(client,provider,redirectTo){
  if(!native())return client.auth.signInWithOAuth({provider,options:{redirectTo,queryParams:provider==='google'?{prompt:'select_account'}:undefined}});
  await initialize(client);
  const result=await client.auth.signInWithOAuth({provider,options:{redirectTo:APP_CALLBACK,skipBrowserRedirect:true,queryParams:provider==='google'?{prompt:'select_account'}:undefined}});
  if(result.error)return result;
  const url=new URL(result.data.url);if(url.protocol!=='https:')throw new Error('تعذّر فتح خدمة تسجيل الدخول.');
  const {Browser}=await loadBrowser();await Browser.open({url:url.href});return result;
 }
 return {initialize,signIn};
}
