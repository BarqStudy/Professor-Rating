import test from 'node:test';
import assert from 'node:assert/strict';
import {MIYAR_HELP,MIYAR_GUIDE_UPDATED_AT,buildAiContext} from '../supabase/functions/miyar/ai-context.js';
import {aiConfiguration,generateAiAnswer} from '../supabase/functions/miyar/ai.js';
const help=id=>MIYAR_HELP.find(source=>source.id===id).text;

test('the assistant guide describes current review, grade, specialty, drawing and admin workflows without reviving retired settings',()=>{
 assert.equal(new Set(MIYAR_HELP.map(source=>source.id)).size,MIYAR_HELP.length);
 assert.ok(MIYAR_HELP.every(source=>['#home','#ratings','#plan','#advisor','#requests','#admin'].includes(source.href)));
 assert.match(help('help-review-rules'),/أكثر من مادة/);assert.match(help('help-review-rules'),/لا يوجد حد يومي/);assert.match(help('help-review-rules'),/باهتة وغير قابلة للاختيار/);
 assert.match(help('help-outcomes'),/بما في ذلك درجات التقييمات السابقة/);assert.match(help('help-outcomes'),/دون اسم الطالب/);assert.match(help('help-outcomes'),/16\/11\/2026/);assert.match(help('help-outcomes'),/خريطة الدرجات ملغاة/);assert.match(help('help-outcomes'),/غير موجود في الإعدادات أو نموذج التقييم/);
 assert.match(help('help-university'),/نافذة إلزامية/);assert.match(help('help-university'),/يدخل الطالب مباشرة/);assert.match(help('help-rating'),/من تخصصك المحفوظ/);
 assert.match(help('help-drawing'),/يختلف عن «الرسم الهندسي الميكانيكي»/);assert.match(help('help-drawing'),/درستها في السنة التحضيرية/);assert.match(help('help-drawing'),/المستوى 3/);
 assert.match(help('help-course-advisor'),/جميع تخصصات وكليات الجامعة نفسها/);assert.match(help('help-review-likes'),/مفيد/);assert.match(help('help-review-likes'),/منزلقة أفقيًا/);
 assert.match(help('help-admin'),/البحث أعلى اللوحة/);assert.match(help('help-admin'),/حذف تقييم/);assert.match(help('help-team'),/سفيرًا لجامعة كاملة أو مساعدًا لكلية محددة/);
 assert.ok(!help('help-study').includes('حتى عند تغيير المادة'));assert.ok(!help('help-rating').includes('الهوية والدرجة لا تظهران'));
});

test('both AI providers receive the current guide with priority over stale chat history while private grades, identities and administrative queues stay outside their context',async()=>{
 const catalogue={universities:[{id:3,name:'جامعة نجران',enabled:true}],colleges:[{id:1,name:'كلية الهندسة',university_id:3}],majors:[{id:1,name:'الهندسة المدنية',college_id:1}],doctors:[{id:17,name:'أحمد محمد العتيبي',major_id:1,major:'الهندسة المدنية',college:'كلية الهندسة',score:80,count:2,subjects:['الاستاتيكا']}],stats:{doctors:1,reviews:2},privateQueue:'admin-queue-secret'};
 const db=async path=>path==='rpc/miyar_catalogue'?catalogue:[{subject:'الاستاتيكا',comment:'تعليق عام',tags:[],grade:93,account_id:'private-account',guest_id:'private-guest'}];
 const history=[{role:'assistant',text:'اذهب إلى مشاركة الدرجات في الإعدادات لتفعيل خريطة الدرجات.'}];
 const context=await buildAiContext(db,3,'كيف أقيم أحمد محمد العتيبي في مادة ثانية؟',history);assert.equal(context.data.guideUpdatedAt,MIYAR_GUIDE_UPDATED_AT);
 for(const secret of ['private-account','private-guest','admin-queue-secret','account_id','guest_id','"grade":93'])assert.ok(!JSON.stringify(context).includes(secret));
 for(const provider of ['openai','gemini']){
  const config=aiConfiguration({AI_PROVIDER:provider,OPENAI_API_KEY:'guide-test-private',GEMINI_API_KEY:'guide-test-private'});let captured;
  const response=await generateAiAnswer(config,context,'هل أقدر أقيم في مادة ثانية؟',history,async(url,options)=>{
   const body=JSON.parse(options.body),instructions=provider==='openai'?body.instructions:body.systemInstruction.parts[0].text,input=JSON.parse(provider==='openai'?body.input:body.contents[0].parts[0].text);captured=input;
   assert.match(instructions,/يتقدم على أي إرشادات قديمة في تاريخ المحادثة/);assert.match(instructions,/لا تعرض خطوات لتفعيلهما/);assert.match(instructions,/درجات الطلاب الفردية ليست ضمن البيانات المقدمة لك/);
   assert.deepEqual(input.publicMiyarData.help,MIYAR_HELP);assert.deepEqual(input.history,history);assert.equal(input.publicMiyarData.guideUpdatedAt,MIYAR_GUIDE_UPDATED_AT);
   const text=JSON.stringify({answer:'نعم، لكل مادة تقييم مستقل؛ المادة نفسها تحتاج طلب تعديل.',sourceIds:['help-review-rules','https://untrusted.test']});
   return new Response(JSON.stringify(provider==='openai'?{output:[{content:[{type:'output_text',text}]}]}:{candidates:[{content:{parts:[{text}]}}]}));
  });
  assert.ok(captured);assert.equal(response.sources.length,1);assert.equal(response.sources[0].href,'#ratings');
 }
});
