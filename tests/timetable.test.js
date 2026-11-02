import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTimetable,timetableConflicts} from '../supabase/functions/miyar/timetable-format.js';
import {encodeTimetable,decodeTimetable} from '../src/timetable-export.js';
import {extractTimetable} from '../supabase/functions/miyar/timetable-import.js';
import {createHandler} from '../supabase/functions/miyar/handler.js';
const meeting=(start='08:00',end='09:00',day=0)=>({day,start,end,teacher:'دكتور المادة',room:'A-1'});
const course=(name='استاتيكا',sessions=[])=>({name,code:'CE 211',level:3,credits:3,sessions});
const draft={title:'الفصل الأول',courses:[course('استاتيكا',[meeting()]),course('رياضيات',[meeting('09:00','10:00')]),course('مادة بدون مواعيد')]};
const env={GEMINI_API_KEY:'fake-test-key',AI_PROVIDER:'gemini',AI_MODEL:'gemini-2.5-flash'};
const file=()=>new File(['%PDF-1.7\nprivate original source'], 'plan.pdf',{type:'application/pdf'});
const form=()=>{const f=new FormData();f.set('file',file());return f;};
test('schedule preserves missing times, validates sessions, detects overlap and allows adjoining meetings',()=>{
 const schedule=normalizeTimetable({...draft,studentEmail:'never-export@example.test'});
 assert.equal(schedule.courses[2].sessions.length,0);assert.equal(schedule.studentEmail,undefined);assert.equal(timetableConflicts(schedule).length,0);
 schedule.courses[1].sessions[0].start='08:30';assert.equal(timetableConflicts(schedule).length,1);
 for(const invalid of [meeting('09:00','08:00'),meeting('24:00','25:00'),meeting('08:00','09:00',7)])assert.throws(()=>normalizeTimetable({courses:[course('مادة',[invalid])]}));
 assert.throws(()=>normalizeTimetable({courses:Array.from({length:41},()=>course())}));
});
test('preview round-trips Arabic and carries only the normalized snapshot, never the PDF or account fields',()=>{
 const encoded=encodeTimetable({...draft,token:'secret',file:'original.pdf',email:'private@example.test'}),decoded=decodeTimetable(encoded);
 assert.deepEqual(decoded,normalizeTimetable(draft));assert.equal(JSON.stringify(decoded).includes('private'),false);assert.throws(()=>decodeTimetable('v1.'+'a'.repeat(21000)));assert.throws(()=>decodeTimetable('v1.___'));assert.throws(()=>decodeTimetable('<script>'));
});
test('AI extraction is private, bounded, charges existing quota and leaves plan courses without fabricated times',async()=>{
 let calls=0;const result=await extractTimetable(form(),{id:'guest'},async(name,{body})=>{assert.equal(name,'rpc/miyar_reserve_ai');assert.equal(body.p_guest,'guest');return {remaining:9};},env,async(url,options)=>{calls++;assert.match(url,/generativelanguage/);const body=JSON.parse(options.body);assert.match(body.systemInstruction.parts[0].text,/لا تستنتج مواعيد/);assert.equal(body.contents[0].parts[0].inlineData.mimeType,'application/pdf');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({...draft,notes:['راجع المواعيد']})}]}}]});});
 assert.equal(calls,1);assert.equal(result.remaining,9);assert.deepEqual(result.draft.courses[2].sessions,[]);assert.deepEqual(result.notes,['راجع المواعيد']);
 await assert.rejects(()=>extractTimetable(form(),{id:'guest'},async()=>({}),env,async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[]}}]})),/غير مكتملة/);
 let providerCalled=false;await assert.rejects(()=>extractTimetable(form(),{id:'guest'},async()=>{throw new Error('AI_GUEST_LIMIT');},env,async()=>{providerCalled=true;}),/AI_GUEST_LIMIT/);assert.equal(providerCalled,false);
});
test('student multipart extraction authenticates before reading, retains ordinary body limits and never needs admin privileges',async()=>{
 const token='ab'.repeat(32),guest={id:'33333333-3333-4333-8333-333333333333',status:'active'};let aiCalls=0;
 const handler=createHandler({env,authenticate:async()=>{throw new Error('Should use verified guest');},db:async(name)=>{if(name.startsWith('miyar_guest_sessions?'))return [guest];if(name==='rpc/miyar_reserve_ai')return {remaining:9};throw new Error(name);},aiFetch:async()=>{aiCalls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({...draft,notes:[]})}]}}]});}});
 const request=(data,headers={})=>new Request('https://api.test/?schedule=extract',{method:'POST',headers,body:data});
 assert.equal((await handler(request(form()))).status,401);assert.equal(aiCalls,0);
 const ok=await handler(request(form(),{'x-miyar-guest':token}));assert.equal(ok.status,200);assert.equal((await ok.json()).draft.courses.length,3);
 const huge=new FormData();huge.set('file',new File(['%PDF-'+'.'.repeat(6*1024*1024)],'large.pdf'));
 assert.equal((await handler(request(huge,{'x-miyar-guest':token}))).status,400);
 const normal=await handler(new Request('https://api.test/',{method:'POST',body:JSON.stringify({action:'catalogue',extra:'.'.repeat(17000)})}));assert.equal(normal.status,413);
});
test('OpenAI receives a native PDF with storage disabled, and invalid schedules never become a draft',async()=>{
 const config={AI_PROVIDER:'openai',OPENAI_API_KEY:'fake-openai-test',AI_MODEL:'gpt-4.1-mini'};
 const result=await extractTimetable(form(),{id:'guest'},async()=>({remaining:8}),config,async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.input[0].content[0].type,'input_file');assert.match(body.input[0].content[0].file_data,/^data:application\/pdf;base64,/);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...draft,notes:[]})}]}]});});
 assert.equal(result.draft.courses.length,3);
 await assert.rejects(()=>extractTimetable(form(),{id:'guest'},async()=>({remaining:8}),config,async()=>Response.json({status:'incomplete',output:[]})),/غير مكتملة/);
});
