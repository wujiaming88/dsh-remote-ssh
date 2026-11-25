import React from 'react';
import { api, useT, ui, formatError } from './shared.js';
import { css as formCss } from './workspaces.js';
import { sessionBackendPayload, createSessionSelection } from './session-setup-model.js';

const h = React.createElement;
export const messages = {
  zh: {
    'session.setup.loading': '正在读取远端会话',
    'session.setup.loadingHint': '正在确认工作区与会话配置；此步骤不会启动 Agent。',
    'session.setup.loadFailed': '无法读取远端会话配置',
    'session.setup.title': '新建远端会话',
    'session.setup.description': '为此会话选择 Agent 和权限，不会改变工作区或其他会话。',
    'session.setup.choose': '请选择 Agent',
    'session.setup.invalid': '请选择 Agent 和有效的权限模式。',
    'session.setup.start': '开始会话',
    'session.setup.fixed': '选择后，Agent 将绑定到此会话；使用其他 Agent 可点击顶部「新建会话」。',
    'session.setup.new': '新建会话',
    'session.setup.newHint': '在同一工作区新建独立会话，重新选择 Agent；当前会话保留。',
    'session.setup.archived': '此会话已归档，请先取消归档再选择 Agent。',
  },
  en: {
    'session.setup.loading': 'Loading remote session',
    'session.setup.loadingHint': 'Checking workspace and session configuration. This step does not start an Agent.',
    'session.setup.loadFailed': 'Could not load remote session configuration',
    'session.setup.title': 'New remote session',
    'session.setup.description': 'Choose the Agent and permissions for this session without changing the workspace or other sessions.',
    'session.setup.choose': 'Choose an Agent',
    'session.setup.invalid': 'Choose an Agent and a valid permission mode.',
    'session.setup.start': 'Start session',
    'session.setup.fixed': 'The Agent is fixed after selection. Use New session in the header to choose another Agent.',
    'session.setup.new': 'New session',
    'session.setup.newHint': 'Create a separate session in this workspace and choose its Agent. The current session is preserved.',
    'session.setup.archived': 'This session is archived. Unarchive it before choosing an Agent.',
  },
};
const css = `
.rssh-session-setup{flex:1;min-height:0;overflow:auto;padding:24px 16px;display:flex;align-items:safe center;justify-content:center}
.rssh-session-setup-form{width:100%;max-width:480px;box-sizing:border-box}
.rssh-session-setup-form h2{font-size:20px;line-height:28px;font-weight:600;margin:0}
.rssh-session-setup-path{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.rssh-session-setup-actions{display:flex;justify-content:flex-end;padding-top:4px}
`;

export function SessionSetup({ backend, onSelected }) {
  const t = useT();
  const [form, setForm] = React.useState({ type: '', permission: 'acceptEdits', confirmBypass: false });
  const [status, setStatus] = React.useState({ busy: false, error: null });
  const [error, setError] = React.useState('');
  const controller = React.useRef(null), latest = React.useRef(onSelected); latest.current = onSelected;
  React.useLayoutEffect(() => {
    const selection = createSessionSelection({ request: api, changed: setStatus, selected: result => latest.current(result) });
    controller.current = selection;
    return () => selection.dispose();
  }, [backend.sessionId]);
  const disabled = status.busy || backend.archived === true;
  const change = (key, value) => {
    setForm(current => ({ ...current, [key]: value, ...(key !== 'confirmBypass' ? { confirmBypass: false } : {}) }));
    setError(''); setStatus(current => ({ ...current, error: null }));
  };
  function submit(event) {
    event.preventDefault();
    if (disabled) return;
    const payload = sessionBackendPayload(backend.sessionId, form);
    if (payload.error) { setError(t(payload.error === 'bypassConfirm' ? 'rssh.flow.bypassConfirm' : 'session.setup.invalid')); return; }
    setError(''); void controller.current?.submit(payload.value);
  }
  const select = (key, options) => h(ui.SelectField, { className: 'rssh-flow-select', value: form[key], disabled, onChange: event => change(key, event.target.value) },
    options.map(([value, label]) => h('option', { key: value, value }, label)));
  const field = (label, control) => h('label', { className: 'rssh-flow-field' }, h('span', null, label), control);
  return h('section', { className: 'rssh-session-setup', 'aria-label': t('session.setup.title') },
    h('style', null, formCss + css),
    h('form', { className: 'rssh-flow rssh-session-setup-form', onSubmit: submit, 'aria-busy': status.busy },
      h('h2', null, t('session.setup.title')),
      h('div', { className: 'rssh-session-setup-path' }, backend.workspace.remotePath),
      h('p', { className: 'rssh-flow-muted' }, t('session.setup.description')),
      field(t('rssh.flow.backend'), select('type', [['', t('session.setup.choose')], ['claude', 'Claude Code'], ['codex', 'Codex']])),
      field(t('rssh.flow.permission'), select('permission', ['plan', 'acceptEdits', 'bypass'].map(value => [value, t('rssh.flow.' + value)]))),
      form.permission === 'bypass' ? h('div', { className: 'rssh-flow-warning' }, h('p', null, t('rssh.flow.bypassWarning')),
        h(ui.Checkbox, { checked: form.confirmBypass, disabled, onChange: value => change('confirmBypass', value), label: t('rssh.flow.bypassConfirm') })) : null,
      h('div', { className: 'rssh-flow-muted' }, t('session.setup.fixed')),
      backend.archived ? h('div', { role: 'status', className: 'rssh-flow-warning' }, t('session.setup.archived')) : null,
      error || status.error ? h('div', { role: 'alert', className: 'rssh-flow-error' }, error || formatError(status.error)) : null,
      h('div', { className: 'rssh-session-setup-actions' }, h(ui.Button, { type: 'submit', variant: 'primary', loading: status.busy,
        disabled: disabled || !form.type || form.permission === 'bypass' && !form.confirmBypass }, t('session.setup.start')))));
}
