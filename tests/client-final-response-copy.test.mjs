import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completedResponseCopyKeys,responseCopyParts} from '../src/client/stream-view-model.js';
import {initialState,reduceEvent,replay} from '../src/client/events.js';
import {transcriptScope} from '../src/client/transcript-model.js';
const scope=(session='s',turn='one')=>JSON.stringify([session,turn]);
const event=(seq,type,extra={})=>({generation:'g',seq,type,sessionId:'s',turnId:'one',...extra});
const events=[event(1,'turn_start'),event(2,'text',{text:'Let me check.'}),event(3,'tool_call',{toolCallId:'tool',kind:'read',status:'completed'}),event(4,'text',{text:'Final '}),event(5,'text',{text:'answer.'}),event(6,'stop',{stopReason:'end_turn'})];
const keys=state=>[...completedResponseCopyKeys(state.items,state.turns)];
const message=(key,seq,extra={})=>({type:'assistant',key,seq,lastSeq:seq,sessionId:'s',turnId:'one',text:key,...extra});

test('no intermediate or streaming message has copy; completion enables only the final response',()=>{
  let state=initialState();
  for(const value of events.slice(0,-1)){state=reduceEvent(state,value);assert.deepEqual(keys(state),[]);}
  state=reduceEvent(state,events.at(-1));
  assert.deepEqual(keys(state),['g:4']);
  assert.equal(state.items.find(item=>item.key==='g:4').text,'Final answer.');
  assert.equal(state.items.find(item=>item.key==='g:2').text,'Let me check.');
});

test('each completed turn keeps its own final copy while the next turn runs, including history replay',()=>{
  const next=[...events,event(7,'turn_start',{turnId:'two'}),event(8,'text',{turnId:'two',text:'Working...'})];
  const live=next.reduce(reduceEvent,initialState()),history=replay(next);
  assert.deepEqual(keys(live),['g:4']);assert.deepEqual(keys(history),keys(live));
  const finished=reduceEvent(live,event(9,'stop',{turnId:'two',stopReason:'completed'}));
  assert.deepEqual(keys(finished),['g:4','g:8']);
  assert.deepEqual(keys(replay([...next,event(9,'stop',{turnId:'two',stopReason:'completed'})])),keys(finished));
});

test('cancelled, failed, interrupted, disconnected or unknown outcomes never masquerade as completion',()=>{
  const item=message('reply',3);
  for(const status of ['running','cancelled','failed','interrupted','detached','unknown',undefined]){
    assert.deepEqual([...completedResponseCopyKeys([item],{[scope()]:{status,endSeq:4}})],[]);
  }
  assert.deepEqual([...completedResponseCopyKeys([item],{})],[]);
  assert.deepEqual([...completedResponseCopyKeys([item],{[scope()]:{status:'completed'}})],[]);
  const state=events.slice(0,-1).reduce(reduceEvent,initialState());
  assert.deepEqual(keys({...state,connected:false,running:false}),[]);
});

test('selection is global per session/turn, not per nested disclosure, and respects confirmed end sequence',()=>{
  const items=[message('first',2),message('nested',4,{parentToolCallId:'a'}),message('final',5,{parentToolCallId:'b'}),
    message('child-final',7,{sessionId:'child'}),message('late-invalid',10),message('blank',5,{text:' \n'})];
  const turns={[scope()]:{status:'completed',endSeq:6},[scope('child')]:{status:'completed',endSeq:8}};
  assert.deepEqual([...completedResponseCopyKeys(items,turns)],['final','child-final']);
  assert.deepEqual([...completedResponseCopyKeys(items.toReversed(),turns)].sort(),['child-final','final']);
});

test('assistant renderer omits intermediate action containers and copies only final message text',()=>{
  const source=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  assert.match(source,/copyableResponses=completedResponseCopyKeys\(items,turns\)/);
  const assistant=source.split("case 'assistant': {")[1].split("case 'thought':")[0].replace(/}\s*$/,'');
  const h=(type,props,...children)=>({type,props:{...props,...(children.length?{children}:{})}});
  const state=events.reduce(reduceEvent,initialState()),copyableResponses=completedResponseCopyKeys(state.items,state.turns);
  const dependencies={h,turns:state.turns,running:false,activeScope:null,copyableResponses,copyLabels:{},labels:{markdown:{}},fallback:null,id:'id',t:key=>key,
    transcriptScope,responseCopyParts,NativeAssistantMessage:'Assistant',NativeMessageActions:'Actions',NativeMessageCopy:'Copy',ui:{MarkdownText:'Markdown'}};
  const render=new Function('item','entry',...Object.keys(dependencies),assistant);
  const draw=item=>render(item,{},...Object.values(dependencies));
  assert.equal(draw(state.items.find(item=>item.key==='g:2')).props.actions,null);
  const final=draw(state.items.find(item=>item.key==='g:4'));
  assert.equal(final.props.actions.type,'Actions');
  assert.equal(final.props.actions.props.children[0].props.text,'Final answer.');
  assert.doesNotMatch(final.props.actions.props.children[0].props.text,/Let me check/);
  const user=source.split("case 'user':")[1].split("case 'assistant':")[0];
  assert.match(user,/h\(NativeMessageCopy,\{text:item.text/);
});
