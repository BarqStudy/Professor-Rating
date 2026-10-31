import test from 'node:test';
import assert from 'node:assert/strict';
import {appLink,APP_CALLBACK,publicDoctorUrl} from '../src/native.js';
import {createNativeAuth} from '../src/native-auth.js';
import {createGoogleVerifier} from '../supabase/functions/miyar/auth.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
import {ApiError} from '../supabase/functions/miyar/security.js';
const owner='11111111-1111-4111-8111-111111111111';
function fixture(launch){
 const listeners={},calls=[],errors=[];
 const auth={exchangeCodeForSession:async code=>{calls.push(['exchange',code]);return {error:null};},signInWithOAuth:async options=>{calls.push(['signin',options]);return {data:{url:'https://auth.example/authorize'},error:null};},startAutoRefresh:()=>calls.push(['start']),stopAutoRefresh:()=>calls.push(['stop'])};
 const App={addListener:async(name,callback)=>{listeners[name]=callback;},getLaunchUrl:async()=>launch?{url:launch}:undefined};
 const Browser={open:async value=>calls.push(['open',value]),close:async()=>calls.push(['close'])};
 return {client:{auth},listeners,calls,errors,flow:createNativeAuth({native:()=>true,loadApp:async()=>({App}),loadBrowser:async()=>({Browser}),onError:message=>errors.push(message)})};
}
test('native links accept only the exact code callback; token fragments and foreign hosts never create a session',()=>{
 assert.deepEqual(appLink(APP_CALLBACK+'?code=once'),{type:'auth',code:'once'});
 for(const link of [APP_CALLBACK+'#access_token=secret',APP_CALLBACK+'?code=valid#token=secret','https://evil.test/?code=valid','website.miyar.app://wrong/callback?code=valid','website.miyar.app://auth/wrong?code=valid',APP_CALLBACK+'?access_token=secret'])assert.equal(appLink(link),null);
 assert.deepEqual(appLink('https://miyar.website/?doctor=17'),{type:'doctor',doctor:17});assert.equal(appLink('https://miyar.website/?doctor=-1'),null);assert.equal(publicDoctorUrl(17),'https://miyar.website/?doctor=17');
});
test('cold native OAuth exchanges before initialization finishes and duplicate callbacks exchange once',async()=>{
 const f=fixture(APP_CALLBACK+'?code=one');await Promise.all([f.flow.initialize(f.client),f.flow.initialize(f.client)]);
 f.listeners.appUrlOpen({url:APP_CALLBACK+'?code=one'});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.calls,[['exchange','one'],['close']]);
 f.listeners.appStateChange({isActive:false});f.listeners.appStateChange({isActive:true});assert.deepEqual(f.calls.slice(-2),[['stop'],['start']]);
});
test('native login opens the system browser with PKCE redirect; hot callbacks and cancellation never navigate the WebView',async()=>{
 const f=fixture();await f.flow.signIn(f.client,'google','https://miyar.website/');const request=f.calls.find(c=>c[0]==='signin')[1];
 assert.equal(request.options.skipBrowserRedirect,true);assert.equal(request.options.redirectTo,APP_CALLBACK);assert.equal(request.provider,'google');assert.equal(f.calls.at(-1)[0],'open');
 f.listeners.appUrlOpen({url:APP_CALLBACK+'?code=hot'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.filter(c=>c[0]==='exchange').length,1);
 f.listeners.appUrlOpen({url:APP_CALLBACK+'?error=access_denied'});assert.equal(f.errors.length,1);
 const g=fixture();g.client.auth.exchangeCodeForSession=async()=>({error:new Error('private provider details')});await g.flow.initialize(g.client);g.listeners.appUrlOpen({url:APP_CALLBACK+'?code=invalid'});await new Promise(resolve=>setImmediate(resolve));assert.equal(g.errors.length,1);assert.ok(!g.errors[0].includes('private'));
});
test('web OAuth retains the normal redirect without loading native plugins',async()=>{
 let request;const flow=createNativeAuth({native:()=>false,loadApp:()=>{throw Error('native plugin on web');}});const client={auth:{signInWithOAuth:async value=>{request=value;return{error:null};}}};await flow.initialize(client);await flow.signIn(client,'google','https://miyar.website/');assert.equal(request.options.redirectTo,'https://miyar.website/');assert.equal(request.options.skipBrowserRedirect,undefined);
});
test('Apple sessions require Auth-verified identity and OAuth AMR; claimed user metadata is insufficient',async()=>{
 const claims={sub:owner,amr:[{method:'oauth'}]};const token='a.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.b';
 const user={id:owner,email_confirmed_at:'2026-10-31',identities:[{provider:'apple'}],app_metadata:{provider:'apple',providers:['apple']},user_metadata:{full_name:'طالب'}};
 const request=new Request('https://test',{headers:{authorization:'Bearer '+token}});
 const verify=value=>createGoogleVerifier('https://test.supabase.co','key',async()=>Response.json(value))(request);
 assert.deepEqual(await verify(user),{id:owner,name:'طالب'});
 await assert.rejects(verify({...user,identities:[{provider:'email'}],user_metadata:{provider:'apple'}}),{status:403});
 await assert.rejects(verify({...user,app_metadata:{provider:'email',providers:['email']}}),{status:403});
});
test('account deletion requires explicit confirmation, binds the verified actor and remains available to a restricted member',async()=>{
 const calls=[];const db=async(path,options)=>{calls.push({path,...options});return {deleted:true};};
 const handle=createHandler({db,env:{},authenticate:async request=>{if(!request.headers.has('authorization'))throw new ApiError(401,'unauthorized');return{id:owner};}});
 const request=(body,authenticated=true)=>new Request('https://test',{method:'POST',headers:authenticated?{authorization:'Bearer verified',origin:'capacitor://localhost'}:{},body:JSON.stringify(body)});
 assert.equal((await handle(request({action:'account.delete',confirmation:'حذف حسابي'},false))).status,401);
 assert.equal((await handle(request({action:'account.delete',confirmation:true}))).status,400);assert.equal(calls.length,0);
 const response=await handle(request({action:'account.delete',confirmation:'حذف حسابي',account:'22222222-2222-4222-8222-222222222222',isAdmin:true}));
 assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'capacitor://localhost');assert.deepEqual(calls,[{path:'rpc/miyar_delete_account',method:'POST',body:{p_account:owner}}]);
});

test('an expired cold-start callback does not poison initialization or prevent the next login',async()=>{
 const f=fixture(APP_CALLBACK+'?code=expired');f.client.auth.exchangeCodeForSession=async()=>({error:new Error('expired')});await f.flow.initialize(f.client);assert.equal(f.errors.length,1);await f.flow.signIn(f.client,'apple','https://miyar.website/');assert.equal(f.calls.find(c=>c[0]==='signin')[1].provider,'apple');assert.equal(f.calls.at(-1)[0],'open');
});
