export const HEARTBEAT_INTERVAL_MS = 15_000;
// Match the durable transport's pending ceiling; legal 16 MiB records must fit.
export const MAX_PENDING_BYTES = 64 * 1024 * 1024;
export const DRAIN_TIMEOUT_MS = 10_000;

/** HTTP subscription only: never emit to the ACP journal or alter Agent lifetime. */
export async function streamAcpSubscription({
  session, req, res, cursor, permitted, activeStreams, isDisposed = () => false, prompt,
  setInterval: schedule = globalThis.setInterval, clearInterval: unschedule = globalThis.clearInterval,
  setTimeout: scheduleDrain = globalThis.setTimeout, clearTimeout: unscheduleDrain = globalThis.clearTimeout,
}) {
  let ended = false, finishing = false, revoked = false, unsubscribe = () => {}, unsubscribeState = () => {}, heartbeat, wroteError = false;
  let waitingDrain = false, drainTimer, queuedBytes = 0, queueHead = 0;
  const queue = [];
  const responseClosed = () => res.destroyed || res.closed || res.writableEnded || res.writableFinished;
  function detachProducers() {
    if (heartbeat !== undefined) { unschedule(heartbeat); heartbeat = undefined; }
    const off = unsubscribe, offState = unsubscribeState;
    unsubscribe = unsubscribeState = () => {};
    try { off(); } catch { /* A failed observer cleanup cannot retain the timer. */ }
    try { offState(); } catch { /* State observations never own the task. */ }
  }
  function clearDrain() {
    waitingDrain = false;
    if (drainTimer !== undefined) { unscheduleDrain(drainTimer); drainTimer = undefined; }
    res.removeListener('drain', drain);
  }
  function close(destroy = false) {
    if (ended) return;
    ended = true;
    detachProducers();
    clearDrain();
    queue.length = 0; queuedBytes = 0; queueHead = 0;
    activeStreams.delete(close);
    res.removeListener('close', close); res.removeListener('error', close); req.removeListener('aborted', close);
    // Slow consumers must release Node's accepted write buffer too, not wait in end().
    if (destroy === true) { res.destroy?.(); return; }
    if (!responseClosed()) {
      try { res.end(); } catch { res.destroy?.(); }
    }
  }
  function waitForDrain() {
    if (ended || waitingDrain) return;
    waitingDrain = true;
    res.once('drain', drain);
    // Independent of heartbeat: an idle or finished prompt can still stall delivery.
    drainTimer = scheduleDrain(() => close(true), DRAIN_TIMEOUT_MS);
    drainTimer?.unref?.();
  }
  function send(line) {
    try {
      // false means accepted, not dropped: never write this line a second time.
      if (res.write(line) === false && !ended) waitForDrain();
      return !ended;
    } catch { close(); return false; }
  }
  function drain() {
    clearDrain();
    if (!authorized()) return;
    while (queueHead < queue.length && !ended && !waitingDrain) {
      const { line, bytes } = queue[queueHead];
      queue[queueHead++] = null; queuedBytes -= bytes;
      // Release sent strings immediately, and amortize compaction for tiny records.
      if (queueHead === queue.length) { queue.length = 0; queueHead = 0; }
      else if (queueHead >= 1024 && queueHead * 2 >= queue.length) { queue.splice(0, queueHead); queueHead = 0; }
      if (!send(line)) return;
    }
    if (finishing && !ended && !waitingDrain && !queue.length) close();
  }
  function writeFrame(frame) {
    if (ended) return false;
    if (responseClosed() || res.writable === false) { close(); return false; }
    try {
      const line = JSON.stringify(frame) + '\n', bytes = Buffer.byteLength(line);
      // Bound both our queue and the bytes already accepted by Node. Oversized
      // frames/bursts reconnect using the durable cursor, without cancelling work.
      if (bytes + queuedBytes + (res.writableLength || 0) > MAX_PENDING_BYTES) { close(true); return false; }
      if (waitingDrain || res.writableNeedDrain) {
        queue.push({ line, bytes }); queuedBytes += bytes;
        waitForDrain();
        return true;
      }
      return send(line);
    } catch { close(); return false; }
  }
  function requestPermitted() {
    // Request authorization is independent of the HTTP subscriber's lifetime.
    if (revoked || isDisposed()) { close(); return false; }
    let allowed = false;
    try { allowed = permitted(); } catch { /* Fail closed if policy reevaluation fails. */ }
    if (allowed) return true;
    revoked = true;
    // Control frames are unsequenced and never enter session.emit/the replay journal.
    writeFrame({ type: 'error', code: 'remote_access_denied', message: 'Access to this remote Session was revoked' });
    close();
    return false;
  }
  function authorized() {
    if (ended) return false;
    if (responseClosed() || req.aborted) { close(); return false; }
    return requestPermitted();
  }
  function write(event) {
    if (finishing || !authorized()) return;
    if (event.type === 'error') wroteError = true;
    writeFrame(event);
  }
  function finish() {
    if (ended) return;
    finishing = true;
    detachProducers();
    // Preserve queued terminal events when a prompt settles during backpressure.
    if (!waitingDrain && !queue.length) close();
  }
  activeStreams.add(close);
  res.on('close', close); res.on('error', close); req.on('aborted', close);
  try {
    // The Host has authorized the request. A response closed before this admission
    // boundary cannot start work; detaching after it must not discard that work.
    if (responseClosed() || req.aborted || isDisposed()) { close(); return close; }
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' });
    const page = session.eventsSince(cursor, { limit: 1 });
    writeFrame({ type: 'replay', reset: page.reset, cursor: cursor || null });
    if (!ended) {
      unsubscribe = session.subscribe(write, { cursor, replay: true });
      // subscribe() can replay synchronously and close before returning its disposer.
      if (ended) detachProducers();
    }
    if (!ended && typeof session.subscribeState === 'function') {
      // These are unsequenced, public snapshots, not synthetic ACP journal events.
      const state = value => { if (!finishing && authorized()) writeFrame({ type: 'snapshot', state: value }); };
      unsubscribeState = session.subscribeState(state, { replay: false });
      if (ended) detachProducers();
      else state(session.state());
    }
    if (!ended) {
      heartbeat = schedule(() => { if (authorized()) writeFrame({ type: 'heartbeat' }); }, HEARTBEAT_INTERVAL_MS);
      heartbeat?.unref?.();
    }
    // Replay backpressure/browser detach only ends delivery, not an admitted prompt.
    // Recheck policy even when HTTP ended, and never revive observed revocation.
    if (prompt && requestPermitted()) {
      try { await prompt(); }
      catch (e) { if (!wroteError) write({ type: 'error', code: e.code || 'prompt_failed', message: e.message }); }
      finally { finish(); }
    }
    return close;
  } catch (e) { close(); throw e; }
}
