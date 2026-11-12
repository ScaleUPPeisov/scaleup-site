import test from 'node:test';
import assert from 'node:assert/strict';
import {POST as ai} from '../api/ai.js';
import {POST as voice} from '../api/voice.js';
import {POST as image} from '../api/image.js';
import {GET as health} from '../api/health.js';
import {readBody} from '../lib/shared.js';

function req(url,method='POST',origin='https://studio.test'){
 return new Request(url,{method,headers:{'Host':'studio.test','Origin':origin,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
}
test('all paid endpoints reject unauthenticated requests',async()=>{
 for(const fn of [ai,voice,image]){
  const response=await fn(req('https://studio.test/api/test'));
  assert.equal(response.status,401);
  const body=await response.json();
  assert.equal(body.ok,false);
 }
});
test('health requires authenticated owner',async()=>{
 const response=await health(req('https://studio.test/api/health','GET'));
 assert.equal(response.status,401);
});
test('cross-origin writes are rejected before any provider call',async()=>{
 const response=await ai(req('https://studio.test/api/ai','POST','https://attacker.example'));
 assert.equal(response.status,403);
});
test('request JSON parser rejects malformed JSON',async()=>{
 await assert.rejects(readBody(new Request('https://studio.test',{method:'POST',body:'{broken'})),e=>e.http===400);
});
