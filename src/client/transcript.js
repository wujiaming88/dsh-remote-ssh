import React from 'react';
import {h,ui} from './shared.js';
import {acpBuildChildMap,acpItemId} from './presentation.js';
import {transcriptEntries,transcriptScope,transcriptPolicy,processGroupOpen,responseHidden} from './transcript-model.js';
import {ownedDisclosure as Disclosure,FlowIcon} from './disclosure.js';
import {AcpToolCard,AcpSubagentCard,AcpPlanCard,AcpStateCard,AcpSessionMessageCard,AcpTerminalEventCard,AcpNativeEventCard,AcpCompactionCard,AcpNoticeCard,AcpSourceFallback} from './cards.js';
import {AcpThought} from './thought.js';
import {thoughtIsStreaming} from './thought-model.js';

export const messages={
  zh:{'flow.you':'你的消息','flow.agent':'Agent 回复','flow.copy':'复制','flow.copied':'已复制','flow.copyFailed':'复制失败，请选中文字手动复制。',
    'flow.process':'思考过程','flow.processCount':'项过程记录','flow.stopped':'已停止','flow.interrupted':'已中断',
    'flow.latest':'回到最新消息','flow.replying':'正在生成回复','flow.waitingPermission':'等待权限确认','flow.waitingQuestion':'等待你的回答',
    'flow.working':'正在处理','flow.connection':'正在恢复连接','flow.source':'来源未关联'},
  en:{'flow.you':'Your message','flow.agent':'Agent response','flow.copy':'Copy','flow.copied':'Copied','flow.copyFailed':'Copy failed. Select the text and copy manually.',
    'flow.process':'Process','flow.processCount':'process items','flow.stopped':'Stopped','flow.interrupted':'Interrupted',
    'flow.latest':'Jump to latest','flow.replying':'Generating a response','flow.waitingPermission':'Awaiting permission','flow.waitingQuestion':'Awaiting your answer',
    'flow.working':'Working','flow.connection':'Reconnecting','flow.source':'Unlinked source'},
};

export function Transcript({items,running,turns={},preferences,t,labels,openFile,renderFactorySlot,rootSessionId}) {
  const [manual,setManual]=React.useState({});
  const policy=transcriptPolicy(preferences,'dshDesktop' in globalThis?'standard':'detailed');
  React.useEffect(()=>setManual({}),[policy.mode,policy.collapseTiming,policy.foldedReplies]);
  const built=acpBuildChildMap(items);
  const top=items.filter(item=>!built.parents[acpItemId(item)]);
  const entries=transcriptEntries(top,{turns});
  const active=Object.entries(turns).filter(([scope,turn])=>turn.status==='running'&&(!rootSessionId||JSON.parse(scope)[0]===rootSessionId))
    .sort((a,b)=>(b[1].startSeq||0)-(a[1].startSeq||0))[0]?.[0];
  const activeScope=running?(active||transcriptScope([...top].reverse().find(item=>item.type!=='user'||item.delivery!=='queued'))):null;
  const copyLabels={copy:t('flow.copy'),copied:t('flow.copied'),copyFailed:t('flow.copyFailed')};
  const groupOpen=entry=>processGroupOpen(entry,policy,manual[entry.key]);
  const foldedScopes=new Set(entries.filter(entry=>entry.kind==='process'&&!groupOpen(entry)).map(entry=>entry.scope));
  function render(item,entry={}) {
    const id=acpItemId(item),fallback=built.fallbacks[id];
    const common={key:item.key||id,item,t,labels,childMap:built.map,fallbacks:built.fallbacks,sourceFallback:fallback,
      onOpenOutput:openFile,ancestors:[],running,showProcessSummary:policy.showProcessSummary,transcriptItems:items,renderFactorySlot};
    switch(item.type){
      case 'user': return h('article',{key:item.key,className:'rssh-message rssh-message-user','aria-label':t('flow.you')},
        h('div',{className:'rssh-user-stack'},h('div',{className:'rssh-user-bubble'},item.text),
          item.attachments?.length?h('div',{className:'rssh-message-attachments'},item.attachments.map((file,index)=>h('span',{key:index,className:'rssh-message-attachment'},file.name||file.type))):null,
          ['queued','cancelled'].includes(item.delivery)?h('span',{className:'rssh-message-delivery'},t(item.delivery==='queued'?'acp.steerQueued':'acp.inputCancelled')):null,
          h('div',{className:'rssh-message-actions rssh-user-actions'},h(ui.CopyButton,{text:item.text||'',labels:copyLabels,iconOnly:true}))),
        fallback?h(AcpSourceFallback,{item,fallback,t}):null);
      case 'assistant': {
        const scope=transcriptScope(item),streaming=running&&scope===activeScope&&(!entry.turn||entry.turn.status==='running');
        return h('article',{key:item.key,className:'rssh-message rssh-message-assistant','aria-label':t('flow.agent'),'data-streaming':streaming?'':undefined},
          fallback?h(AcpSourceFallback,{item,fallback,t}):null,
          h(ui.MarkdownText,{text:item.text,labels:labels.markdown}),
          entry.responseTail&&!streaming?h('div',{className:'rssh-message-actions rssh-assistant-actions'},
            h(ui.CopyButton,{text:entry.responseText||item.text,labels:copyLabels,iconOnly:true}),
            entry.turn?.status==='cancelled'||entry.turn?.status==='interrupted'?h('span',{className:'rssh-interrupted'},t(entry.turn.status==='cancelled'?'flow.stopped':'flow.interrupted')):null):null);
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
      default: return h('div',{key:item.key,className:item.type==='error'?'ra-acp-error':'ra-acp-system',role:item.type==='error'?'alert':undefined},
        fallback?h(AcpSourceFallback,{item,fallback,t}):null,
        item.type==='system'&&item.stopReason==='cancelled'?t('flow.stopped'):item.text);
    }
  }
  return entries.map(entry=>entry.kind==='process'
    ?h('div',{key:entry.key,className:'rssh-process-group','data-transcript-anchor':entry.key,'data-flow-kind':'process'},
      policy.stepGrouping==='none'||policy.stepGrouping==='history'&&!entry.settled
      ?h('div',{className:'rssh-process-rows'},entry.items.map(item=>render(item)))
      :h(Disclosure,{title:t('flow.process'),summary:policy.showProcessSummary?`${entry.items.length} ${t('flow.processCount')}`:undefined,
        icon:h(FlowIcon,{kind:'state'}),open:groupOpen(entry),onOpenChange:open=>setManual(previous=>({...previous,[entry.key]:open})),
        running:running&&entry.scope===activeScope&&!entry.settled,children:()=>entry.items.map(item=>render(item))}))
    :h('div',{key:entry.key,className:'rssh-transcript-item','data-transcript-anchor':entry.key,'data-flow-kind':entry.item.type,
      hidden:responseHidden(entry,policy,foldedScopes)},render(entry.item,entry)));
}

export function RunningTail({state,t}) {
  const waiting=state.permissions.length||state.elicitations.length;
  if(!state.running&&!waiting&&state.connected)return null;
  const last=[...state.items].reverse().find(item=>item.type==='assistant'||item.type==='thought'||item.type==='tool');
  const label=!state.connected?t('flow.connection'):state.permissions.length?t('flow.waitingPermission'):
    state.elicitations.length?t('flow.waitingQuestion'):last?.type==='assistant'?t('flow.replying'):t('flow.working');
  return h('div',{className:'rssh-running-tail',role:'status'},h(ui.StateDot,{state:waiting?'warning':'ongoing'}),h('span',null,label));
}
