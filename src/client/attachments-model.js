// Preview state is view-local. Never add URLs or status fields to the wire attachment.
const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
export const IMAGE_PREVIEW_LIMIT=2*1024*1024;
const ownedPreviewURLs=new Set();
// Only this view's live Blob resources or the authenticated durable-image route.
// Metadata-provided external URLs, data URLs and unrelated same-origin APIs are not images.
export function safeImagePreviewURL(source,origin=globalThis.location?.origin) {
  if(typeof source!=='string'||!source||source.length>8192)return null;
  if(ownedPreviewURLs.has(source))return source;
  try {
    const url=new URL(source,origin);
    if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password||url.hash||
      url.pathname!=='/remote-ssh/v3/message-image')return null;
    const fields=['id','dshSessionId','turnId','index'];
    if([...url.searchParams.keys()].length!==fields.length||fields.some(key=>url.searchParams.getAll(key).length!==1||!url.searchParams.get(key)))return null;
    if(!/^(?:0|[1-9]\d*)$/.test(url.searchParams.get('index')))return null;
    return url.href;
  } catch {return null;}
}

export function imageAttachmentModel(file={}) {
  if(file.type!=='image')return {kind:'file'};
  const mimeType=file.mimeType,data=file.data;
  if(!IMAGE_TYPES.has(mimeType)||typeof data!=='string'||!data.length||
    data.length>Math.ceil(IMAGE_PREVIEW_LIMIT/3)*4||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))return {kind:'unavailable'};
  const bytes=data.length/4*3-(data.endsWith('==')?2:data.endsWith('=')?1:0);
  return bytes>0&&bytes<=IMAGE_PREVIEW_LIMIT?{kind:'image',mimeType,data,bytes}:{kind:'unavailable'};
}
export function rasterHeaderMatches(mimeType,bytes) {
  const ascii=(at,text)=>text.split('').every((character,index)=>bytes[at+index]===character.charCodeAt(0));
  switch(mimeType){
    case 'image/png':return [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
    case 'image/jpeg':return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    case 'image/gif':return ascii(0,'GIF87a')||ascii(0,'GIF89a');
    case 'image/webp':return bytes.length>=12&&ascii(0,'RIFF')&&ascii(8,'WEBP');
    default:return false;
  }
}
// Resource operations run in an effect, not during render. Method wrappers preserve
// their browser receivers, and disposal is safe under StrictMode's setup/cleanup cycle.
export function createAttachmentPreview(model,{
  decode=data=>globalThis.atob(data),
  makeBlob=(parts,options)=>new Blob(parts,options),
  createURL=blob=>globalThis.URL.createObjectURL(blob),
  revokeURL=url=>globalThis.URL.revokeObjectURL(url),
}={}) {
  if(model?.kind!=='image'||!IMAGE_TYPES.has(model.mimeType))return {status:'unavailable',dispose(){}};
  let url;
  try {
    const binary=decode(model.data);
    if(!binary.length||binary.length>IMAGE_PREVIEW_LIMIT)return {status:'unavailable',dispose(){}};
    const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
    if(!rasterHeaderMatches(model.mimeType,bytes))return {status:'unavailable',dispose(){}};
    url=createURL(makeBlob([bytes],{type:model.mimeType}));
    if(typeof url!=='string'||!url.startsWith('blob:'))throw new Error('Invalid local preview URL');
    ownedPreviewURLs.add(url);
    let disposed=false;
    return {status:'ready',url,dispose(){if(disposed)return;disposed=true;ownedPreviewURLs.delete(url);try{revokeURL(url);}catch{}}};
  } catch {
    if(url)try{revokeURL(url);}catch{}
    return {status:'unavailable',dispose(){}};
  }
}
export function removeAttachmentById(attachments,id) {
  if(typeof id!=='string'||!id)return attachments;
  return attachments.filter(file=>file.id!==id);
}
