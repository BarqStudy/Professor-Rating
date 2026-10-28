// Repair the representation of choices, never choose a student's material or
// invent hours, levels, appendix courses or an ambiguous academic association.
const key=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[ـ\u064b-\u065f]/g,'').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0))).replace(/(^|\s)ال(?!زام)(?=[ء-ي])/g,'$1').replace(/\s+/g,' ').trim();
function family(value){
 const name=key(value);
 if(/(?:^|\s)(?:جامعه|جامعي|جامعيه)(?:\s|$)|\buniversity\b/.test(name))return 'university';
 if(/اجبار|الزام|compulsory|required/.test(name))return 'required';
 if(/(?:^|\s)(?:كليه|كليات)(?:\s|$)|\b(?:college|faculty)\b/.test(name))return 'college';
 if(/تخصص|قسم|major|department|speciali[sz]/.test(name))return 'major';
 if(/(?:^|\s)(?:حر|حره)(?:\s|$)|\bfree\b/.test(name))return 'free';
 return null;
}
const labels={university:'متطلبات الجامعة',required:'المقررات الإجبارية',college:'المقررات الاختيارية للكلية',major:'المقررات الاختيارية للتخصص',free:'المقررات الاختيارية الحرة',elective:'المقررات الاختيارية'};
const poolWords=new Set(['مجموعه','قائمه','مواد','ماده','مقرر','مقررات','متطلب','متطلبات','اختياري','اختياريه','اختياريات','جامعه','جامعي','جامعيه','كليه','تخصص','تخصصي','تخصصيه','قسم','اجباري','اجباريه','الزامي','الزاميه','عام','عامه','حر','حره','university','college','faculty','major','department','free','technical','elective','electives','optional','required','compulsory','courses','course','requirements','list','group','groups','pool']);
const ordinals={اول:1,اولي:1,ثاني:2,ثانيه:2,ثالث:3,ثالثه:3,رابع:4,رابعه:4,خامس:5,خامسه:5,سادس:6,سادسه:6,سابع:7,سابعه:7,ثامن:8,ثامنه:8,تاسع:9,تاسعه:9,عاشر:10,عاشره:10,i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10};
function groupNumber(value,pool=false){
 const normalized=key(value).replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim();
 const patterns=[/(?:^|\s)(?:مجموعه|group|pool)\s*(?:(?:رقم|number|no)\s*)?([0-9]+|[ء-ي]+|[ivx]+)(?=\s|$)/g,/(?:^|\s)(?:قائمه|list)\s*(?:(?:رقم|number|no)\s*)?([0-9]+|[ء-ي]+|[ivx]+)(?=\s|$)/g];
 for(const match of patterns.flatMap(pattern=>[...normalized.matchAll(pattern)])){
  const number=/^[0-9]+$/.test(match[1])?Number(match[1]):ordinals[match[1]];
  if(!number||number>240)continue;
  const rest=normalized.replace(match[0],' ').trim();
  const generic=rest.split(' ').filter(Boolean).every(word=>poolWords.has(word.replace(/^لل/,'')));
  return {number,generic};
 }
 if(pool){
  const words=normalized.split(' '),last=words.pop();
  if(/^[0-9]+$/.test(last)&&Number(last)>0&&Number(last)<=240&&words.every(word=>poolWords.has(word.replace(/^لل/,''))))return {number:Number(last),generic:true};
 }
 return null;
}
function poolIdentity(value,contexts){
 const numbered=groupNumber(value,true);
 if(numbered?.generic){const types=contexts.get(numbered.number),type=family(value)||(types?.size===1?[...types][0]:null);return `numbered:${type||'elective'}:${numbered.number}`;}
 const normalized=key(value),words=normalized.split(' ').map(word=>word.replace(/^لل/,''));
 return words.every(word=>poolWords.has(word))?'family:'+(family(value)||'elective'):normalized;
}
function genericSlot(row,enabled){
 const name=key(row.name).replace(/[0-9٠-٩۰-۹()\[\] ._/-]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:(?:university|college|faculty|major|department|free|technical|program) )?(?:elective|optional)(?: course)?(?: [ivx]+)?$/.test(name))return true;
 const words=name.split(' '),allowed=new Set([...poolWords,'خانه','برنامج','مهني','مهنيه','فني','فنيه',...Object.keys(ordinals)]);
 return words.length>0&&words.every(word=>allowed.has(word))&&(/اختيار|\b(?:electives?|optional)\b/.test(name)||enabled&&/(?:جامع|اجبار|الزام)/.test(name));
}
const compatible=(row,group)=>{
 if(row.requirementType&&group.types.size&&(!group.types.has(row.requirementType)||group.types.size>1))return false;
 const courses=group.rows.filter(item=>item.kind==='course');
 return row.credits==null||(courses.length?courses:group.rows).some(item=>item.credits===row.credits);
};
export function repairChoiceRows(input,enabled,record){
 const rows=input.map(row=>row&&typeof row==='object'&&!Array.isArray(row)?{...row}:row);
 const valid=rows.filter(row=>row&&typeof row==='object'&&!Array.isArray(row));
 const contexts=new Map();
 for(const row of valid){const number=groupNumber(row.pool,true)?.number,type=family(row.pool)||row.requirementType||(row.kind==='slot'||row.level>0&&genericSlot(row,enabled)?family(row.name):null);if(number&&type){if(!contexts.has(number))contexts.set(number,new Set());contexts.get(number).add(type);}}
 const aliases=new Map(),usedNames=new Set(valid.map(row=>row.pool).filter(Boolean));
 for(const row of valid){
  if(row.level===0&&row.kind==='slot'&&!genericSlot(row,enabled)){
   row.kind='course';record('صُحّح نوع مواد القوائم لتبقى بدائل يختار منها الطالب.');
  }
  if(row.level>0&&row.kind==='course'&&genericSlot(row,enabled)){
   row.kind='slot';record('حُوّلت خانات الاختيار العامة إلى خانات يختار الطالب مادتها من القائمة.');
  }
  if(typeof row.pool==='string'&&row.pool.trim()){
   const identity=poolIdentity(row.pool,contexts),numbered=groupNumber(row.pool,true);
   if(!aliases.has(identity)){
    let label=row.pool;
    if(numbered?.generic){const types=contexts.get(numbered.number),type=family(label)||(types?.size===1?[...types][0]:null);label=(labels[type]||labels.elective)+' — مجموعة '+numbered.number;}
    else if(/[A-Za-z]/.test(label)){
     const base=(labels[family(label)]||labels.elective)+(numbered?' — مجموعة '+numbered.number:'');let n=1;label=numbered?base+' — تصنيف '+n:base;
     while(usedNames.has(label))label=base+' — تصنيف '+(++n);
     usedNames.add(label);record('وُحّدت أسماء قوائم الاختيار التنظيمية بالعربية دون تغيير أسماء موادها.');
    }
    aliases.set(identity,label);
   }
   if(row.pool!==aliases.get(identity))record('وُحّدت أسماء قوائم الاختيار المتطابقة دون دمج المجموعات المختلفة.');
   row.pool=aliases.get(identity);
  }else row.pool=null;
 }
 // An opted-in, explicitly named list supplies its type; ordinary mandatory
 // courses with no choice/list evidence are deliberately left untouched.
 if(enabled)for(const row of valid){
  if(!row.requirementType&&(row.kind==='slot'||row.level===0||row.pool)){
   const type=family(row.pool)||family(row.name);
   if(type==='university'||type==='required')row.requirementType=type;
  }
 }
 const groups=new Map();
 function add(row){
  if(!row.pool)return;
  if(!groups.has(row.pool))groups.set(row.pool,{name:row.pool,rows:[],types:new Set(),number:groupNumber(row.pool,true)?.number||null,family:family(row.pool)||row.requirementType||null});
  const group=groups.get(row.pool);group.rows.push(row);group.types.add(row.requirementType||null);
 }
 function assign(row,group){
  row.pool=group.name;
  if(enabled&&!row.requirementType&&group.types.size===1){const [type]=group.types;if(type)row.requirementType=type;}
 }
 valid.forEach(add);
 function match(row){
  const number=groupNumber(row.name)?.number;
  let candidates=[...groups.values()].filter(group=>!number||group.number===number);
  const type=row.requirementType||family(row.name);
  if(type){
   const exact=candidates.filter(group=>group.family===type);
   if(exact.length)candidates=exact;
   else candidates=candidates.filter(group=>!group.family);
  }
  // An explicit, unique group number establishes the link even if OCR hours
  // disagree. Validation reports that disagreement instead of changing hours.
  if(number&&candidates.length===1&&(!row.requirementType||candidates[0].types.has(row.requirementType)))return candidates;
  return candidates.filter(group=>compatible(row,group));
 }
 for(const row of valid.filter(row=>row.kind==='slot'&&!row.pool)){
  const candidates=match(row);
  if(candidates.length===1)assign(row,candidates[0]);
  else if(candidates.length===0){
   const type=row.requirementType||family(row.name)||'elective';
   // Multiple named groups of the same family remain distinct. A missing label
   // is not permission to invent a third group and guess its appendix members.
   const number=groupNumber(row.name)?.number;
   if([...groups.values()].some(group=>group.family===type&&(!number||group.number===number)))continue;
   row.pool=labels[type]+(number?' — مجموعة '+number:'');
  }
  if(row.pool){add(row);record('رُبطت خانات الاختيار بقوائم موادها تلقائيًا دون اختيار مادة نيابة عن الطالب.');}
 }
 for(const row of valid.filter(row=>row.kind==='course'&&row.level===0&&!row.pool)){
  const candidates=match(row).filter(group=>group.rows.some(item=>item.kind==='slot'));
  if(candidates.length===1){assign(row,candidates[0]);add(row);record('رُبطت مواد القوائم بخاناتها تلقائيًا.');}
 }
 for(const row of valid){
  if(row.kind==='course'&&row.pool&&row.level>0&&groups.get(row.pool)?.rows.some(item=>item.kind==='slot')){
   row.level=0;record('وُضعت بدائل القوائم خارج المستويات المطلوبة؛ تُحسب خانة الاختيار فقط.');
  }
 }
 const codes=new Set(valid.map(row=>row.code).filter(Boolean));let serial=0;
 for(const row of valid.filter(row=>row.kind==='slot')){
  if(!row.code||/^[-—–]+$/.test(row.code)){
   let code;do{code='CHOICE '+(++serial);}while(codes.has(code));
   codes.add(code);row.code=code;record('أُنشئت رموز تنظيمية لخانات الاختيار دون رموز رسمية؛ ليست رموز مواد دراسية.');
  }
 }
 return rows;
}
