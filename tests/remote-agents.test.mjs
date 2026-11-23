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
    ['A', 'pi', '/usr/bin/pi', ''].join('\t'),
    ['T', 'tmux 3.3a'].join('\t'),
    ['G', 'git version 2.39.5'].join('\t'),
  ].join('\n')
  const run = async () => ({ ok: true, stdout: script })
  const defs = { claude: { label: 'Claude Code' }, pi: { label: 'Pi' }, codex: { label: 'Codex' } }
  const fn = new Function('runPooled', 'AGENT_DEFS', 'profileKey',
    'const agentProbeCache = new Map();\n' + grab(src, 'async function agentProbe') + '\nreturn agentProbe;')(run, defs, (p) => String(p.id))
  const r = await fn({ id: 'p' })
  check(r.ok && r.agents.length === 2, '识别到 claude 与 pi 两个 agent')
  check(r.agents[0].id === 'claude' && r.agents[0].name === 'Claude Code' && /2\.1\.307/.test(r.agents[0].version), 'agent 版本被带上')
  check(r.tmux === 'tmux 3.3a' && r.git === 'git version 2.39.5', 'tmux / git 版本被带上')
}

console.log('E · 「新建会话」入口（conversation.hero.options）')
{
  check(client.includes('slots.inject("conversation.hero.options"'), '在 conversation.hero.options 软注入入口')
  check(client.includes('name: "conversation.hero.options"') && client.includes('id: "remote-acp"'), '注册名/id 正确')
  check(client.includes('order: 50'), 'order = 50（排在原生选项之后）')
  check(client.includes('locale: NS'), '注册声明 locale（t 由槽位提供）')
  check(client.includes('function AcpHeroButton') && client.includes('function AcpChatModal'), 'hero 按钮 + Chat Modal 组件存在')
  check(!client.includes('ctx.inject(["sidebarRightTabs", "sidebarRight"]'), '不再注册右侧栏 Agent 页签')
  check(!client.includes('sidebarRightTabs.register'), '没有 sidebarRightTabs.register')
  check(!client.includes('sidebar.right.pane.tab'), '没有 sidebar.right.pane.tab body')
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
  check(client.includes('className: "ra-acp-dialog"'), 'Chat 使用大尺寸 Modal 类')
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
  check(acp.includes('closeConfirm') && acp.includes('acp.confirmCloseDesc'), '运行中关闭需确认')
  check(acp.includes('function attemptClose') && acp.includes('onClose: attemptClose'), 'Esc/关闭走 attemptClose')

  // 命令插入 / 文件
  check(acp.includes('function insertCommand') && acp.includes('onClick: function () { insertCommand'), 'commands 可点击插入 composer')
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

console.log('G · 版本与文档')
{
  check(/^\d+\.\d+\.\d+/.test(pkg.version), 'package.json 版本格式正确')
  check(/## \[2\.8\.0\]/.test(changelog) && /ACP Chat/.test(changelog), 'CHANGELOG 有 ACP Chat 2.8.0 段')
  check(/conversation\.hero\.options/.test(changelog), 'CHANGELOG 记录 hero.options 入口')
  check(/## \[2\.7\.0\]/.test(changelog) && /远程 Agent/.test(changelog), 'CHANGELOG 保留 2.7.0 历史')
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  check(/远端 Agent/.test(readme) && /ACP Chat/.test(readme), 'README 描述 ACP Chat 与入口')
  check(!/右侧栏新增「\*\*远程 Agent\*\*」页签/.test(readme), 'README 不再宣称右侧栏入口')
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
