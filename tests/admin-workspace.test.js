import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_SECTIONS,ADMIN_TOOLS,findAdminTools} from '../src/admin-workspace.js';

test('administrative tool search handles Arabic spelling and links every command to its own existing category and panel',()=>{
 for(const [query,id] of [['حذف تقييم','published'],['تَعْدِيل خُطَّة','edit-plan'],['ساعات رمز','edit-plan'],['تعيين مساعد','team'],['تفعيل جامعة','universities'],['إيميل Resend','mail'],['ملفات R2','files'],['دكاترة دفعة','bulk-doctors']])assert.ok(findAdminTools(query).some(tool=>tool.id===id),query);
 assert.deepEqual(findAdminTools(''),[]);assert.deepEqual(findAdminTools('شيء غير موجود تمامًا'),[]);
 assert.equal(new Set(ADMIN_TOOLS.map(tool=>tool.id)).size,ADMIN_TOOLS.length);
 assert.equal(new Set(ADMIN_SECTIONS.map(section=>section.id)).size,ADMIN_SECTIONS.length);
 const panels=ADMIN_SECTIONS.flatMap(section=>section.panels.map(p=>p[0]));assert.equal(new Set(panels).size,panels.length);
 for(const tool of ADMIN_TOOLS)assert.ok(ADMIN_SECTIONS.find(section=>section.id===tool.section)?.panels.some(panel=>panel[0]===tool.panel),tool.id);
});
