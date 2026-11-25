import {transcriptScope,processGroupSummary} from './transcript-model.js';
import {toolFlowModel} from './tool-model.js';
import {acpNativeState,acpItemId} from './presentation.js';

const payload=item=>item?.type==='tool'?item.tool:item?.type==='subagent'?item.subagent:item;
const sequence=item=>Number(item?.lastSeq??payload(item)?.seq??item?.seq??0);
export function activeRootScope(turns={},rootSessionId) {
  return Object.entries(turns).filter(([scope,turn])=>turn.status==='running'&&(!rootSessionId||JSON.parse(scope)[0]===rootSessionId))
    .sort((a,b)=>(b[1].startSeq||0)-(a[1].startSeq||0))[0]?.[0]||null;
}
export function actionLabel(item,t,active=true) {
  const value=payload(item)||{};
  if(item?.type==='tool')return toolFlowModel(value).title||t('acp.tool');
  if(item?.type==='subagent')return String(value.title||value.description||t('acp.subagent'));
  if(item?.type==='plan')return active&&value.entries?.find(entry=>entry.status==='in_progress')?.content||t('acp.plan');
  if(item?.type==='terminal_event')return String(value.command||t('acp.terminalEvent'));
  return t(item?.type==='thought'?(active?'flow.thinking':'acp.thought'):(active?'flow.working':'flow.process'));
}
// Aggregate supplied event/tool categories, never infer intent from shell strings.
export function processCategorySummary(entry,t) {
  const counts=new Map();
  const tools={read:'Read',edit:'Edit',execute:'Execute',search:'Search'};
  const types={thought:'Thought',plan:'Plan',subagent:'Agent',terminal_event:'Execute'};
  for(const item of entry.items||[]){
    const kind=String(item.tool?.kind||'').toLowerCase();
    const category=item.type==='tool'?(Object.hasOwn(tools,kind)?tools[kind]:'Tool'):
      Object.hasOwn(types,item.type)?types[item.type]:'Tool';
    counts.set(category,(counts.get(category)||0)+1);
  }
  const labels=[...counts].slice(0,3).map(([category,count])=>`${t('flow.category'+category)} × ${count}`);
  if(counts.size>3)labels.push(`+${counts.size-3} ${t('flow.categoryOther')}`);
  return labels.join(' · ');
}
export function processTreeSummary(entry,childMap={}) {
  const seen=new Set(),items=[],stack=[...(entry.items||[])];
  while(stack.length){
    const item=stack.pop(),identity=item.key||acpItemId(item);
    if(seen.has(identity))continue;
    seen.add(identity);items.push(item);
    for(const child of childMap[acpItemId(item)]||[])stack.push(child);
  }
  const own=processGroupSummary(entry),all=processGroupSummary({...entry,items});
  return {...own,failedCount:all.failedCount};
}
// Connection state is not evidence of model progress. Never infer authorization
// or task completion from assistant prose, a clicked URL, or an old turn's tail.
export function conversationActivity(state) {
  if(!state.connected)return {kind:state.everConnected?'reconnecting':'connecting'};
  if(state.permissions?.length)return {kind:'permission'};
  if(state.elicitations?.length)return {kind:'question'};
  if(!state.running)return {kind:'idle'};
  const scope=activeRootScope(state.turns,state.binding?.sessionId);
  if(!scope)return {kind:'working'};
  const items=(state.items||[]).filter(item=>transcriptScope(item)===scope).sort((a,b)=>sequence(a)-sequence(b));
  const active=items.filter(item=>item.type==='tool'?toolFlowModel(item.tool).running:
    item.type==='subagent'?acpNativeState(item.subagent?.state??item.subagent?.status).dot==='ongoing':false);
  if(active.length)return {kind:'activity',item:active.at(-1),count:active.length,scope};
  const latest=items.at(-1);
  return {kind:latest?.type==='assistant'?'replying':latest?.type==='thought'&&latest.streaming!==false?'thinking':'working',scope,item:latest};
}
export function responseCopyParts(item,entry={}) {
  const part=String(item?.text||'');
  const turn=entry.responseTail&&entry.responseText&&entry.responseText!==part?entry.responseText:null;
  return {part,turn};
}
