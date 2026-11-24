/** Record real external turns through DSH's public Session/projection contracts.
 * No native Agent is created or invoked. Only standard turn and user-message
 * events are appended; correlation lives in the standard stable message id.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { REMOTE_SESSION_PROJECTION_KEY } from './protocol.js';

const REMOTE_VIEW = Object.freeze({ remote: true });
const NATIVE_VIEW = Object.freeze({ remote: false });
const PREFIX = 'remote-acp-turn:';
const MessageState = z.object({ turn: z.number().int().positive(), ended: z.boolean(), seq: z.number().int().nonnegative() }).strict();
const ProjectionState = z.object({
  sessionId: z.string(),
  seeded: z.boolean(),
  lastTurn: z.number().int().nonnegative(),
  open: z.object({ turn: z.number().int().positive(), messageId: z.string().nullable() }).strict().nullable(),
  messages: z.record(z.string(), MessageState),
  foreign: z.boolean(),
}).strict();

function fail(code, message) {
  const error = new Error(message);
  error.name = 'RemoteTurnRecorderError';
  error.code = code;
  throw error;
}

function messageId(sessionId, acpId, turnId, suffix = '') {
  return PREFIX + Buffer.from(JSON.stringify([sessionId, acpId, turnId, suffix])).toString('base64url');
}

function parseMessageId(id) {
  if (typeof id !== 'string' || !id.startsWith(PREFIX)) return null;
  try {
    const parts = JSON.parse(Buffer.from(id.slice(PREFIX.length), 'base64url').toString('utf8'));
    if (!Array.isArray(parts) || parts.length !== 4 || parts.some(value => typeof value !== 'string') || !parts[0] || !parts[1] || !parts[2]) return null;
    return parts;
  } catch { return null; }
}

/** Pure fold. The registry owns replay and checkpoint restoration. */
export const remoteTurnProjectionDefinition = {
  key: REMOTE_SESSION_PROJECTION_KEY,
  stateVersion: 2,
  stateSchema: ProjectionState,
  wire: {
    viewSchema: z.object({ remote: z.boolean() }).strict(),
    // Expose only the durable fact; counters, identities and content stay private.
    // Shared values preserve Object.is across later internal-only transitions.
    view: state => Object.keys(state.messages).some(id => parseMessageId(id)?.[3] === '') ? REMOTE_VIEW : NATIVE_VIEW,
  },
  init: header => ({ sessionId: String(header.id), seeded: header.isSeeded === true, lastTurn: 0, open: null, messages: {}, foreign: false }),
  apply(state, event) {
    if (event.type === 'step/start') return state.foreign ? state : { ...state, foreign: true };
    if (event.type === 'turn/start') {
      const turn = event.data.turn;
      if (!Number.isSafeInteger(turn) || turn <= state.lastTurn) return { ...state, foreign: true };
      return { ...state, lastTurn: turn, open: { turn, messageId: null }, foreign: state.foreign || state.open !== null };
    }
    if (event.type === 'user/message') {
      const id = event.data.id;
      const identity = parseMessageId(id);
      if (!identity || (identity[0] !== state.sessionId && !state.seeded) || event.data.source.kind !== 'user') return { ...state, foreign: true };
      if (state.messages[id]) return state;
      if (!state.open || (identity[3] === '' && state.open.messageId !== null)) return { ...state, foreign: true };
      const open = identity[3] === '' ? { ...state.open, messageId: id } : state.open;
      return { ...state, open, messages: { ...state.messages, [id]: { turn: open.turn, ended: false, seq: event.seq } } };
    }
    if (event.type === 'turn/end') {
      if (!state.open || state.open.turn !== event.data.turn || !state.open.messageId) return { ...state, open: null, foreign: true };
      const messages = { ...state.messages };
      for (const [id, value] of Object.entries(messages)) if (value.turn === state.open.turn) messages[id] = { ...value, ended: true };
      return { ...state, open: null, messages };
    }
    return state;
  },
};

function promptBlocks(prompt) {
  const content = typeof prompt === 'string' ? [{ type: 'text', text: prompt }] : prompt;
  if (!Array.isArray(content)) fail('invalid_remote_content', 'Remote prompt content must be an array');
  return content;
}

function contentKey(content) {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function textContent(content) {
  return content.map(block => {
    if (block?.type !== 'text' || typeof block.text !== 'string') fail('native_content_admission_required', 'Non-text remote input requires native attachment admission before submission');
    return { type: 'text', text: block.text };
  });
}

function nativeContent(content) {
  if (!Array.isArray(content) || content.some(block => !block || !['text', 'image', 'file'].includes(block.type))) fail('invalid_native_content', 'Native content must contain admitted text/image/file blocks');
  if (content.some(block => block.type === 'text' ? typeof block.text !== 'string' : !block.attachment || typeof block.attachment !== 'object')) fail('invalid_native_content', 'Native image/file blocks require durable attachment references');
  return JSON.parse(JSON.stringify(content));
}

function endReason(event, error) {
  if (error?.code === 'runtime_shutdown') return { kind: 'aborted', reason: { kind: 'disposed' } };
  if (event.stopReason === 'cancelled') return { kind: 'aborted', reason: { kind: 'user' } };
  if (event.stopReason === 'end_turn' || event.stopReason === 'completed') return { kind: 'completed' };
  if (event.stopReason === 'max_tokens') return { kind: 'max-tokens' };
  if (event.stopReason === 'refusal') return { kind: 'blocked' };
  return { kind: 'error', error: { code: 'UNKNOWN', message: String(error?.message || `Remote turn ended: ${event.stopReason || 'unknown'}`) } };
}

export class RemoteTurnRecorder {
  static async create(options = {}) {
    if (typeof options.sessionProjections?.register !== 'function') fail('projection_required', 'RemoteTurnRecorder requires the public SessionProjectionRegistry');
    if (typeof options.sessions?.get !== 'function' || typeof options.sessions?.flush !== 'function') fail('session_store_required', 'RemoteTurnRecorder requires the public SessionStore for membership and durability');
    const handle = await options.sessionProjections.register(remoteTurnProjectionDefinition);
    return new RemoteTurnRecorder(handle, options);
  }

  constructor(handle, options = {}) {
    this.handle = handle;
    this.options = options;
    this.bindings = new Map();
    this.prepared = new WeakMap();
    this.disposed = false;
  }

  /** Admit immutable native content before the Host calls acpSession.prompt(). */
  async prepare(acpSession, text, options = {}) {
    if (this.disposed) fail('recorder_disposed', 'Recorder is disposed');
    if (typeof acpSession.preparePrompt !== 'function') fail('runtime_contract_missing', 'ACP runtime must expose preparePrompt');
    const content = promptBlocks(acpSession.preparePrompt(text, options).prompt);
    const key = contentKey(content);
    let cache = this.prepared.get(acpSession);
    if (!cache) this.prepared.set(acpSession, cache = new Map());
    let entry = cache.get(key);
    if (!entry) {
      entry = { uses: 0, promise: Promise.resolve().then(() => (this.options.toNativeContent || textContent)(content)).then(nativeContent) };
      cache.set(key, entry);
    }
    entry.uses++;
    try { return JSON.parse(JSON.stringify(await entry.promise)); }
    catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
  }

  stateOf(dshSession) { return this.handle.stateOf(dshSession); }

  inspect(dshSession) {
    const state = this.stateOf(dshSession);
    const entries = Object.entries(state.messages).map(([id, value]) => {
      const [ownerSessionId, acpId, turnId] = parseMessageId(id);
      return { ownerSessionId, acpId, turnId, ...value };
    });
    return { seeded: state.seeded, inheritedEventCount: Number(dshSession.inheritedEventCount),
      lastTurn: state.lastTurn, open: state.open, foreign: state.foreign,
      hasRemote: entries.length > 0, hasOwnRemote: entries.some(value => value.ownerSessionId === String(dshSession.id)),
      inherited: entries.filter(value => value.ownerSessionId !== String(dshSession.id)) };
  }

  _assertForkHistory(acpSession, dshSession, proof) {
    if (!dshSession.header.isSeeded) return;
    const info = this.inspect(dshSession);
    if (!info.inherited.length) return;
    const origin = acpSession.forkOrigin;
    if (!info.seeded || !proof || proof.childDshSessionId !== String(dshSession.id) || proof.childId !== String(acpSession.id) ||
        !origin || proof.sourceId !== origin.sourceId || proof.sourceDshSessionId !== origin.sourceDshSessionId ||
        !Number.isSafeInteger(proof.nativeBoundary) || proof.nativeBoundary + 1 !== info.inheritedEventCount) {
      fail('native_fork_unbound', 'Inherited remote context requires an explicit, committed remote fork binding');
    }
    const lineage = [{ sourceId: proof.sourceId, sourceDshSessionId: proof.sourceDshSessionId, nativeBoundary: proof.nativeBoundary }, ...(proof.ancestors || [])];
    if (info.inherited.some(value => value.seq >= info.inheritedEventCount || !lineage.some(parent =>
      parent.sourceId === value.acpId && parent.sourceDshSessionId === value.ownerSessionId && value.seq <= parent.nativeBoundary))) {
      fail('native_fork_history_mismatch', 'Inherited remote records do not match the approved fork prefix');
    }
  }

  /** Attach before any prompt is submitted. Returns a subscription disposer. */
  attach(acpSession, dshSession, { forkOrigin } = {}) {
    if (this.disposed) fail('recorder_disposed', 'Recorder is disposed');
    if (!acpSession?.id || !dshSession?.id || typeof acpSession.subscribe !== 'function' || typeof acpSession.subscribeTurnLifecycle !== 'function' || typeof dshSession.append !== 'function') fail('invalid_binding', 'ACP and DSH sessions are required');
    if (String(acpSession.dshSessionId || '') !== String(dshSession.id)) fail('binding_mismatch', 'ACP binding does not match the native Session');
    const existing = this.bindings.get(String(dshSession.id));
    if (existing) {
      if (existing.acp === acpSession && existing.dsh === dshSession) return existing.detach;
      fail('recorder_binding_conflict', 'Another recorder attachment owns this native Session');
    }
    this._assertLive(dshSession);
    const state = this.stateOf(dshSession);
    this._assertForkHistory(acpSession, dshSession, forkOrigin);
    const ownHistory = Object.keys(state.messages).some(id => parseMessageId(id)?.[0] === String(dshSession.id) && parseMessageId(id)?.[1] === String(acpSession.id));
    const inheritedHistory = !!forkOrigin && this.inspect(dshSession).inherited.length > 0;
    if (state.foreign || (state.lastTurn > 0 && !ownHistory && !inheritedHistory)) fail('native_session_not_blank', 'A new remote binding requires a blank native Session; existing native history is preserved');
    if (state.open && !state.open.messageId) fail('incomplete_native_turn', 'Native turn ownership is incomplete; refusing to synthesize a user message');
    const binding = { acp: acpSession, dsh: dshSession, forkOrigin, chain: Promise.resolve(), errors: new Map(), unsubscribe: null, detached: false, failure: null };
    binding.detach = async () => {
      if (binding.detached) return;
      binding.detached = true;
      binding.unsubscribe?.();
      try { await binding.chain; } finally { if (this.bindings.get(String(dshSession.id)) === binding) this.bindings.delete(String(dshSession.id)); }
    };
    this.bindings.set(String(dshSession.id), binding);
    const offStart = acpSession.subscribeTurnLifecycle(event => this._schedule(binding, () => this._record(binding, event)));
    let replaying = true;
    const offEvents = acpSession.subscribe(event => {
      if (event.type === "turn_start" && !replaying) return;
      this._schedule(binding, () => this._record(binding, event));
    }, { replay: true });
    replaying = false;
    binding.unsubscribe = () => { offStart(); offEvents(); };
    // A resumed, idle adapter cannot still own an in-flight prompt RPC from a
    // lost process. Close only that observed orphan, using DSH's documented reason.
    this._schedule(binding, () => {
      const current = this.stateOf(dshSession);
      if (current.open?.messageId && acpSession.status === 'ready' && !acpSession.busy) this._end(binding, current.open.messageId, { kind: 'interrupted' });
    });
    return binding.detach;
  }

  _assertLive(session) {
    if (this.options.sessions.get(session.id) !== session) fail("native_session_unavailable", "Native Session is no longer retained by its SessionStore; remote work is not cancelled");
  }

  _schedule(binding, operation) {
    binding.chain = binding.chain.then(operation);
    binding.chain.catch(error => {
      if (binding.failure) return;
      binding.failure = error;
      this.options.onError?.(error, { acpSessionId: binding.acp.id, dshSessionId: binding.dsh.id });
    });
  }

  async _record(binding, event) {
    if (!event || event.inherited === true || typeof event.turnId !== 'string') return;
    if (event.type === 'turn_start' || event.type === 'stop' || (event.type === 'user_message' && event.delivery === 'steered')) this._assertForkHistory(binding.acp, binding.dsh, binding.forkOrigin);
    if (event.rootSessionId && event.sessionId !== binding.acp.sessionId) return;
    const id = messageId(String(binding.dsh.id), String(binding.acp.id), event.turnId);
    if (event.type === 'error') { binding.errors.set(event.turnId, event); return; }
    if (event.type === 'turn_start') {
      if (event.submitted !== true) fail('invalid_turn_start', 'Execution start must confirm submission');
      let state = this.stateOf(binding.dsh);
      if (state.messages[id]) return;
      if (state.foreign || state.open) fail('native_turn_conflict', 'Native Session has another open or foreign turn');
      if (!event.content) fail("native_turn_history_gap", "Remote execution predates its native record; refusing to invent historical prompt content");
      const raw = promptBlocks(event.content);
      const cache = this.prepared.get(binding.acp);
      const key = contentKey(raw);
      const cached = cache?.get(key);
      const content = cached ? await cached.promise : textContent(raw);
      if (cached && --cached.uses === 0) cache.delete(key);
      state = this.stateOf(binding.dsh);
      if (state.foreign || state.open) fail('native_turn_conflict', 'Native Session changed during content admission');
      const turn = state.lastTurn + 1;
      this._assertLive(binding.dsh);
      binding.dsh.append([
        ['turn/start', { turn }],
        ['user/message', { id, role: 'user', source: { kind: 'user' }, content }, { surfaceOp: 'append' }],
      ]);
      return;
    }
    if (event.type === 'user_message' && event.delivery === 'steered') {
      const state = this.stateOf(binding.dsh);
      const suffix = `steer:${event.requestId || `${event.generation}:${event.seq}`}`;
      const steeredId = messageId(String(binding.dsh.id), String(binding.acp.id), event.turnId, suffix);
      if (state.messages[steeredId]) return;
      if (!state.open || state.open.messageId !== id) fail('native_turn_conflict', 'Steered input has no matching active native turn');
      this._assertLive(binding.dsh);
      binding.dsh.append('user/message', { id: steeredId, role: 'user', source: { kind: 'user' }, content: textContent([{ type: 'text', text: event.text }]) }, { surfaceOp: 'append' });
      return;
    }
    if (event.type === 'stop') {
      if (event.submitted === true) this._end(binding, id, endReason(event, binding.errors.get(event.turnId)));
      binding.errors.delete(event.turnId);
    }
  }

  _end(binding, id, reason) {
    const state = this.stateOf(binding.dsh);
    const recorded = state.messages[id];
    if (!recorded || recorded.ended) return;
    if (!state.open || state.open.messageId !== id || state.open.turn !== recorded.turn) fail('native_turn_conflict', 'End does not match the recorded native turn');
    this._assertLive(binding.dsh);
    binding.dsh.append('turn/end', { turn: recorded.turn, reason });
  }

  async flush() {
    const bindings = [...this.bindings.values()];
    await Promise.all(bindings.map(binding => binding.chain));
    await Promise.all(bindings.map(binding => {
      this._assertLive(binding.dsh);
      return this.options.flushSession ? this.options.flushSession(binding.dsh) : this.options.sessions.flush(binding.dsh);
    }));
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const bindings = [...this.bindings.values()];
    for (const binding of bindings) binding.unsubscribe?.();
    try { await this.flush(); }
    finally { this.bindings.clear(); this.prepared = new WeakMap(); await this.handle.dispose(); }
  }
}
