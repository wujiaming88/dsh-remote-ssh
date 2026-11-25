import React from 'react';
import {h,ui,NativeIcon} from './shared.js';
import {imageAttachmentModel,createAttachmentPreview,safeImagePreviewURL} from './attachments-model.js';

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
function RemoveAttachment({file,sending,onRemove,t}) { const label=`${t('acp.removeAttachment')}: ${file.name||t('acp.attachment')}`; return h('button',{type:'button',className:'rssh-attachment-remove',disabled:sending,'aria-label':label,title:label,onClick:()=>onRemove(file.id)},h(NativeIcon,{name:'close',size:14})); }
function ImageAttachment({file,sending,onRemove,t}) {
  const preview=useImagePreview(file),[opened,setOpened]=React.useState(false);
  const [loadedURL,setLoadedURL]=React.useState(null),[failedURL,setFailedURL]=React.useState(null);
  const url=preview.status==='ready'?preview.url:null;
  const failed=preview.status==='unavailable'||!!url&&failedURL===url;
  const loaded=!!url&&loadedURL===url&&!failed;
  const name=file.name||t('acp.imageAttachment');
  const feedback=t(failed?'acp.imagePreviewUnavailable':'acp.imagePreviewLoading');
  return h('li',{className:'rssh-attachment'},
    h('button',{type:'button',className:'rssh-attachment-thumbnail',disabled:!loaded,
      'aria-label':`${loaded?t('acp.previewImage'):feedback}: ${name}`,title:loaded?`${t('acp.previewImage')}: ${name}`:feedback,
      onClick:()=>setOpened(true)},
      !loaded?h('span',{className:'rssh-attachment-placeholder','data-failed':failed?'':undefined},h(ImageGlyph),h('span',null,feedback)):null,
      url&&!failed?h('img',{src:url,alt:name,decoding:'async',draggable:false,'data-loaded':loaded?'':undefined,
        onLoad:()=>setLoadedURL(url),onError:()=>setFailedURL(url)}):null),
    h('div',{className:'rssh-attachment-caption'},h('span',{className:'rssh-attachment-name',title:name},name),h(RemoveAttachment,{file,sending,onRemove,t})),
    failed?h('span',{className:'rssh-attachment-note'},t('acp.imageAttachmentRetained')):null,
    opened?h(ImagePreviewModal,{src:url,name,t,onClose:()=>setOpened(false),onError:()=>setFailedURL(url)}):null);
}
function FileAttachment({file,upload,sending,onRemove,t}) {
  const name=file.name||file.path||t('acp.attachment');
  const status=file.type==='file_upload'?(upload?.status||'pending'):null;
  const feedback=status?t(status==='uploading'?'acp.fileUploadUploading':status==='uploaded'?'acp.fileUploadUploaded':status==='failed'?'acp.fileUploadFailed':'acp.fileUploadPending'):null;
  const detail=status==='uploaded'&&upload?.remotePath?`${feedback}: ${upload.remotePath}`:feedback;
  return h('li',{className:'rssh-attachment-file',title:file.path||name,'aria-label':`${t(file.path?'acp.remoteFileAttachment':'acp.fileAttachment')}: ${name}`},
    h(ui.FileTypeIcon,{path:name,size:16}),
    h('div',{className:'rssh-attachment-file-body'},
      h('span',{className:'rssh-attachment-name',title:name},name),
      status?h('span',{className:'rssh-attachment-upload-status','data-status':status,role:'status',title:detail},
        h(ui.StateDot,{state:status==='uploading'?'ongoing':status==='uploaded'?'done':status==='failed'?'warning':'idle',size:10}),
        h('span',null,detail)):null),
    h(RemoveAttachment,{file,sending,onRemove,t}));
}
export function AttachmentList({attachments,uploads={},sending,onRemove,t}) {
  if(!attachments.length)return null;
  return h(React.Fragment,null,
    h('ul',{className:'rssh-attachments','aria-label':t('acp.attachments')},attachments.map(file=>
      h(file.type==='image'?ImageAttachment:FileAttachment,{key:file.id,file,upload:uploads[file.uploadId],sending,onRemove,t}))),
    attachments.some(file=>file.type==='file_upload')?h('p',{className:'rssh-attachment-upload-hint'},t('acp.fileUploadHint')):null);
}
