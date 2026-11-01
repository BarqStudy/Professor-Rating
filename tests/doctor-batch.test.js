import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDoctorBatch} from '../src/doctor-batch.js';

test('visible screenshot names pass; a bad line beyond them is reported with its original position', () => {
  const source = 'د. محسن علي مبارك الهمامي\r\nد. حسام حسن خليل\r\nد. جري سعيد جزي القثامي\r\nد. أمل فتحي سليم\r\nد. أحمد عبدالباقي إبراهيم\r\nد. أحمد عمر\r\n\r\nاسم ناقص';
  const batch = parseDoctorBatch(source);
  assert.equal(batch.names.length, 7);
  assert.equal(batch.issues.length, 1);
  assert.equal(batch.issues[0].line, 8);
  assert.equal(batch.issues[0].name, 'اسم ناقص');
  assert.equal(source.slice(batch.first.start, batch.first.end), 'اسم ناقص');
});

test('pasted CR and Unicode line separators preserve line numbers; formatting marks and duplicates are normalized', () => {
  const source = '\u200fد. أحمد محمد علي\r\rد. خالد عبدالله الحربي\u2028د. \u200f أحمد محمد علي\u2029اسم ناقص';
  const batch = parseDoctorBatch(source);
  assert.deepEqual(batch.names, ['د. أحمد محمد علي', 'د. خالد عبدالله الحربي', 'اسم ناقص']);
  assert.equal(batch.issues[0].line, 5);
  assert.equal(source.slice(batch.first.start, batch.first.end), 'اسم ناقص');
});

test('empty lists, too short/long names and more than 100 distinct names have specific diagnostics without dropping drafts', () => {
  assert.match(parseDoctorBatch(' \n\n').message, /واحدًا على الأقل/);
  assert.match(parseDoctorBatch('أحمد').issues[0].reason, /أقصر من 8/);
  assert.match(parseDoctorBatch('أحمد محمد '+ 'ع'.repeat(100)).issues[0].reason, /أطول من 100/);
  const names = Array.from({length:100}, (_, i) => `أحمد محمد العتيبي ${i}`);
  assert.equal(parseDoctorBatch([...names, names[0]].join('\n')).message, '');
  const source = [...names, 'خالد عبدالله الحربي'].join('\n'), batch = parseDoctorBatch(source);
  assert.match(batch.message, /101 اسمًا مختلفًا/);
  assert.equal(batch.first.line, 101);
  assert.equal(source.slice(batch.first.start, batch.first.end), 'خالد عبدالله الحربي');
  assert.equal(batch.names.length, 101);
});
