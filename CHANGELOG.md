# Changelog

本文件记录本仓库的版本。版本号与 `package.json` 一致。

## [2.7.1] — 2026-11-23

### 文档与仓库清理

- 重写 README / README_EN：只保留功能、安装、快速开始、Agent 使用、兼容性与故障排查，底部保留原始仓库链接
- CHANGELOG 只保留本仓库 2.5.0–2.7.0 历史
- 删除继承自原仓库的非功能内容：`MAINTENANCE.md`、旧截图与 `screenshots.json`、一次性验证脚本、上游 CI 工作流
- 回归测试中只针对已删除文档/历史 issue 的断言一并移除

## [2.7.0] — 2026-11-23

### 新：远程 Agent 面板

- 右侧栏新增「远程 Agent」页签（原生 `sidebarRightTabs` 扩展），识别远端 `codex` / `claude` / `pi` 及 `tmux` / `git`
- **Chat**：无头结构化对话（Claude `-p --output-format json`、pi `-p --mode json`、codex `exec --json`），按 CLI session id 续聊，消息落盘
- **TUI**：agent 交互界面跑在远端 tmux；面板回看输出、转发输入与按键，断线/重启不丢会话
- **Shell**：远端登录 shell（tmux）
- **权限**：Chat 会话可选 Plan / Accept edits / Bypass，映射到各 CLI 参数
- **文件**：远端目录浏览、文本/图片预览、流式上传、下载
- **Worktree**：列出现有 worktree，或按分支创建并作为会话目录

## [2.6.2] — 2026-11-23

- 多个连接打开同名远端目录时，工作区标题自动消歧为「连接名:路径」

## [2.6.1] — 2026-11-23

- 修复 `~/.ssh/config` 通配块（`Host *` / `Host 10.*`）里的 `GSSAPIAuthentication` 未被导入、导致 Kerberos 主机被建成 key 认证的问题
- key/password 连接遇到服务端只提供 `gssapi-*` 时，提示改用 Kerberos (GSSAPI)

## [2.6.0] — 2026-11-23

- 设置页复用 `@deepseek-ai/dsh-client-ui-primitives`，行布局对齐 DSH 内置设置页
- 包名/插件 id 改为 `@wujiaming88/dsh-remote-ssh`；settings 命名空间保持 `dsh-remote-ssh`
- 删除确认、局部结果反馈、导入弹窗滚动与可访问性修复

## [2.5.0] — 2026-11-20

- 新增 **Kerberos / GSSAPI** 认证：连接、文件、模型工具、终端、同步全链路
- `GSSAPIAuthentication=yes` + `BatchMode=yes` + `PreferredAuthentications=gssapi-with-mic`；tty 终端保留回落
- `~/.ssh/config` 导入识别 GSSAPI；新增 `authMethod` 内联工具参数与 `klist` 预检

---

本仓库基于 `dsh-remote-ssh` 2.4.48 派生，2.4.x 及更早的历史不再保留。
