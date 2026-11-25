import test from 'node:test';
import assert from 'node:assert/strict';
import {attachmentRailEdges,attachmentWheelDelta,attachmentPageDelta,singleImageFit,attachmentFileMeta,draftFilePresentation} from '../src/client/native-attachment-model.js';

test('native rail fractional edge tolerance never shows false paging arrows',()=>{
  assert.deepEqual(attachmentRailEdges({scrollLeft:0,scrollWidth:400,clientWidth:200}),{left:false,right:true});
  assert.deepEqual(attachmentRailEdges({scrollLeft:.75,scrollWidth:200,clientWidth:200}),{left:false,right:false});
  assert.deepEqual(attachmentRailEdges({scrollLeft:199.5,scrollWidth:400,clientWidth:200}),{left:true,right:false});
});
test('native wheel normalization consumes vertical intent only and bounds each pure vertical tick',()=>{
  assert.equal(attachmentWheelDelta({deltaX:10,deltaY:0,deltaMode:0},300),null);
  assert.equal(attachmentWheelDelta({deltaX:0,deltaY:5,deltaMode:1},300),60);
  assert.equal(attachmentWheelDelta({deltaX:0,deltaY:-2,deltaMode:1},300),-32);
  assert.equal(attachmentWheelDelta({deltaX:0,deltaY:1,deltaMode:2},300),60);
  assert.equal(attachmentWheelDelta({deltaX:2,deltaY:3,deltaMode:1},300),32);
  assert.equal(attachmentPageDelta(1,600),536);assert.equal(attachmentPageDelta(-1,180),-200);
});
test('single images use the native 240px long edge, clamp crops, and never upscale',()=>{
  assert.deepEqual(singleImageFit({width:1000,height:500}),{width:240,height:120,objectPosition:'center'});
  assert.deepEqual(singleImageFit({width:500,height:1000}),{width:120,height:240,objectPosition:'center'});
  assert.deepEqual(singleImageFit({width:20,height:10}),{width:20,height:10,objectPosition:'center'});
  assert.deepEqual(singleImageFit({width:100,height:10000}),{width:60,height:240,objectPosition:'center top'});
  assert.deepEqual(singleImageFit({width:10000,height:100}),{width:240,height:60,objectPosition:'left center'});
  for(const value of [null,{}, {width:0,height:4},{width:Infinity,height:4}])assert.deepEqual(singleImageFit(value),{width:240,height:240,objectPosition:'center'});
});
test('native file metadata formatting does not fabricate missing byte counts',()=>{
  assert.equal(attachmentFileMeta('notes.TXT',0),'TXT 0B');assert.equal(attachmentFileMeta('file.tar.gz',1024),'GZ 1.0KB');
  assert.equal(attachmentFileMeta('a/b/c',10240),'10KB');assert.equal(attachmentFileMeta('a.md',1024**2),'MD 1.0MB');
  assert.equal(attachmentFileMeta('a.md',1024**3),'MD 1.0GB');assert.equal(attachmentFileMeta('a.txt'),'TXT');
  assert.equal(attachmentFileMeta('a.txt',NaN),'TXT');assert.equal(attachmentFileMeta('a\\dir\\README',-1),'');
});
test('remote upload states remain truthful and only admission receipts expose remote paths',()=>{
  const file=Object.freeze({type:'file_upload',name:'archive.zip',size:2048,uploadId:'upload'}),t=key=>key;
  assert.equal(draftFilePresentation(file,undefined,t).state,'pending');
  assert.equal(draftFilePresentation(file,undefined,t).meta,'acp.fileUploadPending');
  assert.equal(draftFilePresentation(file,{status:'uploading'},t).state,'uploading');
  assert.equal(draftFilePresentation(file,{status:'failed'},t).state,'error');
  const ready=draftFilePresentation(file,{status:'uploaded',remotePath:'/authorized/archive.zip'},t);
  assert.equal(ready.state,'ready');assert.equal(ready.meta,'acp.fileUploadUploaded');assert.match(ready.title,/authorized/);
  assert.equal(draftFilePresentation(file,{status:'failed',remotePath:'/stale'},t).title,'archive.zip\nacp.fileUploadHint');
  const reference=draftFilePresentation({path:'remote/a.txt',name:'a.txt'},undefined,t);
  assert.equal(reference.state,'ready');assert.equal(reference.meta,'TXT');assert.match(reference.title,/remote\/a.txt/);
});
