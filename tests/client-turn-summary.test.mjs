import test from 'node:test';
import assert from 'node:assert/strict';
import {transcriptEntries,transcriptPolicy,processGroupPresentation} from '../src/client/transcript-model.js';
import {settledTurnSummaries,settledTurnPresentation,turnSummaryText,processFocusProtection} from '../src/client/turn-summary-model.js';

const scope=(session='root',turn='turn')=>JSON.stringify([session,turn]);
const processKey=(session='root',turn='turn')=>`process:${scope(session,turn)}`;
const item=(type,key,patch={})=>({type,key,sessionId:'root',turnId:'turn',text:key,seq:1,...patch});
const completed={status:'completed',startedAt:1000,endedAt:493999,endSeq:7};
const turns={[scope()]:completed};
const policy=transcriptPolicy({transcriptView:'standard'});
const sampleItems=()=>[
  item('user','user'),item('assistant','opening'),item('thought','first'),
  item('assistant','middle'),item('thought','second'),item('assistant','answer'),
].map((entry,index)=>({...entry,seq:index+1}));
const sample=()=>transcriptEntries(sampleItems(),{turns});

function presentation(entries=sample(),manual={},choice=undefined,focused=false,view=policy) {
  const summary=settledTurnSummaries(entries,turns,'root').get(scope());
  return settledTurnPresentation(summary,entries,view,manual,choice,focused);
}

function freeze(value) {
  if(value&&typeof value==='object'){
    Object.freeze(value);
    for(const child of Object.values(value))freeze(child);
  }
  return value;
}

test('one completed turn has one summary and process containing all intermediate prose, with only its final outside',()=>{
  const items=sampleItems(),originalItems=structuredClone(items);
  freeze(items);
  const entries=transcriptEntries(items,{turns}),before=structuredClone(entries);
  freeze(entries);
  const result=settledTurnSummaries(entries,turns,'root');
  assert.equal(result.size,1);
  assert.deepEqual(result.get(scope()),{scope:scope(),ownerKey:processKey(),afterOwner:false,
    processKeys:[processKey()],status:'completed',seconds:492});
  assert.deepEqual(entries.map(entry=>entry.key),['user',processKey(),'answer']);
  const processes=entries.filter(entry=>entry.kind==='process');
  assert.equal(processes.length,1);
  assert.deepEqual(processes[0].items.map(entry=>entry.key),['opening','first','middle','second']);
  assert.deepEqual(entries.filter(entry=>entry.item?.type==='assistant').map(entry=>entry.key),['answer']);
  assert.deepEqual(entries,before);
  assert.deepEqual(items,originalItems);
});

test('one scope keeps its process key through intermediate prose, completion, and history prepends',()=>{
  const items=sampleItems(),running={[scope()]:{...completed,status:'running'}};
  for(const subset of [items.slice(0,3),items.slice(0,5),items]){
    const processes=transcriptEntries(subset,{turns:running}).filter(entry=>entry.kind==='process');
    assert.equal(processes.length,1);
    assert.equal(processes[0].key,processKey());
  }
  const tail=transcriptEntries(items.slice(3),{turns});
  assert.equal(tail.find(entry=>entry.kind==='process').key,processKey());
  assert.equal(sample().find(entry=>entry.kind==='process').key,processKey());
});

test('running and cancelled turns keep every assistant segment inside the process without a fabricated final',()=>{
  for(const status of ['running','cancelled']){
    const records={[scope()]:{...completed,status}};
    const entries=transcriptEntries(sampleItems(),{turns:records});
    assert.deepEqual(entries.map(entry=>entry.key),['user',processKey()]);
    assert.deepEqual(entries[1].items.map(entry=>entry.key),['opening','first','middle','second','answer']);
    assert.equal(entries.some(entry=>entry.item?.type==='assistant'),false);
    const summaries=settledTurnSummaries(entries,records,'root');
    assert.equal(summaries.size,status==='running'?0:1);
    if(status==='cancelled')assert.deepEqual(summaries.get(scope()),{
      scope:scope(),ownerKey:processKey(),afterOwner:false,processKeys:[processKey()],status,seconds:null,
    });
  }
});

test('completed summaries require valid pre-end sequence evidence before placing an assistant reply outside',()=>{
  for(const seq of [undefined,null,0,-1,7,8,NaN,Infinity,'6',1.5]){
    const entries=transcriptEntries([item('assistant','unproven',{seq})],{turns});
    assert.equal(entries.length,1);
    assert.equal(entries[0].kind,'process');
    assert.deepEqual(entries[0].items.map(entry=>entry.key),['unproven']);
    const summary=settledTurnSummaries(entries,turns).get(scope());
    assert.equal(summary.status,'completed');
    assert.deepEqual(summary.processKeys,[processKey()]);
  }
  const records={[scope()]:{...completed,endSeq:undefined}};
  const entries=transcriptEntries([item('assistant','unproven',{seq:6})],{turns:records});
  assert.equal(entries[0].kind,'process');
  assert.deepEqual(settledTurnSummaries(entries,records).get(scope()).processKeys,[processKey()]);
});

test('answer-only turns own a static summary and user-only turns place it after their last user',()=>{
  const entries=transcriptEntries([item('user','first'),item('user','last')],{turns});
  const summary=settledTurnSummaries(entries,turns).get(scope());
  assert.equal(summary.ownerKey,'last');assert.equal(summary.afterOwner,true);
  assert.deepEqual(summary.processKeys,[]);
  assert.deepEqual(settledTurnPresentation(summary,entries,policy,{},true,true),{open:false,collapsible:false,pin:false});
  const answer=settledTurnSummaries(transcriptEntries([item('assistant','only')],{turns}),turns).get(scope());
  assert.equal(answer.ownerKey,'only');assert.equal(answer.afterOwner,false);
  assert.deepEqual(answer.processKeys,[]);
  assert.equal(settledTurnSummaries([],turns).size,0);
  assert.equal(settledTurnSummaries(transcriptEntries([item('assistant','blank',{text:'  '})]),turns).size,0);
});

test('process-only turns use their single process as the owner',()=>{
  const entries=transcriptEntries([item('thought','first')],{turns});
  const summary=settledTurnSummaries(entries,turns).get(scope());
  assert.equal(summary.ownerKey,processKey());assert.equal(summary.afterOwner,false);
});

test('same turn id across sessions and different turns remain separate, explicit root filters scopes',()=>{
  const records={...turns,[scope('other')]:{...completed,endedAt:2000},[scope('root','next')]:completed};
  const entries=transcriptEntries([
    item('thought','root-work'),item('thought','other-work',{sessionId:'other'}),item('thought','next-work',{turnId:'next'}),
    item('assistant','root'),item('assistant','other',{sessionId:'other'}),item('assistant','next',{turnId:'next'}),
  ],{turns:records});
  const all=settledTurnSummaries(entries,records);
  assert.deepEqual([...all.keys()],[scope(),scope('other'),scope('root','next')]);
  for(const [session,turn,work] of [['root','turn','root-work'],['other','turn','other-work'],['root','next','next-work']]){
    const key=processKey(session,turn),summary=all.get(scope(session,turn));
    assert.equal(summary.ownerKey,key);
    assert.deepEqual(summary.processKeys,[key]);
    assert.deepEqual(entries.find(entry=>entry.key===key).items.map(entry=>entry.key),[work]);
  }
  assert.equal(all.get(scope('other')).seconds,1);
  assert.deepEqual([...settledTurnSummaries(entries,records,'root').keys()],[scope(),scope('root','next')]);
  assert.equal(settledTurnSummaries(entries,records,'absent').size,0);
});

test('implicit root detection excludes explicit child payloads including tool and subagent wrappers',()=>{
  for(const type of ['assistant','tool','subagent']){
    const data={sessionId:'child',turnId:'turn',rootSessionId:'root'};
    const child=type==='assistant'?item(type,'child',data):item(type,'child',{[type]:data});
    const records={...turns,[scope('child')]:completed};
    const entries=transcriptEntries([item('assistant','parent'),item('assistant','early-child',{sessionId:'child'}),child],{turns:records});
    assert.deepEqual([...settledTurnSummaries(entries,records).keys()],[scope()]);
    assert.deepEqual([...settledTurnSummaries(entries,records,'root').keys()],[scope()]);
    assert.deepEqual([...settledTurnSummaries(entries,records,'child').keys()],[scope('child')]);
  }
});

test('only authoritative known terminal records create summaries, never last responses or sequence facts',()=>{
  const entries=sample();
  for(const status of ['running','unknown','idle','done','aborted',undefined]){
    assert.equal(settledTurnSummaries(entries,{[scope()]:{...completed,status}}).size,0);
  }
  assert.equal(settledTurnSummaries(entries,{}).size,0);
  assert.equal(settledTurnSummaries(entries,Object.create(turns)).size,0);
  for(const status of ['completed','cancelled','interrupted','failed','error']){
    const summary=settledTurnSummaries(entries,{[scope()]:{...completed,status}}).get(scope());
    assert.equal(summary.status,status);
    assert.equal(summary.seconds,status==='completed'?492:null);
  }
});

test('duration uses valid positive numeric event timestamps and a safe floored difference only',()=>{
  const entries=sample();
  const duration=patch=>settledTurnSummaries(entries,{[scope()]:{...completed,...patch}}).get(scope()).seconds;
  assert.equal(duration({startedAt:1000,endedAt:1000}),0);
  assert.equal(duration({startedAt:1000.25,endedAt:1999.99}),0);
  assert.equal(duration({startedAt:1000,endedAt:2000}),1);
  for(const bad of [undefined,null,0,-1,NaN,Infinity,-Infinity,'1000',{},true]){
    assert.equal(duration({startedAt:bad}),null);
    assert.equal(duration({endedAt:bad}),null);
  }
  assert.equal(duration({startedAt:2000,endedAt:1000}),null);
  assert.equal(duration({startedAt:1,endedAt:Number.MAX_VALUE}),null);
  assert.equal(duration({startedAt:undefined,endedAt:undefined,startSeq:1,endSeq:999,binding:{startedAt:1000}}),null);
});

test('missing and malformed scopes cannot leak a root summary or throw',()=>{
  const entries=[{kind:'item',key:'bad',scope:'invalid',item:item('assistant','bad')}];
  assert.equal(settledTurnSummaries(entries,{invalid:completed},'root').size,0);
  assert.equal(settledTurnSummaries(entries,{invalid:completed}).size,0);
  assert.equal(settledTurnSummaries(sample(),undefined).size,0);
});

test('turn disclosure defaults closed and protects manual or focused reading of its single process',()=>{
  assert.deepEqual(presentation(),{open:false,collapsible:true,pin:false});
  for(const manual of [{[processKey()]:{open:true}},{[processKey()]:{open:true,readingFlat:true}},{[processKey()]:true}]){
    assert.deepEqual(presentation(sample(),manual),{open:true,collapsible:true,pin:true});
  }
  assert.deepEqual(presentation(sample(),{},undefined,true),{open:true,collapsible:true,pin:true});
  assert.deepEqual(presentation(sample(),{'unrelated':{open:true}}),{open:false,collapsible:true,pin:false});
  assert.deepEqual(presentation(sample(),{[processKey()]:{open:false,readingFlat:true}}),{open:false,collapsible:true,pin:false});
});

test('explicit close wins over local open and focus; explicit choices do not pin',()=>{
  const manual={[processKey()]:{open:true}};
  assert.deepEqual(presentation(sample(),manual,false,true),{open:false,collapsible:true,pin:false});
  assert.deepEqual(presentation(sample(),{},true),{open:true,collapsible:true,pin:false});
});

test('verbose and detailed deferred policy keep the process flat without pinning merely default visibility',()=>{
  const verbose=transcriptPolicy({transcriptView:'verbose'});
  const deferred=transcriptPolicy({transcriptView:'detailed',collapseTiming:'next-input'});
  for(const view of [verbose,deferred]){
    assert.deepEqual(presentation(sample(),{},undefined,false,view),{open:true,collapsible:false,pin:false});
    assert.deepEqual(presentation(sample(),{},false,true,view),{open:true,collapsible:false,pin:false});
    assert.deepEqual(presentation(sample(),{},undefined,true,view),{open:true,collapsible:false,pin:true});
    assert.deepEqual(presentation(sample(),{[processKey()]:{open:true}},undefined,false,view),{open:true,collapsible:false,pin:true});
  }
  const historical=sample().map(entry=>entry.kind==='process'?{...entry,laterInput:true}:entry);
  assert.deepEqual(presentation(historical,{},undefined,false,deferred),{open:false,collapsible:true,pin:false});
  assert.deepEqual(presentation(historical,{},undefined,false,verbose),{open:true,collapsible:false,pin:false});
  const immediate=transcriptPolicy({transcriptView:'detailed',collapseTiming:'completion'});
  assert.deepEqual(presentation(sample(),{},undefined,false,immediate),{open:false,collapsible:true,pin:false});
});

test('summary duration fragments match Chinese and English native unit spacing and keep zero units',()=>{
  const zh={'flow.turnTook':'已完成，用时 ','flow.hour':'小时','flow.minute':'分','flow.second':'秒','flow.durationGap':''};
  const en={'flow.turnTook':'Completed in ','flow.hour':'h','flow.minute':'m','flow.second':'s','flow.durationGap':' '};
  for(const [dictionary,seconds,expected,numbers] of [
    [zh,492,'已完成，用时 8分12秒',['8','12']],
    [zh,3600,'已完成，用时 1小时0分0秒',['1','0','0']],
    [zh,0,'已完成，用时 0秒',['0']],
    [en,492,'Completed in 8m 12s',['8','12']],
  ]){
    const result=turnSummaryText({status:'completed',seconds},key=>dictionary[key]);
    assert.equal(result.label+result.parts.map(part=>part.text).join(''),expected);
    assert.deepEqual(result.parts.filter(part=>part.numeric).map(part=>part.text),numbers);
  }
  const labels={completed:'flow.turnCompleted',cancelled:'flow.stopped',interrupted:'flow.interrupted',failed:'flow.turnFailed',error:'flow.turnFailed'};
  for(const [status,label] of Object.entries(labels)){
    assert.deepEqual(turnSummaryText({status,seconds:null},key=>key),{label,parts:[]});
    if(status!=='completed')assert.deepEqual(turnSummaryText({status,seconds:12},key=>key),{label,parts:[]});
  }
  for(const seconds of [undefined,-1,NaN,Infinity,1.5,'8',Number.MAX_VALUE]){
    assert.deepEqual(turnSummaryText({status:'completed',seconds},key=>key),{label:'flow.turnCompleted',parts:[]});
  }
});

test('focused flat processes survive completion and next-input folding, then allow explicit close',()=>{
  for(const collapseTiming of ['completion','next-input']){
    const view=transcriptPolicy({transcriptView:'detailed',collapseTiming});
    const before={kind:'process',key:processKey(),scope:scope(),settled:collapseTiming==='next-input',laterInput:false};
    const after={...before,settled:true,laterInput:collapseTiming==='next-input'};
    const focus={scope:scope(),key:before.key,wasFlat:true};
    assert.equal(processGroupPresentation(before,view).flat,true);
    assert.equal(processFocusProtection([before],view,{},focus),null);
    assert.equal(processGroupPresentation(after,view).open,false);
    const protectedState=processFocusProtection([after],view,{},focus);
    assert.deepEqual(protectedState,{key:before.key,scope:scope(),open:true,readingFlat:true});
    const saved={[before.key]:{open:protectedState.open,readingFlat:protectedState.readingFlat}};
    assert.deepEqual(processGroupPresentation(after,view,saved[before.key]),{flat:false,open:true,scrollBody:false});
    assert.equal(processFocusProtection([after],view,saved,{...focus,wasFlat:false}),null);
    assert.equal(processGroupPresentation(after,view,{open:false}).open,false);
    assert.equal(processFocusProtection([after],view,{}, {...focus,scope:scope('other')}),null);
    assert.equal(processFocusProtection([],view,{},focus),null);
  }
});

test('presentation ignores process groups from other scopes and stale keys without mutating saved reading state',()=>{
  const entries=sample(),summary=settledTurnSummaries(entries,turns).get(scope());
  const other={...entries.find(entry=>entry.kind==='process'),scope:scope('child'),key:processKey('child'),settled:false};
  const manual=freeze({[processKey('child')]:{open:true},[processKey()]:{open:false}});
  assert.deepEqual(settledTurnPresentation(summary,[...entries,other],policy,manual,undefined),{open:false,collapsible:true,pin:false});
  assert.deepEqual(settledTurnPresentation({...summary,processKeys:['gone']},entries,policy,manual,undefined,true),{open:false,collapsible:false,pin:false});
});
