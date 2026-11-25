import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMessageAttachments, messageImageHandler } from '../lib/message-attachments.js';
import { remoteMessageId, remoteTurnProjectionDefinition, RemoteTurnRecorder } from '../lib/remote-turn-recorder.js';
import { normalizeAttachments } from '../lib/workspace-backend.js';
import { nativeContentConverter } from '../lib/native-content.js';
import { AcpSession } from '../lib/acp.js';

const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const ref = { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', bytes: bytes.length, width: 1, height: 1, name: '截图.png' };
const args = { id: 'acp', dshSessionId: 'native', turnId: 'turn' };
function fixture({ name = true, prefix = args, busy = false, liveTurn = args.turnId, queued = [], proof = null, inheritedEventCount = 0, hasMessage = true } = {}) {
  const id = remoteMessageId(prefix.dshSessionId, prefix.id, args.turnId);
  const image = { ...ref }; if (!name) delete image.name;
  const events = hasMessage ? [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', data: { id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hello' }, { type: 'file', attachment: { attachmentId: 'sha256:file', name: 'notes.txt', bytes: 2 } }, { type: 'image', attachment: image }] } },
    { seq: 2, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ] : [];
  const native = { id: 'native', inheritedEventCount };
  let state = remoteTurnProjectionDefinition.init({ id: 'native', isSeeded: inheritedEventCount > 0 });
  for (const event of events) state = remoteTurnProjectionDefinition.apply(state, event);
  const calls = { reads: 0, waits: 0, inspect: 0, records: 0 };
  const options = {
    record: async input => { calls.records++; if (input.id !== args.id || input.dshSessionId !== args.dshSessionId) throw Object.assign(Error('denied binding'), { code: 'binding_mismatch' }); return { state: { dshSessionId: 'native', pendingTurns: busy ? 1 : 0 }, session: { busy, activeTurn: busy ? { id: liveTurn } : null, turnQueue: queued.map(id => ({ id })) } }; },
    recorder: { stateOf: () => state, waitForSession: async () => { calls.waits++; } },
    query: { inspectSession: async (sid, read) => { calls.inspect++; assert.equal(sid, 'native'); return read(native); }, readEvent: async request => { assert.deepEqual(request, { sessionId: 'native', seq: 1, before: 0, after: 0 }); return { session: { id: 'native' }, target: structuredClone(events[1]) }; } },
    approvedFork: () => proof,
    attachments: { readImage: async supplied => { calls.reads++; assert.deepEqual(supplied, image); return { ref: image, data: bytes }; } },
  };
  return { options, calls, events, service: createMessageAttachments(options) };
}

test('normalizer preserves safe original names and native admission forwards names', async () => {
  const [image] = normalizeAttachments([{ type: 'image', name: 'C:\\private\\截图.png', mimeType: 'image/png', data: bytes.toString('base64') }]);
  assert.equal(image.name, '截图.png');
  const convert = nativeContentConverter({ admitPromptContent: async parts => { assert.equal(parts[0].name, '截图.png'); return [{ type: 'image', attachment: ref }]; } });
  assert.deepEqual(await convert([image]), [{ type: 'image', attachment: ref }]);
  assert.equal(normalizeAttachments([{ ...image, name: '/private/x\u0000.png' }])[0].name, 'x.png');
});

test('refs map by native attachment order without binary, digest or Host paths in RPC', async () => {
  const f = fixture(); const result = await f.service.list(args);
  assert.equal(result.status, 'available'); assert.equal(result.attachments.length, 1);
  const image = result.attachments[0]; assert.equal(image.index, 1); assert.equal(image.name, '截图.png');
  assert.equal(image.url, '/remote-ssh/v3/message-image?id=acp&dshSessionId=native&turnId=turn&index=1');
  assert.equal(image.thumbnailUrl, image.url);
  assert.doesNotMatch(JSON.stringify(result), /base64|sha256|attachmentId|iVBORw0KGgo|file-objects/);
  assert.equal(f.calls.reads, 0); assert.equal(f.calls.waits, 1);
  assert.deepEqual((await f.service.read({ ...args, index: 1 })).data, bytes);
});

test('rc10 nameless history restores references from native replay without live or draft caches', async () => {
  const f = fixture({ name: false }); const first = await f.service.list(args);
  const restarted = createMessageAttachments(f.options);
  assert.deepEqual(await restarted.list(args), first);
  assert.equal(first.attachments[0].name, 'image');
  assert.deepEqual((await restarted.read({ ...args, index: 1 })).data, bytes);
});

test('unknown and not-yet-recorded messages distinguish unavailable and pending', async () => {
  assert.deepEqual(await fixture({ hasMessage: false }).service.list(args), { ok: true, status: 'unavailable', reason: 'native_message_unavailable', attachments: [] });
  assert.equal((await fixture({ hasMessage: false, busy: true }).service.list(args)).status, 'pending');
  assert.equal((await fixture({ hasMessage: false, busy: true, liveTurn: 'another-turn' }).service.list(args)).status, 'unavailable');
  assert.equal((await fixture({ hasMessage: false, queued: [args.turnId] }).service.list(args)).status, 'pending');
  const f = fixture(); f.options.query = undefined;
  assert.equal((await createMessageAttachments(f.options).list(args)).reason, 'native_query_unavailable');
});

test('binding and full native message membership reject cross-session and arbitrary references', async () => {
  const f = fixture();
  for (const input of [{ ...args, dshSessionId: 'other' }, { ...args, id: 'other' }]) await assert.rejects(f.service.read({ ...input, index: 1 }), { code: 'binding_mismatch' });
  assert.equal(f.calls.inspect, 0); assert.equal(f.calls.reads, 0);
  for (const index of [0, 2, -1, 16, NaN]) await assert.rejects(f.service.read({ ...args, index }));
  f.events[1].data.id = remoteMessageId('other', 'acp', 'turn');
  await assert.rejects(f.service.read({ ...args, index: 1, attachmentId: ref.attachmentId }), { code: 'message_attachment_mismatch' });
  assert.equal(f.calls.reads, 0);
});

test('inherited images require committed fork proof and are read only from child history', async () => {
  const options = { prefix: { id: 'parent-acp', dshSessionId: 'parent' }, inheritedEventCount: 3 };
  assert.equal((await fixture(options).service.list(args)).status, 'unavailable');
  const proof = { childId: 'acp', childDshSessionId: 'native', sourceId: 'parent-acp', sourceDshSessionId: 'parent', nativeBoundary: 2 };
  assert.equal((await fixture({ ...options, proof }).service.list(args)).status, 'available');
  assert.equal((await fixture({ ...options, proof: { ...proof, nativeBoundary: 0 } }).service.list(args)).status, 'unavailable');
});

function response() { return { headersSent: false, writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; }, end(body) { this.body = body; } }; }
function request(url = '/remote-ssh/v3/message-image?id=acp&dshSessionId=native&turnId=turn&index=1') { return Object.assign(new EventEmitter(), { method: 'GET', url }); }
test('asset route authorizes every request and rechecks revocation after the verified read', async () => {
  const f = fixture(); let allowed = false;
  const handler = messageImageHandler({ images: f.service, authorize: (_req, method, identity) => {
    assert.equal(method, 'messageAttachments'); assert.equal(identity.dshSessionId, 'native');
    if (!allowed) throw Object.assign(Error('denied'), { status: 403, code: 'remote_access_denied' });
    return () => allowed;
  } });
  let res = response(); await handler(request(), res); assert.equal(res.status, 403); assert.equal(f.calls.reads, 0);
  allowed = true; res = response(); await handler(request(), res); assert.equal(res.status, 200); assert.deepEqual(res.body, bytes);
  assert.equal(res.headers['cache-control'], 'no-store'); assert.equal(res.headers['x-content-type-options'], 'nosniff');
  f.options.attachments.readImage = async () => { allowed = false; return { ref, data: bytes }; };
  res = response(); await handler(request(), res); assert.equal(res.status, 403); assert.doesNotMatch(String(res.body), /iVBOR/);
});

test('missing stored image is an explicit failure and never a fabricated preview', async () => {
  const f = fixture(); f.options.attachments.readImage = async () => { throw Object.assign(Error('missing secret path'), { code: 'ATTACHMENT_NOT_FOUND' }); };
  const res = response(); await messageImageHandler({ images: f.service, authorize: () => () => true })(request(), res);
  assert.equal(res.status, 404); assert.equal(JSON.parse(res.body).error.code, 'ATTACHMENT_NOT_FOUND');
  assert.doesNotMatch(res.body, /secret path|data:image/);
});

test('read barrier waits for scheduled records only, without flushing or invoking an Agent', async () => {
  let resolve; const chain = new Promise(r => { resolve = r; }); let finished = false;
  const recorder = new RemoteTurnRecorder({}, {}); recorder.bindings.set('native', { chain });
  const wait = recorder.waitForSession('native').then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false); resolve(); await wait; assert.equal(finished, true);
  await recorder.waitForSession('cold');
});

test('image display name reaches event metadata but ACP wire and event logs retain prior binary policy', async () => {
  let sent; const controller = {
    ready: Promise.resolve({ sessionId: 'remote', initialize: { agentCapabilities: { promptCapabilities: { image: true } } }, sessionResponse: { modes: { currentModeId: 'acceptEdits', availableModes: [{ id: 'acceptEdits' }] } } }),
    prompt: async content => { sent = content; return { stopReason: 'end_turn' }; }, setMode: async () => ({}), dispose: async () => {}, close: async () => {},
  };
  const session = new AcpSession({ id: 'acp', dshSessionId: 'native', agent: 'claude', remotePath: '/remote', profile: { id: 'fixture', host: 'unused.invalid', user: 'fixture', authMethod: 'key' }, connectImpl: () => controller });
  try {
    await session.start();
    const image = { type: 'image', name: '截图.png', mimeType: 'image/png', data: bytes.toString('base64') };
    await session.prompt('hello', { attachments: [image] });
    assert.deepEqual(sent[1], { type: 'image', mimeType: image.mimeType, data: image.data });
    const events = session.bufferedEvents();
    assert.equal(events.find(event => event.type === 'user_message').attachments[0].name, image.name);
    assert.doesNotMatch(JSON.stringify(events), new RegExp(image.data.slice(0, 40)));
    assert.doesNotMatch(JSON.stringify(events), /attachmentId|sha256:/);
  } finally { await session.dispose(); }
});
