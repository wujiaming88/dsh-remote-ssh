import React from 'react';
import {h,ui,useT} from './shared.js';

export const messages = {
  zh: {
    'status.starting':'正在启动远端 Agent','status.startingHint':'正在建立 SSH 连接并启动会话，请稍候。',
    'status.failed':'无法启动远端会话','status.prepareRequired':'远端运行环境尚未就绪',
    'status.nodeMissing':'远端缺少 Node.js','status.connectionFailed':'连接或认证失败',
    'status.sessionMissing':'未找到对应的远端会话',
    'status.prepareHint':'需要安装固定版本依赖后才能启动。','status.nodeHint':'请在远端登录 shell 中启用 Node.js 22+，或准备运行环境。',
    'status.retry':'重试','status.retrying':'正在重试…','status.prepare':'准备运行环境',
    'status.close':'取消','status.confirm':'确认安装依赖',
    'status.packages':'将安装的依赖','status.runtimeDir':'安装目录','status.nodeRequirement':'Node.js 要求',
    'status.safety':'不使用 sudo、不修改 shell 配置，Agent 凭据保留在远端。',
  },
  en: {
    'status.starting':'Starting remote agent','status.startingHint':'Opening the SSH connection and starting the session…',
    'status.failed':'Could not start the remote session','status.prepareRequired':'Remote runtime is not ready',
    'status.nodeMissing':'Remote Node.js is missing','status.connectionFailed':'Connection or authentication failed',
    'status.sessionMissing':'The remote session was not found',
    'status.prepareHint':'Fixed-version dependencies must be installed first.','status.nodeHint':'Enable Node.js 22+ in the remote login shell, or prepare the runtime.',
    'status.retry':'Retry','status.retrying':'Retrying…','status.prepare':'Prepare runtime',
    'status.close':'Cancel','status.confirm':'Install dependencies',
    'status.packages':'Packages to install','status.runtimeDir':'Install directory','status.nodeRequirement':'Node.js requirement',
    'status.safety':'No sudo, no shell changes; agent credentials stay on the remote host.',
  },
};

function WarningIcon() {
  return h('svg',{className:'rssh-status-icon',width:32,height:32,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},
    h('path',{d:'M12 3 2.6 20h18.8L12 3Z'}),h('path',{d:'M12 9.5v4.5'}),h('circle',{cx:12,cy:16.8,r:.5,fill:'currentColor',stroke:'none'}));
}
function statusTitle(code,t) {
  switch (code) {
    case 'remote_prepare_required': return t('status.prepareRequired');
    case 'remote_node_missing': case 'remote_runtime_missing': return t('status.nodeMissing');
    case 'ssh_authentication_failed': case 'ssh_connection_failed': case 'ssh_timeout': return t('status.connectionFailed');
    case 'session_not_found': case 'backend_binding_missing': case 'acp_not_found': return t('status.sessionMissing');
    default: return t('status.failed');
  }
}

export function ConversationStatus({kind,title,description,code,nodeMissing,needsPrepare,meta,onRetry,onPrepare,busy}) {
  const t=useT();
  const error=kind==='error';
  return h('section',{className:'rssh-status','data-kind':kind,role:error?'alert':'status'},
    error?h(WarningIcon):h('span',{className:'rssh-status-spinner',role:'img','aria-label':t('status.starting')},
      h('svg',{width:28,height:28,viewBox:'0 0 16 16','aria-hidden':true},h('circle',{cx:8,cy:8,r:6,fill:'none',stroke:'currentColor',strokeOpacity:0.3,strokeWidth:1.6}),
        h('path',{d:'M8 2a6 6 0 0 1 6 6',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round'}))),
    h('h2',{className:'rssh-status-title'},title||t(error?'status.failed':'status.starting')),
    error&&code?h('code',{className:'rssh-status-code'},code):null,
    error?h('p',{className:'rssh-status-description'},description||t('status.failed')):null,
    error&&needsPrepare?h('p',{className:'rssh-status-note'},t(nodeMissing?'status.nodeHint':'status.prepareHint')):null,
    !error?h('p',{className:'rssh-status-description'},meta||t('status.startingHint')):null,
    error?h('div',{className:'rssh-status-actions'},
      needsPrepare&&onPrepare?h(ui.Button,{variant:'primary',disabled:!!busy,onClick:onPrepare},t('status.prepare')):null,
      onRetry?h(ui.Button,{variant:needsPrepare?'ghost':'primary',disabled:!!busy,onClick:onRetry},busy?t('status.retrying'):t('status.retry')):null):null);
}

export function PrepareRuntimeDialog({plan,onConfirm,onClose,busy}) {
  const t=useT();
  const packages=Array.isArray(plan&&plan.packages)?plan.packages:[];
  return h(ui.Modal,{open:true,className:'rssh-prepare-dialog',title:t('status.prepare'),closeLabel:t('status.close'),
    onClose:()=>{if(!busy)onClose();},footer:h(React.Fragment,null,
      h(ui.Button,{variant:'ghost',disabled:!!busy,onClick:onClose},t('status.close')),
      h(ui.Button,{variant:'primary',disabled:!!busy,onClick:onConfirm},busy?t('status.retrying'):t('status.confirm')))},
    h('div',{className:'rssh-prepare-body'},
      h('p',{className:'rssh-status-description'},String(plan&&plan.description||'')),
      plan&&plan.runtimeDir?h('div',{className:'rssh-prepare-row'},h('span',{className:'rssh-prepare-label'},t('status.runtimeDir')),
        h('code',{className:'rssh-status-code'},String(plan.runtimeDir))):null,
      plan&&plan.nodeRequirement?h('div',{className:'rssh-prepare-row'},h('span',{className:'rssh-prepare-label'},t('status.nodeRequirement')),
        h('code',{className:'rssh-status-code'},String(plan.nodeRequirement))):null,
      packages.length?h('div',{className:'rssh-prepare-packages'},
        h('span',{className:'rssh-prepare-label'},t('status.packages')),
        h('ul',{className:'rssh-prepare-list'},packages.map(pkg=>{const at=String(pkg).lastIndexOf('@');
          return h('li',{key:String(pkg)},h('span',{className:'rssh-prepare-name'},String(pkg).slice(0,at)),h('span',{className:'rssh-prepare-version'},String(pkg).slice(at+1)));}))):null,
      h('p',{className:'rssh-status-note'},t('status.safety'))));
}
