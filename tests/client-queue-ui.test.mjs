import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {resolveDeliveryMode,composerEnterGesture,deliveryConflicts} from '../src/client/composer-delivery-model.js';
import {queueRows,queuePresentation,queueAttachment} from '../src/client/native-queue-model.js';
import zh from '../src/client/zh.js';
import en from '../src/client/en.js';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');

test('busy Enter and Send use the shared Host preference; accelerated Enter complements it',()=>{
  for(const preferred of [undefined,'invalid','queue','steer']) {
    const expected=preferred==='steer'?'steer':'queue';
    assert.equal(resolveDeliveryMode(preferred,true),expected);
    assert.equal(resolveDeliveryMode(preferred,true,'accelerated'),expected==='queue'?'steer':'queue');
    assert.equal(resolveDeliveryMode(preferred,false,'accelerated'),'queue');
  }
});
test('only exact Enter or one accelerator submits; IME and unsupported chords stay untouched',()=>{
  const key=patch=>({key:'Enter',...patch});
  assert.equal(composerEnterGesture(key()),'enter');
  for(const mod of ['ctrlKey','metaKey'])assert.equal(composerEnterGesture(key({[mod]:true})),'accelerated');
  for(const patch of [{key:'Tab'},{shiftKey:true},{altKey:true},{ctrlKey:true,metaKey:true},{ctrlKey:true,shiftKey:true},{metaKey:true,shiftKey:true},{isComposing:true},{nativeEvent:{isComposing:true}},{keyCode:229},{nativeEvent:{keyCode:229}},{getModifierState:value=>value==='AltGraph'}])assert.equal(composerEnterGesture(key(patch)),null);
});
test('an uncertain matching payload cannot switch delivery intent',()=>{
  assert.equal(deliveryConflicts(null,'steer',true),false);
  assert.equal(deliveryConflicts('queue','steer',true),true);
  assert.equal(deliveryConflicts('steer','queue',true),true);
  assert.equal(deliveryConflicts('queue','queue',true),false);
  assert.equal(deliveryConflicts('prompt','queue',false),false);
  assert.equal(deliveryConflicts('prompt','queue',true),true);
  const chat=read('chat.js');
  assert.match(chat,/pendingKind&&gesture==='accelerated'&&deliveryConflicts/);
  assert.match(chat,/client.sendDraft\(pendingKind\?'retry':mode\)/);
  assert.match(chat,/pendingKind&&!sending\?t\('acp.pendingSubmissionNotice'\)/);
});
test('queue 0/1/N layout defaults to collapsed multi-row; action keeps it expanded',()=>{
  assert.equal(queuePresentation(0).visible,false);
  assert.deepEqual(queuePresentation(1),{visible:true,header:false,expanded:false,listVisible:true});
  assert.equal(queuePresentation(3).listVisible,false);
  assert.equal(queuePresentation(3,false).listVisible,true);
  assert.equal(queuePresentation(3,true,'request').expanded,true);
});
test('queue preserves exact occurrence order and never mutates server snapshots',()=>{
  const a=Object.freeze({requestId:'a',text:'\n original \n',textTruncated:true}),b=Object.freeze({requestId:'b',text:'same'});
  const list=Object.freeze([a,b,a,null,{}]);
  assert.deepEqual(queueRows(list),[a,b]);assert.equal(queueRows(list)[0],a);
  assert.deepEqual(queueRows(null),[]);
});
test('attachment metadata cannot become an external or remote file image URL',()=>{
  const info=queueAttachment({type:'image',name:'image.png',size:1024,url:'https://evil.test/x',remotePath:'/secret',data:'abc'});
  assert.deepEqual(info,{name:'image.png',image:true,size:'1.0 KiB'});
  assert.equal(queueAttachment({name:'x',size:NaN}).size,'');
  assert.equal(queueAttachment({remotePath:'/a/b.txt',bytes:2}).name,'b.txt');
  assert.doesNotMatch(read('native-queue-view.js'),/h\('img'|dangerouslySetInnerHTML|createObjectURL/);
});
test('queue Remove is exact-target and pessimistic; no unsupported edit or steer-all',()=>{
  const view=read('native-queue-view.js'),chat=read('chat.js');
  assert.match(chat,/client.action\('acpRemoveQueued',\{targetRequestId\}\)/);
  assert.match(view,/await onRemove\(requestId\)/);
  assert.match(view,/inFlight.current=true/);
  assert.match(view,/setError\(t\('acp.queueRemoveFailed'\)\)/);
  assert.match(view,/disabled:disabled\|\|!!busy/);
  assert.doesNotMatch(view,/setItems|\.splice\(|acpSteer|steerQueue|InlineEditor|useProjection|useSession/);
  assert.match(chat,/items:state.queuedMessages,disabled:inputUnavailable/);
});
test('public Host settings hook and separate native queue dock share composer geometry',async()=>{
  const index=read('index.js'),chat=read('chat.js'),css=read('native-queue-view.css');
  assert.match(index,/conversationPreferences:ctx.configForms.get\('ui-conversation'\)/);
  assert.match(index,/useConversationPreferences\(snapshot=>snapshot.value\)/);
  assert.match(index,/busyEnter:conversationPreferences\?\.busyEnter/);
  assert.match(index,/queueCss/);
  assert.ok(chat.indexOf('h(NativeQueueView')<chat.indexOf('h(NativeComposerView'));
  assert.match(css,/max-height: 180px/);assert.match(css,/min-height: 36px/);
  assert.match(css,/width: 28px; height: 28px/);assert.match(css,/border-bottom: none/);
  assert.match(css,/--dsh-composer-stack-gap: 6px/);
  assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
  for(const name of ['chat.js','index.js','native-queue-view.js','native-queue-model.js','composer-delivery-model.js'])parse(read(name),{ecmaVersion:'latest',sourceType:'module'});
});
test('new visible UI strings have both translations',()=>{
  for(const key of ['queue','queueMessages','queueRemove','queueRemoving','queueRemoveFailed','queueTruncated','queueImageMetadata','retrySubmission','pendingSubmissionNotice','deliveryLocked'])for(const locale of [zh,en])assert.ok(locale['acp.'+key]);
});
