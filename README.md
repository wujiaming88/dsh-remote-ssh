# dsh-remote-ssh

[English](./README_EN.md)

在 DSH 中通过 SSH 使用远端 Claude Code / Codex。当前代码为 **3.0.0-rc.3**：只实现当前 DSH 接口和完整远端 ACP，不包含旧版兼容层。

> 当前插件保持禁用。重新启用须由用户明确同意；源码与离线测试通过不代表已完成真实 GUI 验收。若旧进程残留文件包装，请先在禁用状态下重启 DSH。

## 设计约束

1. **执行在远端。** ACP adapter、CLI、cwd、skills 和 MCP 位于同一台远端机器；本机只负责连接、持久化与界面。
2. **会话后端固定。** 工作区保存默认 Agent；会话首次安全绑定后持久化快照，改工作区设置不改变已有会话。
3. **本机会话零接管。** 未确认、查询失败或无关远端数据异常，不替换原生 Chat。插件不修改 `ctx.fs`、原生文件引用、终端配置、其他插件 DOM 或全局 fetch。
4. **真实生命周期。** 只在实际执行时记录原生 `turn/start + user/message`，完成后配对 `turn/end`；排队不冒充执行。原生新会话入口因此能区分已运行会话，不用占位消息或模拟点击。
5. **用户授权不自动代答。** 权限、表单与依赖准备都遵循明确的操作边界；唯一模型工具 `remote_session_status` 只查询执行者当前会话状态，不能启动 Agent、批准权限、回答表单或改变后端。
6. **没有兼容分支。** 不提供本地 adapter wrapper、旧 TUI/Shell、同步写回、旧 sidebar 接管、旧 schema 迁移或旧 DSH 版本兜底。

## 前置条件

- DSH `0.2.2-rc.5`，本机 Node.js 22+。
- SSH 私钥/ssh-agent 或 Kerberos/GSSAPI。Kerberos 用户先取得有效票据。
- 远端 Node.js 22+、npm、bash；文件和 worktree 功能需要 Python 3，worktree 需要 Git。
- 远端 CLI 的账号、代理、模型网关和额度可用。发现可执行文件不等于已验证模型访问。

运行环境使用固定版本：ACP SDK `2.9.1`、Claude adapter `0.109.1`、Codex adapter `2.9.0`。远端依赖只在确认安装计划后准备，默认目录 `~/.local/share/dsh-remote-acp/v1`，不使用 sudo、不修改 shell、不安装系统 Node。

## 使用流程

### 工作区与会话

1. **设置 → 远程 SSH**：新增 key/Kerberos 连接，或从 SSH config 选取配置后明确保存；测试连接。
2. **添加工作区 → 远端工作区**：选择连接、目录和 Claude/Codex 后端。权限默认 Accept edits；Bypass 必须明确确认。
3. 点击工作区的原生 **新会话**。已确认的远端后端直接进入主会话页面，不再增加一个全局 Agent Tab。
4. 缺少依赖时，查看「准备远端运行环境」计划并确认。错误留在对应远端页面，不偷偷改用本机 DSH 执行。

本机目录入口使用原生 DSH；远端工作区只提供 Claude/Codex，不提供一个只能操作本机空目录的虚假 DSH 远端选项。本机目录选择仍调用 DSH 原生选择器。

### 对话与 Agent 能力

- Enter 发送，Shift+Enter 换行；Host 确认接收后清空草稿。
- 模型、思考级别和模式按 adapter 的实际配置展示，Host 确认后生效。
- 运行中支持原生 steer；不支持时走 Host 串行队列。未知提交结果不盲目重发。
- 停止取消执行及待提交队列，不删除会话历史。
- 支持权限请求，以及含单选、多选、自由回答的 form elicitation（包括 AskUserQuestion）。不支持的 schema 明确拒绝；不声明 URL/OAuth elicitation 支持。
- 输入 `/` 搜索实际提供的命令/skills；方向键选择，Enter/Tab 插入，Escape 关闭。
- 输入 `@` 浏览并引用远端工作区文件。发送前读取有界快照；原生记录与实际发送使用同一份内容。
- 文本/图片可粘贴或拖入；图片须有能力支持。最多 16 个附件，文本合计 1 MiB，图片合计 2 MiB。
- 消息流展示正文、思考、工具、diff、读取、终端输出、计划、用量、原生事件及子 Agent，保留回合/父子归属。

终端卡是输出展示，不是交互式 TTY。命令列表仅代表 adapter 提供的命令，不模拟任意终端命令；子 Agent 可操作范围以协议实际暴露为准。

### 重命名、置顶与分叉

远端会话头部的原生「…」菜单提供 **重命名 / 置顶（取消置顶）/ 分叉**。

- **重命名**：名称写入同一个 DSH Session，并通过 ACP `session/set_title` 同步远端 CLI；采用返回的规范名称。原生侧栏重命名也会同步；异步失败通过原生通知提示，并可打开对应会话的同步状态。远端失败不假回滚已保存的 DSH 名称；界面显示 failed/unknown，不能把不确定结果当成“远端没改”。归档/冷会话通过 metadata-only 连接改名，不启动新会话或发送 prompt。
- **置顶**：完全使用 DSH 原生 WorkspaceRegistry 的持久置顶状态，不另建排序或远端 pin 概念。
- **分叉**：调用真正的远端 `session/fork`，创建独立的远端 ID/controller，然后发布继承历史的新 DSH 会话；不会把旧聊天拼成新 prompt，也不会仅复制空外壳。模型、思考级别和实际权限继承并校验，不提升权限，不继承置顶或待审批状态。

分叉只支持**最新完整上下文**；源会话必须无正在执行的回合、排队、审批或配置操作，归档会话先取消归档。两个会话仍共享原工作目录，不自动复制文件或创建 worktree。

原生列表右键额外提供「分叉远端会话」。DSH 自带的普通「分叉」及其快捷键只复制原生日志，因此在远端会话上被明确拒绝，请使用上述远端操作；本机 DSH 分叉不受影响。

分叉使用持久 operationId 和双阶段结果。远端已创建但本地发布失败时，重试恢复同一个 child，不再次 fork；结果未知时不自动重发，重新创建必须明确确认。继承历史带来源标记，不重演工具或重复记账原生 turn。

### 文件与 worktree

从会话右侧栏打开远端文件页，完成浏览、预览、编辑、上传、下载：

- 所有路径按真实会话工作区验证，拒绝越界。
- 保存以 SHA256 内容版本检查冲突，并原子发布；不无条件覆盖。
- 上传覆盖需要明确确认；下载上限 64 MiB。
- 未保存的编辑阻止关闭文件页或切换文件。
- PNG/JPEG/GIF/WebP 可以预览；HTML/SVG 不以内联可执行文档打开。

建区时可选「从 Git worktree 创建」，填写分支/基点并选择远端仓库。Host 创建并记录所有权后注册实际目录。移除 owned worktree 需要确认、先停止并归档相关会话；脏目录拒绝移除，不使用 force，不删除分支。普通解除工作区注册始终保留文件。

## 生命周期与存储

- 切换界面、关闭浏览器只释放 UI 订阅，不因页面卸载取消远端任务。
- generation/seq 游标支持续接；历史按页读取，按回合与请求 ID 去重。
- Native Session 的记录与私有 ACP journal 都只记录真实发生的事实；缓存卸载不能伪造回合或取消远端任务。
- 归档遵循 DSH 原生 activity 检查，涵盖执行、排队、权限和表单。
- 插件退出回收连接，保留可恢复记录；删除连接/工作区先回收相关实例，保留历史与目录。

新记录位于当前 profile 的 `data/remote-acp/v3/`，有明确 schema/version。旧记录、目录和用户文件不会被删除，但本实现不读取或迁移旧格式；旧远端工作区需要重新添加。

## 代码结构

- [Host 装配](./lib/index.js)：路由、授权、生命周期、工具。
- [配置](./lib/config.js)、[SSH](./lib/ssh.js)、[工作区](./lib/workspaces.js)、[绑定](./lib/bindings.js)、[文件](./lib/files.js)。
- [ACP 编排](./lib/acp.js) 与 `acp-core/config/events/requests/store/transport` 模块。
- [原生回合记录器](./lib/remote-turn-recorder.js)：合法原生 Session 事件与去重 projection。
- [客户端入口](./src/client/index.js)：独立的设置、建区、会话、事件、文件、控件与样式模块。

客户端仅导入 Host React，不导入 DSH 私有 UI 包。使用 DSH 主题和交互规范；Markdown 为安全基本子集，不执行 HTML，不承诺完整 CommonMark 或像素级一致。

## 开发与安装

```bash
node build-client.mjs
node --test tests/*.test.mjs
```

浏览器产物为 `lib/client.js`，只有一个模块 factory；不要直接编辑生成文件。候选版可通过 DSH **插件 → 添加插件 → 本地目录**安装。本文不代表候选版已发布到 npm/GitHub。

HTTP 接口统一位于 `/remote-ssh/v3/`，仅使用单层 JSON 信封。它使用 DSH 当前连接认证与资源权限，现为 owner-only；不注册旧 URL、匿名 curl 授权或 LiveShare 权限兜底。

## 已知边界

- 长历史 journal 目前顺序扫描，无自动永久删除策略。
- 网络/主机故障后的远端进程存活取决于 SSH 和 CLI，不保证任务不中断。
- 不支持密码认证、音频附件、任意 URI 附件、旧版数据迁移或自动为每个会话分配 worktree。
- DSH 当前没有可安全叠加的早期原生 prompt 拒绝接口。正常插件 UI 不切回 DSH 执行，但不能宣称 Host 能阻止 owner 绕过 UI 直接调用原生 `session/prompt`；未使用私有补丁或晚期假 guard。
- 重新启用前仍须核验当前 DSH GUI 的挂载、焦点和本机会话隔离。

[MIT 许可证](./LICENSE)

---

原始仓库：[dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
