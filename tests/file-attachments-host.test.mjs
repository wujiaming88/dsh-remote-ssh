import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm, symlink, rename, stat, readdir, link, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { parse } from 'acorn';
import { createFiles, TRANSFER_LIMIT } from '../lib/files.js';
import { attachmentIdentity, attachmentCommand, attachmentText, BATCH_ATTACHMENT_LIMIT, REFERENCE_TEXT_LIMIT } from '../lib/file-attachments.js';
import { createSshExecutor, error } from '../lib/ssh.js';
import { normalizeAttachments } from '../lib/workspace-backend.js';
import { AcpSession } from '../lib/acp.js';

const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const profile = { id: 'p', name: 'local fixture', host: 'never-connect.invalid', user: 'fixture', authMethod: 'key' };
async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(join(parent, 'dsh-file-attachment-')));
  const remote = join(root, 'remote root'), mirror = join(root, 'mirror');
  await mkdir(remote); await mkdir(mirror);
  const calls = [];
  const ssh = createSshExecutor({ executable: 'local-only', spawnFn(executable, args) {
    assert.equal(executable, 'local-only'); calls.push(args.at(-1));
    return spawn('/bin/sh', ['-c', args.at(-1)], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: root, TMPDIR: root } });
  } });
  t.after(async () => {
    ssh.shutdown(); assert.equal(await realpath(root), root); assert.equal(dirname(resolve(root)), parent); assert.ok(basename(root).startsWith('dsh-file-attachment-'));
    await rm(root, { recursive: true, force: true });
  });
  const binding = { remote: true, cwd: mirror, workspace: { id: 'w', profileId: 'p', remotePath: remote, mirrorPath: mirror } };
  const files = createFiles({ ssh, configuration: { profile: () => profile }, resolveSession: async sessionId => { assert.ok(['A', 'B'].includes(sessionId)); return binding; } });
  const args = (name = 'document.zip', uploadId = randomUUID()) => ({ sessionId: 'A', uploadId, name });
  const upload = async (bytes = Buffer.from([0, 255, 128]), request = args()) => (await files.uploadAttachment(request, bytes)).attachment;
  const reference = descriptor => files.referenceAttachment({ ...descriptor, sessionId: 'A' });
  return { root, remote, mirror, files, binding, calls, ssh, args, upload, reference };
}

test('real Python upload is hash-idempotent, UUID-isolated, non-executing and canonical', async t => {
  const f = await fixture(t); const request = f.args("../报告 ' $(touch SHOULD_NOT_EXIST).zip");
  const bytes = Buffer.from('#!/bin/sh\ntouch SHOULD_NOT_EXIST\nPK\0\xff', 'utf8');
  const a = await f.upload(bytes, request), retry = await f.upload(bytes, request);
  assert.deepEqual(retry, a); assert.equal(a.version, hash(bytes)); assert.equal(a.size, bytes.length);
  assert.match(a.remotePath, /\.dsh-attachments\/[0-9a-f]{64}\/[0-9a-f-]{36}\//);
  assert.equal(attachmentIdentity({ ...request, name: a.name }, { reference: true }).name, a.name);
  assert.deepEqual(await readFile(a.remotePath), bytes); assert.equal((await stat(a.remotePath)).mode & 0o111, 0);
  const text = await f.reference(a); assert.equal(text.type, 'text'); assert.equal(text.name, a.name); assert.equal(text.size, a.size);
  assert.ok(text.text.includes(a.remotePath)); assert.ok(!text.text.includes('touch SHOULD_NOT_EXIST\nPK'));
  await assert.rejects(stat(join(f.root, 'SHOULD_NOT_EXIST')), { code: 'ENOENT' });
  const b = await f.upload(Buffer.from('different'), f.args(request.name)); assert.notEqual(a.remotePath, b.remotePath);
  await assert.rejects(f.upload(Buffer.from('conflict'), request), { code: 'file_conflict' });
  await assert.rejects(f.upload(bytes, { ...request, name: 'other.zip' }), { code: 'file_conflict' });
  assert.deepEqual(await readFile(a.remotePath), bytes);
});

test('canonical filenames remain safe and repeatable at Unicode byte boundaries', () => {
  for (const name of ['../..', '\0\n', '.lock', '-option.pdf', '文'.repeat(100) + '.pdf', ('a '.repeat(100)) + '.pdf', 'e\u0301.pdf']) {
    const args = { sessionId: 'A', uploadId: randomUUID().toUpperCase(), name };
    const identity = attachmentIdentity(args);
    assert.ok(Buffer.byteLength(identity.name) <= 180);
    for (const forbidden of ['/', '\\', '\0', '\n']) assert.ok(!identity.name.includes(forbidden));
    assert.equal(attachmentIdentity({ ...args, uploadId: identity.uploadId, name: identity.name }, { reference: true }).name, identity.name);
  }
});

test('concurrent retries publish once and differing content never overwrites', async t => {
  const f = await fixture(t), request = f.args(), bytes = Buffer.from('one');
  const results = await Promise.allSettled([f.upload(bytes, request), f.upload(bytes, request), f.upload(Buffer.from('two'), request)]);
  assert.equal(results[0].status, 'fulfilled'); assert.deepEqual(results[0], results[1]); assert.equal(results[2].reason.code, 'file_conflict');
  assert.equal(await readFile(results[0].value.remotePath, 'utf8'), 'one');
});

test('independent Python publishers serialize same UUID retries without relying on Host queue', async t => {
  const f = await fixture(t), identity = attachmentIdentity(f.args()), bytes = Buffer.alloc(1024 * 1024, 31);
  const command = attachmentCommand({ action: 'upload', root: f.remote, identity });
  const results = await Promise.all([f.ssh.run(profile, command, { input: bytes }), f.ssh.run(profile, command, { input: bytes })]);
  for (const result of results) { const publication = JSON.parse(result.stdout); assert.equal(publication.ok, true, result.stdout); assert.equal(publication.version, hash(bytes)); }
  assert.deepEqual(await readFile(join(f.remote, ...identity.parts)), bytes);
});

test('real Python safely recovers interrupted staging and post-publication hardlink residues', async t => {
  const f = await fixture(t), args = f.args(), identity = attachmentIdentity(args), path = join(f.remote, ...identity.parts);
  const pending = join(dirname(path), '.pending-' + 'a'.repeat(32));
  await mkdir(dirname(path), { recursive: true }); await writeFile(pending, 'interrupted partial bytes');
  const bytes = Buffer.from('complete upload'), a = await f.upload(bytes, args);
  assert.deepEqual(await readFile(path), bytes); await assert.rejects(lstat(pending), { code: 'ENOENT' });
  await link(path, pending); assert.equal((await stat(path)).nlink, 2);
  assert.deepEqual(await f.upload(bytes, args), a); assert.equal((await stat(path)).nlink, 1);
  await assert.rejects(lstat(pending), { code: 'ENOENT' });
  await assert.rejects(f.upload(Buffer.from('changed'), args), { code: 'file_conflict' });
  assert.deepEqual(await readFile(path), bytes);
});

test('recovery never deletes pending symlinks, foreign hardlinks, or unknown directory entries', async t => {
  const f = await fixture(t), outside = join(f.root, 'untouched'); await writeFile(outside, 'outside');
  for (const kind of ['symlink', 'hardlink', 'unknown']) {
    const args = f.args(), identity = attachmentIdentity(args), path = join(f.remote, ...identity.parts);
    const pending = join(dirname(path), kind === 'unknown' ? '.pending-not-ours' : '.pending-' + 'b'.repeat(32));
    await mkdir(dirname(path), { recursive: true });
    if (kind === 'symlink') await symlink(outside, pending);
    else if (kind === 'hardlink') await link(outside, pending);
    else await writeFile(pending, 'not staging');
    await assert.rejects(f.upload(Buffer.from('new'), args));
    assert.ok(await lstat(pending)); assert.equal(await readFile(outside, 'utf8'), 'outside');
    await assert.rejects(lstat(path), { code: 'ENOENT' });
  }
});

test('references reject forged paths, hashes, sizes, names, UUIDs and cross-session descriptors', async t => {
  const f = await fixture(t), a = await f.upload();
  for (const patch of [{ remotePath: '/etc/passwd' }, { version: hash('wrong') }, { size: a.size + 1 }]) await assert.rejects(f.reference({ ...a, ...patch }), { code: 'file_conflict' });
  for (const patch of [{ name: '../document.zip' }, { uploadId: '../escape' }, { version: 'bad' }, { size: -1 }, { size: TRANSFER_LIMIT + 1 }]) await assert.rejects(f.reference({ ...a, ...patch }), { code: 'bad_attachment' });
  await assert.rejects(f.files.referenceAttachment({ ...a, sessionId: 'B' }), { code: 'attachment_io_error' });
  await writeFile(a.remotePath, 'tampered'); await assert.rejects(f.reference(a), { code: 'file_conflict' });
});

test('real Python refuses symlink directories, symlink files and non-regular files', async t => {
  const f = await fixture(t), outside = join(f.root, 'outside'); await mkdir(outside);
  const storage = join(f.remote, '.dsh-attachments'); await symlink(outside, storage);
  await assert.rejects(f.upload(), { code: 'attachment_io_error' }); assert.deepEqual(await readdir(outside), []);
  // Rename the test-owned symlink, leaving its target untouched.
  assert.equal(dirname(storage), f.remote); await rename(storage, join(f.remote, 'saved-link'));
  const a = await f.upload(), target = a.remotePath;
  assert.ok(target.startsWith(storage + '/')); await rename(target, target + '.original'); await symlink(target + '.original', target);
  await assert.rejects(f.reference(a), { code: 'attachment_io_error' });
  assert.ok(target.startsWith(storage + '/')); await rename(target, target + '.symlink'); await mkdir(target);
  await assert.rejects(f.reference(a), { code: 'not_regular_file' });
});

test('empty files and exact 64 MiB succeed; JS and real Python independently reject overflow', async t => {
  const f = await fixture(t), empty = await f.upload(Buffer.alloc(0)); assert.equal(empty.size, 0); await f.reference(empty);
  const bytes = Buffer.alloc(TRANSFER_LIMIT, 165), a = await f.upload(bytes);
  assert.equal(a.size, TRANSFER_LIMIT); assert.equal(a.version, hash(bytes)); await f.reference(a);
  const before = f.calls.length;
  await assert.rejects(f.upload(Buffer.alloc(TRANSFER_LIMIT + 1)), { code: 'file_too_large' }); assert.equal(f.calls.length, before);
  const identity = attachmentIdentity(f.args('overflow.bin'));
  const result = await f.ssh.run(profile, attachmentCommand({ action: 'upload', root: f.remote, identity }), { input: Buffer.alloc(TRANSFER_LIMIT + 1), timeoutMs: 120000 });
  assert.equal(JSON.parse(result.stdout).code, 'file_too_large');
  await assert.rejects(stat(join(f.remote, ...identity.parts)), { code: 'ENOENT' });
});

test('archive, local workspace and pre-write revocation reject before publication', async t => {
  const f = await fixture(t); f.binding.archived = true;
  await assert.rejects(f.upload(), { code: 'session_archived' });
  f.binding.archived = false; f.binding.remote = false; await assert.rejects(f.upload(), { code: 'not_remote_workspace' }); f.binding.remote = true;
  await assert.rejects(f.files.uploadAttachment(f.args(), Buffer.from('x'), { beforeWrite: () => { throw error('remote_access_denied', 'revoked'); } }), { code: 'remote_access_denied' });
  assert.equal(f.calls.length, 0); assert.deepEqual(await readdir(f.remote), []);
});

test('explicit ACP text needs no optional capability, while legacy resource/image constraints remain', () => {
  const session = new AcpSession({ id: 'test', agent: 'claude', profile, remotePath: '/unused' });
  const blocks = normalizeAttachments([{ type: 'text', text: 'File reference', name: 'a.pdf', remotePath: '/remote/a.pdf', size: 0 }]);
  const prepared = session.preparePrompt('hello', { attachments: blocks });
  assert.deepEqual(prepared.prompt, [{ type: 'text', text: 'hello' }, { type: 'text', text: 'File reference' }]);
  assert.equal(prepared.attachments[0].name, 'a.pdf'); assert.equal(prepared.attachments[0].size, 0);
  assert.throws(() => session.preparePrompt('', { attachments: [{ text: 'legacy', name: 'a.txt' }] }), { code: 'attachment_unsupported' });
  session.capabilities = { agentCapabilities: { promptCapabilities: { embeddedContext: true, image: true } } };
  assert.equal(session.preparePrompt('', { attachments: [{ text: 'legacy', name: 'a.txt' }] }).prompt[0].type, 'resource');
  assert.throws(() => normalizeAttachments([{ type: 'text', text: 'x'.repeat(1048577) }]), { code: 'attachment_too_large' });
  assert.throws(() => normalizeAttachments([{ type: 'remote_file', text: 'bypass' }]), { code: 'attachment_reference_required' });
});

test('verified reference descriptions do not consume the full 1 MiB user text allowance', async t => {
  const f = await fixture(t), descriptor = await f.upload(), reference = await f.reference(descriptor);
  const userText = { text: 'a'.repeat(1048576), name: 'full.txt' };
  assert.equal(normalizeAttachments([userText, reference]).length, 2);
  assert.throws(() => normalizeAttachments([{ ...userText, text: userText.text + 'x' }, reference]), { code: 'attachment_too_large' });
  // Neither JSON round trips nor a string-key imitation can preserve the private Symbol.
  const forged = { ...JSON.parse(JSON.stringify(reference)), 'Host-verified file reference': true };
  assert.throws(() => normalizeAttachments([userText, forged]), { code: 'attachment_too_large' });
  const bounded = { ...reference, text: 'r'.repeat(REFERENCE_TEXT_LIMIT) };
  assert.equal(normalizeAttachments([userText, bounded]).length, 2);
  assert.throws(() => normalizeAttachments([userText, { ...bounded, text: bounded.text + 'r' }]), { code: 'attachment_too_large' });
});

// Production Host callbacks with service-only seams, never a fake DOM or React.
const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of Object.values(node)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const functionCode = name => { const node = find(ast, value => value.type === 'FunctionDeclaration' && value.id?.name === name); assert.ok(node); return source.slice(node.start, node.end); };
const route = find(ast, value => value.type === 'ObjectExpression' && value.properties.some(p => p.key?.name === 'path' && p.value?.right?.value === '/session-attachment-upload'));
const handler = route.properties.find(p => p.key?.name === 'handler').value;
const instantiate = new Function('ctx', 'host', 'error', 'TRANSFER_LIMIT', `${['authorize', 'failure', 'ensureResult', 'json', 'body'].map(functionCode).join('\n')} return ${source.slice(handler.start, handler.end)};`);
function routeFixture({ denied = false, revokeBody = false, revokeWrite = false, method = 'POST', chunks = [Buffer.from('raw')] } = {}) {
  const state = { allowed: !denied, reads: 0, writes: 0, uploadCalls: 0, actions: [] };
  const ctx = { connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, remoteAccess: { decide: ({ action, resources }) => { state.actions.push({ action, resources }); return { kind: state.allowed ? 'allow' : 'deny' }; } } };
  const host = { files: { uploadAttachment: async (args, bytes, { beforeWrite }) => { state.uploadCalls++; assert.equal(args.sessionId, 'A'); assert.deepEqual(bytes, Buffer.concat(chunks)); if (revokeWrite) state.allowed = false; await beforeWrite(); state.writes++; return { ok: true, attachment: { name: args.name } }; } } };
  const req = Readable.from((async function* () { state.reads++; for (const chunk of chunks) yield chunk; if (revokeBody) state.allowed = false; })());
  Object.assign(req, { method, url: '/remote-ssh/v3/session-attachment-upload?sessionId=A&uploadId=' + randomUUID() + '&name=a.pdf', headers: {} });
  const res = { headersSent: false, writeHead(status) { this.status = status; this.headersSent = true; }, end(value) { this.body = JSON.parse(value); } };
  return { state, res, run: () => instantiate(ctx, host, error, TRANSFER_LIMIT)(req, res) };
}

test('HTTP upload reuses sessionUpload authorization before body, after body, and before publication', async () => {
  for (const options of [{ denied: true }, { revokeBody: true }, { revokeWrite: true }]) {
    const f = routeFixture(options); await f.run(); assert.equal(f.res.status, 403); assert.equal(f.state.writes, 0);
    if (options.denied) assert.equal(f.state.reads, 0);
    if (options.revokeBody) assert.equal(f.state.uploadCalls, 0);
  }
  const f = routeFixture(); await f.run(); assert.equal(f.res.status, 200); assert.equal(f.state.writes, 1);
  assert.ok(f.state.actions.every(a => a.action === 'remoteSsh/sessionUpload'));
  assert.ok(f.state.actions.some(a => a.resources.some(r => r.kind === 'session' && r.id === 'A')));
  const wrong = routeFixture({ method: 'GET' }); await wrong.run(); assert.equal(wrong.res.status, 405); assert.equal(wrong.state.reads, 0);
});

test('HTTP raw body limit rejects overflow without calling publication', async () => {
  const f = routeFixture({ chunks: [Buffer.alloc(TRANSFER_LIMIT), Buffer.from('x')] }); await f.run();
  assert.equal(f.res.body.error.code, 'request_too_large'); assert.equal(f.state.uploadCalls, 0);
});

test('Host resolves remote_file first even with a malicious legacy path, then shares prepared attachments', async () => {
  const calls = [], session = {}, resolved = { sessionId: 'A' };
  const files = { referenceAttachment: async args => { calls.push(args); return { type: 'text', text: 'verified', name: 'safe.pdf' }; }, snapshotAttachment: () => { throw Error('Must not snapshot a remote_file'); } };
  let admitted;
  const recorder = { prepare: async (_session, _text, options) => { admitted = options.attachments; }, flush: async () => {} };
  const prepare = new Function('record', 'files', 'normalizeAttachments', 'attachRecorder', 'recorder', 'error', 'BATCH_ATTACHMENT_LIMIT', `${functionCode('preparePrompt')} return preparePrompt;`)(async () => ({ session, resolved }), files, normalizeAttachments, async () => {}, recorder, error, BATCH_ATTACHMENT_LIMIT);
  const result = await prepare({ attachments: [{ type: 'remote_file', path: '/etc/passwd', sessionId: 'B', name: 'safe.pdf' }] });
  assert.equal(calls[0].sessionId, 'A'); assert.strictEqual(result.attachments, admitted); assert.equal(admitted[0].text, 'verified');
});

test('Host enforces 256 MiB batch before remote reads and accepts the exact boundary', async () => {
  let reads = 0, admissions = 0;
  const files = { referenceAttachment: async args => { reads++; return attachmentText({ name: 'safe.pdf', remotePath: '/remote/safe.pdf', size: args.size }); } };
  const recorder = { prepare: async () => { admissions++; } };
  const prepare = new Function('record', 'files', 'normalizeAttachments', 'attachRecorder', 'recorder', 'error', 'BATCH_ATTACHMENT_LIMIT', `${functionCode('preparePrompt')} return preparePrompt;`)(async () => ({ session: {}, resolved: { sessionId: 'A' } }), files, normalizeAttachments, async () => {}, recorder, error, BATCH_ATTACHMENT_LIMIT);
  const attachments = Array.from({ length: 4 }, () => ({ type: 'remote_file', size: TRANSFER_LIMIT }));
  await assert.rejects(prepare({ attachments: [...attachments, { type: 'remote_file', size: 1 }] }), { code: 'attachment_too_large' });
  assert.equal(reads, 0); assert.equal(admissions, 0);
  await prepare({ attachments: [...attachments, { text: 'a'.repeat(1048576) }] });
  assert.equal(reads, 4); assert.equal(admissions, 1);
  const capabilities = new Function('TRANSFER_LIMIT', 'BATCH_ATTACHMENT_LIMIT', `${functionCode('capabilities')} return capabilities;`)(TRANSFER_LIMIT, BATCH_ATTACHMENT_LIMIT)();
  assert.equal(capabilities.attachments.maxBatchFileBytes, 268435456);
});
