/** Host facade for a remote-owned ACP session. SSH is only a replaceable link. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AcpSession } from './acp.js';
import { AcpError, deferred, withTimeout } from './acp-core.js';
import { prepareSteeringPrompt } from './acp-steering.js';
import { ACP_EVENT_VERSION } from './acp-store.js';
import { createDurableLink } from './durable-link.js';
import { buildDurableLaunchSpec } from './durable-launch.js';

export const DURABLE_PROTOCOL = 'dsh-acp-broker/1';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const FORK_RESERVATION_TIMEOUT_MS = 20000;
const SESSION_FIELDS = ['id', 'agent', 'cwd', 'remotePath', 'configuredRemotePath', 'remoteRuntimeDir', 'agentPath', 'workspaceId', 'dshSessionId', 'generation', 'eventSeq', 'createdAt', 'resumeSessionId'];

/** Locator credentials never belong in browser snapshots or public event journals. */
export function publicRemoteExecution(value) {
  if (!value) return undefined;
  return Object.fromEntries(['protocol', 'id', 'epoch', 'taskStatus', 'busy', 'pendingTurns', 'lastRemoteSeq'].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}

function identityBinding(session) {
  const profile = session.profile;
  return {
    profileId: String(profile.id || session.opts.profileId || ''),
    host: String(profile.host || ''), user: String(profile.user || ''), port: Number(profile.port || 22), proxyJump: String(profile.proxyJump || ''),
    workspaceId: session.workspaceId, dshSessionId: session.dshSessionId,
    agent: session.agent, cwd: session.cwd, remotePath: session.remotePath, configuredRemotePath: session.configuredRemotePath,
    remoteRuntimeDir: session.remoteRuntimeDir, agentPath: session.agentPath, generation: session.generation,
  };
}

/** Composition, rather than inheritance, keeps the worker's AcpSession independent. */
export function createDurableSession(options = {}) {
  const session = new AcpSession(options);
  const baseState = session.state.bind(session);
  const baseSubscribe = session.subscribe.bind(session);
  let link = null, starting = null, remoteState = null;
  // Display-only projection. Executable queued content belongs exclusively to the owner.
  let queuedMessages = clone(options.queuedMessages || []);
  let disposed = false, attached = false, interrupted = false;
  const interruption = deferred(); interruption.promise.catch(() => {});
  const waitLocal = promise => Promise.race([promise, interruption.promise]);
  const operations = new Map(), stateSubscribers = new Set();
  const admissionEntries = options.nativeAdmissions || [];
  session.nativeAdmissions = new Map(admissionEntries.map(entry => [entry.requestId, clone(entry.content)]));
  session.nativeAdmissionFingerprints = new Map(admissionEntries.filter(entry => entry.fingerprint).map(entry => [entry.requestId, entry.fingerprint]));
  session.remoteExecution = options.remoteExecution ? clone(options.remoteExecution) : null;
  session.transportState = 'detached';
  session.lastTransportError = null;
  Object.defineProperty(session, 'alive', { get: () => !disposed && !interrupted && !['error', 'disconnected'].includes(session.transportState) && ['starting', 'ready', 'prompting'].includes(session.status) });
  // These are projections only. The actual permission deferreds live remotely.
  let permissions = [];
  session.broker.list = () => clone(permissions);

  function persist() { options.persistMetadata?.(session); }
  function rememberTask() {
    if (!session.remoteExecution) return;
    session.remoteExecution = { ...session.remoteExecution,
      taskStatus: remoteState?.status || session.status,
      busy: remoteState?.busy ?? session.busy,
      pendingTurns: remoteState?.pendingTurns ?? session.pendingTurns,
      lastRemoteSeq: session.eventSeq,
    };
  }
  function notifyActivity() {
    for (const observer of [...stateSubscribers]) { try { observer(session.state()); } catch {} }
    try { options.onActivity?.(); } catch {}
  }
  session.subscribeState = (observer, { replay = true } = {}) => {
    stateSubscribers.add(observer);
    if (replay) observer(session.state());
    return () => stateSubscribers.delete(observer);
  };
  function applyState(frame) {
    if (disposed) return;
    const snapshot = frame?.state || frame;
    if (!snapshot || typeof snapshot !== 'object') return;
    if (frame?.epoch && session.remoteExecution?.epoch && frame.epoch !== session.remoteExecution.epoch) throw new AcpError('Remote owner epoch changed', 'broker_epoch_mismatch');
    if (frame?.generation && frame.generation !== session.generation || snapshot.generation && snapshot.generation !== session.generation) throw new AcpError('Remote snapshot generation changed', 'durable_event_invalid');
    const head = frame?.headSeq ?? snapshot.cursor?.seq;
    if (Number.isSafeInteger(head) && head > session.eventSeq) throw new AcpError('Remote snapshot arrived before its durable events', 'durable_event_gap');
    remoteState = clone(snapshot);
    if (Array.isArray(snapshot.queuedMessages)) queuedMessages = clone(snapshot.queuedMessages);
    if (Object.hasOwn(frame || {}, 'forkReservation')) session.remoteForkReservation = clone(frame.forkReservation);
    for (const key of ['sessionId', 'status', 'config', 'commands', 'capabilities', 'title', 'titleStatus', 'lastError', 'startedAt', 'permissionStatus', 'pendingTurns', 'steeringUncertain']) {
      if (snapshot[key] !== undefined) session[key] = clone(snapshot[key]);
    }
    if (typeof snapshot.remotePath === 'string') session.remotePath = snapshot.remotePath;
    if (typeof snapshot.permission === 'string') session.permissionMode = snapshot.permission;
    if (snapshot.permissionStatus?.requested) session.requestedPermission = snapshot.permissionStatus.requested;
    if (snapshot.activeTurn !== undefined) session.activeTurn = clone(snapshot.activeTurn);
    else if (snapshot.busy === false) session.activeTurn = null;
    if (snapshot.busy === true && !session.pendingTurns) session.pendingTurns = 1;
    permissions = clone(snapshot.pendingPermissions || []);
    session.pendingElicitations = new Map((snapshot.pendingElicitations || []).map(event => [String(event.requestId), { event: clone(event) }]));
    const requests = frame?.requests || snapshot.requests;
    if (Array.isArray(requests)) session.requests = new Map(requests.map(request => [request.requestId, clone(request)]));
    rememberTask();
    persist();
    notifyActivity();
  }
  function receive(event) {
    if (disposed) return;
    if (!event || event.eventVersion !== ACP_EVENT_VERSION || event.generation !== session.generation || !Number.isSafeInteger(event.seq) || event.seq < 1) throw new AcpError('Invalid canonical remote event', 'durable_event_invalid');
    if (event.seq <= session.eventSeq) return;
    if (event.seq !== session.eventSeq + 1) throw new AcpError('Remote event sequence has a gap', 'durable_event_gap');
    // Remote data cannot inject locally admitted asset references or raw content
    // into the native writer. Native admission is read through nativeContentFor.
    const canonical = clone(event);
    delete canonical.nativeContent;
    if (canonical.type === 'turn_start') delete canonical.content;
    // Do not advance the replay cursor unless the journal append succeeded.
    if (options.persistCanonicalEvent) options.persistCanonicalEvent(canonical, session);
    else options.onEvent?.(canonical, session);
    session.eventSeq = canonical.seq;
    session.events.push(canonical);
    if (session.events.length > session.maxEvents) session.events.splice(0, session.events.length - session.maxEvents);
    if (canonical.type === 'queue_snapshot' && Array.isArray(canonical.queuedMessages)) queuedMessages = clone(canonical.queuedMessages);
    if (canonical.type === 'turn_start') {
      session.activeTurn = { id: canonical.turnId, requestId: canonical.requestId };
      session.status = 'prompting';
      session.pendingTurns = Math.max(1, session.pendingTurns);
      for (const observer of [...session.turnLifecycleSubscribers]) { try { observer(canonical); } catch {} }
    } else if (canonical.type === 'stop') {
      if (session.activeTurn?.id === canonical.turnId) session.activeTurn = null;
      session.pendingTurns = Number(canonical.pendingTurns) || 0;
      if (!session.pendingTurns && session.status === 'prompting') session.status = 'ready';
    }
    rememberTask();
    try { persist(); } catch (error) { session.persistenceError = String(error.message || error); }
    for (const observer of [...session.subscribers]) { try { observer(canonical); } catch {} }
    options.onCanonicalEvent?.(canonical, session);
  }
  function onIdentity(identity) {
    if (!identity || !identity.id || !identity.token || !identity.binding) throw new AcpError('Invalid durable owner identity', 'durable_identity_invalid');
    const previous = session.remoteExecution;
    if (previous && (identity.id !== previous.id || identity.token !== previous.token || JSON.stringify(identity.binding) !== JSON.stringify(previous.binding) || previous.epoch && identity.epoch && previous.epoch !== identity.epoch)) throw new AcpError('Remote owner identity changed', 'broker_epoch_mismatch');
    session.remoteExecution = { ...previous, ...clone(identity), protocol: DURABLE_PROTOCOL, lastRemoteSeq: session.eventSeq };
    try { persist(); } catch (error) { session.remoteExecution = previous; throw error; }
  }
  function onConnection(value) {
    if (disposed) return;
    const status = typeof value === 'string' ? value : value?.state || value?.status;
    session.transportState = status || 'reconnecting';
    session.lastTransportError = typeof value === 'object' ? value.error?.message || value.message || null : null;
    // A dropped SSH link never settles a turn, cancels a gate or changes status.
    notifyActivity();
  }

  session._guardFork = () => {
    if (session.forking || session.remoteForkReservation) throw new AcpError('Session fork is in progress', 'fork_busy');
  };
  session.reserveFork = async operation => {
    if (disposed || interrupted || !link) throw new AcpError('Durable source is detached', 'remote_detached');
    const value = { operationId: operation.operationId, childId: operation.childId };
    await withTimeout(waitLocal(link.call('beginFork', value, { opId: 'fork-reserve:' + operation.operationId })),
      FORK_RESERVATION_TIMEOUT_MS, 'Remote fork reservation');
    session.remoteForkReservation = value;
  };
  session.releaseFork = async operation => {
    if (disposed || interrupted || !link) throw new AcpError('Durable source is detached', 'remote_detached');
    await withTimeout(waitLocal(link.call('endFork', { operationId: operation.operationId, childId: operation.childId }, { opId: 'fork-release:' + operation.operationId })),
      FORK_RESERVATION_TIMEOUT_MS, 'Remote fork release');
    session.remoteForkReservation = null;
  };

  session.validateNativeContentInput = (requestId, fingerprint) => {
    const id = String(requestId), previous = session.nativeAdmissionFingerprints.get(id);
    if (!session.nativeAdmissions.has(id)) return;
    if (!previous) throw new AcpError('Previous native admission has no input proof; do not resend with this requestId', 'request_outcome_unknown');
    if (previous !== fingerprint) throw new AcpError('Request input differs from its durable native admission', 'request_conflict');
  };
  session.registerNativeContent = (requestId, content, fingerprint) => {
    const id = String(requestId || '');
    if (!id || !Array.isArray(content)) throw new AcpError('Native admission requires a requestId and content', 'native_content_admission_required');
    if (fingerprint) session.validateNativeContentInput(id, fingerprint);
    const previous = session.nativeAdmissions.get(id), previousFingerprint = session.nativeAdmissionFingerprints.get(id), next = clone(content);
    if (previous && JSON.stringify(previous) !== JSON.stringify(next)) throw new AcpError('Request content differs from its durable admission', 'request_conflict');
    session.nativeAdmissions.set(id, next);
    if (fingerprint) session.nativeAdmissionFingerprints.set(id, fingerprint);
    try { persist(); } catch (error) {
      if (previous) session.nativeAdmissions.set(id, previous); else session.nativeAdmissions.delete(id);
      if (previousFingerprint) session.nativeAdmissionFingerprints.set(id, previousFingerprint); else session.nativeAdmissionFingerprints.delete(id);
      throw error;
    }
  };
  session.nativeContentFor = event => {
    if (!event?.requestId || event.generation !== session.generation) return undefined;
    return clone(session.nativeAdmissions.get(String(event.requestId)));
  };
  // Editing a still-queued message changes only its text. Attachment blocks and
  // the request identity stay intact, so no asset is re-read or re-admitted.
  function replaceAdmittedText(content, value) {
    if (!Array.isArray(content)) return content;
    const blocks = clone(content), index = blocks.findIndex(block => block?.type === 'text');
    if (index >= 0) {
      if (value) blocks[index] = { ...blocks[index], text: value };
      else blocks.splice(index, 1);
    } else if (value) blocks.unshift({ type: 'text', text: value });
    return blocks;
  }
  session.subscribe = (observer, opts) => baseSubscribe(observer, opts);
  session.state = () => ({ ...baseState(),
    queuedMessages: clone(queuedMessages),
    transportState: session.transportState,
    lastTransportError: session.lastTransportError,
    remoteTaskStatus: remoteState?.status || session.remoteExecution?.taskStatus || session.status,
    forking: session.forking || !!session.remoteForkReservation,
    remoteExecution: publicRemoteExecution(session.remoteExecution),
    resumable: !!session.remoteExecution && session.remoteExecution.taskStatus !== 'closed',
  });

  session.start = async () => {
    if (starting) return starting;
    if (disposed || interrupted) throw new AcpError('Durable facade is detached', 'remote_detached');
    if (attached) return session;
    starting = (async () => {
      const create = !session.remoteExecution?.epoch;
      if (!session.remoteExecution) {
        // Durable intent precedes launching SSH; retries attach the same owner.
        onIdentity({ id: randomUUID(), token: randomBytes(32).toString('hex'), binding: identityBinding(session) });
      } else if (session.remoteExecution.protocol !== DURABLE_PROTOCOL) throw new AcpError('Unsupported durable owner protocol', 'durable_protocol_unsupported');
      session.status = 'starting';
      const sessionOptions = Object.fromEntries(SESSION_FIELDS.map(key => [key, session[key]]));
      Object.assign(sessionOptions, { requests: [...session.requests.values()].map(({ promise, ...request }) => clone(request)), permission: session.requestedPermission, modeId: options.modeId, model: options.model,
        forkSessionId: options.forkSessionId, forkConfig: options.forkConfig, forkOrigin: session.forkOrigin,
        title: session.title, titleStatus: session.titleStatus,
      });
      const identity = clone(session.remoteExecution);
      const launchSpec = await waitLocal((options.buildDurableLaunchSpec || buildDurableLaunchSpec)({ ...options,
        agent: session.agent, remotePath: session.remotePath, remoteRuntimeDir: session.remoteRuntimeDir,
        identity, create, sessionOptions,
      }));
      if (interrupted) throw new AcpError('Host is shutting down; remote execution is retained', 'remote_detached');
      link = (options.createDurableLink || createDurableLink)({ launchSpec, spawn: session.spawn,
        env: { ...process.env, ...options.env }, identity, create, afterSeq: session.eventSeq,
        getCursor: () => session.eventSeq, onEvent: receive, onState: applyState, onConnection, onIdentity,
      });
      // Fork intent remains durable before the remote may observe the request.
      if (options.forkSessionId) options.onForkSubmitted?.();
      const frame = await waitLocal(link.start());
      applyState(frame);
      if (frame?.epoch) onIdentity({ ...session.remoteExecution, epoch: frame.epoch });
      if (options.forkSessionId) {
        if (!session.sessionId || session.sessionId === options.forkSessionId) throw new AcpError('Fork must return a distinct remote session', 'fork_invalid_response');
        options.onForkResponse?.({ sessionId: session.sessionId });
      }
      attached = true;
      session.transportState = 'connected';
      rememberTask(); persist();
      return session;
    })();
    try { return await starting; }
    catch (error) {
      session.lastTransportError = String(error.message || error);
      session.transportState = 'disconnected';
      session.status = 'detached';
      // Leave the owner locator and remote outcome intact; never session/close.
      try { await link?.close(); } catch {}
      throw error;
    } finally { starting = null; }
  };

  async function call(method, args = {}, opId) {
    if (method !== 'close') session._guardFork();
    if (disposed || interrupted || !link) throw new AcpError('Durable session is detached', 'remote_detached');
    if (session.status === 'closed' || session.remoteExecution?.taskStatus === 'closed') throw new AcpError('Remote session is closed', 'session_closed');
    const id = String(opId || randomUUID());
    const previous = operations.get(id);
    if (previous) {
      if (previous.method !== method || JSON.stringify(previous.args) !== JSON.stringify(args)) throw new AcpError('Operation identity was reused with different input', 'request_conflict');
      return previous.promise;
    }
    // Cache the full reconciliation gate, not merely the broker's receipt. A
    // concurrent HTTP retry must not return an older projection while the first
    // caller is still waiting for its authoritative post-operation snapshot.
    const promise = (async () => {
      const result = await waitLocal(link.call(method, args, { opId: id }));
      // The operation result can precede the broker's coalesced state frame.
      // Fetch an authoritative snapshot before an HTTP response can overwrite a
      // newer event projection with stale Host state.
      const snapshot = await waitLocal(link.call('status', {}, { opId: 'status:' + randomUUID() }));
      applyState(snapshot);
      return result;
    })();
    operations.set(id, { method, args: clone(args), promise });
    // The broker owns results and request deduplication across Host restarts.
    try { return await promise; }
    finally { if (operations.get(id)?.promise === promise) operations.delete(id); }
  }
  session.prompt = async (text, opts = {}) => {
    session.preparePrompt(text, opts); // local capability/admission validation only
    const requestId = String(opts.requestId || randomUUID());
    return call('prompt', { text: String(text ?? ''), attachments: opts.attachments || [], requestId }, requestId);
  };
  session.queue = async (text, opts = {}) => {
    if (session.transportState !== 'connected') throw new AcpError('Remote owner is disconnected; message was not queued locally', 'remote_disconnected');
    session.preparePrompt(text, opts); // same capability validation as prompt
    const requestId = String(opts.requestId || randomUUID());
    return call('queue', { text: String(text ?? ''), attachments: opts.attachments || [], requestId }, requestId);
  };
  session.removeQueued = target => {
    const args = typeof target === 'string' ? { targetRequestId: target } : target || {};
    const targetRequestId = String(args.targetRequestId || '');
    if (!targetRequestId) return Promise.reject(new AcpError('targetRequestId is required', 'bad_request'));
    // Deterministic even when the original HTTP response or Host process is lost.
    return call('removeQueued', { targetRequestId }, args.opId || 'removeQueued:' + targetRequestId);
  };
  session.updateQueued = async target => {
    const args = typeof target === 'string' ? { targetRequestId: target } : target || {};
    const targetRequestId = String(args.targetRequestId || ''), text = String(args.text ?? '');
    if (!targetRequestId) throw new AcpError('targetRequestId is required', 'bad_request');
    const opId = args.opId || 'updateQueued:' + targetRequestId + ':' + createHash('sha256').update(text).digest('hex');
    const previous = session.nativeAdmissions.get(targetRequestId), hadPrevious = session.nativeAdmissions.has(targetRequestId);
    // Apply the trusted text admission before the remote ACK. If the active turn
    // completes while the ACK is in flight, native history must already see the
    // edited text; roll back only when the remote authoritatively rejects it.
    if (hadPrevious) {
      session.nativeAdmissions.set(targetRequestId, replaceAdmittedText(previous, text));
      try { persist(); }
      catch (error) { session.nativeAdmissions.set(targetRequestId, previous); throw error; }
    }
    try { return await call('updateQueued', { targetRequestId, text }, opId); }
    catch (error) {
      if (hadPrevious) {
        session.nativeAdmissions.set(targetRequestId, previous);
        try { persist(); } catch {}
      }
      throw error;
    }
  };
  session.promoteQueued = target => {
    const args = typeof target === 'string' ? { targetRequestId: target } : target || {};
    const targetRequestId = String(args.targetRequestId || '');
    if (!targetRequestId) return Promise.reject(new AcpError('targetRequestId is required', 'bad_request'));
    // One-shot per queued identity: a retry after a lost response must not inject twice.
    return call('promoteQueued', { targetRequestId }, args.opId || 'promoteQueued:' + targetRequestId);
  };
  session.steer = async (text, opts = {}) => {
    const requestId = String(opts.requestId || randomUUID()), value = String(text ?? '');
    const prepared = session.preparePrompt(value, opts);
    prepareSteeringPrompt(prepared.prompt, session.capabilities, session.agent);
    if (!session.nativeAdmissions.has(requestId) && !opts.attachments?.length) session.registerNativeContent(requestId, [{ type: 'text', text: value }]);
    return call('steer', { text: value, attachments: opts.attachments || [], requestId }, requestId);
  };
  session.command = (name, input = '') => call('command', { name, input });
  session.permission = args => call('permission', args);
  session.elicitation = args => call('elicitation', args);
  session.cancel = () => call('cancel');
  session.stop = () => call('stop');
  session.setConfig = (configId, value) => call('setConfig', { configId, value });
  session.setMode = modeId => call('setMode', { modeId });
  session.setTitle = title => call('setTitle', { title });
  // Shutdown must unblock local metadata/fork locks before awaiting them. This
  // gate rejects local waiters only; no cancel/close reaches the remote owner.
  session.interruptLocalWaits = async () => {
    if (interrupted) return;
    interrupted = true;
    session.transportState = 'detached';
    interruption.reject(new AcpError('Host detached; remote operation outcome is retained for recovery', 'remote_detached'));
    notifyActivity();
    await link?.close();
  };
  session.dispose = async () => {
    if (session.forking) throw new AcpError('Session fork is in progress', 'fork_busy');
    if (disposed) return;
    rememberTask();
    disposed = true; session.closed = true; session.status = session.remoteExecution?.taskStatus === 'closed' ? 'closed' : 'detached'; session.transportState = 'detached';
    notifyActivity();
    try { await link?.close(); }
    finally { session.subscribers.clear(); session.turnLifecycleSubscribers.clear(); stateSubscribers.clear(); }
  };
  session.close = async () => {
    if (session.remoteExecution?.taskStatus === 'closed') { if (!disposed) await session.dispose(); return; }
    if (disposed) throw new AcpError('Attach the durable owner before terminating it', 'not_ready');
    await call('close', {}, 'close:' + session.remoteExecution.id); // Stable across Host restart; never consume a second close slot.
    remoteState = { ...remoteState, status: 'closed', busy: false, pendingTurns: 0 };
    session.status = 'closed'; session.pendingTurns = 0; rememberTask(); persist();
    await session.dispose();
    session.status = 'closed';
  };
  return session;
}
