// Native horizontal scrolling keeps touch interaction light and respects RTL.
export function reviewCarousel(items,id){
 return `<section class="review-carousel" aria-label="تقييمات الطلاب"><div class="review-carousel-track" id="${id}" tabindex="0" role="group" aria-label="اسحب لعرض التقييمات">${items.join('')}</div><div class="review-carousel-footer"><div class="review-carousel-dots" role="group" aria-label="الانتقال بين التقييمات">${items.map((_,i)=>`<button type="button" data-review-dot="${i}" aria-label="التقييم ${i+1} من ${items.length}" aria-controls="${id}" ${i===0?'aria-current="true"':''}><span aria-hidden="true"></span></button>`).join('')}</div><span class="review-carousel-count" aria-live="polite" dir="ltr">1 / ${items.length}</span></div></section>`;
}
export function bindReviewCarousel(root){
 if(!root||root.dataset.bound)return;
 root.dataset.bound='true';
 const track=root.querySelector('.review-carousel-track'),cards=[...track.children],dots=[...root.querySelectorAll('[data-review-dot]')],count=root.querySelector('.review-carousel-count');
 let active=0,frame=0;
 const paint=index=>{
  if(index===active)return;
  dots[active]?.removeAttribute('aria-current');dots[index].setAttribute('aria-current','true');active=index;
  count.textContent=`${index+1} / ${cards.length}`;
  const dot=dots[index],strip=root.querySelector('.review-carousel-dots'),bounds=strip.getBoundingClientRect(),target=dot.getBoundingClientRect();
  if(target.left<bounds.left||target.right>bounds.right)strip.scrollBy({left:target.left-bounds.left-(bounds.width-target.width)/2,behavior:'auto'});
 };
 const update=()=>{
  frame=0;if(!root.isConnected)return;
  const styles=getComputedStyle(track),rtl=styles.direction==='rtl',bounds=track.getBoundingClientRect(),first=cards[0].getBoundingClientRect();
  const distance=rtl?first.right-bounds.right:bounds.left-first.left,step=first.width+(parseFloat(styles.columnGap)||0);
  const closest=Math.max(0,Math.min(cards.length-1,Math.round(distance/step)));
  paint(closest);
 };
 const go=index=>{
  index=Math.max(0,Math.min(cards.length-1,index));
  const bounds=track.getBoundingClientRect(),target=cards[index].getBoundingClientRect(),rtl=getComputedStyle(track).direction==='rtl';
  track.scrollBy({left:rtl?target.right-bounds.right:target.left-bounds.left,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 };
 track.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(update);},{passive:true});
 track.addEventListener('keydown',event=>{
  if(event.target!==track)return;
  const rtl=getComputedStyle(track).direction==='rtl';
  const next=event.key==='Home'?0:event.key==='End'?cards.length-1:event.key==='ArrowLeft'?active+(rtl?1:-1):event.key==='ArrowRight'?active+(rtl?-1:1):null;
  if(next!==null){event.preventDefault();go(next);}
 });
 dots.forEach((dot,index)=>dot.onclick=()=>go(index));
 cards.forEach((card,index)=>{card.setAttribute('role','group');card.setAttribute('aria-roledescription','شريحة');card.setAttribute('aria-label',`تقييم ${index+1} من ${cards.length}`);});
 // No global listeners/observers survive closing or replacing the dialog.
 frame=requestAnimationFrame(update);
}
