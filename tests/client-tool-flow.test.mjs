import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {acpItemId,acpItemParent,acpBuildChildMap,acpChildrenFor,acpQuestionAnswersValid} from '../src/client/presentation.js';
import {initialState,reduceEvent} from '../src/client/events.js';
import {toolFlowModel,rawDetailEntries,fullPayloadText,processRowSummary} from '../src/client/tool-model.js';
const tool=(sid,id,parent,extra={})=>({type:'tool',key:`event:${sid}:${id}`,tool:{sessionId:sid,toolCallId:id,parentToolCallId:parent,...extra}});
const child=(type,key,sid,parent,extra={})=>({type,key,sessionId:sid,parentToolCallId:parent,...extra});
const event=(seq,patch)=>({seq,generation:'g',sessionId:'root',...patch});

test('tool IDs and parent references use JSON-scoped identities, even with delimiter characters',()=>{
  const a=tool('a|b','call"'),b=tool('a','b|call"');
  assert.notEqual(acpItemId(a),acpItemId(b));
  assert.equal(acpItemId(a),JSON.stringify(['a|b','call"']));
  assert.equal(acpItemParent(child('thought','t','child','p')),JSON.stringify(['child','p']));
});
test('assistant, thought, state, plan and message share the real explicit parent topology',()=>{
  const parent=tool('root','p');
  const children=['assistant','thought','state','plan','session_message','native_event','user'].map((type,i)=>child(type,`g:${i}`,'root','p'));
  const built=acpBuildChildMap([parent,...children]);
  assert.deepEqual(acpChildrenFor(parent,built.map,[]),children);
  assert.equal(children.filter(item=>!built.parents[acpItemId(item)]).length,0);
  assert.equal(built.parents[acpItemId(parent)],undefined);
});
test('the same toolCallId across root and child sessions never collides',()=>{
  const root=tool('root','same'),nested=tool('child','same');
  const text=child('assistant','text','child','same');
  const built=acpBuildChildMap([root,nested,text]);
  assert.deepEqual(built.map[acpItemId(nested)],[text]);
  assert.equal(built.map[acpItemId(root)],undefined);
});
test('explicit parentSessionId and recorded rootSessionId can resolve cross-session parents',()=>{
  const parent=tool('root','p');
  const explicit=child('thought','a','child','p',{parentSessionId:'root'});
  const rootReference=child('assistant','b','child','p',{rootSessionId:'root'});
  const missing=child('assistant','c','child','p');
  const built=acpBuildChildMap([parent,explicit,rootReference,missing]);
  assert.equal(built.parents[acpItemId(explicit)],acpItemId(parent));
  assert.equal(built.parents[acpItemId(rootReference)],acpItemId(parent));
  assert.equal(built.parents[acpItemId(missing)],undefined);
  assert.equal(built.fallbacks[acpItemId(missing)].reason,'missing-parent');
});
test('real declared unique subagent sessions own child text, thoughts, tools and state',()=>{
  const owner=tool('root','launch',null,{subagent:{sessionId:'child',title:'Exact title'}});
  const children=[child('assistant','a','child',null,{rootSessionId:'root'}),child('thought','b','child',null,{rootSessionId:'root'}),tool('child','read'),child('state','c','child')];
  const built=acpBuildChildMap([owner,...children]);
  assert.deepEqual(built.map[acpItemId(owner)],children);
});
test('subagent events with actual child-session evidence own its events, not themselves',()=>{
  const owner={type:'subagent',key:'g:1',_key:'task',subagent:{sessionId:'child',rootSessionId:'root'}};
  const text=child('assistant','g:2','child',null,{rootSessionId:'root'});
  const built=acpBuildChildMap([owner,text]);
  assert.equal(built.parents[acpItemId(owner)],undefined);
  assert.equal(built.parents[acpItemId(text)],acpItemId(owner));
});
test('decorated root task session does not swallow unrelated root messages',()=>{
  const owner={type:'subagent',key:'g:1',_key:'task',subagent:{sessionId:'root',taskId:'task'}};
  const text=child('assistant','g:2','root');
  const built=acpBuildChildMap([owner,text]);
  assert.equal(built.parents[acpItemId(text)],undefined);
});
test('no inferred agent owner from keywords, and ambiguous declared sessions retain source fallback',()=>{
  const text=child('assistant','a','child',null,{rootSessionId:'root'});
  const guessed=tool('root','guess',null,{name:'Task child agent',rawInput:{description:'child'}});
  let built=acpBuildChildMap([guessed,text]);
  assert.equal(built.parents[acpItemId(text)],undefined);
  assert.equal(built.fallbacks[acpItemId(text)].reason,'unassigned-session');
  const a=tool('root','a',null,{subagent:{sessionId:'child'}}),b=tool('root','b',null,{subagent:{sessionId:'child'}});
  built=acpBuildChildMap([a,b,text]);
  assert.equal(built.parents[acpItemId(text)],undefined);
  assert.equal(built.fallbacks[acpItemId(text)].reason,'ambiguous');
});
test('missing, duplicate and cyclic parents remain root-visible without recursion',()=>{
  const a=tool('root','a','b'),b=tool('root','b','a'),self=tool('root','self','self');
  const missing=child('thought','m','root','missing');
  const built=acpBuildChildMap([a,b,self,missing]);
  for(const item of [a,b,self,missing])assert.equal(built.parents[acpItemId(item)],undefined);
  assert.equal(built.fallbacks[acpItemId(a)].reason,'cycle');
  assert.equal(built.fallbacks[acpItemId(b)].reason,'cycle');
  assert.equal(acpChildrenFor(a,built.map,[acpItemId(b)]).length,0);
  const d1=tool('root','dup'),d2={...d1,key:'different'},text=child('assistant','text','root','dup');
  const duplicate=acpBuildChildMap([d1,d2,text]);
  assert.equal(duplicate.parents[acpItemId(text)],undefined);assert.equal(duplicate.fallbacks[acpItemId(text)].reason,'ambiguous');
});
test('projection preserves every item once and never mutates payloads',()=>{
  const parent=tool('root','p'),nested=tool('root','n','p'),text=child('assistant','a','root','n'),missing=child('thought','b','child','unknown',{rootSessionId:'root'});
  const items=[parent,nested,text,missing],before=JSON.stringify(items),built=acpBuildChildMap(items);
  const visible=[];
  const visit=item=>{visible.push(item);acpChildrenFor(item,built.map,[]).forEach(visit);};
  items.filter(item=>!built.parents[acpItemId(item)]).forEach(visit);
  assert.equal(new Set(visible).size,items.length);assert.equal(visible.length,items.length);assert.equal(JSON.stringify(items),before);
});
test('long child chains build without recursive traversal or parent loss',()=>{
  const items=Array.from({length:5000},(_,i)=>tool('root',String(i),i?String(i-1):undefined));
  const built=acpBuildChildMap(items);
  assert.equal(Object.keys(built.parents).length,4999);
  assert.equal(Object.keys(built.fallbacks).length,0);
});
test('real reducer partial streaming keeps scoped row keys and parent data stable',()=>{
  let state=reduceEvent(initialState(),event(1,{type:'tool_call',toolCallId:'p',title:'Run'}));
  state=reduceEvent(state,event(2,{type:'thought',parentToolCallId:'p',text:'one'}));
  const rowId=acpItemId(state.items[1]);
  state=reduceEvent(state,event(3,{type:'thought',parentToolCallId:'p',text:' two'}));
  state=reduceEvent(state,event(4,{type:'tool_call_update',toolCallId:'p',status:'completed'}));
  const built=acpBuildChildMap(state.items);
  assert.equal(acpItemId(state.items[1]),rowId);assert.equal(built.parents[rowId],acpItemId(state.items[0]));
});
test('structured main tool bodies are mutually exclusive and retain existing result fields',()=>{
  assert.equal(toolFlowModel({kind:'read',output:'a\nb'}).body,'read');
  assert.equal(toolFlowModel({kind:'execute',rawInput:{command:'pwd'},output:'/remote',exitStatus:0}).body,'terminal');
  const mixed=toolFlowModel({kind:'read',diffs:[{path:'a',newText:'x'}],terminals:[{output:'y'}],output:'z'});
  assert.equal(mixed.body,'diff');
  assert.equal(toolFlowModel({name:'contains read words',output:'text'}).body,'generic');
  const terminal=toolFlowModel({terminals:[{command:'echo',cwd:'/remote',output:'hi',exitStatus:3}]});
  assert.equal(terminal.failed,true);assert.equal(terminal.exit.exitCode,3);assert.equal(terminal.command,'echo');assert.equal(terminal.output,'hi');
});
test('running, failure and terminal status come from actual payload, not success guesses',()=>{
  assert.equal(toolFlowModel({status:'in_progress'}).running,true);
  assert.equal(toolFlowModel({status:'failed',output:'Error\ndetails'}).error,'Error');
  assert.equal(toolFlowModel({kind:'execute',output:'unknown'}).exit.exitCode,undefined);
  assert.equal(toolFlowModel({status:'completed'}).failed,false);
});
test('compact process summaries omit ordinary text but always retain explicit failure details',()=>{
  assert.equal(processRowSummary('ordinary\nbody',undefined,false,''),'ordinary');
  assert.equal(processRowSummary('ordinary',true,false,''),'ordinary');
  assert.equal(processRowSummary('ordinary',false,false,''),undefined);
  assert.equal(processRowSummary('ordinary',false,true,'Permission denied\nmore'),'Permission denied');
  assert.equal(processRowSummary('ordinary',false,true,''),undefined);
  const failed=toolFlowModel({status:'failed',output:'Tool failure\nfull detail'});
  assert.equal(processRowSummary(failed.summary,false,failed.failed,failed.error),'Tool failure');
});
test('unified raw details retain full unknown native objects and all supplied fields',()=>{
  const native={type:'unrecognized',unknown:{retained:'x'.repeat(8000)}};
  const payload={native,nativeMeta:{a:1},rawInput:{x:1},rawOutput:{y:2},content:[{type:'future',data:[1,2]}]};
  const raw=rawDetailEntries(payload);
  assert.equal(raw.find(entry=>entry.key==='native').value,native);
  assert.ok(fullPayloadText(native).includes('x'.repeat(8000)));
  assert.deepEqual(raw.map(entry=>entry.key),['rawInput','rawOutput','native','nativeMeta','content']);
  assert.deepEqual(rawDetailEntries({}),[]);
});
test('owned disclosure bodies are lazy, keys stable, native details unified and HITL contracts preserved',()=>{
  const cards=readFileSync(new URL('../src/client/cards.js',import.meta.url),'utf8');
  const disclosure=readFileSync(new URL('../src/client/disclosure.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/client/tool-stream.css',import.meta.url),'utf8');
  for(const source of [cards,disclosure])parse(source,{ecmaVersion:'latest',sourceType:'module'});
  assert.match(disclosure,/open\|\|mounted\?\(typeof children==='function'\?children\(\):children\):null/);
  assert.match(disclosure,/'aria-expanded':open,'aria-controls':id/);
  assert.match(disclosure,/const open=controlledOpen===undefined\?localOpen:controlledOpen/);
  assert.match(disclosure,/if\(controlledOpen===undefined\)setOpen\(next\)/);
  assert.match(disclosure,/if\(onOpenChange\)onOpenChange\(next\)/);
  assert.match(cards,/props\.t\('acp.rawDetails'\)/);
  assert.match(cards,/t\('acp.sourceFallback'\)/);
  assert.match(cards,/h\('details',\{className:'rssh-flow-raw'/);
  assert.doesNotMatch(cards,/acpNextKey|newKey|ra-acp-tool-head|ra-acp-tool-body/);
  assert.match(cards,/props\.onAnswer\(request, \{ action: "accept", content: answers \}\)/);
  assert.match(cards,/props\.onAnswer\(permission, optionId\)/);
  assert.match(cards,/props\.onDismiss\(permission\)/);
  assert.match(cards,/role: "group", "aria-label": t\("acp.permissionTitle"\)/);
  assert.doesNotMatch(cards,/role: "alertdialog"|aria-modal|showModal|focusTrap/);
  assert.match(cards,/summary=processRowSummary\(header\.summary,props\.showProcessSummary,model\.failed,model\.error\)/);
  assert.match(cards,/toolHeaderPresentation\(\{\.\.\.model,rawInput:tool\.rawInput\},\{subagent:!!sub\}\)/);
  assert.match(cards,/compact\?model\.title:header\.labelKey\?t\(header\.labelKey\):header\.title/);
  assert.match(cards,/summary:processRowSummary\(sub\.description\|\|summary,props\.showProcessSummary,failed/);
  assert.match(css,/min-height: calc\(24px \+ var\(--dsh-content-font-delta/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/rssh-flow-toggle:focus-visible/);
  assert.equal(acpQuestionAnswersValid({properties:{ok:{type:'boolean'}},required:['ok']},{ok:false}),true);
});
