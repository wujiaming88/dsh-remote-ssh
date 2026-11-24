import React from 'react';
import { api, useT, ui, formatError } from './shared.js';

const h = React.createElement;
export const messages = {
  zh: {
    'rssh.flow.title': '添加工作区', 'rssh.flow.local': '选择本机目录…', 'rssh.flow.localHint': '使用 DSH 原生系统目录选择器；不会用远端浏览器代替。',
    'rssh.flow.remote': '远端 SSH 工作区', 'rssh.flow.profile': '连接配置', 'rssh.flow.chooseProfile': '选择连接配置',
    'rssh.flow.noProfiles': '尚无连接配置，请先在「设置 → 远程 SSH」中新建 SSH 密钥或 Kerberos 连接。',
    'rssh.flow.remoteDir': '远端目录', 'rssh.flow.browse': '浏览远端', 'rssh.flow.up': '上一级', 'rssh.flow.empty': '此目录没有子目录。',
    'rssh.flow.truncated': '目录内容已截断；可以直接输入完整远端路径。', 'rssh.flow.backend': 'Agent 后端',
    'rssh.flow.permission': '权限', 'rssh.flow.plan': 'Plan · 只读规划', 'rssh.flow.acceptEdits': 'Accept edits · 默认', 'rssh.flow.bypass': 'Bypass · 跳过审批',
    'rssh.flow.bypassWarning': 'Bypass 将跳过工具审批，允许 Agent 执行高风险操作。仅对可信工作区使用。',
    'rssh.flow.bypassConfirm': '我理解风险，确认启用 Bypass', 'rssh.flow.worktree': '创建独立 owned worktree',
    'rssh.flow.worktreeHint': '以所选远端目录为 Git 仓库创建独立 worktree。取消不会清理文件；以后移除必须单独确认。',
    'rssh.flow.branch': '新分支名称', 'rssh.flow.base': '基准分支 / 提交（可选）', 'rssh.flow.baseHint': '留空使用 HEAD',
    'rssh.flow.create': '创建远端工作区', 'rssh.flow.cancel': '取消', 'rssh.flow.close': '关闭', 'rssh.flow.retry': '重试',
    'rssh.flow.loading': '加载中…', 'rssh.flow.working': '正在处理…', 'rssh.flow.invalid': '请选择连接配置并填写远端目录。',
    'rssh.flow.invalidBranch': '请填写有效的新分支名称；基准引用不能以 - 开头。',
    'rssh.flow.nativeUnavailable': '当前 DSH 未提供原生目录选择器。请检查本机目录选择器的配置；不会替换成本机文件浏览器。',
    'rssh.flow.createdUnregistered': '远端 worktree 已创建，但工作区注册失败。文件已保留，本次不会重试或清理。请先检查下方目录和分支，再决定后续操作；普通注册不能恢复 owned 归属记录。', 'rssh.flow.missingPath': 'Host 未返回可供 DSH 采用的工作区路径。已创建的文件保持不变。',
  },
  en: {
    'rssh.flow.title': 'Add workspace', 'rssh.flow.local': 'Choose local directory…', 'rssh.flow.localHint': 'Uses the DSH native OS directory chooser, never the remote browser.',
    'rssh.flow.remote': 'Remote SSH workspace', 'rssh.flow.profile': 'Connection profile', 'rssh.flow.chooseProfile': 'Choose a connection profile',
    'rssh.flow.noProfiles': 'No connections yet. Create an SSH key or Kerberos profile in Settings → Remote SSH first.',
    'rssh.flow.remoteDir': 'Remote directory', 'rssh.flow.browse': 'Browse remote', 'rssh.flow.up': 'Parent directory', 'rssh.flow.empty': 'No subdirectories in this directory.',
    'rssh.flow.truncated': 'Directory listing truncated. You can enter a full remote path directly.', 'rssh.flow.backend': 'Agent backend',
    'rssh.flow.permission': 'Permission', 'rssh.flow.plan': 'Plan · read-only planning', 'rssh.flow.acceptEdits': 'Accept edits · default', 'rssh.flow.bypass': 'Bypass · skip approvals',
    'rssh.flow.bypassWarning': 'Bypass skips tool approvals and allows high-risk Agent operations. Use only in trusted workspaces.',
    'rssh.flow.bypassConfirm': 'I understand the risk and confirm Bypass', 'rssh.flow.worktree': 'Create an independent owned worktree',
    'rssh.flow.worktreeHint': 'Creates an independent worktree from the selected remote Git repository. Cancelling does not remove files. Removal requires a separate confirmation.',
    'rssh.flow.branch': 'New branch name', 'rssh.flow.base': 'Base branch / commit (optional)', 'rssh.flow.baseHint': 'Leave blank to use HEAD',
    'rssh.flow.create': 'Create remote workspace', 'rssh.flow.cancel': 'Cancel', 'rssh.flow.close': 'Close', 'rssh.flow.retry': 'Retry',
    'rssh.flow.loading': 'Loading…', 'rssh.flow.working': 'Working…', 'rssh.flow.invalid': 'Choose a connection profile and enter a remote directory.',
    'rssh.flow.invalidBranch': 'Enter a valid new branch name. The base reference must not start with a hyphen.',
    'rssh.flow.nativeUnavailable': 'DSH has no native directory chooser in this configuration. Check the local directory-picker setup; no custom local file browser will replace it.',
    'rssh.flow.createdUnregistered': 'The remote worktree was created, but workspace registration failed. Files are retained; this flow will not retry or clean them up. Inspect the directory and branch below before proceeding. Ordinary registration cannot restore the owned record.', 'rssh.flow.missingPath': 'The Host did not return a workspace path for DSH to adopt. Created files remain untouched.',
  },
};
export const css = `
.rssh-flow{display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;min-width:0}
.rssh-flow h3{font-size:14px;margin:0;font-weight:600}.rssh-flow-local{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.rssh-flow-field{display:flex;flex-direction:column;gap:5px}.rssh-flow-line{display:flex;align-items:center;gap:8px}.rssh-flow-line input{flex:1;min-width:0}
.rssh-flow-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rssh-flow-select{box-sizing:border-box;width:100%;min-height:32px;padding:4px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}
.rssh-flow-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.rssh-flow-muted{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.rssh-flow-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.rssh-flow-warning{padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-state-warn-label);white-space:pre-wrap}
.rssh-flow-browser{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:4px;max-height:220px;overflow:auto}.rssh-flow-browser button{justify-content:flex-start;text-align:left;overflow-wrap:anywhere}
.rssh-flow-path{font-family:monospace;overflow-wrap:anywhere}.rssh-flow-worktree{display:flex;flex-direction:column;gap:10px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
@media(max-width:500px){.rssh-flow-grid{grid-template-columns:1fr}.rssh-flow-line{align-items:stretch;flex-direction:column}}
`;

/** Each open owns an epoch; a closed/replaced flow can never adopt a late path. */
export function createFlowLifetime() {
  let epoch = 0; let alive = false; let settled = false;
  return {
    open() { alive = true; settled = false; return ++epoch; },
    close() { alive = false; settled = true; epoch++; },
    current() { return epoch; },
    accepts(token) { return alive && !settled && token === epoch; },
    settle(token) { if (!this.accepts(token)) return false; settled = true; return true; },
  };
}
export function remoteWorkspacePayload(form) {
  if (!form.profileId || !form.remotePath.trim() || /[\0\r\n]/.test(form.remotePath)) return { error: 'invalid' };
  const backend = { type: form.type, permission: form.permission };
  if (!['claude', 'codex'].includes(backend.type) || !['plan', 'acceptEdits', 'bypass'].includes(backend.permission)) return { error: 'invalid' };
  if (backend.permission === 'bypass' && !form.confirmBypass) return { error: 'bypassConfirm' };
  const value = { profileId: form.profileId, remotePath: form.remotePath.trim(), backend,
    ...(backend.permission === 'bypass' ? { confirmBypass: true } : {}) };
  if (form.worktree) {
    const branch = form.branch.trim(); const base = form.base.trim();
    if (!branch || branch.startsWith('-') || branch.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(branch) || base.startsWith('-') || /[\0\r\n]/.test(base)) return { error: 'invalidBranch' };
    value.worktree = { branch, ...(base ? { base } : {}) };
  }
  return { value };
}
function parentPath(path) {
  if (!path?.startsWith('/') || path === '/') return null;
  const clean = path.replace(/\/+$/, ''); const index = clean.lastIndexOf('/');
  return index === 0 ? '/' : clean.slice(0, index);
}
function field(label, control) { return h('label', { className: 'rssh-flow-field' }, h('span', null, label), control); }
function select(value, onChange, options, disabled) {
  return h('select', { value, disabled, className: 'rssh-flow-select', onChange: event => onChange(event.target.value) },
    options.map(([id, text]) => h('option', { key: id, value: id }, text)));
}

// Mount one request conversation per open. Closing unmounts all local state and
// invalidates even non-abortable native chooser / SSH operations. No cleanup
// ever removes user directories, worktrees, or a successfully registered path.
export function RemoteWorkspaceFlow(props) {
  return props.open ? h(OpenRemoteWorkspaceFlow, props) : null;
}
function OpenRemoteWorkspaceFlow(props) {
  const t = useT(); const latest = React.useRef(props); latest.current = props;
  const life = React.useRef(null); if (!life.current) life.current = createFlowLifetime();
  const operation = React.useRef(0); const pending = React.useRef(false);
  const profileRequest = React.useRef(0); const loadController = React.useRef(null);
  const [working, setWorking] = React.useState(false); const [delivered, setDelivered] = React.useState(false);
  const [error, setError] = React.useState(''); const [profiles, setProfiles] = React.useState([]);
  const [loading, setLoading] = React.useState(true); const [profileError, setProfileError] = React.useState('');
  const [listing, setListing] = React.useState(null); const [recovery, setRecovery] = React.useState(null);
  const [form, setForm] = React.useState({ profileId: '', remotePath: '', type: 'claude', permission: 'acceptEdits', confirmBypass: false, worktree: false, branch: '', base: '' });
  const disabled = !!props.busy || working || delivered;
  React.useLayoutEffect(() => {
    life.current.open();
    return () => { life.current.close(); operation.current++; profileRequest.current++; pending.current = false; loadController.current?.abort(); };
  }, []);
  async function loadProfiles() {
    const token = life.current.current(); const request = ++profileRequest.current;
    loadController.current?.abort(); const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setProfileError('');
    try {
      const result = await api('listProfiles', {}, controller.signal);
      if (!life.current.accepts(token) || request !== profileRequest.current) return;
      if (!result?.ok) { setProfileError(formatError(result)); return; }
      setProfiles(result.profiles);
      setForm(current => current.profileId || !result.profiles.length ? current : { ...current, profileId: result.profiles[0].id, remotePath: result.profiles[0].remoteRoot || '~' });
    } catch (reason) { if (life.current.accepts(token) && request === profileRequest.current) setProfileError(formatError(reason)); }
    finally { if (life.current.accepts(token) && request === profileRequest.current) setLoading(false); }
  }
  React.useEffect(() => { void loadProfiles(); }, []);
  const change = (key, value) => { setForm(current => ({ ...current, [key]: value, ...(['permission', 'type'].includes(key) ? { confirmBypass: false } : {}) })); setError(''); };
  function cancel() {
    const token = life.current.current();
    if (!life.current.settle(token)) return;
    operation.current++; loadController.current?.abort(); latest.current.onCancel();
  }
  async function run(method, args, onSuccess, onFailure) {
    if (pending.current || latest.current.busy || delivered) return;
    const token = life.current.current(); if (!life.current.accepts(token)) return;
    const op = ++operation.current; pending.current = true; setWorking(true); setError('');
    try {
      const result = await api(method, args);
      if (!life.current.accepts(token) || op !== operation.current) return;
      if (!result?.ok) { setError(formatError(result)); onFailure?.(result); return; }
      onSuccess(result, token);
    } catch (reason) {
      if (life.current.accepts(token) && op === operation.current) setError(formatError(reason));
    } finally {
      if (life.current.accepts(token) && op === operation.current) { pending.current = false; setWorking(false); }
    }
  }
  function pickLocal() {
    // The Host delegates to the real ctx.directoryPicker capability. No local
    // list/mkdir calls and no private browser package or global bridge imports.
    run('directoryPicker', { action: 'pick' }, (result, token) => {
      if (!life.current.settle(token)) return;
      setDelivered(true);
      if (result.path === null) latest.current.onCancel();
      else if (typeof result.path === 'string' && result.path) latest.current.onPicked(result.path);
      else latest.current.onError(t('rssh.flow.missingPath'));
    }, result => {
      // Keep this choice dialog open: remote selection and native retry remain available.
      if (['directory_picker_unavailable', 'directory_picker_browse_required'].includes(result.code)) setError(t('rssh.flow.nativeUnavailable'));
    });
  }
  function browse(path = form.remotePath) {
    if (!form.profileId || !path.trim()) { setError(t('rssh.flow.invalid')); return; }
    run('listDir', { profileId: form.profileId, path: path.trim() }, result => {
      setListing({ path: result.path, entries: result.entries.filter(entry => entry.type === 'directory'), truncated: result.truncated });
      setForm(current => ({ ...current, remotePath: result.path }));
    });
  }
  function create(event) {
    event?.preventDefault();
    if (recovery) return;
    const payload = remoteWorkspacePayload(form);
    if (payload.error) { setError(t('rssh.flow.' + payload.error)); return; }
    run('createRemoteWorkspace', payload.value, (result, token) => {
      if (typeof result.mirrorPath !== 'string' || !result.mirrorPath) { setError(t('rssh.flow.missingPath')); return; }
      if (!life.current.settle(token)) return;
      setDelivered(true);
      latest.current.onBackendChanged?.(result);
      latest.current.onPicked(result.mirrorPath);
    }, result => { if (result.worktreeCreated && result.recovery) setRecovery(result.recovery); });
  }
  const input = (key, placeholder) => h(ui.Input, { value: form[key], placeholder, disabled, onChange: event => change(key, event.target.value) });
  const bypass = form.permission === 'bypass';
  return h(ui.Modal, { open: true, title: t('rssh.flow.title'), closeLabel: t('rssh.flow.close'), onClose: cancel,
    footer: h(React.Fragment, null,
      h(ui.Button, { disabled: delivered || !!props.busy, onClick: cancel }, t('rssh.flow.cancel')),
      h(ui.Button, { variant: 'primary', loading: working || !!props.busy, disabled: disabled || loading || !form.profileId || !form.remotePath.trim() || bypass && !form.confirmBypass || !!recovery, onClick: create }, t('rssh.flow.create'))) },
    h('style', null, css),
    h('form', { className: 'rssh-flow', onSubmit: create },
      h('div', { className: 'rssh-flow-local' }, h(ui.Button, { disabled, onClick: pickLocal }, t('rssh.flow.local')), h('div', { className: 'rssh-flow-muted' }, t('rssh.flow.localHint'))),
      h('h3', null, t('rssh.flow.remote')),
      loading ? h('div', { role: 'status' }, t('rssh.flow.loading')) : null,
      profileError ? h('div', { role: 'alert', className: 'rssh-flow-error' }, profileError, h(ui.Button, { disabled, onClick: loadProfiles }, t('rssh.flow.retry'))) : null,
      !loading && !profileError && profiles.length === 0 ? h('div', { className: 'rssh-flow-muted' }, t('rssh.flow.noProfiles')) : null,
      field(t('rssh.flow.profile'), select(form.profileId, profileId => {
        setListing(null); setError('');
        setForm(current => ({ ...current, profileId, remotePath: profiles.find(profile => profile.id === profileId)?.remoteRoot || '~', confirmBypass: false }));
      }, [['', t('rssh.flow.chooseProfile')], ...profiles.map(profile => [profile.id, profile.name || `${profile.user}@${profile.host}`])], disabled || loading)),
      field(t('rssh.flow.remoteDir'), h('span', { className: 'rssh-flow-line' }, input('remotePath'), h(ui.Button, { disabled: disabled || !form.profileId, onClick: () => browse() }, t('rssh.flow.browse')))),
      listing ? h('div', { className: 'rssh-flow-browser', 'aria-label': t('rssh.flow.remoteDir'), 'aria-busy': working },
        h('div', { className: 'rssh-flow-path' }, listing.path),
        parentPath(listing.path) ? h(ui.Button, { size: 'sm', variant: 'ghost', disabled, onClick: () => browse(parentPath(listing.path)) }, '↑ ', t('rssh.flow.up')) : null,
        listing.entries.length === 0 ? h('div', { className: 'rssh-flow-muted' }, t('rssh.flow.empty')) : null,
        listing.entries.map(entry => h(ui.Button, { key: entry.path, size: 'sm', variant: 'ghost', disabled, onClick: () => browse(entry.path) }, entry.name, '/')),
        listing.truncated ? h('div', { className: 'rssh-flow-muted' }, t('rssh.flow.truncated')) : null) : null,
      h('div', { className: 'rssh-flow-grid' },
        field(t('rssh.flow.backend'), select(form.type, value => change('type', value), [['claude', 'Claude'], ['codex', 'Codex']], disabled)),
        field(t('rssh.flow.permission'), select(form.permission, value => change('permission', value), ['plan', 'acceptEdits', 'bypass'].map(key => [key, t('rssh.flow.' + key)]), disabled))),
      bypass ? h('div', { className: 'rssh-flow-warning' }, h('p', null, t('rssh.flow.bypassWarning')), h(ui.Checkbox, { checked: form.confirmBypass, disabled, onChange: value => change('confirmBypass', value), label: t('rssh.flow.bypassConfirm') })) : null,
      h('div', { className: 'rssh-flow-worktree' }, h(ui.Checkbox, { checked: form.worktree, disabled: disabled || !!recovery, onChange: value => change('worktree', value), label: t('rssh.flow.worktree') }),
        form.worktree ? h(React.Fragment, null, h('div', { className: 'rssh-flow-muted' }, t('rssh.flow.worktreeHint')),
          field(t('rssh.flow.branch'), input('branch')), field(t('rssh.flow.base'), input('base', t('rssh.flow.baseHint')))) : null),
      recovery ? h('div', { className: 'rssh-flow-warning', role: 'status' }, t('rssh.flow.createdUnregistered'), h('p', { className: 'rssh-flow-path' }, recovery.path), h('p', { className: 'rssh-flow-path' }, recovery.branch)) : null,
      error ? h('div', { className: 'rssh-flow-error', role: 'alert' }, error) : null,
      working || props.busy ? h('div', { role: 'status' }, h(ui.StateDot, { state: 'ongoing' }), ' ', t('rssh.flow.working')) : null));
}
