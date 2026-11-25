import React from 'react';
import {h,ui,api} from './shared.js';
import {ImagePreviewModal} from './attachments.js';
import {isSentImage,sentAttachmentKey,sentImagePresentation,sentAttachmentName,shouldLoadSentAttachments} from './sent-attachments-model.js';

function SentImage({name,presentation,t}) {
  const [open,setOpen]=React.useState(false),[failed,setFailed]=React.useState(false),[ready,setReady]=React.useState(false),[attempt,setAttempt]=React.useState(0);
  const src=presentation.src;
  const status=failed?'unavailable':presentation.status;
  const label=status==='pending'?t('acp.sentImagePending'):status==='unavailable'?t('acp.sentImageUnavailable'):t('acp.imagePreviewLoading');
  const retry=()=>{setFailed(false);setReady(false);setAttempt(value=>value+1);};
  return h('figure',{className:'rssh-sent-image'},
    h('button',{type:'button',className:'rssh-sent-image-button',disabled:!src,'data-failed':failed?'':undefined,
      'aria-label':`${failed?t('acp.retryImagePreview'):src?t('acp.previewImage'):label}: ${name}`,title:name,onClick:()=>failed?retry():setOpen(true)},
      src&&!failed?h('img',{key:attempt,src,alt:name,loading:'lazy',decoding:'async',onLoad:()=>setReady(true),onError:()=>setFailed(true)}):h('span',{className:'rssh-sent-image-placeholder'},label,failed?h('span',{className:'rssh-sent-image-retry'},t('acp.retryImagePreview')):null),
      src&&!failed&&!ready?h('span',{className:'rssh-sent-image-loading'},t('acp.imagePreviewLoading')):null),
    h('figcaption',{title:name},name),
    open&&src?h(ImagePreviewModal,{src,name,t,onClose:()=>setOpen(false),onError:()=>setFailed(true)}):null);
}
export function SentAttachments({item,context,phase,t}) {
  const files=item.attachments||[],hasImages=files.some(isSentImage),key=sentAttachmentKey(context,item.turnId);
  const [loaded,setLoaded]=React.useState(null),[attempt,setAttempt]=React.useState(0);
  const previousAttempt=React.useRef(0);
  React.useEffect(()=>{
    if(!hasImages||!shouldLoadSentAttachments(key,loaded,previousAttempt.current,attempt))return;
    previousAttempt.current=attempt;
    let live=true;const controller=new AbortController();
    api('messageAttachments',{id:context.id,dshSessionId:context.dshSessionId,turnId:item.turnId},controller.signal).then(response=>{
      if(live)setLoaded({key,response});
    });
    return ()=>{live=false;controller.abort();};
    // Lifecycle changes retry pending admission; token deltas never poll metadata.
    // Once available, keep the same images/modal mounted through completion.
  },[key,hasImages,phase,attempt]);
  if(!files.length)return null;
  const response=loaded?.key===key?loaded.response:null;
  const retryable=hasImages&&key&&response&&(response.ok!==true||['unavailable','pending'].includes(response.status));
  return h('div',{className:'rssh-sent-attachments','aria-label':t('acp.sentAttachments')},
    h('div',{className:'rssh-sent-attachment-list'},files.map((file,index)=>{
      const name=sentAttachmentName(file,index,t);
      return isSentImage(file)?h(SentImage,{key:JSON.stringify([key,index]),name,t,presentation:sentImagePresentation(file,index,response,context,item.turnId)}):
        h('span',{key:index,className:'rssh-message-attachment',title:typeof file.remotePath==='string'?`${name}\n${file.remotePath}`:name},name);
    })),
    retryable?h(ui.Button,{variant:'ghost',size:'sm',onClick:()=>setAttempt(value=>value+1)},t('acp.retryImagePreview')):null);
}
