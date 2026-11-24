import test from 'node:test'
import assert from 'node:assert/strict'
import { AcpSession, ACP_CLIENT_CAPABILITIES, elicitationSchemaSupport, validateElicitationContent } from '../lib/acp.js'

const schema={type:'object',properties:{choice:{type:'string',oneOf:[{const:'yes',title:'Yes'},{const:'no',title:'No'}]},count:{type:'integer',minimum:1,maximum:3},enabled:{type:'boolean'},tags:{type:'array',items:{type:'string',enum:['a','b']},minItems:1,maxItems:2}},required:['choice','count','enabled']}
const session=()=>new AcpSession({id:'test',agent:'claude',runtimeTransport:'remote',sessionId:'remote'})

test('form capability is advertised but URL is not',()=>{
  assert.deepEqual(ACP_CLIENT_CAPABILITIES.elicitation,{form:{}})
  assert.equal(elicitationSchemaSupport(schema),null)
})

test('elicitation waits for user, validates answer and does not persist answer content',async()=>{
  const s=session();s.permissionMode='bypass'
  const pending=s.handleElicitationRequest({mode:'form',sessionId:'child',toolCallId:'ask',message:'Choose',requestedSchema:schema},42)
  assert.equal(s.pendingElicitations.size,1)
  assert.equal(s.state().pendingElicitations[0].requestId,'42')
  const event=s.bufferedEvents().find(event=>event.type==='elicitation')
  assert.equal(event.sessionId,'child');assert.equal(event.rootSessionId,'remote');assert.equal(event.toolCallId,'ask')
  await assert.rejects(s.elicitation({requestId:'42',action:'accept',content:{choice:'other',count:2,enabled:true}}),{code:'invalid_elicitation_content'})
  assert.equal(s.pendingElicitations.size,1)
  const content={choice:'yes',count:2,enabled:false,tags:['a']}
  assert.deepEqual(await s.elicitation({requestId:'42',action:'accept',content}),{ok:true,requestId:'42',action:'accept'})
  assert.deepEqual(await pending,{action:'accept',content})
  const resolved=s.bufferedEvents().find(event=>event.type==='elicitation_resolved')
  assert.equal(resolved.action,'accept');assert.equal(Object.hasOwn(resolved,'content'),false)
  assert.equal(s.pendingElicitations.size,0)
})

test('required, primitive types, enum, multi-select and ranges are enforced',()=>{
  for(const content of [{},{choice:'yes',count:2.5,enabled:true},{choice:'yes',count:4,enabled:true},{choice:'yes',count:2,enabled:'true'},{choice:'yes',count:2,enabled:true,tags:['z']},{choice:'yes',count:2,enabled:true,tags:['a','a']},{choice:'yes',count:2,enabled:true,unexpected:'no'}]) {
    assert.throws(()=>validateElicitationContent(schema,content),{code:'invalid_elicitation_content'})
  }
})

test('unsupported schema and URL are explicitly declined, never opened or approved',async()=>{
  for(const params of [{mode:'url',url:'https://example.invalid/authorize',elicitationId:'url',message:'Open URL'},{mode:'form',message:'Nested',requestedSchema:{type:'object',properties:{nested:{type:'object'}}}},{mode:'form',message:'Regex',requestedSchema:{type:'object',properties:{text:{type:'string',pattern:'.*'}}}}]){
    const s=session();const response=await s.handleElicitationRequest(params,'unsupported')
    assert.deepEqual(response,{action:'decline'});assert.equal(s.pendingElicitations.size,0)
    assert.equal(s.bufferedEvents().find(event=>event.type==='elicitation').supported,false)
    assert.equal(s.bufferedEvents().find(event=>event.type==='elicitation_resolved').action,'decline')
  }
})

test('cancel, dispose and request abort settle forms and clear pending state',async()=>{
  for(const action of ['cancel','dispose','abort']){
    const s=session(),abort=new AbortController()
    const pending=s.handleElicitationRequest({mode:'form',message:'Question',requestedSchema:{type:'object',properties:{text:{type:'string'}}}},action,abort.signal)
    if(action==='abort')abort.abort();else await s[action]()
    assert.deepEqual(await pending,{action:'cancel'});assert.equal(s.pendingElicitations.size,0)
    assert.equal(s.bufferedEvents().filter(event=>event.type==='elicitation_resolved').length,1)
  }
})
