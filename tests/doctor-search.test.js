import test from 'node:test';
import assert from 'node:assert/strict';
import {doctorNameWords,searchDoctors} from '../src/doctor-search.js';
const doctors=[{id:1,name:'د. أحمد محمد العتيبي',college:'الهندسة',major:'المدنية'},{id:2,name:'أحمد العتيبي',college:'العلوم',major:'المدنية'},{id:3,name:'خالد عبد الله القحطاني',college:'العلوم',major:'الفيزياء'},{id:4,name:'أحمدان محمد العتيبي',college:'الهندسة',major:'الكهربائية'},{id:5,name:'Prof. John Michael Smith',college:'العلوم',major:'الفيزياء'}];
test('first and last names match across omitted middle names, with exact matches ranked first',()=>{
 assert.deepEqual(searchDoctors(doctors,'احمد العتيبي').map(d=>d.id),[2,1,4]);
 assert.deepEqual(searchDoctors(doctors,'العتيبي أحمد').map(d=>d.id),[2,1,4]);
 assert.deepEqual(searchDoctors(doctors,'John Smith').map(d=>d.id),[5]);
 assert.deepEqual(searchDoctors(doctors,'أحمد القحطاني'),[]);
});
test('Arabic spelling, titles, compounds and partial names are normalized without mixing identities',()=>{
 assert.deepEqual(doctorNameWords('أ.د. خَالِد عَبْد الرَّحْمَن القحطاني'),['خالد','عبدالرحمن','قحطاني']);
 assert.deepEqual(searchDoctors(doctors,'خالد عبدالله القحطاني').map(d=>d.id),[3]);
 assert.deepEqual(searchDoctors(doctors,'أحم عتي').map(d=>d.id).sort(),[1,2,4]);
 assert.equal(searchDoctors(doctors,'أحمد أحمد').length,0,'a token cannot consume the same name word twice');
});
test('college and college-major filters compose with the name search and do not merge equal major names',()=>{
 assert.deepEqual(searchDoctors(doctors,'أحمد',{college:'الهندسة'}).map(d=>d.id),[1,4]);
 assert.deepEqual(searchDoctors(doctors,'',{major:{college:'العلوم',name:'المدنية'}}).map(d=>d.id),[2]);
 assert.deepEqual(searchDoctors(doctors,'خالد',{college:'الهندسة'}),[]);
 assert.equal(searchDoctors(doctors,'  ').length,5);
});
test('renaming a professor invalidates the cached name without mutating the catalogue',()=>{
 const rows=[{id:1,name:'محمد علي سالم'}];assert.equal(searchDoctors(rows,'محمد سالم').length,1);
 rows[0].name='خالد علي سالم';assert.equal(searchDoctors(rows,'محمد سالم').length,0);assert.equal(searchDoctors(rows,'خالد سالم').length,1);assert.equal(rows[0].name,'خالد علي سالم');
});
