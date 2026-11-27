import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AcpStore, createAcpRuntime } from '../lib/acp.js'

const profile = { id:'p', host:'example.invalid', user:'alice', authMethod:'kerberos' }
const configOptions = () => [
  {id:'model',category:'model',type:'select',currentValue:'m1',options:[{value:'m1'},{value:'m2'}]},
  {id:'effort',category:'thought_level',type:'select',currentValue:'medium',options:[{value:'medium'},{value:'high'}]}
]
const response = sessionId => ({sessionId,modes:{currentModeId:'acceptEdits',availableModes:['default','plan','acceptEdits','bypassPermissions'].map(id=>({id,name:id}))},configOptions:configOptions()})
const initialize = {protocolVersion:1,agentCapabilities:{sessionCapabilities:{fork:{}}}}
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }

function temporary(t) {
  const dir=mkdtempSync(join(tmpdir(),'dsh-acp-fork-streaming-'))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  return dir
}

async function fixture(t) {
  const dir=temporary(t),calls=[]
  const connectImpl=opts=>{
    const controller={
      async setMode(){return {}},
      async setConfig(id,value){const values=configOptions();values.find(option=>option.id===id).currentValue=value;return {configOptions:values}},
      async close(){},async dispose(){}
    }
    controller.ready=Promise.resolve().then(async()=>{
      if(opts.forkSessionId) {
        calls.push(['fork',opts.forkSessionId])
        opts.onForkSubmitted?.()
        const result=response('remote-child-'+calls.length)
        opts.onForkResponse?.(result)
        return {sessionId:result.sessionId,sessionResponse:result,initialize,protocolCwd:'/remote/fork'}
      }
      return {sessionId:'remote-source',sessionResponse:response('remote-source'),initialize,protocolCwd:'/remote'}
    })
    return controller
  }
  const store=new AcpStore({storePath:join(dir,'sessions.json')})
  const runtime=createAcpRuntime({store,connectImpl,startTimeoutMs:1000})
  t.after(()=>runtime.shutdown())
  const source=await runtime.create({id:'source',profile,remotePath:'/remote',dshSessionId:'dsh-parent'})
  return {runtime,source,store,calls}
}

function readAll(read,id) {
  const events=[]
  let sinceSeq=0,page
  do {
    page=read(id,{sinceSeq,limit:997})
    events.push(...page.events)
    sinceSeq=page.events.at(-1)?.seq ?? sinceSeq
  } while(page.hasMore)
  return events
}

const DISPLAY_EVENTS = new Set([
  'user_message','text','thought','tool_call','tool_call_update','plan','plan_removed','usage','notice','compaction','compaction_chunk',
  'subagent','subagent_update','state','terminal','session_message','update','turn_start','stop','error'
])

function expectedCopy(sourceEvents,source,child,dshSessionId) {
  return sourceEvents.filter(event=>DISPLAY_EVENTS.has(event.type)).map((original,index)=>{
    const {requestId,displayRequestId:priorDisplayRequestId,turnId,rootSessionId,...display}=original
    const inheritedId=value=>child.generation+':inherited:'+value
    const displayRequestId=priorDisplayRequestId||(requestId?'inherited:'+source.id+':'+requestId:undefined)
    return {...display,inherited:true,
      ...(displayRequestId?{displayRequestId}:{}),
      origin:{id:source.id,sessionId:original.sessionId,rootSessionId,generation:original.generation,seq:original.seq,turnId,requestId,...(original.origin?{inheritedOrigin:original.origin}:{})},
      generation:child.generation,seq:index+1,sessionId:inheritedId(original.sessionId||source.sessionId),dshSessionId,
      ...(rootSessionId?{rootSessionId:inheritedId(rootSessionId)}:{}),
      ...(turnId?{turnId:child.generation+':inherited:'+turnId}:{})}
  })
}

test('large fork scans once, appends async batches, awaits ordered progress, preserves exact history and yields to the Host loop',{timeout:30000},async t=>{
  const f=await fixture(t),count=12050,childId='stream-child'
  for(let i=1;i<=count;i++) {
    const type=i%10===0?'permission':'text'
    f.source._emit({type,text:type==='text'?'line-'+i+'-'+('🙂'.repeat(80))+'-'+('x'.repeat(256)):undefined,
      requestId:i%3===0?'request-'+i:undefined,turnId:'turn-'+Math.ceil(i/50),
      sessionId:i%1000===0?'nested-agent':undefined})
  }
  const total=f.source.eventSeq,originalRead=f.store.readEvents.bind(f.store)
  const sourceEvents=readAll(originalRead,'source')
  assert.equal(sourceEvents.length,total)

  let scanned=0,scanning=true,copyBuffer
  const originalStream=f.store.streamEvents.bind(f.store)
  f.store.streamEvents=async function*(id,options) {
    if(id!=='source') { for await(const event of originalStream(id,options)) yield event; return }
    try {
      for await(const event of originalStream(id,options)) { scanned++;yield event }
    } finally { scanning=false }
  }
  f.store.readEvents=(id,options)=>{
    if(id==='source') throw Error('fork must not use quadratic readEvents pagination')
    return originalRead(id,options)
  }
  const originalAppend=f.store.appendEvent.bind(f.store)
  f.store.appendEvent=(id,event)=>{
    if(id===childId&&event.inherited) throw Error('inherited events must use async batches')
    return originalAppend(id,event)
  }
  const originalAppendEvents=f.store.appendEvents.bind(f.store),batches=[]
  f.store.appendEvents=async(id,events,serialized)=>{
    if(id===childId) {
      batches.push(events.map(event=>event.seq))
      if(serialized) assert.ok(serialized.reduce((bytes,line)=>bytes+Buffer.byteLength(line)+2,0)<=8*1024*1024)
    }
    await originalAppendEvents(id,events,serialized)
  }

  let heartbeats=0
  const heartbeat=setInterval(()=>{if(scanning)heartbeats++},1)
  t.after(()=>clearInterval(heartbeat))
  const finalStarted=deferred(),releaseFinal=deferred()
  t.after(()=>releaseFinal.resolve())
  const progress=[]
  let active=0,maxActive=0,bufferExceeded=false,monitorBuffer=true
  const pending=f.runtime.fork('source',{id:childId,operationId:'stream-large',dshSessionId:'dsh-stream-child',async onProgress(update){
    assert.equal(update.total,total)
    if(update.processed===0) {
      const events=f.runtime.sessions.get(childId).events,push=events.push.bind(events)
      events.push=(...items)=>{const result=push(...items);if(monitorBuffer&&events.length>1000)bufferExceeded=true;return result}
    }
    progress.push(update.processed)
    active++;maxActive=Math.max(maxActive,active)
    try {
      if(update.processed===total) {
        copyBuffer=f.runtime.sessions.get(childId).events.slice()
        monitorBuffer=false
        finalStarted.resolve()
        await releaseFinal.promise
      } else await Promise.resolve()
    } finally { active-- }
  }})
  await Promise.race([
    finalStarted.promise,
    pending.then(()=>{throw Error('fork reached remote start before final progress was released')},error=>{throw error})
  ])
  assert.equal(f.calls.filter(call=>call[0]==='fork').length,0)
  releaseFinal.resolve()
  const child=await pending
  clearInterval(heartbeat)

  assert.equal(scanned,total,'the complete source journal is streamed exactly once')
  assert.ok(batches.length>10,'multiple asynchronous append batches are used')
  assert.ok(batches.every(batch=>batch.length>0&&batch.length<=1000))
  assert.deepEqual(batches.flat(),Array.from({length:batches.flat().length},(_,i)=>i+1))
  assert.ok(heartbeats>0,'the event loop runs while the source journal is being scanned')
  assert.equal(maxActive,1,'async progress callbacks are awaited and never overlap')
  assert.equal(progress[0],0)
  assert.equal(progress.at(-1),total)
  assert.ok(progress.every((value,i)=>i===0||value>=progress[i-1]))

  const copied=readAll(originalRead,childId).filter(event=>event.inherited)
  const expected=expectedCopy(sourceEvents,f.source,child,'dsh-stream-child')
  assert.deepEqual(copied,JSON.parse(JSON.stringify(expected)))
  assert.equal(child.events.length,1000)
  assert.equal(bufferExceeded,false)
  assert.deepEqual(copyBuffer,expected.slice(-1000))
  assert.equal(f.runtime.forkOperation('stream-large').outcome,'completed')
})

test('external abort stops streaming before remote submission, fails durably and releases the reservation',async t=>{
  const f=await fixture(t),controller=new AbortController(),childId='aborted-child'
  for(let i=1;i<=2000;i++) f.source._emit({type:'text',text:'line-'+i})
  let reservations=0,releases=0
  f.source.reserveFork=async operation=>{reservations++;f.source.remoteForkReservation=operation}
  f.source.releaseFork=async()=>{releases++;f.source.remoteForkReservation=null}
  const originalStream=f.store.streamEvents.bind(f.store)
  f.store.streamEvents=async function*(id,options) {
    for await(const event of originalStream(id,options)) {
      if(id==='source'&&event.seq===250) controller.abort()
      yield event
    }
  }
  await assert.rejects(f.runtime.fork('source',{id:childId,operationId:'external-abort',signal:controller.signal}),error=>{
    assert.equal(error.name,'AbortError')
    assert.equal(error.outcome,'failed')
    assert.equal(error.operationId,'external-abort')
    return true
  })
  assert.equal(reservations,1)
  assert.equal(releases,1)
  assert.equal(f.source.remoteForkReservation,null)
  assert.equal(f.source.forking,false)
  assert.equal(f.runtime.forkOperation('external-abort').outcome,'failed')
  assert.equal(f.runtime.sessions.get(childId).closed,true)
  assert.equal(f.calls.filter(call=>call[0]==='fork').length,0)
  await assert.rejects(f.runtime.fork('source',{operationId:'external-abort'}),{code:'fork_operation_exists'})
})

test('interruptForks aborts active copies with runtime_shutdown and preserves uncertain reservations',async t=>{
  const f=await fixture(t),childId='interrupted-child'
  for(let i=1;i<=2000;i++) f.source._emit({type:'text',text:'line-'+i})
  let releases=0
  f.source.reserveFork=async operation=>{f.source.remoteForkReservation=operation}
  f.source.releaseFork=async()=>{releases++;f.source.remoteForkReservation=null}
  const originalStream=f.store.streamEvents.bind(f.store)
  let interrupted=0
  f.store.streamEvents=async function*(id,options) {
    for await(const event of originalStream(id,options)) {
      if(id==='source'&&event.seq===25) interrupted=f.runtime.interruptForks()
      yield event
    }
  }
  await assert.rejects(f.runtime.fork('source',{id:childId,operationId:'shutdown-interrupt'}),error=>{
    assert.equal(error.code,'runtime_shutdown')
    assert.equal(error.outcome,'unknown')
    return true
  })
  assert.equal(interrupted,1)
  assert.equal(releases,0,'an uncertain fork never releases its remote reservation')
  assert.equal(f.source.remoteForkReservation.operationId,'shutdown-interrupt')
  assert.equal(f.runtime.forkOperation('shutdown-interrupt').outcome,'unknown')
  assert.equal(f.source.forking,false)
  assert.equal(f.calls.filter(call=>call[0]==='fork').length,0)
})

test('fork batches bound actual serialized bytes even when correlation IDs are duplicated',async t=>{
  const f=await fixture(t),childId='exact-byte-child',original=f.store.appendEvents.bind(f.store),batches=[]
  f.store.appendEvents=async(id,events,serialized)=>{
    if(id===childId) {
      assert.equal(serialized.length,events.length)
      const bytes=serialized.reduce((sum,line)=>sum+Buffer.byteLength(line)+2,0)
      assert.ok(bytes<=8*1024*1024,`serialized batch was ${bytes} bytes`)
      batches.push(bytes)
    }
    return original(id,events,serialized)
  }
  for(let i=0;i<600;i++) f.source._emit({type:'text',text:'bounded',requestId:'r'.repeat(8000)})
  await f.runtime.fork('source',{id:childId,dshSessionId:'exact-byte-native',operationId:'exact-byte-operation'})
  assert.ok(batches.length>=2,`duplicated correlations require multiple batches: ${batches}`)
})
