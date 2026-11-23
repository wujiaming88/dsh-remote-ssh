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
  mapToolCall,
  mergeConfigOptions,
  normalizeSessionConfig,
  pickAutoPermissionOption,
  renderWrapper
} from '../lib/acp.js'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const src = readFileSync(join(root, 'lib/index.js'), 'utf8')
const acpSrc = readFileSync(join(root, 'lib/acp.js'), 'utf8')
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

console.log('H · 原生事件与子 Agent')
{
  const parent = mapSessionUpdate({
    sessionUpdate: 'tool_call', toolCallId: 'toolu_agent', title: 'Agent', name: 'Task', status: 'in_progress',
    rawInput: { description: 'Explore the repo', prompt: 'look around <output-file>/tmp/agent-out.txt</output-file>', run_in_background: true, subagent_type: 'Explore' },
    _meta: { claudeCode: { toolName: 'Agent' } }
  })
  check(parent.type === 'tool_call' && parent.sessionUpdate === 'tool_call' && parent.native === 'tool_call', 'tool_call 保留 sessionUpdate/native 原始类型')
  check(parent.parentToolCallId === null, '父 Agent 调用没有 parentToolCallId')
  check(parent.subagent && parent.subagent.agentId === 'Explore' && parent.subagent.background === true, 'Agent 工具输出 subagent（agentId/background）')
  check(parent.subagent.description === 'Explore the repo', 'subagent.description 取自 rawInput.description')
  check(parent.subagent.outputFile === '/tmp/agent-out.txt', 'subagent.outputFile 可从文本标签解析')
  check(parent.nativeMeta && parent.nativeMeta.claudeCode.toolName === 'Agent', 'tool_call 保留截断后的 nativeMeta')

  const child = mapSessionUpdate({
    sessionUpdate: 'tool_call_update', toolCallId: 'toolu_child', status: 'completed',
    _meta: { claudeCode: { parentToolUseId: 'toolu_agent', toolName: 'Read' } }
  })
  check(child.parentToolCallId === 'toolu_agent' && child.nativeMeta.claudeCode.parentToolUseId === 'toolu_agent', 'Claude 子调用 parentToolCallId 指向父 Agent')
  check(child.native === 'tool_call_update' && child.sessionUpdate === 'tool_call_update', 'tool_call_update 保留原始类型')

  const titleAgent = mapToolCall({ toolCallId: 't-title', title: 'Agent', rawInput: { run_in_background: false } })
  check(titleAgent.subagent && titleAgent.subagent.background === false, '没有 claude meta 时按标题 Agent 识别')

  const notification = '<task-notification>\n<task-id>task-1</task-id>\n<tool-use-id>toolu_agent</tool-use-id>\n<status>completed</status>\n<summary>All done</summary>\n<output-file>/tmp/out.txt</output-file>\n<result>model context only</result>\n</task-notification>'
  const task = mapSessionUpdate({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: notification }, _meta: { claudeCode: { parentToolUseId: 'toolu_agent' } } })
  check(task.type === 'subagent_update' && task.taskId === 'task-1' && task.toolUseId === 'toolu_agent', 'task-notification 解析 taskId/toolUseId')
  check(task.parentToolCallId === 'toolu_agent' && task.status === 'completed', 'task-notification 关联父 toolCallId 并带 status')
  check(task.summary === 'All done' && task.outputFile === '/tmp/out.txt', 'task-notification 解析 summary/outputFile')
  check(task.native === 'user_message_chunk' && task.nativeMeta.claudeCode.parentToolUseId === 'toolu_agent', 'task-notification 保留 native/nativeMeta')

  const partial = mapSessionUpdate({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: '<task-notification><task-id>x</task-id>' } })
  check(partial.type === 'user_message', '不完整 task-notification 不误判（仍按 user_message）')

  const sub = mapSessionUpdate({
    sessionUpdate: 'subagent_update', sessionId: 'child-1', title: 'Explore', description: 'child agent',
    state: { state: 'running' }, capabilities: { tools: true }, cwd: '/tmp/child',
    _meta: { claudeCode: { parentToolUseId: 'toolu_parent' } }
  })
  check(sub.type === 'subagent_update' && sub.sessionId === 'child-1' && sub.title === 'Explore' && sub.description === 'child agent', 'Codex subagent_update 基本字段')
  check(sub.state.state === 'running' && sub.capabilities.tools === true && sub.cwd === '/tmp/child', 'subagent_update state/capabilities/cwd')
  check(sub.parentToolCallId === 'toolu_parent' && sub.native === 'subagent_update', 'subagent_update parentToolCallId/native')

  const state = mapSessionUpdate({ sessionUpdate: 'state_update', state: 'idle', stopReason: 'end_turn', error: { message: 'boom' } })
  check(state.type === 'state' && state.state === 'idle' && state.stopReason === 'end_turn' && state.error.message === 'boom', 'state_update → state（stopReason/error）')

  const msg = mapSessionUpdate({
    sessionUpdate: 'session_message', messageId: 'm1', senderSessionId: 'a', recipientSessionId: 'b',
    content: [{ type: 'text', text: 'hi' }]
  }, { sessionId: 'b' })
  check(msg.type === 'session_message' && msg.messageId === 'm1' && msg.sender === 'a' && msg.recipient === 'b' && msg.text === 'hi', 'session_message 保留 sender/recipient/messageId/content')
  check(msg.sessionId === 'b' && msg.native === 'session_message', 'session_message 使用外层子会话 sessionId')
  const msgChunk = mapSessionUpdate({ sessionUpdate: 'session_message_chunk', messageId: 'm2', content: { type: 'text', text: 'chunk' } })
  check(msgChunk.type === 'session_message' && msgChunk.chunk === true && msgChunk.text === 'chunk', 'session_message_chunk 保留 chunk 语义')
  const subType = mapSessionUpdate({ sessionUpdate: 'subagent', sessionId: 'child-2', title: 'Child' })
  check(subType.type === 'subagent' && subType.sessionId === 'child-2', 'subagent 事件类型')

  const b64 = Buffer.from('hello\n').toString('base64')
  const term = mapSessionUpdate({ sessionUpdate: 'terminal_update', terminalId: 'term1', command: 'ls', cwd: '/tmp', output: { data: b64 }, exitStatus: { exitCode: 0, signal: null } })
  check(term.type === 'terminal' && term.terminalId === 'term1' && term.output === 'hello\n', 'terminal_update 解码 output 并保留 terminalId')
  check(term.exitStatus.exitCode === 0 && term.cwd === '/tmp' && term.command === 'ls', 'terminal_update 保留 exitStatus/cwd/command')
  const chunk = mapSessionUpdate({ sessionUpdate: 'terminal_output_chunk', terminalId: 'term1', data: Buffer.from('tail').toString('base64') })
  check(chunk.type === 'terminal' && chunk.output === 'tail' && chunk.chunk === true, 'terminal_output_chunk 增量文本')

  const full = mapSessionUpdate({ sessionUpdate: 'agent_message', messageId: 'm2', content: [{ type: 'text', text: 'full answer' }] })
  check(full.type === 'text' && full.text === 'full answer' && full.full === true && full.messageId === 'm2', 'agent_message 全文 → text')
  const fullThought = mapSessionUpdate({ sessionUpdate: 'agent_thought', content: [{ type: 'text', text: 'thinking' }] })
  check(fullThought.type === 'thought' && fullThought.text === 'thinking' && fullThought.full === true, 'agent_thought 全文 → thought')

  const suggestions = mapSessionUpdate({ sessionUpdate: 'prompt_suggestions_update', suggestions: [{ prompt: [{ type: 'text', text: 'try this' }] }] })
  check(suggestions.type === 'suggestions' && suggestions.suggestions[0].text === 'try this', 'prompt_suggestions_update → suggestions')

  const huge = mapSessionUpdate({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hi' }, _meta: { blob: 'x'.repeat(20000) } })
  check(huge.nativeMeta && huge.nativeMeta.truncated === true && String(huge.nativeMeta.preview).length === 8000, 'nativeMeta 截断（8KB）')

  const perm = mapPermissionRequest({ toolCall: { toolCallId: 'c1', title: 'Read', _meta: { claudeCode: { parentToolUseId: 'p1', toolName: 'Read' } } }, options: [] }, 3)
  check(perm.tool.parentToolCallId === 'p1' && perm.tool.nativeMeta.claudeCode.parentToolUseId === 'p1', '权限事件的 tool 也带 parentToolCallId/nativeMeta')
  check(perm.native === 'session/request_permission', '权限事件 native 类型')

  const s = new AcpSession(sessionOpts({ sessionId: 'root-1' }))
  s._emitUpdate({ sessionUpdate: 'subagent_update', sessionId: 'child-1', title: 'X' }, { sessionId: 'parent-root' })
  const emitted = s.bufferedEvents().find((e) => e.type === 'subagent_update')
  check(emitted.sessionId === 'child-1' && emitted.rootSessionId === 'root-1', '子 Agent 事件保留子 sessionId 并附 rootSessionId')
  check(emitted.agent === 'claude' && emitted.native === 'subagent_update', '子 Agent 事件仍带 agent/native 元数据')
}

console.log('I · DSH session 绑定 / 生命周期')
{
  const storePath = join(tmp, 'store', 'bindings.json')
  let seq = 0
  const fake = (args) => ({
    id: args.id,
    sessionId: args.resumeSessionId || ('remote-sess-' + (++seq)),
    dshSessionId: args.dshSessionId || '',
    agent: args.agent,
    profile: args.profile,
    cwd: args.cwd,
    mirrorCwd: args.mirrorCwd,
    remotePath: args.remotePath,
    permissionMode: args.permission,
    createdAt: Date.now(),
    alive: true,
    reused: false,
    replacedId: '',
    closed: false,
    started: 0,
    stopped: false,
    async start() { this.started++ },
    async stop() { this.stopped = true; return { ok: true, stopped: true, closed: false, id: this.id, dshSessionId: this.dshSessionId } },
    async close() { this.closed = true; this.alive = false },
    state() {
      return {
        id: this.id, sessionId: this.sessionId, dshSessionId: this.dshSessionId,
        agent: this.agent, profileId: this.profile && this.profile.id ? this.profile.id : '',
        mirrorCwd: this.mirrorCwd, status: this.alive ? 'ready' : 'closed',
        lifecycle: this.alive ? 'active' : 'closed', detached: false,
        resumable: !this.alive && !!this.sessionId, alive: this.alive, busy: false,
        createdAt: this.createdAt
      }
    }
  })

  const rt = createAcpRuntime({ storePath, createSession: fake })
  const s1 = await rt.create({ profile: { id: 'p1' }, profileId: 'p1', agent: 'claude', mirrorCwd: tmp, cwd: tmp, remotePath: '/tmp', dshSessionId: 'dsh-1' })
  check(s1.dshSessionId === 'dsh-1' && s1.state().dshSessionId === 'dsh-1', 'AcpSession.state 带 dshSessionId')
  check(s1.state().lifecycle === 'active' && s1.state().detached === false, 'active 会话 lifecycle=active / detached=false')
  check(rt.list({ dshSessionId: 'dsh-1' }).length === 1 && rt.list({ dshSessionId: 'dsh-2' }).length === 0, 'acpList 按 dshSessionId 过滤')
  check(JSON.parse(readFileSync(storePath, 'utf8')).sessions[0].dshSessionId === 'dsh-1', 'dshSessionId 持久化到 sessions.json')

  const again = await rt.create({ profile: { id: 'p1' }, profileId: 'p1', agent: 'claude', mirrorCwd: tmp, cwd: tmp, remotePath: '/tmp', dshSessionId: 'dsh-1' })
  check(again.id === s1.id && again.reused === true && again.started === 1, '同 dshSessionId 重复 start 复用已有 active 会话')
  check(rt.list({ dshSessionId: 'dsh-1' }).length === 1, '重复 start 不产生第二个 active')

  const replacement = await rt.create({ profile: { id: 'p1' }, profileId: 'p1', agent: 'codex', mirrorCwd: tmp, cwd: tmp, remotePath: '/tmp', dshSessionId: 'dsh-1' })
  check(replacement.id !== s1.id && replacement.replacedId === s1.id && replacement.reused === false, '配置变化时明确替换旧会话（replaced）')
  check(rt.get(s1.id) === null && rt.list({ dshSessionId: 'dsh-1' }).length === 1, '替换后旧 active 与旧记录被清理')
  check(replacement.state().dshSessionId === 'dsh-1', '替换后的新会话保留绑定')

  const rt2 = createAcpRuntime({ storePath, createSession: fake })
  const detached = rt2.list({ dshSessionId: 'dsh-1' })[0]
  check(detached && detached.detached === true && detached.resumable === true && detached.lifecycle === 'detached' && detached.dshSessionId === 'dsh-1', '重启后 detached 与 resumable 可区分且保留绑定')
  const resumed = await rt2.resume(detached.id, { profile: { id: 'p1' } })
  check(resumed.dshSessionId === 'dsh-1' && resumed.sessionId === detached.sessionId, 'resume 保留 dshSessionId 与远端 ACP sessionId')
  check(rt2.list({ dshSessionId: 'dsh-1' }).length === 1 && JSON.parse(readFileSync(storePath, 'utf8')).sessions[0].dshSessionId === 'dsh-1', 'resume 后绑定与持久化一致')

  const stopped = await rt2.stop(resumed.id)
  check(stopped.ok === true && stopped.stopped === true && stopped.closed === false && stopped.dshSessionId === 'dsh-1', 'stop 只停 turn（stopped=true/closed=false）')
  check(rt2.get(resumed.id) === resumed && rt2.list({ dshSessionId: 'dsh-1' }).length === 1, 'stop 不移除会话')
  check(JSON.parse(readFileSync(storePath, 'utf8')).sessions[0].dshSessionId === 'dsh-1', 'stop 不清空持久化绑定')

  const closed = await rt2.close(resumed.id)
  check(closed.closed === true && closed.dshSessionId === 'dsh-1', 'close 返回被清理的绑定')
  check(rt2.get(resumed.id) === null && rt2.list({ dshSessionId: 'dsh-1' }).length === 0, 'close 才移除会话与 active 绑定')
  check(JSON.parse(readFileSync(storePath, 'utf8')).sessions.length === 0, 'close 清理 sessions.json 记录')

  const real = new AcpSession(sessionOpts({ dshSessionId: 'dsh-real' }))
  await real.start()
  check(real.state().dshSessionId === 'dsh-real' && real.state().lifecycle === 'active' && real.state().detached === false, '真实 AcpSession 启动后 state 带绑定/生命周期')
  check(real.bufferedEvents().every((e) => e.dshSessionId === 'dsh-real'), '事件元数据带 dshSessionId')
  await real.stop()
  check(real.dshSessionId === 'dsh-real' && real.alive === true && real.state().status === 'ready', '真实 AcpSession stop 只停 turn、绑定仍在')
  await real.close()
  check(real.state().dshSessionId === 'dsh-real' && real.state().lifecycle === 'closed' && real.state().detached === false, 'close 后 state 标记 closed（不伪造 detached）')
}

console.log('J · 常驻 View：断流 / attach / 事件缓冲')
{
  const s = new AcpSession(sessionOpts())
  await s.start()
  s.controller.prompt = async () => ({ stopReason: 'end_turn', response: { stopReason: 'end_turn', usage: { totalTokens: 3 } } })
  const baseSeq = s.bufferedEvents().slice(-1)[0]?.seq || 0
  const result = await s.prompt('hello')
  check(result.stopReason === 'end_turn', 'prompt 返回 stopReason')
  const stops = s.bufferedEvents(baseSeq).filter((e) => e.type === 'stop')
  check(stops.length === 1 && stops[0].stopReason === 'end_turn', 'turn 完成 stop 只入缓冲一次')
  check(stops[0].agent === 'claude' && stops[0].seq > baseSeq, 'stop 事件带元数据与 seq')

  const seen = []
  const unsub = s.subscribe((e) => seen.push(e), { replay: true, sinceSeq: baseSeq })
  check(seen.some((e) => e.type === 'stop' && e.stopReason === 'end_turn'), 'attach replay 能补到已完成的 stop')
  check(seen.every((e) => e.seq > baseSeq), 'attach sinceSeq 只回放增量')
  s._emit({ type: 'text', text: 'live-after-attach' })
  check(seen.some((e) => e.type === 'text' && e.text === 'live-after-attach'), 'attach 订阅后续 live 事件')
  unsub()
  s._emit({ type: 'text', text: 'after-unsubscribe' })
  check(!seen.some((e) => e.text === 'after-unsubscribe'), 'attach 断开后退订，不再收到事件')

  const attached = []
  const unsub2 = s.subscribe((e) => attached.push(e), { replay: true })
  const beforeStops = attached.filter((e) => e.type === 'stop').length
  await s.prompt('again')
  check(attached.filter((e) => e.type === 'stop').length === beforeStops + 1, 'attach 与 prompt 并存，各自收到 stop')
  unsub2()

  const s2 = new AcpSession(sessionOpts())
  await s2.start()
  const release = s2.beginStream()
  const pending = s2.prompt('long running turn')
  await tick()
  release()
  await tick()
  check(s2.controller.cancelled === false && s2.pendingTurns === 1, '释放 acpPrompt 流不 cancel 正在跑的 turn')
  let busyCode = ''
  try { s2.beginStream() } catch (e) { busyCode = e.code }
  check(busyCode === 'turn_busy', 'turn 进行中再次 acpPrompt 返回明确 turn_busy')
  await s2.cancel()
  await pending
  check(s2.bufferedEvents().some((e) => e.type === 'stop' && e.stopReason === 'cancelled'), 'cancel 后 stop 仍进缓冲')

  const storePath = join(tmp, 'store', 'attach-resume.json')
  const rt = createAcpRuntime({
    storePath,
    wrapperDir: join(tmp, 'wrappers'),
    createSession: (args) => new AcpSession(Object.assign({}, args, { connectImpl: () => fakeConnectFactory() }))
  })
  const rs = await rt.create({ profile: { id: 'p1', host: 'h', user: 'u', authMethod: 'kerberos' }, agent: 'claude', mirrorCwd: tmp, cwd: tmp, remotePath: '/tmp', dshSessionId: 'dsh-E' })
  rs.controller.prompt = async () => ({ stopReason: 'end_turn', response: { stopReason: 'end_turn' } })
  await rs.prompt('persist me')
  const beforeResume = rs.bufferedEvents().length
  const resumed = await rt.resume(rs.id)
  check(resumed === rs && resumed.bufferedEvents().length === beforeResume, '切换后 resume 活动会话保留事件缓冲')
  check(resumed.bufferedEvents().some((e) => e.type === 'stop'), 'resume 后仍可补到 stop')
  await rt.close(rs.id)
}

console.log('G · Host 接线与文档')
{
  check(src.includes('import { createAcpRuntime, ACP_AGENTS as ACP_AGENT_DEFS } from "./acp.js"'), 'lib/index.js 相对 import lib/acp.js')
  for (const m of ['acpAgents', 'acpStart', 'acpResume', 'acpState', 'acpList', 'acpSetConfig', 'acpSetMode', 'acpSteer', 'acpPermission', 'acpCancel', 'acpStop', 'acpClose', 'acpPrompt']) {
    check(src.includes(m + ': async') || src.includes(m + ': async ()'), '注册 api.' + m)
  }
  check(src.includes('method === "acpPrompt"') && src.includes('handleAcpPromptStream'), 'acpPrompt 走 NDJSON 专用路由')
  check(src.includes('application/x-ndjson') && src.includes("type: \"error\""), 'NDJSON content-type + 错误事件')
  check(src.includes('session.subscribe(write, { replay: true, sinceSeq: args.sinceSeq })'), '先回放缓冲事件再订阅更新（支持 sinceSeq）')
  check(src.includes('handleAcpAttachStream') && src.includes('method === "acpAttach"'), '注册 acpAttach NDJSON 常驻流')
  check(src.includes('acpEvents: async') && src.includes('events: s.bufferedEvents(args && args.sinceSeq)'), '注册 acpEvents（含 sinceSeq）')
  check(!/onClose[\s\S]{0,600}session\.cancel\(/.test(src), 'acpPrompt/acpAttach 断流都不 cancel turn')
  check(src.includes('res.on("close", onClose)') && src.includes('只退订'), '客户端断开只退订，不 cancel turn')
  check(src.includes('agentProbe(p)') && src.includes('mirrorCwd'), 'acpStart 复用 agentProbe 并校验 mirrorCwd')
  check(src.includes('acpRuntime.store.get(id)') && src.includes('acpRuntime.resume(id'), 'acpResume 从持久化记录恢复')
  check(/type:\s*"stop"[\s\S]{0,120}stopReason/.test(acpSrc), 'stop 事件在 AcpSession 缓冲层发出')
  check(!/write\(session\.decorate\(\{\s*type:\s*"stop"/.test(src), 'HTTP 层不重复写 stop')
  check(src.includes('acpStop: async') && src.includes('acpList: async (args)'), '注册 acpStop，acpList 接受 dshSessionId 过滤')
  check(src.includes('dshSessionId: String(a.dshSessionId') && src.includes('replace: a.replace === true'), 'acpStart 传 dshSessionId/replace')
  check(!/\bopencode\b/i.test(src) && !/\bopencode\b/i.test(acpSrc), 'lib/index.js / lib/acp.js 不再探测 opencode')
  check(src.includes("'for c in codex claude; do'"), '探测脚本只探测 codex / claude')
  check(src.includes('AGENT_DEFS[s.agent]') && src.includes('s.mode === "shell"'), '旧 agent 会话加载时按当前 AGENT_DEFS 过滤（不再返回已下线 agent）')
  check(pkg.dependencies['@agentclientprotocol/sdk'] === '^2.9.1', '依赖 @agentclientprotocol/sdk')
  check(pkg.dependencies['@agentclientprotocol/claude-agent-acp'] === '^0.109.1', '依赖 claude-agent-acp')
  check(pkg.dependencies['@agentclientprotocol/codex-acp'] === '^2.9.0', '依赖 codex-acp')
  check(pkg.files.includes('lib/acp.js'), 'files 包含 lib/acp.js')
  check(pkg.version === '2.13.1', '版本 2.13.1')
  check(/ACP/.test(readme) && /acpPrompt/.test(readme), 'README 有 ACP Chat 说明')
  check(/## \[2\.8\.0\]/.test(changelog) && /ACP/.test(changelog), 'CHANGELOG 有 2.8.0 ACP 说明')
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
