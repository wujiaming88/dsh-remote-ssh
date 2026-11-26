/** SSH is a disposable, authenticated pipe to a remote-owned ACP session. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildRemoteAcpLaunchSpec} from './acp-transport.js';

const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";

// Serialized into the remote login shell. Configuration, credentials and the
// worker artifact arrive on stdin, never in argv, shell interpolation or logs.
export function durableRemoteHelper() {
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
  const fail=(code,message)=>Object.assign(new Error(message),{code});
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  const privateDir=dir=>{
    const stat=fs.lstatSync(dir);
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077))throw fail('remote_private_directory','Remote execution directory must be owned by this user with mode 0700');
    return dir;
  };
  const privateFile=file=>{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077))throw fail('remote_private_file','Remote execution file must be private to this user');
    return file;
  };
  const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value),{flag:'wx',mode:0o600});
  const expand=value=>value==='~'?os.homedir():value.startsWith('~/')?path.join(os.homedir(),value.slice(2)):value;
  let first=Buffer.alloc(0),socket,stopped=false;
  function finish(error){
    if(stopped)return;stopped=true;
    if(error)process.stdout.write(JSON.stringify({v:1,type:'fatal',error:{code:error.code||'remote_broker_unavailable',message:String(error.message||error).slice(0,2000)}})+'\n');
    socket?.destroy();process.stdin.destroy();process.exitCode=error?2:0;
  }
  async function serveTerminal(directory,metadata,identity,rest){
    const MAX_FRAME=16*1024*1024,MAX_JOURNAL=300*1024*1024;
    const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
    const digestKey=crypto.createHmac('sha256',identity.token).update('dsh-acp-broker/1 operation digest').digest();
    const digest=frame=>crypto.createHmac('sha256',digestKey).update(canonical({method:frame.method,args:frame.args})).digest('hex');
    const openPrivate=file=>{
      privateFile(file);
      const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)),stat=fs.fstatSync(fd);
      if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o077)){fs.closeSync(fd);throw fail('remote_private_file','Unsafe terminal journal');}
      return {fd,size:stat.size};
    };
    const terminalPath=path.join(directory,'terminal.json');
    let opened;
    try{opened=openPrivate(terminalPath);}catch(error){if(error.code==='ENOENT')throw fail('remote_broker_lost','The original remote owner is unavailable; its outcome is unknown and no prompt was resent');throw error;}
    let terminal;
    try{
      if(opened.size>MAX_FRAME)throw fail('remote_terminal_corrupt','Terminal snapshot exceeds limit');
      terminal=JSON.parse(fs.readFileSync(opened.fd,'utf8'));
    }finally{fs.closeSync(opened.fd);}
    if(terminal.v!==1||terminal.id!==identity.id||terminal.epoch!==metadata.epoch||JSON.stringify(terminal.binding)!==JSON.stringify(identity.binding)||terminal.state?.status!=='closed'||terminal.persistenceFailure||!Number.isSafeInteger(terminal.headSeq)||terminal.headSeq<0||terminal.generation!==identity.binding.generation)throw fail('remote_terminal_corrupt','Terminal snapshot identity or closed state is invalid');
    const eventPath=path.join(directory,'broker-events.ndjson'),operationPath=path.join(directory,'broker-operations.ndjson');
    async function* records(file){
      const opened=openPrivate(file);
      if(opened.size>MAX_JOURNAL){fs.closeSync(opened.fd);throw fail('remote_journal_limit','Terminal journal exceeds read budget');}
      const stream=fs.createReadStream(file,{fd:opened.fd,autoClose:true,highWaterMark:65536});
      let buffered=Buffer.alloc(0),total=0;
      try{
        for await(const chunk of stream){
          total+=chunk.length;if(total>MAX_JOURNAL)throw fail('remote_journal_limit','Terminal journal exceeds read budget');
          buffered=Buffer.concat([buffered,chunk]);let end;
          while((end=buffered.indexOf(10))>=0){
            if(end>MAX_FRAME)throw fail('remote_frame_too_large','Terminal record exceeds frame limit');
            const line=buffered.subarray(0,end);buffered=buffered.subarray(end+1);
            if(!line.length)continue;
            let value;try{value=JSON.parse(line.toString('utf8'));}catch{throw fail('remote_terminal_corrupt','Invalid terminal journal record');}
            yield value;
          }
          if(buffered.length>MAX_FRAME)throw fail('remote_frame_too_large','Terminal record exceeds frame limit');
        }
        if(buffered.length)throw fail('remote_terminal_corrupt','Terminal journal has an incomplete tail');
      }finally{stream.destroy();}
    }
    async function send(message){
      if(stopped)return;
      const line=JSON.stringify({v:1,...message})+'\n';
      if(Buffer.byteLength(line)>MAX_FRAME)throw fail('remote_frame_too_large','Terminal response exceeds frame limit');
      if(process.stdout.write(line))return;
      await new Promise(resolve=>{const done=()=>{process.stdout.off('drain',done);process.stdout.off('close',done);resolve();};process.stdout.once('drain',done);process.stdout.once('close',done);});
    }
    async function lookup(ids){
      const wanted=new Set(ids),found=new Map();let bytes=0;
      for await(const operation of records(operationPath)){
        if(!operation||typeof operation.opId!=='string'||typeof operation.method!=='string'||typeof operation.digest!=='string')throw fail('remote_terminal_corrupt','Invalid terminal operation identity');
        if(!wanted.has(operation.opId))continue;
        const previous=found.get(operation.opId);if(previous)bytes-=Buffer.byteLength(JSON.stringify(previous));
        const value={opId:operation.opId,method:operation.method,digest:operation.digest,status:operation.status==='completed'&&operation.result?'completed':'unknown',...(operation.status==='completed'&&operation.result?{result:operation.result}:{})};
        bytes+=Buffer.byteLength(JSON.stringify(value));if(bytes>MAX_FRAME-4096)throw fail('remote_frame_too_large','Query fewer terminal operations');
        found.set(operation.opId,value);
      }
      return ids.map(opId=>found.get(opId)||{opId,status:'not_found'});
    }
    let attached=false,fence=1,lastAck=0;
    const snapshot={state:terminal.state,requests:terminal.requests||[],headSeq:terminal.headSeq,generation:terminal.generation,forkReservation:terminal.forkReservation||null};
    async function handle(frame){
      if(!frame||typeof frame!=='object'||Array.isArray(frame)||frame.v!==1)throw fail('remote_protocol_error','Invalid terminal protocol frame');
      if(!attached){
        const supplied=Buffer.from(hash(typeof frame.token==='string'?frame.token:''),'hex'),expected=Buffer.from(metadata.tokenHash,'hex');
        if(frame.type!=='attach'||frame.id!==identity.id||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)||frame.epoch!=null&&frame.epoch!==terminal.epoch)throw fail('authentication_failed','Terminal attach authentication failed');
        if(!['observe','control'].includes(frame.mode)||typeof frame.consumerId!=='string'||!frame.consumerId||!Number.isSafeInteger(frame.afterSeq)||frame.afterSeq<0||frame.afterSeq>terminal.headSeq)throw fail('bad_attach','Invalid terminal cursor or mode');
        if(frame.expectedFence!=null&&(!Number.isSafeInteger(frame.expectedFence)||frame.expectedFence<1))throw fail('writer_fenced','Invalid terminal writer fence');
        fence=frame.expectedFence||1;
        let previous=null,firstSeq=null;
        for await(const event of records(eventPath)){
          if(event.eventVersion!==1||event.generation!==terminal.generation||!Number.isSafeInteger(event.seq)||event.seq<1||previous!=null&&event.seq!==previous+1||event.seq>terminal.headSeq)throw fail('remote_terminal_corrupt','Terminal event sequence is invalid');
          if(firstSeq===null){firstSeq=event.seq;if(frame.afterSeq<firstSeq-1)throw fail('cursor_gap','Terminal cursor precedes the inherited event prefix');}
          previous=event.seq;
          if(event.seq>frame.afterSeq)await send({type:'event',event});
        }
        if((previous??frame.afterSeq)!==terminal.headSeq)throw fail('remote_terminal_corrupt','Terminal journal does not reach the closed snapshot');
        attached=true;lastAck=frame.afterSeq;
        await send({type:'attached',id:terminal.id,epoch:terminal.epoch,binding:terminal.binding,fence,retainedFromSeq:firstSeq,terminal:true,...snapshot});return;
      }
      if(frame.epoch!=null&&frame.epoch!==terminal.epoch)throw fail('epoch_mismatch','Terminal owner epoch differs');
      if(frame.type==='detach'){finish();return;}
      if(frame.type==='ack'){
        if(frame.epoch!==terminal.epoch||!Number.isSafeInteger(frame.throughSeq)||frame.throughSeq<lastAck||frame.throughSeq>terminal.headSeq)throw fail('bad_ack','Invalid terminal acknowledgement');
        lastAck=frame.throughSeq;return;
      }
      if(frame.type==='query'){
        if(!Array.isArray(frame.opIds)||frame.opIds.length>256||frame.opIds.some(id=>typeof id!=='string'||id.length>256))throw fail('bad_query','Invalid terminal operation query');
        await send({type:'operations',operations:await lookup(frame.opIds)});return;
      }
      if(frame.type!=='call'||frame.epoch!==terminal.epoch||typeof frame.opId!=='string'||!frame.opId||frame.opId.length>256||!frame.args||typeof frame.args!=='object'||Array.isArray(frame.args))throw fail('bad_call','Invalid terminal call');
      if(frame.method==='status'){await send({type:'result',opId:frame.opId,ok:true,value:snapshot});return;}
      if(frame.fence!==fence)throw fail('writer_fenced','Terminal fence differs');
      const callDigest=digest(frame),[prior]=await lookup([frame.opId]);
      if(prior.status!=='not_found'){
        if(prior.digest!==callDigest)throw fail('operation_conflict','Operation id belongs to different arguments');
        if(prior.result){await send(prior.result);return;}
        throw fail('remote_outcome_unknown','Prior operation has no durable result; it was not resent');
      }
      if(frame.method==='close'){await send({type:'result',opId:frame.opId,digest:callDigest,ok:true,value:{closed:true,alreadyClosed:true}});return;}
      throw fail('remote_session_closed','Remote session is already closed; no operation was executed');
    }
    // A bounded streaming input loop naturally backpressures callers while disk
    // replay runs. It never reconnects ACP or opens a replacement execution owner.
    let input=rest;
    async function consume(){
      let end;
      while(!stopped&&(end=input.indexOf(10))>=0){
        if(end>MAX_FRAME)throw fail('remote_frame_too_large','Terminal input exceeds frame limit');
        const line=input.subarray(0,end);input=input.subarray(end+1);if(!line.length)continue;
        let frame;try{frame=JSON.parse(line.toString('utf8'));}catch{throw fail('remote_protocol_error','Invalid terminal JSON');}
        try{await handle(frame);}catch(error){
          if(!attached)throw error;
          await send({type:'error',...(typeof frame.opId==='string'?{opId:frame.opId}:{}),error:{code:error.code||'remote_terminal_error',message:String(error.message||error).slice(0,1000)}});
        }
      }
      if(input.length>MAX_FRAME)throw fail('remote_frame_too_large','Terminal input exceeds frame limit');
    }
    await consume();
    for await(const chunk of process.stdin){if(stopped)break;input=Buffer.concat([input,chunk]);await consume();}
    finish();
  }
  async function bootstrap(input,rest){
    if(Number(process.versions.node.split('.')[0])<22)throw fail('remote_node_unsupported','Remote persistent sessions require Node.js >=22');
    const {identity,sessionOptions,create,workerSource,workerHash,runtimeDir,bootstrapSpec,adapterBootstrapSource}=input;
    if(input.type!=='bootstrap'||input.v!==1||!identity||! /^[a-zA-Z0-9_-]{16,80}$/.test(identity.id)||! /^[a-f0-9]{64}$/.test(identity.token)||!identity.binding||typeof identity.binding!=='object')throw fail('remote_bad_bootstrap','Invalid remote execution identity');
    if(typeof runtimeDir!=='string'||/\0|\r|\n/.test(runtimeDir)||!(runtimeDir.startsWith('/')||runtimeDir==='~'||runtimeDir.startsWith('~/')))throw fail('remote_bad_bootstrap','Invalid private runtime path');
    let root;try{root=fs.realpathSync(expand(runtimeDir));}catch(error){if(error.code==='ENOENT')throw fail('remote_prepare_required','Explicitly prepare the private remote runtime first');throw error;}
    // A private leaf is insufficient if a different user can rename its parent.
    for(let current=root;;current=path.dirname(current)){
      const stat=fs.statSync(current),owned=stat.uid===process.getuid(),system=stat.uid===0;
      if(!stat.isDirectory()||(!owned&&!system)||((stat.mode&0o022)&&!(system&&(stat.mode&0o1000))))throw fail('remote_unsafe_runtime','Remote runtime and ancestors must be trusted and not group/world writable (except root-owned sticky directories)');
      if(current===root&&(!owned||(stat.mode&0o022)))throw fail('remote_unsafe_runtime','Remote runtime must be user-owned and not group/world writable');
      if(current===path.dirname(current))break;
    }
    const runs=path.join(root,'durable-runs');
    if(create){try{fs.mkdirSync(runs,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}}
    try{privateDir(runs);}catch(error){if(error.code==='ENOENT')throw fail('remote_broker_lost','Remote execution registry is missing; the original prompt will not be resent');throw error;}
    const directory=path.join(runs,identity.id),metadataFile=path.join(directory,'launch.json');
    if(create&&!fs.existsSync(directory)){
      if(typeof workerSource!=='string'||typeof workerHash!=='string'||hash(workerSource)!==workerHash)throw fail('remote_worker_invalid','Remote worker artifact failed integrity validation');
      // A failed preflight must not consume this start-once identity.
      for(const name of ['@agentclientprotocol/sdk',bootstrapSpec.adapterPackage]){
        let version;try{version=JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version;}catch{}
        if(version!==bootstrapSpec.packages[name])throw fail('remote_prepare_required','Explicitly prepare the pinned remote ACP runtime before starting');
      }
    }
    let fresh=false;
    if(create){try{fs.mkdirSync(directory,{mode:0o700});fresh=true;}catch(error){if(error.code!=='EEXIST')throw error;}}
    try{privateDir(directory);}catch(error){if(error.code==='ENOENT')throw fail('remote_broker_lost','Remote execution is missing; refusing to recreate it');throw error;}
    if(fresh){
      if(typeof workerSource!=='string'||typeof workerHash!=='string'||hash(workerSource)!==workerHash)throw fail('remote_worker_invalid','Remote worker artifact failed integrity validation');
      const artifacts=path.join(root,'durable-workers');try{fs.mkdirSync(artifacts,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}privateDir(artifacts);
      const artifact=path.join(artifacts,workerHash+'.mjs');
      if(!fs.existsSync(artifact)){
        const temporary=path.join(artifacts,'.worker-'+crypto.randomUUID());
        const fd=fs.openSync(temporary,'wx',0o600);
        try{fs.writeFileSync(fd,workerSource);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
        try{
          // Hard-link publication is atomic and exclusive: concurrent startups
          // either publish a complete artifact or verify the winner's full bytes.
          try{fs.linkSync(temporary,artifact);}catch(error){if(error.code!=='EEXIST')throw error;}
        }finally{
          if(path.dirname(path.resolve(temporary))!==artifacts||!path.basename(temporary).startsWith('.worker-'))throw fail('remote_worker_path','Unexpected worker temporary path');
          fs.unlinkSync(temporary);
        }
        const directoryFd=fs.openSync(artifacts,'r');try{fs.fsyncSync(directoryFd);}finally{fs.closeSync(directoryFd);}
      }
      privateFile(artifact);if(hash(fs.readFileSync(artifact))!==workerHash)throw fail('remote_worker_invalid','Existing worker artifact does not match its digest');
      const temp=fs.realpathSync('/tmp'),socketDirectory=fs.mkdtempSync(path.join(temp,'dsh-acp-'));
      fs.chmodSync(socketDirectory,0o700);privateDir(socketDirectory);
      const socketPath=path.join(socketDirectory,'broker.sock');
      if(Buffer.byteLength(socketPath)>100)throw fail('remote_socket_path','Private socket path is too long');
      const epoch=crypto.randomUUID(),metadata={protocol:'dsh-acp-broker/1',id:identity.id,epoch,binding:identity.binding,tokenHash:hash(identity.token),socketPath,workerHash,createdAt:Date.now()};
      write(metadataFile,metadata);
      const log=fs.openSync(path.join(directory,'worker.log'),'wx',0o600);
      try{
        const child=spawn(process.execPath,[artifact],{cwd:root,env:{...process.env,DSH_ACP_DEBUG:''},detached:true,stdio:['pipe',log,log]});
        child.on('error',()=>{});child.stdin.on('error',()=>{});
        child.stdin.end(JSON.stringify({directory,socketPath,identity:{...identity,epoch},sessionOptions,bootstrapSpec,adapterBootstrapSource})+'\n');
        child.unref();
      }finally{fs.closeSync(log);}
    }
    // An existing directory is a start-once tombstone. A missing socket/owner
    // never authorizes starting a replacement adapter or resending its prompt.
    const deadline=Date.now()+65000;
    let metadata;
    while(Date.now()<deadline){
      try{privateFile(metadataFile);metadata=JSON.parse(fs.readFileSync(metadataFile,'utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(!metadata)throw fail('remote_broker_unavailable','Remote startup was interrupted; refusing to start another owner');
    const tokenHash=Buffer.from(hash(identity.token),'hex'),expectedHash=Buffer.from(String(metadata.tokenHash||''),'hex');
    if(metadata.id!==identity.id||metadata.protocol!=='dsh-acp-broker/1'||expectedHash.length!==tokenHash.length||!crypto.timingSafeEqual(tokenHash,expectedHash)||JSON.stringify(metadata.binding)!==JSON.stringify(identity.binding)||identity.epoch&&identity.epoch!==metadata.epoch)throw fail('remote_binding_mismatch','Remote execution identity does not match this binding');
    const readyFile=path.join(directory,'ready.json');
    while(!fs.existsSync(readyFile)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(!fs.existsSync(readyFile))throw fail('remote_broker_unavailable','Remote owner is not ready; the original task has not been recreated');
    privateFile(readyFile);privateDir(path.dirname(metadata.socketPath));
    if(path.basename(metadata.socketPath)!=='broker.sock')throw fail('remote_private_socket','Invalid private socket name');
    socket=net.createConnection(metadata.socketPath);
    let terminalFallback=false,everConnected=false;
    socket.once('error',()=>{
      if(everConnected)return finish();
      terminalFallback=true;socket.destroy();
      void serveTerminal(directory,metadata,identity,rest).catch(finish);
    });
    socket.once('connect',()=>{
      everConnected=true;
      if(stopped)return socket.destroy();
      if(rest.length)socket.write(rest);
      process.stdin.pipe(socket);socket.pipe(process.stdout);
      process.stdin.resume();
    });
    socket.once('close',()=>{if(!terminalFallback)finish();});
  }
  const onFirst=chunk=>{
    first=Buffer.concat([first,chunk]);
    if(first.length>4*1024*1024){process.stdin.removeListener('data',onFirst);finish(fail('remote_frame_too_large','Bootstrap frame exceeds limit'));return;}
    const end=first.indexOf(10);if(end<0)return;
    process.stdin.pause();process.stdin.removeListener('data',onFirst);
    let input;try{input=JSON.parse(first.subarray(0,end).toString('utf8'));}catch{finish(fail('remote_bad_bootstrap','Invalid bootstrap JSON'));return;}
    void bootstrap(input,first.subarray(end+1)).catch(finish);
  };
  process.stdin.on('data',onFirst);
  process.stdin.on('error',()=>finish());process.stdout.on('error',()=>finish());
  process.on('SIGTERM',()=>finish());
}

export function buildDurableLaunchSpec(opts={}) {
  const base=buildRemoteAcpLaunchSpec(opts);
  const source='('+durableRemoteHelper.toString()+')()';
  const script='command -v node >/dev/null 2>&1 || exit 127; exec 1>&3 3>&-; exec node -e '+quote(source);
  const remoteCommand='exec /bin/bash -ic '+quote(script)+' 3>&1 1>&2';
  const workerSource=opts.workerSource??readFileSync(new URL('./durable-worker-bundle.js',import.meta.url),'utf8');
  return {...base,args:[...base.args.slice(0,-1),remoteCommand],remoteCommand,
    bootstrap:{v:1,type:'bootstrap',identity:opts.identity,create:opts.create===true,
      runtimeDir:base.payload.runtimeDir,sessionOptions:opts.sessionOptions,
      bootstrapSpec:base.payload,adapterBootstrapSource:base.bootstrapSource,
      ...(opts.create?{workerSource,workerHash:createHash('sha256').update(workerSource).digest('hex')}:{})}};
}
