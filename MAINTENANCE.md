# dsh-remote-ssh 维护手册（fork: wujiaming88）

本仓库是 `@wujiaming88/dsh-remote-ssh`，在 2.4.48 的基础上加入
**Kerberos / GSSAPI 认证**（2.5.0）与**设置页复用 DSH 内置设置 UI**（2.6.0）。本文件只记录本 fork 的维护方式与
踩过的硬规则，不含任何账号、密钥或 token。

## 0. 当前状态

| 项目 | 值 |
| --- | --- |
| 包名 / Host 导出 `name` / Client loader `id` | `@wujiaming88/dsh-remote-ssh` |
| 版本 | `2.6.2` |
| settings 命名空间 | `dsh-remote-ssh`（**故意不带作用域**：改包名不丢已保存的连接与工作区） |
| 仓库 | https://github.com/wujiaming88/dsh-remote-ssh |
| 依赖 DSH 线 | `^0.1.0-rc.6 || ^0.1.5-rc.1 || ^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.1-rc.1 || ^0.2.2-rc.5` |

## 1. 本地开发

```bash
node tests/run-all.mjs                 # 全量断言（46 个文件）
node tests/run-all.mjs --filter=kerberos
node --check lib/index.js && node --check lib/client.js
```

`lib/index.js` / `lib/client.js` 是**已构建**的成品（无 TS 源码、无打包步骤），改完直接生效。测试大量使用
「按函数名提取源码 + `new Function` 实例化」的方式，所以新增模块级函数时保持**只依赖入参**，便于独立测试。

## 2. 打包与本地安装

```bash
npm pack --cache /tmp/npmcache                                  # 生成 wujiaming88-dsh-remote-ssh-x.y.z.tgz（文件名随包名）
# 用 DSH 的 plugin_manager 安装（或 dsh plugin --profile desktop add file:<tgz>）
```

安装进 profile 后，`~/.dsh/profiles/<profile>/package.json` 的依赖会写成 `file:<tgz 绝对路径>`，因此**不要把 tgz
只放在临时目录**；换机器/重装前先确认该路径仍存在。卸载用 `plugin_manager` 的 `remove_bundle`。

## 3. 与其它实现同步

如需跟踪其它实现，自行添加 remote 后合并；本仓库不内置外部仓库地址。合并时重点看三处：`sshArgv`（认证参数）、
`SettingsSection`（设置页 UI）、`cordis.patch.yml`（bundle insert 与 terminal-controller 的 shell 覆盖）。
合并进来的 `package.json` 作用域必须改回 `@wujiaming88`。

## 4. 硬规则与历史教训

### 4.1 cordis 注入没有 optional

客户端 `exports.inject` 里列出的**任何一个**服务缺失，纤维就整体停在 pending —— cordis 的
`Fiber._refresh()` 逐键查 store，任一缺失即 `epoch = INACTIVE`，`inject` **没有 optional 之分**。
所以 better-sidebar 只能走 `ctx.inject(["betterSidebar"], cb)` 子纤维软注入；硬列进 `inject` 会让没装它的用户
前端停在 `pending (waiting for service: betterSidebar)`。

### 4.2 前端 A/B 验证配方

- `window.__DSH_BOOT_READY__` **不能当判据**：它在失败时也可能为真；要看真实 DOM / 真实报错。
- 无头浏览器复测要 `Network.setCacheDisabled(true)`，否则旧 bundle 会伪装成「新代码没生效」。
- 客户端 slot 是否注册成功，用 `cordis_inspect_query`（client / Slots）看 live Slot 树，比读源码可靠。

### 4.3 认证失败诊断（issue #19）

远端登录横幅（二维码 ASCII 画）在**认证之前**打印，会把真正的证据挤出错误截断窗口。错误提示必须：
① 一手证据优先（`Identity file … not accessible` 这类 Warning 要保留）；② 按认证方式归因（key / password /
kerberos 各说各的，别让 Kerberos 用户去改 `keyPath`）；③ 登录横幅降噪。

### 4.4 open.external 与 openWith.sshHost

`sig` 的 `open.external` 端点要用真实安装的签名对拍；`openWith.sshHost` 是把它接到远程工作区的坑（远端
ssh 主机信息不在本地路由里）。升级 better-sidebar 后必须重新对拍所有 `fs.*` / `git.*` 路由（0.25.0 增加 6 个
端点、0.28.0 改 dispatch），**漏注册的端点会静默回落到本地镜像目录**。

### 4.5 设置页 UI

设置页的控件必须复用 `@deepseek-ai/dsh-client-ui-primitives`（`Button` / `Input` / `Menu` / `Switch` /
`Checkbox` / `Modal`），行布局照内置设置页（左标题+说明 / 右控件 / 0.5px 分隔线）。不要自绘 input/select/button：
观感与交互会和内置页不一致，且原生 `<select>` 在下拉里拿不到 DSH 的键盘与焦点行为。

## 5. 发布

1. 改 `package.json` 的 `version`，在 `CHANGELOG.md` 顶部加对应段落；
2. `node tests/run-all.mjs`（失败集合必须与改动前的基线一致）；
3. `npm pack` 后先本地安装验证；
4. `git tag vX.Y.Z && git push origin main --tags`；
5. 如发布 npm：`npm publish`（scope 需有发布权限；`publishConfig.access = "public"` 已配）。
