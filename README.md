# @wujiaming88/dsh-remote-ssh

[English](./README_EN.md)

在 DSH 里直接开发远端机器：SSH 连接、远端工作区、远端的文件与终端，以及把 Codex / Claude Code / Pi 这类 coding agent 放到远端机器的 tmux 里，用 **Chat / TUI / Shell** 三种方式创建和管理会话。

## 功能

### SSH 与工作区

- **三种认证**：私钥、**Kerberos（GSSAPI，免密钥/口令）**、密码；支持 ProxyJump、`~/.ssh/config` 一键导入
- **多连接并存**：同一页面同时管理多台机器；同名远端目录会自动用「连接名:路径」区分工作区标题
- **远端工作区**：选择远端目录即注册为原生 DSH 工作区；会话的 `@` 引用列远端文件
- **文件与终端**：内置「文件」页签直接 SSH 读写远端文件（配合 `dsh-better-sidebar`）；「终端」页签自动 SSH 到工作区目录
- **同步与写回**：整树/子路径同步、上传下载、写回护栏（远端新鲜度检查）

### 远程 Agent（2.7.0）

右侧栏新增「**远程 Agent**」页签，自动识别远端安装的 agent 并管理会话：

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

### 模型工具

`remote_ssh_*` 共 13 个：`profiles` / `exec` / `kill` / `ls` / `cat` / `write` / `grep` / `glob` / `mkdir` / `delete` / `move` / `sync` / `push`。在远程工作区会话里可省略连接参数；命令有超时、取消与会话池复用。

## 安装

```bash
# npm（发布后）
dsh plugin --profile <name> add @wujiaming88/dsh-remote-ssh@2.7.2

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
4. 打开 **右侧栏 → `+` → 远程 Agent**（或 设置 → 远程连接 → 打开 Agent 面板）：选连接 → 刷新探测 → 选模式（Chat / TUI / Shell）与目录 → 新建会话

## Agent 会话怎么用

- **Chat**：底部输入框发消息，回复以消息气泡显示；权限档位在创建时选择
- **TUI**：底部输入框发文本，右侧「按键」菜单发方向键/Esc/Ctrl-C；适合需要完整交互界面的 agent
- **Shell**：普通登录 shell
- 会话记录保存在本机 `~/.dsh/remote-ssh/agent-sessions.json`；TUI/Shell 的远端进程在 tmux 里，可在 SSH 终端用 `tmux attach -t dsh-rs-*` 接管

### 取消、超时与 kill

按停止键或调用 `remote_ssh_kill` 会尽力给远端进程组发 `SIGHUP`；`remote_ssh_exec` 的 `timeoutMs` 只是**本地等待预算**，到点只放弃等待、**不会终止远端命令**（需要远端硬时限请用远端 `timeout` 命令）。池化会话在超时后自动丢弃，下次调用会重建连接。

## 兼容性

- 实测 DSH：`0.2.2-rc.5`（peer 范围显式覆盖 `^0.2.2-rc.5`）
- 可选：`dsh-better-sidebar`（「文件」页签的远端读写与编辑器）
- 远端：标准 sshd + `tmux`（Agent TUI/Shell）；git（worktree 功能）

## 故障排查

| 现象 | 处理 |
| --- | --- |
| Kerberos 认证失败 | `klist` 确认票据有效；`kinit <主名>`；核对用户名与主名一致；确认远端 sshd 开启 GSSAPIAuthentication |
| 测试连接报私钥不存在 | 修正 `keyPath`，或清空它依赖 ssh-agent / `~/.ssh/config` |
| 远端 Agent 显示不可用 | 安装 `tmux`；agent 首次登录需先在 SSH 终端完成 |
| Agent 面板看不到 | 刷新页面；入口在右侧栏 `+` 引导页或设置页「打开 Agent 面板」 |
| 「文件」页签不能读远端 | 安装 `dsh-better-sidebar`；独立安装时该页签会降级 |
| 命令超时 | `remote_ssh_exec` 的 `timeoutMs` 是本地等待预算；长任务用 `timeoutMs: 0`，远端硬限制用 `timeout` |

## 许可证

[MIT](./LICENSE)

---

原始仓库：[dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
