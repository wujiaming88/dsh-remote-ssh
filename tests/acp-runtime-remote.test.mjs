import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Readable, Writable } from 'node:stream'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, posix } from 'node:path'
import { runInNewContext } from 'node:vm'
import { spawnSync } from 'node:child_process'
import { AcpSession, AcpStore, createAcpRuntime, buildRemoteAcpLaunchSpec, remoteAcpPreparationPlan, prepareRemoteAcp, probeRemoteAcp, REMOTE_ACP_PACKAGES } from '../lib/acp.js'

const profile={id:'remote',host:'example.invalid',user:'alice',authMethod:'kerberos',proxyJump:'jump.example',port:2222}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function temporary(t) {const dir=mkdtempSync(join(tmpdir(),'dsh-acp-remote-'));t.after(()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true,force:true})});return dir}
function fakeProcess() {const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true;return true};return child}

async function executeBootstrap({action='probe',nodeVersion='22.12.0',missing=false,versionMismatch=false,remotePath="~/project 'quote';$(not-a-command)",...rest}={}) {
  const launch=buildRemoteAcpLaunchSpec({profile,agent:'claude',agentPath:'/remote/bin/claude',remotePath,action,...rest})
  let stdout='',stderr='',cwd='',writes=0;const installations=[]
  const filesystem={constants:{X_OK:1},mkdirSync(){writes++},accessSync(){},existsSync:()=>true,statSync:()=>({isFile:()=>true,isDirectory:()=>true}),realpathSync:value=>value,
    readFileSync(file){if(missing)throw Error('missing');const key=Object.keys(REMOTE_ACP_PACKAGES).find(name=>file.endsWith('/'+name+'/package.json'));return JSON.stringify({version:versionMismatch?'0.0.0':REMOTE_ACP_PACKAGES[key]})}}
  const mockProcess={argv:['node',Buffer.from(JSON.stringify(launch.payload)).toString('base64')],versions:{node:nodeVersion},env:{PATH:'/remote/bin',CLAUDE_CODE_EXECUTABLE:'/wrong/local/wrapper'},stdout:{write:s=>{stdout+=s}},stderr:{write:s=>{stderr+=s}},chdir:value=>{cwd=value},exitCode:0}
  const require=name=>({
    'node:fs':filesystem,'node:path':posix,'node:os':{homedir:()=>'/home/alice'},'node:module':{createRequire:()=>({resolve:()=>'/remote/codex.js'})},
    'node:url':{pathToFileURL:value=>({href:'file://'+value})},'node:child_process':{spawnSync:(command,args,opts)=>{installations.push({command,args,opts});return {status:0}}}
  }[name])
  runInNewContext(launch.bootstrapSource,{require,Buffer,process:mockProcess})
  await tick()
  return {stdout,stderr,cwd,writes,installations,process:mockProcess,launch}
}

test('Pi launches the pinned adapter entry and GitHub install spec',()=>{
  const launch=buildRemoteAcpLaunchSpec({profile,agent:'pi'})
  assert.equal(launch.payload.agent,'pi')
  assert.equal(launch.payload.adapterPackage,'@wujiaming88/pi-agent-acp')
  assert.equal(launch.payload.adapterEntry,'src/index.js')
  assert.equal(launch.payload.installSpecs['@wujiaming88/pi-agent-acp'],'github:wujiaming88/pi-agent-acp#v0.1.4')
  const plan=remoteAcpPreparationPlan({profile,agent:'pi'})
  assert.ok(plan.packages.includes('@wujiaming88/pi-agent-acp@github:wujiaming88/pi-agent-acp#v0.1.4'))
})
test('remote launcher constructs strict SSH stdio command without embedding secrets', () => {
  const launch=buildRemoteAcpLaunchSpec({profile:{...profile,password:'not-exported'},agent:'codex',remotePath:"/work/quote';$(not-a-command)",remoteRuntimeDir:'~/.private runtime'})
  assert.equal(launch.command,'ssh');assert.equal(launch.runtimeTransport,'remote')
  assert.deepEqual(launch.args.slice(0,6),['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=accept-new','-o'])
  assert.equal(launch.args[launch.args.indexOf('-J')+1],'jump.example')
  assert.equal(launch.args.at(-2),'alice@example.invalid')
  assert.equal(Object.hasOwn(launch.payload,'password'),false)
  assert.equal(launch.payload.remotePath,"/work/quote';$(not-a-command)")
  const syntax=spawnSync('/bin/bash',['-n','-c',launch.remoteCommand],{encoding:'utf8'})
  assert.equal(syntax.status,0,syntax.stderr)
  assert.throws(()=>buildRemoteAcpLaunchSpec({profile:{...profile,authMethod:'password'}}),{code:'password_unsupported'})
  assert.throws(()=>buildRemoteAcpLaunchSpec({profile,remotePath:'relative/path'}),{code:'bad_remote_path'})
})

test('bootstrap resolves remote home/cwd and never probes the local mirror', async () => {
  const result=await executeBootstrap()
  const ready=JSON.parse(result.stdout)
  assert.equal(ready.ok,true);assert.equal(ready.cwd,"/home/alice/project 'quote';$(not-a-command)")
  assert.equal(result.cwd,ready.cwd);assert.equal(result.process.env.CLAUDE_CODE_EXECUTABLE,'/remote/bin/claude')
  assert.equal(result.writes,0);assert.equal(result.installations.length,0)
  assert.equal(ready.versions['@agentclientprotocol/claude-agent-acp'],'0.109.1')
})

test('bootstrap launches whole ESM adapter in target workspace, including skill and MCP filesystem', t => {
  const dir=temporary(t),root=join(dir,'runtime'),workspace=join(dir,"remote project 'quoted'"),adapter=join(root,'node_modules/@agentclientprotocol/claude-agent-acp')
  mkdirSync(join(adapter,'dist'),{recursive:true});mkdirSync(join(root,'node_modules/@agentclientprotocol/sdk'),{recursive:true})
  mkdirSync(join(workspace,'.claude/skills/example'),{recursive:true})
  writeFileSync(join(workspace,'.claude/skills/example/SKILL.md'),'REMOTE SKILL')
  writeFileSync(join(workspace,'.mcp.json'),JSON.stringify({mcpServers:{remote:{command:'/remote/mcp'}}}))
  writeFileSync(join(root,'node_modules/@agentclientprotocol/sdk/package.json'),JSON.stringify({version:'2.9.1'}))
  writeFileSync(join(adapter,'package.json'),JSON.stringify({version:'0.109.1',type:'module'}))
  writeFileSync(join(adapter,'dist/index.js'),`import {readFileSync} from 'node:fs';process.stdout.write(JSON.stringify({cwd:process.cwd(),skill:readFileSync('.claude/skills/example/SKILL.md','utf8'),mcp:JSON.parse(readFileSync('.mcp.json','utf8')),argv:process.argv,cli:process.env.CLAUDE_CODE_EXECUTABLE})+'\\n')`)
  const launch=buildRemoteAcpLaunchSpec({profile,agent:'claude',remotePath:workspace,remoteRuntimeDir:root,agentPath:process.execPath})
  const run=spawnSync(process.execPath,['-e',launch.bootstrapSource,Buffer.from(JSON.stringify(launch.payload)).toString('base64')],{encoding:'utf8'})
  assert.equal(run.status,0,run.stderr)
  const result=JSON.parse(run.stdout)
  assert.equal(result.cwd,realpathSync(workspace));assert.equal(result.skill,'REMOTE SKILL');assert.equal(result.mcp.mcpServers.remote.command,'/remote/mcp')
  assert.equal(result.argv[1],join(adapter,'dist/index.js'));assert.equal(result.cli,process.execPath)
})

test('missing/incorrect remote dependencies and old Node fail without implicit installation', async () => {
  for(const [options,code] of [[{missing:true},'remote_prepare_required'],[{versionMismatch:true},'remote_prepare_required'],[{nodeVersion:'20.10.0'},'remote_node_unsupported']]) {
    const result=await executeBootstrap(options),failure=JSON.parse(result.stdout)
    assert.equal(failure.ok,false);assert.equal(failure.error.code,code)
    assert.equal(result.writes,0);assert.equal(result.installations.length,0)
  }
})

test('prepare has explicit consent gate and installs fixed packages only in remote private prefix', async () => {
  const plan=remoteAcpPreparationPlan({profile,agent:'claude'})
  assert.equal(plan.requiresConfirmation,true);assert.equal(plan.installScripts,false);assert.equal(plan.nodeRequirement,'>=22')
  let spawned=0
  assert.throws(()=>prepareRemoteAcp({profile,spawn:()=>{spawned++}},{confirmed:false}),{code:'confirmation_required'})
  assert.equal(spawned,0)
  const result=await executeBootstrap({action:'prepare'})
  assert.equal(result.writes,1);assert.equal(result.installations.length,1)
  assert.deepEqual(Array.from(result.installations[0].args),['install','--prefix','/home/alice/.local/share/dsh-remote-acp/v1','--ignore-scripts','--include=optional','--no-audit','--no-fund','--save-exact','@agentclientprotocol/sdk@2.9.1','@agentclientprotocol/claude-agent-acp@0.109.1','@agentclientprotocol/codex-acp@2.9.0','@wujiaming88/pi-agent-acp@github:wujiaming88/pi-agent-acp#v0.1.4'])
  assert.equal(result.installations[0].opts.stdio[1],2)
})

test('remote probe and prepare report structured outcomes using injected SSH process', async () => {
  let calls=0
  const spawn=()=>{calls++;const child=fakeProcess();queueMicrotask(()=>{child.stdout.write(JSON.stringify({ok:true,cwd:'/remote/work'})+'\n');child.emit('close',0)});return child}
  assert.equal((await probeRemoteAcp({profile,spawn})).cwd,'/remote/work')
  assert.equal((await prepareRemoteAcp({profile,spawn},{confirmed:true})).ok,true);assert.equal(calls,2)
  const failing=()=>{const child=fakeProcess();queueMicrotask(()=>{child.stderr.write('[dsh-acp-runtime] '+JSON.stringify({type:'error',code:'remote_prepare_required',message:'prepare required',prepareRequired:true})+'\n');child.emit('close',2)});return child}
  await assert.rejects(probeRemoteAcp({profile,spawn:failing}),{code:'remote_prepare_required',prepareRequired:true})
})

test('AbortSignal and runtime shutdown terminate outstanding remote preparation', async t => {
  const children=[],spawn=()=>{const child=fakeProcess();children.push(child);return child}
  const abort=new AbortController(),probe=probeRemoteAcp({profile,spawn,signal:abort.signal})
  abort.abort();await assert.rejects(probe,{code:'remote_cancelled'});assert.equal(children[0].killed,true)
  const dir=temporary(t),runtime=createAcpRuntime({storePath:join(dir,'sessions.json'),spawn})
  const pending=runtime.prepareRemote({profile},{confirmed:true});await tick()
  const rejected=assert.rejects(pending,{code:'remote_cancelled'})
  await runtime.shutdown();await rejected;assert.equal(children[1].killed,true)
  await assert.rejects(runtime.probeRemote({profile}),{code:'runtime_shutdown'})
})

test('real SDK 2.9.1 carries remote cwd, permissions, child updates and serialized prompts over fake SSH', async t => {
  const sdk=await import('@agentclientprotocol/sdk')
  const calls=[],rpc=[],connections=[];let promptCount=0
  const spawn=(command,args,opts)=>{
    calls.push({command,args,opts});const child=fakeProcess()
    const server=sdk.agent().onRequest('initialize',()=>({protocolVersion:1,agentCapabilities:{promptCapabilities:{image:true}},_meta:{steering:{supported:false}}}))
      .onRequest('session/new',ctx=>{rpc.push({method:'session/new',params:ctx.params});return {sessionId:'remote-id',modes:{currentModeId:'default',availableModes:[{id:'default',name:'Default'},{id:'acceptEdits',name:'Accept Edits'}]}}})
      .onRequest('session/set_mode',ctx=>{rpc.push({method:'session/set_mode',params:ctx.params});return {}})
      .onRequest('session/prompt',async ctx=>{
        promptCount++;rpc.push({method:'session/prompt',params:ctx.params})
        await ctx.client.notify('session/update',{sessionId:'child-id',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'from remote child'}}})
        const permission=await ctx.client.request('session/request_permission',{sessionId:'remote-id',toolCall:{toolCallId:'tool',title:'Edit remote file',kind:'edit',status:'pending'},options:[{optionId:'allow',name:'Allow',kind:'allow_once'}]})
        assert.equal(permission.outcome.outcome,'selected')
        const answer=await ctx.client.request('elicitation/create',{sessionId:'remote-id',mode:'form',message:'Choose',requestedSchema:{type:'object',properties:{answer:{type:'string',enum:['yes','no']}},required:['answer']}})
        assert.deepEqual(answer,{action:'accept',content:{answer:'yes'}})
        return {stopReason:'end_turn'}
      })
    connections.push(server.connect(sdk.ndJsonStream(Writable.toWeb(child.stdout),Readable.toWeb(child.stdin))))
    queueMicrotask(()=>child.stderr.write('[dsh-acp-runtime] '+JSON.stringify({type:'ready',cwd:'/canonical/remote/project'})+'\n'))
    return child
  }
  t.after(()=>connections.forEach(connection=>connection.close()))
  const s=new AcpSession({profile,agent:'claude',remotePath:'~/project',cwd:'/does-not-exist-on-host',sdk,spawn,startTimeoutMs:1000,permission:'acceptEdits'})
  await s.start()
  assert.equal(calls[0].command,'ssh');assert.equal(calls[0].opts.cwd,undefined)
  assert.equal(rpc[0].params.cwd,'/canonical/remote/project');assert.deepEqual(rpc[0].params.mcpServers,[])
  assert.equal(s.state().executionBoundary,'remote-adapter-and-agent');assert.equal(s.remotePath,'/canonical/remote/project')
  s.subscribe(event=>{
    if(event.type==='permission')s.permission({requestId:event.requestId,optionId:'allow'})
    if(event.type==='elicitation')s.elicitation({requestId:event.requestId,action:'accept',content:{answer:'yes'}})
  },{replay:false})
  const [one,two]=await Promise.all([s.prompt('one'),s.prompt('two')])
  assert.equal(one.stopReason,'end_turn');assert.equal(two.stopReason,'end_turn');assert.equal(promptCount,2)
  assert.equal(s.bufferedEvents().find(event=>event.text==='from remote child').rootSessionId,'remote-id')
  assert.equal(rpc.filter(event=>event.method==='session/prompt')[0].params.prompt[0].text,'one')
  await s.dispose();assert.equal(calls.length,1)
})

test('remote startup failure never falls back to spawning local adapter', async t => {
  const sdk=await import('@agentclientprotocol/sdk'),calls=[]
  const spawn=(command,args)=>{calls.push({command,args});const child=fakeProcess();queueMicrotask(()=>{child.stderr.write('[dsh-acp-runtime] '+JSON.stringify({type:'error',code:'remote_prepare_required',message:'missing remote adapter',prepareRequired:true})+'\n');child.stdout.end();child.emit('exit',2,null)});return child}
  const s=new AcpSession({profile,agent:'claude',remotePath:'/remote',sdk,spawn,startTimeoutMs:1000})
  await assert.rejects(s.start(),{code:'remote_prepare_required'})
  assert.equal(calls.length,1);assert.equal(calls[0].command,'ssh');assert.equal(s.status,'error')
})

test('v3 snapshot is explicit and older records are rejected without changing their bytes', async t => {
  const dir=temporary(t),storePath=join(dir,'sessions-v3.json')
  const connectImpl=()=>({ready:Promise.resolve({sessionId:'remote-1',protocolCwd:'/home/alice/work',sessionResponse:{sessionId:'remote-1',modes:{currentModeId:'default',availableModes:[{id:'acceptEdits'}]}},initialize:{}}),setMode:async()=>({}),dispose:async()=>{},close:async()=>{}})
  const rt=createAcpRuntime({storePath,connectImpl,getProfile:()=>profile})
  const session=await rt.create({profile,agent:'claude',remotePath:'~/work',dshSessionId:'binding'})
  assert.equal((await rt.create({profile,agent:'claude',remotePath:'~/work',dshSessionId:'binding'})).id,session.id)
  await rt.shutdown()
  const snapshot=JSON.parse(readFileSync(storePath,'utf8'))
  assert.equal(snapshot.schema,'dsh-remote-acp/v3');assert.equal(snapshot.version,3)
  assert.equal(snapshot.sessions[0].recordVersion,3)
  assert.equal(Object.hasOwn(snapshot.sessions[0],'runtimeTransport'),false)
  const restored=createAcpRuntime({storePath,connectImpl,getProfile:()=>profile})
  assert.equal((await restored.resume(session.id)).sessionId,'remote-1')
  await restored.shutdown()
  const oldPath=join(dir,'old-sessions.json'),bytes=JSON.stringify({version:1,sessions:[{id:'old',sessionId:'old-session'}]})
  writeFileSync(oldPath,bytes)
  const unsupported=new AcpStore({storePath:oldPath})
  assert.throws(()=>unsupported.read(),{code:'store_schema_unsupported'})
  assert.throws(()=>unsupported.upsert(snapshot.sessions[0]),{code:'store_schema_unsupported'})
  assert.throws(()=>unsupported.remove('old'),{code:'store_schema_unsupported'})
  assert.throws(()=>unsupported.appendEvent('old',{eventVersion:1,seq:1,generation:'g',type:'text'}),{code:'store_schema_unsupported'})
  assert.equal(readFileSync(oldPath,'utf8'),bytes);assert.equal(existsSync(oldPath+'.events'),false)
  assert.throws(()=>new AcpStore(),{code:'store_path_required'})
  assert.throws(()=>new AcpStore({storePath:'relative.json'}),{code:'store_path_required'})
})
