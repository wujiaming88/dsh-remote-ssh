import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { quote, quotePath, remotePath, validateProfile, sshArgs, classifySshFailure, createSshExecutor, listSshConfigHosts } from '../lib/ssh.js';
import { inside, createFiles, TEXT_LIMIT, TRANSFER_LIMIT } from '../lib/files.js';
import { createWorkspaces, requireBypassConfirmation } from '../lib/workspaces.js';
import { CONFIG_VERSION, normalizeBackend, normalizeRemoteBackend, normalizeWorktreeRecord, validateWorkspace, publicProfile, createConfiguration } from '../lib/config.js';

const profile = (extra = {}) => ({ id: 'test-profile', name: 'Fixture only', host: 'never-connect.invalid', user: 'fixture', authMethod: 'key', ...extra });
const code = expected => error => { assert.equal(error.code, expected); return true; };

// Every process is synthetic or local. Neither ssh nor the user's Git/SSH configuration is opened.
async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(join(parent, 'dsh-domain-test-')));
  const owned = new Set([root]);
  function assertOwned(path) {
    const absolute = resolve(path);
    assert.ok(isAbsolute(path));
    assert.ok(absolute === root || absolute.startsWith(root + '/'), `Not a test-owned path: ${absolute}`);
    assert.equal(dirname(root), parent);
    assert.ok(basename(root).startsWith('dsh-domain-test-'));
    assert.ok(owned.has(root));
    return absolute;
  }
  t.after(async () => {
    assertOwned(root);
    assert.equal(await realpath(root), root);
    await rm(root, { recursive: true, force: true });
  });
  const home = join(root, 'home');
  await mkdir(home);
  const calls = [];
  const ssh = createSshExecutor({
    executable: 'local-fixture-only',
    spawnFn(executable, args) {
      assert.equal(executable, 'local-fixture-only');
      const command = args.at(-1);
      calls.push(command);
      return spawn('/bin/sh', ['-c', command], {
        cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH, HOME: home, TMPDIR: root, LANG: 'C',
          GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
          GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
          GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
      });
    },
  });
  t.after(() => ssh.shutdown());
  async function run(command) {
    const result = await ssh.run(profile(), command, { timeoutMs: 10000, maxBytes: 1024 * 1024 });
    assert.equal(result.ok, true, result.stderr);
    return result.stdout;
  }
  return { root, home, ssh, calls, run, assertOwned };
}

function fakeExecutor() {
  const children = [];
  const executor = createSshExecutor({ spawnFn(executable, args, options) {
    const child = new EventEmitter();
    Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kills: [], executable, args, options });
    child.kill = signal => { child.kills.push(signal); return true; };
    children.push(child);
    return child;
  } });
  return { executor, children };
}

function configurationFixture(initial = {}) {
  let stored = { schemaVersion: CONFIG_VERSION, profiles: [profile()], workspacesV3: [], ...initial };
  const refs = Object.fromEntries(['schemaVersion', 'profiles', 'workspacesV3'].map(key => [key, { get: () => stored[key] }]));
  const edits = [];
  const ctx = { fiber: { entry: { id: 'fixture' } }, configEditor: { async edit(entry, change) { edits.push(entry); stored = change(stored); } } };
  return { configuration: createConfiguration(ctx, refs), edits, refs, ctx };
}

async function filesFixture(t) {
  const f = await fixture(t);
  const root = join(f.root, 'remote root');
  const mirrorPath = join(f.root, 'mirror');
  await mkdir(root); await mkdir(mirrorPath);
  const binding = { remote: true, cwd: mirrorPath, workspace: { id: 'workspace', profileId: 'test-profile', mirrorPath, remotePath: root } };
  const files = createFiles({ ssh: f.ssh, configuration: { profile: () => profile() }, resolveSession: async id => { assert.equal(id, 'session'); return binding; } });
  return { ...f, remoteRoot: root, mirrorPath, binding, files, request: (action, path = '.', extra = {}) => files.sessionFiles({ sessionId: 'session', action, path, ...extra }) };
}

async function workspacesFixture(t, { failRegistration = false } = {}) {
  const f = await fixture(t);
  const repo = join(f.root, "repo ' quoted");
  await mkdir(repo);
  await f.run('git -C ' + quote(repo) + ' init -b main');
  await writeFile(join(repo, 'tracked.txt'), 'committed\n');
  await f.run('git -C ' + quote(repo) + ' add -- tracked.txt && git -C ' + quote(repo) + ' -c commit.gpgSign=false commit -m fixture');
  const { configuration } = configurationFixture();
  const records = []; const native = new Map(); const shutdowns = [];
  const registry = {
    async create(path, title) {
      if (failRegistration) throw new Error('fixture registration failure');
      const item = { id: 'shell-' + native.size, path: await realpath(path), title, async setTitle(next) { this.title = next; } };
      native.set(item.id, item); return item;
    },
    get: id => native.get(id),
    async delete(id) { native.delete(id); },
  };
  const runtime = { list: () => records, async shutdownSession(id) { shutdowns.push(id); } };
  const workspaces = createWorkspaces({ configuration, registry, runtime, ssh: f.ssh, stateDir: join(f.root, 'state') });
  const create = (branch = 'feature/test') => workspaces.create({ profileId: 'test-profile', remotePath: repo, worktree: { branch } });
  return { ...f, repo, configuration, records, native, shutdowns, workspaces, create };
}

test('Legacy backend normalization is compatible while workspaces without backend stay unselected', () => {
  assert.equal(normalizeBackend().type, 'dsh');
  assert.equal(normalizeRemoteBackend().type, 'claude');
  assert.equal(normalizeRemoteBackend({ type: 'codex' }).type, 'codex');
  assert.throws(() => normalizeRemoteBackend({ type: 'dsh' }), code('invalid_remote_backend'));
  const workspace = { id: 'w', profileId: 'p', title: 'W', mirrorPath: '/fixture/mirror', remotePath: '/fixture/remote' };
  assert.equal(Object.hasOwn(validateWorkspace(workspace), 'backend'), false);
  assert.equal(validateWorkspace({ ...workspace, backend: { type: 'codex', permission: 'plan', model: 'old-model', modeId: 'old-mode', remoteRuntimeDir: '/legacy/runtime' } }).backend.remoteRuntimeDir, '/legacy/runtime');
  assert.throws(() => validateWorkspace({ ...workspace, backend: { type: 'dsh' } }), code('invalid_remote_backend'));
});

test('Workspace registration uses the registry canonical path rather than the requested symlink path', async t => {
  const f = await workspacesFixture(t);
  const state = join(f.root, 'state'); const canonicalState = join(f.root, 'canonical-state');
  await mkdir(canonicalState); await symlink(canonicalState, state);
  const result = await f.workspaces.create({ profileId: 'test-profile', remotePath: f.repo });
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.workspace, 'backend'), false);
  assert.equal(result.mirrorPath, join(canonicalState, 'workspaces', result.workspace.id));
  assert.equal(result.workspace.mirrorPath, f.native.get(result.workspaceId).path);
  assert.equal(result.workspace.mirrorPath, await realpath(join(state, 'workspaces', result.workspace.id)));
});

test('SSH key args are argv-separated, noninteractive, accept-new, and preserve ProxyJump', () => {
  const args = sshArgs(profile({ port: 2222, keyPath: "~/keys/a ' b", proxyJump: 'jump@bastion:2200' }), "printf '%s' 'quoted command'");
  assert.deepEqual(args.slice(0, 3), ['-T', '-o', 'BatchMode=yes']);
  assert.ok(args.includes('StrictHostKeyChecking=accept-new'));
  assert.ok(!args.includes('StrictHostKeyChecking=no'));
  assert.deepEqual(args.slice(args.indexOf('-p'), args.indexOf('-p') + 2), ['-p', '2222']);
  assert.deepEqual(args.slice(args.indexOf('-J'), args.indexOf('-J') + 2), ['-J', 'jump@bastion:2200']);
  assert.equal(args[args.indexOf('-i') + 1], join(homedir(), "keys/a ' b"));
  assert.deepEqual(args.slice(-3), ['--', 'fixture@never-connect.invalid', "printf '%s' 'quoted command'"]);
});

test('Kerberos selects GSSAPI only, while key-agent auth does not require an identity file', () => {
  const kerberos = sshArgs(profile({ authMethod: 'kerberos', keyPath: '/unused/key' }), 'true');
  assert.ok(kerberos.includes('GSSAPIAuthentication=yes'));
  assert.ok(kerberos.includes('PreferredAuthentications=gssapi-with-mic'));
  assert.ok(!kerberos.includes('-i'));
  assert.ok(!sshArgs(profile(), 'true').includes('-i'));
});

test('Profile validation rejects passwords and option/control injection; public values exclude extras', () => {
  for (const extra of [{ host: '-oBad' }, { host: 'bad host' }, { user: 'x@y' }, { proxyJump: 'a\nb' }, { keyPath: 'x\0y' }, { port: 0 }, { port: 65536 }, { port: 22.5 }]) assert.throws(() => validateProfile(profile(extra)), code('invalid_profile'));
  for (const extra of [{ authMethod: 'password' }, { password: 'not-for-publication' }]) assert.throws(() => validateProfile(profile(extra)), code('ssh_auth_unsupported'));
  assert.equal(publicProfile(profile({ secret: 'not-for-publication' })).secret, undefined);
  assert.equal(validateProfile(profile()).remoteRoot, '~');
});

test('Shell quoting round-trips hostile literal values without executing them', async t => {
  const f = await fixture(t);
  const value = "spaces ' \" ; $(printf INJECTED) `printf INJECTED` \\ \n unicode-中";
  assert.equal(await f.run('printf %s ' + quote(value)), value);
  assert.equal(quotePath('~'), '~');
  assert.equal(await f.run('printf %s ' + quotePath("~/a ' b")), join(f.home, "a ' b"));
  assert.equal(quotePath('/absolute'), "'/absolute'");
  for (const path of ['', 'relative', '-option', '/x\ny', '/x\0y']) assert.throws(() => remotePath(path), code('invalid_remote_path'));
});

test('Executor succeeds with bounded stdin/stdout without exposing profile extras or commands', async () => {
  const { executor, children } = fakeExecutor();
  const result = executor.run(profile({ token: 'SECRET_PROFILE' }), 'SECRET_COMMAND', { input: 'SECRET_INPUT' });
  children[0].stdout.end('ok'); children[0].emit('close', 0);
  assert.deepEqual(await result, { ok: true, exitCode: 0, stdout: 'ok', stderr: '' });
  assert.deepEqual(children[0].options.stdio, ['pipe', 'pipe', 'pipe']);
  assert.doesNotMatch(JSON.stringify(children[0].args), /SECRET_PROFILE|SECRET_INPUT/);
  assert.equal(children[0].stdin.read().toString(), 'SECRET_INPUT');
  executor.shutdown();
});

test('Executor pre-abort, cancellation and disposal kill only its own children', async () => {
  const { executor, children } = fakeExecutor();
  const a = new AbortController(); a.abort();
  await assert.rejects(executor.run(profile(), 'never', { signal: a.signal }), code('ssh_cancelled'));
  assert.equal(children.length, 0);
  const b = new AbortController();
  const pending = executor.run(profile(), 'SECRET_COMMAND', { signal: b.signal, input: 'SECRET_INPUT' });
  b.abort(); await assert.rejects(pending, error => { assert.equal(error.code, 'ssh_cancelled'); assert.doesNotMatch(error.message, /SECRET/); return true; });
  assert.deepEqual(children[0].kills, ['SIGKILL']);
  const next = executor.run(profile(), 'pending'); executor.shutdown();
  await assert.rejects(next, code('ssh_cancelled'));
  assert.deepEqual(children[1].kills, ['SIGKILL']);
  await assert.rejects(executor.run(profile(), 'after-disposal'), code('ssh_cancelled'));
});

test('Executor timeout and combined stdout/stderr overflow are bounded and terminate children', async () => {
  const { executor, children } = fakeExecutor();
  const timeout = executor.run(profile(), 'SECRET_COMMAND', { timeoutMs: 10 });
  await assert.rejects(timeout, code('ssh_timeout'));
  assert.deepEqual(children[0].kills, ['SIGKILL']);
  const overflow = executor.run(profile(), 'SECRET_COMMAND', { maxBytes: 5 });
  children[1].stdout.write('123'); children[1].stderr.write('456');
  await assert.rejects(overflow, error => { assert.equal(error.code, 'ssh_output_too_large'); assert.doesNotMatch(error.message, /SECRET|123|456/); return true; });
  assert.deepEqual(children[1].kills, ['SIGKILL']);
  children[1].emit('close', 0); executor.shutdown();
});

test('Executor classifies command and spawn failures and tolerates stdin EPIPE', async () => {
  const { executor, children } = fakeExecutor();
  const failed = executor.run(profile(), 'fixture'); children[0].stderr.end('Permission denied (publickey).'); children[0].emit('close', 255);
  assert.equal((await failed).code, 'ssh_authentication_failed');
  const pipe = executor.run(profile(), 'fixture'); children[1].stdin.emit('error', Object.assign(new Error('pipe'), { code: 'EPIPE' })); children[1].emit('close', 0);
  assert.equal((await pipe).ok, true);
  const launch = createSshExecutor({ spawnFn() { throw new Error('fixture unavailable'); } });
  await assert.rejects(launch.run(profile(), 'fixture'), code('ssh_spawn_failed'));
  assert.equal(classifySshFailure('Connection refused'), 'ssh_connection_failed');
  assert.equal(classifySshFailure('Connection timed out'), 'ssh_timeout');
  executor.shutdown(); launch.shutdown();
});

test('SSH config Host wildcard, negation and first-value semantics use only explicit fixture home', async t => {
  const f = await fixture(t); await mkdir(join(f.home, '.ssh'));
  await writeFile(join(f.home, '.ssh/config'), 'Host prod* !prod-b\n User pattern-user\n Port 2201\nHost prod-a\n HostName a.invalid\n User later-user\n User ignored-user\nHost prod-b\n HostName b.invalid\nHost *\n User fallback\n Port 2222\n IdentityFile ~/.ssh/fixture\n ProxyJump jump.invalid\n GSSAPIAuthentication yes\n');
  const result = await listSshConfigHosts({ home: f.home });
  assert.deepEqual(result.hosts.map(h => h.name), ['prod-a', 'prod-b']);
  assert.deepEqual(result.hosts[0], { name: 'prod-a', hostName: 'a.invalid', user: 'pattern-user', port: 2201, identityFile: '~/.ssh/fixture', proxyJump: 'jump.invalid', gssapi: true });
  assert.equal(result.hosts[1].user, 'fallback'); assert.equal(result.hosts[1].port, 2222);
});

test('SSH config global Include glob ordering and cycles are bounded', async t => {
  const f = await fixture(t); await mkdir(join(f.home, '.ssh/conf.d'), { recursive: true });
  await writeFile(join(f.home, '.ssh/config'), 'Include conf.d/*.conf\nHost target\n HostName target.invalid\n');
  await writeFile(join(f.home, '.ssh/conf.d/10.conf'), 'User first\nInclude config\n');
  await writeFile(join(f.home, '.ssh/conf.d/20.conf'), 'User second\nPort 2200\n');
  const result = await listSshConfigHosts({ home: f.home });
  assert.equal(result.hosts[0].user, 'first'); assert.equal(result.hosts[0].port, 2200);
});

test('SSH config Include inherits its surrounding Host context (must not leak User to other aliases)', async t => {
  const f = await fixture(t); await mkdir(join(f.home, '.ssh'));
  await writeFile(join(f.home, '.ssh/config'), 'Host restricted\n Include scoped.conf\nHost other\n HostName other.invalid\n');
  await writeFile(join(f.home, '.ssh/scoped.conf'), 'User restricted-user\n');
  const result = await listSshConfigHosts({ home: f.home });
  assert.equal(result.hosts.find(h => h.name === 'restricted').user, 'restricted-user');
  assert.equal(result.hosts.find(h => h.name === 'other').user, '');
});

test('SSH config Include preserves textual first-value order inside a Host block', async t => {
  const f = await fixture(t); await mkdir(join(f.home, '.ssh'));
  await writeFile(join(f.home, '.ssh/config'), 'Host target\n Include scoped.conf\n User after-include\n');
  await writeFile(join(f.home, '.ssh/scoped.conf'), 'User from-include\n');
  const result = await listSshConfigHosts({ home: f.home });
  assert.equal(result.hosts[0].user, 'from-include');
});

test('SSH config discovery rejects oversized fixture input and does not evaluate Match', async t => {
  const f = await fixture(t); await mkdir(join(f.home, '.ssh'));
  await writeFile(join(f.home, '.ssh/config'), 'Host target\n HostName target.invalid\nMatch exec "never execute"\n User forbidden\n');
  const result = await listSshConfigHosts({ home: f.home });
  assert.equal(result.hosts[0].user, ''); assert.equal(result.warnings.length, 1);
  await writeFile(join(f.home, '.ssh/config'), '#'.repeat(1024 * 1024 + 1));
  await assert.rejects(listSshConfigHosts({ home: f.home }), code('ssh_config_too_large'));
});

test('Config modern schemas reject legacy backend fields, invalid paths and unowned records', () => {
  assert.deepEqual(normalizeBackend(), { type: 'dsh', permission: 'acceptEdits', model: '', modeId: '', remoteRuntimeDir: '' });
  assert.throws(() => normalizeBackend({ command: 'legacy' }), code('backend_schema_unsupported'));
  assert.throws(() => normalizeBackend({ type: 'local' }), code('invalid_backend'));
  assert.throws(() => normalizeBackend({ remoteRuntimeDir: 'relative' }), code('invalid_remote_path'));
  assert.equal(normalizeWorktreeRecord({ owned: false }), null);
  assert.throws(() => normalizeWorktreeRecord({ repo: '/repo', path: '/repo', branch: 'main', owned: true }), code('invalid_worktree_record'));
  assert.throws(() => validateWorkspace({ id: 'w', profileId: 'p', title: 'W', mirrorPath: 'relative', remotePath: '/r' }), code('invalid_workspace'));
  assert.throws(() => requireBypassConfirmation({}, { permission: 'bypass' }, { permission: 'plan' }), code('confirmation_required'));
  assert.doesNotThrow(() => requireBypassConfirmation({ confirmBypass: true }, { permission: 'bypass' }));
});

test('Config requires volatile modern references, clones snapshots and serializes persistent edits', async () => {
  assert.throws(() => createConfiguration({}, {}), code('configuration_contract'));
  const f = configurationFixture();
  const copy = f.configuration.snapshot(); copy.profiles[0].host = 'mutated';
  assert.equal(f.configuration.profile('test-profile').host, 'never-connect.invalid');
  const order = [];
  await Promise.all([1, 2].map(n => f.configuration.update(snapshot => { order.push(n); snapshot.profiles.push(profile({ id: 'p' + n })); return snapshot; })));
  assert.deepEqual(order, [1, 2]); assert.equal(f.edits.length, 2); assert.equal(f.configuration.snapshot().profiles.length, 3);
  await assert.rejects(f.configuration.update(snapshot => ({ ...snapshot, profiles: [profile({ authMethod: 'password' })] })), code('ssh_auth_unsupported'));
  await f.configuration.update(snapshot => snapshot);
  assert.equal(f.edits.length, 3);
  assert.throws(() => configurationFixture({ schemaVersion: 2 }).configuration.snapshot(), code('configuration_schema_unsupported'));
});

test('Files enforce mirror boundaries, root writes and remote-only Sessions before executing', async t => {
  const f = await filesFixture(t);
  f.binding.backend = null; f.binding.binding = null; f.binding.selectionRequired = true;
  assert.equal(inside(f.mirrorPath, f.mirrorPath), true);
  assert.equal(inside(f.mirrorPath, f.mirrorPath + '-sibling'), false);
  for (const path of ['../escape', f.mirrorPath + '-sibling/file']) await assert.rejects(f.request('read', path), code('path_outside_workspace'));
  await assert.rejects(f.request('write', '.', { content: 'x' }), code('invalid_path'));
  assert.equal(f.calls.length, 0);
  const root = await f.request('stat'); assert.equal(root.type, 'directory'); assert.equal(root.remotePath, f.remoteRoot);
  f.binding.remote = false; await assert.rejects(f.request('read', 'file'), code('not_remote_workspace'));
});

test('Files write/read versions, conflicts, listing and literal hostile names use real Python', async t => {
  const f = await filesFixture(t); const name = "literal ' $(printf bad).txt";
  const created = await f.request('write', name, { content: 'hello 中\n' }); assert.equal(created.ok, true);
  assert.match(created.version, /^sha256:[0-9a-f]{64}$/);
  const read = await f.request('read', name); assert.equal(read.content, 'hello 中\n'); assert.equal(read.binary, false); assert.equal(read.version, created.version);
  assert.equal((await f.request('write', name, { content: 'no overwrite' })).code, 'file_exists');
  assert.equal((await f.request('write', name, { content: 'changed', expectedVersion: read.version })).ok, true);
  assert.equal((await f.request('write', name, { content: 'stale', expectedVersion: read.version })).code, 'file_conflict');
  assert.equal(await readFile(join(f.remoteRoot, name), 'utf8'), 'changed');
  const list = await f.request('list'); assert.equal(list.entries[0].path, join(f.mirrorPath, name)); assert.equal(list.source, 'remote');
  await assert.rejects(f.request('write', name, { content: 'x', expectedVersion: 'bad' }), code('invalid_version'));
});

test('Files reject symlink reads/writes and canonical directory escapes without touching outside files', async t => {
  const f = await filesFixture(t); const outside = join(f.root, 'outside'); await mkdir(outside);
  await writeFile(join(outside, 'secret'), 'outside-fixture-only');
  await writeFile(join(f.remoteRoot, 'inside'), 'inside');
  await symlink(outside, join(f.remoteRoot, 'escape'));
  await symlink(join(f.remoteRoot, 'inside'), join(f.remoteRoot, 'link'));
  assert.equal((await f.request('read', 'escape/secret')).code, 'path_outside_workspace');
  assert.equal((await f.request('write', 'escape/new', { content: 'blocked' })).code, 'path_outside_workspace');
  assert.equal((await f.request('read', 'link')).code, 'not_regular_file');
  assert.equal((await f.request('write', 'link', { content: 'blocked' })).code, 'symlink_write_refused');
  assert.equal(await readFile(join(outside, 'secret'), 'utf8'), 'outside-fixture-only');
});

test('Files bound reads/writes/transfers and reject binary attachments and archived writes', async t => {
  const f = await filesFixture(t);
  await writeFile(join(f.remoteRoot, 'large'), Buffer.alloc(TEXT_LIMIT + 1, 65));
  assert.equal((await f.request('read', 'large')).code, 'file_too_large');
  await assert.rejects(f.request('write', 'new', { content: 'x'.repeat(TEXT_LIMIT + 1) }), code('file_too_large'));
  for (const [name, bytes] of [['nul', Buffer.from([65, 0, 66])], ['invalid-utf8', Buffer.from([255, 254])]]) {
    await writeFile(join(f.remoteRoot, name), bytes);
    const result = await f.request('read', name); assert.equal(result.binary, true); assert.equal(result.content, '');
    await assert.rejects(f.files.snapshotAttachment({ sessionId: 'session', path: name }), code('attachment_unsupported'));
  }
  await assert.rejects(f.files.upload({ sessionId: 'session', path: 'huge' }, { length: TRANSFER_LIMIT + 1 }), code('file_too_large'));
  f.binding.archived = true;
  await assert.rejects(f.request('write', 'new', { content: 'x' }), code('session_archived'));
  await assert.rejects(f.files.upload({ sessionId: 'session', path: 'new' }, Buffer.from('x')), code('session_archived'));
});

test('Files raw upload/download preserve bytes and image inline is opt-in', async t => {
  const f = await filesFixture(t); const bytes = Buffer.from([0, 255, 128, 1]);
  const uploaded = await f.files.upload({ sessionId: 'session', path: 'sample.png' }, bytes); assert.equal(uploaded.ok, true);
  const downloaded = await f.files.download({ sessionId: 'session', path: 'sample.png', inline: true });
  assert.deepEqual(downloaded.data, bytes); assert.equal(downloaded.mime, 'image/png'); assert.equal(downloaded.inline, true);
  assert.equal((await f.files.download({ sessionId: 'session', path: 'sample.png' })).inline, false);
});

test('Worktree creation records owned identity, omits parent backend, and clean removal preserves the branch', async t => {
  const f = await workspacesFixture(t);
  const parent = await f.workspaces.create({ profileId: 'test-profile', remotePath: f.repo });
  await f.configuration.update(snapshot => ({ ...snapshot, workspaces: snapshot.workspaces.map(w => w.id === parent.workspace.id ? { ...w, backend: { type: 'codex', permission: 'bypass' } } : w) }));
  const before = f.calls.length;
  await assert.rejects(f.workspaces.create({ profileId: 'test-profile', remotePath: f.repo, worktree: { branch: 'blocked' }, backend: { type: 'claude', permission: 'plan' } }), code('workspace_backend_unsupported'));
  assert.equal(f.calls.length, before);
  const result = await f.create();
  assert.equal(Object.hasOwn(result.workspace, 'backend'), false);
  assert.equal(result.ok, true); assert.equal(result.worktreeCreated, true); assert.equal(result.worktree.owned, true);
  assert.equal(result.workspace.worktree.path, result.workspace.remotePath);
  f.assertOwned(result.worktree.path); assert.equal(await realpath(result.worktree.path), result.worktree.path);
  assert.equal(await readFile(join(result.worktree.path, 'tracked.txt'), 'utf8'), 'committed\n');
  const removed = await f.workspaces.removeWorktree({ workspaceId: result.workspace.id, confirm: true });
  assert.equal(removed.ok, true); assert.equal(removed.worktreeRemoved, true); assert.equal(removed.branchPreserved, true);
  await assert.rejects(stat(result.worktree.path), { code: 'ENOENT' });
  assert.equal((await f.run('git -C ' + quote(f.repo) + ' show-ref --verify refs/heads/feature/test')).includes('refs/heads/feature/test'), true);
});

test('Worktree dirty and active instance removal are refused with files and registration preserved', async t => {
  const f = await workspacesFixture(t); const result = await f.create('dirty');
  assert.equal(result.ok, true); f.assertOwned(result.worktree.path); assert.equal(await realpath(result.worktree.path), result.worktree.path);
  await writeFile(join(result.worktree.path, 'untracked.txt'), 'do not delete');
  const dirty = await f.workspaces.removeWorktree({ workspaceId: result.workspace.id, confirm: true });
  assert.equal(dirty.code, 'worktree_remove_failed'); assert.equal(dirty.worktreeRemoved, false);
  assert.equal(await readFile(join(result.worktree.path, 'untracked.txt'), 'utf8'), 'do not delete');
  assert.equal(f.configuration.snapshot().workspaces.length, 1);
  for (const state of [{ alive: true }, { status: 'starting' }, { busy: true }, { pendingTurns: 1 }, { pendingPermissions: ['permission'] }, { pendingElicitations: ['elicitation'] }]) {
    f.records.splice(0, f.records.length, { id: 'active', profileId: 'test-profile', workspaceId: result.workspace.id, ...state });
    const before = f.calls.length;
    const active = await f.workspaces.removeWorktree({ workspaceId: result.workspace.id, confirm: true });
    assert.equal(active.code, 'worktree_active'); assert.deepEqual(active.activeSessionIds, ['active']); assert.equal(f.calls.length, before);
  }
});

test('Worktree deletion requires owned identity and explicit confirmation before remote execution', async t => {
  const f = await workspacesFixture(t);
  const ordinary = await f.workspaces.create({ profileId: 'test-profile', remotePath: f.repo });
  const before = f.calls.length;
  await assert.rejects(f.workspaces.removeWorktree({ workspaceId: ordinary.workspace.id, confirm: true }), code('worktree_not_owned'));
  assert.equal(f.calls.length, before);
  const owned = await f.create('confirmed'); f.assertOwned(owned.worktree.path);
  await assert.rejects(f.workspaces.removeWorktree({ workspaceId: owned.workspace.id }), code('confirmation_required'));
  assert.equal((await stat(owned.worktree.path)).isDirectory(), true);
});

test('Worktree registration failure returns owned recovery without deleting the created directory', async t => {
  const f = await workspacesFixture(t, { failRegistration: true });
  const result = await f.create('recover');
  assert.equal(result.ok, false); assert.equal(result.code, 'worktree_registration_failed'); assert.equal(result.worktreeCreated, true);
  assert.equal(result.recovery.owned, true); f.assertOwned(result.recovery.path);
  assert.equal(await readFile(join(result.recovery.path, 'tracked.txt'), 'utf8'), 'committed\n');
  assert.equal(f.configuration.snapshot().workspaces.length, 0);
  assert.ok(!f.calls.some(command => command.includes('worktree remove')));
});

test('Workspace unregister preserves remote worktree and local mirror; invalid branches are rejected early', async t => {
  const f = await workspacesFixture(t); const result = await f.create('keep');
  const removed = await f.workspaces.remove({ id: result.workspace.id });
  assert.equal(removed.filesPreserved, true); assert.equal(removed.historyPreserved, true);
  assert.equal((await stat(result.worktree.path)).isDirectory(), true); assert.equal((await stat(result.mirrorPath)).isDirectory(), true);
  for (const branch of ['-option', 'bad\nbranch', '']) await assert.rejects(f.create(branch), code('invalid_worktree'));
});
