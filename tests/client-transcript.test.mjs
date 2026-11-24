import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
import {initialState,reduceEvent} from '../src/client/events.js';
import {acpBuildChildMap,acpItemId} from '../src/client/presentation.js';
import {transcriptScope,transcriptPolicy,transcriptEntries,visibleTranscriptItem,
  processGroupOpen,responseHidden,followsTranscriptTail,anchoredScrollTop,mayRestoreTranscriptAnchor} from '../src/client/transcript-model.js';
const item=(type,key,patch={})=>({type,key,sessionId:'root',turnId:'turn',...patch});
const scope=transcriptScope(item('assistant','a'));
const closed={ [scope]:{status:'completed',startSeq:1,endSeq:10,startedAt:100,endedAt:200} };

test('empty text and transient idle state do not create visible message shells',()=>{
  assert.equal(visibleTranscriptItem(item('assistant','a',{text:' \n'})),false);
  assert.equal(visibleTranscriptItem(item('thought','a',{text:''})),false);
  assert.equal(visibleTranscriptItem(item('state','a',{state:'idle'})),false);
  assert.equal(visibleTranscriptItem(item('state','a',{state:'error',error:'failed'})),true);
  assert.equal(visibleTranscriptItem(item('native_event','a',{event:{type:'update',detail:{unknown:true}}})),true);
});
test('one process item still receives the completed-turn fold policy',()=>{
  for(const type of ['thought','tool']){
    const process=type==='tool'?item('tool','tool',{tool:{sessionId:'root',turnId:'turn',toolCallId:'call'}}):item('thought','thought',{text:'reasoning'});
    const entries=transcriptEntries([item('assistant','before',{text:'Before'}),process,item('assistant','after',{text:'After'})],{turns:closed});
    const group=entries.find(entry=>entry.kind==='process');assert.equal(group.items.length,1);assert.equal(group.settled,true);
    assert.equal(processGroupOpen(group,transcriptPolicy({transcriptView:'standard'})),false);
    assert.equal(processGroupOpen(group,transcriptPolicy({transcriptView:'verbose'})),true);
    assert.equal(processGroupOpen(group,transcriptPolicy({transcriptView:'standard'}),true),true);
  }
});
test('accepted native presentation preferences cover all modes without old aliases',()=>{
  assert.equal(transcriptPolicy({transcriptView:'compact'}).showProcessSummary,false);
  assert.equal(transcriptPolicy({transcriptView:'compact'}).showSettledReasoning,false);
  assert.equal(transcriptPolicy({transcriptView:'standard'}).showProcessSummary,true);
  assert.equal(transcriptPolicy({transcriptView:'verbose'}).foldCompleted,false);
  assert.equal(transcriptPolicy({transcriptView:'unknown'}).mode,'detailed');
});
test('next-input collapse recognizes queued input execution by real start/end sequence',()=>{
  const laterScope=transcriptScope(item('user','queued',{turnId:'next'}));
  const items=[item('user','user',{text:'initial'}),item('user','queued',{turnId:'next',delivery:'accepted',text:'next'}),
    item('thought','thought',{text:'thinking'}),item('assistant','after',{text:'Answer'})];
  const policy=transcriptPolicy({transcriptView:'standard',collapseTiming:'next-input'});
  const before=transcriptEntries(items,{turns:closed}).find(entry=>entry.kind==='process');
  assert.equal(processGroupOpen(before,policy),true);
  const after=transcriptEntries(items,{turns:{...closed,[laterScope]:{status:'running',startSeq:11}}}).find(entry=>entry.kind==='process');
  assert.equal(after.laterInput,true);assert.equal(processGroupOpen(after,policy),false);
});
test('interrupted process remains visible and preference changes do not invent success',()=>{
  const entries=transcriptEntries([item('thought','thought',{text:'thinking'})],{turns:{[scope]:{status:'cancelled',endSeq:3}}});
  assert.equal(entries[0].interrupted,true);assert.equal(processGroupOpen(entries[0],transcriptPolicy({transcriptView:'compact'})),true);
});
test('positional final-only preference never hides prose without a reliable final marker',()=>{
  const items=[item('assistant','before',{text:'First response'}),item('thought','thought',{text:'reasoning'}),item('assistant','after',{text:'Final response'})];
  const entries=transcriptEntries(items,{turns:closed}),policy=transcriptPolicy({transcriptView:'standard',foldedReplies:'final'});
  const folds=new Set(entries.filter(entry=>entry.kind==='process'&&!processGroupOpen(entry,policy)).map(entry=>entry.scope));
  assert.equal(responseHidden(entries[0],policy,folds),false);assert.equal(responseHidden(entries.at(-1),policy,folds),false);
  assert.equal(entries.at(-1).responseText,'First response\n\nFinal response');
  const source=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/hidden:responseHidden/);
  assert.match(source,/text:copy\.part/);assert.match(source,/copyTurn/);
});
test('root copying and order never absorb child replies or same-name tool calls',()=>{
  const items=[item('tool','parent',{tool:{toolCallId:'call',sessionId:'root',turnId:'turn'}}),
    item('assistant','root',{text:'Root'}),item('assistant','child',{sessionId:'child',rootSessionId:'root',parentToolCallId:'call',text:'Child'})];
  const tree=acpBuildChildMap(items),top=items.filter(value=>!tree.parents[acpItemId(value)]);
  assert.deepEqual(top.map(value=>value.key),['parent','root']);
  assert.equal(transcriptEntries(top).at(-1).responseText,'Root');assert.equal(tree.map[acpItemId(items[0])][0],items[2]);
});
test('process identity stays stable as real streaming content updates',()=>{
  const before=transcriptEntries([item('thought','g:1',{text:'a'})]);
  const after=transcriptEntries([item('thought','g:1',{text:'a b'}),item('tool','g:3',{tool:{toolCallId:'t',sessionId:'root',turnId:'turn'}})]);
  assert.equal(before[0].key,after[0].key);
});
test('actual turn lifecycle captures seq and supplied timestamps, scoped child stops preserve root busy',()=>{
  let state=initialState();
  state=reduceEvent(state,{type:'turn_start',generation:'g',seq:1,sessionId:'root',turnId:'t',ts:100});
  state=reduceEvent(state,{type:'stop',generation:'g',seq:2,sessionId:'child',rootSessionId:'root',turnId:'child-t',stopReason:'cancelled',busy:false});
  assert.equal(state.running,true);assert.equal(state.items[0].sessionId,'child');assert.equal(state.items[0].turnId,'child-t');
  const child=state.turns[JSON.stringify(['child','child-t'])];assert.equal(child.endedAt,null);assert.equal(child.status,'cancelled');
  state=reduceEvent(state,{type:'stop',generation:'g',seq:3,sessionId:'root',turnId:'t',ts:150,stopReason:'end_turn',busy:false});
  const root=state.turns[JSON.stringify(['root','t'])];assert.equal(root.startedAt,100);assert.equal(root.endedAt,150);assert.equal(root.startSeq,1);assert.equal(root.endSeq,3);
});
test('tail following and prepend restore are driven by the viewport and stable anchor, not new tail height',()=>{
  assert.equal(followsTranscriptTail({scrollHeight:1000,scrollTop:200,clientHeight:400}),false);
  assert.equal(followsTranscriptTail({scrollHeight:1000,scrollTop:590,clientHeight:400}),true);
  assert.equal(anchoredScrollTop({currentTop:200,previousOffset:-10,nextOffset:190}),400);
  const before={startedAtGeneration:4,currentGeneration:4,sameViewport:true,live:true};assert.equal(mayRestoreTranscriptAnchor(before),true);
  for(const patch of [{currentGeneration:5},{sameViewport:false},{live:false}])assert.equal(mayRestoreTranscriptAnchor({...before,...patch}),false);
  const source=readFileSync(new URL('../src/client/transcript-scroll.js',import.meta.url),'utf8');
  assert.match(source,/if\(pendingPrepend.current\)return pendingPrepend.current/);assert.match(source,/data-transcript-anchor/);
  assert.doesNotMatch(source,/scrollIntoView|nextHeight|previousHeight|document\.querySelector/);
});
test('the stream inherits native fonts and column width, with one scrollport and public reasoning reuse',async()=>{
  const css=readFileSync(new URL('../src/client/styles.css',import.meta.url),'utf8');
  const uiCss=readFileSync(new URL('../src/client/ui.css',import.meta.url),'utf8');
  const toolCss=readFileSync(new URL('../src/client/tool-stream.css',import.meta.url),'utf8');
  const chat=readFileSync(new URL('../src/client/chat.js',import.meta.url),'utf8');
  const index=readFileSync(new URL('../src/client/index.js',import.meta.url),'utf8');
  assert.doesNotMatch(css,/46vh|42vh|\.ra-acp-msg\s*\{|\.ra-acp-tool\s*\{|860px/);
  assert.match(css,/var\(--dsh-chat-content-width, 748px\)/);assert.match(uiCss,/var\(--dsh-content-font-size, 14px\)/);
  assert.match(toolCss,/var\(--dsh-content-font-size-secondary,\s*13px\)/);
  assert.match(index,/chatPreferences:ctx.configForms.get\('ui-chat'\)/);
  assert.match(chat,/!hasVisibleContent&&!state.running&&!waiting&&state.connected/);
  assert.equal((chat.match(/ref:scroll.viewportRef/g)||[]).length,1);
  for(const sheet of [css,uiCss,toolCss])assert.equal((await transform(sheet,{loader:'css'})).warnings.length,0);
});
