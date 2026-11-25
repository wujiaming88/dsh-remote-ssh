import React from 'react';
import {h,ui,NativeIcon} from './shared.js';
import {imageAttachmentModel,createAttachmentPreview,safeImagePreviewURL} from './attachments-model.js';
import {NativeAttachmentRail,NativeFileCard} from './native-attachment-view.js';
import {draftFilePresentation} from './native-attachment-model.js';

function ImageGlyph(){return h(NativeIcon,{name:'image',size:24});}
function useImagePreview(file) {
  const model=React.useMemo(()=>imageAttachmentModel(file),[file.type,file.mimeType,file.data]);
  const [resource,setResource]=React.useState(null);
  React.useEffect(()=>{
    const preview=createAttachmentPreview(model);
    setResource({model,...preview});
    return ()=>preview.dispose();
  },[model]);
  return resource?.model===model?resource:{status:'loading'};
}
// Reusable read-only viewer: callers cannot turn event metadata into an arbitrary img URL.
export function ImagePreviewModal({src,name,t,onClose,onError}) {
  const safeSource=safeImagePreviewURL(src);
  const [failedSource,setFailedSource]=React.useState(null);
  const failed=!safeSource||failedSource===safeSource;
  return h(ui.Modal,{open:true,className:'rssh-image-preview',title:name,closeLabel:t('acp.close'),onClose},
    h('div',{className:'rssh-image-preview-stage'},failed?h('p',{role:'status'},t('acp.imagePreviewUnavailable')):
      h('img',{src:safeSource,alt:name,decoding:'async',draggable:false,onError:()=>{setFailedSource(safeSource);onError?.();}})));
}
// COPY: ComposerAttachments.tsx:95–153. Remote images remain local-only until
// Send, so only image decode status is adapted; no invented upload percentage.
function ImageAttachment({file,sending,onRemove,t}) {
  const preview=useImagePreview(file),[opened,setOpened]=React.useState(false);
  const [loadedURL,setLoadedURL]=React.useState(null),[failedURL,setFailedURL]=React.useState(null);
  const url=preview.status==='ready'?preview.url:null;
  const failed=preview.status==='unavailable'||!!url&&failedURL===url;
  const loaded=!!url&&loadedURL===url&&!failed;
  const name=file.name||t('acp.imageAttachment');
  const feedback=t(failed?'acp.imagePreviewUnavailable':'acp.imagePreviewLoading');
  const description=failed?`${feedback}. ${t('acp.imageAttachmentRetained')}`:feedback;
  const removeLabel=`${t('acp.removeAttachment')}: ${name}`;
  return h('div',{className:'rssh-native-draft-imageItem'},
    h('button',{type:'button',className:'rssh-native-draft-thumbnail',disabled:!loaded,
      'aria-label':`${loaded?t('acp.previewImage'):description}: ${name}`,title:loaded?`${t('acp.previewImage')}: ${name}`:description,
      onClick:()=>setOpened(true)},
      !loaded?h('span',{className:'rssh-attachment-placeholder','data-failed':failed?'':undefined,'aria-hidden':true},h(ImageGlyph)):null,
      url&&!failed?h('img',{src:url,alt:name,decoding:'async',draggable:false,'data-loaded':loaded?'':undefined,
        onLoad:()=>setLoadedURL(url),onError:()=>setFailedURL(url)}):null),
    h('button',{type:'button',className:'rssh-native-draft-remove',disabled:sending,'aria-label':removeLabel,title:removeLabel,
      onClick:()=>onRemove(file.id)},h(NativeIcon,{name:'attachment-remove',size:12})),
    opened?h(ImagePreviewModal,{src:url,name,t,onClose:()=>setOpened(false),onError:()=>setFailedURL(url)}):null);
}
function FileAttachment({file,upload,sending,onRemove,t}) {
  const view=draftFilePresentation(file,upload,t);
  return h(NativeFileCard,{...view,disabled:sending,
    labels:{label:`${t(file.path?'acp.remoteFileAttachment':'acp.fileAttachment')}: ${view.name}`,
      remove:`${t('acp.removeAttachment')}: ${view.name}`},
    // Retain upload-on-Send/retry/ACK ownership in ComposerSession.
    onRemove:()=>onRemove(file.id)});
}
export function AttachmentList({attachments,uploads={},sending,onRemove,t}) {
  if(!attachments.length)return null;
  return h('div',{className:'rssh-native-draft-rail'},
    h(NativeAttachmentRail,{items:attachments,
      labels:{group:t('acp.attachments'),scrollLeft:t('acp.attachmentsScrollLeft'),scrollRight:t('acp.attachmentsScrollRight')},
      renderItem:file=>h(file.type==='image'?ImageAttachment:FileAttachment,
        {key:file.id,file,upload:uploads[file.uploadId],sending,onRemove,t})}));
}
