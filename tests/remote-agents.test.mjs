// 远程 Agent 回归测试（2.7.0 旧面板 + ACP Chat）。
//
// 覆盖：
//   A. 宿主 API / 路由接线（旧 tmux 面板仍保留）
//   B. tmux 输入必须用 set-buffer（load-buffer - 会在池化会话上等 EOF 而超时）
//   C. worktree 默认路径与分支校验
//   D. 探测输出解析
//   E. 客户端入口：conversation.hero.options；右侧栏/设置页入口已移除
//   F. UI 复用 DSH 共享原子、只用主题 token
//   H. ACP Chat：端到端事件、HITL 权限、steer、模型/思考级别/模式、停止/恢复/关闭
//   I. 子 Agent / parentToolCallId 嵌套 / native&nativeMeta / state、terminal、session_message
//   G. 版本 / 文档
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const src = readFileSync(join(root, 'lib/index.js'), 'utf8')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')

let pass = 0
let fail = 0
const check = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  ✗ FAIL: ' + label) } }

function grab(text, name) {
  const start = text.indexOf(name)
  if (start < 0) throw new Error(name + ' not found')
  const declStart = text.lastIndexOf('\n', start)
  let i = text.indexOf('{', start)
  let depth = 0
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) break }
  }
  return text.slice(declStart + 1, i + 1)
}

console.log('A · 宿主 API 与路由接线')
{
  for (const method of ['agents.detect', 'agents.create', 'agents.list', 'agents.output', 'agents.input', 'agents.key', 'agents.kill', 'agents.worktrees', 'agents.createWorktree']) {
    check(src.includes('"' + method + '"'), '注册了 ' + method)
  }
  check(src.includes('path: "/remote-ssh/agents-upload"') && src.includes('handleAgentUpload'), '注册了 agents-upload 路由')
  check(src.includes('path: "/remote-ssh/agents-download"') && src.includes('handleAgentDownload'), '注册了 agents-download 路由')
  check((src.match(/requestTrust\(req,/g) || []).length >= 9, '上传/下载与既有路由一样做 requestTrust 校验')
  check(src.includes('tmux new-session -d') && src.includes('capture-pane') && src.includes('paste-buffer'), '会话基于远端 tmux（new-session / capture-pane / paste-buffer）')
}

console.log('B · tmux 输入实现（set-buffer，不用会等 EOF 的 load-buffer -）')
{
  const fake = {
    calls: [],
    run: async (p, cmd, stdin) => { fake.calls.push({ cmd, stdin }); return { ok: true } }
  }
  const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"
  const fn = new Function('runPooled', 'shellQuote',
    grab(src, 'async function agentSendInput') + '\nreturn agentSendInput;')(fake.run, shq)
  const sess = { id: 'ag1', tmux: 'dsh-rs-ag1' }
  const r = await fn({ id: 'p1' }, sess, "echo 'hi'\nsecond")
  check(r.ok === true && fake.calls.length === 1, '一次 SSH 调用完成粘贴 + 回车')
  const cmd = fake.calls[0].cmd
  check(cmd.includes('tmux set-buffer') && !cmd.includes('load-buffer'), '使用 set-buffer（load-buffer - 会等待池化 stdin 的 EOF）')
  check(cmd.includes('paste-buffer') && cmd.includes('send-keys') && cmd.includes('Enter'), 'paste-buffer 后按 Enter 提交')
  check(fake.calls[0].stdin === undefined, '不向池化会话写 stdin')
}

console.log('C · worktree 默认路径与分支校验')
{
  const calls = []
  const run = async (p, cmd) => { calls.push(cmd); return { ok: true, stdout: '' } }
  const resolve = async () => ({ ok: true, path: '/home/u/repo' })
  const fn = new Function('runPooled', 'shellQuote', 'agentResolveDir',
    grab(src, 'async function agentCreateWorktree') + '\nreturn agentCreateWorktree;')(run, (s) => "'" + s + "'", resolve)
  const ok = await fn({ id: 'p' }, { repo: '/home/u/repo', branch: 'feature/agent' })
  check(ok.ok === true && ok.path === '/home/u/repo-feature-agent', '分支里的 / 不会把 worktree 建到嵌套目录（/home/u/repo-feature-agent）')
  check(calls.some((c) => c.includes('worktree add -b')), '新分支用 git worktree add -b')
  const bad = await fn({ id: 'p' }, { repo: '/home/u/repo', branch: 'bad;rm -rf /' })
  check(bad.ok === false && /不合法/.test(bad.error), '非法分支名直接拒绝')
}

console.log('D · 探测输出解析')
{
  const script = [
    ['A', 'claude', '/usr/bin/claude', '2.1.307 (Claude Code)'].join('\t'),
    ['A', 'codex', '/usr/bin/codex', '0.171.0'].join('\t'),
    ['T', 'tmux 3.3a'].join('\t'),
    ['G', 'git version 2.39.5'].join('\t'),
  ].join('\n')
  const run = async () => ({ ok: true, stdout: script })
  const defs = { claude: { label: 'Claude Code' }, codex: { label: 'Codex' } }
  const fn = new Function('runPooled', 'AGENT_DEFS', 'profileKey',
    'const agentProbeCache = new Map();\n' + grab(src, 'async function agentProbe') + '\nreturn agentProbe;')(run, defs, (p) => String(p.id))
  const r = await fn({ id: 'p' })
  check(r.ok && r.agents.length === 2, '识别到 claude 与 codex 两个 agent')
  check(r.agents[0].id === 'claude' && r.agents[0].name === 'Claude Code' && /2\.1\.307/.test(r.agents[0].version), 'agent 版本被带上')
  check(r.agents[1].id === 'codex' && r.agents[1].name === 'Codex' && /0\.171\.0/.test(r.agents[1].version), 'codex 也被识别')
  check(r.tmux === 'tmux 3.3a' && r.git === 'git version 2.39.5', 'tmux / git 版本被带上')
}

console.log('E · 会话内常驻 Agent View（conversation.view）')
{
  
  check(client.includes('function acpWriteAgentPref') && client.includes('function acpReadAgentPref'), '建区 Agent 偏好有读写助手')
  check(client.includes('flow.agent') && client.includes('acpWriteAgentPref(profileId, remotePath'), '建区时保存 Agent 偏好，start 时回写')
check(client.includes('slots.inject("conversation.view"'), '注册 conversation.view')
  check(client.includes('name: "conversation.view"') && client.includes('id: "remote-acp"'), 'View name/id = remote-acp')
  check(client.includes('order: 15'), 'View order = 15（Chat 之后）')
  check(client.includes('label: function () { return i18n.t("acp.hero"); }'), 'View 标签「远端 Agent」')
  check(client.includes('}, AcpChatView)'), 'View 组件 AcpChatView')
  check(client.includes('function AcpChatView') && client.includes('var dshSessionId = String((props && props.sessionId) || "")'), 'View 绑定 props.sessionId')
  check(!client.includes('conversation.hero.options'), '不再注册 hero.options Modal 入口')
  check(!client.includes('conversation.session.header.actions'), '不再注册 header Modal 入口')
  check(!client.includes('function AcpHeroButton') && !client.includes('function AcpHeaderButton') && !client.includes('AcpChatModal'), 'hero/header/Modal 入口组件已删除')
  check(!client.includes('ra-acp-dialog'), '不再有 Chat Modal 尺寸类')
  check(client.includes('className: "ra-acp-view"'), 'View 全区域容器')
  check(!client.includes('ctx.inject(["sidebarRightTabs", "sidebarRight"]'), '不再注册右侧栏 Agent 页签')
  check(!client.includes('sidebarRightTabs.register'), '没有 sidebarRightTabs.register')
  check(!client.includes('sidebar.right.pane.tab'), '没有 sidebar.right.pane.tab body')
  check(client.includes('workspace.picker.directoryFlow') && client.includes('RemoteWorkspaceFlow'), '新会话/⌘N 工作区选择器注册本地/SSH 流程')
  check(!client.includes('openAgentPanel'), 'openAgentPanel 变量/入口已删除')
  check(!client.includes('t("agents.open")'), '设置页「打开 Agent 面板」按钮已移除')
}

console.log('F · UI 复用 DSH 共享原子与主题 token')
{
  for (const atom of [
    'UiButton', 'UiInput', 'primitives.Menu', 'CompactMenuSelect', 'Modal',
    'primitives.MarkdownText', 'primitives.DiffBlock', 'primitives.TerminalBlock',
    'primitives.ReadBlock', 'primitives.Tag', 'primitives.StateDot'
  ]) {
    check(client.includes(atom), '复用 ' + atom)
  }
  check(client.includes('className: "ra-panel"') && client.includes('className: "rssh-ui-danger"'), '面板布局/危险动作沿用既有类与 token')
  check(client.includes('className: "ra-acp-view"'), 'Chat 使用全区域 View 类')
  const acpCss = (client.match(/\.ra-acp-[a-z-]+\{[^}]*\}/g) || []).join('\n')
  check(acpCss.length > 800, '存在 ACP Chat 样式')
  check(!/#[0-9a-f]{3,8}\b/i.test(acpCss), 'ra-acp-* 样式不使用硬编码颜色（只走 --dsw-* token）')
  check(/@media \(max-width:767px\)/.test(client), '窄屏有自适应规则')
  check(client.includes('aria-label') && client.includes('role: "alert"'), '输入/错误有可访问名称与 alert 角色')
}

console.log('H · ACP Chat 功能与端点')
{
  const start = client.indexOf('// ==== ACP Chat UI (start) ====')
  const end = client.indexOf('// ==== ACP Chat UI (end) ====')
  const acp = start >= 0 && end > start ? client.slice(start, end) : ''
  check(acp.length > 2000, '有独立的 ACP Chat UI 区段')

  for (const ep of ['acpAgents', 'acpStart', 'acpPrompt', 'acpSteer', 'acpSetConfig', 'acpSetMode',
    'acpPermission', 'acpCancel', 'acpClose', 'acpList', 'acpResume']) {
    check(acp.includes(ep), '调用 ' + ep)
  }
  // acpPrompt 必须走原始 fetch（NDJSON），不能经 api() 的 JSON 包装
  check(acp.includes('fetch("/remote-ssh/api/acpPrompt"'), 'acpPrompt 走 fetch 流式请求')
  check(/content-type.*application\/x-ndjson|indexOf\("ndjson"\)/.test(acp), '只接受 NDJSON 响应')
  check(acp.includes('body.getReader()') && acp.includes('TextDecoder'), '用 ReadableStream 读 NDJSON')
  check(acp.includes('JSON.parse(line)'), '按行 JSON.parse')
  check(acp.includes('seqRef') && acp.includes('ev.seq <= seqRef.current'), '按 seq 去重（先回放再增量）')

  // 事件渲染
  for (const type of ['text', 'thought', 'tool_call', 'tool_call_update', 'plan', 'commands',
    'usage', 'notice', 'error', 'stop', 'session_info', 'permission']) {
    check(acp.includes('"' + type + '"'), '渲染事件 ' + type)
  }
  check(acp.includes('h(AcpMarkdown') && acp.includes('primitives.MarkdownText'), '正文用 MarkdownText')
  check(acp.includes('h(primitives.DiffBlock'), 'diff 用 DiffBlock')
  check(acp.includes('h(primitives.TerminalBlock'), '终端输出用 TerminalBlock')
  check(acp.includes('h(primitives.ReadBlock'), '读取内容用 ReadBlock')
  check(acp.includes('h(AcpToolCard') && acp.includes('h(AcpPlanCard'), '工具卡片与计划卡片')
  check(acp.includes('className: "ra-acp-tool-title"') && acp.includes('acp.toolRunning'), '工具卡片显示名称与状态')

  // 创建流程
  check(acp.includes('api("listWorkspaces")'), '列远端工作区')
  check(acp.includes('mirrorPath') && acp.includes('remotePath'), '带出 workspace 的 mirrorPath/remotePath')
  check(acp.includes('mirrorCwd') && acp.includes('permission: permission'), 'acpStart 传 mirrorCwd/agent/permission')
  check(acp.includes('acpAgents'), '探测 Claude/Codex')
  check(acp.includes('permAccept') && acp.includes('permPlan') && acp.includes('permBypass'), '三种权限档')

  // HITL 权限
  check(acp.includes('function AcpPermissionCard') && acp.includes('role: "alertdialog"'), '权限卡片是 alertdialog')
  check(acp.includes('option.optionId') && acp.includes('props.onAnswer(permission, optionId)'), '按 adapter options 原样回传 optionId')
  check(acp.includes('requestId: permissionEvent.requestId'), 'acpPermission 带 requestId')
  check(acp.includes('cancelled: true'), '「忽略」回传 cancelled')
  check(acp.includes('autoResolved') && acp.includes('acp.autoApproved'), 'Bypass 自动批准只显示提示（不重复批准）')
  check(acp.includes('permissionCount') && acp.includes('permissionWaitingHint'), '未响应权限有计数与提示')

  // Steer
  check(acp.includes('runningRef.current') && acp.includes('function steer(text)'), 'turn 运行中切到 steer')
  check(acp.includes('api("acpSteer"'), '发送走 acpSteer')
  check(acp.includes('pushEcho(text, true)') && acp.includes('consumeEcho'), 'steering user_message 立即上屏并去重')

  // 模型 / 思考级别 / 模式
  check(acp.includes('config.models') && acp.includes('config.reasoning'), '读取 models/reasoning')
  check(acp.includes('config.modes') && acp.includes('availableModes'), '读取 modes')
  check(acp.includes('configOptions') && acp.includes('acpFlatSelectOptions'), '渲染其余 configOptions')
  check(acp.includes('api("acpSetConfig"') && acp.includes('api("acpSetMode"'), '切换走 acpSetConfig / acpSetMode')
  check(acp.includes('setConfigValue') && acp.includes('setModeValue'), '选择器变更更新本地 config')

  // 停止 / 列表 / 恢复 / 关闭
  check(acp.includes('api("acpCancel"') && acp.includes('function stopTurn'), 'acpCancel 停止当前 turn')
  check(acp.includes('api("acpList"') && acp.includes('api("acpResume"'), 'acpList + acpResume 会话列表')
  check(acp.includes('api("acpClose"') && acp.includes('function endSession'), 'acpClose 结束会话')
  check(acp.includes('endConfirm') && acp.includes('acp.endSessionDesc'), '结束会话需确认')
  check(!acp.includes('attemptClose') && !acp.includes('closeConfirm'), '没有 Modal 关闭/确认路径（View 常驻）')

  // 命令插入 / 文件
  check(acp.includes('function insertCommand') && acp.includes('function chooseCommand'), 'commands 可点击插入 composer')
  check(acp.includes('h(AgentFilesModal'), 'Chat 内复用远端文件浏览')

  // 状态与错误
  for (const key of ['acp.running', 'acp.waiting', 'acp.ready', 'acp.stopped', 'acp.error', 'acp.closed', 'acp.disconnected']) {
    check(acp.includes(key), '状态/错误文案 ' + key)
  }

  // 无 emoji：只检查 ACP UI 区段与 acp.* 文案行
  const acpLines = client.split('\n').filter((line) => line.includes('"acp.'))
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u
  check(!emoji.test(acp) && !acpLines.some((line) => emoji.test(line)), 'ACP UI 与 acp.* 文案不含 emoji')
}

console.log('I · 子 Agent / 嵌套工具 / 原生事件')
{
  const start = client.indexOf('// ==== ACP Chat UI (start) ====')
  const end = client.indexOf('// ==== ACP Chat UI (end) ====')
  const acp = client.slice(start, end)

  // 子 Agent 卡片
  check(acp.includes('function AcpSubagentCard') && acp.includes('function AcpSubagentMeta'), '子 Agent 卡片与头部组件存在')
  check(acp.includes('"subagent"') && acp.includes('"subagent_update"'), '处理 subagent / subagent_update 事件')
  check(acp.includes('acpIsSubagentTool') && acp.includes('acpSubagentFromTool'), 'Claude Agent / Task 工具卡识别为子 Agent')
  check(acp.includes('raw.subagent_type') && acp.includes('run_in_background'), '从 Claude Agent 参数提取 agentId/description/background')
  check(acp.includes('outputFile') && acp.includes('acp.subagentOpenOutput'), '子 Agent 输出文件可展开/打开')
  check(acp.includes('function openOutput') && acp.includes('api("readFile"'), 'outputFile 走现有 readFile 预览')
  check(acp.includes('subagent.summary') || acp.includes('sub.summary'), 'Claude task-notification summary 可展开')
  check(acp.includes('acpLooksLikeTaskNotification'), 'task-notification 不会当普通 user 消息平铺')

  // 嵌套工具
  check(acp.includes('parentToolCallId'), '处理 parentToolCallId')
  check(acp.includes('function acpBuildChildMap') && acp.includes('function acpChildrenFor'), '按父 toolCallId 构建嵌套树')
  check(acp.includes('function renderConversation') && acp.includes('built.known[parent]'), '子调用不渲染为顶层消息')
  check(acp.includes('function AcpNestedChildren') && acp.includes('className: "ra-acp-children"'), '嵌套调用有缩进容器')
  const nested = grab(acp, 'function AcpNestedChildren')
  check(nested.includes('h(UiButton'), '折叠/展开按钮使用 DSH Button（UiButton 包装 primitives.Button）')
  check(acp.includes('nestedCalls'), '嵌套调用显示数量')

  // 原生事件
  check(acp.includes('function AcpNativeDetails') && acp.includes('acp.nativeEvent'), '原生事件折叠详情组件')
  check(acp.includes('nativeMeta') && acp.includes('acpJsonText'), 'nativeMeta JSON 截断展示')
  check(acp.includes('native: tool.native') && acp.includes('native: sub.native'), '工具/子 Agent 卡片带原生事件详情')
  check(!/ra-acp-native[^}]*#[0-9a-f]{3,8}/i.test(acp), '原生事件样式只用主题 token')
  check(acp.includes('"state"') && acp.includes('function AcpStateCard'), 'state 事件渲染状态卡')
  check(acp.includes('acp.stateRequiresAction'), 'state 支持 requires_action / running / idle')
  check(acp.includes('"session_message"') && acp.includes('function AcpSessionMessageCard'), 'session_message 渲染 sender→recipient')
  check(acp.includes('acpContentText') && acp.includes('sender') && acp.includes('recipient'), 'session_message 内容归一化与 sender/recipient')
  check(acp.includes('"terminal"') && acp.includes('function AcpTerminalEventCard'), 'terminal 原生事件卡片')
  check(acp.includes('command: String(item.command') && acp.includes('exitStatus'), 'terminal 用 TerminalBlock + exitStatus')
  check(acp.includes('"suggestions"') && acp.includes('ra-acp-suggestions'), 'suggestions 紧凑建议条')
  check(acp.includes('insertText') && acp.includes('suggestion'), '建议可点击插入 composer')
  check(acp.includes('"native"') && acp.includes('function AcpNativeEventCard'), '通用 native 事件卡片')
  check(acp.includes('function acpNativeState') && acp.includes('requires-action'), '原生 state 映射兼容下划线/连字符')

  // 与 Host 实际字段对齐（lib/acp.js 已实现）
  check(acp.includes('ev.chunk === true'), 'terminal_output_chunk 按 chunk 追加输出')
  check(acp.includes('merged.exitStatus = prev[i].exitStatus'), 'terminal chunk 不覆盖已有 exitStatus')
  check(acp.includes('item.text !== undefined') && acp.includes('acpContentText(item.content)'), 'session_message 优先用 Host 的 text，兼容 content blocks')
  check(acp.includes('merged.text = chunk'), 'session_message_chunk 追加文本')
  check(acp.includes('errorMessage'), 'state 事件展示 Host 的 errorMessage')
  check(acp.includes('agentId || s.sessionId || s.taskId'), '子 Agent key 覆盖 agentId/sessionId/taskId/toolUseId')
  check(acp.includes('sub.state !== undefined') && acp.includes('sub.status'), 'Claude task status 作为子 Agent 状态回退')
  check(acp.includes('native: tool.native !== undefined ? tool.native : tool.sessionUpdate'), '工具原生事件名兼容 native/sessionUpdate')
  check(acp.includes('function AcpNestedChildren') && acp.includes('ancestors'), '嵌套递归带环路保护')
}

console.log('J · 常驻 View / dshSessionId / 文件 / 命令面板 / 生命周期')
{
  const start = client.indexOf('// ==== ACP Chat UI (start) ====')
  const end = client.indexOf('// ==== ACP Chat UI (end) ====')
  const acp = client.slice(start, end)

  // 绑定 + 自动恢复
  check(acp.includes('var dshSessionId = String((props && props.sessionId) || "")'), 'View 使用 props.sessionId 作为 dshSessionId')
  check(acp.includes('api("acpList", { dshSessionId: dshSessionId })'), '挂载 acpList({dshSessionId})')
  check(acp.includes('api("acpResume", { id: target.id, dshSessionId: dshSessionId })'), 'acpResume 带 dshSessionId')
  check(acp.includes('dshSessionId: dshSessionId') && acp.includes('api("acpStart"'), 'acpStart 带 dshSessionId')
  check(acp.includes('acpViewCache') && acp.includes('function resume(target, auto)'), 'acpViewCache + 自动 resume')
  check(acp.includes('api("acpList", { dshSessionId: dshSessionId })') && acp.includes('for (var i = 0; i < list.length; i++)'), '按 dshSessionId 选择可恢复会话')
  check(acp.includes('delete acpViewCache[dshSessionId]'), '结束/重置时清理缓存')

  // 无 Modal 壳 & 生命周期
  check(acp.includes('return h("section", { className: "ra-acp-view"'), '返回 section 常驻 View')
  check(!acp.includes('onClose: attemptClose') && !acp.includes('props.onClose()'), 'View 没有 Modal onClose')
  const stop = grab(acp, 'function stopTurn')
  check(stop.includes('api("acpCancel"') && !stop.includes('api("acpClose"'), '停止只停 turn，不结束会话')
  const reset = grab(acp, 'function resetToSetup')
  check(!reset.includes('api("acpClose"'), '新会话/重置不调用 acpClose')
  check(acp.includes('function endSession') && acp.includes('setEndConfirm(true)'), '结束会话需确认')
  check(acp.includes('acp.closeFailed') && acp.includes('acp.error'), '结束/错误状态可见')
  check(acp.includes('setBooting(false)') && acp.includes('acp.resumingSession'), '挂载恢复中状态')
  check(acp.includes('acp.stopped') && acp.includes('acp.waiting') && acp.includes('acp.running'), '生命周期状态：运行/等待权限/已停止')
  check(acp.includes('ra-acp-empty-state') && acp.includes('acp.emptyHint'), '消息空状态')
  check(acp.includes('ra-acp-errorbar'), '错误条')

  // 当前会话远端工作区
  check(acp.includes('workspaceSnapshot.items') && acp.includes('wsv.sessionIds.indexOf(dshSessionId)'), '用 useWorkspaces.sessionIds 推断当前工作区')
  check(acp.includes('samePath(workspaces[i].mirrorPath, currentWorkspacePath)'), '按 mirrorPath 匹配 Host 远程工作区')
  check(acp.includes('setMirrorCwd(String(hit.mirrorPath') && acp.includes('setRemotePath(String(hit.remotePath'), '自动填 mirrorCwd/remotePath')

  // 文件
  check(acp.includes('t("acp.files")') && acp.includes('setFilesOpen(true)'), '顶部文件按钮')
  check(acp.includes('h(AgentFilesModal') && acp.includes('initialDir: session.remotePath'), '文件面板默认会话 remotePath')
  check(acp.includes('listDir') || src.includes('"listDir"'), '文件面板列出目录（listDir）')
  check(acp.includes('api("readFile"'), '文件面板读取文本')
  check(src.includes('/remote-ssh/agents-upload') && src.includes('/remote-ssh/agents-download'), '文件面板上传/下载路由')
  check(acp.includes('outputPreview') && acp.includes('acp.binaryOutput'), '图片/二进制预览提示')

  // 命令 / skill 面板
  check(acp.includes('function renderCommandPanel') && acp.includes('acp.commandsPanel'), '命令面板')
  check(acp.includes('acpCommandGroups') && acp.includes('function acpCommandGroup'), '命令分组')
  check(acp.includes('acp.commandSearch') && acp.includes('setCommandQuery'), '命令搜索')
  check(acp.includes('acp.skillGroup') && acp.includes('name === "skills"'), 'Codex /skills 归到技能组')
  check(acp.includes('command.input && command.input.hint'), '显示 input hint')
  check(acp.includes('function chooseCommand') && acp.includes('insertCommand(acpCommandName(command))'), '点击命令插入 composer')
  check(acp.includes('acp.commandsEmpty'), '命令面板空状态')
  check(acp.includes('acp.commandOpen'), '命令按钮')

  // 窄屏 & 无 emoji 仍成立
  check(/@media \(max-width:767px\)/.test(client), '窄屏样式')
  const acpLines = client.split('\n').filter((line) => line.includes('"acp.'))
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u
  check(!emoji.test(acp) && !acpLines.some((line) => emoji.test(line)), 'ACP UI 与 acp.* 无 emoji')
}

console.log('K · attach/events 回放与生命周期')
{
  const start = client.indexOf('// ==== ACP Chat UI (start) ====')
  const end = client.indexOf('// ==== ACP Chat UI (end) ====')
  const acp = client.slice(start, end)

  check(acp.includes('api("acpEvents", { id: id })'), '挂载/resume 后调用 acpEvents 回放')
  check(acp.includes('fetch("/remote-ssh/api/acpAttach"'), 'acpAttach NDJSON 接收 live')
  check(acp.includes('sinceSeq: seqRef.current'), 'acpAttach 传 sinceSeq（只补未见事件）')
  check(acp.includes('function attachSession') && acp.includes('function openAttach'), 'attachSession/openAttach')
  check(acp.includes('events.sort') && acp.includes('applyEvent(events[i])'), 'acpEvents 按 seq 排序回放')
  check(acp.includes('ev.seq <= seqRef.current'), '主 prompt/attach/events 共用 seq 去重')
  check(acp.includes('attachSession(next.id)'), 'acpResume/acpStart 完成后自动 attach')
  check(acp.includes('scheduleAttach(id)') && acp.includes('attachUnsupportedRef'), 'attach 断开自动重连，旧 Host 静默降级')
  check(acp.includes('isCurrentSession(sid)') && acp.includes('isCurrentSession(id)'), '旧会话事件不串到新 View')
  check(acp.includes('result.session.busy') || acp.includes('sessionBusy'), 'resume 后按 Host busy 恢复 running')
  check(acp.includes('var nativeState = acpNativeState(ev.state)') && acp.includes('setRunning(true)'), 'state 事件更新 running')
  check(acp.includes('function sessionLooksBusy') && acp.includes('mergeSessionState(r.session)'), '回放后按 Host busy 对齐 running，历史 stop 不覆盖')
  check(acp.includes('if (!(replayingRef.current && sessionLooksBusy()))'), 'replay 中的历史 stop/idle 不误停当前 turn')
  check(acp.includes('sinceSeq: seqRef.current') && acp.includes('pendingPermissions'), 'acpPrompt/acpAttach 带 sinceSeq，恢复权限等待')
  check(acp.includes('state.pendingPermissions') && acp.includes('setPending(state.pendingPermissions'), 'acpEvents 恢复待处理权限')
  check(acp.includes('attachState = r.session || {') && acp.includes('mergeSessionState(attachState)'), 'acpEvents 扁平状态（busy/status）也合并')

  const cleanupStart = acp.indexOf('mountedRef.current = false;')
  const cleanup = cleanupStart >= 0 ? acp.slice(cleanupStart, cleanupStart + 520) : ''
  check(cleanup.includes('stopAttach()'), 'View 卸载只断 attach')
  check(!/api\("acp(Cancel|Close)"/.test(cleanup), 'View 卸载不调用 acpCancel/acpClose')
  check(/abortRef\.current\.abort/.test(cleanup) && /stopAttach\(\)/.test(cleanup), 'View 卸载只 abort 本地流（prompt/attach）')

  check(acp.includes('api("acpPrompt"') || acp.includes('/remote-ssh/api/acpPrompt'), '发送仍走 acpPrompt')
  check(acp.includes('api("acpSteer"'), '运行中仍走 acpSteer')
  check(!acp.includes('AcpChatModal') && !acp.includes('conversation.hero.options'), '仍无 Modal 入口')
}

console.log('G · 版本与文档')
{
  check(/^\d+\.\d+\.\d+/.test(pkg.version), 'package.json 版本格式正确')
  check(/## \[2\.8\.0\]/.test(changelog) && /ACP Chat/.test(changelog), 'CHANGELOG 有 ACP Chat 2.8.0 段')
  check(/conversation\.view/.test(changelog), 'CHANGELOG 记录 conversation.view 常驻 View')
  check(/## \[2\.7\.0\]/.test(changelog) && /远程 Agent/.test(changelog), 'CHANGELOG 保留 2.7.0 历史')
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const readmeEn = readFileSync(join(root, 'README_EN.md'), 'utf8')
  check(/远端 Agent/.test(readme) && /ACP Chat/.test(readme), 'README 描述 ACP Chat 与入口')
  check(!/右侧栏新增「\*\*远程 Agent\*\*」页签/.test(readme), 'README 不再宣称右侧栏入口')
  check(!/conversation\.hero\.options/.test(readme), 'README 不再宣称 hero.options 入口')
  check(/新会话/.test(readme) && /SSH/.test(readme), 'README 描述新会话/⌘N → SSH 入口')
  check(!/\bpi\b/i.test(readme) && !/\bpi\b/i.test(readmeEn) && !/\bpi\b/i.test(changelog), 'README/CHANGELOG 不再提 pi')
  check(!/codex \/ claude \/ pi/i.test(client), '客户端文案不再提 pi')
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
