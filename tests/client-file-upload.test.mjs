import test from 'node:test';
import assert from 'node:assert/strict';
import {Blob, File} from 'node:buffer';
import {uploadFileAttachment} from '../src/client/api.js';
import {prepareFileAttachments} from '../src/client/file-intake.js';
import {ComposerSession} from '../src/client/composer-session.js';
import {SessionClient} from '../src/client/session.js';
import {SessionClientPool} from '../src/client/session-pool.js';

const capabilities = {promptCapabilities: {image: true}};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
const binary = (name = 'archive.zip', content = new Uint8Array([0, 1, 128, 255])) => new File([content], name, {type: 'application/zip'});
const backend = (sessionId = 'session-a') => ({sessionId, workspace: {id: 'workspace', profileId: 'profile', remotePath: '/remote'}, backend: {type: 'claude'}, binding: null});
const receipt = attachment => ({type: 'remote_file', uploadId: attachment.uploadId, name: attachment.name,
  version: `sha256:${'a'.repeat(64)}`, size: attachment.size, remotePath: `/remote/.dsh-attachments/${attachment.uploadId}/file`});
const response = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
const ack = (args, emit) => emit({type: 'request_ack', requestId: args.requestId});

function fixture(t, options = {}) {
  const uploads = [], prompts = [], actions = [];
  const client = new SessionClient(options.backend || backend(), {
    storage: null, composer: options.composer,
    api: async (method, args, signal) => {
      actions.push({method, args, signal});
      return options.api ? options.api(method, args, signal) : {ok: true};
    },
    uploadAttachment: async (sessionId, attachment, signal) => {
      uploads.push({sessionId, attachment, signal});
      return options.upload ? options.upload(sessionId, attachment, signal) : receipt(attachment);
    },
    stream: async (method, args, signal, emit) => {
      prompts.push({method, args, signal, emit});
      if (options.stream) return options.stream(method, args, signal, emit);
      ack(args, emit);
    },
  });
  client.publish({binding: {id: 'acp-a'}, capabilities});
  t.after(() => client.dispose());
  return {client, composer: client.composer, uploads, prompts, actions};
}

async function select(composer, files = [binary()], draft = 'inspect these files') {
  composer.setDraft(draft);
  await composer.receiveFiles(files, capabilities);
  return composer.getSnapshot().attachments;
}

async function attachment() {
  return (await prepareFileAttachments([binary()], [], capabilities, {makeId: () => 'upload-a'}))[0];
}

test('selection is local; send uploads the raw Blob and prompts with only a confirmed remote_file receipt', async t => {
  const fetches = [];
  const h = fixture(t, {upload: (sessionId, file, signal) => uploadFileAttachment(sessionId, file, signal, async (url, init) => {
    fetches.push({url, init});
    assert.ok(init.body instanceof Blob);
    assert.equal(typeof init.body, 'object');
    assert.deepEqual(new Uint8Array(await init.body.arrayBuffer()), new Uint8Array([0, 1, 128, 255]));
    return response({ok: true, attachment: {...receipt(file), file: 'must-not-leak', data: 'must-not-leak'}});
  })});
  const [selected] = await select(h.composer, [binary('name ?&/文档.zip')]);
  assert.equal(h.uploads.length, 0);
  assert.equal(h.prompts.length, 0);
  await h.client.sendDraft();
  assert.equal(fetches.length, 1);
  const {url, init} = fetches[0], query = new URL(url, 'http://localhost').searchParams;
  assert.equal(query.get('sessionId'), 'session-a');
  assert.equal(query.get('uploadId'), selected.uploadId);
  assert.equal(query.get('name'), selected.name);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['content-type'], 'application/octet-stream');
  assert.equal(init.headers['x-requested-with'], 'XMLHttpRequest');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(h.prompts[0].method, 'acpPrompt');
  assert.deepEqual(h.prompts[0].args.attachments, [receipt(selected)]);
  const wire = JSON.parse(JSON.stringify(h.prompts[0].args));
  assert.deepEqual(wire.attachments, [receipt(selected)]);
  assert.equal(wire.attachments[0].file, undefined);
  assert.equal(wire.attachments[0].data, undefined);
  assert.equal(wire.attachments[0].id, undefined);
  assert.equal(h.composer.getSnapshot().draft, '');
  assert.deepEqual(h.composer.getSnapshot().attachments, []);
  assert.deepEqual(h.composer.getSnapshot().uploads, {});
});

test('upload transport passes the supplied Blob and abort signal without cloning or JSON encoding', async () => {
  const selected = await attachment(), controller = new AbortController();
  let calls = 0;
  const result = await uploadFileAttachment('session', selected, controller.signal, async (url, init) => {
    calls++;
    assert.equal(init.body, selected.file);
    assert.equal(init.signal, controller.signal);
    return response({ok: true, attachment: receipt(selected)});
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, receipt(selected));
});

test('upload receipt rejects mismatched identity, shape, hash, byte count and non-absolute path', async () => {
  const selected = await attachment(), valid = receipt(selected);
  const invalid = [null, {}, {...valid, type: 'file_upload'}, {...valid, uploadId: 'other'},
    {...valid, name: ''}, {...valid, name: 1}, {...valid, version: 'a'.repeat(64)},
    {...valid, version: 'sha256:' + 'g'.repeat(64)}, {...valid, version: 'sha256:' + 'a'.repeat(63)},
    {...valid, size: valid.size + 1}, {...valid, size: String(valid.size)},
    {...valid, remotePath: ''}, {...valid, remotePath: 'relative/file'}, {...valid, remotePath: 3}];
  for (const value of invalid) {
    await assert.rejects(uploadFileAttachment('session', selected, undefined,
      async () => response({ok: true, attachment: value})), {code: 'upload_unconfirmed'});
  }
});

test('upload HTTP and malformed response failures cannot produce a receipt', async () => {
  const selected = await attachment();
  await assert.rejects(uploadFileAttachment('session', selected, undefined,
    async () => response({ok: false, error: {code: 'remote_access_denied', message: 'revoked'}}, 403)),
  {code: 'remote_access_denied', message: 'revoked'});
  await assert.rejects(uploadFileAttachment('session', selected, undefined,
    async () => new Response('forbidden', {status: 403})), {code: 'http_403'});
  await assert.rejects(uploadFileAttachment('session', selected, undefined,
    async () => response({ok: false, error: {code: 'upload_conflict', message: 'conflict'}})), {code: 'upload_conflict'});
  await assert.rejects(uploadFileAttachment('session', selected, undefined,
    async () => new Response('{not-json', {status: 200})), {code: 'http_200'});
});

test('unconfirmed receipt keeps the local draft and never reaches prompt transport', async t => {
  const h = fixture(t, {upload: (sessionId, selected, signal) => uploadFileAttachment(sessionId, selected, signal,
    async () => response({ok: true, attachment: {...receipt(selected), uploadId: 'wrong'}}))});
  const [selected] = await select(h.composer);
  await assert.rejects(h.client.sendDraft(), {code: 'upload_unconfirmed'});
  assert.equal(h.prompts.length, 0);
  assert.equal(h.composer.getSnapshot().attachments[0], selected);
  assert.equal(h.composer.getSnapshot().draft, 'inspect these files');
  assert.equal(h.composer.getSnapshot().uploads[selected.uploadId].status, 'failed');
});

test('upload failure preserves draft and retry reuses the same uploadId and requestId', async t => {
  let attempt = 0;
  const h = fixture(t, {upload: async (sessionId, selected) => {
    if (++attempt === 1) throw Object.assign(new Error('offline'), {code: 'network_error'});
    return receipt(selected);
  }});
  const [selected] = await select(h.composer);
  await assert.rejects(h.client.sendDraft(), {code: 'network_error'});
  const requestId = h.composer.pending.requestId;
  assert.equal(h.composer.getSnapshot().sending, false);
  assert.equal(h.composer.getSnapshot().draft, 'inspect these files');
  assert.equal(h.composer.getSnapshot().attachments[0], selected);
  assert.deepEqual(h.composer.getSnapshot().uploads[selected.uploadId], {status: 'failed', error: 'offline'});
  assert.equal(h.prompts.length, 0);
  await h.client.sendDraft();
  assert.deepEqual(h.uploads.map(call => call.attachment.uploadId), [selected.uploadId, selected.uploadId]);
  assert.equal(h.prompts[0].args.requestId, requestId);
  assert.equal(h.composer.pending, null);
});

test('second-file failure caches the first receipt and retry uploads only the failed file', async t => {
  const counts = new Map();
  const h = fixture(t, {upload: async (sessionId, selected) => {
    const count = (counts.get(selected.uploadId) || 0) + 1;
    counts.set(selected.uploadId, count);
    if (selected.name === 'second.zip' && count === 1) throw new Error('second upload failed');
    return receipt(selected);
  }});
  const [first, second] = await select(h.composer, [binary('first.zip'), binary('second.zip')]);
  await assert.rejects(h.client.sendDraft(), /second upload failed/);
  const requestId = h.composer.pending.requestId;
  assert.equal(h.prompts.length, 0);
  assert.equal(h.composer.getSnapshot().uploads[first.uploadId].status, 'uploaded');
  assert.deepEqual(h.composer.getSnapshot().uploads[first.uploadId].receipt, receipt(first));
  assert.equal(h.composer.getSnapshot().uploads[second.uploadId].status, 'failed');
  assert.equal(h.composer.getSnapshot().attachments.length, 2);
  await h.client.sendDraft();
  assert.equal(counts.get(first.uploadId), 1);
  assert.equal(counts.get(second.uploadId), 2);
  assert.equal(h.prompts[0].args.requestId, requestId);
  assert.deepEqual(h.prompts[0].args.attachments, [receipt(first), receipt(second)]);
});

test('unknown ACK retains requestId and receipts; retry does not upload again or switch to steer', async t => {
  let sends = 0;
  const h = fixture(t, {stream: async (method, args, signal, emit) => {if (++sends > 1) ack(args, emit);}});
  const [selected] = await select(h.composer);
  await assert.rejects(h.client.sendDraft(), {code: 'acknowledgment_unknown'});
  const requestId = h.composer.pending.requestId;
  assert.equal(h.composer.getSnapshot().uploads[selected.uploadId].status, 'uploaded');
  assert.equal(h.composer.getSnapshot().attachments[0], selected);
  h.client.publish({running: true});
  await h.client.sendDraft();
  assert.equal(h.uploads.length, 1);
  assert.deepEqual(h.prompts.map(call => call.method), ['acpPrompt', 'acpPrompt']);
  assert.deepEqual(h.prompts.map(call => call.args.requestId), [requestId, requestId]);
  assert.equal(h.actions.some(call => call.method === 'acpSteer'), false);
});

test('a new draft selecting the same filename gets a new upload identity and remote upload', async t => {
  const h = fixture(t);
  const [first] = await select(h.composer, [binary('same.zip')]);
  await h.client.sendDraft();
  const [second] = await select(h.composer, [binary('same.zip')]);
  assert.notEqual(second.id, first.id);
  assert.notEqual(second.uploadId, first.uploadId);
  await h.client.sendDraft();
  assert.equal(h.uploads.length, 2);
  assert.notEqual(h.prompts[0].args.requestId, h.prompts[1].args.requestId);
  assert.notEqual(h.prompts[0].args.attachments[0].remotePath, h.prompts[1].args.attachments[0].remotePath);
});

for (const transition of ['dispose', 'epoch', 'clear', 'revoke']) {
  test(`late upload after ${transition} cannot send a prompt or restore a receipt`, async t => {
    const waiting = deferred(), started = deferred();
    const h = fixture(t, {upload: (sessionId, selected) => {started.resolve(selected); return waiting.promise;}});
    const [selected] = await select(h.composer);
    const sending = h.client.sendDraft(), rejected = assert.rejects(sending, {code: 'cancelled'});
    await started.promise;
    if (transition === 'dispose') h.client.dispose();
    if (transition === 'epoch') h.client.epoch++;
    if (transition === 'clear') h.composer.clear();
    if (transition === 'revoke') h.client.invalidate(Object.assign(new Error('access revoked'), {code: 'remote_access_denied'}));
    waiting.resolve(receipt(selected));
    await rejected;
    assert.equal(h.prompts.length, 0);
    assert.equal(h.composer.getSnapshot().uploads[selected.uploadId]?.receipt, undefined);
    assert.equal(h.composer.getSnapshot().sending, false);
    if (transition === 'dispose' || transition === 'epoch') {
      assert.equal(h.composer.getSnapshot().uploads[selected.uploadId].status, 'failed');
    }
    if (transition === 'clear' || transition === 'revoke') {
      assert.equal(h.composer.getSnapshot().draft, '');
      assert.deepEqual(h.composer.getSnapshot().attachments, []);
      assert.deepEqual(h.composer.getSnapshot().uploads, {});
      assert.equal(h.composer.pending, null);
    }
    if (transition === 'revoke') assert.equal(h.client.state.binding, null);
  });
}

test('late denial from a disposed upload cannot invalidate a newer draft using the same composer', async t => {
  const waiting = deferred(), started = deferred();
  const old = fixture(t, {upload: () => {started.resolve(); return waiting.promise;}});
  await select(old.composer);
  const sending = old.client.sendDraft(), rejected = assert.rejects(sending, {code: 'remote_access_denied'});
  await started.promise;
  old.client.dispose();
  old.composer.clear();
  const next = fixture(t, {composer: old.composer});
  const [selected] = await select(next.composer, [binary('new.zip')], 'new private draft');
  waiting.reject(Object.assign(new Error('old denial'), {code: 'remote_access_denied'}));
  await rejected;
  assert.equal(next.composer.getSnapshot().draft, 'new private draft');
  assert.equal(next.composer.getSnapshot().attachments[0], selected);
  assert.equal(next.client.retryBlocked, false);
  assert.equal(next.client.state.binding.id, 'acp-a');
});

test('active upload authorization denial revokes state without a prompt or post-denial state query', async t => {
  const h = fixture(t, {upload: async () => {throw Object.assign(new Error('denied'), {code: 'remote_access_denied'});}});
  await select(h.composer);
  await assert.rejects(h.client.sendDraft(), {code: 'remote_access_denied'});
  assert.equal(h.prompts.length, 0);
  assert.equal(h.actions.length, 0);
  assert.equal(h.client.retryBlocked, true);
  assert.deepEqual(h.composer.getSnapshot().attachments, []);
  assert.deepEqual(h.composer.getSnapshot().uploads, {});
});

test('different sessions keep identical filenames, drafts, receipts and ACKs isolated', async t => {
  const a = fixture(t, {backend: backend('session-a'), stream: async () => {}});
  const b = fixture(t, {backend: backend('session-b')});
  const [first] = await select(a.composer, [binary('same.zip')], 'draft a');
  const [second] = await select(b.composer, [binary('same.zip')], 'draft b');
  assert.notEqual(first.uploadId, second.uploadId);
  await assert.rejects(a.client.sendDraft(), {code: 'acknowledgment_unknown'});
  assert.equal(b.uploads.length, 0);
  assert.deepEqual(b.composer.getSnapshot().uploads, {});
  assert.equal(b.composer.getSnapshot().draft, 'draft b');
  b.client.acknowledge(a.composer.pending.requestId);
  assert.equal(b.composer.getSnapshot().attachments[0], second);
  await b.client.sendDraft();
  assert.equal(a.composer.getSnapshot().draft, 'draft a');
  assert.equal(a.composer.getSnapshot().uploads[first.uploadId].status, 'uploaded');
  assert.equal(a.uploads[0].sessionId, 'session-a');
  assert.equal(b.uploads[0].sessionId, 'session-b');
});

test('pool eviction retains an otherwise empty composer while local file intake is pending', async t => {
  const pool = new SessionClientPool({maxClients: 1, storage: null, setTimeout: () => 0, clearTimeout: () => {}});
  t.after(() => pool.dispose());
  const first = pool.acquire(backend('session-a')), composer = first.client.composer;
  const reading = deferred(), file = new File(['text'], 'delayed.txt', {type: 'text/plain'});
  file.text = () => reading.promise;
  const pending = composer.receiveFiles([file], capabilities);
  assert.equal(composer.getSnapshot().readingFiles, true);
  assert.equal(composer.getSnapshot().draft, '');
  first.release();
  const other = pool.acquire(backend('session-b'));
  assert.equal(first.client.disposed, true);
  other.release();
  const restored = pool.acquire(backend('session-a'));
  assert.equal(restored.client.composer, composer);
  reading.resolve('text'); await pending;
  assert.equal(restored.client.composer.getSnapshot().attachments[0].text, 'text');
  assert.equal(other.client.composer.getSnapshot().attachments.length, 0);
  restored.release();
});

test('pool view release and eviction retain the draft, request identity and receipt for a new SessionClient', async t => {
  const timers = new Map(), uploads = [], prompts = [];
  let timerId = 0, acknowledge = false;
  const pool = new SessionClientPool({maxClients: 1, storage: null,
    setTimeout: fn => {timers.set(++timerId, fn); return timerId;}, clearTimeout: id => timers.delete(id),
    createClient: (source, dependencies) => {
      const client = new SessionClient(source, {...dependencies, api: async () => ({ok: true}),
        uploadAttachment: async (sessionId, selected) => {uploads.push({sessionId, selected}); return receipt(selected);},
        stream: async (method, args, signal, emit) => {prompts.push({method, args}); if (acknowledge) ack(args, emit);}});
      client.publish({binding: {id: `acp:${source.sessionId}`}, capabilities});
      return client;
    },
  });
  t.after(() => pool.dispose());
  const first = pool.acquire(backend('session-a'));
  const [selected] = await select(first.client.composer);
  await assert.rejects(first.client.sendDraft(), {code: 'acknowledgment_unknown'});
  const composer = first.client.composer, requestId = composer.pending.requestId;
  first.release();
  const same = pool.acquire(backend('session-a'));
  assert.equal(same.client, first.client);
  assert.equal(same.client.composer.getSnapshot().uploads[selected.uploadId].status, 'uploaded');
  same.release();
  const other = pool.acquire(backend('session-b'));
  assert.equal(first.client.disposed, true);
  other.release();
  const restored = pool.acquire(backend('session-a'));
  assert.notEqual(restored.client, first.client);
  assert.equal(restored.client.composer, composer);
  assert.equal(composer.getSnapshot().attachments[0], selected);
  assert.equal(composer.getSnapshot().draft, 'inspect these files');
  assert.equal(composer.pending.requestId, requestId);
  assert.deepEqual(composer.getSnapshot().uploads[selected.uploadId].receipt, receipt(selected));
  acknowledge = true;
  await restored.client.sendDraft();
  assert.equal(uploads.length, 1);
  assert.deepEqual(prompts.map(call => call.args.requestId), [requestId, requestId]);
  assert.deepEqual(composer.getSnapshot().uploads, {});
  restored.release();
});

test('steering rejects file uploads before creating any remote file', async t => {
  const h = fixture(t);
  const [selected] = await select(h.composer);
  h.client.publish({running: true});
  await assert.rejects(h.client.sendDraft(), {code: 'steer_attachments_unsupported'});
  assert.equal(h.uploads.length, 0);
  assert.equal(h.prompts.length, 0);
  assert.equal(h.actions.length, 0);
  assert.equal(h.composer.getSnapshot().attachments[0], selected);
});

test('a rejected attachment steer can be sent unchanged as a prompt after the active turn ends', async t => {
  const h = fixture(t);
  const [selected] = await select(h.composer);
  h.client.publish({running: true});
  await assert.rejects(h.client.sendDraft(), {code: 'steer_attachments_unsupported'});
  assert.equal(h.uploads.length, 0);
  h.client.publish({running: false});
  await h.client.sendDraft();
  assert.equal(h.uploads.length, 1);
  assert.equal(h.uploads[0].attachment.uploadId, selected.uploadId);
  assert.equal(h.prompts[0].method, 'acpPrompt');
  assert.equal(h.composer.pending, null);
});

for (const kind of ['text', 'image']) {
  const file = () => kind === 'text'
    ? new File(['notes'], 'notes.txt', {type: 'text/plain'})
    : new File([new Uint8Array([137, 80, 78, 71])], 'image.png', {type: 'image/png'});

  test(`${kind} attachment steer rejection leaves no poisoned pending request and later sends as a prompt`, async t => {
    const h = fixture(t);
    const [selected] = await select(h.composer, [file()]);
    h.client.publish({running: true});
    await assert.rejects(h.client.sendDraft(), {code: 'steer_attachments_unsupported'});
    assert.equal(h.composer.pending, null);
    assert.equal(h.composer.getSnapshot().sending, false);
    assert.equal(h.composer.getSnapshot().attachments[0], selected);
    assert.match(h.composer.getSnapshot().error, /Keep attachments/);
    assert.equal(h.uploads.length, 0);
    assert.equal(h.prompts.length, 0);
    assert.equal(h.actions.length, 0);
    h.client.publish({running: false});
    await h.client.sendDraft();
    assert.equal(h.prompts[0].method, 'acpPrompt');
    assert.equal(h.prompts[0].args.attachments[0].name, selected.name);
    assert.equal(h.uploads.length, 0);
    assert.equal(h.composer.pending, null);
  });

  test(`unknown-ACK ${kind} prompt retries while running with the original request ID and operation`, async t => {
    let sends = 0;
    const h = fixture(t, {stream: async (method, args, signal, emit) => {if (++sends > 1) ack(args, emit);}});
    await select(h.composer, [file()]);
    await assert.rejects(h.client.sendDraft(), {code: 'acknowledgment_unknown'});
    const requestId = h.composer.pending.requestId;
    h.client.publish({running: true});
    await h.client.sendDraft();
    assert.deepEqual(h.prompts.map(call => call.method), ['acpPrompt', 'acpPrompt']);
    assert.deepEqual(h.prompts.map(call => call.args.requestId), [requestId, requestId]);
    assert.equal(h.actions.some(call => call.method === 'acpSteer'), false);
    assert.equal(h.uploads.length, 0);
  });
}

test('missing binding rejects before upload and leaves the local draft available', async t => {
  const h = fixture(t);
  const [selected] = await select(h.composer);
  h.client.publish({binding: null});
  await assert.rejects(h.client.sendDraft(), /not connected/);
  assert.equal(h.uploads.length, 0);
  assert.equal(h.prompts.length, 0);
  assert.equal(h.composer.getSnapshot().attachments[0], selected);
  assert.equal(h.composer.getSnapshot().sending, false);
});

test('Composer.begin cannot submit while real File text intake is pending', async () => {
  const composer = new ComposerSession('session', null), waiting = deferred();
  const file = new File(['slow text'], 'slow.txt', {type: 'text/plain'});
  Object.defineProperty(file, 'text', {value: () => waiting.promise});
  const reading = composer.receiveFiles([file], capabilities);
  assert.equal(composer.getSnapshot().readingFiles, true);
  assert.throws(() => composer.begin('prompt'), /still being read/);
  assert.equal(composer.pending, null);
  waiting.resolve('slow text');
  await reading;
  assert.equal(composer.getSnapshot().readingFiles, false);
  assert.equal(composer.getSnapshot().attachments[0].text, 'slow text');
  const {request} = composer.begin('prompt');
  assert.equal(request.attachments[0].text, 'slow text');
  composer.clear();
});

test('multiple views share one composer intake latch rather than duplicating concurrent file selection', async () => {
  const composer = new ComposerSession('session', null), waiting = deferred();
  const file = new File(['slow'], 'slow.txt', {type: 'text/plain'});
  let reads = 0;
  Object.defineProperty(file, 'text', {value: () => {reads++; return waiting.promise;}});
  const firstView = composer.receiveFiles([file], capabilities);
  await composer.receiveFiles([file, binary('ignored.zip')], capabilities);
  assert.equal(reads, 1);
  assert.equal(composer.getSnapshot().attachments.length, 0);
  waiting.resolve('slow');
  await firstView;
  assert.equal(composer.getSnapshot().attachments.length, 1);
  assert.equal(composer.getSnapshot().attachments[0].name, 'slow.txt');
});

test('clear invalidates late intake and prevents it from appending to a newer draft', async () => {
  const composer = new ComposerSession('session', null), waiting = deferred();
  const file = new File(['old'], 'old.txt', {type: 'text/plain'});
  Object.defineProperty(file, 'text', {value: () => waiting.promise});
  const old = composer.receiveFiles([file], capabilities);
  composer.clear();
  const [selected] = await select(composer, [binary('new.zip')], 'new draft');
  waiting.resolve('old');
  await old;
  assert.equal(composer.getSnapshot().readingFiles, false);
  assert.equal(composer.getSnapshot().draft, 'new draft');
  assert.deepEqual(composer.getSnapshot().attachments, [selected]);
});

test('late failed intake after clear cannot replace the newer draft error or attachments', async () => {
  const composer = new ComposerSession('session', null), waiting = deferred();
  const file = new File(['old'], 'old.txt', {type: 'text/plain'});
  Object.defineProperty(file, 'text', {value: () => waiting.promise});
  const old = composer.receiveFiles([file], capabilities), rejected = assert.rejects(old, {code: 'attachmentReadFailed'});
  composer.clear();
  await select(composer, [binary('new.zip')], 'new draft');
  waiting.reject(new Error('late disk failure'));
  await rejected;
  assert.equal(composer.getSnapshot().error, '');
  assert.equal(composer.getSnapshot().attachments[0].name, 'new.zip');
});

test('ACK clears only submitted upload receipts and preserves files added after the request snapshot', async t => {
  const started = deferred(), finish = deferred();
  const h = fixture(t, {stream: (method, args, signal, emit) => {started.resolve({args, emit}); return finish.promise;}});
  const [old] = await select(h.composer, [binary('old.zip')], 'old draft');
  const sending = h.client.sendDraft();
  const prompt = await started.promise;
  const [newer] = await prepareFileAttachments([binary('new.zip')], [], capabilities);
  h.composer.setDraft('new draft');
  h.composer.setAttachments(previous => [...previous, newer]);
  h.composer.setUpload(newer.uploadId, {status: 'uploaded', receipt: receipt(newer), remotePath: receipt(newer).remotePath});
  ack(prompt.args, prompt.emit);
  assert.equal(h.composer.getSnapshot().uploads[old.uploadId], undefined);
  assert.deepEqual(h.composer.getSnapshot().uploads[newer.uploadId].receipt, receipt(newer));
  assert.deepEqual(h.composer.getSnapshot().attachments, [newer]);
  assert.equal(h.composer.getSnapshot().draft, 'new draft');
  assert.equal(h.composer.pending, null);
  finish.resolve();
  await sending;
});

test('removing a file after unknown ACK retains its pending receipt until that request is acknowledged', async t => {
  const h = fixture(t, {stream: async () => {}});
  const [selected] = await select(h.composer);
  await assert.rejects(h.client.sendDraft(), {code: 'acknowledgment_unknown'});
  const requestId = h.composer.pending.requestId;
  h.composer.setAttachments([]);
  assert.equal(h.composer.getSnapshot().uploads[selected.uploadId].status, 'uploaded');
  h.client.acknowledge(requestId);
  assert.deepEqual(h.composer.getSnapshot().uploads, {});
  assert.equal(h.composer.pending, null);
});
