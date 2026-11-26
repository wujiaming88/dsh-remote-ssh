/** Remote-only entry point, bundled with build:remote and never run by the Host. */
import {writeFileSync,openSync,closeSync,fsyncSync,renameSync,lstatSync,realpathSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {AcpSession} from './acp.js';
import {connectAcp} from './acp-transport.js';
import {createDurableBroker} from './durable-broker.js';

export async function runDurableWorker(config) {
  const {directory,socketPath,identity,bootstrapSpec,adapterBootstrapSource}=config;
  const input=config.sessionOptions||{},sessionOptions={};
  for(const key of ['id','agent','cwd','remotePath','configuredRemotePath','remoteRuntimeDir','agentPath','permission','modeId','model','workspaceId','dshSessionId','generation','eventSeq','resumeSessionId','forkSessionId','forkConfig','forkOrigin','forkOperation','createdAt','title','titleStatus','requests']){
    if(Object.hasOwn(input,key))sessionOptions[key]=input[key];
  }
  for(const key of ['agent','cwd','remotePath','remoteRuntimeDir','agentPath','workspaceId','dshSessionId','generation']){
    if(Object.hasOwn(identity.binding,key)&&identity.binding[key]!==sessionOptions[key])throw new Error('Worker options differ from the immutable execution binding');
  }
  const broker=await createDurableBroker({directory,identity,
    createSession:hooks=>new AcpSession({...sessionOptions,...hooks,
      // AcpSession validates an SSH profile while constructing its generic launch
      // description. This sentinel is never passed to ssh: connectImpl below owns
      // the only launch and runs the prepared adapter on this remote machine.
      profile:{id:'remote-owner',host:'localhost',user:'remote-owner',authMethod:'key'},
      connectImpl:args=>connectAcp({...args,connectImpl:undefined,spawn,env:process.env,
        launchSpec:{command:process.execPath,args:['-e',adapterBootstrapSource,Buffer.from(JSON.stringify(bootstrapSpec)).toString('base64')]}}),
    })});
  await broker.listen(socketPath);
  try{
    await broker.start();
    writeFileSync(join(directory,'ready.json'),JSON.stringify({ok:true,epoch:identity.epoch}),{flag:'wx',mode:0o600});
  }catch(error){
    // Keep the authenticated status/close endpoint accessible on startup failure.
    writeFileSync(join(directory,'ready.json'),JSON.stringify({ok:false,epoch:identity.epoch,error:{code:error.code||'remote_start_failed',message:String(error.message||error).slice(0,2000)}}),{flag:'wx',mode:0o600});
  }
  let reclaiming=false;
  const reclaim=setInterval(()=>{
    if(reclaiming)return;
    const terminal=broker.terminalSnapshot;
    if(!terminal)return;
    reclaiming=true;clearInterval(reclaim);
    void(async()=>{
      // The getter is available only after the explicit close receipt and final
      // state are durable. Never retire an idle/disconnected/completed session.
      const stat=lstatSync(directory);
      if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(directory)!==directory||stat.uid!==process.getuid()||(stat.mode&0o077))throw new Error('Unsafe terminal directory');
      const temporary=join(directory,'.terminal-'+randomUUID()),target=join(directory,'terminal.json');
      const fd=openSync(temporary,'wx',0o600);
      try{writeFileSync(fd,JSON.stringify({v:1,...terminal}));fsyncSync(fd);}finally{closeSync(fd);}
      // Fixed names in the verified private owner directory; replace no journal.
      renameSync(temporary,target);
      const directoryFd=openSync(directory,'r');try{fsyncSync(directoryFd);}finally{closeSync(directoryFd);}
      await broker.close();
    })().catch(error=>{
      // Keep the owner reachable if terminal publication failed. A failed disk
      // write must not masquerade as a successfully recoverable closed receipt.
      process.stderr.write(JSON.stringify({code:'remote_terminal_failed',message:String(error.message||error).slice(0,1000)})+'\n');
    });
  },100);
  reclaim.unref();
  return broker;
}

// The generated artifact is an executable, not a local client dependency.
if(process.argv[1]&&/\/(?:[a-f0-9]{64}\.mjs|durable-worker(?:-bundle)?\.js)$/.test(process.argv[1])){
  let data='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>{data+=chunk;if(Buffer.byteLength(data)>4*1024*1024){process.stderr.write('Remote worker startup exceeds limit\n');process.exit(2);}});
  process.stdin.once('end',()=>{
    let config;try{config=JSON.parse(data);}catch{process.stderr.write('Invalid remote worker startup\n');process.exitCode=2;return;}
    void runDurableWorker(config).catch(error=>{
      process.stderr.write(JSON.stringify({code:error.code||'remote_worker_failed',message:String(error.message||error).slice(0,2000)})+'\n');process.exitCode=2;
    });
  });
}
