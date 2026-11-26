import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { HTTP_BASE } from '../lib/protocol.js';
const installed = !!process.versions.electron && !!process.env.DSH_INSTALL_DIR;
if (installed) registerHooks({ resolve(specifier, context, next) {
  return next(specifier, specifier.startsWith('@deepseek-ai/') || specifier === 'zod' ? { ...context, parentURL: pathToFileURL(process.env.DSH_INSTALL_DIR + '/package.json').href } : context);
} });
const modules = installed ? await Promise.all([
  import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-session'), import('@deepseek-ai/dsh-fs-local'),
  import('../lib/config.js'), import('../lib/index.js'), import('../lib/bindings.js'), import('../lib/workspace-backend.js'), import('../lib/files.js'), import('../lib/ssh.js')
]) : [];
const [cordis, sessionModule, fsModule, configModule, hostModule, bindingModule, backendModule, filesModule, sshModule] = modules;
const projectionModule = installed ? await import('@deepseek-ai/dsh-session-projection') : null;
const acpModule = installed ? await import('../lib/acp.js') : null;
const installedRequire = installed ? createRequire(join(process.env.DSH_INSTALL_DIR, 'package.json')) : null;
const nativeListModule = installed ? await import(pathToFileURL(join(dirname(installedRequire.resolve('@deepseek-ai/dsh-api-session-controller/package.json')), 'lib/types/list.js')).href) : null;
async function nativeProjections(root) {
  await root.plugin(projectionModule.SessionProjectionRegistry);
  const list = new nativeListModule.ApiSessionList({ sessionProjections: root.sessionProjections,
    agents: { get: () => undefined }, attachments: { imageLimits: { maxImageBytes: 1024, maxImagesPerMessage: 1, maxMessageImageBytes: 1024, maxImagePixels: 1, maxImageDimension: 1, mediaTypes: ['image/png'] } }, logger: root.logger }, 5);
  await list.initialize(); return list;
}
const local = async () => mkdtemp(join(tmpdir(), 'modern-remote-host-'));
const profile = { id: 'p1', name: 'fixture', host: 'example.invalid', user: 'fixture', port: 22, authMethod: 'key', keyPath: '', proxyJump: '', remoteRoot: '~' };

function runtimeFixture() {
  const live = new Map(), saved = new Map(); const calls = { create: 0, shutdown: 0, probe: 0, prepare: 0, list: 0 };
  const runtime = {
    store: { get: id => saved.get(id) }, get: id => live.get(id), findActive: sid => [...live.values()].find(s => s.dshSessionId === sid),
    list: args => { calls.list++; return [...saved.values()].filter(s => !args?.dshSessionId || s.dshSessionId === args.dshSessionId); },
    preparationPlan: () => ({ nodeRequirement: '>=22', packages: ['@agentclientprotocol/sdk@2.9.1'], payload: { runtimeDir: '~/.local/share/dsh-remote-acp/v1' } }),
    probeRemote: async () => { calls.probe++; return { cwd: '/remote/repo', ok: true }; },
    prepareRemote: async (_args, confirmation) => { assert.equal(confirmation.confirmed, true); calls.prepare++; return { ok: true }; },
    create: async options => {
      calls.create++;
      const controller = { ready: Promise.resolve({ sessionId: 'remote-' + calls.create, protocolCwd: '/remote/repo', initialize: { agentCapabilities: {} }, sessionResponse: { modes: { currentModeId: 'plan', availableModes: [{ id: 'plan' }, { id: 'acceptEdits' }] } } }), setMode: async () => ({}), prompt: async () => ({ stopReason: 'end_turn' }), cancel: async () => true, dispose: async () => {}, close: async () => {} };
      const session = new acpModule.AcpSession({ ...options, id: 'a' + calls.create, connectImpl: () => controller });
      await session.start(); live.set(session.id, session); saved.set(session.id, session.state()); return session;
    },
    close: async (id, args = {}) => {
      const session = live.get(id); if (session) await session.close();
      const state = session?.state() || saved.get(id);
      assert.equal(args.preserveHistory, true);
      saved.set(id, { ...state, status: 'closed', closedAt: Date.now(), resumable: false }); live.delete(id);
      return { ok: true, closed: true, removed: false, historyPreserved: true, dshSessionId: state.dshSessionId };
    },
    shutdownSession: async id => { await live.get(id)?.dispose(); live.delete(id); }, shutdown: async () => { calls.shutdown++; for (const session of live.values()) await session.dispose(); live.clear(); },
    events: () => ({ events: [], cursor: { generation: 'g', seq: 0 }, reset: false, hasMore: false })
  };
  return { runtime, calls };
}
async function fixture({ workspaceBackend = 'claude', blank = true } = {}) {
  const directory = await local(); const mirror = join(directory, 'mirror'); await mkdir(mirror);
  const root = new cordis.Context(); await root.plugin(sessionModule.SessionStore);
  const list = await nativeProjections(root);
  await root.plugin(fsModule.LocalFileSystem, { cwd: directory });
  const raw = { schemaVersion: 3, profiles: [profile], workspacesV3: [{ id: 'w1', profileId: 'p1', title: 'remote', remotePath: '/remote/repo', mirrorPath: mirror, shellWorkspaceId: 'native-w1', backend: { type: workspaceBackend, permission: 'plan' } }] };
  const config = configModule.Config(raw);
  let writes = 0;
  const { runtime, calls } = runtimeFixture();
  root.provide('profileContext', { dir: directory });
  root.provide('attachments', { admitPromptContent: async parts => parts });
  root.provide('sessionController', { resolveAgent: async id => ({ agent: { session: root.sessions.get(id) } }) });
  root.provide('workspaceRegistry', { archivedSessionIds: [], get: () => null, create: async (path, title) => ({ id: 'new-native', path: await realpath(path), title, setTitle: async () => {} }), delete: async () => true });
  root.provide('configEditor', { edit: async (_entry, change) => {
    writes++; const next = change(raw); Object.assign(raw, next);
    const refs = configModule.Config(next); for (const key of Object.keys(refs)) config[key] = refs[key];
  } });
  const pluginContext = root.extend({ fiber: Object.assign(Object.create(root.fiber), { entry: { id: 'offline-entry' } }) });
  const host = await hostModule.createHost(pluginContext, config, { runtimeFactory: () => runtime, sshFactory: () => ({ run: async () => { throw Error('Unexpected SSH'); }, shutdown() {} }) });
  return { directory, mirror, root, list, raw, config, host, runtime, calls, writes: () => writes, async close() { await host.dispose(); await root.fiber.dispose(); } };
}

if (!installed) {
  test('modern Host contracts execute against the installed DSH runtime', () => {
    assert.ok(process.env.DSH_NODE_EXECUTABLE, 'DSH_NODE_EXECUTABLE is required');
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.env.DSH_NODE_EXECUTABLE, [fileURLToPath(import.meta.url)], { env, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /tests [1-9][0-9]*/); process.stdout.write(result.stdout);
  });
} else {
test('explicit close requires original identity and confirmation, retains history, and reopens without remote execution', async () => {
  const f = await fixture();
  try {
    const native = f.root.sessions.create('close-fixture', { meta: { cwd: f.mirror } });
    await f.host.api.selectSessionBackend({ sessionId: native.id, backend: { type: 'claude', permission: 'plan' } });
    const started = await f.host.api.acpStart({ dshSessionId: native.id });
    const args = { id: started.session.id, dshSessionId: native.id, confirm: true };
    await assert.rejects(f.host.api.acpClose({ ...args, confirm: false }), { code: 'confirmation_required' });
    await assert.rejects(f.host.api.acpClose({ ...args, dshSessionId: 'other' }), { code: 'binding_mismatch' });
    await assert.rejects(f.host.api.acpClose({ ...args, sessionId: 'other' }), { code: 'binding_mismatch' });
    const close = f.runtime.close;
    f.runtime.close = async () => { throw Object.assign(new Error('unconfirmed remote owner'), { code: 'remote_broker_lost' }); };
    await assert.rejects(f.host.api.acpClose(args), { code: 'remote_broker_lost' });
    assert.equal(f.runtime.get(args.id).alive, true); assert.ok(f.runtime.store.get(args.id));
    f.runtime.close = close;
    const ended = await f.host.api.acpClose(args);
    assert.equal(ended.session.status, 'closed'); assert.equal(ended.historyPreserved, true); assert.equal(f.writes(), 0);
    const before = { create: f.calls.create, probe: f.calls.probe };
    f.root.workspaceRegistry.archivedSessionIds.push(native.id);
    assert.equal((await f.host.api.acpResume(args)).session.status, 'closed');
    assert.equal((await f.host.api.acpStart({ dshSessionId: native.id })).session.status, 'closed');
    assert.equal((await f.host.api.acpEvents(args)).ok, true);
    assert.deepEqual({ create: f.calls.create, probe: f.calls.probe }, before);
    await assert.rejects(f.host.api.acpSetMode({ ...args, modeId: 'plan' }), { code: 'session_closed' });
    assert.equal((await f.host.api.sessionBackend({ sessionId: native.id })).backend.type, 'claude');
  } finally { await f.close(); }
});
test('modern Config consists only of current volatile fields', { skip: !installed }, () => {
  const value = configModule.Config({});
  assert.deepEqual(Object.keys(value).sort(), ['preventHostSleep', 'profiles', 'schemaVersion', 'workspacesV3']);
  for (const reference of Object.values(value)) assert.equal(typeof reference.get, 'function');
  assert.equal(value.schemaVersion.get(), 3); assert.deepEqual(value.workspacesV3.get(), []); assert.equal(value.preventHostSleep.get(), true);
});
test('Host sleep preference defaults on and persists through the public settings API', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    assert.equal((await f.host.api.getHostPreferences({})).preventHostSleep, true);
    assert.equal((await f.host.api.saveHostPreferences({ preventHostSleep: false })).preventHostSleep, false);
    assert.equal(f.raw.preventHostSleep, false);
    assert.equal((await f.host.api.getHostPreferences({})).preventHostSleep, false);
    await assert.rejects(f.host.api.saveHostPreferences({ preventHostSleep: 'no' }), { code: 'invalid_preference' });
  } finally { await f.close(); }
});
test('existing connection targets are immutable and deleted ids cannot be reused', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    for (const patch of [{ host: 'other.invalid' }, { user: 'other-user' }, { port: 2222 }, { proxyJump: 'other-jump' }]) {
      await assert.rejects(f.host.api.saveProfile({ ...profile, ...patch }), { code: 'profile_target_immutable' });
    }
    await assert.rejects(f.host.api.saveProfile({ ...profile, id: 'unknown-id' }), { code: 'profile_not_found' });
    await assert.rejects(f.host.api.saveProfile({ ...profile, id: '' }), { code: 'profile_not_found' });
    assert.equal(f.writes(), 0); assert.equal(f.calls.probe, 0); assert.equal(f.calls.create, 0);
    await f.host.api.saveProfile({ id: 'p1', name: 'renamed', remoteRoot: '~/different', keyPath: '/fixture/key', authMethod: 'kerberos' });
    assert.equal(f.writes(), 1); assert.equal(f.raw.profiles[0].host, profile.host);
    const { id: _ignored, ...newInput } = profile;
    const created = await f.host.api.saveProfile(newInput); assert.notEqual(created.id, 'p1');
    await f.host.api.deleteProfile({ id: created.id }); const writes = f.writes();
    await assert.rejects(f.host.api.saveProfile({ ...profile, id: created.id }), { code: 'profile_not_found' });
    assert.equal(f.writes(), writes); assert.equal(f.calls.probe, 0); assert.equal(f.calls.create, 0);
  } finally { await f.close(); }
});
test('remote workspaces omit backend and reject workspace-level selection without side effects', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    assert.equal(configModule.normalizeBackend().type, 'dsh');
    assert.equal(configModule.normalizeRemoteBackend().type, 'claude');
    assert.throws(() => configModule.Config({ ...f.raw, workspacesV3: [{ ...f.raw.workspacesV3[0], backend: { type: 'dsh' } }] }));
    await assert.rejects(f.host.api.createRemoteWorkspace({ profileId: 'p1', remotePath: '/remote/no-dsh', backend: { type: 'dsh' } }), { code: 'workspace_backend_unsupported' });
    await assert.rejects(f.host.api.updateWorkspace({ id: 'w1', backend: { type: 'dsh' } }), { code: 'workspace_backend_unsupported' });
    assert.equal(f.writes(), 0); assert.equal(f.calls.probe, 0); assert.equal(f.calls.create, 0);
    const created = await f.host.api.createRemoteWorkspace({ profileId: 'p1', remotePath: '/remote/default' });
    assert.equal(Object.hasOwn(created.workspace, 'backend'), false);
    assert.equal(Object.hasOwn(f.config.workspacesV3.get().find(w => w.id === created.workspace.id), 'backend'), false);
    const reused = await f.host.api.createRemoteWorkspace({ profileId: 'p1', remotePath: '/remote/repo' });
    assert.equal(reused.mirrorPath, await realpath(f.mirror));
    assert.equal(reused.workspace.mirrorPath, reused.mirrorPath);
  } finally { await f.close(); }
});
test('real native LocalFileSystem remains unchanged after Host construction and disposal', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const fs = f.root.fs; const names = ['resolve', 'readText', 'writeText', 'stat', 'lstat', 'editText'];
    for (const name of names) assert.equal(Object.hasOwn(fs, name), false);
    const target = await fs.resolve(join(f.directory, 'native.txt'));
    const result = await fs.writeText(target, 'native'); assert.equal(result.after, 'native');
    assert.equal(await fs.readText(target), 'native'); assert.equal((await fs.stat(target)).size, 6);
    await f.host.dispose();
    for (const name of names) assert.equal(Object.hasOwn(fs, name), false);
    await fs.writeText(target, 'after'); assert.equal(await fs.readText(target), 'after');
  } finally { await f.close(); }
});
test('local Session resolution never touches ACP store or unrelated broken roots', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const file = join(f.directory, 'not-directory'); await writeFile(file, 'fixture');
    f.config.workspacesV3 = { get: () => [{ mirrorPath: join(file, 'child') }] };
    const session = f.root.sessions.create('local-fixture', { meta: { cwd: f.directory } });
    f.runtime.list = () => { throw Error('ACP store must not be read'); };
    const value = await f.host.api.sessionBackend({ sessionId: session.id });
    assert.equal(value.remote, false); assert.equal(value.backend.type, 'dsh');
  } finally { await f.close(); }
});
test('blank Sessions require explicit selection and never inherit legacy workspace defaults', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const first = f.root.sessions.create('first', { meta: { cwd: f.mirror } });
    for (const value of [await f.host.api.sessionBackend({ sessionId: first.id }), await f.host.sessionStatus(first.id)]) {
      assert.equal(value.remote, true); assert.equal(value.selectionRequired, true); assert.equal(value.backend, null); assert.equal(value.binding, null);
    }
    await assert.rejects(readFile(join(f.host.stateDir, 'bindings.json')), { code: 'ENOENT' });
    await assert.rejects(f.host.api.acpStart({ dshSessionId: first.id }), { code: 'backend_selection_required' });
    await assert.rejects(f.host.api.acpPreflight({ sessionId: first.id }), { code: 'backend_selection_required' });
    await assert.rejects(f.host.api.acpPrepareRuntime({ sessionId: first.id, confirm: true }), { code: 'backend_selection_required' });
    assert.deepEqual((await f.host.api.acpList({ dshSessionId: first.id })).sessions, []);
    const actions = await f.host.api.sessionActions({ sessionId: first.id });
    assert.equal(actions.remote, true); assert.equal(actions.selectionRequired, true); assert.equal(actions.canFork, false);
    await assert.rejects(f.host.api.sessionFork({ sessionId: first.id, operationId: 'unselected-fork' }), { code: 'backend_not_acp' });
    assert.equal(f.calls.create, 0); assert.equal(f.calls.probe, 0); assert.equal(f.calls.prepare, 0); assert.equal(f.calls.list, 0);
    const selected = await f.host.api.selectSessionBackend({ sessionId: first.id, backend: { type: 'codex', permission: 'plan' } });
    assert.equal(selected.selectionRequired, false); assert.equal(selected.backend.type, 'codex'); assert.equal(selected.binding, null);
    assert.equal(f.calls.create, 0); assert.equal(f.calls.probe, 0);
    const stored = new bindingModule.BackendBindings(join(f.host.stateDir, 'bindings.json'));
    assert.equal((await stored.get(first.id)).backend.type, 'codex');
    const started = await f.host.api.acpStart({ dshSessionId: first.id }); assert.equal(started.session.agent, 'codex');
    await f.host.api.updateWorkspace({ id: 'w1', title: 'renamed' });
    assert.equal(f.calls.shutdown, 0); assert.equal(f.calls.create, 1); assert.equal(f.writes(), 1);
    assert.equal((await f.host.api.sessionBackend({ sessionId: first.id })).backend.type, 'codex');
    const second = f.root.sessions.create('second', { meta: { cwd: f.mirror } });
    assert.equal((await f.host.api.sessionBackend({ sessionId: second.id })).backend, null);
    assert.equal(await stored.get(second.id), null);
    const events = await f.host.api.acpEvents({ id: started.session.id }); assert.equal(events.session.id, started.session.id); assert.ok(events.cursor);
  } finally { await f.close(); }
});
test('cold blank Sessions classify through SessionQuery without binding or native runtime launch', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const snapshot = f.root.sessions.create('cold-snapshot', { meta: { cwd: f.mirror } });
    let inspected = 0;
    f.root.provide('sessionPersistence', { stat: async id => id === 'cold-blank' ? { header: { ...snapshot.header, id } } : null });
    f.root.provide('sessionQuery', { inspectSession: async (id, read) => { assert.equal(id, 'cold-blank'); inspected++; return read(snapshot); } });
    const status = await f.host.api.sessionBackend({ sessionId: 'cold-blank' });
    assert.equal(status.remote, true); assert.equal(status.selectionRequired, true); assert.equal(status.backend, null); assert.equal(status.binding, null); assert.equal(inspected, 1);
    await assert.rejects(readFile(join(f.host.stateDir, 'bindings.json')), { code: 'ENOENT' });
    assert.equal(f.calls.create, 0); assert.equal(f.calls.probe, 0); assert.equal(f.calls.list, 0);
    const selected = await f.host.api.selectSessionBackend({ sessionId: 'cold-blank', backend: { type: 'codex', permission: 'acceptEdits' } });
    assert.equal(selected.backend.type, 'codex'); assert.equal(f.root.sessions.get('cold-blank'), undefined); assert.equal(f.calls.create, 0);
  } finally { await f.close(); }
});
test('selection validates explicit fields, confirmation, Session state and racing immutable requests', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const native = f.root.sessions.create('selection-validation', { meta: { cwd: f.mirror } });
    const choose = backend => f.host.api.selectSessionBackend({ sessionId: native.id, backend });
    for (const backend of [undefined, null, {}, { type: 'dsh', permission: 'plan' }, { type: 'claude' }, { permission: 'plan' }, { type: 'claude', permission: 'no' }, { type: 'codex', permission: 'plan', model: 'injected' }]) {
      await assert.rejects(async () => choose(backend), { code: 'invalid_remote_backend' });
    }
    await assert.rejects(async () => choose({ type: 'claude', permission: 'bypass' }), { code: 'confirmation_required' });
    f.root.workspaceRegistry.archivedSessionIds.push(native.id);
    await assert.rejects(choose({ type: 'claude', permission: 'plan' }), { code: 'session_archived' });
    f.root.workspaceRegistry.archivedSessionIds.length = 0;
    await assert.rejects(readFile(join(f.host.stateDir, 'bindings.json')), { code: 'ENOENT' });
    const results = await Promise.allSettled([choose({ type: 'claude', permission: 'plan' }), choose({ type: 'codex', permission: 'plan' })]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(results[1].reason.code, 'binding_conflict');
    assert.equal((await choose({ type: 'claude', permission: 'plan' })).backend.type, 'claude');
    await assert.rejects(choose({ type: 'claude', permission: 'acceptEdits' }), { code: 'binding_conflict' });
    const bypass = f.root.sessions.create('selection-bypass', { meta: { cwd: f.mirror } });
    const selected = await f.host.api.selectSessionBackend({ sessionId: bypass.id, backend: { type: 'codex', permission: 'bypass' }, confirmBypass: true });
    assert.equal(selected.backend.permission, 'bypass'); assert.equal(selected.backend.type, 'codex');
    const local = f.root.sessions.create('selection-local', { meta: { cwd: f.directory } });
    await assert.rejects(f.host.api.selectSessionBackend({ sessionId: local.id, backend: { type: 'claude', permission: 'plan' } }), { code: 'not_remote_workspace' });
    const used = f.root.sessions.create('selection-used', { meta: { cwd: f.mirror } }); used.append('turn/start', { turn: 1 });
    await assert.rejects(f.host.api.selectSessionBackend({ sessionId: used.id, backend: { type: 'claude', permission: 'plan' } }), { code: 'session_not_blank' });
    assert.equal(f.calls.create, 0); assert.equal(f.calls.probe, 0); assert.equal(f.calls.prepare, 0); assert.equal(f.writes(), 0);
  } finally { await f.close(); }
});
test('recorded remote history missing immutable binding fails closed', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const native = f.root.sessions.create('orphan-remote', { meta: { cwd: f.mirror } });
    native.append('turn/start', { turn: 1 });
    native.append('user/message', { id: 'remote-acp-turn:' + Buffer.from(JSON.stringify([native.id, 'acp-lost', 'turn-1', ''])).toString('base64url'), role: 'user', content: [{ type: 'text', text: 'remote prompt' }], source: { kind: 'user' } }, { surfaceOp: 'append' });
    native.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    await assert.rejects(f.host.api.sessionBackend({ sessionId: native.id }), { code: 'backend_binding_missing' });
    await assert.rejects(f.host.api.selectSessionBackend({ sessionId: native.id, backend: { type: 'claude', permission: 'plan' } }), { code: 'backend_binding_missing' });
    await assert.rejects(readFile(join(f.host.stateDir, 'bindings.json')), { code: 'ENOENT' });
    assert.equal(f.calls.create, 0); assert.equal(f.calls.probe, 0);
  } finally { await f.close(); }
});
test('real remote execution records paired native lifecycle and consumes blank exactly once', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const native = f.root.sessions.create('recorded-prompt', { meta: { cwd: f.mirror } });
    assert.equal(f.list.summaryFor(native).blank, true);
    await f.host.api.selectSessionBackend({ sessionId: native.id, backend: { type: 'claude', permission: 'plan' } });
    const started = await f.host.api.acpStart({ dshSessionId: native.id });
    await f.host.prompt({ id: started.session.id, dshSessionId: native.id, text: 'the actual user prompt', requestId: 'once' });
    assert.equal(f.list.summaryFor(native).blank, false);
    assert.deepEqual(native.snapshotEvents().map(event => event.type), ['turn/start', 'user/message', 'turn/end']);
    assert.equal(native.deriveMessages()[0].content[0].text, 'the actual user prompt');
    assert.equal(native.snapshotEvents()[0].data.turn, 1); assert.equal(native.snapshotEvents()[2].data.turn, 1);
    await f.host.prompt({ id: started.session.id, dshSessionId: native.id, text: 'the actual user prompt', requestId: 'once' });
    assert.equal(native.seq, 3);
  } finally { await f.close(); }
});
test('unknown existing nonblank native Session remains DSH', { skip: !installed }, async () => {
  const f = await fixture({ blank: false });
  try {
    // Delete only the test's creation listener via its own isolated store timing: use a cold header contract.
    const cold = { stat: async () => ({ header: { cwd: f.mirror } }) };
    const bindings = new bindingModule.BackendBindings(join(f.directory, 'separate-bindings.json'));
    const result = await backendModule.resolveSessionBackend({ sessionId: 'pre-existing', sessions: { get: () => undefined }, persistence: cold, workspaces: f.config.workspacesV3.get(), runtime: f.runtime, bindings, selectBackend: () => configModule.normalizeBackend() });
    assert.equal(result.backend.type, 'dsh'); assert.equal(f.calls.list, 0);
  } finally { await f.close(); }
});
test('read-only status does not bind or convert a Session that already ran natively', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const native = f.root.sessions.create('native-first', { meta: { cwd: f.mirror } });
    native.append('turn/start', { turn: 1 });
    const status = await f.host.sessionStatus(native.id);
    assert.equal(status.backend.type, 'dsh'); assert.equal(status.binding, null); assert.equal(f.calls.list, 0);
    await assert.rejects(readFile(join(f.host.stateDir, 'bindings.json')), { code: 'ENOENT' });
    assert.equal(f.writes(), 0); assert.equal(f.calls.probe, 0);
  } finally { await f.close(); }
});
test('prepare plan performs no SSH/runtime prepare until explicit confirmation', { skip: !installed }, async () => {
  const f = await fixture();
  try {
    const session = f.root.sessions.create('prepare-fixture', { meta: { cwd: f.mirror } });
    await f.host.api.selectSessionBackend({ sessionId: session.id, backend: { type: 'claude', permission: 'plan' } });
    const plan = await f.host.api.acpPrepareRuntime({ sessionId: session.id });
    assert.equal(plan.confirmationRequired, true); assert.equal(f.calls.prepare, 0); assert.equal(f.calls.probe, 0);
    const result = await f.host.api.acpPrepareRuntime({ sessionId: session.id, confirm: true });
    assert.equal(result.prepared, true); assert.equal(f.calls.prepare, 1);
  } finally { await f.close(); }
});
test('new binding store is strict, preserves unknown data, and serializes concurrent snapshots', { skip: !installed }, async () => {
  const directory = await local(); const path = join(directory, 'bindings.json'); const old = '{"version":1,"sessions":[]}'; await writeFile(path, old);
  const invalid = new bindingModule.BackendBindings(path);
  await assert.rejects(invalid.get('s1'), { code: 'binding_schema_unsupported' }); assert.equal(await readFile(path, 'utf8'), old);
  const store = new bindingModule.BackendBindings(join(directory, 'new-bindings.json'));
  const value = { workspaceId: 'w', profileId: 'p', cwd: directory, configuredRemotePath: '/remote', backend: { type: 'dsh' } };
  await Promise.all([store.bind({ ...value, sessionId: 'one' }), store.bind({ ...value, sessionId: 'two' })]);
  assert.equal((await store.get('one')).backend.type, 'dsh'); assert.ok(await store.get('two'));
});
test('session path attachments send a bounded immutable snapshot, never a mutable URI', { skip: !installed }, async () => {
  const directory = await local(); const mirror = join(directory, 'mirror'); const remote = join(directory, 'remote'); await mkdir(mirror); await mkdir(remote);
  const content = 'exact snapshot'; await writeFile(join(remote, 'note.txt'), content);
  let reads = 0;
  const ssh = { run: async (_profile, command, options = {}) => { reads++; const r = spawnSync('bash', ['-c', command], { input: options.input, encoding: 'utf8' }); return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr }; } };
  const files = filesModule.createFiles({ ssh, configuration: { profile: () => profile }, resolveSession: async () => ({ remote: true, cwd: mirror, workspace: { id: 'w', profileId: 'p1', mirrorPath: mirror, remotePath: remote } }) });
  const attachment = await files.snapshotAttachment({ sessionId: 's', path: 'note.txt' });
  assert.equal(attachment.text, content); assert.equal(attachment.uri, undefined); assert.equal(reads, 1);
  await writeFile(join(remote, 'note.txt'), 'changed later'); assert.equal(attachment.text, content);
  await assert.rejects(files.snapshotAttachment({ sessionId: 's', path: '../escape' }), { code: 'path_outside_workspace' });
  assert.equal(reads, 1);
});
test('actual RemoteAccess policy denies authenticated non-owner file/prompt/approval calls', { skip: !installed }, async () => {
  const { RemoteAccessService } = await import('@deepseek-ai/dsh-api-remote-access');
  const root = new cordis.Context(); const directory = await local(); const routes = [];
  try {
    await root.plugin(sessionModule.SessionStore); await root.plugin(RemoteAccessService);
    root.provide('profileContext', { dir: directory });
    await nativeProjections(root);
    root.provide('attachments', { admitPromptContent: async parts => parts });
    root.provide('sessionController', { resolveAgent: async id => ({ agent: { session: root.sessions.get(id) } }) });
    // Admission must reject before any session-action dependency is used.
    const denied = () => { throw Error('Unauthorized request reached Session services'); };
    for (const service of ['sessionTitle', 'sessionQuery', 'agents']) root.provide(service, { get: denied, rename: denied, inspectSession: denied, observeSession: denied, create: denied });
    root.provide('workspaceRegistry', { archivedSessionIds: [] });
    root.provide('configEditor', { edit: async () => { throw Error('Unauthorized write reached config editor'); } });
    root.provide('tools', { register: () => () => {} });
    root.provide('connection', { admit: () => ({ peer: { principal: { kind: 'read-only-fixture' } } }) });
    root.provide('webServer', { register: route => { routes.push(route); return () => {}; } });
    await root.plugin(hostModule, {});
    const route = routes.find(route => route.path === HTTP_BASE + '/api'); assert.ok(route);
    for (const method of ['sessionBackend', 'selectSessionBackend', 'sessionFiles', 'acpPrompt', 'acpPermission', 'acpPrepareRuntime', 'acpClose']) {
      const request = Readable.from([Buffer.from(JSON.stringify({ sessionId: 'fixture', id: 'missing', action: 'write', path: 'file', content: 'no' }))]);
      request.method = 'POST'; request.url = HTTP_BASE + '/api/' + method; request.headers = { 'x-requested-with': 'XMLHttpRequest' };
      let status, payload;
      const response = { headersSent: false, writeHead(code) { status = code; this.headersSent = true; }, end(value) { payload = JSON.parse(value); } };
      await route.handler(request, response);
      assert.equal(status, 403, method); assert.equal(payload.error.code, 'remote_access_denied');
    }
    const attachmentRoute = routes.find(route => route.path === HTTP_BASE + '/session-attachment-upload'); assert.ok(attachmentRoute);
    let read = false, status, payload;
    const request = Readable.from((async function* () { read = true; yield Buffer.from('must not upload'); })());
    Object.assign(request, { method: 'POST', url: HTTP_BASE + '/session-attachment-upload?sessionId=fixture&uploadId=00000000-0000-4000-8000-000000000000&name=a.pdf', headers: {} });
    await attachmentRoute.handler(request, { headersSent: false, writeHead(code) { status = code; this.headersSent = true; }, end(value) { payload = JSON.parse(value); } });
    assert.equal(status, 403); assert.equal(payload.error.code, 'remote_access_denied'); assert.equal(read, false);
  } finally { await root.fiber.dispose(); }
});
test('real Connection admits Node IncomingMessage headers and its RPC interceptor is single-owner', { skip: !installed }, async () => {
  const ConnectionPlugin = await import('@deepseek-ai/dsh-client-connection');
  const root = new cordis.Context(); const sockets = [];
  const message = (headers, method = 'POST', url = '/api/session/prompt') => {
    const socket = new Socket(); sockets.push(socket);
    const request = new IncomingMessage(socket); request.headers = headers; request.method = method; request.url = url;
    return request;
  };
  try {
    // A new memory-only credential provider creates only this fixture's secret. No user credentials are read.
    root.provide('credentials', { modifyRecord: async (_key, change) => change(undefined) });
    await root.plugin(ConnectionPlugin, { cookieMaxAgeDays: 1 });
    const host = '127.0.0.1:45678'; const origin = 'http://' + host;
    assert.deepEqual(root.connection.admit(message({ host, origin })), { rejection: 401 });
    const launch = new URL(root.connection.authenticatedUrl(origin + '/')); let cookie;
    root.connection.authorizeIndex(message({ host }, 'GET', launch.pathname + launch.search), {
      writeHead(status, headers) { assert.equal(status, 303); cookie = headers['set-cookie'].split(';')[0]; }, end() {}
    });
    const request = message({ host, origin, cookie });
    assert.ok(request instanceof IncomingMessage);
    const admitted = root.connection.admit(request);
    assert.equal(admitted.peer.principal.kind, 'owner');
    assert.equal(root.connection.requestRejection(request), undefined);
    assert.deepEqual(root.connection.admit(message({ host: 'attacker.invalid', origin, cookie })), { rejection: 403 });
    assert.deepEqual(root.connection.admit(message({ host, origin: 'http://attacker.invalid', cookie })), { rejection: 403 });
    const release = root.connection.rpc.intercept('/api', () => true, async endpoint => ({ ok: true, value: { endpoint } }));
    assert.throws(() => root.connection.rpc.intercept('/api', endpoint => endpoint === 'session/prompt', async () => ({ ok: true, value: null })), /already has an interceptor/);
    const response = await root.connection.createSharedFetchHandler('/api').fetch(new Request(origin + '/api/session/prompt', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'fixture', method: 'session/prompt', payload: {} })
    }), admitted.peer);
    assert.equal((await response.json()).result.value.endpoint, 'session/prompt');
    await release();
  } finally { await root.fiber.dispose(); for (const socket of sockets) socket.destroy(); }
});
test('native directory picker is cancelled by Host lifetime disposal', { skip: !installed }, async () => {
  const f = await fixture(); let signal;
  try {
    f.root.provide('directoryPicker', { capability: () => ({ kind: 'native', pick: input => {
      signal = input; return new Promise(resolve => input.addEventListener('abort', () => resolve(null), { once: true }));
    } }) });
    const pending = f.host.api.directoryPicker({ action: 'pick' });
    assert.equal(signal.aborted, false);
    await f.host.dispose();
    assert.equal(signal.aborted, true); assert.equal((await pending).path, null);
  } finally { await f.close(); }
});
test('modern production entry contains no global monkeypatch, old schema migration or legacy execution', async () => {
  const source = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ctx\.fs|fileReferences|local-wrapper|tmux|syncDown|writeBack|sidebar\/api|legacyNative/);
  assert.match(source, /connection\.admit/); assert.match(source, /remoteAccess\.decide/);
  assert.doesNotMatch(source, /value: value|ok: true, value:/);
  assert.equal(HTTP_BASE, '/remote-ssh/v3');
  assert.doesNotMatch(source, /['"]\/remote-ssh\/(?:api|session-upload|session-download)/);
});
}
