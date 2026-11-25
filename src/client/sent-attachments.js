import React from 'react';
import {h,ui,api} from './shared.js';
import {ImagePreviewModal} from './attachments.js';
import {NativeMessageImage,NativeSentFile} from './native-attachment-view.js';
import {singleImageFit,attachmentFileMeta} from './native-attachment-model.js';
import {isSentImage,sentAttachmentKey,sentImagePresentation,sentAttachmentName,shouldLoadSentAttachments} from './sent-attachments-model.js';

// MessageImage's display data is adapted from the existing authorized remote
// route. Lifecycle retries never change attachment identity or request scope.
function SentImage({name,presentation,variant,t}) {
  const [open,setOpen]=React.useState(false),[failed,setFailed]=React.useState(false),[ready,setReady]=React.useState(false),[attempt,setAttempt]=React.useState(0);
  const [dimensions,setDimensions]=React.useState(null);
  const src=presentation.src;
  const status=failed?'unavailable':presentation.status;
  const label=failed?t('acp.retryImagePreview'):status==='pending'?t('acp.sentImagePending'):status==='unavailable'?t('acp.sentImageUnavailable'):ready?t('acp.previewImage'):t('acp.imagePreviewLoading');
  const retry=()=>{setFailed(false);setReady(false);setAttempt(value=>value+1);};
  return h(React.Fragment,null,
    h(NativeMessageImage,{key:attempt,src,name,variant,fit:variant==='single'?singleImageFit(dimensions):undefined,failed,ready,label,
      onOpen:()=>setOpen(true),onRetry:retry,onError:()=>setFailed(true),
      onLoad:event=>{setReady(true);setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});}}),
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
  // COPY: UserContent.tsx:24–45 attachmentRow, including compactness by ALL
  // attachments, not just image count. No sent filename captions outside cards.
  return h('div',{className:'rssh-sent-attachments','aria-label':t('acp.sentAttachments')},
    h('div',{className:'rssh-native-sent-attachmentRow','data-message-attachments':''},files.map((file,index)=>{
      const name=sentAttachmentName(file,index,t);
      return isSentImage(file)?h('div',{key:JSON.stringify([key,index]),className:'rssh-native-image-gallery','data-align':'end'},
        h(SentImage,{name,t,variant:files.length>1?'tile':'single',presentation:sentImagePresentation(file,index,response,context,item.turnId)})):
        h(NativeSentFile,{key:index,name,meta:attachmentFileMeta(name,file.size??file.bytes),
          title:typeof file.remotePath==='string'?`${name}\n${file.remotePath}`:name});
    })),
    retryable?h(ui.Button,{variant:'ghost',size:'sm',onClick:()=>setAttempt(value=>value+1)},t('acp.retryImagePreview')):null);
}
