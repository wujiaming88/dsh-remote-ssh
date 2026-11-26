// Pure event projection shared by live delivery and durable history replay.
const list = value => Array.isArray(value) ? value : [];
const defined = (before, patch) => Object.assign({}, before, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined && value !== null)));
const itemKey = event => `${event.generation || 'event'}:${event.seq}`;
const requestKey = event => {
  const id = event.requestId || event.displayRequestId;
  return id ? JSON.stringify([id, event.sessionId || '', event.parentToolCallId || '']) : '';
};
const origin = event => [event.sessionId, event.turnId, event.messageId, event.parentToolCallId].map(value => value || '').join('|');

export function initialState() {
  return { cursor: { generation: '', seq: 0 }, items: [], permissions: [], elicitations: [], commands: [],
    config: {}, capabilities: {}, usage: null, suggestions: [], binding: null, queuedMessages: [], queueCursor: { generation: '', seq: 0 },
    running: false, loading: true, connected: false, everConnected: false, transportError: '', subscriptionDiagnostic: null,
    error: '', title: '', turns: {}, hasEarlier: false, oldestSeq: null };
}
// An HTTP receipt can race newer SSE queue events. Never resurrect a consumed
// or removed row from an older snapshot, including after history pagination.
function queueProjection(state,queuedMessages,cursor) {
  if(!Array.isArray(queuedMessages)||!Number.isSafeInteger(cursor?.seq)||cursor.seq<0||!cursor.generation)return {};
  const previous=state.queueCursor||{generation:'',seq:0};
  if(previous.generation===cursor.generation&&previous.seq>cursor.seq)return {};
  if(previous.generation&&previous.generation!==cursor.generation&&state.cursor.generation&&state.cursor.generation!==cursor.generation)return {};
  return {queuedMessages,queueCursor:{generation:cursor.generation,seq:cursor.seq}};
}
export function applySnapshot(state, snapshot = {}) {
  return { ...state, ...queueProjection(state,snapshot.queuedMessages,snapshot.cursor), binding: { ...state.binding, ...snapshot }, loading: false,
    config: snapshot.config || state.config, capabilities: snapshot.capabilities || state.capabilities,
    commands: Array.isArray(snapshot.commands) ? snapshot.commands : state.commands,
    running: snapshot.busy === true || snapshot.status === 'prompting' || snapshot.status === 'starting',
    permissions: list(snapshot.pendingPermissions), elicitations: list(snapshot.pendingElicitations),
    title: snapshot.title || state.title, error: snapshot.lastError || '' };
}
function upsert(items, match, next) {
  const index = items.findIndex(match);
  if (index < 0) return [...items, next()];
  const result = items.slice(); result[index] = next(items[index]); return result;
}
function appendText(items, event, type) {
  const last = items.at(-1), identity = origin(event);
  if (last?.type === type && last.identity === identity) {
    return [...items.slice(0, -1), { ...last, lastSeq: event.seq, ...(type === 'thought' ? {streaming:true} : {}), text: event.append === false ? String(event.text || '') : last.text + String(event.text || '') }];
  }
  return [...items, { ...event, key: itemKey(event), type, identity, lastSeq: event.seq, ...(type === 'thought' ? {streaming:true} : {}), text: String(event.text || '') }];
}
function finishThoughts(items, event) {
  return items.map(item => item.sessionId === event.sessionId && (!event.turnId || item.turnId === event.turnId)
    ? item.type === 'thought' ? {...item,streaming:false}
      : item.type === 'plan' ? {...item,settled:true,settledReason:event.type === 'stop' ? 'stop' : 'idle'} : item
    : item);
}
const planIdentity = event => JSON.stringify([event.sessionId || '',event.turnId || '',event.parentToolCallId || '',event.planId || '']);
const receiptIdentity = item => JSON.stringify([item.interaction,item.sessionId || '',item.turnId || '',item.requestId || '',item.parentToolCallId || '']);
function resolveInteraction(state, event, interaction) {
  const field = interaction === 'permission' ? 'permissions' : 'elicitations';
  const pending = state[field];
  let matches = event.requestId == null ? pending : pending.filter(item => String(item.requestId) === String(event.requestId));
  // Broker request IDs are unique. If a replay contains collisions, only a
  // supplied matching scope may disambiguate them; never resolve both by guess.
  if (matches.length > 1 && event.requestId != null) {
    matches = matches.filter(item => ['sessionId','turnId','parentToolCallId'].every(key => event[key] == null || event[key] === item[key]));
    if (matches.length !== 1) return state;
  }
  const outcome = event.type.endsWith('_cancelled') || event.outcome === 'cancelled' || event.action === 'cancel' ? 'cancelled' : 'resolved';
  const previousReceipts = state.items.filter(item => item.type === 'interaction_receipt' && item.interaction === interaction &&
    event.requestId != null && item.requestId === String(event.requestId) &&
    ['sessionId','turnId','parentToolCallId'].every(key => event[key] == null || event[key] === item[key]));
  const sources = matches.length ? matches : event.requestId != null ? [previousReceipts.length === 1 ? previousReceipts[0] : event] : [];
  let items = state.items;
  for (const source of sources) {
    // Deliberate allowlist: no message, answer, option value, schema or raw data.
    const receipt = {type:'interaction_receipt',interaction,outcome,
      sessionId:source.sessionId || event.sessionId || '',turnId:source.turnId || event.turnId || '',
      requestId:String(source.requestId ?? event.requestId ?? ''),parentToolCallId:source.parentToolCallId || event.parentToolCallId || ''};
    const previousDecision = source.type === 'interaction_receipt' && ['allowed','denied','answered','declined','resolved','cancelled'].includes(source.decision) ? source.decision : 'resolved';
    const kind = interaction === 'permission' && event.outcome === 'selected'
      ? list(source.options).find(option => option.optionId === event.optionId)?.kind : null;
    receipt.decision = outcome === 'cancelled' ? 'cancelled'
      : interaction === 'question' && event.action === 'accept' ? 'answered'
      : interaction === 'question' && event.action === 'decline' ? 'declined'
      : ['allow_once','allow_always'].includes(kind) ? 'allowed'
      : ['reject_once','reject_always'].includes(kind) ? 'denied' : previousDecision;
    const identity = receiptIdentity(receipt);
    items = upsert(items,item => item.type === 'interaction_receipt' && receiptIdentity(item) === identity,
      item => ({...receipt,key:item?.key || `receipt:${identity}`,seq:event.seq,lastSeq:event.seq}));
  }
  return {...state,items,[field]:pending.filter(item => !matches.includes(item))};
}
export function reduceEvent(previous, event) {
  if (!event || typeof event !== 'object') return previous;
  if (event.type === 'replay') {
    if (!event.reset) return previous;
    return { ...initialState(), binding: previous.binding, capabilities: previous.capabilities, config: previous.config,
      loading: false, cursor: { generation: event.cursor?.generation || '', seq: 0 } };
  }
  if (!Number.isSafeInteger(event.seq) || event.seq < 1) return previous;
  let state = previous;
  if (event.generation && state.cursor.generation && state.cursor.generation !== event.generation) {
    state = { ...initialState(), binding: state.binding, config: state.config, capabilities: state.capabilities, loading: false };
  }
  if (event.seq <= state.cursor.seq) return state;
  state = { ...state, cursor: { generation: event.generation || state.cursor.generation, seq: event.seq } };
  const key = itemKey(event), items = state.items;
  const rootEvent = !event.rootSessionId || event.rootSessionId === event.sessionId;
  switch (event.type) {
    case 'queue_snapshot': return rootEvent?{...state,...queueProjection(state,event.queuedMessages,state.cursor)}:state;
    case 'text': return { ...state, items: appendText(items, event, 'assistant') };
    case 'thought': return { ...state, items: appendText(items, event, 'thought') };
    case 'user_message': return { ...state, running: true, items: upsert(items,
      item => item.type === 'user' && requestKey(event) && requestKey(item) === requestKey(event),
      item => ({ ...item, ...event, key: item?.key || key, type: 'user', text: String(event.text || '') })) };
    case 'turn_start': {
      const scope=JSON.stringify([event.sessionId||'',event.turnId||'']);
      // A queued message is admitted at enqueue time, which lands before the
      // previous turn's completion. Promote it to the transcript tail so it
      // appears after that turn's final reply, not interleaved inside it.
      let accepted = null;
      const remaining = [];
      for (const item of items) {
        if (item.type === 'user' && item.delivery === 'queued' && requestKey(event) && requestKey(item) === requestKey(event)) accepted = { ...item, delivery: 'accepted' };
        else remaining.push(item);
      }
      if (accepted) remaining.push(accepted);
      return { ...state, running: rootEvent ? true : state.running,
        turns: event.turnId ? {...state.turns,[scope]:{...state.turns[scope],status:'running',startSeq:event.seq,startedAt:Number.isFinite(event.ts)?event.ts:null}} : state.turns,
        items: remaining };
    }
    case 'tool_call': case 'tool_call_update':
      return { ...state, items: upsert(items, item => item.type === 'tool' && item.tool.toolCallId === event.toolCallId && item.tool.sessionId === event.sessionId,
        item => ({ key: item?.key || key, type: 'tool', tool: defined(item?.tool, event) })) };
    case 'permission':
      return event.autoResolved ? state : { ...state, permissions: [...state.permissions.filter(value => value.requestId !== event.requestId), event] };
    case 'permission_resolved': case 'permission_cancelled': return resolveInteraction(state,event,'permission');
    case 'elicitation':
      return event.supported === false ? state : { ...state, elicitations: [...state.elicitations.filter(value => value.requestId !== event.requestId), event] };
    case 'elicitation_resolved': case 'elicitation_cancelled':
      return resolveInteraction(state,event,'question');
    case 'commands': return { ...state, commands: list(event.commands) };
    case 'config': return { ...state, config: event.config || state.config };
    case 'mode': return { ...state, config: event.config || { ...state.config, mode: event.currentModeId,
      modes: { ...state.config.modes, currentModeId: event.currentModeId } } };
    case 'session': return { ...state, binding: { ...state.binding, ...event.session }, config: event.config || state.config,
      capabilities: event.capabilities || state.capabilities };
    case 'session_info': return { ...state, title: event.title ?? state.title };
    case 'usage': return rootEvent && event.inherited !== true ? { ...state, usage: event.usage || event } : state;
    case 'suggestions': return { ...state, suggestions: list(event.suggestions) };
    case 'stop': {
      const finished = finishThoughts(items,event);
      const updated = event.submitted === false && requestKey(event)
        ? finished.map(item => item.type === 'user' && requestKey(item) === requestKey(event) ? { ...item, delivery: 'cancelled' } : item) : finished;
      const scope=JSON.stringify([event.sessionId||'',event.turnId||'']);
      const status=event.stopReason==='cancelled'?'cancelled':event.stopReason==='end_turn'||event.stopReason==='completed'?'completed':'interrupted';
      return { ...state, running: rootEvent ? event.busy === true || event.pendingTurns > 0 : state.running,
        turns: event.turnId ? {...state.turns,[scope]:{...state.turns[scope],status,stopReason:event.stopReason,endSeq:event.seq,endedAt:Number.isFinite(event.ts)?event.ts:null}} : state.turns,
        items: event.stopReason && event.stopReason !== 'end_turn' ? [...updated, { ...event, key, type: 'system', text: event.stopReason }] : updated };
    }
    case 'error': return { ...state, error: event.message || event.code || 'Agent error', running: event.fatal ? false : state.running,
      binding: event.fatal ? { ...state.binding, status: 'error' } : state.binding,
      items: [...items, { ...event, key, type: 'error', text: event.message || event.code || '' }] };
    case 'plan': {
      const identity = planIdentity(event),turn = state.turns[JSON.stringify([event.sessionId || '',event.turnId || ''])];
      return {...state,items:upsert(items,item => item.type === 'plan' && planIdentity(item) === identity,
        item => ({...defined(item,event),key:item?.key || key,type:'plan',lastSeq:event.seq,
          settled:item?.settled === true || !!turn?.status && turn.status !== 'running'}))};
    }
    case 'plan_removed': return {...state,items:items.map(item => item.type === 'plan' && planIdentity(item) === planIdentity(event)
      ? {...item,settled:true,settledReason:'removed',removed:true,lastSeq:event.seq} : item)};
    case 'notice': return { ...state, items: [...items, { ...event, key, type: 'notice' }] };
    case 'compaction': case 'compaction_chunk': {
      const match = item => item.type === 'compaction' && item.compactionId === event.compactionId && item.sessionId === event.sessionId;
      if (event.type === 'compaction') {
        return { ...state, items: upsert(items, match, item => ({ ...item, ...event, key: item?.key || key, type: 'compaction' })) };
      }
      const text = event.content && event.content.type === 'text' ? String(event.content.text || '') : '';
      return { ...state, items: upsert(items, match, item => ({ ...item, key: item?.key || key, type: 'compaction',
        compactionId: item?.compactionId || event.compactionId, summaryText: String(item?.summaryText || '') + text })) };
    }
    case 'subagent': case 'subagent_update': {
      const identity = event.taskId || event.toolUseId || event.agentId || event.sessionId || key;
      return { ...state, items: upsert(items, item => item.type === 'subagent' && item.identity === identity,
        item => ({ key: item?.key || key, type: 'subagent', identity, _key: identity,
          parentToolCallId: event.parentToolCallId || item?.parentToolCallId,
          subagent: defined(item?.subagent, event) })) };
    }
    case 'state': {
      const value = typeof event.state === 'object' ? event.state?.state : event.state;
      const running = ['running', 'working', 'requires_action', 'requires-action'].includes(value) ? true : value === 'idle' ? false : state.running;
      return { ...state, running: rootEvent ? running : state.running,
        items: upsert(value === 'idle' ? finishThoughts(items,event) : items, item => item.type === 'state' && item.sessionId === event.sessionId,
          item => ({ ...event, key: item?.key || key, type: 'state' })) };
    }
    case 'terminal':
      return { ...state, items: upsert(items, item => item.type === 'terminal_event' && item.terminalId === event.terminalId && item.sessionId === event.sessionId,
        item => ({ ...defined(item, event), key: item?.key || key, type: 'terminal_event',
          output: event.chunk ? String(item?.output || '') + String(event.output || '') : String(event.output ?? item?.output ?? '') })) };
    case 'session_message': {
      const match = item => item.type === 'session_message' && item.messageId && item.messageId === event.messageId && item.sessionId === event.sessionId;
      return { ...state, items: upsert(items, match, item => ({ ...defined(item, event), key: item?.key || key, type: 'session_message',
        text: event.chunk ? String(item?.text || '') + String(event.text || '') : String(event.text || '') })) };
    }
    case 'request_ack': return state;
    default: return { ...state, items: [...items, { ...event, key, type: 'native_event', event }] };
  }
}
export function replay(events, snapshot, previous = initialState()) {
  let state = { ...initialState(), binding: previous.binding, capabilities: previous.capabilities, config: previous.config,
    queuedMessages:previous.queuedMessages||[],queueCursor:previous.queueCursor||{generation:'',seq:0},loading: false };
  for (const event of events.slice().sort((a, b) => a.seq - b.seq)) state = reduceEvent(state, event);
  return applySnapshot(state, snapshot || previous.binding || {});
}
