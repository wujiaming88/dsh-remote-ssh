import {processGroupPresentation} from './transcript-model.js';

const SETTLED_STATUSES=new Set(['completed','cancelled','interrupted','failed','error']);
const payload=item=>item?.type==='tool'?item.tool:item?.type==='subagent'?item.subagent:item;

function scopeSession(scope) {
  try {
    const parts=JSON.parse(scope);
    return Array.isArray(parts)&&parts.length===2&&typeof parts[0]==='string'?parts[0]:null;
  } catch { return null; }
}

function completedSeconds(turn) {
  if(turn.status!=='completed')return null;
  const {startedAt:start,endedAt:end}=turn;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<=0||end<=0||end<start)return null;
  const seconds=Math.floor((end-start)/1000);
  return Number.isSafeInteger(seconds)?seconds:null;
}

// One authoritative summary per visible Turn; neither group boundaries nor the
// last assistant segment establish completion. Entries remain in their own order.
export function settledTurnSummaries(entries,turns,rootSessionId) {
  const groups=new Map(),summaries=new Map();
  for(const entry of entries){
    const sessionId=scopeSession(entry.scope);
    if(sessionId===null||rootSessionId!==undefined&&sessionId!==rootSessionId)continue;
    if(!groups.has(entry.scope))groups.set(entry.scope,{entries:[],child:false});
    const group=groups.get(entry.scope);
    group.entries.push(entry);
    if(rootSessionId===undefined){
      const items=entry.kind==='process'?entry.items:[entry.item];
      if((items||[]).some(item=>{
        const value=payload(item);
        return !!value?.rootSessionId&&!!value?.sessionId&&value.rootSessionId!==value.sessionId;
      }))group.child=true;
    }
  }
  for(const [scope,group] of groups){
    if(group.child)continue;
    const turn=turns instanceof Map?turns.get(scope):Object.hasOwn(turns||{},scope)?turns[scope]:undefined;
    if(!turn||!SETTLED_STATUSES.has(turn.status))continue;
    const owner=group.entries.find(entry=>entry.kind!=='item'||entry.item?.type!=='user');
    const fallback=group.entries.at(-1);
    summaries.set(scope,{scope,ownerKey:(owner||fallback).key,afterOwner:!owner,
      processKeys:group.entries.filter(entry=>entry.kind==='process').map(entry=>entry.key),
      status:turn.status,seconds:completedSeconds(turn)});
  }
  return summaries;
}

// Numeric fragments let the native-style view use tabular code-font digits.
export function turnSummaryText(summary,t) {
  const key={completed:'flow.turnCompleted',cancelled:'flow.stopped',interrupted:'flow.interrupted',failed:'flow.turnFailed',error:'flow.turnFailed'}[summary.status];
  const seconds=summary.seconds;
  if(summary.status!=='completed'||!Number.isSafeInteger(seconds)||seconds<0)return {label:t(key),parts:[]};
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
  const units=[];
  if(hours)units.push([hours,'flow.hour']);
  if(hours||minutes)units.push([minutes,'flow.minute']);
  units.push([rest,'flow.second']);
  const parts=units.flatMap(([value,unit],index)=>[
    ...(index?[{text:t('flow.durationGap')}]:[]),{text:String(value),numeric:true},{text:t(unit)},
  ]);
  return {label:t('flow.turnTook'),parts};
}

// Protect the flat -> folded transition, not just the completion event: with
// next-input collapse a settled Turn can stay flat until a later Turn starts.
// The caller consumes the captured wasFlat flag after persisting this protection,
// so an explicit later close is never forced open again.
export function processFocusProtection(entries,policy,manual,focus) {
  if(!focus?.wasFlat)return null;
  const entry=entries.find(value=>value.kind==='process'&&value.key===focus.key&&value.scope===focus.scope);
  if(!entry||processGroupPresentation(entry,policy,manual?.[entry.key]).flat)return null;
  return {key:entry.key,scope:entry.scope,open:true,readingFlat:true};
}

// Coordinate the Turn summary with its process disclosure. Entry construction
// owns prose placement; flat policy wins and only actual reading/focus pins open.
export function settledTurnPresentation(summary,entries,policy,manual,choice,focused=false) {
  const keys=new Set(summary.processKeys);
  const groups=entries.filter(entry=>entry.kind==='process'&&entry.scope===summary.scope&&keys.has(entry.key));
  if(!groups.length)return {open:false,collapsible:false,pin:false};
  const saved=key=>manual instanceof Map?manual.get(key):manual?.[key];
  const flat=groups.some(entry=>processGroupPresentation(entry,policy,saved(entry.key)).flat);
  const reading=focused||groups.some(entry=>{
    const value=saved(entry.key);
    return (typeof value==='object'?value?.open:value)===true;
  });
  const pin=choice===undefined&&reading;
  return {open:flat||(typeof choice==='boolean'?choice:reading),collapsible:!flat,pin};
}
