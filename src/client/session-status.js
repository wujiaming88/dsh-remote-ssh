import { h, ui, NAMESPACE } from './shared.js';

export const messages = {
  zh: {
    'sessionStatus.running': '远端运行中',
    'sessionStatus.permission': '远端等待审批',
    'sessionStatus.elicitation': '远端等待回答',
    'sessionStatus.waiting': '远端等待用户操作',
    'sessionStatus.idle': '远端空闲',
    'sessionStatus.error': '远端会话出错',
    'sessionStatus.disconnected': '远端未连接',
    'sessionStatus.completed': '远端已完成',
    'sessionStatus.stopped': '远端已停止',
    'sessionStatus.unknown': '远端状态未知',
  },
  en: {
    'sessionStatus.running': 'Remote session running',
    'sessionStatus.permission': 'Remote session waiting for approval',
    'sessionStatus.elicitation': 'Remote session waiting for an answer',
    'sessionStatus.waiting': 'Remote session waiting for user input',
    'sessionStatus.idle': 'Remote session idle',
    'sessionStatus.error': 'Remote session error',
    'sessionStatus.disconnected': 'Remote session disconnected',
    'sessionStatus.completed': 'Remote session completed',
    'sessionStatus.stopped': 'Remote session stopped',
    'sessionStatus.unknown': 'Remote session status unknown',
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
    case 'completed': return { state: 'done', label: 'sessionStatus.completed' };
    case 'error': return { state: 'error', label: 'sessionStatus.error' };
    case 'idle': return { state: 'idle', label: 'sessionStatus.idle' };
    case 'stopped': return { state: 'idle', label: 'sessionStatus.stopped' };
    case 'disconnected': return { state: 'idle', label: 'sessionStatus.disconnected' };
    default: return { state: 'idle', label: 'sessionStatus.unknown' };
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
