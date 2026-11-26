import {acpNormalizeExit} from './presentation.js';
const PROCESS_TYPES = new Set(['thought','tool','plan','subagent','terminal_event']);
const processValue = item => item?.type === 'tool' ? item.tool : item?.type === 'subagent' ? item.subagent : item;
export function transcriptScope(item) {
  const value = processValue(item);
  return JSON.stringify([value?.sessionId || '',value?.turnId || item?.key || '']);
}
export function transcriptPolicy(preferences={},defaultMode='detailed') {
  const mode=['compact','standard','detailed','verbose'].includes(preferences.transcriptView)?preferences.transcriptView:defaultMode;
  return {mode,stepGrouping:mode==='verbose'?'none':mode==='detailed'?'history':'collapsed',foldCompleted:mode!=='verbose',showProcessSummary:mode!=='compact',showSettledReasoning:mode==='detailed'||mode==='verbose',
    collapseTiming:preferences.collapseTiming==='next-input'?'next-input':'completion',
    foldedReplies:preferences.foldedReplies==='final'?'final':'all'};
}
export function visibleTranscriptItem(item) {
  if (!item) return false;
  // Unsubmitted inputs belong to the native queue dock, not duplicate chat
  // bubbles. The canonical turn_start makes accepted input visible later.
  if (item.type==='user'&&['queued','cancelled'].includes(item.delivery)) return false;
  if (item.type==='system'&&item.submitted===false&&item.stopReason==='cancelled') return false;
  if (['assistant','thought'].includes(item.type)) return !!String(item.text || '').trim();
  if (item.type === 'state' && !item.error && !item.errorMessage && !item.stopReason) return false;
  if (item.type === 'native_event' && ['title','lifecycle'].includes(item.event?.type)) return false;
  return true;
}
// Select across the full transcript using authoritative completion, never the
// current visual tail or connection state. This is also the final-copy contract.
export function completedResponseCopyKeys(items=[],turns={}) {
  const finalByScope=new Map();
  for(const item of items){
    if(item?.type!=='assistant'||!item.key||!String(item.text||'').trim())continue;
    const scope=transcriptScope(item),turn=turns[scope],seq=item.lastSeq??item.seq;
    if(turn?.status!=='completed'||!Number.isSafeInteger(turn.endSeq)||!Number.isSafeInteger(seq)||seq<1||seq>=turn.endSeq)continue;
    const previous=finalByScope.get(scope);
    if(!previous||seq>(previous.lastSeq??previous.seq))finalByScope.set(scope,item);
  }
  return new Set([...finalByScope.values()].map(item=>item.key));
}
function responseEntries(items,turns) {
  const responses=new Map(),entries=new Map();
  for(const item of items){
    if(item.type!=='assistant'||!visibleTranscriptItem(item))continue;
    const scope=transcriptScope(item);
    if(!responses.has(scope))responses.set(scope,[]);
    responses.get(scope).push(item);
  }
  for(const [scope,parts] of responses){
    const responseText=parts.map(item=>String(item.text||'')).join('\n\n');
    for(const item of parts)entries.set(item,{kind:'item',key:item.key,item,scope,responseText,
      responseTail:item===parts.at(-1),turn:turns[scope]||null});
  }
  return entries;
}
// Render assistant rows inside a process with the same metadata as standalone
// replies. Pass the original sibling items, not only the process subset.
export function responseEntry(item,turns={},items=[item]) {
  return responseEntries(items,turns).get(item)||{kind:'item',key:item.key,item,scope:transcriptScope(item),turn:turns[transcriptScope(item)]||null};
}
export function transcriptEntries(items,{turns={},allItems=items}={}) {
  const visible=items.filter(visibleTranscriptItem),entries=[],groups=new Map(),latestUser=new Map(),latestStart=new Map();
  const finalKeys=completedResponseCopyKeys(allItems,turns),responses=responseEntries(visible,turns);
  for(const [scope,turn] of Object.entries(turns)){
    const sessionId=JSON.parse(scope)[0];
    if(Number.isFinite(turn.startSeq))latestStart.set(sessionId,Math.max(latestStart.get(sessionId)||0,turn.startSeq));
  }
  for(let index=0;index<visible.length;index++){
    const item=visible[index];
    if(item.type==='user')latestUser.set(item.sessionId||'',index);
  }
  for(let index=0;index<visible.length;index++){
    const item=visible[index],scope=transcriptScope(item);
    const inProcess=PROCESS_TYPES.has(item.type)||item.type==='assistant'&&!finalKeys.has(item.key);
    if(!inProcess){entries.push(responses.get(item)||{kind:'item',key:item.key,item,scope});continue;}
    const source=processValue(item);
    // Missing turn identity is not permission to coalesce unrelated history.
    // Valid identities do not depend on the first loaded item (history prepends).
    const scoped=!!source?.turnId;
    const key=scoped?`process:${scope}`:`process:item:${JSON.stringify([source?.sessionId||'',item.key??index])}`;
    let group=scoped?groups.get(scope):null;
    if(!group){
      const settled=turns[scope]?.status && turns[scope].status!=='running';
      group={kind:'process',key,items:[],responses:new Map(),scope,settled:!!settled,
        laterInput:(latestUser.get(source?.sessionId||'')??-1)>index || Number.isFinite(turns[scope]?.endSeq)&&(latestStart.get(source?.sessionId||'')||0)>turns[scope].endSeq,
        interrupted:!!settled&&turns[scope].status!=='completed'};
      entries.push(group);if(scoped)groups.set(scope,group);
    }
    group.items.push(item);
    if(responses.has(item))group.responses.set(item.key,responses.get(item));
  }
  return entries;
}
// Facts for a group header, independent of text, React, or an inferred outcome.
export function processGroupSummary(entry) {
  const items=entry?.items || [];
  let runningItem=null,latest=-Infinity,failedCount=0;
  for(const item of items){
    const value=processValue(item)||{};
    const raw=value.state ?? value.status;
    const status=String(typeof raw==='object' ? raw?.type || raw?.state || raw?.status || '' : raw || '').toLowerCase();
    const terminals=[...(Array.isArray(value.terminals)?value.terminals:[]),...(Array.isArray(value.content)?value.content.filter(block=>block?.type==='terminal'):[])];
    const exits=[value.exitStatus ?? value.exitCode,...terminals.map(terminal=>terminal.exitStatus ?? terminal.exitCode)]
      .filter(exit=>exit!==undefined&&exit!==null&&exit!=='').map(acpNormalizeExit);
    const failed=['failed','error'].includes(status)||exits.some(exit=>Number.isFinite(exit.exitCode)&&exit.exitCode!==0||!!exit.signal);
    if(failed)failedCount++;
    const active=item.type==='assistant' ? item.streaming!==false && item.inherited!==true && item===items.at(-1)
      : item.type==='thought' ? item.streaming===true && item.inherited!==true && item===items.at(-1)
      : item.type==='plan' ? item.settled!==true && !item.removed && (Array.isArray(item.entries)?item.entries:[]).some(step=>step.status==='in_progress')
      : ['running','working','in_progress','pending'].includes(status)||exits.some(exit=>exit.running===true);
    const seq=Number(value.lastSeq ?? item.lastSeq ?? value.seq ?? item.seq ?? 0);
    if(!entry.settled&&!failed&&active&&seq>=latest){runningItem=item;latest=seq;}
  }
  return {runningItem,failedCount,count:items.length};
}
export function processGroupPresentation(entry,policy,manual) {
  const flat=policy.stepGrouping==='none'||policy.stepGrouping==='history'&&
    (!entry.settled||policy.collapseTiming==='next-input'&&!entry.laterInput);
  const requested=typeof manual==='object'?manual?.open:manual;
  const open=flat||requested===true;
  // Never crop a reader's already-open flat content when the turn ends.
  // A deliberate close/reopen clears this exception and restores the normal cap.
  const scrollBody=!flat&&!(open&&manual?.readingFlat);
  return {flat,open,scrollBody};
}
export function processGroupOpen(entry,policy,manual) {
  return processGroupPresentation(entry,policy,manual).open;
}
// A bounded process list opens at the live tail or at the start of history.
// Subsequent updates preserve a reader's scroll position unless they follow the tail.
export function processBodyScrollTop({scrollHeight,clientHeight,scrollTop},{opening,running,following}) {
  if(opening&&!running)return 0;
  if(running&&(opening||following))return Math.max(0,scrollHeight-clientHeight);
  return scrollTop;
}
export function responseHidden(entry,policy,foldedScopes) {
  // responseTail is positional, not an authoritative final-answer marker.
  // Process grouping owns folding; never independently discard assistant prose.
  return false;
}
export function followsTranscriptTail({scrollHeight,scrollTop,clientHeight}, threshold=32) {
  return scrollHeight-scrollTop-clientHeight <= threshold;
}
export function anchoredScrollTop({currentTop,previousOffset,nextOffset}) {
  return Math.max(0,currentTop+nextOffset-previousOffset);
}
export function mayRestoreTranscriptAnchor({startedAtGeneration,currentGeneration,sameViewport,live}) {
  return live&&sameViewport&&startedAtGeneration===currentGeneration;
}
