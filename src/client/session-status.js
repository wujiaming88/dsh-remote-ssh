import { h, ui, NAMESPACE } from './shared.js';

export const messages = {
  zh: {
    'sessionStatus.running': '远端运行中',
    'sessionStatus.permission': '远端等待审批',
    'sessionStatus.elicitation': '远端等待回答',
    'sessionStatus.waiting': '远端等待用户操作',
    'sessionStatus.error': '远端会话出错',
    'sessionStatus.completed': '远端已完成，尚未查看',
  },
  en: {
    'sessionStatus.running': 'Remote session running',
    'sessionStatus.permission': 'Remote session waiting for approval',
    'sessionStatus.elicitation': 'Remote session waiting for an answer',
    'sessionStatus.waiting': 'Remote session waiting for user input',
    'sessionStatus.error': 'Remote session error',
    'sessionStatus.completed': 'Remote session completed, not yet viewed',
  },
};

/** Map only a Host-confirmed remote entry for this row; absence proves nothing. */
export function sessionStatusPresentation(entry, sessionId) {
  if (!sessionId || !entry || entry.sessionId !== sessionId) return null;
  switch (entry.status) {
    case 'running': return { state: 'ongoing', label: 'sessionStatus.running' };
    case 'waiting': return { state: 'warning', label: entry.waitingFor === 'permission'
      ? 'sessionStatus.permission' : entry.waitingFor === 'elicitation'
        ? 'sessionStatus.elicitation' : 'sessionStatus.waiting' };
    case 'completed': return entry.completionUnread===true?{ state: 'done', label: 'sessionStatus.completed' }:null;
    case 'error': return { state: 'error', label: 'sessionStatus.error' };
    // Quiet/unknown states have no decoration, not an empty-circle placeholder.
    // A disconnected overview is not proof that the remote turn failed.
    default: return null;
  }
}

/** Root-scoped decoration: reads one shared overview, never binds a Session. */
export function RemoteSessionStatus({ sessionId, useRemoteSessionStatuses, t }) {
  const entry = useRemoteSessionStatuses(snapshot => snapshot.byId[sessionId]);
  const presentation = sessionStatusPresentation(entry, sessionId);
  if (!presentation) return null;
  const label = t(presentation.label);
  return h('span', { role: 'img', title: label, 'aria-label': label },
    h(ui.StateDot, { state: presentation.state, className: 'rssh-session-status-dot' }));
}

/** The owner mounts this list only for nonblank, unarchived, native-idle rows.
 * Do not override native reminders or register a second trailing indicator.
 * slots.inject owns declaration teardown and re-registration; no row creates
 * transport subscriptions beyond the renderer's shared-observable hook.
 */
export function installSessionStatus(ctx, store) {
  return ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({
    name: 'sidebar.session.row.leading',
    id: 'remote-ssh.status',
    order: 0,
    locale: NAMESPACE,
    inject: () => ({ hooks: { remoteSessionStatuses: store } }),
  }, RemoteSessionStatus));
}
