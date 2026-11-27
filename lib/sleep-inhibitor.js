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
 * One owned child assertion. The Host holds it whenever the user's sleep switch
 * is on, including with no active turns. Killing the child releases it, and no
 * child is kept after Host disposal; a short stop grace avoids rapid flapping.
 */
export function createSleepInhibitor({platform=process.platform,spawn=nodeSpawn,logger=null,stopGraceMs=0,restartDelayMs=1500}={}) {
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
    const grace=Math.max(0,Number(stopGraceMs)||0);
    if (!grace) { terminate(); return; }
    stopTimer=globalThis.setTimeout(()=>{stopTimer=null;if(!desired)terminate();},grace);
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
