import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { AcpSession, AcpStore, createAcpRuntime, mapSessionUpdate, mapToolCall, pickAutoPermissionOption } from '../lib/acp.js'

const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
const tick = () => new Promise(resolve => setImmediate(resolve))
const profile = { id: 'p', host: 'example.invalid', user: 'alice', authMethod: 'kerberos' }
function fixture(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-acp-runtime-'))
  t.after(() => { assert.equal(dirname(resolve(dir)), resolve(tmpdir())); rmSync(dir, { recursive: true, force: true }) })
  const calls = [], prompts = [], modes = [], configs = [], controllers = []
  const create = (options = {}) => {
    const controller = {
      prompt(value) { calls.push(value); const gate = defer(); prompts.push(gate); return gate.promise },
      async steer() { return {outcome:'injected'} },
      async cancel() { prompts.at(-1)?.resolve({stopReason:'cancelled'}); return true },
      async setMode(id) { modes.push(id); return {} },
      async setConfig(id,value) { configs.push({id,value}); return {configOptions:[{id:'model',category:'model',type:'select',currentValue:value,options:[{value:'m1'},{value:'m2'}]}]} },
      async dispose() { this.disposed = true },
      async close() { this.closed = true },
      ready: Promise.resolve({sessionId:'remote-1', sessionResponse:{sessionId:'remote-1',modes:{currentModeId:'default',availableModes:['default','plan','acceptEdits','bypassPermissions'].map(id=>({id}))},configOptions:[{id:'model',category:'model',type:'select',currentValue:'m1',options:[{value:'m1'},{value:'m2'}]}]},initialize:{agentCapabilities:{promptCapabilities:{image:true,audio:true,embeddedContext:true}},_meta:{steering:{supported:true}}}}),
      ...options
    }
    controllers.push(controller)
    return controller
  }
  const base = {profile,agent:'claude',cwd:dir,remotePath:'/remote',permission:'acceptEdits',startTimeoutMs:1000,...overrides}
  const controller = create()
  const session = new AcpSession({...base,connectImpl:()=>controller})
  return {dir,base,session,controller,create,controllers,calls,prompts,modes,configs}
}

test('startup applies advertised permission and unsupported mode never claims success', async t => {
  const f=fixture(t,{permission:'bypass'})
  await f.session.start()
  assert.deepEqual(f.modes,['bypassPermissions'])
  assert.equal(f.session.state().permission,'bypass')
  await f.session.setMode('plan')
  assert.equal(f.session.permissionMode,'plan')
  f.session._emitUpdate({sessionUpdate:'current_mode_update',currentModeId:'bypassPermissions'},{sessionId:'child'})
  assert.equal(f.session.permissionMode,'plan');assert.equal(f.session.config.mode,'plan')
  const pending=f.session.handlePermissionRequest({options:[{optionId:'a',kind:'allow_once'}]},'approval')
  assert.equal(f.session.broker.list().length,1)
  await f.session.permission({requestId:'approval',optionId:'a'})
  assert.equal((await pending).outcome.optionId,'a')
  assert.equal(pickAutoPermissionOption([{optionId:'unknown',kind:'custom'}]),null)
  const c=f.create({ready:Promise.resolve({sessionId:'s',sessionResponse:{sessionId:'s',modes:{currentModeId:'default',availableModes:[{id:'default'}]}},initialize:{}})})
  const s=new AcpSession({...f.base,permission:'plan',connectImpl:()=>c})
  await assert.rejects(s.start(),{code:'mode_unsupported'})
  assert.equal(s.permissionStatus.applied,false)
  assert.equal(c.closed,true)
})

test('leaving bypass disables auto approval before RPC settles and after ambiguous failure', async t => {
  const f=fixture(t,{permission:'bypass'}); await f.session.start()
  const change=defer(); f.controller.setMode=()=>change.promise
  const changing=f.session.setMode('plan')
  const permission=f.session.handlePermissionRequest({options:[{optionId:'a',kind:'allow_once'}]},'p')
  assert.equal(f.session.broker.list().length,1)
  change.reject(new Error('lost response'))
  await assert.rejects(changing,/lost response/)
  assert.equal(f.session.permissionMode,'default')
  assert.equal(f.session.broker.list().length,1)
  f.session.broker.cancelAll(); assert.equal((await permission).outcome.outcome,'cancelled')
})

test('serial queue emits a single terminal stop per turn and keeps busy while queued', async t => {
  const f=fixture(t); await f.session.start()
  const a=f.session.prompt('a',{requestId:'a'}), b=f.session.prompt('b',{requestId:'b'}), c=f.session.prompt('c',{requestId:'c'})
  await tick(); assert.deepEqual(f.calls,['a']); assert.equal(f.session.pendingTurns,3)
  f.prompts[0].resolve({stopReason:'end_turn'}); const ar=await a; await tick()
  assert.deepEqual(f.calls,['a','b'])
  const firstStop=f.session.bufferedEvents().find(e=>e.type==='stop'&&e.turnId===ar.turnId)
  assert.equal(firstStop.busy,true); assert.equal(firstStop.pendingTurns,2)
  f.prompts[1].resolve({stopReason:'end_turn'}); await b; await tick()
  f.prompts[2].resolve({stopReason:'end_turn'}); const cr=await c; await tick()
  const stops=f.session.bufferedEvents().filter(e=>e.type==='stop')
  assert.equal(stops.length,3); assert.equal(new Set(stops.map(e=>e.turnId)).size,3)
  assert.equal(stops.at(-1).turnId,cr.turnId); assert.equal(f.session.busy,false)
})

test('cancel clears explicit queued turns while unsupported steering refuses without calling extension', async t => {
  const f=fixture(t); await f.session.start(); f.session.capabilities.steering.supported=false
  let steeringCalls=0; f.controller.steer=()=>{steeringCalls++;throw Error('must not be called')}
  const a=f.session.prompt('active'); await tick()
  await assert.rejects(f.session.steer('queued',{requestId:'not-injected'}),{code:'steering_unsupported'})
  const queued=await f.session.queue('queued',{requestId:'q'})
  assert.equal(queued.outcome,'queued'); assert.equal(steeringCalls,0); assert.deepEqual(f.calls,['active'])
  const cancelled=await f.session.cancel(); await a; await tick()
  assert.equal(cancelled.cancelledQueued,1); assert.deepEqual(f.calls,['active'])
  const terminal=f.session.bufferedEvents().filter(e=>e.type==='stop')
  assert.equal(terminal.length,2); assert.deepEqual(terminal.map(e=>e.stopReason),['cancelled','cancelled'])
  assert.equal(terminal[0].submitted,false)
})

test('ambiguous steering result/error never resends and request ids deduplicate submission', async t => {
  const f=fixture(t); await f.session.start()
  const a=f.session.prompt('active',{requestId:'one'}), duplicate=f.session.prompt('active',{requestId:'one'})
  await tick(); assert.deepEqual(f.calls,['active'])
  f.controller.steer=async()=>{throw Error('connection lost')}
  await assert.rejects(f.session.steer('maybe injected',{requestId:'steer'}),{code:'steering_unknown'})
  await assert.rejects(f.session.steer('maybe injected',{requestId:'steer'}),{code:'request_outcome_unknown'})
  f.controller.steer=async()=>({outcome:'failed'})
  await assert.rejects(f.session.steer('unknown'),{code:'steering_unknown'})
  assert.equal(f.session.pendingTurns,1); assert.deepEqual(f.calls,['active'])
  await f.session.cancel(); assert.equal((await a).turnId,(await duplicate).turnId)
  assert.equal((await f.session.prompt('active',{requestId:'one'})).stopReason,'cancelled')
  const ack=f.session.bufferedEvents().filter(e=>e.type==='request_ack').at(-1)
  assert.equal(ack.requestId,'one');assert.equal(ack.delivery,'accepted');assert.equal(ack.deduplicated,true)
  assert.deepEqual(f.calls,['active'])
})

test('failed turn blocks queued execution with terminal error and stop for each turn', async t => {
  const f=fixture(t); await f.session.start()
  const first=f.session.prompt('first'), queued=f.session.prompt('second'); await tick()
  f.prompts[0].reject(new Error('lost transport'))
  await assert.rejects(first,/lost transport/); assert.equal((await queued).stopReason,'cancelled'); await tick()
  assert.deepEqual(f.calls,['first']); assert.equal(f.session.status,'error')
  assert.equal(f.session.bufferedEvents().filter(e=>e.type==='stop').length,2)
  assert.equal(f.controller.disposed,true)
})

test('attachments and commands are capability-driven and preserve native payload', async t => {
  const f=fixture(t); await f.session.start()
  const prompt=f.session.prompt('review',{attachments:[{name:'a.txt',mimeType:'text/plain',text:'contents'},{type:'image',mimeType:'image/png',data:'AA=='}]})
  await tick(); assert.deepEqual(f.calls[0],[{type:'text',text:'review'},{type:'resource',resource:{uri:'attachment:a.txt',mimeType:'text/plain',text:'contents'}},{type:'image',mimeType:'image/png',data:'AA=='}])
  f.prompts[0].resolve({stopReason:'end_turn'}); await prompt
  f.session.capabilities.agentCapabilities.promptCapabilities.image=false
  await assert.rejects(f.session.prompt('x',{attachments:[{type:'image',mimeType:'image/png',data:'AA=='}]}),{code:'attachment_unsupported'})
  await assert.rejects(f.session.prompt('x',{attachments:[{path:'/unvalidated/local'}]}),{code:'attachment_unsupported'})
  await assert.rejects(f.session.command('unknown'),{code:'command_unsupported'})
  f.session._emitUpdate({sessionUpdate:'available_commands_update',availableCommands:[{name:'review',description:'Review'}]})
  const command=f.session.command('/review','changes'); await tick(); assert.equal(f.calls[1],'/review changes')
  f.prompts[1].resolve({stopReason:'end_turn'}); await command
  const attachmentOnly=f.session.prompt('',{attachments:[{name:'note.txt',mimeType:'text/plain',text:'note'}]})
  await tick();assert.equal(f.calls[2][0].type,'resource')
  const user=f.session.bufferedEvents().filter(e=>e.type==='user_message').at(-1)
  assert.deepEqual(user.attachments,[{name:'note.txt',type:'resource',mimeType:'text/plain'}])
  f.prompts[2].resolve({stopReason:'end_turn'});await attachmentOnly
})

test('binding create/resume are singleflight and replace preserves previous history', async t => {
  const f=fixture(t), gate=defer(); let starts=0
  const storePath=join(f.dir,'sessions.json')
  const rt=createAcpRuntime({...f.base,storePath,connectImpl:()=>{starts++; const c=f.create();c.ready=c.ready.then(async ready=>{await gate.promise;return ready});return c}})
  const args={...f.base,dshSessionId:'dsh',workspaceId:'workspace'}
  const one=rt.create(args),two=rt.create(args); await tick(); gate.resolve()
  const [a,b]=await Promise.all([one,two]); assert.equal(a,b); assert.equal(starts,1)
  await assert.rejects(rt.create({...args,agent:'codex'}),{code:'binding_conflict'})
  assert.equal(rt.get(a.id),a)
  const replacement=await rt.create({...args,agent:'codex',replace:true})
  assert.notEqual(replacement.id,a.id); assert.ok(rt.store.get(a.id)); assert.equal(rt.list({dshSessionId:'dsh'}).length,2)
  await rt.shutdown(); assert.equal(rt.sessions.size,0); assert.equal(rt.store.list().length,2)
  const rt2=createAcpRuntime({...f.base,storePath,getProfile:()=>profile,connectImpl:()=>{starts++;return f.create()}})
  const [r1,r2]=await Promise.all([rt2.resume(replacement.id),rt2.resume(replacement.id)])
  assert.equal(r1,r2); assert.equal(starts,3)
  await rt2.close(replacement.id); assert.equal(rt2.store.get(replacement.id),null); assert.ok(rt2.store.get(a.id))
})

test('durable journal exceeds memory cap and restores generation, cursor, configuration and requests', async t => {
  const f=fixture(t),storePath=join(f.dir,'durable.json')
  const options={...f.base,storePath,maxEvents:5,getProfile:()=>profile,connectImpl:()=>f.create()}
  const rt=createAcpRuntime(options),s=await rt.create({...f.base,dshSessionId:'history'})
  await s.setConfig('model','m2'); await s.setMode('plan')
  for(let i=0;i<1105;i++) s._emit({type:'text',text:'你好🙂'+i})
  const turn=s.prompt('remember',{requestId:'remember'});await tick();f.prompts.at(-1).resolve({stopReason:'end_turn'});await turn
  const before=s.state().cursor
  assert.throws(()=>s.eventsSince(4),{code:'bad_cursor'})
  assert.throws(()=>s.eventsSince({generation:before.generation,seq:-1}),{code:'bad_cursor'})
  assert.equal(s.events.length,5)
  await rt.shutdown()
  const loaded=new AcpStore({storePath});assert.equal(loaded.get(s.id).config.model,'m2');assert.equal(loaded.get(s.id).config.mode,'plan')
  const offline=createAcpRuntime(options)
  let cursor={generation:before.generation,seq:0},texts=[],pages=0,page
  do { page=offline.events(s.id,cursor,{limit:173});texts.push(...page.events.filter(e=>e.type==='text'));cursor=page.cursor;pages++ } while(page.hasMore)
  assert.equal(texts.length,1105);assert.equal(texts[1104].text,'你好🙂1104');assert.ok(pages>6)
  assert.equal(offline.events(s.id,{generation:'stale',seq:999999}).reset,true)
  const tail=offline.events(s.id,null,{tail:true,limit:7})
  assert.equal(tail.events.length,7);assert.equal(tail.hasEarlier,true);assert.equal(tail.hasMore,false)
  const earlier=offline.events(s.id,null,{beforeSeq:tail.oldestSeq,limit:7})
  assert.equal(earlier.events.length,7);assert.ok(earlier.events.at(-1).seq<tail.oldestSeq)
  const resumed=await offline.resume(s.id)
  assert.equal(resumed.generation,before.generation);assert.ok(resumed.eventSeq>before.seq);assert.equal(resumed.config.model,'m2');assert.equal(resumed.config.mode,'plan')
  const count=f.calls.length;assert.equal((await resumed.prompt('remember',{requestId:'remember'})).stopReason,'end_turn');assert.equal(f.calls.length,count)
  assert.ok(resumed.eventsSince(before).events.length>0)
  await offline.shutdown()
})

test('journal Unicode boundaries and torn tail preserve recoverable complete events', t => {
  const f=fixture(t),store=new AcpStore({storePath:join(f.dir,'journal.json')})
  const text='🙂'.repeat(40000)
  store.appendEvent('id',{eventVersion:1,seq:1,generation:'g',type:'text',text})
  appendFileSync(store.historyPath('id'),' {"seq":2')
  store.appendEvent('id',{eventVersion:1,seq:3,generation:'g',type:'text',text:'end'})
  const history=store.readEvents('id')
  assert.equal(history.events[0].text,text);assert.deepEqual(history.events.map(e=>e.seq),[1,3]);assert.equal(history.lastSeq,3)
})

test('partial parent updates never erase relationships and agent type is not task identity', () => {
  const previous=mapToolCall({toolCallId:'child',_meta:{claudeCode:{parentToolUseId:'parent'}}})
  const update=mapToolCall({toolCallId:'child',status:'completed'})
  assert.equal(Object.hasOwn(update,'parentToolCallId'),false)
  assert.equal({...previous,...update}.parentToolCallId,'parent')
  const child=mapToolCall({toolCallId:'agent',name:'Task',rawInput:{subagent_type:'Explore'},_meta:{claudeCode:{toolResponse:{taskId:'real-task'}}}})
  assert.equal(child.subagent.agentType,'Explore');assert.equal(child.subagent.taskId,'real-task');assert.equal(child.subagent.agentId,'real-task')
  const full=mapSessionUpdate({sessionUpdate:'agent_message',messageId:'m',turnId:'t',parentToolCallId:'parent',content:[{type:'text',text:'full'}]})
  assert.equal(full.append,false);assert.equal(full.turnId,'t');assert.equal(full.parentToolCallId,'parent')
  assert.equal(mapSessionUpdate({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'chunk'}}).append,true)
})

test('public SDK transport handles child notifications and dispose never sends session/close', async t => {
  const f=fixture(t),rpc=[],notificationHandlers=new Map()
  const context={
    async request(method,params){rpc.push({method,params});if(method==='initialize')return {agentCapabilities:{}};if(method==='session/new')return {sessionId:'root',modes:{currentModeId:'default',availableModes:[{id:'acceptEdits'}]}};if(method==='session/prompt')return {stopReason:'end_turn'};return {}},
    async notify(method,params){rpc.push({method,params})}
  }
  const app={onRequest(){return this},onNotification(method,fn){notificationHandlers.set(method,fn);return this},connectWith(_stream,fn){return fn(context)}}
  const sdk={client:()=>app,ndJsonStream:()=>({})}
  const adapter=new EventEmitter();adapter.stdin=new PassThrough();adapter.stdout=new PassThrough();adapter.stderr=new PassThrough();adapter.kill=()=>true
  const s=new AcpSession({...f.base,sdk,spawn:()=>{queueMicrotask(()=>adapter.stderr.write('[dsh-acp-runtime] '+JSON.stringify({type:'ready',cwd:'/remote'})+'\n'));return adapter}})
  await s.start()
  notificationHandlers.get('session/update')({params:{sessionId:'child',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'child'}}}})
  const event=s.bufferedEvents().find(e=>e.text==='child');assert.equal(event.sessionId,'child');assert.equal(event.rootSessionId,'root')
  assert.equal((await s.prompt('hello')).stopReason,'end_turn')
  assert.deepEqual(rpc.find(r=>r.method==='session/prompt').params.prompt,[{type:'text',text:'hello'}])
  await s.dispose();assert.equal(rpc.some(r=>r.method==='session/close'),false)
})

