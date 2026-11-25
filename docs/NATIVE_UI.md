# DSH 原生 UI 源码适配

## 约定

按用户确认的方案：**DSH 已有的控件、图标直接复制并本地适配；没有对应实现的远端功能自行实现，遵循原生风格。**

本项目不运行时导入 `@deepseek-ai/dsh-client-ui-primitives` 或其它 Harness Client 包。已复制的控件由插件维护，**不是宿主原生组件实例**，也不是仅改颜色的自绘近似版本。已有的 `contextMenu.button`、`conversation.chat.reasoning.content` 公开工厂，以及原生侧栏、文件标签页、设置容器继续使用。

## 来源与许可

核验基线：**DSH 0.2.2-rc.5 / Electron 44.7.0**，本机安装的 Desktop 发布件。独立 primitives 的 TSX/CSS 源文件未随此安装包分发，因此基础组件取自实际发布的 frontend JS/CSS，先格式化供阅读，**未执行或注入发布 bundle**。未以不对应版本的网上源码替代。

- JS 发布件：`@deepseek-ai/dsh-web-frontend/dist/assets/index-Ciz7DZxv.js`
  - SHA-256：`65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b`
- CSS 发布件：`@deepseek-ai/dsh-web-frontend/dist/assets/index-CSAdOBx6.css`
  - SHA-256：`d487cca8d8a97f1e0cc5eca02343528c873e544eb7ec3a5b323a0f035553551d`
- 部分页面样式来自同版本已分发的 UI 包源码，具体引用见相应 CSS 注释。
- 上游 MIT 许可和版权保留于 [第三方声明](../THIRD_PARTY_NOTICES.md)，随 npm 包一并分发。

格式化参考的临时绝对路径不属于运行时依赖；源码注释中的格式化行号只帮助这次核查。稳定身份是发布件名、版本、哈希和原符号。

## 覆盖与适配边界

| 类别 | 实现 | 复制与保留边界 |
|---|---|---|
| Button / Input / Checkbox / Tag / StateDot | [基础控件](../src/client/native-controls.js)、[样式](../src/client/native-controls.css) | 原符号 Pi / DH / cb / Ep / zd；复制结构、几何和原生主题样式。保留插件 disabled/loading、错误标记、可访问名称等接口；Input 使用原生 wrapper 结构。 |
| 配置枚举选择 | 同一基础控件中的 SelectField | 当前基线没有独立通用 Select 导出；在复制的 Input 外壳中使用真实 HTML select 和原生 chevron，保留浏览器键盘操作、选项及 change 事件。此项是本地适配。 |
| Menu / Modal | [浮层控件](../src/client/native-overlays.js)、[样式](../src/client/native-overlays.css) | 原符号 zp / Zu / Ed / db；复制原生视图组织及样式。定位、焦点、Escape、键盘、生命周期由插件自己的 dialog/popover 边界负责，不复制宿主私有 Portal、全局焦点管理器或状态。 |
| 操作与状态图标 | [图标库](../src/client/native-icons.js) | 55 份原生 SVG 结构、61 个语义映射；每个映射记录原符号。“执行过程”使用 checklist-outline，读取使用 browse-outline，命令使用 api-outline，通用工具使用 sparkle；不再将工具行全部映射成形似 `#` 的 code-outline。使用真实 path/fill/stroke/viewBox，不再散落手绘替代图标。每个实例隔离 SVG id。 |
| 文件图标 | 同一图标库及 [兼容入口](../src/client/ui.js) | 普通文件采用原生 ReferenceIcon，图像与代码文件采用原生 FileTypeIcon 几何；分类仍为插件的后缀策略，不宣称实现原生全部语言/文件类型图标。 |
| 运行标记 | 同一图标库及 [运行反馈](../src/client/transcript.js) | 使用原生静态 FishLogo；不冒称使用原生 Chat 的 APNG 动画。实际 turn 用时、等待与断线语义不变。 |
| Read / Diff / Terminal / Code / Markdown | [文本视图](../src/client/native-text-controls.js)、[样式](../src/client/native-text-controls.css) | 原符号 GB / rW / ZB / Zb / Bp 等。复制原生 DOM/CSS 视图；继续使用现有安全 Markdown parser、diffLines、终端控制序列清理与可靠复制生命周期。没有接入私有高亮、数学/脚注/文件服务或 ANSI 彩色引擎。 |
| 用户/助手消息及操作栏 | [消息展示层](../src/client/native-message-view.js)、[样式](../src/client/native-message-view.css) | 复制 MessageItem/UserContent 用户栈、AssistantMarkdown 正文与停止标记、MessageIconActions。附件位于气泡前，操作栏在内容栈外；最新用户消息操作常显、历史项 hover/focus 显示，触屏不依赖 hover。 |
| 工具行与详情 | [工具行](../src/client/native-tool-row.js)、[样式](../src/client/native-tool-row.css)、[适配模型](../src/client/tool-header-model.js) | 复制 ToolRow/DisclosureRow/TextShimmer 的结构与完整状态样式；取消 60/40 分栏，动作名称按内容宽度，摘要紧随其后。原生语义图标、IN/OUT、文件链接、Read/Diff/Terminal 使用原生展示组件。 |
| 输入区 | [输入展示层](../src/client/native-composer-view.js)、[样式](../src/client/native-composer-view.css)、[配置适配](../src/client/native-composer-model.js) | 复制完整 InputBar 的 root/card/overlay/scroll/grow/row/modes/standardControls/dock 结构，slots 转为受控 props；保留真实远端 mode/model/reasoning 配置。 |
| 草稿与已发送附件 | [附件展示层](../src/client/native-attachment-view.js)、[样式](../src/client/native-attachment-view.css)、[尺寸/滚动模型](../src/client/native-attachment-model.js) | 复制 AttachmentRail/FileCard/MessageImage/ComposerAttachments 与 UserContent 附件行；64px 草稿 rail、单图 fit、多图 tile、原生文件卡。上传/接收记录与资源生命周期继续由远端适配层拥有。 |
| 文件/设置及其它远端流程 | 对应页面样式与共享控件 | 使用已复制的原生控件，保留远端数据绑定、权限、流式阅读锚点、懒加载、错误恢复和交互状态。 |
| 上下文占用进度环 | [usage](../src/client/usage.js) | 与原生 ContextMeter 的 14px viewBox、r=5.5、2px stroke、头尾角度和按百分比弧长对应。它是数据图表，不应换为静态图标；数据仍只取远端上报。 |

### 完整对话展示层与数据适配

本轮按用户确认扩大到**完整远端对话展示层**，不再只调整零散控件。展示副本只接收 props，不直接读取原生 Host 私有 Session/Chat/Lexical/附件 store：

- 既有远端事件/保留草稿 → 工具标题、配置选项、附件尺寸等纯模型 → 原生视图副本。
- 用户的发送、停止、模式切换、文件打开等意图 → 原有 ACP/SSH/文件授权回调。没有新建另一套会话状态机。
- 原生上层外壳（侧栏、工作区、设置）继续由 Host 提供，不复制整个应用，也不让远端操作误落到本地会话。

新增副本直接依据同一安装版中分发的源码（非推测的近似布局）：

| 上游包 | 源码组件/样式 | 本地边界 |
|---|---|---|
| `@deepseek-ai/dsh-client-ui-chat` | `src/client/chat/MessageItem.tsx`、`UserContent.tsx`、`AssistantMarkdown.tsx`、`MessageIconActions.tsx` 及对应 CSS | 本地消息展示层；事件分组、身份、文本/复制内容仍由既有 transcript 适配。 |
| `@deepseek-ai/dsh-client-ui-tool` | `src/client/tool/components/ToolRow.tsx`、`ToolRow.module.css`、`toolviews/GenericToolCard.tsx` | 本地工具行和完整详情；原生 DisclosureRow/TextShimmer 同时核对已分发 frontend。 |
| `@deepseek-ai/dsh-client-ui-conversation` | `src/client/skeleton/InputBar.tsx`、`InputBar.module.css`、`input/editor/DraftEditor.tsx` | 原生输入结构，远端 textarea 内容编辑适配，不复制 Host Lexical stores。 |
| `@deepseek-ai/dsh-client-ui-attachment` | `src/AttachmentRail.tsx`、`FileCard.tsx`、`MessageImage.tsx`、`client/ComposerAttachments.tsx` 及对应 CSS | 本地附件 rail/卡/图片，沿用授权加载器与上传回执。 |

InputBar 源身份（同安装版直接读取）：TSX SHA-256 `6832d81a8c45e515a41a0ef481b70441f433f26d1e858ac2647ab5dd8adb52a7`；CSS SHA-256 `31528d1dfe9d4dc7b214f9b2bfcff82cb1b51f77dd1516f58fe4cce247ebe360`。其它来源组件及行号见各副本头部；临时格式化目录不构成运行时依赖。

### 有意保留的差异

- 远端 SSH / Kerberos、worktree、运行环境准备、审批/问卷、输出溯源、文件上传/覆盖确认等业务流程，仍由插件实现，不能改成操作本地 DSH 会话的原生数据源。
- 图片查看使用插件授权 URL 与资源生命周期边界，不将远端文件路径交给本地文件服务；原生同款视图不扩大读取权限。
- Markdown 的图片/数学等未支持语法不会因外观迁移而伪称支持；继续执行原有安全链接策略。
- 正文、代码及辅助文字在原生 DSW typography 基线上保留既有 Host 字体偏好轴；这是明确的本地适配。
- 完成未读回执、安静侧栏隐藏、真实 turn 计时、完整输出复制、unknown exit 不推断成功等既有行为不变。
- 类名使用插件前缀；不依赖宿主编译 hash 类名，不修改宿主 DOM，不伪造会话事件。
- 工具分类只使用 ACP 结构化 kind，不从自由文本标题或 shell 命令猜类型；自定义原始标题、完整命令、错误及诊断保留在展开体。缺少 Web/Image 等专用结构时使用原生 generic 卡，不生成缺失的 bytes、增删行数、时间或进度。
- 工具行遵循原生 `div[role=button]` 内含文件按钮的结构，不在真正的 HTML button 中嵌套 button；文件 click/Enter/Space 与行展开隔离。这不等于声称完全没有嵌套交互语义，仍需真实辅助技术验证。
- 文件按钮只对单一、明确的结构化 location 提供入口，路径原值传入已有授权回调；行号只用于显示，不拼进文件路径。多位置摘要不会整串点击只打开首个文件。
- 原生 InputBar slots 改为 props，受控 textarea 代替 Host Lexical/DecoratorPortals。保留 ACP 命令、文件提示、IME、键盘、草稿和 ACK 协议；不宣称获得原生富文本编辑器、所有第三方 slot 或完整原生 Markdown 扩展。
- 原生布局对多 ACP 配置项、超窄面板、图片缩放、长错误反馈作有界适配；优先继承 Host 字体/宽度轴，缺失时才使用 fallback。复制按钮继续使用原有安全异步复制实现，按实际能力省略 fork/消息时钟等控件。

## 验证与后续升级

当前源码验证：**765 项自动化测试通过，76 个客户端模块构建通过**。纯模型、AST 与源契约测试覆盖组件接线、原生图标映射、公开模块边界、完整数据保留及交互控制逻辑；构建仍限制 runtime imports 为 Host React。独立源码/UX 复核发现并修复了复制 CSS 时的 SVG xmlns 命名误替换、窄面板多配置项挤压发送按钮、图片收窄后仍使用固定高度，以及 Host 宽度轴被本地声明覆盖/消费 fallback 不全的问题；附加回归覆盖这些边界。第一轮全量的旧 dock 结构断言已更新为实际 NativeComposerView 插槽接线，最终全量通过。

这些检查**不能替代浏览器视觉、Tab 顺序、原生 top-layer、实际滚动及焦点恢复验收**。当前没有连接的浏览器控制工具，因此不声称已经验证像素一致或真实页面交互。

后续升级 DSH 时，核对已安装版本的公开入口、发布件与主题合同，再有选择地同步本地副本；不要把这里的压缩符号或临时格式化行号作为稳定 API。安装、版本发布、提交和推送属于单独步骤，不因源码更新而自动执行。
