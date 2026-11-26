import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSteeringPrompt} from '../lib/acp-steering.js';
test('multi-megabyte native steering base64 validation is bounded without recursive regexp groups',()=>{
  const capabilities={steering:{supported:true},promptCapabilities:{image:true}};
  const block={type:'image',mimeType:'image/png',data:'A'.repeat(4*1024*1024)};
  assert.equal(prepareSteeringPrompt([block],capabilities,'claude')[0],block);
  for(const data of ['AA=A','A===',' AAA','AA\n='])assert.throws(()=>prepareSteeringPrompt([{...block,data}],capabilities,'claude'),{code:'bad_attachment'});
});
