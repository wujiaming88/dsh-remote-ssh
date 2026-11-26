// COPY/ADAPT: DSH 0.2.2-rc.5 ui-conversation QueueDock.tsx:100–195,
// 210–234,283–299 (MIT). Props-only remote snapshot; atomic edit/remove/promote.
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
export function NativeQueueView({items=[],disabled=false,canSendNow=false,onRemove,onEdit,onSendNow,t}) {
  const rows=queueRows(items),[collapsed,setCollapsed]=React.useState(true),[busy,setBusy]=React.useState(null);
  const [busyKind,setBusyKind]=React.useState(null),[error,setError]=React.useState('');
  const [editing,setEditing]=React.useState(null);
  const listId=React.useId(),active=React.useRef(false),inFlight=React.useRef(false);
  React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  React.useEffect(()=>{if(!rows.length){setCollapsed(true);setError('');setEditing(null);}},[rows.length]);
  React.useEffect(()=>{if(editing&&!rows.some(row=>row.requestId===editing.requestId))setEditing(null);},[editing,rows]);
  const view=queuePresentation(rows.length,collapsed,busy);
  async function run(requestId,kind,work,failureKey) {
    if(disabled||inFlight.current)return false;
    inFlight.current=true;setBusy(requestId);setBusyKind(kind);setError('');
    try {await work();return true;}
    catch {if(active.current)setError(t(failureKey));return false;}
    finally {inFlight.current=false;if(active.current){setBusy(null);setBusyKind(null);}}
  }
  function remove(requestId) { return run(requestId,'remove',()=>onRemove(requestId),'acp.queueRemoveFailed'); }
  function promote(requestId) { return run(requestId,'promote',()=>onSendNow(requestId),'acp.queueSendNowFailed'); }
  async function save() {
    if(!editing||!editing.text.trim())return;
    const requestId=editing.requestId,text=editing.text;
    if(await run(requestId,'edit',()=>onEdit(requestId,text),'acp.queueEditFailed')&&active.current)setEditing(null);
  }
  if(!view.visible)return null;
  return h('div',{className:'rssh-native-queue-dock','data-queue-dock':''},
    h('div',{className:'rssh-native-queue-panel'},
      view.header?h('button',{type:'button',className:'rssh-native-queue-header','aria-controls':listId,'aria-expanded':view.expanded,disabled:!!busy,onClick:()=>setCollapsed(value=>!value)},
        h('span',{className:'rssh-native-queue-lead'},h(NativeIcon,{name:'queue',size:14})),
        h('span',{className:'rssh-native-queue-count'},`${t('acp.queueMessages')} · ${rows.length}`),
        h('span',{className:'rssh-native-queue-chevron','aria-hidden':true},h(NativeIcon,{name:view.expanded?'chevron-down':'chevron-up',size:14}))):null,
      h('ul',{id:listId,className:'rssh-native-queue-list',hidden:!view.listVisible,'aria-label':t('acp.queueMessages')},view.listVisible?rows.map(row=>{
        const rowEditing=editing?.requestId===row.requestId;
        return h('li',{key:row.requestId,className:'rssh-native-queue-row','data-editing':rowEditing?'':undefined,'aria-busy':busy===row.requestId},
          rows.length===1?h('span',{className:'rssh-native-queue-lead'},h(NativeIcon,{name:'queue',size:14})):null,
          Array.isArray(row.attachments)&&row.attachments.length?h('span',{className:'rssh-native-queue-attachments'},row.attachments.map((file,index)=>h(QueueAttachment,{key:index,file,t}))):null,
          rowEditing?h('div',{className:'rssh-native-queue-editor'},
            h('textarea',{className:'rssh-native-queue-editor-input',value:editing.text,rows:2,autoFocus:true,
              'aria-label':t('acp.queueEdit'),disabled:disabled||!!busy,
              onChange:event=>setEditing(current=>current&&current.requestId===row.requestId?{...current,text:event.target.value}:current),
              onKeyDown:event=>{
                if(event.key==='Escape'){event.preventDefault();if(!busy)setEditing(null);return;}
                if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();void save();}
              }}),
            h('div',{className:'rssh-native-queue-actions'},
              h('button',{type:'button',className:'rssh-native-queue-action rssh-native-queue-save',disabled:disabled||!!busy||!editing.text.trim(),
                title:t(busyKind==='edit'?'acp.queueSaving':'acp.queueSave'),'aria-label':t(busyKind==='edit'?'acp.queueSaving':'acp.queueSave'),onClick:()=>void save()},h(NativeIcon,{name:'check',size:14})),
              h('button',{type:'button',className:'rssh-native-queue-action',disabled:!!busy,title:t('acp.queueCancelEdit'),'aria-label':t('acp.queueCancelEdit'),onClick:()=>setEditing(null)},h(NativeIcon,{name:'close',size:14})))):
          h('span',{className:'rssh-native-queue-preview',title:row.textTruncated?t('acp.queueTruncated'):undefined},String(row.text||'').replace(/\s+/g,' ').trim()),
          !rowEditing&&row.textTruncated?h('span',{className:'rssh-native-queue-status',title:t('acp.queueTruncated'),'aria-label':t('acp.queueTruncated')},'…'):null,
          rowEditing?null:h('div',{className:'rssh-native-queue-actions'},
            onEdit?h('button',{type:'button',className:'rssh-native-queue-action',disabled:disabled||!!busy||row.textTruncated,
              title:t(row.textTruncated?'acp.queueEditTruncatedUnsupported':'acp.queueEdit'),'aria-label':t(row.textTruncated?'acp.queueEditTruncatedUnsupported':'acp.queueEdit'),
              onClick:()=>{if(row.textTruncated)return;setError('');setEditing({requestId:row.requestId,text:String(row.text||'')});}},h(NativeIcon,{name:'edit',size:14})):null,
            h('button',{type:'button',className:'rssh-native-queue-action',disabled:disabled||!!busy,title:t(busy===row.requestId&&busyKind==='remove'?'acp.queueRemoving':'acp.queueRemove'),'aria-label':t('acp.queueRemove'),onClick:()=>void remove(row.requestId)},h(NativeIcon,{name:'trash',size:14})),
            onSendNow?h('button',{type:'button',className:'rssh-native-queue-action',disabled:disabled||!!busy||!canSendNow,
              title:t(canSendNow?(busy===row.requestId&&busyKind==='promote'?'acp.queueSendingNow':'acp.queueSendNow'):'acp.queueSendNowUnsupported'),
              'aria-label':t(canSendNow?'acp.queueSendNow':'acp.queueSendNowUnsupported'),
              onClick:()=>void promote(row.requestId)},h(NativeIcon,{name:'upload',size:14})):null));
      }):null),
      error?h('div',{className:'rssh-native-queue-error',role:'alert'},error):null));
}
