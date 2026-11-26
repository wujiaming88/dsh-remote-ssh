import test from 'node:test';
import assert from 'node:assert/strict';
import { AcpSession } from '../lib/acp.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(t) {
  const prompts = [], steers = [], steerCalls = [], calls = { cancelled: 0 };
  const session = new AcpSession({ id: 'queue-test', agent: 'claude' });
  session.status = 'ready';
  session.capabilities = { agentCapabilities: { promptCapabilities: { image: true, embeddedContext: true } } };
  session.controller = {
    prompt(value) { const gate = deferred(); prompts.push({ value, ...gate }); return gate.promise; },
    async steer(value, options) { steers.push(value); steerCalls.push({ value, options }); return { outcome: 'injected' }; },
    async cancel() { calls.cancelled++; prompts.at(-1)?.resolve({ stopReason: 'cancelled' }); return true; },
    async close() {}, async dispose() {},
  };
  t.after(() => session.close());
  return { session, prompts, steers, steerCalls, calls };
}

test('queue acknowledges before model completion, preserves prompt completion API and FIFO', async t => {
  const { session, prompts } = fixture(t);
  let completed = false;
  const first = session.prompt('first', { requestId: 'first' }).then(result => { completed = true; return result; });
  const second = await session.queue('second', { requestId: 'second' });
  const third = await session.queue('third', { requestId: 'third' });
  assert.equal(completed, false); assert.equal(prompts.length, 1);
  assert.equal(second.accepted, true); assert.equal(second.outcome, 'queued');
  assert.deepEqual(session.state().queuedMessages.map(m => m.requestId), ['second', 'third']);
  prompts[0].resolve({ stopReason: 'end_turn' }); await first; await tick();
  assert.equal(prompts[1].value, 'second');
  assert.deepEqual(session.state().queuedMessages.map(m => m.requestId), ['third']);
  prompts[1].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(prompts[2].value, 'third'); assert.deepEqual(session.state().queuedMessages, []);
  prompts[2].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(session.busy, false);
  assert.equal(session.requests.get('second').kind, 'queue');
  assert.deepEqual(await session.queue('second', { requestId: 'second' }), { ...second, deduplicated: true });
  assert.deepEqual(await session.queue('third', { requestId: 'third' }), { ...third, deduplicated: true });
  assert.equal(prompts.length, 3);
  await assert.rejects(session.prompt('second', { requestId: 'second' }), { code: 'request_conflict' });
  await assert.rejects(session.queue('CHANGED', { requestId: 'second' }), { code: 'request_conflict' });
});

test('idle queue starts immediately and concurrent identical requests have one receipt', async t => {
  const { session, prompts } = fixture(t);
  const results = await Promise.all([session.queue('one', { requestId: 'one' }), session.queue('one', { requestId: 'one' })]);
  assert.equal(results[0].outcome, 'started'); assert.equal(results[1].deduplicated, true);
  assert.equal(results[0].turnId, results[1].turnId); assert.equal(prompts.length, 1);
  assert.deepEqual(session.state().queuedMessages, []);
});

test('removal is idempotent, cannot cancel active work and leaves FIFO neighbours untouched', async t => {
  const { session, prompts, calls } = fixture(t);
  await session.queue('active', { requestId: 'active' });
  await session.queue('keep1', { requestId: 'keep1' });
  const removedReceipt = await session.queue('remove', { requestId: 'remove' });
  await session.queue('keep2', { requestId: 'keep2' });
  const removed = await session.removeQueued({ targetRequestId: 'remove', opId: 'remove-op' });
  assert.equal(removed.removed, true); assert.equal(removed.turnId, removedReceipt.turnId);
  assert.deepEqual(await session.removeQueued('remove'), { ...removed, deduplicated: true });
  assert.deepEqual(await session.queue('remove', { requestId: 'remove' }), { ...removedReceipt, deduplicated: true });
  assert.equal(session.requests.get('remove').status, 'removed');
  assert.deepEqual(session.state().queuedMessages.map(m => m.text), ['keep1', 'keep2']);
  await assert.rejects(session.removeQueued('active'), { code: 'queue_already_started' });
  await assert.rejects(session.removeQueued('missing'), { code: 'queue_not_found' });
  assert.equal(calls.cancelled, 0);
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  await assert.rejects(session.removeQueued('keep1'), { code: 'queue_already_started' });
  prompts[1].resolve({ stopReason: 'end_turn' }); await tick();
  assert.deepEqual(prompts.map(p => p.value), ['active', 'keep1', 'keep2']);
});

test('queued text edits in place, preserves FIFO identity and never submits or cancels', async t => {
  const { session, prompts, calls } = fixture(t);
  await session.queue('active', { requestId: 'active' });
  const receipt = await session.queue('draft', { requestId: 'edit' });
  await session.queue('keep', { requestId: 'keep' });
  const edited = await session.updateQueued({ targetRequestId: 'edit', text: 'edited text' });
  assert.equal(edited.updated, true); assert.equal(edited.turnId, receipt.turnId);
  assert.deepEqual(session.state().queuedMessages.map(item => item.text), ['edited text', 'keep']);
  assert.equal(session.state().queuedMessages[0].requestId, 'edit');
  assert.deepEqual(await session.updateQueued({ targetRequestId: 'edit', text: 'edited text' }), { ...edited, deduplicated: true });
  await session.updateQueued({ targetRequestId: 'edit', text: 'second edit' });
  assert.deepEqual(session.state().queuedMessages.map(item => item.text), ['second edit', 'keep']);
  assert.equal(session.events.filter(event => event.type === 'user_message' && event.requestId === 'edit').at(-1).text, 'second edit');
  assert.equal(prompts.length, 1); assert.equal(calls.cancelled, 0);
  await assert.rejects(session.updateQueued({ targetRequestId: 'edit', text: '   ' }), { code: 'empty_prompt' });
  await assert.rejects(session.updateQueued({ targetRequestId: 'active', text: 'cannot edit active' }), { code: 'queue_already_started' });
  await assert.rejects(session.updateQueued({ targetRequestId: 'missing', text: 'missing' }), { code: 'queue_not_found' });
  assert.deepEqual(session.state().queuedMessages.map(item => item.text), ['second edit', 'keep']);
});

test('editing retains admitted attachments and only replaces the text block', async t => {
  const { session, prompts } = fixture(t);
  await session.queue('active', { requestId: 'a' });
  await session.queue('before', { requestId: 'edit', attachments: [{ type: 'image', mimeType: 'image/png', data: 'KEEP' }] });
  await session.updateQueued({ targetRequestId: 'edit', text: 'after' });
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.deepEqual(prompts[1].value, [{ type: 'text', text: 'after' }, { type: 'image', mimeType: 'image/png', data: 'KEEP' }]);
});

test('Claude later-priority queue waits for the foreground tool boundary and stays editable until then', async t => {
  const { session, prompts, steerCalls, calls } = fixture(t);
  session.capabilities.steering = { supported: true, priorities: ['now', 'later'] };
  await session.queue('active', { requestId: 'active' });
  await session.queue('after tool', { requestId: 'after' });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(steerCalls.length, 0);
  assert.deepEqual(session.state().queuedMessages.map(item => item.text), ['after tool']);
  session._emit({ type: 'tool_call', toolCallId: 'tool-1', status: 'in_progress' });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(steerCalls.length, 0);
  assert.deepEqual(session.state().queuedMessages.map(item => item.text), ['after tool']);
  session._emit({ type: 'tool_call_update', toolCallId: 'tool-1', status: 'completed' });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(steerCalls.length, 1); assert.equal(steerCalls[0].options.priority, 'later');
  assert.deepEqual(steerCalls[0].value, [{ type: 'text', text: 'after tool' }]);
  assert.deepEqual(session.state().queuedMessages, []);
  assert.equal(prompts.length, 1); assert.equal(session.busy, true); assert.equal(calls.cancelled, 0);
  const message = session.events.filter(event => event.type === 'user_message' && event.requestId === 'after').at(-1);
  assert.equal(message.delivery, 'steered');
  assert.equal(message.turnId, session.activeTurn.id);
  assert.equal(session.events.some(event => event.type === 'stop' && event.requestId === 'after'), false);
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(prompts.length, 1); assert.equal(session.busy, false);
});

test('promote injects into the active turn and removes only that queued identity', async t => {
  const { session, prompts, steers, steerCalls, calls } = fixture(t);
  session.capabilities.steering = { supported: true };
  await session.queue('active', { requestId: 'active' });
  await session.queue('send now', { requestId: 'now' });
  await session.queue('keep', { requestId: 'keep' });
  const promoted = await session.promoteQueued({ targetRequestId: 'now' });
  assert.deepEqual(promoted, { promoted: true, outcome: 'injected', steering: true, targetRequestId: 'now', requestId: 'now', turnId: session.activeTurn.id });
  assert.deepEqual(steers, [[{ type: 'text', text: 'send now' }]]); assert.equal(steerCalls[0].options.priority, 'now'); assert.equal(prompts.length, 1); assert.equal(calls.cancelled, 0);
  assert.deepEqual(session.state().queuedMessages.map(item => item.text), ['keep']);
  assert.equal(session.events.filter(event => event.type === 'user_message' && event.requestId === 'now').at(-1).delivery, 'steered');
  assert.equal(session.events.some(event => event.type === 'stop' && event.requestId === 'now'), false);
  assert.deepEqual(await session.promoteQueued({ targetRequestId: 'now' }), { ...promoted, deduplicated: true });
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(prompts[1].value, 'keep'); assert.equal(session.busy, true);
});

test('unsupported steering leaves the queue intact without interrupting the active turn', async t => {
  const { session, prompts, steers, calls } = fixture(t);
  session.capabilities.steering = { supported: false };
  await session.queue('active', { requestId: 'active' });
  await session.queue('stay queued', { requestId: 'wait' });
  await assert.rejects(session.promoteQueued({ targetRequestId: 'wait' }), { code: 'steering_unsupported' });
  assert.deepEqual(steers, []); assert.deepEqual(session.state().queuedMessages.map(item => item.text), ['stay queued']);
  assert.equal(calls.cancelled, 0); assert.equal(prompts.length, 1);
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(prompts[1].value, 'stay queued');
});

test('dequeue/remove race has one winner and removal before the microtask never submits', async t => {
  const { session, prompts } = fixture(t);
  await session.queue('active', { requestId: 'a' });
  await session.queue('remove-before-dequeue', { requestId: 'b' });
  prompts[0].resolve({ stopReason: 'end_turn' });
  await session.removeQueued('b'); await tick();
  assert.equal(prompts.length, 1); assert.equal(session.busy, false);
  await session.queue('active2', { requestId: 'c' });
  await session.queue('already-started', { requestId: 'd' });
  prompts[1].resolve({ stopReason: 'end_turn' }); await tick();
  await assert.rejects(session.removeQueued('d'), { code: 'queue_already_started' });
  assert.equal(prompts.length, 3);
});

test('preview is bounded but execution is exact, attachments are cloned and never inlined in state', async t => {
  const { session, prompts } = fixture(t);
  await session.queue('active', { requestId: 'a' });
  const text = '文'.repeat(10000), attachments = [{ type: 'image', name: 'picture', mimeType: 'image/png', data: 'UNIQUE-IMAGE-DATA' }];
  const receipt = await session.queue(text, { requestId: 'image', attachments });
  attachments[0].data = 'MUTATED';
  const state = session.state(), queued = state.queuedMessages[0];
  assert.equal(queued.turnId, receipt.turnId); assert.equal(queued.text.length, 4096); assert.equal(queued.textTruncated, true);
  assert.equal(JSON.stringify(state).includes('UNIQUE-IMAGE-DATA'), false);
  assert.deepEqual(queued.attachments, [{ type: 'image', name: 'picture', mimeType: 'image/png' }]);
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.deepEqual(prompts[1].value, [{ type: 'text', text }, { type: 'image', mimeType: 'image/png', data: 'UNIQUE-IMAGE-DATA' }]);
  assert.equal(session.events.filter(e => e.type === 'queue_snapshot').at(-1).queuedMessages.length, 0);
});

test('queue capacity rejects without admission; cancellation/error snapshots clear pending items', async t => {
  const { session, prompts } = fixture(t);
  await session.queue('active', { requestId: 'active' });
  for (let i = 0; i < 32; i++) await session.queue('q' + i, { requestId: 'q' + i });
  await assert.rejects(session.queue('overflow', { requestId: 'overflow' }), { code: 'queue_full' });
  assert.equal(session.requests.has('overflow'), false);
  await session.cancel(); await tick();
  assert.deepEqual(session.state().queuedMessages, []); assert.equal(prompts.length, 1);
  await session.queue('error', { requestId: 'error' });
  const pending = await session.queue('not submitted', { requestId: 'pending' });
  prompts[1].reject(new Error('transport failed')); await tick();
  assert.deepEqual(session.state().queuedMessages, []);
  assert.deepEqual(await session.queue('not submitted', { requestId: 'pending' }), { ...pending, deduplicated: true });
  assert.equal(prompts.length, 2);
});

test('queue request tombstones survive ordinary request pruning and have bounded admission', async t => {
  const { session, prompts } = fixture(t);
  const receipt = await session.queue('once', { requestId: 'once' });
  for (let i = 0; i < 1100; i++) session.requests.set('old' + i, { requestId: 'old' + i, kind: 'prompt', status: 'completed' });
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.deepEqual(await session.queue('once', { requestId: 'once' }), { ...receipt, deduplicated: true });
  for (let i = 0; i < 511; i++) session.requests.set('queue-old' + i, { requestId: 'queue-old' + i, kind: 'queue', status: 'completed' });
  await assert.rejects(session.queue('no room', { requestId: 'new' }), { code: 'queue_request_limit' });
  assert.equal(prompts.length, 1);
});
