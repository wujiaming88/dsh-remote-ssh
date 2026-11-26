import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionClient} from '../src/client/session.js';
import {initialState,applySnapshot,reduceEvent,replay} from '../src/client/events.js';
import {visibleTranscriptItem} from '../src/client/transcript-model.js';
function fixture(t,api){
  const calls=[],prompts=[];
  const client=new SessionClient({sessionId:'local'}, {storage:null,
    api:async(method,args)=>{calls.push({method,args});return api?api(method,args,calls.length):
      {ok:true,requestId:args.requestId,accepted:true,outcome:method==='acpSteer'?'injected':'queued'};},
    stream:async(method,args,signal,emit)=>{prompts.push({method,args});emit({type:'request_ack',requestId:args.requestId});}});
  client.publish({binding:{id:'remote'},running:true,capabilities:{steering:{supported:true},promptCapabilities:{image:true}}});
  t.after(()=>client.dispose());return {client,composer:client.composer,calls,prompts};
}
const event=(seq,extra)=>({generation:'g',seq,sessionId:'root',...extra});
const snapshot=(seq,queuedMessages)=>({id:'remote',cursor:{generation:'g',seq},queuedMessages,busy:true});

test('busy submission defaults to explicit remote FIFO and clears only after its acceptance',async t=>{
  const f=fixture(t);f.composer.setDraft('next turn');await f.client.sendDraft();
  assert.equal(f.calls[0].method,'acpQueue');assert.equal(f.calls.length,1);assert.equal(f.prompts.length,0);
  assert.equal(f.composer.getSnapshot().draft,'');assert.equal(f.composer.getSnapshot().pendingKind,null);
});

test('explicit native steering carries attachments without cancelling or submitting a new prompt',async t=>{
  const f=fixture(t);f.composer.setDraft('consider this image');
  f.composer.setAttachments([{id:'local-image',type:'image',mimeType:'image/png',data:'iVBORw=='}]);
  await f.client.sendDraft('steer');
  assert.equal(f.calls[0].method,'acpSteer');assert.equal(f.calls[0].args.attachments[0].type,'image');
  assert.equal(f.calls[0].args.attachments[0].id,undefined);assert.equal(f.prompts.length,0);
  assert.equal(f.composer.getSnapshot().attachments.length,0);
});

test('unknown queue ACK freezes mode and identity until explicit retry, even across an idle transition',async t=>{
  const f=fixture(t,(method,args,count)=>count===1?{ok:true}:{ok:true,requestId:args.requestId,accepted:true,outcome:'started'});
  f.composer.setDraft('do not duplicate');await assert.rejects(f.client.sendDraft('queue'),{code:'acknowledgment_unknown'});
  const id=f.composer.pending.requestId;assert.equal(f.composer.getSnapshot().pendingKind,'queue');
  await assert.rejects(f.client.sendDraft('steer'),{code:'submission_mode_locked'});assert.equal(f.calls.length,1);
  f.client.publish({running:false});await f.client.sendDraft('retry');
  assert.deepEqual(f.calls.map(call=>call.method),['acpQueue','acpQueue']);
  assert.deepEqual(f.calls.map(call=>call.args.requestId),[id,id]);assert.equal(f.composer.pending,null);
});

test('a retry validation failure cannot erase a previously uncertain submission identity',async t=>{
  const f=fixture(t,(method,args,count)=>{
    if(count===1)return {ok:true};
    if(count===2)throw Object.assign(new Error('Referenced attachment changed'),{code:'bad_attachment'});
    return {ok:true,requestId:args.requestId,accepted:true,outcome:'queued'};
  });
  f.composer.setDraft('possibly already received');await assert.rejects(f.client.sendDraft(),{code:'acknowledgment_unknown'});
  const id=f.composer.pending.requestId;
  await assert.rejects(f.client.sendDraft('retry'),{code:'bad_attachment'});
  assert.equal(f.composer.pending.requestId,id);assert.equal(f.composer.getSnapshot().pendingKind,'queue');
  await assert.rejects(f.client.sendDraft('steer'),{code:'submission_mode_locked'});
  await f.client.sendDraft('retry');assert.ok(f.calls.every(call=>call.args.requestId===id));
});

test('a proven not-injected steer retains its draft and allows a separately chosen queue request',async t=>{
  const f=fixture(t,(method,args)=>({ok:true,requestId:args.requestId,accepted:method==='acpQueue',outcome:method==='acpSteer'?'promptRequired':'queued'}));
  f.composer.setDraft('keep me');await assert.rejects(f.client.sendDraft('steer'),{code:'steering_not_injected'});
  assert.equal(f.composer.getSnapshot().draft,'keep me');assert.equal(f.composer.pending,null);assert.equal(f.calls.length,1);
  await f.client.sendDraft('queue');assert.equal(f.calls[1].method,'acpQueue');
  assert.notEqual(f.calls[0].args.requestId,f.calls[1].args.requestId);
});

test('missing steering capability cannot silently turn strict steering into queue',async t=>{
  const f=fixture(t);f.client.publish({capabilities:{steering:{supported:false}}});f.composer.setDraft('steer only');
  await assert.rejects(f.client.sendDraft('steer'),{code:'steering_unsupported'});
  assert.equal(f.calls.length,0);assert.equal(f.composer.pending,null);assert.equal(f.composer.getSnapshot().draft,'steer only');
  await f.client.sendDraft('queue');assert.equal(f.calls[0].method,'acpQueue');
});

test('editing a draft creates a distinct intent without silently reusing the previous mode',async t=>{
  const f=fixture(t,(method,args,count)=>count===1?{ok:true}:{ok:true,requestId:args.requestId,outcome:'injected'});
  f.composer.setDraft('first');await assert.rejects(f.client.sendDraft(),{code:'acknowledgment_unknown'});
  const id=f.composer.pending.requestId;f.composer.setDraft('second');assert.equal(f.composer.getSnapshot().pendingKind,null);
  await f.client.sendDraft('steer');assert.notEqual(f.calls[1].args.requestId,id);assert.equal(f.calls[1].method,'acpSteer');
});

test('queue snapshots survive short history and ignore stale HTTP responses and child-session updates',()=>{
  const row={requestId:'r',turnId:'later',text:'queued',attachments:[]};
  let state=applySnapshot(initialState(),snapshot(10,[row]));assert.deepEqual(state.queuedMessages,[row]);
  state=reduceEvent(state,event(12,{type:'queue_snapshot',queuedMessages:[]}));
  assert.deepEqual(applySnapshot(state,snapshot(10,[row])).queuedMessages,[]);
  state=reduceEvent(state,event(13,{type:'queue_snapshot',sessionId:'child',rootSessionId:'root',queuedMessages:[row]}));
  assert.deepEqual(state.queuedMessages,[]);
  const restored=replay([event(3,{type:'text',text:'earlier'})],snapshot(10,[row]),state);
  assert.deepEqual(restored.queuedMessages,[]);assert.equal(restored.queueCursor.seq,12);
  assert.equal(restored.items.some(item=>item.type==='native_event'),false);
});

test('queued messages appear only in the dock until actual turn_start, and removed inputs stay out of chat',()=>{
  let state=reduceEvent(initialState(),event(1,{type:'user_message',turnId:'later',requestId:'r',delivery:'queued',text:'next'}));
  assert.equal(visibleTranscriptItem(state.items[0]),false);
  state=reduceEvent(state,event(2,{type:'turn_start',turnId:'later',requestId:'r'}));
  assert.equal(visibleTranscriptItem(state.items[0]),true);
  assert.equal(visibleTranscriptItem({...state.items[0],delivery:'cancelled'}),false);
  assert.equal(visibleTranscriptItem({type:'system',submitted:false,stopReason:'cancelled'}),false);
});
