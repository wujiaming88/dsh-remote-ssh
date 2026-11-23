/**
 * @wujiaming88/dsh-remote-ssh — Client 半边（静态 DSH Web 插件，浏览器 bundle）
 *
 * 远程文件与远程终端已合并到内置「文件」和「终端」页签：
 *   - 远程文件：内置「文件」页签通过 fs.* 拦截直接 SSH 读写远程文件，无需同步。
 *     远程终端由内置「终端」页签提供（shell wrapper 自动 SSH）。
 *   - 远程终端：shell wrapper 自动检测工作区 .remote-ssh.json，在远程工作区中打开 SSH 终端。
 *     需在 better-sidebar 设置中将 shell 指向 wrapper 脚本（见 README）。
 * 仍保留隐藏的 remssh:editor 页签用于远程文件编辑器。
 * 在 DSH 设置页注册「远程连接」小节管理连接配置和远程工作区；
 * 同时接管原生「添加工作区」流程提供「本地目录 / 远程目录」两选。
 */
window.__ModuleLoader__.load({
  id: "@wujiaming88/dsh-remote-ssh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    var Modal = primitives.Modal;

    function h(tag, props) {
      var args = [tag, props];
      for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
      return React.createElement.apply(React, args);
    }

    var CSS =
      // 颜色全部使用 DSH 主题 token（--dsw-alias-*），跟随 body[data-ds-dark-theme] 自动切换明暗主题。
      ".rssh-row{margin:6px 0}.rssh-label{color:var(--dsw-alias-label-caption);font-size:11px;display:block;margin-bottom:2px}" +
      ".rssh-input{width:100%;box-sizing:border-box;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:5px 7px;margin:3px 0;font-size:12px}" +
      ".rssh-select{width:100%;box-sizing:border-box;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:5px 7px;margin:3px 0;font-size:12px}" +
      ".rssh-btn{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:4px 9px;cursor:pointer;font-size:12px}" +
      ".rssh-btn:hover{background:var(--dsw-alias-button-ghost-active-hover)}.rssh-btn:disabled{opacity:.5;cursor:default}" +
      ".rssh-card{padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;margin:8px 0;background:var(--dsw-alias-bg-layer-2)}" +
      ".rssh-title{font-weight:600;font-size:13px}.rssh-sub{color:var(--dsw-alias-label-tertiary);font-size:11px}" +
      ".rssh-actions{margin-top:6px;display:flex;gap:5px;flex-wrap:wrap}" +
      ".rssh-tree-item{display:flex;align-items:center;gap:5px;padding:3px 5px;cursor:pointer;border-radius:3px}" +
      ".rssh-tree-item:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".rssh-tree-dir{color:var(--dsw-alias-state-business-primary)}.rssh-tree-file{color:var(--dsw-alias-label-primary)}" +
      ".rssh-tree-size{color:var(--dsw-alias-label-caption);font-size:11px;margin-left:auto}" +
      ".rssh-pathbar{display:flex;gap:4px;align-items:center;margin:4px 0}" +
      ".rssh-pathbar .rssh-input{flex:1;margin:0}" +
      ".rssh-content{white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px;background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);padding:8px;border-radius:4px;margin-top:6px;max-height:400px;overflow:auto}" +
      ".rssh-terminal{background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);border-radius:4px;padding:6px;margin-top:8px;font-family:Consolas,monospace;font-size:12px}" +
      ".rssh-terminal-out{white-space:pre-wrap;max-height:320px;overflow:auto;min-height:120px;line-height:1.4}" +
      ".rssh-terminal-bar{display:flex;gap:5px;align-items:center;margin-bottom:4px}" +
      ".rssh-terminal-input-row{display:flex;gap:4px;margin-top:5px}.rssh-terminal-input-row .rssh-input{flex:1}" +
      ".rssh-ok{color:var(--dsw-alias-state-success-primary)}.rssh-err{color:var(--dsw-alias-state-error-primary)}.rssh-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:6px 0}" +
      ".rssh-empty{padding:12px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}" +
      ".rssh-flow-dialog{width:690px!important;max-width:94vw!important;min-width:460px;resize:horizontal;overflow:auto!important}" +
      // 添加工作区弹窗：上方本地/远程分段切换 + 路径栏 + 文件树
      ".rssh-seg{display:flex;gap:0;margin-bottom:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;overflow:hidden}" +
      ".rssh-seg-btn{flex:1;padding:7px 12px;text-align:center;cursor:pointer;font-size:12px;font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:none;transition:background .15s}" +
      ".rssh-seg-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".rssh-seg-btn.active{background:var(--dsw-alias-state-business-primary);color:#fff}" +
      ".rssh-pick-tree{border:1px solid var(--dsw-alias-border-l1);border-radius:4px;max-height:240px;overflow-y:auto;margin-top:4px;background:var(--dsw-alias-bg-layer-2)}" +
      ".rssh-pick-empty{padding:12px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11px}" +
      ".rssh-ui-page{display:flex;flex-direction:column;padding:4px 0 28px}.rssh-ui-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}.rssh-ui-ws{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:10px;padding-top:2px}.rssh-ui-ws:first-of-type{border-top:none;margin-top:0;padding-top:0}.rssh-ui-dialog{width:520px;max-width:94vw}.rssh-ui-import-list{max-height:320px;overflow-y:auto;padding-right:4px}.rssh-ui-danger{--dsh-button-outline-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}@media (hover: hover){.rssh-ui-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}}.rssh-ui-row:has(+ .rssh-ui-actions){border-bottom:none}" +
      ".rssh-ui-intro{margin:2px 0 12px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}" +
      ".rssh-ui-group{display:flex;flex-direction:column}" +
      ".rssh-ui-group-title{padding:20px 0 2px;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-secondary)}" +
      ".rssh-ui-group-desc{padding:2px 0 4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}" +
      ".rssh-ui-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}" +
      ".rssh-ui-row-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding-right:48px}@media (max-width:767px){.rssh-ui-row-text{padding-right:16px}}" +
      ".rssh-ui-row-title{font-size:14px;line-height:22px;font-weight:400;color:var(--dsw-alias-label-primary)}" +
      ".rssh-ui-row-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}" +
      ".rssh-ui-row-control{display:flex;align-items:center;gap:4px;flex:none;min-width:0;flex-wrap:wrap;justify-content:flex-end}" +
      ".rssh-ui-input{width:248px;max-width:44vw}" +
      ".rssh-ui-selector{display:inline-flex;align-items:center;gap:12px;height:36px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}" +
      "@media (hover: hover){.rssh-ui-selector:hover{background:var(--dsw-alias-interactive-bg-hover)}}" +
      ".rssh-ui-chevron{flex:none;color:var(--dsw-alias-label-tertiary)}" +
      ".rssh-ui-native-select{height:32px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:14px;padding:0 8px}" +
      ".rssh-ui-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin:0;padding:0 0 6px}" +
      ".rssh-ui-actions{display:flex;gap:8px;flex-wrap:wrap;padding:14px 0 4px}" +
      ".rssh-ui-note{margin:6px 0 0;font-size:12px;line-height:18px;white-space:pre-wrap}.rssh-ui-note-inline{margin-top:2px}.rssh-ui-native-input{height:32px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:14px;padding:0 8px;outline:none}" +
      ".rssh-ui-note-ok{color:var(--dsw-alias-state-success-primary)}" +
      ".rssh-ui-note-err{color:var(--dsw-alias-state-error-primary)}" +
      ".rssh-ui-empty{padding:14px 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
      ".rssh-ui-import-row{display:flex;align-items:center;gap:8px;padding:6px 0}" +
      ".rssh-ui-import-sub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}" +
      ".rssh-ui-native-btn{height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}" +
      ".rssh-ui-native-btn:disabled{opacity:.5;cursor:default}" +
      ".rssh-ui-native-check{width:16px;height:16px}" +
      ".rssh-ui-native-check-label{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer}" +
      ".ra-panel{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;padding:10px 12px;font-size:13px;color:var(--dsw-alias-label-primary)}" +
      ".ra-head{display:flex;align-items:center;gap:8px;justify-content:space-between}" +
      ".ra-title{font-size:14px;font-weight:500;line-height:22px}" +
      ".ra-head-actions{display:flex;align-items:center;gap:6px}" +
      ".ra-section{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin-top:2px}" +
      ".ra-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ra-agents{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ra-warn{color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:18px;margin:0}" +
      ".ra-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0;white-space:pre-wrap}" +
      ".ra-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:4px 0}" +
      ".ra-input{flex:1;min-width:0}" +
      ".ra-sessions{max-height:150px;overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:2px}" +
      ".ra-session{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--dsw-radius-sm);cursor:pointer}" +
      ".ra-session.active{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".ra-session-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}" +
      ".ra-session-title{font-size:13px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ra-session-sub{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ra-chat{display:flex;flex-direction:column;gap:6px;flex:1;min-height:0}" +
      ".ra-chat-head{display:flex;align-items:center;gap:8px;justify-content:space-between}" +
      ".ra-chat-title{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ra-output{flex:1;min-height:120px;overflow:auto;margin:0;padding:8px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:17px;white-space:pre-wrap;word-break:break-word}" +
      ".ra-compose{display:flex;gap:6px;align-items:center}" +
      ".ra-file-dialog{width:760px;max-width:94vw}" +
      ".ra-file-list{max-height:220px;overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:2px;margin:6px 0}" +
      ".ra-file-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--dsw-radius-sm);cursor:pointer;font-size:13px}" +
      ".ra-file-row:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".ra-file-size{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px}" +
      ".ra-file-image{display:block;max-width:100%;max-height:320px;border-radius:var(--dsw-radius-md);margin-top:6px}" +
      ".ra-file-preview{max-height:320px;overflow:auto;margin:6px 0 0;padding:8px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-markdown-code-block);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:17px;white-space:pre-wrap;word-break:break-word}" +
      ".ra-file-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}" +
      ".ra-download{display:inline-flex;align-items:center;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-primary);text-decoration:none;font-size:12px}" ;

    // ---- 国际化（跟随 DSH 设置中的语言自动切换）----
    var NS = "dsh-remote-ssh";
    var zh = {
      "tabs.files": "远程文件",
      "tabs.term": "远程终端",
      "settings.nav": "远程连接",
      "agents.title": "远程 Agent",
      "agents.desc": "在远端机器上识别并使用 Codex / Claude Code / Pi，或开一个 Shell 会话。",
      "agents.open": "打开 Agent 面板",
      "agents.refresh": "刷新",
      "agents.connection": "连接",
      "agents.detected": "远端 Agent",
      "agents.none": "未检测到 codex / claude / pi（请先在远端安装并登录）。",
      "agents.tmuxMissing": "远端没有 tmux，Agent 会话不可用。请先安装 tmux。",
      "agents.shell": "Shell",
      "agents.chat": "Chat",
      "agents.mode": "模式",
      "agents.cwd": "工作目录",
      "agents.create": "新建会话",
      "agents.sessions": "会话",
      "agents.emptySessions": "还没有会话。选一个 Agent 与目录后新建。",
      "agents.noActive": "选择一个会话查看输出。",
      "agents.send": "发送",
      "agents.interrupt": "Ctrl-C",
      "agents.kill": "结束会话",
      "agents.files": "文件",
      "agents.worktree": "从 worktree 新建",
      "agents.running": "运行中",
      "agents.exited": "已退出",
      "agents.noOutput": "（暂无输出）",
      "agents.detectFailed": "探测失败",
      "agents.createFailed": "创建会话失败",
      "agents.sendFailed": "发送失败",
      "agents.worktreeTitle": "从 Git worktree 新建会话",
      "agents.repo": "仓库目录",
      "agents.branch": "新分支",
      "agents.base": "基点（可选）",
      "agents.worktreeCreate": "创建 worktree",
      "agents.worktreeList": "已有 worktree",
      "agents.worktreeFailed": "创建 worktree 失败",
      "agents.filesTitle": "远端文件",
      "agents.upload": "上传",
      "agents.download": "下载",
      "agents.binary": "二进制文件，无法预览；可下载。",
      "agents.emptyDir": "空目录",
      "agents.close": "关闭",
      "agents.parent": "上级",
      "agents.pathPlaceholder": "远端目录或文件路径",
      "agents.openPath": "打开",
      "agents.loading": "加载中…",
      "agents.selectAgent": "选择 Agent",
      "settings.desc": "管理 Remote-SSH 的远程连接配置（SSH 密钥、Kerberos/GSSAPI 或密码认证）。",
      "settings.empty": "还没有连接配置。请在下方添加。",
      "settings.errLoad": "读取连接配置失败，请重试。",
      "settings.deleted": "已删除",
      "settings.deleteConnTitle": "删除连接？",
      "settings.deleteConnDesc": "将删除连接「{name}」及其远程工作区；本地镜像目录也会被清理，镜像里尚未推送的改动会丢失。远端文件不受影响。",
      "settings.deleteWsTitle": "删除远程工作区？",
      "settings.deleteWsDesc": "将删除远程工作区「{name}」及其本地镜像目录，尚未推送的改动会丢失。远端文件不受影响。",
      "settings.add": "添加连接",
      "settings.workspaces": "远程工作区",
      "settings.connections": "连接配置",
      "settings.name": "名称",
      "settings.namePlaceholder": "如：我的超算",
      "settings.host": "主机 host",
      "settings.hostPlaceholder": "login.example.com",
      "settings.port": "端口 port",
      "settings.user": "用户名 user",
      "settings.userPlaceholder": "your-username",
      "settings.auth": "认证方式",
      "settings.key": "密钥 (推荐)",
      "settings.password": "密码",
      "settings.kerberos": "Kerberos (GSSAPI)",
      "settings.kerberosHint": "使用本机 Kerberos 票据认证（kinit 之后由 ssh 走 GSSAPI）：插件不保存任何凭据。请先在终端执行 kinit <主名>，再用 klist 确认票据有效。",
      "settings.keyPath": "私钥路径 keyPath",
      "settings.keyPathPlaceholder": "~/.ssh/id_rsa",
      "settings.passwordField": "密码 password",
      "settings.remoteRoot": "远程根目录 remoteRoot",
      "settings.proxyJump": "跳板机 ProxyJump",
      "settings.test": "测试连接",
      "settings.saved": "已保存",
      "settings.connOk": "连接成功",
      "settings.connFail": "连接失败: ",
      "settings.errSave": "保存失败",
      "settings.guards": "写回与终端（进阶）",
      "settings.guardsHint": "终端起不来时，把 node 可执行文件的绝对路径填在这里（issue #23）；写回失败与远端新鲜度检查控制 agent 的 write/edit 要不要推到远端（issue #24）。",
      "settings.nodePath": "node 绝对路径 nodePath（留空 = 自动解析）",
      "settings.writeBackFailure": "写回推送失败时",
      "settings.wbError": "让模型看见（工具报错，推荐）",
      "settings.wbLog": "只写日志（不打扰模型）",
      "settings.writeBackFreshness": "推之前检查远端是否被改过（发现被改过就不推、并报告；推荐开着）",
      "settings.wsWriteBack": "该工作区启用写回（agent 的 write/edit 同步到远端）",
      "settings.wsWriteBackExclude": "写回排除（逗号或换行分隔，如 _patch/, *.log, wbdeep/**）",
      "settings.saveGuards": "保存这一项",
      "settings.wsSyncPaths": "同步范围（逗号或换行分隔，如 .dsh；留空 = 整树）",
      "settings.wsSyncExclude": "同步排除（逗号或换行分隔，如 data/, *.log）",
      "settings.wsSyncMaxBytes": "同步体积上限（GiB，留空 = 默认 2 GiB）",
      "settings.syncScope": "同步范围（进阶）",
      "settings.syncScopeHint": "只同步需要的子路径，避免整树 tar。对远程路径是 ~ 的工作区尤其重要：整树会先被体积上限拒绝（issue #28）。留空 = 整树。",
      "settings.defaultSyncPaths": "新工作区的默认同步范围（逗号或换行分隔）",
      "settings.defaultSyncExclude": "新工作区的默认同步排除",
      "settings.defaultSyncMaxBytes": "默认同步体积上限（GiB，留空 = 内置 2 GiB）",
      "sync.upDone": "推送完成",
      "sync.upFail": "推送失败: ",
      "common.selectProfile": "— 选择连接 —",
      "common.profile": "连接配置",
      "common.save": "保存",
      "common.open": "打开",
      "common.close": "关闭",
      "common.cancel": "取消",
      "common.retry": "重试",
      "common.noEntries": "（无子目录）",
      "common.delete": "删除",
      "common.up": "⬆ 上级",
      "common.loading": "加载中…",
      "common.processing": "处理中…",
      "common.errList": "读取目录失败",
      "files.workspace": "远程工作区",
      "files.selectWorkspace": "— 选择工作区 —",
      "files.orProfile": "或直接选连接配置",
      "files.defaultDir": "默认目录（打开该工作区时进入的远程目录）",
      "files.reading": "读取中…",
      "files.errRead": "读取失败",
      "files.errSave": "保存失败",
      "files.errSaveDefaultDir": "保存默认目录失败",
      "files.binary": "二进制文件，无法预览",
      "term.title": "终端 {id}",
      "term.exited": " (已退出)",
      "term.connecting": "正在连接…",
      "term.noOutput": "(无输出)",
      "term.inputPlaceholder": "输入命令后回车…",
      "term.send": "发送",
      "term.needProfile": "请先选择连接配置",
      "term.newTerminal": "+ 新建终端",
      "term.emptyHint": "从上面的连接配置新建一个终端，直接操作远程环境。",
      "term.errSpawn": "启动终端失败",
      "picker.dir": "目录",
      "picker.choose": "选择此目录",
      "picker.errNameEmpty": "目录名不能为空",
      "picker.errNameBad": "目录名不能包含 / 或 \\，也不能是 . 或 ..",
      "flow.localTitle": "选择本地目录",
      "flow.remoteTitle": "选择远程目录",
      "flow.localDir": "本地目录",
      "flow.remoteDir": "远程目录",
      "flow.addWsTitle": "添加工作区",
      "flow.localSeg": "📁 本地目录",
      "flow.remoteSeg": "🌐 远程目录",
      "flow.syncPaths": "同步范围（可选，留空 = 全局默认/整树）",
      "flow.browse": "浏览",
      "flow.chooseRemote": "选择远程目录…",
      "flow.backLocal": "← 选择本地目录",
      "flow.errCreate": "创建远程工作区失败",
      "flow.errMkdir": "新建目录失败",
      "settings.importSshConfig": "从 ~/.ssh/config 导入…",
      "settings.importTitle": "导入 ~/.ssh/config 主机",
      "settings.noneFound": "未在 ~/.ssh/config 中发现可用主机",
      "settings.imported": "已导入 {n} 个连接",
      "sync.down": "⬇ 同步",
      "sync.up": "⬆ 推送",
      "sync.syncing": "同步中…",
      "sync.pushing": "推送中…",
      "sync.done": "同步完成",
      "sync.fail": "同步失败",
      "ops.search": "🔍 搜索",
      "ops.find": "按名查找",
      "ops.searchPh": "正则或关键词…",
      "ops.globPh": "*.py",
      "ops.newDir": "📁 新建目录",
      "ops.newDirPh": "目录名",
      "ops.rename": "✏ 重命名/移动",
      "ops.renamePh": "目标路径",
      "ops.delete": "🗑 删除",
      "ops.confirmDel": "确认删除远程文件/目录？（不可恢复）",
      "ops.grepTitle": "远程内容搜索 (grep)",
      "ops.globTitle": "按文件名查找 (glob)",
      "ops.mkdirTitle": "新建远程目录",
      "ops.moveTitle": "移动/重命名",
      "ops.deleteTitle": "删除远程文件/目录",
      "ops.noMatch": "无匹配",
      "ops.done": "操作完成",
      "ops.fail": "操作失败"
    };
    var en = {
      "tabs.files": "Remote Files",
      "tabs.term": "Remote Terminal",
      "settings.nav": "Remote Connections",
      "agents.title": "Remote Agents",
      "agents.desc": "Detect and drive Codex / Claude Code / Pi on a remote host, or open a shell session.",
      "agents.open": "Open Agent Panel",
      "agents.refresh": "Refresh",
      "agents.connection": "Connection",
      "agents.detected": "Detected agents",
      "agents.none": "No codex / claude / pi found (install and sign in on the remote host first).",
      "agents.tmuxMissing": "tmux is not available on this host; agent sessions need tmux.",
      "agents.shell": "Shell",
      "agents.chat": "Chat",
      "agents.mode": "Mode",
      "agents.cwd": "Working directory",
      "agents.create": "New session",
      "agents.sessions": "Sessions",
      "agents.emptySessions": "No sessions yet. Pick an agent and a directory to start one.",
      "agents.noActive": "Select a session to see its output.",
      "agents.send": "Send",
      "agents.interrupt": "Ctrl-C",
      "agents.kill": "Kill session",
      "agents.files": "Files",
      "agents.worktree": "New from worktree",
      "agents.running": "Running",
      "agents.exited": "Exited",
      "agents.noOutput": "(no output yet)",
      "agents.detectFailed": "Detection failed",
      "agents.createFailed": "Could not create the session",
      "agents.sendFailed": "Send failed",
      "agents.worktreeTitle": "New session from a Git worktree",
      "agents.repo": "Repository directory",
      "agents.branch": "New branch",
      "agents.base": "Base (optional)",
      "agents.worktreeCreate": "Create worktree",
      "agents.worktreeList": "Existing worktrees",
      "agents.worktreeFailed": "Could not create the worktree",
      "agents.filesTitle": "Remote files",
      "agents.upload": "Upload",
      "agents.download": "Download",
      "agents.binary": "Binary file; preview unavailable. You can download it.",
      "agents.emptyDir": "Empty directory",
      "agents.close": "Close",
      "agents.parent": "Up",
      "agents.pathPlaceholder": "Remote directory or file path",
      "agents.openPath": "Open",
      "agents.loading": "Loading…",
      "agents.selectAgent": "Select agent",
      "settings.desc": "Manage Remote-SSH connection profiles (SSH key, Kerberos/GSSAPI, or password authentication).",
      "settings.empty": "No connection profiles yet. Add one below.",
      "settings.errLoad": "Failed to load connection profiles. Try again.",
      "settings.deleted": "Deleted",
      "settings.deleteConnTitle": "Delete connection?",
      "settings.deleteConnDesc": "Deletes the connection “{name}” and its remote workspaces. Local mirror directories are removed too, so any changes not pushed back are lost. Remote files are untouched.",
      "settings.deleteWsTitle": "Delete remote workspace?",
      "settings.deleteWsDesc": "Deletes the remote workspace “{name}” and its local mirror directory; changes not pushed back are lost. Remote files are untouched.",
      "settings.add": "Add Profile",
      "settings.workspaces": "Remote Workspaces",
      "settings.connections": "Connections",
      "settings.name": "Name",
      "settings.namePlaceholder": "e.g. My HPC",
      "settings.host": "Host",
      "settings.hostPlaceholder": "login.example.com",
      "settings.port": "Port",
      "settings.user": "User",
      "settings.userPlaceholder": "your-username",
      "settings.auth": "Authentication",
      "settings.key": "Key (recommended)",
      "settings.password": "Password",
      "settings.kerberos": "Kerberos (GSSAPI)",
      "settings.kerberosHint": "Uses the local Kerberos ticket cache (ssh GSSAPI after kinit). No credentials are stored: run kinit <principal> and confirm with klist first.",
      "settings.keyPath": "Private key path (keyPath)",
      "settings.keyPathPlaceholder": "~/.ssh/id_rsa",
      "settings.passwordField": "Password",
      "settings.remoteRoot": "Remote root (remoteRoot)",
      "settings.proxyJump": "ProxyJump (jump host)",
      "settings.test": "Test Connection",
      "settings.saved": "Saved",
      "settings.connOk": "Connected",
      "settings.connFail": "Connection failed: ",
      "settings.errSave": "Save failed",
      "settings.guards": "Write-back & terminal (advanced)",
      "settings.guardsHint": "If the integrated terminal cannot start, put the absolute path of node here (issue #23). The other two control whether the agent's write/edit is pushed to the remote (issue #24).",
      "settings.nodePath": "Absolute path of node (nodePath; empty = auto-resolve)",
      "settings.writeBackFailure": "When a write-back push fails",
      "settings.wbError": "Make it visible to the model (tool error, recommended)",
      "settings.wbLog": "Log only (do not disturb the model)",
      "settings.writeBackFreshness": "Check the remote before pushing (skip + report if it changed remotely; recommended on)",
      "settings.wsWriteBack": "Enable write-back for this workspace (agent write/edit syncs to the remote)",
      "settings.wsWriteBackExclude": "Write-back excludes (comma or newline separated, e.g. _patch/, *.log, wbdeep/**)",
      "settings.saveGuards": "Save this item",
      "settings.wsSyncPaths": "Sync scope (comma or newline separated, e.g. .dsh; empty = whole tree)",
      "settings.wsSyncExclude": "Sync excludes (comma or newline separated, e.g. data/, *.log)",
      "settings.wsSyncMaxBytes": "Sync size limit (GiB, empty = default 2 GiB)",
      "settings.syncScope": "Sync scope (advanced)",
      "settings.syncScopeHint": "Sync only the sub-paths you need instead of a whole-tree tar. This matters for workspaces whose remote path is ~ — a whole-tree sync is refused by the size sentinel first (issue #28). Empty = whole tree.",
      "settings.defaultSyncPaths": "Default sync scope for new workspaces (comma or newline separated)",
      "settings.defaultSyncExclude": "Default sync excludes for new workspaces",
      "settings.defaultSyncMaxBytes": "Default sync size limit (GiB, empty = built-in 2 GiB)",
      "sync.upDone": "Push complete",
      "sync.upFail": "Push failed: ",
      "common.selectProfile": "— Select profile —",
      "common.profile": "Profile",
      "common.save": "Save",
      "common.open": "Open",
      "common.close": "Close",
      "common.cancel": "Cancel",
      "common.retry": "Retry",
      "common.noEntries": "(no subdirectories)",
      "common.delete": "Delete",
      "common.up": "⬆ Up",
      "common.loading": "Loading…",
      "common.processing": "Processing…",
      "common.errList": "Failed to list directory",
      "files.workspace": "Remote Workspace",
      "files.selectWorkspace": "— Select workspace —",
      "files.orProfile": "or pick a profile directly",
      "files.defaultDir": "Default directory (entered when opening this workspace)",
      "files.reading": "Reading…",
      "files.errRead": "Failed to read",
      "files.errSave": "Failed to save",
      "files.errSaveDefaultDir": "Failed to save default directory",
      "files.binary": "Binary file — preview not available",
      "term.title": "Terminal {id}",
      "term.exited": " (exited)",
      "term.connecting": "Connecting…",
      "term.noOutput": "(no output)",
      "term.inputPlaceholder": "Type a command and press Enter…",
      "term.send": "Send",
      "term.needProfile": "Select a profile first",
      "term.newTerminal": "+ New terminal",
      "term.emptyHint": "Create a terminal from the profile above to operate the remote environment.",
      "term.errSpawn": "Failed to start terminal",
      "picker.dir": "Directory",
      "picker.choose": "Choose this directory",
      "picker.errNameEmpty": "Folder name cannot be empty",
      "picker.errNameBad": "Folder name cannot contain / or \\, nor be . or ..",
      "flow.localTitle": "Select Local Directory",
      "flow.remoteTitle": "Select Remote Directory",
      "flow.localDir": "Local directory",
      "flow.remoteDir": "Remote directory",
      "flow.addWsTitle": "Add Workspace",
      "flow.localSeg": "📁 Local",
      "flow.remoteSeg": "🌐 Remote",
      "flow.syncPaths": "Sync scope (optional, empty = global default / whole tree)",
      "flow.browse": "Browse",
      "flow.chooseRemote": "Choose remote directory…",
      "flow.backLocal": "← Choose local directory",
      "flow.errCreate": "Failed to create remote workspace",
      "flow.errMkdir": "Failed to create the folder",
      "settings.importSshConfig": "Import from ~/.ssh/config…",
      "settings.importTitle": "Import ~/.ssh/config hosts",
      "settings.noneFound": "No usable hosts found in ~/.ssh/config",
      "settings.imported": "Imported {n} connection(s)",
      "sync.down": "⬇ Sync",
      "sync.up": "⬆ Push",
      "sync.syncing": "Syncing…",
      "sync.pushing": "Pushing…",
      "sync.done": "Sync complete",
      "sync.fail": "Sync failed",
      "ops.search": "🔍 Search",
      "ops.find": "Find by name",
      "ops.searchPh": "regex or keyword…",
      "ops.globPh": "*.py",
      "ops.newDir": "📁 New dir",
      "ops.newDirPh": "dir name",
      "ops.rename": "✏ Rename/Move",
      "ops.renamePh": "target path",
      "ops.delete": "🗑 Delete",
      "ops.confirmDel": "Confirm delete remote file/dir? (irreversible)",
      "ops.grepTitle": "Remote content search (grep)",
      "ops.globTitle": "Find by name (glob)",
      "ops.mkdirTitle": "Create remote directory",
      "ops.moveTitle": "Move/Rename",
      "ops.deleteTitle": "Delete remote file/dir",
      "ops.noMatch": "No match",
      "ops.done": "Done",
      "ops.fail": "Operation failed"
    };
    var i18n = {
      t: function (key) { return key; },
      subscribe: function () { return function () {}; },
      getSnapshot: function () { return 0; }
    };
    function useT() {
      var state = React.useState(0);
      var force = state[1];
      React.useEffect(function () {
        return i18n.subscribe(function () { force(function (n) { return n + 1; }); });
      }, []);
      return i18n.t;
    }

    // ---- 跨会话切换的状态记忆（按 sessionId 分桶，模块级存活，页面刷新即失效）----
    var memoryBySession = {};
    function useSessionMemory(sessionId, key, initial) {
      var sid = sessionId || "global";
      var bucket = memoryBySession[sid] || (memoryBySession[sid] = {});
      var state = React.useState(function () {
        if (Object.prototype.hasOwnProperty.call(bucket, key)) return bucket[key];
        var init = typeof initial === "function" ? initial() : initial;
        return bucket[key] = init;
      });
      var value = state[0], setValue = state[1];
      React.useEffect(function () { bucket[key] = value; }, [value]);
      return [value, setValue];
    }

    // ---- 与 Host 半边的 JSON RPC ----
    async function api(method, args) {
      try {
        var r = await fetch("/remote-ssh/api/" + method, {
          method: "POST",
          headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
          body: JSON.stringify(args || {})
        });
        var j = await r.json();
        if (j && j.ok) return j.value;
        return { ok: false, error: (j && j.error && j.error.message) || ("HTTP " + r.status) };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    }

    // ---- 跨页签「打开工作区」的轻量共享选择 ----
    var sel = { workspaceId: null };
    var selListeners = [];
    function setSelWorkspace(id) { sel.workspaceId = id; selListeners.forEach(function (fn) { fn(); }); }
    function subscribeSel(fn) { selListeners.push(fn); return function () { var i = selListeners.indexOf(fn); if (i >= 0) selListeners.splice(i, 1); }; }

    // ---- 通用：拉取连接配置（refreshKey 变化时重新拉取，避免缓存过期）----
    function useProfiles(refreshKey) {
      var state = React.useState([]);
      var profiles = state[0], setProfiles = state[1];
      React.useEffect(function () {
        api("listProfiles").then(function (r) { if (r && r.ok) setProfiles(r.profiles || []); });
      }, [refreshKey]);
      return profiles;
    }

    function Field(props) {
      return h("div", { className: "rssh-row" },
        h("span", { className: "rssh-label" }, props.label),
        h("input", { className: "rssh-input", type: props.type || "text", value: props.value, placeholder: props.placeholder,
          onChange: function (e) { props.onChange(e.target.value); } })
      );
    }

    // ---- 设置页共享控件（复用 DSH 的 UI 原子）----
    // 内置设置页（通用 / 模型 / 插件）由 @deepseek-ai/dsh-client-ui-primitives 的
    // Button / Input / Menu / Switch / Checkbox / Modal 组成。本插件的设置页此前是自绘的
    // input / select / button 加 .rssh-* 样式，观感和交互都和内置页不一致；这里统一切到
    // 同一套原子，行布局也照内置设置行：左侧标题 + 说明，右侧控件，行间 0.5px 分隔线。
    // 老宿主的 primitives 若没有导出某个原子（DSH 0.1.x 线），退化成等价原生控件。
    function UiButton(props) {
      if (primitives.Button) return h(primitives.Button, props);
      return h("button", { type: "button", className: props.className || "rssh-ui-native-btn", disabled: props.disabled,
        title: props.title, "aria-label": props["aria-label"], onClick: props.onClick }, props.children);
    }

    function UiInput(props) {
      if (primitives.Input) return h(primitives.Input, props);
      return h("input", { className: "rssh-ui-native-input " + (props.className || "rssh-ui-input"), type: props.type || "text", value: props.value,
        placeholder: props.placeholder, disabled: props.disabled, inputMode: props.inputMode,
        autoComplete: props.autoComplete, "aria-label": props["aria-label"], onChange: props.onChange });
    }

    function UiCheckbox(props) {
      if (primitives.Checkbox) return h(primitives.Checkbox, props);
      return h("label", { className: "rssh-ui-native-check-label" },
        h("input", { type: "checkbox", className: "rssh-ui-native-check", checked: !!props.checked, disabled: props.disabled,
          onChange: function (e) { props.onChange(!!e.target.checked); } }),
        h("span", null, props.label)
      );
    }

    function SettingsRow(props) {
      return h("div", { className: "rssh-ui-row" },
        h("div", { className: "rssh-ui-row-text" },
          props.title ? h("div", { id: props.titleId || undefined, className: "rssh-ui-row-title" }, props.title) : null,
          props.description ? h("div", { className: "rssh-ui-row-desc" }, props.description) : null,
          props.children || null
        ),
        props.control === undefined || props.control === null ? null : h("div", { className: "rssh-ui-row-control" }, props.control)
      );
    }

    function SettingsGroup(props) {
      var uid = React.useId ? React.useId() : null;
      var titleId = uid ? uid + "-title" : undefined;
      return h("section", { className: "rssh-ui-group", "aria-labelledby": titleId },
        props.title ? h("h3", { id: titleId, className: "rssh-ui-group-title" }, props.title) : null,
        props.description ? h("div", { className: "rssh-ui-group-desc" }, props.description) : null,
        props.children
      );
    }

    function TextField(props) {
      var uid = React.useId ? React.useId() : null;
      var labelId = uid ? uid + "-label" : undefined;
      return h(SettingsRow, {
        title: props.label,
        titleId: labelId,
        description: props.description,
        control: h(UiInput, {
          className: "rssh-ui-input",
          type: props.type || "text",
          value: props.value,
          placeholder: props.placeholder,
          disabled: props.disabled,
          inputMode: props.inputMode,
          autoComplete: props.autoComplete,
          "aria-labelledby": labelId,
          "aria-label": labelId ? undefined : props.label,
          onChange: function (e) { props.onChange(e.target.value); }
        })
      });
    }

    /** 设置行的选择器：复用 Menu 交互（与内置「语言」「工作详情」行同一套）。 */
    function SelectField(props) {
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      var options = props.options || [];
      var current = null;
      for (var i = 0; i < options.length; i++) { if (options[i].id === props.value) { current = options[i]; break; } }
      var control;
      if (primitives.Menu && primitives.IconChevronDownOutlineRegular) {
        var trigger = h("button", {
          type: "button", className: "rssh-ui-selector",
          "aria-haspopup": "menu", "aria-expanded": open ? "true" : "false",
          "aria-label": props.label + ": " + (current ? current.label : String(props.value == null ? "" : props.value)),
          onClick: function () { setOpen(function (v) { return !v; }); }
        },
          h("span", null, current ? current.label : String(props.value == null ? "" : props.value)),
          h(primitives.IconChevronDownOutlineRegular, { className: "rssh-ui-chevron" })
        );
        control = h(primitives.Menu, {
          open: open,
          anchor: trigger,
          items: options,
          selectedId: props.value,
          onSelect: function (id) { setOpen(false); props.onChange(id); },
          onClose: function () { setOpen(false); },
          align: "end",
          portal: true
        });
      } else {
        control = h("select", {
          className: "rssh-ui-native-select", value: props.value, "aria-label": props.label, disabled: props.disabled,
          onChange: function (e) { props.onChange(e.target.value); }
        }, options.map(function (o) { return h("option", { key: o.id, value: o.id }, o.label); }));
      }
      return h(SettingsRow, { title: props.label, description: props.description, control: control });
    }

    function ToggleField(props) {
      var control = primitives.Switch
        ? h(primitives.Switch, { checked: !!props.checked, label: props.label, disabled: props.disabled, onChange: props.onChange })
        : h("input", { type: "checkbox", className: "rssh-ui-native-check", checked: !!props.checked, disabled: props.disabled,
          "aria-label": props.label, onChange: function (e) { props.onChange(!!e.target.checked); } });
      return h(SettingsRow, { title: props.label, description: props.description, control: control });
    }

    function SettingsNote(props) {
      if (!props.message) return null;
      return h("p", {
        className: "rssh-ui-note " + (props.ok ? "rssh-ui-note-ok" : "rssh-ui-note-err") + (props.inline ? " rssh-ui-note-inline" : ""),
        role: props.ok ? "status" : "alert"
      }, String(props.message));
    }

    // ---- 同步范围输入框 ↔ 宿主要的数据形状（issue #28）----
    // 输入框统一是「逗号或换行分隔」的文本，宿主存数组；体积上限界面按 GiB 填、宿主存字节。
    // 拆分语义要与宿主 normalizeSyncList 一致（逗号/换行/分号都认，去空白、丢空串）。

    /** 「逗号或换行分隔」的列表文本 → 数组。 */
    function splitList(value) {
      return String(value == null ? "" : value).split(/[\n,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    /** 字节数 → GiB 文本（空 = 用宿主内置默认上限）。 */
    function bytesToGibText(bytes) {
      var n = Number(bytes) || 0;
      if (!n) return "";
      return String(Math.round((n / 1073741824) * 100) / 100);
    }

    /** GiB 文本 → 字节；空/非法 → 0（= 用宿主内置默认上限）。 */
    function gibTextToBytes(text) {
      var n = parseFloat(String(text == null ? "" : text).replace(/[^0-9.]/g, ""));
      if (!isFinite(n) || n <= 0) return 0;
      return Math.round(n * 1073741824);
    }

    /** 宿主返回的偏好 → 界面状态（数组转文本，字节转 GiB）。 */
    function prefsForUi(p) {
      var v = p || {};
      return {
        nodePath: String(v.nodePath || ""),
        writeBackFailure: String(v.writeBackFailure || "error"),
        writeBackFreshness: v.writeBackFreshness !== false,
        defaultSyncPaths: (v.defaultSyncPaths || []).join(", "),
        defaultSyncExclude: (v.defaultSyncExclude || []).join(", "),
        defaultSyncMaxBytes: bytesToGibText(v.defaultSyncMaxBytes)
      };
    }

    // ======================================================================
    // 远程操作弹窗（grep / glob / mkdir / move / delete）
    // ======================================================================
    function OpsModal(props) {
      var d = props.opsDlg;
      var t = props.t;
      var patchOps = props.patchOps;
      var runOps = props.runOps;
      var title = ({
        grep: t("ops.grepTitle"), glob: t("ops.globTitle"), mkdir: t("ops.mkdirTitle"),
        move: t("ops.moveTitle"), delete: t("ops.deleteTitle")
      })[d.type] || "";
      var isGrep = d.type === "grep";
      var isGlob = d.type === "glob";
      var isMove = d.type === "move";
      var isDel = d.type === "delete";
      // 结果渲染
      var resultEl = null;
      if (d.result) {
        var r = d.result;
        if (isGrep) {
          var ms = r.matches || [];
          resultEl = h("div", { style: { maxHeight: 260, overflow: "auto", marginTop: 8, fontSize: 11, whiteSpace: "pre-wrap", fontFamily: "monospace" } },
            !r.ok ? h("div", { className: "rssh-err" }, r.error || t("ops.fail")) :
            ms.length === 0 ? h("div", { className: "rssh-muted" }, t("ops.noMatch")) :
            ms.map(function (m, i) { return h("div", { key: i }, m.file + ":" + m.line + ": " + m.content); }),
            r.truncated ? h("div", { className: "rssh-muted" }, "…") : null
          );
        } else if (isGlob) {
          var fs2 = r.files || [];
          resultEl = h("div", { style: { maxHeight: 260, overflow: "auto", marginTop: 8, fontSize: 11, whiteSpace: "pre-wrap", fontFamily: "monospace" } },
            !r.ok ? h("div", { className: "rssh-err" }, r.error || t("ops.fail")) :
            fs2.length === 0 ? h("div", { className: "rssh-muted" }, t("ops.noMatch")) :
            fs2.map(function (f, i) { return h("div", { key: i }, f); })
          );
        } else {
          // exec 结果（mkdir/move/delete）
          resultEl = h("div", { style: { marginTop: 8 } },
            r.ok ? h("div", { className: "rssh-ok" }, t("ops.done") + (r.stderr ? "  " + String(r.stderr).slice(0, 200) : "")) :
            h("div", { className: "rssh-err" }, (r.error || r.stderr || t("ops.fail")))
          );
        }
      }
      return h(Modal, { open: true, onClose: props.close, title: title, closeLabel: t("common.close"), className: "rssh-flow-dialog" },
        h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          h("input", { className: "rssh-input", value: d.p1, onChange: function (e) { patchOps({ p1: e.target.value }); }, placeholder: isGrep ? t("ops.searchPh") : (isGlob ? t("ops.globPh") : t("ops.newDirPh")) }),
          isGrep ? h("input", { className: "rssh-input", value: d.p2, onChange: function (e) { patchOps({ p2: e.target.value }); }, placeholder: "*.py (include)" }) : null,
          isMove ? h("input", { className: "rssh-input", value: d.p2, onChange: function (e) { patchOps({ p2: e.target.value }); }, placeholder: t("ops.renamePh") }) : null,
          h("div", { className: "rssh-actions" },
            h("button", { className: "rssh-btn", onClick: runOps, disabled: d.busy }, d.busy ? t("common.processing") : (isDel ? t("ops.delete") : t("common.save"))),
            h("button", { className: "rssh-btn", onClick: props.close, disabled: d.busy }, t("common.close"))
          ),
          resultEl
        )
      );
    }

    // ======================================================================
    // 远程文件页签
    // ======================================================================
    function FilesTab(props) {
      var t = useT();
      var sessionId = props.sessionId;
      var betterSidebar = props.betterSidebar;
      var [workspaces, setWorkspaces] = React.useState([]);
      var profiles = useProfiles();
      var [wsId, setWsId] = useSessionMemory(sessionId, "wsId", sel.workspaceId);
      var [profileId, setProfileId] = useSessionMemory(sessionId, "profileId", "");
      var [path, setPath] = useSessionMemory(sessionId, "path", "");
      var [entries, setEntries] = useSessionMemory(sessionId, "entries", []);
      var [err, setErr] = React.useState(null);
      var [loading, setLoading] = React.useState(false);
      var [defaultDir, setDefaultDir] = useSessionMemory(sessionId, "defaultDir", "");
      var [opsDlg, setOpsDlg] = React.useState(null); // { type, p1, p2, result, busy }

      React.useEffect(function () {
        api("listWorkspaces").then(function (r) { if (r && r.ok) setWorkspaces(r.workspaces || []); });
        return subscribeSel(function () { setWsId(sel.workspaceId); });
      }, []);

      function load(targetProfile, targetPath) {
        setLoading(true); setErr(null);
        api("listDir", { profileId: targetProfile, path: targetPath }).then(function (r) {
          setLoading(false);
          if (r && r.ok) { setEntries(r.entries || []); setPath(r.path || targetPath); }
          else setErr((r && r.error) || t("common.errList"));
        });
      }

      // 工作区/配置选择变化时进入对应目录
      React.useEffect(function () {
        if (!wsId && !profileId) return;
        var pid = profileId;
        var rootPath = "";
        if (wsId) {
          var ws = workspaces.find(function (w) { return w.id === wsId; });
          if (ws) { pid = ws.profileId; rootPath = ws.remotePath; }
        }
        if (!pid) return;
        setProfileId(pid);
        load(pid, rootPath || undefined);
      }, [wsId, profileId, workspaces]);

      // 选中工作区时，把「默认目录」输入框同步为该工作区的 remotePath。
      React.useEffect(function () {
        if (wsId) {
          var ws = workspaces.find(function (w) { return w.id === wsId; });
          if (ws) setDefaultDir(ws.remotePath || "");
        }
      }, [wsId, workspaces]);

      function saveDefaultDir() {
        if (!wsId) return;
        api("updateWorkspace", { id: wsId, remotePath: defaultDir }).then(function (r) {
          if (r && r.ok) { setWorkspaces(r.workspaces || []); setErr(null); }
          else setErr((r && r.error) || t("files.errSaveDefaultDir"));
        });
      }

      function activeProfileId() {
        if (wsId) {
          var ws = workspaces.find(function (w) { return w.id === wsId; });
          if (ws) return ws.profileId;
        }
        return profileId;
      }
      function opsBase() {
        if (wsId) {
          var ws = workspaces.find(function (w) { return w.id === wsId; });
          if (ws) return ws.remotePath || path || "~";
        }
        return path || "~";
      }
      function openOps(type) {
        var init = { type: type, p1: "", p2: "", result: null, busy: false };
        if (type === "mkdir") init.p1 = path ? (path.replace(/\/+$/, "") + "/") : "";
        if (type === "move") { init.p1 = path ? (path.replace(/\/+$/, "") + "/") : ""; init.p2 = path ? (path.replace(/\/+$/, "") + "/") : ""; }
        if (type === "delete") init.p1 = path ? (path.replace(/\/+$/, "") + "/") : "";
        setOpsDlg(init);
      }
      function patchOps(patch) {
        setOpsDlg(function (d) { var n = {}; for (var k in d) n[k] = d[k]; for (var k2 in patch) n[k2] = patch[k2]; return n; });
      }
      function runOps() {
        if (!opsDlg) return;
        var pid = activeProfileId();
        if (!pid) { patchOps({ result: { ok: false, msg: t("ops.fail") }, busy: false }); return; }
        var base = opsBase();
        var d = opsDlg;
        patchOps({ busy: true, result: null });
        function resolveP(p) {
          if (!p) return p;
          var c = String(p).charAt(0);
          if (c === "/" || c === "~") return p;
          return base.replace(/\/+$/, "") + "/" + p;
        }
        if (d.type === "grep") {
          api("grep", { profileId: pid, pattern: d.p1, path: base, include: d.p2 || undefined }).then(function (r) {
            patchOps({ busy: false, result: r });
          });
        } else if (d.type === "glob") {
          api("glob", { profileId: pid, pattern: d.p1, path: base }).then(function (r) {
            patchOps({ busy: false, result: r });
          });
        } else if (d.type === "mkdir") {
          api("mkdir", { profileId: pid, path: resolveP(d.p1) }).then(function (r) {
            patchOps({ busy: false, result: r });
            if (r && r.ok) { setErr(null); load(pid, path); }
          });
        } else if (d.type === "move") {
          api("move", { profileId: pid, src: resolveP(d.p1), dst: resolveP(d.p2) }).then(function (r) {
            patchOps({ busy: false, result: r });
            if (r && r.ok) { setErr(null); load(pid, path); }
          });
        } else if (d.type === "delete") {
          api("deleteFile", { profileId: pid, path: resolveP(d.p1) }).then(function (r) {
            patchOps({ busy: false, result: r });
            if (r && r.ok) { setErr(null); load(pid, path); }
          });
        }
      }

      function openEntry(e) {
        var base = path ? (path.replace(/\/+$/, "") + "/" + e.name) : e.name;
        if (e.type === "directory") {
          setPath(base);
          load(profileId, base);
        } else {
          // 用独立页签预览远程文件（与内置「文件」页签一致），而非在文件树下方预览。
          if (betterSidebar && betterSidebar.openTab) {
            betterSidebar.openTab({
              type: "remssh:editor",
              id: "remssh:editor:" + profileId + ":" + base,
              title: e.name,
              path: base,
              meta: { profileId: profileId, remotePath: base }
            }, { sessionId: sessionId });
          }
        }
      }

      function goUp() {
        if (!path) return;
        var parts = path.replace(/\/+$/, "").split("/");
        parts.pop();
        var up = parts.join("/") || "/";
        setPath(up);
        load(profileId, up);
      }

      return h("div", { style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" } },
        h("div", { style: { flex: "none" } },
          h("div", { className: "rssh-row" },
            h("span", { className: "rssh-label" }, t("files.workspace")),
            h("select", { className: "rssh-select", value: wsId || "", onChange: function (e) { setWsId(e.target.value); setProfileId(""); } },
              h("option", { value: "" }, t("files.selectWorkspace")),
              workspaces.map(function (w) { return h("option", { key: w.id, value: w.id }, w.title); })
            )
          ),
          h("div", { className: "rssh-row" },
            h("span", { className: "rssh-label" }, t("files.orProfile")),
            h("select", { className: "rssh-select", value: profileId, onChange: function (e) { setProfileId(e.target.value); setWsId(""); } },
              h("option", { value: "" }, t("common.selectProfile")),
              profiles.map(function (p) { return h("option", { key: p.id, value: p.id }, p.name); })
            )
          ),
          wsId ? h("div", { className: "rssh-row" },
            h("span", { className: "rssh-label" }, t("files.defaultDir")),
            h("div", { className: "rssh-pathbar" },
              h("input", { className: "rssh-input", value: defaultDir, onChange: function (e) { setDefaultDir(e.target.value); }, placeholder: "/home/user/project" }),
              h("button", { className: "rssh-btn", onClick: saveDefaultDir }, t("common.save"))
            )
          ) : null,
          h("div", { className: "rssh-pathbar" },
            h("input", { className: "rssh-input", value: path, onChange: function (e) { setPath(e.target.value); }, placeholder: "/home/user" }),
            h("button", { className: "rssh-btn", onClick: function () { load(profileId, path); } }, t("common.open")),
            h("button", { className: "rssh-btn", onClick: goUp }, t("common.up"))
          ),
          wsId ? h("div", { className: "rssh-pathbar", style: { flexWrap: "wrap" } },
            h("button", { className: "rssh-btn", onClick: function () { openOps("grep"); } }, t("ops.search")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("glob"); } }, t("ops.find")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("mkdir"); } }, t("ops.newDir")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("move"); } }, t("ops.rename")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("delete"); } }, t("ops.delete"))
          ) : (wsId || profileId) ? h("div", { className: "rssh-pathbar", style: { flexWrap: "wrap" } },
            h("button", { className: "rssh-btn", onClick: function () { openOps("grep"); } }, t("ops.search")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("glob"); } }, t("ops.find")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("mkdir"); } }, t("ops.newDir")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("move"); } }, t("ops.rename")),
            h("button", { className: "rssh-btn", onClick: function () { openOps("delete"); } }, t("ops.delete"))
          ) : null,
          loading ? h("div", { className: "rssh-muted" }, t("common.loading")) : null,
          err ? h("div", { className: "rssh-err", style: { whiteSpace: "pre-wrap" } }, err) : null,
          opsDlg ? h(OpsModal, { opsDlg: opsDlg, patchOps: patchOps, runOps: runOps, close: function () { setOpsDlg(null); }, t: t }) : null
        ),
        h("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", marginTop: 6 } },
          entries.map(function (e) {
            return h("div", { key: e.name, className: "rssh-tree-item", onClick: function () { openEntry(e); } },
              h("span", { className: e.type === "directory" ? "rssh-tree-dir" : "rssh-tree-file" }, e.type === "directory" ? "📁 " + e.name : "📄 " + e.name),
              e.type === "file" ? h("span", { className: "rssh-tree-size" }, String(e.size)) : null
            );
          })
        )
      );
    }

    // ======================================================================
    // 远程文件编辑器页签：点击文件树中的文件后单开一栏预览/编辑（与内置「文件」页签一致）
    // ======================================================================
    function RemoteEditor(props) {
      var t = useT();
      var tab = props.tab || {};
      var ctx = props.ctx;
      var meta = tab.meta || {};
      var profileId = meta.profileId || "";
      var remotePath = tab.path || meta.remotePath || "";
      var [data, setData] = React.useState({ loading: true, content: "", binary: false, dirty: false, error: null });

      React.useEffect(function () {
        var alive = true;
        setData({ loading: true, content: "", binary: false, dirty: false, error: null });
        api("readFile", { profileId: profileId, path: remotePath }).then(function (r) {
          if (!alive) return;
          if (r && r.ok) setData({ loading: false, content: r.content || "", binary: !!r.binary, dirty: false, error: null });
          else setData({ loading: false, content: "", binary: false, dirty: false, error: (r && r.error) || t("files.errRead") });
        });
        return function () { alive = false; };
      }, [profileId, remotePath]);

      function save() {
        api("writeFile", { profileId: profileId, path: remotePath, content: data.content }).then(function (r) {
          if (r && r.ok) setData(Object.assign({}, data, { dirty: false, error: null }));
          else setData(Object.assign({}, data, { error: (r && r.error) || t("files.errSave") }));
        });
      }

      function close() {
        if (ctx && ctx.betterSidebar && tab.id) ctx.betterSidebar.closeTab(tab.id);
      }

      if (data.loading) return h("div", { className: "rssh-muted", style: { padding: 8 } }, t("files.reading"));
      if (data.error) return h("div", { className: "rssh-err", style: { padding: 8, whiteSpace: "pre-wrap" } }, data.error);
      if (data.binary) return h("div", { className: "rssh-muted", style: { padding: 8 } }, t("files.binary"));

      return h("div", { style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: 8, overflow: "hidden" } },
        h("div", { className: "rssh-pathbar", style: { flex: "none" } },
          h("span", { className: "rssh-title", style: { flex: 1, wordBreak: "break-all" } }, remotePath),
          h("button", { className: "rssh-btn", onClick: save }, t("common.save")),
          h("button", { className: "rssh-btn", onClick: close }, t("common.close"))
        ),
        h("textarea", { className: "rssh-content", style: { flex: 1, minHeight: 0, maxHeight: "none", width: "100%", boxSizing: "border-box", background: "var(--dsw-alias-markdown-code-block)", color: "var(--dsw-alias-label-primary)", border: "1px solid var(--dsw-alias-border-l2)" },
          value: data.content, onChange: function (e) { setData(Object.assign({}, data, { content: e.target.value, dirty: true })); } })
      );
    }

    // ======================================================================
    // 远程终端页签
    // ======================================================================
    function TerminalView(props) {
      var t = useT();
      var [data, setData] = React.useState("");
      var [status, setStatus] = React.useState("running");
      var [input, setInput] = React.useState("");
      var endRef = React.useRef(null);

      React.useEffect(function () {
        var timer = setInterval(function () {
          api("terminalRead", { id: props.id }).then(function (r) {
            if (r && r.ok) {
              if (r.data) setData(function (d) { return d + r.data; });
              if (r.status) setStatus(r.status);
            }
          });
        }, 200);
        return function () { clearInterval(timer); };
      }, [props.id]);

      React.useEffect(function () {
        if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight;
      }, [data]);

      function send() {
        if (!input) return;
        api("terminalWrite", { id: props.id, data: input + "\r" });
        setInput("");
      }

      return h("div", { className: "rssh-terminal" },
        h("div", { className: "rssh-terminal-bar" },
          h("span", { style: { flex: 1, color: status === "running" ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)" } }, t("term.title", { id: props.id }) + (status === "exited" ? t("term.exited") : "")),
          h("button", { className: "rssh-btn", onClick: function () { props.onClose(props.id); } }, t("common.close"))
        ),
        h("div", { className: "rssh-terminal-out", ref: endRef }, data || (status === "running" ? t("term.connecting") : t("term.noOutput"))),
        h("div", { className: "rssh-terminal-input-row" },
          h("input", { className: "rssh-input", value: input,
            onChange: function (e) { setInput(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") send(); },
            placeholder: t("term.inputPlaceholder") }),
          h("button", { className: "rssh-btn", onClick: send }, t("term.send"))
        )
      );
    }

    function TerminalTab(props) {
      var t = useT();
      var sessionId = props.sessionId;
      var profiles = useProfiles();
      var [profileId, setProfileId] = useSessionMemory(sessionId, "profileId", "");
      var [terms, setTerms] = useSessionMemory(sessionId, "terms", []);
      var [err, setErr] = React.useState(null);

      function spawn() {
        if (!profileId) { setErr(t("term.needProfile")); return; }
        setErr(null);
        api("spawnTerminal", { profileId: profileId }).then(function (r) {
          if (r && r.ok) setTerms(function (list) { return list.concat([{ id: r.id }]); });
          else setErr((r && r.error) || t("term.errSpawn"));
        });
      }

      function close(id) {
        api("terminalClose", { id: id });
        setTerms(function (list) { return list.filter(function (x) { return x.id !== id; }); });
      }

      return h("div", null,
        h("div", { className: "rssh-row" },
          h("span", { className: "rssh-label" }, t("common.profile")),
          h("select", { className: "rssh-select", value: profileId, onChange: function (e) { setProfileId(e.target.value); } },
            h("option", { value: "" }, t("common.selectProfile")),
            profiles.map(function (p) { return h("option", { key: p.id, value: p.id }, p.name); })
          )
        ),
        h("button", { className: "rssh-btn", onClick: spawn }, t("term.newTerminal")),
        err ? h("div", { className: "rssh-err", style: { marginTop: 6 } }, err) : null,
        terms.length === 0 ? h("div", { className: "rssh-empty" }, t("term.emptyHint")) : null,
        terms.map(function (term) { return h(TerminalView, { key: term.id, id: term.id, onClose: close }); })
      );
    }

    // ======================================================================
    // 目录选择器（供「添加工作区」弹窗流程使用：本地 browse / 远程 SSH）
    // ======================================================================
    // 本地目录列举：走 DSH browse 能力（无原生对话框时替代 pickDirectory）。
    function localListFn(workspaces, p) {
      // 走 better-sidebar 的 fs.tree 端点（已被本插件拦截，本地工作区走本地 fs）
      // 不依赖 workspaces.listDirectory（需要 browse capability，可能被禁用）
      return fetch("/sidebar/api/fs.tree", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "", path: p || "" })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) return { ok: false, error: (j && j.error && j.error.message) || "list failed" };
        var v = j.value || {};
        return {
          ok: true,
          path: v.path || p || "",
          entries: (v.entries || []).filter(function (e) { return e.isDir; }).map(function (e) { return { name: e.name, type: "directory", path: e.path }; })
        };
      }).catch(function (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      });
    }

    // 远程目录列举：走本插件 SSH API，并为每条记录补全绝对 path。
    function remoteListFn(profileId, p) {
      return api("listDir", { profileId: profileId, path: p }).then(function (r) {
        if (!(r && r.ok)) return r;
        var parent = r.path || "";
        var entries = (r.entries || []).map(function (e) {
          return { name: e.name, type: e.type, path: (parent ? parent.replace(/\/+$/, "") + "/" : "") + e.name };
        });
        return { ok: true, path: r.path, entries: entries };
      });
    }

    // 计算父目录，兼容 Windows(\\) 与 POSIX(/) 分隔符。
    function parentOf(path) {
      if (!path) return null;
      var str = String(path).replace(/[\/\\]+$/, "");
      if (str === "") return null;
      var idx = Math.max(str.lastIndexOf("/"), str.lastIndexOf("\\"));
      if (idx < 0) return null;
      var parent = str.slice(0, idx);
      if (/^[A-Za-z]:$/.test(parent)) return parent + "\\";
      if (parent === "") return "/";
      return parent;
    }

    // 新建目录名校验（issue #11）：返回 i18n 键，合法则返回 null。
    // 只接受单个路径段——分隔符会让「在 path 下新建」变成任意位置写入。
    function newDirNameError(name) {
      var s = String(name == null ? "" : name).trim();
      if (!s) return "picker.errNameEmpty";
      if (s === "." || s === "..") return "picker.errNameBad";
      if (s.indexOf("/") >= 0 || s.indexOf("\\") >= 0) return "picker.errNameBad";
      return null;
    }

    // 把子目录名拼到基路径之后：沿用基路径的分隔符（Windows 反斜杠 / POSIX 斜杠），
    // 并保留根路径语义（"/" + name、"C:\" + name）。
    function joinChild(base, name) {
      var raw = String(base == null ? "" : base);
      var b = raw.replace(/[\/\\]+$/, "");
      if (!b) return (raw.charAt(0) === "/" ? "/" : "") + String(name);
      var sep = (b.indexOf("\\") >= 0 && b.indexOf("/") < 0) || /^[A-Za-z]:$/.test(b) ? "\\" : "/";
      return b + sep + String(name);
    }

    // 通用目录选择器：listFn(path) 返回 {ok, path, entries:[{name,type,path}]}。
    // resetKey 变化（如远程切换连接）时从根目录重新加载。
    // createFn(path, name)（可选）：在当前目录下新建子目录，远程/本地由调用方分流（issue #11）。
    function DirPicker(props) {
      var t = useT();
      var [path, setPath] = React.useState("");
      var [entries, setEntries] = React.useState([]);
      var [err, setErr] = React.useState(null);
      var [loading, setLoading] = React.useState(false);
      var [newDir, setNewDir] = React.useState(null); // { name, busy, error } | null

      var listFnRef = React.useRef(props.listFn);
      listFnRef.current = props.listFn;

      function load(p) {
        setLoading(true); setErr(null);
        listFnRef.current(p).then(function (r) {
          setLoading(false);
          if (r && r.ok) { setEntries(r.entries || []); setPath(r.path || p || ""); }
          else setErr((r && r.error) || t("common.errList"));
        });
      }
      React.useEffect(function () { load(undefined); }, [props.resetKey]);

      function enterDir(e) { load(e.path); }
      function goUp() {
        var up = parentOf(path);
        if (up !== null) load(up);
      }

      // 打开按钮：按输入框路径加载该路径下的文件树。空路径时打开主目录。
      function open() {
        load(path || undefined);
      }

      // 在当前 path 下新建子目录（远程/本地由 createFn 分流），成功后进入该目录，
      // 便于紧接着点「选择此目录」——对齐 VSCode「新建文件夹」的交互预期（issue #11）。
      function submitNewDir() {
        if (!newDir || !props.createFn) return;
        var name = String(newDir.name || "").trim();
        var invalid = newDirNameError(name);
        if (invalid) { setNewDir({ name: name, busy: false, error: t(invalid) }); return; }
        setNewDir({ name: name, busy: true, error: null });
        Promise.resolve(props.createFn(path, name)).then(function (r) {
          if (r && r.ok) {
            setNewDir(null);
            load((r && r.path) || joinChild(path, name));
          } else {
            setNewDir({ name: name, busy: false, error: (r && r.error) || t("common.errList") });
          }
        }).catch(function (e) {
          setNewDir({ name: name, busy: false, error: String(e && e.message ? e.message : e) });
        });
      }

      // 路径栏：输入框（回车导航）+ 打开按钮（紧挨在右侧）+ 上级
      return h("div", null,
        h("div", { className: "rssh-pathbar" },
          h("input", { className: "rssh-input", value: path,
            onChange: function (e) { setPath(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") { e.preventDefault(); open(); } },
            placeholder: props.placeholder || t("picker.dir") }),
          h("button", { className: "rssh-btn", onClick: open, disabled: loading }, t("common.open")),
          h("button", { className: "rssh-btn", onClick: goUp }, t("common.up"))
        ),
        // 新建目录输入行（点底部「新建目录」按钮后出现）
        newDir ? h("div", { className: "rssh-pathbar", style: { marginTop: 6 } },
          h("input", { className: "rssh-input", value: newDir.name, autoFocus: true,
            placeholder: t("ops.newDirPh"),
            onChange: function (e) { setNewDir({ name: e.target.value, busy: false, error: null }); },
            onKeyDown: function (e) { if (e.key === "Enter") { e.preventDefault(); submitNewDir(); } } }),
          h("button", { className: "rssh-btn", onClick: submitNewDir, disabled: newDir.busy }, newDir.busy ? t("common.processing") : t("common.save")),
          h("button", { className: "rssh-btn", onClick: function () { setNewDir(null); }, disabled: newDir.busy }, t("common.close"))
        ) : null,
        newDir && newDir.error ? h("div", { className: "rssh-err" }, newDir.error) : null,
        loading ? h("div", { className: "rssh-muted" }, t("common.loading")) : null,
        err ? h("div", { className: "rssh-err" }, err) : null,
        // 当前路径下的文件树（仅目录可进入）
        h("div", { className: "rssh-pick-tree" },
          (entries.filter(function (e) { return e.type === "directory"; })).length === 0 && !loading
            ? h("div", { className: "rssh-pick-empty" }, t("common.noEntries"))
            : entries.filter(function (e) { return e.type === "directory"; }).map(function (e) {
              return h("div", { key: e.path || e.name, className: "rssh-tree-item", onClick: function () { enterDir(e); } },
                h("span", { className: "rssh-tree-dir" }, "📁 " + e.name));
            })
        ),
        h("div", { className: "rssh-actions", style: { marginTop: 8 } },
          h("button", { className: "rssh-btn", disabled: !path || props.disabled, onClick: function () { props.onChoose(path); } }, t("picker.choose")),
          props.createFn ? h("button", { className: "rssh-btn",
            disabled: !path || loading || props.disabled || !!(newDir && newDir.busy),
            onClick: function () { setNewDir({ name: "", busy: false, error: null }); } }, t("ops.newDir")) : null
        )
      );
    }

    function RemoteWorkspaceFlow(props) {
      var t = useT();
      var [mode, setMode] = React.useState("local");
      var profiles = useProfiles(props.open);
      var [profileId, setProfileId] = React.useState("");
      var [creating, setCreating] = React.useState(false);
      // 同步范围（issue #28 第 2 条）：建区时就能定，留空 = 全局默认（再留空 = 整树）。
      var [syncPaths, setSyncPaths] = React.useState("");

      // 每次打开流程时重置为「本地目录」起始界面。
      React.useEffect(function () {
        if (props.open) { setMode("local"); setProfileId(""); setSyncPaths(""); }
      }, [props.open]);

      if (!props.open) return null;

      function chooseLocal(p) { props.onPicked(p); }

      function chooseRemote(remotePath) {
        setCreating(true);
        // 同步范围（issue #28）：非空才传，空 = 让宿主用「全局默认」兜底（再空 = 整树）
        var payload = { profileId: profileId, remotePath: remotePath };
        var scope = splitList(syncPaths);
        if (scope.length) payload.syncPaths = scope;
        api("createRemoteWorkspace", payload).then(function (r) {
          setCreating(false);
          if (r && r.ok && r.mirrorPath) props.onPicked(r.mirrorPath);
          else props.onError((r && r.error) || t("flow.errCreate"));
        });
      }

      var canClose = !creating && !props.busy;
      var isRemote = mode === "remote";

      // 统一弹窗：上方本地/远程分段切换 → 远程时显示连接选择 → 路径栏（浏览按钮紧挨右侧）→ 文件树
      return h(Modal, { open: true, onClose: function () { if (canClose) props.onCancel(); }, title: t("flow.addWsTitle"), closeLabel: t("common.close"), className: "rssh-flow-dialog" },
        h("div", { style: { padding: 8 } },
          creating || props.busy ? h("div", { className: "rssh-muted" }, t("common.processing")) : null,
          // 分段切换：本地 / 远程
          h("div", { className: "rssh-seg" },
            h("button", { className: "rssh-seg-btn" + (isRemote ? "" : " active"), onClick: function () { setMode("local"); }, disabled: !!props.busy || creating }, t("flow.localSeg")),
            h("button", { className: "rssh-seg-btn" + (isRemote ? " active" : ""), onClick: function () { setMode("remote"); }, disabled: !!props.busy || creating }, t("flow.remoteSeg"))
          ),
          // 远程模式：连接配置选择
          isRemote ? h("div", { className: "rssh-row" },
            h("span", { className: "rssh-label" }, t("common.profile")),
            h("select", { className: "rssh-select", value: profileId, onChange: function (e) { setProfileId(e.target.value); }, disabled: creating },
              h("option", { value: "" }, t("common.selectProfile")),
              profiles.map(function (p) { return h("option", { key: p.id, value: p.id }, p.name); })
            )
          ) : null,
          // 远程模式：同步范围（issue #28 第 2 条）——留空走全局默认，避免建完再手工补一遍
          isRemote ? Field({ label: t("flow.syncPaths"), value: syncPaths, onChange: setSyncPaths, placeholder: ".dsh" }) : null,
          // 目录选择器：远程需选好连接后才显示。
          // createFn：在当前目录下新建子目录（远程走 SSH 的 mkdir -p，本地走宿主 mkdirLocal），
          // 两个 tab 都提供——新建远程项目目录是本 issue 的痛点，本地顺手补齐（issue #11）。
          isRemote
            ? (profileId ? h(DirPicker, { resetKey: profileId, placeholder: t("flow.remoteDir"),
                 listFn: function (p) { return remoteListFn(profileId, p); },
                 createFn: function (p, name) {
                   var target = joinChild(p, name);
                   return api("mkdir", { profileId: profileId, path: target }).then(function (r) {
                     return (r && r.ok) ? { ok: true, path: target } : { ok: false, error: (r && r.error) || t("flow.errMkdir") };
                   });
                 },
                 onChoose: chooseRemote, disabled: creating })
               : h("div", { className: "rssh-pick-empty" }, t("common.selectProfile")))
            : h(DirPicker, { resetKey: "local", placeholder: t("flow.localDir"),
                listFn: function (p) { return localListFn(props.workspaces, p); },
                createFn: function (p, name) {
                  var target = joinChild(p, name);
                  return api("mkdirLocal", { path: target }).then(function (r) {
                    return (r && r.ok) ? { ok: true, path: target } : { ok: false, error: (r && r.error) || t("flow.errMkdir") };
                  });
                },
                onChoose: chooseLocal })
        )
      );
    }

    // ======================================================================
    // 远程 Agent 面板（右侧栏页签）
    //
    // 远端 codex / claude / pi 都是交互式 TUI，会话放在远端 tmux 里：插件只负责探测、
    // 创建（tmux new-session）、转发输入（paste-buffer + Enter）和回看输出（capture-pane）。
    // 这样断线/刷新页面/重启 DSH 都不会杀掉正在跑的 agent，用户也能在 SSH 终端里接管同一个
    // tmux 会话。UI 全部复用 DSH 的共享原子与设置页行风格。
    // ======================================================================
    var openAgentPanel = null;

    function CompactMenuSelect(props) {
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      var options = props.options || [];
      var current = null;
      for (var i = 0; i < options.length; i++) { if (options[i].id === props.value) { current = options[i]; break; } }
      var label = current ? current.label : String(props.value == null ? "" : props.value);
      var trigger = h("button", {
        type: "button", className: "rssh-ui-selector",
        "aria-haspopup": "menu", "aria-expanded": open ? "true" : "false",
        "aria-label": (props.label ? props.label + ": " : "") + label,
        onClick: function () { setOpen(function (v) { return !v; }); }
      },
        h("span", null, label),
        primitives.IconChevronDownOutlineRegular ? h(primitives.IconChevronDownOutlineRegular, { className: "rssh-ui-chevron" }) : null
      );
      if (!primitives.Menu) {
        return h("select", { className: "rssh-ui-native-select", value: props.value, "aria-label": props.label, onChange: function (e) { props.onChange(e.target.value); } },
          options.map(function (o) { return h("option", { key: o.id, value: o.id }, o.label); }));
      }
      return h(primitives.Menu, {
        open: open, anchor: trigger, items: options, selectedId: props.value,
        onSelect: function (id) { setOpen(false); props.onChange(id); },
        onClose: function () { setOpen(false); }, align: "end", portal: true
      });
    }

    function agentShortDir(path) {
      var p = String(path || "");
      var parts = p.split("/").filter(Boolean);
      return parts.length ? parts[parts.length - 1] : p;
    }
    function agentParentDir(path) {
      var p = String(path || "").replace(/\/+$/, "");
      var i = p.lastIndexOf("/");
      if (i <= 0) return "~";
      return p.slice(0, i);
    }
    function agentJoinDir(dir, name) {
      var d = String(dir || "~").replace(/\/+$/, "");
      return d + "/" + String(name || "");
    }

    function AgentFilesModal(props) {
      var t = useT();
      var [dir, setDir] = React.useState(props.initialDir || "~");
      var [entries, setEntries] = React.useState([]);
      var [preview, setPreview] = React.useState(null);
      var [pathInput, setPathInput] = React.useState(props.initialDir || "~");
      var [busy, setBusy] = React.useState(false);
      var [err, setErr] = React.useState("");
      var fileRef = React.useRef(null);

      function load(target) {
        setBusy(true); setErr(""); setPreview(null);
        api("listDir", { profileId: props.profileId, path: target }).then(function (r) {
          setBusy(false);
          if (r && r.ok) { setEntries(r.entries || []); setDir(r.path || target); setPathInput(r.path || target); }
          else setErr((r && r.error) || t("agents.detectFailed"));
        });
      }
      React.useEffect(function () { load(props.initialDir || "~"); }, []);

      function openEntry(e) {
        if (e.type === "directory") { load(agentJoinDir(dir, e.name)); return; }
        setBusy(true); setErr(""); setPreview(null);
        api("readFile", { profileId: props.profileId, path: agentJoinDir(dir, e.name) }).then(function (r) {
          setBusy(false);
          if (!r || !r.ok) { setErr((r && r.error) || t("agents.detectFailed")); return; }
          if (r.binary) setPreview({ path: agentJoinDir(dir, e.name), binary: true });
          else setPreview({ path: agentJoinDir(dir, e.name), content: String(r.content || "") });
        });
      }

      function upload(file) {
        if (!file) return;
        setBusy(true); setErr("");
        var url = "/remote-ssh/agents-upload?profileId=" + encodeURIComponent(props.profileId) +
          "&dir=" + encodeURIComponent(dir) + "&name=" + encodeURIComponent(file.name);
        fetch(url, { method: "POST", body: file, headers: { "x-requested-with": "XMLHttpRequest" } })
          .then(function (r) { return r.json(); })
          .then(function (j) { setBusy(false); if (j && j.ok) load(dir); else setErr((j && j.error && j.error.message) || t("agents.upload")); })
          .catch(function (e) { setBusy(false); setErr(String(e && e.message ? e.message : e)); });
      }

      var downloadUrl = preview ? "/remote-ssh/agents-download?profileId=" + encodeURIComponent(props.profileId) + "&path=" + encodeURIComponent(preview.path) : "";

      return h(Modal, {
        open: true, onClose: props.onClose, title: t("agents.filesTitle"), closeLabel: t("agents.close"),
        className: "ra-file-dialog",
        footer: h(React.Fragment, null,
          h(UiButton, { variant: "outline", onClick: props.onClose }, t("agents.close"))
        )
      },
        h("div", { className: "ra-file-actions" },
          h(UiInput, { className: "ra-input", value: pathInput, "aria-label": t("agents.pathPlaceholder"), placeholder: t("agents.pathPlaceholder"),
            onChange: function (e) { setPathInput(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") load(pathInput); } }),
          h(UiButton, { variant: "outline", size: "sm", onClick: function () { load(pathInput); } }, t("agents.openPath")),
          h(UiButton, { variant: "outline", size: "sm", onClick: function () { load(agentParentDir(dir)); } }, t("agents.parent")),
          h(UiButton, { variant: "primary", size: "sm", onClick: function () { if (fileRef.current) fileRef.current.click(); } }, t("agents.upload"))
        ),
        h("input", { type: "file", ref: fileRef, style: { display: "none" }, onChange: function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ""; upload(f); } }),
        busy ? h("div", { className: "ra-empty" }, t("agents.loading")) : null,
        err ? h("p", { className: "ra-error", role: "alert" }, err) : null,
        h("div", { className: "ra-file-list" },
          entries.length === 0 ? h("div", { className: "ra-empty" }, t("agents.emptyDir")) : entries.map(function (e) {
            return h("div", { key: e.name, className: "ra-file-row", onClick: function () { openEntry(e); } },
              h("span", null, e.type === "directory" ? "📁" : "📄"),
              h("span", null, e.name),
              h("span", { className: "ra-file-size" }, e.type === "directory" ? "" : String(e.size || 0) + " B")
            );
          })
        ),
        preview ? h("div", null,
          h("div", { className: "ra-file-actions" },
            h("span", { className: "ra-file-size" }, preview.path),
            h("a", { className: "ra-download", href: downloadUrl, download: "" }, t("agents.download"))
          ),
          preview.binary && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(preview.path)
            ? h("img", { className: "ra-file-image", src: downloadUrl, alt: preview.path })
            : h("pre", { className: "ra-file-preview" }, preview.binary ? t("agents.binary") : preview.content)
        ) : null
      );
    }

    function AgentWorktreeModal(props) {
      var t = useT();
      var [repo, setRepo] = React.useState(props.defaultRepo || "~");
      var [branch, setBranch] = React.useState("");
      var [base, setBase] = React.useState("");
      var [list, setList] = React.useState([]);
      var [busy, setBusy] = React.useState(false);
      var [err, setErr] = React.useState("");

      function loadList() {
        setErr("");
        api("agents.worktrees", { profileId: props.profileId, repo: repo }).then(function (r) {
          if (r && r.ok) setList(r.worktrees || []);
          else setErr((r && r.error) || t("agents.worktreeFailed"));
        });
      }
      React.useEffect(loadList, []);

      function create() {
        if (!branch.trim()) { setErr(t("agents.branch")); return; }
        setBusy(true); setErr("");
        api("agents.createWorktree", { profileId: props.profileId, repo: repo, branch: branch.trim(), base: base.trim() || undefined }).then(function (r) {
          setBusy(false);
          if (r && r.ok) { props.onCreated(r.path); }
          else setErr((r && r.error) || t("agents.worktreeFailed"));
        });
      }

      return h(Modal, {
        open: true, onClose: props.onClose, title: t("agents.worktreeTitle"), closeLabel: t("agents.close"),
        className: "rssh-ui-dialog",
        footer: h(React.Fragment, null,
          h(UiButton, { variant: "outline", onClick: props.onClose }, t("agents.close")),
          h(UiButton, { variant: "primary", onClick: create, disabled: busy }, busy ? t("agents.loading") : t("agents.worktreeCreate"))
        )
      },
        h(TextField, { label: t("agents.repo"), value: repo, onChange: setRepo, placeholder: "~/project" }),
        h(TextField, { label: t("agents.branch"), value: branch, onChange: setBranch, placeholder: "feature/agent" }),
        h(TextField, { label: t("agents.base"), value: base, onChange: setBase, placeholder: "main" }),
        h("div", { className: "rssh-ui-actions" },
          h(UiButton, { variant: "outline", size: "sm", onClick: loadList }, t("agents.refresh"))
        ),
        err ? h("p", { className: "ra-error", role: "alert" }, err) : null,
        h("div", { className: "ra-section" }, t("agents.worktreeList")),
        h("div", { className: "ra-file-list" },
          list.map(function (w) {
            return h("div", { key: w.path, className: "ra-file-row", onClick: function () { props.onCreated(w.path); } },
              h("span", null, "🌿"), h("span", null, w.path),
              h("span", { className: "ra-file-size" }, w.branch || "")
            );
          })
        )
      );
    }

    function AgentKeysMenu(props) {
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      var items = [
        { id: "Up", label: "↑" }, { id: "Down", label: "↓" }, { id: "Tab", label: "Tab" },
        { id: "Enter", label: "Enter" }, { id: "Escape", label: "Esc" }, { id: "C-c", label: "Ctrl-C" }
      ];
      var trigger = h("button", { type: "button", className: "rssh-ui-selector", "aria-haspopup": "menu",
        "aria-expanded": open ? "true" : "false", "aria-label": "Keys", onClick: function () { setOpen(function (v) { return !v; }); } }, "⌨");
      if (!primitives.Menu) return trigger;
      return h(primitives.Menu, {
        open: open, anchor: trigger, items: items,
        onSelect: function (id) { setOpen(false); if (props.onKey) props.onKey(id); },
        onClose: function () { setOpen(false); }, align: "end", portal: true
      });
    }

    function AgentPill(props) {
      if (primitives.Pill) return h(primitives.Pill, props);
      return h("button", { type: "button", className: "rssh-ui-selector", onClick: props.onClick }, props.children);
    }

    function RemoteAgentsPanel() {
      var t = useT();
      var [profiles, setProfiles] = React.useState([]);
      var [profileId, setProfileId] = React.useState("");
      var [probe, setProbe] = React.useState(null);
      var [sessions, setSessions] = React.useState([]);
      var [activeId, setActiveId] = React.useState("");
      var [output, setOutput] = React.useState("");
      var [draft, setDraft] = React.useState("");
      var [busy, setBusy] = React.useState(false);
      var [err, setErr] = React.useState("");
      var [agent, setAgent] = React.useState("shell");
      var [cwd, setCwd] = React.useState("~");
      var [filesOpen, setFilesOpen] = React.useState(false);
      var [wtOpen, setWtOpen] = React.useState(false);
      var outRef = React.useRef(null);

      React.useEffect(function () {
        api("listProfiles").then(function (r) {
          if (!r || !r.ok) { setErr((r && r.error) || t("agents.detectFailed")); return; }
          var list = r.profiles || [];
          setProfiles(list);
          setProfileId(function (prev) { return prev || (list[0] && list[0].id) || ""; });
        });
      }, []);

      function refresh() {
        if (!profileId) return;
        api("agents.detect", { profileId: profileId }).then(function (r) {
          if (r && r.ok) { setProbe(r); setErr(""); }
          else { setProbe(null); setErr((r && r.error) || t("agents.detectFailed")); }
        });
        api("agents.list").then(function (r) { if (r && r.ok) setSessions(r.sessions || []); });
      }
      React.useEffect(refresh, [profileId]);
      React.useEffect(function () {
        var timer = setInterval(function () {
          api("agents.list").then(function (r) { if (r && r.ok) setSessions(r.sessions || []); });
        }, 5000);
        return function () { clearInterval(timer); };
      }, []);

      React.useEffect(function () {
        if (!sessions.length) { if (activeId) setActiveId(""); return; }
        var hit = null;
        for (var i = 0; i < sessions.length; i++) if (sessions[i].id === activeId) { hit = sessions[i]; break; }
        if (!hit) setActiveId(sessions[0].id);
      }, [sessions, activeId]);

      React.useEffect(function () {
        if (!activeId) { setOutput(""); return; }
        var live = true;
        function tick() {
          api("agents.output", { id: activeId, lines: 1500 }).then(function (r) {
            if (!live) return;
            if (r && r.ok) setOutput(r.output || "");
          });
        }
        tick();
        var timer = setInterval(tick, 1200);
        return function () { live = false; clearInterval(timer); };
      }, [activeId]);

      React.useEffect(function () {
        var el = outRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [output]);

      var active = null;
      for (var i = 0; i < sessions.length; i++) if (sessions[i].id === activeId) { active = sessions[i]; break; }

      var agentOptions = (probe && probe.agents ? probe.agents : []).map(function (a) {
        return { id: a.id, label: a.name + (a.version ? " · " + a.version : "") };
      });
      agentOptions.push({ id: "shell", label: t("agents.shell") });

      function createSession(extra) {
        if (!profileId) return;
        setBusy(true); setErr("");
        api("agents.create", Object.assign({ profileId: profileId, agent: agent, mode: agent === "shell" ? "shell" : "agent", cwd: cwd }, extra || {})).then(function (r) {
          setBusy(false);
          if (r && r.ok) { setActiveId(r.session.id); refresh(); }
          else setErr((r && r.error) || t("agents.createFailed"));
        });
      }
      function send() {
        if (!active || !draft.trim()) return;
        var text = draft;
        setDraft("");
        setErr("");
        api("agents.input", { id: active.id, text: text }).then(function (r) {
          if (!r || !r.ok) setErr((r && r.error) || t("agents.sendFailed"));
        });
      }
      function key(name) {
        if (!active) return;
        api("agents.key", { id: active.id, key: name }).then(function (r) { if (r && !r.ok) setErr(r.error || ""); });
      }
      function kill() {
        if (!active) return;
        api("agents.kill", { id: active.id }).then(function () { setActiveId(""); refresh(); });
      }

      return h("div", { className: "ra-panel" },
        h("div", { className: "ra-head" },
          h("div", { className: "ra-title" }, t("agents.title")),
          h("div", { className: "ra-head-actions" },
            profiles.length ? h(CompactMenuSelect, {
              label: t("agents.connection"), value: profileId,
              options: profiles.map(function (p) { return { id: p.id, label: p.name }; }),
              onChange: function (id) { setProfileId(id); setActiveId(""); setAgent("shell"); setProbe(null); }
            }) : null,
            h(UiButton, { variant: "outline", size: "sm", onClick: refresh }, t("agents.refresh"))
          )
        ),

        !profileId ? h("div", { className: "ra-empty" }, t("settings.empty")) : null,
        probe && !probe.tmux ? h("p", { className: "ra-warn" }, t("agents.tmuxMissing")) : null,
        err ? h("p", { className: "ra-error", role: "alert" }, err) : null,

        profileId ? h("div", null,
          h("div", { className: "ra-section" }, t("agents.detected")),
          h("div", { className: "ra-agents" },
            (probe && probe.agents && probe.agents.length ? probe.agents : []).map(function (a) {
              return h(AgentPill, { key: a.id, active: agent === a.id, onClick: function () { setAgent(a.id); } }, a.name);
            }),
            h(AgentPill, { active: agent === "shell", onClick: function () { setAgent("shell"); } }, t("agents.shell"))
          ),
          probe && probe.agents && probe.agents.length === 0 ? h("div", { className: "ra-empty" }, t("agents.none")) : null,
          h("div", { className: "ra-row", style: { marginTop: 6 } },
            h(UiInput, { className: "ra-input", value: cwd, "aria-label": t("agents.cwd"), placeholder: t("agents.cwd"), onChange: function (e) { setCwd(e.target.value); } }),
            h(UiButton, { variant: "primary", size: "sm", disabled: busy, onClick: function () { createSession(); } }, busy ? t("agents.loading") : t("agents.create")),
            h(UiButton, { variant: "outline", size: "sm", onClick: function () { setWtOpen(true); } }, t("agents.worktree"))
          )
        ) : null,

        h("div", { className: "ra-section" }, t("agents.sessions")),
        h("div", { className: "ra-sessions" },
          sessions.length === 0 ? h("div", { className: "ra-empty" }, t("agents.emptySessions")) : sessions.map(function (s) {
            return h("div", { key: s.id, className: "ra-session" + (s.id === activeId ? " active" : ""), onClick: function () { setActiveId(s.id); } },
              primitives.StateDot ? h(primitives.StateDot, { state: s.alive ? "ongoing" : "idle" }) : null,
              h("div", { className: "ra-session-main" },
                h("div", { className: "ra-session-title" }, s.title || s.agent),
                h("div", { className: "ra-session-sub" }, (s.alive ? t("agents.running") : t("agents.exited")) + " · " + s.cwd)
              )
            );
          })
        ),

        h("div", { className: "ra-chat" },
          h("div", { className: "ra-chat-head" },
            h("div", { className: "ra-chat-title" }, active ? (active.title + " · " + active.cwd) : t("agents.noActive")),
            active ? h("div", { className: "ra-head-actions" },
              h(UiButton, { variant: "outline", size: "sm", onClick: function () { setFilesOpen(true); } }, t("agents.files")),
              h(AgentKeysMenu, { onKey: key }),
              h(UiButton, { variant: "outline", size: "sm", className: "rssh-ui-danger", onClick: kill }, t("agents.kill"))
            ) : null
          ),
          h("pre", { className: "ra-output", ref: outRef }, output || t("agents.noOutput")),
          h("div", { className: "ra-compose" },
            h(UiInput, { className: "ra-input", value: draft, "aria-label": t("agents.send"), placeholder: t("agents.send") + "…",
              onChange: function (e) { setDraft(e.target.value); },
              onKeyDown: function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } } }),
            h(UiButton, { variant: "primary", size: "sm", onClick: send, disabled: !active }, t("agents.send"))
          )
        ),

        filesOpen && active ? h(AgentFilesModal, { profileId: profileId, initialDir: active.cwd, onClose: function () { setFilesOpen(false); } }) : null,
        wtOpen ? h(AgentWorktreeModal, {
          profileId: profileId, defaultRepo: cwd,
          onClose: function () { setWtOpen(false); },
          onCreated: function (path) { setCwd(path); setWtOpen(false); }
        }) : null
      );
    }

    // ======================================================================
    // 设置页小节（连接配置管理）
    // ======================================================================
    function SettingsSection(props) {
      var t = useT();
      var [profiles, setProfiles] = React.useState([]);
      var [workspaces, setWorkspaces] = React.useState([]);
      var [form, setForm] = React.useState({ name: "", host: "", port: "22", user: "", authMethod: "key", keyPath: "", password: "", remoteRoot: "~", proxyJump: "" });
      var [result, setResult] = React.useState(null);
      var [busy, setBusy] = React.useState(false);
      var [importDlg, setImportDlg] = React.useState(null);
      // 进阶设置（issue #23/#24 的可达性）：nodePath / writeBackFailure / writeBackFreshness
      // + issue #28 的全局默认同步范围（新建工作区时取作初始值）
      var [prefs, setPrefs] = React.useState(prefsForUi(null));
      var [guards, setGuards] = React.useState({});   // wsId → { writeBack, exclude, syncPaths, syncExclude, syncMaxBytes }
      var [prefsMsg, setPrefsMsg] = React.useState(null);
      // 正在同步/推送的工作区 id：同一个工作区的两个按钮在此期间都禁用 —— 两次 syncDown 并发
      // 会在同一镜像目录里各解一份临时树，纯属自己跟自己抢
      var [syncId, setSyncId] = React.useState("");
      // 反馈贴着触发它的行/块显示（内置设置页的做法）：页面很长，把结果统一堆在页尾
      // 会让「测试连接 / 保存 / 同步」看起来没有反应。
      var [testMsg, setTestMsg] = React.useState(null);       // { id, ok, msg }
      var [wsMsg, setWsMsg] = React.useState(null);           // { id, ok, msg }
      var [confirmDel, setConfirmDel] = React.useState(null); // { kind, id, title, description }
      var [loadError, setLoadError] = React.useState(null);
      var [prefsBusy, setPrefsBusy] = React.useState(false);
      var [guardBusy, setGuardBusy] = React.useState("");
      var set = function (k, v) { setForm(function (f) { var n = {}; for (var key in f) n[key] = f[key]; n[k] = v; return n; }); };
      var setPref = function (k, v) { setPrefs(function (p) { var n = {}; for (var key in p) n[key] = p[key]; n[k] = v; return n; }); };
      var setGuard = function (id, k, v) { setGuards(function (g) { var n = {}; for (var key in g) n[key] = g[key]; n[id] = Object.assign({}, n[id] || {}, { [k]: v }); return n; }); };

      function reload() {
        setLoadError(null);
        api("listProfiles").then(function (r) {
          if (r && r.ok) setProfiles(r.profiles || []);
          else setLoadError((r && r.error) || t("settings.errLoad"));
        });
        api("listWorkspaces").then(function (r) {
          if (!r || !r.ok) { setLoadError((r && r.error) || t("settings.errLoad")); return; }
          var list = r.workspaces || [];
          setWorkspaces(list);
          var g = {};
          list.forEach(function (w) {
            g[w.id] = {
              writeBack: w.writeBack !== false,
              exclude: (w.writeBackExclude || []).join(", "),
              // 同步范围（issue #28）：整树同步的排除、只同步的子路径、体积上限
              syncPaths: (w.syncPaths || []).join(", "),
              syncExclude: (w.syncExclude || []).join(", "),
              syncMaxBytes: bytesToGibText(w.syncMaxBytes)
            };
          });
          setGuards(g);
        });
        api("getPrefs").then(function (r) { if (r && r.ok && r.prefs) setPrefs(prefsForUi(r.prefs)); });
      }
      React.useEffect(reload, []);

      /** 保存全局偏好（nodePath 是 #23 的逃生舱，writeBack* 是 #24 的开关，defaultSync* 是 #28 的默认范围）。 */
      function savePrefs() {
        if (prefsBusy) return;
        setPrefsBusy(true); setPrefsMsg(null);
        api("savePrefs", {
          nodePath: String(prefs.nodePath || ""),
          writeBackFailure: String(prefs.writeBackFailure || "error"),
          writeBackFreshness: prefs.writeBackFreshness !== false,
          // 默认同步范围（issue #28）：空 = 整树（旧行为）
          defaultSyncPaths: splitList(prefs.defaultSyncPaths),
          defaultSyncExclude: splitList(prefs.defaultSyncExclude),
          defaultSyncMaxBytes: gibTextToBytes(prefs.defaultSyncMaxBytes)
        }).then(function (r) {
          setPrefsBusy(false);
          if (r && r.ok) { if (r.prefs) setPrefs(prefsForUi(r.prefs)); setPrefsMsg({ ok: true, msg: t("settings.saved") }); }
          else setPrefsMsg({ ok: false, msg: (r && r.error) || t("settings.errSave") });
        }, function () { setPrefsBusy(false); setPrefsMsg({ ok: false, msg: t("settings.errSave") }); });
      }

      /** 保存单个工作区的写回护栏 + 同步范围（issue #24 护栏 A / issue #28）。 */
      function saveGuard(ws) {
        if (guardBusy) return;
        var g = guards[ws.id] || { writeBack: true, exclude: "", syncPaths: "", syncExclude: "", syncMaxBytes: "" };
        setGuardBusy(ws.id); setWsMsg(null);
        api("updateWorkspaceGuards", {
          id: ws.id,
          writeBack: g.writeBack !== false,
          writeBackExclude: splitList(g.exclude),
          // 同步范围（issue #28）：空数组 = 整树（旧行为）
          syncPaths: splitList(g.syncPaths),
          syncExclude: splitList(g.syncExclude),
          syncMaxBytes: gibTextToBytes(g.syncMaxBytes)
        }).then(function (r) {
          setGuardBusy("");
          if (r && r.ok) {
            setWorkspaces(r.workspaces || []);
            reload();
            setWsMsg({ id: ws.id, ok: true, msg: t("settings.saved") });
          } else setWsMsg({ id: ws.id, ok: false, msg: (r && r.error) || t("settings.errSave") });
        }, function () { setGuardBusy(""); setWsMsg({ id: ws.id, ok: false, msg: t("settings.errSave") }); });
      }

      /** 手动同步（issue #28 第 4 条）：复用已有的 syncDown / syncUp 端点，走该工作区的持久化范围。 */
      function runSync(ws, action) {
        if (syncId) return;   // 已有同步在跑：别让两次同步在同一镜像目录里抢
        var down = action === "syncDown";
        setSyncId(ws.id);
        setWsMsg({ id: ws.id, ok: true, msg: t(down ? "sync.syncing" : "sync.pushing") });
        api(action, { id: ws.id }).then(function (r) {
          setSyncId("");
          if (r && r.ok) setWsMsg({ id: ws.id, ok: true, msg: t(down ? "sync.done" : "sync.upDone") });
          else setWsMsg({ id: ws.id, ok: false, msg: t(down ? "sync.fail" : "sync.upFail") + ((r && r.error) || "") });
        }, function () {
          setSyncId(""); setWsMsg({ id: ws.id, ok: false, msg: t(down ? "sync.fail" : "sync.upFail") });
        });
      }

      function profileName(id) {
        var p = profiles.find(function (x) { return x.id === id; });
        return p ? p.name : id;
      }
      function delWs(ws) {
        setConfirmDel({
          kind: "workspace", id: ws.id,
          title: t("settings.deleteWsTitle"),
          description: t("settings.deleteWsDesc").replace("{name}", ws.title || ws.id)
        });
      }
      function requestDeleteProfile(p) {
        setConfirmDel({
          kind: "profile", id: p.id,
          title: t("settings.deleteConnTitle"),
          description: t("settings.deleteConnDesc").replace("{name}", p.name)
        });
      }
      /** 删除是不可恢复动作：先确认再执行；连接删除会级联删掉它的远程工作区（宿主语义）。 */
      function confirmDelete() {
        var c = confirmDel;
        if (!c || busy) return;
        setBusy(true);
        var call = c.kind === "profile" ? api("deleteProfile", { id: c.id }) : api("deleteWorkspace", { id: c.id });
        call.then(function (r) {
          setBusy(false); setConfirmDel(null);
          if (r && r.ok) {
            if (c.kind === "profile") { setProfiles(r.profiles || []); setWorkspaces(r.workspaces || []); }
            else setWorkspaces(r.workspaces || []);
            setResult({ ok: true, msg: t("settings.deleted") });
          } else setResult({ ok: false, msg: (r && r.error) || t("settings.errSave") });
        }, function () { setBusy(false); setConfirmDel(null); setResult({ ok: false, msg: t("settings.errSave") }); });
      }

      function save() {
        setBusy(true); setResult(null);
        api("saveProfile", Object.assign({}, form, { port: parseInt(form.port, 10) || 22 })).then(function (r) {
          setBusy(false);
          if (r && r.ok) {
            setProfiles(r.profiles || []);
            setForm({ name: "", host: "", port: "22", user: "", authMethod: "key", keyPath: "", password: "", remoteRoot: "~", proxyJump: "" });
            setResult({ ok: true, msg: t("settings.saved") });
          } else setResult({ ok: false, msg: (r && r.error) || t("settings.errSave") });
        });
      }
      function test(p) {
        if (busy) return;
        setBusy(true); setTestMsg(null);
        api("testConnection", { id: p.id }).then(function (r) {
          setBusy(false);
          if (r && r.ok) setTestMsg({ id: p.id, ok: true, msg: t("settings.connOk") + (r.warning ? "\n" + r.warning : "") });
          else setTestMsg({ id: p.id, ok: false, msg: t("settings.connFail") + ((r && r.error) || (r && r.stderr) || "") });
        }, function () { setBusy(false); setTestMsg({ id: p.id, ok: false, msg: t("settings.errSave") }); });
      }

      function openImport() {
        setImportDlg({ loading: true, hosts: [], selected: {} });
        api("listSshConfigHosts").then(function (r) {
          if (r && r.ok) {
            var hosts = r.hosts || [];
            var sel = {};
            hosts.forEach(function (h) { sel[h.name + "|" + h.hostName] = true; });
            setImportDlg({ loading: false, hosts: hosts, selected: sel });
          } else {
            setImportDlg({ loading: false, hosts: [], selected: {}, error: (r && r.error) || t("settings.noneFound") });
          }
        });
      }
      function toggleImport(key) {
        setImportDlg(function (d) {
          var sel = {}; for (var k in d.selected) sel[k] = d.selected[k];
          sel[key] = !sel[key];
          return Object.assign({}, d, { selected: sel });
        });
      }
      function doImport() {
        if (!importDlg) return;
        var picked = importDlg.hosts.filter(function (h) { return importDlg.selected[h.name + "|" + h.hostName]; });
        setBusy(true);
        var i = 0;
        function next() {
          if (i >= picked.length) {
            setBusy(false); setImportDlg(null);
            setResult({ ok: true, msg: t("settings.imported").replace("{n}", String(picked.length)) });
            reload();
            return;
          }
          var h = picked[i++];
          api("saveProfile", {
            name: h.name, host: h.hostName, port: h.port || 22, user: h.user || "",
            // 导入时带 GSSAPIAuthentication yes 且没有 IdentityFile 的 Host 直接选 Kerberos
            authMethod: (h.gssapi && !h.identityFile) ? "kerberos" : "key",
            keyPath: h.identityFile || "", password: "", remoteRoot: "~", proxyJump: h.proxyJump || ""
          }).then(next);
        }
        next();
      }

      var AUTH_OPTIONS = [
        { id: "key", label: t("settings.key") },
        { id: "kerberos", label: t("settings.kerberos") },
        { id: "password", label: t("settings.password") }
      ];
      var WB_OPTIONS = [
        { id: "error", label: t("settings.wbError") },
        { id: "log", label: t("settings.wbLog") }
      ];

      var AUTH_OPTIONS = [
        { id: "key", label: t("settings.key") },
        { id: "kerberos", label: t("settings.kerberos") },
        { id: "password", label: t("settings.password") }
      ];
      var WB_OPTIONS = [
        { id: "error", label: t("settings.wbError") },
        { id: "log", label: t("settings.wbLog") }
      ];
      function authLabel(id) {
        for (var ai = 0; ai < AUTH_OPTIONS.length; ai++) if (AUTH_OPTIONS[ai].id === id) return AUTH_OPTIONS[ai].label;
        return id || "";
      }

      return h("div", { className: "rssh-ui-page" },
        h("h2", { className: "rssh-ui-title" }, t("settings.nav")),
        h("p", { className: "rssh-ui-intro" }, t("settings.desc")),
        h("div", { className: "rssh-ui-actions" },
          h(UiButton, { variant: "outline", size: "sm", onClick: function () { if (openAgentPanel) openAgentPanel(); } }, t("agents.open"))
        ),
        h(SettingsNote, { ok: false, message: loadError }),
        loadError ? h("div", { className: "rssh-ui-actions" },
          h(UiButton, { variant: "outline", size: "sm", onClick: reload }, t("common.retry"))
        ) : null,
        h(SettingsNote, { ok: result && result.ok, message: result && result.msg }),

        h(SettingsGroup, { title: t("settings.connections") },
          profiles.length === 0 ? h("div", { className: "rssh-ui-empty" }, t("settings.empty")) : null,
          profiles.map(function (p) {
            return h(SettingsRow, {
              key: p.id,
              title: p.name,
              description: (p.user || "") + "@" + (p.host || "") + ":" + (p.port || 22) + " · " + authLabel(p.authMethod || "key"),
              children: testMsg && testMsg.id === p.id
                ? h(SettingsNote, { ok: testMsg.ok, message: testMsg.msg, inline: true })
                : null,
              control: h(React.Fragment, null,
                h(UiButton, { variant: "outline", size: "sm", disabled: busy, onClick: function () { test(p); } }, t("settings.test")),
                h(UiButton, { variant: "outline", size: "sm", className: "rssh-ui-danger", disabled: busy, onClick: function () { requestDeleteProfile(p); } }, t("common.delete"))
              )
            });
          })
        ),

        workspaces.length > 0 ? h(SettingsGroup, { title: t("settings.workspaces") },
          workspaces.map(function (ws) {
            var g = guards[ws.id] || { writeBack: true, exclude: "", syncPaths: "", syncExclude: "", syncMaxBytes: "" };
            return h("div", { key: ws.id, className: "rssh-ui-ws" },
              h(SettingsRow, {
                title: ws.title || ws.id,
                description: profileName(ws.profileId) + " → " + (ws.remotePath || ""),
                control: h(React.Fragment, null,
                  h(UiButton, { variant: "outline", size: "sm", disabled: !!syncId, onClick: function () { runSync(ws, "syncDown"); } }, t("sync.down")),
                  h(UiButton, { variant: "outline", size: "sm", disabled: !!syncId, onClick: function () { runSync(ws, "syncUp"); } }, t("sync.up")),
                  h(UiButton, { variant: "outline", size: "sm", className: "rssh-ui-danger", disabled: busy, onClick: function () { delWs(ws); } }, t("common.delete"))
                )
              }),
              h(ToggleField, { label: t("settings.wsWriteBack"), checked: g.writeBack !== false, onChange: function (v) { setGuard(ws.id, "writeBack", v); } }),
              h(TextField, { label: t("settings.wsWriteBackExclude"), value: g.exclude, onChange: function (v) { setGuard(ws.id, "exclude", v); }, placeholder: "_patch/, *.log, wbdeep/**" }),
              h("div", { className: "rssh-ui-group-desc" }, t("settings.syncScopeHint")),
              h(TextField, { label: t("settings.wsSyncPaths"), value: g.syncPaths, onChange: function (v) { setGuard(ws.id, "syncPaths", v); }, placeholder: ".dsh" }),
              h(TextField, { label: t("settings.wsSyncExclude"), value: g.syncExclude, onChange: function (v) { setGuard(ws.id, "syncExclude", v); }, placeholder: "data/, *.log" }),
              h(TextField, { label: t("settings.wsSyncMaxBytes"), value: g.syncMaxBytes, onChange: function (v) { setGuard(ws.id, "syncMaxBytes", v); }, placeholder: "2" }),
              h("div", { className: "rssh-ui-actions" },
                h(UiButton, { variant: "primary", size: "sm", disabled: guardBusy === ws.id, onClick: function () { saveGuard(ws); } },
                  guardBusy === ws.id ? t("common.processing") : t("settings.saveGuards"))
              ),
              h(SettingsNote, { ok: wsMsg && wsMsg.ok, message: wsMsg && wsMsg.id === ws.id ? wsMsg.msg : null, inline: true })
            );
          })
        ) : null,

        h(SettingsGroup, { title: t("settings.guards"), description: t("settings.guardsHint") },
          h(TextField, { label: t("settings.nodePath"), value: prefs.nodePath, onChange: function (v) { setPref("nodePath", v); }, placeholder: "C:\\Program Files\\nodejs\\node.exe" }),
          h(SelectField, { label: t("settings.writeBackFailure"), value: prefs.writeBackFailure || "error", options: WB_OPTIONS, onChange: function (v) { setPref("writeBackFailure", v); } }),
          h(ToggleField, { label: t("settings.writeBackFreshness"), checked: prefs.writeBackFreshness !== false, onChange: function (v) { setPref("writeBackFreshness", v); } }),
          h("div", { className: "rssh-ui-group-title" }, t("settings.syncScope")),
          h(TextField, { label: t("settings.defaultSyncPaths"), value: prefs.defaultSyncPaths, onChange: function (v) { setPref("defaultSyncPaths", v); }, placeholder: ".dsh" }),
          h(TextField, { label: t("settings.defaultSyncExclude"), value: prefs.defaultSyncExclude, onChange: function (v) { setPref("defaultSyncExclude", v); }, placeholder: "data/, *.log" }),
          h(TextField, { label: t("settings.defaultSyncMaxBytes"), value: prefs.defaultSyncMaxBytes, onChange: function (v) { setPref("defaultSyncMaxBytes", v); }, placeholder: "2" }),
          h("div", { className: "rssh-ui-actions" },
            h(UiButton, { variant: "primary", size: "sm", disabled: prefsBusy, onClick: savePrefs },
              prefsBusy ? t("common.processing") : t("common.save"))
          ),
          h(SettingsNote, { ok: prefsMsg && prefsMsg.ok, message: prefsMsg && prefsMsg.msg, inline: true })
        ),

        h(SettingsGroup, { title: t("settings.add") },
          h(TextField, { label: t("settings.name"), value: form.name, onChange: function (v) { set("name", v); }, placeholder: t("settings.namePlaceholder") }),
          h(TextField, { label: t("settings.host"), value: form.host, onChange: function (v) { set("host", v); }, placeholder: t("settings.hostPlaceholder") }),
          h(TextField, { label: t("settings.port"), value: form.port, onChange: function (v) { set("port", v); }, inputMode: "numeric" }),
          h(TextField, { label: t("settings.user"), value: form.user, onChange: function (v) { set("user", v); }, placeholder: t("settings.userPlaceholder") }),
          h(SelectField, { label: t("settings.auth"), value: form.authMethod, options: AUTH_OPTIONS, onChange: function (v) { set("authMethod", v); } }),
          form.authMethod === "key" ? h(TextField, { label: t("settings.keyPath"), value: form.keyPath, onChange: function (v) { set("keyPath", v); }, placeholder: t("settings.keyPathPlaceholder") }) : null,
          form.authMethod === "kerberos" ? h("p", { className: "rssh-ui-hint" }, t("settings.kerberosHint")) : null,
          form.authMethod === "password" ? h(TextField, { label: t("settings.passwordField"), type: "password", value: form.password, onChange: function (v) { set("password", v); }, autoComplete: "new-password" }) : null,
          h(TextField, { label: t("settings.remoteRoot"), value: form.remoteRoot, onChange: function (v) { set("remoteRoot", v); }, placeholder: "~/project" }),
          h(TextField, { label: t("settings.proxyJump"), value: form.proxyJump, onChange: function (v) { set("proxyJump", v); }, placeholder: "bastion.example.com" }),
          h("div", { className: "rssh-ui-actions" },
            h(UiButton, { variant: "primary", size: "sm", onClick: save, disabled: busy }, busy ? t("common.processing") : t("common.save")),
            h(UiButton, { variant: "outline", size: "sm", onClick: openImport, disabled: busy }, t("settings.importSshConfig"))
          )
        ),

        importDlg ? h(Modal, {
          open: true,
          onClose: function () { if (!busy) setImportDlg(null); },
          title: t("settings.importTitle"),
          closeLabel: t("common.close"),
          className: "rssh-ui-dialog",
          footer: h(React.Fragment, null,
            h(UiButton, { variant: "outline", onClick: function () { setImportDlg(null); }, disabled: busy, "data-modal-autofocus": "true" }, t("common.cancel")),
            h(UiButton, { variant: "primary", onClick: doImport, disabled: busy }, busy ? t("common.processing") : t("common.save"))
          )
        },
          importDlg.loading ? h("div", { className: "rssh-ui-empty" }, t("common.loading")) :
          importDlg.error ? h(SettingsNote, { ok: false, message: importDlg.error }) :
          importDlg.hosts.length === 0 ? h("div", { className: "rssh-ui-empty" }, t("settings.noneFound")) :
            h("div", { className: "rssh-ui-import-list" },
              importDlg.hosts.map(function (hh) {
                var key = hh.name + "|" + hh.hostName;
                return h("div", { key: key, className: "rssh-ui-import-row" },
                  h(UiCheckbox, { checked: !!importDlg.selected[key], label: hh.name, onChange: function () { toggleImport(key); } }),
                  h("span", { className: "rssh-ui-import-sub" }, (hh.user || "?") + "@" + hh.hostName + ":" + (hh.port || 22) + (hh.proxyJump ? "  → " + hh.proxyJump : ""))
                );
              })
            )
        ) : null,

        confirmDel ? h(Modal, {
          open: true,
          onClose: function () { if (!busy) setConfirmDel(null); },
          title: confirmDel.title,
          description: confirmDel.description,
          closeLabel: t("common.close"),
          className: "rssh-ui-dialog",
          footer: h(React.Fragment, null,
            h(UiButton, { variant: "outline", onClick: function () { setConfirmDel(null); }, disabled: busy, "data-modal-autofocus": "true" }, t("common.cancel")),
            h(UiButton, { variant: "outline", className: "rssh-ui-danger", onClick: confirmDelete, disabled: busy },
              busy ? t("common.processing") : t("common.delete"))
          )
        }, null) : null
      );
    }

    // ======================================================================
    // apply
    // ======================================================================
    function apply(ctx) {
      var slots = ctx.slots;
      var locale = ctx.locale;

      // 兼容 DSH Desktop ≥2.0.4：shell 不再把客户端模块系统挂到
      // globalThis.__DSH_MODULES__，而 dsh-better-sidebar 0.15+ 的懒加载
      // chunk（editor 等）会回退到该全局——缺失时侧边栏面板打不开、报
      // "chunk ... client module system unavailable"。这里用内核提供的
      // modules 服务补挂该全局；better-sidebar 已注入则保持原值。
      try {
        if (typeof globalThis !== "undefined") {
          var fallbackModules = null;
          try { if (ctx.modules && typeof ctx.modules.import === "function") fallbackModules = ctx.modules; } catch (e) {}
          if (!fallbackModules && ctx.get && typeof ctx.get === "function") {
            try { fallbackModules = ctx.get("modules"); } catch (e) { fallbackModules = null; }
          }
          // 定期兜底：better-sidebar 若把本插件应用时间之后的模块系统清掉，也补回。
          if (globalThis.__DSH_MODULES__ === undefined && fallbackModules === null) {
            var waitModules = 0;
            var waitTimer = setInterval(function () {
              waitModules += 1;
              try {
                var ms = (ctx.get && typeof ctx.get === "function") ? ctx.get("modules") : null;
                if (ms && typeof ms.import === "function") {
                  globalThis.__DSH_MODULES__ = ms;
                  clearInterval(waitTimer);
                }
              } catch (e) {}
              if (globalThis.__DSH_MODULES__ !== undefined || waitModules > 40) clearInterval(waitTimer);
            }, 250);
          }
          if (!globalThis.__DSH_MODULES__ && fallbackModules && typeof fallbackModules.import === "function") {
            globalThis.__DSH_MODULES__ = fallbackModules;
          }
        }
      } catch (e) {}

      // 注册中英文词典并绑定当前语言；locale 切换时 i18n.subscribe 触发组件重渲染。
      if (locale) {
        ctx.effect(function () { return locale.register(NS, { zh: zh, en: en }); }, "dsh-remote-ssh: dictionaries");
        i18n.t = locale.bind(NS);
        i18n.subscribe = function (cb) { return locale.subscribe(cb); };
        i18n.getSnapshot = function () { return locale.getSnapshot(); };
      }

      ctx.effect(function () {
        var el = document.createElement("style");
        el.textContent = CSS;
        document.head.appendChild(el);
        return function () { if (el.parentNode) el.parentNode.removeChild(el); };
      });

      // ---- 设置导航「远程连接」条目：把壳层默认齿轮换成真实显示器 SVG 图标 ----
      // 壳层对未知 settings.section 一律渲染齿轮图标（IconSettingsOutline16 兜底），
      // 且 settings.section 插槽契约暂不接受自定义图标（壳层注释：Desktop-owned display
      // glyph kept local until the upstream slot accepts icons），导航 CSS 类名是构建期哈希
      // 每版会变。这里沿既有 DOM 方案：按条目文本（settings.nav）定位设置导航按钮，把
      // 兜底齿轮 svg 原位替换为显示器图标（与 🖥️ 语义最接近的真实 SVG，非文字表情）。
      // replaceChild 后 React 只会对已脱离文档的旧齿轮节点做属性更新（无冲突），
      // 设置面板按需挂载、语言切换、React 重渲染由 MutationObserver + 1s 幂等复检兜底。
      if (slots) {
        function monitorIconSvg() {
          var NS = "http://www.w3.org/2000/svg";
          var svg = document.createElementNS(NS, "svg");
          svg.setAttribute("viewBox", "0 0 16 16");
          svg.setAttribute("width", "16");
          svg.setAttribute("height", "16");
          svg.setAttribute("fill", "none");
          svg.setAttribute("data-rssh-monitor", "1");
          function add(name, attrs) {
            var n = document.createElementNS(NS, name);
            for (var k in attrs) n.setAttribute(k, attrs[k]);
            svg.appendChild(n);
          }
          // 桌面显示器：圆角屏幕外框 + 支架 + 底座（轮廓线风格，与 DSH 原语一致）
          add("rect", { x: "1.5", y: "2.5", width: "13", height: "9", rx: "1", stroke: "currentColor", "stroke-width": "1.3" });
          add("path", { d: "M8 11.5v3", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" });
          add("path", { d: "M5.5 14.5h5", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" });
          return svg;
        }
        function checkCell(btn) {
          var label = i18n.t("settings.nav");
          var text = (btn.textContent || "").trim();
          if (text !== label.trim() || text === "") return false;
          var icon = btn.querySelector("svg");
          if (!icon) return false;
          if (icon.getAttribute("data-rssh-monitor") === "1") return true; // 已替换：幂等
          try { icon.parentNode.replaceChild(monitorIconSvg(), icon); } catch (e) {}
          return true;
        }
        function checkCellIn(root) {
          try {
            if (root.tagName && String(root.tagName).toLowerCase() === "button") checkCell(root);
            var cells = root.querySelectorAll("button");
            for (var i = 0; i < cells.length; i++) checkCell(cells[i]);
          } catch (e) {}
        }
        function applyRemoteNavIcon() {
          try {
            var buttons = document.querySelectorAll("button");
            for (var i = 0; i < buttons.length; i++) checkCell(buttons[i]);
          } catch (e) {}
        }
        // ---- 远程工作区图标：单个「地球角标文件夹」SVG 替换壳层默认纯文件夹图标 ----
        // 壳层工作区行的文件夹图标是固定原语（IconFolderOpen16/Close16），无 per-workspace
        // 图标 API；旧方案在标题里塞 🌐 emoji 造成「文件夹 + 地球」双重标识。现按标题文本
        // 定位远程工作区行，找到行首 slot.folder 槽位（标题的前兄弟），向其中的 svg
        // 追加地球经纬线组 —— 文件夹本体保持壳层默认原语几何，零改写零对账风险。
        var remoteTitles = new Set();  // 远程工作区标题（旧壳层按标题匹配时用，也用于诊断）
        var remoteRowKeys = new Set(); // `workspace:<原生工作区 id>`：issue #31 起的精确对齐依据
        var watchedRows = [];          // 已加角标的行：定时幂等复检，抵消 React 重渲染对图标的还原
        var remoteWorkspaceCount = 0;  // 远程工作区条目数（诊断用）
        var decoratedRows = 0;         // 已加角标的行数（诊断用）
        /** 归一化标题文本：折叠空白（壳层可能插入换行/多空格），供匹配与诊断共用。 */
        function normTitle(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
        /** 镜像目录 basename → { label: 远程目录 basename, remotePath }（issue #9）。 */
        var rootLabels = {};
        function refreshRemoteTitles() {
          api("listWorkspaces").then(function (r) {
            if (!(r && r.ok && Array.isArray(r.workspaces))) return;
            var next = new Set();
            var keys = new Set();
            remoteWorkspaceCount = r.workspaces.length;
            for (var i = 0; i < r.workspaces.length; i++) {
              var w = r.workspaces[i] || {};
              var t = normTitle(w.title);
              if (t) { next.add(t); next.add("🌐 " + t); } // 兼容自愈前的旧前缀标题
              // issue #31：壳层每个工作区行都带 data-row-key="workspace:<原生 id>"。存下这个
              // id 才能**精确**认行 —— 只按标题文本会把「与远程同名」的本地项目也标上地球。
              // 旧记录没有该字段时，由宿主侧 listWorkspaces 按镜像路径回填（见 reconcileShellWorkspaceIds）。
              var sid = normTitle(w.shellWorkspaceId);
              if (sid) keys.add("workspace:" + sid);
            }
            remoteTitles = next;
            remoteRowKeys = keys;
            refreshRootLabels(r.workspaces);
            swapWorkspaceIconsIn(document.body); // 标题集就绪后补一次全量替换
            applyRootLabelsIn(document.body);    // 树根标签同样补一次全量替换
          }).catch(function () {});
        }
        /** 地球经纬线组（右下角、无圆盘底色）：线色**跟随主题**（取文件夹 svg 自身的计算色，
         *  取不到时退回 currentColor）；文件夹本体完全保留壳层默认原语（IconFolderOpen16/Close16
         *  原始路径与几何，零改写），仅向 svg 追加本组 —— appendChild 不触碰 React 管理的子节点。
         *  ⚠️ 此前这里硬编码 `stroke="#ffffff"`：在**浅色主题**下白线落在浅色侧边栏上几乎不可见，
         *  是"换一台电脑就看不到地球角标"的一个真实成因（与本文件里的显示器图标统一用 currentColor）。 */
        function globeGridElement(color) {
          var NS = "http://www.w3.org/2000/svg";
          var g = document.createElementNS(NS, "g");
          g.setAttribute("data-rssh-globe", "1");
          g.setAttribute("fill", "none");
          g.setAttribute("stroke", color || "currentColor");
          g.setAttribute("stroke-width", "0.9");
          function add(name, attrs) {
            var n = document.createElementNS(NS, name);
            for (var k in attrs) n.setAttribute(k, attrs[k]);
            g.appendChild(n);
          }
          add("circle", { cx: "11.6", cy: "11.9", r: "3.4" });             // 地球轮廓
          add("ellipse", { cx: "11.6", cy: "11.9", rx: "1.6", ry: "3.4" }); // 经线
          add("path", { d: "M8.2 11.9h6.8" });                             // 赤道（纬线）
          add("path", { d: "M8.7 9.6c0.9 0.65 1.85 0.97 2.9 0.97s2-0.32 2.9-0.97" });  // 北纬弧
          add("path", { d: "M8.7 14.2c0.9-0.65 1.85-0.97 2.9-0.97s2 0.32 2.9 0.97" }); // 南纬弧
          return g;
        }
        /** 取文件夹 svg 的**计算颜色**作为角标颜色：与图标本体同色 → 浅色/深色主题都可见。
         *  透明/取不到时返回 null（由 globeGridElement 退回 currentColor 继承行文本色）。 */
        function iconInkOf(el) {
          try {
            var win = el && el.ownerDocument && el.ownerDocument.defaultView;
            if (!win || !win.getComputedStyle) return null;
            var c = win.getComputedStyle(el).color;
            if (!c) return null;
            if (/^(transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(String(c).trim())) return null;
            return c;
          } catch (e) {
            return null;
          }
        }
        /** 幂等应用：React 还原/重建子节点会清掉本组 —— 以 [data-rssh-globe] 子节点
         *  存在性为状态判据（覆盖属性级还原与节点重建），缺席即追加。 */
        function applyFolderGlobe(slotSvg) {
          if (slotSvg.querySelector("[data-rssh-globe]")) return;
          slotSvg.setAttribute("data-rssh-folder-globe", "1");
          slotSvg.appendChild(globeGridElement(iconInkOf(slotSvg)));
          decoratedRows += 1;
        }
        /** 反向自愈（issue #31）：不是远程工作区的行若还带着角标（升级前按标题误标），摘掉它。
         *  否则用户升级后仍会看到本地项目上的地球，只有等 React 重渲染才会消失。 */
        function removeFolderGlobe(slotSvg) {
          try {
            if (!slotSvg || !slotSvg.querySelector) return;
            var g = slotSvg.querySelector("[data-rssh-globe]");
            if (!g) return;
            if (typeof slotSvg.removeChild === "function") slotSvg.removeChild(g);
            else if (g.parentNode && typeof g.parentNode.removeChild === "function") g.parentNode.removeChild(g);
            if (typeof slotSvg.removeAttribute === "function" && slotSvg.getAttribute("data-rssh-folder-globe") === "1") {
              slotSvg.removeAttribute("data-rssh-folder-globe");
            }
            decoratedRows = Math.max(0, decoratedRows - 1);
          } catch (e) {}
        }
        /** 行首槽位里的文件夹 svg（`row > span.slot.folder > svg`）。 */
        function folderSvgOfRow(row) {
          var first = row && row.children && row.children[0];
          return first && first.querySelector ? first.querySelector("svg") : null;
        }
        /** 行 → 原生工作区键（`workspace:<id>`）；旧壳层没有该属性时返回 null。 */
        function rowKeyOfRow(row) {
          try {
            var k = row && row.getAttribute ? row.getAttribute("data-row-key") : null;
            return k && String(k).indexOf("workspace:") === 0 ? String(k) : null;
          } catch (e) { return null; }
        }
        /** 工作区行集合（root 自身是行时也算进来 —— MutationObserver 常把行本身当新增节点）。 */
        function workspaceRowsIn(root) {
          var list = [];
          try {
            if (!root || !root.querySelectorAll) return list;
            var found = root.querySelectorAll('[data-row-key^="workspace:"]');
            for (var i = 0; i < found.length; i++) list.push(found[i]);
            var selfKey = rowKeyOfRow(root);
            if (selfKey && list.indexOf(root) < 0) list.unshift(root);
          } catch (e) {}
          return list;
        }
        /** 行首 svg 加/摘角标；返回 true 表示这一行加上了。 */
        function markRow(row, want) {
          var svg = folderSvgOfRow(row);
          if (!svg) return false;
          if (want) { applyFolderGlobe(svg); return true; }
          removeFolderGlobe(svg);
          return false;
        }
        /** 精确路径（issue #31）：按 data-row-key 与 remoteRowKeys 对齐。
         *  同名本地项目行键不同 → 不会被标；曾误标的行会在这里被摘掉（自愈）。 */
        function applyRowGlobes(rows) {
          if (!rows || !rows.length) return 0;
          var applied = 0;
          for (var i = 0; i < rows.length; i++) {
            var key = rowKeyOfRow(rows[i]);
            var want = !!key && remoteRowKeys.has(key);
            if (markRow(rows[i], want)) applied += 1;
            if (want) watchRow(rows[i]);
          }
          return applied;
        }
        /** 向上 ≤4 层找到"行"元素（其首个子元素槽位里有 svg）—— 旧壳层回退用。 */
        function ownerRowOf(el) {
          var holder = el;
          for (var hop = 0; hop < 4 && holder && holder.parentElement; hop++) {
            var row = holder.parentElement;
            var first = row.children && row.children[0];
            if (first && first.querySelector && first.querySelector("svg")) return row;
            holder = row;
          }
          return null;
        }
        /** 旧壳层回退：没有 data-row-key 时只能按标题匹配。
         *  ⚠️ 同名行不止一行时**都不标** —— 无法区分哪一行是远程的，宁可漏标也不误标（issue #31）。 */
        function applyByTitle(root) {
          if (!remoteTitles.size) return;
          try {
            var nodes = root.querySelectorAll("span,div,button,a,p,[title],[aria-label]");
            var rowsSeen = [];
            var titlesSeen = [];
            for (var i = 0; i < nodes.length; i++) {
              var el = nodes[i];
              if (el.childElementCount > 2) continue;
              var text = normTitle(el.textContent);
              var hit = remoteTitles.has(text);
              if (!hit) {
                // 容错：部分壳层/主题把标题放在 title / aria-label 属性上，文本另有装饰
                var attr = el.getAttribute ? (el.getAttribute("title") || el.getAttribute("aria-label")) : null;
                hit = !!attr && remoteTitles.has(normTitle(attr));
              }
              if (!hit) continue;
              var row = ownerRowOf(el);
              if (!row || rowsSeen.indexOf(row) >= 0) continue;
              rowsSeen.push(row);
              titlesSeen.push(normTitle(row.textContent));
            }
            for (var r = 0; r < rowsSeen.length; r++) {
              var same = 0;
              for (var q = 0; q < titlesSeen.length; q++) { if (titlesSeen[q] === titlesSeen[r]) same += 1; }
              if (same > 1) continue; // 同名（本地 + 远程）→ 不标
              if (markRow(rowsSeen[r], true)) watchRow(rowsSeen[r]);
            }
          } catch (e) {}
        }
        function watchRow(row) {
          for (var i = 0; i < watchedRows.length; i++) { if (watchedRows[i] === row) return; }
          watchedRows.push(row);
        }
        function recheckWatched() {
          // 精确路径：整份行集合复检（顺带把曾误标的行摘干净），行数通常 <20，1s 一次成本可忽略
          if (remoteRowKeys.size) {
            var rows = workspaceRowsIn(document.body);
            if (rows.length) { applyRowGlobes(rows); return; }
          }
          // 旧壳层：没有行键，只能按记录的标题元素复检
          for (var i = watchedRows.length - 1; i >= 0; i--) {
            var row = watchedRows[i];
            if (!row || !row.isConnected) { watchedRows.splice(i, 1); continue; }
            var svg = folderSvgOfRow(row);
            if (svg) applyFolderGlobe(svg);
          }
        }
        /** 该壳层是否支持行键（首次见到工作区行即置 true，之后永不再按标题猜）。 */
        var shellHasRowKeys = false;
        function swapWorkspaceIconsIn(root) {
          if (!remoteTitles.size && !remoteRowKeys.size) return;
          var rows = workspaceRowsIn(root);
          if (rows.length) { shellHasRowKeys = true; applyRowGlobes(rows); return; } // 2.4.37+：按行键精确对齐
          // 局部子树（例如标题 span 重渲染）里没有行 —— 但壳层本身支持行键时必须"什么都不做"，
          // 否则会退回按标题猜，把同名本地项目的这一小块重新标上（issue #31 的坑）。
          if (!shellHasRowKeys) {
            var probe = workspaceRowsIn(document.body);
            if (probe.length) { shellHasRowKeys = true; applyRowGlobes(probe); return; }
          }
          if (shellHasRowKeys) return;
          applyByTitle(root); // 仅旧壳层（根本没有 data-row-key）才走标题回退
        }

        // ---- 角标自检：把"该有却没有"的情形直接打到控制台，便于在别的机器上定位 ----
        // 控制台可随时执行 window.__dshRemoteSshGlobeStats() 查看详情。
        var globeHealthWarned = false;
        function globeStats(withTitles) {
          var inDom = 0;
          try { inDom = document.querySelectorAll("[data-rssh-globe]").length; } catch (e) {}
          var s = {
            loaded: true,
            remoteWorkspaces: remoteWorkspaceCount,
            decoratedRows: decoratedRows,
            globesInDom: inDom,
            watchedRows: watchedRows.length,
            titleKeys: remoteTitles.size,
            // issue #31：rowKeyKeys > 0 表示走的是「按行键精确对齐」，标题只是回退路径
            rowKeyKeys: remoteRowKeys.size,
            matchedBy: remoteRowKeys.size ? "rowKey" : "title",
          };
          if (withTitles) {
            try { s.titleSamples = Array.prototype.slice.call(remoteTitles).slice(0, 6); } catch (e) {}
            try { s.rowKeySamples = Array.prototype.slice.call(remoteRowKeys).slice(0, 6); } catch (e) {}
          }
          return s;
        }
        function checkGlobeHealth(verbose) {
          try {
            var s = globeStats(true);
            if (s.remoteWorkspaces === 0) {
              if (verbose) console.info("[dsh-remote-ssh] 宿主未返回远程工作区：地球角标与远程功能都未生效（请检查插件版本与 harness 兼容性，或先创建/迁移远程工作区）", s);
              return s;
            }
            if (s.globesInDom === 0 && !globeHealthWarned) {
              globeHealthWarned = true;
              console.warn("[dsh-remote-ssh] 有 " + s.remoteWorkspaces + " 个远程工作区，但工作区行上没找到可加角标的图标：可能是壳层 DOM 结构变化。执行 window.__dshRemoteSshGlobeStats(true) 查看详情", s);
            }
          } catch (e) {}
          return null;
        }
        // 自检入口（命名空间隔离，不影响宿主）
        try {
          if (typeof window !== "undefined") {
            window.__dshRemoteSshGlobeStats = function (withTitles) {
              var s = globeStats(withTitles === true);
              var health = checkGlobeHealth(true);
              console.info("[dsh-remote-ssh] 地球角标自检", s, health ? health : "");
              return s;
            };
          }
        } catch (e) {}

        // ---- 文件树根标签：显示远程目录名，而不是本地镜像目录 ID（issue #9）----
        // better-sidebar「文件」页签的树根标签取自会话 cwd（= 本地镜像路径）的 basename，
        // 于是显示成镜像目录 ID（如 wmirror3）。这条链路不经过任何 fs.* 路由，
        // 而 Host 侧 session.cwd 虽然已返回 root 字段，客户端只消费 cwd
        // （client-registry 的 api.sessionCwd(...).then(r => setFetchedCwd(r.cwd))，
        // 另有 useSessionCwd 直接读客户端会话列表的 cwd），因此只能在渲染层替换文本。
        // 定位不依赖构建期哈希类名：根行是树里唯一带内联 padding-left:6px 的行，
        // 仅当该行内的纯文本节点 === 某远程工作区的镜像 basename 时才替换（幂等、可自愈）。
        var watchedRootLabels = []; // 已替换的标签元素：1s 幂等复检，抵消 React 重渲染
        function refreshRootLabels(workspaces) {
          var next = {};
          for (var i = 0; i < (workspaces || []).length; i++) {
            var w = workspaces[i] || {};
            var mirror = String(w.mirrorPath || "").replace(/[\\/]+$/, "");
            var remote = String(w.remotePath || "").replace(/[\\/]+$/, "");
            if (!mirror || !remote) continue;
            var mb = mirror.split(/[\\/]/).pop();
            var rb = remote.split(/[\\/]/).pop();
            if (mb && rb && mb !== rb) next[mb] = { label: rb, remotePath: remote };
          }
          rootLabels = next;
        }
        /** 根行判据：自身或 ≤3 层祖先带内联 padding-left:6px（better-sidebar 根行样式）。 */
        function isRootRow(el) {
          var node = el;
          for (var hop = 0; hop < 3 && node; hop++) {
            var style = node.getAttribute ? node.getAttribute("style") : null;
            if (style && /padding-left:\s*6px/i.test(String(style))) return true;
            node = node.parentElement;
          }
          return false;
        }
        /** 单个标签替换：纯文本 + 命中镜像 basename + 位于根行 → 换成远程目录名。 */
        function fixRootLabel(el) {
          var text = (el.textContent || "").trim();
          if (!text) return false;
          var hit = rootLabels[text];
          if (hit === undefined) {
            // 文本已是远程目录名（上一轮替换过）→ 幂等成功；否则与本插件无关
            return el.getAttribute && el.getAttribute("data-rssh-root-label") === "1";
          }
          if (el.childElementCount > 0) return false; // 只改纯文本节点
          if (!isRootRow(el)) return false;           // 非根行（例如同名子条目）不动
          el.textContent = hit.label;
          if (el.setAttribute) {
            el.setAttribute("data-rssh-root-label", "1");
            el.setAttribute("title", hit.remotePath); // 悬停可见完整远程路径
          }
          watchRootLabel(el);
          return true;
        }
        function watchRootLabel(el) {
          for (var i = 0; i < watchedRootLabels.length; i++) { if (watchedRootLabels[i] === el) return; }
          watchedRootLabels.push(el);
        }
        function recheckRootLabels() {
          for (var i = watchedRootLabels.length - 1; i >= 0; i--) {
            var el = watchedRootLabels[i];
            if (!el || !el.isConnected) { watchedRootLabels.splice(i, 1); continue; }
            fixRootLabel(el);
          }
        }
        function applyRootLabelsIn(root) {
          if (!root || !root.querySelectorAll) return;
          try {
            var nodes = root.querySelectorAll("span,div");
            for (var i = 0; i < nodes.length; i++) fixRootLabel(nodes[i]);
            if (root.nodeType === 1) fixRootLabel(root);
          } catch (e) {}
        }
        ctx.effect(function () {
          if (typeof document === "undefined") return;
          applyRemoteNavIcon();
          refreshRemoteTitles();
          // 角标自检：等界面稳定后再判（避免行还没渲染就误报）；仅在"有远程工作区却没有角标"时告警一次
          setTimeout(function () { checkGlobeHealth(false); }, 8000);
          setTimeout(function () { checkGlobeHealth(false); }, 25000);
          var titleTimer = setInterval(refreshRemoteTitles, 30000);
          var recheckTimer = setInterval(function () { recheckWatched(); recheckRootLabels(); }, 1000); // 抵消 React 属性还原
          var timer = null;
          var pendingRoots = null;
          var schedule = function (root) {
            if (root && root.nodeType === 1) (pendingRoots || (pendingRoots = [])).push(root);
            if (timer) return;
            timer = setTimeout(function () {
              timer = null;
              var roots = pendingRoots;
              pendingRoots = null;
              if (document.hidden) return; // 后台页签零开销
              if (roots && roots.length) {
                // 只扫新增子树：流式聊天期间不做全文档扫描（稳态成本≈0）
                // （设置导航图标与树根标签已在 MutationObserver 回调里同步替换，这里只补工作区角标）
                for (var i = 0; i < roots.length; i++) {
                  if (roots[i].isConnected) swapWorkspaceIconsIn(roots[i]);
                }
              } else {
                applyRemoteNavIcon(); // 语言切换等无根场景全量扫一次
                swapWorkspaceIconsIn(document.body);
                applyRootLabelsIn(document.body);
              }
            }, 500);
          };
          var mo = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
              var added = muts[i].addedNodes;
              for (var j = 0; j < added.length; j++) {
                var node = added[j];
                // 设置导航图标：同步原位替换。MutationObserver 回调是微任务，
                // 在浏览器绘制前执行 —— 齿轮刚插入 DOM 就被换成显示器图标，
                // 用户看到的第一帧就是最终图标（2.4.2 修复齿轮闪现）。
                if (node && node.nodeType === 1 && node.isConnected) {
                  checkCellIn(node);
                  // 树根标签同样同步替换：微任务内、绘制前完成，避免先闪一下镜像目录 ID
                  applyRootLabelsIn(node);
                }
                // 工作区地球角标依赖异步 remoteTitles，仍走防抖批量路径
                schedule(node);
              }
            }
          });
          mo.observe(document.body, { childList: true, subtree: true });
          var off = i18n.subscribe(function () { schedule(null); });
          return function () {
            mo.disconnect();
            if (off) off();
            if (timer) clearTimeout(timer);
            clearInterval(titleTimer);
            clearInterval(recheckTimer);
          };
        }, "dsh-remote-ssh: settings nav monitor icon + tree root label + remote workspace folder-globe icon");
      }

      // better-sidebar 0.15+ 的文件上传 UI 把原始字节流 POST 到 /sidebar/upload。
      // 远程工作区会话的文件树显示的是本地镜像目录，better-sidebar 会把上传写进
      // 本地镜像而不会到达远程。这里包装 fetch：目标目录位于某个远程工作区镜像
      // 目录内时，把该上传请求重定向到 /remote-ssh/upload（走 SSH 上传到远端）。
      ctx.effect(function () {
        if (typeof window === "undefined" || typeof window.fetch !== "function") return;
        var nativeFetch = window.fetch.bind(window);
        var mirrors = [];
        function refreshMirrors() {
          api("listWorkspaces").then(function (r) {
            if (r && r.ok && Array.isArray(r.workspaces)) {
              mirrors = r.workspaces.map(function (w) {
                return String(w && w.mirrorPath || "").replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
              }).filter(Boolean);
            }
          }).catch(function () {});
        }
        refreshMirrors();
        var timer = setInterval(refreshMirrors, 30000);
        function patchedFetch(input, init) {
          var raw = typeof input === "string" ? input : (input && input.url);
          if (typeof raw === "string") {
            try {
              var u = new URL(raw, window.location.origin);
              // better-sidebar 0.25+ 的保存走原始路由 POST /sidebar/write?sessionId&path[&cwd][&expectedMtimeMs]，
              // 请求体就是全文（LF）。远程工作区里 path 是**镜像路径**：不接管就会写进本地镜像，
              // 远端文件没变（issue #37 的「保存不上」）。这里把保存改投本插件端点，本地工作区原样透传。
              if (u.pathname === "/sidebar/write") {
                var wpath = (u.searchParams.get("path") || "").replace(/\\/g, "/").toLowerCase();
                var wbody = init && init.body;
                if (typeof wbody === "string") {
                  for (var wi = 0; wi < mirrors.length; wi++) {
                    var wm = mirrors[wi];
                    if (wpath === wm || wpath.indexOf(wm + "/") === 0) {
                      var wpayload = {
                        sessionId: u.searchParams.get("sessionId") || "",
                        cwd: u.searchParams.get("cwd") || "",
                        path: u.searchParams.get("path") || "",
                        content: wbody
                      };
                      var emRaw = u.searchParams.get("expectedMtimeMs");
                      if (emRaw !== null && emRaw !== "") wpayload.expectedMtimeMs = Number(emRaw);
                      return nativeFetch(new URL("/remote-ssh/write", window.location.origin).toString(), {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(wpayload)
                      });
                    }
                  }
                }
              }
              if (u.pathname === "/sidebar/upload") {
                var dir = (u.searchParams.get("dir") || "").replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
                var cwd = (u.searchParams.get("cwd") || "").replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
                for (var i = 0; i < mirrors.length; i++) {
                  var m = mirrors[i];
                  var hit = (dir && (dir === m || dir.indexOf(m + "/") === 0)) || (cwd && (cwd === m || cwd.indexOf(m + "/") === 0));
                  if (hit) {
                    var target = new URL("/remote-ssh/upload" + u.search, window.location.origin);
                    return nativeFetch(target.toString(), init);
                  }
                }
              }
            } catch (e) {}
          }
          return nativeFetch(input, init);
        }
        window.fetch = patchedFetch;
        return function () {
          clearInterval(timer);
          if (window.fetch === patchedFetch) window.fetch = nativeFetch;
        };
      }, "dsh-remote-ssh: redirect remote-workspace uploads and editor saves");

      // dsh-better-sidebar 是**可选**依赖，绝不能放进 exports.inject：
      // cordis 的 fiber 只要有一个 inject 键对应的服务没注册就整体停在 pending，
      // 前端会报 `web boot: 1 entry did not activate` / `pending (waiting for service: betterSidebar)`，
      // DSH Desktop 还会弹「插件恢复」——即使没装 better-sidebar 时内核自带侧边栏照常可用。
      // 因此改用子 fiber 软注入（前端自身也用 e.inject(["uiRenderer"], …) 这一招）：
      // 装了 better-sidebar 就注册远程文件编辑器页签，没装就静默降级 ——
      // 宿主半边的 fs.*/终端拦截、设置页与模型工具都不依赖它。
      ctx.inject(["betterSidebar"], function (bsCtx) {
        var bs = bsCtx.betterSidebar;
        if (!bs || typeof bs.registerTab !== "function") return;
        // 远程文件编辑器页签（隐藏页签，仅由代码打开，每个远程文件单开一栏）。
        // remssh:files 和 remssh:term 已移除：远程文件由内置「文件」页签直接 SSH 读写，
        // 远程终端由内置「终端」页签提供（shell wrapper 自动 SSH）。
        bsCtx.effect(function () {
          return bs.registerTab({
            id: "remssh:editor",
            title: function () { return i18n.t("tabs.files"); },
            hidden: true,
            dedupeKey: function (tab) { return (tab && tab.meta && tab.meta.profileId || "") + "\u0000" + (tab && tab.path || ""); },
            icon: function () { return h("span", null, "📄"); },
            component: function (props) {
              return h(RemoteEditor, { tab: props && props.tab, ctx: props && props.ctx, scope: props && props.scope });
            }
          });
        });
      });

      if (slots) {
        slots.inject("settings.section", function () {
          return slots.register({
            name: "settings.section",
            id: "remote-ssh",
            order: 200,
            label: function () { return i18n.t("settings.nav"); },
            locale: NS
          }, SettingsSection);
        });

        // 接管原生「添加工作区」流程：用明显更低的优先级覆盖内置的本地目录选择器，
        // 弹窗内提供「本地目录（DSH browse）/ 远程目录（SSH）」两种浏览。
        var flowInject = function () { return { workspaces: ctx.get("workspaces") }; };
        ctx.effect(function () {
          return slots.inject("conversation.hero.workspace.directoryFlow", function () {
            return slots.register({ name: "conversation.hero.workspace.directoryFlow", priority: -100, inject: flowInject }, RemoteWorkspaceFlow);
          });
        });
        ctx.effect(function () {
          return slots.inject("sidebar.workspaces.directoryFlow", function () {
            return slots.register({ name: "sidebar.workspaces.directoryFlow", priority: -100, inject: flowInject }, RemoteWorkspaceFlow);
          });
        });
      }

      // 右侧栏「远程 Agent」页签：类型 + body 两段式注册（与内置「终端」同一套扩展点）。
      // 软注入：没有 sidebarRight 的旧宿主不会因此 pending。
      ctx.inject(["sidebarRightTabs", "sidebarRight"], function (rb) {
        var tabKind = "remote-agents";
        var tabId = "@wujiaming88/dsh-remote-ssh/agents";
        ctx.effect(function () {
          return rb.sidebarRightTabs.register({
            id: tabId, kind: tabKind, multiple: false, priority: "extension",
            title: function () { return i18n.t("agents.title"); },
            guide: [{
              id: "open", order: 30,
              title: function () { return i18n.t("agents.title"); },
              description: function () { return i18n.t("agents.desc"); },
              icon: primitives.IconAgentPresetOutline16
            }]
          });
        }, "dsh-remote-ssh: agents tab type");
        ctx.effect(function () {
          return slots.inject("sidebar.right.pane.tab", function () {
            return slots.register({ name: "sidebar.right.pane.tab", key: tabId, locale: NS }, RemoteAgentsPanel);
          });
        }, "dsh-remote-ssh: agents tab body");
        openAgentPanel = function () { try { rb.sidebarRight.openTab(tabKind); } catch (e) {} };
      });
    }

    exports.apply = apply;
    // 只声明内核一定提供的服务；betterSidebar（第三方 bundle dsh-better-sidebar）
    // 走 apply 内的 ctx.inject 软注入 —— 放进这里会让未安装它的用户 web boot 直接失败（issue #18）。
    exports.inject = ["slots", "locale"];
    return module.exports;
  }
});
