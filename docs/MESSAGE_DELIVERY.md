# 消息排队与原生插队

## 使用方式

- 空闲时，发送建立普通 ACP turn。
- 运行中，Enter 和主发送按钮读取 DSH 原生 General Settings 的 `ui-conversation.busyEnter`，默认 **排队**；Ctrl/Cmd+Enter 使用另一种模式。Shift+Enter 换行，IME、Alt/AltGraph、Ctrl+Cmd 不触发提交。
- **排队**：远端 owner 接纳后立即返回 receipt，tool 执行期间保持可编辑/删除；Claude 在最后一个前台 tool 结束后以原生 `later` steering 注入同一 turn，其他情况在当前 turn 完成后按 FIFO 执行。排队不等于已经交给模型。
- **队列编辑**：原地修改尚未开始的文本，保持 requestId、turn 身份、FIFO 位置和附件；仅预览的超长内容禁止编辑，避免截断覆盖。
- **立即发送**：对已声明 steering 的 adapter 使用显式 `now` 优先级注入当前 turn，并从队列原子移除；Claude Code 的 `now` 语义可能抢占当前生成，和原生 `Ctrl+Enter` 一致。
- **插队**：通过当前 adapter 的原生 steering 注入正在运行的 turn，不调用 cancel，也不新建独立 turn。`injected` 只表示原生输入机制已接收，不保证模型已经读取或已完成。
- 当前轮恰好结束、adapter 返回 `promptRequired` 时保留草稿，不暗中改为排队；用户可以再次发送。能力未声明、内容不支持时明确拒绝。
- 同一内容的提交结果未知时，按钮显示 **重试**，复用原 requestId 和冻结的模式。不能以切换模式制造第二次提交。编辑草稿代表新意图；原未知请求仍可能已经被接收。

## 原生 UI 的复用范围

[队列展示](<../src/client/native-queue-view.js>)与[样式](<../src/client/native-queue-view.css>)适配安装版 DSH **0.2.2-rc.5** 的 `ui-conversation QueueDock`，使用 props-only 远端状态，不导入原生 Inbox/Session 私有 store。

- 队列位于 composer 上方；零项隐藏、单项直接显示、多项默认折叠。
- 36px 行、180px 列表滚动区、28px 删除按钮，保持原生几何和主题 token。
- 只展示远端确认的队列条目；发送中保留草稿与 spinner，不捏造已入队条目。
- 已排队但未提交的用户消息不重复显示为对话气泡；真实 `turn_start` 后才显示。
- 删除只撤回尚未执行的条目，不中断当前工作；已被 owner 消费时明确拒绝，不删除错误目标。
- 图片/文件只显示安全元数据，不把远端路径伪造成图片 URL。
- 每项提供原生风格的编辑、删除和立即发送；编辑/发送都使用精确 requestId，先由远端原子修改，失败时不伪造本地成功。自动 tool-boundary 注入期间该条不再可编辑，之后以 steered 气泡留在当前 turn。

## Codex 与 Claude Code 的真实原生路径

[准备配置](<../lib/acp-transport.js>)固定 ACP SDK **2.9.1**、Codex adapter **2.9.0**、Claude adapter **0.109.1**，使用 **ACP v1**。实际启用仍以 initialize 顶层 `_meta.steering.supported === true` 为准，不能只凭 agent 名称推断。

Claude adapter **0.109.1** 的 steering 只接受内部 hard-coded 优先级。为复刻 Claude Code 原生队列，[启动 bootstrap](<../lib/acp-transport.js>)对 `dist/v1/acp-agent.js` 应用**精确、幂等、可校验**的最小源码补丁：新增 `steering.priorities = ["now","later"]`，并按 Host 的 `_meta.steering.priority` 选择 SDK 优先级。补丁只在固定文件布局匹配时生效；不匹配则保持原包不改、记录 warning，并回退到 turn 边界 FIFO。除这两处外不修改 adapter，也不在 Host/浏览器执行第三方代码。

```text
Codex:
_session/steering → CodexAcpServer → CodexAcpClient.steerTurn
                 → app-server turn/steer(threadId, expectedTurnId, input)

Claude Code:
_session/steering → promptToClaude → SDKUserMessage
                 → 现有 query() 的 Pushable streaming input
```

两端都发送 `_meta.steering.idleBehavior: "promptRequired"`，避免 adapter 在空闲时悄悄启动脱离 Host 管理的新 turn。

- Codex steering 与普通 prompt FIFO 独立；可能在后续模型 step 生效，不承诺立刻中断当前长文本输出。
- 补丁后的 Claude 支持 Host 选择 `now`/`later`。显式“立即发送”使用 `now`；自动队列在最后一个根 tool 完成后使用 `later`，实测 tool 可完整运行、当前 turn 不被抢占，并在同一 turn 内处理排队消息。
- 两端普通 `session/prompt` 都有原生 FIFO。插件仍在远端 owner 保留待提交队列，逐项进入 adapter 原生 prompt：这样可可靠撤回未提交项，并维持 ACP v1 的单活跃 turn 事件归属。

固定版本源码证据：

- [Codex steering wire contract](https://github.com/agentclientprotocol/codex-acp/blob/v2.9.0/src/AcpExtensions.ts)
- [Codex steering 与普通 prompt reservation](https://github.com/agentclientprotocol/codex-acp/blob/v2.9.0/src/CodexAcpServer.ts)
- [Codex native turn/steer](https://github.com/agentclientprotocol/codex-acp/blob/v2.9.0/src/CodexAppServerClient.ts)
- [Claude v1 streaming input、steer 和权限保护](https://github.com/agentclientprotocol/claude-agent-acp/blob/v0.109.1/src/v1/acp-agent.ts)
- [Claude steering contract](https://github.com/agentclientprotocol/claude-agent-acp/blob/v0.109.1/src/v1/steering.ts)

## 附件与可信记录

queue、prompt、steer 共用 Host 授权、远端引用校验和 native admission，私有内容指纹必须先持久化，随后才能提交。相同 requestId 不得绑定不同文字、附件或执行模式。远端事件不能通过伪造 `nativeContent` 写入本地原生历史。

[steering 内容校验](<../lib/acp-steering.js>)在普通 prompt 能力校验之外，拒绝可能被 adapter 静默丢弃的内容：

- 支持文字、已声明能力下的 PNG/JPEG/GIF/WebP、资源链接与嵌入文本。
- Claude 的 blob 仅允许已核实的图片、PDF 和文本 MIME；Codex 的非图片 blob 保守拒绝，因为该版本会把它变成 base64 文本，而非原生文档块。
- audio/未知类型明确拒绝，不静默漏掉附件。一般文件仍按现有上传机制发送远端路径文字引用，并不意味着原生理解二进制文档。
- 大 base64 输入使用无递归分组的有界校验；不读取本机路径或隐式上传。

## 恢复、并发和失败边界

- 队列实际由独立远端 owner 持有，不依赖网页或本机 Host 存活；SSH/Host 恢复后重新附着同一 owner。
- queue/updateQueued/promoteQueued/removeQueued/steer 通过 durable broker 的操作日志、参数摘要、稳定 operation ID 和 query-first 协议恢复。并发同 ID 请求共享完整 receipt 与 authoritative state 同步门。
- 自动 `later` 注入与显式 `now` 注入共用同一 steering 并发保护；队列 drain 在注入 ACK 期间暂停，避免同一 requestId 又被当成独立 turn 启动。tool 追踪只针对当前根 session、无 parentToolCallId 的前台工具。
- `queuedMessages` 快照与 `queue_snapshot` 事件只包含未开始项。容量为 **32 条 / 32 MiB**，每条预览最多 **4096 字符**，有明确截断标志；实际执行内容不截断。浏览器忽略比最新队列状态更旧的 HTTP 快照。
- 为保持幂等，queue 和 steer 各最多保留 **512** 个请求身份；达到限制明确拒绝，不淘汰后重新执行。
- 发送 steer 前捕获原 turn；即使 prompt 先完成，也等待已发 steer 的有限时 ACK 再记 stop/启动下一轮，避免把输入挂到下一轮。
- steer 结果未知时不重发、不自动排队，不取消仍运行的模型或待审批请求；冻结后续 admission/drain。当前 prompt 真正结束后才进入明确错误状态并撤销未提交队列。
- 日志持久化失败立即同步冻结 owner admission/drain，再关闭 owner；不会在异步关闭前抢跑下一条 queue。
- **远端 owner 进程崩溃、机器重启或被系统清理，不会自动恢复执行排队内容。**不能从旧目录启动新 owner 盲重放，具体边界见[持久执行说明](<DURABLE_EXECUTION.md>)。

## 验证范围

覆盖真实 ACP SDK 的内存 transport、生产 durable facade/link 与本地 Unix broker、Host store 重建、权限与 native Session 记录、ACK 晚到/丢失、并发重复请求、队列编辑/删除/立即发送竞态、tool-boundary 自动注入、adapter 补丁序列化及持久化失败屏障；adapter/model 行为仍使用有界测试替身。

本地额外用 Claude Code **2.1.330** 原生交互队列和 `claude-agent-acp 0.109.1` 做了真实运行验证：原生 CLI 在 tool 完成后、同一 turn 内处理排队消息；补丁 adapter 的 `later` 不抢占 tool，并在同一 turn 内依次处理。本机默认模型是 `kimi-k3.1`，因此这验证的是 Claude Code 队列调度与 adapter 协议，不是 Anthropic 特定模型输出。本版本仍未连接实际 SSH 主机、未在真实浏览器做视觉验收；安装与 Git 发布不等于完成这些验收。
