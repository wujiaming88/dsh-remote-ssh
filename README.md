# @wujiaming88/dsh-remote-ssh

[English](./README_EN.md)

在 DSH 里直接开发远端机器：SSH 连接、远端工作区、远端的文件与终端，以及把 Claude Code / Codex 这类 coding agent 接到远端执行——通过工作区原生的「新会话 / ⌘N → SSH」创建会话后，切到「**远端 Agent**」Tab 即可对话。

## 功能

### SSH 与工作区

- **三种认证**：私钥、**Kerberos（GSSAPI，免密钥/口令）**、密码；支持 ProxyJump、`~/.ssh/config` 一键导入
- **多连接并存**：同一页面同时管理多台机器；同名远端目录会自动用「连接名:路径」区分工作区标题
- **远端工作区**：选择远端目录即注册为原生 DSH 工作区；会话的 `@` 引用列远端文件
- **文件与终端**：内置「文件」页签直接 SSH 读写远端文件（配合 `dsh-better-sidebar`）；「终端」页签自动 SSH 到工作区目录
- **同步与写回**：整树/子路径同步、上传下载、写回护栏（远端新鲜度检查）

### ACP Chat（会话内常驻 View）

通过工作区原生的「**新会话 / ⌘N**」→ 在 DSH 工作区选择器里选「**SSH**」→ 远端工作区创建会话，
然后在会话顶部切到「**远端 Agent**」Tab。这个 View 绑定当前 DSH 会话（Host 的 `dshSessionId`）：
挂载时 `acpList({dshSessionId})`，有记录就 `acpResume`；没有记录则在 View 内显示 setup。

1. setup 会优先使用当前 DSH 会话所属的**远端工作区**（`useWorkspaces.sessionIds` + `mirrorPath` 推断），也可改选连接/工作区
2. 选 agent（Claude Code / Codex）与权限（Accept edits / Plan / Bypass）→「开始会话」（`acpStart` 带 `dshSessionId`）

> 建区时也可在「添加工作区 → SSH 远程」里直接选「会话 Agent」（DSH 默认 / Claude Code / Codex）；之后新会话打开「远端 Agent」View 会自动预选，不用每次重选。
3. 之后切走再切回、或刷新页面，View 会自动恢复会话；**切换 View 不会结束会话**

View 内提供：Markdown 正文、工具卡片（DiffBlock / TerminalBlock / ReadBlock）、原生事件/子 Agent 卡片、模型 / 思考级别 / 模式切换（`acpSetConfig` / `acpSetMode`）、
运行中 Steer（`acpSteer`，立即上屏）、停止（`acpCancel`，只停当前 turn）、HITL 权限卡片（按 adapter 的 options 原样回传 optionId，不自动批准；Bypass 由 Host 自动）、
会话列表与恢复（`acpList` / `acpResume`）、结束会话（`acpClose`，需确认）。

- **文件**：View 顶部「文件」打开现有远端文件面板（listDir / readFile / 上传 / 下载），文本与图片可预览，默认会话目录 `remotePath`
- **命令 / skill**：ACP `commands` 做搜索 + 分组 + 点击插入 composer；支持 `/name`、Codex `/skills`，显示 description 与 input hint；发送后就是普通消息
- **退出**：没有 Modal 壳；切 View/刷新不调用 `acpClose`，只有「结束会话」会移除记录

Host 侧：本地 ACP adapter（Claude Code / Codex）+ 生成的 SSH wrapper 驱动远端 agent，事件以 NDJSON 流式返回。

- **端点**：`acpAgents` / `acpStart` / `acpPrompt`（NDJSON）/ `acpSteer` / `acpSetConfig` / `acpSetMode` / `acpPermission` / `acpCancel` / `acpResume` / `acpClose` / `acpList` / `acpState`
- **启动**：`acpStart({profileId, agent, mirrorCwd, remotePath?, permission?, dshSessionId?})`；同一 `dshSessionId` 配置一致时 Host 复用现有会话
- **事件**：`session` / `text` / `thought` / `tool_call` / `tool_call_update` / `plan` / `commands` / `config` / `mode` / `permission` / `permission_resolved` / `notice` / `usage` / `stop` / `error`，以及原生/子 Agent 事件：`subagent` / `subagent_update` / `state` / `session_message` / `terminal` / `suggestions`；每条都带 `native`/`nativeMeta`
- **权限**：`session/request_permission` 挂起为 `permission` 事件，`acpPermission({id, requestId, optionId})` 原样回传 adapter 的 optionId；不自动批准（Bypass 由 Host）
- **认证**：私钥 / Kerberos；password 明确报错。wrapper 落在 `~/.dsh/remote-ssh/acp/`，不落盘口令

### 模型工具

`remote_ssh_*` 共 13 个：`profiles` / `exec` / `kill` / `ls` / `cat` / `write` / `grep` / `glob` / `mkdir` / `delete` / `move` / `sync` / `push`。在远程工作区会话里可省略连接参数；命令有超时、取消与会话池复用。

## 安装

```bash
# npm（发布后）
dsh plugin --profile <name> add @wujiaming88/dsh-remote-ssh@2.12.1

# 或 GitHub
dsh plugin --profile <name> add github:wujiaming88/dsh-remote-ssh
```

- 安装后重启 DSH
- 「文件」页签的远端读写依赖 `dsh-better-sidebar`；不装也能用设置页、模型工具、终端与 Agent 面板（TUI/Shell 需要远端 tmux）

## 快速开始

1. **设置 → 远程连接**：新增连接（主机 / 端口 / 用户 / 认证方式）→「测试连接」；已配置 `~/.ssh/config` 可一键导入
   - Kerberos：先在终端 `kinit <主名>`，认证方式选 **Kerberos (GSSAPI)**
2. **添加工作区 → 选择远程目录**：选择连接并浏览远端目录，创建原生工作区
3. 进入工作区：用「文件」页签改文件，「终端」页签直接落在远端目录
4. **新会话 / ⌘N → SSH → 远端工作区**：创建会话后切到「远端 Agent」Tab；View 会优先带出当前远端工作区，选 agent/权限后开始

## Agent 会话怎么用

- **创建**：新会话 / ⌘N → SSH → 远端工作区 → 切到「远端 Agent」Tab → 确认连接/工作区 → 开始
- **对话**：Enter 发送、Shift+Enter 换行；turn 运行时发送按钮变成「追加」（Steer），消息立即上屏，不等待 turn 结束
- **权限**：工具请求权限时底部出现权限卡片，按 adapter 的选项允许一次 / 总是允许 / 拒绝，或「忽略」回传 cancelled；`Bypass` 模式由 Host 自动批准
- **模型 / 思考级别 / 模式**：View 顶部下拉切换，立即作用于当前会话
- **停止 / 结束**：`停止` 只取消当前 turn；`结束会话` 需确认，移除会话（之后不能恢复）；切 View/刷新只影响渲染，会话保留并可 `resume`
- **文件 / 命令**：顶部「文件」浏览远端目录；命令按钮打开搜索+分组面板，点击 `/name` 或 `/skills` 插入 composer
- 旧面板的会话记录仍在 `~/.dsh/remote-ssh/agent-sessions.json`；TUI/Shell 的远端进程在 tmux 里，可在 SSH 终端用 `tmux attach -t dsh-rs-*` 接管

### 取消、超时与 kill

按停止键或调用 `remote_ssh_kill` 会尽力给远端进程组发 `SIGHUP`；`remote_ssh_exec` 的 `timeoutMs` 只是**本地等待预算**，到点只放弃等待、**不会终止远端命令**（需要远端硬时限请用远端 `timeout` 命令）。池化会话在超时后自动丢弃，下次调用会重建连接。

## 兼容性

- 实测 DSH：`0.2.2-rc.5`（peer 范围显式覆盖 `^0.2.2-rc.5`）
- 可选：`dsh-better-sidebar`（「文件」页签的远端读写与编辑器）
- 远端：标准 sshd；`claude` / `codex` 需已安装并登录（ACP Chat）。旧 TUI/Shell 面板另需 `tmux`；git（worktree 功能）

## 故障排查

| 现象 | 处理 |
| --- | --- |
| Kerberos 认证失败 | `klist` 确认票据有效；`kinit <主名>`；核对用户名与主名一致；确认远端 sshd 开启 GSSAPIAuthentication |
| 测试连接报私钥不存在 | 修正 `keyPath`，或清空它依赖 ssh-agent / `~/.ssh/config` |
| 「探测」找不到 agent | 先在 SSH 终端完成 `claude` / `codex` 首次登录；再点一次「探测」（覆盖 PATH、登录 shell 与常见安装目录） |
| 看不到「远端 Agent」Tab | 确认会话来自 SSH 远端目录；刷新页面，或在会话 View 栏切到该 Tab（`conversation.view`） |
| 「文件」页签不能读远端 | 安装 `dsh-better-sidebar`；独立安装时该页签会降级 |
| 命令超时 | `remote_ssh_exec` 的 `timeoutMs` 是本地等待预算；长任务用 `timeoutMs: 0`，远端硬限制用 `timeout` |

## 许可证

[MIT](./LICENSE)

---

原始仓库：[dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
