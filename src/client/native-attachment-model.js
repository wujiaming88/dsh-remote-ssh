// COPY: AttachmentRail.tsx geometry (DSH 0.2.2-rc.5); extracted for pure tests.
export function attachmentRailEdges({scrollLeft, scrollWidth, clientWidth}) {
  return {left: scrollLeft > 1, right: scrollLeft < scrollWidth - clientWidth - 1};
}
export function attachmentWheelDelta({deltaX, deltaY, deltaMode}, clientWidth) {
  if (deltaY === 0) return null;
  const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? clientWidth : 1;
  return deltaX !== 0 ? deltaX * scale : Math.sign(deltaY) * Math.min(Math.abs(deltaY) * scale, 60);
}
export function attachmentPageDelta(direction, clientWidth) {
  return direction * Math.max(clientWidth - 64, 200);
}
// COPY: MessageImage.tsx singleFit, with absent/invalid remote dimensions using
// the original preview fallback. Never invent a natural size or upscale it.
export function singleImageFit(dimensions) {
  if (!Number.isFinite(dimensions?.width) || !Number.isFinite(dimensions?.height) || dimensions.width <= 0 || dimensions.height <= 0)
    return {width: 240, height: 240, objectPosition: 'center'};
  const natural = dimensions.width / dimensions.height;
  const ratio = Math.min(4, Math.max(0.25, natural));
  const box = ratio >= 1 ? {width: 240, height: 240 / ratio} : {width: 240 * ratio, height: 240};
  const scale = Math.min(1, dimensions.width / box.width, dimensions.height / box.height);
  return {width: Math.max(1, Math.round(box.width * scale)), height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center'};
}
// COPY: frontend index-Ciz7DZxv.js Np (18454) and UZ (18610).
// ADAPT: absent remote byte counts stay absent instead of rendering NaN/0B.
export function attachmentFileMeta(name, bytes) {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  const extension = dot < 0 ? '' : base.slice(dot + 1).toUpperCase().slice(0, 8);
  let size = '';
  if (Number.isFinite(bytes) && bytes >= 0) {
    if (bytes < 1024) size = `${bytes}B`;
    else {
      const kb = bytes / 1024, mb = kb / 1024, gb = mb / 1024;
      size = kb < 1024 ? `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB` :
        mb < 1024 ? `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB` : `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`;
    }
  }
  return [extension, size].filter(Boolean).join(' ');
}
export function draftFilePresentation(file, upload, t) {
  const name = file.name || file.path || t('acp.attachment');
  const status = file.type === 'file_upload' ? upload?.status || 'pending' : null;
  const meta = status ? t(status === 'uploading' ? 'acp.fileUploadUploading' : status === 'uploaded' ? 'acp.fileUploadUploaded' : status === 'failed' ? 'acp.fileUploadFailed' : 'acp.fileUploadPending') : attachmentFileMeta(name, file.size);
  return {name, state: status === 'uploading' ? 'uploading' : status === 'failed' ? 'error' : status === 'pending' ? 'pending' : 'ready', meta,
    title: [name, file.path, status === 'uploaded' ? upload?.remotePath : null, status ? t('acp.fileUploadHint') : null].filter(Boolean).join('\n')};
}
