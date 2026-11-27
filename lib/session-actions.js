import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { buildForkSeed } from '@deepseek-ai/dsh-session';
import { SessionActionStore, validForkProof } from './session-action-store.js';
import { supportsSessionAction } from './acp-transport.js';
import { runtimeOptions } from './workspace-backend.js';
import { error } from './ssh.js';
import { normalizeBackend } from './config.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const busy = state => !!(state && (state.busy || state.pendingTurns || state.forking || state.status === 'starting' || state.status === 'prompting' || state.pendingPermissions?.length || state.pendingElicitations?.length));
const publicOperation = (op, active = false, runtimeOp = null) => {
  if (!op) return null;
  const confirmedRemoteId = op.remoteSessionId || (runtimeOp?.sourceId === op.sourceId && runtimeOp?.dshSessionId === op.childDshSessionId && (!op.childId || runtimeOp?.childId === op.childId) ? runtimeOp?.remoteSessionId : null);
  const unknown = op.phase === 'remotePending' && !confirmedRemoteId;
  const recoverable = ['accepted', 'prepared', 'remoteCreated', 'bound', 'nativeCreated'].includes(op.phase) && !unknown || op.phase === 'remotePending' && !!confirmedRemoteId;
  const runState = op.phase === 'completed' ? 'completed' : active ? 'running' : op.error && !recoverable ? 'failed' : 'interrupted';
  const now = Date.now();
  return { operationId: op.operationId, sessionId: op.childDshSessionId, sourceSessionId: op.sourceDshSessionId,
    phase: op.phase, outcome: confirmedRemoteId && runtimeOp?.outcome || op.outcome || null, recoverable, runState,
    activeStep: op.phase === 'completed' ? 'completed' : op.step || (op.phase === 'remotePending' ? 'creatingRemote' : 'checking'),
    recoveryKind: op.phase === 'completed' || !recoverable && !unknown ? 'none' : unknown ? 'unknown' : 'resume',
    revision: op.revision || 0, createdAt: op.createdAt, stepStartedAt: op.stepStartedAt || op.createdAt,
    updatedAt: op.updatedAt || op.createdAt, durationMs: Math.max(0, (op.completedAt || (active ? now : op.updatedAt || now)) - op.createdAt),
    ...(op.progress ? { progress: structuredClone(op.progress) } : {}), ...(op.stepDurations ? { stepDurations: { ...op.stepDurations } } : {}),
    error: op.error || null };
};
const failureInfo = e => ({ code: e.code || 'session_action_failed', message: String(e.message || e) });

/** Only explicit user HTTP actions call these operations; no mutating model tools. */
export async function createSessionActions({ ctx, stateDir, runtime, bindings, configuration, workspaces, sessionBackend, recorder, attachRecorder }) {
  const store = new SessionActionStore(join(stateDir, 'session-actions.json'));
  const permits = new Map(), permitChecks = new Map(), forks = new Map(), forkIds = new Map(), titleTails = new Map(), titleRevisions = new Map(), suppressed = new Set(), handles = new Map(), pending = new Set();
  const titleSubscribers = new Set(), forkSubscribers = new Set();
  let stopped = false, disposed = false, loadError = null;
  // Broken remote metadata must not prevent native/local Session restoration.
  try { await store.load(); } catch (e) { loadError = e; ctx.logger.warn('Remote action metadata unavailable: %s', e.message); }
  try { await bindings.load(); } catch (e) { ctx.logger.warn('Remote binding metadata unavailable: %s', e.message); }
  function operationView(op, active = false) {
    let remote = null;
    if (op?.phase === 'remotePending' && !op.remoteSessionId) {
      try { remote = runtime.forkOperation?.(op.operationId) || null; } catch {}
    }
    return publicOperation(op, active, remote);
  }
  function active() { if (stopped) throw error('host_stopped', 'Remote Session actions are stopped; recovery metadata is retained'); }
  function track(task) { pending.add(task); task.then(() => pending.delete(task), () => pending.delete(task)); return task; }
  function publishFork(op, running = true) {
    const event = { type: 'fork', sessionId: op.sourceDshSessionId, operation: operationView(op, running) };
    for (const listener of [...forkSubscribers]) {
      try { listener(structuredClone(event)); } catch (e) { ctx.logger.warn('Remote fork status subscriber failed: %s', e.message); }
    }
  }
  async function commitOperation(op, patch = {}, { running = true, recovery = false } = {}) {
    if (stopped && (!recovery || disposed)) throw error('host_stopped', 'Remote Session actions are stopped; no new fork phase can be committed');
    const now = Date.now(), step = patch.step || op.step || 'checking';
    const stepDurations = { ...(op.stepDurations || {}) };
    if (op.step && step !== op.step && op.stepStartedAt) stepDurations[op.step] = (stepDurations[op.step] || 0) + Math.max(0, now - op.stepStartedAt);
    const next = { ...op, ...patch, step, stepDurations, revision: (op.revision || 0) + 1, updatedAt: now,
      ...(step !== op.step || !op.stepStartedAt ? { stepStartedAt: now } : {}) };
    await store.saveFork(next);
    publishFork(next, running);
    return next;
  }
  function forkSnapshot() {
    return Object.values(store.data?.forks || {}).map(op => ({ type: 'fork', sessionId: op.sourceDshSessionId, snapshot: true,
      operation: operationView(op, forks.get(op.sourceDshSessionId)?.operationId === op.operationId) }));
  }
  function subscribeFork(listener) {
    active(); forkSubscribers.add(listener); return () => forkSubscribers.delete(listener);
  }
  function approvedFork(id) {
    const permit = permits.get(id); if (permit) return permit;
    const record = bindings.peek(id), proof = record?.forkProof, op = proof && store.fork(proof.operationId);
    if (!validForkProof(proof) || proof.childDshSessionId !== id || op?.childId !== proof.childId || !op?.remoteSessionId || !op.proof || hash(op.proof) !== hash(proof)
        || op.sourceId !== proof.sourceId || op.sourceDshSessionId !== proof.sourceDshSessionId || op.nativeBoundary !== proof.nativeBoundary || op.nativePrefixHash !== proof.nativePrefixHash) return null;
    try {
      const remote = runtime.forkOperation(proof.operationId);
      if (!remote || !['completed', 'remoteCreated', 'localCommitFailed'].includes(remote.outcome) || remote.childId !== proof.childId || remote.dshSessionId !== id || remote.sourceId !== proof.sourceId || remote.remoteSessionId !== op.remoteSessionId || hash(remote.cut) !== hash(proof.cut)) return null;
    } catch { return null; }
    return structuredClone(proof);
  }
  const offCreated = ctx.on('session/created', session => {
    permitChecks.get(session.id)?.();
    // A user-requested native fork is allowed to create a DSH-only child from
    // the native transcript. It deliberately carries no remote CLI context;
    // the separate remote fork path owns remote execution and its proof.
  });
  async function resolvedRemote(id) {
    active();
    const resolved = await sessionBackend(id, { capture: false });
    if (!resolved.remote || !resolved.backend || resolved.backend.type === 'dsh') throw error('backend_not_acp', 'This Session does not use a remote backend');
    return resolved;
  }
  function environment(resolved) {
    workspaces.assertAvailable(resolved.workspace.id);
    const ws = configuration.snapshot().workspaces.find(w => w.id === resolved.workspace.id);
    if (!ws) throw error('workspace_removed', 'The source workspace was removed; the remote child is retained for recovery');
    const profile = configuration.profile(ws.profileId);
    const nativeWorkspace = ctx.workspaceRegistry.get(ws.shellWorkspaceId);
    if (!nativeWorkspace) throw error('workspace_removed', 'The native workspace is unavailable');
    return { workspace: ws, nativeWorkspace, workspaceSignature: hash([ws.id, ws.profileId, ws.remotePath, ws.mirrorPath, ws.shellWorkspaceId]), profileSignature: hash(profile) };
  }
  function validateEnvironment(resolved, op) {
    active(); const current = environment(resolved);
    if (current.workspaceSignature !== op.workspaceSignature || current.profileSignature !== op.profileSignature) throw error('fork_environment_changed', 'Workspace or connection configuration changed during fork; remote child retained for recovery');
    if (ctx.workspaceRegistry.archivedSessionIds.includes(op.sourceDshSessionId)) throw error('session_archived', 'Unarchive the source Session before recovering its fork');
    return current;
  }
  async function nativeTitle(id) {
    const live = ctx.sessions.get(id);
    if (live) return ctx.sessionTitle?.get(live)?.title ?? null;
    return ctx.get('sessionQuery')?.inspectSession ? ctx.sessionQuery.inspectSession(id, session => ctx.sessionTitle?.get(session)?.title ?? null) : null;
  }
  function titleSyncState(sessionId) {
    const record = store.title(sessionId);
    if (!record) return null;
    return structuredClone(record.status === 'pending' && !titleTails.has(sessionId)
      ? { ...record, status: 'unknown', mayHaveChangedRemote: true, error: { code: 'title_sync_interrupted', message: 'Previous title synchronization was interrupted; its remote outcome is unknown' } } : record);
  }
  function titleSyncSnapshot() {
    return Object.keys(store.data?.titles || {}).map(sessionId => ({ type: 'title_sync', sessionId, ...titleSyncState(sessionId), snapshot: true })).filter(event => event.status !== 'synced');
  }
  function subscribeTitleSync(listener) {
    active(); titleSubscribers.add(listener);
    return () => titleSubscribers.delete(listener);
  }
  async function publishTitleSync(sessionId, record) {
    await store.saveTitle(sessionId, record);
    const event = { type: 'title_sync', sessionId, ...record };
    for (const listener of [...titleSubscribers]) {
      try { listener(structuredClone(event)); }
      catch (e) { ctx.logger.warn('Remote title status subscriber failed: %s', e.message); }
    }
  }
  async function sessionActions({ sessionId }) {
    active();
    const resolved = await sessionBackend(sessionId, { capture: false });
    if (resolved.selectionRequired) return { ok: true, remote: true, sessionId, selectionRequired: true, canFork: false, busy: false, archived: resolved.archived };
    if (!resolved.remote || !resolved.backend || resolved.backend.type === 'dsh') return { ok: true, remote: false, sessionId };
    const state = resolved.binding;
    const native = ctx.sessions.get(sessionId), info = native && recorder.inspect(native);
    const currentBusy = busy(state) || forks.has(sessionId) || titleTails.has(sessionId);
    const closed = state?.status === 'closed' || state?.remoteExecution?.taskStatus === 'closed';
    const activeFork = forks.get(sessionId), activeOperation = activeFork && store.fork(activeFork.operationId);
    return { ok: true, remote: true, sessionId, title: await nativeTitle(sessionId), pinned: ctx.workspaceRegistry.pinnedSessionIds?.includes(sessionId) || false,
      acpId: state?.id || null, closed, canClose: !!state && !closed && !runtime.get(state.id)?.forking && !forks.has(sessionId),
      canFork: !!state && !closed && !resolved.archived && !currentBusy && supportsSessionAction(state.capabilities, 'fork') && (!info || info.hasRemote && !info.open && !info.foreign),
      busy: currentBusy, archived: resolved.archived, titleSync: titleSyncState(sessionId), forkOperation: operationView(store.latest(sessionId), !!activeFork),
      ...(activeOperation ? { activeForkOperation: operationView(activeOperation, true) } : {}),
      ...(loadError ? { metadataError: failureInfo(loadError), canFork: false } : {}) };
  }
  function synchronizeTitle(sessionId, title, revision) {
    const previousRevision = titleRevisions.get(sessionId);
    if (previousRevision !== undefined && previousRevision > revision) return titleTails.get(sessionId) || Promise.resolve(store.title(sessionId));
    if (previousRevision === revision) return titleTails.get(sessionId) || Promise.resolve(store.title(sessionId));
    titleRevisions.set(sessionId, revision);
    const task = (titleTails.get(sessionId) || Promise.resolve()).catch(() => {}).then(async () => {
      active();
      if (titleRevisions.get(sessionId) !== revision) return store.title(sessionId);
      let resolved;
      try { resolved = await sessionBackend(sessionId, { capture: false }); }
      catch (e) {
        const selected = bindings.peek(sessionId);
        if (!selected || selected.backend.type === 'dsh') throw e;
        const failed = { title, revision, status: 'failed', error: failureInfo(e), updatedAt: Date.now() };
        await publishTitleSync(sessionId, failed); return failed;
      }
      if (!resolved.remote || !resolved.backend || resolved.backend.type === 'dsh') return null;
      let status = { title, revision, status: 'pending', updatedAt: Date.now() };
      await publishTitleSync(sessionId, status);
      try {
        if (!resolved.binding) throw error('acp_not_found', 'Native title committed; no remote Session exists to synchronize');
        const result = await runtime.setTitle(resolved.binding.id, title);
        if (result?.ok === false) throw error(result.code || 'title_sync_failed', result.error || 'Remote title synchronization failed');
        if (titleRevisions.get(sessionId) !== revision) return store.title(sessionId);
        const canonical = typeof result?.title === 'string' && result.title ? result.title : title;
        let acceptedRevision = revision;
        const native = ctx.sessions.get(sessionId);
        if (canonical !== title && native && ctx.sessionTitle.get(native)?.eventSeq === revision) {
          suppressed.add(sessionId);
          try { const accepted = ctx.sessionTitle.rename(native, canonical); acceptedRevision = accepted.eventSeq; titleRevisions.set(sessionId, acceptedRevision); }
          finally { suppressed.delete(sessionId); }
          await ctx.sessions.flush(native);
        }
        status = { ...status, title: canonical, revision: acceptedRevision, status: 'synced', updatedAt: Date.now() };
      } catch (e) {
        if (titleRevisions.get(sessionId) !== revision) return store.title(sessionId);
        const remoteStatus = e.titleStatus || runtime.get(resolved.binding?.id)?.state().titleStatus || runtime.store.get(resolved.binding?.id)?.titleStatus;
        const unknown = remoteStatus?.outcome === 'unknown' || ['title_outcome_unknown', 'remote_detached', 'runtime_shutdown'].includes(e.code);
        status = { ...status, status: unknown ? 'unknown' : 'failed', ...(unknown ? { mayHaveChangedRemote: true } : {}), error: failureInfo(e), updatedAt: Date.now() };
      }
      await publishTitleSync(sessionId, status); return status;
    });
    titleTails.set(sessionId, task);
    task.finally(() => { if (titleTails.get(sessionId) === task) titleTails.delete(sessionId); }).catch(() => {});
    return track(task);
  }
  const offTitle = ctx.on('session/event', (session, event) => {
    if (stopped || suppressed.has(session.id) || event.type !== 'session/title' || event.data.source?.kind !== 'user') return;
    // Listener is synchronous: the committed native title is never rolled back.
    synchronizeTitle(session.id, event.data.title, event.seq).catch(e => ctx.logger.warn('Remote title synchronization failed: %s', e.message));
  });
  async function sessionRename({ sessionId, title }) {
    const resolved = await resolvedRemote(sessionId);
    if (typeof title !== 'string') throw error('invalid_title', 'A title string is required');
    if (forks.has(sessionId) || resolved.binding?.forking) throw error('fork_busy', 'Wait for the remote fork before renaming');
    const accepted = await ctx.sessionController.rename({ sessionId, title });
    const native = ctx.sessions.get(sessionId); if (native) await ctx.sessions.flush(native);
    let titleSync;
    try { titleSync = await synchronizeTitle(sessionId, accepted.title, accepted.seq); }
    catch (e) { titleSync = { title: accepted.title, revision: accepted.seq, status: 'failed', error: failureInfo(e) }; }
    return { ok: true, sessionId, title: await nativeTitle(sessionId) ?? accepted.title, seq: accepted.seq, nativeCommitted: true, titleSync };
  }
  async function sessionPin({ sessionId, pinned }) {
    await resolvedRemote(sessionId);
    if (typeof pinned !== 'boolean') throw error('invalid_pin', 'pinned must be a boolean');
    await ctx.workspaceRegistry[pinned ? 'pinSession' : 'unpinSession'](sessionId);
    return { ok: true, sessionId, pinned: ctx.workspaceRegistry.pinnedSessionIds.includes(sessionId) };
  }
  async function observePrefix(id, op) {
    const capturedNative = ctx.sessions.get(id);
    const observation = await ctx.sessionQuery.observeSession(id);
    try {
      const { header, events } = observation;
      const boundary = op ? op.nativeBoundary : events.length - 1;
      if (boundary < 0 || events[boundary]?.seq !== boundary) throw error('fork_history_missing', 'Fork requires a real completed remote history');
      const prefix = events.slice(0, boundary + 1), digest = hash(prefix);
      if (op && digest !== op.nativePrefixHash) throw error('fork_prefix_changed', 'The original native fork prefix is unavailable or changed; no remote fork will be retried');
      return { header: structuredClone(header), boundary, digest, seed: buildForkSeed(events, boundary), count: events.length, capturedNative };
    } finally { observation[Symbol.dispose](); }
  }
  async function releaseStaleFork(source) {
    const reservation = source?.remoteForkReservation;
    if (!reservation || typeof reservation.operationId !== 'string' || typeof reservation.childId !== 'string') return;
    const remote = runtime.forkOperation(reservation.operationId);
    // A known recent fork may still be waiting for its remote response. A
    // reservation older than two minutes without a remoteSessionId is stale and
    // would otherwise block every later fork forever.
    if (remote?.remoteSessionId || remote?.createdAt && Date.now() - remote.createdAt < 120000) return;
    try { await source.releaseFork?.({ operationId: reservation.operationId, childId: reservation.childId }); } catch {}
  }
  async function fork({ sessionId, operationId }) {
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)) throw error('invalid_operation_id', 'A stable operationId (1–128 safe characters) is required');
    await store.load();
    let op = store.fork(operationId);
    if (op && op.sourceDshSessionId !== sessionId) throw error('fork_operation_conflict', 'This operationId belongs to another source Session');
    const recovering = !!op;
    if (!op) {
      op = { operationId, sourceDshSessionId: sessionId, childDshSessionId: randomUUID(), phase: 'accepted', createdAt: Date.now() };
      op = await commitOperation(op, { step: 'checking' });
    }
    let resolved, remoteOp, child, snapshot;
    try {
      resolved = await resolvedRemote(sessionId);
      if (!ctx.get('sessionQuery')?.observeSession || !ctx.get('agents')?.create) throw error('native_fork_unavailable', 'Public SessionQuery and AgentFactory are required for remote fork');
      if (resolved.archived) throw error('session_archived', 'Unarchive the source Session before forking');
      if (op.phase !== 'accepted' && (resolved.binding?.id !== op.sourceId || resolved.binding?.sessionId !== op.sourceSessionId)) throw error('binding_mismatch', 'The source binding no longer matches this fork operation');
      if (op.phase === 'completed') return { ok: true, sessionId: op.childDshSessionId, operation: operationView(op), recovered: true };
      remoteOp = runtime.forkOperation(operationId);
      if (remoteOp && !recovering) throw error('fork_operation_conflict', 'Remote operation exists without this Host native-prefix proof; it will not be retried');
      if (op.phase === 'accepted') {
        environment(resolved);
        if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) throw error('session_archived', 'Unarchive the source Session before forking');
        if (!resolved.binding) throw error('acp_not_found', 'Fork requires an existing remote Session');
        let source = runtime.get(resolved.binding.id);
        if (!source?.alive) {
          source = await runtime.resume(resolved.binding.id, runtimeOptions(resolved, configuration.profile(resolved.workspace.profileId)));
          await attachRecorder(source);
          resolved = await resolvedRemote(sessionId);
        }
        await releaseStaleFork(source);
        if (busy(source.state()) || titleTails.has(sessionId)) throw error('fork_busy', 'Fork requires an idle source with no pending actions');
        if (!supportsSessionAction(source.state().capabilities, 'fork')) throw error('fork_unsupported', 'The remote adapter does not advertise fork');
        await attachRecorder(source); await recorder.flush();
        const nativeAgent = ctx.get('agents')?.get(sessionId);
        if (nativeAgent?.status === 'running' || nativeAgent?.inbox.hasPending) throw error('fork_busy', 'Native source has pending input; refusing to wake a model in the fork container');
        const native = ctx.sessions.get(sessionId), info = native && recorder.inspect(native);
        if (!info?.hasRemote || info.foreign || info.open) throw error('fork_history_missing', 'A complete, recorded remote turn is required before fork');
        snapshot = await observePrefix(sessionId);
        const current = environment(resolved);
        op = await commitOperation(op, { sourceId: source.id, sourceSessionId: source.sessionId,
          nativeBoundary: snapshot.boundary, nativePrefixHash: snapshot.digest,
          cwd: resolved.cwd, agentPreset: snapshot.header.agentPreset, workspaceId: resolved.workspace.id,
          workspaceSignature: current.workspaceSignature, profileSignature: current.profileSignature, phase: 'prepared', step: 'checking', error: null });
      }
      validateEnvironment(resolved, op);
      snapshot ||= await observePrefix(sessionId, op);
      if (!remoteOp) {
        // Only prepared intent is safe to submit. A crash after remotePending may
        // have submitted the RPC even if no runtime ledger can now be read.
        if (op.phase !== 'prepared') throw error('fork_outcome_unknown', 'Fork submission outcome is unknown; do not retry the remote RPC');
        const source = runtime.get(op.sourceId);
        if (!source?.alive || busy(source.state())) throw error('fork_busy', 'The source must remain live and idle before fork submission');
        const native = ctx.sessions.get(sessionId);
        if (!native || native !== snapshot.capturedNative || native.seq !== snapshot.count) throw error('fork_prefix_changed', 'Source changed before fork submission; start a new operation');
        op = await commitOperation(op, { phase: 'remotePending', step: 'creatingRemote' });
        validateEnvironment(resolved, op);
        if (ctx.sessions.get(sessionId) !== snapshot.capturedNative || native.seq !== snapshot.count) throw error('fork_prefix_changed', 'Source changed before fork submission; start a new operation');
        // runtime.fork synchronously guards the source before yielding to RPC.
        // Copy progress is persisted and published at the copy iterator's own
        // throttled checkpoints, so reconnecting clients never need to guess.
        let lastProgress = 0;
        child = await runtime.fork(op.sourceId, { dshSessionId: op.childDshSessionId, operationId,
          remotePath: resolved.binding.remotePath, cwd: op.cwd, workspaceId: op.workspaceId, configuredRemotePath: resolved.binding.configuredRemotePath,
          onProgress: async progress => {
            const now = Date.now();
            if (progress.processed < progress.total && now - lastProgress < 500) return;
            lastProgress = now;
            op = await commitOperation(op, { step: progress.processed >= progress.total ? 'creatingRemote' : 'copyingHistory', progress });
          } });
        remoteOp = runtime.forkOperation(operationId);
      }
      remoteOp ||= runtime.forkOperation(operationId);
      if (!remoteOp?.childId || !remoteOp.remoteSessionId || !['completed', 'remoteCreated', 'localCommitFailed'].includes(remoteOp.outcome)) throw error('fork_outcome_unknown', 'Remote fork has no confirmed child; it will not be repeated');
      if (remoteOp.sourceId !== op.sourceId || remoteOp.dshSessionId !== op.childDshSessionId) throw error('fork_operation_conflict', 'Runtime operation identity does not match Host intent');
      child ||= runtime.get(remoteOp.childId);
      const childState = child?.state() || runtime.store.get(remoteOp.childId);
      if (!childState || childState.dshSessionId !== op.childDshSessionId || childState.sessionId !== remoteOp.remoteSessionId || childState.forkOrigin?.sourceId !== op.sourceId) throw error('fork_child_unavailable', 'Remote child exists but its durable runtime record is unavailable; retain this operation for recovery');
      if (childState.profileId !== resolved.workspace.profileId || childState.agent !== resolved.backend.type || childState.cwd !== op.cwd || childState.workspaceId !== op.workspaceId || childState.configuredRemotePath !== resolved.binding.configuredRemotePath || childState.forkOrigin.sourceSessionId !== op.sourceSessionId || childState.forkOrigin.sourceDshSessionId !== sessionId) throw error('fork_child_mismatch', 'Remote child identity differs from the source binding');
      const parentProof = approvedFork(sessionId);
      const proof = { operationId, sourceId: op.sourceId, sourceSessionId: op.sourceSessionId, sourceDshSessionId: sessionId,
        childId: remoteOp.childId, childDshSessionId: op.childDshSessionId, nativeBoundary: op.nativeBoundary, nativePrefixHash: op.nativePrefixHash,
        cut: childState.forkOrigin.cut, ancestors: parentProof ? [...(parentProof.ancestors || []), { sourceId: parentProof.sourceId, sourceDshSessionId: parentProof.sourceDshSessionId, nativeBoundary: parentProof.nativeBoundary }] : [] };
      op = await commitOperation(op, { childId: remoteOp.childId, remoteSessionId: remoteOp.remoteSessionId, outcome: remoteOp.outcome, phase: 'remoteCreated', step: 'binding', proof, error: null }, { recovery: true });
      validateEnvironment(resolved, op);
      // Re-observation validates the exact old prefix, including across restart.
      snapshot = await observePrefix(sessionId, op);
      // The child runtime confirmed its copied live config. Never reintroduce
      // the source's older workspace defaults (especially a broader permission).
      let childPermission = childState.permission ?? childState.requestedPermission;
      if (childState.agent === 'pi' && childPermission === 'default') childPermission = ['plan', 'acceptEdits', 'bypass'].includes(childState.requestedPermission) ? childState.requestedPermission : 'acceptEdits';
      if (!['plan', 'acceptEdits', 'bypass'].includes(childPermission)) throw error('fork_config_unconfirmed', 'The child runtime has no confirmed permission to persist');
      const childBackend = normalizeBackend({ type: childState.agent,
        permission: childPermission,
        model: childState.config?.model || '', modeId: childState.config?.mode || '',
        remoteRuntimeDir: childState.remoteRuntimeDir || '' });
      await bindings.bindFork({ sessionId: op.childDshSessionId, workspaceId: resolved.workspace.id, profileId: resolved.workspace.profileId,
        cwd: op.cwd, configuredRemotePath: childState.configuredRemotePath, backend: childBackend, forkProof: proof });
      op = await commitOperation(op, { phase: 'bound', step: 'restoringNative' });
      validateEnvironment(resolved, op);
      permits.set(op.childDshSessionId, proof);
      permitChecks.set(op.childDshSessionId, () => validateEnvironment(resolved, op));
      let native = ctx.sessions.get(op.childDshSessionId);
      try {
        if (!native) {
          const persisted = await ctx.get('sessionPersistence')?.stat(op.childDshSessionId);
          validateEnvironment(resolved, op);
          if (persisted) await ctx.sessionController.resolveAgent(op.childDshSessionId);
          else {
            const handle = await ctx.agents.create({ sessionId: op.childDshSessionId,
              meta: { cwd: op.cwd, isSeeded: true, ...(op.agentPreset ? { agentPreset: op.agentPreset } : {}) },
              seed: snapshot.seed, inheritedEventCount: op.nativeBoundary + 1,
              setup: (_agentCtx, agent) => {
                validateEnvironment(resolved, op);
                if (agent.inbox.hasPending) throw error('fork_native_input_pending', 'Fork seed has pending native input; refusing to drive a native model');
              } });
            handles.set(op.childDshSessionId, handle);
            if (stopped) { await handle.dispose(); if (handles.get(op.childDshSessionId) === handle) handles.delete(op.childDshSessionId); throw error('host_stopped', 'Late native fork container was disposed after Host shutdown'); }
          }
          native = ctx.sessions.get(op.childDshSessionId);
        }
        if (!native || native.inheritedEventCount !== op.nativeBoundary + 1) throw error('fork_native_mismatch', 'Native child does not match the durable fork proof');
        op = await commitOperation(op, { phase: 'nativeCreated', step: 'flushing' });
        await ctx.sessions.flush(native);
        await observePrefix(op.childDshSessionId, op);
        if (ctx.sessions.get(op.childDshSessionId) !== native) throw error('fork_native_mismatch', 'Native child changed while validating its fork proof');
        const current = validateEnvironment(resolved, op);
        await current.nativeWorkspace.attachSession(op.childDshSessionId);
        // Cold remote children need no SSH for local recovery; recorder attaches on resume.
        if (child?.alive) await attachRecorder(child);
        await ctx.sessions.flush(native);
        op = await commitOperation(op, { phase: 'completed', step: 'completed', completedAt: Date.now(), error: null }, { running: false });
        return { ok: true, sessionId: op.childDshSessionId, operation: operationView(op), recovered: recovering };
      } finally { permits.delete(op.childDshSessionId); permitChecks.delete(op.childDshSessionId); }
    } catch (e) {
      if (op) {
        const recorded = runtime.forkOperation(operationId);
        op = { ...op, ...(recorded?.childId ? { childId: recorded.childId, remoteSessionId: recorded.remoteSessionId, outcome: recorded.outcome } : {}), error: failureInfo(e) };
        if (!stopped) try { op = await commitOperation(op, {}, { running: false }); } catch (persistError) { e.details = { persistenceError: failureInfo(persistError) }; }
        e.details = { ...e.details, operation: operationView(op), remoteCreated: !!op.remoteSessionId };
      }
      throw e;
    }
  }
  function sessionFork(args) {
    active();
    const existing = forks.get(args.sessionId);
    if (existing) return existing.operationId === args.operationId ? existing.task : Promise.reject(error('fork_busy', 'Another fork operation is in progress'));
    if (forkIds.has(args.operationId)) return Promise.reject(error('fork_operation_conflict', 'This operationId is in progress for another source Session'));
    const task = fork(args); forks.set(args.sessionId, { operationId: args.operationId, task }); forkIds.set(args.operationId, task);
    task.finally(() => { if (forks.get(args.sessionId)?.task === task) forks.delete(args.sessionId); if (forkIds.get(args.operationId) === task) forkIds.delete(args.operationId); }).catch(() => {});
    return track(task);
  }
  async function stop() {
    if (!stopped) { stopped = true; await runtime.detachTransports?.(); }
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, 1000); });
    try {
      await Promise.race([Promise.allSettled([...pending]), timeout]);
      // store.tail is a real filesystem barrier and needs the same total budget.
      // dispose() calls stop() again to drain work that settled during cleanup.
      await Promise.race([store.tail, timeout]);
    } finally { clearTimeout(timer); }
  }
  async function dispose() {
    await stop();
    disposed = true;
    await stop();
    // AgentHandle disposal owns only our created native containers. Durable logs,
    // backend bindings, and operation records survive for explicit recovery.
    const results = await Promise.allSettled([...handles.values()].map(handle => handle.dispose()));
    handles.clear(); titleSubscribers.clear(); forkSubscribers.clear(); offTitle(); offCreated();
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Native fork container cleanup failed; recovery metadata is retained');
  }
  return { api: { sessionActions, sessionRename, sessionPin, sessionFork }, approvedFork, titleSyncSnapshot, subscribeTitleSync, forkSnapshot, subscribeFork, stop, dispose, store };
}
