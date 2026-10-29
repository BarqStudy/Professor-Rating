const CACHE='miyar-static-v1';
const base=self.registration.scope;
const offline=new URL('offline.html',base).href;
self.addEventListener('install',(event)=>{event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(['offline.html','favicon.svg','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png'].map((path)=>new URL(path,base).href))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',(event)=>{event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith('miyar-static-')&&key!==CACHE).map((key)=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',(event)=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Never cache navigation URLs (including OAuth callback codes) or Supabase/API responses.
 if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match(offline)));return;}
 const allowed=['assets/','fonts/','icons/'].some((path)=>url.pathname.startsWith(new URL(path,base).pathname));
 if(!allowed)return;
 event.respondWith(caches.open(CACHE).then(async(cache)=>{
  const cached=await cache.match(request);if(cached)return cached;
  const response=await fetch(request);
  if(response.ok){
   const copy=response.clone();
   // Storage on mobile can be slower than the network; return the response
   // immediately and keep the worker alive for the independent cache write.
   event.waitUntil(cache.put(request,copy).then(async()=>{
    const keys=await cache.keys();
    if(keys.length>120)await Promise.all(keys.slice(0,keys.length-120).map(key=>cache.delete(key)));
   }).catch(()=>{}));
  }
  return response;
 }));
});
