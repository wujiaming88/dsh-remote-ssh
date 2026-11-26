import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {SessionClient} from '../src/client/session.js';
import {conversationActivity,remoteConnectionPresentation} from '../src/client/stream-view-model.js';
import {streamAcpSubscription} from '../lib/stream-liveness.js';
const snapshot={id:'local-acp',sessionId:'remote-acp',status:'prompting',busy:true,cursor:{generation:'g',seq:2},remoteExecution:{id:'owner'},transportState:'connected',pendingPermissions:[],pendingElicitations:[]};
function client(t){const value=new SessionClient({sessionId:'host-session'});value.state={...value.state,binding:snapshot,cursor:snapshot.cursor,loading:false,connected:true,running:true};t.after(()=>value.dispose());return value;}

test('SSH snapshots do not confuse healthy HTTP transport with remote progress',t=>{
  const value=client(t);
  value.receive({type:'snapshot',state:{...snapshot,transportState:'reconnecting',pendingPermissions:[{requestId:'approval'}]}});
  assert.equal(value.state.connected,true);assert.equal(value.state.running,true);
  assert.equal(value.state.permissions.length,1);assert.equal(value.state.cursor.seq,2);
  assert.deepEqual(remoteConnectionPresentation(value.state),{closed:false,offline:true,retryable:false});
  assert.equal(conversationActivity(value.state).kind,'reconnecting');assert.equal(value.events.size,0);
  value.receive({type:'snapshot',state:{...snapshot,transportState:'error'}});
  assert.equal(remoteConnectionPresentation(value.state).retryable,true);
  assert.equal(conversationActivity(value.state).kind,'idle');
});

test('control snapshots cannot skip events, roll back a cursor or replace identity',t=>{
  const value=client(t),before=value.state;
  for(const state of [{...snapshot,id:'other'},{...snapshot,cursor:{generation:'g',seq:3}},{...snapshot,cursor:{generation:'g',seq:1}},{...snapshot,cursor:{generation:'other',seq:2}}])value.receive({type:'snapshot',state:{...state,status:'closed'}});
  assert.equal(value.state,before);
});

test('closed sessions reopen as read-only history without an attach or new prompt',async t=>{
  const calls=[],closed={...snapshot,status:'closed',busy:false};
  const value=new SessionClient({sessionId:'host-session'},{api:async(method)=>{
    calls.push(method);return method==='acpEvents'?{ok:true,session:closed,events:[{generation:'g',seq:1,type:'text',text:'retained'},{generation:'g',seq:2,type:'stop',stopReason:'end_turn'}],cursor:closed.cursor,hasEarlier:false}:{ok:true,session:closed};
  },stream:async()=>{assert.fail('closed history must not attach');}});
  t.after(()=>value.dispose());await value.connect();
  assert.deepEqual(calls,['acpStart','acpEvents']);assert.equal(value.state.binding.status,'closed');
  assert.equal(value.state.items[0].text,'retained');assert.equal(value.state.connected,false);
  assert.equal(conversationActivity(value.state).kind,'idle');assert.equal(value.retryBlocked,true);
});

test('empty journal history establishes only a zero-head generation for SSH control snapshots',async t=>{
  const cursor={generation:'g',seq:0},empty={...snapshot,cursor};
  const value=new SessionClient({sessionId:'host-session'},{api:async()=>({ok:true,session:empty,events:[],cursor})});
  t.after(()=>value.dispose());value.state={...value.state,binding:empty,connected:true};
  await value.history();assert.deepEqual(value.state.cursor,cursor);
  for(const transportState of ['reconnecting','connected']){
    value.receive({type:'snapshot',state:{...empty,transportState}});
    assert.equal(value.state.binding.transportState,transportState);assert.equal(value.state.connected,true);
  }
  const before=value.state;
  value.receive({type:'snapshot',state:{...empty,cursor:{generation:'g',seq:1},transportState:'error'}});
  value.receive({type:'snapshot',state:{...empty,cursor:{generation:'other',seq:0},transportState:'error'}});
  assert.equal(value.state,before);assert.equal(value.events.size,0);
});
test('empty history cannot jump to a positive head or let a control snapshot skip events',async t=>{
  const value=new SessionClient({sessionId:'host-session'},{api:async()=>({ok:true,session:snapshot,events:[],cursor:snapshot.cursor})});
  t.after(()=>value.dispose());value.state={...value.state,binding:snapshot,connected:true};
  await value.history();assert.deepEqual(value.state.cursor,{generation:'',seq:0});
  const before=value.state;value.receive({type:'snapshot',state:{...snapshot,transportState:'reconnecting'}});
  assert.equal(value.state,before);
});

test('HTTP public-state subscription is unsequenced and detach releases both observers',async()=>{
  const req=new EventEmitter(),res=new EventEmitter(),frames=[],activeStreams=new Set();let callback,disposed=0;
  res.writeHead=()=>{};res.write=line=>{frames.push(JSON.parse(line));return true;};res.end=()=>{res.writableEnded=true;};
  const session={eventsSince:()=>({reset:false}),subscribe:()=>()=>{disposed++;},state:()=>snapshot,
    subscribeState(fn,options){assert.equal(options.replay,false);callback=fn;return()=>{disposed++;};}};
  const close=await streamAcpSubscription({session,req,res,permitted:()=>true,activeStreams,setInterval:()=>({unref(){}}),clearInterval:()=>{}});
  callback({...snapshot,transportState:'reconnecting'});
  assert.deepEqual(frames.map(frame=>frame.type),['replay','snapshot','snapshot']);
  assert.equal(frames[2].state.transportState,'reconnecting');assert.equal(Object.hasOwn(frames[2],'seq'),false);
  close();callback(snapshot);assert.equal(frames.length,3);assert.equal(disposed,2);assert.equal(activeStreams.size,0);
});
