import React from 'react';
import {h,ui,NativeIcon} from './shared.js';
import {acpBuildChildMap,acpItemId} from './presentation.js';
import {transcriptEntries,transcriptScope,transcriptPolicy,processGroupPresentation} from './transcript-model.js';
import {ownedDisclosure as Disclosure,FlowIcon,requestReadingIntent} from './disclosure.js';
import {settledTurnSummaries,settledTurnPresentation,processFocusProtection} from './turn-summary-model.js';
import {NativeTurnSummary} from './turn-summary-view.js';
import {AcpToolCard,AcpSubagentCard,AcpPlanCard,AcpStateCard,AcpSessionMessageCard,AcpTerminalEventCard,AcpNativeEventCard,AcpCompactionCard,AcpNoticeCard,AcpSourceFallback,AcpInteractionReceipt} from './cards.js';
import {AcpThought} from './thought.js';
import {thoughtIsStreaming} from './thought-model.js';
import {historyAnchorAttributes} from './history-anchor.js';
import {SentAttachments} from './sent-attachments.js';
import {NativeUserMessage,NativeAssistantMessage,NativeMessageActions,NativeMessageCopy,NativeMessageUsage,NativeMessageTime} from './native-message-view.js';
import {turnMessageMeta} from './message-meta-model.js';
import {runningTailPresentation,formatTurnElapsed,subscribeRunningClock} from './running-tail-model.js';
import {OutputImage} from './output-image.js';
import {markdownImageAlt} from './output-image-model.js';
import {activeRootScope,actionLabel,conversationActivity,completedResponseCopyKeys,responseCopyParts,processTreeSummary,connectionLabelKey} from './stream-view-model.js';

export const messages={
  zh:{'flow.you':'你的消息','flow.agent':'Agent 回复','flow.copy':'复制','flow.copied':'已复制','flow.copyFailed':'复制失败，请选中文字手动复制。',
    'flow.copyCommand':'复制命令','flow.categoryTool':'工具','flow.categoryRead':'读取','flow.categoryEdit':'编辑','flow.categoryExecute':'命令','flow.categorySearch':'搜索','flow.categoryThought':'思考','flow.categoryPlan':'计划','flow.categoryAgent':'子任务','flow.categoryOther':'其他类型','flow.copyPart':'复制这段回复','flow.copyTurn':'复制本轮回复','flow.process':'执行过程','flow.processCount':'项记录','flow.stopped':'已停止','flow.interrupted':'已中断',
    'flow.toolRead':'读取','flow.toolEdit':'编辑','flow.toolSearch':'搜索','flow.toolExecute':'运行命令','flow.toolFetch':'获取内容','flow.toolDelete':'删除','flow.toolMove':'移动','flow.toolThink':'思考','flow.toolOther':'工具','flow.toolInput':'输入','flow.toolOutput':'输出',
    'flow.remoteOffline':'远端连接已中断，最新任务状态待确认。本机断线不会取消远端任务；重连后将补取进展，需要审批时仍会等待你的决定。','flow.closedReadOnly':'远端会话已结束，历史记录为只读。',
    'flow.turnCompleted':'已完成','flow.turnTook':'已完成，用时 ','flow.turnFailed':'已失败','flow.durationGap':'','flow.turnProcessToggle':'展开或收起本轮执行过程',
    'flow.usage':'用量','flow.usageHint':'本轮 stop 时协议报告的 token 明细；缺失字段保持为空，不做估算。','flow.completedAt':'完成于',
    'flow.turnUsage':'本轮用量','flow.usageModel':'提供方 / 模型','flow.cacheHit':'缓存命中','flow.uncachedInput':'未缓存输入','flow.cacheRead':'缓存读取','flow.cacheWrite':'缓存写入','flow.outputTokens':'输出',
    'flow.ended':'已结束','flow.hadFailures':'含失败记录','flow.thinking':'思考中','flow.runningCount':'项进行中',
    'flow.permissionRecorded':'权限确认已处理','flow.permissionAllowed':'已允许此操作','flow.permissionDenied':'已拒绝此操作','flow.questionRecorded':'提问已处理','flow.questionDeclined':'已跳过此问题','flow.permissionCancelled':'权限确认已取消','flow.questionCancelled':'提问已取消',
    'flow.runStatus':'运行状态','flow.turnRunning':'本轮进行中','flow.turnWaiting':'等待你的操作','flow.turnElapsed':'本轮用时','flow.elapsedHint':'从本轮实际开始执行时计算，包含等待和连接中断时间，不代表模型推理耗时。','flow.hour':'小时','flow.minute':'分','flow.second':'秒',
    'flow.latest':'回到最新消息','flow.replying':'正在生成回复','flow.waitingPermission':'等待权限确认','flow.waitingQuestion':'等待你的回答',
    'flow.working':'等待 Agent 进展','flow.connecting':'正在连接','flow.connection':'正在恢复连接','flow.remoteConnecting':'正在建立远端 SSH 连接','flow.remoteReconnecting':'正在恢复远端 SSH 连接','flow.syncConnecting':'正在连接会话消息流','flow.syncResuming':'正在续接会话消息流','flow.syncReconnecting':'正在恢复会话消息同步','flow.source':'来源未关联'},
  en:{'flow.you':'Your message','flow.agent':'Agent response','flow.copy':'Copy','flow.copied':'Copied','flow.copyFailed':'Copy failed. Select the text and copy manually.',
    'flow.copyCommand':'Copy command','flow.categoryTool':'Tools','flow.categoryRead':'Reads','flow.categoryEdit':'Edits','flow.categoryExecute':'Commands','flow.categorySearch':'Searches','flow.categoryThought':'Reasoning','flow.categoryPlan':'Plans','flow.categoryAgent':'Agents','flow.categoryOther':'other types','flow.copyPart':'Copy this response','flow.copyTurn':'Copy turn responses','flow.process':'Activity','flow.processCount':'records','flow.stopped':'Stopped','flow.interrupted':'Interrupted',
    'flow.toolRead':'Read','flow.toolEdit':'Edit','flow.toolSearch':'Search','flow.toolExecute':'Run command','flow.toolFetch':'Fetch','flow.toolDelete':'Delete','flow.toolMove':'Move','flow.toolThink':'Reasoning','flow.toolOther':'Tool','flow.toolInput':'Input','flow.toolOutput':'Output',
    'flow.remoteOffline':'Remote connection lost; the latest task state is unconfirmed. Disconnecting locally does not cancel the remote task. Reconnection retrieves progress; approvals still wait for your decision.','flow.closedReadOnly':'This remote session has ended. Its history is read-only.',
    'flow.turnCompleted':'Completed','flow.turnTook':'Completed in ','flow.turnFailed':'Failed','flow.durationGap':' ','flow.turnProcessToggle':'Expand or collapse this turn’s activity',
    'flow.usage':'Usage','flow.usageHint':'Token details reported by the protocol when this turn stopped; missing fields stay empty rather than being estimated.','flow.completedAt':'Completed at',
    'flow.turnUsage':'Turn usage','flow.usageModel':'Provider / model','flow.cacheHit':'Cache hit','flow.uncachedInput':'Uncached input','flow.cacheRead':'Cache read','flow.cacheWrite':'Cache write','flow.outputTokens':'Output',
    'flow.ended':'Ended','flow.hadFailures':'Includes failed steps','flow.thinking':'Thinking','flow.runningCount':'active',
    'flow.permissionRecorded':'Permission request handled','flow.permissionAllowed':'Operation allowed','flow.permissionDenied':'Operation denied','flow.questionRecorded':'Question handled','flow.questionDeclined':'Question skipped','flow.permissionCancelled':'Permission request cancelled','flow.questionCancelled':'Question cancelled',
    'flow.runStatus':'Run status','flow.turnRunning':'Turn in progress','flow.turnWaiting':'Awaiting your action','flow.turnElapsed':'Turn elapsed','flow.elapsedHint':'Time since this turn actually started, including waits and connection interruptions; not model reasoning time.','flow.hour':'h','flow.minute':'m','flow.second':'s',
    'flow.latest':'Jump to latest','flow.replying':'Generating a response','flow.waitingPermission':'Awaiting permission','flow.waitingQuestion':'Awaiting your answer',
    'flow.working':'Waiting for Agent progress','flow.connecting':'Connecting','flow.connection':'Reconnecting','flow.remoteConnecting':'Connecting to remote SSH','flow.remoteReconnecting':'Restoring remote SSH connection','flow.syncConnecting':'Connecting to session message stream','flow.syncResuming':'Reattaching session message stream','flow.syncReconnecting':'Restoring session message sync','flow.source':'Unlinked source'},
};

export function Transcript({items,running,turns={},preferences,t,labels,openFile,renderFactorySlot,rootSessionId,attachmentContext}) {
  const [manual,setManual]=React.useState({});
  const [turnOpen,setTurnOpen]=React.useState({});
  const focusedProcess=React.useRef(null),turnRegionPrefix=React.useId();
  const policy=transcriptPolicy(preferences,'standard');
  const built=acpBuildChildMap(items);
  const top=items.filter(item=>!built.parents[acpItemId(item)]);
  const entries=transcriptEntries(top,{turns,allItems:items});
  const latestUser=entries.findLast(entry=>entry.item?.type==='user')?.item;
  const turnSummaries=settledTurnSummaries(entries,turns,rootSessionId);
  const copyableResponses=completedResponseCopyKeys(items,turns);
  const focused=focusedProcess.current;
  const focusProtection=processFocusProtection(entries,policy,manual,focused);
  const readingManual=focusProtection?{...manual,[focusProtection.key]:{open:true,readingFlat:true}}:manual;
  const turnPresentations=new Map([...turnSummaries].map(([scope,summary])=>[scope,
    settledTurnPresentation(summary,entries,policy,readingManual,turnOpen[scope],focused?.scope===scope)]));
  // Completion must not hide a focused or explicitly-read process. Freeze that
  // protection before paint; merely leaving focus later is not a collapse action.
  React.useLayoutEffect(()=>{
    if(focusProtection){
      setManual(previous=>previous[focusProtection.key]?.open&&previous[focusProtection.key]?.readingFlat?previous:
        {...previous,[focusProtection.key]:{open:true,readingFlat:true}});
      if(focusedProcess.current===focused)focusedProcess.current={...focused,wasFlat:false};
    }
    const pins=[...turnPresentations].filter(([,value])=>value.pin).map(([scope])=>scope);
    if(pins.length)setTurnOpen(previous=>{
      const missing=pins.filter(scope=>typeof previous[scope]!=='boolean');
      return missing.length?{...previous,...Object.fromEntries(missing.map(scope=>[scope,true]))}:previous;
    });
  },[turnPresentations,focusProtection,focused]);
  const processRegionId=key=>`${turnRegionPrefix}-${encodeURIComponent(key)}`;
  function renderTurnSummary(entry) {
    const summary=turnSummaries.get(entry.scope);
    if(!summary||summary.ownerKey!==entry.key)return null;
    const presentation=turnPresentations.get(entry.scope);
    const processKeys=new Set(summary.processKeys);
    const facts=processTreeSummary({settled:true,items:entries.filter(value=>processKeys.has(value.key)).flatMap(value=>value.items)},built.map);
    return h(NativeTurnSummary,{key:`turn-summary:${entry.scope}`,summary,t,...presentation,
      failedCount:facts.failedCount,controls:summary.processKeys.map(processRegionId).join(' '),
      onToggle:event=>{
        // Explicit focus also covers browsers that do not focus on pointer click.
        event.currentTarget.focus({preventScroll:true});
        requestReadingIntent(event.currentTarget);
        setTurnOpen(previous=>({...previous,[entry.scope]:!presentation.open}));
      }});
  }
  const activeScope=running?activeRootScope(turns,rootSessionId):null;
  const copyLabels={copy:t('flow.copy'),copied:t('flow.copied'),copyFailed:t('flow.copyFailed')};
  // Child conversations reuse the same filtering, message roles and copy rules.
  // The parent already supplies a disclosure; do not add another process shell.
  function renderNested(children,ancestors) {
    return h('div',{className:'rssh-flow-children'},transcriptEntries(children,{turns,allItems:items}).map(entry=>
      entry.kind==='process'?h('div',{key:entry.key,className:'rssh-process-rows'},entry.items.map(item=>render(item,entry.responses.get(item.key),ancestors))):render(entry.item,entry,ancestors)));
  }
  function render(item,entry={},ancestors=[]) {
    const id=acpItemId(item),fallback=built.fallbacks[id];
    const common={key:item.key||id,item,t,labels,childMap:built.map,fallbacks:built.fallbacks,sourceFallback:fallback,
      onOpenOutput:openFile,ancestors,running,turns,showProcessSummary:policy.showProcessSummary,transcriptItems:items,renderFactorySlot,renderNested};
    switch(item.type){
      case 'user': return h(NativeUserMessage,{key:item.key||id,label:t('flow.you'),
        text:String(item.text||'').trim()?item.text:'',latest:item===latestUser,pending:item.delivery==='queued',
        attachments:item.attachments?.length?h(SentAttachments,{item,t,
          context:!ancestors.length&&(!item.rootSessionId||item.rootSessionId===item.sessionId)?attachmentContext:null,
          phase:JSON.stringify([item.delivery,turns[transcriptScope(item)]?.startSeq,turns[transcriptScope(item)]?.endSeq,turns[transcriptScope(item)]?.status])}):null,
        delivery:['queued','cancelled'].includes(item.delivery)?t(item.delivery==='queued'?'acp.steerQueued':'acp.inputCancelled'):null,
        actions:String(item.text||'').trim()?h(NativeMessageActions,{clock:'start'},h(NativeMessageCopy,{text:item.text,labels:copyLabels})):null,
        source:fallback?h(AcpSourceFallback,{item,fallback,t}):null});
      case 'assistant': {
        const turn=entry.turn||turns[transcriptScope(item)];
        const streaming=running&&transcriptScope(item)===activeScope&&entry.responseTail===true&&(!turn||turn.status==='running');
        const copy=responseCopyParts(item,entry);
        const meta=turnMessageMeta(turn||{});
        const imageRequest=!ancestors.length&&item.sessionId===rootSessionId&&attachmentContext?{
          id:attachmentContext.id,dshSessionId:attachmentContext.dshSessionId,
          turnId:item.turnId,generation:item.generation,fromSeq:item.seq,throughSeq:item.lastSeq||item.seq,
          sourceSessionId:item.sessionId}:null;
        return h(NativeAssistantMessage,{key:item.key||id,label:t('flow.agent'),streaming,
          source:fallback?h(AcpSourceFallback,{item,fallback,t}):null,
          body:h(ui.MarkdownText,{text:item.text,labels:labels.markdown,renderImage:(token,index)=>h(OutputImage,{
            key:`${index}:${token.href}`,href:token.href,alt:markdownImageAlt(token),title:token.title,request:imageRequest,t})}),
          actions:copyableResponses.has(item.key)?h(NativeMessageActions,{clock:'end'},
            h(NativeMessageCopy,{text:copy.part,labels:{...copyLabels,copy:t('flow.copyPart')}}),
            h(NativeMessageUsage,{tokens:meta.tokens,usage:meta.usage,label:t('flow.usage'),title:t('flow.turnUsage'),hint:t('flow.usageHint'),
              labels:{model:t('flow.usageModel'),cacheHit:t('flow.cacheHit'),input:t('flow.uncachedInput'),cacheRead:t('flow.cacheRead'),cacheWrite:t('flow.cacheWrite'),output:t('flow.outputTokens')}}),
            h(NativeMessageTime,{time:meta.time,dateTime:meta.dateTime,label:t('flow.completedAt')})):null,
          interrupted:entry.responseTail&&(turn?.status==='cancelled'||turn?.status==='interrupted')?t(turn.status==='cancelled'?'flow.stopped':'flow.interrupted'):null});
      }
      case 'thought': return h(React.Fragment,{key:item.key},fallback?h(AcpSourceFallback,{item,fallback,t}):null,
        h(AcpThought,{...common,showPreview:policy.showSettledReasoning,running:thoughtIsStreaming(item,items,running)}));
      case 'tool': return h(AcpToolCard,{...common,tool:item.tool});
      case 'subagent': return h(AcpSubagentCard,{...common,subagent:item.subagent,_key:item._key});
      case 'plan': return h(AcpPlanCard,{...common,...item});
      case 'state': return h(AcpStateCard,common);
      case 'session_message': return h(AcpSessionMessageCard,common);
      case 'terminal_event': return h(AcpTerminalEventCard,common);
      case 'native_event': return h(AcpNativeEventCard,common);
      case 'compaction': return h(AcpCompactionCard,common);
      case 'notice': return h(AcpNoticeCard,common);
      case 'interaction_receipt': return h(AcpInteractionReceipt,common);
      default: return h('div',{key:item.key,className:item.type==='error'?'ra-acp-error':'ra-acp-system',role:item.type==='error'?'alert':undefined},
        fallback?h(AcpSourceFallback,{item,fallback,t}):null,
        item.type==='system'&&item.stopReason==='cancelled'?t('flow.stopped'):item.text);
    }
  }
  return entries.map(entry=>{
    const turnSummary=renderTurnSummary(entry),turnData=turnSummaries.get(entry.scope);
    if(entry.kind!=='process')return h('div',{key:entry.key,className:'rssh-transcript-item','data-transcript-anchor':entry.key,...historyAnchorAttributes(entry),'data-flow-kind':entry.item.type},
      turnData?.afterOwner?null:turnSummary,render(entry.item,entry),turnData?.afterOwner?turnSummary:null);
    const facts=processTreeSummary(entry,built.map);
    const current=facts.runningItem;
    const live=!!(running&&entry.scope===activeScope&&!entry.settled&&current&&
      (current.type!=='thought'||thoughtIsStreaming(current,items,running)));
    const summary=[policy.showProcessSummary&&live?actionLabel(current,t):null,
      facts.failedCount?`${t('flow.hadFailures')} ${facts.failedCount}`:null].filter(Boolean).join(' · ');
    const presentation=processGroupPresentation(entry,policy,readingManual[entry.key]);
    // Keep this same parent type throughout streaming and completion. Explicit
    // reading pins the group open, so finishing never removes the focused child.
    const turnHidden=!!turnData&&!turnPresentations.get(entry.scope).open;
    return h('div',{key:entry.key,className:'rssh-process-group',hidden:turnHidden&&!turnSummary,'data-transcript-anchor':entry.key,...historyAnchorAttributes(entry),'data-flow-kind':'process'},
      turnSummary,
      h('div',{key:'process-part',id:processRegionId(entry.key),className:'rssh-turn-process-part',hidden:turnHidden,
        onFocusCapture:()=>{focusedProcess.current={scope:entry.scope,key:entry.key,wasFlat:presentation.flat};},
        onBlurCapture:event=>{if(!event.currentTarget.contains(event.relatedTarget)&&focusedProcess.current?.key===entry.key)focusedProcess.current=null;}},
      h(Disclosure,{className:'rssh-process-disclosure',title:t('flow.process'),summary,
        icon:h(FlowIcon,{kind:'process'}),...presentation,
        // A settled turn uses its summary as the sole disclosure control.
        hideTrigger:!!turnData,open:turnData?turnPresentations.get(entry.scope).open:presentation.open,
        onOpenChange:open=>setManual(previous=>({...previous,[entry.key]:{open}})),
        onRead:()=>setManual(previous=>{
          const saved=previous[entry.key],readingFlat=!!(saved?.readingFlat||presentation.flat);
          return saved?.open&&saved.readingFlat===readingFlat?previous:{...previous,[entry.key]:{open:true,readingFlat}};
        }),
        scrollRunning:!!(running&&entry.scope===activeScope&&!entry.settled),
        running:live,status:entry.settled?t(entry.interrupted?'flow.interrupted':'flow.ended'):live?t('acp.running'):undefined,
        children:()=>entry.items.map(item=>render(item,entry.responses.get(item.key)))})));
  });
}

function RunningGlyph({kind}) { const name=kind==='mark'?'running':['permission','question'].includes(kind)?'pause':kind==='activity'?'tool':kind==='replying'?'message':kind==='thinking'?'thought':'clock'; return h(NativeIcon,{name,size:16,className:'rssh-running-glyph'}); }

export function RunningTail({state,t}) {
  const activity=conversationActivity(state);
  const presentation=runningTailPresentation(state,activity);
  const [,tick]=React.useState(0);
  React.useEffect(()=>presentation?.clock?subscribeRunningClock(()=>tick(value=>value+1)):undefined,[presentation?.clock,presentation?.scope,presentation?.startedAt]);
  if(!presentation)return null;
  const keys={connecting:'flow.connecting',reconnecting:'flow.connection',permission:'flow.waitingPermission',question:'flow.waitingQuestion',replying:'flow.replying',thinking:'flow.thinking',working:'flow.working'};
  const label=activity.kind==='activity'?[actionLabel(activity.item,t),activity.count>1?`${activity.count} ${t('flow.runningCount')}`:null].filter(Boolean).join(' · '):t(connectionLabelKey(state)||keys[activity.kind]);
  const elapsed=formatTurnElapsed(presentation.seconds,t);
  return h('div',{className:'rssh-running-tail',role:'group','aria-label':t('flow.runStatus'),'data-phase':presentation.phase},
    presentation.showActivity?h('div',{className:'rssh-running-activity',role:'status','aria-live':'polite','aria-atomic':true},
      h(RunningGlyph,{kind:activity.kind}),h('span',{className:'rssh-running-activity-text',title:label},label)):null,
    presentation.footer?h('div',{className:'rssh-running-footer','aria-live':'off'},
      h(RunningGlyph,{kind:presentation.phase==='waiting'?activity.kind:'mark'}),
      h('div',{className:'rssh-running-caption'},
        h('span',{role:'status','aria-live':'polite','aria-atomic':true},
          t(presentation.phase==='waiting'?'flow.turnWaiting':'flow.turnRunning'),
          presentation.activeCount!==null?` · ${presentation.activeCount} ${t('flow.runningCount')}`:null),
        elapsed!==null?h('span',{className:'rssh-running-elapsed',role:'timer','aria-live':'off',title:t('flow.elapsedHint')},
          ' · ',t('flow.turnElapsed'),' ',h('time',{dateTime:`PT${presentation.seconds}S`},elapsed)):null,
        presentation.animate?h('span',{className:'rssh-running-dots','aria-hidden':true},...[0,1,2].map(key=>h('span',{key},'·'))):null)):null);
}
