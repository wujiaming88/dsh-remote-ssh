import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';
import * as sdk from '@agentclientprotocol/sdk';
import { connectAcp, normalizeCapabilities, patchClaudeSteeringSource, buildRemoteAcpLaunchSpec } from '../lib/acp-transport.js';
import { prepareSteeringPrompt } from '../lib/acp-steering.js';

const capabilities = { steering: { supported: true }, promptCapabilities: { image: true, embeddedContext: true } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const blob = mimeType => ({ type: 'resource', resource: { uri: 'attachment:example', mimeType, blob: 'aGVsbG8=' } });

test('native steering is negotiated only by a literal boolean true', () => {
  for (const supported of [false, undefined, null, 0, 1, 'true', 'false', {}, []]) {
    const normalized = normalizeCapabilities({ _meta: { steering: { supported } } });
    assert.deepEqual(normalized.steering, { supported: false, protocol: null });
    assert.throws(() => prepareSteeringPrompt('hello', { ...capabilities, steering: { supported } }, 'claude'), { code: 'steering_unsupported' });
  }
  assert.deepEqual(normalizeCapabilities({ _meta: { steering: { supported: true } } }).steering, { supported: true, protocol: '_session/steering' });
  // Claude's native prompt FIFO advertisement is not a steering advertisement.
  assert.equal(normalizeCapabilities({ agentCapabilities: { _meta: { claudeCode: { promptQueueing: true } } } }).steering.supported, false);
});

test('the Claude ACP priority patch is exact, idempotent and exposes later without changing defaults', () => {
  const source = [
    'const cap = { _meta: { steering: {',
    '    supported: true,',
    '} } };',
    'userMessage.priority =',
    '    (session.openUserInputs?.size ?? 0) > 0 ? STEER_PRIORITY_LATER : STEER_PRIORITY_NOW;',
  ].join('\n');
  const patched = patchClaudeSteeringSource(source);
  assert.equal(patched.patched, true);
  assert.match(patched.source, /priorities: \["now", "later"\]/);
  assert.match(patched.source, /params\._meta\?\.steering\?\.priority === "later"/);
  assert.equal(patched.source.includes('dsh-steering-priorities'), true);
  parse(patched.source, { ecmaVersion: 'latest', sourceType: 'module' });
  const serialized = new Function(`return (${patchClaudeSteeringSource.toString()})`)();
  assert.equal(serialized(source).source, patched.source);
  const launch = buildRemoteAcpLaunchSpec({ agent: 'claude', remotePath: '~/work', profile: { id: 'p', host: 'example', user: 'u', authMethod: 'key' } });
  assert.match(launch.bootstrapSource, /patchClaudeSteeringSource/);
  assert.doesNotThrow(() => new Function(launch.bootstrapSource));
  assert.equal(patchClaudeSteeringSource(patched.source).source, patched.source);
  assert.throws(() => patchClaudeSteeringSource('const unrelated = true;'), { code: 'steering_patch_unavailable' });
  assert.deepEqual(normalizeCapabilities({ _meta: { steering: { supported: true, priorities: ['later', 'later', 'bogus', 'now'] } } }).steering,
    { supported: true, protocol: '_session/steering', priorities: ['later', 'now'] });
});

test('native steering accepts common blocks intact without reading linked files', () => {
  const prompt = [
    { type: 'text', text: 'new direction' },
    { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' },
    { type: 'image', mimeType: 'image/jpeg', uri: 'https://example.invalid/image.jpg' },
    { type: 'resource_link', name: 'not-read', uri: 'file:///does-not-exist/not-read' },
    { type: 'resource', resource: { uri: 'attachment:text', text: 'context', mimeType: 'text/plain' } },
    blob('image/webp')
  ];
  const original = structuredClone(prompt);
  for (const agent of ['claude', 'codex', 'pi']) {
    assert.equal(prepareSteeringPrompt(prompt, capabilities, agent), prompt);
    assert.deepEqual(prepareSteeringPrompt('text', capabilities, agent), [{ type: 'text', text: 'text' }]);
  }
  assert.deepEqual(prompt, original);
});

test('steer validation rejects dropped types and honors advertised prompt capabilities', () => {
  for (const agent of ['claude', 'codex']) {
    for (const block of [{ type: 'audio', mimeType: 'audio/wav', data: 'aGVsbG8=' }, { type: 'future' }, { type: 'image', mimeType: 'image/svg+xml', data: 'aGVsbG8=' }, blob('application/zip')]) {
      assert.throws(() => prepareSteeringPrompt([block], capabilities, agent), { code: 'steer_content_unsupported' });
    }
    for (const [block, key] of [[{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }, 'image'], [blob('image/png'), 'image'], [blob('image/png'), 'embeddedContext']]) {
      for (const value of [false, 'true', undefined]) {
        assert.throws(() => prepareSteeringPrompt([block], { ...capabilities, promptCapabilities: { ...capabilities.promptCapabilities, [key]: value } }, agent), { code: 'steer_content_unsupported' });
      }
    }
    assert.throws(() => prepareSteeringPrompt([{ type: 'image', mimeType: 'image/png', uri: 'file:///secret/not-read' }], capabilities, agent), error => error.code === 'steer_content_unsupported' && !error.message.includes('/secret'));
  }
  assert.throws(() => prepareSteeringPrompt('text', capabilities, 'unknown'), { code: 'steering_unsupported' });
});

test('Claude blob support follows audited MIME conversion while Codex rejects base64-only document fallback', () => {
  for (const mime of ['application/pdf', 'text/markdown', 'text/plain; charset=utf-8', 'application/json', 'application/vnd.example+json', 'application/atom+xml']) {
    const prompt = [blob(mime)];
    assert.equal(prepareSteeringPrompt(prompt, capabilities, 'claude'), prompt);
    assert.throws(() => prepareSteeringPrompt(prompt, capabilities, 'codex'), { code: 'steer_content_unsupported' });
  }
  assert.doesNotThrow(() => prepareSteeringPrompt([blob('IMAGE/JPG; name=x')], capabilities, 'claude'));
  assert.throws(() => prepareSteeringPrompt([blob('IMAGE/JPG; name=x')], capabilities, 'codex'), { code: 'steer_content_unsupported' });
});

test('steer validation rejects malformed blocks without echoing payloads', () => {
  for (const prompt of [null, {}, []]) assert.throws(() => prepareSteeringPrompt(prompt, capabilities, 'claude'), { code: 'bad_prompt' });
  for (const block of [null, [], { type: 'text', text: 42 }, { type: 'resource_link', uri: 'file:///private' }, { type: 'resource', resource: { uri: 'attachment:x', text: 'x', blob: 'eA==' } }, blob(undefined), { type: 'resource', resource: { uri: 'attachment:x', blob: 'not base64', mimeType: 'text/plain' } }, { type: 'image', mimeType: 'image/png', data: 'not base64' }]) {
    assert.throws(() => prepareSteeringPrompt([block], capabilities, 'claude'), error => ['bad_attachment', 'steer_content_unsupported'].includes(error.code) && !error.message.includes('/private'));
  }
});

async function connectionFixture(t, { supported = true, outcome = { outcome: 'injected' } } = {}) {
  const calls = [], updates = [], promptStarted = deferred(), promptFinish = deferred();
  let connection;
  const controller = await connectAcp({
    launchSpec: { command: 'never-executed', args: [] }, sdk,
    onUpdate: update => updates.push(update),
    spawn() {
      const child = new EventEmitter();
      child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => true;
      const server = sdk.agent()
        .onRequest('initialize', () => ({ protocolVersion: 1, agentCapabilities: {}, _meta: { steering: { supported } } }))
        .onRequest('session/new', () => ({ sessionId: 'remote-session' }))
        .onRequest('session/prompt', async ctx => {
          calls.push({ method: ctx.method, params: ctx.params }); promptStarted.resolve();
          await promptFinish.promise;
          return { stopReason: 'end_turn' };
        })
        .onRequest('_session/steering', { parse: value => value }, ctx => { calls.push({ method: ctx.method, params: ctx.params }); return outcome; });
      connection = server.connect(sdk.ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin)));
      queueMicrotask(() => child.stderr.write('[dsh-acp-runtime] ' + JSON.stringify({ type: 'ready', cwd: '/remote' }) + '\n'));
      return child;
    }
  });
  t.after(async () => { promptFinish.resolve(); await connection.close(); await controller.dispose(); });
  await controller.ready;
  return { controller, calls, updates, promptStarted, promptFinish };
}

test('steering priority is carried only when explicitly requested', async t => {
  const f = await connectionFixture(t);
  await f.controller.steer('later', { priority: 'later' });
  await f.controller.steer('default');
  assert.deepEqual(f.calls[0].params._meta, { steering: { idleBehavior: 'promptRequired', priority: 'later' } });
  assert.deepEqual(f.calls[1].params._meta, { steering: { idleBehavior: 'promptRequired' } });
});

test('real SDK sends native steering blocks and idle opt-in while prompt remains pending; ACK is not a stop', { timeout: 3000 }, async t => {
  const f = await connectionFixture(t);
  let finished = false;
  const running = f.controller.prompt('original').then(result => { finished = true; return result; });
  await f.promptStarted.promise;
  const prompt = [{ type: 'text', text: 'steer' }, { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }, blob('image/jpeg')];
  assert.deepEqual(await f.controller.steer(prompt), { outcome: 'injected' });
  assert.equal(finished, false);
  assert.deepEqual(f.updates, []);
  assert.deepEqual(f.calls.map(c => c.method), ['session/prompt', '_session/steering']);
  assert.deepEqual(f.calls[1].params, { sessionId: 'remote-session', prompt, _meta: { steering: { idleBehavior: 'promptRequired' } } });
  f.promptFinish.resolve();
  assert.equal((await running).stopReason, 'end_turn');
  assert.equal(finished, true);
});

test('transport leaves an idle steering result to the owner without submitting a fallback prompt', { timeout: 3000 }, async t => {
  const f = await connectionFixture(t, { outcome: { outcome: 'promptRequired', reason: 'noRunningTurn' } });
  assert.deepEqual(await f.controller.steer('new'), { outcome: 'promptRequired', reason: 'noRunningTurn' });
  assert.deepEqual(f.calls.map(c => c.method), ['_session/steering']);
  assert.deepEqual(f.calls[0].params.prompt, [{ type: 'text', text: 'new' }]);
});

test('transport rejects false-looking string capability before extension RPC', { timeout: 3000 }, async t => {
  const f = await connectionFixture(t, { supported: 'false' });
  await assert.rejects(f.controller.steer('new'), { code: 'steering_unsupported' });
  assert.deepEqual(f.calls, []);
});
