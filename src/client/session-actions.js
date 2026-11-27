import React from 'react';
import {api,stream,h,ui,useT,formatError,NAMESPACE} from './shared.js';
import {REMOTE_SESSION_PROJECTION_KEY} from '../../lib/protocol.js';

export const messages={
  zh:{
    'session.viewSync':'查看同步状态','session.renameUnsynced':'重命名（远端未同步）','session.more':'会话操作','session.rename':'重命名','session.pin':'置顶','session.unpin':'取消置顶',
    'session.fork':'分叉','session.remoteFork':'分叉远端会话','session.forkUnavailable':'远端分叉暂不可用',
    'session.renameTitle':'重命名远端会话','session.title':'会话名称','session.save':'保存','session.close':'关闭',
    'session.renameUnknown':'DSH 名称已保存，远端结果尚未确认；可稍后重试同步：','session.renamePartial':'DSH 名称已保存，但远端标题尚未同步：','session.renameFailed':'重命名失败',
    'session.pinFailed':'置顶操作失败','session.forkFailed':'远端分叉失败','session.forkTitle':'分叉远端会话',
    'session.forkDescription':'复制当前最新、已完成的 Agent 上下文，创建独立会话。两个会话仍使用同一工作目录；这不会复制文件或创建 worktree。',
    'session.forkBusy':'源会话尚未就绪。请先打开会话，等待当前回合和审批结束；已归档会话请先取消归档。',
    'session.renaming':'正在同步会话名称…','session.incompleteFork':'前次分叉未完成，请保留恢复信息。再次创建需明确确认。',
    'session.forking':'正在分叉远端会话…','session.recoverFork':'恢复未完成的分叉',
    'session.unknownFork':'前次远端分叉结果未知。不会自动重复请求，请保留下面的恢复信息。',
    'session.newAfterUnknown':'我已了解前次恢复信息，明确发起一个新的分叉操作。',
    'session.forked':'远端会话已分叉','session.openFork':'打开分叉会话','session.openFailed':'无法打开分叉会话',
    'session.syncFailed':'读取会话操作状态失败','session.nameRequired':'请输入非空名称',
    'session.terminate':'结束远端会话','session.terminateTitle':'确认结束远端会话','session.terminateDescription':'这会终止当前任务、取消待处理审批，并永久关闭此远端会话。历史记录、SSH 配置和工作区文件会保留。此操作不可撤销；仅关闭窗口或归档不会结束远端任务。',
    'session.terminating':'正在确认远端会话结束…','session.terminated':'远端会话已结束，历史记录仍可查看','session.terminateFailed':'未能确认远端会话已结束。恢复信息已保留，请重连后核实。',
  },
  en:{
    'session.viewSync':'View synchronization','session.renameUnsynced':'Rename (remote unsynced)','session.more':'Session actions','session.rename':'Rename','session.pin':'Pin','session.unpin':'Unpin',
    'session.fork':'Fork','session.remoteFork':'Fork remote conversation','session.forkUnavailable':'Remote fork unavailable',
    'session.renameTitle':'Rename remote conversation','session.title':'Session name','session.save':'Save','session.close':'Close',
    'session.renameUnknown':'The DSH name was saved; the remote outcome is unconfirmed. Retry synchronization later: ','session.renamePartial':'The DSH name was saved, but the remote title is not synchronized: ','session.renameFailed':'Rename failed',
    'session.pinFailed':'Pin operation failed','session.forkFailed':'Remote fork failed','session.forkTitle':'Fork remote conversation',
    'session.forkDescription':'Copy the latest completed Agent context into an independent conversation. Both conversations still use the same working directory; files and worktrees are not copied.',
    'session.forkBusy':'Open the source conversation and wait for its turn and pending approvals to finish. Unarchive it first if necessary.',
    'session.renaming':'Synchronizing session name…','session.incompleteFork':'The previous fork did not complete. Keep its recovery information and explicitly confirm any new attempt.',
    'session.forking':'Forking remote conversation…','session.recoverFork':'Recover unfinished fork',
    'session.unknownFork':'The previous remote fork outcome is unknown. It will not be retried automatically. Keep the recovery information below.',
    'session.newAfterUnknown':'I have reviewed the previous recovery information and explicitly want a new fork operation.',
    'session.forked':'Remote conversation forked','session.openFork':'Open fork','session.openFailed':'Could not open fork',
    'session.syncFailed':'Could not read session actions','session.nameRequired':'Enter a nonempty name',
    'session.terminate':'End remote session','session.terminateTitle':'Confirm ending the remote session','session.terminateDescription':'This terminates the current task, cancels pending approvals, and permanently closes this remote session. History, SSH configuration, and workspace files are retained. This cannot be undone; closing a window or archiving does not end the remote task.',
    'session.terminating':'Confirming remote termination…','session.terminated':'Remote session ended; its history remains readable','session.terminateFailed':'Remote termination could not be confirmed. Recovery information is retained; reconnect and check again.',
  },
};

function ActionsDialog(props) {
  const t=useT();const dialog=props.useActionDialog(value=>value);
  const [title,setTitle]=React.useState('');
  React.useEffect(()=>{setTitle(dialog?.title||'');},[dialog?.key]);
  if(!dialog)return null;
  const fork=dialog.kind==='fork',terminate=dialog.kind==='terminate';
  const unknown=fork&&!!dialog.operation && dialog.operation.phase!=='completed' && !dialog.operation.recoverable;
  const canSubmit=terminate ? !dialog.busy&&dialog.metadata.canClose===true : fork
    ? !dialog.busy && !dialog.metadata.archived && (!unknown||dialog.allowNew) && (dialog.metadata.canFork||dialog.operation?.recoverable)
    : !dialog.busy && title.trim().length>0;
  return h(ui.Modal,{open:true,title:t(terminate?'session.terminateTitle':fork?'session.forkTitle':'session.renameTitle'),closeLabel:t('session.close'),
    onClose:()=>props.dismissAction(),
    footer:h(React.Fragment,null,
      h(ui.Button,{variant:'outline',onClick:props.dismissAction},t('session.close')),
      h(ui.Button,{variant:'primary',disabled:!canSubmit,onClick:()=>props.submitAction(title)},
        t(terminate?(dialog.busy?'session.terminating':'session.terminate'):dialog.busy?(fork?'session.forking':'session.renaming'):fork?(dialog.operation?.recoverable?'session.recoverFork':'session.fork'):'session.save')))},
    h('div',{className:'rssh-session-action-dialog'},
      h('strong',null,dialog.title),
      terminate?h('p',{role:'alert'},t('session.terminateDescription')):fork?h('p',null,t('session.forkDescription')):h('label',null,t('session.title'),h(ui.Input,{value:title,disabled:dialog.busy,'data-modal-autofocus':'true',onChange:event=>setTitle(event.target.value),onKeyDown:event=>{
        if(event.key==='Enter'&&!event.isComposing&&!event.nativeEvent?.isComposing&&canSubmit){event.preventDefault();props.submitAction(title);}
      }})),
      fork&&(dialog.metadata.archived||!dialog.metadata.canFork&&!dialog.operation?.recoverable)?h('p',{role:'status'},t('session.forkBusy')):null,
      dialog.kind==='rename'&&dialog.syncStatus==='pending'&&!dialog.busy?h('p',{role:'status'},t('session.renaming')):null,
      dialog.error?h('p',{className:'ra-acp-error',role:'alert'},dialog.error):null,
      unknown?h(React.Fragment,null,h('p',{role:'alert'},t(dialog.operation?.outcome==='unknown'?'session.unknownFork':'session.incompleteFork')),
        h(ui.Checkbox,{checked:dialog.allowNew,disabled:dialog.busy,label:t('session.newAfterUnknown'),onChange:props.allowNewFork})):null,
      dialog.operation?h('details',null,h('summary',null,dialog.operation.operationId),h('pre',{className:'ra-acp-json'},JSON.stringify(dialog.operation,null,2))):null));
}

export function installSessionActions(ctx, {watch=stream,onClosed=()=>{}} = {}) {
  let current=null,disposed=false,eventController,retryTimer,retries=0;
  const titleSeen=new Map();
  const listeners=new Set();
  const source={getSnapshot:()=>current,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}};
  const publish=value=>{if(disposed)return;current=value;for(const listener of listeners)listener();};
  const t=key=>ctx.locale.bind(NAMESPACE)(key);
  const openSession=id=>ctx.uiWorkspace.openSession(id);
  const syncMessage=record=>record&&['failed','unknown'].includes(record.status)?t(record.status==='unknown'?'session.renameUnknown':'session.renamePartial')+formatError(record.error,String(record.status)):'';
  function openDialog(kind,metadata) {
    const previous=kind==='fork'&&metadata.forkOperation?.phase!=='completed'?metadata.forkOperation:null;
    publish({key:crypto.randomUUID(),kind,sessionId:metadata.sessionId,title:metadata.title||'',metadata,
      operation:previous,operationId:previous?.operationId||crypto.randomUUID(),allowNew:false,busy:false,syncStatus:metadata.titleSync?.status,error:kind==='rename'?syncMessage(metadata.titleSync):''});
  }
  async function submit(title) {
    const dialog=current;if(!dialog||dialog.busy)return;
    if(dialog.kind==='fork' && (dialog.metadata.archived || (!dialog.metadata.canFork&&!dialog.operation?.recoverable) || (dialog.operation&&dialog.operation.phase!=='completed'&&!dialog.operation.recoverable&&!dialog.allowNew)))return;
    if(dialog.kind==='terminate'&&dialog.metadata.canClose!==true)return;
    if(dialog.kind==='rename'&&!title.trim()){publish({...dialog,error:t('session.nameRequired')});return;}
    const operationId=dialog.allowNew?crypto.randomUUID():dialog.operationId;
    publish({...dialog,operationId,busy:true,error:''});
    const result=dialog.kind==='terminate'
      ?await api('acpClose',{id:dialog.metadata.acpId,dshSessionId:dialog.sessionId,confirm:true})
      :dialog.kind==='rename'
      ?await api('sessionRename',{sessionId:dialog.sessionId,title})
      :await api('sessionFork',{sessionId:dialog.sessionId,operationId});
    if(disposed||current?.key!==dialog.key)return;
    if(!result.ok){publish({...current,busy:false,allowNew:false,error:(dialog.kind==='terminate'?t('session.terminateFailed')+' ':'')+formatError(result),operation:result.operation||current.operation});return;}
    if(dialog.kind==='rename'&&result.titleSync?.status!=='synced'){
      publish({...current,busy:false,title:result.title,error:t(result.titleSync?.status==='unknown'?'session.renameUnknown':'session.renamePartial')+formatError(result.titleSync?.error,String(result.titleSync?.status||''))});return;
    }
    publish(null);
    if(dialog.kind==='terminate'){onClosed(dialog.sessionId,result.session);ctx.contextMenus.notify(t('session.terminated'),true);}
    if(dialog.kind==='fork'){
      if(ctx.uiSession.adapter.current.getSnapshot().key===dialog.sessionId)openSession(result.sessionId);
      else ctx.contextMenus.notify(t('session.forked'),true,{label:t('session.openFork'),run:()=>openSession(result.sessionId),failureLabel:t('session.openFailed')});
    }
  }
  const getMetadata=async(target,signal)=>{
    const result=await api('sessionActions',{sessionId:target.sessionId},signal);
    if(!result.ok)throw new Error(formatError(result));return result;
  };
  ctx.effect(()=>ctx.contextMenus.register({id:'remote-session.actions',target:'remote-agent-session',order:100,
    observe:()=>[ctx.sessions.list,ctx.workspaces.list,ctx.locale],
    resolve:async(target,signal)=>{
      const metadata=await getMetadata(target,signal);if(!metadata.remote)return[];
      return[
        {id:'rename',label:t(metadata.titleSync&&['failed','unknown'].includes(metadata.titleSync.status)?'session.renameUnsynced':'session.rename'),icon:{key:'workspace.rename'},commandId:'session.rename',disabled:metadata.closed===true,run:()=>openDialog('rename',metadata),failureLabel:t('session.renameFailed')},
        {id:'pin',label:t(metadata.pinned?'session.unpin':'session.pin'),icon:{key:metadata.pinned?'workspace.unpin':'workspace.pin'},disabled:metadata.archived===true,run:async()=>{
          const result=await api('sessionPin',{sessionId:target.sessionId,pinned:!metadata.pinned});if(!result.ok)throw new Error(formatError(result));
        },failureLabel:t('session.pinFailed')},
        {id:'fork',label:t('session.fork'),icon:{key:'workspace.fork'},disabled:metadata.archived===true||!metadata.canFork&&!metadata.forkOperation?.recoverable,
          run:()=>openDialog('fork',metadata),failureLabel:t('session.forkFailed')},
        {id:'terminate',label:t('session.terminate'),disabled:metadata.canClose!==true,run:()=>openDialog('terminate',metadata),failureLabel:t('session.terminateFailed')},
      ];
    }}));
  // The native Session menu keeps its single fork item. For a remote Session,
  // uiWorkspace.forkSession is routed to the Host remote fork below; this
  // registration contributes only the remote terminate action, not a duplicate
  // fork entry.
  ctx.effect(()=>ctx.contextMenus.register({id:'remote-session.terminate',target:'session',order:290,
    observe:()=>[ctx.sessions.list,ctx.workspaces.list,ctx.locale],
    resolve:async(target,signal)=>{
      const row=ctx.sessions.list.getSnapshot().byId[target.sessionId];
      const projection=ctx.sessions.binding(target.sessionId)?.session.projections.faceOf(REMOTE_SESSION_PROJECTION_KEY).getSnapshot()||row?.projectionValues?.[REMOTE_SESSION_PROJECTION_KEY];
      if(projection?.remote!==true)return[];
      const metadata=await getMetadata(target,signal);if(!metadata.remote)return[];
      return[{id:'remote-terminate',label:t('session.terminate'),disabled:metadata.canClose!==true,run:()=>openDialog('terminate',metadata),failureLabel:t('session.terminateFailed')}];
    }}));
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'remote-session.actions',locale:NAMESPACE,
    inject:()=>({hooks:{actionDialog:source},dismissAction:()=>{if(!current?.busy)publish(null);},submitAction:submit,
      allowNewFork:value=>{if(current&&!current.busy)publish({...current,allowNew:value});}})},ActionsDialog));
  // Keep the native menu/shortcut label, but route remote sessions through the
  // Host's ACP fork. This avoids a second menu entry while preserving native
  // local-session behavior.
  ctx.effect(()=>{
    const workspace=ctx.uiWorkspace, original=workspace?.forkSession;
    if(typeof original!=='function')return;
    const bridge=function(sessionId,onChild,options){
      const row=ctx.sessions.list.getSnapshot().byId[sessionId];
      const projection=ctx.sessions.binding(sessionId)?.session.projections.faceOf(REMOTE_SESSION_PROJECTION_KEY).getSnapshot()||row?.projectionValues?.[REMOTE_SESSION_PROJECTION_KEY];
      if(projection?.remote!==true)return original.call(workspace,sessionId,onChild,options);
      return api('sessionFork',{sessionId,operationId:crypto.randomUUID()}).then(result=>{
        if(!result.ok){ctx.contextMenus.notify(formatError(result),false);return;}
        onChild?.(result.sessionId);
        if(ctx.uiSession.adapter.current.getSnapshot().key===sessionId)openSession(result.sessionId);
        else ctx.contextMenus.notify(t('session.forked'),true,{label:t('session.openFork'),run:()=>openSession(result.sessionId),failureLabel:t('session.openFailed')});
        return result;
      },failure=>{ctx.contextMenus.notify(String(failure?.message||failure),false);});
    };
    workspace.forkSession=bridge;
    return ()=>{if(workspace.forkSession===bridge)workspace.forkSession=original;};
  });
  function titleUpdate(event) {
    if(disposed||event.type!=='title_sync'||typeof event.sessionId!=='string')return;
    retries=0;
    const before=titleSeen.get(event.sessionId);
    if(before&&before.revision>event.revision)return;
    const repeated=before?.revision===event.revision&&before.status===event.status;
    titleSeen.set(event.sessionId,event);
    if(current?.kind==='rename'&&current.sessionId===event.sessionId){
      if(!current.busy)publish({...current,syncStatus:event.status,error:syncMessage(event)});
      return;
    }
    if(event.snapshot||repeated||!['failed','unknown'].includes(event.status))return;
    ctx.contextMenus.notify((event.title?event.title+': ':'')+syncMessage(event),false,{
      label:t('session.viewSync'),failureLabel:t('session.syncFailed'),run:async()=>{
        const metadata=await getMetadata({sessionId:event.sessionId});if(!disposed&&metadata.remote)openDialog('rename',metadata);
      }});
  }
  function watchTitles() {
    if(disposed)return;
    const controller=new AbortController();eventController=controller;
    Promise.resolve().then(()=>{if(disposed||controller.signal.aborted)return;return watch('sessionActionEvents',{},controller.signal,titleUpdate);}).catch(()=>{}).finally(()=>{
      if(disposed||controller.signal.aborted)return;
      retryTimer=setTimeout(watchTitles,Math.min(1000*2**retries++,15000));
    });
  }
  ctx.effect(()=>{watchTitles();return()=>{disposed=true;eventController?.abort();clearTimeout(retryTimer);current=null;listeners.clear();titleSeen.clear();};});
}
