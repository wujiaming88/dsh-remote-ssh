import React from 'react';
import {h,ui} from './shared.js';
import {imageAttachmentModel,createAttachmentPreview,safeImagePreviewURL} from './attachments-model.js';

function ImageGlyph() {
  return h('svg',{width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},
    h('rect',{x:3,y:3,width:18,height:18,rx:3}),h('circle',{cx:8,cy:8,r:1.5}),h('path',{d:'m4 18 5-6 4 4 3-3 4 5'}));
}
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
function RemoveAttachment({file,sending,onRemove,t}) {
  const label=`${t('acp.removeAttachment')}: ${file.name||t('acp.attachment')}`;
  return h('button',{type:'button',className:'rssh-attachment-remove',disabled:sending,'aria-label':label,title:label,onClick:()=>onRemove(file.id)},
    h('svg',{width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round','aria-hidden':true},h('path',{d:'m4 4 8 8M12 4l-8 8'})));
}
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
function FileAttachment({file,sending,onRemove,t}) {
  const name=file.name||file.path||t('acp.attachment');
  return h('li',{className:'rssh-attachment-file',title:file.path||name,'aria-label':`${t(file.path?'acp.remoteFileAttachment':'acp.fileAttachment')}: ${name}`},
    h(ui.FileTypeIcon,{path:name,size:16}),
    h('span',{className:'rssh-attachment-name',title:name},name),
    h(RemoveAttachment,{file,sending,onRemove,t}));
}
export function AttachmentList({attachments,sending,onRemove,t}) {
  if(!attachments.length)return null;
  return h('ul',{className:'rssh-attachments','aria-label':t('acp.attachments')},attachments.map(file=>
    h(file.type==='image'?ImageAttachment:FileAttachment,{key:file.id,file,sending,onRemove,t})));
}
