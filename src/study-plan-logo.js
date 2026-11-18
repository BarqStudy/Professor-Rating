import directory from '../data/saudi-universities.json' with {type:'json'};

export function loadPlanLogo(university,customUrl){
 const entry=directory.find(item=>[item.name,...item.aliases].includes(university));
 const url=customUrl||(entry?.logo&&(/^(https:\/\/)/.test(entry.logo)?entry.logo:import.meta.env.BASE_URL+entry.logo));
 if(!url)return Promise.resolve(null);
 return new Promise(resolve=>{
  const image=new Image();
  image.crossOrigin='anonymous';
  image.onload=()=>{
   const canvas=document.createElement('canvas');
   const height=image.naturalHeight*(!customUrl&&entry?.logoCrop==='unit-footer' ? .82 : 1);
   const scale=Math.min(1,500/Math.max(image.naturalWidth,height));
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(height*scale));
   canvas.getContext('2d').drawImage(image,0,0,image.naturalWidth,height,0,0,canvas.width,canvas.height);
   resolve(canvas);
  };
  image.onerror=()=>resolve(null);
  image.src=url;
 });
}
