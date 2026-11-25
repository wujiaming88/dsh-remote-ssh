import React from 'react';
import {h,ui} from './shared.js';
import {acpBuildChildMap,acpItemId} from './presentation.js';
import {transcriptEntries,transcriptScope,transcriptPolicy,processGroupPresentation} from './transcript-model.js';
import {ownedDisclosure as Disclosure,FlowIcon} from './disclosure.js';
import {AcpToolCard,AcpSubagentCard,AcpPlanCard,AcpStateCard,AcpSessionMessageCard,AcpTerminalEventCard,AcpNativeEventCard,AcpCompactionCard,AcpNoticeCard,AcpSourceFallback,AcpInteractionReceipt} from './cards.js';
import {AcpThought} from './thought.js';
import {thoughtIsStreaming} from './thought-model.js';
import {historyAnchorAttributes} from './history-anchor.js';
import {SentAttachments} from './sent-attachments.js';
import {activeRootScope,actionLabel,conversationActivity,responseCopyParts,processTreeSummary,processCategorySummary} from './stream-view-model.js';

export const messages={
  zh:{'flow.you':'你的消息','flow.agent':'Agent 回复','flow.copy':'复制','flow.copied':'已复制','flow.copyFailed':'复制失败，请选中文字手动复制。',
    'flow.copyCommand':'复制命令','flow.categoryTool':'工具','flow.categoryRead':'读取','flow.categoryEdit':'编辑','flow.categoryExecute':'命令','flow.categorySearch':'搜索','flow.categoryThought':'思考','flow.categoryPlan':'计划','flow.categoryAgent':'子任务','flow.categoryOther':'其他类型','flow.copyPart':'复制这段回复','flow.copyTurn':'复制本轮回复','flow.process':'执行过程','flow.processCount':'项记录','flow.stopped':'已停止','flow.interrupted':'已中断',
    'flow.ended':'已结束','flow.hadFailures':'含失败记录','flow.thinking':'思考中','flow.runningCount':'项进行中',
    'flow.permissionRecorded':'权限确认已处理','flow.permissionAllowed':'已允许此操作','flow.permissionDenied':'已拒绝此操作','flow.questionRecorded':'提问已处理','flow.questionDeclined':'已跳过此问题','flow.permissionCancelled':'权限确认已取消','flow.questionCancelled':'提问已取消',
    'flow.latest':'回到最新消息','flow.replying':'正在生成回复','flow.waitingPermission':'等待权限确认','flow.waitingQuestion':'等待你的回答',
    'flow.working':'等待 Agent 进展','flow.connecting':'正在连接','flow.connection':'正在恢复连接','flow.source':'来源未关联'},
  en:{'flow.you':'Your message','flow.agent':'Agent response','flow.copy':'Copy','flow.copied':'Copied','flow.copyFailed':'Copy failed. Select the text and copy manually.',
    'flow.copyCommand':'Copy command','flow.categoryTool':'Tools','flow.categoryRead':'Reads','flow.categoryEdit':'Edits','flow.categoryExecute':'Commands','flow.categorySearch':'Searches','flow.categoryThought':'Reasoning','flow.categoryPlan':'Plans','flow.categoryAgent':'Agents','flow.categoryOther':'other types','flow.copyPart':'Copy this response','flow.copyTurn':'Copy turn responses','flow.process':'Activity','flow.processCount':'records','flow.stopped':'Stopped','flow.interrupted':'Interrupted',
    'flow.ended':'Ended','flow.hadFailures':'Includes failed steps','flow.thinking':'Thinking','flow.runningCount':'active',
    'flow.permissionRecorded':'Permission request handled','flow.permissionAllowed':'Operation allowed','flow.permissionDenied':'Operation denied','flow.questionRecorded':'Question handled','flow.questionDeclined':'Question skipped','flow.permissionCancelled':'Permission request cancelled','flow.questionCancelled':'Question cancelled',
    'flow.latest':'Jump to latest','flow.replying':'Generating a response','flow.waitingPermission':'Awaiting permission','flow.waitingQuestion':'Awaiting your answer',
    'flow.working':'Waiting for Agent progress','flow.connecting':'Connecting','flow.connection':'Reconnecting','flow.source':'Unlinked source'},
};

export function Transcript({items,running,turns={},preferences,t,labels,openFile,renderFactorySlot,rootSessionId,attachmentContext}) {
  const [manual,setManual]=React.useState({});
  const policy=transcriptPolicy(preferences,'standard');
  const built=acpBuildChildMap(items);
  const top=items.filter(item=>!built.parents[acpItemId(item)]);
  const entries=transcriptEntries(top,{turns});
  const activeScope=running?activeRootScope(turns,rootSessionId):null;
  const copyLabels={copy:t('flow.copy'),copied:t('flow.copied'),copyFailed:t('flow.copyFailed')};
  // Child conversations reuse the same filtering, message roles and copy rules.
  // The parent already supplies a disclosure; do not add another process shell.
  function renderNested(children,ancestors) {
    return h('div',{className:'rssh-flow-children'},transcriptEntries(children,{turns}).map(entry=>
      entry.kind==='process'?h('div',{key:entry.key,className:'rssh-process-rows'},entry.items.map(item=>render(item,{},ancestors))):render(entry.item,entry,ancestors)));
  }
  function render(item,entry={},ancestors=[]) {
    const id=acpItemId(item),fallback=built.fallbacks[id];
    const common={key:item.key||id,item,t,labels,childMap:built.map,fallbacks:built.fallbacks,sourceFallback:fallback,
      onOpenOutput:openFile,ancestors,running,turns,showProcessSummary:policy.showProcessSummary,transcriptItems:items,renderFactorySlot,renderNested};
    switch(item.type){
      case 'user': return h('article',{key:item.key,className:'rssh-message rssh-message-user','aria-label':t('flow.you')},
        h('div',{className:'rssh-user-stack'},String(item.text||'').trim()?h('div',{className:'rssh-user-bubble'},item.text):null,
          item.attachments?.length?h(SentAttachments,{item,t,
            context:!ancestors.length&&(!item.rootSessionId||item.rootSessionId===item.sessionId)?attachmentContext:null,
            phase:JSON.stringify([item.delivery,turns[transcriptScope(item)]?.startSeq,turns[transcriptScope(item)]?.endSeq,turns[transcriptScope(item)]?.status])}):null,
          ['queued','cancelled'].includes(item.delivery)?h('span',{className:'rssh-message-delivery'},t(item.delivery==='queued'?'acp.steerQueued':'acp.inputCancelled')):null,
          String(item.text||'').trim()?h('div',{className:'rssh-message-actions rssh-user-actions'},h(ui.CopyButton,{text:item.text,labels:copyLabels,iconOnly:true})):null),
        fallback?h(AcpSourceFallback,{item,fallback,t}):null);
      case 'assistant': {
        const turn=entry.turn||turns[transcriptScope(item)];
        const streaming=running&&transcriptScope(item)===activeScope&&entry.responseTail===true&&(!turn||turn.status==='running');
        const copy=responseCopyParts(item,entry);
        return h('article',{key:item.key,className:'rssh-message rssh-message-assistant','aria-label':t('flow.agent'),'data-streaming':streaming?'':undefined},
          fallback?h(AcpSourceFallback,{item,fallback,t}):null,
          h(ui.MarkdownText,{text:item.text,labels:labels.markdown}),
          h('div',{className:'rssh-message-actions rssh-assistant-actions'},
            h(ui.CopyButton,{text:copy.part,labels:{...copyLabels,copy:t('flow.copyPart')},iconOnly:true}),
            copy.turn&&!streaming?h(ui.CopyButton,{text:copy.turn,labels:{...copyLabels,copy:t('flow.copyTurn')}}):null,
            entry.responseTail&&(turn?.status==='cancelled'||turn?.status==='interrupted')?h('span',{className:'rssh-interrupted'},t(turn.status==='cancelled'?'flow.stopped':'flow.interrupted')):null));
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
    if(entry.kind!=='process')return h('div',{key:entry.key,className:'rssh-transcript-item','data-transcript-anchor':entry.key,...historyAnchorAttributes(entry),'data-flow-kind':entry.item.type},render(entry.item,entry));
    const facts=processTreeSummary(entry,built.map);
    const current=facts.runningItem;
    const live=!!(running&&entry.scope===activeScope&&!entry.settled&&current&&
      (current.type!=='thought'||thoughtIsStreaming(current,items,running)));
    const summary=[policy.showProcessSummary?(live?actionLabel(current,t):processCategorySummary(entry,t)):null,
      facts.failedCount?`${t('flow.hadFailures')} ${facts.failedCount}`:null].filter(Boolean).join(' · ');
    const presentation=processGroupPresentation(entry,policy,manual[entry.key]);
    // Keep this same parent type throughout streaming and completion. Explicit
    // reading pins the group open, so finishing never removes the focused child.
    return h('div',{key:entry.key,className:'rssh-process-group','data-transcript-anchor':entry.key,...historyAnchorAttributes(entry),'data-flow-kind':'process'},
      h(Disclosure,{className:'rssh-process-disclosure',title:t('flow.process'),summary,
        icon:h(FlowIcon,{kind:'tool'}),...presentation,
        onOpenChange:open=>setManual(previous=>({...previous,[entry.key]:{open}})),
        onRead:()=>setManual(previous=>{
          const saved=previous[entry.key],readingFlat=!!(saved?.readingFlat||presentation.flat);
          return saved?.open&&saved.readingFlat===readingFlat?previous:{...previous,[entry.key]:{open:true,readingFlat}};
        }),
        scrollRunning:!!(running&&entry.scope===activeScope&&!entry.settled),
        running:live,status:entry.settled?t(entry.interrupted?'flow.interrupted':'flow.ended'):live?t('acp.running'):undefined,
        children:()=>entry.items.map(item=>render(item))}));
  });
}

export function RunningTail({state,t}) {
  const activity=conversationActivity(state);
  if(activity.kind==='idle')return null;
  const keys={connecting:'flow.connecting',reconnecting:'flow.connection',permission:'flow.waitingPermission',question:'flow.waitingQuestion',replying:'flow.replying',thinking:'flow.thinking',working:'flow.working'};
  const label=activity.kind==='activity'?[actionLabel(activity.item,t),activity.count>1?`${activity.count} ${t('flow.runningCount')}`:null].filter(Boolean).join(' · '):t(keys[activity.kind]);
  const waiting=['permission','question'].includes(activity.kind);
  return h('div',{className:'rssh-running-tail',role:'status'},h(ui.StateDot,{state:waiting?'warning':activity.kind==='working'?'idle':'ongoing'}),h('span',null,label));
}
