/** Reconnectable Host-side broker link. No ACP client or task lives in this pipe. */
import {spawn as nodeSpawn} from 'node:child_process';
import {randomUUID,createHmac} from 'node:crypto';

const failure=(code,message)=>Object.assign(new Error(message),{code});
const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>{});return {promise,resolve,reject};};
const MAX_FRAME=16*1024*1024,MAX_PENDING=64*1024*1024;
// Same canonicalization as the remote owner; digests are keyed, never bare hashes
// of potentially low-entropy form answers. Only the private link sees them.
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
export function createDurableLink(opts) {
  const identity={...opts.identity},consumerId=randomUUID(),ready=gate();
  const calls=new Map(),queries=[];
  const digestKey=createHmac('sha256',identity.token).update('dsh-acp-broker/1 operation digest').digest();
  let pendingBytes=0;
  const drop=pending=>{if(calls.delete(pending.opId))pendingBytes-=pending.bytes;};
  function verifyDigest(pending,digest){
    if(pending.method==='status')return true;
    if(digest===pending.digest)return true;
    drop(pending);pending.reject(failure('operation_conflict','Remote operation id belongs to different arguments; nothing was resent'));return false;
  }
  let child=null,closed=false,terminal=false,connected=false,started=false;
  let fence=null,attempt=0,retries=0,timer=null,heartbeat=null,deadline=null,attachTimer=null;
  let cursor=Number(opts.afterSeq)||0,lastFrame=Date.now(),chain=Promise.resolve(),queuedBytes=0;
  const delays=opts.retryDelays||[1000,2000,5000,10000];
  function status(state,error){try{opts.onConnection?.({state,...(error?{code:error.code,message:error.message}:{})});}catch{}}
  function kill(process){
    if(!process)return;
    try{if(Number.isInteger(process.pid)&&process.pid>0&&globalThis.process.platform!=='win32')globalThis.process.kill(-process.pid,'SIGTERM');else process.kill('SIGTERM');}catch{}
    const force=setTimeout(()=>{try{if(Number.isInteger(process.pid)&&process.pid>0&&globalThis.process.platform!=='win32')globalThis.process.kill(-process.pid,'SIGKILL');else process.kill('SIGKILL');}catch{}},2000);force.unref?.();
  }
  function settle(frame){
    const pending=calls.get(frame.opId);if(!pending)return;
    if((frame.ok||frame.digest!==undefined)&&!verifyDigest(pending,frame.digest))return;
    drop(pending);
    if(frame.ok)pending.resolve(frame.value);else pending.reject(failure(frame.error?.code||'remote_operation_failed',frame.error?.message||'Remote operation failed'));
  }
  function rejectQueries(error){while(queries.length)queries.shift().reject(error);}
  function fail(error){
    if(closed||terminal)return;
    terminal=true;connected=false;clearTimeout(timer);clearTimeout(deadline);clearTimeout(attachTimer);clearInterval(heartbeat);
    status('error',error);ready.reject(error);rejectQueries(error);
    for(const pending of calls.values())pending.reject(error);calls.clear();pendingBytes=0;
    const previous=child;child=null;kill(previous);
  }
  function disconnected(process,error){
    if(child!==process||closed||terminal)return;
    child=null;connected=false;clearTimeout(attachTimer);kill(process);
    rejectQueries(failure('remote_disconnected','SSH disconnected; the remote task was not cancelled'));
    status('reconnecting',error);
    timer=setTimeout(connect,delays[Math.min(retries++,delays.length-1)]);timer.unref?.();
  }
  function send(frame){
    if(!child||!connected)throw failure('remote_disconnected','Remote task is currently disconnected');
    const line=JSON.stringify({v:1,...frame})+'\n';
    if(Buffer.byteLength(line)>MAX_FRAME)throw failure('remote_frame_too_large','Remote operation exceeds the 16 MiB frame limit');
    const process=child;
    process.stdin.write(line,error=>{if(error)disconnected(process,error);});
  }
  function query(opIds){
    if(!Array.isArray(opIds)||opIds.length>256||opIds.some(id=>typeof id!=='string'||id.length>256))return Promise.reject(failure('bad_query','Query at most 256 operation ids'));
    // Individually valid results must not overflow one aggregate reply frame.
    if(opIds.length>1)return Promise.all(opIds.map(opId=>query([opId]))).then(results=>results.flat());
    const pending=gate();queries.push(pending);
    try{send({type:'query',epoch:identity.epoch,opIds});}catch(error){queries.splice(queries.indexOf(pending),1);pending.reject(error);}
    return pending.promise;
  }
  function submit(pending){
    try{send({type:'call',epoch:identity.epoch,fence,opId:pending.opId,method:pending.method,args:pending.args});pending.attempt=attempt;}
    catch(error){if(error.code!=='remote_disconnected'){drop(pending);pending.reject(error);}}
  }
  async function reconcile(){
    const currentAttempt=attempt,unknown=[...calls.values()].filter(value=>value.attempt!==attempt);
    for(let offset=0;offset<unknown.length;offset+=256){
      let results;try{results=await query(unknown.slice(offset,offset+256).map(value=>value.opId));}catch{return;}
      if(!connected||attempt!==currentAttempt)return;
      for(const operation of results){
        const pending=calls.get(operation.opId);if(!pending||pending.attempt===attempt)continue;
        if(operation.status!=='not_found'&&!verifyDigest(pending,operation.digest))continue;
        if(operation.result)settle(operation.result);
        else if(operation.status==='not_found')submit(pending); // Same owner explicitly proves non-admission.
        else if(operation.status==='unknown'){drop(pending);pending.reject(failure('remote_outcome_unknown','Remote outcome is unknown; the operation was not resent'));}
        else pending.attempt=attempt; // The owner still holds its original promise.
      }
    }
  }
  async function frame(message,process){
    if(process!==child||closed||terminal)return;
    lastFrame=Date.now();
    if(message.type==='event'){
      const event=message.event;
      if(!event||event.generation!==identity.binding.generation||!Number.isSafeInteger(event.seq)||event.seq<1)throw failure('remote_event_invalid','Remote event identity is invalid');
      cursor=Math.max(cursor,Number(opts.getCursor?.()?.seq??opts.getCursor?.())||0);
      if(event.seq<=cursor)return;
      if(event.seq!==cursor+1)throw failure('remote_event_gap','Remote event sequence has a gap; no events were acknowledged past it');
      await opts.onEvent?.(event);cursor=event.seq;
      // During initial replay the broker rejects other frames until attached.
      if(connected&&process===child)send({type:'ack',epoch:identity.epoch,throughSeq:cursor});
    }else if(message.type==='attached'){
      if(message.id!==identity.id||typeof message.epoch!=='string'||identity.epoch&&message.epoch!==identity.epoch||JSON.stringify(message.binding)!==JSON.stringify(identity.binding))throw failure('remote_binding_mismatch','Attached owner differs from the persisted execution identity');
      if(message.headSeq!==cursor)throw failure('remote_event_gap','Attach did not deliver all events through its snapshot');
      identity.epoch=message.epoch;fence=message.fence;
      await opts.onIdentity?.({...identity});
      if(process!==child||closed||terminal)return;
      await opts.onState?.(message);
      if(process!==child||closed||terminal)return;
      connected=true;retries=0;clearTimeout(deadline);clearTimeout(attachTimer);status('connected');
      send({type:'ack',epoch:identity.epoch,throughSeq:cursor});
      ready.resolve(message);void reconcile();
    }else if(message.type==='state')await opts.onState?.(message);
    else if(message.type==='operations'){
      const pending=queries.shift();pending?.resolve(message.operations||[]);
    }else if(message.type==='result')settle(message);
    else if(message.type==='accepted'){const pending=calls.get(message.opId);if(pending&&verifyDigest(pending,message.digest))pending.accepted=true;}
    else if(message.type==='fatal'||message.type==='error'){
      const error=failure(message.error?.code||'remote_broker_error',message.error?.message||'Remote owner error');
      if(message.opId){settle({opId:message.opId,ok:false,error});if(error.code==='writer_fenced')fail(error);}
      else fail(error);
    }
  }
  function connect(){
    if(closed||terminal)return;
    connected=false;attempt++;status(attempt===1?'connecting':'reconnecting');
    let process;
    try{process=(opts.spawn||nodeSpawn)(opts.launchSpec.command,opts.launchSpec.args,{env:opts.env,stdio:['pipe','pipe','pipe'],windowsHide:true,detached:globalThis.process.platform!=='win32'});}
    catch(error){fail(error);return;}
    child=process;let input='',stderr='';
    clearTimeout(attachTimer);
    attachTimer=setTimeout(()=>disconnected(process,failure('remote_attach_timeout','Remote attach stopped responding; original task was not resubmitted')),opts.startTimeoutMs||75000);attachTimer.unref?.();
    process.stdout.setEncoding('utf8');process.stderr.setEncoding('utf8');
    process.stdout.on('error',error=>disconnected(process,error));
    process.stderr.on('error',error=>disconnected(process,error));
    process.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2048);});
    process.stdout.on('data',chunk=>{
      input+=chunk;let end;
      while((end=input.indexOf('\n'))>=0){
        const line=input.slice(0,end);input=input.slice(end+1);
        if(Buffer.byteLength(line)>MAX_FRAME){fail(failure('remote_frame_too_large','Remote frame exceeds limit'));return;}
        if(!line.trim())continue;
        let message;try{message=JSON.parse(line);}catch{fail(failure('remote_protocol_error','Remote sent invalid broker JSON'));return;}
        const bytes=Buffer.byteLength(line);queuedBytes+=bytes;
        if(queuedBytes>=512*1024)process.stdout.pause();
        chain=chain.then(()=>frame(message,process)).catch(error=>fail(error)).finally(()=>{
          queuedBytes-=bytes;
          if(process===child&&!closed&&!terminal&&queuedBytes<128*1024)process.stdout.resume();
        });
      }
      if(Buffer.byteLength(input)>MAX_FRAME)fail(failure('remote_frame_too_large','Remote frame exceeds limit'));
    });
    process.stdin.on('error',error=>disconnected(process,error));
    process.on('error',error=>disconnected(process,error));
    process.on('close',(code,signal)=>disconnected(process,failure('remote_disconnected',`SSH connection closed (${code??signal??'unknown'})${stderr?' · '+stderr:''}`)));
    const afterSeq=Number(opts.getCursor?.()?.seq??opts.getCursor?.())||cursor;
    cursor=afterSeq;
    const bootstrap={...opts.launchSpec.bootstrap,identity:{...identity}};
    const attach={v:1,type:'attach',id:identity.id,epoch:identity.epoch,token:identity.token,consumerId,afterSeq,mode:'control',reconnect:attempt>1,...(fence!==null?{expectedFence:fence}:{})};
    process.stdin.write(JSON.stringify(bootstrap)+'\n'+JSON.stringify(attach)+'\n',error=>{if(error)disconnected(process,error);});
  }
  const api={
    start(){
      if(!started){
        started=true;
        deadline=setTimeout(()=>fail(failure('remote_attach_timeout','Remote attach timed out; any admitted task remains remote')),opts.startTimeoutMs||75000);deadline.unref?.();
        heartbeat=setInterval(()=>{
          if(!connected||!child)return;
          if(Date.now()-lastFrame>(opts.heartbeatTimeoutMs||45000))disconnected(child,failure('remote_heartbeat_timeout','Remote connection stopped responding'));
          else void query([]).catch(()=>{});
        },opts.heartbeatMs||15000);heartbeat.unref?.();
        connect();
      }
      return ready.promise;
    },
    call(method,args={},options={}){
      if(closed||terminal)return Promise.reject(failure('remote_detached','Remote link is detached; no operation was submitted'));
      const opId=options.opId||randomUUID();
      let digest,bytes;
      try{
        args=JSON.parse(JSON.stringify(args));
        const value=canonical({method,args});bytes=Buffer.byteLength(value);
        digest=createHmac('sha256',digestKey).update(value).digest('hex');
      }catch{return Promise.reject(failure('bad_request','Remote operation requires serializable JSON arguments'));}
      const existing=calls.get(opId);
      if(existing){if(existing.digest!==digest)return Promise.reject(failure('operation_conflict','Operation id reused with different arguments'));return existing.promise;}
      if(bytes>MAX_FRAME-2048||pendingBytes+bytes>MAX_PENDING||calls.size>=1024)return Promise.reject(failure('remote_outbox_full','Remote operation/outbox limit reached; no operation was submitted'));
      const pending={...gate(),opId,method,args,digest,bytes,attempt:0};
      calls.set(opId,pending);pendingBytes+=bytes;
      if(connected)submit(pending);
      else if(!started)void api.start();
      return pending.promise;
    },
    query,
    async close(){
      if(closed)return;
      if(connected)try{send({type:'detach'});}catch{}
      closed=true;connected=false;clearTimeout(timer);clearTimeout(deadline);clearTimeout(attachTimer);clearInterval(heartbeat);
      const error=failure('remote_detached','Local connection detached; remote tasks were not cancelled');
      ready.reject(error);rejectQueries(error);for(const pending of calls.values())pending.reject(error);calls.clear();pendingBytes=0;
      const previous=child;child=null;kill(previous);status('detached');
    },
  };
  return api;
}
