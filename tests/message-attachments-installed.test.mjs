import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

// Isolated service instances, not the user's profile or live sessions. Binary
// storage is accessed only through the installed public AttachmentStore API.
if (!process.versions.electron) {
  test('installed DSH durable image/query integration', () => {
    assert.ok(process.env.DSH_NODE_EXECUTABLE);
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.env.DSH_NODE_EXECUTABLE, [fileURLToPath(import.meta.url)], { env, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /tests [1-9][0-9]*/); process.stdout.write(result.stdout);
  });
} else {
  const installed = createRequire(join(process.env.DSH_INSTALL_DIR, 'package.json'));
  const { Context } = await import(installed.resolve('@deepseek-ai/cordis'));
  const { SessionStore, SESSION_FORMAT_VERSION } = await import(installed.resolve('@deepseek-ai/dsh-session'));
  const { SessionProjectionRegistry } = await import(installed.resolve('@deepseek-ai/dsh-session-projection'));
  const { SessionQueryEngine } = await import(installed.resolve('@deepseek-ai/dsh-session-query'));
  const { LocalAttachmentStore } = await import(installed.resolve('@deepseek-ai/dsh-attachment-local'));
  const { RemoteTurnRecorder, remoteMessageId } = await import('../lib/remote-turn-recorder.js');
  const { createMessageAttachments } = await import('../lib/message-attachments.js');
  const { nativeContentConverter } = await import('../lib/native-content.js');
  const sharp = createRequire(installed.resolve('@deepseek-ai/dsh-attachment-local/package.json'))('sharp');

  test('public admission/readImage and SessionQuery restore named and rc10 images', async () => {
    const home = await mkdtemp(join(tmpdir(), 'remote-sent-images-'));
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 128, g: 24, b: 12 } } }).png().toBuffer();
    let seed, expected;
    for (const restored of [false, true]) {
      const ctx = new Context(); let recorder;
      try {
        await ctx.plugin(SessionStore);
        await ctx.plugin(SessionProjectionRegistry);
        await ctx.plugin(SessionQueryEngine);
        await ctx.plugin(LocalAttachmentStore, { dshHome: home });
        recorder = await RemoteTurnRecorder.create({ sessions: ctx.sessions, sessionProjections: ctx.sessionProjections });
        const session = ctx.sessions.prepare('native', seed ? { seed, eventState: 'detached', inheritedEventCount: 0, meta: { version: SESSION_FORMAT_VERSION, id: 'native', createdAt: 0, cwd: home, isSeeded: false } } : { meta: { cwd: home } });
        ctx.sessions.enter(session); ctx.sessions.announce(session);
        if (!restored) {
          const content = await nativeContentConverter(ctx.attachments)([{ type: 'image', name: 'original.png', mimeType: 'image/png', data: image.toString('base64') }]);
          const rc10 = structuredClone(content); delete rc10[0].attachment.name;
          for (const [index, parts] of [content, rc10].entries()) session.append([
            ['turn/start', { turn: index + 1 }],
            ['user/message', { id: remoteMessageId('native', 'acp', 'turn-' + index), role: 'user', source: { kind: 'user' }, content: parts }, { surfaceOp: 'append' }],
            ['turn/end', { turn: index + 1, reason: { kind: 'completed' } }],
          ]);
          seed = structuredClone(session.snapshotEvents()); // Test-only Session reader.
        }
        const service = createMessageAttachments({
          record: async args => { assert.equal(args.id, 'acp'); assert.equal(args.dshSessionId, 'native'); return { state: { dshSessionId: 'native', pendingTurns: 0 } }; },
          query: ctx.sessionQuery, recorder, attachments: ctx.attachments,
        });
        const current = [];
        for (const turnId of ['turn-0', 'turn-1']) {
          const args = { id: 'acp', dshSessionId: 'native', turnId };
          const listed = await service.list(args); assert.equal(listed.status, 'available');
          assert.equal(listed.attachments[0].name, turnId === 'turn-0' ? 'original.png' : 'image');
          const read = await service.read({ ...args, index: 0 });
          assert.ok(read.data.length > 0); assert.equal(read.mimeType, listed.attachments[0].mimeType);
          assert.doesNotMatch(JSON.stringify(listed), /attachmentId|base64|sha256/);
          current.push({ listed, data: Buffer.from(read.data).toString('base64') });
        }
        if (restored) assert.deepEqual(current, expected); else expected = current;
      } finally { if (recorder) await recorder.dispose(); await ctx.fiber.dispose(); }
    }
  });
}
