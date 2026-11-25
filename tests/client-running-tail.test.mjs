import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,reduceEvent,replay} from '../src/client/events.js';
import {conversationActivity,actionLabel} from '../src/client/stream-view-model.js';
import {runningTailPresentation,formatTurnElapsed,subscribeRunningClock} from '../src/client/running-tail-model.js';
const scope=JSON.stringify(['root','turn']);
const state=(patch={})=>({...initialState(),connected:true,running:true,binding:{sessionId:'root',startedAt:10},turns:{[scope]:{status:'running',startSeq:1,startedAt:1000}},...patch});
const view=(s=state(),now=13000)=>runningTailPresentation(s,conversationActivity(s),now);
const event=(seq,patch)=>({seq,generation:'g',sessionId:'root',turnId:'turn',...patch});

test('running footer uses actual root turn time, not session age or mount time',()=>{
  const s=state(),a=view(s);
  assert.equal(a.phase,'running');assert.equal(a.seconds,12);assert.equal(a.startedAt,1000);
  assert.equal(a.clock,true);assert.equal(a.animate,true);assert.equal(a.footer,true);
  assert.equal(view(s,13999).seconds,12);assert.equal(view(s,14000).seconds,13);
});
test('queued input is not submitted execution and never starts an invented stopwatch',()=>{
  let s=state({running:false,turns:{}});
  s=reduceEvent(s,event(1,{type:'user_message',requestId:'r',delivery:'queued',ts:1000,text:'Work'}));
  assert.equal(view(s).phase,'pending');assert.equal(view(s).seconds,null);assert.equal(view(s).animate,false);assert.equal(view(s).footer,false);
  s=reduceEvent(s,event(2,{type:'turn_start',requestId:'r',ts:12000}));
  assert.equal(view(s).seconds,1);assert.equal(view(s).phase,'running');
});
test('newer children and old turns cannot change the active root clock',()=>{
  const s=state();s.turns['["child","child-turn"]']={status:'running',startSeq:900,startedAt:12000};
  s.turns['["root","old"]']={status:'completed',startSeq:1000,startedAt:12000};
  assert.equal(view(s).scope,scope);assert.equal(view(s).seconds,12);
});
test('missing root identity never borrows a child start',()=>{
  const s=state({binding:{id:'native-session'},turns:{'["child","child-turn"]':{status:'running',startSeq:900,startedAt:1000}}});
  assert.equal(view(s).scope,null);assert.equal(view(s).seconds,null);assert.equal(view(s).clock,false);
});
test('a later submitted root turn gets its own clock without carrying queue or previous elapsed time',()=>{
  let s=state();
  s=reduceEvent(s,event(2,{type:'stop',stopReason:'end_turn',pendingTurns:1,ts:18000}));
  assert.equal(view(s,19000).phase,'pending');assert.equal(view(s,19000).seconds,null);
  s=reduceEvent(s,event(3,{type:'turn_start',turnId:'next',ts:20000}));
  assert.equal(view(s,22000).seconds,2);assert.equal(view(s,22000).scope,'["root","next"]');
});
test('completed, cancelled, idle and fatal results remove the running tail',()=>{
  for(const stopReason of ['end_turn','cancelled','error']){
    const s=reduceEvent(state(),event(2,{type:'stop',stopReason,ts:14000}));assert.equal(view(s),null);
  }
  assert.equal(view(reduceEvent(state(),event(2,{type:'state',state:'idle'}))),null);
  assert.equal(view(reduceEvent(state(),event(2,{type:'error',fatal:true}))),null);
});
test('permission and question waits remain explicit and static, while elapsed includes the wait',()=>{
  for(const field of ['permissions','elicitations']){
    const s=state({[field]:[{}]});const v=view(s,31000);
    assert.equal(v.phase,'waiting');assert.equal(v.seconds,30);assert.equal(v.animate,false);assert.equal(v.footer,true);
  }
  const outsideTurn=view(state({running:false,permissions:[{}]}));
  assert.equal(outsideTurn.phase,'waiting');assert.equal(outsideTurn.seconds,null);assert.equal(outsideTurn.clock,false);
});
test('connection interruption hides progress and timing; reconnect uses original start',()=>{
  const s=state({connected:false,everConnected:true});const v=view(s);
  assert.equal(v.phase,'connection');assert.equal(v.seconds,null);assert.equal(v.clock,false);assert.equal(v.animate,false);assert.equal(v.footer,false);
  assert.equal(view({...s,connected:true},33000).seconds,32);
});
test('missing, invalid and future timestamps never fabricate zero seconds',()=>{
  for(const startedAt of [null,undefined,NaN,Infinity,0,-1,'1000',14000]){
    const v=view(state({turns:{[scope]:{status:'running',startSeq:1,startedAt}}}));
    assert.equal(v.phase,'running');assert.equal(v.seconds,null);assert.equal(v.clock,false);
  }
  assert.equal(view(state(),1000).seconds,0);
});
test('truncated history without turn_start never substitutes Session startedAt',()=>{
  const s=state({turns:{},items:[{type:'assistant',sessionId:'root',turnId:'turn',text:'Live answer',seq:500}]});
  assert.equal(view(s).seconds,null);assert.equal(view(s).clock,false);
});
test('history replay and duplicate sequence delivery retain the original event timestamp',()=>{
  const start=event(1,{type:'turn_start',ts:1000});
  const loaded=replay([start],{sessionId:'root',busy:true});loaded.connected=true;
  assert.equal(view(loaded).seconds,12);
  assert.equal(view(reduceEvent(loaded,{...start,ts:12000})).seconds,12);
});
test('current activity comes from structured records, not invented analysis phases',()=>{
  let s=state({items:[{type:'thought',sessionId:'root',turnId:'turn',text:'Working',seq:2}]});
  assert.equal(conversationActivity(s).kind,'thinking');
  s=reduceEvent(s,event(3,{type:'tool_call',toolCallId:'t',status:'in_progress',title:'Run regression tests'}));
  const activity=conversationActivity(s);assert.equal(activity.kind,'activity');assert.equal(actionLabel(activity.item,key=>key),'Run regression tests');
  assert.equal(view(s).seconds,12);
});
test('generic progress waiting is omitted once a real running footer is available',()=>{
  const s=state(),v=view(s);
  assert.equal(conversationActivity(s).kind,'working');
  assert.equal(v.showActivity,false);assert.equal(v.footer,true);
  assert.equal(v.seconds,12);assert.equal(v.clock,true);assert.equal(v.activeCount,null);
  const unknownTime=view(state({turns:{[scope]:{status:'running',startSeq:1}}}));
  assert.equal(unknownTime.showActivity,false);assert.equal(unknownTime.footer,true);
  assert.equal(unknownTime.seconds,null);assert.equal(unknownTime.clock,false);
});
test('progress gaps stay quiet while intervention and reconnect feedback return without resetting the clock',()=>{
  const s=state();
  assert.equal(view(s).showActivity,false);
  for(const patch of [{permissions:[{}]},{elicitations:[{}]},{connected:false,everConnected:true}]){
    assert.equal(view({...s,...patch}).showActivity,true);
    assert.equal(view(s,19000).showActivity,false);assert.equal(view(s,19000).seconds,18);
  }
  const pending=view(state({turns:{}}));
  assert.equal(pending.showActivity,true);assert.equal(pending.footer,false);assert.equal(pending.seconds,null);
});
test('duplicate command summary is omitted while the real footer and turn clock remain',()=>{
  const s=reduceEvent(state(),event(3,{type:'tool_call',toolCallId:'t',status:'in_progress',title:'cd workspace && git diff HEAD'}));
  const activity=conversationActivity(s),v=view(s);
  assert.equal(activity.kind,'activity');assert.equal(actionLabel(activity.item,key=>key),'cd workspace && git diff HEAD');
  assert.equal(v.showActivity,false);assert.equal(v.activeCount,null);
  assert.equal(v.footer,true);assert.equal(v.seconds,12);assert.equal(v.clock,true);
});
test('concurrent active operations retain their factual count in the footer without a repeated title',()=>{
  const items=['Run tests','Read result'].map((title,index)=>({type:'tool',tool:{sessionId:'root',turnId:'turn',toolCallId:String(index),title,status:'in_progress',seq:10+index}}));
  const s=state({items});assert.equal(conversationActivity(s).count,2);
  assert.equal(view(s).showActivity,false);assert.equal(view(s).activeCount,2);
  assert.equal(view(state({items:items.slice(0,1)})).activeCount,null);
  const tail=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8').split('export function RunningTail')[1];
  assert.match(tail,/presentation\.showActivity\?h\('div',\{className:'rssh-running-activity'/);
  assert.match(tail,/presentation\.activeCount!==null\?` · \$\{presentation\.activeCount\} \$\{t\('flow.runningCount'\)\}/);
});
test('connection, intervention and unconfirmed execution feedback are not removed with the duplicate row',()=>{
  for(const patch of [{connected:false},{connected:false,everConnected:true},{permissions:[{}]},{elicitations:[{}]},{turns:{}}]){
    const v=view(state(patch));assert.equal(v.showActivity,true);assert.equal(v.activeCount,null);
  }
  assert.equal(view(state({turns:{}})).footer,false);
});
test('subagent titles are deduplicated without suppressing thinking or replying feedback',()=>{
  const items=[{type:'subagent',subagent:{sessionId:'root',turnId:'turn',id:'child',title:'Inspect code',status:'running',seq:2}}];
  assert.equal(conversationActivity(state({items})).kind,'activity');
  assert.equal(view(state({items})).showActivity,false);
  for(const type of ['thought','assistant']){
    const v=view(state({items:[{type,sessionId:'root',turnId:'turn',text:'Live',seq:2}]}));
    assert.equal(v.showActivity,true);assert.equal(v.footer,true);
  }
});
test('elapsed formatting supports seconds, minutes and hours without rounding early',()=>{
  const zh=key=>({'flow.hour':'小时','flow.minute':'分','flow.second':'秒'})[key];
  assert.equal(formatTurnElapsed(0,zh),'0 秒');assert.equal(formatTurnElapsed(12,zh),'12 秒');
  assert.equal(formatTurnElapsed(60,zh),'1 分 0 秒');assert.equal(formatTurnElapsed(3662,zh),'1 小时 1 分 2 秒');
  for(const v of [null,undefined,-1,NaN,Infinity,1.5])assert.equal(formatTurnElapsed(v,zh),null);
});
function clockFixture(initialVisible=true){
  let visible=initialVisible,ticks=0,id=0;const timers=new Map(),listeners=new Set();
  const cleanup=subscribeRunningClock(()=>ticks++,{visible:()=>visible,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},schedule:(fn,ms)=>{assert.equal(ms,1000);const key=id++;timers.set(key,fn);return key;},clear:key=>timers.delete(key)});
  return {cleanup,timers,listeners,get ticks(){return ticks;},visibility(value){visible=value;for(const fn of listeners)fn();}};
}
test('one tail clock pauses in hidden tabs and immediately catches up on return',()=>{
  const f=clockFixture();assert.equal(f.timers.size,1);assert.equal(f.ticks,1);
  [...f.timers.values()][0]();assert.equal(f.ticks,2);
  f.visibility(false);assert.equal(f.timers.size,0);assert.equal(f.ticks,2);
  f.visibility(true);assert.equal(f.timers.size,1);assert.equal(f.ticks,3);
  f.visibility(true);assert.equal(f.timers.size,1);f.cleanup();assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
test('hidden mount does not tick and cleanup makes queued old callbacks harmless',()=>{
  const f=clockFixture(false);assert.equal(f.ticks,0);assert.equal(f.timers.size,0);
  f.visibility(true);const late=[...f.timers.values()][0],visibility=[...f.listeners][0],ticks=f.ticks;
  f.cleanup();late();visibility();f.visibility(true);assert.equal(f.ticks,ticks);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
test('running UI keeps elapsed outside live announcements and confines motion to dots',()=>{
  const source=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  const tail=source.slice(source.indexOf('export function RunningTail'));
  assert.match(tail,/role:'status','aria-live':'polite'/);assert.match(tail,/role:'timer','aria-live':'off'/);
  assert.match(tail,/presentation\?\.clock\?subscribeRunningClock/);assert.match(tail,/presentation\?\.scope,presentation\?\.startedAt/);
  assert.match(tail,/if\(!presentation\)return null/);assert.doesNotMatch(tail,/ui\.StateDot|setInterval|new SessionClient/);
  assert.match(tail,/presentation.animate\?h\('span',\{className:'rssh-running-dots','aria-hidden':true\}/);
  assert.match(tail,/formatTurnElapsed\(presentation.seconds,t\)/);
  const css=readFileSync(new URL('../src/client/styles.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('.rssh-running-tail {'),css.indexOf('.rssh-jump-latest {'));
  assert.match(block,/flex-direction: column/);assert.match(block,/var\(--dsw-alias-state-business-primary\)/);
  assert.match(block,/overflow-wrap: anywhere/);assert.match(block,/font-variant-numeric: tabular-nums/);
  assert.match(block,/\.rssh-running-activity > \.rssh-flow-icon \{[^}]*margin-right: 0/);
  assert.match(block,/@media \(prefers-reduced-motion: reduce\).*animation: none/);
  assert.doesNotMatch(block,/#[\da-f]{3,8}\b|rgb\(|shimmer|position: fixed|background-image/i);
});
