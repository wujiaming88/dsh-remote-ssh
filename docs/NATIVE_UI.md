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
| 操作与状态图标 | [图标库](../src/client/native-icons.js) | 47 份原生 SVG 结构、53 个语义映射；每个映射记录原符号。使用真实 path/fill/stroke/viewBox，不再散落手绘替代图标。每个实例隔离 SVG id。 |
| 文件图标 | 同一图标库及 [兼容入口](../src/client/ui.js) | 普通文件采用原生 ReferenceIcon，图像与代码文件采用原生 FileTypeIcon 几何；分类仍为插件的后缀策略，不宣称实现原生全部语言/文件类型图标。 |
| 运行标记 | 同一图标库及 [运行反馈](../src/client/transcript.js) | 使用原生静态 FishLogo；不冒称使用原生 Chat 的 APNG 动画。实际 turn 用时、等待与断线语义不变。 |
| Read / Diff / Terminal / Code / Markdown | [文本视图](../src/client/native-text-controls.js)、[样式](../src/client/native-text-controls.css) | 原符号 GB / rW / ZB / Zb / Bp 等。复制原生 DOM/CSS 视图；继续使用现有安全 Markdown parser、diffLines、终端控制序列清理与可靠复制生命周期。没有接入私有高亮、数学/脚注/文件服务或 ANSI 彩色引擎。 |
| 折叠行、用户气泡、composer、文件/设置/附件面板 | 对应页面样式与共享控件 | 采用原生来源的尺寸、布局、图标及主题值；保留远端数据绑定、流式阅读锚点、懒加载、错误恢复和交互状态。 |
| 上下文占用进度环 | [usage](../src/client/usage.js) | 与原生 ContextMeter 的 14px viewBox、r=5.5、2px stroke、头尾角度和按百分比弧长对应。它是数据图表，不应换为静态图标；数据仍只取远端上报。 |

### 有意保留的差异

- 远端 SSH / Kerberos、worktree、运行环境准备、审批/问卷、输出溯源、文件上传/覆盖确认等业务流程，仍由插件实现，不能改成操作本地 DSH 会话的原生数据源。
- 图片查看使用插件授权 URL 与资源生命周期边界，不将远端文件路径交给本地文件服务；原生同款视图不扩大读取权限。
- Markdown 的图片/数学等未支持语法不会因外观迁移而伪称支持；继续执行原有安全链接策略。
- 正文、代码及辅助文字在原生 DSW typography 基线上保留既有 Host 字体偏好轴；这是明确的本地适配。
- 完成未读回执、安静侧栏隐藏、真实 turn 计时、完整输出复制、unknown exit 不推断成功等既有行为不变。
- 类名使用插件前缀；不依赖宿主编译 hash 类名，不修改宿主 DOM，不伪造会话事件。

## 验证与后续升级

当前源码验证：**724 项自动化测试通过，65 个客户端模块构建通过**。纯模型、AST 与源契约测试覆盖组件接线、原生图标映射、公开模块边界、完整数据保留及交互控制逻辑；构建仍限制 runtime imports 为 Host React。独立源码/UX 复核发现的 wrapper 布局、可见行计数、命名区域、React 18 spinner 清理和下拉箭头点击区域问题已修复。

这些检查**不能替代浏览器视觉、Tab 顺序、原生 top-layer、实际滚动及焦点恢复验收**。当前没有连接的浏览器控制工具，因此不声称已经验证像素一致或真实页面交互。

后续升级 DSH 时，核对已安装版本的公开入口、发布件与主题合同，再有选择地同步本地副本；不要把这里的压缩符号或临时格式化行号作为稳定 API。安装、版本发布、提交和推送属于单独步骤，不因源码更新而自动执行。
