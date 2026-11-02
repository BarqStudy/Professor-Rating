import {DAYS,minutes,normalizeTimetable,timetableConflicts} from '../supabase/functions/miyar/timetable-format.js';
const bytes=s=>new TextEncoder().encode(s);
export function encodeTimetable(schedule){
 const data=bytes(JSON.stringify(normalizeTimetable(schedule)));let raw='';for(const b of data)raw+=String.fromCharCode(b);
 const payload='v1.'+btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(payload.length>20000)throw new Error('الرابط طويل جدًا. قلّل عدد المحاضرات أو طول الملاحظات داخل حقول الجدول.');
 return payload;
}
export function decodeTimetable(payload){
 if(typeof payload!=='string'||payload.length>20000||!/^v1\.[A-Za-z0-9_-]+$/.test(payload))throw new Error('رابط المعاينة غير صالح أو أكبر من المسموح.');
 try{const raw=atob(payload.slice(3).replace(/-/g,'+').replace(/_/g,'/'));return normalizeTimetable(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0)))));}
 catch{throw new Error('تعذّر قراءة رابط المعاينة. اطلب رابطًا جديدًا من صاحب الجدول.');}
}
const palette=['#e8f2ed','#eaf0fb','#f8eddf','#eee9f6','#f7e9ec','#e5f3f4'];
function wrap(ctx,text,x,y,width,lineHeight,maxLines=3){
 const words=String(text).split(/\s+/);let line='',lines=[];
 for(const word of words){if(ctx.measureText(line+' '+word).width>width&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);
 lines.slice(0,maxLines).forEach((v,i)=>{while(ctx.measureText(v).width>width&&v.length>2)v=v.slice(0,-2);ctx.fillText(v,x,y+i*lineHeight);});
}
export async function timetableCanvas(input){
 const schedule=normalizeTimetable(input);await document.fonts.ready;
 const sessions=schedule.courses.flatMap((c,index)=>c.sessions.map(s=>({...s,name:c.name,code:c.code,index}))),pending=schedule.courses.filter(c=>!c.sessions.length);
 const start=sessions.length?Math.max(0,Math.floor(Math.min(...sessions.map(s=>minutes(s.start)))/60)*60):480;
 const end=sessions.length?Math.min(1440,Math.ceil(Math.max(...sessions.map(s=>minutes(s.end)))/60)*60):960;
 const pixels=1.4,top=165,bottom=top+Math.max(120,end-start)*pixels,footer=110+Math.ceil(pending.length/3)*36;
 const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=Math.ceil(bottom+footer);
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#183b30';ctx.font='bold 34px Thmanyah, serif';ctx.fillText(schedule.title,1420,55);
 ctx.font='18px Thmanyah, serif';ctx.fillStyle='#63776b';ctx.fillText(timetableConflicts(schedule).length?'تنبيه: يوجد تعارض بين بعض المحاضرات':'جدول أسبوعي · مِعيار',1420,92);
 const left=45,width=1340,col=width/7;
 for(let day=0;day<7;day++){
  const x=left+(6-day)*col;ctx.fillStyle=day%2?'#f7faf8':'#fbfcfb';ctx.fillRect(x,top,col,bottom-top);ctx.fillStyle='#183b30';ctx.font='bold 20px Thmanyah, serif';ctx.textAlign='center';ctx.fillText(DAYS[day],x+col/2,139);
 }
 ctx.textAlign='right';ctx.font='15px Thmanyah, serif';
 for(let t=start;t<=end;t+=60){const y=top+(t-start)*pixels;ctx.strokeStyle='#e3eae5';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+width,y);ctx.stroke();ctx.fillStyle='#6c7c72';ctx.fillText(`${String(Math.floor(t/60)).padStart(2,'0')}:00`,1468,y+5);}
 for(let day=0;day<7;day++){
  const entries=sessions.filter(s=>s.day===day).sort((a,b)=>minutes(a.start)-minutes(b.start)),lanes=[];
  for(const s of entries){let lane=lanes.findIndex(end=>end<=minutes(s.start));if(lane<0)lane=lanes.length;lanes[lane]=minutes(s.end);s.lane=lane;}
  const laneWidth=col/Math.max(1,lanes.length);
  for(const s of entries){const x=left+(6-day)*col+s.lane*laneWidth+4,y=top+(minutes(s.start)-start)*pixels+2,w=laneWidth-8,h=Math.max(14,(minutes(s.end)-minutes(s.start))*pixels-4);
   ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,8);ctx.fillStyle=palette[s.index%palette.length];ctx.fill();ctx.clip();ctx.textAlign='right';ctx.fillStyle='#173d30';ctx.font='bold 17px Thmanyah, serif';wrap(ctx,s.name,x+w-9,y+24,w-18,23,2);ctx.font='14px Thmanyah, serif';ctx.fillStyle='#42594d';ctx.direction='ltr';const time=`${s.start} – ${s.end}`;if(ctx.measureText(time).width>w-18){ctx.font='12px Thmanyah, serif';ctx.fillText(s.start,x+w-9,y+h-29);ctx.fillText(s.end,x+w-9,y+h-12);}else ctx.fillText(time,x+w-9,y+h-12);ctx.direction='rtl';if(h>105)wrap(ctx,[s.teacher,s.room].filter(Boolean).join(' · '),x+w-9,y+80,w-18,20,2);ctx.restore();
  }
 }
 ctx.textAlign='right';ctx.fillStyle='#63776b';ctx.font='17px Thmanyah, serif';
 if(pending.length){ctx.fillText('مواد لم تُحدد مواعيدها:',1420,bottom+30);pending.forEach((c,i)=>wrap(ctx,c.name,1420-(i%3)*460,bottom+62+Math.floor(i/3)*36,435,24,1));}
 ctx.strokeStyle='#e3eae5';ctx.beginPath();ctx.moveTo(45,canvas.height-56);ctx.lineTo(1455,canvas.height-56);ctx.stroke();
 ctx.textAlign='center';ctx.font='bold 18px Thmanyah, serif';ctx.fillStyle='#496557';ctx.fillText('مِعيار  ·  miyar.website',750,canvas.height-25);
 return canvas;
}
export function timetablePdf(canvas){
 const raw=atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]),jpeg=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const W=842,H=595,scale=Math.min((W-24)/canvas.width,(H-24)/canvas.height),w=canvas.width*scale,h=canvas.height*scale,x=(W-w)/2,y=(H-h)/2;
 const stream=`q ${w} 0 0 ${h} ${x} ${y} cm /Im0 Do Q`,chunks=[bytes('%PDF-1.4\n')],offsets=[0];let size=chunks[0].length;
 const append=b=>{chunks.push(b);size+=b.length;};
 const obj=(id,body,blob)=>{offsets[id]=size;append(bytes(`${id} 0 obj\n${body}`));if(blob){append(bytes('\nstream\n'));append(blob);append(bytes('\nendstream'));}append(bytes('\nendobj\n'));};
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R /Annots [6 0 R] >>`);
 obj(4,`<< /Length ${bytes(stream).length} >>`,bytes(stream));obj(5,`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,jpeg);
 obj(6,`<< /Type /Annot /Subtype /Link /Rect [${x} ${y} ${x+w} ${y+55*scale}] /Border [0 0 0] /A << /S /URI /URI (https://miyar.website/) >> >>`);
 const cross=size;append(bytes('xref\n0 7\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${cross}\n%%EOF`));
 return new Blob(chunks,{type:'application/pdf'});
}
export function downloadTimetable(blob,extension){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='miyar-timetable.'+extension;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
