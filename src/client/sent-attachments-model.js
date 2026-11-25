import {HTTP_BASE} from '../../lib/protocol.js';

const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
export const isSentImage=file=>file?.type==='image';
export function sentAttachmentKey(context,turnId) {
  return context?.id&&context?.dshSessionId&&turnId?
    JSON.stringify([String(context.id),String(context.dshSessionId),String(turnId)]):null;
}
// Construct the one session-scoped endpoint ourselves. Event/response URLs are
// never navigation targets, and a hash or native storage path is never accepted.
export function sentImageURL(context,turnId,index) {
  if(!sentAttachmentKey(context,turnId)||!Number.isSafeInteger(index)||index<0||index>=16)return null;
  return HTTP_BASE+'/message-image?'+new URLSearchParams({id:context.id,dshSessionId:context.dshSessionId,turnId,index:String(index)});
}
export function sentImagePresentation(file,index,response,context,turnId) {
  if(!isSentImage(file)||!sentAttachmentKey(context,turnId))return {status:'unavailable'};
  if(!response)return {status:'loading'};
  if(response.status==='pending')return {status:'pending'};
  if(response.ok!==true||response.status!=='available')return {status:'unavailable'};
  const asset=Array.isArray(response.attachments)?response.attachments.find(value=>value?.index===index):null;
  if(!asset||asset.type!=='image'||asset.status!=='available'||!IMAGE_TYPES.has(asset.mimeType))return {status:'unavailable'};
  const src=sentImageURL(context,turnId,index);
  return src?{status:'available',src,mimeType:asset.mimeType}:{status:'unavailable'};
}
export function sentAttachmentName(file,index,t) {
  const name=typeof file?.name==='string'?file.name.trim():'';
  return name&&name!=='attachment'?name:`${t(isSentImage(file)?'acp.imageAttachment':'acp.fileAttachment')} ${index+1}`;
}
export function shouldLoadSentAttachments(key,loaded,previousAttempt,attempt) {
  return !!key&&!(loaded?.key===key&&loaded.response?.ok===true&&loaded.response?.status==='available'&&previousAttempt===attempt);
}
