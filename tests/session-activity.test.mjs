import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionActivityState, createSessionActivity, createSessionActivityEventStream, ACTIVITY_HEARTBEAT_MS } from '../lib/session-activity.js';
import { createAcpRuntime } from '../lib/acp.js';

const binding = { sessionId: 'native', backend: { type: 'claude' }, workspaceId: 'w', profileId: 'p', cwd: '/mirror', configuredRemotePath: '/remote' };
const ready = { id: 'acp', dshSessionId: 'native', agent: 'claude', workspaceId: 'w', profileId: 'p', cwd: '/mirror', configuredRemotePath: '/remote', sessionId: 'remote', generation: 'g', status: 'ready', alive: true, busy: false, pendingTurns: 0, pendingPermissions: [], pendingElicitations: [] };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const data = { states: [{ ...ready }], bindings: [{ ...binding }], workspaces: new Set(['w']), calls: 0 };
  const runtime = { list() { data.calls++; return data.states; } };
  const activity = createSessionActivity({ runtime, getBindings: () => data.bindings, workspaceIds: () => data.workspaces });
  const events = []; const unsubscribe = activity.subscribe(event => events.push(event));
  return { data, runtime, activity, events, unsubscribe };
}
function timer() {
  let next = 0; const tasks = new Map();
  return { tasks, setInterval(fn, ms) { assert.equal(ms, 15000); const id = ++next; tasks.set(id, fn); return id; }, clearInterval(id) { tasks.delete(id); }, fire() { for (const fn of [...tasks.values()]) fn(); } };
}
function response() {
  return Object.assign(new EventEmitter(), { frames: [], writableEnded: false, writeHead(status, headers) { this.status = status; this.headers = headers; }, write(raw) { this.frames.push(JSON.parse(raw)); return true; }, end() { this.writableEnded = true; }, flushHeaders() {} });
}
function streamFixture(permitted = () => true) {
  const f = fixture(), clock = timer(), activeStreams = new Set(), req = new EventEmitter(), res = response();
  let disposed = false;
  const stream = createSessionActivityEventStream({ activity: f.activity, activeStreams, isDisposed: () => disposed, ...clock });
  const open = () => stream(req, res, permitted);
  return { ...f, clock, activeStreams, req, res, stream, open, dispose() { disposed = true; } };
}

test('activity distinguishes actual turns from alive transports and stale cold fields', () => {
  assert.equal(sessionActivityState(ready).status, 'idle');
  assert.equal(sessionActivityState({ ...ready, status: 'starting' }).status, 'idle');
  assert.equal(sessionActivityState({ ...ready, busy: true }).status, 'running');
  assert.equal(sessionActivityState({ ...ready, pendingTurns: 2 }).status, 'running');
  assert.equal(sessionActivityState({ ...ready, detached: true, busy: true, pendingPermissions: [{}] }).status, 'disconnected');
  assert.equal(sessionActivityState({ ...ready, status: 'error', busy: true, pendingPermissions: [{}] }).status, 'error');
  assert.deepEqual(sessionActivityState({ ...ready, busy: true, pendingPermissions: [{}] }), { status: 'waiting', waitingFor: 'permission' });
  assert.deepEqual(sessionActivityState({ ...ready, busy: true, pendingElicitations: [{}] }), { status: 'waiting', waitingFor: 'elicitation' });
  assert.equal(sessionActivityState(ready, { generation: 'old', status: 'completed' }).status, 'idle');
});

test('snapshot covers persisted bound sessions but does not infer historical completion', () => {
  const f = fixture(); f.data.states = [{ ...ready, detached: true, alive: false, status: 'detached', busy: true, requests: [{ status: 'completed' }] }];
  f.data.bindings.push({ ...binding, sessionId: 'blank' }, { ...binding, sessionId: 'local', backend: { type: 'dsh' } });
  assert.deepEqual(f.activity.snapshot(), [{ sessionId: 'native', agent: 'claude', status: 'disconnected' }, { sessionId: 'blank', agent: 'claude', status: 'idle' }]);
});

test('identity mismatches and obsolete instances cannot override authoritative active binding', () => {
  const f = fixture(); f.data.states = [{ ...ready, status: 'error', alive: false }, { ...ready, id: 'new', busy: true }, { ...ready, profileId: 'other', pendingPermissions: [{}] }];
  assert.equal(f.activity.snapshot()[0].status, 'running');
  f.data.states = [{ ...ready, cwd: '/other', busy: true }];
  assert.equal(f.activity.snapshot()[0].status, 'idle');
});

test('only authoritative submitted root stop becomes completed or stopped; next turn clears it', async () => {
  const f = fixture(); f.activity.snapshot(); f.events.length = 0;
  f.activity.onEvent({ type: 'stop', submitted: false, stopReason: 'end_turn' }, ready); await tick(); assert.equal(f.activity.snapshot()[0].status, 'idle');
  f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn', rootSessionId: 'remote', sessionId: 'child' }, ready); await tick(); assert.equal(f.activity.snapshot()[0].status, 'idle');
  f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn' }, ready); await tick(); assert.equal(f.activity.snapshot()[0].status, 'completed');
  f.activity.onEvent({ type: 'turn_start' }, ready); await tick(); assert.equal(f.activity.snapshot()[0].status, 'idle');
  f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'cancelled' }, ready); await tick(); assert.equal(f.activity.snapshot()[0].status, 'stopped');
  f.activity.onEvent({ type: 'session' }, ready); await tick(); assert.equal(f.activity.snapshot()[0].status, 'idle'); // Resume may retain the same persisted generation.
  f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn' }, ready); await tick();
  f.data.states[0].generation = 'resumed'; f.activity.changed(); await tick(); assert.equal(f.activity.snapshot()[0].status, 'idle');
});

test('completion identity is stable across duplicate stop, refresh, heartbeat and reconnect', async () => {
  const f = streamFixture();
  const stop = { type: 'stop', submitted: true, stopReason: 'end_turn', turnId: 'private-turn-one' };
  const expected = createHash('sha256').update(JSON.stringify(['acp', 'g', stop.turnId])).digest('hex');
  f.activity.onEvent(stop, ready); await tick();
  const row = { sessionId: 'native', agent: 'claude', status: 'completed', completionId: expected };
  assert.deepEqual(f.activity.snapshot(), [row]);
  f.open(); assert.deepEqual(f.res.frames[0], { type: 'snapshot', sessions: [row] });
  const eventCount = f.events.length;
  f.activity.onEvent({ ...stop, stopReason: 'completed' }, ready); await tick();
  f.activity.refresh(); f.clock.fire();
  assert.equal(f.events.length, eventCount);
  assert.deepEqual(f.activity.snapshot(), [row]);
  f.res.emit('close'); const next = response();
  const close = f.stream(new EventEmitter(), next, () => true);
  assert.deepEqual(next.frames[0], { type: 'snapshot', sessions: [row] });
  assert.doesNotMatch(JSON.stringify(next.frames), /private-turn-one|generation|acp/);
  close();
});

test('completion identity separates each turn, runtime generation and ACP instance', async () => {
  const f = fixture(); const tokens = [];
  for (const [id, generation, turnId] of [['acp', 'g', 'one'], ['acp', 'g', 'two'], ['acp', 'new-generation', 'two'], ['new-acp', 'new-generation', 'two']]) {
    const state = { ...ready, id, generation }; f.data.states = [state];
    f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn', turnId }, state); await tick();
    const row = f.activity.snapshot()[0]; assert.equal(row.status, 'completed');
    assert.match(row.completionId, /^[a-f0-9]{64}$/); tokens.push(row.completionId);
  }
  assert.equal(new Set(tokens).size, 4);
});

test('new completion is published when an entire busy transition coalesces between snapshots', async () => {
  const f = fixture(); const state = f.data.states[0];
  f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn', turnId: 'first' }, state); await tick();
  const first = f.activity.snapshot()[0].completionId; f.events.length = 0;
  state.busy = true;
  f.activity.onEvent({ type: 'turn_start', turnId: 'second' }, state);
  state.busy = false;
  f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn', turnId: 'second' }, state);
  await tick();
  assert.equal(f.events.length, 1); assert.equal(f.events[0].type, 'upsert');
  assert.equal(f.events[0].session.status, 'completed');
  assert.notEqual(f.events[0].session.completionId, first);
});

test('child, inherited and unsubmitted stops cannot create or replace a root completion identity', async () => {
  const f = fixture(); const stop = { type: 'stop', submitted: true, stopReason: 'end_turn', turnId: 'root-turn' };
  f.activity.onEvent(stop, ready); await tick(); const root = f.activity.snapshot()[0];
  for (const patch of [{ rootSessionId: 'remote', sessionId: 'child' }, { sessionId: 'child' }, { inherited: true }, { submitted: false }]) {
    f.activity.onEvent({ ...stop, turnId: 'other-turn', ...patch }, ready); await tick();
    assert.deepEqual(f.activity.snapshot()[0], root);
    const blank = fixture(); blank.activity.onEvent({ ...stop, ...patch }, ready); await tick();
    assert.deepEqual(blank.activity.snapshot(), [{ sessionId: 'native', agent: 'claude', status: 'idle' }]);
  }
});

test('invalid identities and noncompleted outcomes never manufacture an unread token', async () => {
  for (const turnId of [undefined, null, '', '   ', 123, {}]) {
    const f = fixture(); f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn', turnId }, ready); await tick();
    assert.deepEqual(f.activity.snapshot(), [{ sessionId: 'native', agent: 'claude', status: 'completed' }]);
  }
  for (const field of ['id', 'generation']) {
    const f = fixture(); const state = { ...ready, [field]: '' }; f.data.states = [state];
    f.activity.onEvent({ type: 'stop', submitted: true, stopReason: 'end_turn', turnId: 'turn' }, state); await tick();
    assert.deepEqual(f.activity.snapshot(), [{ sessionId: 'native', agent: 'claude', status: 'completed' }]);
  }
  for (const [stopReason, status] of [['cancelled', 'stopped'], ['error', 'error'], ['max_tokens', 'idle']]) {
    const f = fixture(); f.activity.onEvent({ type: 'stop', submitted: true, stopReason, turnId: 'turn' }, ready); await tick();
    assert.deepEqual(f.activity.snapshot(), [{ sessionId: 'native', agent: 'claude', status }]);
  }
});

test('state mapper allowlists terminal data and never trusts a stored runtime completion token', () => {
  const token = 'a'.repeat(64);
  const terminal = { generation: 'g', status: 'completed', completionId: token, text: 'SECRET', turnId: 'SECRET', attachment: {} };
  assert.deepEqual(sessionActivityState(ready, terminal), { status: 'completed', completionId: token });
  assert.deepEqual(sessionActivityState({ ...ready, completionId: token }), { status: 'idle' });
  assert.deepEqual(sessionActivityState({ ...ready, detached: true, completionId: token }, terminal), { status: 'disconnected' });
  for (const status of ['stopped', 'error', 'idle']) assert.deepEqual(sessionActivityState(ready, { ...terminal, status }), { status });
  assert.deepEqual(sessionActivityState(ready, { ...terminal, status: 'SECRET' }), { status: 'idle' });
  for (const completionId of ['', 'SECRET', 'a'.repeat(63), 'A'.repeat(64)]) assert.deepEqual(sessionActivityState(ready, { ...terminal, completionId }), { status: 'completed' });
  assert.deepEqual(sessionActivityState({ ...ready, busy: true }, terminal), { status: 'running' });
});

test('token and historical tool errors never produce sidebar churn; state updates are coalesced', async () => {
  const f = fixture(); f.activity.snapshot(); f.events.length = 0; const before = f.data.calls;
  for (let i = 0; i < 100; i++) f.activity.onEvent({ type: 'text', text: 'SECRET' }, ready);
  f.activity.onEvent({ type: 'tool_update', status: 'failed', message: 'SECRET' }, ready);
  await tick(); assert.equal(f.data.calls, before); assert.equal(f.events.length, 0);
  f.data.states[0].busy = true;
  for (let i = 0; i < 20; i++) f.activity.onEvent({ type: 'user_message', text: 'SECRET' }, ready);
  await tick(); assert.equal(f.data.calls, before + 1); assert.deepEqual(f.events, [{ type: 'upsert', session: { sessionId: 'native', agent: 'claude', status: 'running' } }]);
  f.activity.onEvent({ type: 'error', message: 'old tool error', fatal: false }, ready); await tick(); assert.equal(f.events.length, 1);
});

test('workspace removal and changed binding remove stale entries without reading history', async () => {
  const f = fixture(); f.activity.snapshot(); f.events.length = 0;
  f.data.workspaces.clear(); f.activity.changed(); await tick(); assert.deepEqual(f.events, [{ type: 'remove', sessionId: 'native' }]);
  f.activity.dispose(); f.activity.changed(); await tick(); assert.deepEqual(f.events.at(-1), { type: 'reset', reason: 'host_stopped' });
});

test('stream snapshot only contains authorized canonical sessions and sanitizes all fields', () => {
  const f = streamFixture(sid => sid !== 'hidden');
  f.data.bindings.push({ ...binding, sessionId: 'hidden' });
  Object.assign(f.data.states[0], { lastError: 'SECRET', cwd: '/mirror', title: 'SECRET', pendingPermissions: [{ message: 'SECRET', options: ['SECRET'] }], config: { token: 'SECRET' } });
  f.open(); assert.deepEqual(f.res.frames, [{ type: 'snapshot', sessions: [{ sessionId: 'native', agent: 'claude', status: 'waiting', waitingFor: 'permission' }] }]);
  assert.doesNotMatch(JSON.stringify(f.res.frames), /SECRET|mirror|permission.*options|configuredRemotePath/);
  f.clock.fire(); assert.equal(f.res.frames.at(-1).type, 'heartbeat'); assert.equal(f.clock.tasks.size, 1);
});

test('per-session revocation removes only previously visible entry and does not close global stream', () => {
  const grants = new Set(['native']); const f = streamFixture(sid => sid === undefined || grants.has(sid));
  f.data.bindings.push({ ...binding, sessionId: 'other' }); f.open();
  grants.delete('native'); f.clock.fire(); assert.deepEqual(f.res.frames.slice(-2), [{ type: 'remove', sessionId: 'native' }, { type: 'heartbeat' }]);
  assert.equal(f.res.writableEnded, false); assert.equal(f.clock.tasks.size, 1);
  grants.add('other'); f.clock.fire(); assert.deepEqual(f.res.frames.at(-2), { type: 'upsert', session: { sessionId: 'other', agent: 'claude', status: 'idle' } });
});

test('global revocation emits nonprivate reset and closes without leaking later updates', async () => {
  let global = true; const f = streamFixture(() => global); f.open(); global = false;
  f.clock.fire(); assert.deepEqual(f.res.frames.at(-1), { type: 'reset', reason: 'access_revoked' });
  assert.equal(f.res.writableEnded, true); assert.equal(f.clock.tasks.size, 0); assert.equal(f.activeStreams.size, 0);
  const count = f.res.frames.length; f.data.states[0].busy = true; f.activity.changed(); await tick(); assert.equal(f.res.frames.length, count);
});

test('per-session policy errors fail closed without disconnect/reconnect loops', () => {
  let fail = false; const f = streamFixture(sid => { if (sid && fail) throw Error('policy'); return true; }); f.open(); fail = true;
  f.clock.fire(); assert.deepEqual(f.res.frames.at(-2), { type: 'remove', sessionId: 'native' }); assert.equal(f.res.writableEnded, false);
});

for (const event of ['close', 'error', 'aborted']) test(`stream ${event} cleans timer/listeners/subscription without cancelling ACP`, async () => {
  const f = streamFixture(); f.open(); (event === 'aborted' ? f.req : f.res).emit(event);
  assert.equal(f.clock.tasks.size, 0); assert.equal(f.activeStreams.size, 0); assert.equal(f.req.listenerCount('aborted'), 0); assert.equal(f.res.listenerCount('close'), 0);
  const count = f.res.frames.length; f.data.states[0].busy = true; f.activity.changed(); await tick(); assert.equal(f.res.frames.length, count);
});

for (const stage of ['snapshot', 'upsert', 'heartbeat']) test(`backpressure during ${stage} closes without buffering`, async () => {
  const f = streamFixture(); const write = f.res.write;
  f.res.write = function (raw) { const frame = JSON.parse(raw); write.call(this, raw); return frame.type !== stage; };
  f.open(); if (stage === 'upsert') { f.data.states[0].busy = true; f.activity.changed(); await tick(); }
  if (stage === 'heartbeat') f.clock.fire();
  assert.equal(f.res.writableEnded, true); assert.equal(f.clock.tasks.size, 0); assert.equal(f.activeStreams.size, 0);
});

test('Host disposal clears the overview and scheduled microtasks cannot revive it', async () => {
  const f = streamFixture(); f.open(); f.data.states[0].busy = true; f.activity.changed(); f.dispose(); f.activity.dispose(); await tick();
  assert.deepEqual(f.res.frames.at(-1), { type: 'reset', reason: 'host_stopped' }); assert.equal(f.clock.tasks.size, 0);
});

test('preclosed request never registers a timer and stream count is bounded', () => {
  const f = streamFixture(); f.req.aborted = true; f.open(); assert.equal(f.clock.tasks.size, 0); assert.equal(f.res.frames.length, 0);
  const g = streamFixture(); const closes = [];
  for (let i = 0; i < 8; i++) closes.push(g.stream(new EventEmitter(), response(), () => true));
  assert.throws(() => g.stream(new EventEmitter(), response(), () => true), { code: 'too_many_streams' });
  for (const close of closes) close(); assert.equal(g.clock.tasks.size, 0);
});

test('snapshot publication is already subscribed, so a synchronous background transition is not lost', () => {
  const f = streamFixture(); const write = f.res.write;
  f.res.write = function(raw) { const result = write.call(this, raw); if (JSON.parse(raw).type === 'snapshot') { f.data.states[0].busy = true; f.activity.refresh(); } return result; };
  f.open(); assert.deepEqual(f.res.frames.map(frame => frame.type), ['snapshot', 'upsert']); assert.equal(f.res.frames[1].session.status, 'running');
});

test('real runtime background turns, permission/elicitation, terminal outcomes and detach drive overview', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'remote-session-activity-'));
  let activity; const pending = [];
  const runtime = createAcpRuntime({ storePath: join(directory, 'sessions.json'),
    onEvent: (event, session) => activity?.onEvent(event, session), onActivity: () => activity?.changed(),
    connectImpl: () => ({
      ready: Promise.resolve({ sessionId: 'remote', protocolCwd: '/remote', initialize: { agentCapabilities: {} }, sessionResponse: { modes: { currentModeId: 'acceptEdits', availableModes: [{ id: 'acceptEdits' }] } } }),
      prompt: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), setMode: async () => ({}), dispose: async () => {}, close: async () => {},
    }),
  });
  activity = createSessionActivity({ runtime, getBindings: () => [binding] });
  const events = []; activity.subscribe(event => events.push(event));
  try {
    const session = await runtime.create({ id: 'acp', dshSessionId: 'native', agent: 'claude', workspaceId: 'w', cwd: '/mirror', configuredRemotePath: '/remote', remotePath: '/remote', profile: { id: 'p', host: 'unused.invalid', user: 'fixture', authMethod: 'key' } });
    await tick(); assert.equal(activity.snapshot()[0].status, 'idle');
    const turn = session.prompt('SECRET user text'); await tick(); assert.equal(activity.snapshot()[0].status, 'running');
    const permission = session.handlePermissionRequest({ toolCall: { title: 'SECRET command' }, options: [{ optionId: 'allow', kind: 'allow_once', name: 'SECRET' }] }, 'permission');
    await tick(); assert.equal(activity.snapshot()[0].waitingFor, 'permission');
    await session.permission({ requestId: 'permission', optionId: 'allow' }); await permission; await tick(); assert.equal(activity.snapshot()[0].status, 'running');
    const form = session.handleElicitationRequest({ mode: 'form', message: 'SECRET form', requestedSchema: { type: 'object', properties: {} } }, 'form');
    await tick(); assert.equal(activity.snapshot()[0].waitingFor, 'elicitation');
    await session.elicitation({ requestId: 'form', action: 'cancel' }); await form; await tick(); assert.equal(activity.snapshot()[0].status, 'running');
    pending[0].resolve({ stopReason: 'end_turn' }); const completed = await turn; await tick();
    assert.deepEqual(activity.snapshot()[0], { sessionId: 'native', agent: 'claude', status: 'completed', completionId: createHash('sha256').update(JSON.stringify([session.id, session.generation, completed.turnId])).digest('hex') });
    const next = session.prompt('next'); await tick(); assert.equal(activity.snapshot()[0].status, 'running');
    pending[1].reject(Error('SECRET failure')); await assert.rejects(next); await tick(); assert.equal(activity.snapshot()[0].status, 'error');
    await runtime.shutdownSession('acp', { reason: 'archived' }); await tick(); assert.equal(activity.snapshot()[0].status, 'disconnected');
    await runtime.close('acp'); await tick(); assert.equal(activity.snapshot()[0].status, 'idle');
    assert.doesNotMatch(JSON.stringify(events), /SECRET|\/mirror|\/remote|optionId|requestedSchema|attachment/);
  } finally { activity.dispose(); await runtime.shutdown(); }
});
