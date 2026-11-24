import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionClient} from '../src/client/session.js';
import {SessionClientPool} from '../src/client/session-pool.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const backend={sessionId:'timer-session',backend:{type:'claude'}};
// Node timers accept arbitrary receivers; Window timers do not. Enforce that
// native receiver contract at the GLOBAL defaults, not injected arrow timers.
// This tests real controllers, not React/DOM or a fabricated browser renderer.
function windowTimerContract(t) {
  let next=0,enforce=true;const timers=new Map(),calls=[];
  const check=(receiver,method)=>{
    if(enforce&&receiver!==globalThis)throw new TypeError('Illegal invocation');
    calls.push(method);
  };
  t.mock.method(globalThis,'setTimeout',function(callback,ms){
    check(this,'setTimeout');const id=++next;timers.set(id,{callback,ms});return id;
  });
  t.mock.method(globalThis,'clearTimeout',function(id){check(this,'clearTimeout');timers.delete(id);});
  return {timers,calls,relax:()=>{enforce=false;},fire(ms){
    const found=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(found,`missing ${ms}ms timer`);
    timers.delete(found[0]);found[1].callback();
  }};
}

test('default pool timers preserve the Window receiver on first acquire, remount, eviction and disposal',t=>{
  const clock=windowTimerContract(t),pool=new SessionClientPool({storage:null});
  try {
    const first=pool.acquire(backend);first.release();
    assert.ok([...clock.timers.values()].some(timer=>timer.ms===600000));
    const again=pool.acquire(backend);assert.equal(again.client,first.client);assert.equal(clock.timers.size,0);
    again.release();clock.fire(600000);assert.equal(pool.peek(backend),null);assert.equal(first.client.disposed,true);
    pool.acquire(backend);pool.dispose();assert.equal(clock.timers.size,0);
    assert.ok(clock.calls.includes('setTimeout'));assert.ok(clock.calls.includes('clearTimeout'));
  } finally {clock.relax();pool.dispose();}
});

test('default client timers preserve the Window receiver through startup, watchdog, retry and invalidation',async t=>{
  const clock=windowTimerContract(t);let emit;
  const session={id:'timer-acp',sessionId:'timer-session',status:'ready',busy:false,pendingPermissions:[],pendingElicitations:[],config:{},capabilities:{}};
  const client=new SessionClient(backend,{storage:null,
    api:async method=>method==='acpEvents'?{ok:true,session,events:[],cursor:{generation:'g',seq:0},oldestSeq:null,hasEarlier:false}:{ok:true,session},
    stream:(_method,_args,signal,onEvent)=>new Promise(resolve=>{
      emit=onEvent;signal.addEventListener('abort',resolve,{once:true});onEvent({type:'heartbeat'});
    }),
  });
  try {
    await client.connect();await tick();assert.equal(client.state.connected,true);
    emit({type:'heartbeat'});assert.equal(clock.timers.size,1);
    clock.fire(45000);await tick();assert.equal(client.state.connected,false);
    clock.fire(1000);await tick();assert.equal(client.state.connected,true);
    client.invalidate({code:'remote_access_denied',message:'denied'});await tick();
    assert.equal(clock.timers.size,0);assert.equal(client.retryBlocked,true);
    client.dispose();assert.equal(clock.timers.size,0);
  } finally {clock.relax();client.dispose();await tick();}
});

test('explicit timer injection still bypasses native defaults in pool and client',t=>{
  const clock=windowTimerContract(t),pending=new Map();let next=0;
  const timers={setTimeout:(callback,ms)=>{const id=++next;pending.set(id,{callback,ms});return id;},clearTimeout:id=>pending.delete(id)};
  const pool=new SessionClientPool({storage:null,...timers,createClient:(value,deps)=>new SessionClient(value,{...deps,...timers})});
  try {
    const lease=pool.acquire(backend);lease.release();assert.equal(pending.size,1);
    pool.dispose();assert.equal(pending.size,0);assert.deepEqual(clock.calls,[]);
  } finally {clock.relax();pool.dispose();}
});
