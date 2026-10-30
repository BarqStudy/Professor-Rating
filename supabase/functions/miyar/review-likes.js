import {ApiError,integer} from './security.js';
export async function reviewLikes(action,body,db,account=null,guest=null){
 if(!['review.likes','review.like','guest.review.likes','guest.review.like'].includes(action))return null;
 const actor={p_account:account,p_guest:guest};
 if(action.endsWith('.likes')){
  if(!Array.isArray(body.reviews)||body.reviews.length>100)throw new ApiError(400,'اختر حتى 100 تقييم.');
  const reviews=[...new Set(body.reviews.map(id=>integer(id,1,Number.MAX_SAFE_INTEGER,'التقييم')))];
  return {data:await db('rpc/miyar_review_like_states',{method:'POST',body:{...actor,p_reviews:reviews}})};
 }
 if(typeof body.liked!=='boolean')throw new ApiError(400,'حدد حالة الإعجاب بالتقييم.');
 return {data:await db('rpc/miyar_set_review_like',{method:'POST',body:{...actor,p_review:integer(body.review,1,Number.MAX_SAFE_INTEGER,'التقييم'),p_liked:body.liked}})};
}
