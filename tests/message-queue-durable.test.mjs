import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, realpathSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { AcpSession, createAcpRuntime } from '../lib/acp.js';
import { createDurableSession } from '../lib/durable-session.js';
import { createDurableLink } from '../lib/durable-link.js';
import { createDurableBroker } from '../lib/durable-broker.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function untilState(session, predicate) {
  if (predicate(session.state())) return Promise.resolve(session.state());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('State timeout')); }, 3000);
    const off = session.subscribeState(state => { if (predicate(state)) { clearTimeout(timer); off(); resolve(state); } }, { replay: false });
  });
}

// Exercise the production facade, link framing/reconciliation, authenticated Unix
// socket broker, owner AcpSession, and Host store. Only the SSH byte relay and
// model controller are substitutes; no worker bundle/build or SSH/model is used.
async function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'dsh-mq-')); chmodSync(directory, 0o700);
  const socketPath = join(directory, 's'), prompts = [], steers = [], children = [], runtimes = [];
  const profile = { id: 'fixture', host: 'never-connect.invalid', user: 'fixture' };
  let broker, owner, starts = 0;
  function spawnBridge() {
    const child = new EventEmitter(), socket = net.createConnection(socketPath);
    children.push({ child, socket });
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => socket.destroy();
    socket.on('error', () => {}); socket.on('close', () => child.emit('close', 0)); socket.pipe(child.stdout);
    let bootstrap = '';
    child.stdin.on('data', chunk => {
      if (bootstrap === null) { socket.write(chunk); return; }
      bootstrap += chunk;
      const end = bootstrap.indexOf('\n');
      if (end >= 0) { socket.write(bootstrap.slice(end + 1)); bootstrap = null; }
    });
    return child;
  }
  const options = {
    storePath: join(directory, 'host.json'), getProfile: () => profile, createSession: createDurableSession, spawn: spawnBridge,
    createDurableLink: opts => createDurableLink({ ...opts, retryDelays: [1], heartbeatMs: 10000 }),
    async buildDurableLaunchSpec(opts) {
      if (!broker) {
        broker = createDurableBroker({ directory, identity: { ...opts.identity, epoch: 'owner-epoch' }, createSession(hooks) {
          owner = new AcpSession({ ...opts.sessionOptions, ...hooks });
          owner.capabilities = { agentCapabilities: { promptCapabilities: { image: true } }, steering: { supported: true } };
          owner.controller = {
            prompt(value) { const gate = deferred(); prompts.push({ value, ...gate }); return gate.promise; },
            async steer(value) { steers.push(value); return { outcome: 'injected' }; },
            async close() { prompts.at(-1)?.resolve({ stopReason: 'cancelled' }); }, async dispose() {},
          };
          owner.start = async () => { starts++; owner.sessionId = 'same-remote-model'; owner.status = 'ready'; owner._emit({ type: 'session' }); return owner; };
          return owner;
        } });
        await broker.listen(socketPath); await broker.start();
      }
      return { command: 'local-unix-byte-relay', args: [], bootstrap: {} };
    },
  };
  function runtime() { const value = createAcpRuntime(options); runtimes.push(value); return value; }
  t.after(async () => {
    for (const runtime of runtimes) await runtime.shutdown();
    await broker?.close();
    for (const { socket } of children) socket.destroy();
    assert.equal(dirname(directory), realpathSync(tmpdir())); assert.ok(directory.includes('/dsh-mq-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return { runtime, prompts, steers, children, get broker() { return broker; }, get owner() { return owner; }, get starts() { return starts; },
    args: { id: 'host-session', profile, agent: 'claude', cwd: directory, remotePath: '/remote/project', dshSessionId: 'native-session' } };
}

test('real broker queue receipts are fast and recover after link loss and Host recreation without resubmission', { timeout: 10000 }, async t => {
  const f = await fixture(t), runtime = f.runtime(), first = await runtime.create(f.args);
  const active = await first.queue('active', { requestId: 'active' });
  const admitted = [{ type: 'text', text: 'queued image' }, { type: 'image', attachment: { id: 'trusted-host-asset' } }];
  first.registerNativeContent('image', admitted);
  const image = await first.queue('queued image', { requestId: 'image', attachments: [{ type: 'image', name: 'image.png', mimeType: 'image/png', data: 'AA==' }] });
  const remove = await first.queue('remove me', { requestId: 'remove' });
  assert.equal(active.outcome, 'started'); assert.equal(image.outcome, 'queued'); assert.equal(f.prompts.length, 1);
  assert.deepEqual(first.state().queuedMessages.map(m => m.requestId), ['image', 'remove']);
  assert.deepEqual(first.turnQueue, [], 'Host facade never stores executable queued turns');
  const disconnected = untilState(first, state => state.transportState === 'reconnecting');
  f.children.at(-1).socket.destroy(); await disconnected;
  assert.deepEqual(first.state().queuedMessages.map(m => m.requestId), ['image', 'remove']);
  await assert.rejects(first.queue('not buffered locally', { requestId: 'offline' }), { code: 'remote_disconnected' });
  await untilState(first, state => state.transportState === 'connected');
  assert.equal(f.prompts.length, 1); assert.equal(f.starts, 1);
  const removed = await first.removeQueued('remove'); assert.equal(removed.turnId, remove.turnId);
  assert.ok(f.broker.operations.has('removeQueued:remove'));
  await runtime.shutdown();
  assert.equal(f.owner.busy, true); assert.deepEqual(f.owner.state().queuedMessages.map(m => m.requestId), ['image']);
  const restored = f.runtime();
  assert.deepEqual(restored.list()[0].queuedMessages.map(m => m.requestId), ['image']);
  const second = await restored.resume(first.id);
  assert.equal(f.starts, 1); assert.deepEqual(second.nativeContentFor({ requestId: 'image', generation: second.generation }), admitted);
  const operations = f.broker.operations.size;
  assert.deepEqual(await second.removeQueued({ targetRequestId: 'remove' }), removed);
  assert.equal(f.broker.operations.size, operations, 'default remove opId survives Host recreation');
  assert.deepEqual(await second.queue('queued image', { requestId: 'image', attachments: [{ type: 'image', name: 'image.png', mimeType: 'image/png', data: 'AA==' }] }), image);
  await assert.rejects(second.queue('changed', { requestId: 'image' }), { code: 'operation_conflict' });
  f.prompts[0].resolve({ stopReason: 'end_turn' });
  await untilState(second, state => state.queuedMessages.length === 0 && state.busy);
  assert.equal(f.prompts.length, 2); assert.equal(f.prompts[1].value[1].data, 'AA==');
  await assert.rejects(second.removeQueued('image'), { code: 'queue_already_started' });
  f.prompts[1].resolve({ stopReason: 'end_turn' }); await untilState(second, state => !state.busy);
  assert.deepEqual(await second.queue('active', { requestId: 'active' }), active);
  assert.equal(f.prompts.length, 2);
});

test('durable queue edit updates native admission and promote injects without starting a second turn', { timeout: 10000 }, async t => {
  const f = await fixture(t), runtime = f.runtime(), first = await runtime.create(f.args);
  await first.queue('active', { requestId: 'active' });
  first.registerNativeContent('edit', [{ type: 'text', text: 'before edit' }]);
  const edit = await first.queue('before edit', { requestId: 'edit' });
  const now = await first.queue('send now', { requestId: 'now' });
  const updated = await first.updateQueued({ targetRequestId: 'edit', text: 'after edit' });
  assert.equal(updated.updated, true); assert.equal(updated.turnId, edit.turnId);
  assert.deepEqual(first.state().queuedMessages.map(item => item.text), ['after edit', 'send now']);
  assert.deepEqual(first.nativeContentFor({ requestId: 'edit', generation: first.generation }), [{ type: 'text', text: 'after edit' }]);
  first.registerNativeContent('ghost', [{ type: 'text', text: 'ghost before' }]);
  await assert.rejects(first.updateQueued({ targetRequestId: 'ghost', text: 'ghost after' }), { code: 'queue_not_found' });
  assert.deepEqual(first.nativeContentFor({ requestId: 'ghost', generation: first.generation }), [{ type: 'text', text: 'ghost before' }]);
  const promoted = await first.promoteQueued('now');
  assert.equal(promoted.outcome, 'injected'); assert.equal(promoted.turnId, f.owner.activeTurn.id); assert.notEqual(promoted.turnId, now.turnId);
  assert.deepEqual(f.steers, [[{ type: 'text', text: 'send now' }]]);
  assert.equal(f.prompts.length, 1); assert.deepEqual(first.state().queuedMessages.map(item => item.requestId), ['edit']);
  assert.equal(f.owner.events.some(event => event.type === 'stop' && event.requestId === 'now'), false);
  await runtime.shutdown();
  assert.deepEqual(f.owner.state().queuedMessages.map(item => item.requestId), ['edit']);
  const second = await f.runtime().resume(first.id);
  assert.deepEqual(second.state().queuedMessages.map(item => item.text), ['after edit']);
  assert.deepEqual(second.nativeContentFor({ requestId: 'edit', generation: second.generation }), [{ type: 'text', text: 'after edit' }]);
  assert.deepEqual(await second.promoteQueued('now'), promoted);
  f.prompts[0].resolve({ stopReason: 'end_turn' });
  await untilState(second, state => state.queuedMessages.length === 0 && state.busy);
  assert.equal(f.prompts.length, 2); assert.deepEqual(f.prompts[1].value, 'after edit');
});

test('concurrent same-id receipts share the held authoritative state gate', async t => {
  const receipt = deferred(), status = deferred(), calls = [];
  const generation = 'held-status-generation';
  const initial = { epoch: 'held-status-owner', generation, headSeq: 0, state: {
    generation, status: 'prompting', busy: true, pendingTurns: 1, queuedMessages: [],
    capabilities: { agentCapabilities: { promptCapabilities: {} } },
  } };
  const session = createDurableSession({ id: 'held-status', generation,
    buildDurableLaunchSpec: async () => ({}),
    createDurableLink: options => ({
      async start() { options.onIdentity({ ...options.identity, epoch: initial.epoch }); return initial; },
      call(method, args, options) { calls.push({ method, args, options }); return method === 'status' ? status.promise : receipt.promise; },
      async close() {},
    }),
  });
  t.after(() => session.dispose()); await session.start();
  let firstState, secondState;
  const first = session.queue('queued', { requestId: 'same-id' }).then(value => { firstState = session.state(); return value; });
  const second = session.queue('queued', { requestId: 'same-id' }).then(value => { secondState = session.state(); return value; });
  await assert.rejects(session.queue('different', { requestId: 'same-id' }), { code: 'request_conflict' });
  const accepted = { accepted: true, outcome: 'queued', requestId: 'same-id', turnId: 'queued-turn' };
  receipt.resolve(accepted); await tick();
  assert.deepEqual(calls.map(call => call.method), ['queue', 'status']);
  assert.equal(firstState, undefined); assert.equal(secondState, undefined, 'duplicate receipt must wait for the same snapshot as original');
  const queuedMessages = [{ requestId: 'same-id', turnId: 'queued-turn', text: 'queued', attachments: [] }];
  status.resolve({ ...initial, state: { ...initial.state, pendingTurns: 2, queuedMessages } });
  assert.deepEqual(await first, accepted); assert.deepEqual(await second, accepted);
  assert.deepEqual(firstState.queuedMessages, queuedMessages); assert.deepEqual(secondState.queuedMessages, queuedMessages);
  assert.equal(firstState.pendingTurns, 2); assert.equal(secondState.pendingTurns, 2);
});

test('owner advances FIFO offline; replay restores current queue, not stale Host copies', { timeout: 10000 }, async t => {
  const f = await fixture(t), firstRuntime = f.runtime(), first = await firstRuntime.create(f.args);
  await first.queue('one', { requestId: 'one' }); await first.queue('two', { requestId: 'two' }); await first.queue('three', { requestId: 'three' });
  await firstRuntime.shutdown();
  f.prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(f.prompts[1].value, 'two');
  const restored = await f.runtime().resume(first.id);
  assert.deepEqual(restored.state().queuedMessages.map(m => m.text), ['three']);
  assert.equal(restored.state().queuedMessages[0].requestId, 'three');
  assert.equal(f.starts, 1); assert.equal(f.prompts.length, 2);
  const snapshotEvents = restored.events.filter(event => event.type === 'queue_snapshot');
  assert.deepEqual(snapshotEvents.at(-1).queuedMessages.map(m => m.text), ['three']);
});
