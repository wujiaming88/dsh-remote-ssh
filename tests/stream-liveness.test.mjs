import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DRAIN_TIMEOUT_MS, MAX_PENDING_BYTES, HEARTBEAT_INTERVAL_MS, streamAcpSubscription } from '../lib/stream-liveness.js';

class Clock {
  now = 0;
  nextId = 0;
  timers = new Map();
  unrefs = 0;
  setInterval = (callback, period) => {
    const handle = { id: ++this.nextId, unref: () => this.unrefs++ };
    this.timers.set(handle, { callback, period, at: this.now + period });
    return handle;
  };
  clearInterval = handle => { this.timers.delete(handle); };
  setTimeout = (callback, delay) => {
    const handle = this.setInterval(callback, delay);
    this.timers.get(handle).once = true;
    return handle;
  };
  clearTimeout = this.clearInterval;
  advance(ms) {
    const until = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.now = due[1].at;
      if (due[1].once) this.timers.delete(due[0]);
      else due[1].at += due[1].period;
      due[1].callback();
    }
    this.now = until;
  }
}
class Response extends EventEmitter {
  frames = [];
  heads = [];
  ends = 0;
  writableEnded = false;
  writeHead(...args) { this.heads.push(args); }
  write(line) {
    assert.ok(!this.writableEnded && !this.destroyed && !this.closed, 'no write after response close');
    this.frames.push(JSON.parse(line));
    return this.onWrite?.(this.frames.at(-1)) ?? true;
  }
  end() { this.ends++; this.writableEnded = true; this.emit('close'); }
  destroy() { this.destroyed = true; this.emit('close'); }
}
function fixture(options = {}) {
  const clock = new Clock(), req = new EventEmitter(), res = new Response(), activeStreams = new Set();
  const subscribers = new Set(), journal = [{ type: 'update', seq: 7, text: 'durable' }];
  const state = { allowed: true, disposed: false, checks: 0, unsubscribed: 0, subscriptions: 0 };
  const session = {
    eventsSince(cursor, opts) { assert.equal(cursor, 'generation:6'); assert.deepEqual(opts, { limit: 1 }); return { reset: false }; },
    subscribe(fn, opts) {
      state.subscriptions++;
      assert.deepEqual(opts, { cursor: 'generation:6', replay: true });
      for (const event of journal) fn(event);
      options.duringSubscribe?.({ fn, res, state });
      subscribers.add(fn);
      return () => { state.unsubscribed++; subscribers.delete(fn); };
    },
    emit() { assert.fail('HTTP control frame must never enter ACP journal'); },
    cancel() { assert.fail('HTTP cleanup must not cancel Agent'); },
    close() { assert.fail('HTTP cleanup must not close Agent'); },
  };
  const params = { session, req, res, cursor: 'generation:6', activeStreams,
    permitted: () => { state.checks++; if (state.policyError) throw new Error('policy unavailable'); return state.allowed; },
    isDisposed: () => state.disposed, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout };
  return { clock, req, res, state, journal, activeStreams, subscribers,
    start: extra => streamAcpSubscription({ ...params, ...extra }),
    emit: event => { for (const fn of [...subscribers]) fn(event); },
  };
}
function clean(f) {
  assert.equal(f.clock.timers.size, 0);
  assert.equal(f.activeStreams.size, 0);
  assert.equal(f.subscribers.size, 0);
  assert.equal(f.res.listenerCount('close'), 0);
  assert.equal(f.res.listenerCount('error'), 0);
  assert.equal(f.res.listenerCount('drain'), 0);
  assert.equal(f.req.listenerCount('aborted'), 0);
}

test('first replay unchanged; actual unsequenced heartbeat every 15 seconds, never journaled', async () => {
  const f = fixture();
  const close = await f.start();
  assert.equal(HEARTBEAT_INTERVAL_MS, 15_000);
  assert.deepEqual(f.res.frames, [{ type: 'replay', reset: false, cursor: 'generation:6' }, ...f.journal]);
  f.clock.advance(14_999);
  assert.equal(f.res.frames.length, 2);
  f.clock.advance(1);
  assert.deepEqual(f.res.frames.at(-1), { type: 'heartbeat' });
  f.clock.advance(30_000);
  assert.deepEqual(f.res.frames.slice(2), Array(3).fill({ type: 'heartbeat' }));
  assert.equal(f.state.checks, 4, 'recheck policy on every heartbeat');
  assert.deepEqual(f.journal, [{ type: 'update', seq: 7, text: 'durable' }]);
  assert.equal(f.clock.unrefs, 1);
  close(); clean(f);
});

test('idle revocation sends one terminal unsequenced denial and stops within 15 seconds', async () => {
  const f = fixture(); await f.start(); f.state.allowed = false;
  f.clock.advance(15_000);
  assert.deepEqual(f.res.frames.at(-1), { type: 'error', code: 'remote_access_denied', message: 'Access to this remote Session was revoked' });
  assert.equal(f.res.frames.some(frame => frame.type === 'heartbeat'), false);
  assert.equal(f.res.ends, 1); clean(f);
  const count = f.res.frames.length;
  f.clock.advance(60_000); f.emit({ type: 'update', seq: 8, text: 'secret' });
  assert.equal(f.res.frames.length, count);
});

test('event revocation signals denial instead of leaking the event or silently closing', async () => {
  const f = fixture(); await f.start(); f.state.allowed = false;
  f.emit({ type: 'update', seq: 8, text: 'secret' });
  assert.equal(f.res.frames.at(-1).code, 'remote_access_denied');
  assert.equal(f.res.frames.some(frame => frame.text === 'secret'), false);
  clean(f);
});

test('policy errors fail closed without writing a heartbeat', async () => {
  const f = fixture(); await f.start(); f.state.policyError = true;
  f.clock.advance(15_000);
  assert.equal(f.res.frames.at(-1).code, 'remote_access_denied'); clean(f);
});

for (const reason of ['response close', 'response error', 'request abort', 'Host dispose']) {
  test(`${reason} removes timer, subscriber and listeners without cancelling Agent`, async () => {
    const f = fixture(); await f.start();
    if (reason === 'response close') { f.res.closed = true; f.res.emit('close'); }
    if (reason === 'response error') f.res.emit('error', new Error('socket error'));
    if (reason === 'request abort') { f.req.aborted = true; f.req.emit('aborted'); }
    if (reason === 'Host dispose') { f.state.disposed = true; for (const close of [...f.activeStreams]) close(); }
    clean(f);
    const count = f.res.frames.length; f.clock.advance(60_000);
    assert.equal(f.res.frames.length, count);
  });
}

test('heartbeat notices Host disposal even if disposal callback has not run', async () => {
  const f = fixture(); await f.start(); f.state.disposed = true;
  f.clock.advance(15_000); assert.equal(f.res.frames.length, 2); clean(f);
});

for (const flag of ['destroyed', 'closed', 'writableEnded', 'writableFinished']) {
  test(`preclosed response (${flag}) never writes, subscribes or schedules`, async () => {
    const f = fixture(); f.res[flag] = true;
    await f.start(); assert.equal(f.res.heads.length, 0); assert.equal(f.res.frames.length, 0);
    assert.equal(f.state.subscriptions, 0); assert.equal(f.res.ends, 0); clean(f);
  });
}

test('synchronous replay revocation disposes the subscription returned after close', async () => {
  const f = fixture({ duringSubscribe: ({ fn, state }) => { state.allowed = false; fn({ type: 'update', seq: 8, text: 'secret' }); } });
  await f.start(); assert.equal(f.res.frames.at(-1).code, 'remote_access_denied');
  assert.equal(f.state.unsubscribed, 1); assert.equal(f.clock.unrefs, 0); clean(f);
});

test('synchronous response close inside subscribe leaves no orphan timer or subscriber', async () => {
  const f = fixture({ duringSubscribe: ({ res }) => { res.closed = true; res.emit('close'); } });
  await f.start(); assert.equal(f.state.unsubscribed, 1); assert.equal(f.clock.unrefs, 0); clean(f);
});

for (const type of ['replay', 'update', 'heartbeat']) {
  test(`backpressure on ${type} waits for drain without duplicating an accepted frame`, async () => {
    const f = fixture(); f.res.onWrite = frame => frame.type !== type;
    const close = await f.start(); if (type === 'heartbeat') f.clock.advance(15_000);
    assert.equal(f.res.frames.at(-1).type, type); assert.equal(f.res.ends, 0);
    assert.equal(f.activeStreams.size, 1); assert.equal(f.res.listenerCount('drain'), 1);
    const accepted = [...f.res.frames];
    f.emit({ type: 'update', seq: 8, text: 'queued' });
    assert.deepEqual(f.res.frames, accepted);
    f.res.onWrite = () => true; f.res.emit('drain');
    assert.deepEqual(f.res.frames.slice(0, accepted.length), accepted);
    assert.equal(f.res.frames.filter(frame => frame.seq === 8).length, 1);
    assert.equal(f.res.frames.filter(frame => frame.seq === 7).length, 1);
    assert.equal(f.res.listenerCount('drain'), 0);
    close(); clean(f);
  });
}

test('large tiny-record queues compact without losing order or replaying accepted records', async () => {
  const f = fixture(); f.res.onWrite = () => false;
  const close = await f.start();
  for (let seq = 8; seq < 4104; seq++) f.emit({ type: 'update', seq });
  f.res.onWrite = () => true; f.res.emit('drain');
  assert.deepEqual(f.res.frames.filter(frame => frame.type === 'update').map(frame => frame.seq),
    Array.from({ length: 4097 }, (_, i) => i + 7));
  f.emit({ type: 'update', seq: 4104 }); assert.equal(f.res.frames.at(-1).seq, 4104);
  close(); clean(f);
});

test('drain timeout is independent of heartbeat and destroys retained socket buffers', async () => {
  const f = fixture(); f.res.onWrite = () => false;
  await f.start();
  assert.ok(DRAIN_TIMEOUT_MS < HEARTBEAT_INTERVAL_MS);
  f.clock.advance(DRAIN_TIMEOUT_MS - 1); assert.equal(f.activeStreams.size, 1);
  f.clock.advance(1); assert.equal(f.res.destroyed, true); assert.equal(f.res.ends, 0); clean(f);
});

test('drain progress resets its deadline while persistent backpressure still times out', async () => {
  const f = fixture(); f.res.onWrite = () => false;
  await f.start();
  f.clock.advance(DRAIN_TIMEOUT_MS - 1); f.res.emit('drain');
  f.clock.advance(1); assert.equal(f.activeStreams.size, 1);
  f.clock.advance(DRAIN_TIMEOUT_MS - 1); assert.equal(f.res.destroyed, true); clean(f);
});

test('pending budget counts UTF-8 queue bytes and Node accepted bytes', async () => {
  const f = fixture(); const close = await f.start();
  f.res.writableNeedDrain = true;
  const event = { type: 'update', seq: 8, text: '界'.repeat(100) };
  const bytes = Buffer.byteLength(JSON.stringify(event) + '\n');
  f.res.writableLength = MAX_PENDING_BYTES - bytes * 2;
  f.emit(event); f.emit(event);
  assert.equal(f.activeStreams.size, 1, 'exact budget boundary remains accepted');
  f.emit(event);
  assert.equal(f.res.destroyed, true); assert.equal(f.res.frames.length, 2); clean(f); close();
});

test('legal large canonical records fit the pending ceiling', async () => {
  const f = fixture(); const close = await f.start();
  f.res.onWrite = () => false;
  f.emit({ type: 'update', seq: 8, text: 'x'.repeat(16 * 1024 * 1024 - 1024) });
  assert.equal(f.res.frames.at(-1).seq, 8); assert.equal(f.activeStreams.size, 1);
  close(); clean(f);
});

test('overflow during synchronous replay detaches delivery but starts admitted prompt exactly once', async () => {
  const f = fixture({ duringSubscribe: ({ fn, res }) => {
    res.writableNeedDrain = true; res.writableLength = MAX_PENDING_BYTES;
    fn({ type: 'update', seq: 8, text: 'over budget' });
  } });
  let prompts = 0;
  await f.start({ prompt: () => { prompts++; } });
  assert.equal(prompts, 1); assert.equal(f.res.destroyed, true); clean(f);
});

for (const reason of ['revoked', 'policy failure', 'disposed']) {
  test(`drain rechecks ${reason} before releasing queued records`, async () => {
    const f = fixture(); f.res.onWrite = () => false;
    await f.start();
    f.emit({ type: 'update', seq: 8, text: 'secret queued while authorized' });
    if (reason === 'revoked') f.state.allowed = false;
    if (reason === 'policy failure') f.state.policyError = true;
    if (reason === 'disposed') f.state.disposed = true;
    f.res.onWrite = () => true; f.res.emit('drain');
    assert.equal(f.res.frames.some(frame => frame.seq === 8), false); clean(f);
  });
}

for (const reason of ['response close', 'response error', 'request abort', 'Host dispose']) {
  test(`${reason} while draining discards queue and cleans its deadline`, async () => {
    const f = fixture(); f.res.onWrite = () => false; await f.start();
    f.emit({ type: 'update', seq: 8, text: 'queued' });
    if (reason === 'response close') { f.res.closed = true; f.res.emit('close'); }
    if (reason === 'response error') f.res.emit('error', new Error('socket error'));
    if (reason === 'request abort') { f.req.aborted = true; f.req.emit('aborted'); }
    if (reason === 'Host dispose') { f.state.disposed = true; for (const close of [...f.activeStreams]) close(); }
    clean(f); f.res.emit('drain');
    assert.equal(f.res.frames.some(frame => frame.seq === 8), false);
  });
}

for (const reject of [false, true]) {
  test(`prompt ${reject ? 'failure' : 'completion'} drains queued terminal frames before EOF`, async () => {
    const f = fixture(); f.res.onWrite = () => false;
    await f.start({ prompt: () => {
      f.emit({ type: 'done', seq: 8 });
      if (reject) throw new Error('failed');
    } });
    assert.equal(f.res.ends, 0); assert.equal(f.subscribers.size, 0);
    assert.equal(f.clock.timers.size, 1, 'drain deadline survives prompt completion, heartbeat does not');
    f.res.onWrite = () => true; f.res.emit('drain');
    assert.deepEqual(f.res.frames.map(frame => frame.type), reject ? ['replay', 'update', 'done', 'error'] : ['replay', 'update', 'done']);
    assert.equal(f.res.ends, 1); clean(f);
  });
}

test('already backpressured revoked response receives no write', async () => {
  const f = fixture(); await f.start(); f.res.writableNeedDrain = true; f.state.allowed = false;
  f.clock.advance(15_000); assert.equal(f.res.frames.length, 2); clean(f);
});

test('write exceptions stop heartbeats and detach listeners', async () => {
  const f = fixture(); await f.start(); f.res.onWrite = () => { throw new Error('broken pipe'); };
  f.clock.advance(15_000); clean(f); assert.equal(f.res.ends, 1);
});

for (const rejected of [false, true]) {
  test(`prompt ${rejected ? 'rejection' : 'settlement'} clears heartbeat without changing Agent lifetime`, async () => {
    const f = fixture(); let resolve, reject;
    const result = new Promise((yes, no) => { resolve = yes; reject = no; });
    const task = f.start({ prompt: () => result });
    f.clock.advance(30_000); assert.equal(f.res.frames.filter(frame => frame.type === 'heartbeat').length, 2);
    if (rejected) reject(Object.assign(new Error('prompt failed'), { code: 'example_failure' })); else resolve();
    await task; clean(f); assert.equal(f.res.ends, 1);
    if (rejected) assert.deepEqual(f.res.frames.at(-1), { type: 'error', code: 'example_failure', message: 'prompt failed' });
  });
}

test('closing HTTP while prompt is pending stops heartbeat but lets prompt settle independently', async () => {
  const f = fixture(); let resolve;
  const task = f.start({ prompt: () => new Promise(done => { resolve = done; }) });
  f.res.emit('close'); clean(f); const count = f.res.frames.length;
  f.clock.advance(60_000); assert.equal(f.res.frames.length, count);
  resolve(); await task; assert.equal(f.res.ends, 1);
});

for (const deliveryFailure of ['replay backpressure', 'update backpressure', 'browser detach', 'request abort']) {
  test(`${deliveryFailure} during initial delivery does not drop an admitted prompt`, async () => {
    const f = fixture({ duringSubscribe: ({ res }) => {
      if (deliveryFailure === 'browser detach') { res.closed = true; res.emit('close'); }
      if (deliveryFailure === 'request abort') { f.req.aborted = true; f.req.emit('aborted'); }
    } });
    if (deliveryFailure.endsWith('backpressure')) f.res.onWrite = frame => frame.type !== deliveryFailure.split(' ')[0];
    let prompts = 0, resolve;
    const task = f.start({ prompt: () => { prompts++; return new Promise(done => { resolve = done; }); } });
    assert.equal(prompts, 1, 'admitted work survives loss of HTTP delivery');
    if (deliveryFailure.endsWith('backpressure')) {
      assert.equal(f.activeStreams.size, 1);
      f.clock.advance(DRAIN_TIMEOUT_MS);
      assert.equal(f.res.destroyed, true, 'only an actual drain timeout detaches delivery');
    }
    clean(f); const count = f.res.frames.length;
    f.clock.advance(60_000); assert.equal(f.res.frames.length, count);
    resolve(); await task; assert.equal(prompts, 1); clean(f);
  });
}

for (const reason of ['revoked', 'policy failure', 'Host disposed']) {
  test(`${reason} after replay backpressure still prevents an admitted prompt`, async () => {
    const f = fixture();
    f.res.onWrite = () => {
      if (reason === 'revoked') f.state.allowed = false;
      if (reason === 'policy failure') f.state.policyError = true;
      if (reason === 'Host disposed') f.state.disposed = true;
      return false;
    };
    let prompts = 0;
    await f.start({ prompt: () => { prompts++; } });
    assert.equal(prompts, 0, 'lost authorization prevents execution despite HTTP detach');
    assert.equal(f.res.frames.length, 1); clean(f);
  });
}

test('observed synchronous revocation is terminal even if policy is restored before prompt execution', async () => {
  const f = fixture({ duringSubscribe: ({ fn, state }) => {
    state.allowed = false; fn({ type: 'update', seq: 8, text: 'secret' }); state.allowed = true;
  } });
  let prompts = 0;
  await f.start({ prompt: () => { prompts++; } });
  assert.equal(prompts, 0, 'revoked request cannot be revived');
  assert.equal(f.res.frames.at(-1).code, 'remote_access_denied'); clean(f);
});

for (const reason of ['preclosed', 'preaborted', 'disposed']) {
  test(`${reason} before admission never starts a prompt`, async () => {
    const f = fixture();
    if (reason === 'preclosed') f.res.closed = true;
    if (reason === 'preaborted') f.req.aborted = true;
    if (reason === 'disposed') f.state.disposed = true;
    let prompts = 0;
    await f.start({ prompt: () => { prompts++; } });
    assert.equal(prompts, 0, 'work must not start before admission');
    assert.equal(f.res.frames.length, 0); assert.equal(f.state.subscriptions, 0); clean(f);
  });
}

test('prompt failure does not duplicate a journaled error or leak error after revocation', async () => {
  for (const revoked of [false, true]) {
    const f = fixture(); let reject;
    const task = f.start({ prompt: () => new Promise((_, no) => { reject = no; }) });
    if (revoked) f.state.allowed = false;
    else f.emit({ type: 'error', seq: 8, code: 'recorded_error', message: 'recorded' });
    reject(new Error('private prompt failure')); await task;
    assert.equal(f.res.frames.filter(frame => frame.type === 'error').length, 1);
    assert.equal(f.res.frames.at(-1).code, revoked ? 'remote_access_denied' : 'recorded_error'); clean(f);
  }
});
