import {integer,text} from './security.js';
export async function publishedReviewAdmin(operation,body,admin,db){
 if(operation==='review.published.list')return db('rpc/miyar_published_review_list',{method:'POST',body:{
  p_university:body.universityId==null?null:integer(body.universityId,1,Number.MAX_SAFE_INTEGER,'الجامعة'),
  p_query:text(body.query||'',0,120,'البحث'),p_before:body.before==null?null:integer(body.before,1,Number.MAX_SAFE_INTEGER,'صفحة التقييمات'),
 }});
 if(operation==='review.remove')return db('rpc/miyar_remove_published_review',{method:'POST',body:{p_admin:admin,p_review:integer(body.id,1,Number.MAX_SAFE_INTEGER,'التقييم'),p_reason:text(body.reason||'',0,300,'سبب الحذف')}});
 return null;
}
