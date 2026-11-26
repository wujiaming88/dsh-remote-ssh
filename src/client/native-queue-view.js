// COPY/ADAPT: DSH 0.2.2-rc.5 ui-conversation QueueDock.tsx:100–195,
// 210–234,283–299 (MIT). Props-only remote snapshot; only atomic Remove is exposed.
import React from 'react';
import {h,NativeIcon} from './shared.js';
import {queueRows,queuePresentation,queueAttachment} from './native-queue-model.js';

function QueueAttachment({file,t}) {
  const view=queueAttachment(file),name=view.name||t(view.image?'acp.imageAttachment':'acp.fileAttachment');
  return h('span',{className:'rssh-native-queue-file',title:view.image?`${name} · ${t('acp.queueImageMetadata')}`:name},
    h('span',{className:'rssh-native-queue-fileIcon','aria-hidden':true},h(NativeIcon,{name:view.image?'image':'file',size:16})),
    h('span',{className:'rssh-native-queue-fileName'},name),
    view.size?h('span',{className:'rssh-native-queue-fileSize'},view.size):null);
}
export function NativeQueueView({items=[],disabled=false,onRemove,t}) {
  const rows=queueRows(items),[collapsed,setCollapsed]=React.useState(true),[busy,setBusy]=React.useState(null),[error,setError]=React.useState('');
  const listId=React.useId(),active=React.useRef(false),inFlight=React.useRef(false);
  React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  React.useEffect(()=>{if(!rows.length){setCollapsed(true);setError('');}},[rows.length]);
  const view=queuePresentation(rows.length,collapsed,busy);
  async function remove(requestId) {
    if(disabled||inFlight.current)return;
    inFlight.current=true;setBusy(requestId);setError('');
    try {await onRemove(requestId);} catch {if(active.current)setError(t('acp.queueRemoveFailed'));}
    finally {inFlight.current=false;if(active.current)setBusy(null);}
  }
  if(!view.visible)return null;
  return h('div',{className:'rssh-native-queue-dock','data-queue-dock':''},
    h('div',{className:'rssh-native-queue-panel'},
      view.header?h('button',{type:'button',className:'rssh-native-queue-header','aria-controls':listId,'aria-expanded':view.expanded,disabled:!!busy,onClick:()=>setCollapsed(value=>!value)},
        h('span',{className:'rssh-native-queue-lead'},h(NativeIcon,{name:'queue',size:14})),
        h('span',{className:'rssh-native-queue-count'},`${t('acp.queueMessages')} · ${rows.length}`),
        h('span',{className:'rssh-native-queue-chevron','aria-hidden':true},h(NativeIcon,{name:view.expanded?'chevron-down':'chevron-up',size:14}))):null,
      h('ul',{id:listId,className:'rssh-native-queue-list',hidden:!view.listVisible,'aria-label':t('acp.queueMessages')},view.listVisible?rows.map(row=>
        h('li',{key:row.requestId,className:'rssh-native-queue-row','aria-busy':busy===row.requestId},
          rows.length===1?h('span',{className:'rssh-native-queue-lead'},h(NativeIcon,{name:'queue',size:14})):null,
          Array.isArray(row.attachments)&&row.attachments.length?h('span',{className:'rssh-native-queue-attachments'},row.attachments.map((file,index)=>h(QueueAttachment,{key:index,file,t}))):null,
          h('span',{className:'rssh-native-queue-preview',title:row.textTruncated?t('acp.queueTruncated'):undefined},String(row.text||'').replace(/\s+/g,' ').trim()),
          row.textTruncated?h('span',{className:'rssh-native-queue-status',title:t('acp.queueTruncated'),'aria-label':t('acp.queueTruncated')},'…'):null,
          h('div',{className:'rssh-native-queue-actions'},
            h('button',{type:'button',className:'rssh-native-queue-action',disabled:disabled||!!busy,'aria-label':t('acp.queueRemove'),title:t(busy===row.requestId?'acp.queueRemoving':'acp.queueRemove'),onClick:()=>remove(row.requestId)},h(NativeIcon,{name:'trash',size:14}))))):null),
      error?h('div',{className:'rssh-native-queue-error',role:'alert'},error):null));
}
