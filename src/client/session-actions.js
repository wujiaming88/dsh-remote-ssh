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
    'session.forkProgress':'正在提交分叉请求…','session.forking':'正在分叉远端会话…','session.recoverFork':'恢复未完成的分叉',
    'session.unknownFork':'前次远端分叉结果未知。不会自动重复请求，请保留下面的恢复信息。',
    'session.newAfterUnknown':'我已了解前次恢复信息，明确发起一个新的分叉操作。',
    'session.forked':'远端会话已分叉','session.openFork':'打开分叉会话','session.openFailed':'无法打开分叉会话',
    'session.syncFailed':'读取会话操作状态失败','session.nameRequired':'请输入非空名称',
    'session.forkPreparing':'正在读取远端分叉状态…','session.forkElapsed':'总耗时','session.seconds':'秒','session.forkProgressLabel':'分叉进度',
    'session.forkHideKeepsRunning':'关闭此对话框不会取消分叉。可通过源会话的“分叉”操作重新打开进度。',
    'session.forkRecovery':'分叉已中断，但远端进度已保留。使用同一操作 ID 恢复，不会重新创建远端分叉。',
    'session.forkFailedState':'分叉失败。请保留下面的恢复信息；发起新操作前需明确确认。',
    'session.forkStep.checking':'正在检查源会话','session.forkStep.copyingHistory':'正在复制会话历史','session.forkStep.creatingRemote':'正在创建远端会话',
    'session.forkStep.binding':'正在绑定远端会话','session.forkStep.restoringNative':'正在恢复原生会话','session.forkStep.flushing':'正在保存分叉会话',
    'session.forkStep.completed':'分叉已完成','session.forkStep.working':'正在处理分叉',
    'session.forkStatusRunning':'分叉中','session.forkStatusRecovery':'待恢复','session.forkStatusRunningTitle':'分叉正在进行，点击查看进度','session.forkStatusRecoveryTitle':'分叉需要恢复，点击查看详情',
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
    'session.forkProgress':'Submitting the fork request…','session.forking':'Forking remote conversation…','session.recoverFork':'Recover unfinished fork',
    'session.unknownFork':'The previous remote fork outcome is unknown. It will not be retried automatically. Keep the recovery information below.',
    'session.newAfterUnknown':'I have reviewed the previous recovery information and explicitly want a new fork operation.',
    'session.forked':'Remote conversation forked','session.openFork':'Open fork','session.openFailed':'Could not open fork',
    'session.syncFailed':'Could not read session actions','session.nameRequired':'Enter a nonempty name',
    'session.forkPreparing':'Reading remote fork status…','session.forkElapsed':'Total elapsed','session.seconds':'s','session.forkProgressLabel':'Fork progress',
    'session.forkHideKeepsRunning':'Closing this dialog does not cancel the fork. Reopen it with Fork on the source conversation.',
    'session.forkRecovery':'The fork was interrupted, but its remote progress is retained. Resume with the same operation ID; a new remote fork will not be created.',
    'session.forkFailedState':'The fork failed. Keep the recovery information below; starting a new operation requires explicit confirmation.',
    'session.forkStep.checking':'Checking the source conversation','session.forkStep.copyingHistory':'Copying conversation history','session.forkStep.creatingRemote':'Creating the remote conversation',
    'session.forkStep.binding':'Binding the remote conversation','session.forkStep.restoringNative':'Restoring the native conversation','session.forkStep.flushing':'Saving the forked conversation',
    'session.forkStep.completed':'Fork completed','session.forkStep.working':'Processing the fork',
    'session.forkStatusRunning':'Forking','session.forkStatusRecovery':'Recovery needed','session.forkStatusRunningTitle':'Fork in progress; click to view progress','session.forkStatusRecoveryTitle':'Fork needs recovery; click to view details',
    'session.terminate':'End remote session','session.terminateTitle':'Confirm ending the remote session','session.terminateDescription':'This terminates the current task, cancels pending approvals, and permanently closes this remote session. History, SSH configuration, and workspace files are retained. This cannot be undone; closing a window or archiving does not end the remote task.',
    'session.terminating':'Confirming remote termination…','session.terminated':'Remote session ended; its history remains readable','session.terminateFailed':'Remote termination could not be confirmed. Recovery information is retained; reconnect and check again.',
  },
};

const FORK_STEPS=new Set(['checking','copyingHistory','creatingRemote','binding','restoringNative','flushing','completed']);
function forkPresentation(operation,busy,now=Date.now()) {
  const running=!!busy||operation?.runState==='running';
  const step=operation?.runState==='completed'||operation?.phase==='completed'?'completed':FORK_STEPS.has(operation?.activeStep)?operation.activeStep:'working';
  const counts=step==='copyingHistory'?operation?.progress:null;
  const progress=counts&&Number.isFinite(counts.processed)&&Number.isFinite(counts.total)&&counts.processed>=0&&counts.total>0
    ?{processed:counts.processed,total:counts.total}:null;
  let elapsedMs=null;
  if(running&&Number.isFinite(operation?.createdAt))elapsedMs=Math.max(0,now-operation.createdAt);
  else if(Number.isFinite(operation?.durationMs))elapsedMs=Math.max(0,operation.durationMs);
  else if(Number.isFinite(operation?.createdAt)&&Number.isFinite(operation?.updatedAt))elapsedMs=Math.max(0,operation.updatedAt-operation.createdAt);
  return{step,progress,running,elapsedSeconds:elapsedMs===null?null:Math.floor(elapsedMs/1000)};
}

function ActionsDialog(props) {
  const t=useT();const dialog=props.useActionDialog(value=>value);
  const [title,setTitle]=React.useState('');
  const [now,setNow]=React.useState(()=>Date.now());
  const forkRunning=dialog?.kind==='fork'&&(dialog.busy||dialog.operation?.runState==='running');
  React.useEffect(()=>{setTitle(dialog?.title||'');},[dialog?.key]);
  React.useEffect(()=>{
    if(!forkRunning)return;
    setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(timer);
  },[forkRunning,dialog?.key]);
  if(!dialog)return null;
  const fork=dialog.kind==='fork',terminate=dialog.kind==='terminate';
  const operation=fork?dialog.operation:null;
  const completed=fork&&(operation?.runState==='completed'||operation?.phase==='completed');
  const unknown=fork&&!!operation&&!completed&&operation.runState!=='running'&&!operation.recoverable;
  const recovery=fork&&!!operation&&!completed&&!dialog.busy&&operation.recoverable;
  const presentation=fork?forkPresentation(operation,dialog.busy,now):null;
  const canSubmit=terminate ? !dialog.busy&&dialog.metadata.canClose===true : fork
    ? !dialog.busy&&!dialog.metadata.pending&&!dialog.metadata.archived&&(!unknown||dialog.allowNew)&&(dialog.metadata.canFork||operation?.recoverable)
    : !dialog.busy&&title.trim().length>0;
  const operationError=operation?.error?formatError(operation,String(operation.runState||operation.phase||'fork')):'';
  return h(ui.Modal,{open:true,title:t(terminate?'session.terminateTitle':fork?'session.forkTitle':'session.renameTitle'),closeLabel:t('session.close'),
    onClose:()=>props.dismissAction(),
    footer:h(React.Fragment,null,
      h(ui.Button,{variant:'outline',onClick:props.dismissAction},t('session.close')),
      completed?h(ui.Button,{variant:'primary',disabled:!operation?.sessionId,onClick:()=>props.openFork()},t('session.openFork')):
      h(ui.Button,{variant:'primary',disabled:!canSubmit,onClick:()=>props.submitAction(title)},
        t(terminate?(dialog.busy?'session.terminating':'session.terminate'):dialog.busy?(fork?'session.forking':'session.renaming'):fork?(operation?.recoverable?'session.recoverFork':'session.fork'):'session.save')))},
    h('div',{className:'rssh-session-action-dialog'},
      h('strong',null,dialog.title),
      terminate?h('p',{role:'alert'},t('session.terminateDescription')):fork?h('p',null,t('session.forkDescription')):h('label',null,t('session.title'),h(ui.Input,{value:title,disabled:dialog.busy,'data-modal-autofocus':'true',onChange:event=>setTitle(event.target.value),onKeyDown:event=>{
        if(event.key==='Enter'&&!event.isComposing&&!event.nativeEvent?.isComposing&&canSubmit){event.preventDefault();props.submitAction(title);}
      }})),
      fork&&dialog.metadata.pending?h('p',{role:'status'},t('session.forkPreparing')):null,
      fork&&!dialog.metadata.pending&&!dialog.busy&&!completed&&(dialog.metadata.archived||!dialog.metadata.canFork&&!operation?.recoverable)?h('p',{role:'status'},t('session.forkBusy')):null,
      dialog.kind==='rename'&&dialog.syncStatus==='pending'&&!dialog.busy?h('p',{role:'status'},t('session.renaming')):null,
      dialog.error?h('p',{className:'ra-acp-error',role:'alert'},dialog.error):null,
      !dialog.error&&operationError?h('p',{className:'ra-acp-error',role:'alert'},operationError):null,
      fork&&(dialog.busy||operation)?h('div',{className:'rssh-fork-progress'},
        h('div',{className:'rssh-fork-progress-heading'},
          h('span',{className:'rssh-fork-step',role:'status','aria-live':'polite'},t(dialog.busy&&!operation?'session.forkProgress':`session.forkStep.${presentation.step}`)),
          presentation.elapsedSeconds===null?null:h('span',{className:'rssh-fork-elapsed'},t('session.forkElapsed'),': ',String(presentation.elapsedSeconds),' ',t('session.seconds'))),
        presentation.progress?h(React.Fragment,null,
          h('progress',{max:presentation.progress.total,value:Math.min(presentation.progress.processed,presentation.progress.total),'aria-label':t('session.forkProgressLabel')}),
          h('span',{className:'rssh-fork-counts'},String(presentation.progress.processed),' / ',String(presentation.progress.total))):
          presentation.running?h('progress',{'aria-label':t('session.forkProgressLabel')}):null):null,
      fork&&dialog.busy?h('p',{className:'rssh-fork-background-note',role:'note'},t('session.forkHideKeepsRunning')):null,
      recovery?h('p',{className:'rssh-fork-recovery',role:'status'},t('session.forkRecovery')):null,
      unknown?h(React.Fragment,null,h('p',{role:'alert'},t(operation?.outcome==='unknown'||operation?.recoveryKind==='unknown'?'session.unknownFork':operation?.runState==='failed'?'session.forkFailedState':'session.incompleteFork')),
        h(ui.Checkbox,{checked:dialog.allowNew,disabled:dialog.busy,label:t('session.newAfterUnknown'),onChange:props.allowNewFork})):null,
      operation?h('details',null,h('summary',null,operation.operationId||dialog.operationId),h('pre',{className:'ra-acp-json'},JSON.stringify(operation,null,2))):null));
}

function ForkStatusButton({sessionId,useRemoteSessionForkStatuses,openForkStatus}) {
  const t=useT();
  const status=useRemoteSessionForkStatuses(snapshot=>snapshot.byId[sessionId]);
  if(!status)return null;
  const recovery=status.status==='recovery',unknown=status.recoveryKind==='unknown';
  const label=t(recovery?'session.forkStatusRecovery':'session.forkStatusRunning');
  return h('button',{type:'button',className:'rssh-session-fork-status','data-state':status.status,'data-recovery-kind':status.recoveryKind,
    'aria-label':label+': '+t(recovery?'session.forkStatusRecoveryTitle':'session.forkStatusRunningTitle'),title:t(recovery?'session.forkStatusRecoveryTitle':'session.forkStatusRunningTitle'),
    onClick:event=>{event.preventDefault();event.stopPropagation();openForkStatus(sessionId);}},
    h(ui.StateDot,{state:recovery?(unknown?'error':'warning'):'ongoing',size:recovery?9:12}),h('span',null,label));
}

export function installSessionActions(ctx, {watch=stream,onClosed=()=>{}} = {}) {
  let current=null,disposed=false,eventController,retryTimer,retries=0;
  let forkStatusSnapshot={byId:{}};
  const titleSeen=new Map(),forkTasks=new Map(),activeForks=new Map();
  const listeners=new Set(),forkStatusListeners=new Set();
  const source={getSnapshot:()=>current,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}};
  const forkStatusSource={getSnapshot:()=>forkStatusSnapshot,subscribe:listener=>{forkStatusListeners.add(listener);return()=>forkStatusListeners.delete(listener);}};
  const publish=value=>{if(disposed)return;current=value;for(const listener of listeners)listener();};
  const t=key=>ctx.locale.bind(NAMESPACE)(key);
  const openSession=id=>ctx.uiWorkspace.openSession(id);
  const selectedSession=()=>ctx.uiSession.adapter.current.getSnapshot().key;
  const syncMessage=record=>record&&['failed','unknown'].includes(record.status)?t(record.status==='unknown'?'session.renameUnknown':'session.renamePartial')+formatError(record.error,String(record.status)):'';
  const operationRunning=operation=>operation?.runState==='running';
  const forkStatusEntry=task=>{
    if(!task)return null;
    const operation=task.operation;
    if(task.requestPending||operationRunning(operation)||(task.metadataPending&&!operation))return{sessionId:task.sourceSessionId,operationId:task.operationId,status:'running'};
    if(operation?.runState==='completed')return null;
    if(operation)return{sessionId:task.sourceSessionId,operationId:task.operationId,status:'recovery',recoverable:!!operation.recoverable,
      recoveryKind:operation.recoveryKind||(operation.outcome==='unknown'||!operation.recoverable?'unknown':'resume')};
    if(task.requestStarted&&task.error)return{sessionId:task.sourceSessionId,operationId:task.operationId,status:'recovery',recoverable:false,recoveryKind:'unknown'};
    return null;
  };
  const sameForkStatus=(a,b)=>a===b||!!a&&!!b&&a.sessionId===b.sessionId&&a.operationId===b.operationId&&a.status===b.status&&a.recoverable===b.recoverable&&a.recoveryKind===b.recoveryKind;
  function syncForkStatuses() {
    if(disposed)return;
    const byId={};
    for(const [sessionId,task] of activeForks){const entry=forkStatusEntry(task);if(entry)byId[sessionId]=entry;}
    const previous=forkStatusSnapshot.byId,keys=Object.keys(byId),oldKeys=Object.keys(previous);
    if(keys.length===oldKeys.length&&keys.every(key=>sameForkStatus(byId[key],previous[key])))return;
    forkStatusSnapshot={byId};for(const listener of forkStatusListeners)listener();
  }
  const normalizeOperation=(operation,task,runState)=>{
    if(!operation)return null;
    const phase=operation.phase||task?.operation?.phase||'';
    return{...operation,operationId:operation.operationId||task?.operationId,sourceSessionId:operation.sourceSessionId||task?.sourceSessionId,
      phase,runState:['running','interrupted','completed','failed'].includes(operation.runState)?operation.runState:phase==='completed'?'completed':runState||'interrupted'};
  };
  const placeholderMetadata=task=>({ok:true,remote:true,sessionId:task.sourceSessionId,title:task.title,pending:true,canFork:false,archived:false,forkOperation:null,activeForkOperation:null});
  const forkSnapshot=task=>({key:task.key,kind:'fork',sessionId:task.sourceSessionId,title:task.title,metadata:task.metadata||placeholderMetadata(task),
    operation:task.operation,operationId:task.operationId,allowNew:task.allowNew,busy:task.metadataPending||task.requestPending||operationRunning(task.operation),error:task.error});
  const updateFork=task=>{syncForkStatuses();if(current?.kind==='fork'&&current.key===task.key)publish(forkSnapshot(task));};
  function createForkTask(sessionId,operationId=crypto.randomUUID()) {
    const row=ctx.sessions.list.getSnapshot().byId[sessionId];
    const task={sourceSessionId:sessionId,operationId,title:row?.title||'',metadata:null,operation:null,key:null,allowNew:false,
      metadataPending:false,metadataPromise:null,requestPending:false,requestStarted:false,requestVersion:0,observedRunning:false,autoOpen:true,dismissed:false,
      completionHandled:false,error:''};
    forkTasks.set(operationId,task);activeForks.set(sessionId,task);return task;
  }
  function adoptOperationId(task,operationId) {
    if(!operationId||task.operationId===operationId)return;
    if(forkTasks.get(task.operationId)===task)forkTasks.delete(task.operationId);
    task.operationId=operationId;forkTasks.set(operationId,task);
  }
  function hideForkDialog(dialog) {
    if(dialog?.kind!=='fork')return;
    const task=forkTasks.get(dialog.operationId);
    if(task&&task.key===dialog.key){task.autoOpen=false;task.dismissed=true;task.key=null;}
  }
  function showFork(task) {
    if(current?.kind==='fork'&&current.key===task.key){publish(forkSnapshot(task));return;}
    hideForkDialog(current);task.key=crypto.randomUUID();task.dismissed=false;publish(forkSnapshot(task));
  }
  function applyMetadata(task,metadata) {
    const raw=metadata.activeForkOperation||(metadata.forkOperation?.phase!=='completed'?metadata.forkOperation:null);
    if(raw?.operationId&&!task.requestStarted)adoptOperationId(task,raw.operationId);
    task.metadata={...metadata,pending:false};task.metadataPending=false;task.title=metadata.title||task.title;task.error='';
    const current=task.operation,stale=!!(current&&raw?.operationId===current.operationId&&(task.completionHandled||current.runState==='completed'||Number.isFinite(raw.revision)&&Number.isFinite(current.revision)&&raw.revision<current.revision));
    if(raw&&!stale&&(!task.requestStarted||raw.operationId===task.operationId))task.operation=normalizeOperation(raw,task);
    else if(!raw&&!task.requestStarted&&!task.observedRunning&&!task.completionHandled)task.operation=null;
    if(operationRunning(task.operation))task.observedRunning=true;
    updateFork(task);
  }
  function openDialog(kind,metadata) {
    if(kind==='fork'){
      const raw=metadata.activeForkOperation||(metadata.forkOperation?.phase!=='completed'?metadata.forkOperation:null);
      let task=raw?.operationId&&forkTasks.get(raw.operationId)||activeForks.get(metadata.sessionId);
      if(!task)task=createForkTask(metadata.sessionId,raw?.operationId||undefined);
      applyMetadata(task,metadata);showFork(task);return;
    }
    hideForkDialog(current);
    publish({key:crypto.randomUUID(),kind,sessionId:metadata.sessionId,title:metadata.title||'',metadata,
      operation:null,operationId:crypto.randomUUID(),allowNew:false,busy:false,syncStatus:metadata.titleSync?.status,error:kind==='rename'?syncMessage(metadata.titleSync):''});
  }
  function notifyForkError(task,message) {
    if(current?.kind==='fork'&&current.key===task.key)return;
    ctx.contextMenus.notify(message,false,{label:t('session.fork'),failureLabel:t('session.forkFailed'),run:()=>{if(!disposed)reopenForkStatus(task.sourceSessionId);}});
  }
  function completeFork(task,operation,snapshot=false) {
    if(disposed||task.completionHandled)return;
    const observed=task.observedRunning||task.requestStarted||task.dismissed||!!task.key;
    if(!snapshot||observed)task.completionHandled=true;
    task.operation=normalizeOperation({...operation,phase:'completed',runState:'completed',recoverable:false},task,'completed');
    task.requestPending=false;task.metadataPending=false;task.error='';
    if(activeForks.get(task.sourceSessionId)===task)activeForks.delete(task.sourceSessionId);
    updateFork(task);
    // A newly discovered historical snapshot restores state without replaying a
    // toast. Completion of an already observed operation still notifies after a
    // reconnect, but a snapshot never steals navigation.
    if(snapshot&&!observed)return;
    const child=task.operation.sessionId;
    const visible=current?.kind==='fork'&&current.key===task.key;
    if(!snapshot&&visible&&task.autoOpen&&!task.dismissed&&selectedSession()===task.sourceSessionId&&child){
      task.key=null;publish(null);openSession(child);return;
    }
    if(snapshot&&visible)return;
    ctx.contextMenus.notify(t('session.forked'),true,child?{label:t('session.openFork'),failureLabel:t('session.openFailed'),run:()=>openSession(child)}:undefined);
  }
  function applyForkOperation(task,raw,{snapshot=false}={}) {
    if(disposed||task.completionHandled)return;
    const operation=normalizeOperation(raw,task);
    if(!operation)return;
    if(task.operation?.runState==='completed'&&operation.runState!=='completed')return;
    if(operation.runState==='completed'){completeFork(task,operation,snapshot);return;}
    if(snapshot&&operation.runState!=='running'){task.requestVersion++;task.requestPending=false;task.metadataPending=false;}
    task.operation=operation;task.error='';
    const active=activeForks.get(task.sourceSessionId),activeRunning=operationRunning(active?.operation);
    const activate=!active||active===task||(!snapshot&&operation.runState==='running'&&!activeRunning)||
      (!snapshot&&operation.runState!=='running'&&!activeRunning&&!active.requestPending&&!active.metadataPending);
    if(activate)activeForks.set(task.sourceSessionId,task);
    if(operation.runState==='running')task.observedRunning=true;
    updateFork(task);
  }
  function newOperationAfterConsent(task) {
    const next=createForkTask(task.sourceSessionId);
    next.metadata=task.metadata;next.title=task.title;next.key=task.key;next.autoOpen=task.autoOpen;next.dismissed=task.dismissed;
    task.key=null;updateFork(next);return next;
  }
  async function startFork(task) {
    if(disposed||!task||task.requestPending||task.completionHandled||operationRunning(task.operation))return;
    let metadata=task.metadata;
    if(!metadata||metadata.pending)return;
    let operation=task.operation;
    const needsConsent=!!operation&&operation.runState!=='completed'&&!operation.recoverable;
    if(needsConsent&&!task.allowNew)return;
    if(needsConsent&&task.allowNew){task=newOperationAfterConsent(task);metadata=task.metadata;operation=null;}
    if(operation?.runState==='completed'||metadata.archived||(!metadata.canFork&&!operation?.recoverable))return;
    task.requestStarted=true;task.requestPending=true;task.error='';updateFork(task);
    const operationId=task.operationId,requestVersion=++task.requestVersion;
    let result;
    try{result=await api('sessionFork',{sessionId:task.sourceSessionId,operationId});}
    catch(error){result={ok:false,error:String(error?.message||error)};}
    if(disposed||task.requestVersion!==requestVersion)return;
    task.requestPending=false;
    if(task.completionHandled)return;
    if(!result?.ok){
      const message=t('session.forkFailed')+': '+formatError(result);
      task.error=message;task.allowNew=false;
      if(result?.operation)task.operation=normalizeOperation({...result.operation,error:result.operation.error||{message:formatError(result)}},task,'failed');
      activeForks.set(task.sourceSessionId,task);updateFork(task);notifyForkError(task,message);return;
    }
    const operationResult=normalizeOperation({...(result.operation||{}),operationId:result.operation?.operationId||operationId,
      sessionId:result.operation?.sessionId||result.sessionId,phase:'completed',runState:'completed'},task,'completed');
    completeFork(task,operationResult,false);
  }
  async function submit(title) {
    const dialog=current;if(!dialog||dialog.busy)return;
    if(dialog.kind==='fork')return startFork(forkTasks.get(dialog.operationId));
    if(dialog.kind==='terminate'&&dialog.metadata.canClose!==true)return;
    if(dialog.kind==='rename'&&!title.trim()){publish({...dialog,error:t('session.nameRequired')});return;}
    publish({...dialog,busy:true,error:''});
    const result=dialog.kind==='terminate'
      ?await api('acpClose',{id:dialog.metadata.acpId,dshSessionId:dialog.sessionId,confirm:true})
      :await api('sessionRename',{sessionId:dialog.sessionId,title});
    if(disposed||current?.key!==dialog.key)return;
    if(!result.ok){publish({...current,busy:false,error:(dialog.kind==='terminate'?t('session.terminateFailed')+' ':'')+formatError(result)});return;}
    if(dialog.kind==='rename'&&result.titleSync?.status!=='synced'){
      publish({...current,busy:false,title:result.title,error:t(result.titleSync?.status==='unknown'?'session.renameUnknown':'session.renamePartial')+formatError(result.titleSync?.error,String(result.titleSync?.status||''))});return;
    }
    publish(null);
    if(dialog.kind==='terminate'){onClosed(dialog.sessionId,result.session);ctx.contextMenus.notify(t('session.terminated'),true);}
  }
  async function openForkResult() {
    const dialog=current;if(dialog?.kind!=='fork')return;
    const task=forkTasks.get(dialog.operationId),child=task?.operation?.sessionId;if(!child)return;
    try{await openSession(child);if(current?.key===dialog.key){task.key=null;publish(null);}}
    catch(error){if(current?.key===dialog.key)publish({...current,error:t('session.openFailed')+': '+String(error?.message||error)});}
  }
  const getMetadata=async(target,signal)=>{
    const result=await api('sessionActions',{sessionId:target.sessionId},signal);
    if(!result.ok)throw new Error(formatError(result));return result;
  };
  function reopenForkStatus(sessionId) {
    if(disposed)return;
    const entry=forkStatusSnapshot.byId[sessionId];
    const task=entry&&forkTasks.get(entry.operationId)||activeForks.get(sessionId);
    if(!task)return;
    showFork(task);
    if(task.metadata||task.metadataPending)return;
    task.metadataPending=true;task.error='';updateFork(task);
    const request=getMetadata({sessionId}).then(metadata=>{
      if(disposed)return{ok:true};
      if(!metadata.remote){
        task.metadataPending=false;task.metadata={...metadata,pending:false};task.error=t('session.forkUnavailable');
        if(activeForks.get(sessionId)===task)activeForks.delete(sessionId);updateFork(task);return{ok:true};
      }
      applyMetadata(task,metadata);return{ok:true};
    },failure=>{
      if(disposed)return{ok:false};
      task.metadataPending=false;task.metadataPromise=null;task.metadata=null;task.error=String(failure?.message||failure);updateFork(task);
      notifyForkError(task,task.error);return{ok:false,error:task.error};
    });
    task.metadataPromise=request;
  }
  ctx.effect(()=>ctx.contextMenus.register({id:'remote-session.actions',target:'remote-agent-session',order:100,
    observe:()=>[ctx.sessions.list,ctx.workspaces.list,ctx.locale],
    resolve:async(target,signal)=>{
      const metadata=await getMetadata(target,signal);if(!metadata.remote)return[];
      return[
        {id:'rename',label:t(metadata.titleSync&&['failed','unknown'].includes(metadata.titleSync.status)?'session.renameUnsynced':'session.rename'),icon:{key:'workspace.rename'},commandId:'session.rename',disabled:metadata.closed===true,run:()=>openDialog('rename',metadata),failureLabel:t('session.renameFailed')},
        {id:'pin',label:t(metadata.pinned?'session.unpin':'session.pin'),icon:{key:metadata.pinned?'workspace.unpin':'workspace.pin'},disabled:metadata.archived===true,run:async()=>{
          const result=await api('sessionPin',{sessionId:target.sessionId,pinned:!metadata.pinned});if(!result.ok)throw new Error(formatError(result));
        },failureLabel:t('session.pinFailed')},
        {id:'fork',label:t('session.fork'),icon:{key:'workspace.fork'},disabled:metadata.archived===true||!metadata.canFork&&!metadata.activeForkOperation&&!metadata.forkOperation?.recoverable,
          run:()=>openDialog('fork',metadata),failureLabel:t('session.forkFailed')},
        {id:'terminate',label:t('session.terminate'),disabled:metadata.canClose!==true,run:()=>openDialog('terminate',metadata),failureLabel:t('session.terminateFailed')},
      ];
    }}));
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'remote-session.actions',locale:NAMESPACE,
    inject:()=>({hooks:{actionDialog:source},dismissAction:()=>{
      if(current?.kind==='fork'){hideForkDialog(current);publish(null);}
      else if(!current?.busy)publish(null);
    },submitAction:submit,openFork:openForkResult,
      allowNewFork:value=>{if(current?.kind==='fork'&&!current.busy){const task=forkTasks.get(current.operationId);if(task){task.allowNew=!!value;updateFork(task);}}}})},ActionsDialog));
  ctx.slots.inject('sidebar.session.row.trailing',()=>ctx.slots.register({
    name:'sidebar.session.row.trailing',id:'remote-session.fork-status',order:-90,locale:NAMESPACE,
    inject:()=>({hooks:{remoteSessionForkStatuses:forkStatusSource},openForkStatus:reopenForkStatus}),
  },ForkStatusButton));
  // Keep the native menu/shortcut label, but route remote sessions through the
  // Host's ACP fork. This avoids a second menu entry while preserving native
  // local-session behavior. The provisional dialog is published synchronously;
  // metadata and the fork itself remain independent of that dialog's key.
  ctx.effect(()=>{
    const workspace=ctx.uiWorkspace, original=workspace?.forkSession;
    if(typeof original!=='function')return;
    const bridge=function(sessionId,onChild,options){
      const row=ctx.sessions.list.getSnapshot().byId[sessionId];
      const projection=ctx.sessions.binding(sessionId)?.session.projections.faceOf(REMOTE_SESSION_PROJECTION_KEY).getSnapshot()||row?.projectionValues?.[REMOTE_SESSION_PROJECTION_KEY];
      if(projection?.remote!==true)return original.call(workspace,sessionId,onChild,options);
      const task=activeForks.get(sessionId)||createForkTask(sessionId);showFork(task);
      if(task.requestPending)return Promise.resolve({ok:true});
      if(task.metadataPending){
        const pending=task.metadataPromise||Promise.resolve({ok:true});
        return Promise.resolve(pending).then(result=>{
          if(result?.ok!==false&&activeForks.get(sessionId)===task)queueMicrotask(()=>{if(!disposed&&activeForks.get(sessionId)===task)void startFork(task);});
          return result;
        });
      }
      if(task.metadata){queueMicrotask(()=>{if(!disposed&&activeForks.get(sessionId)===task)void startFork(task);});return Promise.resolve({ok:true});}
      task.metadataPending=true;task.error='';updateFork(task);
      const request=getMetadata({sessionId}).then(metadata=>{
        if(disposed)return{ok:true};
        task.metadataPending=false;
        if(!metadata.remote){
          if(current?.key===task.key)publish(null);
          if(activeForks.get(sessionId)===task)activeForks.delete(sessionId);
          if(forkTasks.get(task.operationId)===task)forkTasks.delete(task.operationId);
          syncForkStatuses();
          return original.call(workspace,sessionId,onChild,options);
        }
        applyMetadata(task,metadata);
        queueMicrotask(()=>{if(!disposed&&activeForks.get(sessionId)===task)void startFork(task);});
        return{ok:true};
      },failure=>{
        if(disposed)return{ok:false};
        task.metadataPending=false;task.metadataPromise=null;task.metadata=null;task.error=String(failure?.message||failure);updateFork(task);
        notifyForkError(task,task.error);return{ok:false,error:task.error};
      });
      task.metadataPromise=request;return request;
    };
    workspace.forkSession=bridge;
    return ()=>{if(workspace.forkSession===bridge)workspace.forkSession=original;};
  });
  function actionUpdate(event) {
    if(disposed||!event)return;
    if(event.type==='fork'){
      const raw=event.operation;if(typeof event.sessionId!=='string'||!raw?.operationId)return;
      let task=forkTasks.get(raw.operationId);
      const active=activeForks.get(event.sessionId);
      if(!event.snapshot&&raw.runState==='running'&&active&&!active.requestStarted&&!active.operation&&task!==active){
        if(task){active.operation=task.operation;active.observedRunning=active.observedRunning||task.observedRunning;task.requestVersion++;task.requestPending=false;task.key=null;task.completionHandled=true;}
        task=active;adoptOperationId(task,raw.operationId);
      }
      if(!task){
        task=createForkTask(event.sessionId,raw.operationId);
        if(active&&active!==task)activeForks.set(event.sessionId,active);
      }
      task.sourceSessionId=event.sessionId;
      applyForkOperation(task,raw,{snapshot:event.snapshot===true});return;
    }
    if(event.type!=='title_sync'||typeof event.sessionId!=='string')return;
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
  function watchActions() {
    if(disposed)return;
    const controller=new AbortController();eventController=controller;
    Promise.resolve().then(()=>{if(disposed||controller.signal.aborted)return;return watch('sessionActionEvents',{},controller.signal,actionUpdate);}).catch(()=>{}).finally(()=>{
      if(disposed||controller.signal.aborted)return;
      retryTimer=setTimeout(watchActions,Math.min(1000*2**retries++,15000));
    });
  }
  ctx.effect(()=>{
    const adapter=ctx.uiSession.adapter.current;
    if(typeof adapter.subscribe!=='function')return;
    return adapter.subscribe(()=>{
      const selected=selectedSession();
      for(const task of activeForks.values())if(task.sourceSessionId!==selected)task.autoOpen=false;
    });
  });
  ctx.effect(()=>{watchActions();return()=>{disposed=true;eventController?.abort();clearTimeout(retryTimer);current=null;listeners.clear();titleSeen.clear();forkTasks.clear();activeForks.clear();forkStatusSnapshot={byId:{}};forkStatusListeners.clear();};});
}
