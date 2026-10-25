export async function createDoctorCard(doctor,hue=218,university='') {
 await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
 const ctx=canvas.getContext('2d');
 const ink=`hsl(${Number(hue)||218},56%,25%)`,soft=`hsl(${Number(hue)||218},35%,94%)`;
 ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,1080,1350);
 ctx.fillStyle=ink;ctx.fillRect(0,0,1080,18);
 ctx.direction='rtl';ctx.textAlign='right';
 const text=(value,x,y,size=40,bold=false,color=ink)=>{ctx.font=`${bold?'700':'400'} ${size}px Thmanyah, serif`;ctx.fillStyle=color;ctx.fillText(String(value),x,y);};
 const wrap=(value,x,y,width,size=48,lineHeight=70)=>{
  ctx.font=`700 ${size}px Thmanyah, serif`;
  const lines=[];let line='';
  for(const word of String(value).split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  lines.slice(0,3).forEach((row,index)=>text(row,x,y+index*lineHeight,size,true));
  return y+Math.min(lines.length,3)*lineHeight;
 };
 // The same balance symbol as the platform, drawn as paths for a crisp export.
 ctx.save();ctx.translate(100,72);ctx.strokeStyle=ink;ctx.lineWidth=7;ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(45,12);ctx.lineTo(45,98);ctx.moveTo(10,32);ctx.lineTo(80,32);ctx.moveTo(27,98);ctx.lineTo(63,98);ctx.stroke();
 for(const x of [10,80]){ctx.beginPath();ctx.moveTo(x,32);ctx.lineTo(x-18,70);ctx.lineTo(x+18,70);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.arc(x,70,18,0,Math.PI);ctx.stroke();}
 ctx.fillStyle='#bf9354';ctx.beginPath();ctx.moveTo(45,0);ctx.lineTo(54,10);ctx.lineTo(45,20);ctx.lineTo(36,10);ctx.closePath();ctx.fill();ctx.restore();
 text('مِعيار',980,151,76,true);
 text('تجارب الطلاب، لاختيارٍ أوضح',980,215,30);
 ctx.fillStyle=soft;ctx.fillRect(70,265,940,310);
 const bottom=wrap(doctor.name,960,342,840,doctor.name.length>50?44:52,doctor.name.length>50?60:72);
 text(doctor.major||'',960,Math.max(475,bottom+10),31,false);
 if(university)text(university,980,620,30,false);
 const labels=['الشرح','التعامل','المساعدة بالدرجات'];
 labels.forEach((label,index)=>{
  const y=710+index*140;
  text(label,980,y,39,true);
  ctx.textAlign='left';ctx.direction='ltr';text(doctor.count?`${Number(doctor.scores?.[index]||0)} / 100`:'—',100,y,40,true);ctx.direction='rtl';ctx.textAlign='right';
  ctx.fillStyle=soft;ctx.fillRect(100,y+28,880,18);
  ctx.fillStyle=ink;const width=doctor.count?880*Math.max(0,Math.min(100,Number(doctor.scores?.[index]||0)))/100:0;ctx.fillRect(980-width,y+28,width,18);
 });
 text(`${Number(doctor.count||0).toLocaleString('ar')} تقييمًا منشورًا`,980,1130,37,true);
 text('الآراء تعبّر عن تجارب أصحابها',980,1180,27,false);
 const url=`https://miyar.website/?doctor=${encodeURIComponent(doctor.id)}`;
 ctx.textAlign='center';ctx.direction='ltr';ctx.fillStyle=ink;ctx.font='700 27px Arial, sans-serif';ctx.fillText(url,540,1270);
 const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw new Error('تعذّر إنشاء الصورة.');
 return {blob,dataUrl:canvas.toDataURL('image/png'),url};
}
