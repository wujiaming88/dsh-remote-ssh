// ACP Host Runtime 纯单元回归（2.8.0）。
//
// 不依赖真实 SSH、不依赖已安装的 ACP SDK / adapter：
//   A. wrapper 生成与复用（key / Kerberos / password 拒绝、node --check）
//   B. session/update → 稳定事件映射
//   C. session/new 配置归一化（models / modes / reasoning / configOptions）
//   D. session id 持久化（AcpStore + createAcpRuntime）
//   E. 权限挂起 / 应答 / bypass 自动放行
//   F. cancel / steer / setConfig / setMode / close（注入 fake connect）
//   G. Host 接线（端点、NDJSON 路由、依赖与文档）
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  AcpSession,
  AcpStore,
  ACP_AGENTS,
  PermissionBroker,
  createAcpRuntime,
  ensureWrapper,
  mapPermissionRequest,
  mapSessionUpdate,
  mergeConfigOptions,
  normalizeSessionConfig,
  pickAutoPermissionOption,
  renderWrapper
} from '../lib/acp.js'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const src = readFileSync(join(root, 'lib/index.js'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')

let pass = 0
let fail = 0
const check = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  ✗ FAIL: ' + label) } }
const tick = () => new Promise((r) => setTimeout(r, 0))

const tmp = mkdtempSync(join(tmpdir(), 'dsh-acp-test-'))
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch (e) {} })

const KRB_PROFILE = { id: 'p1', host: 'devbox.example', port: 2222, user: 'alice', authMethod: 'kerberos', keyPath: '', proxyJump: 'jump.example' }
const KEY_PROFILE = { id: 'p2', host: 'hpc', port: 22, user: 'bob', authMethod: 'key', keyPath: '/home/bob/.ssh/id_ed25519', proxyJump: '' }

function fakeConnectFactory(overrides) {
  const o = overrides || {}
  let pending = []
  const controller = {
    cancelled: false,
    closed: false,
    steered: [],
    async prompt(text) {
      if (o.promptImpl) return await o.promptImpl(text, controller)
      return await new Promise((resolve) => { pending.push(resolve) })
    },
    async steer(text) {
      controller.steered.push(text)
      return o.steerResult || { outcome: 'injected' }
    },
    async cancel() {
      controller.cancelled = true
      const list = pending
      pending = []
      for (const r of list) r({ stopReason: 'cancelled', response: { stopReason: 'cancelled' } })
      return true
    },
    async setConfig(configId, value) {
      controller.lastConfig = { configId, value }
      return o.configResponse || {
        configOptions: [
          { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: value, options: [{ value: 'm1', name: 'M1' }, { value: 'm2', name: 'M2' }] },
          { id: 'effort', name: 'Reasoning effort', category: 'thought_level', type: 'select', currentValue: 'low', options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] }
        ]
      }
    },
    async setMode(modeId) {
      controller.lastMode = modeId
      return {}
    },
    async close() { controller.closed = true },
    ready: Promise.resolve({
      sessionId: 'acp-sess-1',
      sessionResponse: {
        sessionId: 'acp-sess-1',
        modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }] },
        configOptions: [
          { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'm1', options: [{ value: 'm1', name: 'M1' }, { value: 'm2', name: 'M2' }] },
          { id: 'effort', name: 'Reasoning effort', category: 'thought_level', type: 'select', currentValue: 'low', options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] }
        ]
      },
      initialize: { protocolVersion: 1, _meta: { steering: { supported: true } }, agentCapabilities: {} }
    })
  }
  return controller
}

function sessionOpts(extra) {
  return Object.assign({
    profile: KRB_PROFILE,
    agent: 'claude',
    mirrorCwd: tmp,
    cwd: tmp,
    remotePath: '/tmp/work',
    wrapperDir: join(tmp, 'wrappers'),
    connectImpl: () => fakeConnectFactory(),
    startTimeoutMs: 2000
  }, extra || {})
}

console.log('A · wrapper 生成与复用')
{
  const text = renderWrapper({ agent: 'claude', profile: KRB_PROFILE, remotePath: '/tmp/work', agentPath: '/home/alice/.local/bin/claude' })
  check(text.includes('GSSAPIAuthentication=yes') && text.includes('PreferredAuthentications=gssapi-with-mic'), 'Kerberos wrapper 带 GSSAPI 参数')
  check(text.includes('BatchMode=yes') && text.includes('StrictHostKeyChecking=no'), '批处理模式：不在 stdio 管道上等交互输入')
  check(text.includes("'-J', String(cfg.proxyJump)") && text.includes("'-p', String(cfg.port || 22)"), '支持 ProxyJump 与自定义端口')
  check(text.includes('python3 -c') && text.includes('base64'), '远端用 python3 解码 base64 JSON')
  check(text.includes("'/bin/bash','-ic'") || text.includes('/bin/bash'), '远端经 bash -ic 启动（加载 ~/.bashrc 里的 key/proxy）')
  check(text.includes('exec 1>&') && text.includes('pass_fds'), 'bash 启动输出走 stderr，exec 前恢复 agent stdout（不污染 ACP NDJSON）')
  check(text.includes('DSH_ACP_HOST') && text.includes('DSH_ACP_REMOTE_PATH') && text.includes('DSH_ACP_AGENT_PATH'), 'wrapper 支持 DSH_ACP_* env 覆盖')
  check(text.includes('.remote-ssh.json') && text.includes('function marker()'), 'wrapper 读取 cwd 的 .remote-ssh.json')

  const keyText = renderWrapper({ agent: 'codex', profile: KEY_PROFILE, remotePath: '/data', agentPath: '/opt/codex' })
  check(keyText.includes("'-i', String(cfg.keyPath)"), 'key 认证带 -i')

  let passwordErr = ''
  try { renderWrapper({ agent: 'claude', profile: { host: 'h', user: 'u', authMethod: 'password' }, remotePath: '/tmp' }) } catch (e) { passwordErr = String(e.message || e) }
  check(/不支持密码认证/.test(passwordErr), 'password 明确报错')

  const dir = join(tmp, 'wrappers')
  const first = await ensureWrapper({ agent: 'claude', profile: KRB_PROFILE, remotePath: '/tmp/work', agentPath: '/x/claude', wrapperDir: dir })
  const second = await ensureWrapper({ agent: 'claude', profile: KRB_PROFILE, remotePath: '/tmp/work', agentPath: '/x/claude', wrapperDir: dir })
  check(first.path.endsWith('claude-remote.mjs') && first.created === true, '首次生成 claude-remote.mjs')
  check(second.created === false && second.path === first.path, '内容相同只复用不重写')
  if (process.platform !== 'win32') check((statSync(first.path).mode & 0o777) === 0o755, 'wrapper 可执行（0755）')
  const syntax = spawnSync(process.execPath, ['--check', first.path], { encoding: 'utf8' })
  check(syntax.status === 0, '生成的 wrapper 通过 node --check' + (syntax.status === 0 ? '' : ': ' + (syntax.stderr || '')))
  check(!first.content.includes('"password":'), 'wrapper 不落盘 password 字段')
  check(ACP_AGENTS.claude.envVar === 'CLAUDE_CODE_EXECUTABLE' && ACP_AGENTS.codex.envVar === 'CODEX_PATH', 'adapter 环境变量映射正确')
}

console.log('B · session/update 事件映射')
{
  const text = mapSessionUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' }, messageId: 'm1' })
  check(text.type === 'text' && text.text === 'hello' && text.messageId === 'm1', 'agent_message_chunk → text')

  const thought = mapSessionUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking' } })
  check(thought.type === 'thought' && thought.text === 'thinking', 'agent_thought_chunk → thought')

  const tool = mapSessionUpdate({
    sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Edit file', name: 'Edit', kind: 'edit', status: 'in_progress',
    locations: [{ path: '/tmp/a.js', line: 3 }],
    content: [
      { type: 'content', content: { type: 'text', text: 'doing it' } },
      { type: 'diff', path: '/tmp/a.js', oldText: 'a', newText: 'b' },
      { type: 'terminal', terminalId: 'term1' }
    ],
    rawInput: { file_path: '/tmp/a.js' }
  })
  check(tool.type === 'tool_call' && tool.toolCallId === 't1' && tool.title === 'Edit file' && tool.kind === 'edit', 'tool_call 基础字段')
  check(tool.diffs.length === 1 && tool.diffs[0].path === '/tmp/a.js' && tool.diffs[0].newText === 'b', 'tool_call 的 diff 转结构化')
  check(tool.terminals.length === 1 && tool.terminals[0].terminalId === 'term1', 'tool_call 的 terminal 引用保留')
  check(tool.locations[0].path === '/tmp/a.js' && tool.locations[0].line === 3, 'tool_call 的文件位置保留')
  check(tool.output === 'doing it' && tool.rawInput.file_path === '/tmp/a.js', 'tool_call 文本输出与 rawInput')

  const upd = mapSessionUpdate({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', rawOutput: 'done' })
  check(upd.type === 'tool_call_update' && upd.status === 'completed' && upd.output === 'done' && upd.title === undefined, 'tool_call_update 只带变化字段')

  const plan = mapSessionUpdate({ sessionUpdate: 'plan', entries: [{ content: 'step 1', priority: 'high', status: 'pending' }] })
  check(plan.type === 'plan' && plan.entries[0].content === 'step 1' && plan.entries[0].priority === 'high', 'plan → 结构化 entries')

  const planUpd = mapSessionUpdate({ sessionUpdate: 'plan_update', plan: { type: 'markdown', planId: 'p', content: '# plan' } })
  check(planUpd.type === 'plan' && planUpd.planId === 'p' && planUpd.content === '# plan', 'plan_update(markdown) → plan')

  const cmds = mapSessionUpdate({ sessionUpdate: 'available_commands_update', availableCommands: [{ name: '/review', description: 'Review' }] })
  check(cmds.type === 'commands' && cmds.commands[0].name === '/review', 'available_commands_update → commands')

  const cfg = mapSessionUpdate({ sessionUpdate: 'config_option_update', configOptions: [{ id: 'model', type: 'select', currentValue: 'm2' }] })
  check(cfg.type === 'config' && cfg.configOptions[0].currentValue === 'm2', 'config_option_update → config')

  const mode = mapSessionUpdate({ sessionUpdate: 'current_mode_update', currentModeId: 'plan' })
  check(mode.type === 'mode' && mode.currentModeId === 'plan', 'current_mode_update → mode')

  const usage = mapSessionUpdate({ sessionUpdate: 'usage_update', used: 10, size: 100, cost: { amount: 0.5, currency: 'USD' } })
  check(usage.type === 'usage' && usage.used === 10 && usage.cost.currency === 'USD', 'usage_update → usage')

  const notice = mapSessionUpdate({ sessionUpdate: 'notice', severity: 'warning', title: 'Heads up' })
  check(notice.type === 'notice' && notice.severity === 'warning', 'notice → notice')

  const unknown = mapSessionUpdate({ sessionUpdate: 'brand_new', x: 1 })
  check(unknown.type === 'update' && unknown.sessionUpdate === 'brand_new', '未知 update 收进 update 事件，不丢弃协议')

  const perm = mapPermissionRequest({
    sessionId: 's', toolCall: { toolCallId: 't9', title: 'Run command', kind: 'execute' },
    options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject', kind: 'reject_once' }]
  }, 42)
  check(perm.type === 'permission' && perm.requestId === '42' && perm.tool.title === 'Run command' && perm.options.length === 2, 'permission 事件含 requestId/tool/options')
  check(pickAutoPermissionOption(perm.options).optionId === 'allow', 'bypass 自动选择 allow_*，不会选 reject')
}

console.log('C · session/new 配置归一化')
{
  const cfg = normalizeSessionConfig({
    sessionId: 's1',
    modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }] },
    configOptions: [
      {
        id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'm1',
        options: [{ group: 'g1', name: 'Group', options: [{ value: 'm1', name: 'M1' }, { value: 'm2', name: 'M2' }] }]
      },
      { id: 'effort', name: 'Effort', category: 'thought_level', type: 'select', currentValue: 'high', options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] },
      { id: 'fast', name: 'Fast', type: 'boolean', currentValue: true }
    ]
  })
  check(cfg.sessionId === 's1' && cfg.mode === 'default', 'mode 来自 session/new')
  check(cfg.models.currentValue === 'm1' && cfg.models.options.length === 2 && cfg.models.options[0].group === 'Group', 'models 从 configOptions(model) 提取并展开分组')
  check(cfg.reasoningEffort === 'high' && cfg.reasoning.options.length === 2, 'reasoning effort 从 thought_level 提取')
  check(cfg.configOptions.length === 3, '完整 configOptions 原样保留')
  check(cfg.model === 'm1', '顶层 model 供事件元数据使用')

  const merged = mergeConfigOptions(cfg, [
    { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'm2', options: [{ value: 'm1', name: 'M1' }, { value: 'm2', name: 'M2' }] },
    { id: 'effort', name: 'Effort', category: 'thought_level', type: 'select', currentValue: 'low', options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] }
  ], 's1')
  check(merged.model === 'm2' && merged.reasoningEffort === 'low', 'config_option_update 合并后 model/effort 更新')
  check(merged.modes && merged.modes.currentModeId === 'default' && merged.modes.availableModes.length === 2, '合并保留 modes 可用列表')
}

console.log('D · session id 持久化与 runtime 列表')
{
  const storePath = join(tmp, 'store', 'sessions.json')
  const store = new AcpStore({ storePath })
  store.upsert({ id: 'acp1', profileId: 'p1', agent: 'claude', sessionId: 'remote-sess-1', real: { nested: true } })
  const reloaded = new AcpStore({ storePath })
  const rec = reloaded.get('acp1')
  check(rec && rec.sessionId === 'remote-sess-1' && rec.real.nested === true, 'sessionId 写入 JSON 并可重新读回')
  check(reloaded.remove('acp1') === true && new AcpStore({ storePath }).get('acp1') === null, 'remove 后持久化文件同步删除')

  const runtimeStore = join(tmp, 'store', 'runtime.json')
  let closed = false
  const fake = (args) => ({
    id: args.id, sessionId: 'acp-remote-9', agent: args.agent, profile: args.profile, cwd: args.cwd,
    mirrorCwd: args.mirrorCwd, remotePath: args.remotePath, permission: args.permission,
    createdAt: Date.now(), alive: true,
    async start() {}, async close() { closed = true; this.alive = false },
    state() { return { id: this.id, sessionId: this.sessionId, agent: this.agent, alive: this.alive, status: 'ready' } }
  })
  const rt = createAcpRuntime({ storePath: runtimeStore, createSession: fake })
  const s = await rt.create({ profile: { id: 'p1' }, agent: 'claude', mirrorCwd: tmp, cwd: tmp, remotePath: '/tmp', permission: 'acceptEdits' })
  check(s.id.startsWith('acp') && s.sessionId === 'acp-remote-9', 'runtime.create 返回本地 id + ACP sessionId')
  check(JSON.parse(readFileSync(runtimeStore, 'utf8')).sessions[0].sessionId === 'acp-remote-9', 'runtime 把 ACP sessionId 持久化')
  check(rt.list().some((x) => x.id === s.id && x.alive === true), '活动会话出现在 acpList')
  await rt.close(s.id)
  check(closed === true && rt.get(s.id) === null, 'acpClose 关闭并移除活动会话')
  check(rt.list().length === 0, 'acpClose 后列表为空')

  const rt2 = createAcpRuntime({ storePath: runtimeStore, createSession: fake })
  const s2 = await rt2.create({ profile: { id: 'p1' }, agent: 'codex', mirrorCwd: tmp, cwd: tmp, remotePath: '/tmp' })
  const rt3 = createAcpRuntime({ storePath: runtimeStore, createSession: fake })
  const detached = rt3.list().find((x) => x.id === s2.id)
  check(detached && detached.alive === false && detached.resumable === true && detached.status === 'detached', '重启后列表保留可 resume 的 detached 会话')
}

console.log('E · 权限挂起 / 应答')
{
  const broker = new PermissionBroker()
  const g = broker.enqueue({ sessionId: 's1', toolCall: { toolCallId: 't1', title: 'Edit' }, options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject', kind: 'reject_once' }] }, 7)
  check(g.id === '7' && broker.list().length === 1 && broker.get('7'), '权限请求挂起在 broker')
  check(broker.respond('7', 'nope') === false && broker.list().length === 1, '非法 optionId 不放行')
  const ok = broker.respond('7', 'allow')
  const outcome = await g.promise
  check(ok === true && outcome.outcome.outcome === 'selected' && outcome.outcome.optionId === 'allow', '应答后 resolve 为 selected')
  check(broker.list().length === 0, '应答后从挂起列表移除')

  const g2 = broker.enqueue({ sessionId: 's1', options: [] }, 'perm-x')
  check(broker.cancelAll() === 1, 'cancelAll 清空挂起')
  const out2 = await g2.promise
  check(out2.outcome.outcome === 'cancelled', 'cancelAll 以 cancelled 放行')

  const s = new AcpSession(sessionOpts())
  const pending = s.handlePermissionRequest({ sessionId: 'sess', toolCall: { toolCallId: 't2', title: 'Run' }, options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] }, 9)
  const ev = s.bufferedEvents().find((e) => e.type === 'permission')
  check(ev && ev.requestId === '9' && ev.tool.title === 'Run' && ev.agent === 'claude', 'AcpSession 发出 permission 事件并挂起')
  const r = await s.permission({ requestId: '9', optionId: 'allow' })
  const resolved = await pending
  check(r.outcome === 'selected' && resolved.outcome.optionId === 'allow', 'acpPermission 应答后 handler 返回 selected')
  check(s.bufferedEvents().some((e) => e.type === 'permission_resolved' && e.requestId === '9'), '发出 permission_resolved 事件')

  const bypass = new AcpSession(sessionOpts({ permission: 'bypass' }))
  const auto = await bypass.handlePermissionRequest({ sessionId: 'sess', toolCall: { toolCallId: 't3' }, options: [{ optionId: 'always', name: 'Always', kind: 'allow_always' }] }, 11)
  check(auto.outcome.outcome === 'selected' && auto.outcome.optionId === 'always', 'bypass 模式自动放行（allow_always）')
  check(bypass.bufferedEvents().some((e) => e.type === 'permission' && e.autoResolved === true), 'bypass 仍记录 permission 事件（autoResolved）')
}

console.log('F · cancel / steer / setConfig / setMode / close')
{
  const s = new AcpSession(sessionOpts())
  await s.start()
  check(s.status === 'ready' && s.sessionId === 'acp-sess-1', 'start 后 ready 且有 ACP sessionId')
  check(s.config.model === 'm1' && s.config.mode === 'default' && s.config.reasoningEffort === 'low', '启动即带归一化配置')
  const initEv = s.bufferedEvents().find((e) => e.type === 'session')
  check(initEv && initEv.agent === 'claude' && initEv.model === 'm1' && initEv.mode === 'default', 'session 事件带 agent/model/mode 元数据')

  const p = s.prompt('do work')
  await tick()
  check(s.busy === true && s.status === 'prompting', 'prompt 进行中 busy=true')
  const r = await s.cancel()
  const stopped = await p
  check(r.ok === true && stopped.stopReason === 'cancelled', 'cancel 后 prompt 以 cancelled 结束')
  check(s.controller.cancelled === true, 'cancel 已下发 session/cancel')

  const p2 = s.prompt('long task')
  await tick()
  const steer = await s.steer('also do this')
  check(steer.outcome === 'injected' && s.controller.steered[0] === 'also do this', 'turn 进行中 steer 走 _session/steering（injected）')
  check(s.bufferedEvents().some((e) => e.type === 'user_message' && e.steering === true && e.text === 'also do this'), 'steer 事件标记 steering=true')
  await s.cancel(); await p2

  s.controller.steer = async () => ({ outcome: 'promptRequired' })
  const p3 = s.prompt('queued')
  await tick()
  const queued = await s.steer('fallback')
  check(queued.outcome === 'queued', 'steering 不可用时回退为队列')
  await s.cancel(); await p3

  const cfgRes = await s.setConfig('model', 'm2')
  check(cfgRes.configId === 'model' && cfgRes.config.model === 'm2' && s.controller.lastConfig.value === 'm2', 'acpSetConfig 调 session/set_config_option 并更新配置')
  const modeRes = await s.setMode('plan')
  check(modeRes.modeId === 'plan' && modeRes.config.mode === 'plan' && s.config.modes.currentModeId === 'plan', 'acpSetMode 调 session/set_mode 并更新 mode')

  await s.close()
  check(s.status === 'closed' && s.controller.closed === true, 'close 后状态 closed 且 adapter 关闭')
}

console.log('G · Host 接线与文档')
{
  check(src.includes('import { createAcpRuntime, ACP_AGENTS as ACP_AGENT_DEFS } from "./acp.js"'), 'lib/index.js 相对 import lib/acp.js')
  for (const m of ['acpAgents', 'acpStart', 'acpResume', 'acpState', 'acpList', 'acpSetConfig', 'acpSetMode', 'acpSteer', 'acpPermission', 'acpCancel', 'acpClose', 'acpPrompt']) {
    check(src.includes(m + ': async') || src.includes(m + ': async ()'), '注册 api.' + m)
  }
  check(src.includes('method === "acpPrompt"') && src.includes('handleAcpPromptStream'), 'acpPrompt 走 NDJSON 专用路由')
  check(src.includes('application/x-ndjson') && src.includes("type: \"error\""), 'NDJSON content-type + 错误事件')
  check(src.includes('beginStream()') && src.includes('session.subscribe(write, { replay: true })'), '先回放缓冲事件再订阅更新')
  check(src.includes('res.on("close", onClose)') && src.includes('session.cancel()'), '客户端断开时 abort 并 cancel')
  check(src.includes('agentProbe(p)') && src.includes('mirrorCwd'), 'acpStart 复用 agentProbe 并校验 mirrorCwd')
  check(src.includes('acpRuntime.store.get(id)') && src.includes('acpRuntime.resume(id'), 'acpResume 从持久化记录恢复')
  check(pkg.dependencies['@agentclientprotocol/sdk'] === '^2.9.1', '依赖 @agentclientprotocol/sdk')
  check(pkg.dependencies['@agentclientprotocol/claude-agent-acp'] === '^0.109.1', '依赖 claude-agent-acp')
  check(pkg.dependencies['@agentclientprotocol/codex-acp'] === '^2.9.0', '依赖 codex-acp')
  check(pkg.files.includes('lib/acp.js'), 'files 包含 lib/acp.js')
  check(pkg.version === '2.8.0', '版本 2.8.0')
  check(/ACP/.test(readme) && /acpPrompt/.test(readme), 'README 有 ACP Chat 说明')
  check(/## \[2\.8\.0\]/.test(changelog) && /ACP/.test(changelog), 'CHANGELOG 有 2.8.0 ACP 说明')
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
