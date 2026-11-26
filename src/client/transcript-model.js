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
export function transcriptEntries(items,{turns={}}={}) {
  const visible=items.filter(visibleTranscriptItem),entries=[],responses=new Map(),lastAssistant=new Map(),latestUser=new Map(),latestStart=new Map();
  for(const [scope,turn] of Object.entries(turns)){
    const sessionId=JSON.parse(scope)[0];
    if(Number.isFinite(turn.startSeq))latestStart.set(sessionId,Math.max(latestStart.get(sessionId)||0,turn.startSeq));
  }
  for(let index=0;index<visible.length;index++){
    const item=visible[index],scope=transcriptScope(item);
    if(item.type==='assistant'){
      if(!responses.has(scope))responses.set(scope,[]);
      responses.get(scope).push(String(item.text||''));lastAssistant.set(scope,item.key);
    }
    if(item.type==='user'&&item.delivery!=='queued'&&item.delivery!=='cancelled')latestUser.set(item.sessionId||'',index);
  }
  const responseTexts=new Map([...responses].map(([scope,parts])=>[scope,parts.join('\n\n')]));
  for(let index=0;index<visible.length;){
    const item=visible[index],scope=transcriptScope(item);
    if(!PROCESS_TYPES.has(item.type)){entries.push({kind:'item',key:item.key,item,scope});index++;continue;}
    const run=[];let end=index;
    while(end<visible.length&&PROCESS_TYPES.has(visible[end].type)&&transcriptScope(visible[end])===scope)run.push(visible[end++]);
    const settled=turns[scope]?.status && turns[scope].status!=='running';
    const source=processValue(item);
    entries.push({kind:'process',key:`process:${item.key}`,items:run,scope,settled:!!settled,
      laterInput:(latestUser.get(source?.sessionId||'')??-1)>index || Number.isFinite(turns[scope]?.endSeq)&&(latestStart.get(source?.sessionId||'')||0)>turns[scope].endSeq,
      interrupted:!!settled&&turns[scope].status!=='completed'});index=end;
  }
  for(const entry of entries)if(entry.kind==='item'&&entry.item.type==='assistant'){
    entry.responseText=responseTexts.get(entry.scope);
    entry.responseTail=lastAssistant.get(entry.scope)===entry.item.key;
    entry.turn=turns[entry.scope]||null;
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
    const active=item.type==='thought' ? item.streaming===true && item.inherited!==true && item===items.at(-1)
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
  // Preserve every assistant segment until a reliable final-content contract exists.
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
