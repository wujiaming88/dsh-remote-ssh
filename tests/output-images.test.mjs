import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSshExecutor } from '../lib/ssh.js';
import { createOutputImages, outputImageHandler, OUTPUT_IMAGE_LIMIT } from '../lib/output-images.js';

const code = expected => error => { assert.equal(error.code, expected); return true; };
const PROFILE = { id: 'profile-1', name: 'Fixture', host: 'remote.invalid', user: 'fixture', authMethod: 'key' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from('GIF89a', 'ascii');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('WEBP', 'ascii')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', 'utf8');

const baseArgs = () => ({ id: 'acp', dshSessionId: 'dsh', turnId: 'turn-1', generation: 'gen-1', fromSeq: 1, throughSeq: 2, sourceSessionId: 'remote-session', href: '/tmp/lark-auth-qr.png' });

function textEvent(seq, text, overrides = {}) {
  return { seq, type: 'text', text, generation: 'gen-1', sessionId: 'remote-session', turnId: 'turn-1', append: true, messageId: 'm1', ...overrides };
}

/** Every process is synthetic or local; ssh and user Git/SSH config are never opened. */
async function fixture(t, { events = [], resolved = {}, state = {}, recordImpl = null } = {}) {
  const parent = await realpath(tmpdir());
  const base = await realpath(await mkdtemp(join(parent, 'dsh-output-image-')));
  const home = join(base, 'home');
  await mkdir(home);
  t.after(async () => { await rm(base, { recursive: true, force: true }); });
  const calls = { record: 0, events: 0, profile: 0, ssh: 0 };
  const commands = [];
  const ssh = createSshExecutor({
    executable: 'output-image-fixture',
    spawnFn(executable, args) {
      assert.equal(executable, 'output-image-fixture');
      const command = args.at(-1);
      commands.push(command); calls.ssh++;
      return spawn('/bin/sh', ['-c', command], {
        cwd: base, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH, HOME: home, LANG: 'C' },
      });
    },
  });
  t.after(() => ssh.shutdown());
  const defaultResolved = { remote: true, workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~', mirrorPath: join(base, 'mirror') }, binding: { id: 'acp', profileId: 'profile-1' }, canonicalRemotePath: null, ...resolved };
  const defaultState = { sessionId: 'remote-session', dshSessionId: 'dsh', ...state };
  const record = recordImpl || (async args => {
    calls.record++;
    if (args.id !== 'acp' || args.dshSessionId !== 'dsh') throw Object.assign(Error('binding mismatch'), { code: 'binding_mismatch' });
    return { session: { id: 'acp' }, state: defaultState, resolved: defaultResolved };
  });
  const runtime = { events: async (id, cursor, opts) => {
    calls.events++;
    const since = cursor.seq, limit = opts.limit;
    const all = events.filter(e => e.seq > since).sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, limit);
    return { events: page, reset: false, hasMore: all.length > page.length, cursor: { generation: cursor.generation, seq: page.at(-1)?.seq ?? since } };
  } };
  const configuration = { profile: id => { calls.profile++; assert.equal(id, 'profile-1'); return PROFILE; } };
  const service = createOutputImages({ record, runtime, configuration, ssh });
  return { service, commands, home, base, calls, record, runtime, configuration, ssh, defaultResolved, defaultState };
}

async function writeAt(dir, name, bytes) { const path = join(dir, name); await writeFile(path, bytes); return path; }

test('argument bounds reject missing, oversized, and non-contiguous identities before any IO', async t => {
  const f = await fixture(t);
  const invalid = [
    undefined,
    {},
    { ...baseArgs(), id: '' },
    { ...baseArgs(), id: 42 },
    { ...baseArgs(), dshSessionId: '' },
    { ...baseArgs(), turnId: '' },
    { ...baseArgs(), turnId: 'x'.repeat(1025) },
    { ...baseArgs(), generation: '' },
    { ...baseArgs(), fromSeq: 0, throughSeq: 2 },
    { ...baseArgs(), fromSeq: 3, throughSeq: 2 },
    { ...baseArgs(), fromSeq: 1, throughSeq: 8193 }, // span 8192 is not < 8192
    { ...baseArgs(), fromSeq: '1', throughSeq: 2 },
    { ...baseArgs(), sourceSessionId: '' },
    { ...baseArgs(), href: '' },
    { ...baseArgs(), href: 'x'.repeat(4097) },
    { ...baseArgs(), href: '/tmp/a\0b.png' },
    { ...baseArgs(), href: '/tmp/a\rb.png' },
    { ...baseArgs(), href: '/tmp/a\nb.png' },
  ];
  for (const args of invalid) await assert.rejects(f.service.read(args), code('invalid_image_request'));
  assert.equal(f.calls.record, 0); assert.equal(f.calls.ssh, 0); assert.equal(f.calls.events, 0);
});

test('source session mismatch is rejected without reading events', async t => {
  const f = await fixture(t, { events: [textEvent(1, '![x](/tmp/lark-auth-qr.png)')] });
  await assert.rejects(f.service.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, sourceSessionId: 'other-session' }), code('source_session_mismatch'));
  assert.equal(f.calls.events, 0); assert.equal(f.calls.ssh, 0);
});

test('seq gaps, cross-turn, and cross-source text are rejected as non-contiguous', async t => {
  const gap = await fixture(t, { events: [textEvent(1, '![x](/tmp/'), textEvent(3, 'lark-auth-qr.png)')] });
  await assert.rejects(gap.service.read({ ...baseArgs(), fromSeq: 1, throughSeq: 3 }), code('event_gap'));

  const crossTurn = await fixture(t, { events: [textEvent(1, '![x](/tmp/'), textEvent(2, 'lark-auth-qr.png)', { turnId: 'turn-2' })] });
  await assert.rejects(crossTurn.service.read({ ...baseArgs(), fromSeq: 1, throughSeq: 2 }), code('event_gap'));

  const crossSource = await fixture(t, { events: [textEvent(1, '![x](/tmp/'), textEvent(2, 'lark-auth-qr.png)', { sessionId: 'other-session' })] });
  await assert.rejects(crossSource.service.read({ ...baseArgs(), fromSeq: 1, throughSeq: 2 }), code('event_gap'));

  assert.equal(gap.calls.ssh, 0); assert.equal(crossTurn.calls.ssh, 0); assert.equal(crossSource.calls.ssh, 0);
});

test('reconstructed text must contain the exact href; a non-matching or missing reference is rejected', async t => {
  const f = await fixture(t, { events: [textEvent(1, '![x](/tmp/'), textEvent(2, 'other.png)')] });
  await assert.rejects(f.service.read(baseArgs()), code('image_reference_mismatch'));
  const noImage = await fixture(t, { events: [textEvent(1, 'hello'), textEvent(2, ' world')] });
  await assert.rejects(noImage.service.read(baseArgs()), code('image_reference_mismatch'));
  assert.equal(f.calls.ssh, 0); assert.equal(noImage.calls.ssh, 0);
});

test('an ambiguous (duplicate) reference is rejected before any IO', async t => {
  const f = await fixture(t, { events: [textEvent(1, '![a](/tmp/lark-auth-qr.png) '), textEvent(2, '![b](/tmp/lark-auth-qr.png)')] });
  await assert.rejects(f.service.read(baseArgs()), code('image_reference_mismatch'));
  assert.equal(f.calls.ssh, 0);
});

test('append:false resets the accumulated text, so a replaced chunk is not proof', async t => {
  const f = await fixture(t, { events: [textEvent(1, '![x](/tmp/lark-auth-qr.png)', { append: true }), textEvent(2, 'completely different text', { append: false })] });
  await assert.rejects(f.service.read(baseArgs()), code('image_reference_mismatch'));
  assert.equal(f.calls.ssh, 0);
});

test('absolute, ~/, and relative hrefs resolve to server-side paths and read PNG bytes', async t => {
  // absolute
  {
    const f = await fixture(t);
    const absPath = join(f.base, 'abs.png');
    await writeFile(absPath, PNG);
    const events = [textEvent(1, '![x](' + absPath + ')')];
    const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
    const result = await svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: absPath });
    assert.deepEqual(result.data, PNG); assert.equal(result.mimeType, 'image/png'); assert.equal(result.name, 'abs.png');
  }
  // ~/
  {
    const f = await fixture(t);
    await writeFile(join(f.home, 'qr.png'), PNG);
    const events = [textEvent(1, '![x](~/qr.png)')];
    const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
    const result = await svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: '~/qr.png' });
    assert.deepEqual(result.data, PNG); assert.equal(result.mimeType, 'image/png'); assert.equal(result.name, 'qr.png');
  }
  // relative
  {
    const f = await fixture(t);
    const root = join(f.base, 'remote-root'); await mkdir(join(root, 'sub'), { recursive: true });
    await writeFile(join(root, 'sub', 'qr.png'), PNG);
    const events = [textEvent(1, '![x](sub/qr.png)')];
    const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: root } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
    const result = await svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: 'sub/qr.png' });
    assert.deepEqual(result.data, PNG); assert.equal(result.mimeType, 'image/png'); assert.equal(result.name, 'qr.png');
  }
});

test('traversal, URL, dash-prefixed, and ~user hrefs are rejected', async t => {
  const f = await fixture(t, { events: [textEvent(1, '![x](../etc/passwd)')] });
  for (const href of ['../etc/passwd', '/tmp/a/../b.png', 'http://evil/x.png', '-flag.png', '~other/x.png']) {
    const events = [textEvent(1, '![x](' + href + ')')];
    const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
    await assert.rejects(svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href }), code('invalid_image_href'));
  }
  assert.equal(f.calls.ssh, 0);
});

test('symlink (final and intermediate) is rejected without following it', async t => {
  // final-component symlink
  {
    const f = await fixture(t);
    const target = join(f.base, 'target.png'); await writeFile(target, PNG);
    const link = join(f.base, 'link.png'); await symlink(target, link);
    const events = [textEvent(1, '![x](' + link + ')')];
    const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
    await assert.rejects(svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: link }), code('not_regular_file'));
  }
  // intermediate symlink directory
  {
    const f = await fixture(t);
    const elsewhere = join(f.base, 'elsewhere'); await mkdir(elsewhere);
    await writeFile(join(elsewhere, 'qr.png'), PNG);
    const linkdir = join(f.base, 'linkdir'); await symlink(elsewhere, linkdir);
    const href = join(linkdir, 'qr.png');
    const events = [textEvent(1, '![x](' + href + ')')];
    const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
    await assert.rejects(svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href }), code('path_through_symlink'));
  }
});

test('files larger than 8 MiB are rejected remotely as file_too_large', async t => {
  const f = await fixture(t);
  const big = join(f.base, 'big.png');
  await writeFile(big, Buffer.concat([PNG, Buffer.alloc(OUTPUT_IMAGE_LIMIT - PNG.length + 1)]));
  const events = [textEvent(1, '![x](' + big + ')')];
  const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
  await assert.rejects(svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: big }), code('file_too_large'));
});

test('SVG magic is rejected as unsupported_image_type even when small', async t => {
  const f = await fixture(t);
  const svg = join(f.base, 'x.svg');
  await writeFile(svg, SVG);
  const events = [textEvent(1, '![x](' + svg + ')')];
  const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
  await assert.rejects(svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: svg }), code('unsupported_image_type'));
});

test('JPEG, GIF and WebP magic map to their MIME types', async t => {
  for (const [bytes, mime] of [[JPEG, 'image/jpeg'], [GIF, 'image/gif'], [WEBP, 'image/webp']]) {
    const f = await fixture(t);
    const path = join(f.base, 'img');
    await writeFile(path, bytes);
    const events = [textEvent(1, '![x](' + path + ')')];
    const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
    const result = await svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: path });
    assert.equal(result.mimeType, mime); assert.deepEqual(result.data, bytes);
  }
});

test('a binding change after IO is re-checked and rejected', async t => {
  const f = await fixture(t);
  const path = join(f.base, 'ok.png'); await writeFile(path, PNG);
  const events = [textEvent(1, '![x](' + path + ')')];
  let recordCalls = 0;
  const record = async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: recordCalls++ === 0 ? 'acp' : 'acp-changed' }, canonicalRemotePath: null } });
  const svc = createOutputImages({ record, runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
  await assert.rejects(svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: path }), code('binding_mismatch'));
});

test('read success returns exact bytes, mime type and basename without remote writes', async t => {
  const f = await fixture(t);
  const path = join(f.base, '授权二维码.png'); await writeFile(path, PNG);
  const events = [textEvent(1, '![授权二维码](' + path + ')')];
  const svc = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
  const result = await svc.read({ ...baseArgs(), fromSeq: 1, throughSeq: 1, href: path });
  assert.deepEqual(result.data, PNG); assert.equal(result.mimeType, 'image/png'); assert.equal(result.name, '授权二维码.png');
  assert.equal(f.commands.length, 1); assert.ok(!f.commands[0].includes('> '), 'read must not write the remote file');
});

function response() { return { headersSent: false, writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; }, end(body) { this.body = body; } }; }
function imageRequest(args) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== null) params.set(k, typeof v === 'number' ? String(v) : v);
  return Object.assign(new EventEmitter(), { method: 'GET', url: '/remote-ssh/v3/output-image?' + params.toString() });
}

test('output image route authorizes before read and rechecks revocation after a verified read', async t => {
  const f = await fixture(t);
  const path = join(f.base, 'qr.png'); await writeFile(path, PNG);
  const events = [textEvent(1, '![x](' + path + ')')];
  const images = createOutputImages({ record: async () => ({ session: { id: 'acp' }, state: { sessionId: 'remote-session' }, resolved: { workspace: { id: 'ws', profileId: 'profile-1', remotePath: '~' }, binding: { id: 'acp' }, canonicalRemotePath: null } }), runtime: { events: async () => ({ events, reset: false, hasMore: false, cursor: { generation: 'gen-1', seq: 1 } }) }, configuration: { profile: () => PROFILE }, ssh: f.ssh });
  const args = { ...baseArgs(), fromSeq: 1, throughSeq: 1, href: path };
  let allowed = false;
  const handler = outputImageHandler({ images, authorize: (_req, method, identity) => {
    assert.equal(method, 'outputImage'); assert.equal(identity.dshSessionId, 'dsh');
    if (!allowed) throw Object.assign(Error('denied'), { status: 403, code: 'remote_access_denied' });
    return () => allowed;
  } });
  let res = response(); await handler(imageRequest(args), res); assert.equal(res.status, 403); assert.equal(f.calls.ssh, 0);
  allowed = true; res = response(); await handler(imageRequest(args), res); assert.equal(res.status, 200); assert.deepEqual(res.body, PNG);
  assert.equal(res.headers['content-type'], 'image/png'); assert.equal(res.headers['content-length'], PNG.length);
  assert.equal(res.headers['cache-control'], 'no-store'); assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['content-security-policy'], "default-src 'none'; sandbox");
  assert.match(res.headers['content-disposition'], /^inline; filename\*=UTF-8''/);
  // revocation mid-read is still surfaced after the verified read
  images.read = async () => { allowed = false; return { data: PNG, mimeType: 'image/png', name: 'qr.png' }; };
  res = response(); await handler(imageRequest(args), res); assert.equal(res.status, 403); assert.doesNotMatch(String(res.body), /iVBOR|0x89/);
});

test('output image route serializes errors as JSON without leaking remote content', async t => {
  const images = { read: async () => { throw Object.assign(Error('remote secret path failed'), { code: 'image_io_error' }); } };
  const handler = outputImageHandler({ images, authorize: () => () => true });
  const res = response(); await handler(imageRequest(baseArgs()), res);
  assert.equal(res.status, 404); assert.deepEqual(JSON.parse(res.body), { ok: false, error: { code: 'image_io_error', message: 'Output image is unavailable' } });
  assert.doesNotMatch(res.body, /secret path/);
});
