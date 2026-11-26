import React from 'react';
import { api, useT, ui, formatError ,NativeIcon} from './shared.js';
import {connectionRowKey} from './settings-model.js';

const h = React.createElement;
export const messages = {
  zh: {
    'rssh.settings.more': '更多操作', 'rssh.settings.testing': '正在测试连接…',
    'rssh.settings.profilesDescription': '管理 SSH 密钥与 Kerberos 连接。',
    'rssh.settings.workspacesDescription': '工作区只管理连接与目录；Agent 和权限在每个新会话中选择。',
    'rssh.settings.targetImmutable': '主机、用户、端口和跳板机确定连接身份；更换目标请新建连接，避免已有会话与文件访问指向不同机器。',
    'rssh.settings.title': '远程 SSH', 'rssh.settings.profiles': '连接配置', 'rssh.settings.workspaces': '远端工作区',
    'rssh.settings.newProfile': '新建连接', 'rssh.settings.import': '从 SSH config 导入', 'rssh.settings.refresh': '刷新',
    'rssh.settings.emptyProfiles': '还没有连接配置。新建 SSH 密钥或 Kerberos 连接后即可添加远端工作区。',
    'rssh.settings.emptyWorkspaces': '还没有远端工作区。通过「添加工作区」选择远端目录。',
    'rssh.settings.name': '名称', 'rssh.settings.host': '主机 / SSH 别名', 'rssh.settings.user': '用户名', 'rssh.settings.port': '端口',
    'rssh.settings.auth': '认证方式', 'rssh.settings.key': 'SSH 密钥', 'rssh.settings.kerberos': 'Kerberos',
    'rssh.settings.keyPath': '私钥路径（可选）', 'rssh.settings.keyHint': '留空时使用 SSH config 或 ssh-agent；不读取或上传私钥内容。',
    'rssh.settings.krbHint': '使用本机现有 Kerberos 票据。请在本机先完成 kinit。',
    'rssh.settings.remoteRoot': '默认远端目录', 'rssh.settings.proxyJump': '跳板机 ProxyJump（可选）',
    'rssh.settings.save': '保存', 'rssh.settings.cancel': '取消', 'rssh.settings.close': '关闭', 'rssh.settings.edit': '编辑',
    'rssh.settings.delete': '删除连接', 'rssh.settings.test': '测试连接', 'rssh.settings.testOk': '连接成功',
    'rssh.settings.deleteProfileTitle': '删除连接配置？',
    'rssh.settings.deleteProfileHint': '请先解除此连接下的工作区注册。删除连接不会删除本机或远端文件。',
    'rssh.settings.deleteProfileBlocked': '此连接仍有已注册工作区，请先在下方解除注册。',
    'rssh.settings.importTitle': '导入 SSH config', 'rssh.settings.importHint': '选择主机以填入新连接表单；检查用户名和认证方式后保存。',
    'rssh.settings.noSshHosts': 'SSH config 中没有可导入的具体主机。', 'rssh.settings.required': '请填写主机、用户名及有效端口（1–65535）。',
    'rssh.settings.unregister': '解除注册', 'rssh.settings.unregisterTitle': '解除工作区注册？',
    'rssh.settings.unregisterHint': '只解除注册，保留远端文件、本机目录、Git 分支和会话历史。已创建的 worktree 也将保留。',
    'rssh.settings.removeWorktree': '移除 owned worktree', 'rssh.settings.removeWorktreeTitle': '移除远端 worktree？',
    'rssh.settings.removeWorktreeHint': '这将删除由本插件创建的远端 worktree 目录并解除注册。Git 分支及会话历史保留。未提交改动或活动实例会阻止移除；不会强制删除。',
    'rssh.settings.removeConfirm': '我确认移除上方显示的远端 worktree 目录', 'rssh.settings.saved': '配置已保存',
    'rssh.settings.loading': '加载中…', 'rssh.settings.loadFailed': '加载失败，请重试。', 'rssh.settings.owned': 'Owned worktree',
    'rssh.settings.hostRuntime': 'Host 运行设置', 'rssh.settings.hostDescription': '控制 DSH Host 本机在远端任务期间的系统电源行为。',
    'rssh.settings.preventSleepTitle': '运行时防止系统休眠',
    'rssh.settings.preventSleepDescription': '有远端 turn 正在运行或等待输入时保持 Host 唤醒；锁屏但保持通电时可继续执行。全部结束后自动释放。关闭后系统可照常休眠。',
    'rssh.settings.preventSleepEnable': '开启',
    'rssh.settings.preventSleepFailed': '无法保存防休眠设置，请重试。',
  },
  en: {
    'rssh.settings.more': 'More actions', 'rssh.settings.testing': 'Testing connection…',
    'rssh.settings.profilesDescription': 'Manage SSH key and Kerberos connections.',
    'rssh.settings.workspacesDescription': 'Workspaces manage connections and directories. Choose the Agent and permissions in each new session.',
    'rssh.settings.targetImmutable': 'Host, user, port and jump host define this connection. Create a new profile to change the target, so existing sessions and files cannot switch machines independently.',
    'rssh.settings.title': 'Remote SSH', 'rssh.settings.profiles': 'Connection profiles', 'rssh.settings.workspaces': 'Remote workspaces',
    'rssh.settings.newProfile': 'New connection', 'rssh.settings.import': 'Import SSH config', 'rssh.settings.refresh': 'Refresh',
    'rssh.settings.emptyProfiles': 'No connections yet. Add an SSH key or Kerberos profile to create remote workspaces.',
    'rssh.settings.emptyWorkspaces': 'No remote workspaces yet. Choose a remote directory through Add workspace.',
    'rssh.settings.name': 'Name', 'rssh.settings.host': 'Host / SSH alias', 'rssh.settings.user': 'Username', 'rssh.settings.port': 'Port',
    'rssh.settings.auth': 'Authentication', 'rssh.settings.key': 'SSH key', 'rssh.settings.kerberos': 'Kerberos',
    'rssh.settings.keyPath': 'Private key path (optional)', 'rssh.settings.keyHint': 'Leave blank to use SSH config or ssh-agent. Private key contents are never read or uploaded.',
    'rssh.settings.krbHint': 'Uses existing local Kerberos tickets. Run kinit locally first.',
    'rssh.settings.remoteRoot': 'Default remote directory', 'rssh.settings.proxyJump': 'ProxyJump (optional)',
    'rssh.settings.save': 'Save', 'rssh.settings.cancel': 'Cancel', 'rssh.settings.close': 'Close', 'rssh.settings.edit': 'Edit',
    'rssh.settings.delete': 'Delete connection', 'rssh.settings.test': 'Test connection', 'rssh.settings.testOk': 'Connection successful',
    'rssh.settings.deleteProfileTitle': 'Delete connection profile?',
    'rssh.settings.deleteProfileHint': 'Unregister workspaces using this connection first. Deleting a profile does not delete local or remote files.',
    'rssh.settings.deleteProfileBlocked': 'This connection has registered workspaces. Unregister them below first.',
    'rssh.settings.importTitle': 'Import SSH config', 'rssh.settings.importHint': 'Choose a host to fill a new connection form, then review the username and authentication before saving.',
    'rssh.settings.noSshHosts': 'No concrete hosts to import from SSH config.', 'rssh.settings.required': 'Enter a host, username and valid port (1–65535).',
    'rssh.settings.unregister': 'Unregister', 'rssh.settings.unregisterTitle': 'Unregister workspace?',
    'rssh.settings.unregisterHint': 'Only removes registration. Remote files, local directories, Git branches and session history remain. Any created worktree is also retained.',
    'rssh.settings.removeWorktree': 'Remove owned worktree', 'rssh.settings.removeWorktreeTitle': 'Remove remote worktree?',
    'rssh.settings.removeWorktreeHint': 'Deletes the remote worktree directory created by this plugin and unregisters it. Git branches and session history remain. Uncommitted changes or active instances block removal; deletion is never forced.',
    'rssh.settings.removeConfirm': 'I confirm removal of the remote worktree directory shown above', 'rssh.settings.saved': 'Configuration saved',
    'rssh.settings.loading': 'Loading…', 'rssh.settings.loadFailed': 'Could not load. Please retry.', 'rssh.settings.owned': 'Owned worktree',
    'rssh.settings.hostRuntime': 'Host runtime', 'rssh.settings.hostDescription': 'Control the local DSH Host power behavior while remote work is active.',
    'rssh.settings.preventSleepTitle': 'Prevent system sleep while running',
    'rssh.settings.preventSleepDescription': 'Keep the Host awake while a remote turn is running or waiting for input. A locked screen on power can keep working, and the assertion is released when everything settles. Turn this off to let the system sleep normally.',
    'rssh.settings.preventSleepEnable': 'On',
    'rssh.settings.preventSleepFailed': 'Could not save the sleep setting. Please retry.',
  },
};

import css from './settings.css';
export {css};

// A separate lifetime for each dialog prevents delayed results from a closed
// editor updating its replacement or triggering routing refreshes after unmount.
function useRequest() {
  const generation = React.useRef(0);
  const live = React.useRef(false);
  const pending = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useLayoutEffect(() => { live.current = true; return () => { live.current = false; pending.current = false; generation.current++; }; }, []);
  async function run(method, args, success) {
    if (pending.current || !live.current) return;
    pending.current = true;
    const token = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await api(method, args);
      if (!live.current || token !== generation.current) return;
      if (!result?.ok) { setError(formatError(result)); return; }
      await success?.(result);
    } catch (reason) {
      if (live.current && token === generation.current) setError(formatError(reason));
    } finally {
      if (live.current && token === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  return { busy, error, setError, run };
}
function SettingsIcon({kind}) { return h(NativeIcon,{name:kind,size:14}); }
function SettingsMore({name,items,onAction,disabled=false}) {
  const t=useT(); const [open,setOpen]=React.useState(false);
  const label=`${t('rssh.settings.more')}: ${name}`;
  return h(ui.Menu,{open,onClose:()=>setOpen(false),align:'end',items,'aria-label':label,
    onSelect:id=>{setOpen(false);onAction(id);},
    anchor:h(ui.Button,{size:'sm',variant:'ghost',className:'rssh-settings-icon-button',disabled,title:label,'aria-label':label,onClick:()=>setOpen(value=>!value)},h(SettingsIcon,{kind:'more'}))});
}
function ConnectionRow({profile,removeBlocked,onEdit,onDelete}) {
  const t=useT(); const request=useRequest(); const [result,setResult]=React.useState('');
  const name=profile.name||profile.host;
  const test=()=>{setResult('');request.run('testConnection',{id:profile.id},value=>setResult(t('rssh.settings.testOk')+(value.warning?'\n'+value.warning:'')));};
  return h('div',{className:'rssh-settings-row'},
    h('div',{className:'rssh-settings-info'},h('div',{className:'rssh-settings-row-title'},name),
      h('div',{className:'rssh-settings-meta'},h('span',{className:'rssh-settings-muted'},`${profile.user}@${profile.host}:${profile.port}`),
        h(ui.Tag,null,t(profile.authMethod==='kerberos'?'rssh.settings.kerberos':'rssh.settings.key'))),
      request.busy?h('div',{className:'rssh-settings-row-result',role:'status'},h(ui.StateDot,{state:'ongoing'}),t('rssh.settings.testing')):null,
      request.error?h('div',{className:'rssh-settings-row-result','data-tone':'error',role:'alert'},request.error):null,
      result&&!request.busy?h('div',{className:'rssh-settings-row-result','data-tone':'success',role:'status'},h(ui.StateDot,{state:'done'}),result):null),
    h('div',{className:'rssh-settings-actions'},h(ui.Button,{size:'sm',variant:'ghost',disabled:request.busy,'aria-label':`${t('rssh.settings.test')}: ${name}`,onClick:test},t('rssh.settings.test')),
      h(SettingsMore,{name,disabled:request.busy,items:[{id:'edit',label:t('rssh.settings.edit')},{type:'separator'},{id:'delete',label:t('rssh.settings.delete'),disabled:removeBlocked}],onAction:id=>id==='edit'?onEdit():onDelete()})));
}
function field(label, control, hint) {
  return h('label', { className: 'rssh-settings-field' }, h('span', null, label), control,
    hint ? h('span', { className: 'rssh-settings-muted' }, hint) : null);
}
function errorView(error) { return error ? h('div', { className: 'rssh-settings-error', role: 'alert' }, error) : null; }
function choices(value, onChange, options, disabled) {
  return h(ui.SelectField, { className: 'rssh-settings-select', value, disabled, onChange: event => onChange(event.target.value) },
    options.map(([id, label]) => h('option', { key: id, value: id }, label)));
}
function blankProfile() { return { name: '', host: '', user: '', port: 22, authMethod: 'key', keyPath: '', remoteRoot: '~', proxyJump: '' }; }
export function profilePayload(form) {
  const port = Number(form.port);
  if (!form.host.trim() || !form.user.trim() || !Number.isInteger(port) || port < 1 || port > 65535 || !['key', 'kerberos'].includes(form.authMethod)) return null;
  return { ...(form.id ? { id: form.id } : {}), name: form.name.trim() || form.host.trim(), host: form.host.trim(),
    user: form.user.trim(), port, authMethod: form.authMethod === 'kerberos' ? 'kerberos' : 'key',
    keyPath: form.authMethod === 'kerberos' ? '' : form.keyPath.trim(), remoteRoot: form.remoteRoot.trim() || '~', proxyJump: form.proxyJump.trim() };
}
function ProfileEditor({ profile, onClose, onSaved }) {
  const t = useT();
  const [form, setForm] = React.useState(() => ({ ...blankProfile(), ...profile }));
  const request = useRequest();
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const input = (key, type = 'text') => h(ui.Input, { value: form[key], type,
    disabled: request.busy || !!profile?.id && ['host', 'user', 'port', 'proxyJump'].includes(key),
    onChange: event => change(key, event.target.value) });
  function save(event) {
    event?.preventDefault();
    const payload = profilePayload(form);
    if (!payload) { request.setError(t('rssh.settings.required')); return; }
    request.run('saveProfile', payload, onSaved);
  }
  return h(ui.Modal, { open: true, className:'rssh-settings-dialog', title: t(profile?.id ? 'rssh.settings.edit' : 'rssh.settings.newProfile'), closeLabel: t('rssh.settings.close'), onClose,
    footer: h(React.Fragment, null, h(ui.Button, { variant:'ghost', onClick: onClose }, t('rssh.settings.cancel')), h(ui.Button, { variant: 'primary', loading: request.busy, onClick: save }, t('rssh.settings.save'))) },
    h('form', { className: 'rssh-settings-form', onSubmit: save },
      profile?.id ? h('p', {className:'rssh-settings-muted'}, t('rssh.settings.targetImmutable')) : null,
      field(t('rssh.settings.name'), input('name')),
      h('div', { className: 'rssh-settings-grid' }, field(t('rssh.settings.host'), input('host')), field(t('rssh.settings.port'), input('port', 'number'))),
      field(t('rssh.settings.user'), input('user')),
      field(t('rssh.settings.auth'), choices(form.authMethod, value => change('authMethod', value), [['key', t('rssh.settings.key')], ['kerberos', t('rssh.settings.kerberos')]], request.busy)),
      form.authMethod === 'key' ? field(t('rssh.settings.keyPath'), input('keyPath'), t('rssh.settings.keyHint')) : h('div', { className: 'rssh-settings-muted' }, t('rssh.settings.krbHint')),
      field(t('rssh.settings.remoteRoot'), input('remoteRoot')), field(t('rssh.settings.proxyJump'), input('proxyJump')), errorView(request.error)));
}
function SshImporter({ onClose, onChoose }) {
  const t = useT(); const request = useRequest(); const [hosts, setHosts] = React.useState(null); const [warnings, setWarnings] = React.useState([]);
  const load = () => request.run('listSshConfigHosts', {}, result => { setHosts(result.hosts); setWarnings(result.warnings); });
  React.useEffect(() => { load(); }, []);
  return h(ui.Modal, { open: true, className:'rssh-settings-dialog', title: t('rssh.settings.importTitle'), description: t('rssh.settings.importHint'), closeLabel: t('rssh.settings.close'), onClose,
    footer: h(ui.Button, { variant:'ghost', onClick: onClose }, t('rssh.settings.cancel')) },
    h('div', { className: 'rssh-settings-form' }, errorView(request.error),
      request.error ? h(ui.Button, { onClick: load, loading: request.busy }, t('rssh.settings.refresh')) : null,
      request.busy ? h('div', { role: 'status' }, t('rssh.settings.loading')) : null,
      warnings.map((warning, index) => h('div', { key: index, className: 'rssh-settings-warning' }, String(warning))),
      hosts?.length === 0 ? h('p', { className: 'rssh-settings-muted' }, t('rssh.settings.noSshHosts')) : null,
      hosts?.map(host => h(ui.Button, { key: host.name, onClick: () => onChoose({ ...blankProfile(), name: host.name, host: host.name, user: host.user || '', port: host.port || 22, keyPath: host.identityFile || '', proxyJump: host.proxyJump || '', authMethod: host.gssapi ? 'kerberos' : 'key' }) }, host.name))));
}
function DeleteDialog({ target, kind, blocked, onClose, onSaved }) {
  const t = useT(); const request = useRequest(); const [confirmed, setConfirmed] = React.useState(false);
  const worktree = kind === 'worktree';
  const title = kind === 'profile' ? 'deleteProfileTitle' : worktree ? 'removeWorktreeTitle' : 'unregisterTitle';
  const hint = kind === 'profile' ? 'deleteProfileHint' : worktree ? 'removeWorktreeHint' : 'unregisterHint';
  const label = kind === 'profile' ? 'delete' : worktree ? 'removeWorktree' : 'unregister';
  function remove() {
    if (blocked || worktree && !confirmed) return;
    request.run(kind === 'profile' ? 'deleteProfile' : worktree ? 'removeRemoteWorktree' : 'deleteWorkspace',
      worktree ? { workspaceId: target.id, confirm: true } : { id: target.id }, onSaved);
  }
  return h(ui.Modal, { open: true, className:'rssh-settings-dialog', title: t('rssh.settings.' + title), description: t('rssh.settings.' + hint), closeLabel: t('rssh.settings.close'), onClose,
    footer: h(React.Fragment, null, h(ui.Button, { variant:'ghost', onClick: onClose }, t('rssh.settings.cancel')), h(ui.Button, { variant:'primary', className:'rssh-settings-destructive', loading: request.busy, disabled: blocked || worktree && !confirmed, onClick: remove }, t('rssh.settings.' + label))) },
    h('div', { className: 'rssh-settings-form' }, h('strong', { className: 'rssh-settings-path' }, target.remotePath || target.name || target.host),
      worktree ? h(ui.Checkbox, { checked: confirmed, onChange: setConfirmed, disabled: request.busy, label: t('rssh.settings.removeConfirm') }) : null,
      blocked ? errorView(t('rssh.settings.deleteProfileBlocked')) : null, errorView(request.error)));
}
export function SettingsSection(props) {
  const t = useT();
  const [profiles, setProfiles] = React.useState([]); const [workspaces, setWorkspaces] = React.useState([]);
  const [preventHostSleep, setPreventHostSleep] = React.useState(true);
  const [sleepSaving, setSleepSaving] = React.useState(false); const [sleepError, setSleepError] = React.useState('');
  const [loaded, setLoaded] = React.useState(false); const [dialog, setDialog] = React.useState(null); const [status, setStatus] = React.useState('');
  // Independent load generation also covers the three-request snapshot and StrictMode replay.
  const loadGeneration = React.useRef(0); const live = React.useRef(false);
  const [loading, setLoading] = React.useState(true); const [loadError, setLoadError] = React.useState('');
  async function load() {
    const token = ++loadGeneration.current; setLoading(true); setLoadError('');
    try {
      const [p, w, pref] = await Promise.all([api('listProfiles', {}), api('listWorkspaces', {}), api('getHostPreferences', {})]);
      if (!live.current || token !== loadGeneration.current) return;
      if (!p?.ok || !w?.ok || !pref?.ok) { setLoadError(formatError(!p?.ok ? p : !w?.ok ? w : pref)); return; }
      setProfiles(p.profiles); setWorkspaces(w.workspaces); setPreventHostSleep(pref.preventHostSleep !== false); setLoaded(true);
    } catch (error) { if (live.current && token === loadGeneration.current) setLoadError(formatError(error)); }
    finally { if (live.current && token === loadGeneration.current) setLoading(false); }
  }
  async function togglePreventSleep(value) {
    if (sleepSaving) return;
    const previous = preventHostSleep;
    setPreventHostSleep(value); setSleepSaving(true); setSleepError('');
    try {
      const result = await api('saveHostPreferences', { preventHostSleep: value });
      if (!result?.ok) throw result;
      if (live.current) setPreventHostSleep(result.preventHostSleep !== false);
    } catch (error) {
      if (live.current) { setPreventHostSleep(previous); setSleepError(formatError(error) || t('rssh.settings.preventSleepFailed')); }
    } finally { if (live.current) setSleepSaving(false); }
  }
  React.useLayoutEffect(() => { live.current = true; return () => { live.current = false; loadGeneration.current++; }; }, []);
  React.useEffect(() => { load(); }, []);
  function saved(result) { setDialog(null); setStatus(t('rssh.settings.saved')); void load(); props.onBackendChanged?.(result); }
  const close = () => setDialog(null);
  return h('section', { className: 'rssh-settings', 'aria-label': t('rssh.settings.title') }, h('style', null, css),
    h('section', {className:'rssh-settings-group','aria-label':t('rssh.settings.profiles')},
      h('div', { className: 'rssh-settings-header' },
        h('div',{className:'rssh-settings-heading'},h('h2', null, t('rssh.settings.profiles')),h('p',{className:'rssh-settings-description'},t('rssh.settings.profilesDescription'))),
        h('div', { className: 'rssh-settings-actions rssh-settings-toolbar' },
          h(ui.Button,{size:'sm',variant:'ghost',className:'rssh-settings-icon-button',disabled:loading,title:t('rssh.settings.refresh'),'aria-label':t('rssh.settings.refresh'),onClick:load},h(SettingsIcon,{kind:'refresh'})),
          h(ui.Button,{size:'sm',variant:'ghost',onClick:()=>setDialog({kind:'import'})},t('rssh.settings.import')),
          h(ui.Button,{size:'sm',variant:'primary',onClick:()=>setDialog({kind:'profile',target:null})},h(SettingsIcon,{kind:'plus'}),t('rssh.settings.newProfile')))),
      errorView(loadError), loading ? h('p', {className:'rssh-settings-muted',role:'status'},t('rssh.settings.loading')):null,
      status?h('p',{className:'rssh-settings-status',role:'status'},h(ui.StateDot,{state:'done'}),status):null,
      loaded&&!profiles.length?h('p',{className:'rssh-settings-muted rssh-settings-empty'},t('rssh.settings.emptyProfiles')):null,
      profiles.length?h('div',{className:'rssh-settings-list'},profiles.map(profile=>h(ConnectionRow,{key:connectionRowKey(profile),profile,removeBlocked:loading||!!loadError,
        onEdit:()=>setDialog({kind:'profile',target:profile}),onDelete:()=>setDialog({kind:'deleteProfile',target:profile})}))):null),
    h('section', {className:'rssh-settings-group','aria-label':t('rssh.settings.hostRuntime')},
      h('div',{className:'rssh-settings-header'},h('div',{className:'rssh-settings-heading'},h('h2',null,t('rssh.settings.hostRuntime')),h('p',{className:'rssh-settings-description'},t('rssh.settings.hostDescription')))),
      h('div',{className:'rssh-settings-row'},
        h('div',{className:'rssh-settings-info'},
          h('div',{className:'rssh-settings-row-title'},t('rssh.settings.preventSleepTitle')),
          h('div',{className:'rssh-settings-muted'},t('rssh.settings.preventSleepDescription')),
          sleepError?h('div',{className:'rssh-settings-row-result','data-tone':'error',role:'alert'},sleepError):null),
        h('div',{className:'rssh-settings-actions'},h(ui.Checkbox,{checked:preventHostSleep,disabled:loading||sleepSaving,
          onChange:togglePreventSleep,label:t('rssh.settings.preventSleepEnable')})))),
    h('section', {className:'rssh-settings-group','aria-label':t('rssh.settings.workspaces')},
      h('div',{className:'rssh-settings-header'},h('div',{className:'rssh-settings-heading'},h('h2',null,t('rssh.settings.workspaces')),h('p',{className:'rssh-settings-description'},t('rssh.settings.workspacesDescription')))),
      loaded&&!workspaces.length?h('p',{className:'rssh-settings-muted rssh-settings-empty'},t('rssh.settings.emptyWorkspaces')):null,
      workspaces.length?h('div',{className:'rssh-settings-list'},workspaces.map(workspace=>h('div',{key:workspace.id,className:'rssh-settings-row'},
        h('div',{className:'rssh-settings-info'},h('div',{className:'rssh-settings-row-title rssh-settings-path'},workspace.remotePath),
          h('div',{className:'rssh-settings-meta'},h('span',{className:'rssh-settings-muted'},profiles.find(profile=>profile.id===workspace.profileId)?.name||workspace.profileId)),
          workspace.worktree?.owned?h('div',{className:'rssh-settings-muted'},`${t('rssh.settings.owned')} · ${workspace.worktree.branch}`):null),
        h('div',{className:'rssh-settings-actions'},
          h(SettingsMore,{name:workspace.remotePath,items:[{id:'unregister',label:t('rssh.settings.unregister')},...(workspace.worktree?.owned?[{id:'worktree',label:t('rssh.settings.removeWorktree')}]:[])],
            onAction:id=>setDialog({kind:id==='worktree'?'worktree':'workspace',target:workspace})}))))):null),
    dialog?.kind === 'profile' ? h(ProfileEditor, { key: dialog.target?.id || 'new', profile: dialog.target, onClose: close, onSaved: saved }) : null,
    dialog?.kind === 'import' ? h(SshImporter, { onClose: close, onChoose: profile => setDialog({ kind: 'profile', target: profile }) }) : null,
    dialog && ['deleteProfile', 'workspace', 'worktree'].includes(dialog.kind) ? h(DeleteDialog, { key: dialog.kind + dialog.target.id, target: dialog.target, kind: dialog.kind === 'deleteProfile' ? 'profile' : dialog.kind,
      blocked: dialog.kind === 'deleteProfile' && workspaces.some(workspace => workspace.profileId === dialog.target.id), onClose: close, onSaved: saved }) : null);
}
