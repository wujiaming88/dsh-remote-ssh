import {transcriptScope,processGroupSummary,completedResponseCopyKeys} from './transcript-model.js';
export {completedResponseCopyKeys};
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
  if(item?.type==='assistant')return t(active?'flow.replying':'flow.agent');
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
export function remoteConnectionPresentation(state) {
  const closed=state.binding?.status==='closed';
  const transport=state.binding?.transportState;
  const offline=!closed&&!!state.binding?.remoteExecution&&!!transport&&transport!=='connected';
  return {closed,offline,retryable:offline&&['error','disconnected','detached'].includes(transport)};
}
// Browser subscription health and SSH transport health are independent. A normal
// HTTP EOF must not tell the user that the remote SSH connection was lost.
export function connectionLabelKey(state) {
  const remote=remoteConnectionPresentation(state);
  if(remote.closed)return null;
  if(remote.offline)return remote.retryable?null:state.binding.transportState==='connecting'?'flow.remoteConnecting':'flow.remoteReconnecting';
  if(state.connected)return null;
  if(!state.everConnected)return 'flow.syncConnecting';
  return state.subscriptionDiagnostic?.reason==='eof'?'flow.syncResuming':'flow.syncReconnecting';
}
export function conversationActivity(state) {
  const remote=remoteConnectionPresentation(state);
  if(remote.closed)return {kind:'idle'};
  if(remote.offline)return {kind:remote.retryable?'idle':'reconnecting'};
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
