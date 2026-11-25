import {activeRootScope} from './stream-view-model.js';

// A turn's Host event timestamp, never Session age or component mount time.
export function runningTailPresentation(state,activity,now=Date.now()) {
  if(activity.kind==='idle')return null;
  const connection=['connecting','reconnecting'].includes(activity.kind);
  const waiting=['permission','question'].includes(activity.kind);
  const scope=state.running&&state.binding?.sessionId?activeRootScope(state.turns,state.binding.sessionId):null;
  const phase=connection?'connection':waiting?'waiting':scope?'running':'pending';
  const start=scope&&!connection?state.turns[scope]?.startedAt:null;
  const startedAt=typeof start==='number'&&Number.isFinite(start)&&start>0?start:null;
  const seconds=startedAt!==null&&Number.isFinite(now)&&now>=startedAt?Math.floor((now-startedAt)/1000):null;
  const footer=phase==='running'||waiting;
  // Tool/subagent titles already appear in the process group. Keep connection,
  // pending and intervention feedback, not a second copy of the active command.
  const showActivity=activity.kind!=='activity'||!footer;
  const activeCount=!showActivity&&Number.isSafeInteger(activity.count)&&activity.count>1?activity.count:null;
  return {phase,scope,startedAt,seconds,clock:seconds!==null,animate:phase==='running',footer,showActivity,activeCount};
}
export function formatTurnElapsed(seconds,t) {
  if(!Number.isSafeInteger(seconds)||seconds<0)return null;
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
  return [hours?`${hours} ${t('flow.hour')}`:null,minutes||hours?`${minutes} ${t('flow.minute')}`:null,`${rest} ${t('flow.second')}`].filter(Boolean).join(' ');
}

function subscribeVisibility(listener) {
  const doc=globalThis.document;
  doc?.addEventListener('visibilitychange',listener);
  return()=>doc?.removeEventListener('visibilitychange',listener);
}
// One clock for the displayed tail; hidden tabs stop ticking and catch up from
// the original timestamp on return. Late callbacks after cleanup do nothing.
export function subscribeRunningClock(tick,{
  visible=()=>globalThis.document?.visibilityState!=='hidden',subscribe=subscribeVisibility,
  schedule=(fn,ms)=>globalThis.setInterval(fn,ms),clear=id=>globalThis.clearInterval(id),
}={}) {
  let timer=null,disposed=false;
  const stop=()=>{if(timer!==null){clear(timer);timer=null;}};
  const refresh=()=>{
    if(disposed)return;
    stop();if(!visible())return;
    tick();timer=schedule(()=>{if(!disposed&&visible())tick();},1000);
  };
  const unsubscribe=subscribe(refresh);refresh();
  return()=>{disposed=true;stop();unsubscribe();};
}
