import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,chmodSync,fsyncSync,rmSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,randomBytes} from 'node:crypto';
import {AcpSession} from '../lib/acp.js';
import {createDurableBroker} from '../lib/durable-broker.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,failureType){
  const parent=realpathSync(tmpdir()),directory=mkdtempSync(join(parent,'rssh-queue-fsync-'));chmodSync(directory,0o700);
  const calls=[],pending=[];let armed=false,broken=false,session;
  const controller={ready:Promise.resolve({sessionId:'remote',protocolCwd:'/remote',initialize:{agentCapabilities:{}},sessionResponse:{sessionId:'remote',modes:{currentModeId:'acceptEdits',availableModes:[{id:'acceptEdits',name:'Accept edits'}]}}}),
    prompt:text=>{calls.push(text);return new Promise(resolve=>pending.push(resolve));},
    async close(){while(pending.length)pending.shift()({stopReason:'cancelled'});},async dispose(){},async setMode(){return {};}};
  const broker=createDurableBroker({directory,identity:{id:randomUUID(),epoch:randomUUID(),token:randomBytes(32).toString('hex'),binding:{agent:'claude'}},
    syncFile:fd=>{if(broken)throw Object.assign(new Error('simulated fsync failure'),{code:'EIO'});fsyncSync(fd);},
    createSession:hooks=>(session=new AcpSession({id:'owner',agent:'claude',profile:{host:'unused.invalid',user:'fixture'},remotePath:'/remote',connectImpl:()=>controller,...hooks,
      onEvent:(event,owner)=>{broken=armed&&event.type===failureType;try{hooks.onEvent(event,owner);}finally{broken=false;}}}))});
  t.after(async()=>{await broker.close();assert.equal(realpathSync(directory),directory);assert.equal(dirname(directory),parent);assert.ok(basename(directory).startsWith('rssh-queue-fsync-'));rmSync(directory,{recursive:true,force:true});});
  await broker.listen(join(directory,'socket'));await broker.start();
  return {session,broker,calls,pending,arm:()=>{armed=true;}};
}
test('admission event fsync failure freezes drain synchronously before the initial prompt can start',async t=>{
  const f=await fixture(t,'user_message');f.arm();await f.session.queue('must not execute',{requestId:'queued'});await tick();
  assert.deepEqual(f.calls,[]);assert.equal(f.session.closed,true);assert.ok(f.session.persistenceError);
});
test('stop event fsync failure cannot submit the next queued prompt before asynchronous owner close',async t=>{
  const f=await fixture(t,'stop');const first=f.session.prompt('first',{requestId:'first'});first.catch(()=>{});
  await f.session.queue('must not execute',{requestId:'next'});assert.deepEqual(f.calls,['first']);
  f.arm();f.pending.shift()({stopReason:'end_turn'});await Promise.allSettled([first]);await tick();
  assert.deepEqual(f.calls,['first']);assert.equal(f.session.closed,true);assert.ok(f.session.persistenceError);
});
