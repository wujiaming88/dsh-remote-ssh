import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
const installed = !!process.versions.electron && !!process.env.DSH_INSTALL_DIR;
if (!installed) {
  test('Host Session actions use installed DSH public contracts offline', () => {
    assert.ok(process.env.DSH_NODE_EXECUTABLE);
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.env.DSH_NODE_EXECUTABLE, [fileURLToPath(import.meta.url)], { env, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stdout + result.stderr); process.stdout.write(result.stdout);
  });
} else {
  registerHooks({ resolve(specifier, context, next) {
    return next(specifier, specifier.startsWith('@deepseek-ai/') || specifier === 'zod' ? { ...context, parentURL: pathToFileURL(process.env.DSH_INSTALL_DIR + '/package.json').href } : context);
  } });
  const [{ Context }, { SessionStore, buildForkSeed }, { SessionProjectionRegistry }, { SessionQueryEngine }, { SessionTitleService }, { AgentRegistry }, { AgentLoop }, storage, storageJson, storageDomain, persistence, { WorkspaceRegistry }, { RemoteTurnRecorder }, { AcpSession }, { BackendBindings }, { createSessionActions }] = await Promise.all([
    import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-session'), import('@deepseek-ai/dsh-session-projection'), import('@deepseek-ai/dsh-session-query'), import('@deepseek-ai/dsh-session-title'), import('@deepseek-ai/dsh-agent'), import('@deepseek-ai/dsh-agent-loop'), import('@deepseek-ai/dsh-storage'), import('@deepseek-ai/dsh-storage-json'), import('@deepseek-ai/dsh-storage-domain'), import('@deepseek-ai/dsh-session-persistence-jsonl'), import('@deepseek-ai/dsh-workspace'), import('../lib/remote-turn-recorder.js'), import('../lib/acp.js'), import('../lib/bindings.js'), import('../lib/session-actions.js')
  ]);
  const { inject: hostInject } = await import('../lib/index.js');
  const deferred = () => Promise.withResolvers();
  function streamResponse({ backpressure = false } = {}) {
    return Object.assign(new EventEmitter(), { frames: [], headersSent: false, writableEnded: false,
      writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
      write(line) { this.frames.push(JSON.parse(line)); return !backpressure; },
      flushHeaders() { this.flushed = true; }, end() { this.writableEnded = true; } });
  }
  async function fixture({ initialPermission = 'plan', scopedContext = false } = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'remote-host-actions-')); const cwd = join(directory, 'workspace'); await mkdir(cwd);
    const root = new Context();
    await root.plugin(SessionStore); await root.plugin(SessionProjectionRegistry);
    await root.plugin(persistence, { root: join(directory, 'native-logs'), compression: 'none' });
    await root.plugin(storage.Storage); await root.plugin(storageJson, { root: join(directory, 'native-storage') }); await root.plugin(storageDomain, { backend: 'json' });
    await root.plugin(WorkspaceRegistry); await root.plugin(AgentRegistry);
    let modelCalls = 0;
    root.provide('llm', { stream() { modelCalls++; throw Error('Native model must never run'); } });
    root.provide('tools', { list: () => [] }); root.provide('systemPrompt', { variable: () => () => {} });
    await root.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 1 });
    await root.plugin(SessionQueryEngine); await root.plugin(SessionTitleService, { fallbackMaxWords: 5, fallbackMaxBytes: 100, maxTitleBytes: 200 });
    const workspace = await root.workspaceRegistry.create(cwd, 'remote');
    const profile = { id: 'profile', host: 'fixture.invalid', user: 'fixture', port: 22 };
    const workspaceRecord = { id: 'remote-w', profileId: profile.id, remotePath: '/canonical/remote', mirrorPath: cwd, shellWorkspaceId: workspace.id };
    let configured = true;
    const configuration = { snapshot: () => ({ workspaces: configured ? [workspaceRecord] : [] }), profile: () => profile };
    const bindings = new BackendBindings(join(directory, 'bindings.json'));
    const live = new Map(), saved = new Map(), operations = new Map();
    const calls = { fork: 0, resume: 0, resumeOptions: [], title: [], nativeCreated: 0, nativeDisposed: 0 };
    let titleImpl = async (_id, title) => ({ ok: true, title }), forkHook = async () => {}, nativeFailure = null, flushFailure = null;
    function remote(id, dshId, options = {}) {
      const controller = { ready: Promise.resolve({ sessionId: 'remote-' + id, protocolCwd: '/canonical/remote', initialize: { agentCapabilities: { sessionCapabilities: { fork: {}, title: {} } } }, sessionResponse: { modes: { currentModeId: 'plan', availableModes: [{ id: 'plan' }, { id: 'acceptEdits' }] } } }),
        setMode: async () => ({}), prompt: async () => ({ stopReason: 'end_turn' }), cancel: async () => true, dispose: async () => {}, close: async () => {} };
      return new AcpSession({ id, dshSessionId: dshId, profile, agent: 'claude', cwd, remotePath: '/canonical/remote', configuredRemotePath: '/configured/remote', workspaceId: workspaceRecord.id, permission: 'plan', connectImpl: () => controller, ...options });
    }
    const runtime = {
      get: id => live.get(id), store: { get: id => saved.get(id) }, forkOperation: id => operations.get(id),
      setTitle: async (id, title) => { calls.title.push([id, title]); return titleImpl(id, title); },
      resume: async (id, args = {}) => { calls.resume++; calls.resumeOptions.push(args); const state = saved.get(id); const s = remote(id, state.dshSessionId, { permission: args.permission || state.permission, modeId: args.modeId || state.config.mode, forkOrigin: state.forkOrigin }); await s.start(); s.config.model = state.config.model; live.set(id, s); return s; },
      fork: (sourceId, args) => {
        calls.fork++; const source = live.get(sourceId); assert.ok(!operations.has(args.operationId)); source.forking = true;
        return (async () => {
          const id = 'child-' + calls.fork, cut = { generation: source.generation, seq: source.eventSeq };
          const op = { operationId: args.operationId, sourceId, sourceSessionId: source.sessionId, childId: id, dshSessionId: args.dshSessionId, remoteSessionId: 'remote-' + id, cut, outcome: 'completed' };
          const child = remote(id, args.dshSessionId, { permission: source.requestedPermission, modeId: source.config.mode, forkOrigin: { sourceId, sourceDshSessionId: source.dshSessionId, sourceSessionId: source.sessionId, cut }, forkOperation: op });
          assert.equal(args.cwd, cwd); assert.equal(args.remotePath, source.remotePath); assert.equal(args.configuredRemotePath, source.configuredRemotePath); assert.equal(args.workspaceId, source.workspaceId);
          await child.start(); child.config.model = source.config.model; live.set(id, child); saved.set(id, child.state()); operations.set(args.operationId, op);
          await forkHook(child); return child;
        })().finally(() => { source.forking = false; });
      }
    };
    const recorder = await RemoteTurnRecorder.create({ sessions: root.sessions, sessionProjections: root.sessionProjections });
    let actions; const attached = new Map();
    async function attachRecorder(acp) {
      if (attached.get(acp.id)?.acp === acp) return;
      await attached.get(acp.id)?.detach();
      const detach = recorder.attach(acp, root.sessions.get(acp.dshSessionId), { forkOrigin: actions?.approvedFork(acp.dshSessionId) }); attached.set(acp.id, { acp, detach }); await recorder.flush();
    }
    root.provide('sessionController', {
      rename: async ({ sessionId, title }) => { const accepted = root.sessionTitle.rename(root.sessions.get(sessionId), title); return { title: accepted.title, seq: accepted.eventSeq }; },
      resolveAgent: async id => root.agents.get(id) || (await root.agents.resume({ resumeSessionId: id })).agent
    });
    const nativeHandle = await root.agents.create({ sessionId: 'source-native', meta: { cwd, agentPreset: 'fixture-preset' } });
    const native = nativeHandle.agent.session;
    root.sessionTitle.rename(native, 'Source title');
    const source = remote('source-acp', native.id, { permission: initialPermission }); await source.start(); live.set(source.id, source); saved.set(source.id, source.state());
    await attachRecorder(source); await recorder.prepare(source, 'real remote prompt'); await source.prompt('real remote prompt'); await recorder.flush();
    await root.workspaceRegistry.pinSession(native.id); await workspace.attachSession(native.id);
    const initial = { sessionId: native.id, workspaceId: workspaceRecord.id, profileId: profile.id, cwd, configuredRemotePath: source.configuredRemotePath, backend: { type: 'claude', permission: initialPermission } };
    await bindings.bind(initial);
    const sessionBackend = async id => {
      const state = [...live.values()].find(s => s.dshSessionId === id)?.state() || [...saved.values()].find(s => s.dshSessionId === id);
      return { sessionId: id, remote: true, backend: { type: 'claude', permission: initialPermission }, binding: state, cwd,
        workspace: workspaceRecord, remoteCwd: source.configuredRemotePath, archived: root.workspaceRegistry.archivedSessionIds.includes(id) };
    };
    const originalAgents = root.agents;
    // Plain dependency fixture delegates to the real installed AgentFactory;
    // no service or prototype is modified for fault injection.
    const actionCtx = { sessions: { get: root.sessions.get.bind(root.sessions), flush: async session => { if (session.id !== native.id && flushFailure) throw flushFailure; return root.sessions.flush(session); } }, sessionQuery: root.sessionQuery, sessionTitle: root.sessionTitle,
      sessionController: root.sessionController, workspaceRegistry: root.workspaceRegistry, logger: root.logger,
      on: root.on.bind(root), get: root.get.bind(root), agents: { create: async options => {
        calls.nativeCreated++; if (nativeFailure) throw nativeFailure;
        assert.equal(options.parentSession, undefined); assert.equal(options.meta.agentPreset, 'fixture-preset');
        const handle = await originalAgents.create(options);
        return { ...handle, dispose: async () => { calls.nativeDisposed++; await handle.dispose(); } };
      } } };
    const actionOptions = { ctx: actionCtx, stateDir: directory, runtime, bindings, configuration, workspaces: { assertAvailable() {} }, sessionBackend, recorder, attachRecorder };
    if (scopedContext) {
      // Real title/query/agent services are sibling plugins, not plain properties
      // or ancestor provisions: Cordis must enforce the production inject list.
      for (const service of hostInject) if (!root.get(service)) root.provide(service, {});
      await root.plugin({ name: 'remote-actions-context-contract', inject: hostInject, async apply(ctx) {
        actionOptions.ctx = ctx;
        actions = await createSessionActions(actionOptions);
      } });
      assert.ok(actions, 'the plugin activates with its declared dependencies');
    } else actions = await createSessionActions(actionOptions);
    return { directory, root, actionCtx, get actions() { return actions; }, bindings, native, source, runtime, calls, workspace, saved, live, operations, recorder, modelCalls: () => modelCalls,
      async unloadNative() { await recorder.dispose(); await root.sessions.flush(native); await nativeHandle.dispose(); assert.equal(root.sessions.get(native.id), undefined); },
      async restartActions() { await actions.dispose(); actions = await createSessionActions({ ...actionOptions, bindings: new BackendBindings(join(directory, 'bindings.json')) }); },
      setTitle(fn) { titleImpl = fn; }, setForkHook(fn) { forkHook = fn; }, failNative(value) { nativeFailure = value; }, failFlush(value) { flushFailure = value; }, removeWorkspace() { configured = false; },
      async close() { await actions.stop(); await recorder.dispose(); await actions.dispose(); for (const s of live.values()) await s.dispose(); await nativeHandle.dispose(); await root.fiber.dispose(); }
    };
  }
  test('scoped Cordis menu metadata uses declared services without remote or native execution', async () => {
    const f = await fixture({ scopedContext: true });
    try {
      const before = f.native.snapshotEvents();
      for (let count = 0; count < 2; count++) {
        const result = await f.actions.api.sessionActions({ sessionId: f.native.id });
        assert.equal(result.ok, true); assert.equal(result.title, 'Source title'); assert.equal(result.pinned, true); assert.equal(result.canFork, true);
      }
      assert.deepEqual(f.native.snapshotEvents(), before);
      assert.equal(f.calls.resume, 0); assert.equal(f.calls.fork, 0); assert.equal(f.calls.title.length, 0); assert.equal(f.modelCalls(), 0);
    } finally { await f.close(); }
  });
  test('scoped Cordis cold menu reads persisted titles without loading a native Agent', async () => {
    const f = await fixture({ scopedContext: true });
    try {
      await f.unloadNative();
      const result = await f.actions.api.sessionActions({ sessionId: f.native.id });
      assert.equal(result.ok, true); assert.equal(result.title, 'Source title');
      assert.equal(f.root.sessions.get(f.native.id), undefined); assert.equal(f.root.agents.get(f.native.id), undefined);
      assert.equal(f.calls.resume, 0); assert.equal(f.calls.fork, 0); assert.equal(f.calls.title.length, 0); assert.equal(f.modelCalls(), 0);
    } finally { await f.close(); }
  });
  test('scoped Cordis rename accepts the canonical title and pin remains native', async () => {
    const f = await fixture({ scopedContext: true });
    try {
      f.setTitle(async (_id, title) => ({ ok: true, title: title.toUpperCase() }));
      const result = await f.actions.api.sessionRename({ sessionId: f.native.id, title: 'normalized' });
      assert.equal(result.titleSync.status, 'synced'); assert.equal(result.title, 'NORMALIZED'); assert.equal(f.root.sessionTitle.get(f.native).title, 'NORMALIZED');
      await f.actions.api.sessionPin({ sessionId: f.native.id, pinned: false });
      assert.equal((await f.actions.api.sessionActions({ sessionId: f.native.id })).pinned, false); assert.equal(f.modelCalls(), 0);
    } finally { await f.close(); }
  });
  test('scoped Cordis fork can observe history and create its native child', async () => {
    const f = await fixture({ scopedContext: true });
    try {
      const prefix = f.native.snapshotEvents();
      const result = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'scoped-fork' });
      assert.equal(result.ok, true); assert.equal(result.operation.phase, 'completed');
      const child = f.root.sessions.get(result.sessionId); assert.ok(child);
      assert.deepEqual(child.snapshotEvents(), buildForkSeed(prefix, prefix.length - 1));
      assert.equal(f.calls.fork, 1); assert.equal(f.modelCalls(), 0);
    } finally { await f.close(); }
  });
  test('native title normalization, pin state, metadata-only status and real fork seed/container', async () => {
    const f = await fixture();
    try {
      const before = f.native.snapshotEvents();
      const status = await f.actions.api.sessionActions({ sessionId: f.native.id });
      assert.equal(status.title, 'Source title'); assert.equal(status.pinned, true); assert.equal(status.canFork, true); assert.equal(f.calls.resume, 0); assert.equal(f.calls.fork, 0);
      await f.actions.api.sessionPin({ sessionId: f.native.id, pinned: false }); assert.deepEqual(f.root.workspaceRegistry.pinnedSessionIds, []);
      await f.actions.api.sessionPin({ sessionId: f.native.id, pinned: true });
      const renamed = await f.actions.api.sessionRename({ sessionId: f.native.id, title: '  New\n title  ' });
      assert.equal(renamed.title, 'New title'); assert.equal(renamed.titleSync.status, 'synced'); assert.deepEqual(f.calls.title, [['source-acp', 'New title']]);
      const sourceEvents = f.native.snapshotEvents();
      const result = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'op-one' });
      const child = f.root.sessions.get(result.sessionId);
      assert.ok(child); assert.deepEqual(child.snapshotEvents(), buildForkSeed(sourceEvents, sourceEvents.length - 1));
      assert.equal(child.header.isSeeded, true); assert.equal(child.header.parentSession, undefined); assert.equal(child.header.agentPreset, 'fixture-preset');
      assert.equal(child.inheritedEventCount, sourceEvents.length); assert.equal(f.workspace.sessionIds.includes(child.id), true);
      assert.deepEqual(f.root.workspaceRegistry.pinnedSessionIds, [f.native.id]); assert.deepEqual(f.native.snapshotEvents(), sourceEvents);
      assert.ok(f.actions.approvedFork(child.id)); assert.equal(f.calls.fork, 1); assert.equal(f.modelCalls(), 0);
      const again = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'op-one' }); assert.equal(again.sessionId, child.id); assert.equal(f.calls.fork, 1);
      assert.ok(before.length > 0);
    } finally { await f.close(); }
  });
  test('remote rename failure preserves native title and survives ledger reload', async () => {
    const f = await fixture();
    try {
      f.setTitle(async () => { throw Object.assign(Error('remote unavailable'), { code: 'offline' }); });
      const result = await f.actions.api.sessionRename({ sessionId: f.native.id, title: 'Native kept' });
      assert.equal(result.nativeCommitted, true); assert.equal(result.title, 'Native kept'); assert.equal(result.titleSync.status, 'failed');
      const stored = JSON.parse(await readFile(join(f.directory, 'session-actions.json'), 'utf8'));
      assert.equal(stored.titles[f.native.id].status, 'failed'); assert.equal(stored.titles[f.native.id].error.code, 'offline');
    } finally { await f.close(); }
  });
  test('ambiguous remote title outcome remains unknown and survives reload', async () => {
    const f = await fixture();
    try {
      f.setTitle(async () => { throw Object.assign(Error('reply timed out after submission'), { code: 'timeout', titleStatus: { outcome: 'unknown', timeout: true } }); });
      const result = await f.actions.api.sessionRename({ sessionId: f.native.id, title: 'Possibly remote' });
      assert.equal(result.titleSync.status, 'unknown'); assert.equal(result.titleSync.mayHaveChangedRemote, true);
      assert.equal(f.root.sessionTitle.get(f.native).title, 'Possibly remote');
      await f.restartActions();
      assert.equal((await f.actions.api.sessionActions({ sessionId: f.native.id })).titleSync.status, 'unknown');
    } finally { await f.close(); }
  });
  test('sidebar rename queues revisions and stale remote replies cannot overwrite newer native title', async () => {
    const f = await fixture(); const first = deferred(), entered = deferred();
    try {
      f.setTitle(async (_id, title) => { if (title === 'older') { entered.resolve(); await first.promise; return { title: 'OLD CANONICAL' }; } return { title: 'NEW CANONICAL' }; });
      const rename = f.actions.api.sessionRename({ sessionId: f.native.id, title: 'older' }); await entered.promise;
      f.root.sessionTitle.rename(f.native, 'newer'); first.resolve(); await rename;
      // Await the existing action queue without timing guesses or polling.
      await f.actions.stop();
      assert.equal(f.root.sessionTitle.get(f.native).title, 'NEW CANONICAL'); assert.deepEqual(f.calls.title.map(v => v[1]), ['older', 'newer']);
    } finally { first.resolve(); await f.close(); }
  });
  test('native failure after remote creation recovers the same child without repeating remote RPC', async () => {
    const f = await fixture();
    try {
      f.failNative(Object.assign(Error('injected create failure'), { code: 'native_create_failed' }));
      await assert.rejects(f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'recover-op' }), e => e.code === 'native_create_failed' && e.details.remoteCreated === true);
      assert.equal(f.calls.fork, 1);
      const ledger = JSON.parse(await readFile(join(f.directory, 'session-actions.json'), 'utf8')).forks['recover-op'];
      assert.equal(ledger.phase, 'bound'); assert.ok(ledger.childId); assert.ok(ledger.nativePrefixHash); assert.equal(JSON.stringify(ledger).includes('real remote prompt'), false);
      f.failNative(null); await f.restartActions();
      const recovered = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'recover-op' });
      assert.equal(recovered.sessionId, ledger.childDshSessionId); assert.equal(recovered.operation.phase, 'completed'); assert.equal(f.calls.fork, 1); assert.equal(f.modelCalls(), 0);
    } finally { await f.close(); }
  });
  test('fork binding preserves a live Plan/model change over stale acceptEdits defaults and cold recovery', async () => {
    const f = await fixture({ initialPermission: 'acceptEdits' });
    try {
      assert.equal((await f.bindings.get(f.native.id)).backend.permission, 'acceptEdits');
      await f.source.setMode('plan'); f.source.config.model = 'fixture-live-model';
      f.failNative(Object.assign(Error('fixture native failure'), { code: 'native_create_failed' }));
      await assert.rejects(f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'plan-recovery' }), { code: 'native_create_failed' });
      const op = f.actions.store.fork('plan-recovery'), child = f.live.get(op.childId);
      assert.equal(child.state().permission, 'plan');
      await child.dispose(); f.live.delete(child.id);
      f.failNative(null); await f.restartActions();
      const result = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'plan-recovery' });
      assert.equal(f.calls.fork, 1); assert.equal(f.calls.resume, 0);
      const selected = await new BackendBindings(join(f.directory, 'bindings.json')).get(result.sessionId);
      assert.equal(selected.backend.permission, 'plan'); assert.equal(selected.backend.modeId, 'plan'); assert.equal(selected.backend.model, 'fixture-live-model');
      const { runtimeOptions } = await import('../lib/workspace-backend.js');
      const resume = runtimeOptions({ remote: true, sessionId: result.sessionId, backend: selected.backend, cwd: selected.cwd, remoteCwd: selected.configuredRemotePath, workspace: { id: selected.workspaceId } }, { id: selected.profileId });
      const resumed = await f.runtime.resume(op.childId, resume);
      assert.equal(f.calls.resumeOptions.at(-1).permission, 'plan'); assert.equal(f.calls.resumeOptions.at(-1).model, 'fixture-live-model');
      assert.equal(resumed.state().permission, 'plan'); assert.equal(resumed.state().config.mode, 'plan'); assert.equal(resumed.state().config.model, 'fixture-live-model');
    } finally { await f.close(); }
  });
  test('production fork path reads event prefixes only through SessionQuery observations', async () => {
    const source = await readFile(new URL('../lib/session-actions.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /snapshotEvents\s*\(/); assert.match(source, /sessionQuery\.observeSession/);
  });
  test('actual AgentFactory publication veto rolls back and recovers its persisted native seed', async () => {
    const f = await fixture();
    const off = f.root.on('session/created', session => { if (session.id !== f.native.id) throw Object.assign(Error('fixture veto'), { code: 'native_veto' }); });
    try {
      await assert.rejects(f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'veto-op' }), { code: 'native_veto' });
      const op = f.actions.store.fork('veto-op'); assert.equal(f.root.sessions.get(op.childDshSessionId), undefined);
      assert.ok(await f.root.sessionPersistence.stat(op.childDshSessionId)); off();
      const result = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'veto-op' });
      assert.equal(result.sessionId, op.childDshSessionId); assert.equal(f.calls.fork, 1); assert.equal(f.calls.nativeCreated, 1); assert.equal(f.modelCalls(), 0);
    } finally { off(); await f.close(); }
  });
  test('native flush failure keeps one child and retry completes attach without another create', async () => {
    const f = await fixture();
    try {
      f.failFlush(Object.assign(Error('fixture flush'), { code: 'flush_failed' }));
      await assert.rejects(f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'flush-op' }), { code: 'flush_failed' });
      const op = f.actions.store.fork('flush-op'); assert.equal(op.phase, 'nativeCreated'); assert.ok(f.root.sessions.get(op.childDshSessionId));
      f.failFlush(null);
      await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'flush-op' });
      assert.equal(f.calls.fork, 1); assert.equal(f.calls.nativeCreated, 1); assert.equal(f.workspace.sessionIds.includes(op.childDshSessionId), true);
    } finally { await f.close(); }
    assert.equal(f.calls.nativeDisposed, 1);
  });
  test('cold remote source is resumed only by explicit fork, never metadata lookup', async () => {
    const f = await fixture();
    try {
      f.saved.set(f.source.id, f.source.state()); await f.source.dispose(); f.live.delete(f.source.id);
      await f.actions.api.sessionActions({ sessionId: f.native.id }); assert.equal(f.calls.resume, 0);
      const result = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'cold-op' });
      assert.ok(result.sessionId); assert.equal(f.calls.resume, 1); assert.equal(f.calls.fork, 1); assert.equal(f.modelCalls(), 0);
    } finally { await f.close(); }
  });
  test('workspace removed during remote fork prevents native publication and retains recovery', async () => {
    const f = await fixture();
    try {
      f.setForkHook(async () => f.removeWorkspace());
      await assert.rejects(f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'removed-op' }), e => e.code === 'workspace_removed' && e.details.remoteCreated);
      assert.equal(f.calls.fork, 1); assert.equal(f.calls.nativeCreated, 0);
      const op = f.actions.store.fork('removed-op'); assert.ok(op.childId); assert.equal(f.root.sessions.get(op.childDshSessionId), undefined);
    } finally { await f.close(); }
  });
  test('native remote fork gate rejects inherited shell while ordinary local seeded sessions remain legal', async () => {
    const f = await fixture();
    try {
      const events = f.native.snapshotEvents();
      assert.throws(() => f.root.sessions.create('forbidden-shell', { meta: { cwd: f.native.header.cwd, isSeeded: true }, seed: buildForkSeed(events, events.length - 1), inheritedEventCount: events.length }), { code: 'remote_fork_required' });
      assert.equal(f.root.sessions.get('forbidden-shell'), undefined);
      const local = f.root.sessions.create('ordinary-local', { meta: { cwd: f.directory, isSeeded: true }, seed: buildForkSeed([events[0]], 0), inheritedEventCount: 1 }); assert.equal(local.id, 'ordinary-local');
    } finally { await f.close(); }
  });
  test('fork-of-fork carries ancestor proof and does not inherit parent pin', async () => {
    const f = await fixture();
    try {
      const one = await f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'first-fork' });
      const parent = f.root.sessions.get(one.sessionId); const prefix = parent.snapshotEvents();
      await f.root.workspaceRegistry.pinSession(parent.id);
      const two = await f.actions.api.sessionFork({ sessionId: parent.id, operationId: 'second-fork' });
      const child = f.root.sessions.get(two.sessionId);
      assert.deepEqual(child.snapshotEvents(), buildForkSeed(prefix, prefix.length - 1));
      assert.equal(f.actions.approvedFork(child.id).ancestors[0].sourceDshSessionId, f.native.id);
      assert.equal(f.root.workspaceRegistry.pinnedSessionIds.includes(child.id), false); assert.equal(f.modelCalls(), 0);
    } finally { await f.close(); }
  });
  test('corrupt operation and binding caches do not veto ordinary local seeded restoration', async () => {
    const f = await fixture();
    try {
      await writeFile(join(f.directory, 'session-actions.json'), '{invalid');
      await writeFile(join(f.directory, 'bindings.json'), '{invalid');
      await f.restartActions();
      const seed = buildForkSeed([f.native.snapshotEvents()[0]], 0);
      const local = f.root.sessions.create('local-restoration', { meta: { cwd: f.directory, isSeeded: true }, seed, inheritedEventCount: 1 });
      assert.equal(local.id, 'local-restoration');
      assert.equal((await f.actions.api.sessionActions({ sessionId: f.native.id })).canFork, false);
      assert.equal(await readFile(join(f.directory, 'session-actions.json'), 'utf8'), '{invalid');
    } finally { await f.close(); }
  });
  test('Host stop during remote fork preserves the committed child without native publication', async () => {
    const f = await fixture(); const response = deferred(), entered = deferred();
    try {
      f.setForkHook(async () => { entered.resolve(); await response.promise; });
      const fork = f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'stop-op' });
      await entered.promise; const stop = f.actions.stop(); response.resolve();
      await assert.rejects(fork, e => e.code === 'host_stopped' && e.details.remoteCreated); await stop;
      assert.equal(f.calls.nativeCreated, 0); assert.ok(f.actions.store.fork('stop-op').childId);
    } finally { response.resolve(); await f.close(); }
  });
  test('title metadata stream snapshots interrupted work and publishes native sidebar failures only after persistence', async () => {
    const f = await fixture(); const activeStreams = new Set(); const req = new EventEmitter(), res = streamResponse();
    try {
      const { createSessionActionEventStream } = await import('../lib/index.js');
      await f.actions.store.saveTitle(f.native.id, { title: 'interrupted', revision: 0, status: 'pending', updatedAt: 1 });
      assert.equal((await f.actions.api.sessionActions({ sessionId: f.native.id })).titleSync.status, 'unknown');
      const final = deferred();
      const off = f.actions.subscribeTitleSync(event => {
        assert.equal(f.actions.store.title(event.sessionId).status, event.status);
        if (event.status === 'failed') final.resolve(event);
      });
      const offBroken = f.actions.subscribeTitleSync(() => { throw Error('fixture disconnected subscriber'); });
      const stream = createSessionActionEventStream({ sessionActions: f.actions, activeStreams });
      stream(req, res, () => true);
      assert.equal(res.frames[0].snapshot, true); assert.equal(res.frames[0].status, 'unknown'); assert.equal(res.frames[0].mayHaveChangedRemote, true);
      assert.equal(f.actions.store.title(f.native.id).status, 'pending'); assert.equal(f.calls.title.length, 0);
      f.setTitle(async () => { throw Object.assign(Error('sidebar remote failure'), { code: 'offline' }); });
      f.root.sessionTitle.rename(f.native, 'Sidebar title');
      const event = await final.promise;
      assert.equal(event.snapshot, undefined); assert.equal(event.title, 'Sidebar title');
      assert.deepEqual(res.frames.slice(1).map(frame => frame.status), ['pending', 'failed']);
      assert.equal(res.frames[2].error.message, 'sidebar remote failure');
      assert.equal(f.root.sessionTitle.get(f.native).title, 'Sidebar title'); assert.equal(f.modelCalls(), 0);
      res.emit('close'); assert.equal(activeStreams.size, 0); assert.equal(req.listenerCount('aborted'), 0); assert.equal(res.listenerCount('close'), 0);
      off(); offBroken();
      const count = res.frames.length; await f.actions.api.sessionRename({ sessionId: f.native.id, title: 'After disconnect' }); assert.equal(res.frames.length, count);
    } finally { for (const close of [...activeStreams]) close(); await f.close(); }
  });
  test('title stream rechecks actual policy per frame and closes on revocation or backpressure', async () => {
    const f = await fixture(); const activeStreams = new Set();
    try {
      const { createSessionActionEventStream } = await import('../lib/index.js');
      const { RemoteAccessService } = await import('@deepseek-ai/dsh-api-remote-access'); await f.root.plugin(RemoteAccessService);
      let principal = { kind: 'owner' }; const checked = [];
      const permitted = sessionId => {
        checked.push(sessionId);
        return f.root.remoteAccess.decide({ principal, action: 'remoteSsh/sessionActionEvents', resources: [{ kind: 'global' }], args: {} }).kind === 'allow'
          && (!sessionId || f.root.remoteAccess.decide({ principal, action: 'remoteSsh/sessionActionEvents', resources: [{ kind: 'session', id: sessionId }], args: {} }).kind === 'allow');
      };
      const stream = createSessionActionEventStream({ sessionActions: f.actions, activeStreams });
      const req = new EventEmitter(), res = streamResponse(); stream(req, res, permitted); assert.equal(res.flushed, true);
      principal = { kind: 'revoked-fixture' };
      await f.actions.api.sessionRename({ sessionId: f.native.id, title: 'Revoked stream' });
      assert.equal(res.writableEnded, true); assert.equal(res.frames.length, 0); assert.equal(activeStreams.size, 0); assert.ok(checked.includes(f.native.id));
      principal = { kind: 'owner' };
      const slow = streamResponse({ backpressure: true }); stream(new EventEmitter(), slow, permitted);
      await f.actions.api.sessionRename({ sessionId: f.native.id, title: 'Slow stream' });
      assert.equal(slow.writableEnded, true); assert.equal(slow.frames.length, 1); assert.equal(activeStreams.size, 0);
    } finally { for (const close of [...activeStreams]) close(); await f.close(); }
  });
  test('metadata stream closes before pending title work drains during Host-style stop', async () => {
    const f = await fixture(); const activeStreams = new Set(), entered = deferred(), response = deferred(); let disposed = false;
    try {
      const { createSessionActionEventStream } = await import('../lib/index.js');
      const stream = createSessionActionEventStream({ sessionActions: f.actions, activeStreams, isDisposed: () => disposed });
      const req = new EventEmitter(), res = streamResponse(); stream(req, res, () => true);
      f.setTitle(async () => { entered.resolve(); await response.promise; throw Object.assign(Error('lost reply'), { titleStatus: { outcome: 'unknown' } }); });
      const rename = f.actions.api.sessionRename({ sessionId: f.native.id, title: 'Before stop' }); await entered.promise;
      assert.equal(res.frames.at(-1).status, 'pending'); disposed = true;
      for (const close of [...activeStreams]) close(); const stop = f.actions.stop();
      assert.equal(res.writableEnded, true); assert.equal(activeStreams.size, 0);
      response.resolve(); await rename; await stop;
      assert.equal(res.frames.length, 1); assert.equal(f.actions.store.title(f.native.id).status, 'unknown');
      f.root.sessionTitle.rename(f.native, 'Native still usable'); assert.equal(f.root.sessionTitle.get(f.native).title, 'Native still usable');
    } finally { response.resolve(); for (const close of [...activeStreams]) close(); await f.close(); }
  });
  test('all new v3 HTTP actions reject non-owner peers before mutation and expose no mutating tools', async () => {
    const { RemoteAccessService } = await import('@deepseek-ai/dsh-api-remote-access');
    const hostModule = await import('../lib/index.js'); const { HTTP_BASE } = await import('../lib/protocol.js');
    const root = new Context(), routes = [], tools = []; let principal = { kind: 'read-only-fixture' };
    const directory = await mkdtemp(join(tmpdir(), 'remote-actions-auth-'));
    try {
      await root.plugin(SessionStore); await root.plugin(SessionProjectionRegistry); await root.plugin(RemoteAccessService);
      root.provide('profileContext', { dir: directory }); root.provide('attachments', { admitPromptContent: async parts => parts });
      root.provide('sessionController', {}); root.provide('workspaceRegistry', { archivedSessionIds: [] });
      // Auth-only fixture: satisfy activation but fail if denied requests reach a service.
      const denied = () => { throw Error('Unauthorized request reached Session services'); };
      for (const service of ['sessionTitle', 'sessionQuery', 'agents']) root.provide(service, { get: denied, rename: denied, inspectSession: denied, observeSession: denied, create: denied });
      root.provide('configEditor', { edit() { throw Error('Unauthorized mutation'); } });
      root.provide('tools', { register: tool => { tools.push(tool); return () => {}; } });
      root.provide('connection', { admit: () => ({ peer: { principal } }) });
      root.provide('webServer', { register: route => { routes.push(route); return () => {}; } });
      await root.plugin(hostModule, {});
      const route = routes.find(r => r.path === HTTP_BASE + '/api'); assert.ok(route);
      for (const method of ['sessionActions', 'sessionRename', 'sessionPin', 'sessionFork', 'sessionActionEvents']) {
        const request = Readable.from([Buffer.from(JSON.stringify({ sessionId: 'fixture', title: 'no', pinned: true, operationId: 'no' }))]);
        request.method = 'POST'; request.url = HTTP_BASE + '/api/' + method; request.headers = { 'x-requested-with': 'XMLHttpRequest' };
        let status, payload;
        const response = { headersSent: false, writeHead(code) { status = code; this.headersSent = true; }, end(value) { payload = JSON.parse(value); } };
        await route.handler(request, response); assert.equal(status, 403); assert.equal(payload.error.code, 'remote_access_denied');
      }
      assert.deepEqual(tools.map(t => t.name), ['remote_session_status']);
      principal = { kind: 'owner' };
      const request = Readable.from([Buffer.from('{}')]); request.method = 'POST'; request.url = HTTP_BASE + '/api/sessionActionEvents'; request.headers = { 'x-requested-with': 'XMLHttpRequest' };
      const response = streamResponse(); await route.handler(request, response);
      assert.equal(response.status, 200); assert.match(response.headers['content-type'], /application\/x-ndjson/); assert.equal(response.flushed, true); assert.deepEqual(response.frames, []);
      // Actual Host teardown closes the metadata stream without native Agent execution.
      await root.fiber.dispose(); assert.equal(response.writableEnded, true); assert.equal(request.listenerCount('aborted'), 0);
    } finally { await root.fiber.dispose(); }
  });
  test('archived source rejects without resume or fork', async () => {
    const f = await fixture();
    try {
      await f.root.workspaceRegistry.archiveSession(f.native.id);
      await assert.rejects(f.actions.api.sessionFork({ sessionId: f.native.id, operationId: 'archived-op' }), { code: 'session_archived' });
      assert.equal(f.calls.fork, 0); assert.equal(f.calls.resume, 0);
    } finally { await f.close(); }
  });
}
