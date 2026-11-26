import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transcriptPolicy,processGroupPresentation,transcriptEntries} from '../src/client/transcript-model.js';
import {toolFlowModel,toolRowStatus,toolBodyParts,processRowSummary} from '../src/client/tool-model.js';
import {processCategorySummary} from '../src/client/stream-view-model.js';
const policy=(mode,timing='completion')=>transcriptPolicy({transcriptView:mode,collapseTiming:timing});
const live={settled:false,laterInput:false},ended={settled:true,laterInput:false};

test('standard and compact groups start collapsed during execution and history',()=>{
  for(const mode of ['standard','compact'])for(const entry of [live,ended,{...ended,interrupted:true}]){
    assert.deepEqual(processGroupPresentation(entry,policy(mode)),{flat:false,open:false,scrollBody:true});
  }
});
test('detailed respects completion and next-input grouping; verbose never adds a process scrollport',()=>{
  assert.deepEqual(processGroupPresentation(live,policy('detailed')),{flat:true,open:true,scrollBody:false});
  assert.deepEqual(processGroupPresentation(ended,policy('detailed')),{flat:false,open:false,scrollBody:true});
  assert.equal(processGroupPresentation(ended,policy('detailed','next-input')).flat,true);
  assert.equal(processGroupPresentation({...ended,laterInput:true},policy('detailed','next-input')).flat,false);
  for(const entry of [live,ended])assert.deepEqual(processGroupPresentation(entry,policy('verbose'),false),{flat:true,open:true,scrollBody:false});
});
test('manual open survives turn completion; explicit close is respected',()=>{
  for(const entry of [live,ended]){
    assert.equal(processGroupPresentation(entry,policy('standard'),{open:true}).open,true);
    assert.equal(processGroupPresentation(entry,policy('standard'),{open:false}).open,false);
  }
});
test('a reader of flat content is not cropped on completion; close and reopen restores the cap',()=>{
  assert.deepEqual(processGroupPresentation(ended,policy('detailed'),{open:true,readingFlat:true}),{flat:false,open:true,scrollBody:false});
  assert.deepEqual(processGroupPresentation(ended,policy('detailed'),{open:false}),{flat:false,open:false,scrollBody:true});
  assert.deepEqual(processGroupPresentation(ended,policy('detailed'),{open:true}),{flat:false,open:true,scrollBody:true});
});
test('only detailed and verbose show settled thought excerpts',()=>{
  for(const mode of ['compact','standard'])assert.equal(policy(mode).showSettledReasoning,false);
  for(const mode of ['detailed','verbose'])assert.equal(policy(mode).showSettledReasoning,true);
});
test('a supplied action title wins and the full command remains in the tool body',()=>{
  const command='git grep -n RoleName origin/main -- src';
  const model=toolFlowModel({kind:'execute',title:'Search RoleName usage',rawInput:{command},status:'completed'});
  assert.equal(model.title,'Search RoleName usage');assert.equal(model.summary,'');
  assert.equal(toolBodyParts(model)[0].command,command);
  assert.equal(toolRowStatus(model,{status:'completed'}),undefined);
});
test('missing action descriptions fall back to a literal command rather than invented intent',()=>{
  const command='custom-program --opaque-argument';
  assert.equal(toolFlowModel({name:'Bash',rawInput:{command}}).title,command);
  assert.equal(toolFlowModel({title:'   ',name:'Bash',rawInput:{command,description:' '}}).title,command);
  assert.equal(toolFlowModel({name:'Bash',rawInput:{command,description:'Supplied description'}}).title,'Supplied description');
  assert.equal(toolFlowModel({title:command,rawInput:{command,description:'Supplied description'}}).title,'Supplied description');
});
test('short supplied targets can supplement the title, but output and long details stay out of rows',()=>{
  assert.equal(toolFlowModel({title:'Read options',locations:[{path:'src/options.ts'}]}).summary,'src/options.ts');
  for(const extra of [{output:'large result'}, {summary:'x'.repeat(97)}, {rawInput:{command:'large command'}}])assert.equal(toolFlowModel({title:'Action',...extra}).summary,'');
  const model=toolFlowModel({title:'Action',description:'Expanded explanation'});
  assert.equal(model.description,'Expanded explanation');assert.equal(model.summary,'');
});
test('success is quiet but running, pending and failures remain explicit',()=>{
  for(const [status,key] of [['completed',undefined],['in_progress','acp.toolRunning'],['pending','acp.toolRunning'],['unknown','acp.toolPending'],['failed','acp.toolFailed']]){
    assert.equal(toolRowStatus(toolFlowModel({status}),{status}),key);
  }
  const failed=toolFlowModel({status:'completed',exitCode:8,output:'real failure'});
  assert.equal(toolRowStatus(failed,{status:'completed'}),'acp.toolFailed');
  assert.equal(processRowSummary('',false,failed.failed,failed.error),'real failure');
});
test('history summaries count supplied categories, not shell-command semantics or just the last step',()=>{
  const items=[{type:'thought'},...Array.from({length:12},()=>({type:'tool',tool:{kind:'execute',title:'Read file',rawInput:'grep RoleName'}}))];
  const text=processCategorySummary({items},key=>key);
  assert.equal(text,'flow.categoryThought × 1 · flow.categoryExecute × 12');
  assert.doesNotMatch(text,/categoryRead/);
  assert.equal(processCategorySummary({items:[{type:'tool',tool:{kind:'constructor'}}]},key=>key),'flow.categoryTool × 1');
});
test('category summary bounds labels only; full ordered records are never trimmed to latest N',()=>{
  const types=['thought','tool','plan','subagent','terminal_event'];
  const items=Array.from({length:25},(_,i)=>({type:types[i%5],key:String(i),sessionId:'s',turnId:'t',text:'Thought',tool:{sessionId:'s',turnId:'t'},subagent:{sessionId:'s',turnId:'t'}}));
  const entries=transcriptEntries(items);assert.equal(entries.length,1);assert.equal(entries[0].items.length,25);
  assert.match(processCategorySummary(entries[0],key=>key),/\+2 flow.categoryOther/);
});
test('process header omits category counts without hiding live activity or failures',()=>{
  const source=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  const expression=source.split('return entries.map(entry=>{')[1].match(/const summary=([\s\S]*?);\n    const presentation/)?.[1];assert.ok(expression);
  // Evaluate the production summary expression, not a React/DOM renderer.
  const summary=new Function('policy','live','current','facts','t','actionLabel',`return ${expression};`);
  const render=(live,failedCount=0,showProcessSummary=true)=>summary({showProcessSummary},live,{title:'Current operation'},{failedCount},key=>key,item=>item.title);
  assert.equal(render(false),'');assert.equal(render(false,0,false),'');
  assert.equal(render(true),'Current operation');assert.equal(render(true,0,false),'');
  assert.equal(render(false,2),'flow.hadFailures 2');assert.equal(render(true,2),'Current operation · flow.hadFailures 2');
  assert.match(source,/title:t\('flow.process'\),summary/);
  assert.match(source,/children:\(\)=>entry.items.map\(item=>render\(item\)\)/);
});

test('rendering connects mode policy, quiet status, full command details and reading exceptions',()=>{
  const source=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
  const transcript=source('transcript.js'),cards=source('cards.js');
  assert.match(transcript,/transcriptPolicy\(preferences,'standard'\)/);
  assert.match(transcript,/processGroupPresentation\(entry,policy,readingManual\[entry.key\]\)/);
  assert.match(transcript,/\.\.\.presentation/);assert.match(transcript,/readingFlat/);
  assert.doesNotMatch(transcript,/runningItem\|\|entry.items.at\(-1\)/);
  assert.doesNotMatch(transcript,/processCategorySummary/);
  assert.match(transcript,/policy.showProcessSummary&&live\?actionLabel\(current,t\):null/);
  assert.match(cards,/toolRowStatus\(model,tool\)/);
  assert.match(cards,/className:'rssh-flow-command'/);
  assert.match(cards,/text:model.command,labels:/);
});
