import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SessionClient} from '../src/client/session.js';
import {SessionClientPool} from '../src/client/session-pool.js';
import {ComposerSession} from '../src/client/composer-session.js';
import {api,stream} from '../src/client/api.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const backend=id=>({sessionId:id,remote:true,workspace:{id:'w',profileId:'p',mirrorPath:'/local',remotePath:'/remote'},cwd:'/local',remoteCwd:'/remote',backend:{type:'claude'},binding:null});
const snapshot=id=>({id:`acp:${id}`,sessionId:id,status:'ready',busy:false,pendingPermissions:[],pendingElicitations:[],config:{},capabilities:{}});
const ev=(seq,patch={})=>({generation:'g',seq,sessionId:'a',...patch});
function harness(t,options={}) {
  const calls=[],streams=[],timers=new Map(),data=new Map();let timerId=0;
  const later=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;};
  const cancel=id=>timers.delete(id);
  const storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const api=async(method,args,signal)=>{
    calls.push({method,args,signal});
    if(options.api){const value=await options.api(method,args,signal);if(value!==undefined)return value;}
    const id=args.dshSessionId||args.id?.slice(4)||'a',session=snapshot(id);
    if(method==='acpEvents')return {ok:true,session,events:[],cursor:{generation:'g',seq:0},oldestSeq:0,hasEarlier:false};
    return {ok:true,session};
  };
  const stream=(method,args,signal,emit)=>{
    calls.push({method,args,signal});
    if(options.stream){const value=options.stream(method,args,signal,emit);if(value!==undefined)return value;}
    return new Promise((resolve,reject)=>{
      const row={method,args,signal,emit,resolve,reject};streams.push(row);
      const abort=()=>reject(Object.assign(new Error('Browser subscription detached'),{code:'cancelled'}));
      if(signal.aborted){abort();return;}
      signal.addEventListener('abort',abort,{once:true});
      if(method==='acpAttach')emit({type:'replay',reset:false});
    });
  };
  const pool=new SessionClientPool({storage,setTimeout:later,clearTimeout:cancel,...options,
    createClient:(b,deps)=>new SessionClient(b,{...deps,api,stream,setTimeout:later,clearTimeout:cancel})});
  t.after(async()=>{pool.dispose();await tick();});
  async function acquire(id){const lease=pool.acquire(typeof id==='string'?backend(id):id);await lease.client.connect();return lease;}
  async function fire(ms){const matches=[...timers].filter(([,timer])=>timer.ms===ms);assert.ok(matches.length,`missing ${ms}ms timer`);for(const [id,timer] of matches){timers.delete(id);timer.fn();}await tick();}
  const attached=id=>streams.filter(s=>s.method==='acpAttach'&&s.args.id===`acp:${id}`).at(-1);
  return {pool,calls,streams,timers,data,acquire,fire,attached};
}

test('A → B → A reuses a healthy client, transcript and one attach without replaying startup',async t=>{
  const h=harness(t),a=await h.acquire('a');h.attached('a').emit(ev(1,{type:'text',text:'retained'}));
  a.release();const b=await h.acquire('b');b.release();const back=await h.acquire('a');
  assert.equal(back.client,a.client);assert.equal(back.client.state.items[0].text,'retained');assert.equal(back.client.state.connected,true);
  assert.equal(h.calls.filter(c=>c.method==='acpStart'&&c.args.dshSessionId==='a').length,1);
  assert.equal(h.streams.filter(s=>s.method==='acpAttach'&&s.args.id==='acp:a').length,1);
});
test('StrictMode release/reacquire cancels idle disposal and retains one subscription',async t=>{
  const h=harness(t),first=await h.acquire('a');first.release();first.release();
  const second=await h.acquire('a');assert.equal(second.client,first.client);
  assert.equal([...h.timers.values()].filter(v=>v.ms===600000).length,0);
  assert.equal(h.streams.length,1);assert.equal(h.pool.entries.get('a').leases,1);
});
test('LRU keeps two warm clients, evicts only detached readers and preserves unsent attachments',async t=>{
  const h=harness(t),a=await h.acquire('a');
  a.client.composer.setDraft('unsent');a.client.composer.setAttachments([{id:'file',name:'notes.txt',text:'kept'}]);a.release();
  const b=await h.acquire('b');b.release();const c=await h.acquire('c');
  assert.equal(h.pool.entries.size,2);assert.equal(a.client.disposed,true);assert.equal(h.attached('a').signal.aborted,true);
  assert.ok(!h.calls.some(c=>['acpCancel','acpClose'].includes(c.method)));
  c.release();const restored=await h.acquire('a');assert.notEqual(restored.client,a.client);
  assert.equal(restored.client.composer.getSnapshot().draft,'unsent');assert.equal(restored.client.composer.getSnapshot().attachments[0].text,'kept');
});
test('idle expiry and plugin disposal release timers and browser requests, never remote work',async t=>{
  const h=harness(t),a=await h.acquire('a');a.release();await h.fire(600000);
  assert.equal(h.pool.peek(backend('a')),null);assert.equal(a.client.disposed,true);
  const b=await h.acquire('b');h.pool.dispose();await tick();
  assert.equal(b.client.disposed,true);assert.equal(h.timers.size,0);
  assert.throws(()=>h.pool.acquire(backend('c')),/disposed/);
});
test('mutable mode/model and null-to-created binding preserve identity; changed bindings do not',async t=>{
  const h=harness(t),a=await h.acquire('a');a.release();
  const changed={...backend('a'),backend:{type:'claude',model:'new',permission:'plan'},binding:{id:'acp:a'}};
  const same=await h.acquire(changed);assert.equal(same.client,a.client);same.release();
  const other=await h.acquire({...changed,binding:{id:'replacement'}});assert.notEqual(other.client,a.client);assert.equal(a.client.disposed,true);
});
test('profile/workspace identity changes never reuse an older projected transcript',async t=>{
  const h=harness(t),a=await h.acquire('a');h.attached('a').emit(ev(1,{type:'text',text:'old workspace'}));a.release();
  const b=await h.acquire({...backend('a'),workspace:{...backend('a').workspace,profileId:'different'}});
  assert.notEqual(a.client,b.client);assert.equal(b.client.state.items.length,0);
});
test('an ACK received while UI is detached reconciles draft and attachments before remount',async t=>{
  const h=harness(t),a=await h.acquire('a'),draft=a.client.composer;
  draft.setDraft('hello');draft.setAttachments([{id:'file',name:'n.txt',text:'body'}]);
  const pending=a.client.sendDraft();await tick();const prompt=h.streams.find(s=>s.method==='acpPrompt');a.release();
  h.attached('a').emit(ev(1,{type:'request_ack',requestId:prompt.args.requestId}));
  assert.equal(draft.pending,null);assert.equal(draft.getSnapshot().sending,false);assert.equal(draft.getSnapshot().draft,'');
  assert.deepEqual(draft.getSnapshot().attachments,[]);assert.equal(h.data.get('remote-acp.draft.v3.a'),'');
  const back=await h.acquire('a');assert.equal(back.client.composer,draft);
  prompt.resolve();await pending;
});
test('uncertain send survives connection eviction and retries the same UUID and original operation',async t=>{
  const h=harness(t),a=await h.acquire('a');a.client.composer.setDraft('hello');
  const first=a.client.sendDraft();await tick();const original=h.streams.find(s=>s.method==='acpPrompt');
  const failed=assert.rejects(first,/lost/);original.reject(new Error('lost acknowledgment'));await failed;
  const requestId=original.args.requestId;a.release();const b=await h.acquire('b');b.release();const c=await h.acquire('c');c.release();
  const back=await h.acquire('a');back.client.publish({running:true});
  const retry=back.client.sendDraft('retry');await tick();const last=h.streams.filter(s=>s.method==='acpPrompt').at(-1);
  assert.equal(last.args.requestId,requestId);assert.equal(h.calls.filter(c=>c.method==='acpSteer').length,0);
  h.attached('a').emit(ev(1,{type:'request_ack',requestId}));last.resolve();await retry;
});
test('ACK does not clear a newer draft or replacement attachment identities',async t=>{
  const h=harness(t),a=await h.acquire('a'),draft=a.client.composer;
  draft.setDraft('old');draft.setAttachments([{id:'old',name:'n',text:'old'}]);
  const send=a.client.sendDraft();await tick();const prompt=h.streams.find(s=>s.method==='acpPrompt');
  draft.setDraft('new');draft.setAttachments([{id:'new',name:'n',text:'new'}]);
  h.attached('a').emit(ev(1,{type:'request_ack',requestId:prompt.args.requestId}));
  assert.equal(draft.getSnapshot().draft,'new');assert.equal(draft.getSnapshot().attachments[0].id,'new');
  prompt.resolve();await send;
});
test('stale completion cannot release a newer attempt for the same pending request',()=>{
  const composer=new ComposerSession('a',null);composer.setDraft('hello');
  const first=composer.begin('prompt');composer.finish(first.request,first.attempt,new Error('unknown'));
  assert.throws(()=>composer.begin('steer'),{code:'submission_mode_locked'});
  const next=composer.begin('prompt');assert.equal(next.request.requestId,first.request.requestId);assert.equal(next.request.kind,'prompt');
  composer.finish(first.request,first.attempt);assert.equal(composer.getSnapshot().sending,true);
  composer.acknowledge(next.request.requestId);assert.equal(composer.getSnapshot().sending,false);
});
test('history replay, empty reset and generation changes cannot disconnect a healthy stream',async t=>{
  const h=harness(t),a=await h.acquire('a'),client=a.client;
  assert.equal(client.state.connected,true);h.attached('a').emit({type:'replay',reset:true,cursor:{generation:'g',seq:0}});
  assert.equal(client.state.connected,true);await client.history(10);assert.equal(client.state.connected,true);
  h.attached('a').emit(ev(2,{type:'text',text:'x',generation:'new'}));assert.equal(client.state.connected,true);
  assert.equal(client.state.everConnected,true);
});
test('heartbeat is not transcript data and renews the watchdog without changing cursor',async t=>{
  const h=harness(t),a=await h.acquire('a');const before=a.client.state.cursor;
  h.attached('a').emit({type:'heartbeat'});
  assert.equal(a.client.state.cursor,before);assert.equal(a.client.state.items.length,0);assert.equal(a.client.events.size,0);
  assert.equal([...h.timers.values()].filter(v=>v.ms===45000).length,1);
});
test('EOF retries from the newest cursor without repeating start/resume or idling a running turn',async t=>{
  const h=harness(t),a=await h.acquire('a');h.attached('a').emit(ev(5,{type:'turn_start',turnId:'t'}));
  h.attached('a').resolve();await tick();assert.equal(a.client.state.connected,false);assert.equal(a.client.state.running,true);
  await h.fire(1000);assert.equal(h.attached('a').args.cursor.seq,5);assert.equal(a.client.state.connected,true);
  assert.equal(h.calls.filter(c=>c.method==='acpStart'||c.method==='acpResume').length,1);
});
for(const evicted of [false,true])test(`Host disconnect and reopen restores long command rosters without duplicates (${evicted?'cold client':'warm client'})`,async t=>{
  const initial=Array.from({length:48},(_,i)=>({name:`skill-${i}`,description:'中文说明 / mixed English '.repeat(30)}));
  let roster=initial;
  const cursor={generation:'g',seq:10};
  const restored=()=>({...snapshot('a'),transportState:'connected',cursor,commands:roster});
  const h=harness(t,{api:(method,args)=>{
    if(method==='acpResume'&&args.id==='acp:a')return {ok:true,session:restored()};
    if(method==='acpEvents'&&args.id==='acp:a')return {ok:true,session:restored(),events:[ev(10,{type:'text',text:'retained history'})],cursor,oldestSeq:10,hasEarlier:true};
  }});
  const a=await h.acquire('a');a.client.composer.setDraft('/');
  const original=h.attached('a');
  original.emit({type:'snapshot',state:{...restored(),transportState:'disconnected'}});
  assert.equal(a.client.state.binding.transportState,'disconnected');
  original.reject(new Error('Host network disconnected'));await tick();
  assert.equal(a.client.state.connected,false);a.release();
  if(evicted){await h.fire(600000);assert.equal(a.client.disposed,true);}
  roster=[{name:'skills',description:'List available skills'},...initial];
  const back=await h.acquire({...backend('a'),binding:{id:'acp:a'}});
  assert.equal(back.client===a.client,!evicted);
  assert.equal(back.client.state.connected,true);
  assert.equal(back.client.state.binding.transportState,'connected');
  assert.equal(back.client.composer.getSnapshot().draft,'/');
  const current=h.attached('a');
  current.emit(ev(11,{type:'commands',commands:roster}));
  current.emit(ev(11,{type:'commands',commands:roster}));
  assert.equal(back.client.state.commands.length,49);
  assert.deepEqual(back.client.state.commands,roster);
  assert.equal(new Set(back.client.state.commands.map(item=>item.name)).size,49);
  assert.equal(h.calls.filter(call=>call.method==='acpStart').length,1);
  assert.equal(h.calls.filter(call=>call.method==='acpResume').length,1);
  assert.equal(h.streams.filter(row=>!row.signal.aborted&&row!==original).length,1);
  assert.ok(!h.calls.some(call=>['acpPrompt','acpQueue','acpSteer','acpCancel','acpClose'].includes(call.method)));
});

test('missing heartbeats abort only the HTTP subscription and trigger a real reconnect',async t=>{
  const h=harness(t),a=await h.acquire('a'),first=h.attached('a');a.client.publish({running:true});
  await h.fire(45000);assert.equal(first.signal.aborted,true);assert.equal(a.client.state.connected,false);assert.equal(a.client.state.running,true);
  await h.fire(1000);assert.notEqual(h.attached('a'),first);assert.equal(a.client.state.connected,true);
  assert.equal(a.client.state.transportError,'');
});
test('authorization loss clears pooled sensitive state and stops retries until explicit reauthorization',async t=>{
  const h=harness(t),a=await h.acquire('a');h.attached('a').emit(ev(1,{type:'text',text:'secret'}));a.client.composer.setDraft('private');a.release();
  const b=await h.acquire('b');h.attached('b').reject(Object.assign(new Error('denied'),{code:'remote_access_denied'}));await tick();
  assert.equal(a.client.state.items.length,0);assert.equal(b.client.state.items.length,0);assert.equal(a.client.composer.getSnapshot().draft,'');
  assert.equal(a.client.retryBlocked,true);assert.equal(b.client.retryBlocked,true);assert.equal([...h.timers.values()].some(v=>v.ms<=45000),false);
  await b.client.connect();assert.equal(b.client.state.connected,true);
});
test('missing remote runtime is explicit, not an endless attach retry or an automatic new Agent',async t=>{
  const h=harness(t),a=await h.acquire('a');h.attached('a').reject(Object.assign(new Error('resume required'),{code:'acp_not_running'}));await tick();
  assert.equal(a.client.state.failure.code,'acp_not_running');assert.equal(a.client.retryBlocked,true);
  assert.equal([...h.timers.values()].some(v=>v.ms===1000),false);
  await a.client.connect();assert.equal(h.calls.filter(c=>c.method==='acpResume').length,1);assert.equal(a.client.state.connected,true);
});
test('pool belongs to plugin lifetime and UI detachment releases only its lease',()=>{
  const source=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
  const index=source('index.js'),chat=source('chat.js'),tail=source('transcript.js');
  assert.ok(index.indexOf('const clients=new SessionClientPool()')<index.indexOf("slots.inject('main.conversation'"));
  assert.match(index,/ctx.effect\(\(\)=>\(\)=>clients.dispose\(\)\)/);
  assert.match(chat,/return \(\)=>lease.release\(\)/);assert.doesNotMatch(chat,/new SessionClient\(|next.dispose\(|onAcknowledged/);
  assert.match(chat,/useSyncExternalStore\(composer.subscribe,composer.getSnapshot/);
  assert.match(tail,/conversationActivity\(state\)/);
  assert.match(tail,/connecting:'flow.connecting',reconnecting:'flow.connection'/);
  assert.match(source('stream-view-model.js'),/state.everConnected\?'reconnecting':'connecting'/);
});


test('late startup and action responses cannot repopulate snapshots after access invalidation',async t=>{
  let completeStart,completeAction;
  const start=new Promise(resolve=>completeStart=resolve),action=new Promise(resolve=>completeAction=resolve);
  const h=harness(t,{api:method=>method==='acpStart'?start:method==='acpState'?action:undefined});
  const lease=h.pool.acquire(backend('a')),pending=lease.client.connect();
  h.pool.invalidate(Object.assign(new Error('revoked'),{code:'remote_access_denied'}));
  completeStart({ok:true,session:snapshot('a')});await pending;
  assert.equal(lease.client.state.binding,null);assert.equal(lease.client.state.failure.code,'remote_access_denied');
  await lease.client.connect();
  const read=lease.client.action('acpState');const rejected=assert.rejects(read,{code:'cancelled'});
  h.pool.invalidate(Object.assign(new Error('revoked again'),{code:'remote_access_denied'}));
  completeAction({ok:true,session:snapshot('a')});await rejected;assert.equal(lease.client.state.binding,null);
});
test('late history after revocation cannot restore transcript or trigger saved acknowledgments',async t=>{
  let complete;
  const history=new Promise(resolve=>complete=resolve);
  const h=harness(t,{api:(method,args)=>method==='acpEvents'&&args.beforeSeq?history:undefined}),a=await h.acquire('a');
  const pending=a.client.history(10),rejected=assert.rejects(pending,{code:'cancelled'});
  h.pool.invalidate(Object.assign(new Error('revoked'),{code:'remote_access_denied'}));
  complete({ok:true,session:snapshot('a'),events:[ev(1,{type:'text',text:'old private text'})],cursor:{generation:'g',seq:1}});
  await rejected;assert.equal(a.client.state.items.length,0);assert.equal(a.client.state.binding,null);
});
test('passive remount and new cached clients remain blocked after auth denial',async t=>{
  const h=harness(t),a=await h.acquire('a');h.pool.invalidate(Object.assign(new Error('revoked'),{code:'remote_access_denied'}));await tick();
  const count=h.calls.length;a.release();const again=h.pool.acquire(backend('a'));await again.client.ensureConnected();
  const other=h.pool.acquire(backend('b'));await other.client.ensureConnected();
  assert.equal(h.calls.length,count);assert.equal(other.client.retryBlocked,true);
  await again.client.connect();assert.equal(again.client.state.connected,true);assert.equal(h.pool.denied,null);
});
test('leased identity replacement is rejected without orphaning existing readers',async t=>{
  const h=harness(t),a=await h.acquire('a');
  const changed={...backend('a'),workspace:{...backend('a').workspace,profileId:'other'}};
  assert.throws(()=>h.pool.acquire(changed),{code:'binding_mismatch'});assert.equal(a.client.disposed,false);
  a.client.composer.setDraft('do not transfer');a.release();
  const next=await h.acquire(changed);assert.equal(next.client.composer.getSnapshot().draft,'');
  assert.equal([...h.pool.drafts.values()].some(d=>d.getSnapshot().draft==='do not transfer'),false);
});
test('identity changes after eviction cannot inherit a pending draft from another workspace',async t=>{
  const h=harness(t),a=await h.acquire('a');a.client.composer.setDraft('old workspace');a.release();
  const b=await h.acquire('b');b.release();const c=await h.acquire('c');c.release();
  const next=await h.acquire({...backend('a'),workspace:{...backend('a').workspace,profileId:'new-profile'}});
  assert.equal(next.client.composer.getSnapshot().draft,'');
});
test('Retry resumes a fatal runtime rather than merely retaining its old attach',async t=>{
  const h=harness(t),a=await h.acquire('a');h.attached('a').emit(ev(1,{type:'error',fatal:true,message:'runtime died'}));
  assert.equal(a.client.state.binding.status,'error');
  await a.client.connect();await tick();assert.equal(h.calls.filter(c=>c.method==='acpResume').length,1);
  assert.equal(a.client.state.binding.status,'ready');
});
test('explicit Retry reattaches a failed SSH owner even when its HTTP subscription is healthy',async t=>{
  const h=harness(t),a=await h.acquire('a');
  a.client.state={...a.client.state,binding:{...a.client.state.binding,transportState:'error',remoteExecution:{id:'owner'}}};
  assert.equal(a.client.state.connected,true);
  await a.client.connect();await tick();
  assert.equal(h.calls.filter(call=>call.method==='acpResume').length,1);
  assert.equal(h.calls.filter(call=>call.method==='acpStart').length,1);
});
test('prompt EOF without an ACK stays explicitly uncertain and never clears the draft',async t=>{
  const h=harness(t),a=await h.acquire('a');a.client.composer.setDraft('message');
  const pending=a.client.sendDraft();await tick();const prompt=h.streams.find(s=>s.method==='acpPrompt');
  const failure=assert.rejects(pending,{code:'acknowledgment_unknown'});prompt.resolve();await failure;
  assert.equal(a.client.composer.pending.requestId,prompt.args.requestId);assert.equal(a.client.composer.getSnapshot().draft,'message');
  assert.match(a.client.composer.getSnapshot().error,/acknowledgment is unknown/);
});
test('prompt authorization denial cannot trigger a post-denial state query',async t=>{
  const h=harness(t),a=await h.acquire('a');a.client.composer.setDraft('message');
  const pending=a.client.sendDraft();await tick();const prompt=h.streams.find(s=>s.method==='acpPrompt');
  const failure=assert.rejects(pending,{code:'remote_access_denied'});
  prompt.reject(Object.assign(new Error('revoked'),{code:'remote_access_denied'}));await failure;
  assert.equal(h.calls.filter(c=>c.method==='acpState').length,0);assert.equal(a.client.state.binding,null);
});
test('non-JSON HTTP authorization failures retain 401/403 codes in both transports',async t=>{
  let status=401;
  t.mock.method(globalThis,'fetch',async()=>({ok:false,status,json:async()=>{throw new SyntaxError('HTML error page');}}));
  for(status of [401,403]){
    assert.equal((await api('acpState')).code,`http_${status}`);
    await assert.rejects(stream('acpAttach',{},new AbortController().signal,()=>{}),{code:`http_${status}`});
  }
});


test('late authorization error from an evicted prompt cannot clear new session data',async t=>{
  let rejectOld;
  const old=new Promise((resolve,reject)=>rejectOld=reject);
  const h=harness(t,{stream:method=>method==='acpPrompt'?old:undefined}),a=await h.acquire('a');
  a.client.composer.setDraft('old request');const pending=a.client.sendDraft();await tick();a.release();
  const b=await h.acquire('b');b.release();const c=await h.acquire('c');
  c.client.composer.setDraft('new private draft');h.attached('c').emit(ev(1,{type:'text',text:'new session'}));
  const rejected=assert.rejects(pending,{code:'remote_access_denied'});rejectOld(Object.assign(new Error('old denial'),{code:'remote_access_denied'}));await rejected;
  assert.equal(c.client.state.items[0].text,'new session');assert.equal(c.client.composer.getSnapshot().draft,'new private draft');assert.equal(h.pool.denied,null);
});
test('evicted pending requests cannot cross a changed ACP binding or canonical workspace root',async t=>{
  const h=harness(t),first={...backend('a'),canonicalRemotePath:'/root-one'};
  const a=await h.acquire(first);a.client.composer.setDraft('pending');const request=a.client.composer.begin('prompt');a.client.composer.finish(request.request,request.attempt,new Error('unknown'));
  a.release();const b=await h.acquire('b');b.release();const c=await h.acquire('c');c.release();
  const replacement=await h.acquire({...first,binding:{id:'different'}});
  assert.equal(replacement.client.composer.pending,null);assert.equal(replacement.client.composer.getSnapshot().draft,'');
  replacement.client.composer.setDraft('new pending');replacement.release();
  const d=await h.acquire('d');d.release();const e=await h.acquire('e');e.release();
  const changedRoot=await h.acquire({...first,canonicalRemotePath:'/root-two'});
  assert.equal(changedRoot.client.composer.getSnapshot().draft,'');
});
test('a replacement binding discovered only by startup also clears the old uncertain request',async t=>{
  let replacement=false;
  const h=harness(t,{api:method=>replacement&&method==='acpStart'?{ok:true,session:{...snapshot('a'),id:'replacement'}}:undefined});
  const a=await h.acquire('a');a.client.composer.setDraft('pending');const first=a.client.composer.begin('prompt');a.client.composer.finish(first.request,first.attempt,new Error('unknown'));
  a.release();const b=await h.acquire('b');b.release();const c=await h.acquire('c');c.release();replacement=true;
  const next=await h.acquire('a');assert.equal(next.client.composer.pending,null);assert.equal(next.client.composer.getSnapshot().draft,'');
});
test('connection failures before the first frame back off up to ten seconds',async t=>{
  const h=harness(t,{stream:method=>method==='acpAttach'?Promise.reject(new Error('network unavailable')):undefined});
  const a=await h.acquire('a');await tick();
  for(const delay of [1000,2000,4000,8000,10000,10000])await h.fire(delay);
  assert.equal(a.client.state.connected,false);assert.equal(a.client.retryBlocked,false);
  assert.equal(h.calls.filter(c=>c.method==='acpStart').length,1);
});
