const thumb='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v10H3V10h4Zm0 0 5-7c2 0 3 1 2 4l-1 3h5a3 3 0 0 1 3 4l-2 5a2 2 0 0 1-2 1H7"/></svg>';
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
export function reviewLikeButton(row){
 const id=Number(row.id);if(!Number.isSafeInteger(id)||id<1)return '';
 const likes=count(row.likes);
 return `<button type="button" class="review-like" data-review-like="${id}" data-like-count="${likes}" aria-pressed="false" aria-label="هذا التقييم مفيد، ${likes} إعجاب">${thumb}<span>مفيد</span><b class="review-like-count" dir="ltr">${likes.toLocaleString('en-US')}</b></button>`;
}
export function createReviewLikes({api,ensureGuest,isMember,ownerKey,configured}){
 function mount(root){
  if(!root||root.dataset.likesBound||!configured())return;
  root.dataset.likesBound='true';
  const buttons=[...root.querySelectorAll('[data-review-like]')];if(!buttons.length)return;
  const owner=ownerKey(),alive=()=>root.isConnected&&owner===ownerKey(),states=new Map(),busy=new Set();
  const ids=[...new Set(buttons.map(button=>Number(button.dataset.reviewLike)))];
  const matching=id=>buttons.filter(button=>Number(button.dataset.reviewLike)===id);
  const paint=(id,state)=>{
   states.set(id,state);
   matching(id).forEach(button=>{
    button.setAttribute('aria-pressed',String(state.liked));button.dataset.likeCount=state.likes;
    button.setAttribute('aria-label',`${state.liked?'إلغاء الإعجاب بهذا التقييم':'هذا التقييم مفيد'}، ${state.likes} إعجاب`);
    button.querySelector('.review-like-count').textContent=state.likes.toLocaleString('en-US');
   });
  };
  const setBusy=(id,value)=>matching(id).forEach(button=>{button.disabled=value;button.setAttribute('aria-busy',String(value));});
  const state=value=>{
   if(!value||!Number.isSafeInteger(value.review)||!Number.isSafeInteger(value.likes)||value.likes<0||typeof value.liked!=='boolean')throw new Error('تعذّر تحديث الإعجاب. حاول مجددًا.');
   return {likes:value.likes,liked:value.liked};
  };
  async function load(requested){
   if(!isMember())await ensureGuest();if(!alive())return;
   const rows=await api(isMember()?'review.likes':'guest.review.likes',{reviews:requested});
   if(!alive())return;if(!Array.isArray(rows))throw new Error('تعذّر تحميل الإعجابات.');
   for(const row of rows)if(ids.includes(row.review))paint(row.review,state(row));
  }
  ids.forEach(id=>setBusy(id,true));
  const ready=load(ids).catch(()=>{}).finally(()=>{if(alive())ids.forEach(id=>{if(!busy.has(id))setBusy(id,false);});});
  buttons.forEach(button=>button.onclick=async()=>{
   const id=Number(button.dataset.reviewLike);if(busy.has(id))return;
   busy.add(id);setBusy(id,true);let previous;
   button.closest('.review-comment')?.querySelector('.review-like-error')?.remove();
   try{
    await ready;if(!states.has(id))await load([id]);if(!alive())return;
    previous=states.get(id);if(!previous)throw new Error('التقييم غير متاح للإعجاب الآن.');
    const liked=!previous.liked;paint(id,{liked,likes:Math.max(0,previous.likes+(liked?1:-1))});
    const result=await api(isMember()?'review.like':'guest.review.like',{review:id,liked});
    if(result?.review!==id)throw new Error('تعذّر تحديث الإعجاب. حاول مجددًا.');
    if(alive())paint(id,state(result));
   }catch(error){
    if(alive()){
     if(previous)paint(id,previous);
     const note=document.createElement('small');note.className='review-like-error';note.setAttribute('role','alert');note.textContent=error.message||'تعذّر حفظ الإعجاب. حاول مجددًا.';
     button.closest('.review-comment')?.append(note);
    }
   }finally{busy.delete(id);if(alive())setBusy(id,false);}
  });
 }
 return {mount};
}
