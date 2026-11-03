import {courseNameKey} from './course-names.js';
const titles=new Set(['د','دكتور','استاذ','بروفيسور','dr','prof','professor','doctor']);
const compounds=new Set(['الله','الرحمن','الرحيم','العزيز','الكريم','الملك','اللطيف','القادر','الوهاب','الحميد','المجيد','الهادي','المحسن','الحكيم','الحليم','الفتاح','الجبار','القوي','السلام','الواحد']);
export function doctorNameWords(value){
 const words=String(value??'').normalize('NFKC').toLowerCase().replace(/[\u0610-\u061a\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/);
 const joined=[];
 for(let i=0;i<words.length;i++){
  if(words[i]==='ا'&&words[i+1]==='د')continue;
  if(words[i]==='عبد'&&compounds.has(words[i+1]))joined.push(words[i]+words[++i]);else joined.push(words[i]);
 }
 return joined.map(courseNameKey).filter(word=>word&&!titles.has(word));
}
const cache=new WeakMap();
function entry(doctor){let saved=cache.get(doctor);if(!saved||saved.name!==doctor.name){saved={name:doctor.name,words:doctorNameWords(doctor.name)};cache.set(doctor,saved);}return saved.words;}
function score(words,query){
 if(!query.length)return 0;
 if(words.join('')===query.join(''))return 0;
 const used=new Set();let cost=0;
 for(const token of [...query].sort((a,b)=>b.length-a.length)){
  let found=-1,best=Infinity;
  words.forEach((word,i)=>{if(used.has(i))return;const rank=word===token?0:word.startsWith(token)?2:token.length>=3&&word.includes(token)?4:Infinity;if(rank<best){found=i;best=rank;}});
  if(found<0)return null;used.add(found);cost+=best;
 }
 if(query.length===2&&words[0]===query[0]&&words.at(-1)===query[1])return 1;
 return 5+cost+(words[0]?.startsWith(query[0])?0:1);
}
export function searchDoctors(doctors,query,{college='',major=null}={}){
 const words=doctorNameWords(query);
 return doctors.filter(d=>(!college||d.college===college)&&(!major||d.college===major.college&&d.major===major.name))
  .map(doctor=>({doctor,score:score(entry(doctor),words)})).filter(row=>row.score!==null)
  .sort((a,b)=>a.score-b.score||a.doctor.name.localeCompare(b.doctor.name,'ar')||String(a.doctor.id).localeCompare(String(b.doctor.id)))
  .map(row=>row.doctor);
}
