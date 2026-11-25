import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';

// Execute the production authorization and registered HTTP callback with service
// seams only. No browser, DOM, native profile, or replacement Session is created.
const source=readFileSync(new URL('../lib/index.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
function find(node,predicate) {
  if(!node||typeof node!=='object')return null;
  if(predicate(node))return node;
  for(const child of Object.values(node)){const result=find(child,predicate);if(result)return result;}
  return null;
}
const functionCode=name=>{const node=find(ast,value=>value.type==='FunctionDeclaration'&&value.id?.name===name);assert.ok(node,name);return source.slice(node.start,node.end);};
const route=find(ast,value=>value.type==='ObjectExpression'&&value.properties.some(property=>property.key?.name==='path'&&property.value?.right?.value==='/api'));
const handler=route.properties.find(property=>property.key?.name==='handler').value;
const instantiate=new Function('ctx','host','jsonBody','error',`
  const API_PREFIX='/remote-ssh/v3/api/';
  ${['authorize','failure','ensureResult','json'].map(functionCode).join('\n')}
  return ${source.slice(handler.start,handler.end)};
`);
function fixture({allowed='A',args={},revoke=false}={}) {
  const state={calls:0,activityCalls:0,bodies:0,allowed,resources:[]};
  const ctx={connection:{admit:()=>({peer:{principal:{kind:'owner'}}})},remoteAccess:{decide:({resources})=>{
    state.resources.push(resources);
    return {kind:resources.every(resource=>resource.kind==='global'||resource.id===state.allowed)?'allow':'deny'};
  }}};
  const host={refreshSessionActivity:()=>{},sessionActivityEvents:(req,res,permitted)=>{state.activityCalls++;res.writeHead(200);res.end(JSON.stringify({allowedA:permitted('A'),allowedB:permitted('B')}));},api:{messageAttachments:async()=>{state.calls++;if(revoke)state.allowed=null;return {ok:true,status:'available',attachments:[{name:'private.png'}]};}}};
  const run=instantiate(ctx,host,async()=>{state.bodies++;return args;},(code,message)=>Object.assign(new Error(message),{code}));
  const response={headersSent:false,writeHead(status){this.status=status;this.headersSent=true;},end(body){this.body=JSON.parse(body);}};
  return {state,response,run:(method='messageAttachments')=>run({method:'POST',url:'/remote-ssh/v3/api/'+method,headers:{'x-requested-with':'XMLHttpRequest'}},response)};
}
test('activity overview rejects every request scope alias before opening a stream',async()=>{
  for(const args of [{sessionId:'A'},{dshSessionId:'A'},{id:'acp-A'}]){
    const f=fixture({args});await f.run('sessionActivityEvents');
    assert.equal(f.response.status,400);assert.equal(f.response.body.error.code,'invalid_activity_request');assert.equal(f.state.activityCalls,0);
  }
});
test('empty activity overview request preserves separate authorization for every frame session',async()=>{
  const f=fixture({args:{}});await f.run('sessionActivityEvents');
  assert.equal(f.response.status,200);assert.equal(f.state.activityCalls,1);
  assert.deepEqual(f.response.body,{allowedA:true,allowedB:false});
});
test('message image metadata authorizes canonical dshSessionId, not a conflicting sessionId alias',async()=>{
  const f=fixture({args:{sessionId:'A',dshSessionId:'B',id:'acp-B',turnId:'turn-B'}});
  await f.run();
  assert.equal(f.response.status,403);assert.equal(f.state.calls,0);
  assert.equal(f.response.body.error.code,'remote_access_denied');
  assert.ok(f.state.resources.some(resources=>resources.some(resource=>resource.kind==='session'&&resource.id==='B')));
  assert.doesNotMatch(JSON.stringify(f.response.body),/private.png/);
});
test('authorized canonical session returns metadata even when an unused alias differs',async()=>{
  const f=fixture({allowed:'B',args:{sessionId:'A',dshSessionId:'B',id:'acp-B',turnId:'turn-B'}});
  await f.run();assert.equal(f.response.status,200);assert.equal(f.state.calls,1);
});
test('revocation while native metadata is awaited prevents its response from being disclosed',async()=>{
  const f=fixture({allowed:'B',args:{dshSessionId:'B',id:'acp-B',turnId:'turn-B'},revoke:true});
  await f.run();assert.equal(f.state.calls,1);assert.equal(f.response.status,403);
  assert.equal(f.response.body.error.code,'remote_access_denied');
  assert.doesNotMatch(JSON.stringify(f.response.body),/private.png/);
});
