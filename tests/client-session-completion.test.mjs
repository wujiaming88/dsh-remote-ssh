import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SessionStatusStore,sessionStatusEntry} from '../src/client/session-status-store.js';
import {CompletionReceipts,watchSessionCompletion} from '../src/client/session-completion.js';
const FIRST='1'.repeat(64),NEXT='2'.repeat(64),THIRD='3'.repeat(64);
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function fixture(backing=storage(),options={}){
  const receipts=new CompletionReceipts({storage:()=>backing}),store=new SessionStatusStore({receipts,...options});
  return {store,receipts,backing,done(id='a',completionId=FIRST){store.receive({type:'upsert',session:{sessionId:id,status:'completed',completionId}});},row:id=>store.getSnapshot().byId[id||'a']};
}
function seen(f,id='a'){const dispose=f.store.watchView(id,()=>true);dispose();}

test('opening a completed conversation consumes its green marker, not the execution outcome',()=>{
  const f=fixture();f.done();assert.equal(f.row().completionUnread,true);
  seen(f);assert.equal(f.row().completionUnread,false);assert.equal(f.row().status,'completed');assert.equal(f.receipts.get('a'),FIRST);
  f.done('a',NEXT);assert.equal(f.row().completionUnread,true);f.store.dispose();
});
test('foreground completion never leaves unread; running, waiting and failure remain factual',()=>{
  const f=fixture();const release=f.store.watchView('a',()=>true);
  for(const status of ['running','waiting','error','stopped']){
    f.store.receive({type:'upsert',session:{sessionId:'a',status,waitingFor:'permission'}});assert.equal(f.row().status,status);
  }
  f.done();assert.equal(f.row().completionUnread,false);release();f.store.dispose();
});
test('viewing one conversation never consumes another conversation completion',()=>{
  const f=fixture();const release=f.store.watchView('a',()=>true);f.done('b');assert.equal(f.row('b').completionUnread,true);
  f.done('a');assert.equal(f.row('a').completionUnread,false);release();f.store.dispose();
});
test('fresh completion identity reappears even if intermediate running updates were missed',()=>{
  const f=fixture();f.done();seen(f);f.done('a',NEXT);assert.equal(f.row().completionUnread,true);
  const snapshot=f.store.getSnapshot();f.done('a',NEXT);assert.equal(f.store.getSnapshot(),snapshot);
  seen(f);f.done('a',THIRD);assert.equal(f.row().completionUnread,true);f.store.dispose();
});
test('reconnect and transient resets cannot revive the same acknowledged completion',()=>{
  const f=fixture();f.done();seen(f);f.store.unknown();assert.equal(f.row().status,'unknown');
  f.store.receive({type:'snapshot',sessions:[{sessionId:'a',status:'completed',completionId:FIRST}]});assert.equal(f.row().completionUnread,false);
  f.store.receive({type:'reset',reason:'unavailable'});f.done();assert.equal(f.row().completionUnread,false);f.store.dispose();
});
test('opening during an outage acknowledges only the already observed completion',()=>{
  const f=fixture();f.done();f.store.unknown();f.store.unknown();seen(f);
  assert.equal(f.row().status,'unknown');assert.equal(f.receipts.get('a'),FIRST);
  f.done();assert.equal(f.row().completionUnread,false);
  f.store.unknown();seen(f);f.done('a',NEXT);assert.equal(f.row().completionUnread,true);f.store.dispose();
});
test('read receipts survive tab reload without suppressing future turns',()=>{
  const backing=storage(),first=fixture(backing);first.done();seen(first);first.store.dispose();
  const second=fixture(backing);second.done();assert.equal(second.row().completionUnread,false);
  second.done('a',NEXT);assert.equal(second.row().completionUnread,true);second.store.dispose();
});
test('completion identity is allowlisted and wire flags cannot spoof locally read state',()=>{
  const f=fixture();
  for(const completionId of [undefined,'unscoped','../secret','a'.repeat(65)]){
    f.done('a',completionId===undefined?null:completionId);assert.equal(f.row().completionUnread,false);assert.equal(f.row().completionId,undefined);
  }
  f.store.receive({type:'upsert',session:{sessionId:'a',status:'completed',completionId:FIRST,completionUnread:false}});
  assert.equal(f.row().completionUnread,true);
  assert.deepEqual(sessionStatusEntry({sessionId:'a',status:'running',completionId:FIRST,completionUnread:true}),{sessionId:'a',status:'running'});f.store.dispose();
});
test('hidden, unfocused and non-conversation panels do not acknowledge completed work',()=>{
  const f=fixture();let visible=false,focused=true,conversation=true,notify,unsubscribed=0;
  const dispose=watchSessionCompletion(f.store,'a',{canView:()=>conversation,isForeground:()=>visible&&focused,subscribe:fn=>{notify=fn;return ()=>unsubscribed++;}});
  f.done();assert.equal(f.row().completionUnread,true);
  visible=true;focused=false;notify();assert.equal(f.row().completionUnread,true);
  focused=true;conversation=false;notify();assert.equal(f.row().completionUnread,true);
  conversation=true;notify();assert.equal(f.row().completionUnread,false);
  conversation=false;f.done('a',NEXT);assert.equal(f.row().completionUnread,true);
  dispose();assert.equal(unsubscribed,1);assert.equal(f.store.views.size,0);f.store.dispose();
});
test('navigation is sampled on delivery, before an old mounted effect has cleaned up',()=>{
  const f=fixture();let current='a';const old=f.store.watchView('a',()=>current==='a');
  current='b';f.done('a');assert.equal(f.row('a').completionUnread,true);
  const next=f.store.watchView('b',()=>current==='b');old();f.done('b');assert.equal(f.row('b').completionUnread,false);next();f.store.dispose();
});
test('view leases clean up independently and disposal cannot leave an active reader',()=>{
  const f=fixture();const one=f.store.watchView('a',()=>true),two=f.store.watchView('a',()=>true);one();f.done();assert.equal(f.row().completionUnread,false);
  two();f.done('a',NEXT);assert.equal(f.row().completionUnread,true);
  f.store.watchView('a',()=>true);f.store.dispose();assert.equal(f.store.views.size,0);
});
test('session removal and global revocation purge remembered receipts',()=>{
  const f=fixture();f.done();seen(f);f.store.receive({type:'remove',sessionId:'a'});assert.equal(f.receipts.get('a'),undefined);assert.equal(f.backing.values.size,0);
  f.done();assert.equal(f.row().completionUnread,true);seen(f);
  f.store.receive({type:'reset',reason:'access_revoked'});assert.equal(f.receipts.get('a'),undefined);assert.equal(f.backing.values.size,0);f.store.dispose();
});
test('unsupported overview stops retrying but preserves read receipts through a later reload',async()=>{
  for(const code of ['http_404','api_not_found']){
    const backing=storage(),f=fixture(backing,{connect:async()=>{throw Object.assign(Error('unsupported'),{code});}});
    f.done();seen(f);f.store.start();await f.store.task;
    assert.equal(f.store.blocked,true);assert.deepEqual(f.store.getSnapshot().byId,{});
    assert.equal(f.receipts.get('a'),FIRST);assert.equal(f.store.retry,null);f.store.dispose();
    const reloaded=fixture(backing);reloaded.done();assert.equal(reloaded.row().completionUnread,false);reloaded.store.dispose();
  }
});
test('authorization failures stop retrying and purge persisted read receipts',async()=>{
  for(const code of ['remote_access_denied','request_forbidden','unauthenticated','http_401','http_403']){
    const f=fixture(storage(),{connect:async()=>{throw Object.assign(Error('denied'),{code});}});
    f.done();seen(f);f.store.start();await f.store.task;
    assert.equal(f.store.blocked,true);assert.equal(f.receipts.get('a'),undefined);assert.equal(f.backing.values.size,0);assert.equal(f.store.retry,null);f.store.dispose();
  }
});

test('authoritative snapshots remove receipts for sessions no longer visible to this feed',()=>{
  const f=fixture();f.done();seen(f);f.store.receive({type:'snapshot',sessions:[]});assert.equal(f.receipts.get('a'),undefined);f.store.dispose();
});
test('blocked storage still supports in-memory read acknowledgement',()=>{
  for(const backing of [{getItem(){throw Error('denied');},setItem(){throw Error('quota');},removeItem(){throw Error('denied');}},undefined]){
    const receipts=new CompletionReceipts({storage:()=>backing});receipts.mark('a',FIRST);assert.equal(receipts.get('a'),FIRST);receipts.clear();assert.equal(receipts.get('a'),undefined);
  }
});
test('corrupt, oversized and untrusted stored receipts are bounded and sanitized',()=>{
  for(const raw of ['broken','x'.repeat(2*1024*1024+1),JSON.stringify({version:2,entries:[['a',FIRST]]})]){
    assert.equal(new CompletionReceipts({storage:()=>({getItem:()=>raw})}).get('a'),undefined);
  }
  const raw=JSON.stringify({version:1,entries:[['a',FIRST],['b','bad'],['',NEXT],['constructor',NEXT]]});
  const receipts=new CompletionReceipts({storage:()=>({getItem:()=>raw})});assert.equal(receipts.get('a'),FIRST);assert.equal(receipts.get('b'),undefined);assert.equal(receipts.get('constructor'),NEXT);
});
test('integration uses mounted conversation and public panel identity, not row clicks or retained clients',()=>{
  const index=readFileSync(new URL('../src/client/index.js',import.meta.url),'utf8');
  const source=readFileSync(new URL('../src/client/session-completion.js',import.meta.url),'utf8');
  assert.match(index,/props.usePanelInfo\(info=>info.activePanelId===null\)/);
  assert.match(index,/useEffect\(\(\)=>viewing\?props.trackSessionView\(props.sessionId\):undefined/);
  assert.match(index,/ctx.uiSession.adapter.current.getSnapshot\(\).key===sessionId/);
  assert.match(index,/ctx.layout.panelInfo.getSnapshot\(\).activePanelId===null/);
  assert.match(index,/router\?\.getSnapshot\(\).phase==='remote'/);
  assert.match(source,/visibilityState==='visible'/);assert.match(source,/hasFocus\(\)===true/);
  for(const event of ['visibilitychange','focus','blur']){
    assert.ok(source.includes(`addEventListener('${event}'`));assert.ok(source.includes(`removeEventListener('${event}'`));
  }
  assert.doesNotMatch(source,/querySelector|@deepseek-ai|markSeen|fetch\(|localStorage/);
});
