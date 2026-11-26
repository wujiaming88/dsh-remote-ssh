import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { AcpSession, createAcpRuntime } from '../lib/acp.js';
import { createDurableSession } from '../lib/durable-session.js';
import { createWorkspaces } from '../lib/workspaces.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); promise.catch(() => {}); return { promise, resolve, reject }; };
const profile = { id: 'fixture', host: 'example.invalid', user: 'tester', port: 22, authMethod: 'key' };

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-durable-facade-'));
  t.after(() => { assert.equal(dirname(resolve(dir)), resolve(tmpdir())); rmSync(dir, { recursive: true, force: true }); });
  const owners = new Map(), links = [], launches = [], dispatched = [];
  let runtime;
  function snapshot(owner) {
    return { type: 'attached', epoch: owner.epoch, headSeq: owner.session.eventSeq, state: owner.session.state(), requests: [...owner.session.requests.values()].map(({ promise, ...value }) => value), forkReservation: owner.forkReservation || null };
  }
  function broadcast(owner, event) {
    for (const link of links.filter(link => link.owner === owner && !link.closed && link.network)) link.options.onEvent(event);
    setImmediate(() => { for (const link of links.filter(link => link.owner === owner && !link.closed && link.network)) link.options.onState(snapshot(owner)); });
  }
  const build = options => {
    const persisted = runtime.store.get(options.sessionOptions.id);
    assert.equal(persisted.remoteExecution.id, options.identity.id, 'identity persisted before launch');
    assert.equal(persisted.remoteExecution.token, options.identity.token);
    launches.push(options);
    return { options };
  };
  function createLink(options) {
    const local = { options, network: true, closed: false, pending: new Map(), owner: null };
    links.push(local);
    function settle(entry) {
      if (!entry.operation.settled || !local.network || local.closed) return;
      local.pending.delete(entry.id);
      if (entry.operation.error) entry.gate.reject(entry.operation.error); else entry.gate.resolve(entry.operation.result);
    }
    local.start = async () => {
      let owner = owners.get(options.identity.id);
      if (!owner) {
        if (!options.create) throw Object.assign(new Error('Owner lost'), { code: 'remote_broker_lost' });
        owner = { epoch: 'epoch-' + options.identity.id, operations: new Map(), prompts: [], starts: 0, cancelled: 0, closed: 0 };
        const source = options.launchSpec.options.sessionOptions;
        const controller = {
          ready: Promise.resolve({ sessionId: 'remote-' + source.id, protocolCwd: '/remote/repo', capabilities: { agentCapabilities: { promptCapabilities: { image: true }, sessionCapabilities: { fork: {} } }, steering: { supported: false } },
            sessionResponse: { modes: { currentModeId: 'plan', availableModes: [{ id: 'plan' }, { id: 'acceptEdits' }] } } }),
          async setMode() { return {}; },
          prompt(value) { const gate = deferred(); owner.prompts.push({ value, ...gate }); return gate.promise; },
          async cancel() { owner.cancelled++; owner.prompts.at(-1)?.resolve({ stopReason: 'cancelled' }); return true; },
          async close() { owner.closed++; owner.prompts.at(-1)?.resolve({ stopReason: 'cancelled' }); },
          async dispose() { throw new Error('Host detach must never dispose the remote adapter'); },
        };
        owner.session = new AcpSession({ ...source, profile, connectImpl: () => { owner.starts++; return controller; }, onEvent: event => broadcast(owner, event) });
        owners.set(options.identity.id, owner);
        await owner.session.start();
      }
      local.owner = owner;
      await local.reconnect();
      return snapshot(owner);
    };
    local.reconnect = async () => {
      local.network = true;
      options.onConnection({ state: 'connected' });
      for (const event of local.owner.session.eventsSince({ generation: local.owner.session.generation, seq: options.getCursor() }).events) options.onEvent(event);
      options.onIdentity({ ...options.identity, epoch: local.owner.epoch });
      options.onState(snapshot(local.owner));
      for (const entry of [...local.pending.values()]) settle(entry);
    };
    local.disconnect = () => { local.network = false; options.onConnection({ state: 'reconnecting', message: 'SSH dropped' }); };
    local.call = (method, args = {}, { opId } = {}) => {
      if (local.closed) return Promise.reject(Object.assign(new Error('detached'), { code: 'remote_detached' }));
      if (method === 'status') return Promise.resolve(snapshot(local.owner));
      let operation = local.owner.operations.get(opId);
      if (!operation) {
        dispatched.push({ method, args, opId });
        operation = { settled: false }; local.owner.operations.set(opId, operation);
        let promise;
        if (method === 'prompt' || method === 'steer') promise = local.owner.session[method](args.text, { requestId: args.requestId, attachments: args.attachments });
        else if (method === 'permission' || method === 'elicitation') promise = local.owner.session[method](args);
        else if (method === 'setMode') promise = local.owner.session.setMode(args.modeId);
        else if (method === 'beginFork') {
          local.owner.forkReservation = args; local.owner.session.forking = true; promise = Promise.resolve(args);
        } else if (method === 'endFork') {
          local.owner.forkReservation = null; local.owner.session.forking = false; promise = Promise.resolve({ released: true });
        } else promise = local.owner.session[method]();
        Promise.resolve(promise).then(result => { operation.settled = true; operation.result = result; }, error => { operation.settled = true; operation.error = error; }).then(() => {
          for (const linked of links) for (const entry of linked.pending.values()) if (entry.operation === operation) linked.settle(entry);
        });
      }
      const entry = { id: opId, operation, gate: deferred() }; local.pending.set(opId, entry); settle(entry); return entry.gate.promise;
    };
    local.settle = settle;
    local.query = async ids => ids.map(opId => ({ opId, status: local.owner.operations.has(opId) ? 'pending' : 'not_found' }));
    local.close = async () => {
      local.closed = true;
      for (const entry of local.pending.values()) entry.gate.reject(Object.assign(new Error('detached; task retained'), { code: 'remote_detached' }));
      local.pending.clear();
    };
    return local;
  }
  const runtimeOptions = { storePath: join(dir, 'sessions.json'), createSession: createDurableSession, getProfile: () => profile, buildDurableLaunchSpec: build, createDurableLink: createLink };
  function newRuntime() { runtime = createAcpRuntime(runtimeOptions); return runtime; }
  const args = { id: 'host-session', profile, workspaceId: 'workspace', dshSessionId: 'native-session', cwd: dir, remotePath: '/remote/repo', agent: 'claude', permission: 'plan' };
  return { dir, args, owners, links, launches, dispatched, newRuntime, get runtime() { return runtime; } };
}

test('SSH loss preserves active prompt and pending permissions; replay never reinitializes or resubmits', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args), link = f.links[0], owner = link.owner;
  const prompt = session.prompt('continue remotely', { requestId: 'request-1' });
  await tick();
  const permission = owner.session.handlePermissionRequest({ sessionId: owner.session.sessionId, options: [{ optionId: 'yes', kind: 'allow_once' }] }, 'permission-1');
  await tick();
  link.disconnect();
  assert.equal(session.state().transportState, 'reconnecting'); assert.equal(session.status, 'prompting'); assert.equal(session.busy, true);
  assert.equal(session.state().pendingPermissions.length, 1); assert.equal(owner.session.broker.list().length, 1);
  assert.equal(session.events.filter(event => event.type === 'stop').length, 0);
  owner.session._emit({ type: 'text', text: 'work done offline' });
  await link.reconnect();
  await session.permission({ requestId: 'permission-1', optionId: 'yes' });
  assert.equal((await permission).outcome.optionId, 'yes');
  owner.prompts[0].resolve({ stopReason: 'end_turn' }); await prompt; await tick();
  assert.equal(owner.starts, 1); assert.equal(owner.prompts.length, 1); assert.equal(owner.cancelled, 0);
  assert.equal(session.events.filter(event => event.type === 'stop').length, 1);
  assert.equal(session.events.filter(event => event.text === 'work done offline').length, 1);
  await runtime.shutdown();
});

test('Host shutdown detaches; a new runtime restores the same task, gates, cursor and native admissions', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args), owner = f.links[0].owner;
  const admitted = [{ type: 'text', text: 'inspect image' }, { type: 'image', attachment: { id: 'host-admitted-image' } }];
  session.registerNativeContent('request-2', admitted);
  const prompt = session.prompt('inspect image', { requestId: 'request-2' }); prompt.catch(() => {}); await tick();
  const question = owner.session.handleElicitationRequest({ mode: 'form', message: 'Which?', requestedSchema: { type: 'object', properties: { choice: { type: 'string' } } } }, 'question');
  await tick();
  const before = session.eventSeq;
  await runtime.shutdown(); await assert.rejects(prompt, { code: 'remote_detached' });
  assert.equal(owner.session.status, 'prompting'); assert.equal(owner.session.pendingElicitations.size, 1); assert.equal(owner.cancelled, 0); assert.equal(owner.closed, 0);
  owner.session._emit({ type: 'text', text: 'while Host was gone' });
  const restoredRuntime = f.newRuntime(), cold = restoredRuntime.list()[0];
  assert.equal(cold.busy, true); assert.equal(cold.remoteTaskStatus, 'prompting');
  assert.equal(JSON.stringify(cold).includes('host-admitted-image'), false); assert.equal(cold.remoteExecution.token, undefined);
  const resumed = await restoredRuntime.resume(session.id);
  assert.equal(f.launches[1].create, false); assert.equal(owner.starts, 1); assert.ok(resumed.eventSeq > before);
  assert.deepEqual(resumed.nativeContentFor({ requestId: 'request-2', generation: resumed.generation }), admitted);
  assert.equal(resumed.state().pendingElicitations.length, 1); assert.equal(resumed.busy, true);
  await resumed.elicitation({ requestId: 'question', action: 'accept', content: { choice: 'local answer' } }); assert.equal((await question).action, 'accept');
  owner.prompts[0].resolve({ stopReason: 'end_turn' }); await tick();
  assert.equal(resumed.events.filter(event => event.type === 'stop').length, 1); assert.equal(owner.prompts.length, 1);
  await restoredRuntime.shutdown();
});

test('canonical append failure does not advance cursor or publish an invented stop', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args), link = f.links[0];
  const before = session.eventSeq, original = runtime.store.appendEvent;
  runtime.store.appendEvent = () => { throw new Error('disk full'); };
  const event = { eventVersion: 1, generation: session.generation, seq: before + 1, type: 'text', text: 'must retry' };
  assert.throws(() => link.options.onEvent(event), /disk full/); assert.equal(session.eventSeq, before);
  assert.equal(session.events.some(event => event.text === 'must retry'), false);
  runtime.store.appendEvent = original;
  link.options.onEvent(event); link.options.onEvent(event);
  assert.equal(session.eventSeq, before + 1); assert.equal(session.events.filter(event => event.text === 'must retry').length, 1);
  assert.equal(runtime.store.get(session.id).eventSeq, before + 1);
  await runtime.shutdown();
});

test('native admission must persist before submission and remote events cannot inject native content', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args), link = f.links[0];
  const save = runtime.store.upsert;
  runtime.store.upsert = () => { throw new Error('metadata failure'); };
  assert.throws(() => session.registerNativeContent('r', [{ type: 'text', text: 'actual text' }]), /metadata failure/);
  assert.equal(session.nativeAdmissions.has('r'), false); assert.equal(f.dispatched.length, 0);
  runtime.store.upsert = save;
  session.registerNativeContent('r', [{ type: 'text', text: 'actual text' }]);
  const event = { eventVersion: 1, generation: session.generation, seq: session.eventSeq + 1, type: 'turn_start', turnId: 't', requestId: 'r', nativeContent: [{ type: 'text', text: 'injected' }], content: [{ type: 'text', text: 'injected' }] };
  link.options.onEvent(event);
  assert.equal(session.events.at(-1).nativeContent, undefined); assert.equal(session.events.at(-1).content, undefined);
  assert.deepEqual(session.nativeContentFor(event), [{ type: 'text', text: 'actual text' }]);
  const stored = readFileSync(runtime.store.historyPath(session.id), 'utf8'); assert.equal(stored.includes('injected'), false);
  await runtime.shutdown();
});

test('cold explicit close reattaches and awaits remote acknowledgement before removing history', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args), owner = f.links[0].owner;
  await runtime.shutdown();
  const recovered = f.newRuntime(); const result = await recovered.close(session.id);
  assert.equal(result.removed, true); assert.equal(owner.closed, 1); assert.equal(owner.starts, 1); assert.equal(recovered.store.get(session.id), null);
});

test('cold locator without a session id is attachable and unconfirmed create keeps its start-once identity', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args);
  const id = session.remoteExecution.id; await runtime.shutdown();
  runtime.store.upsert({ ...runtime.store.get(session.id), sessionId: '', remoteExecution: { ...session.remoteExecution, epoch: undefined } });
  const restored = f.newRuntime(), resumed = await restored.resume(session.id);
  assert.equal(resumed.remoteExecution.id, id); assert.equal(f.launches.at(-1).create, true); assert.equal(f.owners.get(id).starts, 1);
  await restored.shutdown();
});

test('missing owner on cold close retains its locator and never creates a replacement', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args);
  const locator = session.remoteExecution.id; await runtime.shutdown(); f.owners.delete(locator);
  const restored = f.newRuntime();
  await assert.rejects(restored.close(session.id), { code: 'remote_broker_lost' });
  assert.equal(restored.store.get(session.id).remoteExecution.id, locator);
  assert.equal(f.launches.at(-1).create, false); assert.equal(f.owners.size, 0);
  await restored.shutdown();
});

test('fork reserves the remote source and child canonical events continue after the inherited prefix', async t => {
  const f = fixture(t), runtime = f.newRuntime(), source = await runtime.create(f.args), owner = f.links[0].owner;
  const prompt = source.prompt('parent turn', { requestId: 'parent-request' }); await tick();
  owner.prompts[0].resolve({ stopReason: 'end_turn' }); await prompt;
  const child = await runtime.fork(source.id, { operationId: 'durable-fork', id: 'child-host-session', dshSessionId: 'child-native', remotePath: '/remote/repo' });
  assert.deepEqual(f.dispatched.filter(call => call.method === 'beginFork' || call.method === 'endFork').map(call => call.method), ['beginFork', 'endFork']);
  assert.equal(owner.forkReservation, null); assert.equal(source.remoteForkReservation, null);
  const launch = f.launches.find(value => value.sessionOptions.id === child.id);
  assert.ok(launch.sessionOptions.eventSeq > 0); assert.equal(launch.sessionOptions.generation, child.generation);
  const own = child.events.filter(event => !event.inherited);
  assert.equal(own[0].seq, launch.sessionOptions.eventSeq + 1);
  assert.equal(new Set(child.events.map(event => event.seq)).size, child.events.length);
  assert.equal(child.nativeAdmissions.size, 0);
  await runtime.shutdown();
});

test('workspace and profile removal refuse an unknown durable task without touching SSH or configuration', async () => {
  const profile = { id: 'p' }, workspace = { id: 'w', profileId: 'p', remotePath: '/remote', mirrorPath: '/mirror', shellWorkspaceId: 'native' };
  let edits = 0, ssh = 0, stopped = 0;
  const api = createWorkspaces({ configuration: { snapshot: () => ({ profiles: [profile], workspaces: [workspace] }), profile: () => profile, update: () => { edits++; } }, registry: { get: () => null }, runtime: {
    list: () => [{ id: 'a', workspaceId: 'w', profileId: 'p', remoteExecution: { id: 'broker', protocol: 'dsh-acp-broker/1' } }], shutdownSession: () => { stopped++; },
  }, ssh: { run: () => { ssh++; } }, stateDir: '/private/state' });
  await assert.rejects(api.remove({ id: 'w' }), { code: 'remote_execution_active' });
  await assert.rejects(api.removeProfile({ id: 'p' }), { code: 'remote_execution_active' });
  assert.deepEqual([edits, ssh, stopped], [0, 0, 0]);
});


test('shutdown interrupts permanently disconnected title and fork waits without cancelling remote owners', { timeout: 1500 }, async t => {
  const f = fixture(t), runtime = f.newRuntime(), source = await runtime.create(f.args), link = f.links[0], owner = link.owner;
  const original = link.call;
  link.call = (method, args, opts) => {
    if (method === 'setTitle' || method === 'beginFork') {
      if (method === 'beginFork') { owner.forkReservation = args; owner.session.forking = true; }
      return new Promise(() => {}); // The SSH link never returns, even on close.
    }
    return original(method, args, opts);
  };
  const title = runtime.setTitle(source.id, 'possibly accepted'); title.catch(() => {});
  const fork = runtime.fork(source.id, { operationId: 'uncertain-fork', id: 'uncertain-child', dshSessionId: 'uncertain-native', remotePath: '/remote/repo' }); fork.catch(() => {});
  await tick(); link.disconnect();
  const states = []; source.subscribeState(state => states.push(state));
  await runtime.shutdown();
  await assert.rejects(title, { code: 'remote_detached' });
  await assert.rejects(fork, { code: 'remote_detached' });
  assert.equal(source.forking, false); assert.equal(runtime.sessions.size, 0);
  assert.equal(runtime.forkOperation('uncertain-fork').outcome, 'unknown');
  assert.equal(owner.cancelled, 0); assert.equal(owner.closed, 0);
  assert.ok(owner.forkReservation); assert.equal(owner.session.events.filter(event => event.type === 'stop').length, 0);
  assert.equal(states.at(-1).transportState, 'detached');
  assert.equal(states.some(state => state.remoteExecution.token !== undefined), false);
});

test('confirmed close preserves readable history and forbids a new execution for the same binding', async t => {
  const f = fixture(t), runtime = f.newRuntime(), session = await runtime.create(f.args), owner = f.links[0].owner;
  const prompt = session.prompt('retained history', { requestId: 'retained' }); await tick();
  owner.prompts[0].resolve({ stopReason: 'end_turn' }); await prompt;
  const generation = session.generation;
  const result = await runtime.close(session.id, { preserveHistory: true });
  assert.equal(result.closed, true); assert.equal(result.removed, false); assert.equal(result.historyPreserved, true);
  const state = runtime.list()[0];
  assert.equal(state.status, 'closed'); assert.equal(state.resumable, false); assert.equal(state.alive, false); assert.equal(state.remoteExecution.taskStatus, 'closed');
  assert.ok(runtime.events(session.id).events.some(event => event.text === 'retained history'));
  assert.equal(runtime.store.get(session.id).generation, generation);
  await assert.rejects(runtime.resume(session.id), { code: 'session_closed' });
  await assert.rejects(runtime.create(f.args), { code: 'session_closed' });
  const starts = f.launches.length;
  await runtime.close(session.id, { preserveHistory: true });
  assert.equal(f.launches.length, starts); assert.equal(owner.closed, 1);
  await runtime.shutdown();
});
