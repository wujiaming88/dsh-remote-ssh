import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SessionStatusStore,sessionStatusEntry} from '../src/client/session-status-store.js';

function fixture() {
  const requests=[],timers=new Map();let next=0;
  const store=new SessionStatusStore({
    connect:(method,args,signal,receive)=>new Promise((resolve,reject)=>{
      requests.push({method,args,signal,receive,resolve,reject});
      signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    }),
    setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  });
  return {store,requests,timers,fire(ms){const entry=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(entry,`timer ${ms}`);timers.delete(entry[0]);entry[1].fn();}};
}
const event=(status='running',sessionId='remote-1')=>({type:'upsert',session:{sessionId,status}});

test('status entries contain only known metadata and never copy source payloads',()=>{
  assert.deepEqual(sessionStatusEntry({sessionId:'s',status:'waiting',waitingFor:'permission',prompt:'secret',error:'private',path:'/private'}),{sessionId:'s',status:'waiting',waitingFor:'permission'});
  assert.deepEqual(sessionStatusEntry({sessionId:'s',status:'invented',waitingFor:'permission'}),{sessionId:'s',status:'unknown'});
  assert.equal(sessionStatusEntry({status:'running'}),null);
});
test('one shared connection serves all rows and repeated start cannot create another stream',()=>{
  const f=fixture();f.store.start();f.store.start();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].method,'sessionActivityEvents');assert.deepEqual(f.requests[0].args,{});
  f.requests[0].receive({type:'snapshot',sessions:[{sessionId:'a',status:'running'},{sessionId:'b',status:'waiting',waitingFor:'elicitation'}]});
  assert.equal(f.store.getSnapshot().byId.b.waitingFor,'elicitation');assert.equal(f.store.getSnapshot().connected,true);f.store.dispose();
});
test('identical upserts and heartbeats do not rerender rows; listeners unsubscribe',()=>{
  const f=fixture();let changes=0;const off=f.store.subscribe(()=>changes++);f.store.start();
  f.requests[0].receive(event());const snapshot=f.store.getSnapshot();
  f.requests[0].receive(event());f.requests[0].receive({type:'heartbeat'});
  assert.equal(f.store.getSnapshot(),snapshot);assert.equal(changes,1);
  off();f.requests[0].receive(event('completed'));assert.equal(changes,1);f.store.dispose();
});
test('EOF marks known statuses unknown, reconnect snapshot replaces stale sessions',async()=>{
  const f=fixture();f.store.start();f.requests[0].receive(event());f.requests[0].resolve();await f.store.task;
  assert.equal(f.store.getSnapshot().byId['remote-1'].status,'unknown');assert.equal(f.store.getSnapshot().connected,false);
  f.fire(1000);assert.equal(f.requests.length,2);
  f.requests[1].receive({type:'snapshot',sessions:[{sessionId:'new',status:'idle'}]});
  assert.deepEqual(Object.keys(f.store.getSnapshot().byId),['new']);f.store.dispose();
});
test('session revocation removes its status while other authorized rows remain',()=>{
  const f=fixture();f.store.start();f.requests[0].receive(event());f.requests[0].receive(event('idle','other'));
  f.requests[0].receive({type:'remove',sessionId:'remote-1'});
  assert.equal(f.store.getSnapshot().byId['remote-1'],undefined);assert.equal(f.store.getSnapshot().byId.other.status,'idle');f.store.dispose();
});
test('global access reset clears all rows and never schedules automatic reauthorization',async()=>{
  const f=fixture();f.store.start();f.requests[0].receive(event());
  f.requests[0].receive({type:'reset',reason:'access_revoked'});await f.store.task;
  assert.deepEqual(f.store.getSnapshot().byId,{});assert.equal(f.timers.size,0);assert.equal(f.store.blocked,true);f.store.dispose();
});
test('HTTP authorization and unsupported API failures are terminal rather than retry loops',async()=>{
  for(const code of ['remote_access_denied','unauthenticated','http_403','http_404']){
    const f=fixture();f.store.start();f.requests[0].receive(event());f.requests[0].reject(Object.assign(Error('denied'),{code}));await f.store.task;
    assert.deepEqual(f.store.getSnapshot().byId,{});assert.equal(f.timers.size,0);f.store.dispose();
  }
});
test('silent stalled feeds expire; heartbeat refreshes liveness without fabricating running',async()=>{
  const f=fixture();f.store.start();f.requests[0].receive(event());const oldTimer=[...f.timers.keys()][0];
  f.requests[0].receive({type:'heartbeat'});assert.equal(f.timers.has(oldTimer),false);
  f.fire(45_000);assert.equal(f.store.getSnapshot().byId['remote-1'].status,'unknown');
  assert.equal(f.requests[0].signal.aborted,true);await f.store.task;assert.equal(f.requests.length,1);f.store.dispose();
});
test('short-lived feeds back off instead of resetting retries with every snapshot',async()=>{
  const f=fixture();f.store.start();
  for(const delay of [1000,2000,4000,8000,16000,30000,30000]){
    const current=f.requests.at(-1);current.receive({type:'snapshot',sessions:[]});current.resolve();await f.store.task;f.fire(delay);
  }
  f.store.dispose();
});
test('disposal aborts the stream, clears timers and rejects delayed previous frames',async()=>{
  const f=fixture();f.store.start();const old=f.requests[0];old.receive(event());f.store.dispose();await f.store.task;
  old.receive(event());assert.deepEqual(f.store.getSnapshot().byId,{});assert.equal(f.timers.size,0);assert.equal(f.requests.length,1);
});
test('timer calls retain browser receivers and integration owns lifecycle once',()=>{
  const source=readFileSync(new URL('../src/client/session-status-store.js',import.meta.url),'utf8');
  const index=readFileSync(new URL('../src/client/index.js',import.meta.url),'utf8');
  assert.match(source,/globalThis.setTimeout\(fn,ms\)/);assert.match(source,/globalThis.clearTimeout\(id\)/);
  assert.match(index,/sessionStatuses.start\(\);return \(\)=>sessionStatuses.dispose\(\)/);
  assert.doesNotMatch(source,/acpAttach|acpResume|sessionBackend|localStorage|sessionStorage/);
});
