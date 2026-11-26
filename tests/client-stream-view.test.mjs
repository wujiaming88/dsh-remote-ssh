import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {acpItemId} from '../src/client/presentation.js';
import {conversationActivity,responseCopyParts,activeRootScope,actionLabel,processTreeSummary} from '../src/client/stream-view-model.js';
import {toolFlowModel,toolBodyParts,rawDetailEntries} from '../src/client/tool-model.js';
const scope=JSON.stringify(['root','turn']);
const state=patch=>({connected:true,running:true,binding:{sessionId:'root'},turns:{[scope]:{status:'running',startSeq:10}},items:[],permissions:[],elicitations:[],...patch});
const assistant=(sessionId,turnId,text,seq)=>({type:'assistant',key:'a'+seq,sessionId,turnId,text,seq,lastSeq:seq});

test('default response copy is precisely the visible part; whole turn is explicitly separate',()=>{
  const item={text:'Second part'};
  assert.deepEqual(responseCopyParts(item,{responseTail:true,responseText:'First part\n\nSecond part'}),{part:'Second part',turn:'First part\n\nSecond part'});
  assert.deepEqual(responseCopyParts(item,{responseTail:false,responseText:'First part\n\nSecond part'}),{part:'Second part',turn:null});
  assert.deepEqual(responseCopyParts(item,{responseTail:true,responseText:'Second part'}),{part:'Second part',turn:null});
});
test('idle connection does not display a spinner, even with old output or background child activity',()=>{
  assert.equal(conversationActivity(state({running:false,items:[assistant('root','old','Old reply',99)]})).kind,'idle');
  assert.equal(conversationActivity(state({running:false,items:[{type:'subagent',subagent:{state:'running',sessionId:'child'}}]})).kind,'idle');
});
test('connection and structured pending requests take precedence over task progress',()=>{
  assert.equal(conversationActivity(state({connected:false,everConnected:true,permissions:[{}]})).kind,'reconnecting');
  assert.equal(conversationActivity(state({connected:false})).kind,'connecting');
  assert.equal(conversationActivity(state({running:false,permissions:[{}],elicitations:[{}]})).kind,'permission');
  assert.equal(conversationActivity(state({running:false,elicitations:[{}]})).kind,'question');
});
test('plain external authorization prose does not synthesize waiting or approval state',()=>{
  const items=[assistant('root','turn','请授权 https://accounts.example.test/verify?code=DEMO',11)];
  assert.equal(conversationActivity(state({items})).kind,'replying');
  assert.equal(conversationActivity(state({items,running:false})).kind,'idle');
});
test('active root turn never borrows reply status from history or children',()=>{
  const items=[assistant('root','old','Old reply',12),assistant('child','child-turn','Child reply',13)];
  assert.equal(conversationActivity(state({items})).kind,'working');
  assert.equal(conversationActivity(state({items,turns:{}})).kind,'working');
  assert.equal(activeRootScope({[scope]:{status:'running',startSeq:1},'["child","c"]':{status:'running',startSeq:50}},'root'),scope);
});
test('explicit running tool progress wins over interleaved commentary and reflects updates',()=>{
  const a={type:'tool',key:'tool1',tool:{sessionId:'root',turnId:'turn',status:'in_progress',title:'Run tests',seq:20}};
  const b={type:'tool',key:'tool2',tool:{sessionId:'root',turnId:'turn',status:'pending',title:'Read file',seq:19}};
  const result=conversationActivity(state({items:[a,b,assistant('root','turn','Commentary',21)]}));
  assert.equal(result.kind,'activity');assert.equal(result.count,2);assert.equal(result.item,a);
});
test('stopped thoughts and non-text plan updates do not masquerade as active reply generation',()=>{
  const items=[assistant('root','turn','Commentary',11),{type:'plan',sessionId:'root',turnId:'turn',seq:12}];
  assert.equal(conversationActivity(state({items})).kind,'working');
  assert.equal(conversationActivity(state({items:[{type:'thought',sessionId:'root',turnId:'turn',seq:15,streaming:false}]})).kind,'working');
});
test('mixed tool results expose every diff, terminal and distinct text section',()=>{
  const parts=toolBodyParts(toolFlowModel({diffs:[{path:'x',newText:'new'}],terminals:[{output:'first',exitStatus:0},{output:'second',exitStatus:2}],output:'Additional explanation',status:'completed'}));
  assert.deepEqual(parts.map(part=>part.kind),['diff','terminal','terminal','text']);
  assert.equal(parts[1].output,'first');assert.equal(parts[2].output,'second');assert.equal(parts[3].text,'Additional explanation');
  assert.equal(parts[2].exitCode,2);
});
test('a later failing terminal is not silently hidden behind the successful first terminal',()=>{
  const model=toolFlowModel({terminals:[{output:'ok',exitStatus:0},{output:'failure detail',exitStatus:9}],status:'completed'});
  assert.equal(model.failed,true);assert.equal(model.error,'failure detail');
});
test('mixed output de-duplicates only identical supplied terminal text, not distinct text',()=>{
  assert.deepEqual(toolBodyParts(toolFlowModel({terminals:[{output:'same'}],output:'same'})).map(part=>part.kind),['terminal']);
  assert.deepEqual(toolBodyParts(toolFlowModel({terminals:[{output:'same'}],output:'same\nextra'})).map(part=>part.kind),['terminal','text']);
});
test('completed terminals with unknown exit remain unknown rather than spinning or inventing success',()=>{
  const [part]=toolBodyParts(toolFlowModel({terminals:[{output:'result'}],status:'completed'}));
  assert.equal(part.running,false);assert.equal(part.exitCode,undefined);
});
test('diagnostic identity is retained behind the single raw payload entry',()=>{
  const identity=rawDetailEntries({sessionId:'s',turnId:'t',agentId:'a'}).find(entry=>entry.key==='identity');
  assert.deepEqual(identity.value,{agentId:'a',sessionId:'s',turnId:'t'});
});
test('first structured terminal inherits tool exit metadata, without applying it to other terminals',()=>{
  const parts=toolBodyParts(toolFlowModel({status:'completed',exitCode:9,terminals:[{output:'failed'},{output:'unknown'}]}));
  assert.equal(parts[0].exitCode,9);assert.equal(parts[1].exitCode,undefined);assert.equal(parts[1].running,false);
});
test('distinct tool output and content text both remain visible; exact duplicates are rendered once',()=>{
  let parts=toolBodyParts(toolFlowModel({output:'summary',content:[{type:'text',text:'important detail'}]}));
  assert.deepEqual(parts.map(part=>part.text),['summary','important detail']);
  parts=toolBodyParts(toolFlowModel({output:'same',content:[{type:'text',text:'same'}]}));assert.equal(parts.length,1);
});
test('execute metadata remains visible alongside a diff without an explicit terminal array',()=>{
  const parts=toolBodyParts(toolFlowModel({kind:'execute',rawInput:{command:'apply patch'},cwd:'/workspace',exitCode:7,diffs:[{path:'x',newText:'new'}]}));
  assert.deepEqual(parts.map(part=>part.kind),['diff','terminal']);
  assert.equal(parts[1].command,'apply patch');assert.equal(parts[1].cwd,'/workspace');assert.equal(parts[1].exitCode,7);
});
test('settled thinking and plans use neutral labels instead of contradictory active descriptions',()=>{
  const t=key=>key;
  assert.equal(actionLabel({type:'thought'},t,false),'acp.thought');
  assert.equal(actionLabel({type:'plan',entries:[{status:'in_progress',content:'Old step'}]},t,false),'acp.plan');
});
test('group failure summaries include nested failures once and tolerate malformed cycles',()=>{
  const owner={type:'subagent',key:'owner',subagent:{sessionId:'root',turnId:'turn',taskId:'sub',state:'completed'}};
  const child={type:'tool',key:'failed-child',tool:{sessionId:'child',toolCallId:'c',status:'failed'}};
  const map={[acpItemId(owner)]:[child],[acpItemId(child)]:[child]};
  const summary=processTreeSummary({items:[owner],settled:true},map);
  assert.equal(summary.failedCount,1);assert.equal(summary.runningItem,null);
});
test('transcript keeps one process component identity, visible prose and nested rendering policy',()=>{
  const source=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/hidden:responseHidden|policy\.stepGrouping==='history'/);
  assert.match(source,/onRead:/);assert.match(source,/processTreeSummary\(entry,built\.map\)/);
  assert.match(source,/transcriptEntries\(children,\{turns,allItems:items\}\)/);
  assert.match(source,/text:copy\.part/);assert.match(source,/copyTurn/);
  const cards=readFileSync(new URL('../src/client/cards.js',import.meta.url),'utf8');
  assert.match(cards,/props\.renderNested\?props\.renderNested/);
  assert.match(cards,/toolBodyParts\(model\)/);assert.match(cards,/maxLines:20/);
  assert.match(cards,/case 'interaction_receipt'/); // fallback renderer also supports receipts
});
