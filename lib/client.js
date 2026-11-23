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
      ".ra-messages{flex:1;min-height:120px;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:6px}" +
      ".ra-msg{display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:var(--dsw-radius-md)}" +
      ".ra-msg-user{background:var(--dsw-alias-bg-layer-2)}" +
      ".ra-msg-assistant{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1)}" +
      ".ra-msg-system{color:var(--dsw-alias-state-error-primary)}" +
      ".ra-msg-role{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}" +
      ".ra-msg-text{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:19px}" +
      ".ra-file-dialog{width:760px;max-width:94vw}" +
      ".ra-file-list{max-height:220px;overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:2px;margin:6px 0}" +
      ".ra-file-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--dsw-radius-sm);cursor:pointer;font-size:13px}" +
      ".ra-file-row:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".ra-file-size{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px}" +
      ".ra-file-image{display:block;max-width:100%;max-height:320px;border-radius:var(--dsw-radius-md);margin-top:6px}" +
      ".ra-file-preview{max-height:320px;overflow:auto;margin:6px 0 0;padding:8px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-markdown-code-block);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:17px;white-space:pre-wrap;word-break:break-word}" +
      ".ra-file-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}" +
      ".ra-download{display:inline-flex;align-items:center;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-primary);text-decoration:none;font-size:12px}" +
      // ACP Chat（conversation.view 常驻 Tab）：只复用 DSH 主题 token 与既有 rssh-ui-* 行样式。
      ".ra-acp{display:flex;flex-direction:column;gap:8px;min-height:0}" +
      ".ra-acp-setup{display:flex;flex-direction:column;gap:2px;max-height:64vh;overflow:auto;padding-right:2px}" +
      ".ra-acp-head{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap;padding:2px 2px 6px;border-bottom:.5px solid var(--dsw-alias-border-l1)}" +
      ".ra-acp-head-main{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}" +
      ".ra-acp-agent{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-sub{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ra-acp-head-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ra-acp-configs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 0}" +
      ".ra-acp-config{display:flex;align-items:center;gap:4px;min-width:0}" +
      ".ra-acp-config-label{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}" +
      ".ra-acp-usage{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}" +
      ".ra-acp-messages{flex:1;min-height:200px;max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:6px 2px;border:none;background:transparent}" +
      ".ra-acp-msg{display:flex;flex-direction:column;gap:3px;min-width:0}" +
      ".ra-acp-role{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}" +
      ".ra-acp-user-text{white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-2);border-radius:var(--dsw-radius-md);padding:6px 8px;font-size:13px;line-height:19px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-md{font-size:13px;line-height:20px;word-break:break-word;min-width:0}" +
      ".ra-acp-system{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word}" +
      ".ra-acp-notice{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}" +
      ".ra-acp-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word}" +
      ".ra-acp-tool{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);overflow:hidden;background:var(--dsw-alias-bg-layer-2)}" +
      ".ra-acp-tool-head{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:5px 8px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer}" +
      "@media (hover: hover){.ra-acp-tool-head:hover{background:var(--dsw-alias-interactive-bg-hover)}}" +
      ".ra-acp-tool-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%}" +
      ".ra-acp-tool-sum{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".ra-acp-tool-body{padding:0 8px 8px}" +
      ".ra-acp-locations{display:flex;flex-wrap:wrap;gap:4px;padding:2px 8px}" +
      ".ra-acp-loc{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border-radius:var(--dsw-radius-sm);padding:1px 5px;word-break:break-all}" +
      ".ra-acp-json{max-height:180px;overflow:auto;margin:4px 0 0;padding:6px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-word}" +
      ".ra-acp-plan{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:6px 8px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:2px}" +
      ".ra-acp-plan-row{display:flex;align-items:flex-start;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-commands{display:flex;align-items:center;gap:4px;flex-wrap:wrap}" +
      ".ra-acp-cmd{height:22px;padding:0 7px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11px;cursor:pointer}" +
      "@media (hover: hover){.ra-acp-cmd:hover{background:var(--dsw-alias-interactive-bg-hover)}}" +
      ".ra-acp-perms{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto}" +
      ".ra-acp-perm{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--dsw-alias-state-warn-label);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}" +
      ".ra-acp-perm-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-perm-opts{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ra-acp-composer{display:flex;flex-direction:column;gap:8px;padding:10px 12px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-specific-input-major);box-shadow:0 1px 2px rgba(0,0,0,.03)}" +
      ".ra-acp-plus{width:32px;height:32px;padding:0;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center}" +
      ".ra-acp-send{width:34px;height:34px;padding:0;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center}" +
      ".ra-acp-compose-bar .rssh-ui-selector{height:26px;padding:0 4px;font-size:12px;background:transparent;border-color:transparent}" +
      ".ra-acp-compose-bar .rssh-ui-selector:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".ra-acp-compose-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ra-acp-compose-row{display:flex;align-items:flex-end;gap:6px}" +
      ".ra-acp-compose-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px}" +
      ".ra-acp-compose-left{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}" +
      ".ra-acp-compose-right{display:flex;align-items:center;gap:6px;justify-self:end;white-space:nowrap}" +
      ".ra-acp-command-btn{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:22px;padding:0 5px;border-radius:6px;cursor:pointer;white-space:nowrap}" +
      "@media (hover: hover){.ra-acp-command-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}}" +
      ".ra-acp-textarea{width:100%;box-sizing:border-box;min-height:44px;max-height:180px;resize:none;background:transparent;color:var(--dsw-alias-label-primary);border:none;border-radius:6px;padding:2px 2px;font:inherit;font-size:14px;line-height:20px;outline:none}" +
      ".ra-acp-compose-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);padding:0 2px}" +
      ".ra-acp-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}" +
      ".ra-acp-confirm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border:1px solid var(--dsw-alias-state-warn-label);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-sessions{display:flex;flex-direction:column;gap:4px;max-height:150px;overflow:auto;padding:2px 0}" +
      ".ra-acp-session{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}" +
      ".ra-acp-session-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}" +
      ".ra-acp-session-title{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ra-acp-session-sub{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ra-acp-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:6px 8px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:4px}" +
      ".ra-acp-card-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-shortid{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);word-break:break-all}" +
      ".ra-acp-subagent{border:.5px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);padding:6px 8px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:4px}" +
      ".ra-acp-subagent-meta{display:flex;flex-direction:column;gap:4px}" +
      ".ra-acp-state-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-subagent-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-subagent-title{font-weight:500;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);word-break:break-word}" +
      ".ra-acp-subagent-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}" +
      ".ra-acp-subagent-file{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}" +
      ".ra-acp-subagent-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ra-acp-subagent-body{display:flex;flex-direction:column;gap:4px;padding-top:2px}" +
      ".ra-acp-children{margin-top:4px;padding-left:10px;border-left:2px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:6px}" +
      ".ra-acp-children-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ra-acp-native{display:flex;flex-direction:column;gap:4px}" +
      ".ra-acp-native-body{padding:4px 0 0;display:flex;flex-direction:column;gap:2px}" +
      ".ra-acp-native-row{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}" +
      ".ra-acp-state{display:flex;flex-direction:column;gap:4px;padding:5px 8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}" +
      ".ra-acp-suggestions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 0}" +
      ".ra-acp-view{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;box-sizing:border-box;padding:10px 14px 12px;color:var(--dsw-alias-label-primary);width:100%;max-width:var(--dsh-chat-content-width, 860px);margin:0 auto}" +
      ".ra-acp-view-body{display:flex;flex-direction:column;min-height:0;flex:1}" +
      ".ra-acp-view .ra-acp{flex:1;min-height:0}" +
      ".ra-acp-view .ra-acp-messages{flex:1;min-height:0;max-height:none}" +
      ".ra-acp-view .ra-acp-setup{flex:1;min-height:0;max-height:none;overflow:auto}" +
      ".ra-acp-boot{display:flex;align-items:center;justify-content:center;gap:8px;flex:1;min-height:160px;font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
      ".ra-acp-view-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}" +
      ".ra-acp-empty-state{margin:auto;max-width:560px;display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 16px;text-align:center}" +
      ".ra-acp-empty-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}" +
      ".ra-acp-quick{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}" +
      "body:has(.ra-acp-view) [data-composer-seat],body[data-acp-session] [data-composer-seat],body[data-acp-preferred] [data-composer-seat]{display:none!important}" +
      "body:has(.ra-acp-view) [data-conversation-region=\"composer\"],body[data-acp-session] [data-conversation-region=\"composer\"],body[data-acp-preferred] [data-conversation-region=\"composer\"]{display:none!important}" +
      // ACP View 激活时隐藏原生「对话」Tab：同一个 DSH 会话只保留一个对话表面，
      // 避免看起来像两个会话；切到轨迹/上下文时 Acp View 卸载，对话 Tab 自动恢复。
      "body[data-acp-session] [data-conversation-tabs] button[role=\"tab\"]:first-child,body[data-acp-preferred] [data-conversation-tabs] button[role=\"tab\"]:first-child{display:none!important}" +
      ".ra-acp-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:32px 12px;text-align:center;flex:1;min-height:120px}" +
      ".ra-acp-empty-title{font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)}" +
      ".ra-acp-errorbar{padding:6px 8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}" +
      ".ra-acp-cmd-panel{display:flex;flex-direction:column;gap:2px;max-height:300px;overflow:auto;padding:8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}" +
      ".ra-acp-cmd-panel-head{display:flex;align-items:center;gap:6px;padding-bottom:6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}" +
      ".ra-acp-cmd-search{flex:1;min-width:0}" +
      ".ra-acp-cmd-group{display:flex;flex-direction:column;gap:2px;padding-top:4px}" +
      ".ra-acp-cmd-row{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;box-sizing:border-box;padding:5px 6px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}" +
      "@media (hover: hover){.ra-acp-cmd-row:hover{background:var(--dsw-alias-interactive-bg-hover)}}" +
      ".ra-acp-cmd-row-name{font-size:12px;line-height:18px;font-weight:500}" +
      ".ra-acp-cmd-row-desc{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}" +
      ".ra-acp-cmd-hint{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary)}" +
      "@media (max-width:767px){.ra-acp-messages{max-height:42vh}.ra-acp-sub{max-width:60vw}.ra-acp-configs{gap:4px}.ra-acp-compose-row{flex-wrap:wrap}.ra-acp-children{padding-left:6px}.ra-acp-view{padding:8px}.ra-acp-cmd-panel{max-height:38vh}}" ;

    // ---- 国际化（跟随 DSH 设置中的语言自动切换）----
    var NS = "dsh-remote-ssh";
    var zh = {
      "tabs.files": "远程文件",
      "tabs.term": "远程终端",
      "settings.nav": "远程连接",
      "agents.title": "远程 Agent",
      "agents.desc": "在远端机器上识别并使用 Claude Code / Codex，或开一个 Shell 会话。",
      "agents.open": "打开 Agent 面板",
      "agents.refresh": "刷新",
      "agents.connection": "连接",
      "agents.detected": "远端 Agent",
      "agents.none": "未检测到 Claude Code / Codex（请先在远端安装并登录）。",
      "agents.tmuxMissing": "远端没有 tmux，Agent 会话不可用。请先安装 tmux。",
      "agents.shell": "Shell",
      "agents.chat": "Chat",
      "agents.mode": "模式",
      "agents.modeTui": "TUI",
      "agents.modeChat": "Chat",
      "agents.modeShell": "Shell",
      "agents.permission": "权限",
      "agents.permPlan": "Plan（只读规划）",
      "agents.permAccept": "Accept edits（默认）",
      "agents.permBypass": "Bypass（全自动，危险）",
      "agents.chatEmpty": "还没有消息，发一条开始。",
      "agents.chatThinking": "Agent 正在运行…",
      "agents.messages": "消息",
      "agents.keys": "按键",
      "agents.you": "你",
      "agents.agentRole": "Agent",
      "agents.systemRole": "系统",
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
      "flow.agent": "会话 Agent",
      "flow.agentDsh": "DSH 默认",
      "flow.localSeg": "本机目录",
      "flow.remoteSeg": "SSH 远程",
      "flow.remoteHint": "选择「SSH 远程」→ 选连接 → 浏览远端目录；本机目录不会走 SSH。",
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
      "ops.fail": "操作失败",
      "acp.hero": "远端 Agent",
      "acp.subtitle": "通过 ACP 驱动远端 Claude Code / Codex：连接 → 探测 → 选工作区 → 开始。",
      "acp.connection": "连接与 Agent",
      "acp.profile": "连接配置",
      "acp.chooseProfile": "— 选择连接 —",
      "acp.noProfiles": "还没有连接配置，请先到「设置 → 远程连接」添加。",
      "acp.detect": "探测",
      "acp.detecting": "探测中…",
      "acp.detected": "远端 Agent",
      "acp.detectHint": "探测远端 PATH 与登录 shell 中的 Claude Code / Codex。",
      "acp.detectFailed": "探测失败",
      "acp.noAgents": "未检测到支持 ACP 的 agent（Claude Code / Codex）。",
      "acp.agent": "Agent",
      "acp.permission": "权限",
      "acp.permAccept": "Accept edits（默认）",
      "acp.permPlan": "Plan（只读规划）",
      "acp.permBypass": "Bypass（全自动，危险）",
      "acp.workspace": "远端工作区",
      "acp.workspaceManual": "— 手动填写 mirrorCwd —",
      "acp.noWorkspaces": "还没有远程工作区：可直接填写本地 mirrorCwd。",
      "acp.mirrorCwd": "本地镜像目录 mirrorCwd",
      "acp.remotePath": "远端目录 remotePath",
      "acp.start": "开始会话",
      "acp.starting": "启动中…",
      "acp.startFailed": "启动会话失败",
      "acp.sessions": "已保存的会话",
      "acp.noSessions": "还没有可恢复的 ACP 会话。",
      "acp.resume": "恢复",
      "acp.resuming": "恢复中…",
      "acp.started": "会话已连接。",
      "acp.resumed": "已恢复会话。",
      "acp.empty": "还没有消息，发一条开始。",
      "acp.emptyHint": "发送消息，或从命令面板插入 /命令、/skills。",
      "acp.quickExplain": "解释一下当前仓库",
      "acp.quickTest": "运行测试并修复失败",
      "acp.quickChanges": "看一下未提交的改动",
      "acp.more": "更多",
      "acp.less": "收起",
      "acp.close": "关闭",
      "acp.closeFailed": "结束会话失败",
      "acp.endSession": "结束会话",
      "acp.endSessionDesc": "结束并移除该 ACP 会话，之后不能再恢复。",
      "acp.newSession": "新会话",
      "acp.files": "文件",
      "acp.stop": "停止",
      "acp.stopRequested": "已请求停止当前 turn。",
      "acp.stopFirst": "当前 turn 仍在运行，请先停止。",
      "acp.stopReason": "停止原因",
      "acp.steer": "追加",
      "acp.steering": "追加消息（Steer）",
      "acp.steerHint": "当前 turn 运行中：发送会以 Steer 追加，不等待 turn 结束。",
      "acp.steerQueued": "adapter 不支持注入，消息已排到下一个 turn。",
      "acp.steerFailed": "追加消息失败",
      "acp.send": "发送",
      "acp.sendHint": "Enter 发送，Shift+Enter 换行。",
      "acp.composerPlaceholder": "给远端 agent 发消息…",
      "acp.composerSteerPlaceholder": "追加一条 Steer 消息（当前 turn 运行中）…",
      "acp.you": "你",
      "acp.agentRole": "Agent",
      "acp.thought": "思考",
      "acp.show": "展开",
      "acp.hide": "收起",
      "acp.tool": "工具",
      "acp.toolPending": "等待",
      "acp.toolRunning": "运行中",
      "acp.toolDone": "完成",
      "acp.toolFailed": "失败",
      "acp.input": "输入",
      "acp.output": "输出",
      "acp.plan": "计划",
      "acp.commands": "命令",
      "acp.notice": "提示",
      "acp.usage": "用量",
      "acp.model": "模型",
      "acp.reasoning": "思考级别",
      "acp.mode": "模式",
      "acp.running": "运行中",
      "acp.waiting": "等待权限",
      "acp.ready": "就绪",
      "acp.stopped": "已停止",
      "acp.error": "错误",
      "acp.closed": "已关闭",
      "acp.permissionTitle": "需要权限",
      "acp.permissionDesc": "{tool} 请求执行权限，请选择处理方式。",
      "acp.permissionCount": "{count} 个权限请求",
      "acp.permissionWaitingHint": "有权限请求等待处理，请在下方选择允许或拒绝。",
      "acp.permissionFailed": "权限应答失败",
      "acp.dismiss": "忽略",
      "acp.autoApproved": "已按 Bypass 自动批准",
      "acp.disconnected": "事件流已断开，已保留收到的消息。可重新发送或恢复会话。",
      "acp.noStream": "当前浏览器不支持流式读取",
      "acp.configFailed": "切换配置失败",
      "acp.cancelFailed": "取消失败",
      "acp.cancel": "取消",
      "acp.compaction": "上下文压缩",
      "acp.code": "代码",
      "acp.copy": "复制",
      "acp.copied": "已复制",
      "acp.wrap": "自动换行",
      "acp.unwrap": "取消换行",
      "acp.footnotes": "脚注",
      "acp.collapse": "收起",
      "acp.collapseAria": "收起",
      "acp.expand": "展开剩余 {count} 行",
      "acp.expandAria": "展开剩余 {count} 行",
      "acp.commandLine": "第 {n} 行命令",
      "acp.signal": "信号 {signal}",
      "acp.exitCode": "退出码 {code}",
      "acp.noExitCode": "无退出码",
      "acp.failed": "失败",
      "acp.done": "完成",
      "acp.noOutput": "（无输出）",
      "acp.readWindow": "显示 {shown} / {total} 行",
      "acp.noProfile": "请先选择连接配置",
      "acp.noMirror": "请选择一个远端工作区，或填写本地镜像目录 mirrorCwd",
      "acp.subagent": "子 Agent",
      "acp.subagentAgent": "agent",
      "acp.subagentSession": "会话",
      "acp.subagentTask": "任务",
      "acp.subagentToolUse": "工具调用",
      "acp.subagentBackground": "后台",
      "acp.subagentOutput": "输出文件",
      "acp.subagentOpenOutput": "查看输出",
      "acp.subagentSummary": "摘要",
      "acp.nativeEvent": "原生事件",
      "acp.nativeUpdate": "sessionUpdate",
      "acp.nativeMeta": "nativeMeta",
      "acp.stateRunning": "运行中",
      "acp.stateIdle": "空闲",
      "acp.stateRequiresAction": "需要处理",
      "acp.stateUnknown": "未知状态",
      "acp.sessionMessage": "会话消息",
      "acp.sender": "发送方",
      "acp.recipient": "接收方",
      "acp.messageId": "消息 ID",
      "acp.terminalEvent": "终端",
      "acp.terminalId": "终端 ID",
      "acp.suggestions": "建议",
      "acp.insertSuggestion": "插入建议",
      "acp.nestedCalls": "嵌套调用 {count} 个",
      "acp.outputPreview": "子 Agent 输出",
      "acp.outputReadFailed": "读取输出文件失败",
      "acp.loadingOutput": "读取中…",
      "acp.binaryOutput": "二进制文件，无法预览。",
      "acp.taskNotification": "任务通知",
      "acp.nativeEventFallback": "原生事件",
      "acp.parentCall": "父调用",
      "acp.commandsPanel": "命令与技能",
      "acp.commandSearch": "搜索命令或技能…",
      "acp.commandsEmpty": "没有匹配的命令",
      "acp.commandGroup": "命令",
      "acp.skillGroup": "技能",
      "acp.commandOpen": "命令",
      "acp.commandsCount": "{count} 个命令",
      "acp.resumingSession": "正在恢复会话…",
      "acp.viewHint": "这个视图常驻在当前会话；切换视图不会结束会话。",
      "acp.currentWorkspace": "当前会话的远端工作区",
      "acp.restored": "已恢复会话。",
      "acp.filePanel": "文件",
      "acp.sessionNoRecord": "还没有 ACP 会话：选择连接与远端工作区后开始。",
      "acp.resumeFailed": "恢复会话失败",
      "acp.dshSession": "DSH 会话"
    };
    var en = {
      "tabs.files": "Remote Files",
      "tabs.term": "Remote Terminal",
      "settings.nav": "Remote Connections",
      "agents.title": "Remote Agents",
      "agents.desc": "Detect and drive Claude Code / Codex on a remote host, or open a shell session.",
      "agents.open": "Open Agent Panel",
      "agents.refresh": "Refresh",
      "agents.connection": "Connection",
      "agents.detected": "Detected agents",
      "agents.none": "No Claude Code / Codex found (install and sign in on the remote host first).",
      "agents.tmuxMissing": "tmux is not available on this host; agent sessions need tmux.",
      "agents.shell": "Shell",
      "agents.chat": "Chat",
      "agents.mode": "Mode",
      "agents.modeTui": "TUI",
      "agents.modeChat": "Chat",
      "agents.modeShell": "Shell",
      "agents.permission": "Permission",
      "agents.permPlan": "Plan (read-only)",
      "agents.permAccept": "Accept edits (default)",
      "agents.permBypass": "Bypass (dangerous)",
      "agents.chatEmpty": "No messages yet. Send one to start.",
      "agents.chatThinking": "Agent is running…",
      "agents.messages": "Messages",
      "agents.keys": "Keys",
      "agents.you": "You",
      "agents.agentRole": "Agent",
      "agents.systemRole": "System",
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
      "flow.agent": "Session agent",
      "flow.agentDsh": "DSH default",
      "flow.localSeg": "Local folder",
      "flow.remoteSeg": "SSH remote",
      "flow.remoteHint": "Choose SSH remote → pick a connection → browse the remote path; Local folder stays on this machine.",
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
      "ops.fail": "Operation failed",
      "acp.hero": "Remote Agent",
      "acp.subtitle": "Drive remote Claude Code / Codex over ACP: connect → detect → pick a workspace → start.",
      "acp.connection": "Connection and agent",
      "acp.profile": "Connection",
      "acp.chooseProfile": "— Choose a connection —",
      "acp.noProfiles": "No connections yet. Add one in Settings → Remote Connections.",
      "acp.detect": "Detect",
      "acp.detecting": "Detecting…",
      "acp.detected": "Remote agents",
      "acp.detectHint": "Detect Claude Code / Codex in the remote PATH and login shell.",
      "acp.detectFailed": "Detection failed",
      "acp.noAgents": "No ACP-capable agent (Claude Code / Codex) found.",
      "acp.agent": "Agent",
      "acp.permission": "Permission",
      "acp.permAccept": "Accept edits (default)",
      "acp.permPlan": "Plan (read-only)",
      "acp.permBypass": "Bypass (dangerous)",
      "acp.workspace": "Remote workspace",
      "acp.workspaceManual": "— Enter mirrorCwd manually —",
      "acp.noWorkspaces": "No remote workspaces yet: enter the local mirrorCwd directly.",
      "acp.mirrorCwd": "Local mirror directory (mirrorCwd)",
      "acp.remotePath": "Remote directory (remotePath)",
      "acp.start": "Start session",
      "acp.starting": "Starting…",
      "acp.startFailed": "Could not start the session",
      "acp.sessions": "Saved sessions",
      "acp.noSessions": "No resumable ACP session yet.",
      "acp.resume": "Resume",
      "acp.resuming": "Resuming…",
      "acp.started": "Session connected.",
      "acp.resumed": "Session resumed.",
      "acp.empty": "No messages yet. Send one to start.",
      "acp.emptyHint": "Send a message, or use the command panel to insert /command or /skills.",
      "acp.quickExplain": "Explain this repository",
      "acp.quickTest": "Run tests and fix failures",
      "acp.quickChanges": "Review uncommitted changes",
      "acp.more": "More",
      "acp.less": "Less",
      "acp.close": "Close",
      "acp.closeFailed": "Could not end the session",
      "acp.endSession": "End session",
      "acp.endSessionDesc": "End and remove this ACP session; it cannot be resumed afterwards.",
      "acp.newSession": "New session",
      "acp.files": "Files",
      "acp.stop": "Stop",
      "acp.stopRequested": "Stop requested for the current turn.",
      "acp.stopFirst": "The current turn is still running; stop it first.",
      "acp.stopReason": "Stop reason",
      "acp.steer": "Steer",
      "acp.steering": "Steering message",
      "acp.steerHint": "The turn is running: sending will steer it immediately instead of waiting.",
      "acp.steerQueued": "The adapter cannot inject messages; queued for the next turn.",
      "acp.steerFailed": "Could not send the steering message",
      "acp.send": "Send",
      "acp.sendHint": "Enter sends, Shift+Enter inserts a newline.",
      "acp.composerPlaceholder": "Message the remote agent…",
      "acp.composerSteerPlaceholder": "Add a steering message (turn in progress)…",
      "acp.you": "You",
      "acp.agentRole": "Agent",
      "acp.thought": "Thinking",
      "acp.show": "Show",
      "acp.hide": "Hide",
      "acp.tool": "Tool",
      "acp.toolPending": "Pending",
      "acp.toolRunning": "Running",
      "acp.toolDone": "Done",
      "acp.toolFailed": "Failed",
      "acp.input": "Input",
      "acp.output": "Output",
      "acp.plan": "Plan",
      "acp.commands": "Commands",
      "acp.notice": "Notice",
      "acp.usage": "Usage",
      "acp.model": "Model",
      "acp.reasoning": "Reasoning",
      "acp.mode": "Mode",
      "acp.running": "Running",
      "acp.waiting": "Waiting for permission",
      "acp.ready": "Ready",
      "acp.stopped": "Stopped",
      "acp.error": "Error",
      "acp.closed": "Closed",
      "acp.permissionTitle": "Permission required",
      "acp.permissionDesc": "{tool} requests permission. Choose how to proceed.",
      "acp.permissionCount": "{count} permission request(s)",
      "acp.permissionWaitingHint": "A permission request is waiting below: allow or reject it.",
      "acp.permissionFailed": "Could not answer the permission request",
      "acp.dismiss": "Dismiss",
      "acp.autoApproved": "Auto-approved (Bypass)",
      "acp.disconnected": "The event stream disconnected; received messages are kept. Resend or resume the session.",
      "acp.noStream": "This browser cannot read a streaming response",
      "acp.configFailed": "Could not change the configuration",
      "acp.cancelFailed": "Cancel failed",
      "acp.cancel": "Cancel",
      "acp.compaction": "Context compaction",
      "acp.code": "Code",
      "acp.copy": "Copy",
      "acp.copied": "Copied",
      "acp.wrap": "Wrap lines",
      "acp.unwrap": "Unwrap lines",
      "acp.footnotes": "Footnotes",
      "acp.collapse": "Collapse",
      "acp.collapseAria": "Collapse",
      "acp.expand": "Show {count} more lines",
      "acp.expandAria": "Show {count} more lines",
      "acp.commandLine": "Command line {n}",
      "acp.signal": "Signal {signal}",
      "acp.exitCode": "Exit code {code}",
      "acp.noExitCode": "No exit code",
      "acp.failed": "Failed",
      "acp.done": "Done",
      "acp.noOutput": "(no output)",
      "acp.readWindow": "Showing {shown} of {total} lines",
      "acp.noProfile": "Choose a connection first",
      "acp.noMirror": "Pick a remote workspace or enter the local mirrorCwd",
      "acp.subagent": "Subagent",
      "acp.subagentAgent": "agent",
      "acp.subagentSession": "session",
      "acp.subagentTask": "task",
      "acp.subagentToolUse": "tool call",
      "acp.subagentBackground": "Background",
      "acp.subagentOutput": "Output file",
      "acp.subagentOpenOutput": "Open output",
      "acp.subagentSummary": "Summary",
      "acp.nativeEvent": "Native event",
      "acp.nativeUpdate": "sessionUpdate",
      "acp.nativeMeta": "nativeMeta",
      "acp.stateRunning": "Running",
      "acp.stateIdle": "Idle",
      "acp.stateRequiresAction": "Requires action",
      "acp.stateUnknown": "Unknown state",
      "acp.sessionMessage": "Session message",
      "acp.sender": "Sender",
      "acp.recipient": "Recipient",
      "acp.messageId": "Message ID",
      "acp.terminalEvent": "Terminal",
      "acp.terminalId": "Terminal ID",
      "acp.suggestions": "Suggestions",
      "acp.insertSuggestion": "Insert suggestion",
      "acp.nestedCalls": "{count} nested call(s)",
      "acp.outputPreview": "Subagent output",
      "acp.outputReadFailed": "Could not read the output file",
      "acp.loadingOutput": "Loading…",
      "acp.binaryOutput": "Binary file; preview unavailable.",
      "acp.taskNotification": "Task notification",
      "acp.nativeEventFallback": "Native event",
      "acp.parentCall": "Parent call",
      "acp.commandsPanel": "Commands and skills",
      "acp.commandSearch": "Search commands or skills…",
      "acp.commandsEmpty": "No matching command",
      "acp.commandGroup": "Commands",
      "acp.skillGroup": "Skills",
      "acp.commandOpen": "Commands",
      "acp.commandsCount": "{count} command(s)",
      "acp.resumingSession": "Restoring the session…",
      "acp.viewHint": "This view belongs to the current session; switching views never ends the session.",
      "acp.currentWorkspace": "The current session's remote workspace",
      "acp.restored": "Session restored.",
      "acp.filePanel": "Files",
      "acp.sessionNoRecord": "No ACP session yet: choose a connection and a remote workspace to start.",
      "acp.resumeFailed": "Could not restore the session",
      "acp.dshSession": "DSH session"
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

    // 建区时选择的 Agent 偏好：按 profileId + remotePath 记忆，后续新会话在 Agent View
    // 里直接预选，不再每次重选。localStorage 足够：它是 UI 偏好，不参与 Host 路由。
    function acpAgentPrefKey(profileId, remotePath) {
      return "rssh.acp.agent." + encodeURIComponent(String(profileId || "")) + "." + encodeURIComponent(String(remotePath || ""));
    }
    function acpReadAgentPref(profileId, remotePath) {
      try {
        var raw = localStorage.getItem(acpAgentPrefKey(profileId, remotePath));
        var v = raw ? JSON.parse(raw) : null;
        if (!v || (v.agent !== "claude" && v.agent !== "codex" && v.agent !== "dsh")) return null;
        return v;
      } catch (e) { return null; }
    }
    function acpWriteAgentPref(profileId, remotePath, pref) {
      try {
        if (!pref) localStorage.removeItem(acpAgentPrefKey(profileId, remotePath));
        else localStorage.setItem(acpAgentPrefKey(profileId, remotePath), JSON.stringify(pref));
      } catch (e) {}
    }

    function RemoteWorkspaceFlow(props) {
      var t = useT();
      var [mode, setMode] = React.useState("local");
      var profiles = useProfiles(props.open);
      var [profileId, setProfileId] = React.useState("");
      var [creating, setCreating] = React.useState(false);
      // 同步范围（issue #28 第 2 条）：建区时就能定，留空 = 全局默认（再留空 = 整树）。
      var [syncPaths, setSyncPaths] = React.useState("");
      var [agentChoice, setAgentChoice] = React.useState("dsh");

      // 每次打开流程时重置为「本地目录」起始界面。
      React.useEffect(function () {
        if (props.open) { setMode("local"); setProfileId(""); setSyncPaths(""); setAgentChoice("dsh"); }
      }, [props.open]);

      if (!props.open) return null;

      function chooseLocal(p) { props.onPicked(p); }

      function chooseRemote(remotePath) {
        setCreating(true);
        // 同步范围（issue #28）：非空才传，空 = 让宿主用「全局默认」兜底（再空 = 整树）
        // 建区时记住 Agent 偏好；后续新会话直接预选。DSH 默认则清掉偏好。
        acpWriteAgentPref(profileId, remotePath, {
          agent: agentChoice, permission: "acceptEdits"
        });
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
          h("div", { className: "rssh-muted", style: { margin: "4px 0 8px", fontSize: 12 } }, t("flow.remoteHint")),
          // 远程模式：连接配置选择
          isRemote ? h("div", { className: "rssh-row" },
            h("span", { className: "rssh-label" }, t("common.profile")),
            h("select", { className: "rssh-select", value: profileId, onChange: function (e) { setProfileId(e.target.value); }, disabled: creating },
              h("option", { value: "" }, t("common.selectProfile")),
              profiles.map(function (p) { return h("option", { key: p.id, value: p.id }, p.name); })
            )
          ) : null,
          isRemote ? h("div", { className: "rssh-row" },
            h("span", { className: "rssh-label" }, t("flow.agent")),
            h("select", { className: "rssh-select", value: agentChoice, onChange: function (e) { setAgentChoice(e.target.value); }, disabled: creating },
              h("option", { value: "dsh" }, t("flow.agentDsh")),
              h("option", { value: "claude" }, "Claude Code"),
              h("option", { value: "codex" }, "Codex")
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
    // 旧「远程 Agent」面板（TUI / Shell / 无头 Chat，2.7.0）
    //
    // 2.8 起入口改为「新建会话」页的 ACP Chat（见下方 AcpChatView），右侧栏页签与设置页
    // 「打开 Agent 面板」按钮都已移除；这里保留组件代码仅作 TUI/Shell 能力的参考实现，
    // 不再注册到任何 Slot，因此 UI 上不会出现。远端 Claude Code / Codex 都是交互式 TUI，
    // 会话放在远端 tmux 里：插件只负责探测、创建（tmux new-session）、转发输入
    // （paste-buffer + Enter）和回看输出（capture-pane）。
    // ======================================================================

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

    function AgentFileGlyph(props) {
      if (props.dir) {
        return primitives.IconFolderOpenOutline16 ? h(primitives.IconFolderOpenOutline16, { size: 16 }) : null;
      }
      if (primitives.FileTypeIcon) return h(primitives.FileTypeIcon, { path: String(props.name || ""), size: 16 });
      return null;
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
              h(AgentFileGlyph, { dir: e.type === "directory", name: e.name }),
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
              h(AgentFileGlyph, { dir: true }), h("span", null, w.path),
              h("span", { className: "ra-file-size" }, w.branch || "")
            );
          })
        )
      );
    }

    function AgentKeysMenu(props) {
      var t = useT();
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      var items = [
        { id: "Up", label: "↑" }, { id: "Down", label: "↓" }, { id: "Tab", label: "Tab" },
        { id: "Enter", label: "Enter" }, { id: "Escape", label: "Esc" }, { id: "C-c", label: "Ctrl-C" }
      ];
      var trigger = h("button", { type: "button", className: "rssh-ui-selector", "aria-haspopup": "menu",
        "aria-expanded": open ? "true" : "false", "aria-label": t("agents.keys"), onClick: function () { setOpen(function (v) { return !v; }); } }, t("agents.keys"));
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
      var [sessionMode, setSessionMode] = React.useState("chat");
      var [permission, setPermission] = React.useState("acceptEdits");
      var [messages, setMessages] = React.useState([]);
      var [chatBusy, setChatBusy] = React.useState(false);
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
          if (r && r.ok) {
            setProbe(r); setErr("");
            if (r.agents && r.agents.length) setAgent(function (prev) { return prev === "shell" ? r.agents[0].id : prev; });
          }
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
        if (!activeId) { setMessages([]); return; }
        api("agents.messages", { id: activeId }).then(function (r) { if (r && r.ok) setMessages(r.messages || []); });
      }, [activeId]);

      React.useEffect(function () {
        var cur = null;
        for (var si = 0; si < sessions.length; si++) if (sessions[si].id === activeId) cur = sessions[si];
        if (!activeId || (cur && cur.mode === "chat")) { setOutput(""); return; }
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
      }, [activeId, sessions]);

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
        var mode = sessionMode;
        var picked = mode === "shell" ? "shell" : agent;
        if (mode !== "shell" && picked === "shell") picked = "claude";
        setBusy(true); setErr("");
        var payload = { profileId: profileId, agent: picked, mode: mode, cwd: cwd };
        if (mode === "chat") payload.permission = permission;
        api("agents.create", Object.assign(payload, extra || {})).then(function (r) {
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
        if (active.mode === "chat") {
          setChatBusy(true);
          setMessages(function (list) { return list.concat([{ role: "user", text: text, ts: Date.now() }]); });
          api("agents.chat", { id: active.id, text: text }).then(function (r) {
            setChatBusy(false);
            if (r && r.ok) {
              setMessages(r.messages || []);
              api("agents.list").then(function (lr) { if (lr && lr.ok) setSessions(lr.sessions || []); });
            }
            else setErr((r && r.error) || t("agents.sendFailed"));
          }, function (e) {
            setChatBusy(false); setErr(String(e && e.message ? e.message : e));
          });
          return;
        }
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
              return h(AgentPill, { key: a.id, active: agent === a.id && sessionMode === "agent", onClick: function () { setAgent(a.id); setSessionMode("agent"); } }, a.name);
            }),
            h(AgentPill, { active: sessionMode === "shell", onClick: function () { setSessionMode("shell"); } }, t("agents.shell"))
          ),
          probe && probe.agents && probe.agents.length === 0 ? h("div", { className: "ra-empty" }, t("agents.none")) : null,
          h("div", { className: "ra-row", style: { marginTop: 6 } },
            h("span", { className: "ra-section" }, t("agents.mode")),
            h(AgentPill, { active: sessionMode === "agent", onClick: function () { if (agent === "shell") setAgent("claude"); setSessionMode("agent"); } }, t("agents.modeTui")),
            h(AgentPill, { active: sessionMode === "chat", onClick: function () { if (agent === "shell") setAgent("claude"); setSessionMode("chat"); } }, t("agents.modeChat")),
            h(AgentPill, { active: sessionMode === "shell", onClick: function () { setSessionMode("shell"); } }, t("agents.modeShell"))
          ),
          sessionMode === "chat" ? h("div", { className: "ra-row" },
            h("span", { className: "ra-section" }, t("agents.permission")),
            h(CompactMenuSelect, {
              label: t("agents.permission"), value: permission,
              options: [
                { id: "plan", label: t("agents.permPlan") },
                { id: "acceptEdits", label: t("agents.permAccept") },
                { id: "bypass", label: t("agents.permBypass") }
              ],
              onChange: setPermission
            })
          ) : null,
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
                h("div", { className: "ra-session-sub" }, (s.mode === "chat" ? "Chat" : (s.mode === "shell" ? "Shell" : "TUI")) + " · " + (s.alive ? t("agents.running") : t("agents.exited")) + " · " + s.cwd)
              )
            );
          })
        ),

        h("div", { className: "ra-chat" },
          h("div", { className: "ra-chat-head" },
            h("div", { className: "ra-chat-title" }, active ? (active.title + " · " + active.cwd) : t("agents.noActive")),
            active ? h("div", { className: "ra-head-actions" },
              h(UiButton, { variant: "outline", size: "sm", onClick: function () { setFilesOpen(true); } }, t("agents.files")),
              active.mode === "chat" ? null : h(AgentKeysMenu, { onKey: key }),
              h(UiButton, { variant: "outline", size: "sm", className: "rssh-ui-danger", onClick: kill }, t("agents.kill"))
            ) : null
          ),
          active && active.mode === "chat"
            ? h("div", { className: "ra-messages", ref: outRef },
                messages.length === 0 ? h("div", { className: "ra-empty" }, t("agents.chatEmpty")) :
                  messages.map(function (m, mi) {
                    var role = m.role === "user" ? "agents.you" : (m.role === "assistant" ? "agents.agentRole" : "agents.systemRole");
                    return h("div", { key: mi, className: "ra-msg ra-msg-" + (m.role || "assistant") },
                      h("div", { className: "ra-msg-role" }, t(role)),
                      h("div", { className: "ra-msg-text" }, String(m.text || ""))
                    );
                  }),
                chatBusy ? h("div", { className: "ra-empty" }, t("agents.chatThinking")) : null
              )
            : h("pre", { className: "ra-output", ref: outRef }, output || t("agents.noOutput")),
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
    // ACP Chat（远端 Claude Code / Codex）
    //
    // 入口：DSH 会话内的 conversation.view（Agent Tab，list/session scope）。
    // 通过工作区原生的「新会话 / ⌘N」→「SSH」→ 远端工作区创建会话后，切到「远端 Agent」
    // Tab；View 绑定 props.sessionId（Host dshSessionId）自动 acpList/acpResume。
    // 事件来自 acpPrompt 的 NDJSON 流（Host 侧 lib/acp.js），这里只做渲染与交互：
    //   · MarkdownText 渲染正文，DiffBlock / TerminalBlock / ReadBlock 渲染工具内容
    //   · permission 事件挂起成卡片，optionId 原样回传（不自动批准；bypass 由 Host 自动）
    //   · prompt 流未结束时 composer 走 acpSteer，立即上屏 user_message(steering)
    //   · 顶部模型 / 思考级别 / 模式选择走 acpSetConfig / acpSetMode
    // ======================================================================
    // ==== ACP Chat UI (start) ====
    var acpKeySeq = 0;
    function acpNextKey(prefix) { acpKeySeq += 1; return String(prefix || "k") + acpKeySeq; }

    /** 从 Host 的 {ok,error} 里取可读错误（error 可能是字符串或 {code,message}）。 */
    function acpErrorMessage(r, fallback) {
      if (!r) return fallback;
      if (typeof r.error === "string" && r.error) return r.error;
      if (r.error && r.error.message) return String(r.error.message);
      return fallback;
    }

    /** configOptions 的 options 允许「分组」或「平铺」两种形状，统一成 Menu 的 items。 */
    function acpFlatSelectOptions(options) {
      var out = [];
      var list = Array.isArray(options) ? options : [];
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item.options)) {
          var group = String(item.name || item.label || item.group || "");
          for (var j = 0; j < item.options.length; j++) {
            var sub = item.options[j];
            if (!sub || typeof sub !== "object" || sub.value === undefined) continue;
            out.push({
              id: String(sub.value),
              label: String(sub.name || sub.value),
              group: group,
              detail: String(sub.description || "")
            });
          }
        } else if (item.value !== undefined) {
          out.push({
            id: String(item.value),
            label: String(item.name || item.value),
            group: "",
            detail: String(item.description || "")
          });
        }
      }
      return out;
    }

    /** Markdown / Diff / Terminal / Read 原语的本地化标签（共享原语不内置文案）。 */
    function acpBlockLabels(t) {
      var codeToolbar = {
        codeLabel: t("acp.code"),
        wrapLabel: t("acp.wrap"),
        unwrapLabel: t("acp.unwrap")
      };
      var collapseAria = t("acp.collapseAria");
      var expandAria = function (count) { return t("acp.expandAria", { count: count }); };
      var collapse = t("acp.collapse");
      var expand = function (count) { return t("acp.expand", { count: count }); };
      return {
        markdown: {
          code: {
            copyLabel: t("acp.copy"),
            copiedLabel: t("acp.copied"),
            toolbarLabels: codeToolbar
          },
          footnotes: t("acp.footnotes")
        },
        diff: {
          codeLabel: codeToolbar.codeLabel, wrapLabel: codeToolbar.wrapLabel, unwrapLabel: codeToolbar.unwrapLabel,
          copy: t("acp.copy"), copied: t("acp.copied"),
          collapseAria: collapseAria, expandAria: expandAria,
          collapse: collapse, expand: expand
        },
        read: {
          codeLabel: codeToolbar.codeLabel, wrapLabel: codeToolbar.wrapLabel, unwrapLabel: codeToolbar.unwrapLabel,
          window: function (shown, total) { return t("acp.readWindow", { shown: shown, total: total }); },
          copy: t("acp.copy"), copied: t("acp.copied"),
          collapseAria: collapseAria, expandAria: expandAria,
          collapse: collapse, expand: expand
        },
        terminal: {
          commandLine: function (n) { return t("acp.commandLine", { n: n }); },
          signal: function (signal) { return t("acp.signal", { signal: signal }); },
          exitCode: function (code) { return t("acp.exitCode", { code: code }); },
          noExitCode: t("acp.noExitCode"),
          running: t("acp.running"),
          failed: t("acp.failed"),
          done: t("acp.done"),
          copy: t("acp.copy"), copied: t("acp.copied"),
          noOutput: t("acp.noOutput"),
          collapseAria: collapseAria,
          collapse: collapse,
          expandAria: expandAria,
          expand: expand
        }
      };
    }

    /** 多行输入：优先用共享原语，旧宿主没有 Textarea 时退化为主题化的原生控件。 */
    function AcpTextarea(props) {
      // 不用 primitives.Textarea：它自带外框/内边距，会把 composer 卡片切成两层。
      return h("textarea", Object.assign({ className: "ra-acp-textarea", rows: 2 }, props));
    }

    /** 正文 Markdown：共享原语缺失时退化为可读纯文本（老宿主不至于白屏）。 */
    function AcpMarkdown(props) {
      if (primitives.MarkdownText) {
        return h(primitives.MarkdownText, { text: props.text, labels: props.labels });
      }
      return h("div", { className: "ra-acp-md", style: { whiteSpace: "pre-wrap" } }, String(props.text || ""));
    }

    /** ACP 的 NDJSON 流：按行 JSON.parse，最后一行没有换行也要处理。 */
    async function acpReadNdjson(body, onEvent) {
      var reader = body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      try {
        while (true) {
          var step = await reader.read();
          if (step.done) break;
          buffer += decoder.decode(step.value, { stream: true });
          var idx;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            var line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (!line.trim()) continue;
            var parsed;
            try { parsed = JSON.parse(line); } catch (e) { continue; }
            onEvent(parsed);
          }
        }
        if (buffer.trim()) {
          try { onEvent(JSON.parse(buffer)); } catch (e) {}
        }
      } finally {
        try { reader.releaseLock(); } catch (e) {}
      }
    }

    /** 长 ID 在卡片里只显示短码。 */
    function acpShortId(value) {
      var text = String(value == null ? "" : value);
      if (!text) return "";
      if (text.length <= 16) return text;
      return text.slice(0, 8) + "…" + text.slice(-4);
    }

    /** JSON 预览：任意值 → 截断文本（nativeMeta / rawInput / rawOutput 共用）。 */
    function acpJsonText(value, max) {
      if (value === undefined) return "";
      try {
        var text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
        if (!text) return "";
        var limit = max || 4000;
        return text.length > limit ? text.slice(0, limit) + "…" : text;
      } catch (e) {
        return String(value);
      }
    }

    /** ACP sessionUpdate 名（native 可能是字符串或事件对象）。 */
    function acpNativeName(native) {
      if (typeof native === "string") return native;
      if (native && typeof native === "object") {
        return String(native.sessionUpdate || native.sessionUpdateType || native.type || native.name || "");
      }
      return "";
    }

    /** session_message.content 可能是字符串、content block 或数组。 */
    function acpContentText(value) {
      if (value === undefined || value === null) return "";
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        return value.map(acpContentText).filter(Boolean).join("\n\n");
      }
      if (typeof value === "object") {
        if (typeof value.text === "string") return value.text;
        if (value.content !== undefined) return acpContentText(value.content);
        if (value.message !== undefined) return acpContentText(value.message);
        return acpJsonText(value, 4000);
      }
      return String(value);
    }

    /** 防御：Host 尚未转换的 Claude task-notification 文本不要当普通用户消息平铺。 */
    function acpLooksLikeTaskNotification(text) {
      var value = String(text || "");
      return /<task-notification[\s>]/i.test(value)
        || /<task_notification[\s>]/i.test(value)
        || /"type"\s*:\s*"task_notification"/.test(value)
        || /"type"\s*:\s*"task-notification"/.test(value);
    }

    /** 终端 exitStatus 可能是 number / string / {exitCode, signal}。 */
    function acpNormalizeExit(exitStatus) {
      if (exitStatus === undefined || exitStatus === null || exitStatus === "") {
        return { exitCode: undefined, signal: undefined, running: true };
      }
      if (typeof exitStatus === "number") return { exitCode: exitStatus, signal: undefined, running: false };
      if (typeof exitStatus === "string") {
        if (/^\d+$/.test(exitStatus)) return { exitCode: Number(exitStatus), signal: undefined, running: false };
        if (exitStatus === "running") return { exitCode: undefined, signal: undefined, running: true };
        return { exitCode: undefined, signal: exitStatus, running: false };
      }
      if (typeof exitStatus === "object") {
        var code = exitStatus.exitCode !== undefined ? exitStatus.exitCode
          : exitStatus.exit_code !== undefined ? exitStatus.exit_code : exitStatus.code;
        if (code !== undefined && code !== null) {
          return { exitCode: Number(code), signal: exitStatus.signal, running: false };
        }
        if (exitStatus.signal) return { exitCode: undefined, signal: String(exitStatus.signal), running: false };
        return { exitCode: undefined, signal: undefined, running: exitStatus.running === true };
      }
      return {};
    }

    /** state / subagent state → StateDot + 文案 + Tag tone。 */
    function acpNativeState(state) {
      var raw = state;
      if (raw && typeof raw === "object") raw = raw.type || raw.state || raw.status || "";
      var value = String(raw || "").toLowerCase();
      if (value === "running" || value === "in_progress" || value === "working") {
        return { dot: "ongoing", key: "acp.stateRunning", tone: "neutral" };
      }
      if (value === "requires_action" || value === "requires-action" || value === "waiting" || value === "pending") {
        return { dot: "warning", key: "acp.stateRequiresAction", tone: "warning" };
      }
      if (value === "idle" || value === "done" || value === "completed") {
        return { dot: value === "done" || value === "completed" ? "done" : "idle", key: "acp.stateIdle", tone: "neutral" };
      }
      if (value === "failed" || value === "error") {
        return { dot: "warning", key: "acp.toolFailed", tone: "warning" };
      }
      return { dot: "idle", key: "acp.stateUnknown", tone: "neutral" };
    }

    /** Claude Agent / Task 工具卡：识别为子 Agent。 */
    function acpIsSubagentTool(tool) {
      if (!tool) return false;
      if (tool.subagent && typeof tool.subagent === "object") return true;
      var name = String(tool.name || tool.title || "").toLowerCase();
      var kind = String(tool.kind || "").toLowerCase();
      if (/^(agent|task|subagent)$/.test(name) || /^agent\s*[:\-]/.test(name)) return true;
      if (/^(agent|task|subagent)$/.test(kind)) return true;
      var raw = tool.rawInput;
      if (raw && typeof raw === "object" && !raw.truncated) {
        if (raw.subagent_type || raw.subagentType || raw.agent_id || raw.agentId || raw.agent) return true;
      }
      return false;
    }

    /** 从 Claude Agent 工具参数 / Host subagent 字段归一化子 Agent 元数据。 */
    function acpSubagentFromTool(tool) {
      var t = tool || {};
      var raw = t.rawInput && typeof t.rawInput === "object" && !t.rawInput.truncated ? t.rawInput : {};
      var out = t.rawOutput && typeof t.rawOutput === "object" && !t.rawOutput.truncated ? t.rawOutput : {};
      var sub = t.subagent && typeof t.subagent === "object" ? t.subagent : {};
      return {
        toolCallId: String(t.toolCallId || ""),
        agentId: String(sub.agentId || sub.agent || raw.subagent_type || raw.subagentType || raw.agent_id || raw.agentId || raw.agent || ""),
        sessionId: String(sub.sessionId || out.sessionId || raw.sessionId || ""),
        title: String(sub.title || t.title || t.name || ""),
        description: String(sub.description || raw.description || t.title || t.name || ""),
        background: sub.background === true || raw.run_in_background === true || raw.background === true || out.background === true,
        outputFile: String(sub.outputFile || out.outputFile || out.output_file || raw.outputFile || raw.output_file || ""),
        state: sub.state !== undefined ? sub.state : t.status,
        summary: String(sub.summary || (typeof t.output === "string" ? t.output : "")),
        native: sub.native !== undefined ? sub.native : t.native,
        nativeMeta: sub.nativeMeta !== undefined ? sub.nativeMeta : t.nativeMeta
      };
    }

    /** 子 Agent 条目的稳定 key（Host 各 adapter 字段不同，按可用性优先）。 */
    function acpSubagentKey(sub) {
      var s = sub || {};
      return String(s.agentId || s.sessionId || s.taskId || s.toolUseId || s.toolCallId || s.id || "");
    }

    /** 树渲染 key：工具用 toolCallId，子 Agent 用 agentId/sessionId/taskId。 */
    function acpItemId(item) {
      if (!item) return "";
      if (item.type === "tool") return String((item.tool && item.tool.toolCallId) || "");
      if (item.type === "subagent") return String(item._key || (item.subagent && item.subagent._key) || "");
      return String(item.key || "");
    }

    function acpItemParent(item) {
      if (!item) return "";
      if (item.type === "tool") return String((item.tool && item.tool.parentToolCallId) || "");
      if (item.type === "subagent") {
        return String(item.parentToolCallId || (item.subagent && item.subagent.parentToolCallId) || "");
      }
      return "";
    }

    function acpChildrenFor(item, childMap, ancestors) {
      var id = acpItemId(item);
      if (!id || !childMap) return [];
      var list = childMap[id] || [];
      var seen = ancestors || [];
      return list.filter(function (child) {
        var cid = acpItemId(child);
        return cid && cid !== id && seen.indexOf(cid) < 0;
      });
    }

    /** parentToolCallId → 子条目；只认已知父节点，避免孤儿被隐藏。 */
    function acpBuildChildMap(items) {
      var known = {};
      var i;
      for (i = 0; i < items.length; i++) {
        var id = acpItemId(items[i]);
        if (id) known[id] = true;
      }
      var map = {};
      for (i = 0; i < items.length; i++) {
        var parent = acpItemParent(items[i]);
        if (!parent || parent === acpItemId(items[i]) || !known[parent]) continue;
        if (!map[parent]) map[parent] = [];
        map[parent].push(items[i]);
      }
      return { map: map, known: known };
    }

    /** native / nativeMeta 折叠详情：默认收起，所有卡片共用。 */
    function AcpNativeDetails(props) {
      var t = props.t;
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      var hasNative = props.native !== undefined && props.native !== null && props.native !== "";
      var hasMeta = props.nativeMeta !== undefined && props.nativeMeta !== null;
      if (!hasNative && !hasMeta) return null;
      var name = acpNativeName(props.native);
      return h("div", { className: "ra-acp-native" },
        h(UiButton, {
          variant: "outline", size: "sm",
          "aria-expanded": open ? "true" : "false",
          onClick: function () { setOpen(function (v) { return !v; }); }
        },
          t("acp.nativeEvent") + (name ? " · " + name : "") + (open ? " " + t("acp.hide") : " " + t("acp.show"))),
        open ? h("div", { className: "ra-acp-native-body" },
          hasNative ? h("div", { className: "ra-acp-native-row" },
            h("span", { className: "ra-acp-role" }, t("acp.nativeUpdate")),
            h("span", { className: "ra-acp-shortid" }, name || acpJsonText(props.native, 400))
          ) : null,
          hasMeta ? h("div", null,
            h("div", { className: "ra-acp-role" }, t("acp.nativeMeta")),
            h("pre", { className: "ra-acp-json" }, acpJsonText(props.nativeMeta, 4000))
          ) : null
        ) : null
      );
    }

    /** 子 Agent 头部：标题、短码、状态、描述、输出文件。 */
    function AcpSubagentMeta(props) {
      var t = props.t;
      var sub = props.subagent || {};
      var state = acpNativeState(sub.state !== undefined && sub.state !== null ? sub.state : sub.status);
      var title = String(sub.title || sub.description || t("acp.subagent"));
      var description = String(sub.description || "");
      var ids = [];
      if (sub.agentId) ids.push(t("acp.subagentAgent") + ": " + acpShortId(sub.agentId));
      if (sub.sessionId) ids.push(t("acp.subagentSession") + ": " + acpShortId(sub.sessionId));
      if (sub.taskId) ids.push(t("acp.subagentTask") + ": " + acpShortId(sub.taskId));
      if (sub.toolUseId) ids.push(t("acp.subagentToolUse") + ": " + acpShortId(sub.toolUseId));
      return h("div", { className: "ra-acp-subagent-meta" },
        h("div", { className: "ra-acp-subagent-head" },
          primitives.StateDot ? h(primitives.StateDot, { state: state.dot }) : null,
          primitives.Tag ? h(primitives.Tag, { tone: "neutral" }, t("acp.subagent")) : null,
          h("span", { className: "ra-acp-subagent-title" }, title),
          primitives.Tag ? h(primitives.Tag, { tone: state.tone }, t(state.key)) : null,
          sub.background ? (primitives.Tag ? h(primitives.Tag, { tone: "warning" }, t("acp.subagentBackground")) : null) : null,
          ids.length ? h("span", { className: "ra-acp-tool-sum" }, ids.join(" · ")) : null
        ),
        description && description !== title ? h("div", { className: "ra-acp-subagent-desc" }, description) : null,
        sub.outputFile ? h("div", { className: "ra-acp-subagent-file" },
          h("span", { className: "ra-acp-role" }, t("acp.subagentOutput") + ":"),
          h("code", { className: "ra-acp-loc" }, String(sub.outputFile)),
          props.onOpenOutput ? h(UiButton, {
            variant: "outline", size: "sm",
            onClick: function () { props.onOpenOutput(String(sub.outputFile), title); }
          }, t("acp.subagentOpenOutput")) : null
        ) : null
      );
    }

    /** 独立子 Agent 卡片（subagent / subagent_update）。 */
    function AcpSubagentCard(props) {
      var t = props.t;
      var sub = props.subagent || {};
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      var summary = String(sub.summary || sub.content || sub.message || "");
      var id = acpItemId({ type: "subagent", subagent: sub, _key: props._key });
      var ancestors = props.ancestors || [];
      var children = acpChildrenFor({ type: "subagent", subagent: sub, _key: id }, props.childMap, ancestors);
      return h("div", { className: "ra-acp-subagent" },
        h(AcpSubagentMeta, { subagent: sub, t: t, onOpenOutput: props.onOpenOutput }),
        summary ? h("div", { className: "ra-acp-subagent-actions" },
          h(UiButton, {
            variant: "outline", size: "sm",
            "aria-expanded": open ? "true" : "false",
            onClick: function () { setOpen(function (v) { return !v; }); }
          }, (open ? t("acp.hide") : t("acp.show")) + " · " + t("acp.subagentSummary"))
        ) : null,
        open && summary ? h("div", { className: "ra-acp-subagent-body" },
          h("div", { className: "ra-acp-role" }, t("acp.subagentSummary")),
          h("div", { className: "ra-acp-md" }, h(AcpMarkdown, { text: summary, labels: props.labels.markdown }))
        ) : null,
        h(AcpNativeDetails, { t: t, native: sub.native !== undefined ? sub.native : sub.sessionUpdate, nativeMeta: sub.nativeMeta }),
        h(AcpNestedChildren, {
          items: children, childMap: props.childMap, labels: props.labels, t: t,
          onOpenOutput: props.onOpenOutput, ancestors: ancestors.concat([id])
        })
      );
    }

    /** state 事件：紧凑状态条。 */
    function AcpStateCard(props) {
      var t = props.t;
      var item = props.item || {};
      var state = acpNativeState(item.state);
      return h("div", { className: "ra-acp-state", role: "status" },
        h("div", { className: "ra-acp-state-head" },
          primitives.StateDot ? h(primitives.StateDot, { state: state.dot }) : null,
          primitives.Tag ? h(primitives.Tag, { tone: "neutral" }, t("acp.state")) : null,
          primitives.Tag ? h(primitives.Tag, { tone: state.tone }, t(state.key)) : h("span", null, t(state.key)),
          item.stopReason ? h("span", { className: "ra-acp-tool-sum" }, t("acp.stopReason") + ": " + String(item.stopReason)) : null,
          item.errorMessage || item.error ? h("span", { className: "ra-acp-error" },
            String(item.errorMessage || (typeof item.error === "string" ? item.error : acpJsonText(item.error, 800)))) : null
        ),
        h(AcpNativeDetails, { t: t, native: item.native, nativeMeta: item.nativeMeta })
      );
    }

    /** session_message：sender → recipient + MarkdownText。 */
    function AcpSessionMessageCard(props) {
      var t = props.t;
      var item = props.item || {};
      var content = item.text !== undefined && item.text !== "" ? String(item.text) : acpContentText(item.content);
      return h("div", { className: "ra-acp-card" },
        h("div", { className: "ra-acp-card-head" },
          primitives.Tag ? h(primitives.Tag, { tone: "neutral" }, t("acp.sessionMessage")) : null,
          h("span", { className: "ra-acp-shortid" },
            acpShortId(item.sender || "?") + " → " + acpShortId(item.recipient || "?")),
          item.messageId ? h("span", { className: "ra-acp-tool-sum" },
            t("acp.messageId") + ": " + acpShortId(item.messageId)) : null
        ),
        content ? h("div", { className: "ra-acp-md" },
          h(AcpMarkdown, { text: content, labels: props.labels.markdown })
        ) : null,
        h(AcpNativeDetails, { t: t, native: item.native, nativeMeta: item.nativeMeta })
      );
    }

    /** terminal 原生事件：TerminalBlock + native 详情。 */
    function AcpTerminalEventCard(props) {
      var t = props.t;
      var item = props.item || {};
      var exit = acpNormalizeExit(item.exitStatus);
      var output = String(item.output == null ? "" : item.output);
      return h("div", { className: "ra-acp-card" },
        h("div", { className: "ra-acp-card-head" },
          primitives.Tag ? h(primitives.Tag, { tone: "neutral" }, t("acp.terminalEvent")) : null,
          item.terminalId ? h("span", { className: "ra-acp-shortid" }, t("acp.terminalId") + ": " + acpShortId(item.terminalId)) : null,
          item.cwd ? h("code", { className: "ra-acp-loc" }, String(item.cwd)) : null
        ),
        primitives.TerminalBlock ? h(primitives.TerminalBlock, {
          command: String(item.command || ""),
          cwd: String(item.cwd || ""),
          output: output,
          exitCode: exit.exitCode,
          signal: exit.signal,
          running: exit.running,
          labels: props.labels.terminal,
          maxLines: 12
        }) : h("pre", { className: "ra-acp-json" }, output),
        h(AcpNativeDetails, { t: t, native: item.native, nativeMeta: item.nativeMeta })
      );
    }

    /** 通用 native 事件（Host type: "native"）。 */
    function AcpNativeEventCard(props) {
      var t = props.t;
      var item = props.item || {};
      var name = acpNativeName(item.native) || String(item.label || "");
      return h("div", { className: "ra-acp-card" },
        h("div", { className: "ra-acp-card-head" },
          primitives.Tag ? h(primitives.Tag, { tone: "neutral" }, t("acp.nativeEventFallback")) : null,
          name ? h("span", { className: "ra-acp-shortid" }, name) : null
        ),
        h(AcpNativeDetails, { t: t, native: item.native, nativeMeta: item.nativeMeta })
      );
    }

    /** 嵌套调用容器：缩进 + 折叠（折叠按钮用 DSH Button）。 */
    function AcpNestedChildren(props) {
      var t = props.t;
      var items = props.items || [];
      var pair = React.useState(true);
      var open = pair[0], setOpen = pair[1];
      if (!items.length) return null;
      return h("div", { className: "ra-acp-children" },
        h("div", { className: "ra-acp-children-head" },
          h(UiButton, {
            variant: "outline", size: "sm",
            "aria-expanded": open ? "true" : "false",
            onClick: function () { setOpen(function (v) { return !v; }); }
          }, t("acp.nestedCalls", { count: items.length }) + " · " + (open ? t("acp.collapse") : t("acp.expand")))
        ),
        open ? items.map(function (item) {
          return h(AcpNestedItem, {
            key: item.key, item: item, childMap: props.childMap, labels: props.labels,
            t: t, onOpenOutput: props.onOpenOutput, ancestors: props.ancestors
          });
        }) : null
      );
    }

    function AcpNestedItem(props) {
      var item = props.item;
      if (!item) return null;
      if (item.type === "subagent") {
        var id = acpItemId(item);
        return h(AcpSubagentCard, {
          subagent: item.subagent, _key: id,
          childMap: props.childMap, labels: props.labels, t: props.t,
          onOpenOutput: props.onOpenOutput, ancestors: (props.ancestors || []).concat([id])
        });
      }
      if (item.type === "tool") {
        var tid = acpItemId(item);
        return h(AcpToolCard, {
          tool: item.tool, itemKey: tid,
          childMap: props.childMap, labels: props.labels, t: props.t,
          onOpenOutput: props.onOpenOutput, ancestors: (props.ancestors || []).concat([tid])
        });
      }
      return null;
    }

    /** 工具卡片：名称 / 状态 / 子 Agent / 嵌套调用 / diff / 终端 / 读取内容 / 原生事件。 */
    function AcpToolCard(props) {
      var t = props.t;
      var labels = props.labels;
      var tool = props.tool || {};
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      var content = Array.isArray(tool.content) ? tool.content : [];
      var diffs = Array.isArray(tool.diffs) && tool.diffs.length
        ? tool.diffs
        : content.filter(function (c) { return c && c.type === "diff"; });
      var terminals = Array.isArray(tool.terminals) && tool.terminals.length
        ? tool.terminals
        : content.filter(function (c) { return c && c.type === "terminal"; });
      var locations = Array.isArray(tool.locations) ? tool.locations : [];
      var name = String(tool.name || tool.title || "");
      var displayName = String(tool.title || tool.name || "");
      var kind = String(tool.kind || "").toLowerCase();
      var lower = (name + " " + kind).toLowerCase();
      var isRead = !diffs.length && !terminals.length && (kind === "read" || /(^|[\s_-])read([\s_-]|$)/.test(lower));
      var isTerminal = !diffs.length && (terminals.length > 0 || kind === "execute" || /bash|shell|terminal|(^|[\s_-])exec([\s_-]|$)|command/.test(lower));
      var status = String(tool.status || "");
      var statusKey = status === "completed" ? "acp.toolDone"
        : status === "failed" ? "acp.toolFailed"
          : status === "in_progress" ? "acp.toolRunning" : "acp.toolPending";
      var statusTone = status === "in_progress" || status === "pending" ? "warning" : "neutral";
      var dotState = status === "completed" ? "done"
        : status === "failed" ? "warning"
          : status === "in_progress" ? "ongoing" : "idle";
      var output = typeof tool.output === "string" ? tool.output : "";
      var command = "";
      var rawInput = tool.rawInput;
      if (typeof rawInput === "string") command = rawInput;
      else if (rawInput && typeof rawInput === "object" && !rawInput.truncated) {
        command = String(rawInput.command || rawInput.cmd || rawInput.command_line || rawInput.commandLine || "");
      }
      var subagent = acpIsSubagentTool(tool) ? acpSubagentFromTool(tool) : null;
      var summary = locations.length && locations[0] && locations[0].path ? String(locations[0].path) : "";
      if (!summary) summary = command || (output ? String(output).split("\n")[0] : "");
      if (summary.length > 160) summary = summary.slice(0, 160) + "…";
      var readLines = output ? String(output).split("\n").map(function (text, i) { return { number: i + 1, text: text }; }) : [];
      var id = String(tool.toolCallId || props.itemKey || "");
      var ancestors = props.ancestors || [];
      var children = acpChildrenFor({ type: "tool", tool: tool }, props.childMap, ancestors);
      var header;
      if (subagent) {
        header = h(React.Fragment, null,
          h(AcpSubagentMeta, { subagent: subagent, t: t, onOpenOutput: props.onOpenOutput }),
          h("div", { className: "ra-acp-subagent-actions" },
            h(UiButton, {
              variant: "outline", size: "sm",
              "aria-expanded": open ? "true" : "false",
              onClick: function () { setOpen(function (v) { return !v; }); }
            }, (open ? t("acp.collapse") : t("acp.expand")) + " · " + t("acp.toolDetails")))
        );
      } else {
        header = h("button", {
          type: "button", className: "ra-acp-tool-head",
          "aria-expanded": open ? "true" : "false",
          onClick: function () { setOpen(function (v) { return !v; }); }
        },
          primitives.StateDot ? h(primitives.StateDot, { state: dotState }) : null,
          h("span", { className: "ra-acp-tool-title" }, displayName || t("acp.tool")),
          primitives.Tag ? h(primitives.Tag, { tone: statusTone }, t(statusKey)) : h("span", null, t(statusKey)),
          h("span", { className: "ra-acp-tool-sum" }, summary),
          tool.parentToolCallId ? h("span", { className: "ra-acp-shortid" }, "↳ " + acpShortId(tool.parentToolCallId)) : null,
          primitives.IconChevronDownOutlineRegular
            ? h(primitives.IconChevronDownOutlineRegular, { size: 12 })
            : null
        );
      }
      return h("div", { className: "ra-acp-tool" },
        header,
        locations.length ? h("div", { className: "ra-acp-locations" },
          locations.map(function (loc, i) {
            return h("span", { key: acpNextKey("loc") + i, className: "ra-acp-loc" },
              String(loc.path || "") + (loc.line == null ? "" : ":" + loc.line));
          })
        ) : null,
        diffs.length ? h("div", { className: "ra-acp-tool-body" },
          primitives.DiffBlock ? h(primitives.DiffBlock, {
            diffs: diffs.map(function (d) {
              return {
                path: String(d.path || ""),
                oldText: d.oldText == null ? null : String(d.oldText),
                newText: String(d.newText || "")
              };
            }),
            labels: labels.diff,
            maxLines: open ? 400 : 8
          }) : h("pre", { className: "ra-acp-json" }, diffs.map(function (d) { return String(d.path || "") + "\n" + String(d.newText || ""); }).join("\n\n"))
        ) : isTerminal ? h("div", { className: "ra-acp-tool-body" },
          primitives.TerminalBlock ? h(primitives.TerminalBlock, {
            command: command || name,
            output: output,
            labels: labels.terminal,
            maxLines: open ? 400 : 8
          }) : h("pre", { className: "ra-acp-json" }, output)
        ) : isRead && readLines.length ? h("div", { className: "ra-acp-tool-body" },
          primitives.ReadBlock ? h(primitives.ReadBlock, {
            label: locations.length && locations[0] ? String(locations[0].path || "") : name,
            lines: readLines,
            totalLines: readLines.length,
            labels: labels.read,
            maxLines: open ? 400 : 8
          }) : h("pre", { className: "ra-acp-json" }, output)
        ) : null,
        open ? h("div", { className: "ra-acp-tool-body" },
          output && !isTerminal && !isRead ? h("div", { className: "ra-acp-md" },
            h(AcpMarkdown, { text: output, labels: labels.markdown })
          ) : null,
          tool.rawInput !== undefined ? h("div", null,
            h("div", { className: "ra-acp-role" }, t("acp.input")),
            h("pre", { className: "ra-acp-json" }, acpJsonText(tool.rawInput, 4000))
          ) : null,
          tool.rawOutput !== undefined ? h("div", null,
            h("div", { className: "ra-acp-role" }, t("acp.output")),
            h("pre", { className: "ra-acp-json" }, acpJsonText(tool.rawOutput, 4000))
          ) : null
        ) : null,
        h(AcpNativeDetails, { t: t, native: tool.native !== undefined ? tool.native : tool.sessionUpdate, nativeMeta: tool.nativeMeta }),
        h(AcpNestedChildren, {
          items: children, childMap: props.childMap, labels: labels, t: t,
          onOpenOutput: props.onOpenOutput, ancestors: ancestors.concat([id])
        })
      );
    }

    /** ACP plan（完整快照）→ 待办卡片。 */
    function AcpPlanCard(props) {
      var t = props.t;
      var entries = Array.isArray(props.entries) ? props.entries : [];
      return h("div", { className: "ra-acp-plan" },
        h("div", { className: "ra-acp-role" }, t("acp.plan")),
        entries.length === 0
          ? h("div", { className: "ra-acp-system" }, String(props.content || ""))
          : entries.map(function (entry, i) {
            var state = entry.status === "completed" ? "done"
              : entry.status === "in_progress" ? "ongoing" : "idle";
            return h("div", { key: acpNextKey("plan") + i, className: "ra-acp-plan-row" },
              primitives.StateDot ? h(primitives.StateDot, { state: state }) : null,
              h("span", null, String(entry.content || ""))
            );
          }),
        h(AcpNativeDetails, { t: t, native: props.native, nativeMeta: props.nativeMeta })
      );
    }

    /** HITL 权限卡片：按 adapter 返回的 options 原样渲染，点击回传 optionId。 */
    function AcpPermissionCard(props) {
      var t = props.t;
      var permission = props.permission || {};
      var tool = permission.tool || {};
      var options = Array.isArray(permission.options) ? permission.options : [];
      var label = String(tool.title || tool.name || t("acp.tool"));
      var locations = Array.isArray(tool.locations) ? tool.locations : [];
      return h("div", { className: "ra-acp-perm", role: "alertdialog", "aria-label": t("acp.permissionTitle") },
        h("div", { className: "ra-acp-perm-head" },
          primitives.Tag ? h(primitives.Tag, { tone: "warning" }, t("acp.permissionTitle")) : null,
          h("span", null, label),
          primitives.StateDot ? h(primitives.StateDot, { state: "warning" }) : null
        ),
        locations.length ? h("div", { className: "ra-acp-locations" },
          locations.map(function (loc, i) {
            return h("span", { key: acpNextKey("ploc") + i, className: "ra-acp-loc" },
              String(loc.path || "") + (loc.line == null ? "" : ":" + loc.line));
          })
        ) : null,
        h("div", { className: "ra-acp-role" }, t("acp.permissionDesc", { tool: label })),
        h("div", { className: "ra-acp-perm-opts" },
          options.map(function (option, i) {
            var optionId = String(option.optionId || "");
            return h(UiButton, {
              key: acpNextKey("popt") + i,
              variant: option.kind === "allow_once" ? "primary" : "outline",
              size: "sm",
              onClick: function () { props.onAnswer(permission, optionId); }
            }, String(option.name || optionId));
          }),
          h(UiButton, {
            variant: "outline", size: "sm",
            onClick: function () { props.onDismiss(permission); }
          }, t("acp.dismiss"))
        ),
        h(AcpNativeDetails, { t: t, native: permission.native, nativeMeta: permission.nativeMeta })
      );
    }

    /** 去掉命令名前导斜杠（Host / `/name` 两种写法都接受）。 */
    function acpCommandName(command) {
      return String((command && command.name) || "").replace(/^\/+/, "");
    }

    /** 命令分组：Host 可给 group/category/kind/source；skills 归到 Skills。 */
    function acpCommandGroup(command) {
      var group = String((command && (command.group || command.category || command.kind || command.source)) || "").trim();
      if (group) return group;
      var name = acpCommandName(command).toLowerCase();
      var desc = String((command && command.description) || "");
      if (name === "skills" || name.indexOf("skill") === 0 || /skill/i.test(desc)) return "Skills";
      return "Commands";
    }

    /** 命令面板的分组 + 搜索（name / description / input.hint）。 */
    function acpCommandGroups(commands, query) {
      var needle = String(query || "").trim().toLowerCase();
      var buckets = {};
      var order = [];
      for (var i = 0; i < commands.length; i++) {
        var command = commands[i] || {};
        var name = acpCommandName(command);
        if (!name) continue;
        var hint = command.input && command.input.hint ? String(command.input.hint) : "";
        var haystack = (name + " " + String(command.description || "") + " " + hint).toLowerCase();
        if (needle && haystack.indexOf(needle) < 0) continue;
        var group = acpCommandGroup(command);
        if (!buckets[group]) { buckets[group] = []; order.push(group); }
        buckets[group].push(command);
      }
      order.sort(function (a, b) {
        var rank = function (g) { return g === "Skills" ? 0 : g === "Commands" ? 1 : 2; };
        return rank(a) - rank(b) || a.localeCompare(b);
      });
      return order.map(function (group) { return { name: group, items: buckets[group] }; });
    }

    /** 每个 DSH Session 记住最近一次 ACP 会话，切换 View/重挂载时先恢复 UI，再向 Host resume。 */
    var acpViewCache = {};

    /** ACP Chat 常驻 View：配置 → 会话 → 事件流渲染 → composer。 */
    /**
     * 隐藏原生「对话」Tab 的会话标记：只要当前 DSH 会话绑定了一个 ACP 会话，
     * 就把 body[data-acp-session] 打开，让 Tab 行只剩「远端 Agent」这一个对话表面；
     * ACP 会话结束/关闭后自动恢复原生 Chat。用 session-scoped 的 input.dock 挂载
     * 一个不渲染内容的组件，避免再新增可见入口。
     */
    var acpAutoTried = {}; // dshSessionId → 已尝试自动进入 ACP，避免切 View 重挂载后重复 start

    /** 建区时选了 Agent 的工作区：新会话创建后自动启动 ACP 会话并切到「远端 Agent」Tab，
     *  让 ACP 成为默认会话，而不是先落在原生 Chat 再让用户手动切换。 */
    function AcpSessionMarker(props) {
      var t = useT();
      var sid = String((props && props.sessionId) || "");
      var snapshot = props && typeof props.useWorkspaces === "function"
        ? props.useWorkspaces(function (s) { return s; })
        : null;

      function focusAgentTab() {
        try {
          var tabs = document.querySelectorAll('[data-conversation-tabs] button[role="tab"]');
          for (var i = 0; i < tabs.length; i++) {
            if (String(tabs[i].textContent || "").trim() === t("acp.hero")) {
              tabs[i].click();
              return;
            }
          }
        } catch (e) {}
      }

      function enter() {
        document.body.setAttribute("data-acp-session", sid);
        setTimeout(focusAgentTab, 120);
      }

      React.useEffect(function () {
        if (!sid || !snapshot || !Array.isArray(snapshot.items)) return;
        var wsPath = "";
        for (var i = 0; i < snapshot.items.length; i++) {
          var w = snapshot.items[i];
          if (w && Array.isArray(w.sessionIds) && w.sessionIds.indexOf(sid) >= 0) { wsPath = String(w.path || ""); break; }
        }
        var disposed = false;
        function titleVisibleInMain(title) {
          try {
            var nodes = document.querySelectorAll("button,[role=\"button\"],a");
            for (var k = 0; k < nodes.length; k++) {
              var el = nodes[k];
              if (String(el.textContent || "").trim() !== String(title || "")) continue;
              var rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && rect.left > 260 && rect.top < 460) return true;
            }
          } catch (e) {}
          return false;
        }
        api("listWorkspaces").then(function (r) {
          if (disposed || !r || !r.ok) return;
          var wsInfo = null;
          for (var j = 0; j < (r.workspaces || []).length; j++) {
            if (wsPath && String(r.workspaces[j].mirrorPath || "") === wsPath) { wsInfo = r.workspaces[j]; break; }
          }
          if (!wsInfo) {
            // 空白新会话尚未把 workspace 关联到 sessionId；从 hero 主区域里可见的
            // workspace 标题反查（侧边栏在 x<260，主区域在工作区选择器处）。
            for (var k2 = 0; k2 < (r.workspaces || []).length; k2++) {
              if (titleVisibleInMain(r.workspaces[k2].title)) { wsInfo = r.workspaces[k2]; break; }
            }
          }
          if (!wsInfo) return;
          var pref = acpReadAgentPref(wsInfo.profileId, wsInfo.remotePath);
          // 旧工作区没有偏好：远端工作区默认走 ACP（上次用过的 agent，否则 Claude），
          // 这样点工作区的「新会话」不会再闪出原生 composer。显式选过 DSH 默认的跳过。
          if (!pref) {
            var last = "";
            try { last = localStorage.getItem("rssh.acp.lastAgent") || ""; } catch (e) {}
            pref = { agent: (last === "codex" ? "codex" : "claude"), permission: "acceptEdits" };
          }
          if (pref.agent === "dsh" || (pref.agent !== "claude" && pref.agent !== "codex")) return;
          if (acpAutoTried[sid]) { enter(); return; }
          acpAutoTried[sid] = true;
          // 启动 ACP 的几秒里先把原生 composer/对话 Tab 藏起来，避免新会话一闪而过。
          document.body.setAttribute("data-acp-preferred", sid);
          api("acpList", { dshSessionId: sid }).then(function (res) {
            if (disposed) return;
            var has = !!(res && res.ok && (res.sessions || []).some(function (x) {
              return x && x.lifecycle !== "closed" && x.dshSessionId === sid;
            }));
            if (has) { document.body.removeAttribute("data-acp-preferred"); enter(); return; }
            api("acpStart", {
              profileId: wsInfo.profileId,
              agent: pref.agent,
              mirrorCwd: wsInfo.mirrorPath,
              remotePath: wsInfo.remotePath,
              permission: pref.permission || "acceptEdits",
              dshSessionId: sid
            }).then(function (started) {
              if (disposed) return;
              document.body.removeAttribute("data-acp-preferred");
              if (started && started.ok) enter();
              else delete acpAutoTried[sid];
            }).catch(function () {
              document.body.removeAttribute("data-acp-preferred");
              delete acpAutoTried[sid];
            });
          }).catch(function () {
            document.body.removeAttribute("data-acp-preferred");
            delete acpAutoTried[sid];
          });
        });
        return function () {
          disposed = true;
          if (document.body.getAttribute("data-acp-preferred") === sid) document.body.removeAttribute("data-acp-preferred");
        };
      }, [sid, snapshot && snapshot.items]);

      // 只在 ACP 会话存在时隐藏原生对话 Tab；关闭 ACP 后恢复。
      React.useEffect(function () {
        if (!sid) return;
        var disposed = false;
        function check() {
          api("acpList", { dshSessionId: sid }).then(function (r) {
            if (disposed) return;
            var has = !!(r && r.ok && (r.sessions || []).some(function (x) {
              return x && x.lifecycle !== "closed" && x.dshSessionId === sid;
            }));
            if (has) document.body.setAttribute("data-acp-session", sid);
            else document.body.removeAttribute("data-acp-session");
          }).catch(function () {});
        }
        check();
        var timer = setInterval(check, 2500);
        return function () {
          disposed = true;
          clearInterval(timer);
          document.body.removeAttribute("data-acp-session");
        };
      }, [sid]);
      return null;
    }

    function AcpChatView(props) {
      var t = useT();
      var labels = acpBlockLabels(t);
      var profiles = useProfiles(0);
      var dshSessionId = String((props && props.sessionId) || "");
      var cachedView = dshSessionId && acpViewCache[dshSessionId] ? acpViewCache[dshSessionId] : null;
      // 根作用域标准 hook：用当前 DSH 会话所属工作区推断远端工作区（sessionIds 里包含 props.sessionId）。
      var workspaceSnapshot = props && typeof props.useWorkspaces === "function"
        ? props.useWorkspaces(function (snapshot) { return snapshot; })
        : null;

      var profilePair = React.useState("");
      var profileId = profilePair[0], setProfileId = profilePair[1];
      var agentsPair = React.useState([]);
      var agents = agentsPair[0], setAgents = agentsPair[1];
      var agentPair = React.useState("claude");
      var agent = agentPair[0], setAgent = agentPair[1];
      var permissionPair = React.useState("acceptEdits");
      var permission = permissionPair[0], setPermission = permissionPair[1];
      var workspacesPair = React.useState([]);
      var workspaces = workspacesPair[0], setWorkspaces = workspacesPair[1];
      var wsPair = React.useState("");
      var wsId = wsPair[0], setWsId = wsPair[1];
      var mirrorPair = React.useState("");
      var mirrorCwd = mirrorPair[0], setMirrorCwd = mirrorPair[1];
      var remotePair = React.useState("");
      var remotePath = remotePair[0], setRemotePath = remotePair[1];
      var sessionsPair = React.useState([]);
      var sessions = sessionsPair[0], setSessions = sessionsPair[1];
      var sessionPair = React.useState(cachedView ? cachedView.session : null);
      var session = sessionPair[0], setSession = sessionPair[1];
      var configPair = React.useState(cachedView ? cachedView.config : null);
      var config = configPair[0], setConfig = configPair[1];
      var itemsPair = React.useState(cachedView ? (cachedView.items || []) : []);
      var items = itemsPair[0], setItems = itemsPair[1];
      var commandsPair = React.useState(cachedView ? (cachedView.commands || []) : []);
      var commands = commandsPair[0], setCommands = commandsPair[1];
      var commandsMetaPair = React.useState(cachedView ? (cachedView.commandsMeta || null) : null);
      var commandsMeta = commandsMetaPair[0], setCommandsMeta = commandsMetaPair[1];
      var usagePair = React.useState(cachedView ? (cachedView.usage || null) : null);
      var usage = usagePair[0], setUsage = usagePair[1];
      var pendingPair = React.useState([]);
      var pending = pendingPair[0], setPending = pendingPair[1];
      var draftPair = React.useState("");
      var draft = draftPair[0], setDraft = draftPair[1];
      var runningPair = React.useState(false);
      var running = runningPair[0], setRunning = runningPair[1];
      var busyPair = React.useState("");
      var busy = busyPair[0], setBusy = busyPair[1];
      var errorPair = React.useState("");
      var error = errorPair[0], setError = errorPair[1];
      var stoppedPair = React.useState("");
      var stoppedReason = stoppedPair[0], setStoppedReason = stoppedPair[1];
      var probePair = React.useState("");
      var probeMessage = probePair[0], setProbeMessage = probePair[1];
      var titlePair = React.useState(cachedView ? (cachedView.title || "") : "");
      var sessionTitle = titlePair[0], setSessionTitle = titlePair[1];
      var bootPair = React.useState(!!dshSessionId && !cachedView);
      var booting = bootPair[0], setBooting = bootPair[1];
      var endPair = React.useState(false);
      var endConfirm = endPair[0], setEndConfirm = endPair[1];
      var filesPair = React.useState(false);
      var filesOpen = filesPair[0], setFilesOpen = filesPair[1];
      var suggestionsPair = React.useState([]);
      var suggestions = suggestionsPair[0], setSuggestions = suggestionsPair[1];
      var suggestionMetaPair = React.useState(null);
      var suggestionMeta = suggestionMetaPair[0], setSuggestionMeta = suggestionMetaPair[1];
      var outputPair = React.useState(null);
      var outputPreview = outputPair[0], setOutputPreview = outputPair[1];
      var commandOpenPair = React.useState(false);
      var commandOpen = commandOpenPair[0], setCommandOpen = commandOpenPair[1];
      var commandQueryPair = React.useState("");
      var advancedPair = React.useState(false);
      var advancedConfig = advancedPair[0], setAdvancedConfig = advancedPair[1];
      var commandQuery = commandQueryPair[0], setCommandQuery = commandQueryPair[1];

      var seqRef = React.useRef(cachedView ? (cachedView.seq || 0) : 0);
      var echoRef = React.useRef([]);
      var steerRef = React.useRef([]);
      var runningRef = React.useRef(false);
      var abortRef = React.useRef(null);
      var attachRef = React.useRef(null);
      var attachTimerRef = React.useRef(null);
      var attachUnsupportedRef = React.useRef(false);
      var replayingRef = React.useRef(false);
      var sessionRef = React.useRef(cachedView ? cachedView.session : null);
      var mountedRef = React.useRef(true);
      var listRef = React.useRef(null);

      function profileName(id) {
        for (var i = 0; i < profiles.length; i++) {
          if (profiles[i].id === id) return String(profiles[i].name || profiles[i].host || id);
        }
        return String(id || "");
      }

      var currentWorkspacePath = "";
      if (workspaceSnapshot && Array.isArray(workspaceSnapshot.items) && dshSessionId) {
        for (var wi = 0; wi < workspaceSnapshot.items.length; wi++) {
          var wsv = workspaceSnapshot.items[wi];
          if (wsv && Array.isArray(wsv.sessionIds) && wsv.sessionIds.indexOf(dshSessionId) >= 0) {
            currentWorkspacePath = String(wsv.path || "");
            break;
          }
        }
      }

      function refreshSessions() {
        api("acpList", { dshSessionId: dshSessionId }).then(function (r) {
          if (r && r.ok && mountedRef.current) setSessions(r.sessions || []);
        });
      }

      function samePath(a, b) {
        return String(a || "").replace(/[\\/]+$/, "").toLowerCase() === String(b || "").replace(/[\\/]+$/, "").toLowerCase();
      }

      function isCurrentSession(id) {
        return !!sessionRef.current && String(sessionRef.current.id) === String(id || "");
      }

      function sessionLooksBusy() {
        var current = sessionRef.current;
        if (!current) return false;
        var status = String(current.status || "");
        return current.busy === true || status === "prompting" || status === "starting";
      }

      function stopAttach() {
        if (attachTimerRef.current) {
          clearTimeout(attachTimerRef.current);
          attachTimerRef.current = null;
        }
        if (attachRef.current) {
          attachRef.current.stopped = true;
          try { attachRef.current.controller.abort(); } catch (e) {}
          attachRef.current = null;
        }
      }

      function scheduleAttach(id) {
        if (!mountedRef.current || !id || attachUnsupportedRef.current) return;
        if (attachTimerRef.current) clearTimeout(attachTimerRef.current);
        attachTimerRef.current = setTimeout(function () {
          attachTimerRef.current = null;
          openAttach(id);
        }, 1500);
      }

      /** acpAttach：NDJSON replay + live；断开不 cancel。只 abort 浏览器侧连接，重连继续收事件。 */
      function openAttach(id) {
        if (!mountedRef.current || !id || attachUnsupportedRef.current) return;
        if (!isCurrentSession(id)) return;
        if (attachRef.current && !attachRef.current.stopped && String(attachRef.current.sessionId) === String(id)) return;
        stopAttach();
        var controller = new AbortController();
        var entry = { controller: controller, sessionId: String(id), stopped: false };
        attachRef.current = entry;
        fetch("/remote-ssh/api/acpAttach", {
          method: "POST",
          headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
          body: JSON.stringify({ id: id, sinceSeq: seqRef.current }),
          signal: controller.signal
        }).then(function (res) {
          var contentType = String(res.headers.get("content-type") || "");
          if (!res.ok || contentType.indexOf("ndjson") < 0) {
            return res.text().then(function (raw) {
              var error = new Error(raw || ("HTTP " + res.status));
              error.endpointUnsupported = res.status === 404 || /unknown api method/i.test(raw);
              throw error;
            });
          }
          if (!res.body || typeof res.body.getReader !== "function") {
            var streamError = new Error("stream unavailable");
            streamError.endpointUnsupported = true;
            throw streamError;
          }
          return acpReadNdjson(res.body, function (ev) {
            if (!mountedRef.current || entry.stopped) return;
            if (!isCurrentSession(id)) return;
            applyEvent(ev);
          });
        }).catch(function (e) {
          if (e && e.name === "AbortError") return;
          if (e && e.endpointUnsupported) {
            attachUnsupportedRef.current = true;
            return;
          }
        }).then(function () {
          if (entry.stopped || !mountedRef.current) return;
          attachRef.current = null;
          if (!attachUnsupportedRef.current && isCurrentSession(id)) scheduleAttach(id);
        });
      }

      /** 先 acpEvents 回放（seq 去重），再打开 attach 接收 live；两者都有时也只应用一次。 */
      function attachSession(id) {
        if (!id || !mountedRef.current) return;
        attachUnsupportedRef.current = false;
        api("acpEvents", { id: id }).then(function (r) {
          if (!mountedRef.current || !isCurrentSession(id)) return;
          if (r && r.ok) {
            var attachState = r.session || {
              status: r.status, busy: r.busy, config: r.config,
              pendingPermissions: r.pendingPermissions, lastError: r.lastError,
              lifecycle: r.lifecycle, dshSessionId: r.dshSessionId
            };
            mergeSessionState(attachState);
            var events = Array.isArray(r.events) ? r.events.slice() : [];
            events.sort(function (a, b) { return Number((a && a.seq) || 0) - Number((b && b.seq) || 0); });
            replayingRef.current = true;
            try {
              for (var i = 0; i < events.length; i++) applyEvent(events[i]);
            } finally {
              replayingRef.current = false;
            }
            // 历史 stop/idle 不应盖掉 Host 当前的 busy 状态；回放后再对齐一次。
            // 不再覆盖 pendingPermissions：回放中的 permission 事件可能比快照更新。
            mergeSessionState({
              status: attachState.status, busy: attachState.busy,
              config: attachState.config, lastError: attachState.lastError
            });
          }
          openAttach(id);
        }).catch(function () {
          if (mountedRef.current && isCurrentSession(id)) openAttach(id);
        });
      }

      var lastDshRef = React.useRef(dshSessionId);
      React.useEffect(function () {
        var alive = true;
        var changed = lastDshRef.current !== dshSessionId;
        lastDshRef.current = dshSessionId;
        if (changed) {
          stopAttach();
          if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} abortRef.current = null; }
          var resetCache = dshSessionId ? acpViewCache[dshSessionId] : null;
          sessionRef.current = resetCache ? resetCache.session : null;
          setSession(resetCache ? resetCache.session : null);
          setConfig(resetCache ? resetCache.config : null);
          setItems(resetCache ? (resetCache.items || []) : []);
          setCommands(resetCache ? (resetCache.commands || []) : []);
          setCommandsMeta(resetCache ? (resetCache.commandsMeta || null) : null);
          setUsage(resetCache ? (resetCache.usage || null) : null);
          setSessionTitle(resetCache ? (resetCache.title || "") : "");
          seqRef.current = resetCache ? (resetCache.seq || 0) : 0;
          setPending([]);
          setError("");
          setRunning(false);
          runningRef.current = false;
        }
        api("listWorkspaces").then(function (r) {
          if (alive && r && r.ok) setWorkspaces(r.workspaces || []);
        });
        if (!dshSessionId) {
          setBooting(false);
          return function () { alive = false; };
        }
        var cached = acpViewCache[dshSessionId];
        setBooting(!(cached && cached.session));
        api("acpList", { dshSessionId: dshSessionId }).then(function (r) {
          if (!alive || !mountedRef.current) return;
          if (!r || !r.ok) {
            setBooting(false);
            setError(acpErrorMessage(r, t("acp.detectFailed")));
            return;
          }
          var list = Array.isArray(r.sessions) ? r.sessions : [];
          setSessions(list);
          var target = null;
          for (var i = 0; i < list.length; i++) {
            if (String(list[i].dshSessionId || "") === dshSessionId) { target = list[i]; break; }
          }
          if (!target && cached && cached.session) {
            for (var j = 0; j < list.length; j++) {
              if (String(list[j].id) === String(cached.session.id)) { target = list[j]; break; }
            }
            if (!target) target = cached.session;
          }
          if (target && target.id) {
            resume(target, true);
          } else {
            setBooting(false);
          }
        });
        return function () { alive = false; };
      }, [dshSessionId]);

      // 刷新 View / 切回 Tab 时保留已渲染的消息；Host resume 会校验会话是否仍存活。
      React.useEffect(function () {
        if (!dshSessionId) return;
        var current = sessionRef.current || session;
        if (!current) return;
        acpViewCache[dshSessionId] = {
          session: current,
          config: config,
          items: items,
          commands: commands,
          commandsMeta: commandsMeta,
          usage: usage,
          title: sessionTitle,
          seq: seqRef.current,
          updatedAt: Date.now()
        };
      }, [dshSessionId, session, config, items, commands, commandsMeta, usage, sessionTitle]);

      // 默认套用当前 DSH 会话所属的远端工作区，减少重复选择。
      React.useEffect(function () {
        if (session || mirrorCwd || !currentWorkspacePath) return;
        var hit = null;
        for (var i = 0; i < workspaces.length; i++) {
          if (samePath(workspaces[i].mirrorPath, currentWorkspacePath)) { hit = workspaces[i]; break; }
        }
        if (!hit) return;
        setWsId(String(hit.id || ""));
        if (hit.profileId) setProfileId(String(hit.profileId));
        setMirrorCwd(String(hit.mirrorPath || ""));
        setRemotePath(String(hit.remotePath || ""));
        var pref = acpReadAgentPref(hit.profileId, hit.remotePath);
        if (pref) {
          if (pref.agent === "claude" || pref.agent === "codex") setAgent(pref.agent);
          if (pref.permission) setPermission(pref.permission);
        }
        if (hit.profileId && !agents.length) detect(String(hit.profileId));
      }, [currentWorkspacePath, workspaces.length, session, mirrorCwd]);

      React.useEffect(function () {
        if (!profileId && profiles.length === 1) setProfileId(profiles[0].id);
      }, [profiles.length]);

      React.useEffect(function () {
        return function () {
          mountedRef.current = false;
          // 只 abort 浏览器侧本地流；Host 的 turn 继续跑（acpPrompt 断开不再 cancel），
          // 也不调用 acpCancel/acpClose —— 回来靠 attach/events 续上。
          stopAttach();
          if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} abortRef.current = null; }
        };
      }, []);

      React.useEffect(function () {
        var el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [items.length, pending.length]);

      function updateItems(mutator) {
        setItems(function (prev) { return mutator(prev); });
      }

      function appendStreamText(prev, type, text) {
        var last = prev.length ? prev[prev.length - 1] : null;
        if (last && last.type === type) {
          var copy = prev.slice(0, prev.length - 1);
          copy.push(Object.assign({}, last, { text: String(last.text || "") + String(text || "") }));
          return copy;
        }
        return prev.concat([{ key: acpNextKey(type), type: type, text: String(text || "") }]);
      }

      function mergeTool(prev, patch) {
        var out = Object.assign({}, prev || {});
        var keys = ["toolCallId", "parentToolCallId", "title", "name", "kind", "status", "output", "rawInput", "rawOutput", "locations", "content", "diffs", "terminals", "subagent", "native", "nativeMeta"];
        for (var i = 0; i < keys.length; i++) {
          if (patch[keys[i]] !== undefined) out[keys[i]] = patch[keys[i]];
        }
        return out;
      }

      function upsertTool(prev, ev) {
        var id = String(ev.toolCallId || "");
        var idx = -1;
        for (var i = prev.length - 1; i >= 0; i--) {
          if (prev[i].type === "tool" && String((prev[i].tool && prev[i].tool.toolCallId) || "") === id) { idx = i; break; }
        }
        if (idx < 0) return prev.concat([{ key: acpNextKey("tool"), type: "tool", tool: Object.assign({}, ev) }]);
        var next = prev.slice();
        next[idx] = Object.assign({}, prev[idx], { tool: mergeTool(prev[idx].tool, ev) });
        return next;
      }

      function upsertSubagent(prev, ev) {
        var key = acpSubagentKey(ev);
        var idx = -1;
        if (key) {
          for (var i = prev.length - 1; i >= 0; i--) {
            if (prev[i].type === "subagent" && String(prev[i]._key || acpSubagentKey(prev[i].subagent)) === key) { idx = i; break; }
          }
        } else {
          for (var j = prev.length - 1; j >= 0; j--) {
            if (prev[j].type === "subagent") { idx = j; break; }
          }
        }
        if (idx < 0) {
          var sub = Object.assign({}, ev, { _key: key || acpNextKey("subagent") });
          return prev.concat([{
            key: acpNextKey("subagent"), _key: sub._key, type: "subagent", subagent: sub,
            parentToolCallId: sub.parentToolCallId || ""
          }]);
        }
        var oldItem = prev[idx];
        var oldSub = oldItem.subagent || {};
        var merged = Object.assign({}, oldSub, ev, {
          _key: oldItem._key || key
        });
        // subagent_update 常带 null 字段（Host 每次都给 title/description/state），不要用 null 覆盖已有值。
        var keep = ["agentId", "sessionId", "taskId", "toolUseId", "title", "description", "outputFile", "summary", "cwd", "state", "status", "capabilities"];
        for (var k = 0; k < keep.length; k++) {
          var field = keep[k];
          if (ev[field] === undefined || ev[field] === null) {
            if (oldSub[field] !== undefined && oldSub[field] !== null) merged[field] = oldSub[field];
          }
        }
        if (ev.state === undefined || ev.state === null) {
          if (oldSub.state !== undefined && oldSub.state !== null) merged.state = oldSub.state;
          else if (oldSub.status !== undefined) merged.state = null;
        }
        var next = prev.slice();
        next[idx] = Object.assign({}, oldItem, {
          subagent: merged,
          parentToolCallId: merged.parentToolCallId || oldItem.parentToolCallId || ""
        });
        return next;
      }

      function upsertSessionMessage(prev, ev) {
        var id = String(ev.messageId || "");
        var chunk = ev.chunk === true;
        var evText = ev.text !== undefined ? String(ev.text) : acpContentText(ev.content);
        var idx = -1;
        if (id) {
          for (var i = prev.length - 1; i >= 0; i--) {
            if (prev[i].type === "session_message" && String(prev[i].messageId || "") === id) { idx = i; break; }
          }
        } else if (chunk) {
          for (var j = prev.length - 1; j >= 0; j--) {
            if (prev[j].type === "session_message") { idx = j; break; }
          }
        }
        if (idx >= 0) {
          var next = prev.slice();
          var merged = Object.assign({}, prev[idx], ev, { type: "session_message" });
          merged.text = chunk ? String(prev[idx].text || "") + evText : evText;
          if (merged.sender === undefined || merged.sender === null) merged.sender = prev[idx].sender;
          if (merged.recipient === undefined || merged.recipient === null) merged.recipient = prev[idx].recipient;
          next[idx] = merged;
          return next;
        }
        return prev.concat([Object.assign({}, ev, {
          key: acpNextKey("sessionmsg"), type: "session_message", text: evText
        })]);
      }

      function upsertTerminalEvent(prev, ev) {
        var id = String(ev.terminalId || "");
        var output = ev.output === undefined ? "" : String(ev.output);
        var append = ev.chunk === true || ev.append === true || ev.delta === true;
        if (id) {
          for (var i = prev.length - 1; i >= 0; i--) {
            if (prev[i].type === "terminal_event" && String(prev[i].terminalId || "") === id) {
              var next = prev.slice();
              var merged = Object.assign({}, prev[i], ev, {
                type: "terminal_event",
                output: append ? String(prev[i].output || "") + output : output
              });
              // chunk 事件通常没有 exitStatus / command / cwd，保留先前值。
              if (ev.exitStatus === undefined || ev.exitStatus === null) merged.exitStatus = prev[i].exitStatus;
              if (ev.command === undefined || ev.command === null) merged.command = prev[i].command;
              if (ev.cwd === undefined || ev.cwd === null) merged.cwd = prev[i].cwd;
              next[i] = merged;
              return next;
            }
          }
        }
        return prev.concat([Object.assign({}, ev, {
          key: acpNextKey("terminal"), type: "terminal_event", output: output
        })]);
      }

      function openOutput(path, title) {
        var target = String(path || "");
        if (!target || !sessionRef.current) return;
        setOutputPreview({ path: target, title: title || target, loading: true, content: "", binary: false, error: "" });
        api("readFile", { profileId: sessionRef.current.profileId, path: target }).then(function (r) {
          if (!mountedRef.current) return;
          if (!r || !r.ok) {
            setOutputPreview(function (prev) {
              return Object.assign({}, prev || {}, { loading: false, error: acpErrorMessage(r, t("acp.outputReadFailed")) });
            });
            return;
          }
          setOutputPreview(function (prev) {
            return Object.assign({}, prev || {}, {
              loading: false,
              content: String(r.content || ""),
              binary: !!r.binary,
              error: ""
            });
          });
        });
      }

      function pushEcho(text, steering) {
        echoRef.current.push({ text: text, steering: !!steering });
      }

      function consumeEcho(text, steering) {
        var list = echoRef.current;
        for (var i = 0; i < list.length; i++) {
          if (list[i].text === text && list[i].steering === !!steering) {
            list.splice(i, 1);
            return true;
          }
        }
        return false;
      }

      function mergeSessionState(state) {
        if (!state) return;
        var next = Object.assign({}, sessionRef.current || {}, state);
        if (!next.agentLabel && next.agent) next.agentLabel = next.agent;
        sessionRef.current = next;
        setSession(next);
        if (state.config) setConfig(state.config);
        var status = String(state.status || "");
        if (state.busy !== undefined || status) {
          var busy = state.busy === true || status === "prompting" || status === "starting";
          runningRef.current = busy;
          setRunning(busy);
        }
        if (Array.isArray(state.pendingPermissions)) {
          setPending(state.pendingPermissions.map(function (permission) {
            return Object.assign({}, permission, {
              type: "permission",
              requestId: String(permission.requestId || ""),
              native: permission.native || "session/request_permission"
            });
          }));
        }
      }

      function enterSession(result, fresh, fallback, preserve) {
        var base = fallback || {};
        var cached = dshSessionId && acpViewCache[dshSessionId];
        var keep = !!preserve && cached && cached.session && String(cached.session.id) === String(result.id);
        var next = {
          id: result.id,
          sessionId: result.sessionId || base.sessionId || "",
          agent: result.agent || base.agent || agent,
          agentLabel: result.agentLabel || base.agentLabel || (result.agent || base.agent || agent),
          profileId: result.profileId || base.profileId || profileId,
          mirrorCwd: result.mirrorCwd || base.mirrorCwd || mirrorCwd,
          remotePath: result.remotePath || base.remotePath || remotePath || "~",
          permission: result.permission || base.permission || permission,
          status: (result.session && result.session.status) || "ready",
          dshSessionId: dshSessionId
        };
        sessionRef.current = next;
        setSession(next);
        setConfig(result.config || (keep ? cached.config : null));
        var sessionStatus = String((result.session && result.session.status) || "");
        var sessionBusy = !!(result.session && (result.session.busy === true
          || sessionStatus === "prompting" || sessionStatus === "starting"));
        runningRef.current = sessionBusy;
        setRunning(sessionBusy);
        stopAttach();
        echoRef.current = [];
        steerRef.current = [];
        if (keep) {
          seqRef.current = cached.seq || 0;
          setItems((cached.items || []).length
            ? (cached.items || [])
            : [{ key: acpNextKey("sys"), type: "system", text: t("acp.restored") }]);
          setCommands(cached.commands || []);
          setCommandsMeta(cached.commandsMeta || null);
          setUsage(cached.usage || null);
          setSessionTitle(cached.title || "");
        } else {
          seqRef.current = 0;
          setItems([{ key: acpNextKey("sys"), type: "system", text: fresh ? t("acp.started") : t("acp.resumed") }]);
          setCommands([]);
          setCommandsMeta(null);
          setUsage(null);
          setSessionTitle("");
        }
        setPending([]);
        setSuggestions([]);
        setSuggestionMeta(null);
        setOutputPreview(null);
        setDraft("");
        setError("");
        setStoppedReason("");
        setBusy("");
        setBooting(false);
        setEndConfirm(false);
        setCommandOpen(false);
        setCommandQuery("");
        refreshSessions();
        attachSession(next.id);
      }

      function applyEvent(ev) {
        if (!ev || typeof ev !== "object") return;
        if (typeof ev.seq === "number") {
          if (ev.seq <= seqRef.current) return;
          seqRef.current = ev.seq;
        }
        var type = String(ev.type || "");
        if (type === "text") {
          var text = String(ev.text || "");
          if (!text) return;
          updateItems(function (prev) { return appendStreamText(prev, "assistant", text); });
          return;
        }
        if (type === "thought") {
          var thought = String(ev.text || "");
          if (!thought) return;
          updateItems(function (prev) { return appendStreamText(prev, "thought", thought); });
          return;
        }
        if (type === "user_message") {
          var userText = String(ev.text || "");
          if (!userText) return;
          if (acpLooksLikeTaskNotification(userText)) {
            updateItems(function (prev) {
              return prev.concat([{
                key: acpNextKey("tasknote"), type: "notice",
                text: t("acp.taskNotification"), severity: "info",
                native: ev.native || "task-notification", nativeMeta: ev.nativeMeta
              }]);
            });
            return;
          }
          var steering = ev.steering === true;
          if (consumeEcho(userText, steering)) return;
          updateItems(function (prev) {
            return prev.concat([{ key: acpNextKey("user"), type: "user", text: userText, steering: steering }]);
          });
          return;
        }
        if (type === "tool_call" || type === "tool_call_update") {
          if (!ev.toolCallId) return;
          updateItems(function (prev) { return upsertTool(prev, ev); });
          return;
        }
        if (type === "subagent" || type === "subagent_update") {
          var subEv = Object.assign({}, ev);
          // Claude task-notification 的 toolUseId 通常就是 Agent 工具的 toolCallId。
          if (!subEv.parentToolCallId && subEv.toolUseId) subEv.parentToolCallId = String(subEv.toolUseId);
          updateItems(function (prev) { return upsertSubagent(prev, subEv); });
          return;
        }
        if (type === "state") {
          var nativeState = acpNativeState(ev.state);
          if (nativeState.key === "acp.stateRunning" || nativeState.key === "acp.stateRequiresAction") {
            runningRef.current = true;
            setRunning(true);
            setStoppedReason("");
          } else if (nativeState.key === "acp.stateIdle") {
            if (!(replayingRef.current && sessionLooksBusy())) {
              runningRef.current = false;
              setRunning(false);
            }
          }
          updateItems(function (prev) {
            var rest = prev.filter(function (item) { return item.type !== "state"; });
            return rest.concat([{
              key: acpNextKey("state"), type: "state",
              state: ev.state, stopReason: ev.stopReason,
              error: ev.error, errorMessage: ev.errorMessage,
              native: ev.native, nativeMeta: ev.nativeMeta
            }]);
          });
          return;
        }
        if (type === "session_message") {
          updateItems(function (prev) { return upsertSessionMessage(prev, ev); });
          return;
        }
        if (type === "terminal") {
          if (!ev.terminalId && ev.output === undefined) return;
          updateItems(function (prev) { return upsertTerminalEvent(prev, ev); });
          return;
        }
        if (type === "suggestions") {
          var suggestionList = Array.isArray(ev.suggestions) ? ev.suggestions
            : Array.isArray(ev.items) ? ev.items : [];
          var normalized = [];
          for (var si = 0; si < suggestionList.length && normalized.length < 8; si++) {
            var suggestion = suggestionList[si];
            var suggestionText = typeof suggestion === "string" ? suggestion
              : suggestion && typeof suggestion === "object"
                ? String(suggestion.text || suggestion.label || suggestion.prompt || suggestion.value || "") : "";
            if (suggestionText) normalized.push(suggestionText);
          }
          setSuggestions(normalized);
          setSuggestionMeta(ev.native !== undefined || ev.nativeMeta !== undefined
            ? { native: ev.native, nativeMeta: ev.nativeMeta } : null);
          return;
        }
        if (type === "native") {
          updateItems(function (prev) {
            return prev.concat([{
              key: acpNextKey("native"), type: "native_event",
              label: ev.label || "", native: ev.native, nativeMeta: ev.nativeMeta
            }]);
          });
          return;
        }
        if (type === "plan") {
          var entries = Array.isArray(ev.entries) ? ev.entries : [];
          if (!entries.length && !ev.content) return;
          updateItems(function (prev) {
            var rest = prev.filter(function (item) { return item.type !== "plan"; });
            return rest.concat([{
              key: acpNextKey("plan"), type: "plan",
              entries: entries, content: ev.content || "", planId: ev.planId || "",
              native: ev.native, nativeMeta: ev.nativeMeta
            }]);
          });
          return;
        }
        if (type === "plan_removed") {
          updateItems(function (prev) {
            return prev.filter(function (item) { return !(item.type === "plan" && (!ev.planId || item.planId === ev.planId)); });
          });
          return;
        }
        if (type === "commands") {
          setCommands(Array.isArray(ev.commands) ? ev.commands : []);
          setCommandsMeta(ev.native !== undefined || ev.nativeMeta !== undefined
            ? { native: ev.native, nativeMeta: ev.nativeMeta } : null);
          return;
        }
        if (type === "usage") {
          setUsage(ev);
          return;
        }
        if (type === "notice") {
          var noticeText = [ev.title, ev.description].filter(Boolean).join(" · ") || t("acp.notice");
          updateItems(function (prev) {
            return prev.concat([{
              key: acpNextKey("notice"), type: "notice", text: noticeText,
              severity: ev.severity || "info", native: ev.native, nativeMeta: ev.nativeMeta
            }]);
          });
          return;
        }
        if (type === "error") {
          var message = String(ev.message || ev.code || t("acp.error"));
          if (!replayingRef.current) setError(message);
          updateItems(function (prev) {
            return prev.concat([{
              key: acpNextKey("err"), type: "error", text: message,
              native: ev.native || ev.sessionUpdate, nativeMeta: ev.nativeMeta || ev.details
            }]);
          });
          return;
        }
        if (type === "stop") {
          if (!(replayingRef.current && sessionLooksBusy())) {
            runningRef.current = false;
            setRunning(false);
          }
          var reason = String(ev.stopReason || "end_turn");
          setStoppedReason(reason === "end_turn" ? "" : reason);
          if (reason !== "end_turn") {
            updateItems(function (prev) {
              return prev.concat([{ key: acpNextKey("stop"), type: "system", text: t("acp.stopReason") + ": " + reason }]);
            });
          }
          return;
        }
        if (type === "session") {
          if (ev.session) {
            var merged = Object.assign({}, sessionRef.current || {}, ev.session);
            if (!merged.agentLabel) merged.agentLabel = merged.agent || agent;
            sessionRef.current = merged;
            setSession(merged);
          }
          if (ev.config) setConfig(ev.config);
          return;
        }
        if (type === "session_info") {
          if (ev.title != null) setSessionTitle(String(ev.title));
          return;
        }
        if (type === "config") {
          if (ev.config) setConfig(ev.config);
          return;
        }
        if (type === "mode") {
          if (ev.config) { setConfig(ev.config); return; }
          setConfig(function (prev) {
            if (!prev) return prev;
            var next = Object.assign({}, prev);
            next.modes = Object.assign({ currentModeId: String(ev.currentModeId || ""), availableModes: [] }, prev.modes || {});
            next.modes.currentModeId = String(ev.currentModeId || "");
            next.mode = String(ev.currentModeId || "");
            return next;
          });
          return;
        }
        if (type === "permission") {
          if (ev.autoResolved) {
            updateItems(function (prev) {
              return prev.concat([{
                key: acpNextKey("permauto"), type: "system",
                text: t("acp.autoApproved") + (ev.tool && (ev.tool.title || ev.tool.name) ? ": " + String(ev.tool.title || ev.tool.name) : "")
              }]);
            });
            return;
          }
          setPending(function (prev) {
            if (prev.some(function (p) { return p.requestId === ev.requestId; })) return prev;
            return prev.concat([ev]);
          });
          return;
        }
        if (type === "permission_resolved") {
          setPending(function (prev) {
            return prev.filter(function (p) { return p.requestId !== ev.requestId; });
          });
          return;
        }
        if (type === "permission_cancelled") {
          setPending([]);
          return;
        }
        if (type === "compaction" || type === "compaction_chunk") {
          if (type === "compaction") {
            updateItems(function (prev) {
              return prev.concat([{
                key: acpNextKey("compact"), type: "system",
                text: t("acp.compaction") + (ev.status ? ": " + String(ev.status) : "") + (ev.error ? " · " + String(ev.error) : "")
              }]);
            });
          }
          return;
        }
      }

      function detect(pid) {
        var target = String(pid || profileId || "");
        if (!target) { setError(t("acp.noProfile")); return; }
        setBusy("detect");
        setError("");
        setProbeMessage("");
        api("acpAgents", { profileId: target }).then(function (r) {
          if (!mountedRef.current) return;
          setBusy("");
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.detectFailed")));
            return;
          }
          var list = Array.isArray(r.agents) ? r.agents : [];
          setAgents(list);
          if (list.length) {
            setAgent(list[0].id);
            setProbeMessage(list.map(function (a) {
              return String(a.label || a.name || a.id) + (a.version ? " " + String(a.version) : "");
            }).join(" · "));
          } else {
            setProbeMessage(t("acp.noAgents"));
          }
        });
      }

      function chooseWorkspace(id) {
        setWsId(id);
        for (var i = 0; i < workspaces.length; i++) {
          if (workspaces[i].id !== id) continue;
          var ws = workspaces[i];
          if (ws.mirrorPath) setMirrorCwd(String(ws.mirrorPath));
          if (ws.remotePath) setRemotePath(String(ws.remotePath));
          if (ws.profileId && ws.profileId !== profileId) {
            var nextProfile = String(ws.profileId);
            setProfileId(nextProfile);
            setAgents([]);
            setProbeMessage("");
            setAgent("claude");
            detect(nextProfile);
          }
          return;
        }
      }

      function start() {
        if (!profileId) { setError(t("acp.noProfile")); return; }
        if (!String(mirrorCwd || "").trim()) { setError(t("acp.noMirror")); return; }
        setBusy("start");
        setError("");
        acpWriteAgentPref(profileId, remotePath, { agent: agent, permission: permission });
        try { localStorage.setItem("rssh.acp.lastAgent", agent); } catch (e) {}
        api("acpStart", {
          profileId: profileId,
          agent: agent,
          mirrorCwd: String(mirrorCwd).trim(),
          remotePath: String(remotePath || "").trim() || undefined,
          permission: permission,
          dshSessionId: dshSessionId
        }).then(function (r) {
          if (!mountedRef.current) return;
          setBusy("");
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.startFailed")));
            return;
          }
          enterSession(r, true, null, true);
        });
      }

      function resume(target, auto) {
        if (!target || !target.id) { setBooting(false); return; }
        setBusy("resume");
        setError("");
        api("acpResume", { id: target.id, dshSessionId: dshSessionId }).then(function (r) {
          if (!mountedRef.current) return;
          setBusy("");
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.resumeFailed")));
            setBooting(false);
            if (auto && dshSessionId) {
              delete acpViewCache[dshSessionId];
              sessionRef.current = null;
              setSession(null);
              setItems([]);
              setConfig(null);
            }
            return;
          }
          enterSession(r, false, target, true);
        });
      }

      function send() {
        if (!session) return;
        var text = String(draft || "").trim();
        if (!text) return;
        if (runningRef.current) { steer(text); return; }
        setDraft("");
        setError("");
        setStoppedReason("");
        setSuggestions([]);
        setSuggestionMeta(null);
        pushEcho(text, false);
        updateItems(function (prev) {
          return prev.concat([{ key: acpNextKey("user"), type: "user", text: text, steering: false }]);
        });
        runningRef.current = true;
        setRunning(true);
        var controller = new AbortController();
        abortRef.current = controller;
        var sid = session.id;
        fetch("/remote-ssh/api/acpPrompt", {
          method: "POST",
          headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
          body: JSON.stringify({ id: sid, text: text, sinceSeq: seqRef.current }),
          signal: controller.signal
        }).then(function (res) {
          var contentType = String(res.headers.get("content-type") || "");
          if (!res.ok || contentType.indexOf("ndjson") < 0) {
            return res.text().then(function (raw) {
              var message = raw;
              try {
                var parsed = JSON.parse(raw);
                if (parsed && parsed.error && parsed.error.message) message = parsed.error.message;
                else if (parsed && parsed.message) message = String(parsed.message);
              } catch (e) {}
              throw new Error(message || ("HTTP " + res.status));
            });
          }
          if (!res.body || typeof res.body.getReader !== "function") throw new Error(t("acp.noStream"));
          return acpReadNdjson(res.body, function (ev) {
            if (mountedRef.current && isCurrentSession(sid)) applyEvent(ev);
          });
        }).catch(function (e) {
          if (e && e.name === "AbortError") return;
          if (!mountedRef.current || !isCurrentSession(sid)) return;
          setError(String(e && e.message ? e.message : e));
          updateItems(function (prev) {
            return prev.concat([{ key: acpNextKey("err"), type: "error", text: t("acp.disconnected") }]);
          });
        }).then(function () {
          if (!isCurrentSession(sid)) return;
          runningRef.current = false;
          abortRef.current = null;
          if (mountedRef.current) {
            setRunning(false);
            refreshSessions();
          }
        });
      }

      function steer(text) {
        if (!session) return;
        setDraft("");
        setError("");
        setSuggestions([]);
        setSuggestionMeta(null);
        pushEcho(text, true);
        updateItems(function (prev) {
          return prev.concat([{ key: acpNextKey("user"), type: "user", text: text, steering: true }]);
        });
        api("acpSteer", { id: session.id, text: text }).then(function (r) {
          if (!mountedRef.current) return;
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.steerFailed")));
            return;
          }
          if (r.session) mergeSessionState(r.session);
          if (r.steering === false) {
            updateItems(function (prev) {
              return prev.concat([{ key: acpNextKey("steer"), type: "system", text: t("acp.steerQueued") }]);
            });
          }
        });
      }

      function stopTurn() {
        if (!session) return;
        setError("");
        api("acpCancel", { id: session.id }).then(function (r) {
          if (!mountedRef.current) return;
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.cancelFailed")));
            return;
          }
          if (r.session) mergeSessionState(r.session);
          if (r.cancelledPermissions) setPending([]);
          updateItems(function (prev) {
            return prev.concat([{ key: acpNextKey("cancel"), type: "system", text: t("acp.stopRequested") }]);
          });
        });
      }

      function setConfigValue(cfg, value) {
        if (!session || !cfg) return;
        var configId = String(cfg.configId || "");
        if (!configId) { setError(t("acp.configFailed")); return; }
        setError("");
        setBusy("config");
        api("acpSetConfig", { id: session.id, configId: configId, value: value }).then(function (r) {
          if (!mountedRef.current) return;
          setBusy("");
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.configFailed")));
            return;
          }
          if (r.config) setConfig(r.config);
          if (r.session) mergeSessionState(r.session);
        });
      }

      function setModeValue(modeId) {
        if (!session) return;
        setError("");
        setBusy("config");
        api("acpSetMode", { id: session.id, modeId: modeId }).then(function (r) {
          if (!mountedRef.current) return;
          setBusy("");
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.configFailed")));
            return;
          }
          if (r.config) setConfig(r.config);
          if (r.session) mergeSessionState(r.session);
        });
      }

      function setRawConfigValue(option, value) {
        if (!session || !option) return;
        setError("");
        setBusy("config");
        api("acpSetConfig", { id: session.id, configId: String(option.id || ""), value: value }).then(function (r) {
          if (!mountedRef.current) return;
          setBusy("");
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.configFailed")));
            return;
          }
          if (r.config) setConfig(r.config);
          if (r.session) mergeSessionState(r.session);
        });
      }

      function answerPermission(permissionEvent, optionId) {
        if (!session) return;
        setPending(function (prev) {
          return prev.filter(function (p) { return p.requestId !== permissionEvent.requestId; });
        });
        api("acpPermission", {
          id: session.id,
          requestId: permissionEvent.requestId,
          optionId: optionId
        }).then(function (r) {
          if (mountedRef.current && (!r || !r.ok)) {
            setError(acpErrorMessage(r, t("acp.permissionFailed")));
            setPending(function (prev) { return prev.concat([permissionEvent]); });
          }
        });
      }

      function dismissPermission(permissionEvent) {
        if (!session) return;
        setPending(function (prev) {
          return prev.filter(function (p) { return p.requestId !== permissionEvent.requestId; });
        });
        api("acpPermission", {
          id: session.id,
          requestId: permissionEvent.requestId,
          cancelled: true
        }).then(function (r) {
          if (mountedRef.current && (!r || !r.ok)) {
            setError(acpErrorMessage(r, t("acp.permissionFailed")));
            setPending(function (prev) { return prev.concat([permissionEvent]); });
          }
        });
      }

      function endSession() {
        if (!session) return;
        setBusy("close");
        setError("");
        api("acpClose", { id: session.id }).then(function (r) {
          if (!mountedRef.current) return;
          setBusy("");
          if (!r || !r.ok) {
            setError(acpErrorMessage(r, t("acp.closeFailed")));
            return;
          }
          stopAttach();
          if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} }
          abortRef.current = null;
          runningRef.current = false;
          setRunning(false);
          if (dshSessionId) delete acpViewCache[dshSessionId];
          sessionRef.current = null;
          setSession(null);
          setConfig(null);
          setItems([]);
          setPending([]);
          setCommands([]);
          setCommandsMeta(null);
          setUsage(null);
          setSessionTitle("");
          setDraft("");
          setStoppedReason("");
          setBooting(false);
          setEndConfirm(false);
          setCommandOpen(false);
          setCommandQuery("");
          refreshSessions();
        });
      }

      function resetToSetup() {
        if (runningRef.current) { setError(t("acp.stopFirst")); return; }
        stopAttach();
        if (dshSessionId) delete acpViewCache[dshSessionId];
        sessionRef.current = null;
        setSession(null);
        setConfig(null);
        setItems([]);
        setPending([]);
        setCommands([]);
        setUsage(null);
        setSessionTitle("");
        setDraft("");
        setStoppedReason("");
        setError("");
        setCommandOpen(false);
        setCommandQuery("");
        refreshSessions();
      }

      function insertText(text) {
        setDraft(function (prev) {
          var value = String(prev || "");
          var separator = value && !/\s$/.test(value) ? " " : "";
          return value + separator + String(text || "");
        });
      }

      function insertCommand(name) {
        insertText("/" + acpCommandName({ name: name }) + " ");
      }

      function chooseCommand(command) {
        insertCommand(acpCommandName(command));
        setCommandOpen(false);
        setCommandQuery("");
      }

      function profileOptions() {
        var out = [{ id: "", label: t("acp.chooseProfile") }];
        for (var i = 0; i < profiles.length; i++) {
          out.push({
            id: profiles[i].id,
            label: String(profiles[i].name || profiles[i].host || profiles[i].id) + " · " + String(profiles[i].user || "") + "@" + String(profiles[i].host || "") + ":" + String(profiles[i].port || 22)
          });
        }
        return out;
      }

      function agentOptions() {
        if (!agents.length) return [{ id: agent, label: agent }];
        return agents.map(function (a) {
          return {
            id: a.id,
            label: String(a.label || a.name || a.id) + (a.version ? " · " + String(a.version) : "")
          };
        });
      }

      function workspaceOptions() {
        var out = [{ id: "", label: t("acp.workspaceManual") }];
        for (var i = 0; i < workspaces.length; i++) {
          var ws = workspaces[i];
          out.push({
            id: ws.id,
            label: String(ws.name || ws.mirrorPath || ws.id) + (ws.remotePath ? " · " + String(ws.remotePath) : "")
          });
        }
        return out;
      }

      function renderSetup() {
        return h("div", { className: "ra-acp-setup" },
          h("p", { className: "rssh-ui-intro" }, t("acp.subtitle")),
          busy ? h("div", { className: "ra-acp-system", role: "status" },
            busy === "detect" ? t("acp.detecting")
              : busy === "start" ? t("acp.starting")
                : busy === "resume" ? t("acp.resuming") : "") : null,
          h(SettingsGroup, { title: t("acp.connection") },
            h(SelectField, {
              label: t("acp.profile"), value: profileId, options: profileOptions(),
              description: profiles.length ? undefined : t("acp.noProfiles"),
              onChange: function (value) {
                setProfileId(value);
                setAgents([]);
                setProbeMessage("");
                setAgent("claude");
              }
            }),
            h(SettingsRow, {
              title: t("acp.detected"),
              description: probeMessage || t("acp.detectHint"),
              control: h(UiButton, {
                variant: "outline", size: "sm",
                disabled: busy === "detect" || !profileId,
                onClick: function () { detect(profileId); }
              }, busy === "detect" ? t("acp.detecting") : t("acp.detect"))
            }),
            h(SelectField, {
              label: t("acp.agent"), value: agent, options: agentOptions(),
              description: agents.length ? undefined : t("acp.noAgents"),
              onChange: setAgent
            }),
            h(SelectField, {
              label: t("acp.permission"), value: permission,
              options: [
                { id: "acceptEdits", label: t("acp.permAccept") },
                { id: "plan", label: t("acp.permPlan") },
                { id: "bypass", label: t("acp.permBypass") }
              ],
              onChange: setPermission
            }),
          ),
          h(SettingsGroup, { title: t("acp.workspace") },
            h(SelectField, {
              label: t("acp.workspace"), value: wsId, options: workspaceOptions(),
              description: workspaces.length ? undefined : t("acp.noWorkspaces"),
              onChange: chooseWorkspace
            }),
            h(TextField, {
              label: t("acp.mirrorCwd"), value: mirrorCwd, onChange: setMirrorCwd,
              placeholder: "~/.dsh/remote-ssh/mirror/..."
            }),
            h(TextField, {
              label: t("acp.remotePath"), value: remotePath, onChange: setRemotePath,
              placeholder: "~/project"
            })
          ),
          h("div", { className: "rssh-ui-actions" },
            h(UiButton, {
              variant: "primary",
              disabled: busy === "start" || !profileId || !String(mirrorCwd || "").trim(),
              onClick: start
            }, busy === "start" ? t("acp.starting") : t("acp.start"))
          ),
          h(SettingsGroup, {
            title: t("acp.sessions"),
            description: sessions.length ? undefined : t("acp.noSessions")
          },
            h("div", { className: "ra-acp-sessions" },
              sessions.slice(0, 12).map(function (s) {
                return h("div", { key: String(s.id), className: "ra-acp-session" },
                  primitives.StateDot ? h(primitives.StateDot, { state: s.alive ? "ongoing" : "idle" }) : null,
                  h("div", { className: "ra-acp-session-main" },
                    h("div", { className: "ra-acp-session-title" },
                      profileName(s.profileId) + " · " + String(s.agentLabel || s.agent || "")),
                    h("div", { className: "ra-acp-session-sub" },
                      String(s.remotePath || s.cwd || "") + " · " + String(s.status || ""))
                  ),
                  h(UiButton, {
                    variant: "outline", size: "sm",
                    disabled: busy === "resume",
                    onClick: function () { resume(s); }
                  }, busy === "resume" ? t("acp.resuming") : t("acp.resume"))
                );
              })
            )
          )
        );
      }

      function usageLabel() {
        if (!usage) return "";
        var used = Number(usage.used || 0);
        var size = Number(usage.size || 0);
        var fmt = function (n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n); };
        var label = fmt(used) + " / " + fmt(size);
        if (usage.cost && usage.cost.amount) label += " · $" + Number(usage.cost.amount).toFixed(4);
        return label;
      }

      function renderConfigs() {
        if (!config) return null;
        var nodes = [];
        var models = config.models;
        if (models && Array.isArray(models.options) && models.options.length) {
          nodes.push(h("div", { key: "model", className: "ra-acp-config" },
            h("span", { className: "ra-acp-config-label" }, t("acp.model")),
            h(CompactMenuSelect, {
              label: t("acp.model"),
              value: models.currentValue == null ? "" : String(models.currentValue),
              options: models.options.map(function (o) {
                return { id: String(o.value), label: String(o.name || o.value), detail: String(o.description || "") };
              }),
              onChange: function (value) { setConfigValue(models, value); }
            })
          ));
        }
        var reasoning = config.reasoning;
        if (reasoning && Array.isArray(reasoning.options) && reasoning.options.length) {
          nodes.push(h("div", { key: "reasoning", className: "ra-acp-config" },
            h("span", { className: "ra-acp-config-label" }, t("acp.reasoning")),
            h(CompactMenuSelect, {
              label: t("acp.reasoning"),
              value: reasoning.currentValue == null ? "" : String(reasoning.currentValue),
              options: reasoning.options.map(function (o) {
                return { id: String(o.value), label: String(o.name || o.value), detail: String(o.description || "") };
              }),
              onChange: function (value) { setConfigValue(reasoning, value); }
            })
          ));
        }
        var modes = config.modes;
        if (modes && Array.isArray(modes.availableModes) && modes.availableModes.length) {
          nodes.push(h("div", { key: "mode", className: "ra-acp-config" },
            h("span", { className: "ra-acp-config-label" }, t("acp.mode")),
            h(CompactMenuSelect, {
              label: t("acp.mode"),
              value: String(modes.currentModeId || ""),
              options: modes.availableModes.map(function (m) {
                return { id: String(m.id), label: String(m.name || m.id), detail: String(m.description || "") };
              }),
              onChange: setModeValue
            })
          ));
        }
        var seen = {};
        if (models && models.configId) seen[String(models.configId)] = true;
        if (reasoning && reasoning.configId) seen[String(reasoning.configId)] = true;
        var advancedOptions = [];
        // modes 已单独渲染；Codex/Claude 的 configOptions 里常再带一个 mode/模式 选项，跳过避免重复。
        if (modes) { seen.mode = true; seen.modes = true; }
        var raw = Array.isArray(config.configOptions) ? config.configOptions : [];
        for (var i = 0; i < raw.length; i++) {
          var option = raw[i];
          if (!option || !option.id || seen[String(option.id)]) continue;
          if (modes && (/^mode$/i.test(String(option.id)) || /^mode$/i.test(String(option.name || "")) || String(option.category || "").toLowerCase() === "mode")) continue;
          if (String(option.type || "") !== "select") continue;
          var flattened = acpFlatSelectOptions(option.options);
          if (!flattened.length) continue;
          seen[String(option.id)] = true;
          advancedOptions.push(option);
          if (!advancedConfig) continue;
          nodes.push(h("div", { key: "opt:" + String(option.id), className: "ra-acp-config" },
            h("span", { className: "ra-acp-config-label" }, String(option.name || option.id)),
            h(CompactMenuSelect, {
              label: String(option.name || option.id),
              value: option.currentValue == null ? "" : String(option.currentValue),
              options: flattened,
              onChange: (function (opt) {
                return function (value) { setRawConfigValue(opt, value); };
              })(option)
            })
          ));
        }
        if (advancedOptions.length) {
          nodes.push(h("button", {
            key: "advanced",
            type: "button", className: "ra-acp-command-btn",
            onClick: function () { setAdvancedConfig(function (v) { return !v; }); }
          }, advancedConfig ? t("acp.less") : t("acp.more")));
        }
        return nodes.length ? h("div", { className: "ra-acp-configs" }, nodes) : null;
      }

      function renderCommandPanel() {
        var groups = acpCommandGroups(commands, commandQuery);
        var groupLabel = function (name) {
          if (name === "Skills") return t("acp.skillGroup");
          if (name === "Commands") return t("acp.commandGroup");
          return name;
        };
        return h("div", { className: "ra-acp-cmd-panel", role: "dialog", "aria-label": t("acp.commandsPanel") },
          h("div", { className: "ra-acp-cmd-panel-head" },
            h(UiInput, {
              className: "ra-acp-cmd-search",
              value: commandQuery,
              placeholder: t("acp.commandSearch"),
              "aria-label": t("acp.commandSearch"),
              onChange: function (e) { setCommandQuery(e.target.value); },
              onKeyDown: function (e) {
                if (e.key === "Escape") { e.preventDefault(); setCommandOpen(false); return; }
                if (e.key === "Enter" && groups.length && groups[0].items.length) {
                  e.preventDefault();
                  chooseCommand(groups[0].items[0]);
                }
              }
            }),
            h(UiButton, { variant: "outline", size: "sm", onClick: function () { setCommandOpen(false); } }, t("acp.close"))
          ),
          groups.length ? groups.map(function (group) {
            return h("div", { key: "cmdgroup:" + group.name, className: "ra-acp-cmd-group" },
              h("div", { className: "ra-acp-role" }, groupLabel(group.name) + " · " + group.items.length),
              group.items.map(function (command, i) {
                var name = acpCommandName(command);
                var hint = command.input && command.input.hint ? String(command.input.hint) : "";
                return h("button", {
                  key: "cmdrow:" + group.name + ":" + name + ":" + i,
                  type: "button", className: "ra-acp-cmd-row",
                  onClick: function () { chooseCommand(command); }
                },
                  h("span", { className: "ra-acp-cmd-row-name" }, "/" + name),
                  command.description ? h("span", { className: "ra-acp-cmd-row-desc" }, String(command.description)) : null,
                  hint ? h("span", { className: "ra-acp-cmd-hint" }, hint) : null
                );
              })
            );
          }) : h("div", { className: "ra-acp-system" }, t("acp.commandsEmpty"))
        );
      }

      function renderItem(item, childMap) {
        if (!item) return null;
        if (item.type === "user") {
          return h("div", { key: item.key, className: "ra-acp-msg" },
            h("div", { className: "ra-acp-role" }, item.steering ? t("acp.steering") : t("acp.you")),
            h("div", { className: "ra-acp-user-text" }, item.text)
          );
        }
        if (item.type === "assistant") {
          return h("div", { key: item.key, className: "ra-acp-msg" },
            h("div", { className: "ra-acp-role" }, t("acp.agentRole")),
            h("div", { className: "ra-acp-md" }, h(AcpMarkdown, { text: item.text, labels: labels.markdown }))
          );
        }
        if (item.type === "thought") {
          return h(AcpThought, { key: item.key, item: item, labels: labels, t: t });
        }
        if (item.type === "tool") {
          return h(AcpToolCard, {
            key: item.key, tool: item.tool, labels: labels, t: t,
            childMap: childMap, onOpenOutput: openOutput, ancestors: []
          });
        }
        if (item.type === "subagent") {
          return h(AcpSubagentCard, {
            key: item.key, _key: item._key || acpItemId(item), subagent: item.subagent,
            labels: labels, t: t, childMap: childMap, onOpenOutput: openOutput, ancestors: []
          });
        }
        if (item.type === "plan") {
          return h(AcpPlanCard, {
            key: item.key, entries: item.entries, content: item.content, t: t,
            native: item.native, nativeMeta: item.nativeMeta
          });
        }
        if (item.type === "state") {
          return h(AcpStateCard, { key: item.key, item: item, t: t });
        }
        if (item.type === "session_message") {
          return h(AcpSessionMessageCard, { key: item.key, item: item, labels: labels, t: t });
        }
        if (item.type === "terminal_event") {
          return h(AcpTerminalEventCard, { key: item.key, item: item, labels: labels, t: t });
        }
        if (item.type === "native_event") {
          return h(AcpNativeEventCard, { key: item.key, item: item, t: t });
        }
        if (item.type === "notice") {
          var notice = h("div", { key: item.key, className: "ra-acp-notice", role: item.severity === "error" ? "alert" : "status" }, item.text);
          if (item.native === undefined && item.nativeMeta === undefined) return notice;
          return h("div", { key: item.key, className: "ra-acp-card" }, notice,
            h(AcpNativeDetails, { t: t, native: item.native, nativeMeta: item.nativeMeta }));
        }
        if (item.type === "error") {
          var errorNode = h("p", { key: item.key, className: "ra-acp-error", role: "alert" }, item.text);
          if (item.native === undefined && item.nativeMeta === undefined) return errorNode;
          return h("div", { key: item.key, className: "ra-acp-card" }, errorNode,
            h(AcpNativeDetails, { t: t, native: item.native, nativeMeta: item.nativeMeta }));
        }
        return h("div", { key: item.key, className: "ra-acp-system" }, item.text);
      }

      function renderConversation(list) {
        var built = acpBuildChildMap(list);
        var top = list.filter(function (item) {
          var id = acpItemId(item);
          var parent = acpItemParent(item);
          return !(parent && parent !== id && built.known[parent]);
        });
        // 极端情况下（父调用环）回退到平铺，避免整段会话消失。
        if (!top.length && list.length) top = list;
        return top.map(function (item) { return renderItem(item, built.map); });
      }

      var statusKey = pending.length ? "acp.waiting"
        : running ? "acp.running"
          : session && session.status === "error" ? "acp.error"
            : stoppedReason ? "acp.stopped"
              : session && session.status === "closed" ? "acp.closed" : "acp.ready";
      var statusDot = pending.length || (session && session.status === "error") ? "warning"
        : running ? "ongoing" : "idle";
      var placeholder = pending.length ? t("acp.permissionWaitingHint")
        : running ? t("acp.composerSteerPlaceholder") : t("acp.composerPlaceholder");
      var hint = pending.length ? t("acp.permissionWaitingHint")
        : running ? t("acp.steerHint") : t("acp.sendHint");
      var canSend = !!String(draft || "").trim() && !!session && busy !== "config";

      var hasChatItems = items.some(function (it) {
        if (!it) return false;
        return it.type === "user" || it.type === "text" || it.type === "thought" ||
          it.type === "tool_call" || it.type === "tool_call_update" || it.type === "subagent" ||
          it.type === "subagent_update" || it.type === "plan" || it.type === "error" ||
          it.type === "notice" || it.type === "state" || it.type === "terminal" ||
          it.type === "session_message" || it.type === "message";
      });
      var chat = session ? h("div", { className: "ra-acp" },
        endConfirm ? h("div", { className: "ra-acp-confirm", role: "alertdialog" },
          h("span", null, t("acp.endSessionDesc")),
          h(UiButton, { variant: "outline", size: "sm", className: "rssh-ui-danger", onClick: endSession }, t("acp.endSession")),
          h(UiButton, { variant: "outline", size: "sm", onClick: function () { setEndConfirm(false); } }, t("acp.cancel"))
        ) : null,
        error ? h("p", { className: "ra-acp-error ra-acp-errorbar", role: "alert" }, error) : null,
        h("div", { className: "ra-acp-head" },
          h("div", { className: "ra-acp-head-main" },
            primitives.StateDot ? h(primitives.StateDot, { state: statusDot }) : null,
            h("span", { className: "ra-acp-agent" }, String(session.agentLabel || session.agent || "")),
            primitives.Tag ? h(primitives.Tag, { tone: pending.length || (session.status === "error") ? "warning" : "neutral" }, t(statusKey)) : h("span", null, t(statusKey)),
            pending.length ? h(primitives.Tag, { tone: "warning" }, t("acp.permissionCount", { count: pending.length })) : null,
            h("span", { className: "ra-acp-sub" },
              profileName(session.profileId) + " · " + String(session.remotePath || "") + (sessionTitle ? " · " + sessionTitle : ""))
          ),
          h("div", { className: "ra-acp-head-actions" },
            h(UiButton, { variant: "outline", size: "sm", onClick: function () { setFilesOpen(true); } }, t("acp.files")),
            h(UiButton, { variant: "outline", size: "sm", onClick: resetToSetup }, t("acp.newSession")),
            h(UiButton, { variant: "outline", size: "sm", className: "rssh-ui-danger", onClick: function () { setEndConfirm(true); } }, t("acp.endSession"))
          )
        ),
        h("div", { className: "ra-acp-messages", ref: listRef },
          !hasChatItems
            ? h("div", { className: "ra-acp-empty-state" },
              h("div", { className: "ra-acp-empty-title" }, t("acp.empty")),
              h("div", { className: "ra-acp-view-hint" }, t("acp.emptyHint")),
              h("div", { className: "ra-acp-quick" },
                h(UiButton, { variant: "outline", size: "sm", onClick: function () { insertText(t("acp.quickExplain")); } }, t("acp.quickExplain")),
                h(UiButton, { variant: "outline", size: "sm", onClick: function () { insertText(t("acp.quickTest")); } }, t("acp.quickTest")),
                h(UiButton, { variant: "outline", size: "sm", onClick: function () { insertText(t("acp.quickChanges")); } }, t("acp.quickChanges"))
              ))
            : renderConversation(items)
        ),
        pending.length ? h("div", { className: "ra-acp-perms" },
          pending.map(function (p) {
            return h(AcpPermissionCard, {
              key: "perm:" + String(p.requestId), permission: p, t: t,
              onAnswer: answerPermission, onDismiss: dismissPermission
            });
          })
        ) : null,
        suggestions.length ? h("div", { className: "ra-acp-suggestions" },
          h("span", { className: "ra-acp-config-label" }, t("acp.suggestions")),
          suggestions.map(function (suggestion, i) {
            return h(UiButton, {
              key: "suggestion:" + i,
              variant: "outline", size: "sm",
              title: suggestion,
              onClick: function () { insertText(String(suggestion) + " "); }
            }, String(suggestion));
          }),
          suggestionMeta ? h(AcpNativeDetails, {
            t: t, native: suggestionMeta.native, nativeMeta: suggestionMeta.nativeMeta
          }) : null
        ) : null,
        commandOpen ? renderCommandPanel() : null,
        h("div", { className: "ra-acp-composer" },
          h(AcpTextarea, {
            className: "ra-acp-textarea",
            value: draft,
            rows: 2,
            placeholder: placeholder,
            "aria-label": placeholder,
            onChange: function (e) { setDraft(e.target.value); },
            onKeyDown: function (e) {
              if (e.key !== "Enter" || e.shiftKey) return;
              if (e.nativeEvent && (e.nativeEvent.isComposing || e.isComposing)) return;
              e.preventDefault();
              if (canSend) send();
            }
          }),
          h("div", { className: "ra-acp-compose-bar" },
            h("div", { className: "ra-acp-compose-left" },
              h(UiButton, {
                variant: "outline", size: "sm", className: "ra-acp-plus",
                "aria-label": t("acp.files"), title: t("acp.files"),
                onClick: function () { setFilesOpen(true); }
              }, primitives.IconPlusOutlineRegular ? h(primitives.IconPlusOutlineRegular, { size: 16 }) : "+"),
              h("button", {
                type: "button", className: "ra-acp-command-btn",
                "aria-haspopup": "dialog",
                "aria-expanded": commandOpen ? "true" : "false",
                onClick: function () {
                  setCommandOpen(function (v) { return !v; });
                  setCommandQuery("");
                }
              }, t("acp.commandOpen") + (commands.length ? " " + commands.length : "")),
              renderConfigs()
            ),
            h("div", { className: "ra-acp-compose-right" },
              usageLabel() ? h("span", { className: "ra-acp-usage", title: usageLabel() }, usageLabel()) : null,
              running ? h(UiButton, { variant: "outline", size: "sm", onClick: stopTurn }, t("acp.stop")) : null,
              h(UiButton, {
                variant: "primary", className: "ra-acp-send",
                disabled: !canSend,
                "aria-label": running ? t("acp.steer") : t("acp.send"),
                title: running ? t("acp.steer") : t("acp.send"),
                onClick: send
              }, primitives.IconSendOutlineRegular ? h(primitives.IconSendOutlineRegular, { size: 16 }) : (running ? t("acp.steer") : t("acp.send")))
            )
          ),
          h("div", { className: "ra-acp-compose-hint" }, hint)
        )
      ) : null;

      var setupHead = h("div", { className: "ra-acp-head" },
        h("div", { className: "ra-acp-head-main" },
          primitives.StateDot ? h(primitives.StateDot, { state: "idle" }) : null,
          h("span", { className: "ra-acp-agent" }, t("acp.hero")),
          primitives.Tag ? h(primitives.Tag, { tone: "neutral" }, t("acp.dshSession") + " " + acpShortId(dshSessionId)) : null,
          h("span", { className: "ra-acp-sub" }, t("acp.viewHint")),
          currentWorkspacePath ? h("span", { className: "ra-acp-loc" }, t("acp.currentWorkspace") + ": " + currentWorkspacePath) : null
        )
      );

      return h("section", { className: "ra-acp-view", "aria-label": t("acp.hero") },
        error && !session ? h("p", { className: "ra-acp-error ra-acp-errorbar", role: "alert" }, error) : null,
        booting && !session
          ? h("div", { className: "ra-acp-boot" },
            primitives.StateDot ? h(primitives.StateDot, { state: "ongoing" }) : null,
            h("span", null, t("acp.resumingSession")))
          : h("div", { className: "ra-acp-view-body" },
            session ? null : setupHead,
            session ? chat : renderSetup()
          ),
        filesOpen && session ? h(AgentFilesModal, {
          profileId: session.profileId,
          initialDir: session.remotePath || "~",
          onClose: function () { setFilesOpen(false); }
        }) : null,
        outputPreview ? h(Modal, {
          open: true,
          onClose: function () { setOutputPreview(null); },
          title: t("acp.outputPreview"),
          closeLabel: t("acp.close"),
          className: "ra-file-dialog",
          footer: h(UiButton, { variant: "outline", onClick: function () { setOutputPreview(null); } }, t("acp.close"))
        },
          h("div", { className: "ra-acp-subagent-file" },
            h("code", { className: "ra-acp-loc" }, String(outputPreview.path || ""))),
          outputPreview.loading ? h("div", { className: "ra-acp-system" }, t("acp.loadingOutput")) : null,
          outputPreview.error ? h("p", { className: "ra-acp-error", role: "alert" }, outputPreview.error) : null,
          outputPreview.binary && !outputPreview.error
            ? h("div", { className: "ra-acp-system" }, t("acp.binaryOutput"))
            : outputPreview.content
              ? h("pre", { className: "ra-acp-json" }, outputPreview.content)
              : null
        ) : null
      );
    }

    /** 思考过程默认折叠，展开后仍用 MarkdownText（与正文同一套渲染）。 */
    function AcpThought(props) {
      var t = props.t;
      var pair = React.useState(false);
      var open = pair[0], setOpen = pair[1];
      return h("div", { className: "ra-acp-msg" },
        h("div", { className: "ra-acp-role" },
          h(UiButton, {
            variant: "outline", size: "sm",
            "aria-expanded": open ? "true" : "false",
            onClick: function () { setOpen(function (v) { return !v; }); }
          }, t("acp.thought") + (open ? " " + t("acp.hide") : " " + t("acp.show")))
        ),
        open ? h("div", { className: "ra-acp-md" },
          h(AcpMarkdown, { text: props.item.text, labels: props.labels.markdown })
        ) : null
      );
    }

    // ==== ACP Chat UI (end) ====


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
        // 新版 DSH 的「新会话 / ⌘N」工作区选择器：同一套本地目录/SSH 远端目录选择流程。
        ctx.effect(function () {
          return slots.inject("workspace.picker.directoryFlow", function () {
            return slots.register({ name: "workspace.picker.directoryFlow", priority: -100, inject: flowInject }, RemoteWorkspaceFlow);
          });
        });
        // 会话级隐藏标记：ACP 会话存在时不再显示原生「对话」Tab。
        ctx.effect(function () {
          return slots.inject("conversation.input.dock", function () {
            return slots.register({
              name: "conversation.input.dock",
              id: "remote-acp-marker",
              order: 0,
              locale: NS
            }, AcpSessionMarker);
          });
        }, "dsh-remote-ssh: ACP session marker");
        // ACP Chat 作为会话内常驻 View（与 Chat/Trajectory 并列）。入口走工作区原生的
        // 「新会话 / ⌘N」流程（本地/SSH 选择器由 RemoteWorkspaceFlow 提供）；不再注册
        // hero/header 的独立按钮或 Modal，避免两套 UI。
        ctx.effect(function () {
          return slots.inject("conversation.view", function () {
            return slots.register({
              name: "conversation.view",
              id: "remote-acp",
              order: 15,
              label: function () { return i18n.t("acp.hero"); },
              locale: NS
            }, AcpChatView);
          });
        }, "dsh-remote-ssh: ACP agent view");
      }
    }

    exports.apply = apply;
    // 只声明内核一定提供的服务；betterSidebar（第三方 bundle dsh-better-sidebar）
    // 走 apply 内的 ctx.inject 软注入 —— 放进这里会让未安装它的用户 web boot 直接失败（issue #18）。
    exports.inject = ["slots", "locale"];
    return module.exports;
  }
});
