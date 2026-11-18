const rowsPerPage=9;

export function studyPlanPages(plan){
 const levels=new Map(),electives=new Map();
 for(const course of plan.courses){
  const grouped=course.level===0;
  const key=grouped
   ? course.pool||'electives'
   : Number.isInteger(course.level)?course.level:null;
  const sections=grouped?electives:levels;
  if(!sections.has(key))sections.set(key,[]);
  sections.get(key).push(course);
 }
 const pages=[{type:'cover'}];
 const add=(heading,courses)=>{
  const credits=courses.every(course=>Number.isFinite(course.credits))
   ?courses.reduce((sum,course)=>sum+course.credits,0):null;
  const contactHours=courses.every(course=>Number.isFinite(course.contactHours))
   ?courses.reduce((sum,course)=>sum+course.contactHours,0):null;
  for(let offset=0;offset<courses.length;offset+=rowsPerPage){
   pages.push({type:'table',heading:offset?heading+' · تابع':heading,credits,contactHours,total:courses.length,courses:courses.slice(offset,offset+rowsPerPage)});
  }
 };
 for(const [level,courses] of [...levels].sort(([a],[b])=>(a??Infinity)-(b??Infinity))){
  add(level==null?'مقررات دون مستوى محدد':`المستوى ${level}`,courses);
 }
 if(electives.size){
  pages.push({type:'divider'});
  for(const [pool,courses] of electives){
   add(plan.groups?.find(group=>group.id===pool)?.name||'المقررات الاختيارية',courses);
  }
 }
 return pages;
}

export function drawStudyPlanPage(canvas,plan,pages,index,{color,note,logo}){
 const width=1400,height=990;
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 const accent=color;
 const rgb=color.slice(1).match(/../g).map(value=>parseInt(value,16)/255);
 const luminance=rgb.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
  .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
 const accentText=luminance>.179?'#000':'#fff';
 const accentOnWhite=luminance>.179?'#202020':accent;
 const ink='#202020',muted='#4c535e',soft='#f2f4f6';
 function box(x,y,w,h,fill,radius=0){
  ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fill();
 }
 function text(value,x,y,maxWidth,size,fill=ink,bold=false,direction='rtl'){
  ctx.font=`${bold?'700':'400'} ${size}px Thmanyah, Arial, sans-serif`;
  ctx.fillStyle=fill;ctx.direction=direction;ctx.textAlign='center';
  ctx.fillText(String(value),x,y,maxWidth);
 }
 box(0,0,width,height,'#edf0f5');
 ctx.save();ctx.shadowColor='#1f427127';ctx.shadowBlur=26;
 box(30,29,1340,932,'#fff',54);ctx.restore();
 const page=pages[index];
 if(page.type==='cover'){
  box(76,150,690,690,soft,78);
  box(796,150,526,690,ink,78);
  box(907,92,304,110,soft,55);
  box(1015,177,88,6,accent,3);
  text('الخطة الدراسية',1059,161,260,39,accentOnWhite,true);
  const title=plan.title||plan.major||'الخطة الدراسية';
  const words=title.split(/\s+/),lines=[];
  let line='';
  for(const word of words){
   if(line&&line.length+word.length>22){lines.push(line);line=word;}
   else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  const titleLines=lines.length>4?[...lines.slice(0,3),lines.slice(3).join(' ')]:lines;
  titleLines.forEach((part,i)=>text(part,1059,414+(i-(titleLines.length-1)/2)*62,444,58,'#fff',true));
  const version=plan.fileLabel||plan.version||plan.year;
  if(version){box(901,600,316,65,accent,32);text(version,1059,644,285,31,accentText,true);}
  if(note){box(831,710,456,60,'#ffffff20',18);text(note,1059,749,413,28,'#fff');}
  if(logo){
   const scale=Math.min(440/logo.width,420/logo.height);
   const w=logo.width*scale,h=logo.height*scale;
   ctx.drawImage(logo,421-w/2,460-h/2,w,h);
  }
  text(plan.university||'الجامعة',421,739,615,47,ink,true);
  if(plan.college)text(plan.college,421,790,605,28,muted);
  return;
 }
 if(page.type==='divider'){
  box(472,372,456,8,accent,4);
  text('المقررات الاختيارية',700,512,1060,76,ink,true);
  text('Elective courses',700,587,900,52,accentOnWhite,true,'ltr');
 }else{
  const columns=[
   {x:1076,w:241,label:'رمز المقرر'},
   {x:612,w:450,label:'اسم المقرر'},
   {x:466,w:132,label:'الساعات'},
   {x:82,w:370,label:'المتطلبات السابقة'},
  ];
  [
   {x:921,w:396,label:page.heading,fill:accent},
   {x:501,w:396,label:`الساعات المعتمدة: ${page.credits??'—'}`,fill:ink},
   {x:82,w:395,label:page.contactHours==null?`عدد المقررات: ${page.total}`:`الساعات الفعلية: ${page.contactHours}`,fill:ink},
  ].forEach(({x,w,label,fill})=>{box(x,87,w,79,fill,22);text(label,x+w/2,136,w-26,34,x===921?accentText:'#fff',true);});
  for(const {x,w,label} of columns){
   box(x,193,w,66,label==='الساعات'?accent:ink,20);
   text(label,x+w/2,236,w-20,29,label==='الساعات'?accentText:'#fff',true);
  }
  page.courses.forEach((course,row)=>{
   const y=279+row*69;
   const requirements=[
    course.prerequisites?.join(' + '),
    course.corequisites?.length?'متزامن: '+course.corequisites.join(' + '):'',
    course.anyPrerequisites?.length?'أحدها: '+course.anyPrerequisites.join(' / '):'',
    course.minimumCredits?'بعد إكمال '+course.minimumCredits+' ساعة':'',
    course.completedLevel?'بعد المستوى '+course.completedLevel:'',
    course.allPrevious?'جميع المقررات السابقة':'',
   ].filter(Boolean).join(' · ');
   const values=[course.code||'—',course.name,course.credits??'—',requirements||'—'];
   columns.forEach(({x,w},i)=>{
    box(x,y,w,59,soft,18);text(values[i],x+w/2,y+39,w-22,i===3?23:29,ink,true);
   });
  });
 }
 box(78,918,57,49,ink,9);
 text(index,107,952,45,27,'#fff',true);
}
