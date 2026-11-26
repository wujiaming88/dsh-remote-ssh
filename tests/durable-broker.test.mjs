import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, realpathSync, chmodSync, rmSync, readFileSync, statSync, symlinkSync, mkdirSync, fsyncSync, ftruncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDurableBroker } from '../lib/durable-broker.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
class FakeSession {
  constructor(hooks, base = 0) { this.hooks = hooks; this.status = 'idle'; this.eventSeq = base; this.generation = 'generation'; this.requests = new Map(); this.calls = []; this.pending = []; this.permissions = [{ requestId: 'permission-1' }]; this.starts = 0; this.disposed = 0; }
  state() { return { status: this.status, cursor: { generation: this.generation, seq: this.eventSeq }, pendingPermissions: this.permissions, pendingElicitations: [], busy: this.pending.length > 0 }; }
  event(type, extra = {}) { const event = { eventVersion: 1, generation: this.generation, seq: ++this.eventSeq, type, ...extra }; this.hooks.onEvent(event); return event; }
  async start() { this.starts++; this.status = 'ready'; this.event('session'); }
  prompt(text, options) { this.calls.push({ method: 'prompt', text, options }); this.status = 'prompting'; this.event('turn_start'); return new Promise(resolve => this.pending.push(resolve)); }
  finish() { const resolve = this.pending.shift(); this.event('stop'); this.status = 'ready'; resolve({ stopReason: 'end_turn' }); }
  async permission(args) { this.calls.push({ method: 'permission', args }); this.permissions = []; this.event('permission_resolved'); return { ok: true, requestId: args.requestId }; }
  async elicitation(args) { this.calls.push({ method: 'elicitation', args }); return { ok: true, requestId: args.requestId, action: args.action, content: args.content }; }
  async cancel() { this.calls.push({ method: 'cancel' }); return { ok: true }; }
  async dispose() { this.disposed++; }
  async close() {
    if (this.forking) throw Object.assign(new Error('Fork in progress'), { code: 'fork_busy' });
    this.closeCount = (this.closeCount || 0) + 1; this.status = 'closed';
    while (this.pending.length) this.pending.shift()({ stopReason: 'cancelled' });
  }
  async stop() { return this.cancel(); }
}
async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'dsh-broker-')); chmodSync(directory, 0o700);
  const identity = { id: randomUUID(), epoch: randomUUID(), token: randomBytes(32).toString('hex'), binding: { remotePath: '/remote/work', agent: 'claude' } };
  let session;
  const broker = createDurableBroker({ directory, identity, ...options, createSession: hooks => (session = new FakeSession(hooks, options.base || 0)) });
  const socketPath = join(directory, 's');
  await broker.listen(socketPath); await broker.start();
  t.after(async () => { await broker.dispose(); assert.equal(dirname(directory), realpathSync(tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  return { broker, session, identity, socketPath, directory };
}
async function client(t, f, attach = {}) {
  const socket = net.createConnection(f.socketPath), messages = [], waiters = [];
  let text = '';
  socket.setEncoding('utf8'); socket.on('error', () => {});
  socket.on('data', data => {
    text += data;
    let end;
    while ((end = text.indexOf('\n')) >= 0) {
      const message = JSON.parse(text.slice(0, end)); text = text.slice(end + 1); messages.push(message);
      for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiters.splice(waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    }
  });
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  const api = {
    socket, messages,
    send(message) { socket.write(JSON.stringify({ v: 1, ...message }) + '\n'); },
    next(predicate) {
      const found = messages.find(predicate); if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          const summary = messages.map(({ type, opId, error, event }) => ({ type, opId, error, seq: event?.seq }));
          reject(new Error('Message timeout: ' + JSON.stringify(summary)));
        }, 3000) };
        waiters.push(waiter);
      });
    },
    call(opId, method, args = {}) { api.send({ type: 'call', opId, method, args, epoch: f.identity.epoch, fence: api.attached?.fence }); }
  };
  api.send({ type: 'attach', id: f.identity.id, epoch: f.identity.epoch, token: f.identity.token, consumerId: randomUUID(), afterSeq: 0, mode: 'control', ...attach });
  api.attached = await api.next(message => ['attached', 'error'].includes(message.type));
  return api;
}

test('owner survives client EOF, persists offline events, and attaches without restarting', async t => {
  const f = await fixture(t), a = await client(t, f);
  a.call('prompt-1', 'prompt', { text: 'one', requestId: 'turn-1' });
  await a.next(m => m.type === 'accepted' && m.opId === 'prompt-1'); await tick();
  a.call('prompt-1', 'prompt', { requestId: 'turn-1', text: 'one' }); await tick();
  assert.equal(f.session.calls.length, 1);
  const afterSeq = f.broker.headSeq;
  a.socket.destroy(); await tick();
  assert.equal(f.session.disposed, 0); assert.equal(f.session.permissions.length, 1);
  f.session.event('text', { text: 'offline output' }); f.session.finish(); await tick();
  const b = await client(t, f, { afterSeq });
  assert.deepEqual(b.messages.filter(m => m.type === 'event').map(m => m.event.type), ['text', 'stop']);
  assert.equal(b.attached.state.status, 'ready'); assert.equal(f.session.starts, 1);
  b.send({ type: 'query', opIds: ['prompt-1'], epoch: f.identity.epoch });
  const queried = await b.next(m => m.type === 'operations');
  assert.equal(queried.operations[0].result.value.stopReason, 'end_turn');
  b.call('prompt-1', 'prompt', { requestId: 'turn-1', text: 'one' });
  await b.next(m => m.type === 'result' && m.opId === 'prompt-1');
  assert.equal(f.session.calls.filter(c => c.method === 'prompt').length, 1);
  assert.match(readFileSync(join(f.directory, 'broker-events.ndjson'), 'utf8'), /offline output/);
  assert.equal(statSync(join(f.directory, 'broker-events.ndjson')).mode & 0o777, 0o600);
});

test('same consumer reconnect keeps its lease even when attach acknowledgement is lost', async t => {
  const f=await fixture(t),consumerId=randomUUID();
  const a=await client(t,f,{consumerId});
  const b=await client(t,f,{consumerId,reconnect:true});
  assert.equal(b.attached.fence,a.attached.fence);
  a.call('stale-sibling','cancel');
  assert.equal((await a.next(m=>m.type==='error'&&m.opId==='stale-sibling')).error.code,'writer_fenced');
  b.call('new-sibling','cancel');await b.next(m=>m.type==='result'&&m.opId==='new-sibling');
  const c=await client(t,f);
  const stale=await client(t,f,{consumerId,reconnect:true});
  assert.equal(stale.attached.error.code,'writer_fenced');
  assert.ok(c.attached.fence>b.attached.fence);
});

test('closed is published only after adapter shutdown has actually completed', async t => {
  const f=await fixture(t),a=await client(t,f);let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  f.session.close=async()=>{f.session.status='closed';f.session.event('lifecycle');await waiting;};
  a.call('close-proof','close');
  await a.next(message=>message.type==='state'&&message.state.status==='closing');
  assert.equal(f.broker.terminalSnapshot,null);
  release();await a.next(message=>message.type==='result'&&message.opId==='close-proof');
  await a.next(message=>message.type==='state'&&message.state.status==='closed');
  assert.equal(f.broker.terminalSnapshot.state.status,'closed');
});

test('admission is durable before invocation, callbacks are independent of pending prompts', async t => {
  const f = await fixture(t), a = await client(t, f);
  const original = f.session.prompt.bind(f.session);
  f.session.prompt = (...args) => { const records = readFileSync(join(f.directory, 'broker-operations.ndjson'), 'utf8'); assert.match(records, /"opId":"intent"/); assert.doesNotMatch(records, /TOP SECRET PROMPT/); return original(...args); };
  a.call('intent', 'prompt', { text: 'TOP SECRET PROMPT', requestId: 'turn' });
  await a.next(m => m.type === 'accepted' && m.opId === 'intent');
  a.call('answer', 'permission', { requestId: 'permission-1', optionId: 'allow' });
  await a.next(m => m.type === 'result' && m.opId === 'answer');
  assert.equal(f.session.permissions.length, 0); assert.equal(f.session.pending.length, 1);
  f.session.finish(); await a.next(m => m.type === 'result' && m.opId === 'intent');
  await a.next(m => m.type === 'state' && m.state.status === 'ready' && m.headSeq >= 4);
});

test('same opId conflicts on changed payload and control leases fence old writers', async t => {
  const f = await fixture(t), a = await client(t, f);
  a.call('one', 'cancel'); await a.next(m => m.type === 'result' && m.opId === 'one');
  a.call('one', 'cancel', { changed: true });
  assert.equal((await a.next(m => m.type === 'error' && m.opId === 'one')).error.code, 'operation_conflict');
  const b = await client(t, f);
  assert.ok(b.attached.fence > a.attached.fence);
  const reconnect = await client(t, f, { expectedFence: a.attached.fence });
  assert.equal(reconnect.attached.error.code, 'writer_fenced');
  b.call('still-writer', 'status'); assert.equal((await b.next(m => m.opId === 'still-writer')).ok, true);
  a.call('stale', 'cancel'); assert.equal((await a.next(m => m.opId === 'stale')).error.code, 'writer_fenced');
  const observer = await client(t, f, { mode: 'observe' });
  observer.call('observe', 'cancel'); assert.equal((await observer.next(m => m.opId === 'observe')).error.code, 'writer_fenced');
  observer.call('status', 'status'); assert.equal((await observer.next(m => m.opId === 'status')).ok, true);
  b.call('evil', 'constructor'); assert.equal((await b.next(m => m.opId === 'evil')).error.code, 'method_forbidden');
  assert.equal(f.session.calls.length, 1);
});

test('form response payload never enters operation log, result, or state', async t => {
  const f = await fixture(t), a = await client(t, f);
  a.call('form', 'elicitation', { requestId: 'f', action: 'accept', content: { password: 'FORM-SECRET' } });
  const result = await a.next(m => m.type === 'result' && m.opId === 'form');
  assert.doesNotMatch(JSON.stringify(result), /FORM-SECRET/);
  assert.doesNotMatch(readFileSync(join(f.directory, 'broker-operations.ndjson'), 'utf8'), /FORM-SECRET|password/);
  assert.doesNotMatch(readFileSync(join(f.directory, 'broker-state.json'), 'utf8'), /FORM-SECRET/);
});

test('bad tokens, epochs, frame limits and invalid ACK fail without disposing owner', async t => {
  const f = await fixture(t, { maxFrameBytes: 2048 });
  const bad = await client(t, f, { token: 'wrong' }); assert.equal(bad.attached.error.code, 'authentication_failed');
  const epoch = await client(t, f, { epoch: 'old' }); assert.equal(epoch.attached.error.code, 'epoch_mismatch');
  const a = await client(t, f);
  a.send({ type: 'ack', epoch: f.identity.epoch, throughSeq: f.broker.headSeq + 1 });
  assert.equal((await a.next(m => m.type === 'error')).error.code, 'bad_ack');
  const closed = once(a.socket, 'close'); a.socket.write('x'.repeat(2049)); await closed;
  assert.equal(f.session.disposed, 0);
});

test('fork event prefixes require explicit retained cursor and preserve canonical sequence', async t => {
  const f = await fixture(t, { base: 40 });
  const missing = await client(t, f); assert.equal(missing.attached.error.code, 'cursor_gap');
  const a = await client(t, f, { afterSeq: 40 });
  assert.equal(a.messages[0].event.seq, 41); assert.equal(a.attached.headSeq, 41);
  assert.equal(a.attached.state.cursor.generation, 'generation');
});

test('operation capacity retains deduplication; owner directory cannot restart', async t => {
  const f = await fixture(t, { maxOperations: 1 }), a = await client(t, f);
  a.call('one', 'permission', { requestId: 'permission-1', optionId: 'yes' }); await a.next(m => m.type === 'result' && m.opId === 'one');
  a.call('two', 'permission', { requestId: 'permission-2', optionId: 'yes' }); assert.equal((await a.next(m => m.opId === 'two')).error.code, 'operation_limit');
  a.send({ type: 'query', opIds: ['one', 'two'] });
  assert.deepEqual((await a.next(m => m.type === 'operations')).operations.map(op => op.status), ['completed', 'not_found']);
  assert.throws(() => createDurableBroker({ directory: f.directory, identity: f.identity, createSession: () => { throw Error('must not create'); } }), { code: 'broker_already_initialized' });
  assert.equal(await f.broker.start(), f.session); assert.equal(f.session.starts, 1);
});

test('fork reservation persists across disconnect and fences mutations until matching release', async t => {
  const f = await fixture(t), a = await client(t, f);
  a.call('blocked-fork', 'beginFork', { operationId: 'fork', childId: 'child' });
  assert.equal((await a.next(m => m.type === 'result' && m.opId === 'blocked-fork')).error.code, 'fork_busy');
  f.session.permissions = [];
  a.call('reserve', 'beginFork', { operationId: 'fork', childId: 'child' });
  const reservation = await a.next(m => m.type === 'result' && m.opId === 'reserve');
  assert.deepEqual(reservation.value, { operationId: 'fork', childId: 'child' });
  assert.match(readFileSync(join(f.directory, 'broker-fork.ndjson'), 'utf8'), /"type":"reserved"/);
  a.socket.destroy(); await tick();
  const b = await client(t, f);
  assert.deepEqual(b.attached.forkReservation, reservation.value); assert.equal(f.session.forking, true);
  b.call('during-fork', 'prompt', { text: 'must not run' });
  assert.equal((await b.next(m => m.type === 'result' && m.opId === 'during-fork')).error.code, 'fork_busy');
  b.call('wrong-release', 'endFork', { operationId: 'fork', childId: 'wrong' });
  assert.equal((await b.next(m => m.type === 'result' && m.opId === 'wrong-release')).error.code, 'fork_reservation_conflict');
  assert.equal(f.session.forking, true);
  b.call('release', 'endFork', { operationId: 'fork', childId: 'child' });
  await b.next(m => m.type === 'result' && m.opId === 'release');
  assert.equal(f.session.forking, false);
  assert.match(readFileSync(join(f.directory, 'broker-fork.ndjson'), 'utf8'), /"type":"released"/);
  assert.equal(f.session.calls.length, 0);
});

test('large journal replays through socket backpressure without truncation', async t => {
  const f = await fixture(t, { maxFrameBytes: 4096 });
  for (let i = 0; i < 900; i++) f.session.event('text', { text: 'x'.repeat(1800) });
  const a = await client(t, f);
  assert.equal(a.messages.filter(m => m.type === 'event').length, 901);
  assert.equal(a.attached.headSeq, 901);
});

test('slow subscriber overflow disconnects only that socket, not the execution owner', async t => {
  const f = await fixture(t, { maxFrameBytes: 65536 }), slow = await client(t, f, { mode: 'observe' }), healthy = await client(t, f);
  slow.socket.pause();
  const disconnected = once(slow.socket, 'close');
  for (let i = 0; i < 180; i++) {
    const event = f.session.event('text', { text: 'x'.repeat(32000) });
    await healthy.next(message => message.type === 'event' && message.event.seq === event.seq);
  }
  await tick(); slow.socket.resume(); await disconnected;
  healthy.call('alive', 'status');
  assert.equal((await healthy.next(m => m.opId === 'alive')).ok, true);
  assert.equal(f.session.disposed, 0); assert.equal(f.session.starts, 1);
});

test('reserved controls remain authoritative after task and stop capacity is exhausted', async t => {
  const f = await fixture(t, { maxOperations: 1, maxControlOperations: 1 }), a = await client(t, f);
  a.call('task', 'permission', { requestId: 'permission-1', optionId: 'yes' });
  await a.next(m => m.type === 'result' && m.opId === 'task');
  a.call('extra-task', 'permission', { requestId: 'permission-2', optionId: 'yes' });
  assert.equal((await a.next(m => m.opId === 'extra-task')).error.code, 'operation_limit');
  a.call('cancel', 'cancel'); assert.equal((await a.next(m => m.type === 'result' && m.opId === 'cancel')).ok, true);
  a.call('extra-stop', 'stop'); assert.equal((await a.next(m => m.opId === 'extra-stop')).error.code, 'control_limit');
  const observer = await client(t, f, { mode: 'observe' });
  observer.call('observer-close', 'close'); assert.equal((await observer.next(m => m.opId === 'observer-close')).error.code, 'writer_fenced');
  const b = await client(t, f);
  a.call('stale-close', 'close'); assert.equal((await a.next(m => m.opId === 'stale-close')).error.code, 'writer_fenced');
  b.call('close', 'close'); const closed = await b.next(m => m.type === 'result' && m.opId === 'close');
  assert.equal(closed.ok, true); assert.equal(closed.durable, true); assert.equal(f.session.closeCount, 1);
  await tick(); assert.equal(f.broker.terminalSnapshot.state.status, 'closed'); assert.equal(f.broker.terminalSnapshot.baseSeq, 0);
  b.call('close', 'close'); await tick(); assert.equal(f.session.closeCount, 1);
});

test('oversized event is never journaled; owner stops and retained prefix remains attachable', async t => {
  const f = await fixture(t, { maxFrameBytes: 2048 }), a = await client(t, f);
  a.call('task', 'prompt', { text: 'work', requestId: 'task' }); await a.next(m => m.type === 'accepted'); await tick();
  const head = f.broker.headSeq, before = readFileSync(join(f.directory, 'broker-events.ndjson'), 'utf8');
  assert.throws(() => f.session.event('text', { text: 'x'.repeat(3000) }), { code: 'remote_frame_too_large' });
  await tick(); assert.equal(f.session.status, 'closed'); assert.equal(f.session.closeCount, 1);
  assert.equal(f.broker.headSeq, head); assert.equal(readFileSync(join(f.directory, 'broker-events.ndjson'), 'utf8'), before);
  assert.equal(f.broker.operations.get('task').status, 'unknown'); assert.equal(f.broker.terminalSnapshot, null);
  const b = await client(t, f); assert.equal(b.attached.headSeq, head); assert.equal(b.attached.state.cursor.seq, head); assert.equal(b.attached.outcome, 'unknown');
  b.call('task', 'prompt', { text: 'work', requestId: 'task' });
  assert.equal((await b.next(m => m.type === 'result' && m.opId === 'task')).error.code, 'remote_outcome_unknown');
  assert.equal(f.session.calls.filter(call => call.method === 'prompt').length, 1);
});

test('pending argument quota rejects new work without consuming safety close capacity', async t => {
  const f = await fixture(t, { maxPendingBytes: 1800 }), a = await client(t, f);
  a.call('one', 'prompt', { text: 'x'.repeat(1400), requestId: 'one' }); await a.next(m => m.type === 'accepted' && m.opId === 'one'); await tick();
  assert.ok(f.broker.resourceUsage.pendingBytes >= 1400);
  a.call('two', 'prompt', { text: 'x'.repeat(1400), requestId: 'two' });
  assert.equal((await a.next(m => m.opId === 'two')).error.code, 'pending_limit'); assert.equal(f.session.calls.length, 1);
  a.call('close', 'close'); await a.next(m => m.type === 'result' && m.opId === 'close'); await tick();
  assert.equal(f.broker.resourceUsage.pendingBytes, 0); assert.equal(f.session.closeCount, 1);
});

test('retained result quota fails closed without retaining oversized results', async t => {
  const f = await fixture(t, { maxResultBytes: 300 }), a = await client(t, f);
  f.session.command = async () => ({ payload: 'z'.repeat(1000) });
  a.call('large', 'command', { name: 'large' });
  const result = await a.next(m => m.type === 'result' && m.opId === 'large');
  assert.equal(result.error.code, 'remote_outcome_unknown'); await tick();
  assert.equal(f.session.closeCount, 1); assert.equal(f.broker.operations.get('large').status, 'unknown');
  assert.ok(f.broker.resourceUsage.resultBytes <= 300);
  assert.doesNotMatch(readFileSync(join(f.directory, 'broker-operations.ndjson'), 'utf8'), /zzzz/);
});

test('journal byte quota preserves prefix and explicit non-durable close remains available', async t => {
  const f = await fixture(t, { maxJournalBytes: 2048 }), a = await client(t, f);
  let error;
  for (let i = 0; i < 30; i++) {
    try { f.session.event('text', { text: 'x'.repeat(150) }); } catch (value) { error = value; break; }
  }
  assert.equal(error?.code, 'journal_limit'); await tick();
  assert.ok(f.broker.resourceUsage.journalBytes + f.broker.resourceUsage.stateBytes <= 2048);
  a.call('permission', 'permission', { requestId: 'permission-1', optionId: 'allow' });
  assert.equal((await a.next(m => m.opId === 'permission')).error.code, 'persistence_failed');
  a.call('close', 'close'); const result = await a.next(m => m.type === 'result' && m.opId === 'close');
  assert.equal(result.ok, true); assert.equal(result.durable, false); assert.equal(result.value.outcome, 'unknown');
  assert.equal(f.broker.terminalSnapshot, null); assert.equal(f.session.calls.filter(call => call.method === 'permission').length, 0);
});

test('fsync failure stops admitted SDK work and cannot escalate permission authority', async t => {
  let broken = false, truncateAt;
  const f = await fixture(t, { syncFile(fd) {
    if (broken) { if (truncateAt !== undefined) { ftruncateSync(fd, truncateAt); truncateAt = undefined; } throw Object.assign(new Error('disk failure'), { code: 'EIO' }); }
    fsyncSync(fd);
  } }), a = await client(t, f);
  a.call('task', 'prompt', { text: 'one task', requestId: 'task' }); await a.next(m => m.type === 'accepted' && m.opId === 'task'); await tick();
  truncateAt = statSync(join(f.directory, 'broker-events.ndjson')).size + 5;
  broken = true; assert.throws(() => f.session.event('text', { text: 'unconfirmed' }), { code: 'EIO' });
  await tick(); assert.equal(f.session.closeCount, 1); assert.equal(f.broker.operations.get('task').status, 'unknown');
  const observer = await client(t, f, { mode: 'observe' });
  assert.equal(observer.attached.outcome, 'unknown'); assert.equal(observer.attached.headSeq, f.broker.headSeq);
  assert.equal(f.session.hooks.eventStore.readEvents('ignored').lastSeq, f.broker.headSeq);
  a.call('close', 'close'); const result = await a.next(m => m.type === 'result' && m.opId === 'close');
  assert.equal(result.ok, true); assert.equal(result.durable, false); assert.equal(f.broker.terminalSnapshot, null);
  a.call('form', 'elicitation', { requestId: 'f', action: 'accept', content: { secret: 'no' } });
  assert.equal((await a.next(m => m.opId === 'form')).error.code, 'persistence_failed');
  assert.equal(f.session.calls.length, 1);
});

test('explicit close preserves an unresolved fork reservation without allowing more work', async t => {
  const f = await fixture(t), a = await client(t, f); f.session.permissions = [];
  a.call('reserve', 'beginFork', { operationId: 'fork', childId: 'child' }); await a.next(m => m.type === 'result' && m.opId === 'reserve');
  a.call('close', 'close'); const result = await a.next(m => m.type === 'result' && m.opId === 'close');
  assert.equal(result.ok, true); assert.equal(f.session.status, 'closed'); assert.equal(f.session.forking, true); await tick();
  assert.deepEqual(f.broker.terminalSnapshot.forkReservation, { operationId: 'fork', childId: 'child' });
  assert.doesNotMatch(readFileSync(join(f.directory, 'broker-fork.ndjson'), 'utf8'), /released/);
  a.call('resume-work', 'endFork', { operationId: 'fork', childId: 'child' });
  assert.equal((await a.next(m => m.opId === 'resume-work')).error.code, 'broker_closed');
});

test('terminal snapshot remains unavailable if final closed state cannot be synced', async t => {
  let closing = false, writesAfterClose = 0;
  const f = await fixture(t, { syncFile(fd) {
    if (closing && ++writesAfterClose >= 2) throw Object.assign(new Error('closed state fsync failure'), { code: 'EIO' });
    fsyncSync(fd);
  } }), a = await client(t, f);
  const original = f.session.close.bind(f.session);
  f.session.close = async () => { await original(); closing = true; };
  a.call('close', 'close'); const result = await a.next(m => m.type === 'result' && m.opId === 'close');
  assert.equal(result.ok, true); await tick();
  assert.equal(f.session.status, 'closed'); assert.equal(f.broker.terminalSnapshot, null);
  assert.match(readFileSync(join(f.directory, 'broker-operations.ndjson'), 'utf8'), /"status":"completed"/);
});

test('control journal exhaustion produces a truthful volatile receipt with a reserved close slot', async t => {
  const f = await fixture(t, { maxControlJournalBytes: 1, maxControlOperations: 1 }), a = await client(t, f);
  a.call('stop', 'stop'); const stopped = await a.next(m => m.type === 'result' && m.opId === 'stop');
  assert.equal(stopped.ok, true); assert.equal(stopped.durable, false);
  a.call('close', 'close'); const result = await a.next(m => m.type === 'result' && m.opId === 'close');
  assert.equal(result.ok, true); assert.equal(result.durable, false); await tick();
  assert.equal(f.broker.terminalSnapshot, null); assert.equal(f.broker.resourceUsage.controlJournalBytes, 0);
});

test('aggregate query overflow reports a bounded error instead of silently disconnecting', async t => {
  const f = await fixture(t, { maxFrameBytes: 2048 }), a = await client(t, f);
  f.session.command = async () => ({ text: 'x'.repeat(600) });
  for (const opId of ['one', 'two', 'three']) {
    a.call(opId, 'command', { name: 'value' }); await a.next(m => m.type === 'result' && m.opId === opId);
  }
  a.send({ type: 'query', epoch: f.identity.epoch, opIds: ['one'] });
  assert.equal((await a.next(m => m.type === 'operations')).operations[0].result.ok, true);
  const closed = once(a.socket, 'close');
  a.send({ type: 'query', epoch: f.identity.epoch, opIds: ['one', 'two', 'three'] });
  const error = await a.next(m => m.type === 'error'); assert.equal(error.error.code, 'remote_frame_too_large');
  assert.ok(Buffer.byteLength(JSON.stringify(error)) < 256); await closed;
  assert.equal(f.session.status, 'ready'); assert.equal(f.session.disposed, 0);
});

test('result admission reserves its full single-operation query envelope', async t => {
  const f = await fixture(t, { maxFrameBytes: 2048 }), a = await client(t, f);
  const value = { text: 'x'.repeat(1800) }, result = { type: 'result', opId: 'wrap', digest: 'x'.repeat(64), ok: true, durable: true, value };
  assert.ok(Buffer.byteLength(JSON.stringify({ v: 1, ...result }) + '\n') < 2048);
  assert.ok(Buffer.byteLength(JSON.stringify({ v: 1, type: 'operations', operations: [{ opId: 'wrap', method: 'command', digest: 'x'.repeat(64), status: 'completed', result }] }) + '\n') > 2048);
  f.session.command = async () => value;
  a.call('wrap', 'command', { name: 'value' });
  assert.equal((await a.next(m => m.type === 'result' && m.opId === 'wrap')).error.code, 'remote_outcome_unknown');
  await tick(); assert.equal(f.session.closeCount, 1); assert.equal(f.broker.operations.get('wrap').result, undefined);
});

test('oversized attached and status snapshots produce explicit diagnostics', async t => {
  const f = await fixture(t, { maxFrameBytes: 2048 }), a = await client(t, f); await tick();
  f.session.requests.set('large', { requestId: 'large', status: 'completed', result: 'x'.repeat(3000) });
  a.call('status', 'status');
  assert.equal((await a.next(m => m.type === 'error')).error.code, 'remote_frame_too_large');
  const b = await client(t, f);
  assert.equal(b.attached.type, 'error'); assert.equal(b.attached.error.code, 'remote_frame_too_large');
  f.session.requests.clear();
});

test('rejects unsafe directories and accepts separate private socket directory', async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'dsh-safe-')); chmodSync(root, 0o700);
  t.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true, force: true }); });
  const bad = join(root, 'bad'); mkdirSync(bad, { mode: 0o755 });
  const identity = { id: 'id', epoch: 'epoch', token: 'x'.repeat(64), binding: {} };
  assert.throws(() => createDurableBroker({ directory: bad, identity, createSession: () => {} }), { code: 'unsafe_directory' });
  const link = join(root, 'link'); symlinkSync(bad, link);
  assert.throws(() => createDurableBroker({ directory: link, identity, createSession: () => {} }), { code: 'unsafe_directory' });
  const state = join(root, 'state'), sockets = join(root, 'sockets'); mkdirSync(state, { mode: 0o700 }); mkdirSync(sockets, { mode: 0o700 });
  const broker = createDurableBroker({ directory: state, identity, createSession: hooks => new FakeSession(hooks) });
  await broker.listen(join(sockets, 's')); await broker.start(); await broker.dispose();
});
