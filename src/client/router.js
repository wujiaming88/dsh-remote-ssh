import { formatError } from './api.js';

export function knownRemoteBlank(session, workspaces) {
  if (session?.blank !== true || typeof session.cwd !== 'string' || !Array.isArray(workspaces)) return false;
  const path = session.cwd.replaceAll('\\', '/').replace(/\/$/, '');
  return workspaces.some(workspace => {
    if (!['claude', 'codex'].includes(workspace?.backend?.type) || typeof workspace?.mirrorPath !== 'string') return false;
    const root = workspace.mirrorPath.replaceAll('\\', '/').replace(/\/$/, '');
    return root.length > 1 && (path === root || path.startsWith(root + '/'));
  });
}

// Metadata evidence may show a remote loading/error placeholder, never start an
// Agent. Only the final Host binding authorizes the active conversation.
export function createBackendRouter({ load, show }) {
  let state = { phase: 'native', sessionId: '', value: null, error: '' };
  let currentId = '', generation = 0, disposed = false;
  let lastEvidence = {};
  const listeners = new Set();
  const publish = next => {
    state = next;
    show(next.phase === 'remote' || next.ownsRemote === true);
    for (const listener of listeners) listener();
  };
  function select(id, force = false, evidence) {
    const sessionId = String(id || '');
    if (disposed || (!force && sessionId === currentId)) return;
    if (sessionId !== currentId) lastEvidence = {};
    if (evidence !== undefined) lastEvidence = evidence;
    const facts = { ...lastEvidence };
    const ownsPlaceholder = facts.recorded === true || facts.blankWorkspace === true;
    const retained = state.sessionId === sessionId && (state.phase === 'remote' || state.ownsRemote) ? state.value : null;
    currentId = sessionId;
    const request = ++generation;
    if (!sessionId) { publish({ phase: 'native', sessionId, value: null, error: '' }); return; }
    if (!retained) publish({ phase: 'loading', sessionId, value: null, ownsRemote: ownsPlaceholder, error: '' });
    Promise.resolve().then(() => load(sessionId)).then(result => {
      if (disposed || generation !== request) return;
      if (!result?.ok || result.sessionId !== sessionId) throw new Error(formatError(result));
      const remote = result.remote === true && result.workspace && ['claude', 'codex'].includes(result.backend?.type);
      if (facts.recorded === true && !remote) throw new Error('The recorded remote conversation is currently unavailable');
      publish({ phase: remote ? 'remote' : 'native', sessionId, value: result, error: '' });
    }).catch(error => {
      if (!disposed && generation === request) publish({ phase: 'error', sessionId, value: retained, ownsRemote: !!retained || ownsPlaceholder, error: error.message });
    });
  }
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    select,
    refresh: () => select(currentId, true),
    dispose: () => { disposed = true; generation++; listeners.clear(); show(false); },
  };
}
