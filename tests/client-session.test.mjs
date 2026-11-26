import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionClient } from '../src/client/session.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const backend={sessionId:'dsh',remote:true,workspace:{id:'w'},backend:{type:'claude'},binding:null};
const snapshot={id:'acp',sessionId:'native-acp',agent:'claude',status:'ready',busy:false,pendingPermissions:[],pendingElicitations:[],config:{},capabilities:{}};
const ev=(seq,patch)=>({generation:'g',seq,sessionId:'native-acp',...patch});
function fixture(t,overrides={}) {
  const calls=[];let live;
  const api=async(method,args,signal)=>{
    calls.push({method,args,signal});
    if(overrides.api){const value=await overrides.api(method,args,signal);if(value!==undefined)return value;}
    if(method==='acpEvents')return{ok:true,events:[],cursor:{generation:'g',seq:0},oldestSeq:0,hasEarlier:false,session:snapshot};
    return{ok:true,session:{...snapshot,...overrides.state}};
  };
  const stream=(method,args,signal,onEvent)=>{
    calls.push({method,args,signal});
    if(method==='acpPrompt'&&overrides.prompt)return overrides.prompt(args,signal,onEvent);
    live=onEvent;
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));
  };
  const client=new SessionClient(backend,{api,stream});t.after(()=>client.dispose());
  return{client,calls,event:event=>live(event)};
}
test('construction is inert; connect creates one binding and follows it',async t=>{
 const {client,calls}=fixture(t);assert.equal(calls.length,0);
 await Promise.all([client.connect(),client.connect()]);
 assert.equal(calls.filter(call=>call.method==='acpStart').length,1);
 assert.equal(client.state.binding.id,'acp');assert.equal(calls.at(-1).method,'acpAttach');
});
test('unmount aborts only browser requests, never Host work',async t=>{
 const {client,calls}=fixture(t);await client.connect();client.dispose();await tick();
 assert.ok(calls.at(-1).signal.aborted);assert.ok(!calls.some(call=>['acpCancel','acpClose'].includes(call.method)));
});
test('late responses cannot revive a disposed Session client',async t=>{
 const waiting=deferred();const {client}=fixture(t,{api:method=>method==='acpStart'?waiting.promise:undefined});
 const pending=client.connect();client.dispose();waiting.resolve({ok:true,session:snapshot});await pending;
 assert.equal(client.state.binding,null);
});
test('acknowledgements carry request identity before a prompt completes',async t=>{
 const turn=deferred();let received=[];
 const {client}=fixture(t,{prompt:(args,signal,onEvent)=>{onEvent(ev(1,{type:'user_message',requestId:args.requestId,text:args.text}));return turn.promise;}});
 client.onAcknowledged(id=>received.push(id));await client.connect();
 const pending=client.submit({text:'hello',requestId:'request'});await tick();
 assert.deepEqual(received,['request']);assert.equal(client.state.running,true);turn.resolve();await pending;
});
test('transport EOF does not idle a still-running Host turn',async t=>{
 const {client}=fixture(t,{state:{busy:true,status:'prompting'},prompt:async()=>{}});await client.connect();
 // Exercise the prompt transport rather than the in-turn steering route.
 client.publish({running:false});await client.submit({text:'hello',requestId:'r'});
 assert.equal(client.state.running,true);
});
test('snapshot replay acknowledges a previously accepted submission',async t=>{
 const {client}=fixture(t,{api:method=>method==='acpEvents'?{ok:true,session:snapshot,events:[ev(1,{type:'user_message',requestId:'saved',text:'hello'}),ev(2,{type:'stop',busy:false})],cursor:{generation:'g',seq:2},oldestSeq:1,hasEarlier:false}:undefined});
 const ack=[];client.onAcknowledged(id=>ack.push(id));await client.connect();assert.deepEqual(ack,['saved']);assert.equal(client.state.running,false);
});
test('older history response cannot overwrite newer live execution state',async t=>{
 const older=deferred();
 const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq!=null?older.promise:undefined});
 await client.connect();event(ev(10,{type:'text',text:'latest'}));
 const pending=client.history(10);event(ev(11,{type:'turn_start',turnId:'new'}));
 older.resolve({ok:true,session:snapshot,events:[ev(1,{type:'user_message',text:'old'})],cursor:{generation:'g',seq:1},oldestSeq:1,hasEarlier:false});
 await pending;assert.equal(client.state.running,true);assert.equal(client.state.cursor.seq,11);assert.equal(client.state.items[0].text,'old');
});
test('late history after reattach cannot roll back the latest command roster',async t=>{
  const older=deferred();
  const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq!=null?older.promise:undefined});
  await client.connect();
  const previous=[{name:'old-skill',description:'old description'}];
  const current=[{name:'skills',description:'List skills'},...Array.from({length:48},(_,i)=>({name:`skill-${i}`,description:'恢复后的中文技能说明 mixed English '.repeat(20)}))];
  event(ev(10,{type:'commands',commands:previous}));
  const pending=client.history(10);
  event(ev(11,{type:'commands',commands:current}));
  older.resolve({ok:true,session:{...snapshot,commands:previous},events:[],cursor:{generation:'g',seq:10},oldestSeq:1,hasEarlier:false});
  await pending;
  assert.deepEqual(client.state.commands,current);
  assert.equal(client.state.commands.length,49);
});
test('failed startup is explicit and never sends a prompt or changes backend',async t=>{
 const {client,calls}=fixture(t,{api:method=>method==='acpStart'?{ok:false,code:'remote_prepare_required',error:'prepare',needsPrepare:true}:undefined});
 await client.connect();assert.equal(client.state.failure.needsPrepare,true);assert.equal(client.state.error,'prepare');
 assert.deepEqual(calls.map(call=>call.method),['acpStart']);
});


test('history captures the latest reader snapshot immediately before accepted publication',async t=>{
  const older=deferred();const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq===10?older.promise:undefined});
  await client.connect();event(ev(10,{type:'text',text:'current'}));
  let captured=null;const pending=client.history(10,{beforeApply:()=>{captured={cursor:client.state.cursor.seq,text:client.state.items.map(item=>item.text)};}});
  assert.equal(captured,null);event(ev(11,{type:'text',text:' tail'}));
  older.resolve({ok:true,session:snapshot,events:[ev(1,{type:'user_message',text:'earlier'})],cursor:{generation:'g',seq:1},oldestSeq:1,hasEarlier:false});
  await pending;assert.deepEqual(captured,{cursor:11,text:['current tail']});assert.equal(client.state.items[0].text,'earlier');assert.equal(client.state.connected,true);
});
test('a same-generation replay reset rejects a late history page and its anchor callback',async t=>{
  const older=deferred();const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq===10?older.promise:undefined});
  await client.connect();event(ev(10,{type:'text',text:'old'}));
  let captures=0;const pending=client.history(10,{beforeApply:()=>captures++});
  event({type:'replay',reset:true,cursor:{generation:'g',seq:0}});
  const revision=client.state.replayRevision;
  older.resolve({ok:true,session:snapshot,events:[ev(1,{type:'user_message',text:'stale'})],cursor:{generation:'g',seq:1},oldestSeq:1,hasEarlier:false});
  await pending;assert.equal(captures,0);assert.equal(client.state.items.length,0);assert.ok(revision>0);assert.equal(client.state.replayRevision,revision);
});
test('history from a new journal never restores an anchor from the old journal',async t=>{
  const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq===10?{ok:true,session:snapshot,
    reset:true,events:[{...ev(1,{type:'text',text:'new'}),generation:'replacement'}],cursor:{generation:'replacement',seq:1},oldestSeq:1,hasEarlier:false}:undefined});
  await client.connect();event(ev(10,{type:'text',text:'old'}));
  let captures=0;await client.history(10,{beforeApply:()=>captures++});
  assert.equal(captures,0);assert.equal(client.state.items[0].text,'new');assert.equal(client.state.cursor.generation,'replacement');assert.ok(client.state.replayRevision>0);
});


test('a detached view cannot prepend into a client reused by another mounted view',async t=>{
  const older=deferred();const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq===10?older.promise:undefined});
  await client.connect();event(ev(10,{type:'text',text:'current'}));
  let mounted=true,captures=0;
  const pending=client.history(10,{canApply:()=>mounted,beforeApply:()=>captures++});
  mounted=false;
  older.resolve({ok:true,session:snapshot,events:[ev(1,{type:'user_message',text:'earlier'})],cursor:{generation:'g',seq:1},oldestSeq:1,hasEarlier:false});
  await pending;assert.equal(captures,0);assert.equal(client.events.has(1),false);assert.equal(client.state.items[0].text,'current');
  await client.history(10,{canApply:()=>true,beforeApply:()=>captures++});
  assert.equal(captures,1);assert.equal(client.state.items[0].text,'earlier');
});
