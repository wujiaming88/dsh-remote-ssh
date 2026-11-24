export const HEARTBEAT_INTERVAL_MS = 15_000;

/** HTTP subscription only: never emit to the ACP journal or alter Agent lifetime. */
export async function streamAcpSubscription({
  session, req, res, cursor, permitted, activeStreams, isDisposed = () => false, prompt,
  setInterval: schedule = globalThis.setInterval, clearInterval: unschedule = globalThis.clearInterval,
}) {
  let ended = false, revoked = false, unsubscribe = () => {}, heartbeat, wroteError = false;
  const responseClosed = () => res.destroyed || res.closed || res.writableEnded || res.writableFinished;
  function close() {
    if (ended) return;
    ended = true;
    if (heartbeat !== undefined) { unschedule(heartbeat); heartbeat = undefined; }
    try { unsubscribe(); } catch { /* A failed observer cleanup cannot retain the timer. */ }
    activeStreams.delete(close);
    res.removeListener('close', close); res.removeListener('error', close); req.removeListener('aborted', close);
    if (!responseClosed()) {
      try { res.end(); } catch { res.destroy?.(); }
    }
  }
  function writeFrame(frame) {
    if (ended) return false;
    // Do not queue behind a slow consumer; reconnect/replay uses the durable cursor.
    if (responseClosed() || res.writableNeedDrain || res.writable === false) { close(); return false; }
    try {
      if (res.write(JSON.stringify(frame) + '\n') === false) { close(); return false; }
      return !ended;
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
    if (!authorized()) return;
    if (event.type === 'error') wroteError = true;
    writeFrame(event);
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
      if (ended) unsubscribe();
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
      finally { close(); }
    }
    return close;
  } catch (e) { close(); throw e; }
}
