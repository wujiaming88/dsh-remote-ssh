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


for(const [before,after] of [['reconnecting','connected'],['connected','reconnecting']])
 test(`late history cannot revert same-cursor SSH ${before} → ${after}`,async t=>{
  const older=deferred(),cursor={generation:'g',seq:2};
  const old={...snapshot,cursor,remoteExecution:{id:'owner'},transportState:before};
  const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq===2?older.promise:undefined});
  await client.connect();event(ev(2,{type:'text',text:'current'}));
  event({type:'snapshot',state:old});
  const pending=client.history(2);
  const latest={...old,transportState:after,busy:true,pendingPermissions:[{requestId:'approval'}],commands:[{name:'latest'}]};
  event({type:'snapshot',state:latest});
  older.resolve({ok:true,session:old,events:[ev(1,{type:'user_message',text:'earlier'})],cursor:{generation:'g',seq:1},oldestSeq:1,hasEarlier:false});
  await pending;
  assert.equal(client.state.binding.transportState,after);assert.deepEqual(client.state.cursor,cursor);
  assert.equal(client.state.running,true);assert.deepEqual(client.state.permissions,latest.pendingPermissions);
  assert.deepEqual(client.state.commands,latest.commands);assert.equal(client.state.items[0].text,'earlier');
  assert.equal(client.state.connected,true);assert.equal(client.state.everConnected,true);
 });
test('late history cannot reopen a Session closed by a same-cursor control snapshot',async t=>{
  const older=deferred();const {client,event}=fixture(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq===2?older.promise:undefined});
  await client.connect();event(ev(2,{type:'text',text:'current'}));
  const pending=client.history(2);
  event({type:'snapshot',state:{...snapshot,cursor:{generation:'g',seq:2},status:'closed'}});
  older.resolve({ok:true,session:snapshot,events:[ev(1,{type:'user_message',text:'earlier'})],cursor:{generation:'g',seq:1},oldestSeq:1});
  await pending;assert.equal(client.state.binding.status,'closed');assert.equal(client.state.running,false);
  assert.equal(client.state.connected,false);assert.equal(client.retryBlocked,true);
 });

for(const closed of [false,true])test(`cross-generation history after a zero-head control snapshot ${closed?'cannot revive closed state':'uses only the new journal runtime state'}`,async t=>{
  const older=deferred(),cursor={generation:'old',seq:0};
  const client=new SessionClient(backend,{api:()=>older.promise});t.after(()=>client.dispose());
  const old={...snapshot,cursor,remoteExecution:{id:'owner'},transportState:'connected'};
  client.state={...client.state,binding:old,cursor,connected:true,everConnected:true,loading:false};
  const pending=client.history();
  client.receive({type:'snapshot',state:{...old,status:closed?'closed':'prompting',busy:true,
    transportState:'reconnecting',pendingPermissions:[{requestId:'old-approval'}],commands:[{name:'old-command'}]}});
  const afterControl=client.state,nextCursor={generation:'new',seq:0};
  const fresh={...snapshot,cursor:nextCursor,transportState:'connected',commands:[{name:'new-command'}]};
  older.resolve({ok:true,reset:true,session:fresh,events:[],cursor:nextCursor});await pending;
  if(closed){
    assert.equal(client.state,afterControl);assert.equal(client.state.binding.status,'closed');
    assert.deepEqual(client.state.cursor,cursor);assert.equal(client.state.connected,false);assert.equal(client.retryBlocked,true);
  }else{
    assert.deepEqual(client.state.cursor,nextCursor);assert.deepEqual(client.state.binding.cursor,nextCursor);
    assert.equal(client.state.binding.transportState,'connected');assert.equal(client.state.running,false);
    assert.deepEqual(client.state.permissions,[]);assert.deepEqual(client.state.commands,fresh.commands);
    assert.equal(client.state.connected,true);assert.equal(client.state.everConnected,true);
  }
});

for(const [before,after] of [['reconnecting','connected'],['connected','reconnecting']])
 for(const seq of [1,2,null])test(`late action preserves SSH ${before} → ${after} with ${seq===null?'missing':seq} receipt cursor`,async t=>{
  const receipt=deferred(),cursor={generation:'g',seq:2};
  const {client,event,calls}=fixture(t,{api:method=>method==='acpState'?receipt.promise:undefined});
  await client.connect();event(ev(2,{type:'text',text:'current'}));
  const old={...snapshot,cursor,remoteExecution:{id:'owner'},transportState:before};
  event({type:'snapshot',state:old});const pending=client.action('acpState');
  event({type:'snapshot',state:{...old,transportState:after,busy:true,pendingPermissions:[{requestId:'current'}]}});
  const latest=client.state,result={ok:true,outcome:'accepted',session:{...old,cursor:seq===null?undefined:{generation:'g',seq}}};
  receipt.resolve(result);assert.equal(await pending,result);assert.equal(client.state,latest);
  assert.equal(client.state.binding.transportState,after);assert.equal(calls.filter(call=>call.method==='acpState').length,1);
 });
for(const change of ['journal progress','new generation','closed','binding replacement','different receipt binding'])
 test(`late action snapshot cannot roll back ${change}`,async t=>{
  const receipt=deferred();const {client,event}=fixture(t,{api:method=>method==='acpState'?receipt.promise:undefined});
  await client.connect();event(ev(2,{type:'text',text:'current'}));
  const pending=client.action('acpState');
  if(change==='journal progress')event(ev(3,{type:'turn_start',turnId:'next'}));
  if(change==='new generation')event({...ev(1,{type:'turn_start',turnId:'new'}),generation:'replacement'});
  if(change==='closed')event({type:'snapshot',state:{...snapshot,cursor:{generation:'g',seq:2},status:'closed'}});
  if(change==='binding replacement')event(ev(3,{type:'session',session:{id:'replacement'}}));
  const latest=client.state,result={ok:true,session:{...snapshot,id:change==='different receipt binding'?'other':snapshot.id,cursor:{generation:'g',seq:2}}};
  receipt.resolve(result);assert.equal(await pending,result);assert.equal(client.state,latest);
 });
for(const kind of ['same head','newer head','legacy missing cursor'])
 test(`valid setConfig receipt still applies with ${kind}`,async t=>{
  const receipt=deferred();const {client,event}=fixture(t,{api:method=>method==='acpSetConfig'?receipt.promise:undefined});
  await client.connect();event(ev(2,{type:'text',text:'current'}));
  const pending=client.action('acpSetConfig',{configId:'mode',value:'plan'});
  if(kind==='newer head'){
    event(ev(3,{type:'turn_start',turnId:'latest'}));
    event({type:'snapshot',state:{...snapshot,cursor:{generation:'g',seq:3},transportState:'reconnecting',busy:true}});
  }
  const seq=kind==='newer head'?4:2;
  receipt.resolve({ok:true,session:{...snapshot,config:{mode:'plan'},transportState:'connected',cursor:kind==='legacy missing cursor'?undefined:{generation:'g',seq}}});
  await pending;assert.equal(client.state.config.mode,'plan');assert.equal(client.state.binding.transportState,'connected');
  assert.equal(client.state.cursor.seq,kind==='newer head'?3:2,'receipt must not skip journal events');
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
