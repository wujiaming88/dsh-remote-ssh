import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, chmodSync, realpathSync, readFileSync, writeFileSync, existsSync, symlinkSync, rmSync, watch, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const hostFixture = fileURLToPath(new URL('./fixtures/durable-host.mjs', import.meta.url));
const adapterFixture = fileURLToPath(new URL('./fixtures/durable-adapter.mjs', import.meta.url));
const workerBundle = fileURLToPath(new URL('../lib/durable-worker-bundle.js', import.meta.url));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const readLines = path => {
  try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
function untilFile(directory, predicate, label) {
  return new Promise((resolve, reject) => {
    let watcher, timer;
    const check = () => {
      try { const result = predicate(); if (result) { watcher?.close(); clearTimeout(timer); resolve(result); return true; } }
      catch (error) { watcher?.close(); clearTimeout(timer); reject(error); return true; }
      return false;
    };
    if (check()) return;
    watcher = watch(directory, check);
    watcher.on('error', reject);
    timer = setTimeout(() => { watcher.close(); reject(Error('Timed out waiting for ' + label)); }, 15000);
    check();
  });
}
async function startHost(f, locatorPath = f.locatorPath) {
  const child = spawn(process.execPath, [hostFixture, locatorPath], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const messages = [], waiters = []; let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
  child.stdout.resume();
  child.on('message', message => {
    messages.push(message);
    if (message.type === 'helper') f.helpers.add(message.pid);
    for (const waiter of [...waiters]) if (waiter.predicate(message)) { clearTimeout(waiter.timer); waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(message); }
  });
  const host = {
    child, messages,
    next(predicate) {
      const found = messages.find(predicate); if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(Error('Host message timeout: ' + JSON.stringify(messages.map(m => ({ type: m.type, state: typeof m.state === 'string' ? m.state : m.state?.status, error: m.error, code: m.code, correlation: m.correlation, event: m.event?.type }))) + '\n' + stderr));
        }, 15000) }; waiters.push(waiter);
      });
    },
    send(message) { child.send(message); },
    async request(message) {
      const correlation = randomUUID(); child.send({ ...message, correlation });
      return host.next(m => m.correlation === correlation);
    },
    async kill() { if (child.exitCode == null && child.signalCode == null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; } },
    async detach() {
      if (child.exitCode != null || child.signalCode != null) return;
      const exited = once(child, 'exit'); await host.request({ action: 'detach' }); await exited;
    },
  };
  f.hosts.push(host);
  const ready = await host.next(m => m.type === 'ready' || m.type === 'fatal');
  assert.equal(ready.type, 'ready', JSON.stringify(ready)); host.ready = ready.attached;
  return host;
}
function ownedKill(pid, expectedCommand) {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw Error('Unsafe test process id');
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (result.status === 1 && !result.stdout.trim()) return;
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(expectedCommand), 'Refuse to kill a process whose fixture identity changed: ' + result.stdout);
  try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function fixture(t) {
  assert.equal(existsSync(workerBundle), true, 'Run node build-remote.mjs before durable recovery tests');
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'dsh-recovery-')); chmodSync(root, 0o700);
  const runtime = join(root, 'runtime'), workspace = join(root, 'workspace');
  mkdirSync(runtime, { mode: 0o700 }); mkdirSync(workspace, { mode: 0o700 });
  const marker = randomUUID(), id = randomUUID(), generation = randomUUID();
  writeFileSync(join(workspace, 'fixture-marker'), marker, { mode: 0o600 });
  const packages = join(runtime, 'node_modules', '@agentclientprotocol'); mkdirSync(packages, { recursive: true, mode: 0o700 });
  const sdk = resolve(dirname(require.resolve('@agentclientprotocol/sdk')), '../../..');
  assert.equal(readJson(join(sdk, 'package.json')).version, '2.9.1');
  symlinkSync(sdk, join(packages, 'sdk'));
  const adapter = join(packages, 'claude-agent-acp'); mkdirSync(join(adapter, 'dist'), { recursive: true, mode: 0o700 });
  writeFileSync(join(adapter, 'package.json'), JSON.stringify({ name: '@agentclientprotocol/claude-agent-acp', version: '0.109.1', type: 'module' }), { mode: 0o600 });
  writeFileSync(join(adapter, 'dist', 'index.js'), readFileSync(adapterFixture), { mode: 0o600 });
  const binding = { agent: 'claude', cwd: workspace, remotePath: workspace, remoteRuntimeDir: runtime, agentPath: process.execPath, workspaceId: marker, dshSessionId: marker, generation };
  const locatorPath = join(root, 'host-locator.json');
  writeFileSync(locatorPath, JSON.stringify({ marker, workspace, runtime, cursor: 0, events: join(root, 'host-events.ndjson'), identity: { id, token: randomBytes(32).toString('hex'), binding }, sessionOptions: { ...binding, id, permission: 'default', eventSeq: 0 } }), { mode: 0o600 });
  const directory = join(runtime, 'durable-runs', id), tracePath = join(workspace, 'adapter-trace.ndjson');
  const f = { root, runtime, workspace, marker, id, directory, locatorPath, tracePath, hosts: [], helpers: new Set() };
  t.after(async () => {
    for (const host of f.hosts) await host.kill();
    for (const pid of f.helpers) ownedKill(pid, marker);
    const adapterOwner = join(workspace, 'adapter-owner.json');
    if (existsSync(adapterOwner)) {
      const owner = readJson(adapterOwner); assert.equal(owner.marker, marker);
      ownedKill(owner.pid, 'dsh-durable-test-adapter:' + marker);
    }
    const ownerPath = join(directory, 'broker-owner.json'), launchPath = join(directory, 'launch.json');
    if (existsSync(ownerPath) && existsSync(launchPath)) {
      const owner = readJson(ownerPath), launch = readJson(launchPath);
      assert.equal(owner.id, id); assert.equal(owner.binding.workspaceId, marker); assert.equal(owner.epoch, launch.epoch);
      ownedKill(owner.pid, join(runtime, 'durable-workers', launch.workerHash + '.mjs'));
      const socketDirectory = dirname(launch.socketPath);
      assert.equal(dirname(socketDirectory), realpathSync('/tmp')); assert.ok(socketDirectory.startsWith(join(realpathSync('/tmp'), 'dsh-acp-')));
      assert.equal(statSync(socketDirectory).uid, process.getuid());
      rmSync(socketDirectory, { recursive: true, force: true });
    }
    assert.equal(dirname(root), realpathSync(tmpdir())); assert.ok(root.startsWith(join(realpathSync(tmpdir()), 'dsh-recovery-')));
    rmSync(root, { recursive: true, force: true });
  });
  return f;
}

test('unsafe writable runtime is rejected before creating an execution owner', async t => {
  const f = await fixture(t);
  chmodSync(f.runtime, 0o777);
  await assert.rejects(() => startHost(f), /remote_unsafe_runtime/);
  assert.equal(existsSync(f.directory), false);
  chmodSync(f.runtime, 0o700);
});

test('missing active owner without terminal evidence is never recreated', { timeout: 30000 }, async t => {
  const f = await fixture(t), host = await startHost(f);
  const owner = readJson(join(f.directory, 'broker-owner.json')), launch = readJson(join(f.directory, 'launch.json'));
  assert.equal(owner.id, f.id); assert.equal(owner.binding.workspaceId, f.marker);
  ownedKill(owner.pid, join(f.runtime, 'durable-workers', launch.workerHash + '.mjs'));
  const lost = await host.next(message => message.type === 'connection' && message.state === 'error');
  assert.equal(lost.code, 'remote_broker_lost');
  assert.equal(existsSync(join(f.directory, 'terminal.json')), false);
  const trace = readLines(f.tracePath);
  assert.equal(trace.filter(event => event.type === 'initialize').length, 1);
  assert.equal(trace.filter(event => event.type === 'new').length, 1);
  assert.equal(trace.filter(event => event.type === 'prompt').length, 0);
});

test('real remote owner survives killed Host, helper reconnects, permissions/forms replay without a second prompt', { timeout: 90000 }, async t => {
  const f = await fixture(t), first = await startHost(f);
  assert.equal(first.ready.state.status, 'ready', first.ready.state.lastError || JSON.stringify(first.ready.state));
  // Abrupt SSH-helper death must reconnect the link without touching the owner.
  const helpersBefore = first.messages.filter(m => m.type === 'helper').length;
  await first.request({ action: 'cut_helper' });
  await first.next(m => m.type === 'helper' && first.messages.filter(n => n.type === 'helper').indexOf(m) >= helpersBefore);
  const reconnected = () => first.messages.filter(m => m.type === 'connection' && m.state === 'connected').length >= 2;
  if (!reconnected()) await first.next(m => m.type === 'connection' && m.state === 'connected' && reconnected());
  const promptId = 'one-and-only-prompt';
  first.send({ action: 'call', correlation: 'original-prompt', opId: promptId, method: 'prompt', args: { text: 'do one remote task', requestId: promptId }, dropAccepted: true });
  await first.next(m => m.type === 'ack_dropped' && m.opId === promptId);
  await first.next(m => m.type === 'event' && m.event.type === 'turn_start');
  // Query after ACK loss must find the original pending operation, not resend it.
  const connectedCount = () => first.messages.filter(m => m.type === 'connection' && m.state === 'connected').length;
  if (connectedCount() < 3) await first.next(m => m.type === 'connection' && m.state === 'connected' && connectedCount() >= 3);
  const pending = await first.request({ action: 'query', opIds: [promptId] });
  assert.equal(pending.value[0].status, 'pending');
  assert.equal(readLines(f.tracePath).filter(e => e.type === 'prompt').length, 1);
  await first.kill();
  assert.equal(readJson(f.locatorPath).identity.id, f.id);
  assert.equal(typeof readJson(f.locatorPath).identity.epoch, 'string');
  assert.equal(statSync(f.locatorPath).mode & 0o777, 0o600);

  writeFileSync(join(f.workspace, 'release-permission'), '', { mode: 0o600 });
  await untilFile(f.workspace, () => readLines(f.tracePath).find(e => e.type === 'offline_progress'), 'remote progress after Host death');
  await untilFile(f.directory, () => readLines(join(f.directory, 'broker-events.ndjson')).find(e => e.type === 'permission'), 'durable permission callback');
  const second = await startHost(f);
  assert.equal(second.ready.state.sessionId, 'same-remote-session');
  assert.equal(second.ready.state.pendingPermissions.length, 1);
  const permission = second.ready.state.pendingPermissions[0];
  const allowed = await second.request({ action: 'call', method: 'permission', opId: 'allow-once', args: { requestId: permission.requestId, optionId: 'allow' } });
  assert.equal(allowed.value.ok, true);
  await untilFile(f.workspace, () => readLines(f.tracePath).find(e => e.type === 'permission_answered'), 'permission reply reaching original ACP request');
  await second.kill();

  writeFileSync(join(f.workspace, 'release-form'), '', { mode: 0o600 });
  await untilFile(f.directory, () => readLines(join(f.directory, 'broker-events.ndjson')).find(e => e.type === 'elicitation'), 'durable form callback while disconnected');
  const third = await startHost(f);
  assert.equal(third.ready.state.pendingPermissions.length, 0); assert.equal(third.ready.state.pendingElicitations.length, 1);
  const elicitation = third.ready.state.pendingElicitations[0];
  const answered = await third.request({ action: 'call', method: 'elicitation', opId: 'answer-once', args: { requestId: elicitation.requestId, action: 'accept', content: { answer: 'yes' } }, dropAccepted: true });
  assert.equal(answered.value.action, 'accept');
  await third.next(m => ['state', 'attached'].includes(m.type) && m.state.status === 'ready' && m.state.pendingTurns === 0);
  const completed = await third.request({ action: 'query', opIds: [promptId, 'allow-once', 'answer-once'] });
  assert.deepEqual(completed.value.map(op => op.status), ['completed', 'completed', 'completed']);
  assert.equal(completed.value[0].result.value.stopReason, 'end_turn');
  await third.detach();

  const fourth = await startHost(f);
  assert.equal(fourth.ready.state.status, 'ready'); assert.equal(fourth.ready.state.pendingTurns, 0);
  const finalResult = await fourth.request({ action: 'query', opIds: [promptId] });
  assert.equal(finalResult.value[0].result.value.stopReason, 'end_turn');
  // A second Host explicitly takes ownership; the old writer cannot mutate it.
  const competingPath = join(f.root, 'competing-locator.json'), competing = readJson(f.locatorPath);
  competing.events = join(f.root, 'competing-events.ndjson');
  writeFileSync(competingPath, JSON.stringify(competing), { mode: 0o600 });
  const fifth = await startHost(f, competingPath);
  const fenced = await fourth.request({ action: 'call', method: 'cancel', opId: 'stale-cancel', args: {} });
  assert.equal(fenced.error.code, 'writer_fenced');
  const conflict = await fifth.request({ action: 'call', method: 'prompt', opId: promptId, args: { text: 'DIFFERENT task', requestId: promptId } });
  assert.equal(conflict.error.code, 'operation_conflict');
  const counts = readLines(f.tracePath);
  for (const type of ['initialize', 'new', 'prompt', 'permission_answered', 'form_answered', 'completed']) assert.equal(counts.filter(e => e.type === type).length, 1, type);
  assert.equal(counts.filter(e => e.type === 'resume').length, 0);
  const events = readLines(join(f.root, 'host-events.ndjson'));
  assert.equal(new Set(events.map(e => e.seq)).size, events.length);
  assert.ok(events.some(e => e.text === 'continued after Host death'));
  // Lose the final close receipt, then kill the Host. Retirement must leave a
  // verifiable terminal receipt, not an unreachable owner or a replacement SDK.
  fifth.send({ action: 'call', correlation: 'lost-close', method: 'close', opId: 'explicit-close', args: {}, dropResult: true });
  await fifth.next(m => m.type === 'ack_dropped' && m.opId === 'explicit-close');
  await fifth.kill(); await fourth.detach();
  const terminalPath = join(f.directory, 'terminal.json');
  await untilFile(f.directory, () => existsSync(terminalPath) && readJson(terminalPath), 'closed owner terminal publication');
  const terminal = readJson(terminalPath);
  assert.equal(terminal.state.status, 'closed'); assert.equal(statSync(terminalPath).mode & 0o777, 0o600);
  const terminalLocator = readJson(competingPath), terminalLocatorPath = join(f.root, 'terminal-locator.json');
  terminalLocator.cursor = 0; terminalLocator.events = join(f.root, 'terminal-replay.ndjson');
  writeFileSync(terminalLocatorPath, JSON.stringify(terminalLocator), { mode: 0o600 });
  const sixth = await startHost(f, terminalLocatorPath);
  assert.equal(sixth.ready.state.status, 'closed'); assert.equal(sixth.ready.terminal, true);
  const closeQuery = await sixth.request({ action: 'query', opIds: ['explicit-close', promptId] });
  assert.deepEqual(closeQuery.value.map(op => op.status), ['completed', 'completed']);
  assert.equal(closeQuery.value[0].result.value.closed, true);
  const repeated = await sixth.request({ action: 'call', method: 'close', opId: 'explicit-close', args: {} });
  assert.equal(repeated.value.closed, true);
  const confirmed = await sixth.request({ action: 'call', method: 'close', opId: 'already-closed-confirmation', args: {} });
  assert.equal(confirmed.value.alreadyClosed, true);
  const oldPrompt = await sixth.request({ action: 'call', method: 'prompt', opId: promptId, args: { text: 'do one remote task', requestId: promptId } });
  assert.equal(oldPrompt.value.stopReason, 'end_turn');
  const forbidden = await sixth.request({ action: 'call', method: 'prompt', opId: 'must-not-restart', args: { text: 'new task' } });
  assert.equal(forbidden.error.code, 'remote_session_closed');
  const oldConflict = await sixth.request({ action: 'call', method: 'prompt', opId: promptId, args: { text: 'changed task' } });
  assert.equal(oldConflict.error.code, 'operation_conflict');
  const terminalReplay = readLines(terminalLocator.events);
  assert.equal(terminalReplay.at(-1).seq, terminal.headSeq);
  assert.equal(new Set(terminalReplay.map(e => e.seq)).size, terminalReplay.length);
  const ownerPid = readJson(join(f.directory, 'broker-owner.json')).pid;
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 3000;
    const check = () => {
      try { process.kill(ownerPid, 0); } catch (error) { if (error.code === 'ESRCH') return resolve(); return reject(error); }
      if (Date.now() > deadline) return reject(Error('Closed worker did not exit'));
      setTimeout(check, 25);
    }; check();
  });
  const afterTerminal = readLines(f.tracePath);
  for (const type of ['initialize', 'new', 'prompt', 'close']) assert.equal(afterTerminal.filter(e => e.type === type).length, 1, type);
  await sixth.detach();
});
