import React from 'react';
import { h, ui, useT, formatError } from './shared.js';
import { createFreshSession } from './session-setup-model.js';

// Explicit creation avoids reusing a blank that already selected an Agent.
export function NewRemoteSession({ workspaceId, createSession, openSession, beginNavigation }) {
  const t = useT(), controller = React.useRef(null);
  const [status, setStatus] = React.useState({ busy: false, error: null });
  React.useLayoutEffect(() => {
    const action = createFreshSession({ createSession, openSession, beginNavigation,
      changed: patch => setStatus(current => ({ ...current, ...patch })) });
    controller.current = action;
    return () => action.dispose();
  }, []);
  return h('span', { className: 'rssh-new-session' },
    h(ui.Button, { size: 'sm', variant: 'ghost', loading: status.busy, onClick: () => controller.current?.run(workspaceId), title: t('session.setup.newHint') }, t('session.setup.new')),
    status.error ? h('span', { role: 'alert', className: 'rssh-new-session-error' }, formatError(status.error)) : null);
}
