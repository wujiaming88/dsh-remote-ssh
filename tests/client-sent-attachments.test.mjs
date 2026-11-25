import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {sentAttachmentKey,sentImageURL,sentImagePresentation,sentAttachmentName,shouldLoadSentAttachments} from '../src/client/sent-attachments-model.js';
const context={id:'acp:1',dshSessionId:'session-1'},turn='turn-1';
const file={type:'image',name:'attachment',mimeType:'image/png'};
const available={ok:true,status:'available',attachments:[{type:'image',index:0,mimeType:'image/png',status:'available',url:'https://untrusted.invalid/track'}]};

test('sent image identity requires the native session, ACP session and exact turn',()=>{
  assert.equal(sentAttachmentKey(context,turn),'["acp:1","session-1","turn-1"]');
  for(const [value,id] of [[null,turn],[{id:'a'},turn],[context,null]])assert.equal(sentAttachmentKey(value,id),null);
  assert.equal(sentImageURL(context,turn,-1),null);assert.equal(sentImageURL(context,turn,16),null);
});
test('sent image URLs are constructed from scoped identities, never borrowed from event URLs',()=>{
  const result=sentImagePresentation(file,0,available,context,turn);
  assert.equal(result.status,'available');
  const url=new URL(result.src,'http://localhost');
  assert.equal(url.origin,'http://localhost');assert.equal(url.pathname,'/remote-ssh/v3/message-image');
  assert.equal(url.searchParams.get('id'),'acp:1');assert.equal(url.searchParams.get('dshSessionId'),'session-1');
  assert.equal(url.searchParams.get('turnId'),turn);assert.equal(url.searchParams.get('index'),'0');
  const escaped=sentImageURL({...context,id:'../?id=other&x=1'},'turn&index=9',1);
  assert.equal(new URL(escaped,'http://localhost').searchParams.get('id'),'../?id=other&x=1');
});
test('pending, missing, denied and invalid resources are explicit, never rendered as fabricated images',()=>{
  assert.equal(sentImagePresentation(file,0,null,context,turn).status,'loading');
  assert.equal(sentImagePresentation(file,0,{ok:true,status:'pending'},context,turn).status,'pending');
  for(const result of [{ok:false,code:'remote_access_denied'},{ok:true,status:'unavailable'},{...available,attachments:[]},{...available,attachments:[{...available.attachments[0],mimeType:'image/svg+xml'}]}]){
    assert.deepEqual(sentImagePresentation(file,0,result,context,turn),{status:'unavailable'});
  }
  assert.deepEqual(sentImagePresentation(file,0,available,null,turn),{status:'unavailable'});
});
test('mixed file/image metadata resolves by attachment index, not image-array position',()=>{
  const result={...available,attachments:[{...available.attachments[0],index:1}]};
  assert.equal(sentImagePresentation(file,0,result,context,turn).status,'unavailable');
  assert.match(sentImagePresentation(file,1,result,context,turn).src,/index=1$/);
});
test('generic historical labels become a localized image label without inventing a lost filename',()=>{
  const t=key=>key==='acp.imageAttachment'?'图片':'文件';
  assert.equal(sentAttachmentName(file,0,t),'图片 1');
  assert.equal(sentAttachmentName({...file,name:'screen.png'},0,t),'screen.png');
  assert.equal(sentAttachmentName({name:'notes.txt'},1,t),'notes.txt');
});
test('available images remain mounted through turn lifecycle changes; pending and manual retry can reload',()=>{
  const key=sentAttachmentKey(context,turn),loaded={key,response:available};
  assert.equal(shouldLoadSentAttachments(key,loaded,0,0),false);
  assert.equal(shouldLoadSentAttachments(key,loaded,0,1),true);
  assert.equal(shouldLoadSentAttachments(key,{key,response:{ok:true,status:'pending'}},0,0),true);
  assert.equal(shouldLoadSentAttachments('another',loaded,0,0),true);
  assert.equal(shouldLoadSentAttachments(null,loaded,0,0),false);
});
test('sent renderer aborts old requests, ignores token deltas and provides readonly preview with retry',async()=>{
  const source=readFileSync(new URL('../src/client/sent-attachments.js',import.meta.url),'utf8');
  const transcript=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/client/sent-attachments.css',import.meta.url),'utf8');
  parse(source,{ecmaVersion:'latest',sourceType:'module'});
  parse(transcript,{ecmaVersion:'latest',sourceType:'module'});
  assert.match(source,/live=false;controller.abort\(\)/);
  assert.match(source,/if\(live\)setLoaded\(\{key,response\}\)/);
  assert.match(source,/\[key,hasImages,phase,attempt\]/);
  assert.match(source,/loaded\?\.key===key\?loaded.response:null/);
  assert.match(source,/h\(ImagePreviewModal/);assert.match(source,/loading:'lazy'/);
  // Pending always has an explicit recovery path; no session-wide polling.
  assert.ok(source.includes("['unavailable','pending'].includes(response.status)"));
  // A failed modal must not disable the opener to which native focus returns.
  assert.ok(source.includes("disabled:!src,'data-failed'"));
  assert.ok(source.includes('onClick:()=>failed?retry():setOpen(true)'));
  assert.doesNotMatch(source,/setAttachments|removeAttachment|setInterval|setTimeout|localStorage|sessionStorage/);
  assert.match(transcript,/h\(SentAttachments/);assert.match(transcript,/!ancestors.length&&\(!item.rootSessionId\|\|item.rootSessionId===item.sessionId\)/);
  assert.match(transcript,/String\(item.text\|\|''\).trim\(\)\?h\('div',\{className:'rssh-user-bubble'/);
  assert.match(css,/object-fit: contain/);assert.match(css,/overflow-x: auto/);
  assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
});
