// COPY: DSH 0.2.2-rc.5 dsh-client-ui-attachment/src/AttachmentRail.tsx,
// FileCard.tsx and MessageImage.tsx; dsh-client-ui-chat/src/client/chat/
// UserContent.tsx:34–43. See paired CSS for the unabridged source rules.
// ADAPT: props-only remote data and callbacks; no upload/cache/Host services.
import React from 'react';
import {h,ui,NativeIcon} from './shared.js';
import {attachmentRailEdges,attachmentWheelDelta,attachmentPageDelta} from './native-attachment-model.js';

export function NativeAttachmentRail({items,labels,renderItem}) {
  const railRef=React.useRef(null),countRef=React.useRef(null);
  const [edges,setEdges]=React.useState({left:false,right:false});
  const updateEdges=React.useCallback(()=>{
    const el=railRef.current;if(!el)return;
    const next=attachmentRailEdges(el);
    setEdges(previous=>previous.left===next.left&&previous.right===next.right?previous:next);
  },[]);
  React.useLayoutEffect(()=>{
    const grew=countRef.current!==null&&items.length>countRef.current;
    countRef.current=items.length;
    const el=railRef.current;if(!el)return;
    if(grew)el.scrollLeft=el.scrollWidth-el.clientWidth;
    updateEdges();
  },[items.length,updateEdges]);
  React.useEffect(()=>{
    const el=railRef.current;if(!el)return;
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(updateEdges):null;
    observer?.observe(el);
    const onWheel=event=>{
      const left=attachmentWheelDelta(event,el.clientWidth);if(left===null)return;
      event.preventDefault();el.scrollBy({left,behavior:'auto'});
    };
    el.addEventListener('wheel',onWheel,{passive:false});
    return ()=>{observer?.disconnect();el.removeEventListener('wheel',onWheel);};
  },[updateEdges]);
  const page=direction=>{
    const el=railRef.current;if(!el)return;
    el.scrollBy({left:attachmentPageDelta(direction,el.clientWidth),
      behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  return h('div',{className:'rssh-native-rail-root'},
    edges.left?h('button',{type:'button',className:'rssh-native-rail-arrow rssh-native-rail-arrowLeft',
      'aria-label':labels.scrollLeft,onClick:()=>page(-1)},h(NativeIcon,{name:'chevron-left'})):null,
    h('div',{ref:railRef,className:'rssh-native-rail-rail',role:'group','aria-label':labels.group,onScroll:updateEdges},
      items.map(item=>h('div',{key:item.id,className:'rssh-native-rail-item'},renderItem(item)))),
    edges.right?h('button',{type:'button',className:'rssh-native-rail-arrow rssh-native-rail-arrowRight',
      'aria-label':labels.scrollRight,onClick:()=>page(1)},h(NativeIcon,{name:'chevron-right'})):null);
}

export function NativeFileCard({name,state,meta,title,labels,disabled,onRemove,onRetry,progress}) {
  const failed=state==='error';
  const contents=[h('span',{key:'name',className:'rssh-native-file-name'},name),
    h('span',{key:'meta',className:'rssh-native-file-meta'+(failed?' rssh-native-file-metaFailed':''),role:state==='ready'?undefined:'status'},meta)];
  return h('div',{className:'rssh-native-file-card'+(failed?' rssh-native-file-failed':''),title:title||name},
    h('span',{className:'rssh-native-file-icon','aria-hidden':true},
      state==='uploading'?h('span',{className:'rssh-native-file-spinner'}):h(ui.FileTypeIcon,{path:name,size:28})),
    // Remote uploads retry only via Send; never expose a new per-file upload action.
    failed&&onRetry?h('button',{type:'button',className:'rssh-native-file-body rssh-native-file-retry',
      'aria-label':labels.retry,disabled,onClick:onRetry},contents):
      h('span',{className:'rssh-native-file-body','aria-label':labels.label},contents),
    onRemove?h('button',{type:'button',className:'rssh-native-file-remove'+(failed?' rssh-native-file-removeFailed':''),
      'aria-label':labels.remove,title:labels.remove,disabled,onClick:onRemove},h(NativeIcon,{name:'attachment-remove',size:12})):null,
    state==='uploading'?h('span',{className:'rssh-native-file-progressTrack','aria-hidden':true},
      h('span',{className:'rssh-native-file-progressBar',style:progress===undefined?undefined:{width:`${Math.min(1,Math.max(0,progress))*100}%`}})):null);
}

export function NativeSentFile({name,meta,title}) {
  return h('span',{className:'rssh-native-sent-fileCard',title:title||name},
    h(ui.FileTypeIcon,{path:name,size:28,className:'rssh-native-sent-fileIcon'}),
    h('span',{className:'rssh-native-sent-fileContent'},
      h('span',{className:'rssh-native-sent-fileName'},name),
      h('span',{className:'rssh-native-sent-fileMeta'},meta)));
}

export function NativeMessageImage({src,name,variant,fit,failed,ready,label,onOpen,onRetry,onLoad,onError}) {
  if(failed)return h('button',{type:'button',className:'rssh-native-image-error','data-variant':variant,
    title:label,'aria-label':`${label}: ${name}`,onClick:onRetry},label);
  return h('button',{type:'button',className:'rssh-native-image-frame','data-variant':variant,
    style:fit?{width:fit.width,aspectRatio:`${fit.width} / ${fit.height}`}:undefined,title:label,'aria-label':`${label}: ${name}`,
    'aria-busy':!ready||undefined,disabled:!src,onClick:onOpen},
    src?h('img',{src,alt:name,loading:'lazy',decoding:'async',draggable:false,
      style:fit?{objectPosition:fit.objectPosition}:undefined,onLoad,onError}):
      h('span',{className:'rssh-native-image-loading'},label));
}
