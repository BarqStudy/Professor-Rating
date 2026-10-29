import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function worker({cache,fetch}) {
  const listeners={};
  vm.runInNewContext(source,{URL,self:{registration:{scope:'https://miyar.test/Professor-Rating/'},location:{origin:'https://miyar.test'},addEventListener:(name,handler)=>{listeners[name]=handler;}},caches:{open:async()=>cache,match:async()=>new Response('offline')},fetch});
  return request=>{let response;const writes=[];listeners.fetch({request,respondWith:value=>response=value,waitUntil:value=>writes.push(value)});return{response,writes};};
}
test('static responses reach the browser while slow cache writes continue independently',async()=>{
  const write=deferred(),started=deferred();let saved;
  const cache={match:async()=>null,put:async(request,response)=>{saved=await response.text();started.resolve();await write.promise;},keys:async()=>[],delete:async()=>true};
  const dispatch=worker({cache,fetch:async()=>new Response('application code')});
  const event=dispatch({url:'https://miyar.test/Professor-Rating/assets/app.js',method:'GET',mode:'cors'});
  const response=await Promise.race([event.response,new Promise((_,reject)=>setTimeout(()=>reject(new Error('response waited for disk cache')),500))]);
  assert.equal(await response.text(),'application code');await started.promise;
  assert.equal(saved,'application code');assert.equal(event.writes.length,1);
  write.resolve();await event.writes[0];
});
test('the static cache does not intercept authenticated APIs, POSTs or OAuth navigation URLs',async()=>{
  let writes=0;
  const dispatch=worker({cache:{match:async()=>null,put:async()=>{writes++;}},fetch:async()=>new Response('fresh navigation')});
  for(const request of [
    {url:'https://backend.test/functions/v1/miyar',method:'POST'},
    {url:'https://miyar.test/Professor-Rating/assets/app.js',method:'POST'},
    {url:'https://miyar.test/Professor-Rating/private-data',method:'GET'},
  ])assert.equal(dispatch(request).response,undefined);
  const navigation=dispatch({url:'https://miyar.test/Professor-Rating/?code=private-oauth-code',method:'GET',mode:'navigate'});
  assert.equal(await(await navigation.response).text(),'fresh navigation');assert.equal(navigation.writes.length,0);assert.equal(writes,0);
});
