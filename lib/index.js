import { join, isAbsolute, relative, posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { Config, createConfiguration, normalizeBackend, publicProfile, validateWorkspace } from './config.js';
import { createSshExecutor, error, listSshConfigHosts, validateProfile } from './ssh.js';
import { createAcpRuntime } from './acp.js';
import { BackendBindings } from './bindings.js';
import { resolveSessionBackend, runtimeOptions, normalizeAttachments } from './workspace-backend.js';
import { createFiles, TRANSFER_LIMIT, inside } from './files.js';
import { createWorkspaces, requireBypassConfirmation } from './workspaces.js';
import { RemoteTurnRecorder } from './remote-turn-recorder.js';
import { HTTP_BASE, REMOTE_SESSION_PROJECTION_KEY } from './protocol.js';
import { nativeContentConverter } from './native-content.js';
import { createSessionActions } from './session-actions.js';
import { streamAcpSubscription } from './stream-liveness.js';
import { createMessageAttachments, messageImageHandler } from './message-attachments.js';
import { createSessionActivity, createSessionActivityEventStream } from './session-activity.js';

export { Config };
export const name = '@wujiaming88/dsh-remote-ssh';
export const inject = ['webServer', 'connection', 'remoteAccess', 'sessions', 'sessionProjections', 'workspaceRegistry', 'configEditor', 'profileContext', 'tools', 'sessionController', 'sessionTitle', 'sessionQuery', 'agents', 'attachments'];
const API_PREFIX = HTTP_BASE + '/api/';

export function failure(value) {
  const details = value?.details || {};
  const code = value?.code || 'remote_ssh_error';
  return { ok: false, error: { code, message: String(value?.message || value), ...details,
    ...(code === 'remote_prepare_required' ? { needsPrepare: true, nodeRequirement: '>=22' } : {}) } };
}
function ensureResult(result) {
  if (result?.ok === false) {
    const { ok, error: message, code, ...details } = result;
    throw Object.assign(error(code || 'operation_failed', typeof message === 'string' ? message : message?.message || 'Remote operation failed'), { details });
  }
  return result;
}
function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function body(req, limit) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw error('request_too_large', 'Request body exceeds its limit'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  try { const data = JSON.parse((await body(req, 4 * 1024 * 1024)).toString('utf8') || '{}'); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('object required'); return data; }
  catch (e) { if (e.code) throw e; throw error('invalid_json', 'A JSON object is required'); }
}

/** Owner-only business metadata, independent of ACP/native Agent lifetimes. */
export function createSessionActionEventStream({ sessionActions, activeStreams, isDisposed = () => false }) {
  const streams = new Set();
  return function sessionActionEvents(req, res, permitted) {
    if (isDisposed()) throw error('host_stopped', 'Remote Session actions are stopped');
    if (!permitted()) throw error('remote_access_denied', 'Access was revoked before the metadata stream was admitted');
    if (streams.size >= 8) throw Object.assign(error('too_many_streams', 'Too many Session action metadata streams'), { status: 429 });
    let ended = false, unsubscribe = () => {};
    function close() {
      if (ended) return; ended = true;
      unsubscribe(); streams.delete(close); activeStreams.delete(close);
      res.removeListener('close', close); res.removeListener('error', close); req.removeListener('aborted', close);
      if (!res.writableEnded) res.end();
    }
    function write(event) {
      if (ended) return;
      try {
        if (isDisposed() || !permitted(event.sessionId)) { close(); return; }
        // A slow or disconnected consumer must not retain an unbounded queue.
        if (res.write(JSON.stringify(event) + '\n') === false) close();
      } catch { close(); }
    }
    streams.add(close); activeStreams.add(close);
    res.on('close', close); res.on('error', close); req.on('aborted', close);
    try {
      res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' });
      // Snapshot and subscription share one synchronous stack: no lost updates
      // can fit between them. Only already-persisted plugin metadata is read.
      for (const event of sessionActions.titleSyncSnapshot()) write(event);
      if (!ended) unsubscribe = sessionActions.subscribeTitleSync(write);
      if (ended) unsubscribe(); else res.flushHeaders?.();
      return close;
    } catch (e) { close(); throw e; }
  };
}

/** Business operations share one Host implementation; no global service is patched. */
export async function createHost(ctx, config, { runtimeFactory = createAcpRuntime, sshFactory = createSshExecutor } = {}) {
  if (!isAbsolute(ctx.profileContext.dir)) throw error('profile_directory_unavailable', 'Modern DSH profileContext.dir is required');
  const stateDir = join(await realpath(ctx.profileContext.dir), 'data', 'remote-acp', 'v3');
  const configuration = createConfiguration(ctx, config);
  const ssh = sshFactory();
  let sessionActivity;
  const runtime = runtimeFactory({ storePath: join(stateDir, 'sessions.json'), getProfile: id => configuration.profile(id), logger: ctx.logger,
    onEvent: (event, session) => sessionActivity?.onEvent(event, session), onActivity: () => sessionActivity?.changed() });
  const bindings = new BackendBindings(join(stateDir, 'bindings.json'));
  const recorderErrors = new Map(); const recorderAttachments = new Map();
  let sessionActions;
  const recorder = await RemoteTurnRecorder.create({ sessions: ctx.sessions, sessionProjections: ctx.sessionProjections,
    toNativeContent: nativeContentConverter(ctx.get('attachments')),
    onError: (failure, identity) => { recorderErrors.set(identity.dshSessionId, { code: failure.code, message: failure.message }); ctx.logger.error('Native remote-turn recording failed: %s', failure.message); }
  });
  async function attachRecorder(session) {
    let native = ctx.sessions.get(session.dshSessionId);
    if (!native) {
      const resolved = await ctx.sessionController.resolveAgent(session.dshSessionId);
      if (resolved.error) throw resolved.error;
      native = ctx.sessions.get(session.dshSessionId);
    }
    if (!native) throw error('native_session_unavailable', 'The native DSH Session writer is unavailable');
    const existing = recorderAttachments.get(session.dshSessionId);
    if (existing?.native === native && existing.session === session && !recorderErrors.has(session.dshSessionId)) return;
    if (existing) { try { await existing.detach(); } catch (e) { ctx.logger.warn("Previous recorder attachment failed: %s", e.message); } }
    const detach = recorder.attach(session, native, { forkOrigin: sessionActions?.approvedFork(native.id) });
    recorderAttachments.set(session.dshSessionId, { native, session, detach });
    await recorder.flush();
    recorderErrors.delete(session.dshSessionId);
  }
  function stateOf(session) { return { ...session.state(), nativeRecordingError: recorderErrors.get(session.dshSessionId) || null }; }
  const selections = new Map();
  const canonicalRoots = new Map();
  const preparations = new Map();
  const activeStreams = new Set();
  const lifecycle = new Set();
  let disposed = false;
  const lifetime = new AbortController();

  async function sessionValues(sessionId) {
    const session = ctx.sessions.get(sessionId);
    const read = value => ctx.sessionProjections.snapshot(value).values;
    if (session) return read(session);
    const query = ctx.get('sessionQuery');
    if (!query?.inspectSession) throw error('session_state_unavailable', 'Cold Session classification requires the public SessionQuery service');
    return query.inspectSession(sessionId, read);
  }
  async function selectBackend(sessionId) {
    const values = await sessionValues(sessionId);
    if (values[REMOTE_SESSION_PROJECTION_KEY]?.remote === true) throw error('backend_binding_missing', 'This Session has recorded remote execution but its backend snapshot is missing; native DSH will not be substituted');
    const metadata = values.sessionListMetadata;
    if (typeof metadata?.blank !== 'boolean') throw error('session_state_unavailable', 'Session blank-state projection is unavailable');
    return metadata.blank ? null : normalizeBackend();
  }
  async function sessionBackend(sessionId, { capture = true } = {}) {
    const value = await resolveSessionBackend({ sessionId, sessions: ctx.sessions, persistence: ctx.get('sessionPersistence'), workspaces: configuration.snapshot().workspaces, runtime, bindings, selectBackend, capture });
    if (!value.remote && inside(join(stateDir, 'workspaces'), value.cwd)) throw error('workspace_removed', 'This managed remote workspace was unregistered; it is not a local workspace');
    if (value.workspace) workspaces.assertAvailable(value.workspace.id);
    value.archived = ctx.workspaceRegistry.archivedSessionIds.includes(sessionId);
    value.canonicalRemotePath ||= value.workspace ? canonicalRoots.get(value.workspace.id) || null : null;
    return value;
  }
  function selectSessionBackend(args) {
    const { sessionId, backend: input } = args;
    if (typeof sessionId !== 'string' || !sessionId) throw error('session_required', 'DSH sessionId is required');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['type', 'permission'].includes(key))
        || !['claude', 'codex'].includes(input.type) || !['plan', 'acceptEdits', 'bypass'].includes(input.permission)) throw error('invalid_remote_backend', 'Explicit Claude/Codex and plan/acceptEdits/bypass permissions are required');
    const backend = normalizeBackend(input);
    requireBypassConfirmation(args, backend);
    const task = (selections.get(sessionId) || Promise.resolve()).catch(() => {}).then(async () => {
      if (disposed) throw error('host_stopped', 'Remote Session selection is stopped');
      const resolved = await sessionBackend(sessionId, { capture: false });
      if (!resolved.remote) throw error('not_remote_workspace', 'Only a remote workspace Session can select a remote Agent');
      if (resolved.archived) throw error('session_archived', 'Unarchive the Session before choosing its Agent');
      const existing = await bindings.get(sessionId);
      if (existing && (existing.backend.type !== backend.type || existing.backend.permission !== backend.permission)) throw error('binding_conflict', 'This Session already selected a different Agent or permission; create another Session');
      const values = await sessionValues(sessionId);
      if (values.sessionListMetadata?.blank !== true) throw error('session_not_blank', 'Only a blank Session can choose an Agent');
      if (values[REMOTE_SESSION_PROJECTION_KEY]?.remote === true) throw error('backend_binding_missing', 'Recorded remote history cannot acquire a new binding');
      const requested = { sessionId, workspaceId: resolved.workspace.id, profileId: resolved.workspace.profileId, cwd: resolved.cwd, configuredRemotePath: resolved.remoteCwd, backend };
      workspaces.assertAvailable(requested.workspaceId);
      if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) throw error('session_archived', 'Unarchive the Session before choosing its Agent');
      const selected = existing || await bindings.bind(requested);
      // bind() may return a winner from another writer (for example a fork).
      // Never silently acknowledge a different selection in a racing request.
      if (['workspaceId', 'profileId', 'cwd', 'configuredRemotePath'].some(key => selected[key] !== requested[key])
          || selected.backend.type !== backend.type || selected.backend.permission !== backend.permission) throw error('binding_conflict', 'Another request selected a different Session binding');
      sessionActivity?.changed();
      return { ...await sessionBackend(sessionId), capabilities: capabilities() };
    });
    selections.set(sessionId, task);
    task.finally(() => { if (selections.get(sessionId) === task) selections.delete(sessionId); }).catch(() => {});
    return task;
  }
  const workspaces = createWorkspaces({ configuration, registry: ctx.workspaceRegistry, runtime, ssh, stateDir });
  const files = createFiles({ ssh, configuration, resolveSession: sessionBackend });
  sessionActions = await createSessionActions({ ctx, stateDir, runtime, bindings, configuration, workspaces, sessionBackend, recorder, attachRecorder });
  sessionActivity = createSessionActivity({ runtime, getBindings: () => [...(bindings.records?.values() || [])],
    workspaceIds: () => new Set(configuration.snapshot().workspaces.map(workspace => workspace.id)) });
  function capabilities() {
    return { sessionBinding: 'host-session-header', backendSnapshots: true, deferredBackendSelection: true, runtime: 'remote-adapter-and-agent',
      files: { sessionScoped: true, read: true, write: true, upload: true, download: true, maxTextBytes: 4194304, maxTransferBytes: TRANSFER_LIMIT },
      attachments: { text: true, image: true, workspacePath: true, maxTextBytes: 1048576, maxImageBytes: 2097152, maxCount: 16, adapterCapabilityRequired: true },
      worktrees: { create: true, removeOwned: true, autoPerSession: false },
      nativeFilesystemPatched: false, nativeFileReferencesPatched: false,
      lifecycle: { archive: true, nativeWorkspaceDeletionNotification: false }, sharing: 'owner-only',
      authentication: { loginStatus: 'not-checked', modelAccess: 'not-checked' } };
  }
  function optionsFor(resolved) {
    if (resolved.selectionRequired) throw error('backend_selection_required', 'Choose Claude or Codex and permissions for this Session first');
    if (!resolved.remote || !resolved.backend || resolved.backend.type === 'dsh') throw error('backend_not_acp', 'This Session uses the native DSH backend');
    return runtimeOptions(resolved, configuration.profile(resolved.workspace.profileId));
  }
  function preparation(resolved) {
    const plan = runtime.preparationPlan(optionsFor(resolved));
    return { requiresConfirmation: true, nodeRequirement: plan.nodeRequirement, packages: plan.packages,
      runtimeDir: plan.payload.runtimeDir, installScripts: false, changesUserShell: false, sudo: false, description: plan.description };
  }
  async function preflight(resolved) {
    const options = optionsFor(resolved);
    try {
      const checked = await runtime.probeRemote(options);
      const suffix = relative(resolved.workspace.mirrorPath, resolved.cwd).split(/[\\/]/).filter(Boolean);
      canonicalRoots.set(resolved.workspace.id, posix.resolve(checked.cwd, ...suffix.map(() => '..')));
      return { ok: true, installed: true, startEligible: true, ready: false, authenticated: null, loginStatus: 'not-checked', modelAccess: 'not-checked', runtime: checked };
    } catch (e) { e.details = { ...(e.details || {}), preparation: preparation(resolved), nodeRequirement: '>=22', needsPrepare: e.code === 'remote_prepare_required' }; throw e; }
  }
  async function record(args, { writable = false, live = false } = {}) {
    const running = runtime.get(args.id);
    const value = running ? stateOf(running) : runtime.store.get(args.id);
    if (!value) throw error('acp_not_found', 'ACP Session not found in the current versioned store');
    if (args.dshSessionId && args.dshSessionId !== value.dshSessionId) throw error('binding_mismatch', 'Request belongs to another DSH Session');
    const resolved = await sessionBackend(value.dshSessionId);
    if (!resolved.remote || resolved.backend?.type !== value.agent || resolved.binding?.id !== value.id) throw error('binding_mismatch', 'ACP Session is not the selected Host binding');
    if (writable && resolved.archived) throw error('session_archived', 'Unarchive the Session before changing it');
    if (live && !running?.alive) throw error('acp_not_running', 'Resume the ACP Session first');
    const state = running ? stateOf(running) : runtime.list({ dshSessionId: value.dshSessionId }).find(s => s.id === args.id);
    return { session: running, state, resolved };
  }
  async function changed(args, callback) {
    const { session } = await record(args, { writable: true, live: true });
    const result = ensureResult(await callback(session));
    await recorder.flush();
    return { ok: true, ...result, session: stateOf(session) };
  }
  const messageImages = createMessageAttachments({ record, query: ctx.get('sessionQuery'), recorder,
    approvedFork: id => sessionActions.approvedFork(id), attachments: ctx.get('attachments') });
  const api = {
    ...sessionActions.api,
    messageAttachments: args => messageImages.list(args),
    backendCapabilities: async () => ({ ok: true, capabilities: capabilities() }),
    sessionBackend: async args => ({ ...await sessionBackend(args.sessionId), capabilities: capabilities() }),
    selectSessionBackend,
    listProfiles: async () => ({ ok: true, profiles: configuration.snapshot().profiles.map(publicProfile) }),
    saveProfile: async args => {
      let profile;
      const saved = await configuration.update(snapshot => {
        const identified = Object.hasOwn(args, 'id');
        const previous = identified ? snapshot.profiles.find(p => p.id === args.id) : null;
        if (identified && !previous) throw error('profile_not_found', 'An existing profile id is required for updates; omit id to create a new connection');
        profile = validateProfile({ ...previous, ...args, id: previous?.id || randomUUID(), authMethod: args.authMethod || previous?.authMethod || 'key' });
        if (previous) {
          const target = validateProfile(previous);
          if (['host', 'user', 'port', 'proxyJump'].some(key => profile[key] !== target[key])) throw error('profile_target_immutable', 'Host, user, port and proxy jump are immutable for this connection id; create a new connection instead');
        }
        return { ...snapshot, profiles: [...snapshot.profiles.filter(p => p.id !== profile.id), profile] };
      });
      return { ok: true, id: profile.id, profiles: saved.profiles.map(publicProfile) };
    },
    deleteProfile: workspaces.removeProfile,
    listSshConfigHosts: async () => listSshConfigHosts(),
    testConnection: async args => ensureResult(await ssh.run(configuration.profile(args.id), "printf '%s\\n' 'DSH_SSH_READY'")),
    listWorkspaces: async () => ({ ok: true, workspaces: configuration.snapshot().workspaces.map(validateWorkspace) }),
    createRemoteWorkspace: workspaces.create,
    updateWorkspace: workspaces.update,
    deleteWorkspace: workspaces.remove,
    removeRemoteWorktree: workspaces.removeWorktree,
    listDir: files.listDir,
    sessionFiles: files.sessionFiles,
    directoryPicker: async args => {
      const capability = ctx.get('directoryPicker')?.capability();
      if (!capability) throw error('directory_picker_unavailable', 'No directory picker backend is available');
      if (args.action === 'capability') return { ok: true, kind: capability.kind };
      if (args.action === 'pick') {
        if (capability.kind !== 'native') throw error('directory_picker_browse_required', 'Use the native DSH workspace directory browser');
        return { ok: true, path: await capability.pick(lifetime.signal) };
      }
      throw error('unsupported_operation', 'Only the official directory-picker capability/pick operations are exposed here');
    },
    acpAgents: async args => {
      const profile = configuration.profile(args.profileId); const agents = [];
      for (const agent of ['claude', 'codex']) {
        try { const checked = await runtime.probeRemote({ profile, agent, remotePath: profile.remoteRoot }); agents.push({ id: agent, label: agent === 'claude' ? 'Claude Code' : 'Codex', installed: true, runtime: checked }); }
        catch (e) { agents.push({ id: agent, installed: false, code: e.code, error: e.message, needsPrepare: e.code === 'remote_prepare_required' }); }
      }
      return { ok: true, agents, authenticated: null, loginStatus: 'not-checked' };
    },
    acpPreflight: async args => preflight(await sessionBackend(args.sessionId)),
    acpPrepareRuntime: async args => {
      const resolved = await sessionBackend(args.sessionId);
      if (resolved.archived) throw error('session_archived', 'Unarchive before preparing the remote runtime');
      const plan = preparation(resolved);
      if (args.confirm !== true) return { ok: true, prepared: false, confirmationRequired: true, preparation: plan };
      const key = resolved.workspace.profileId + '|' + plan.runtimeDir;
      if (preparations.has(key)) return preparations.get(key);
      const task = runtime.prepareRemote(optionsFor(resolved), { confirmed: true })
        .then(value => ({ ok: true, prepared: true, preparation: plan, runtime: value, authenticated: null, loginStatus: 'not-checked' }));
      preparations.set(key, task);
      try { return await task; } catch (e) { e.details = { preparation: plan, nodeRequirement: '>=22' }; throw e; } finally { preparations.delete(key); }
    },
    acpStart: async args => {
      const resolved = await sessionBackend(args.dshSessionId);
      if (resolved.archived) throw error('session_archived', 'Unarchive the Session before starting ACP');
      const options = optionsFor(resolved);
      const existing = runtime.findActive(resolved.sessionId);
      if (existing) { await attachRecorder(existing); return { ok: true, session: stateOf(existing) }; }
      await preflight(resolved); workspaces.assertAvailable(resolved.workspace.id);
      const session = await runtime.create(options);
      await attachRecorder(session);
      return { ok: true, session: stateOf(session) };
    },
    acpResume: async args => {
      const found = await record(args, { writable: true });
      if (found.session?.alive) { await attachRecorder(found.session); return { ok: true, session: stateOf(found.session) }; }
      await preflight(found.resolved); workspaces.assertAvailable(found.resolved.workspace.id);
      const session = await runtime.resume(args.id, runtimeOptions(found.resolved, configuration.profile(found.resolved.workspace.profileId)));
      await attachRecorder(session);
      return { ok: true, session: stateOf(session) };
    },
    acpState: async args => ({ ok: true, session: (await record(args)).state }),
    acpEvents: async args => ({ ok: true, session: (await record(args)).state, ...runtime.events(args.id, args.cursor, { limit: args.limit, tail: args.tail === true, beforeSeq: args.beforeSeq }) }),
    acpList: async args => {
      const resolved = await sessionBackend(args.dshSessionId);
      return { ok: true, sessions: resolved.remote && resolved.backend && resolved.backend.type !== 'dsh' ? runtime.list({ dshSessionId: args.dshSessionId }) : [] };
    },
    acpSetConfig: args => changed(args, s => s.setConfig(args.configId, args.value)),
    acpSetMode: args => changed(args, s => s.setMode(args.modeId)),
    acpPermission: args => changed(args, s => s.permission({ requestId: args.requestId, optionId: args.optionId, cancelled: args.cancelled === true })),
    acpElicitation: args => changed(args, s => s.elicitation({ requestId: args.requestId, action: args.action, content: args.content })),
    acpCancel: args => changed(args, s => s.cancel()),
    acpSteer: args => changed(args, async s => {
      if (args.attachments?.length) throw error('steer_attachments_unsupported', 'Keep attachments in the draft until the current turn ends');
      return s.steer(args.text, { requestId: args.requestId });
    })
  };
  async function preparePrompt(args) {
    const { session, resolved } = await record(args, { writable: true, live: true });
    const input = args.attachments || [];
    if (!Array.isArray(input) || input.length > 16) throw error('bad_attachment', 'At most 16 attachments are accepted');
    const snapshots = [];
    for (const item of input) snapshots.push(typeof item?.path === 'string' ? await files.snapshotAttachment({ sessionId: resolved.sessionId, path: item.path }) : item);
    const attachments = normalizeAttachments(snapshots, resolved);
    await attachRecorder(session);
    await recorder.prepare(session, String(args.text || ""), { attachments });
    return { session, resolved, attachments };
  }
  async function prompt(args, prepared) {
    const { session, attachments } = prepared || await preparePrompt(args);
    try { return await session.prompt(String(args.text || ''), { attachments, requestId: args.requestId }); }
    finally { await recorder.flush(); }
  }
  async function stream(args, req, res, isPrompt, permitted) {
    const prepared = isPrompt ? await preparePrompt(args) : await record(args, { live: true });
    const { session } = prepared;
    if (!permitted()) throw error('remote_access_denied', 'Access was revoked before the request was admitted');
    return streamAcpSubscription({ session, req, res, cursor: args.cursor, permitted, activeStreams,
      isDisposed: () => disposed, prompt: isPrompt ? () => prompt(args, prepared) : undefined });
  }
  ctx.on('workspace/session-activity', async ({ sessionId }, next) => {
    const others = await next(); const active = runtime.findActive(sessionId); const state = active?.state();
    return state && (state.status === 'starting' || state.busy || state.pendingTurns > 0 || state.pendingPermissions?.length || state.pendingElicitations?.length)
      ? [{ kind: 'remote-acp', items: [{ id: state.id, label: state.agent }] }, ...others] : others;
  });
  ctx.on('workspace/session-stop', ({ sessionId }) => runtime.findActive(sessionId)?.cancel());
  ctx.on('workspace/session-archived', ({ sessionId }) => {
    const active = runtime.findActive(sessionId); if (!active) return;
    const task = runtime.shutdownSession(active.id, { reason: 'archived' }).catch(e => ctx.logger.warn('ACP archive cleanup failed: %s', e.message));
    lifecycle.add(task); task.finally(() => lifecycle.delete(task));
  });
  async function dispose() {
    if (disposed) return; disposed = true;
    lifetime.abort();
    sessionActivity.dispose();
    for (const close of [...activeStreams]) close();
    ssh.shutdown();
    try { await Promise.allSettled([...selections.values()]); await sessionActions.stop(); await runtime.shutdown(); await recorder.flush(); }
    finally {
      try { await recorder.dispose(); }
      finally { await sessionActions.dispose(); await Promise.allSettled([...lifecycle, ...preparations.values()]); }
    }
  }
  const sessionActionEvents = createSessionActionEventStream({ sessionActions, activeStreams, isDisposed: () => disposed });
  const sessionActivityEvents = createSessionActivityEventStream({ activity: sessionActivity, activeStreams, isDisposed: () => disposed });
  return { api, files, stream, sessionActionEvents, sessionActivityEvents, refreshSessionActivity: () => sessionActivity.changed(), messageImages, prompt, runtime, configuration, sessionBackend, sessionStatus: id => sessionBackend(id, { capture: false }), approvedFork: sessionActions.approvedFork, dispose, stateDir };
}

export async function apply(ctx, config) {
  const host = await createHost(ctx, config);
  function authorize(req, method, args) {
    const admission = ctx.connection.admit(req);
    if ('rejection' in admission) throw Object.assign(error(admission.rejection === 401 ? 'unauthenticated' : 'request_forbidden', 'DSH request admission failed'), { status: admission.rejection });
    // New actions have no guest grants. Use the official policy engine; never infer roles from HTTP headers.
    const action = 'remoteSsh/' + method; const principal = admission.peer.principal;
    const global = ctx.remoteAccess.decide({ principal, action, resources: [{ kind: 'global' }], args });
    if (global.kind !== 'allow') throw Object.assign(error('remote_access_denied', 'This plugin action is not granted to this Peer'), { status: 403 });
    const sid = method === 'messageAttachments' ? args.dshSessionId : args.sessionId || args.dshSessionId || (args.id && method.startsWith('acp') ? host.runtime.get(args.id)?.dshSessionId || host.runtime.store.get(args.id)?.dshSessionId : undefined);
    const permitted = (frameSessionId = sid) => {
      const resources = frameSessionId ? [{ kind: 'session', id: frameSessionId }] : [{ kind: 'global' }];
      return ctx.remoteAccess.decide({ principal, action, resources: [{ kind: 'global' }], args }).kind === 'allow'
        && ctx.remoteAccess.decide({ principal, action, resources, args }).kind === 'allow';
    };
    if (!permitted()) throw Object.assign(error('remote_access_denied', 'Session access is not granted to this Peer'), { status: 403 });
    return permitted;
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: HTTP_BASE + '/api', handler: async (req, res) => {
    try {
      if (req.method !== 'POST') throw Object.assign(error('method_not_allowed', 'POST required'), { status: 405 });
      if (req.headers['x-requested-with'] !== 'XMLHttpRequest') throw Object.assign(error('csrf', 'X-Requested-With: XMLHttpRequest is required'), { status: 403 });
      const pathname = new URL(req.url, 'http://dsh.invalid').pathname;
      if (!pathname.startsWith(API_PREFIX)) throw Object.assign(error('api_not_found', 'Unknown remote SSH API'), { status: 404 });
      const method = pathname.slice(API_PREFIX.length);
      authorize(req, method, {}); // Reject unauthenticated/non-owner callers before reading their body.
      const args = await jsonBody(req);
      if (method === 'sessionActivityEvents' && Object.keys(args).length) throw error('invalid_activity_request', 'Session activity stream requires an empty request');
      const permitted = authorize(req, method, args);
      if (method === 'sessionActivityEvents') { host.sessionActivityEvents(req, res, permitted); return; }
      if (method === 'sessionActionEvents') { host.sessionActionEvents(req, res, permitted); return; }
      if (method === 'acpPrompt' || method === 'acpAttach') { await host.stream(args, req, res, method === 'acpPrompt', permitted); return; }
      if (!Object.hasOwn(host.api, method)) throw Object.assign(error('api_not_found', 'Unknown remote SSH API'), { status: 404 });
      const result = await host.api[method](args);
      host.refreshSessionActivity();
      if (method === 'messageAttachments' && !permitted()) throw Object.assign(error('remote_access_denied', 'Session access was revoked'), { status: 403 });
      json(res, 200, ensureResult(result));
    } catch (e) { if (!res.headersSent) json(res, e.status || 400, failure(e)); else res.end(); }
  } }), 'remote-ssh: modern API');
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: HTTP_BASE + '/message-image',
    handler: messageImageHandler({ authorize, images: host.messageImages }) }), 'remote-ssh: message images');
  for (const upload of [false, true]) ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: HTTP_BASE + '/session-' + (upload ? 'upload' : 'download'), handler: async (req, res) => {
    try {
      if (req.method !== (upload ? 'POST' : 'GET')) throw Object.assign(error('method_not_allowed', 'Unsupported transfer method'), { status: 405 });
      const url = new URL(req.url, 'http://dsh.invalid');
      const args = { sessionId: url.searchParams.get('sessionId'), path: url.searchParams.get('path'), overwrite: url.searchParams.get('overwrite') === 'true', expectedVersion: url.searchParams.get('expectedVersion') || undefined, inline: url.searchParams.get('inline') === '1' };
      authorize(req, upload ? 'sessionUpload' : 'sessionDownload', args);
      if (upload) { json(res, 200, ensureResult(await host.files.upload(args, await body(req, TRANSFER_LIMIT)))); return; }
      const result = await host.files.download(args);
      res.writeHead(200, { 'content-type': result.mime, 'content-length': result.data.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'content-disposition': (result.inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(result.name) }); res.end(result.data);
    } catch (e) { json(res, e.status || (/file_conflict|file_exists/.test(e.code) ? 409 : 400), failure(e)); }
  } }), 'remote-ssh: session transfer');
  ctx.tools.register(defineTool({
    name: 'remote_session_status',
    description: 'Read this executing Session’s Host-resolved backend, workspace and active remote binding. Does not enumerate other Sessions, change configuration, create bindings, or connect to SSH.',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (_args, execution) => host.sessionStatus(execution.agent.session.id)
  }));
  ctx.effect(() => () => host.dispose(), 'remote-ssh: shutdown');
}
