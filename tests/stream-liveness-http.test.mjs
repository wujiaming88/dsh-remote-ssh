import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { DRAIN_TIMEOUT_MS, streamAcpSubscription } from '../lib/stream-liveness.js';

function sizedRecord(record, size) {
  record.padding = '';
  record.padding = 'x'.repeat(size - Buffer.byteLength(JSON.stringify(record)));
  assert.equal(Buffer.byteLength(JSON.stringify(record)), size);
  return record;
}

// Synthetic, realistic-sized public records only: no SSH, broker, or GUI involved.
const snapshot = sizedRecord({ sessionId: 'localhost-test', status: 'prompting', messages: [
  { role: 'user', content: [{ type: 'text', text: 'Inspect repository' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Working on the request' }] },
] }, 53_707);
const commands = sizedRecord({ type: 'commands', seq: 1, commands: [{ name: 'help', description: 'Help' }] }, 42_724);
const burst = [commands, ...Array.from({ length: 61 }, (_, i) => sizedRecord({
  type: 'update', seq: i + 2, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Progress' } },
}, 17 * 1024 + (i % 26) * 1024))];

test('real HTTP paused reader reaches independent drain deadline without cancelling admitted prompt', { timeout: 5_000 }, async t => {
  const activeStreams = new Set(), subscribers = new Set();
  const large = sizedRecord({ type: 'update', seq: 1 }, 16 * 1024 * 1024 - 1024);
  let request, response, serverResponse, streamTask, resolvePrompt, prompts = 0, deadlineFired = false;
  let notifyClose; const closed = new Promise(resolve => { notifyClose = resolve; });
  const server = http.createServer({ highWaterMark: 16 * 1024 }, (req, res) => {
    serverResponse = res; res.on('close', notifyClose);
    const session = {
      eventsSince: () => ({ reset: false }),
      subscribe(fn) { subscribers.add(fn); fn(large); return () => subscribers.delete(fn); },
      cancel: () => assert.fail('timeout must not cancel work'),
      close: () => assert.fail('timeout must not close session'),
    };
    streamTask = streamAcpSubscription({ session, req, res, activeStreams, permitted: () => true,
      // Exercise the real socket with an accelerated timer; assert production duration.
      setTimeout: (fn, delay) => {
        assert.equal(delay, DRAIN_TIMEOUT_MS);
        return setTimeout(() => { deadlineFired = true; fn(); }, 100);
      },
      prompt: () => { prompts++; return new Promise(resolve => { resolvePrompt = resolve; }); },
    });
  });
  t.after(async () => {
    resolvePrompt?.(); response?.destroy(); request?.destroy();
    for (const close of [...activeStreams]) close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  request = http.get(`http://127.0.0.1:${server.address().port}/events`);
  [response] = await once(request, 'response');
  response.pause(); response.on('error', () => {});
  await closed;
  assert.equal(deadlineFired, true); assert.equal(serverResponse.destroyed, true);
  assert.equal(activeStreams.size, 0); assert.equal(subscribers.size, 0);
  assert.equal(serverResponse.listenerCount('drain'), 0); assert.equal(prompts, 1);
  resolvePrompt(); await streamTask; assert.equal(prompts, 1);
});

for (const highWaterMark of [16 * 1024, 64 * 1024]) {
  for (const mode of ['snapshot', 'snapshot-and-command', 'bursty-replay', 'prompt-completes-during-replay']) {
    test(`real HTTP ${highWaterMark / 1024}KiB HWM: ${mode} preserves delivery across accepted backpressure`, { timeout: 5_000 }, async t => {
      const replay = mode === 'snapshot' ? [] : mode === 'snapshot-and-command' ? [commands] : burst;
      const finishing = mode === 'prompt-completes-during-replay';
      const activeStreams = new Set(), subscribers = new Set(), stateSubscribers = new Set();
      const metrics = { falseWrites: 0, drains: 0, prompts: 0 };
      let request, serverResponse, streamTask, serverFailure;
      const server = http.createServer({ highWaterMark }, (req, res) => {
        serverResponse = res;
        const write = res.write.bind(res);
        res.write = (...args) => {
          const result = write(...args);
          if (!result) metrics.falseWrites++;
          return result;
        };
        res.on('drain', () => metrics.drains++);
        const session = {
          eventsSince: () => ({ reset: false }),
          subscribe(fn) {
            subscribers.add(fn);
            for (const event of replay) fn(event);
            return () => subscribers.delete(fn);
          },
          subscribeState(fn) { stateSubscribers.add(fn); return () => stateSubscribers.delete(fn); },
          state: () => snapshot,
          cancel: () => assert.fail('delivery must not cancel work'),
          close: () => assert.fail('delivery must not close session'),
        };
        streamTask = streamAcpSubscription({ session, req, res, activeStreams, permitted: () => true,
          ...(finishing ? { prompt: () => {
            metrics.prompts++;
            for (const fn of subscribers) fn({ type: 'done', seq: 63 });
          } } : {}),
        }).catch(error => { serverFailure = error; res.destroy(); });
      });
      t.after(async () => {
        request?.destroy();
        for (const close of [...activeStreams]) close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      request = http.get(`http://127.0.0.1:${server.address().port}/events`);
      const [response] = await once(request, 'response');
      assert.equal(response.statusCode, 200);
      assert.match(response.headers['content-type'], /application\/x-ndjson/);
      response.setEncoding('utf8');
      const frames = []; let buffered = '';
      for await (const chunk of response) {
        buffered += chunk;
        let boundary;
        while ((boundary = buffered.indexOf('\n')) !== -1) {
          const frame = JSON.parse(buffered.slice(0, boundary)); buffered = buffered.slice(boundary + 1);
          frames.push(frame);
          if (!finishing && frame.type === 'snapshot') {
            assert.equal(activeStreams.size, 1, 'snapshot delivery must not end the subscription');
            for (const fn of subscribers) fn({ type: 'update', seq: 63, text: 'live after snapshot' });
          }
          if (!finishing && frame.seq === 63) {
            for (const close of [...activeStreams]) close();
          }
        }
      }
      await streamTask;
      assert.ifError(serverFailure);
      assert.equal(buffered, '');
      assert.deepEqual(frames, [
        { type: 'replay', reset: false, cursor: null }, ...replay,
        { type: 'snapshot', state: snapshot },
        finishing ? { type: 'done', seq: 63 } : { type: 'update', seq: 63, text: 'live after snapshot' },
      ]);
      if (highWaterMark === 16 * 1024 || mode !== 'snapshot') {
        assert.ok(metrics.falseWrites > 0, 'exercise real ServerResponse backpressure');
        assert.ok(metrics.drains > 0, 'real socket drain resumes delivery');
      }
      assert.equal(metrics.prompts, finishing ? 1 : 0);
      assert.equal(activeStreams.size, 0); assert.equal(subscribers.size, 0); assert.equal(stateSubscribers.size, 0);
      assert.equal(serverResponse.listenerCount('drain'), 1, 'only test instrumentation remains');
      t.diagnostic(JSON.stringify({ highWaterMark, snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)), replayRecords: replay.length, receivedFrames: frames.length, ...metrics }));
    });
  }
}
