// 远程 Agent 面板回归测试（2.7.0）。
//
// 覆盖：
//   A. 宿主 API / 路由接线
//   B. tmux 输入必须用 set-buffer（load-buffer - 会在池化会话上等 EOF 而超时）
//   C. worktree 默认路径与分支校验
//   D. 探测输出解析
//   E. 客户端右侧栏页签注册（类型 + body + guide）
//   F. UI 复用 DSH 共享原子、只用主题 token
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
  const fn = new Function('runPooled', 'AGENT_DEFS',
    grab(src, 'async function agentProbe') + '\nreturn agentProbe;')(run, defs)
  const r = await fn({ id: 'p' })
  check(r.ok && r.agents.length === 2, '识别到 claude 与 pi 两个 agent')
  check(r.agents[0].id === 'claude' && r.agents[0].name === 'Claude Code' && /2\.1\.307/.test(r.agents[0].version), 'agent 版本被带上')
  check(r.tmux === 'tmux 3.3a' && r.git === 'git version 2.39.5', 'tmux / git 版本被带上')
}

console.log('E · 客户端右侧栏页签注册')
{
  check(client.includes('sidebarRightTabs.register') && client.includes('kind: tabKind'), '注册自定义 tab 类型')
  check(client.includes('kind: "remote-agents"') || client.includes('var tabKind = "remote-agents"'), 'kind = remote-agents')
  check(client.includes('name: "sidebar.right.pane.tab", key: tabId'), 'body 注册在 sidebar.right.pane.tab（与内置终端同一扩展点）')
  check(client.includes('guide: [{') && client.includes('icon: primitives.IconAgentPresetOutline16'), '引导页提供入口与图标')
  check(client.includes('rb.sidebarRight.openTab(tabKind)'), '可从设置页/入口直接打开面板')
  check(client.includes('ctx.inject(["sidebarRightTabs", "sidebarRight"]'), '软注入：没有右侧栏的旧宿主不会 pending')
}

console.log('F · UI 复用 DSH 共享原子与主题 token')
{
  for (const atom of ['UiButton', 'UiInput', 'primitives.Menu', 'primitives.Pill', 'primitives.StateDot', 'Modal']) {
    check(client.includes(atom), '复用 ' + atom)
  }
  check(client.includes('className: "ra-panel"') && client.includes('className: "rssh-ui-danger"'), '面板布局/危险动作沿用既有类与 token')
  const raCss = (client.match(/\.ra-[a-z-]+\{[^}]*\}/g) || []).join('\n')
  check(raCss.length > 200, '存在 Agent 面板样式')
  check(!/#[0-9a-f]{3,8}\b/i.test(raCss), 'ra-* 样式不使用硬编码颜色（只走 --dsw-* token）')
  check(client.includes('aria-label') && client.includes('role: "alert"'), '输入/错误有可访问名称与 alert 角色')
}

console.log('G · 版本与文档')
{
  check(pkg.version === '2.7.0', '版本 2.7.0')
  check(/## \[2\.7\.0\]/.test(changelog) && /远程 Agent/.test(changelog), 'CHANGELOG 有 2.7.0 段并描述功能')
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
