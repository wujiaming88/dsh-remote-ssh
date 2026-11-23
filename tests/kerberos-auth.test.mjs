// Kerberos / GSSAPI 认证回归测试（2.5.0）。
//
// 背景：插件的非交互通道（会话池 / 工具 / 文件 / 同步）原本固定
// `BatchMode=yes + PreferredAuthentications=publickey`，企业内网里只接受
// `gssapi-with-mic` 的 sshd 因此根本连不上 —— 而这类环境（BYTEDANCE.COM 等）恰恰
// 既不发私钥也不允许口令。2.5.0 新增 `authMethod: "kerberos"`：
//   · 非 tty：GSSAPIAuthentication=yes + BatchMode=yes + PreferredAuthentications=gssapi-with-mic
//   · tty（内置终端）：只加 GSSAPIAuthentication=yes，保留密码/OTP 回落
//   · 失败按 GSSAPI 证据归因（票据缺失/过期、KDC 无 host 主体、身份被拒），
//     绝不落进「检查 keyPath」的通用公钥分支。
//
// 本文件覆盖 A 参数形状 · B 错误归因 · C 会话键 · D 标记文件 · E 终端 wrapper ·
// F 清单 · G 客户端接线 · H ssh config 导入 · I klist 预检。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const src = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

let pass = 0
let fail = 0
const check = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  ✗ FAIL: ' + label) } }

/** 按名字抓一个函数/方法声明（大括号配平，能处理嵌套）。 */
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
function grabConst(pattern, label) {
  const m = text(pattern)
  if (!m) throw new Error(label + ' not found')
  return m[0]
}
function text(pattern) { return src.match(pattern) }

// ---------------------------------------------------------------------------
console.log('A. sshArgv：Kerberos 通道的参数形状')
// ---------------------------------------------------------------------------
const argvBody =
  'let cachedSshPath;\n' +
  grab(src, 'function sshExecutablePath') + '\n' +
  grab(src, 'function expandSshPath') + '\n' +
  'function ensureWindowsAskpass() { throw new Error("askpass must not be reached for kerberos"); }\n' +
  grab(src, 'function sshArgv') + '\n' +
  'return { sshArgv };'
const sshArgv = new Function('join', 'homedir', 'existsSync', 'process', argvBody)(
  function () { return Array.prototype.slice.call(arguments).join('/') },
  function () { return '/home/u' },
  function () { return false },
  { platform: 'linux', env: {} },
).sshArgv

const KRB = { id: 'p-krb', host: 'hpc.example.org', port: 2222, user: 'wujiaming.ai', authMethod: 'kerberos', keyPath: '' }
{
  const built = sshArgv(KRB, 'echo __DSH_OK__', false)
  const a = built.argv
  check(a.includes('GSSAPIAuthentication=yes'), 'A1 非 tty 显式开启 GSSAPIAuthentication=yes')
  check(a.includes('PreferredAuthentications=gssapi-with-mic'), 'A2 非 tty 只协商 gssapi-with-mic（票据过期时立即失败，不挂到超时）')
  check(a.includes('BatchMode=yes'), 'A3 非 tty 仍走 BatchMode（票据有效时全程无交互）')
  check(!a.includes('-i'), 'A4 不传 -i（Kerberos 不使用私钥）')
  check(built.env === undefined, 'A5 不注入 SSH_ASKPASS / 口令环境变量')
  check(!a[0].includes('sshpass'), 'A6 不前置 sshpass')
  check(a[a.length - 2] === 'wujiaming.ai@hpc.example.org' && a[a.length - 1] === 'echo __DSH_OK__', 'A7 目标与远端命令位置正确')

  const pairs = []
  for (let i = 0; i < a.length; i++) if (a[i] === '-o') pairs.push(a[i + 1])
  check(pairs.every((v) => typeof v === 'string' && v.includes('=')), 'A8 每个 -o 都紧跟自己的 key=value（无交叉）')

  // 真实 ssh 的离线判据：`ssh -G` 只解析 argv，不建立连接
  const probe = spawnSync(process.env.DSH_TEST_SSH || 'ssh', ['-G'].concat(a.slice(0, -1)), { encoding: 'utf8' })
  if (probe.error) {
    console.log('  … 跳过（本机没有可用的 ssh：' + String(probe.error.code || probe.error.message) + '）')
  } else {
    const dump = String(probe.stdout || '')
    check(probe.status === 0 && !/Bad configuration option|no argument after keyword/.test(String(probe.stderr || '')),
      'A9 真实 ssh 接受这串 Kerberos argv')
    check(/^gssapiauthentication yes$/m.test(dump), 'A10 ssh -G 确认 GSSAPIAuthentication=yes')
    check(/^preferredauthentications gssapi-with-mic$/m.test(dump), 'A11 ssh -G 确认 PreferredAuthentications=gssapi-with-mic')
    check(/^batchmode yes$/m.test(dump), 'A12 ssh -G 确认 BatchMode=yes')
  }
}
{
  const a = sshArgv(KRB, undefined, true).argv
  check(a.includes('-tt'), 'A13 tty 通道带 -tt')
  check(a.includes('GSSAPIAuthentication=yes'), 'A14 tty 也开启 GSSAPI')
  check(!a.includes('BatchMode=yes'), 'A15 tty 不加 BatchMode（票据过期时仍可交互）')
  check(!a.some((x) => typeof x === 'string' && x.startsWith('PreferredAuthentications=')),
    'A16 tty 不限定认证顺序（保留 password / keyboard-interactive 回落）')
}

// ---------------------------------------------------------------------------
console.log('B. sshErrorHint：按 GSSAPI 证据归因，绝不误导到 keyPath')
// ---------------------------------------------------------------------------
const hintBody =
  grabConst(/const SSH_DIAG_LINE = .*;\n/, 'SSH_DIAG_LINE') + '\n' +
  grab(src, 'function stripPqBanner') + '\n' +
  grab(src, 'function stripLoginBanner') + '\n' +
  grab(src, 'function findMissingIdentityFile') + '\n' +
  grab(src, 'function offeredAuthMethods') + '\n' +
  grab(src, 'function sshExcerpt') + '\n' +
  grab(src, 'function kerberosEvidenceLine') + '\n' +
  grab(src, 'function describeKerberosFailure') + '\n' +
  grab(src, 'function sshErrorHint') + '\n' +
  'return { sshErrorHint, describeKerberosFailure };'
const hints = new Function(hintBody)()
const KEY_PROFILE = { authMethod: 'key', keyPath: '/home/u/.ssh/id_ed25519' }

{
  const noTicket = hints.sshErrorHint('No credentials cache found (filename: /tmp/krb5cc_501)', KRB)
  check(/Kerberos 认证失败/.test(noTicket) && /kinit/.test(noTicket), 'B1 无票据 → 提示先 kinit')
  check(/klist/.test(noTicket) && /票据/.test(noTicket), 'B2 提示用 klist 确认票据')
  check(!/keyPath|私钥文件不存在|公钥认证失败/.test(noTicket), 'B3 绝不误导到 keyPath / 公钥')

  const expired = hints.sshErrorHint('Ticket expired while decay', KRB)
  check(/票据已经过期|票据/.test(expired) && /kinit/.test(expired), 'B4 票据过期 → 重新 kinit')

  const noPrincipal = hints.sshErrorHint('Server not found in Kerberos database', KRB)
  check(/KDC/.test(noPrincipal) && /host/.test(noPrincipal), 'B5 KDC 无 host 主体 → 指出要管理员申请/核对映射')

  const denied = hints.sshErrorHint('Permission denied (gssapi-with-mic).', KRB)
  check(/Kerberos 认证被拒绝/.test(denied) && /Principal/.test(denied), 'B6 gssapi 被拒 → 核对 user 与票据主名')

  const pwdOnly = hints.sshErrorHint('Permission denied (publickey,password).', KRB)
  check(/Kerberos 认证失败/.test(pwdOnly), 'B7 服务器只提供 password 时仍按 Kerberos 归因')
  check(!/authorized_keys/.test(pwdOnly), 'B8 Kerberos 连接不再劝用户往 authorized_keys 收录公钥')

  const mismatch = hints.sshErrorHint('Permission denied (gssapi-keyex,gssapi-with-mic).', { authMethod: 'key', keyPath: '' })
  check(/Kerberos \(GSSAPI\)/.test(mismatch) && !/keyPath|私钥文件/.test(mismatch),
    'B9b 服务端只提供 gssapi 时，key 连接被明确建议改成 Kerberos（多连接导入的典型坑）')

  const keyDenied = hints.sshErrorHint('Permission denied (publickey).', KEY_PROFILE)
  check(/公钥认证失败/.test(keyDenied), 'B9 密钥连接行为不变（回归控制）')

  const missingKey = hints.sshErrorHint('Warning: Identity file /x/id_rsa not accessible: No such file or directory.', KEY_PROFILE)
  check(/私钥文件不存在或不可读/.test(missingKey), 'B10 密钥连接的私钥缺失提示不变')

  const krbStrayKey = hints.sshErrorHint('Warning: Identity file /x/id_rsa not accessible.\nNo credentials cache found', KRB)
  check(/Kerberos/.test(krbStrayKey) && !/私钥文件不存在/.test(krbStrayKey),
    'B11 Kerberos 连接里即使出现 IdentityFile 警告也不误报私钥（不查 keyPath）')

  check(hints.sshErrorHint('', undefined).length >= 0, 'B12 空输入不抛错')
}

// ---------------------------------------------------------------------------
console.log('C. 会话 / 缓存键随认证方式重建')
// ---------------------------------------------------------------------------
{
  const profileKey = new Function(grab(src, 'function profileKey') + '\nreturn profileKey;')()
  const asKey = profileKey({ id: 'p', host: 'h', user: 'u', authMethod: 'key', keyPath: '/k' })
  const asKrb = profileKey({ id: 'p', host: 'h', user: 'u', authMethod: 'kerberos', keyPath: '' })
  check(asKey !== asKrb, 'C1 同一连接切换 key → kerberos 会得到不同的会话键（旧身份不复用）')
}

// ---------------------------------------------------------------------------
console.log('D. 工作区标记文件 .remote-ssh.json 携带 authMethod')
// ---------------------------------------------------------------------------
{
  const blocks = src.match(/const connInfo = \{[\s\S]*?\n\s*\};/g) || []
  const withAuth = blocks.filter((b) => /authMethod: p\.authMethod \|\| "key"/.test(b))
  check(blocks.length === 2 && withAuth.length === 2, `D1 两处写标记文件都带上 authMethod（实际 ${withAuth.length}/${blocks.length}）`)
  check(!blocks.some((b) => /password/i.test(b)), 'D2 标记文件仍绝不写入口令')
}

// ---------------------------------------------------------------------------
console.log('E. 终端 wrapper：kerberos 分支 + 旧标记文件向后兼容')
// ---------------------------------------------------------------------------
const marker = 'const wrapperJs = ['
const wStart = src.indexOf(marker)
if (wStart < 0) throw new Error('wrapperJs 数组字面量未找到')
const wEndMarker = '].join("\\n");'
const wEnd = src.indexOf(wEndMarker, wStart)
if (wEnd < 0) throw new Error('wrapperJs 结尾未找到')
const wrapperLiteral = src.slice(wStart + marker.length - 1, wEnd + 1)
const wrapperText = new Function('return ' + wrapperLiteral)().join('\n')
new Function(wrapperText) // 生成的脚本本身必须是合法 JS

const RUNNER = `
const Module = require('node:module');
const fs = require('node:fs');
const [target, cwdDir, capture] = process.argv.slice(2);
const orig = Module._load;
Module._load = function (request) {
  if (request === 'child_process' || request === 'node:child_process') {
    return {
      spawn(bin, args, opts) {
        fs.appendFileSync(capture, JSON.stringify({ bin, args }) + '\\n');
        return { on() {} };
      }
    };
  }
  return orig.apply(this, arguments);
};
process.chdir(cwdDir);
require(target);
`
function runWrapper(connInfo) {
  const dir = mkdtempSync(join(tmpdir(), 'rssh-krb-wrapper-'))
  try {
    writeFileSync(join(dir, 'wrapper.js'), wrapperText, 'utf8')
    writeFileSync(join(dir, 'runner.cjs'), RUNNER, 'utf8')
    if (connInfo) writeFileSync(join(dir, '.remote-ssh.json'), JSON.stringify(connInfo), 'utf8')
    const capture = join(dir, 'capture.jsonl')
    writeFileSync(capture, '')
    execFileSync(process.execPath, [join(dir, 'runner.cjs'), join(dir, 'wrapper.js'), dir, capture], { stdio: ['ignore', 'pipe', 'pipe'] })
    return readFileSync(capture, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

{
  const spawns = runWrapper({ host: 'hpc.example.org', user: 'wujiaming.ai', port: 2222, authMethod: 'kerberos', keyPath: '', remotePath: '~/work' })
  check(spawns.length === 1, 'E1 只 spawn 一次（ssh）')
  const { bin, args } = spawns[0]
  check(bin.includes('ssh'), 'E2 spawn 的是 ssh')
  check(args.includes('-tt'), 'E3 带交互式通道')
  check(args.includes('GSSAPIAuthentication=yes'), 'E4 wrapper 为 kerberos 连接开启 GSSAPI')
  check(!args.includes('-i'), 'E5 不带 -i')
  check(!args.some((x) => typeof x === 'string' && x.startsWith('PreferredAuthentications=')),
    'E6 不限定认证顺序（票据过期时终端仍可回落到口令 / OTP）')
  check(args.includes('-p') && args.includes('2222'), 'E7 端口仍正确传入')
  check(args[args.length - 2] === 'wujiaming.ai@hpc.example.org', 'E8 目标 user@host 正确')
  check(args[args.length - 1].startsWith('cd "$HOME/work"'), 'E9 仍按 remotePath cd 到远程目录')
}

{
  // 旧标记文件没有 authMethod：带 keyPath 时仍必须走密钥（向后兼容）
  const spawns = runWrapper({ host: 'h', user: 'u', port: 22, keyPath: '/home/u/.ssh/id_ed25519', remotePath: '~/x' })
  const { args } = spawns[0]
  check(args.includes('-i') && args.includes('/home/u/.ssh/id_ed25519'), 'E10 旧标记文件（无 authMethod）仍推断为密钥认证')
  check(!args.includes('GSSAPIAuthentication=yes'), 'E11 旧密钥工作区不会被误加成 Kerberos')
}

// ---------------------------------------------------------------------------
console.log('F. 清单：peer 范围覆盖运行时 0.2.2-rc.5')
// ---------------------------------------------------------------------------
{
  for (const peer of ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-primitives']) {
    check(String(pkg.peerDependencies?.[peer] || '').includes('^0.2.2-rc.5'), `F 清单 ${peer} 显式覆盖 ^0.2.2-rc.5`)
  }
  check(pkg.version === '2.9.2', 'F2 版本号 2.9.2')
}

// ---------------------------------------------------------------------------
console.log('G. 客户端：设置项、提示文案与 ssh config 导入')
// ---------------------------------------------------------------------------
{
  check(/id: "kerberos", label: t\("settings\.kerberos"\)/.test(client), 'G1 认证方式选择器包含 kerberos 选项（Menu 数据行）')
  check(client.includes('settings.kerberosHint'), 'G2 选中 Kerberos 时展示票据提示')
  const zhKrb = (client.match(/"settings\.kerberos": "Kerberos \(GSSAPI\)"/g) || []).length
  check(zhKrb >= 2, `G3 zh / en 两套 locale 都有 settings.kerberos（实际 ${zhKrb}）`)
  check(/h\.gssapi && !h\.identityFile\) \? "kerberos" : "key"/.test(client),
    'G4 导入 ~/.ssh/config 时 GSSAPIAuthentication yes + 无 IdentityFile 的 Host 直接选 Kerberos')
}

// ---------------------------------------------------------------------------
console.log('H. ~/.ssh/config 解析：GSSAPIAuthentication 归属到具体 Host')
// ---------------------------------------------------------------------------
{
  const parseSrc = grab(src, 'function sshHostPatternMatches') + '\n' +
    grab(src, 'function sshConfigBlockApplies') + '\n' +
    grab(src, 'async function parseSshConfigBlocks') + '\n' +
    grab(src, 'async function parseSshConfigFile')
  const dir = mkdtempSync(join(tmpdir(), 'rssh-krb-sshcfg-'))
  try {
    const cfg = join(dir, 'config')
    writeFileSync(cfg, [
      'Host *',
      '  GSSAPIAuthentication yes',
      '  GSSAPIDelegateCredentials no',
      '',
      'Host devbox2',
      '  HostName 10.37.34.107',
      '  User wujiaming.ai',
      '',
      'Host devbox-sg',
      '  Hostname 10.251.254.29',
      '  User wujiaming.ai',
      '',
      'Host keyhost',
      '  HostName k.example.com',
      '  IdentityFile ~/.ssh/id_ed25519',
      '',
    ].join('\n'))
    const parseSshConfigFile = new Function(
      'readFile', 'expandSshPath',
      parseSrc + '\nreturn parseSshConfigFile;',
    )(readFileSync, (v) => String(v).replace(/^~/, '/home/u'))
    const hosts = await parseSshConfigFile(cfg, new Set())
    const dev2 = hosts.find((h) => h.name === 'devbox2')
    const sg = hosts.find((h) => h.name === 'devbox-sg')
    const key = hosts.find((h) => h.name === 'keyhost')
    check(dev2 && dev2.gssapi === true, 'H1 通配块 Host * 的 GSSAPIAuthentication yes 继承到具体 Host（devbox2）')
    check(sg && sg.gssapi === true && sg.hostName === '10.251.254.29', 'H2 同一份配置里的第二个 Kerberos Host 也被识别（devbox_sg）')
    check(key && key.identityFile && key.gssapi === true, 'H3 同时有 IdentityFile 的 Host 仍保留私钥信息（导入时优先 key）')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
console.log('I. klist 预检：只提示、不阻断')
// ---------------------------------------------------------------------------
{
  const probe = new Function('spawnImpl', grab(src, 'function probeKerberosTickets') + '\nreturn probeKerberosTickets(spawnImpl);')
  const fake = (code, out, err) => () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    setTimeout(() => {
      if (out) child.stdout.emit('data', out)
      if (err) child.stderr.emit('data', err)
      child.emit('close', code)
    }, 0)
    return child
  }
  const ok = await probe(fake(0, 'Principal: wujiaming.ai@BYTEDANCE.COM', ''))
  check(ok.ok === true && /BYTEDANCE\.COM/.test(ok.detail), 'I1 有票据 → ok:true 且带 Principal')

  const expired = await probe(fake(1, '', 'No credentials cache found (filename: /tmp/krb5cc_501)'))
  check(expired.ok === false && /No credentials cache found/.test(expired.detail), 'I2 无票据 → ok:false 且带 klist 原始信息')

  const broken = await probe(() => { throw new Error('spawn klist ENOENT') })
  check(broken.ok === false && /ENOENT|spawn klist/.test(broken.detail), 'I3 spawn 抛错时降级为提示，不抛异常')
}

// ---------------------------------------------------------------------------
console.log('J. 模型工具的内联连接参数支持 authMethod')
// ---------------------------------------------------------------------------
{
  check(/authMethod: \{ type: "string", enum: \["key", "kerberos"\]/.test(src),
    'J1 CONN_PARAMS 暴露 authMethod（key / kerberos），内联调用也能走票据')
  check(src.includes('authMethod: args.authMethod === "kerberos" ? "kerberos" : "key"'),
    'J2 内联 host/user 的 profile 会尊重 authMethod，而不是硬编码 key')
}

// ---------------------------------------------------------------------------
console.log('K. 设置页复用 DSH 共享 UI 原子（Button / Input / Menu / Switch / Checkbox）')
// ---------------------------------------------------------------------------
{
  for (const atom of ['Button', 'Input', 'Menu', 'Switch', 'Checkbox']) {
    check(client.includes('primitives.' + atom), `K1 设置页使用 primitives.${atom}`)
  }
  check(client.includes('function SettingsRow(') && client.includes('function SettingsGroup('),
    'K2 设置行/分组是按内置设置页的两栏行布局实现的')
  check(client.includes('h("div", { className: "rssh-ui-page" }'), 'K3 设置页渲染标准行布局容器（rssh-ui-page）')
  check(/Control: h\(UiButton, \{ variant: "outline", size: "sm"/.test(client) || client.includes('variant: "outline", size: "sm"'),
    'K4 行内动作复用 Button 的 outline/sm 变体')
  check(client.includes('primitives.IconChevronDownOutlineRegular') && client.includes('className: "rssh-ui-selector"'),
    'K5 选择器复用内置设置行的「按钮 + 下箭头 + Menu」交互')
  check(!/h\("div", \{ className: "rssh-card" \}/.test(client), 'K6 设置页不再渲染自绘卡片（rssh-card 仅留给其它面板）')
  check(client.includes('title: t("settings.deleteConnTitle")') && client.includes('className: "rssh-ui-danger"'),
    'K7 删除连接/工作区先弹确认（危险色按钮），不再一点就删')
  check(/setTestMsg\(\{ id: p\.id/.test(client) && /wsMsg\.id === ws\.id/.test(client),
    'K8 测试/同步/保存的结果贴着对应行显示，不再堆在页尾')
  check(client.includes('rssh-ui-import-list') && client.includes('"data-modal-autofocus": "true"'),
    'K9 导入弹窗有滚动上限，取消按钮获得初始焦点')
  check(client.includes('"aria-labelledby": titleId') && client.includes('titleId: labelId'),
    'K10 分组标题与输入框都有可访问名称关联（h3 + aria-labelledby）')
}

// ---------------------------------------------------------------------------
console.log('L. 多连接下同名远程目录的工作区标题消歧')
// ---------------------------------------------------------------------------
{
  const titleFn = new Function(grab(src, 'function workspaceTitleFor') + '\nreturn workspaceTitleFor;')()
  const pA = { name: 'devbox-krb' }
  const pB = { name: 'devbox-sg-krb' }
  const prefs = { workspaces: [{ id: 'w1', title: 'tmp' }] }
  check(titleFn({ remotePath: '/tmp' }, pB, null, prefs) === 'devbox-sg-krb:tmp',
    'L1 第二条同名工作区带上连接名（devbox2/sg 都开 /tmp 时不再两个 "tmp"）')
  check(titleFn({ remotePath: '/tmp' }, pB, { id: 'w1', title: 'tmp' }, prefs) === 'tmp',
    'L2 复用已有工作区时保持原标题（不因重名改动用户既有条目）')
  check(titleFn({ title: '自定义', remotePath: '/tmp' }, pB, null, prefs) === '自定义',
    'L3 显式自定义标题优先，不被消歧覆盖')
  check(titleFn({ remotePath: '~' }, pA, null, { workspaces: [] }) === 'devbox-krb:~',
    'L4 ~ 仍用「连接名:路径」')
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
