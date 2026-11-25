import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {imageAttachmentModel,createAttachmentPreview,rasterHeaderMatches,removeAttachmentById,IMAGE_PREVIEW_LIMIT,safeImagePreviewURL} from '../src/client/attachments-model.js';
import {prepareSubmission,wireAttachments,acknowledgeSubmission} from '../src/client/submission.js';
import {ComposerSession} from '../src/client/composer-session.js';
import zh from '../src/client/zh.js';
import en from '../src/client/en.js';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
const png=Buffer.from([137,80,78,71,13,10,26,10]);
const file=(id='one',bytes=png,mimeType='image/png')=>({id,type:'image',name:'image.png',mimeType,data:bytes.toString('base64')});
function resourceRuntime(){
  const created=[],revoked=[];
  return {created,revoked,createURL:blob=>{created.push(blob);return 'blob:owned-'+created.length;},revokeURL:url=>revoked.push(url)};
}

test('only local supported raster payloads are eligible for previews',()=>{
  for(const [mime,bytes] of [['image/png',png],['image/jpeg',Buffer.from([255,216,255])],['image/gif',Buffer.from('GIF89a')],['image/webp',Buffer.from('RIFF1234WEBP')]]){
    const value=file(mime,bytes,mime),model=imageAttachmentModel(value);
    assert.equal(model.kind,'image');assert.equal(model.bytes,bytes.length);assert.equal(rasterHeaderMatches(mime,bytes),true);
  }
  assert.equal(imageAttachmentModel({path:'image.png',name:'image.png'}).kind,'file');
  for(const mimeType of ['image/svg+xml','text/html','image/avif','image/png; charset=utf-8'])assert.equal(imageAttachmentModel({...file(),mimeType}).kind,'unavailable');
});
test('invalid, oversized and URL-shaped payloads never reach preview resource creation',()=>{
  const runtime=resourceRuntime();
  const invalid=['','https://external.example/image.png','data:image/png;base64,AAAA','AAAA\n','A===','AAAA=','%%%=',Buffer.alloc(IMAGE_PREVIEW_LIMIT+1).toString('base64')];
  for(const data of invalid){
    const model=imageAttachmentModel({...file(),data});assert.equal(model.kind,'unavailable');
    assert.equal(createAttachmentPreview(model,runtime).status,'unavailable');
  }
  assert.equal(runtime.created.length,0);
  assert.equal(imageAttachmentModel(file('limit',Buffer.alloc(IMAGE_PREVIEW_LIMIT))).kind,'image');
});
test('preview models ignore path/url metadata rather than dereferencing arbitrary destinations',()=>{
  const value=file();
  for(const key of ['url','path','previewUrl'])Object.defineProperty(value,key,{get(){throw new Error('Must not read '+key);}});
  assert.equal(imageAttachmentModel(value).kind,'image');
  const runtime=resourceRuntime(),resource=createAttachmentPreview(imageAttachmentModel(value),runtime);
  assert.equal(resource.status,'ready');resource.dispose();
});
test('raster MIME spoofing and decoding failures return fallback without constructing an image URL',()=>{
  const runtime=resourceRuntime();
  for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),Buffer.from('<html>'),Buffer.from([0,1,2])]){
    assert.equal(createAttachmentPreview(imageAttachmentModel(file('bad',bytes)),runtime).status,'unavailable');
  }
  assert.equal(createAttachmentPreview(imageAttachmentModel(file()),{...runtime,decode(){throw new Error('decode');}}).status,'unavailable');
  assert.equal(runtime.created.length,0);
});
test('local preview bytes match the attachment and owned URLs are disposed exactly once',async()=>{
  const runtime=resourceRuntime(),model=imageAttachmentModel(file()),resource=createAttachmentPreview(model,runtime);
  assert.equal(resource.status,'ready');assert.equal(resource.url,'blob:owned-1');
  assert.equal(runtime.created[0].type,'image/png');
  assert.deepEqual(new Uint8Array(await runtime.created[0].arrayBuffer()),new Uint8Array(png));
  resource.dispose();resource.dispose();assert.deepEqual(runtime.revoked,['blob:owned-1']);
});
test('resource recreation produces independent lifetimes across remount/StrictMode cleanup',()=>{
  const runtime=resourceRuntime(),model=imageAttachmentModel(file());
  const first=createAttachmentPreview(model,runtime);first.dispose();
  const second=createAttachmentPreview(model,runtime);
  assert.notEqual(first.url,second.url);assert.deepEqual(runtime.revoked,[first.url]);
  second.dispose();assert.deepEqual(runtime.revoked,[first.url,second.url]);
});
test('the shared viewer accepts only live owned Blobs or exact same-origin durable image routes',()=>{
  const origin='https://harness.example',path='/remote-ssh/v3/message-image?id=a&dshSessionId=s&turnId=t&index=0';
  assert.equal(safeImagePreviewURL(path,origin),origin+path);
  assert.equal(safeImagePreviewURL(origin+path,origin),origin+path);
  for(const input of ['https://external.example'+path,'data:image/png;base64,AAAA','blob:unowned','javascript:alert(1)',path+'&index=1',path+'&extra=1',path.replace('index=0','index=-1'),path.replace('index=0','index='),path+'#fragment','/api/other'+path,'https://user@harness.example'+path,'x'.repeat(8193)])assert.equal(safeImagePreviewURL(input,origin),null,input);
  const runtime=resourceRuntime(),resource=createAttachmentPreview(imageAttachmentModel(file()),runtime);
  assert.equal(safeImagePreviewURL(resource.url,origin),resource.url);
  resource.dispose();assert.equal(safeImagePreviewURL(resource.url,origin),null);
});
test('resource creation failure and unexpected URL schemes cannot escape the image fallback',()=>{
  const model=imageAttachmentModel(file());
  assert.equal(createAttachmentPreview(model,{makeBlob(){throw new Error('Blob unavailable');}}).status,'unavailable');
  assert.equal(createAttachmentPreview(model,{createURL(){throw new Error('URL unavailable');}}).status,'unavailable');
  const revoked=[];
  const value=createAttachmentPreview(model,{createURL:()=> 'https://external.example/image.png',revokeURL:url=>revoked.push(url)});
  assert.equal(value.status,'unavailable');assert.equal(value.url,undefined);assert.equal(revoked.length,1);
  const resource=createAttachmentPreview(model,{createURL:()=> 'blob:owned',revokeURL(){throw new Error('already disposed');}});
  assert.doesNotThrow(()=>{resource.dispose();resource.dispose();});
});
test('removal is by stable identity, not repeated filename, index or a file path',()=>{
  const first=file('a'),second=file('b'),files=[first,second,{id:'text',name:'image.png',text:'hello'}];
  assert.deepEqual(removeAttachmentById(files,'b'),[first,files[2]]);
  assert.deepEqual(removeAttachmentById(files,'absent'),files);
  assert.equal(removeAttachmentById(files,undefined),files);
  assert.equal(removeAttachmentById(files,''),files);
  assert.equal(files.length,3);
});
test('preview creation, failure and disposal do not mutate wire payload or retry identity',()=>{
  const attachment=Object.freeze(file()),attachments=Object.freeze([attachment]);
  const before=JSON.stringify(attachment),request=prepareSubmission('hello',attachments,null,()=> 'request-id');
  const runtime=resourceRuntime(),resource=createAttachmentPreview(imageAttachmentModel(attachment),runtime);resource.dispose();
  assert.equal(JSON.stringify(attachment),before);
  assert.deepEqual(wireAttachments(attachments),[{type:'image',name:'image.png',mimeType:'image/png',data:attachment.data}]);
  assert.equal(prepareSubmission('hello',attachments,request,()=>{throw new Error('Retry must reuse ID');}),request);
  const newer=file('new');
  assert.deepEqual(acknowledgeSubmission('hello',[attachment,newer],request).attachments,[newer]);
});
test('view resource cleanup leaves retained composer attachments available across session switches',()=>{
  const stored=[],composer=new ComposerSession('session',{getItem:()=>'',setItem:(...args)=>stored.push(args)});
  const attachment=file();composer.setAttachments([attachment]);
  const runtime=resourceRuntime(),resource=createAttachmentPreview(imageAttachmentModel(attachment),runtime);resource.dispose();
  assert.equal(composer.getSnapshot().attachments[0],attachment);assert.deepEqual(stored,[]);
  const {request,attempt}=composer.begin('prompt');composer.finish(request,attempt,new Error('send failed'));
  assert.equal(composer.getSnapshot().attachments[0],attachment);
  composer.acknowledge(request.requestId);assert.equal(composer.getSnapshot().attachments.length,0);
});
test('image validation is memoized and URL creation/cleanup belong to the component effect',()=>{
  const source=read('attachments.js');
  assert.match(source,/React.useMemo\(\(\)=>imageAttachmentModel\(file\),\[file.type,file.mimeType,file.data\]\)/);
  assert.match(source,/React.useEffect\(\(\)=>\{\s*const preview=createAttachmentPreview\(model\)/);
  assert.match(source,/return \(\)=>preview.dispose\(\);\s*\},\[model\]\)/);
  assert.match(source,/resource\?\.model===model\?resource/);
  assert.match(source,/key:file.id/);assert.doesNotMatch(source,/key:index|fetch\(|window.open|localStorage|sessionStorage/);
  const model=read('attachments-model.js');
  assert.match(model,/globalThis.atob\(data\)/);assert.match(model,/globalThis.URL.createObjectURL\(blob\)/);assert.match(model,/globalThis.URL.revokeObjectURL\(url\)/);
});
test('preview and removal are separate controls, preserve failure feedback and reuse the existing modal',()=>{
  const source=read('attachments.js'),chat=read('chat.js');
  for(const name of ['attachments.js','attachments-model.js','chat.js'])parse(read(name),{ecmaVersion:'latest',sourceType:'module'});
  assert.match(source,/className:'rssh-attachment-thumbnail',disabled:!loaded/);
  assert.match(source,/onClick:\(\)=>setOpened\(true\)/);assert.match(source,/onClick:\(\)=>onRemove\(file.id\)/);
  assert.match(source,/className:'rssh-attachment-remove',disabled:sending/);
  assert.match(source,/h\(ui.Modal,\{open:true,[^\n]*closeLabel:t\('acp.close'\),onClose\}/);
  assert.match(source,/h\(ImagePreviewModal,\{src:url,name,t,onClose:\(\)=>setOpened\(false\)/);
  assert.match(source,/const safeSource=safeImagePreviewURL\(src\)/);
  assert.match(source,/onError:\(\)=>setFailedURL\(url\)/);assert.match(source,/acp.imageAttachmentRetained/);
  assert.match(chat,/if\(!composer.getSnapshot\(\).sending\)setAttachments\(old=>removeAttachmentById\(old,id\)\)/);
  assert.doesNotMatch(chat,/file.name, ' ×'|position !== index/);
});
test('attachment strip stays single-row, contains images without cropping, and exposes persistent keyboard controls',async()=>{
  const css=read('attachments.css');assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
  assert.match(css,/\.rssh-attachments \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto/);
  assert.match(css,/\.rssh-attachment-thumbnail \{[^}]*width: 64px; height: 64px/);assert.match(css,/object-fit: contain/);
  assert.match(css,/ComposerAttachments\.module\.css/);assert.match(css,/FileCard\.module\.css/);
  assert.match(css,/\.rssh-attachment-name \{[^}]*text-overflow: ellipsis/);
  assert.match(css,/\.rssh-attachment-remove:focus-visible \{[^}]*outline: 2px solid var\(--dsw-alias-state-info-primary\)/);
  assert.match(css,/\.rssh-image-preview-stage img \{[^}]*max-height: min\(720px, 70dvh\)/);
  assert.match(css,/pointer: coarse/);
  assert.match(css,/\.rssh-attachment-remove:focus-visible \{ opacity: 1; \}/);
  assert.match(css,/\.rssh-attachment:hover \.rssh-attachment-remove,[^}]*opacity: 1/);
  assert.match(css,/@media \(hover: none\), \(pointer: coarse\) \{ \.rssh-attachment-remove \{ opacity: 1/);
  assert.match(css,/@media \(pointer: coarse\) \{ \.rssh-attachment-remove \{ width: 32px; height: 32px/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css,/display:\s*none/);
  const index=read('index.js');assert.match(index,/import attachmentCss from '.\/attachments.css'/);assert.match(index,/filesCss \+ "\\n" \+ attachmentCss/);
});
test('ordinary files retain compact non-clickable labels with separate removal',()=>{
  const source=read('attachments.js'),css=read('attachments.css');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const node=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='FileAttachment');
  const fileBody=source.slice(node.start,node.end);
  assert.match(fileBody,/className:'rssh-attachment-file'/);
  assert.match(fileBody,/h\(RemoveAttachment,\{file,sending,onRemove,t\}\)/);
  assert.match(fileBody,/className:'rssh-attachment-name',title:name/);
  assert.doesNotMatch(fileBody,/onClick|rssh-attachment-thumbnail/);
  assert.match(css,/\.rssh-attachment-file \{[^}]*width: 240px; max-width: 100%; height: 64px/);
  assert.match(css,/\.rssh-attachment-file > svg \{[^}]*width: 28px; height: 28px/);
  assert.doesNotMatch(css,/\.rssh-attachment-file \{[^}]*height: 72px|\.rssh-attachment-thumbnail, \.rssh-attachment-file/);
});
test('image preview, removal and fallback feedback have both locale labels',()=>{
  const keys=['acp.attachment','acp.attachments','acp.imageAttachment','acp.fileAttachment','acp.remoteFileAttachment','acp.previewImage','acp.imagePreviewLoading','acp.imagePreviewUnavailable','acp.imageAttachmentRetained','acp.removeAttachment','acp.close'];
  for(const locale of [zh,en])for(const key of keys)assert.ok(locale[key],key);
});
