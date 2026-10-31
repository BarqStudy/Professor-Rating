import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewMetrics} from '../src/review-metrics.js';

test('criterion scores preserve real zeroes, fractions and English digits independently of grades',()=>{
 const html=reviewMetrics([0,87.5,100]);
 assert.deepEqual([...html.matchAll(/aria-valuenow="([^"]+)"/g)].map(x=>Number(x[1])),[0,87.5,100]);
 assert.match(html,/width:0%/);assert.match(html,/87.5<small> \/ 100/);assert.ok(!/[٠-٩]/.test(html));
});
test('missing, unscored and invalid values never masquerade as real scores or enter markup',()=>{
 for(const scores of [undefined,[],[null,NaN,Infinity],[-1,101,'<script>'],['0',{},'0%" onmouseover="bad']]){
  const html=reviewMetrics(scores);assert.ok(!html.includes('role="meter"'));assert.equal((html.match(/غير متاح/g)||[]).length,3);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('onmouseover'));
 }
 assert.ok(!reviewMetrics([70,80,90],{empty:true}).includes('role="meter"'));
});
