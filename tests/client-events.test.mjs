import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applySnapshot, reduceEvent, replay } from '../src/client/events.js';
import { acpQuestionField, acpQuestionAnswersValid } from '../src/client/presentation.js';
const event = (seq, patch) => ({ generation: 'g1', seq, sessionId: 'root', ...patch });

test('root, child, message and turn identities cannot concatenate', () => {
  let state = initialState();
  for (const value of [event(1,{type:'text',text:'a',turnId:'one'}),event(2,{type:'text',text:'b',turnId:'one'}),event(3,{type:'text',text:'child',sessionId:'child',rootSessionId:'root',turnId:'one'}),event(4,{type:'text',text:'next',turnId:'two'})]) state=reduceEvent(state,value);
  assert.deepEqual(state.items.map(item=>item.text),['ab','child','next']);
  state=reduceEvent(state,event(5,{type:'text',text:'complete',turnId:'two',append:false}));
  assert.equal(state.items.at(-1).text,'complete');
});
test('duplicate delivery and generation replacement have one authoritative cursor', () => {
  const first=reduceEvent(initialState(),event(1,{type:'text',text:'one'}));
  assert.equal(reduceEvent(first,event(1,{type:'text',text:'duplicate'})),first);
  const replaced=reduceEvent(first,{...event(1,{type:'text',text:'new'}),generation:'g2'});
  assert.deepEqual(replaced.items.map(item=>item.text),['new']);assert.equal(replaced.cursor.generation,'g2');
});
test('partial tool updates preserve parent relationships and isolate child tool ids', () => {
  let state=reduceEvent(initialState(),event(1,{type:'tool_call',toolCallId:'call',parentToolCallId:'parent',title:'Read'}));
  state=reduceEvent(state,event(2,{type:'tool_call_update',toolCallId:'call',status:'completed'}));
  assert.equal(state.items[0].tool.parentToolCallId,'parent');assert.equal(state.items[0].tool.title,'Read');
  state=reduceEvent(state,event(3,{type:'tool_call',toolCallId:'call',sessionId:'child',title:'Other'}));assert.equal(state.items.length,2);
});
test('queued user messages update in place on actual turn start', () => {
  let state=reduceEvent(initialState(),event(1,{type:'user_message',requestId:'r',text:'work',delivery:'queued'}));
  state=reduceEvent(state,event(2,{type:'turn_start',requestId:'r',turnId:'t'}));
  assert.equal(state.items.length,1);assert.equal(state.items[0].delivery,'accepted');
  state=reduceEvent(state,event(3,{type:'user_message',requestId:'r',text:'work',delivery:'accepted'}));assert.equal(state.items.length,1);
});
test('a child state or a completed queued turn cannot idle the root incorrectly', () => {
  let state={...initialState(),running:true};
  state=reduceEvent(state,event(1,{type:'state',state:'idle',sessionId:'child',rootSessionId:'root'}));assert.equal(state.running,true);
  state=reduceEvent(state,event(2,{type:'stop',stopReason:'end_turn',busy:true,pendingTurns:1}));assert.equal(state.running,true);
  state=reduceEvent(state,event(3,{type:'stop',stopReason:'end_turn',busy:false,pendingTurns:0}));assert.equal(state.running,false);
});
test('approval and form snapshots override stale historical requests', () => {
  const state=replay([event(1,{type:'permission',requestId:'p'}),event(2,{type:'elicitation',requestId:'e'})],{id:'a',busy:true,pendingPermissions:[],pendingElicitations:[]});
  assert.equal(state.running,true);assert.deepEqual(state.permissions,[]);assert.deepEqual(state.elicitations,[]);
});
test('two tasks do not collide through the same decorated root sessionId', () => {
  let state=reduceEvent(initialState(),event(1,{type:'subagent',taskId:'a',title:'A'}));
  state=reduceEvent(state,event(2,{type:'subagent',taskId:'b',title:'B'}));
  state=reduceEvent(state,event(3,{type:'subagent_update',taskId:'a',status:'completed'}));
  assert.equal(state.items.length,2);assert.equal(state.items[0].subagent.title,'A');assert.equal(state.items[0].subagent.status,'completed');
});
test('terminal chunks retain command and exit metadata', () => {
  let state=reduceEvent(initialState(),event(1,{type:'terminal',terminalId:'t',command:'echo',output:'a',exitStatus:0}));
  state=reduceEvent(state,event(2,{type:'terminal',terminalId:'t',chunk:true,output:'b'}));
  assert.equal(state.items[0].output,'ab');assert.equal(state.items[0].command,'echo');assert.equal(state.items[0].exitStatus,0);
});
test('titled native choice forms support omitted type and multi-select anyOf', () => {
  assert.equal(acpQuestionField({oneOf:[{const:'a',title:'A'}]}).type,'string');
  assert.deepEqual(acpQuestionField({type:'array',items:{anyOf:[{const:'a'},{const:'b'}]}}).items.enum,['a','b']);
});
test('forms validate explicit false, numeric bounds and array limits', () => {
  assert.equal(acpQuestionAnswersValid({properties:{ok:{type:'boolean'}},required:['ok']},{ok:false}),true);
  const schema={properties:{n:{type:'integer',minimum:1,maximum:3}},required:['n']};
  for(const values of [{},{n:0},{n:1.2},{n:Infinity}])assert.equal(acpQuestionAnswersValid(schema,values),false);
  assert.equal(acpQuestionAnswersValid(schema,{n:2}),true);
  const choices={properties:{list:{type:'array',minItems:1,maxItems:2,uniqueItems:true,items:{enum:['a','b']}}}};
  for(const list of [[],['x'],['a','a']])assert.equal(acpQuestionAnswersValid(choices,{list}),false);
});

test('inherited requests retain display identity without becoming live queued work',()=>{
 const inherited=(seq,patch)=>event(seq,{inherited:true,sessionId:'fork:inherited:root',...patch});
 let state=initialState();
 for(const value of [inherited(1,{type:'user_message',displayRequestId:'a',delivery:'queued',text:'executed'}),inherited(2,{type:'user_message',displayRequestId:'b',delivery:'queued',text:'cancelled'}),inherited(3,{type:'turn_start',displayRequestId:'a'}),inherited(4,{type:'stop',displayRequestId:'b',submitted:false,stopReason:'cancelled',busy:false})])state=reduceEvent(state,value);
 assert.equal(state.items.find(item=>item.text==='executed').delivery,'accepted');
 assert.equal(state.items.find(item=>item.text==='cancelled'&&item.type==='user').delivery,'cancelled');
 assert.equal(state.running,false);
});
test('request matching is scoped and missing IDs cannot match every user message',()=>{
 let state=reduceEvent(initialState(),event(1,{type:'user_message',requestId:'same',text:'root'}));
 state=reduceEvent(state,event(2,{type:'user_message',requestId:'same',sessionId:'child',text:'child'}));assert.equal(state.items.length,2);
 state=reduceEvent(state,event(3,{type:'user_message',text:'anonymous',delivery:'queued'}));
 state=reduceEvent(state,event(4,{type:'turn_start'}));assert.equal(state.items.at(-1).delivery,'queued');
});

test('notice events keep title/description and compaction aggregates summary chunks',()=>{
  let state=initialState();
  state=reduceEvent(state,{type:'notice',generation:'g',seq:1,sessionId:'root',severity:'warning',title:'Warning',description:'disk low'});
  assert.equal(state.items[0].type,'notice');assert.equal(state.items[0].title,'Warning');assert.equal(state.items[0].description,'disk low');
  state=reduceEvent(state,{type:'compaction',generation:'g',seq:2,sessionId:'root',compactionId:'c1',status:'running'});
  state=reduceEvent(state,{type:'compaction_chunk',generation:'g',seq:3,sessionId:'root',compactionId:'c1',content:{type:'text',text:'summarized '}});
  state=reduceEvent(state,{type:'compaction_chunk',generation:'g',seq:4,sessionId:'root',compactionId:'c1',content:{type:'text',text:'history'}});
  state=reduceEvent(state,{type:'compaction',generation:'g',seq:5,sessionId:'root',compactionId:'c1',status:'completed'});
  const compaction=state.items.filter(item=>item.type==='compaction');
  assert.equal(compaction.length,1);assert.equal(compaction[0].summaryText,'summarized history');assert.equal(compaction[0].status,'completed');
});

test('snapshot restores command roster so a resumed session keeps its slash commands',()=>{
  const base=applySnapshot(initialState(),{id:'acp',commands:[{name:'/help',description:'help'},{name:'/skills',description:'skills'}]});
  assert.equal(base.commands.length,2);assert.equal(base.commands[0].name,'/help');
  const empty=applySnapshot(initialState(),{id:'acp'});assert.deepEqual(empty.commands,[]);
  const replayed=applySnapshot({...initialState(),commands:[{name:'/kept'}]},{id:'acp'});assert.equal(replayed.commands.length,1);
});
