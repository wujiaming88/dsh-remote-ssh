import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough, Readable, Writable } from 'node:stream'
import { AcpStore, createAcpRuntime } from '../lib/acp.js'
import { connectAcp, normalizeCapabilities, supportsSessionAction, buildRemoteAcpLaunchSpec } from '../lib/acp-transport.js'

const profile = { id:'p', host:'example.invalid', user:'alice', authMethod:'kerberos' }
const tick = () => new Promise(r => setImmediate(r))
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }
const configOptions = (model='m1',effort='medium') => [
  {id:'model',category:'model',type:'select',currentValue:model,options:[{value:'m1'},{value:'m2'}]},
  {id:'effort',category:'thought_level',type:'select',currentValue:effort,options:[{value:'medium'},{value:'high'}]}
]
const response = (sessionId,mode='acceptEdits',model='m1',effort='medium') => ({sessionId,modes:{currentModeId:mode,availableModes:['default','plan','acceptEdits','bypassPermissions'].map(id=>({id,name:id}))},configOptions:configOptions(model,effort)})
const initialize = {protocolVersion:1,agentCapabilities:{sessionCapabilities:{fork:{},title:{}}}}
function temporary(t) {
  const dir=mkdtempSync(join(tmpdir(),'dsh-acp-actions-'))
  t.after(()=>{ assert.equal(dirname(resolve(dir)),resolve(tmpdir())); rmSync(dir,{recursive:true,force:true}) })
  return dir
}
async function fixture(t, options={}) {
  const dir=temporary(t),calls=[],controllers=[]
  const connectImpl=opts=>{
    const n=controllers.length, c={
      async prompt(text) { calls.push(['prompt',n,text]); return {stopReason:'end_turn'} },
      async setMode(id) { calls.push(['mode',n,id]); return {} },
      async setConfig(id,value) { calls.push(['config',n,id,value]); const values=configOptions(c.model||'m1',c.effort||'medium'); values.find(o=>o.id===id).currentValue=value;c[id]=value;return {configOptions:values} },
      async setTitle(title) { calls.push(['title',n,title]); return {title:title.trim()} },
      async cancel() { calls.push(['cancel',n]);return true },
      async close() { calls.push(['close',n]) },
      async dispose() { calls.push(['dispose',n]) }
    }
    controllers.push(c)
    c.ready=Promise.resolve().then(async()=>{
      if(opts.forkSessionId) {
        calls.push(['fork',n,opts.forkSessionId]);opts.onForkSubmitted?.()
        await options.forkGate?.promise
        if(options.forkError) throw options.forkError
        const result=options.forkResponse||response('remote-'+n)
        c.model=result.configOptions?.find(o=>o.id==='model')?.currentValue;c.effort=result.configOptions?.find(o=>o.id==='effort')?.currentValue
        opts.onForkResponse?.(result)
        return {sessionId:result.sessionId,sessionResponse:result,initialize,protocolCwd:'/remote/fork'}
      }
      return {sessionId:'remote-0',sessionResponse:response('remote-0'),initialize,protocolCwd:'/remote'}
    })
    return c
  }
  const store=new AcpStore({storePath:join(dir,'sessions.json')})
  const runtime=createAcpRuntime({store,connectImpl,startTimeoutMs:1000})
  t.after(()=>runtime.shutdown())
  const source=await runtime.create({id:'source',profile,remotePath:'/remote',dshSessionId:'dsh-parent'})
  return {runtime,source,store,calls,controllers,dir}
}

test('capability support requires an advertised object; empty object is supported',()=>{
  for(const value of [null,undefined,false,true,[]]) assert.equal(supportsSessionAction(normalizeCapabilities({agentCapabilities:{sessionCapabilities:{fork:value,title:value}}}),'fork'),false)
  assert.equal(supportsSessionAction(normalizeCapabilities(initialize),'fork'),true)
  assert.equal(supportsSessionAction(normalizeCapabilities(initialize),'title'),true)
})

test('title requests serialize, commit normalized remote title, persist and isolate root session updates',async t=>{
  const f=await fixture(t), gate=deferred(), calls=[]
  f.controllers[0].setTitle=async title=>{calls.push(title);if(title==='first')await gate.promise;return {title:title.toUpperCase().trim()}}
  const a=f.source.setTitle('first'),b=f.runtime.setTitle('source',' second ')
  await tick();assert.deepEqual(calls,['first']);gate.resolve()
  assert.equal((await a).title,'FIRST');assert.equal((await b).title,'SECOND')
  assert.equal(f.store.get('source').title,'SECOND')
  f.source._emitUpdate({sessionUpdate:'session_info_update',title:'child title'},{sessionId:'nested'})
  assert.equal(f.source.title,'SECOND')
  f.source._emitUpdate({sessionUpdate:'session_info_update',title:'remote root title'},{sessionId:'remote-0'})
  assert.equal(f.source.title,'remote root title');assert.equal(f.store.get('source').title,'remote root title')
  const restored=new AcpStore({storePath:f.store.path});assert.equal(restored.get('source').title,'remote root title')
})

test('title unsupported, ambiguous failure and persistence failure never report false success',async t=>{
  const f=await fixture(t);await f.source.setTitle('previous')
  f.source.capabilities=normalizeCapabilities({agentCapabilities:{sessionCapabilities:{title:null}}})
  await assert.rejects(f.source.setTitle('x'),{code:'title_unsupported'});assert.equal(f.source.title,'previous')
  f.source.capabilities=normalizeCapabilities(initialize)
  f.controllers[0].setTitle=async()=>{throw Error('lost after write')}
  await assert.rejects(f.source.setTitle('unknown'),/lost after write/)
  assert.equal(f.source.title,'previous');assert.equal(f.source.titleStatus.outcome,'unknown')
  f.controllers[0].setTitle=async()=>({title:'remote normalized'})
  const persist=f.source.opts.persistMetadata;f.source.opts.persistMetadata=()=>{throw Error('disk full')}
  await assert.rejects(f.source.setTitle('attempt'),/disk full/)
  assert.equal(f.source.title,'previous');assert.equal(f.source.titleStatus.remoteTitle,'remote normalized');assert.equal(f.source.titleStatus.persistenceFailed,true)
  f.source.opts.persistMetadata=persist
})

test('timed-out title never overlaps a queued rename and remains explicitly unknown',async t=>{
  const f=await fixture(t),gate=deferred();let calls=0
  const keepAlive=setInterval(()=>{},1000);t.after(()=>clearInterval(keepAlive))
  f.source.startTimeoutMs=10;f.controllers[0].setTitle=()=>{calls++;return gate.promise}
  const first=f.source.setTitle('first'),queued=f.source.setTitle('second')
  const one=assert.rejects(first,{code:'timeout'}),two=assert.rejects(queued,{code:'title_outcome_unknown'})
  await Promise.all([one,two]);assert.equal(calls,1);assert.equal(f.source.titleStatus.outcome,'unknown')
  await assert.rejects(f.source.setTitle('third'),{code:'title_outcome_unknown'})
  gate.resolve({title:'late'});await tick();assert.equal(f.source.title,null)
})

test('fork copies display-only stable history with independent IDs; source and request ledger remain untouched',async t=>{
  const f=await fixture(t)
  await f.source.setTitle('Parent');await f.source.prompt('remember this',{requestId:'dedupe-parent'})
  await tick();f.source._emit({type:'text',text:'answer',turnId:'original-turn'})
  f.source._emit({type:'permission',requestId:'obsolete',options:[]})
  const parent=structuredClone(f.store.get('source')),journal=readFileSync(f.store.historyPath('source'),'utf8')
  const child=await f.runtime.fork('source',{id:'child',operationId:'fork-1',remotePath:'/remote/fork',cursor:f.source.state().cursor})
  assert.notEqual(child.sessionId,f.source.sessionId);assert.notEqual(child.generation,f.source.generation)
  assert.equal(child.requests.size,0);assert.equal(child.pendingTurns,0);assert.equal(child.broker.list().length,0);assert.equal(child.pendingElicitations.size,0)
  assert.equal(child.title,'Parent');assert.equal(child.forkOrigin.cut.seq,f.source.eventSeq)
  const inherited=child.eventsSince(null).events.filter(e=>e.inherited)
  assert.equal(inherited.find(e=>e.type==='user_message').text,'remember this');assert.equal(inherited.some(e=>e.type==='permission'),false)
  assert.equal(inherited[0].seq,1);assert.equal(inherited[0].generation,child.generation);assert.equal(inherited[0].requestId,undefined);assert.equal(inherited[0].origin.id,'source')
  assert.deepEqual(f.store.get('source'),parent);assert.equal(readFileSync(f.store.historyPath('source'),'utf8'),journal)
  assert.equal(f.runtime.forkOperation('fork-1').outcome,'completed')
  await f.runtime.bindDshSession(child.id,'dsh-child');assert.equal(f.store.get(child.id).dshSessionId,'dsh-child')
  await child.prompt('new child turn',{requestId:'dedupe-parent'});await tick();assert.equal(child.requests.size,1)
  assert.equal(f.calls.filter(c=>c[0]==='fork').length,1)
  await assert.rejects(f.runtime.fork('source',{operationId:'fork-1'}),{code:'fork_operation_exists'})
})

test('fork retains executed and cancelled queue history with display-only request correlation across generations',async t=>{
  const f=await fixture(t),turns=[]
  f.controllers[0].prompt=()=>{const gate=deferred();turns.push(gate);return gate.promise}
  const active=f.source.prompt('active',{requestId:'active'})
  const executed=f.source.prompt('queued then executed',{requestId:'executed'})
  turns[0].resolve({stopReason:'end_turn'});await active;await tick()
  turns[1].resolve({stopReason:'end_turn'});await executed;await tick()
  const interrupted=f.source.prompt('active then cancelled',{requestId:'interrupted'})
  const cancelled=f.source.prompt('queued then cancelled',{requestId:'cancelled'})
  f.controllers[0].cancel=async()=>{turns.at(-1).resolve({stopReason:'cancelled'});return true}
  await f.source.cancel();await Promise.all([interrupted,cancelled]);await tick()
  const child=await f.runtime.fork('source',{operationId:'queue-history'})
  const history=child.eventsSince(null).events.filter(e=>e.inherited)
  const key=id=>'inherited:source:'+id
  const submitted=history.filter(e=>e.displayRequestId===key('executed'))
  assert.deepEqual(submitted.map(e=>e.type),['user_message','turn_start','stop'])
  assert.equal(submitted[0].queued,true);assert.equal(submitted[1].submitted,true);assert.equal(submitted[2].stopReason,'end_turn')
  const stopped=history.filter(e=>e.displayRequestId===key('cancelled'))
  assert.deepEqual(stopped.map(e=>e.type),['user_message','error','stop'])
  assert.equal(stopped[0].queued,true);assert.equal(stopped[1].code,'cancelled');assert.equal(stopped[2].submitted,false);assert.equal(stopped[2].stopReason,'cancelled')
  assert.equal(history.some(e=>Object.hasOwn(e,'requestId')),false)
  assert.equal(child.requests.size,0);assert.deepEqual(f.store.get(child.id).requests,[])
  assert.equal(child.turnQueue.length,0);assert.equal(child.pendingTurns,0);assert.equal(child.activeTurn,null)
  assert.equal(child.broker.list().length,0);assert.equal(child.pendingElicitations.size,0)
  const grandchild=await f.runtime.fork(child.id,{operationId:'queue-history-again'})
  const inheritedAgain=grandchild.eventsSince(null).events.filter(e=>e.inherited)
  assert.deepEqual(inheritedAgain.map(e=>[e.type,e.displayRequestId]),history.map(e=>[e.type,e.displayRequestId]))
  assert.equal(inheritedAgain.some(e=>Object.hasOwn(e,'requestId')),false)
  assert.equal(grandchild.requests.size,0);assert.deepEqual(f.store.get(grandchild.id).requests,[])
  assert.equal(grandchild.turnQueue.length,0);assert.equal(grandchild.broker.list().length,0)
})

test('fork retains normalized state and unknown native update cards without inheriting active metadata',async t=>{
  const f=await fixture(t)
  f.source._emitUpdate({sessionUpdate:'agent_message',content:[{type:'text',text:'normalized full message'}]},{sessionId:f.source.sessionId})
  f.source._emitUpdate({sessionUpdate:'agent_thought',content:[{type:'text',text:'normalized full thought'}]},{sessionId:f.source.sessionId})
  f.source._emitUpdate({sessionUpdate:'state_update',state:'idle'},{sessionId:f.source.sessionId})
  f.source._emitUpdate({sessionUpdate:'future_native_update',custom:{detail:'retain this native card'}},{sessionId:f.source.sessionId})
  f.source._emitUpdate({sessionUpdate:'available_commands_update',availableCommands:[{name:'old-command',description:'source only'}]},{sessionId:f.source.sessionId})
  f.source._emitUpdate({sessionUpdate:'prompt_suggestions_update',suggestions:[{prompt:[{type:'text',text:'source suggestion'}]}]},{sessionId:f.source.sessionId})
  const child=await f.runtime.fork('source',{operationId:'normalized-history'})
  const inherited=child.eventsSince(null).events.filter(e=>e.inherited)
  assert.deepEqual(inherited.map(e=>e.type),['text','thought','state','update'])
  assert.equal(inherited[0].text,'normalized full message');assert.equal(inherited[1].text,'normalized full thought')
  assert.equal(inherited[2].native,'state_update')
  assert.equal(inherited[3].sessionUpdate,'future_native_update')
  assert.equal(inherited[3].update.custom.detail,'retain this native card')
  assert.equal(child.status,'ready');assert.equal(child.busy,false);assert.deepEqual(child.commands,[])
  assert.equal(inherited.some(e=>['agent_message','agent_thought','commands','suggestions'].includes(e.type)),false)
})

test('fork preserves distinct inherited root/child chunk origins and configured workspace path',async t=>{
  const f=await fixture(t)
  f.source.configuredRemotePath='~'
  f.source._emit({type:'text',text:'root chunk',sessionId:f.source.sessionId,turnId:'shared-turn'})
  f.source._emit({type:'text',text:'nested chunk',sessionId:'nested-agent',turnId:'shared-turn'})
  f.source._emit({type:'text',text:'nested continuation',sessionId:'nested-agent',turnId:'shared-turn'})
  const child=await f.runtime.fork('source',{operationId:'origins'})
  const chunks=child.eventsSince(null).events.filter(e=>e.inherited&&e.type==='text')
  assert.equal(chunks.length,3)
  assert.equal(chunks[0].sessionId,child.generation+':inherited:'+f.source.sessionId)
  assert.equal(chunks[1].sessionId,child.generation+':inherited:nested-agent')
  assert.notEqual(chunks[0].sessionId,chunks[1].sessionId)
  assert.equal(chunks[1].sessionId,chunks[2].sessionId)
  assert.equal(chunks[1].rootSessionId,chunks[0].sessionId)
  assert.equal(chunks[2].rootSessionId,chunks[0].sessionId)
  assert.equal(chunks[0].turnId,chunks[1].turnId)
  assert.equal(chunks[1].origin.sessionId,'nested-agent');assert.equal(chunks[1].origin.rootSessionId,f.source.sessionId)
  assert.equal(child.configuredRemotePath,'~');assert.equal(f.store.get(child.id).configuredRemotePath,'~')
  const explicit=await f.runtime.fork('source',{operationId:'configured',configuredRemotePath:'~/other-alias'})
  assert.equal(explicit.configuredRemotePath,'~/other-alias');assert.equal(f.store.get(explicit.id).configuredRemotePath,'~/other-alias')
})

test('fork rejects busy, unsupported, nonlatest and nonabsolute requests before remote dispatch',async t=>{
  const f=await fixture(t)
  await assert.rejects(f.runtime.fork('source',{cursor:{generation:f.source.generation,seq:0}}),{code:'fork_cut_unsupported'})
  await assert.rejects(f.runtime.fork('source',{cursorId:'dsh-seq'}),{code:'fork_cut_unsupported'})
  await assert.rejects(f.runtime.fork('source',{remotePath:'~/relative'}),{code:'bad_remote_path'})
  f.source.configChanging=1;await assert.rejects(f.runtime.fork('source'),{code:'fork_busy'});f.source.configChanging=0
  f.source.modeChanging=true;await assert.rejects(f.runtime.fork('source'),{code:'fork_busy'});f.source.modeChanging=false
  const approval=f.source.handlePermissionRequest({options:[{optionId:'a',kind:'allow_once'}]},'approval')
  await assert.rejects(f.runtime.fork('source'),{code:'fork_busy'});f.source.broker.cancelAll();await approval
  const form=f.source.handleElicitationRequest({mode:'form',message:'x',requestedSchema:{type:'object',properties:{}}},'form')
  await assert.rejects(f.runtime.fork('source'),{code:'fork_busy'});f.source._cancelElicitations();await form
  f.source.capabilities=normalizeCapabilities({})
  await assert.rejects(f.runtime.fork('source'),{code:'fork_unsupported'})
  assert.equal(f.controllers.length,1)
})

test('fork excludes prompt, steer, config, mode, title, cancel and close until child completes',async t=>{
  const forkGate=deferred(),f=await fixture(t,{forkGate})
  const pending=f.runtime.fork('source',{operationId:'held'})
  assert.equal(f.source.forking,true)
  for(const action of [()=>f.source.prompt('race'),()=>f.source.steer('race'),()=>f.source.setConfig('model','m2'),()=>f.source.setMode('plan'),()=>f.source.setTitle('race'),()=>f.source.cancel(),()=>f.source.close(),()=>f.runtime.close('source'),()=>f.runtime.shutdownSession('source')]) await assert.rejects(action(),{code:'fork_busy'})
  await assert.rejects(f.runtime.fork('source',{operationId:'other'}),{code:'fork_busy'})
  forkGate.resolve();await pending;assert.equal(f.source.forking,false)
})

test('fork confirms mode/model/reasoning individually and never applies default privilege over source',async t=>{
  const f=await fixture(t,{forkResponse:response('remote-child','bypassPermissions','m2','high')})
  const child=await f.runtime.fork('source',{operationId:'config'})
  assert.equal(child.config.mode,'acceptEdits');assert.equal(child.permissionMode,'acceptEdits');assert.equal(child.config.model,'m1');assert.equal(child.config.reasoningEffort,'medium')
  assert.deepEqual(f.calls.filter(c=>c[1]===1&&['mode','config'].includes(c[0])),[['mode',1,'acceptEdits'],['config',1,'model','m1'],['config',1,'effort','medium']])
})

test('fork refuses stale bypass config after a failed permission change',async t=>{
  const f=await fixture(t);await f.source.setMode('bypass')
  f.controllers[0].setMode=async()=>{throw Error('mode outcome unknown')}
  await assert.rejects(f.source.setMode('plan'),/mode outcome unknown/)
  assert.equal(f.source.config.mode,'bypassPermissions');assert.equal(f.source.permissionMode,'default')
  await assert.rejects(f.runtime.fork('source'),{code:'fork_config_unconfirmed'})
  assert.equal(f.controllers.length,1)
})

test('unknown fork response retains operation ledger across reload and never blindly retries',async t=>{
  const f=await fixture(t,{forkError:Error('lost fork response')})
  await assert.rejects(f.runtime.fork('source',{id:'lost-child',operationId:'lost'}),error=>error.operationId==='lost'&&error.outcome==='unknown')
  assert.equal(f.runtime.forkOperation('lost').outcome,'unknown')
  assert.equal(new AcpStore({storePath:f.store.path}).getForkOperation('lost').outcome,'unknown')
  await assert.rejects(f.runtime.fork('source',{operationId:'lost'}),{code:'fork_operation_exists'})
  assert.equal(f.calls.filter(c=>c[0]==='fork').length,1);assert.equal(f.calls.some(c=>c[0]==='close'&&c[1]===1),false)
})

test('local persistence failure after remote creation preserves recovery identity without refork',async t=>{
  const f=await fixture(t),save=f.store.saveForkOperation.bind(f.store)
  f.store.saveForkOperation=op=>{if(op.outcome==='remoteCreated')throw Error('disk failed after remote creation');return save(op)}
  await assert.rejects(f.runtime.fork('source',{operationId:'disk'}),error=>error.outcome==='localCommitFailed'&&error.remoteSessionId==='remote-1')
  const op=f.runtime.forkOperation('disk');assert.equal(op.outcome,'localCommitFailed');assert.equal(op.remoteSessionId,'remote-1')
  assert.equal(new AcpStore({storePath:f.store.path}).getForkOperation('disk').remoteSessionId,'remote-1')
  await assert.rejects(f.runtime.fork('source',{operationId:'disk'}),{code:'fork_operation_exists'})
})

test('same remote ID cannot masquerade as a fork',async t=>{
  const f=await fixture(t,{forkResponse:response('remote-0')})
  await assert.rejects(f.runtime.fork('source',{operationId:'same'}),{code:'fork_invalid_response',outcome:'unknown'})
  assert.equal(f.source.sessionId,'remote-0')
})

test('runtime shutdown interrupts local fork work and disposes independent controllers',async t=>{
  const gate=deferred(),f=await fixture(t,{forkGate:gate})
  const pending=f.runtime.fork('source',{operationId:'shutdown'})
  for(let i=0;i<20&&!f.calls.some(c=>c[0]==='fork');i++)await tick()
  assert.equal(f.calls.filter(c=>c[0]==='fork').length,1)
  const shutdown=f.runtime.shutdown();gate.resolve()
  await assert.rejects(pending,{code:'runtime_shutdown'});await shutdown
  assert.deepEqual(new Set(f.calls.filter(c=>c[0]==='dispose').map(c=>c[1])),new Set([0,1]))
  assert.equal(f.runtime.sessions.size,0)
})

test('fork history pages beyond memory buffer and survives source deletion',async t=>{
  const f=await fixture(t);f.source.maxEvents=3
  for(let i=0;i<1005;i++)f.source._emit({type:'text',text:'line-'+i})
  const child=await f.runtime.fork('source',{operationId:'long'})
  const first=child.eventsSince(null,{limit:1000}),last=child.eventsSince(first.cursor,{limit:1000})
  assert.equal(first.hasMore,true);assert.equal(first.events.length,1000)
  assert.equal(first.events[0].text,'line-0');assert.equal(last.events.filter(e=>e.inherited).length,5)
  await f.runtime.close('source')
  assert.equal(child.eventsSince(null).events[0].text,'line-0')
})

test('missing fork config cannot silently adopt unconfirmed settings',async t=>{
  const f=await fixture(t,{forkResponse:{sessionId:'remote-child',modes:response('unused').modes}})
  await assert.rejects(f.runtime.fork('source',{operationId:'unconfirmed'}),{code:'fork_config_unconfirmed',outcome:'localCommitFailed',remoteSessionId:'remote-child'})
  assert.equal(f.runtime.forkOperation('unconfirmed').remoteSessionId,'remote-child')
  assert.equal(f.calls.some(c=>c[0]==='prompt'&&c[1]===1),false)
})

test('real SDK pipeline gates child fork support after initialize without creating a session',async t=>{
  const sdk=await import('@agentclientprotocol/sdk'),unstable=await import('@agentclientprotocol/sdk/unstable'),rpc=[]
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true
  let connection,submitted=false
  const spawn=()=>{
    connection=unstable.agent().onRequest('initialize',()=>({protocolVersion:1,agentCapabilities:{sessionCapabilities:{fork:null}}}))
      .onRequest('session/fork',()=>{rpc.push('fork');return response('wrong')})
      .onRequest('session/new',()=>{rpc.push('new');return response('wrong')})
      .connect(sdk.ndJsonStream(Writable.toWeb(child.stdout),Readable.toWeb(child.stdin)))
    queueMicrotask(()=>child.stderr.write('[dsh-acp-runtime] '+JSON.stringify({type:'ready',cwd:'/remote'})+'\n'))
    return child
  }
  const controller=await connectAcp({sdk,spawn,launchSpec:buildRemoteAcpLaunchSpec({profile,remotePath:'/remote'}),forkSessionId:'source',onForkSubmitted(){submitted=true}})
  t.after(async()=>{await controller.dispose();connection.close()})
  await assert.rejects(controller.ready,{code:'fork_unsupported'})
  assert.equal(submitted,false);assert.deepEqual(rpc,[])
})

for(const scenario of ['success','unsupported','unknown']) test(`real SDK cold/archive title ${scenario}: initialize→set_title→dispose only`,async t=>{
  const sdk=await import('@agentclientprotocol/sdk'),unstable=await import('@agentclientprotocol/sdk/unstable'),dir=temporary(t),rpc=[],connections=[]
  let count=0
  const spawn=()=>{
    const n=count++,child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true
    const server=unstable.agent().onRequest('initialize',()=>{rpc.push([n,'initialize']);return n&&scenario==='unsupported'?{protocolVersion:1,agentCapabilities:{sessionCapabilities:{title:null}}}:initialize})
      .onRequest('session/new',()=>{rpc.push([n,'session/new']);return response('cold-remote')})
      .onRequest('session/resume',()=>{rpc.push([n,'session/resume']);return response('cold-remote')})
      .onRequest('session/close',()=>{rpc.push([n,'session/close']);return {}})
      .onRequest('session/set_mode',()=>{rpc.push([n,'session/set_mode']);return {}})
      .onRequest('session/set_title',ctx=>{rpc.push([n,'session/set_title',ctx.params]);if(scenario==='unknown')throw Error('partial remote title write failed');return {title:ctx.params.title.trim()}})
    connections.push(server.connect(sdk.ndJsonStream(Writable.toWeb(child.stdout),Readable.toWeb(child.stdin))))
    queueMicrotask(()=>child.stderr.write('[dsh-acp-runtime] '+JSON.stringify({type:'ready',cwd:'/remote/cold'})+'\n'))
    return child
  }
  const runtime=createAcpRuntime({storePath:join(dir,'sessions.json'),sdk,spawn,startTimeoutMs:1000,getProfile:id=>id===profile.id?profile:null})
  t.after(async()=>{await runtime.shutdown();for(const c of connections)c.close()})
  const source=await runtime.create({id:'cold',profile,remotePath:'/remote/cold'})
  await runtime.shutdownSession(source.id)
  runtime.store.upsert({...runtime.store.get(source.id),title:'previous',archived:true})
  const before=structuredClone(runtime.store.get(source.id)),journal=readFileSync(runtime.store.historyPath(source.id),'utf8')
  if(scenario==='success')assert.equal((await runtime.setTitle(source.id,' Cold title ')).title,'Cold title')
  else await assert.rejects(runtime.setTitle(source.id,' Cold title '),error=>error.titleStatus?.outcome===(scenario==='unsupported'?'failed':'unknown'))
  const after=runtime.store.get(source.id)
  assert.equal(after.title,scenario==='success'?'Cold title':'previous');assert.equal(after.archived,true)
  assert.deepEqual(after.config,before.config);assert.deepEqual(after.requests,before.requests);assert.equal(after.permission,before.permission);assert.equal(after.eventSeq,before.eventSeq)
  assert.equal(readFileSync(runtime.store.historyPath(source.id),'utf8'),journal)
  assert.deepEqual(rpc.filter(c=>c[0]===1).map(c=>c[1]),scenario==='unsupported'?['initialize']:['initialize','session/set_title'])
  if(scenario!=='unsupported')assert.deepEqual(rpc.find(c=>c[0]===1&&c[1]==='session/set_title')[2],{sessionId:'cold-remote',title:' Cold title '})
  assert.equal(runtime.sessions.size,0);assert.equal(count,2)
  assert.equal(new AcpStore({storePath:runtime.store.path}).get(source.id).titleStatus.outcome,scenario==='success'?'confirmed':scenario==='unsupported'?'failed':'unknown')
})

test('cold title without a profile fails durably without connecting or preparing',async t=>{
  const f=await fixture(t);await f.runtime.shutdownSession('source')
  await assert.rejects(f.runtime.setTitle('source','offline title'),{code:'profile_missing'})
  assert.equal(f.store.get('source').titleStatus.outcome,'failed');assert.equal(f.controllers.length,1)
})

for(const agent of ['claude','codex']) test(`real SDK pipe ${agent}: independent initialize→fork (no new/resume/history replay) and set_title exact contracts`,async t=>{
  const sdk=await import('@agentclientprotocol/sdk'), unstable=await import('@agentclientprotocol/sdk/unstable'),dir=temporary(t),connections=[],rpc=[]
  let count=0
  const spawn=()=>{
    const n=count++,child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true
    const server=unstable.agent().onRequest('initialize',()=>{rpc.push([n,'initialize']);return initialize})
      .onRequest('session/new',ctx=>{rpc.push([n,'session/new',ctx.params]);return response('pipe-source')})
      .onRequest('session/fork',ctx=>{rpc.push([n,'session/fork',ctx.params]);return response('pipe-child')})
      .onRequest('session/set_mode',ctx=>{rpc.push([n,'session/set_mode',ctx.params]);return {}})
      .onRequest('session/set_title',ctx=>{rpc.push([n,'session/set_title',ctx.params]);return {title:ctx.params.title.trim()}})
      .onRequest('session/prompt',ctx=>{rpc.push([n,'session/prompt',ctx.params]);return {stopReason:'end_turn'}})
    connections.push(server.connect(sdk.ndJsonStream(Writable.toWeb(child.stdout),Readable.toWeb(child.stdin))))
    queueMicrotask(()=>child.stderr.write('[dsh-acp-runtime] '+JSON.stringify({type:'ready',cwd:n?'/remote/child':'/remote/source'})+'\n'))
    return child
  }
  const runtime=createAcpRuntime({storePath:join(dir,'sessions.json'),sdk,spawn,startTimeoutMs:1000})
  t.after(async()=>{await runtime.shutdown();for(const c of connections)c.close()})
  const source=await runtime.create({id:'source',profile,agent,remotePath:'/remote/source'})
  await source.prompt('parent history');await tick()
  const child=await runtime.fork(source.id,{operationId:'pipe',remotePath:'/remote/child',dshSessionId:'new-dsh'})
  assert.deepEqual(rpc.filter(c=>c[0]===1).map(c=>c[1]),['initialize','session/fork'])
  assert.deepEqual(rpc.find(c=>c[1]==='session/fork')[2],{sessionId:'pipe-source',cwd:'/remote/child',mcpServers:[]})
  assert.equal((await child.setTitle(' normalized ')).title,'normalized')
  assert.deepEqual(rpc.find(c=>c[1]==='session/set_title')[2],{sessionId:'pipe-child',title:' normalized '})
  assert.equal(child.eventsSince(null).events.find(e=>e.inherited&&e.type==='user_message').text,'parent history')
  assert.equal(count,2);assert.equal(rpc.filter(c=>c[1]==='session/prompt').length,1)
  await child.prompt('first independent turn');await tick()
  assert.equal(rpc.filter(c=>c[1]==='session/prompt').at(-1)[2].sessionId,'pipe-child')
})
