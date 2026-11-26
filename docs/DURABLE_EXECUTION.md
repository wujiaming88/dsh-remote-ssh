# 断网与 Host 重启恢复

## 能力及适用范围

本实现为新建的远端会话提供独立的远端执行所有者（owner）。SSH 只传递命令和状态，不再拥有 Agent/ACP 的生命周期。因此，本机断网、SSH helper 退出、DSH Host 正常退出或被强制终止，不会主动取消已接纳的远端任务。

重新打开原会话时，Host 使用保存在当前 DSH profile 内的私有 locator，连接**同一个 owner**，补取 canonical generation/seq 事件、任务快照及待处理权限/表单请求。不会因为重连重新调用 ACP initialize/new/resume，也不会根据聊天文本重建并重发 prompt。未发送的浏览器 File 对象仍不跨应用重启恢复。

这不追溯保护旧版直接使用 SSH stdio 启动的正在运行任务；旧会话恢复历史与继续同一个活跃执行不是一回事。

## 从 rc.17 及更早版本升级与回滚

- **安装前先结束旧版活跃任务。** 热升级会卸载旧 Host 插件；旧版 dispose 仍会清理本地待审批/队列并关闭 SSH transport，不能把新实现的断网保护追溯到旧的 live 对象。确认所有任务已完成且没有等待权限/问题后再安装。
- 旧 v3 会话历史可以向前恢复，但会建立新的 durable owner 并使用 adapter 的 session/resume；这不是把旧的活跃执行无缝迁移到新进程。不兼容的 v1/v2 schema 仍明确拒绝。
- **不要在 durable owner 仍活跃时原地降级到 rc.17。** 旧版可能接受同为 v3 的记录，却不识别新的 owner locator，随后启动另一 adapter，而原 owner 仍在运行。回滚前必须用新版明确结束全部 durable 会话并确认 closed；保留私有恢复数据，不直接删除 locator。

## 生命周期

- **切换界面、关闭页面、断网、退出 DSH、归档**：只释放本地订阅/连接；不等同于终止远端任务。归档仍服从原生 activity 检查。
- **停止当前任务**：仍是显式取消操作。断线时只有远端确认后才能知道取消结果，不能把点击按钮当作已经停止。
- **结束远端会话**：会话菜单中的独立确认操作；终止当前会话的任务和待处理交互，保留历史、SSH 配置及工作区文件。已创建的分叉会话不随之结束。
- **关闭确认**：只有 adapter teardown 完成后才发布 closed。普通 closing 状态不能解除配置删除保护。确认结束后 worker/adapter 退出，私有终态证明和 journal 保留；后续查询由短生命周期、只读 helper 服务，不重新启动 Agent。
- **删除配置**：尚未确认 closed 的 durable owner 会阻止移除其 SSH profile、工作区或 owned worktree，避免丢失恢复入口。不能通过归档或删配置偷偷取消远端执行。

## 实现边界

Host facade、网络连接和远端执行进程分别位于：

- [Host facade](<../lib/durable-session.js>)：私有 locator、原生消息 admission、canonical event 落盘及公开状态投影。
- [可替换连接](<../lib/durable-link.js>)：SSH 重连、背压、operation 查询及 fencing。
- [启动 helper](<../lib/durable-launch.js>)：start-once 目录、不可变 worker 发布、Unix socket 转发和终态只读恢复。
- [远端 worker](<../lib/durable-worker.js>)、[broker](<../lib/durable-broker.js>)：唯一 AcpSession/SDK/adapter 所有者，持久事件、operation ledger 和待处理交互。
- [原生回合记录器](<../lib/remote-turn-recorder.js>)：只使用真实 lifecycle 与 Host 预先接纳的消息内容；不信任远端提供的 nativeContent，也不从显示摘要重建图片或用户消息。

### 幂等与恢复

启动使用独占目录和唯一 execution identity；目录已经存在时绝不另起 owner。operation admission 在调用 Agent 前写入并 fsync，记录稳定 opId、带密钥的参数摘要及结果。网络恢复先查询原 opId：已完成返回旧结果，pending 等待原执行，只有原 owner 明确 not_found 时才可重新提交同一 envelope。Host 重启不自动重建丢失的本地 RPC 队列。

事件先写入 Host journal，再推进 ACK 游标；重复事件去重，缺口或 epoch/binding 不匹配拒绝继续。浏览器的 SSH 状态快照不带事件序号，不写进 ACP journal，不伪造 stop 或 turn/end。HTTP 连接正常不代表 SSH 已连接。

同一 consumer 的重连保留 lease，避免 attached 回执丢失造成错误接管。显式新 Host 接管会 fence 旧 writer；旧 Host 自动重连不能夺回控制权。

权限和表单 deferred 保存在远端 owner 内。离线期间保持等待，不自动批准、拒绝或取消。operation journal 不记录表单原答案；用于去重的摘要为带 token 密钥的 HMAC，不是可枚举低熵答案的裸 hash。

### 安全与资源

- token 仅在私有 Host store 和协议 stdin 内出现，不进入 argv、浏览器快照或普通日志。
- 无 TCP broker 端口；Unix socket 位于短路径私有目录。目录 0700、数据文件 0600，并验证 owner、symlink 和 runtime 的可信祖先；共享可写 runtime 被拒绝。
- worker 采用内容 hash 命名，完整写入/fsync 后原子发布；并发启动不能读到半个 bundle。
- 单帧上限 16 MiB。Host 未完成 RPC 最多 1024 个、参数总量最多 64 MiB；读事件有背压。
- 每个 owner 默认普通 journal/state 预算 256 MiB、pending 参数与保留结果各 64 MiB、普通 operation 10000 个。停止类操作有独立预留额度，close 另保留独立槽位。
- 磁盘/持久化故障或不可恢复的超限会安全终止执行并报告 **unknown**，不是成功；即使普通额度耗尽也保留显式关闭能力。无法可靠保存终态证明的异常 owner 可能继续保留诊断服务，不能伪造可跨崩溃恢复的关闭回执。
- 无空闲 TTL 或自动永久历史清理。普通任务完成后 owner 仍可接收下一轮；不需要继续使用时应明确结束会话。终态日志及私有 socket 目录保留用于核实，不擅自删除用户数据。

## 不保证的情况

1. **远端机器重启、owner/adapter 被杀或崩溃**不等于本机断线；没有有效终态证明时报告 owner lost/unknown，不自动创建替代执行，也不宣称跨 owner 崩溃 exactly-once。
2. detached 进程不能对抗远端 `systemd-logind` 杀死整组登录进程的策略。需要 user service/linger 的环境必须另行明确配置；本实现不偷偷启用它们。
3. 本地恢复依赖原 DSH profile 的私有 locator 和日志；删除这些数据或换成空 profile 不能自动找回所有 owner。
4. 同 UID 与 root 属于可信边界；token 不防御同用户恶意进程读取私有文件。
5. 未确认的 fork 保留远端 reservation，不凭超时猜测释放或重复 fork。需要根据已保存的 child identity 核实；明确结束父会话不会隐式终止 child。

## 验证证据及仍需验收

[真实进程恢复测试](<../tests/durable-recovery.test.mjs>) 使用真实 SDK 2.9.1、真实 detached worker、Unix socket、独立 Host/helper 进程，以及无网络模型调用的测试 adapter。覆盖断开 helper、两轮 SIGKILL Host、离线权限/form 恢复、丢失接纳/关闭回执、HMAC 去重、writer fencing、owner 丢失不重建、关闭后终态回放及 worker 真正退出。initialize/new/prompt/close 均只执行一次。

[broker 测试](<../tests/durable-broker.test.mjs>) 覆盖 fsync-before-invoke、慢订阅者、权限、额度与故障关闭；[link 测试](<../tests/durable-link.test.mjs>) 覆盖背压、握手超时和 outbox；[facade 测试](<../tests/durable-session.test.mjs>) 覆盖 Host 重启及永久断线时的本地 shutdown；[浏览器状态测试](<../tests/client-durable-state.test.mjs>) 验证不跳事件游标、区分 HTTP/SSH 状态和只读历史。

这些是本地自动化证据，**不是实际远端 SSH 或 GUI 人工验收**。在发布/安装后，还应在目标服务器上验证断开网络与退出 DSH、审批等待、恢复后的事件顺序、远端登录策略及明确关闭后的进程回收。本版本开发验证未连接真实 SSH 或改变远端配置；构建、安装与 Git 版本发布不等于完成目标服务器验收。
