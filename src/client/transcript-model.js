const PROCESS_TYPES = new Set(['thought','tool','plan','subagent','terminal_event']);
export function transcriptScope(item) {
  const value = item?.type === 'tool' ? item.tool : item;
  return JSON.stringify([value?.sessionId || '',value?.turnId || item?.key || '']);
}
export function transcriptPolicy(preferences={},defaultMode='detailed') {
  const mode=['compact','standard','detailed','verbose'].includes(preferences.transcriptView)?preferences.transcriptView:defaultMode;
  return {mode,stepGrouping:mode==='verbose'?'none':mode==='detailed'?'history':'collapsed',foldCompleted:mode!=='verbose',showProcessSummary:mode!=='compact',showSettledReasoning:mode!=='compact',
    collapseTiming:preferences.collapseTiming==='next-input'?'next-input':'completion',
    foldedReplies:preferences.foldedReplies==='final'?'final':'all'};
}
export function visibleTranscriptItem(item) {
  if (!item) return false;
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
    const source=item.type==='tool'?item.tool:item;
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
export function processGroupOpen(entry,policy,manual) {
  return manual ?? (!policy.foldCompleted||!entry.settled||entry.interrupted||policy.collapseTiming==='next-input'&&!entry.laterInput);
}
export function responseHidden(entry,policy,foldedScopes) {
  return entry.kind==='item'&&entry.item.type==='assistant'&&policy.foldedReplies==='final'&&foldedScopes.has(entry.scope)&&entry.responseTail===false;
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
