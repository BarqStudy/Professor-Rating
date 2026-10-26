// Mark only entries created within Miyar; never navigate away on a direct-link visit.
export function createNavigation({history,location,scrollY}){
 const valid=()=>Number.isSafeInteger(history.state?.miyar?.depth)&&history.state.miyar.depth>=0;
 const entry=(page,depth,y=0)=>({...history.state,miyar:{page,depth,y}});
 if(!valid())history.replaceState(entry(location.hash.slice(1)||'home',0),'' );
 function push(page){
  const hash=page==='home'?'':`#${page}`;
  if(location.hash===hash)return;
  if(!valid())history.replaceState(entry(location.hash.slice(1)||'home',0),'');
  history.replaceState(entry(location.hash.slice(1)||'home',history.state.miyar.depth,scrollY()),'');
  history.pushState(entry(page,history.state.miyar.depth+1),'',location.pathname+location.search+hash);
 }
 function back(){if(valid()&&history.state.miyar.depth>0){history.back();return true;}history.replaceState(entry('home',0),'',location.pathname+location.search);return false;}
 return {push,back,savedScroll:()=>valid()?history.state.miyar.y||0:0};
}
