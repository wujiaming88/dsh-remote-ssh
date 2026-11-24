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
test('failed startup is explicit and never sends a prompt or changes backend',async t=>{
 const {client,calls}=fixture(t,{api:method=>method==='acpStart'?{ok:false,code:'remote_prepare_required',error:'prepare',needsPrepare:true}:undefined});
 await client.connect();assert.equal(client.state.failure.needsPrepare,true);assert.equal(client.state.error,'prepare');
 assert.deepEqual(calls.map(call=>call.method),['acpStart']);
});
