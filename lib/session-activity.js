import { error } from './ssh.js';

export const ACTIVITY_HEARTBEAT_MS = 15_000;
const STATE_EVENTS = new Set(['session', 'lifecycle', 'user_message', 'turn_start', 'stop', 'error', 'permission', 'permission_resolved', 'elicitation', 'elicitation_resolved']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A metadata-only projection: transport liveness is not turn activity. */
export function sessionActivityState(state, terminal) {
  if (!state) return { status: 'idle' };
  if (state.detached || state.status === 'detached' || state.status === 'closed') return { status: 'disconnected' };
  if (state.status === 'error') return { status: 'error' };
  if (!state.alive && state.status !== 'starting') return { status: 'disconnected' };
  if (state.pendingPermissions?.length) return { status: 'waiting', waitingFor: 'permission' };
  if (state.pendingElicitations?.length) return { status: 'waiting', waitingFor: 'elicitation' };
  if (state.busy || state.pendingTurns > 0) return { status: 'running' };
  if (terminal?.generation === state.generation) return { status: terminal.status };
  return { status: 'idle' };
}

/** One Host-owned overview for all remote bindings; never reads event history or starts ACP. */
export function createSessionActivity({ runtime, getBindings, workspaceIds, enqueue = queueMicrotask }) {
  const subscribers = new Set(), terminal = new Map();
  let rows = new Map(), queued = false, stopped = false;
  function emit(event) { for (const listener of [...subscribers]) { try { listener(event); } catch {} } }
  function refresh() {
    if (stopped) return;
    const candidates = runtime.list();
    const bySession = new Map();
    for (const state of candidates) {
      const group = bySession.get(state.dshSessionId) || [];
      group.push(state); bySession.set(state.dshSessionId, group);
    }
    const workspaces = workspaceIds?.();
    const next = new Map();
    for (const binding of getBindings()) {
      if (!['claude', 'codex'].includes(binding.backend?.type) || workspaces && !workspaces.has(binding.workspaceId)) continue;
      const matching = (bySession.get(binding.sessionId) || []).filter(state => state.agent === binding.backend.type
        && state.workspaceId === binding.workspaceId && state.profileId === binding.profileId
        && state.cwd === binding.cwd && state.configuredRemotePath === binding.configuredRemotePath);
      // Match the Host's selected active/latest binding, never let an obsolete
      // error from a replaced runtime override a new ready/running instance.
      const state = matching.find(value => value.alive) || matching[0];
      const row = { sessionId: binding.sessionId, ...sessionActivityState(state, state && terminal.get(state.id)) };
      next.set(row.sessionId, row);
    }
    const previous = rows; rows = next;
    for (const sessionId of previous.keys()) if (!next.has(sessionId)) emit({ type: 'remove', sessionId });
    for (const [sessionId, row] of next) if (!same(previous.get(sessionId), row)) emit({ type: 'upsert', session: row });
    const retained = new Set(candidates.map(value => value.id));
    for (const id of terminal.keys()) if (!retained.has(id)) terminal.delete(id);
  }
  function changed() {
    if (stopped || queued) return;
    queued = true;
    enqueue(() => {
      queued = false;
      if (stopped) return;
      try { refresh(); } catch { emit({ type: 'reset', reason: 'unavailable' }); }
    });
  }
  return {
    refresh,
    changed,
    onEvent(event, session) {
      if (stopped || event?.inherited === true || !STATE_EVENTS.has(event?.type)) return;
      const root = !event.rootSessionId && (!event.sessionId || event.sessionId === session.sessionId);
      if (root && ['turn_start', 'session', 'lifecycle'].includes(event.type)) terminal.delete(session.id);
      if (root && event.type === 'stop' && event.submitted === true) {
        const status = ['end_turn', 'completed'].includes(event.stopReason) ? 'completed' : event.stopReason === 'cancelled' ? 'stopped' : event.stopReason === 'error' ? 'error' : 'idle';
        terminal.set(session.id, { generation: session.generation, status });
      }
      changed();
    },
    snapshot() { refresh(); return [...rows.values()]; },
    subscribe(listener) { if (stopped) return () => {}; subscribers.add(listener); return () => subscribers.delete(listener); },
    dispose() { if (stopped) return; stopped = true; emit({ type: 'reset', reason: 'host_stopped' }); subscribers.clear(); rows.clear(); terminal.clear(); },
  };
}

/** A single global overview stream, filtered independently for every canonical Session id. */
export function createSessionActivityEventStream({ activity, activeStreams, isDisposed = () => false,
  setInterval: schedule = globalThis.setInterval, clearInterval: unschedule = globalThis.clearInterval }) {
  const streams = new Set();
  return function sessionActivityEvents(req, res, permitted) {
    if (isDisposed()) throw error('host_stopped', 'Session activity is stopped');
    if (!permitted()) throw error('remote_access_denied', 'Session activity access denied');
    if (streams.size >= 8) throw Object.assign(error('too_many_streams', 'Too many Session activity streams'), { status: 429 });
    const visible = new Set();
    let ended = false, heartbeat, unsubscribe = () => {};
    const responseClosed = () => res.destroyed || res.closed || res.writableEnded || res.writableFinished;
    function close() {
      if (ended) return; ended = true;
      if (heartbeat !== undefined) unschedule(heartbeat);
      try { unsubscribe(); } catch {}
      streams.delete(close); activeStreams.delete(close); visible.clear();
      res.removeListener('close', close); res.removeListener('error', close); req.removeListener('aborted', close);
      if (!responseClosed()) { try { res.end(); } catch { res.destroy?.(); } }
    }
    function write(frame) {
      if (ended) return false;
      if (responseClosed() || req.aborted || res.writableNeedDrain || res.writable === false) { close(); return false; }
      try { if (res.write(JSON.stringify(frame) + '\n') === false) { close(); return false; } return !ended; }
      catch { close(); return false; }
    }
    function allowed(sessionId) { try { return permitted(sessionId) === true; } catch { return false; } }
    function authorized() {
      if (ended) return false;
      if (responseClosed() || req.aborted) { close(); return false; }
      if (isDisposed() || !allowed()) {
        write({ type: 'reset', reason: isDisposed() ? 'host_stopped' : 'access_revoked' }); close(); return false;
      }
      return true;
    }
    function remove(sessionId) { if (visible.delete(sessionId)) write({ type: 'remove', sessionId }); }
    function receive(event) {
      if (!authorized()) return;
      if (event.type === 'reset') { write(event); close(); return; }
      if (event.type === 'remove') { remove(event.sessionId); return; }
      const row = event.session;
      if (!allowed(row.sessionId)) { remove(row.sessionId); return; }
      if (write({ type: 'upsert', session: row })) visible.add(row.sessionId);
    }
    streams.add(close); activeStreams.add(close);
    res.on('close', close); res.on('error', close); req.on('aborted', close);
    try {
      if (!authorized()) return close;
      res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-content-type-options': 'nosniff', 'x-accel-buffering': 'no' });
      const rows = activity.snapshot().filter(row => allowed(row.sessionId));
      if (!authorized()) return close;
      for (const row of rows) visible.add(row.sessionId);
      unsubscribe = activity.subscribe(receive);
      if (ended) unsubscribe();
      else write({ type: 'snapshot', sessions: rows });
      if (!ended) {
        heartbeat = schedule(() => {
          if (!authorized()) return;
          try {
            const rows = activity.snapshot(); // Also catches lifecycle changes that emitted no ACP event.
            const current = new Set(rows.map(row => row.sessionId));
            for (const sessionId of [...visible]) if (!current.has(sessionId) || !allowed(sessionId)) remove(sessionId);
            for (const row of rows) if (!visible.has(row.sessionId) && allowed(row.sessionId)) receive({ type: 'upsert', session: row });
            if (authorized()) write({ type: 'heartbeat' });
          } catch { write({ type: 'reset', reason: 'unavailable' }); close(); }
        }, ACTIVITY_HEARTBEAT_MS);
        heartbeat?.unref?.();
        res.flushHeaders?.();
      }
      return close;
    } catch (e) { close(); throw e; }
  };
}
