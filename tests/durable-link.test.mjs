import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {randomBytes,randomUUID} from 'node:crypto';
import {createDurableLink} from '../lib/durable-link.js';
const gate=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
function harness(t,{onFrame,onSpawn,...options}={}){
  const identity={id:randomUUID(),epoch:randomUUID(),token:randomBytes(32).toString('hex'),binding:{generation:'g'}};
  const children=[];
  const spawn=()=>{
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.send=value=>child.stdout.write(JSON.stringify(value)+'\n');
    child.kill=()=>{if(child.killed)return;child.killed=true;child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();queueMicrotask(()=>child.emit('close',null,'SIGTERM'));};
    const index=children.push(child)-1;let input='';
    child.stdin.on('data',chunk=>{
      input+=chunk;let end;
      while((end=input.indexOf('\n'))>=0){
        const frame=JSON.parse(input.slice(0,end));input=input.slice(end+1);
        if(onFrame?.(frame,child,index,identity)===false)continue;
        if(frame.type==='attach')queueMicrotask(()=>child.send({type:'attached',id:identity.id,epoch:identity.epoch,binding:identity.binding,headSeq:0,fence:1,state:{status:'ready'}}));
        if(frame.type==='query')queueMicrotask(()=>child.send({type:'operations',operations:frame.opIds.map(opId=>({opId,status:'not_found'}))}));
      }
    });
    onSpawn?.(child,index);return child;
  };
  const link=createDurableLink({identity,launchSpec:{command:'fake',args:[],bootstrap:{v:1,type:'bootstrap'}},spawn,retryDelays:[5],...options});
  t.after(()=>link.close());return {link,children,identity};
}

test('slow event persistence applies stdout backpressure instead of an unbounded promise queue',{timeout:5000},async t=>{
  const blocked=gate(),drained=gate();let received=0;
  const {link,children}=harness(t,{async onEvent(){received++;if(received===1)await blocked.promise;if(received===400)drained.resolve();}});
  await link.start();
  const wire=Array.from({length:400},(_,index)=>JSON.stringify({type:'event',event:{generation:'g',seq:index+1,text:'x'.repeat(4096)}})+'\n').join('');
  children[0].stdout.write(wire);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(received,1);assert.equal(children[0].stdout.isPaused(),true);
  blocked.resolve();await drained.promise;
  await new Promise(resolve=>setImmediate(resolve));assert.equal(children[0].stdout.isPaused(),false);
});

test('every reconnect has a handshake timeout and stream errors detach only the link',{timeout:5000},async t=>{
  const reconnected=gate();let connections=0;
  const {link,children}=harness(t,{startTimeoutMs:80,
    onFrame(frame,_child,index){if(index===1&&frame.type==='attach')return false;},
    onConnection(value){if(value.state==='connected'&&++connections===2)reconnected.resolve();}});
  await link.start();
  assert.ok(children[0].stdout.listenerCount('error'));assert.ok(children[0].stderr.listenerCount('error'));
  children[0].stdout.emit('error',new Error('broken SSH pipe'));
  await reconnected.promise;
  assert.ok(children.length>=3);assert.equal(children[1].killed,true);
});

test('operation input is immutable and a result for another payload never settles it as success',async t=>{
  const sent=gate();
  const {link}=harness(t,{onFrame(frame,child){if(frame.type==='call'){sent.resolve(frame);child.send({type:'result',opId:frame.opId,digest:'not-the-same-arguments',ok:true,value:'wrong task'});}}});
  const args={text:'original',requestId:'one'};
  const operation=link.call('prompt',args,{opId:'one'});args.text='mutated';
  assert.equal((await sent.promise).args.text,'original');
  await assert.rejects(operation,{code:'operation_conflict'});
});

test('bounded outbox refuses additional operations without dropping existing identities',async t=>{
  const {link}=harness(t,{onFrame(frame){if(frame.type==='attach')return false;}});
  for(let index=0;index<1024;index++)void link.call('prompt',{text:'queued',requestId:String(index)},{opId:String(index)});
  await assert.rejects(link.call('prompt',{text:'overflow'},{opId:'overflow'}),{code:'remote_outbox_full'});
  await link.close();
});
