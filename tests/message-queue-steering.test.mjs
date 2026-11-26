import test from 'node:test';
import assert from 'node:assert/strict';
import { AcpSession } from '../lib/acp.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(t) {
  const prompts = [], steers = [], calls = { cancelled: 0, disposed: 0 };
  const session = new AcpSession({ id: 'steering-test', agent: 'claude', steerTimeoutMs: 20 });
  session.status = 'ready';
  session.capabilities = { steering: { supported: true }, promptCapabilities: { image: true, embeddedContext: true, audio: true }, agentCapabilities: { promptCapabilities: { image: true, embeddedContext: true, audio: true } } };
  session.controller = {
    prompt(value) { const gate = deferred(); prompts.push({ value, ...gate }); return gate.promise; },
    steer(value) { const gate = deferred(); steers.push({ value, ...gate }); return gate.promise; },
    async cancel() { calls.cancelled++; prompts.at(-1)?.resolve({ stopReason: 'cancelled' }); return true; },
    async close() {}, async dispose() { calls.disposed++; },
  };
  t.after(() => session.close());
  return { session, prompts, steers, calls };
}

test('native steering never queues implicitly; validation errors do not consume request identities', async t => {
  const { session, steers, calls } = fixture(t);
  await assert.rejects(session.steer('idle', { requestId: 'idle' }), { code: 'no_active_turn' });
  assert.equal(session.requests.has('idle'), false);
  await session.queue('active', { requestId: 'active' });
  session.capabilities.steering.supported = false;
  await assert.rejects(session.steer('unsupported', { requestId: 'unsupported' }), { code: 'steering_unsupported' });
  assert.equal(session.requests.has('unsupported'), false);
  session.capabilities.steering.supported = true;
  await assert.rejects(session.steer('audio', { requestId: 'audio', attachments: [{ type: 'audio', data: 'AA==', mimeType: 'audio/wav' }] }), { code: 'steer_content_unsupported' });
  assert.equal(session.requests.has('audio'), false);
  const pending = session.steer('known non-injection', { requestId: 'known' });
  steers[0].resolve({ outcome: 'promptRequired' });
  const result = await pending;
  assert.equal(result.outcome, 'promptRequired'); assert.equal(result.steering, false);
  assert.deepEqual(session.state().queuedMessages, []); assert.equal(session.pendingTurns, 1);
  assert.equal(session.events.some(e => e.type === 'user_message' && e.requestId === 'known'), false);
  assert.deepEqual(await session.steer('known non-injection', { requestId: 'known' }), { ...result, deduplicated: true });
  assert.equal(steers.length, 1); assert.equal(calls.cancelled, 0);
});

test('late injected ACK belongs to original turn and precedes stop plus next FIFO turn', async t => {
  const { session, prompts, steers } = fixture(t);
  session.opts.steerTimeoutMs = 3000;
  const first = await session.queue('active', { requestId: 'active' });
  await session.queue('next', { requestId: 'next' });
  const attachments = [{ type: 'image', name: 'image.png', data: 'AA==', mimeType: 'image/png' }];
  const steer = session.steer('look here', { requestId: 'steer', attachments });
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(prompts.length, 1); assert.equal(session.activeTurn.id, first.turnId);
  assert.equal(session.events.some(e => e.type === 'stop' && e.turnId === first.turnId), false);
  await assert.rejects(session.steer('too late', { requestId: 'too-late' }), { code: 'no_active_turn' });
  assert.equal(session.requests.has('too-late'), false);
  assert.equal(steers[0].value[1].data, 'AA==');
  steers[0].resolve({ outcome: 'injected' });
  const result = await steer; await tick();
  assert.equal(result.turnId, first.turnId); assert.equal(prompts.length, 2);
  const message = session.events.find(e => e.type === 'user_message' && e.requestId === 'steer');
  const stop = session.events.find(e => e.type === 'stop' && e.turnId === first.turnId);
  const next = session.events.find(e => e.type === 'turn_start' && e.requestId === 'next');
  assert.equal(message.turnId, first.turnId); assert.equal(message.attachments[0].name, 'image.png');
  assert.ok(message.seq < stop.seq && stop.seq < next.seq);
  assert.deepEqual(await session.steer('look here', { requestId: 'steer', attachments }), { ...result, deduplicated: true });
  await assert.rejects(session.steer('CHANGED', { requestId: 'steer' }), { code: 'request_conflict' });
  assert.equal(steers.length, 1);
});

test('unknown steering freezes new turns without clearing current permission or cancelling model', { timeout: 3000 }, async t => {
  const { session, prompts, steers, calls } = fixture(t);
  await session.queue('active', { requestId: 'active' }); await session.queue('queued', { requestId: 'queued' });
  const permission = session.handlePermissionRequest({ options: [{ optionId: 'allow', kind: 'allow_once' }] }, 'permission');
  const unknown = session.steer('maybe injected', { requestId: 'unknown' });
  await assert.rejects(unknown, { code: 'steering_unknown' });
  assert.equal(session.state().steeringUncertain, true); assert.equal(session.status, 'prompting');
  assert.equal(session.broker.list().length, 1); assert.equal(calls.cancelled, 0); assert.equal(calls.disposed, 0);
  await assert.rejects(session.queue('new', { requestId: 'new' }), { code: 'steering_unknown' });
  await assert.rejects(session.prompt('new prompt'), { code: 'steering_unknown' });
  await assert.rejects(session.steer('maybe injected', { requestId: 'unknown' }), { code: 'request_outcome_unknown' });
  assert.equal(steers.length, 1);
  await session.permission({ requestId: 'permission', optionId: 'allow' }); await permission;
  prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(session.status, 'error'); assert.deepEqual(session.state().queuedMessages, []); assert.equal(prompts.length, 1);
  steers[0].resolve({ outcome: 'injected' }); await tick();
  assert.equal(session.events.some(e => e.type === 'user_message' && e.requestId === 'unknown'), false);
  assert.equal(calls.cancelled, 0); assert.equal(calls.disposed, 0);
});

test('cancel and close settle pending steering promptly and never release a new turn into uncertain transport', async t => {
  for (const action of ['cancel', 'close']) {
    const { session, steers, prompts } = fixture(t); session.opts.steerTimeoutMs = 60000;
    await session.queue('active', { requestId: 'active' }); await session.queue('queued', { requestId: 'queued' });
    const pending = session.steer('pending', { requestId: 'steer' });
    const rejected = assert.rejects(pending, { code: 'steering_unknown' });
    await session[action](); await rejected; await tick();
    assert.equal(session.steeringUncertain, true); assert.equal(prompts.length, 1); assert.deepEqual(session.state().queuedMessages, []);
    await assert.rejects(session.queue('must not start', { requestId: 'new' }));
    steers[0].resolve({ outcome: 'injected' }); await tick();
    assert.equal(session.events.some(e => e.type === 'user_message' && e.requestId === 'steer'), false);
  }
});
