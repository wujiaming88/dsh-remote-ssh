export function createFreshSession({ createSession, openSession, beginNavigation, changed }) {
  let alive = true, pending = false, createdId = null;
  return {
    async run(workspaceId) {
      if (!alive || pending) return;
      const navigation = beginNavigation(); pending = true; changed({ busy: true, error: null });
      try {
        const id = createdId || await createSession({ workspaceId });
        if (!alive) return;
        createdId = id;
        if (!navigation.aborted) await openSession(id);
      } catch (error) {
        if (alive && !navigation.aborted) changed({ busy: false, error });
      } finally {
        pending = false;
        if (alive) changed({ busy: false });
      }
    },
    dispose() { alive = false; },
  };
}

export function sessionBackendPayload(sessionId, form) {
  if (!sessionId || !['claude', 'codex'].includes(form.type) || !['plan', 'acceptEdits', 'bypass'].includes(form.permission)) return { error: 'invalid' };
  if (form.permission === 'bypass' && form.confirmBypass !== true) return { error: 'bypassConfirm' };
  return { value: { sessionId, backend: { type: form.type, permission: form.permission },
    ...(form.permission === 'bypass' ? { confirmBypass: true } : {}) } };
}

// Selection is explicitly submitted, never inferred from mounting a conversation.
// A closed/replaced form cannot refresh another session with a late result.
export function createSessionSelection({ request, changed, selected }) {
  let alive = true, pending = false, generation = 0;
  return {
    async submit(value) {
      if (!alive || pending) return;
      const token = ++generation; pending = true; changed({ busy: true, error: null });
      try {
        const result = await request('selectSessionBackend', value);
        if (!alive || token !== generation) return;
        if (!result?.ok) { changed({ busy: false, error: result }); return; }
        selected(result);
      } catch (error) {
        if (alive && token === generation) changed({ busy: false, error });
      } finally {
        if (alive && token === generation) pending = false;
      }
    },
    dispose() { alive = false; generation++; },
  };
}
