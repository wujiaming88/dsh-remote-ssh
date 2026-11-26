import {spawn as nodeSpawn} from 'node:child_process';

/** Platform command that keeps the Host awake but does not wake the display. */
export function sleepInhibitorCommand(platform=process.platform,hostPid=process.pid) {
  const pid=String(Number.isInteger(Number(hostPid))&&Number(hostPid)>0?Number(hostPid):process.pid);
  if(platform==='darwin')return {command:'/usr/bin/caffeinate',args:['-i','-m','-s','-w',pid]};
  if(platform==='linux')return {command:'systemd-inhibit',args:['--what=idle:sleep','--why=DSH remote Agent is running','--mode=block',
    'sh','-c',`while kill -0 ${pid} 2>/dev/null; do sleep 5; done`]};
  return null;
}

/**
 * One owned child assertion. The Host only holds it while remote work is active;
 * killing the child releases it. A short stop grace avoids teardown between
 * back-to-back turns, and no child is kept after Host disposal.
 */
export function createSleepInhibitor({platform=process.platform,spawn=nodeSpawn,logger=null,stopGraceMs=3000,restartDelayMs=1500}={}) {
  const target=sleepInhibitorCommand(platform);
  let child=null,desired=false,disposed=false,stopTimer=null,restartTimer=null,warned=false,forceTimer=null;
  const warn=message=>{if(warned)return;warned=true;try{logger?.warn?.('Sleep inhibition unavailable: %s',message);}catch{}};
  const clearStop=()=>{if(stopTimer!==null){globalThis.clearTimeout(stopTimer);stopTimer=null;}};
  const clearRestart=()=>{if(restartTimer!==null){globalThis.clearTimeout(restartTimer);restartTimer=null;}};
  function terminate() {
    const running=child;child=null;
    if(!running)return;
    if(forceTimer!==null){globalThis.clearTimeout(forceTimer);forceTimer=null;}
    try{running.kill('SIGTERM');}catch{}
    forceTimer=globalThis.setTimeout(()=>{try{running.kill('SIGKILL');}catch{}},2000);
    forceTimer.unref?.();
  }
  function start() {
    if(disposed||!desired||child)return;
    if(!target){warn('unsupported platform');return;}
    try {
      const next=spawn(target.command,target.args,{stdio:'ignore',windowsHide:true});
      child=next;
      next.once?.('error',error=>{if(child===next)child=null;warn(String(error?.message||error));});
      next.once?.('exit',()=>{
        if(child!==next)return;
        child=null;
        if(!disposed&&desired&&restartTimer===null)restartTimer=globalThis.setTimeout(()=>{restartTimer=null;start();},restartDelayMs);
      });
    } catch(error) { warn(String(error?.message||error)); }
  }
  function update(active) {
    desired=!!active;
    if(disposed)return;
    if(desired){clearStop();clearRestart();start();return;}
    clearRestart();
    if(child===null)return;
    clearStop();
    stopTimer=globalThis.setTimeout(()=>{stopTimer=null;if(!desired)terminate();},Math.max(0,Number(stopGraceMs)||0));
    stopTimer.unref?.();
  }
  function dispose() {
    if(disposed)return;
    disposed=true;desired=false;clearStop();clearRestart();
    if(forceTimer!==null){globalThis.clearTimeout(forceTimer);forceTimer=null;}
    terminate();
  }
  return {update,dispose,get active(){return child!==null;},get command(){return target;}};
}

/** Map the Host's session-activity projection onto one sleep assertion. */
export function createActivitySleepGuard({activity,inhibitor,isActive=row=>['running','waiting'].includes(row?.status)}={}) {
  if(!activity||!inhibitor)throw new TypeError('activity and inhibitor are required');
  const active=new Set();
  const apply=()=>inhibitor.update(active.size>0);
  const initial=typeof activity.current==='function'?activity.current():(activity.snapshot?.()||[]);
  for(const row of initial)if(isActive(row))active.add(row.sessionId);
  apply();
  const unsubscribe=activity.subscribe(event=>{
    if(event?.type==='reset')active.clear();
    else if(event?.type==='remove')active.delete(event.sessionId);
    else if(event?.type==='upsert'){
      if(isActive(event.session))active.add(event.session.sessionId);
      else active.delete(event.session.sessionId);
    }
    else if(event?.type==='snapshot'){
      active.clear();
      for(const row of event.sessions||[])if(isActive(row))active.add(row.sessionId);
    }
    apply();
  });
  return {
    get activeSessions(){return [...active];},
    dispose(){unsubscribe();inhibitor.dispose();},
  };
}
