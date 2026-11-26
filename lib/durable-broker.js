/** Remote execution owner. Losing a socket never closes its ACP connection.
 * Persistence proves admission, not exactly-once execution across owner crashes.
 */
import net from 'node:net';
import { constants, lstatSync, realpathSync, openSync, closeSync, writeSync, readSync, fsyncSync, fstatSync, renameSync, chmodSync } from 'node:fs';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import { randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';

const METHODS = new Set(['prompt', 'queue', 'removeQueued', 'steer', 'command', 'cancel', 'stop', 'setConfig', 'setMode', 'permission', 'elicitation', 'setTitle', 'close', 'beginFork', 'endFork']);
// Only destructive safety controls receive reserved capacity. In particular,
// permission/form answers and fork releases must never bypass admission limits.
const CONTROLS = new Set(['cancel', 'stop', 'close']);
function invoke(session, method, args) {
  switch (method) {
    case 'prompt': case 'queue': case 'steer': return session[method](args.text, { attachments: args.attachments, requestId: args.requestId });
    case 'removeQueued': return session.removeQueued(args);
    case 'command': return session.command(args.name, args.input);
    case 'setConfig': return session.setConfig(args.configId, args.value);
    case 'setMode': return session.setMode(args.modeId);
    case 'setTitle': return session.setTitle(args.title);
    case 'permission': case 'elicitation': return session[method](args);
    case 'cancel': case 'stop': case 'close': return session[method]();
    default: throw fail('method_forbidden', 'Unsupported broker method');
  }
}
const fail = (code, message) => Object.assign(new Error(message), { code });
const json = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'promise' ? undefined : item));
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const publicError = error => ({ code: String(error?.code || 'broker_error').slice(0, 128), message: String(error?.message || 'Broker operation failed').slice(0, 1024) });

function privateDirectory(directory) {
  if (!isAbsolute(directory)) throw fail('unsafe_directory', 'Broker directory must be absolute');
  const path = resolve(directory), stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw fail('unsafe_directory', 'Broker directory must be canonical, user-owned and mode 0700');
  return path;
}
function privateFile(path, flags) {
  const fd = openSync(path, flags | (constants.O_NOFOLLOW || 0), 0o600);
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) {
    closeSync(fd); throw fail('unsafe_file', 'Broker files must be private regular files');
  }
  return fd;
}
function append(fd, value, syncFile = fsyncSync) {
  const bytes = Buffer.from(JSON.stringify(value) + '\n');
  for (let offset = 0; offset < bytes.length;) offset += writeSync(fd, bytes, offset, bytes.length - offset);
  syncFile(fd);
}
const recordBytes = value => Buffer.byteLength(JSON.stringify(value) + '\n');
function* records(path) {
  const fd = privateFile(path, constants.O_RDONLY);
  let rest = Buffer.alloc(0);
  try {
    const chunk = Buffer.alloc(65536);
    for (;;) {
      const size = readSync(fd, chunk, 0, chunk.length, null);
      if (!size) break;
      rest = Buffer.concat([rest, chunk.subarray(0, size)]);
      let end;
      while ((end = rest.indexOf(10)) >= 0) {
        const line = rest.subarray(0, end).toString('utf8'); rest = rest.subarray(end + 1);
        if (line) yield JSON.parse(line);
      }
      if (rest.length > 32 * 1024 * 1024) throw fail('journal_corrupt', 'Oversized journal record');
    }
    if (rest.length) throw fail('journal_corrupt', 'Incomplete journal record');
  } finally { closeSync(fd); }
}

export function createDurableBroker({ directory, identity, createSession,
  maxFrameBytes = 16 * 1024 * 1024, maxOperations = 10000,
  maxJournalBytes = 256 * 1024 * 1024, maxPendingBytes = 64 * 1024 * 1024,
  maxResultBytes = 64 * 1024 * 1024, maxControlOperations = 64,
  maxControlJournalBytes = 1024 * 1024, syncFile = fsyncSync,
}) {
  directory = privateDirectory(directory);
  if (!identity || typeof identity.id !== 'string' || !identity.id || typeof identity.epoch !== 'string' || !identity.epoch || typeof identity.token !== 'string' || Buffer.byteLength(identity.token) < 32 || !identity.binding || typeof identity.binding !== 'object') throw fail('bad_identity', 'Broker identity, epoch, binding and 256-bit token are required');
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 256 ||
      ![maxOperations, maxJournalBytes, maxPendingBytes, maxResultBytes, maxControlOperations, maxControlJournalBytes].every(value => Number.isSafeInteger(value) && value > 0) || typeof syncFile !== 'function') throw fail('bad_limits', 'Invalid broker limits');
  const id = identity.id, epoch = identity.epoch, binding = json(identity.binding);
  const tokenHash = createHash('sha256').update(identity.token).digest();
  const digestKey = createHmac('sha256', identity.token).update('dsh-acp-broker/1 operation digest').digest();
  const ownerPath = join(directory, 'broker-owner.json');
  let ownerFd;
  try { ownerFd = privateFile(ownerPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY); }
  catch (error) { if (error.code === 'EEXIST') throw fail('broker_already_initialized', 'Existing execution owner directory cannot be restarted; attach or explicitly recover history'); throw error; }
  const ownerRecord = { v: 1, id, epoch, binding, pid: process.pid, createdAt: Date.now() };
  let journalBytes = recordBytes(ownerRecord), controlJournalBytes = 0, stateBytes = 0;
  try {
    if (journalBytes > maxJournalBytes) throw fail('journal_limit', 'Owner metadata exceeds the journal budget');
    append(ownerFd, ownerRecord, syncFile);
  } finally { closeSync(ownerFd); }
  const eventPath = join(directory, 'broker-events.ndjson');
  const operationPath = join(directory, 'broker-operations.ndjson');
  const eventFd = privateFile(eventPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_APPEND);
  const operationFd = privateFile(operationPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_APPEND);
  const forkFd = privateFile(join(directory, 'broker-fork.ndjson'), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_APPEND);
  const dirFd = openSync(directory, constants.O_RDONLY); syncFile(dirFd);
  const clients = new Set(), operations = new Map();
  const maxBufferedBytes = Math.max(1024 * 1024, maxFrameBytes * 2);
  let fence = 0, writerConsumer = null, writerPeer = null, headSeq = 0, firstSeq = null, generation = null, session;
  let started, listening = false, shuttingDown = false, persistenceFailure = null, stateScheduled = false, closed = false, shutdownPromise;
  let forkReservation = null, ownerClosePromise = null, ownerClosed = false, terminalReady = false;
  let pendingBytes = 0, resultBytes = 0, ordinaryOperations = 0, controlOperations = 0, closeOperation = null;
  const pendingSizes = new WeakMap();

  function appendJournal(fd, value, control = false) {
    const bytes = recordBytes(value);
    if (control ? controlJournalBytes + bytes > maxControlJournalBytes : journalBytes + stateBytes + bytes > maxJournalBytes) throw fail('journal_limit', 'Broker journal byte budget exhausted');
    // Charge before writing: a failed/partial append still consumes disk space.
    if (control) controlJournalBytes += bytes; else journalBytes += bytes;
    append(fd, value, syncFile);
  }
  function snapshot() {
    // A rejected event may already have advanced AcpSession's private sequence.
    // Never advertise that unpersisted suffix as replayable or invent a stop.
    const state = persistenceFailure ? {
      status: ownerClosed ? 'closed' : 'error',
      cursor: { generation, seq: headSeq }, outcome: 'unknown',
      ...(ownerClosed ? { busy: false, pendingTurns: 0, pendingPermissions: [], pendingElicitations: [], activeTurn: null } : {}),
      lastError: 'Broker persistence unavailable; task outcome is unknown',
      persistenceError: persistenceFailure.code,
    } : json(session.state());
    // AcpSession sets its local closed flag before adapter teardown finishes.
    // That flag alone is not permission to discard the recovery locator.
    if (state.status === 'closed' && !ownerClosed) state.status = 'closing';
    return { state, requests: persistenceFailure ? [] : json([...session.requests?.values?.() || []]), headSeq, generation,
      forkReservation: forkReservation && { ...forkReservation },
      ...(persistenceFailure ? { persistenceFailure: { ...persistenceFailure }, outcome: 'unknown' } : {}) };
  }
  function closeOwner() {
    if (ownerClosePromise) return ownerClosePromise;
    ownerClosePromise = Promise.resolve().then(async () => {
      // Explicit/fail-closed termination is safe even with an unresolved fork.
      // Preserve the reservation; never release it to permit further work and
      // never touch any child execution. AcpSession's close guard is local only.
      const forking = session.forking;
      session.forking = false;
      try { await session.close(); ownerClosed = true; }
      finally { session.forking = forking; stateSoon(); }
      return { closed: true, ...(persistenceFailure ? { durable: false, outcome: 'unknown' } : {}) };
    });
    ownerClosePromise.catch(() => {});
    return ownerClosePromise;
  }
  function invokeOwner(method, args) {
    if (method === 'close') return closeOwner();
    if (!CONTROLS.has(method) && (persistenceFailure || ownerClosePromise)) throw fail('remote_outcome_unknown', 'Execution is terminating; no new work was submitted');
    if (method === 'beginFork' || method === 'endFork') {
      if (typeof args.operationId !== 'string' || !args.operationId || args.operationId.length > 256 || typeof args.childId !== 'string' || !args.childId || args.childId.length > 256) throw fail('bad_fork_reservation', 'Fork operation and child identities are required');
      const same = forkReservation?.operationId === args.operationId && forkReservation?.childId === args.childId;
      if (method === 'endFork') {
        if (!same) throw fail('fork_reservation_conflict', 'Fork reservation identity differs or no reservation exists');
        try { appendJournal(forkFd, { type: 'released', ...forkReservation, releasedAt: Date.now() }); } catch (error) { storageFailed(error); throw error; }
        forkReservation = null; session.forking = false; stateSoon();
        return { operationId: args.operationId, childId: args.childId, released: true };
      }
      if (same) return { ...forkReservation };
      const state = session.state();
      if (forkReservation || session.forking || session.status !== 'ready' || session.busy || state.busy || session.activeTurn || session.pendingTurns || session.cancelling || session.modeChanging || session.configChanging || session.titlePending || state.pendingPermissions?.length || state.pendingElicitations?.length) throw fail('fork_busy', 'Source execution must be idle with no pending interaction or configuration change');
      const reservation = { operationId: args.operationId, childId: args.childId };
      try { appendJournal(forkFd, { type: 'reserved', ...reservation, reservedAt: Date.now() }); } catch (error) { storageFailed(error); throw error; }
      forkReservation = reservation; session.forking = true; stateSoon();
      return { ...reservation };
    }
    // This check runs immediately before invocation, including calls admitted in
    // the same socket chunk as beginFork. Socket loss never releases this lock.
    if (forkReservation) throw fail('fork_busy', 'Source execution has an unresolved fork reservation');
    return invoke(session, method, args);
  }
  function send(peer, message) {
    if (peer.socket.destroyed || peer.fatal) return false;
    const bytes = JSON.stringify({ v: 1, ...message }) + '\n';
    if (Buffer.byteLength(bytes) > maxFrameBytes) {
      // A deterministic oversized response cannot be fixed by reconnecting.
      // Always send a bounded diagnostic, including during replay/attach.
      peer.fatal = true;
      peer.socket.end(JSON.stringify({ v: 1, type: 'error', error: {
        code: 'remote_frame_too_large', message: 'Broker response exceeds the protocol frame limit; request a smaller query',
      } }) + '\n');
      return false;
    }
    if (peer.socket.writableLength + Buffer.byteLength(bytes) > maxBufferedBytes) { peer.socket.destroy(); return false; }
    return peer.socket.write(bytes);
  }
  async function sendReplay(peer, message) {
    if (send(peer, message) || peer.socket.destroyed || peer.fatal) return;
    await new Promise(resolve => {
      const done = () => { peer.socket.off('drain', done); peer.socket.off('close', done); resolve(); };
      peer.socket.once('drain', done); peer.socket.once('close', done);
    });
  }
  function broadcast(message) {
    for (const peer of clients) {
      if (!peer.authenticated || peer.fatal) continue;
      if (peer.replaying) {
        const bytes = Buffer.byteLength(JSON.stringify(message));
        if (peer.queuedBytes + bytes > maxBufferedBytes) { peer.socket.destroy(); continue; }
        peer.queue.push(message); peer.queuedBytes += bytes;
      } else send(peer, message);
    }
  }
  function persistState() {
    if (!session || closed || persistenceFailure) return;
    const value = { v: 1, id, epoch, ...snapshot() }, bytes = recordBytes(value);
    if (recordBytes({ v: 1, type: 'attached', id, epoch, fence, binding, ...snapshot() }) > maxFrameBytes) throw fail('remote_frame_too_large', 'Owner snapshot exceeds the protocol frame limit');
    // Count both old state and the new temporary file at peak usage.
    if (journalBytes + stateBytes + bytes > maxJournalBytes) throw fail('journal_limit', 'Owner snapshot exceeds the remaining journal budget');
    const tmp = join(directory, 'broker-state-' + randomUUID() + '.tmp');
    const fd = privateFile(tmp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    try { append(fd, value, syncFile); } finally { closeSync(fd); }
    // Both names are fixed within the verified private owner directory.
    const target = join(directory, 'broker-state.json');
    if (dirname(tmp) !== directory || dirname(target) !== directory) throw fail('unsafe_file', 'Invalid state path');
    renameSync(tmp, target); stateBytes = bytes; syncFile(dirFd);
    terminalReady = ownerClosed && session.status === 'closed' && closeOperation?.status === 'completed' && closeOperation.durable &&
      ![...operations.values()].some(operation => operation.status === 'pending');
  }
  function unknownResult(operation) {
    return { type: 'result', opId: operation.opId, digest: operation.digest, ok: false, durable: false,
      error: { code: 'remote_outcome_unknown', message: 'Persistence failed after possible admission; outcome unknown and operation must not be resent' } };
  }
  function storageFailed(error) {
    if (persistenceFailure) return;
    persistenceFailure = publicError(error);
    // Freeze admission/drain synchronously. AcpSession intentionally catches its
    // event-hook exception; an asynchronous close alone leaves a microtask gap
    // in which a queued prompt could start after its predecessor's stop failed
    // fsync (or after the new prompt's admission event failed persistence).
    if (session && session.status !== 'closed') session.status = 'error';
    for (const operation of operations.values()) {
      if (operation.status !== 'pending' || CONTROLS.has(operation.method)) continue;
      operation.status = 'unknown'; operation.durable = false;
      // Keep a bounded digest tombstone, not an unbounded retained error/result.
      broadcast(unknownResult(operation));
    }
    // AcpSession catches event-hook exceptions. Merely throwing here would let
    // the SDK continue a task whose history can no longer be recovered.
    void closeOwner().catch(() => {});
    stateSoon();
  }
  function stateSoon() {
    if (stateScheduled || closed) return;
    stateScheduled = true;
    // AcpSession updates activeTurn/status in promise continuations after stop.
    setImmediate(() => {
      stateScheduled = false;
      if (closed) return;
      try { persistState(); broadcast({ type: 'state', epoch, ...snapshot() }); } catch (error) { storageFailed(error); }
    });
  }
  function appendEvent(_id, event) {
    if (persistenceFailure) throw fail('persistence_failed', 'Broker journal unavailable');
    try {
      if (!event || event.eventVersion !== 1 || !Number.isSafeInteger(event.seq) || event.seq < 1 || !event.generation || typeof event.generation !== 'string' || typeof event.type !== 'string' || (generation && event.generation !== generation) || event.seq !== headSeq + 1) throw fail('event_sequence_invalid', 'Invalid canonical event sequence');
      if (recordBytes({ v: 1, type: 'event', event }) > maxFrameBytes) throw fail('remote_frame_too_large', 'Canonical event exceeds the protocol frame limit');
      appendJournal(eventFd, event);
      firstSeq ??= event.seq; headSeq = event.seq; generation = event.generation;
    } catch (error) { storageFailed(error); throw error; }
  }
  const eventStore = {
    appendEvent,
    readEvents(_id, { sinceSeq = 0, limit = 1000, tail = false, beforeSeq } = {}) {
      const events = []; let count = 0;
      limit = Math.max(1, Math.min(10000, Number(limit) || 1000));
      if (headSeq > baseSeq) for (const event of records(eventPath)) {
        if (event.seq > headSeq) break;
        if (event.seq > sinceSeq && (beforeSeq == null || event.seq < beforeSeq)) {
          count++;
          if (tail || events.length < limit) events.push(event);
          if (tail && events.length > limit) events.shift();
        }
        // Do not parse a possibly partial, unconfirmed suffix after failed IO.
        if (event.seq === headSeq) break;
      }
      return { events, lastSeq: headSeq, generation, hasMore: !tail && count > events.length, hasEarlier: tail && count > events.length, oldestSeq: events[0]?.seq ?? null };
    }
  };
  session = createSession({
    eventStore,
    onEvent(event) { appendEvent(id, event); broadcast({ type: 'event', event: json(event) }); stateSoon(); },
    persistMetadata() { try { persistState(); } catch (error) { storageFailed(error); throw error; } }
  });
  // Fork owners may inherit an event sequence without replaying their parent.
  headSeq = Number.isSafeInteger(session.eventSeq) ? session.eventSeq : 0;
  generation = session.generation || null;
  const baseSeq = headSeq;

  async function attach(peer, frame) {
    const supplied = createHash('sha256').update(typeof frame.token === 'string' ? frame.token : '').digest();
    if (frame.v !== 1 || frame.type !== 'attach' || frame.id !== id || !timingSafeEqual(tokenHash, supplied)) throw fail('authentication_failed', 'Broker authentication failed');
    if (frame.epoch != null && frame.epoch !== epoch) throw fail('epoch_mismatch', 'Execution owner epoch changed; no automatic resubmission');
    if (!['control', 'observe'].includes(frame.mode) || typeof frame.consumerId !== 'string' || !frame.consumerId || frame.consumerId.length > 256 || !Number.isSafeInteger(frame.afterSeq) || frame.afterSeq < 0 || frame.afterSeq > headSeq) throw fail('bad_attach', 'Invalid attach cursor or mode');
    if (frame.afterSeq < baseSeq) throw fail('cursor_gap', 'Cursor precedes the inherited event prefix; retain the local prefix before attaching');
    if (shuttingDown) throw fail('broker_closed', 'Broker is shutting down');
    if (frame.mode === 'control' && frame.expectedFence != null && (!Number.isSafeInteger(frame.expectedFence) || frame.expectedFence !== fence)) throw fail('writer_fenced', 'Another controller replaced this disconnected writer');
    peer.authenticated = true; clearTimeout(peer.authTimer);
    peer.replaying = true; peer.mode = frame.mode; peer.consumerId = frame.consumerId;
    if (frame.mode === 'control') {
      if (writerConsumer !== frame.consumerId) {
        if (writerConsumer && frame.reconnect && frame.expectedFence == null) throw fail('writer_fenced', 'Unconfirmed reconnect cannot replace another controller');
        if (!Number.isSafeInteger(fence + 1)) throw fail('fence_exhausted', 'Writer fence exhausted');
        ++fence; writerConsumer = frame.consumerId;
      }
      // Reattaching this same consumer is idempotent even if attached ACK was
      // lost. Only the newest socket may mutate; its older sibling is fenced.
      peer.fence = fence; writerPeer = peer;
    }
    const replayHead = headSeq;
    if (replayHead > baseSeq) for (const event of records(eventPath)) {
      if (peer.socket.destroyed || peer.fatal) return;
      if (event.seq > replayHead) break;
      if (event.seq > frame.afterSeq) await sendReplay(peer, { type: 'event', event });
      if (event.seq === replayHead) break;
    }
    while (peer.queue.length && !peer.socket.destroyed && !peer.fatal) {
      const message = peer.queue.shift(); peer.queuedBytes -= Buffer.byteLength(JSON.stringify(message));
      await sendReplay(peer, message);
    }
    if (peer.socket.destroyed || peer.fatal) return;
    peer.replaying = false;
    send(peer, { type: 'attached', id, epoch, fence: peer.fence || null, binding, retainedFromSeq: firstSeq, ...snapshot() });
  }
  function operationReply(peer, operation) {
    if (operation.result) send(peer, operation.result);
    else if (operation.status === 'unknown') send(peer, unknownResult(operation));
    else send(peer, { type: 'accepted', opId: operation.opId, status: operation.status, digest: operation.digest, durable: operation.durable });
  }
  function call(peer, frame) {
    if (frame.epoch !== epoch) throw fail('epoch_mismatch', 'Execution owner epoch changed');
    if (frame.method === 'status') { send(peer, { type: 'result', opId: frame.opId, ok: true, value: snapshot() }); return; }
    if (!METHODS.has(frame.method)) throw fail('method_forbidden', 'Unsupported broker method');
    if (peer.mode !== 'control' || peer !== writerPeer || peer.fence !== fence || frame.fence !== fence) throw fail('writer_fenced', 'A newer controller owns this execution');
    if (typeof frame.opId !== 'string' || !frame.opId || frame.opId.length > 256 || !frame.args || typeof frame.args !== 'object' || Array.isArray(frame.args)) throw fail('bad_call', 'Invalid operation id or arguments');
    const control = CONTROLS.has(frame.method);
    const canonicalCall = canonical({ method: frame.method, args: frame.args });
    const digest = createHmac('sha256', digestKey).update(canonicalCall).digest('hex');
    const previous = operations.get(frame.opId);
    if (previous) {
      if (previous.digest !== digest) throw fail('operation_conflict', 'Operation id was already used with different arguments');
      operationReply(peer, previous); return;
    }
    if (control && Object.keys(frame.args).length) throw fail('bad_call', 'Safety controls do not accept arguments');
    if (terminalReady) throw fail('broker_closed', 'Execution is durably closed; only queries remain available');
    if (!control && (persistenceFailure || ownerClosePromise)) throw fail('persistence_failed', 'Execution is terminating; operation not submitted');
    if (!control && (!started || session.status === 'idle' || session.status === 'starting')) throw fail('not_ready', 'Execution owner is not ready');
    const bytes = Buffer.byteLength(canonicalCall);
    if (!control && ordinaryOperations >= maxOperations) throw fail('operation_limit', 'Operation deduplication capacity reached; safety close remains available');
    if (!control && pendingBytes + bytes > maxPendingBytes) throw fail('pending_limit', 'Pending operation byte budget reached; operation not submitted');
    // One extra close slot remains available even after every reserved stop slot
    // has been used. Its original opId remains queryable for lost-ACK recovery.
    if (frame.method === 'close' ? closeOperation !== null : control && controlOperations >= maxControlOperations) throw fail('control_limit', 'Safety control capacity reached; query the existing close receipt or submit explicit close');
    const operation = { opId: frame.opId, method: frame.method, digest, status: 'pending', acceptedAt: Date.now(), durable: true };
    if (control) {
      try {
        if (persistenceFailure) throw fail('persistence_failed', 'Journal is unavailable');
        appendJournal(operationFd, operation, true);
      } catch (error) {
        // Safety termination is the only permitted volatile mutation. Never
        // claim that this admission/result survives an owner crash.
        operation.durable = false;
        if (error.code !== 'journal_limit') storageFailed(error);
      }
      if (frame.method === 'close') closeOperation = operation; else controlOperations++;
    } else {
      try { appendJournal(operationFd, operation); }
      catch (error) { storageFailed(error); throw fail('persistence_failed', 'Operation was not submitted; previous task outcome may be unknown'); }
      ordinaryOperations++; pendingBytes += bytes; pendingSizes.set(operation, bytes);
    }
    operations.set(operation.opId, operation); terminalReady = false;
    send(peer, { type: 'accepted', opId: operation.opId, status: operation.status, digest: operation.digest, durable: operation.durable });
    // Only admission is serialized. Waiting for prompt completion would deadlock
    // its reverse permission/form calls and prevent cancellation.
    Promise.resolve().then(() => {
      const args = frame.args; frame.args = null;
      return invokeOwner(frame.method, args);
    }).then(value => complete(operation, true, value), error => complete(operation, false, error)).catch(error => {
      storageFailed(error);
      if (operation.status !== 'unknown') {
        operation.status = 'unknown'; operation.durable = false; broadcast(unknownResult(operation));
      }
    }).finally(() => {
      pendingBytes -= pendingSizes.get(operation) || 0; pendingSizes.delete(operation);
    });
  }
  function complete(operation, ok, value) {
    if (closed || operation.status === 'unknown') return;
    const control = CONTROLS.has(operation.method);
    const result = { type: 'result', opId: operation.opId, digest: operation.digest, ok, durable: operation.durable };
    if (ok) result.value = operation.method === 'elicitation' ? { ok: value?.ok, requestId: value?.requestId, action: value?.action } : json(value ?? null);
    else result.error = operation.method === 'elicitation' ? { code: String(value?.code || 'elicitation_failed'), message: 'Form response failed' } : publicError(value);
    const bytes = recordBytes(result);
    // Reserve the actual single-operation query envelope, not just the result
    // frame. The small extra margin also covers a later non-durable control
    // receipt annotation if fsync fails. Reconnect queries must fit in one frame.
    const queryBytes = recordBytes({ v: 1, type: 'operations', operations: [{
      opId: operation.opId, method: operation.method, digest: operation.digest, status: 'completed', result,
    }] });
    if (queryBytes + 128 > maxFrameBytes || recordBytes({ v: 1, ...result }) > maxFrameBytes || (!control && resultBytes + bytes > maxResultBytes) || (control && bytes > 4096)) {
      storageFailed(fail('result_limit', 'Operation ran but its result exceeds the retained result budget; outcome unknown'));
      if (!control) return;
      // Safety receipts themselves are bounded independently of arbitrary SDK
      // return values. Do not claim success when a control result is ambiguous.
      delete result.value; result.ok = false;
      result.error = { code: 'remote_outcome_unknown', message: 'Safety control result was too large; outcome unknown' };
    }
    const final = { ...operation, status: 'completed', completedAt: Date.now(), result };
    if (control) {
      try {
        if (persistenceFailure || !operation.durable) throw fail('persistence_failed', 'Safety receipt is not durable');
        appendJournal(operationFd, final, true);
      } catch (error) {
        final.durable = result.durable = false;
        if (ok && result.value && typeof result.value === 'object') result.value = { ...result.value, durable: false, outcome: 'unknown' };
        if (error.code !== 'journal_limit' && error.code !== 'persistence_failed') storageFailed(error);
      }
      Object.assign(operation, final);
    } else {
      try { appendJournal(operationFd, final); }
      catch (error) { storageFailed(error); return; }
      resultBytes += bytes; Object.assign(operation, final);
    }
    broadcast(result); stateSoon();
  }
  function handle(peer, frame) {
    if (peer.fatal) return;
    if (!peer.authenticated) {
      if (peer.attaching) throw fail('attach_pending', 'Wait for attach acknowledgement');
      peer.attaching = true;
      attach(peer, frame).catch(error => { send(peer, { type: 'error', error: publicError(error) }); peer.socket.end(); });
      return;
    }
    if (peer.replaying) throw fail('attach_pending', 'Wait for attach acknowledgement');
    if (frame.v !== 1) throw fail('protocol_version', 'Unsupported broker protocol');
    if (frame.type === 'call') return call(peer, frame);
    if (frame.type === 'query') {
      if (frame.epoch != null && frame.epoch !== epoch) throw fail('epoch_mismatch', 'Execution owner epoch changed');
      if (!Array.isArray(frame.opIds) || frame.opIds.length > 256 || frame.opIds.some(id => typeof id !== 'string' || id.length > 256)) throw fail('bad_query', 'Invalid operation query');
      send(peer, { type: 'operations', operations: frame.opIds.map(opId => { const op = operations.get(opId); return op ? { opId, method: op.method, digest: op.digest, status: op.status, ...(op.result ? { result: op.result } : {}) } : { opId, status: 'not_found' }; }) });
      return;
    }
    if (frame.type === 'ack') {
      if (frame.epoch !== epoch || !Number.isSafeInteger(frame.throughSeq) || frame.throughSeq < (peer.ack || 0) || frame.throughSeq > headSeq) throw fail('bad_ack', 'Invalid contiguous event acknowledgement');
      peer.ack = frame.throughSeq; return; // Retention is not trimmed by client ACK.
    }
    if (frame.type === 'detach') { peer.socket.end(); return; }
    throw fail('bad_message', 'Unknown broker message');
  }
  const server = net.createServer(socket => {
    const peer = { socket, authenticated: false, attaching: false, replaying: false, queue: [], queuedBytes: 0, input: Buffer.alloc(0) };
    clients.add(peer);
    peer.authTimer = setTimeout(() => socket.destroy(), 10000); peer.authTimer.unref();
    socket.on('error', () => {});
    socket.on('close', () => { clearTimeout(peer.authTimer); clients.delete(peer); });
    socket.on('data', chunk => {
      peer.input = Buffer.concat([peer.input, chunk]);
      let end;
      while ((end = peer.input.indexOf(10)) >= 0) {
        if (end > maxFrameBytes) { socket.destroy(); return; }
        const line = peer.input.subarray(0, end); peer.input = peer.input.subarray(end + 1);
        if (!line.length) continue;
        let frame;
        try {
          try { frame = JSON.parse(line.toString('utf8')); } catch { throw fail('bad_json', 'Malformed broker JSON frame'); }
          if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw fail('bad_message', 'Expected a protocol object');
          handle(peer, frame);
        } catch (error) {
          send(peer, { type: 'error', opId: typeof frame?.opId === 'string' ? frame.opId : undefined, error: publicError(error) });
          if (!peer.authenticated) { socket.end(); return; }
        }
      }
      if (peer.input.length > maxFrameBytes) socket.destroy();
    });
  });
  server.on('error', () => {});
  const api = {
    session,
    get identity() { return { id, epoch, binding }; },
    get headSeq() { return headSeq; },
    get terminalSnapshot() { return terminalReady && !persistenceFailure ? { id, epoch, binding: json(binding), baseSeq, ...snapshot() } : null; },
    get resourceUsage() { return { journalBytes, stateBytes, controlJournalBytes, pendingBytes, resultBytes, ordinaryOperations, controlOperations }; },
    get operations() { return new Map([...operations].map(([id, op]) => [id, json(op)])); },
    async listen(socketPath) {
      if (listening || shuttingDown || !isAbsolute(socketPath) || resolve(socketPath) !== socketPath) throw fail('unsafe_socket', 'Socket must use a canonical absolute path');
      privateDirectory(dirname(socketPath));
      await new Promise((resolveListen, reject) => {
        const error = value => { server.off('listening', ready); reject(value); };
        const ready = () => { server.off('error', error); resolveListen(); };
        server.once('error', error); server.once('listening', ready); server.listen(socketPath);
      });
      chmodSync(socketPath, 0o600); listening = true; return api;
    },
    start() {
      if (!listening || shuttingDown) return Promise.reject(fail('not_listening', 'Listen before starting the execution owner'));
      if (!started) started = Promise.resolve().then(() => session.start()).then(() => {
        try { persistState(); } catch (error) { storageFailed(error); throw error; }
        stateSoon(); return session;
      });
      return started;
    },
    dispose() { return shutdown(false); },
    close() { return shutdown(true); }
  };
  function shutdown(closeSession) {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      try { if (closeSession) await closeOwner(); else await session.dispose(); }
      finally {
        for (const peer of clients) peer.socket.destroy();
        if (listening) await new Promise(resolve => server.close(resolve));
        closed = true; closeSync(eventFd); closeSync(operationFd); closeSync(forkFd); closeSync(dirFd);
      }
    })();
    return shutdownPromise;
  }
  return api;
}
