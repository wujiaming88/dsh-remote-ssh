import test from 'node:test';
import assert from 'node:assert/strict';
import {AcpSession} from '../lib/acp.js';
import {normalizeBackend,normalizeRemoteBackend} from '../lib/config.js';
import {normalizePermission} from '../lib/acp-core.js';
import {resolveSessionBackend,runtimeOptions} from '../lib/workspace-backend.js';
const profile={id:'profile',host:'unused.invalid',user:'fixture',authMethod:'key'};
const workspace={id:'workspace',profileId:profile.id,title:'Fixture',mirrorPath:process.cwd(),remotePath:'/remote'};
const session=(agent='claude',extra={})=>new AcpSession({id:'acp-fixture',dshSessionId:'dsh-fixture',agent,profile,workspaceId:workspace.id,cwd:process.cwd(),remotePath:'/remote',configuredRemotePath:'/remote',permission:'bypass',...extra});

test('default is a valid runtime permission and never normalizes into acceptEdits or bypass',()=>{
  assert.equal(normalizePermission('default'),'default');
  for(const type of ['claude','codex','pi']){
    assert.equal(normalizeBackend({type,permission:'default'}).permission,'default');
    assert.equal(normalizeRemoteBackend({type,permission:'default'}).permission,'default');
  }
  assert.equal(normalizeBackend().permission,'acceptEdits');
  assert.equal(normalizePermission(undefined),'acceptEdits');
});
test('unknown backend types and permission values remain invalid',()=>{
  for(const permission of ['unknown','bypassPermissions','agent-full-access',false,{},''])assert.throws(()=>normalizeBackend({type:'claude',permission}),{code:'invalid_backend'});
  assert.throws(()=>normalizeBackend({type:'other',permission:'default'}),{code:'invalid_backend'});
});
for(const agent of ['claude','codex'])for(const live of [false,true])for(const durable of [false,true])
  test(`${agent} ${live?'live':'cold'} ${durable?'durable':'legacy'} default permission remains readable without restoring bypass`,async t=>{
    const acp=session(agent);t.after(()=>acp.dispose());
    acp.status=live?'ready':'detached';
    const state={...acp.state(),requestedPermission:'bypass',...(durable?{remoteExecution:{protocol:1,taskStatus:'unknown'}}:{})};
    const selected={sessionId:'dsh-fixture',workspaceId:workspace.id,profileId:profile.id,cwd:process.cwd(),configuredRemotePath:'/remote',backend:normalizeBackend({type:agent,permission:'bypass'})};
    let writes=0,starts=0;
    const bindings={get:async()=>structuredClone(selected),bind:async()=>{writes++;}};
    const runtime={findActive:()=>live?{state:()=>state}:null,list:()=>[state],resume:()=>{starts++;},start:()=>{starts++;}};
    const resolved=await resolveSessionBackend({sessionId:'dsh-fixture',sessions:{get:()=>({header:{cwd:process.cwd()}})},workspaces:[workspace],runtime,bindings,selectBackend:()=>{throw Error('Must preserve existing binding');}});
    assert.equal(resolved.backend.type,agent);assert.equal(resolved.backend.permission,'default');
    assert.equal(resolved.binding,state);assert.equal(resolved.binding.requestedPermission,'bypass');
    assert.equal(selected.backend.permission,'bypass');assert.equal(runtimeOptions(resolved,profile).permission,'default');
    assert.equal(writes,0);assert.equal(starts,0);
  });
test('an explicit advertised default mode stays default through ACP startup',async t=>{
  const modes=[],controller={ready:Promise.resolve({sessionId:'remote',protocolCwd:'/remote',initialize:{agentCapabilities:{}},sessionResponse:{sessionId:'remote',modes:{currentModeId:'default',availableModes:[{id:'default',name:'Default'},{id:'acceptEdits',name:'Accept edits'},{id:'bypassPermissions',name:'Bypass'}]}}}),
    async setMode(mode){modes.push(mode);return {};},async close(){},async dispose(){}};
  const acp=session('claude',{permission:'default',connectImpl:()=>controller});t.after(()=>acp.dispose());
  assert.equal(acp.requestedPermission,'default');await acp.start();
  assert.deepEqual(modes,['default']);assert.equal(acp.state().permission,'default');
  assert.equal(acp.state().permissionStatus.effective,'default');
});
test('Pi starts without claiming an ACP permission mode',async t=>{
  const modes=[],controller={ready:Promise.resolve({sessionId:'remote',protocolCwd:'/remote',initialize:{agentCapabilities:{}},sessionResponse:{sessionId:'remote',configOptions:[]}}),async setMode(mode){modes.push(mode);return {};},async close(){},async dispose(){}};
  const acp=session('pi',{permission:'acceptEdits',connectImpl:()=>controller});t.after(()=>acp.dispose());
  await acp.start();
  assert.deepEqual(modes,[]);assert.equal(acp.state().permission,'default');
  assert.deepEqual(acp.state().permissionStatus,{requested:'acceptEdits',supported:false,applied:false,effective:'default'});
});
test('an adapter without advertised default cannot silently substitute acceptEdits or bypass',async t=>{
  const modes=[],controller={ready:Promise.resolve({sessionId:'remote',protocolCwd:'/remote',initialize:{agentCapabilities:{}},sessionResponse:{sessionId:'remote',modes:{currentModeId:'acceptEdits',availableModes:[{id:'acceptEdits',name:'Accept edits'},{id:'bypassPermissions',name:'Bypass'}]}}}),
    async setMode(mode){modes.push(mode);return {};},async close(){},async dispose(){}};
  const acp=session('claude',{permission:'default',connectImpl:()=>controller});t.after(()=>acp.dispose());
  await assert.rejects(acp.start(),{code:'mode_unsupported'});
  assert.deepEqual(modes,[]);assert.equal(acp.permissionMode,'default');
});
test('default effective permission still waits for human approval despite an earlier bypass request',async t=>{
  const acp=session();t.after(()=>acp.dispose());
  assert.equal(acp.requestedPermission,'bypass');assert.equal(acp.permissionMode,'default');
  const pending=acp.handlePermissionRequest({sessionId:'remote',toolCall:{toolCallId:'write',title:'Edit file'},options:[{optionId:'allow',name:'Allow',kind:'allow_once'},{optionId:'deny',name:'Deny',kind:'reject_once'}]},'permission');
  assert.equal(acp.broker.list().length,1);
  assert.equal(acp.events.some(event=>event.type==='permission'&&event.autoResolved),false);
  acp.broker.cancelAll();assert.equal((await pending).outcome.outcome,'cancelled');
});
