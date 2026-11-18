import {storage} from './storage.js';

const defaults={density:'comfortable',motion:'system',cursor:'enhanced'};
const values={density:['comfortable','compact'],motion:['system','reduced'],cursor:['enhanced','native']};
const root=document.documentElement;

export function setDisplayPreference(key,value){
 if(!values[key]?.includes(value))return;
 root.dataset[key]=value;
 storage.setItem('miyar-display-'+key,value);
 if(key==='cursor'||key==='motion')root.classList.remove('custom-cursor-active');
}

for(const [key,defaultValue] of Object.entries(defaults)){
 const saved=storage.getItem('miyar-display-'+key);
 root.dataset[key]=values[key].includes(saved)?saved:defaultValue;
}

export const prefersLessMotion=()=>root.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
