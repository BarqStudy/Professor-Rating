const pageCapacity=16;
export const planThemes=[
 {id:'classic',name:'أكاديمي'},
 {id:'cards',name:'بطاقات'},
 {id:'minimal',name:'بسيط'},
];

export function studyPlanPages(plan){
 const groups=new Map();
 for(const course of plan.courses){
  const heading=course.level>0?`المستوى ${course.level}`:
   plan.groups?.find(group=>group.id===course.pool)?.name||'المقررات الاختيارية';
  const key=course.level>0?course.level:heading;
  if(!groups.has(key))groups.set(key,{heading,courses:[]});
  groups.get(key).courses.push(course);
 }
 const pages=[];
 let sections=[],remaining=pageCapacity;
 const ordered=[...groups].sort(([a],[b])=>(typeof a==='number'?a:Infinity)-(typeof b==='number'?b:Infinity));
 for(const [,group] of ordered){
  for(let offset=0;offset<group.courses.length;){
   if(remaining<2){pages.push(sections);sections=[];remaining=pageCapacity;}
   const courses=group.courses.slice(offset,offset+remaining-1);
   sections.push({heading:offset?group.heading+' · تابع':group.heading,courses});
   offset+=courses.length;
   remaining-=courses.length+1;
  }
 }
 if(sections.length)pages.push(sections);
 return pages;
}

export function drawStudyPlanPage(canvas,plan,pages,index,{theme,color,note}){
 const width=1000,height=1414,right=932,left=68;
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 const darkColor='#'+color.slice(1).match(/../g).map(value=>Math.round(parseInt(value,16)*.45).toString(16).padStart(2,'0')).join('');
 const ink='#182432',muted='#445466',light=color+'16';
 function box(x,y,w,h,fill,radius=0){
  ctx.fillStyle=fill;
  ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fill();
 }
 function text(value,x,y,maxWidth,size,fill=ink,bold=false,direction='rtl',align='right'){
  ctx.font=`${bold?'700':'400'} ${size}px Thmanyah, Arial, sans-serif`;
  ctx.fillStyle=fill;ctx.direction=direction;ctx.textAlign=align;
  ctx.fillText(String(value),x,y,maxWidth);
 }
 box(0,0,width,height,'#ffffff');
 const classic=theme==='classic',cards=theme==='cards';
 box(0,0,width,12,color);
 if(classic)box(left,42,right-left,173,darkColor,12);
 if(cards)box(left,42,right-left,173,light,26);
 const titleColor=classic?'#ffffff':ink,subColor=classic?'#ffffff':muted;
 text(plan.title||plan.major,right-24,105,810,43,titleColor,true);
 text([plan.university,plan.college,plan.fileLabel||plan.version].filter(Boolean).join(' · '),right-24,150,810,22,subColor);
 if(note){
  box(left+20,166,right-left-40,36,classic?'#ffffff20':light,6);
  text(note,right-32,191,790,25,titleColor,true);
 }
 if(!classic&&!cards)box(left,213,right-left,3,color);

 text('المقرر',right-18,258,480,19,muted,true);
 text('الرمز',left+288,258,130,19,muted,true);
 text('الساعات',left+97,258,90,19,muted,true);
 let y=282;
 for(const section of pages[index]){
  if(classic)box(left,y,right-left,47,darkColor,5);
  else if(cards)box(left,y,right-left,47,light,14);
  else box(right-5,y,5,42,color);
  text(section.heading,right-18,y+31,800,24,classic?'#ffffff':darkColor,true);
  y+=61;
  section.courses.forEach((course,row)=>{
   if(cards)box(left,y-3,right-left,51,'#f5f7fa',12);
   else if(classic&&row%2===0)box(left,y-3,right-left,51,'#f5f7fa',4);
   else box(left,y+50,right-left,1,'#e3e8ed');
   const requirements=[
    course.prerequisites?.length?'سابق: '+course.prerequisites.join('، '):'',
    course.corequisites?.length?'متزامن: '+course.corequisites.join('، '):'',
    course.anyPrerequisites?.length?'أحد المتطلبات: '+course.anyPrerequisites.join('، '):'',
    course.minimumCredits?'بعد إكمال '+course.minimumCredits+' ساعة':'',
    course.completedLevel?'بعد اجتياز المستوى '+course.completedLevel:'',
    course.allPrevious?'بعد إكمال المقررات السابقة':'',
   ].filter(Boolean).join(' · ');
   text(course.name,right-18,y+(requirements?21:30),535,24,ink,true);
   if(requirements)text(requirements,right-18,y+43,535,14,muted);
   text(course.code||'—',left+288,y+30,156,20,muted);
   text(course.credits??'—',left+97,y+30,80,20,ink);
   y+=61;
  });
 }
 box(left,height-72,right-left,1,'#dce3e9');
 text('مِعيار · miyar.website',right,height-40,450,19,muted);
 text(`${index+1} / ${pages.length}`,left,height-40,180,19,muted,false,'ltr','left');
}
