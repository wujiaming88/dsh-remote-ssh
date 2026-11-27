import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { sessionBackendPayload, createSessionSelection, createFreshSession } from '../src/client/session-setup-model.js';

const form = { type: 'claude', permission: 'acceptEdits', confirmBypass: false };
test('Agent selection is session scoped, explicit, and validates permissions', () => {
  for (const type of ['claude', 'codex', 'pi']) {
    assert.deepEqual(sessionBackendPayload('s', { ...form, type }).value, { sessionId: 's', backend: { type, permission: 'acceptEdits' } });
  }
  for (const patch of [{ type: '' }, { type: 'dsh' }, { type: 'unknown' }, { permission: 'unknown' }]) {
    assert.equal(sessionBackendPayload('s', { ...form, ...patch }).error, 'invalid');
  }
  assert.equal(sessionBackendPayload('', form).error, 'invalid');
});
test('Bypass needs a fresh explicit confirmation; safe modes never forward it', () => {
  for (const confirmBypass of [false, undefined, 'true', 1]) assert.equal(sessionBackendPayload('s', { ...form, permission: 'bypass', confirmBypass }).error, 'bypassConfirm');
  assert.equal(sessionBackendPayload('s', { ...form, permission: 'bypass', confirmBypass: true }).value.confirmBypass, true);
  assert.equal(sessionBackendPayload('s', { ...form, permission: 'plan', confirmBypass: true }).value.confirmBypass, undefined);
});
function fixture() {
  const calls = [], states = [], results = [];
  const selection = createSessionSelection({ request: (method, args) => new Promise((resolve, reject) => calls.push({ method, args, resolve, reject })), changed: state => states.push(state), selected: result => results.push(result) });
  return { selection, calls, states, results };
}
test('No request on mounting; duplicate submits are coalesced; success refreshes selection', async () => {
  const f = fixture(), value = sessionBackendPayload('s', form).value;
  assert.equal(f.calls.length, 0);
  const pending = f.selection.submit(value);
  await f.selection.submit(value);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, 'selectSessionBackend');
  assert.deepEqual(f.calls[0].args, value); assert.equal(f.states.at(-1).busy, true);
  const result = { ok: true, sessionId: 's' }; f.calls[0].resolve(result); await pending;
  assert.deepEqual(f.results, [result]);
});
test('Host rejection and network failure preserve the form and allow retry', async () => {
  const f = fixture(), value = sessionBackendPayload('s', form).value;
  let pending = f.selection.submit(value); const denied = { ok: false, error: { code: 'session_archived', message: 'archived' } };
  f.calls[0].resolve(denied); await pending;
  assert.deepEqual(f.states.at(-1), { busy: false, error: denied }); assert.equal(f.results.length, 0);
  pending = f.selection.submit(value); const error = new Error('offline'); f.calls[1].reject(error); await pending;
  assert.deepEqual(f.states.at(-1), { busy: false, error });
  pending = f.selection.submit(value); f.calls[2].resolve({ ok: true }); await pending; assert.equal(f.results.length, 1);
});
test('Navigating away discards late success or failure; a replacement is independent', async () => {
  for (const result of [{ ok: true }, { ok: false }]) {
    const f = fixture(); const pending = f.selection.submit(sessionBackendPayload('a', form).value);
    f.selection.dispose(); const count = f.states.length; f.calls[0].resolve(result); await pending;
    assert.equal(f.results.length, 0); assert.equal(f.states.length, count);
    await f.selection.submit({ sessionId: 'b' }); assert.equal(f.calls.length, 1);
  }
});
test('Fresh-session creation omits named blank reuse and coalesces duplicate clicks', async () => {
  const calls = [], opened = [], states = [];
  let resolve;
  const action = createFreshSession({ createSession: args => { calls.push(args); return new Promise(done => { resolve = done; }); },
    openSession: id => opened.push(id), beginNavigation: () => new AbortController().signal, changed: state => states.push(state) });
  const pending = action.run('w'); await action.run('w');
  assert.deepEqual(calls, [{ workspaceId: 'w' }]);
  resolve('new-id'); await pending; assert.deepEqual(opened, ['new-id']);
  assert.equal(states.at(-1).busy, false);
});
test('Later navigation intent or component disposal suppresses late session opening', async () => {
  for (const cancel of ['navigation', 'dispose']) {
    const navigation = new AbortController(); let resolve; const opened = [];
    const action = createFreshSession({ createSession: () => new Promise(done => { resolve = done; }), openSession: id => opened.push(id),
      beginNavigation: () => navigation.signal, changed: () => {} });
    const pending = action.run('w');
    if (cancel === 'navigation') navigation.abort(); else action.dispose();
    resolve('new-id'); await pending; assert.deepEqual(opened, []);
  }
});
test('Opening failure retains the created identity for explicit retry', async () => {
  let creates = 0, opens = 0; const states = [];
  const action = createFreshSession({ createSession: async () => { creates++; return 'new-id'; },
    openSession: id => { assert.equal(id, 'new-id'); if (++opens === 1) throw new Error('open failed'); },
    beginNavigation: () => new AbortController().signal, changed: state => states.push(state) });
  await action.run('w'); assert.ok(states.some(state => state.error?.message === 'open failed'));
  await action.run('w'); assert.equal(creates, 1); assert.equal(opens, 2);
});
test('Setup UI stays localized and accessible and cannot mount the runtime before selection', () => {
  const source = readFileSync(new URL('../src/client/session-setup.js', import.meta.url), 'utf8');
  parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  assert.match(source, /type: ''/); assert.match(source, /key !== 'confirmBypass' \? \{ confirmBypass: false \}/);
  assert.match(source, /h\('label'/); assert.match(source, /type: 'submit'/); assert.match(source, /role: 'alert'/);
  assert.match(source, /backend.archived === true/); assert.match(source, /return \(\) => selection.dispose\(\)/);
  assert.doesNotMatch(source, /acpStart|acpResume|new SessionClient|@deepseek-ai\/dsh-client|#[0-9a-fA-F]{3,8}/);
  const workspace = readFileSync(new URL('../src/client/workspaces.js', import.meta.url), 'utf8');
  assert.doesNotMatch(workspace, /form\.type|form\.permission|form\.confirmBypass/);
  const index = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8');
  assert.match(index, /routing.phase === 'selection' \? h\(SessionSetup, \{ key: props.sessionId/);
});
test('Pi is selectable and its autonomous tool policy is disclosed', () => {
  const source = readFileSync(new URL('../src/client/session-setup.js', import.meta.url), 'utf8');
  assert.match(source, /\['pi', 'Pi'\]/);
  assert.match(source, /session\.setup\.piPermission/);
  assert.match(source, /form\.type === 'pi'/);
});
