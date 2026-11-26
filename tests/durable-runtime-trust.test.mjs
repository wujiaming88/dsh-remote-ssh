import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {buildDurableLaunchSpec,durableRemoteHelper} from '../lib/durable-launch.js';
import {createDurableLink} from '../lib/durable-link.js';

const require=createRequire(import.meta.url);
const currentUid=501,root='/shared/dependencies/runtime';
const identity={id:'runtime-test-identity',token:'a'.repeat(64),binding:{generation:'test'}};
const directory=root+'/durable-runs/'+identity.id;
const stats=({uid=currentUid,gid=20,mode=0o700,type='directory'}={})=>({uid,gid,mode,
  isDirectory:()=>type==='directory',isFile:()=>type==='file',isSymbolicLink:()=>type==='symlink'});

// Execute the production zero-argument serialized helper, not a copy of its
// policy. All filesystem calls are simulated; no SSH, disk writes or ACP spawn.
async function runHelper({runtime=root,runtimeStat=stats(),entries={},ancestors={}}={}){
  const inspected=[],resolved=[];
  const proc=new EventEmitter();
  proc.stdin=new PassThrough();proc.stdout=new PassThrough();proc.versions={node:'22.0.0'};
  proc.getuid=()=>currentUid;
  const fs={
    realpathSync(value){resolved.push(value);return root;},
    statSync(value){inspected.push(value);if(value===root)return runtimeStat;if(value in ancestors)return ancestors[value];throw Error('Unexpected stat: '+value);},
    lstatSync(value){
      inspected.push(value);
      if(value in entries)return entries[value];
      if(value===root+'/durable-runs'||value===directory)return stats();
      if(value===directory+'/launch.json')throw Object.assign(Error('Private metadata checkpoint'),{code:'test_checkpoint'});
      throw Error('Unexpected lstat: '+value);
    },
  };
  const output=new Promise(resolve=>proc.stdout.once('data',chunk=>resolve(JSON.parse(String(chunk)))));
  runInNewContext('('+durableRemoteHelper.toString()+')()',{
    Buffer,process:proc,require(name){
      if(name==='node:fs')return fs;
      if(name==='node:child_process')return {spawn(){throw Error('Must not spawn ACP');}};
      if(name==='node:net')return {createConnection(){throw Error('Must not connect');}};
      return require(name);
    },
  });
  proc.stdin.write(JSON.stringify({v:1,type:'bootstrap',identity,create:false,runtimeDir:runtime})+'\n');
  const frame=await output;
  assert.equal(frame.type,'fatal');
  assert.equal(proc.exitCode,2);
  return {error:frame.error,inspected,resolved};
}

for(const [name,uid,mode] of [
  ['foreign-owned 0755',1234,0o755],
  ['foreign-owned world-writable',1234,0o777],
  ['foreign-owned sticky',1234,0o1777],
  ['root-owned sticky',0,0o1777],
  ['current-user group-writable',currentUid,0o775],
])test('trusted dependency runtime permits '+name+' roots and ancestors',async()=>{
  const {error,inspected}=await runHelper({runtimeStat:stats({uid,mode}),ancestors:{'/shared':stats({uid,mode}),'/shared/dependencies':stats({uid,mode})}});
  assert.equal(error.code,'test_checkpoint');
  assert.deepEqual(inspected,[root,root+'/durable-runs',directory,directory+'/launch.json']);
});

test('runtime aliases resolve to the canonical dependency directory before private checks',async()=>{
  const {error,resolved,inspected}=await runHelper({runtime:'/alias/runtime',runtimeStat:stats({uid:1234,mode:0o777})});
  assert.equal(error.code,'test_checkpoint');
  assert.deepEqual(resolved,['/alias/runtime']);
  assert.equal(inspected[0],root);
  assert.equal(inspected[1],root+'/durable-runs');
});

test('non-directory runtime reports exact canonical diagnostic through fatal wire',async()=>{
  const {error,inspected}=await runHelper({runtime:'/alias/runtime',runtimeStat:stats({uid:1234,gid:42,mode:0o100644,type:'file'})});
  assert.deepEqual(error,{
    code:'remote_unsafe_runtime',
    message:'Unsafe remote runtime path "/shared/dependencies/runtime": uid=1234 gid=42 mode=0644 reason=not_directory',
    details:{runtimeSafety:{path:root,uid:1234,gid:42,mode:'0644',reason:'not_directory',currentUid,runtimeRoot:root,trustable:false}},
  });
  assert.deepEqual(inspected,[root]);
});

for(const area of ['registry','session'])for(const [name,entry] of [
  ['foreign-owned',stats({uid:1234})],
  ['group-readable',stats({mode:0o740})],
  ['world-writable',stats({mode:0o702})],
  ['symlink',stats({type:'symlink'})],
  ['regular-file',stats({type:'file'})],
])test('private '+area+' still denies '+name,async()=>{
  const path=area==='registry'?root+'/durable-runs':directory;
  const {error}=await runHelper({runtimeStat:stats({uid:1234,mode:0o777}),entries:{[path]:entry}});
  assert.equal(error.code,'remote_private_directory');
});

for(const [name,entry] of [
  ['foreign-owned',stats({uid:1234,mode:0o600,type:'file'})],
  ['group-readable',stats({mode:0o640,type:'file'})],
  ['world-writable',stats({mode:0o602,type:'file'})],
  ['symlink',stats({mode:0o600,type:'symlink'})],
  ['directory',stats()],
])test('private metadata still denies '+name,async()=>{
  const {error}=await runHelper({entries:{[directory+'/launch.json']:entry}});
  assert.equal(error.code,'remote_private_file');
});

test('bootstrap identity and session secrets stay in stdin, not SSH argv',()=>{
  const launch=buildDurableLaunchSpec({profile:{host:'example.invalid',user:'test',authMethod:'key'},identity,
    workerSource:'worker-test-source',sessionOptions:{secret:'only-on-stdin-secret'},create:true});
  assert.equal(JSON.stringify(launch.args).includes(identity.token),false);
  assert.equal(JSON.stringify(launch.args).includes('only-on-stdin-secret'),false);
  assert.equal(JSON.stringify(launch.args).includes('worker-test-source'),false);
  assert.equal(launch.bootstrap.identity.token,identity.token);
  assert.equal(launch.bootstrap.sessionOptions.secret,'only-on-stdin-secret');
});

for(const type of ['fatal','error','result'])test('durable link preserves structured details for '+type,async t=>{
  const details={runtimeSafety:{path:root,uid:1234,gid:42,mode:'0644',reason:'not_directory',currentUid,runtimeRoot:root,trustable:false}};
  const remoteError={code:'remote_unsafe_runtime',message:'Exact failure',details};
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.kill=()=>{child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();};
  const states=[];let wire='';
  child.stdin.on('data',chunk=>{
    wire+=chunk;let end;
    while((end=wire.indexOf('\n'))>=0){
      const frame=JSON.parse(wire.slice(0,end));wire=wire.slice(end+1);
      if(frame.type==='attach')queueMicrotask(()=>child.stdout.write(JSON.stringify(type==='result'
        ?{type:'attached',id:identity.id,epoch:'test-epoch',binding:identity.binding,headSeq:0,fence:1}
        :{type,error:remoteError})+'\n'));
      if(frame.type==='call')queueMicrotask(()=>child.stdout.write(JSON.stringify({type:'result',opId:frame.opId,ok:false,error:remoteError})+'\n'));
    }
  });
  const link=createDurableLink({identity,launchSpec:{command:'fake',args:[],bootstrap:{type:'bootstrap'}},spawn:()=>child,onConnection:state=>states.push(state)});
  t.after(()=>link.close());
  const operation=type==='result'?link.start().then(()=>link.call('status')):link.start();
  await assert.rejects(operation,error=>{
    assert.equal(error.code,remoteError.code);assert.equal(error.message,remoteError.message);assert.deepEqual(error.details,details);return true;
  });
  if(type!=='result')assert.deepEqual(states.find(state=>state.state==='error').details,details);
});
