# @wujiaming88/dsh-remote-ssh

[English](./README_EN.md)

在 DSH 里直接开发远端机器：SSH 连接、远端工作区、远端的文件与终端，以及把 Claude Code / Codex 这类 coding agent 接到远端执行——在「新建会话」页点「**远端 Agent**」即可用 ACP Chat 对话。

## 功能

### SSH 与工作区

- **三种认证**：私钥、**Kerberos（GSSAPI，免密钥/口令）**、密码；支持 ProxyJump、`~/.ssh/config` 一键导入
- **多连接并存**：同一页面同时管理多台机器；同名远端目录会自动用「连接名:路径」区分工作区标题
- **远端工作区**：选择远端目录即注册为原生 DSH 工作区；会话的 `@` 引用列远端文件
- **文件与终端**：内置「文件」页签直接 SSH 读写远端文件（配合 `dsh-better-sidebar`）；「终端」页签自动 SSH 到工作区目录
- **同步与写回**：整树/子路径同步、上传下载、写回护栏（远端新鲜度检查）

### 远程 Agent（2.7.0 旧面板）

> 2.8.0 起入口改为「新建会话」页的 **ACP Chat**；右侧栏「远程 Agent」页签与设置页「打开 Agent 面板」按钮已移除。下列 TUI / Shell / 无头 Chat 代码仍保留在仓库里，但当前 UI 不再注册入口。

2.7.0 的右侧栏面板自动识别远端安装的 agent 并管理会话：

| 能力 | 说明 |
| --- | --- |
| 探测 | 一次 SSH 探测 `codex` / `claude` / `pi`、版本、`tmux`、`git`；缺失时给出安装提示 |
| Chat | 无头结构化对话：Claude `-p --output-format json`、pi `-p --mode json`、codex `exec --json`，按 CLI session id 续聊，消息落盘 |
| TUI | agent 交互界面跑在远端 tmux（`dsh-rs-*`），面板回看输出、转发输入；断线/重启不丢会话 |
| Shell | 远端登录 shell，也在 tmux 中 |
| 权限 | 每个 Chat 会话可选 `Plan`（只读规划）/ `Accept edits`（默认）/ `Bypass`（全自动，危险） |
| 会话管理 | 列表、切换、按键（方向键/Esc/Ctrl-C）、结束会话 |
| 文件 | 面板内浏览远端目录、文本/图片预览、流式上传、下载 |
| Worktree | 列出 `git worktree`，或按分支创建新 worktree 作为会话目录 |

Agent 首次使用需先在远端完成登录（例如 `claude` / `pi` 的首次授权），TUI 会话需要远端有 `tmux`。

### ACP Chat

在「**新建会话**」页的选项行点「**远端 Agent**」，打开一个大尺寸 DSH Modal：

1. 选连接配置 →「探测」得到远端 Claude Code / Codex（版本来自 `acpAgents`）
2. 选远端工作区（自动带出 `mirrorPath` / `remotePath`）或手填 `mirrorCwd`
3. 选 agent 与权限（Accept edits / Plan / Bypass）→「开始会话」（`acpStart`）

Chat 内提供：Markdown 正文、工具卡片（DiffBlock / TerminalBlock / ReadBlock）、计划与命令、模型 / 思考级别 / 模式切换（`acpSetConfig` / `acpSetMode`）、
运行中 Steer（`acpSteer`，立即上屏）、停止（`acpCancel`）、HITL 权限卡片（按 adapter 的 options 原样回传 optionId，不自动批准；Bypass 由 Host 自动）、
会话列表与恢复（`acpList` / `acpResume`）、结束会话（`acpClose`）。Esc 关闭 Modal；运行中会先确认。

Host 侧：本地 ACP adapter（Claude Code / Codex）+ 生成的 SSH wrapper 驱动远端 agent，事件以 NDJSON 流式返回。

- **端点**：`acpAgents` / `acpStart` / `acpPrompt`（NDJSON）/ `acpSteer` / `acpSetConfig` / `acpSetMode` / `acpPermission` / `acpCancel` / `acpResume` / `acpClose` / `acpList` / `acpState`
- **启动**：`acpStart({profileId, agent, mirrorCwd, remotePath?, permission?})`；`mirrorCwd` 必须是已存在的本地镜像目录，`remotePath` 可由其中的 `.remote-ssh.json` 提供
- **事件**：`session` / `text` / `thought` / `tool_call` / `tool_call_update` / `plan` / `commands` / `config` / `mode` / `permission` / `permission_resolved` / `notice` / `usage` / `stop` / `error`；每条都带 `agent`、`sessionId`、`model`、`mode` 元数据
- **工具/文件**：`tool_call` 内提供 `content`、`diffs`、`terminals`、`locations`、`rawInput/rawOutput`，可直接喂给 DiffBlock / TerminalBlock
- **配置**：`session/new` 的 `models` / `modes` / `reasoning` / `configOptions` 归一化后返回；`acpSetConfig({id, configId, value})` 调 `session/set_config_option`，`acpSetMode({id, modeId})` 调 `session/set_mode`
- **权限**：`session/request_permission` 挂起为 `permission` 事件（含 requestId/tool/options），`acpPermission({id, requestId, optionId})` 原样回传 adapter 的 allow once/always/reject optionId
- **Steer**：turn 进行中 `acpSteer({id, text})`，优先 `_session/steering` 注入当前 turn，不支持时排队
- **认证**：私钥 / Kerberos；password 明确报错。wrapper 落在 `~/.dsh/remote-ssh/acp/`，不落盘口令
- **可选环境变量**：`DSH_ACP_SDK_PATH` / `DSH_ACP_ADAPTER_ROOT` 指向已安装依赖；`DSH_ACP_PROMPT_TIMEOUT_MS` 控制单 turn 超时

### 模型工具

`remote_ssh_*` 共 13 个：`profiles` / `exec` / `kill` / `ls` / `cat` / `write` / `grep` / `glob` / `mkdir` / `delete` / `move` / `sync` / `push`。在远程工作区会话里可省略连接参数；命令有超时、取消与会话池复用。

## 安装

```bash
# npm（发布后）
dsh plugin --profile <name> add @wujiaming88/dsh-remote-ssh@2.8.0

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
4. **新建会话 → 远端 Agent**：选连接 →「探测」→ 选远端工作区 → 选 agent / 权限 →「开始会话」；之后在 Modal 里对话、追加（Steer）、停止或恢复会话

## Agent 会话怎么用

- **创建**：新建会话 → 远端 Agent → 选连接 →「探测」→ 选远端工作区（或手填 `mirrorCwd`）→ 选 agent / 权限 → 开始
- **对话**：Enter 发送、Shift+Enter 换行；turn 运行时发送按钮变成「追加」（Steer），消息立即上屏，不等待 turn 结束
- **权限**：工具请求权限时底部出现权限卡片，按 adapter 的选项允许一次 / 总是允许 / 拒绝，或「忽略」回传 cancelled；`Bypass` 模式由 Host 自动批准
- **模型 / 思考级别 / 模式**：Chat 顶部下拉切换，立即作用于当前会话
- **停止 / 结束**：`停止` 取消当前 turn；`结束会话` 移除会话（之后不能恢复）；关闭 Modal 只停止运行中的 turn，会话保留在「已保存的会话」里可恢复
- **文件**：工具卡片直接用 DiffBlock / TerminalBlock / ReadBlock 展示改动与输出；Chat 顶部「文件」可浏览远端目录
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
| 看不到「远端 Agent」按钮 | 刷新页面；入口在「新建会话」页（`conversation.hero.options`） |
| 「文件」页签不能读远端 | 安装 `dsh-better-sidebar`；独立安装时该页签会降级 |
| 命令超时 | `remote_ssh_exec` 的 `timeoutMs` 是本地等待预算；长任务用 `timeoutMs: 0`，远端硬限制用 `timeout` |

## 许可证

[MIT](./LICENSE)

---

原始仓库：[dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
