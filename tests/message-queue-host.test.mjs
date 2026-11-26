import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import { parse } from 'acorn';
import { createDurableSession } from '../lib/durable-session.js';
import { normalizeAttachments } from '../lib/workspace-backend.js';
import { prepareSteeringPrompt } from '../lib/acp-steering.js';
import { BATCH_ATTACHMENT_LIMIT } from '../lib/file-attachments.js';
import { error } from '../lib/ssh.js';

// Execute the actual production Host preparation and HTTP callbacks with narrow
// service seams, without importing optional desktop Host packages or a fake UI.
const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of Object.values(node)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const code = node => source.slice(node.start, node.end);
const functionCode = name => code(find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === name));
const apiProperty = name => code(find(ast, node => node.type === 'Property' && node.key?.name === name).value);
const route = find(ast, node => node.type === 'ObjectExpression' && node.properties.some(p => p.key?.name === 'path' && p.value?.right?.value === '/api'));
const routeCode = code(route.properties.find(p => p.key?.name === 'handler').value);

function fixture({ denied = false, revokedDuringPrepare = false, persistFailure = false } = {}) {
  const state = { allowed: !denied, reads: 0, references: 0, recorderPrepared: 0, flushes: 0, submissions: [], persisted: [], archived: false, failPersistence: persistFailure, actions: [] };
  let session;
  const saved = () => [...session.nativeAdmissions].map(([requestId, content]) => ({ requestId, content, fingerprint: session.nativeAdmissionFingerprints.get(requestId) }));
  function restore(nativeAdmissions = []) {
    session = createDurableSession({ id: 'host', agent: 'claude', dshSessionId: 'native', nativeAdmissions,
      persistMetadata() { if (state.failPersistence) throw new Error('native admission disk full'); state.persisted = saved(); },
    });
    session.status = 'ready'; session.transportState = 'connected';
    session.capabilities = { steering: { supported: true }, promptCapabilities: { image: true }, agentCapabilities: { promptCapabilities: { image: true } } };
    for (const method of ['queue', 'steer']) session[method] = async (text, opts) => {
      assert.ok(state.persisted.some(entry => entry.requestId === opts.requestId), 'native admission persisted before remote submission');
      state.submissions.push({ method, text, opts });
      return method === 'queue' ? { accepted: true, outcome: 'queued', requestId: opts.requestId, turnId: 'turn' } : { outcome: 'injected', requestId: opts.requestId, turnId: 'turn' };
    };
    session.removeQueued = async args => { state.submissions.push({ method: 'removeQueued', args }); return { removed: true, ...args }; };
    session.updateQueued = async args => { assert.ok(state.persisted.some(entry => entry.requestId === args.targetRequestId), 'queued edit requires an existing durable admission'); state.submissions.push({ method: 'updateQueued', args }); return { updated: true, requestId: args.targetRequestId, turnId: 'turn' }; };
    session.promoteQueued = async args => { state.submissions.push({ method: 'promoteQueued', args }); return { promoted: true, outcome: 'injected', steering: true, requestId: args.targetRequestId, turnId: 'active' }; };
    return session;
  }
  restore();
  const stateOf = session => session.state();
  const runtime = { get: id => id === 'host' ? session : null, store: { get: () => null } };
  const sessionBackend = async () => ({ sessionId: 'native', remote: true, backend: { type: 'claude' }, binding: { id: 'host' }, archived: state.archived });
  const files = {
    async referenceAttachment(args) {
      state.references++; assert.equal(args.sessionId, 'native');
      if (revokedDuringPrepare) state.allowed = false;
      return { type: 'text', text: 'Verified remote reference', name: 'safe.pdf', remotePath: '/remote/safe.pdf', size: 0 };
    },
    async snapshotAttachment() { throw new Error('remote_file must never use untrusted legacy path'); },
  };
  const recorder = {
    async prepare(_session, text, { attachments }) {
      state.recorderPrepared++;
      return [{ type: 'text', text }, ...attachments.map(item => item.type === 'image' ? { type: 'image', attachment: { id: 'trusted-native-asset' } } : { type: 'text', text: item.text })];
    },
    async flush() { state.flushes++; },
  };
  const api = new Function('runtime', 'stateOf', 'sessionBackend', 'files', 'normalizeAttachments', 'attachRecorder', 'recorder', 'error', 'BATCH_ATTACHMENT_LIMIT', 'randomUUID', 'createHash', 'prepareSteeringPrompt',
    `${['record', 'changed', 'preparePrompt', 'queue', 'ensureResult'].map(functionCode).join('\n')} return { acpQueue: ${apiProperty('acpQueue')}, acpSteer: ${apiProperty('acpSteer')}, acpRemoveQueued: ${apiProperty('acpRemoveQueued')}, acpUpdateQueued: ${apiProperty('acpUpdateQueued')}, acpPromoteQueued: ${apiProperty('acpPromoteQueued')} };`
  )(runtime, stateOf, sessionBackend, files, normalizeAttachments, async () => {}, recorder, error, BATCH_ATTACHMENT_LIMIT, randomUUID, createHash, prepareSteeringPrompt);
  const host = { runtime, api, refreshSessionActivity() {} };
  const ctx = { connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, remoteAccess: { decide: input => { state.actions.push(input); return { kind: state.allowed ? 'allow' : 'deny' }; } } };
  const handler = new Function('ctx', 'host', 'error', 'API_PREFIX', `${['authorize', 'ensureResult', 'failure', 'json', 'body', 'jsonBody'].map(functionCode).join('\n')} return ${routeCode};`)(ctx, host, error, '/remote-ssh/v3/api/');
  async function request(method = 'acpQueue', args = {}) {
    const input = { id: 'host', dshSessionId: 'native', requestId: 'request', text: 'hello', ...args };
    const req = Readable.from((async function* () { state.reads++; yield Buffer.from(JSON.stringify(input)); })());
    Object.assign(req, { method: 'POST', url: '/remote-ssh/v3/api/' + method, headers: { 'x-requested-with': 'XMLHttpRequest' } });
    const res = { headersSent: false, writeHead(status) { this.status = status; this.headersSent = true; }, end(bytes) { this.body = JSON.parse(bytes); } };
    await handler(req, res); return res;
  }
  return { state, request, restore, get session() { return session; } };
}

test('HTTP queue reuses Host attachment preparation, durable admission and session authorization', async () => {
  const f = fixture();
  const result = await f.request('acpQueue', { attachments: [{ type: 'remote_file', path: '/etc/passwd', sessionId: 'attacker', name: 'safe.pdf' }, { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }] });
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.accepted, true); assert.equal(result.body.session.id, 'host');
  assert.equal(f.state.references, 1); assert.equal(f.state.recorderPrepared, 1); assert.equal(f.state.submissions.length, 1);
  const submission = f.state.submissions[0]; assert.equal(submission.method, 'queue'); assert.equal(submission.opts.attachments[0].text, 'Verified remote reference');
  assert.equal(f.state.persisted[0].content[2].attachment.id, 'trusted-native-asset');
  assert.match(f.state.persisted[0].fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result.body).includes('trusted-native-asset'), false);
  assert.ok(f.state.actions.every(a => a.action === 'remoteSsh/acpQueue'));
  assert.ok(f.state.actions.some(a => a.resources.some(r => r.kind === 'session' && r.id === 'native')));
});

test('queue rejects before body for denied callers and rechecks policy after slow attachment preparation', async () => {
  const denied = fixture({ denied: true });
  assert.equal((await denied.request()).status, 403); assert.equal(denied.state.reads, 0); assert.equal(denied.state.submissions.length, 0);
  const revoked = fixture({ revokedDuringPrepare: true });
  const response = await revoked.request('acpQueue', { attachments: [{ type: 'remote_file', name: 'safe.pdf' }] });
  assert.equal(response.body.error.code, 'remote_access_denied'); assert.equal(revoked.state.references, 1); assert.equal(revoked.state.submissions.length, 0);
  const archived = fixture(); archived.state.archived = true;
  assert.equal((await archived.request()).body.error.code, 'session_archived'); assert.equal(archived.state.submissions.length, 0);
});

test('failed admission cannot submit; Host restart cannot pair old native content with a new payload', async () => {
  const broken = fixture({ persistFailure: true });
  assert.equal((await broken.request()).body.ok, false); assert.equal(broken.state.submissions.length, 0);
  assert.equal(broken.session.nativeAdmissions.size, 0); assert.equal(broken.session.nativeAdmissionFingerprints.size, 0);
  const f = fixture({ revokedDuringPrepare: true });
  const original = { text: 'original', attachments: [{ type: 'remote_file', name: 'safe.pdf' }] };
  await f.request('acpQueue', original); assert.equal(f.state.submissions.length, 0);
  const persisted = structuredClone(f.state.persisted); f.restore(persisted); f.state.allowed = true;
  const changed = await f.request('acpQueue', { text: 'CHANGED' });
  assert.equal(changed.body.error.code, 'request_conflict'); assert.equal(f.state.submissions.length, 0);
  const legacy = fixture(); legacy.restore([{ requestId: 'request', content: [{ type: 'text', text: 'unproven' }] }]);
  assert.equal((await legacy.request()).body.error.code, 'request_outcome_unknown'); assert.equal(legacy.state.submissions.length, 0);
});

test('identical admission retries reuse trusted native assets and steering uses the same path', async () => {
  const f = fixture(), attachments = [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }];
  await f.request('acpQueue', { attachments }); await f.request('acpQueue', { attachments });
  assert.equal(f.state.recorderPrepared, 1, 'retries must reuse the already-admitted native asset');
  const steering = await f.request('acpSteer', { requestId: 'steer', attachments });
  assert.equal(steering.status, 200); assert.equal(steering.body.outcome, 'injected');
  assert.equal(f.state.submissions.at(-1).method, 'steer'); assert.equal(f.state.submissions.at(-1).opts.attachments[0].data, 'iVBORw0KGgo=');
  assert.equal(f.state.persisted.find(entry => entry.requestId === 'steer').content[1].attachment.id, 'trusted-native-asset');
  f.session.capabilities.steering.supported = false;
  const before = f.state.recorderPrepared;
  assert.equal((await f.request('acpSteer', { requestId: 'unsupported' })).body.error.code, 'steering_unsupported');
  assert.equal(f.state.recorderPrepared, before); assert.equal(f.session.nativeAdmissions.has('unsupported'), false);
});

test('queued edit and immediate send share session authorization and forward stable identities', async () => {
  const f = fixture();
  await f.request('acpQueue');
  const updated = await f.request('acpUpdateQueued', { targetRequestId: 'request', text: 'edited', opId: 'edit-op' });
  assert.equal(updated.status, 200); assert.equal(updated.body.updated, true);
  assert.deepEqual(f.state.submissions.at(-1), { method: 'updateQueued', args: { targetRequestId: 'request', text: 'edited', opId: 'edit-op' } });
  const promoted = await f.request('acpPromoteQueued', { targetRequestId: 'request', opId: 'promote-op' });
  assert.equal(promoted.status, 200); assert.equal(promoted.body.outcome, 'injected');
  assert.deepEqual(f.state.submissions.at(-1), { method: 'promoteQueued', args: { targetRequestId: 'request', opId: 'promote-op' } });
  assert.equal((await f.request('acpUpdateQueued', { targetRequestId: 'request', text: 123 })).body.error.code, 'bad_request');
  const before = f.state.submissions.length; f.state.allowed = false;
  assert.equal((await f.request('acpUpdateQueued', { targetRequestId: 'request', text: 'denied' })).status, 403);
  assert.equal((await f.request('acpPromoteQueued', { targetRequestId: 'request' })).status, 403);
  assert.equal(f.state.submissions.length, before);
});

test('remove HTTP action checks binding and authorization and forwards stable operation identity', async () => {
  const f = fixture();
  const result = await f.request('acpRemoveQueued', { targetRequestId: 'queued', opId: 'stable-op' });
  assert.equal(result.status, 200); assert.equal(result.body.removed, true);
  assert.deepEqual(f.state.submissions[0], { method: 'removeQueued', args: { targetRequestId: 'queued', opId: 'stable-op' } });
  assert.equal((await f.request('acpRemoveQueued', { dshSessionId: 'other' })).body.error.code, 'binding_mismatch');
  f.state.allowed = false; assert.equal((await f.request('acpRemoveQueued')).status, 403);
  assert.equal(f.state.submissions.length, 1);
});
