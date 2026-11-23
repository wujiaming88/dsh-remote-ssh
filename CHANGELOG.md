# Changelog

本文件记录本仓库的版本。版本号与 `package.json` 一致。

## [2.13.0] — 2026-11-23

### 修：新会话空白页

- 不再用全局 body 标记隐藏原生 composer / 对话 Tab；只有在 `.ra-acp-view` 真正挂载时才隐藏
- 自动 ACP 启动后只负责切到「远端 Agent」Tab；切换失败时保留原生 Chat，不会再出现空白页
- 去掉启动期间提前隐藏 composer 的逻辑，避免 ACP 未挂载时页面无输入区

## [2.12.7] — 2026-11-23

### 修：composer 输入框焦点框

- textarea / 命令按钮 focus 时去掉浏览器/D SH 全局的蓝色 outline 与 box-shadow，保持卡片内无边框输入

## [2.12.6] — 2026-11-23

### 修：composer 样式确实没生效

- 2.12.3/2.12.4 的 composer 多条 CSS 字符串缺少 `+` 拼接符，导致 grid/textarea/命令按钮样式根本未注入
- 补上拼接符后，工具行 grid、圆形发送按钮、无边框 textarea、命令按钮样式才会生效
- 配置菜单的 selector 覆盖范围从 `.ra-acp-compose-foot` 修正为 `.ra-acp-compose-bar`

## [2.12.5] — 2026-11-23

### 修：空白新会话也能识别当前远端工作区

- 新会话尚未关联 sessionId 时，从 hero 主区域可见的 workspace 标题反查远端工作区，继续自动启动 ACP
- 避免点工作区「新会话」后停留在原生 composer；侧边栏（x<260）不参与反查，避免选错工作区

## [2.12.4] — 2026-11-23

### 修：composer 回归与空状态 key

- 空状态快捷提问补上 `acp.quickExplain/Test/Changes` 文案，不再显示原始 key
- textarea 改回原生 textarea，去掉 primitives.Textarea 自带的第二层边框
- composer 工具行改 grid，发送按钮固定在右侧，不再被配置项挤到下一行左侧
- Fast mode / Ultracode 等高级配置默认收进「更多」，主行只留模型/思考级别/模式

## [2.12.3] — 2026-11-23

### 调：composer 布局收敛

- 输入框独占第一行，工具行统一到底部：`+`、命令、模型/思考/模式在左，用量/停止/发送在右
- 命令从大按钮改为紧凑文本按钮；用量格式缩为 `12.2k / 200k · $0.0046`
- 提示语收进卡片底部，不再单独一行露出；textarea 不再显示 resize 手柄

## [2.12.2] — 2026-11-23

### 修：旧工作区的新会话也默认 ACP

- 旧工作区没有 Agent 偏好时，默认用上次使用的 agent（否则 Claude）自动启动 ACP，不再闪出原生 composer
- 建区时显式选「DSH 默认」会记录 `agent:"dsh"`，这类工作区仍保留原生 Chat
- 开始会话时记录全局 lastAgent，后续新工作区/旧工作区都复用

## [2.12.1] — 2026-11-23

### 修：新会话不再闪现原生 composer

- 工作区有 Agent 偏好、ACP 正在启动时，提前隐藏原生 composer 与原生「对话」Tab
- 启动成功由 data-acp-session 接管；失败则恢复原生 Chat，不再留下空白输入区

## [2.12.0] — 2026-11-23

### 调：整体向 DSH 原生会话布局靠拢

- 去掉消息区的边框/底色，transcript 按 DSH 内容宽度居中，间距改为 10px
- 顶部 agent 状态行改为带细分隔线的工具栏，不再是独立卡片
- composer 保持 2.11.1 的圆形发送/加号、底部无边框配置菜单
- 命令入口收进 composer 底部，去掉命令 chip 行

## [2.11.1] — 2026-11-23

### 调：composer 贴近 DSH 原生样式

- 发送改为圆形主按钮 + Send 图标，左侧 `+` 改为圆形文件按钮
- 命令入口从 composer 上方的 6 个斜杠 chip 收到 composer 底部工具行，只保留「命令 (N)」
- 模型/思考级别/模式等配置变成 composer 底部无边框文本菜单，不再是一排大 pill
- 提示文案移到 composer 卡片下方；卡片圆角/内边距按 DSH 输入区调整

## [2.11.0] — 2026-11-23

### 新：建区选过 Agent 后，新会话默认进入 ACP

- 新会话创建后，若该工作区有 ACP Agent 偏好，自动 `acpStart` 并切到「远端 Agent」Tab，不再先停在原生 Chat
- 已有 ACP 会话时只切 Tab，不重复 start；失败则回退到原生 Chat，可手动重试
- 结束 ACP 会话后原生 Chat 恢复

## [2.10.0] — 2026-11-23

### 新：建区时选择 Agent，后续会话自动预选

- 「添加工作区」的 SSH 远程模式增加「会话 Agent」：DSH 默认 / Claude Code / Codex
- 选择结果按 profileId + remotePath 记住；新建会话打开「远端 Agent」View 时自动预选 agent 与权限
- 在 Agent View 内开始会话时会回写偏好，之后新会话保持一致

## [2.9.5] — 2026-11-23

### 修：ACP 会话只保留一个对话 Tab

- 当前 DSH 会话绑定 ACP 会话时，隐藏原生「对话」Tab；切到轨迹/上下文也保持隐藏
- 结束/关闭 ACP 会话后自动恢复原生 Chat；说明两者仍是同一个 DSH 会话的两个 View

## [2.9.4] — 2026-11-23

### 修：避免看起来像两个会话

- ACP View 激活时隐藏原生「对话」Tab，只保留一个对话表面；切到轨迹/上下文时自动恢复
- 说明：DSH 的「对话」与「远端 Agent」是同一个 DSH 会话的两个 View，不是两个 session

## [2.9.3] — 2026-11-23

### 调：ACP View 更接近 DSH 会话布局

- 把模型/思考级别/模式等配置从顶部独立控制行移到 composer 卡片底部，减少顶部大块红框
- composer 改成带边框/圆角的输入卡片，左侧 `+` 打开文件面板，发送/停止仍在右侧
- 保留顶部一行 agent 状态与文件/新会话/结束会话；命令与原生事件仍在 composer 上方

## [2.9.2] — 2026-11-23

### 修：ACP View 的布局重复

- 隐藏 ACP View 下方的原生 DSH composer（`[data-composer-seat]`），避免两个输入框
- 去重 `modes` 与 `configOptions` 里的 mode/模式 选项，修掉「模式 / Mode」双下拉
- 空会话改为居中空状态 + 快捷提问，不再只显示一条「会话已连接」和大片空白

## [2.9.1] — 2026-11-23

### 修：工作区选择器里的 SSH 入口

- 「添加工作区」弹窗的分段改为「本机目录 / SSH 远程」，去掉 emoji，避免与原生菜单混淆
- 弹窗内增加提示：选 SSH 远程 → 选连接 → 浏览远端目录
- 不改变目录流 Slot 注册；入口仍是工作区/新会话的「添加工作区」

## [2.9.0] — 2026-11-23

### 改：从 Modal 改为会话内 conversation.view
- 注册 `conversation.view`（Agent Tab，`id: "remote-acp"`，`order: 15`，label「远端 Agent」）；删除 hero/header 的 Modal 入口
- View 绑定 `props.sessionId`（Host `dshSessionId`）：挂载 `acpList({dshSessionId})`，有记录自动 `acpResume`；`acpStart`/`acpResume` 带 `dshSessionId`
- 切换 View/刷新使用 `acpViewCache` 保留已渲染消息并重新 `resume`；切 View 不调用 `acpClose`
- 入口走工作区原生「新会话 / ⌘N → SSH → 远端工作区」；View 内 setup 通过 `useWorkspaces.sessionIds` + `mirrorPath` 默认当前会话的远端工作区
- 顶部「文件」复用远端文件面板（listDir/readFile/上传/下载）；ACP `commands` 做搜索 + 分组 + 点击插入的命令/skill 面板，支持 `/name` 与 Codex `/skills`
- 全区域 View 布局（无 Modal 壳）；停止只停 turn，结束会话需确认；窄屏适配
- 移除不支持的 agent 探测与提示，只保留 Claude Code / Codex；README/CHANGELOG 同步

### 生命周期与续接
- `acpPrompt` 断流不再 cancel turn；新增 `acpAttach`（NDJSON replay+live）与 `acpEvents`，切 View/刷新可恢复历史与 in-flight turn
- `acpStop` 只停 turn，`acpClose` 才移除记录；`acpStart` 按 `dshSessionId` 复用唯一 active，`acpList` 可按 DSH session 过滤
- stop 事件进入事件缓冲，即使无订阅者也不丢；`acpResume` 保留绑定与事件

## [2.8.2] — 2026-11-23

### 新：原生事件与子 Agent

- Host：`mapToolCall` 透传 `parentToolCallId` / `nativeMeta` / `native`；识别 Claude `Agent`/`Task` 工具为子 Agent（agentId/description/background/outputFile）
- Host：解析 Claude `<task-notification>` → `subagent_update`；新增 Codex `subagent_update`、`state_update`、`session_message(_chunk)`、`terminal_update`/`terminal_output_chunk`、`agent_message`/`agent_thought` 全文、`prompt_suggestions_update`
- Host：所有协议事件附 `native` 与截断后的 `nativeMeta`；子会话保留自己的 `sessionId` 并附 `rootSessionId`
- Client：子 Agent 卡片、按 `parentToolCallId` 嵌套工具调用、折叠展开；state/session_message/terminal/suggestions 原生事件卡片；每个事件可展开「原生事件」JSON 详情
- Client：Claude task notification 不再作为普通用户消息平铺；subagent summary/outputFile 可展开/预览
- 测试：Host 131、Client 163、全量 2562 通过（20 基线失败）

## [2.8.1] — 2026-11-23

### 修：ACP Chat 的常驻入口

- 新增会话头部「远端 Agent」入口（`conversation.session.header.actions`），hero 消失后仍可打开同一个 ACP Chat Modal 并恢复已保存会话
- 与「新建会话」hero 入口共用 `AcpChatModal`，不复制状态

## [2.8.0] — 2026-11-23

### 新：ACP Chat 客户端 UI（conversation.hero.options）

- 入口：DSH「新建会话」页选项行的「**远端 Agent**」按钮（`conversation.hero.options`，list / session scope，
  `id: "remote-acp"`，`order: 50`）；点击打开大尺寸 DSH `Modal`，不再从右侧栏进入
- 移除右侧栏 `sidebarRightTabs` / `sidebar.right.pane.tab` 注册与设置页「打开 Agent 面板」按钮；
  旧 TUI/Shell 面板组件保留在 `lib/client.js` 里但不再注册任何 Slot
- 创建流程：选连接 →「探测」（`acpAgents`）→ 选远端工作区（`listWorkspaces` 的 `mirrorPath` / `remotePath`，
  或手填 `mirrorCwd`）→ 选 agent / 权限（Accept edits / Plan / Bypass）→ `acpStart`
- Chat：`acpPrompt` NDJSON 流按行 `JSON.parse`，渲染 text / thought / tool_call / tool_call_update / plan /
  commands / usage / notice / error / stop / session_info / permission；正文用 `MarkdownText`，
  工具内容用 `DiffBlock` / `TerminalBlock` / `ReadBlock`，状态用 `StateDot` / `Tag`，全部复用 DSH 原语与 `--dsw-*` token
- HITL 权限：`permission` 事件渲染成带 `alertdialog` 的卡片，按 adapter 的 options 原样渲染并回传 optionId；
  「忽略」回传 `cancelled`；不自动批准（Bypass 由 Host 自动，UI 显示已自动批准）
- Steer：`runningRef` 标记 turn 是否运行中；运行中发送走 `acpSteer`，user_message(steering) 立即上屏，
  Host 回显按「文本 + steering」去重
- 配置：顶部用 `CompactMenuSelect` 渲染 `config.models` / `config.reasoning` / `config.modes` 与其余
  `configOptions` select，分别调 `acpSetConfig` / `acpSetMode`；显示当前值、usage 与权限等待数
- 停止 / 恢复 / 关闭：`acpCancel`、`acpList` + `acpResume`、`acpClose`；对话框关闭时若有运行中的 turn 或
  未处理权限，先显示确认条而不是直接丢弃
- 状态与错误：连接中 / 运行中 / 等待权限 / 就绪 / 错误 / 已关闭；流断开保留已收消息并提示重试；
  Esc 由 Modal 处理，运行中关闭需确认；窄屏（<768px）Modal 与消息区自适应
- 测试：`tests/remote-agents.test.mjs` 改为断言 hero 入口、无 sidebarRight 注册、ACP 端点/权限/steer/
  模型/思考级别/模式调用、MarkdownText/DiffBlock 使用与 ACP 区域无 emoji

### 新：ACP Chat 的 Host/HTTP 层

- 本地 ACP adapter（`@agentclientprotocol/claude-agent-acp` / `@agentclientprotocol/codex-acp`）+ 生成的 SSH wrapper
  驱动远端 Claude Code / Codex；每个会话一个 adapter 子进程 + 一条 `client()` 连接
- wrapper 落在 `~/.dsh/remote-ssh/acp/<agent>-remote.mjs`：读取 `.remote-ssh.json` 与 `DSH_ACP_*` env，
  经 `ssh` 执行远端 `bash -ic 'exec <agentPath> ...'`，参数以 base64 JSON 交给远端 python3 解码；
  支持 key / Kerberos，password 明确报错
- 新端点：`acpAgents` / `acpStart` / `acpPrompt`（NDJSON 流）/ `acpSteer` / `acpSetConfig` / `acpSetMode` /
  `acpPermission` / `acpCancel` / `acpResume` / `acpClose` / `acpList` / `acpState`
- 结构化事件：文本/思考/工具/diff/终端/计划/命令/usage/notice/权限；配置（models/modes/reasoning）归一化；
  权限挂起 + optionId 回传；`_session/steering` 支持 turn 内追加；session id 持久化并可 resume
- 纯单元测试 `tests/acp-host.test.mjs`（wrapper、事件映射、配置归一化、持久化、权限、cancel/steer/close）

## [2.7.2] — 2026-11-23

### 修：Agent 探测与执行环境（codex / claude）

- **探测增强**：探测脚本先增强 PATH（`~/.local/bin`、`~/.npm-global/bin`、`~/.bun/bin`、`~/.cargo/bin`、
  `~/.volta`、`~/.asdf`、nvm 的 node bin 等），再用登录 shell 回退，最后按常见安装目录逐个检查。
  此前非登录 SSH 的 PATH 只有 `/usr/bin:/bin`，devbox2 / devbox_sg 上装在 `~/.local/bin`、`~/.npm-global/bin`
  的 codex / claude 全部漏检；现在都能识别 codex 0.171.0、claude 2.1.3x。
- **绝对路径执行**：会话记录探测到的绝对路径，TUI 与 Chat 都直接执行该路径，不再依赖远端默认 PATH。
- **交互环境**：agent 的模型 key / 代理常写在 `~/.bashrc`（非交互 shell 会提前 return），Chat 与 TUI
  改为经 `bash -ic` 启动并关闭 stdin，codex 因此能读到 `LOCAL_API_KEY`。
- **codex 适配**：`codex exec --json --skip-git-repo-check`，权限映射 `-s read-only` / `-s workspace-write` /
  `--dangerously-bypass-approvals-and-sandbox`；解析 `thread.started` / `agent_message` / `turn.failed` 并续聊。

实测：devbox / devbox2 / devbox_sg 均探测到 codex、claude；Codex Chat 首轮 `CODEX_OK` 与续聊、
Claude Chat 续聊、TUI 启动均通过。

## [2.7.1] — 2026-11-23

### 文档与仓库清理

- 重写 README / README_EN：只保留功能、安装、快速开始、Agent 使用、兼容性与故障排查，底部保留原始仓库链接
- CHANGELOG 只保留本仓库 2.5.0–2.7.0 历史
- 删除继承自原仓库的非功能内容：`MAINTENANCE.md`、旧截图与 `screenshots.json`、一次性验证脚本、上游 CI 工作流
- 回归测试中只针对已删除文档/历史 issue 的断言一并移除

## [2.7.0] — 2026-11-23

### 新：远程 Agent 面板

- 右侧栏新增「远程 Agent」页签（原生 `sidebarRightTabs` 扩展），识别远端 `codex` / `claude` 及 `tmux` / `git`
- **Chat**：无头结构化对话（Claude `-p --output-format json`、codex `exec --json`），按 CLI session id 续聊，消息落盘
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
