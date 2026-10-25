// Cache only model names under a key digest; never persist or log provider keys.
const caches=new WeakMap();
async function modelCache(config,fetcher){
 let cache=caches.get(fetcher);
 if(!cache){cache=new Map();caches.set(fetcher,cache);}
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(config.key));
 const digest=Array.from(new Uint8Array(bytes),(byte)=>byte.toString(16).padStart(2,'0')).join('');
 return {cache,id:digest+':'+config.model};
}
export async function cachedGeminiModel(config,fetcher){
 const {cache,id}=await modelCache(config,fetcher),entry=cache.get(id);
 if(entry&&entry.until>Date.now())return entry.model;
 if(entry)cache.delete(id);
 return config.model;
}
export function selectGeminiFlash(rows,excluded=[]){
 const skipped=new Set(excluded);
 const models=rows.filter((row)=>Array.isArray(row?.supportedGenerationMethods)&&row.supportedGenerationMethods.includes('generateContent')).map((row)=>String(row.name||'').replace(/^models\//,''))
  .filter((name)=>/^gemini-[a-z0-9._-]{1,80}$/.test(name)&&name.includes('flash')&&!skipped.has(name)&&!/(?:image|vision|tts|audio|native|live|embedding|computer|robotic|research|thinking)/.test(name));
 const unstable=(name)=>/(?:preview|exp|latest)/.test(name)?1:0;
 const version=(name)=>{const match=name.match(/^gemini-(\d+)(?:\.(\d+))?/);return match?Number(match[1])*100+Number(match[2]||0):0;};
 models.sort((a,b)=>unstable(a)-unstable(b)||Number(!a.includes('flash-lite'))-Number(!b.includes('flash-lite'))||version(b)-version(a)||a.localeCompare(b));
 return models[0]||null;
}
export async function discoverGeminiFallback(config,fetcher,unavailable,signal){
 const excluded=[config.model,unavailable];
 const rows=[];let pageToken='';
 for(let page=0;page<2;page++){
  const url='https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
  const response=await fetcher(url,{method:'GET',headers:{'x-goog-api-key':config.key},signal:AbortSignal.any([signal||AbortSignal.timeout(18000),AbortSignal.timeout(8000)])});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {model:null,error:data,status:response.status};
  if(Array.isArray(data.models))rows.push(...data.models.slice(0,1000));
  pageToken=typeof data.nextPageToken==='string'?data.nextPageToken:'';
  if(!pageToken||pageToken.length>2000)break;
 }
 const model=selectGeminiFlash(rows,excluded);
 if(model){
  const {cache,id}=await modelCache(config,fetcher);
  if(cache.size>=24)cache.delete(cache.keys().next().value);
  cache.set(id,{model,until:Date.now()+5*60*1000});
 }
 return {model};
}
export function geminiGenerationConfig(model){
 const generationConfig={maxOutputTokens:1800,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{answer:{type:'STRING'},sourceIds:{type:'ARRAY',items:{type:'STRING'}}},required:['answer','sourceIds']}};
 if(/^gemini-2\.5-flash(?:-|$)/.test(model))generationConfig.thinkingConfig={thinkingBudget:0};
 else if(/^gemini-3(?:\.\d+)?-flash(?:-|$)/.test(model))generationConfig.thinkingConfig={thinkingLevel:'minimal'};
 return generationConfig;
}
