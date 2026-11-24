import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reduceEvent,replay} from '../src/client/events.js';
import {transcriptScope,transcriptEntries,transcriptPolicy,processGroupOpen,processGroupSummary,responseHidden} from '../src/client/transcript-model.js';
import {thoughtSummary} from '../src/client/thought-model.js';
const event=(seq,patch)=>({generation:'g',seq,sessionId:'root',turnId:'turn',...patch});
const project=events=>events.reduce(reduceEvent,initialState());
const plans=state=>state.items.filter(item=>item.type==='plan');
const receipts=state=>state.items.filter(item=>item.type==='interaction_receipt');

test('plan snapshots update one stable identity while named plans, parents, sessions and turns remain isolated',()=>{
  const values=[event(1,{type:'plan',entries:[{content:'old',status:'in_progress'}]}),event(2,{type:'plan',entries:[{content:'new',status:'completed'}]}),
    event(3,{type:'plan',planId:'named',content:'named'}),event(4,{type:'plan',parentToolCallId:'child',entries:[]}),
    event(5,{type:'plan',sessionId:'other',entries:[]}),event(6,{type:'plan',turnId:'other',entries:[]})];
  const state=project(values);assert.equal(plans(state).length,5);
  assert.equal(plans(state)[0].key,'g:1');assert.equal(plans(state)[0].lastSeq,2);
  assert.deepEqual(plans(state)[0].entries,[{content:'new',status:'completed'}]);
  const updated=reduceEvent(state,event(7,{type:'plan',planId:'named',path:'plan.md'}));
  assert.equal(plans(updated).length,5);assert.equal(plans(updated)[1].content,'named');assert.equal(plans(updated)[1].path,'plan.md');
});
test('stop settles only its session and turn without rewriting plan entry outcomes',()=>{
  const step={content:'unfinished',status:'in_progress'};
  const state=project([event(1,{type:'plan',entries:[step]}),event(2,{type:'plan',turnId:'next',entries:[step]}),
    event(3,{type:'plan',sessionId:'child',entries:[step]}),event(4,{type:'stop',stopReason:'end_turn'})]);
  assert.equal(plans(state)[0].settled,true);assert.equal(plans(state)[0].settledReason,'stop');assert.deepEqual(plans(state)[0].entries,[step]);
  assert.equal(plans(state)[1].settled,false);assert.equal(plans(state)[2].settled,false);
  assert.equal(processGroupSummary({items:[plans(state)[0]]}).runningItem,null);
  assert.equal(plans(reduceEvent(state,event(5,{type:'plan',entries:[step]})))[0].settled,true);
});
test('session idle settles plans even without a turn ID and preserves completed and pending facts',()=>{
  const entries=[{status:'completed',content:'done'},{status:'in_progress',content:'unknown outcome'}];
  const state=project([event(1,{type:'plan',entries}),event(2,{type:'plan',turnId:'next',entries}),
    event(3,{type:'state',turnId:undefined,state:{state:'idle'}})]);
  for(const item of plans(state)){assert.equal(item.settled,true);assert.equal(item.settledReason,'idle');assert.deepEqual(item.entries,entries);}
});
test('plan removal retires a known snapshot instead of displaying it as active',()=>{
  const state=project([event(1,{type:'plan',planId:'a',entries:[{status:'in_progress'}]}),event(2,{type:'plan_removed',planId:'a'})]);
  assert.equal(plans(state)[0].removed,true);assert.equal(processGroupSummary({items:plans(state)}).runningItem,null);
});
test('subagent wrappers use their factual session and turn for grouping and settled state',()=>{
  const state=project([event(1,{type:'subagent',taskId:'a',status:'running'}),event(2,{type:'stop',stopReason:'end_turn'})]);
  const item=state.items[0],scope=JSON.stringify(['root','turn']);assert.equal(transcriptScope(item),scope);
  const group=transcriptEntries([item],{turns:state.turns})[0];assert.equal(group.scope,scope);assert.equal(group.settled,true);
  assert.equal(processGroupOpen(group,transcriptPolicy({}),true),true);assert.equal(processGroupOpen({...group,interrupted:true},transcriptPolicy({}),false),false);
});
test('permission resolution emits only allowlisted identity and outcome, never approval values or secrets',()=>{
  const state=project([event(1,{type:'permission',requestId:'p',parentToolCallId:'tool',message:'SECRET',options:[{optionId:'secret'}],rawInput:{secret:'SECRET'}}),
    event(2,{type:'permission_resolved',requestId:'p',optionId:'secret',outcome:'selected',content:'SECRET',answer:{password:'SECRET'}})]);
  assert.deepEqual(state.permissions,[]);
  assert.deepEqual(receipts(state)[0],{type:'interaction_receipt',interaction:'permission',outcome:'resolved',sessionId:'root',turnId:'turn',requestId:'p',parentToolCallId:'tool',decision:'resolved',key:'receipt:["permission","root","turn","p","tool"]',seq:2,lastSeq:2});
  assert.doesNotMatch(JSON.stringify(receipts(state)),/SECRET|optionId|password|message|rawInput/);
});
test('question receipt retains no answer or schema, and explicit cancellation is not approval',()=>{
  for(const [type,extra,outcome] of [['elicitation_resolved',{action:'accept'},'resolved'],['elicitation_resolved',{action:'decline'},'resolved'],['elicitation_resolved',{action:'cancel'},'cancelled'],['elicitation_cancelled',{},'cancelled']]){
    const state=project([event(1,{type:'elicitation',requestId:'q',message:'SECRET',schema:{default:'SECRET'}}),event(2,{type,requestId:'q',content:{token:'SECRET'},...extra})]);
    assert.equal(state.elicitations.length,0);assert.equal(receipts(state)[0].interaction,'question');assert.equal(receipts(state)[0].outcome,outcome);assert.doesNotMatch(JSON.stringify(receipts(state)),/SECRET|content|schema/);
  }
  assert.equal(receipts(project([event(1,{type:'permission',requestId:'p'}),event(2,{type:'permission_resolved',requestId:'p',outcome:'cancelled'})]))[0].outcome,'cancelled');
});
test('receipt decisions derive only from explicit actions and known pending option kinds',()=>{
  for(const [kind,decision] of [['allow_once','allowed'],['allow_always','allowed'],['reject_once','denied'],['reject_always','denied'],['SECRET','resolved']]){
    const state=project([event(1,{type:'permission',requestId:'p',options:[{optionId:'PRIVATE',kind,label:'SECRET'}]}),event(2,{type:'permission_resolved',requestId:'p',outcome:'selected',optionId:'PRIVATE'})]);
    assert.equal(receipts(state)[0].decision,decision);assert.doesNotMatch(JSON.stringify(receipts(state)),/PRIVATE|SECRET/);
    assert.equal(receipts(reduceEvent(state,event(3,{type:'permission_resolved',requestId:'p',outcome:'selected',optionId:'PRIVATE'})))[0].decision,decision);
  }
  for(const [action,decision] of [['accept','answered'],['decline','declined'],['cancel','cancelled'],['SECRET','resolved']]){
    assert.equal(receipts(project([event(1,{type:'elicitation_resolved',requestId:'q',action})]))[0].decision,decision);
  }
});
test('bulk cancellation emits one identity-only receipt per pending interaction',()=>{
  const state=project([event(1,{type:'permission',requestId:'a'}),event(2,{type:'permission',requestId:'b',turnId:'other'}),event(3,{type:'permission_cancelled',count:2})]);
  assert.equal(state.permissions.length,0);assert.deepEqual(receipts(state).map(item=>[item.requestId,item.turnId,item.outcome]),[['a','turn','cancelled'],['b','other','cancelled']]);
  const empty=reduceEvent(state,event(4,{type:'permission_cancelled',count:0}));assert.equal(receipts(empty).length,2);
});
test('terminal events with no historical request still create a factual generic receipt',()=>{
  const state=project([event(1,{type:'elicitation_resolved',requestId:'q',action:'accept',answer:'SECRET'})]);
  assert.equal(receipts(state).length,1);assert.equal(receipts(state)[0].outcome,'resolved');assert.doesNotMatch(JSON.stringify(receipts(state)),/SECRET/);
});
test('duplicate delivery, repeated resolution and replay keep one receipt with its original parent identity',()=>{
  const values=[event(1,{type:'permission',requestId:'p',parentToolCallId:'tool'}),event(2,{type:'permission_resolved',requestId:'p',outcome:'selected'}),event(3,{type:'permission_resolved',requestId:'p',outcome:'selected'})];
  const state=project(values);assert.equal(receipts(state).length,1);assert.equal(receipts(state)[0].parentToolCallId,'tool');
  assert.equal(reduceEvent(state,values.at(-1)),state);
  assert.deepEqual(receipts(replay([...values,...values],{pendingPermissions:[],pendingElicitations:[]})),receipts(state));
});
test('colliding request IDs from snapshot are resolved only within an explicit matching scope',()=>{
  let state={...initialState(),permissions:[event(1,{requestId:'same',sessionId:'a'}),event(2,{requestId:'same',sessionId:'b'})]};
  state=reduceEvent(state,event(3,{type:'permission_resolved',requestId:'same',sessionId:'a'}));
  assert.equal(state.permissions.length,1);assert.equal(state.permissions[0].sessionId,'b');assert.equal(receipts(state)[0].sessionId,'a');
});
test('group summary counts failure facts after completion and chooses the latest active item by event sequence',()=>{
  const failed={type:'tool',tool:{title:'command',seq:2,status:'completed',exitCode:1}};
  const tool={type:'tool',tool:{title:'read',seq:10,status:'in_progress'}};
  const plan={type:'plan',seq:8,entries:[{status:'in_progress',content:'checking'}]};
  const sub={type:'subagent',subagent:{seq:9,state:{state:'running'},title:'worker'}};
  const entry={items:[failed,tool,plan,sub]};assert.deepEqual(processGroupSummary(entry),{runningItem:tool,failedCount:1,count:4});
  assert.deepEqual(processGroupSummary({...entry,settled:true}),{runningItem:null,failedCount:1,count:4});
  assert.deepEqual(processGroupSummary({items:[]}),{runningItem:null,failedCount:0,count:0});
  assert.equal(processGroupSummary({items:[{type:'tool',tool:{content:[{type:'terminal',exitStatus:{exitCode:2}}]}}]}).failedCount,1);
  assert.equal(processGroupSummary({items:[{type:'thought',streaming:true}, {type:'tool',tool:{status:'completed'}}]}).runningItem,null);
});
test('positional response tail never hides earlier assistant content',()=>{
  const entry={kind:'item',scope:'s',item:{type:'assistant',text:'Please use this authorization link'},responseTail:false};
  assert.equal(responseHidden(entry,transcriptPolicy({foldedReplies:'final'}),new Set(['s'])),false);
});
test('thought completion preserves the latest stable paragraph summary',()=>{
  for(const value of ['First\n\nSecond\nmore','First\n\nSecond\n\nThird unfinished','One\r\n\r\n**Two**\r\nbody']){
    assert.equal(thoughtSummary(value,false),thoughtSummary(value,true));
  }
  assert.equal(thoughtSummary('First\n\nSecond\nbody',false),'Second');
  assert.equal(thoughtSummary('Single unfinished line',true),'');assert.equal(thoughtSummary('Single unfinished line',false),'Single unfinished line');
});
