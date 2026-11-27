import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSubmission,acknowledgeSubmission} from '../src/client/submission.js';
import {fileParentTarget} from '../src/client/ui-pure.js';
import {stream} from '../src/client/api.js';

test('only an unchanged complete payload reuses the previous request id',()=>{
 let sequence=0;const id=()=>`r${++sequence}`;
 const files=[{id:'a',name:'a.txt',text:'old'}];const first=prepareSubmission('hello',files,null,id);
 assert.equal(prepareSubmission('hello',files,first,id),first);
 const changed=prepareSubmission('hello',[{id:'b',name:'a.txt',text:'new'}],first,id);
 assert.equal(changed.requestId,'r2');assert.equal(changed.attachments[0].text,'new');
 assert.equal(first.attachments[0].id,undefined);files[0].text='mutated';assert.equal(first.attachments[0].text,'old');
});
test('an old acknowledgement never clears replacement attachments or their draft',()=>{
 const old=[{id:'old',name:'old.txt',text:'old'}];const submitted=prepareSubmission('same text',old,null,()=> 'r');
 const current=[{id:'new',name:'new.txt',text:'new'}];
 assert.deepEqual(acknowledgeSubmission('same text',current,submitted),{draft:'same text',attachments:current});
 const added=[...old,...current];assert.deepEqual(acknowledgeSubmission('same text',added,submitted),{draft:'same text',attachments:current});
 assert.deepEqual(acknowledgeSubmission('same text',old,submitted),{draft:'',attachments:[]});
});
test('acknowledgement preserves a newer user draft',()=>{
 const submitted=prepareSubmission('old',[],null,()=> 'r');assert.equal(acknowledgeSubmission('new',[],submitted).draft,'new');
});
test('root-level files always have a route back to their directory listing',()=>{
 assert.equal(fileParentTarget('.',null),null);assert.equal(fileParentTarget('.','file.txt'),'.');
 assert.equal(fileParentTarget('src','src/file.txt'),'src');assert.equal(fileParentTarget('src/test',null),'src');
});
test('unsequenced admission error frames reject instead of disappearing',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({type:'error',code:'turn_busy',message:'Already running'})+'\n',{headers:{'content-type':'application/x-ndjson'}}));
 let delivered=0;
 await assert.rejects(stream('acpPrompt',{},undefined,()=>delivered++),{code:'turn_busy',message:'Already running'});
 assert.equal(delivered,0);
});
test('durable error events remain part of the transcript',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({type:'error',seq:1,generation:'g',code:'failed',message:'Agent failed'})+'\n',{headers:{'content-type':'application/x-ndjson'}}));
 const events=[];await stream('acpPrompt',{},undefined,event=>events.push(event));assert.equal(events[0].seq,1);
});
test('NDJSON decoding handles split UTF-8 and a final non-newline frame',async t=>{
 const bytes=new TextEncoder().encode(JSON.stringify({type:'text',seq:1,text:'你好'}));
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}}),{headers:{'content-type':'application/x-ndjson'}}));
 const events=[];await stream('acpAttach',{},undefined,event=>events.push(event));assert.equal(events[0].text,'你好');
});
import {prepareSubmission as prepareWithQuotes} from '../src/client/submission.js';
test('quotes are submitted before the draft and participate in retry identity', () => {
  const q = {id: 'q1', text: 'const x = 1;\nreturn x;', summary: 'const x = 1; return x;'};
  const request = prepareWithQuotes('解释这段', [], null, () => 'r', [q]);
  assert.equal(request.text, '> const x = 1;\n> return x;\n\n解释这段');
  assert.equal(prepareWithQuotes('解释这段', [], request, () => { throw new Error('same'); }, [q]), request);
  assert.notEqual(prepareWithQuotes('解释这段', [], request, () => 'r2', [{...q, text: 'changed'}]).requestId, request.requestId);
});
