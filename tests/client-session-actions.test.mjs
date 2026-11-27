import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {parse} from 'acorn';
import {formatError} from '../src/client/api.js';
const source=readFileSync(new URL('../src/client/session-actions.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const presentationDeclaration=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='forkPresentation');
const present=new Function('FORK_STEPS',source.slice(presentationDeclaration.start,presentationDeclaration.end)+'\nreturn forkPresentation;')(new Set(['checking','copyingHistory','creatingRemote','binding','restoringNative','flushing','completed']));
const react={Fragment:'Fragment',useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useEffect:fn=>{const cleanup=fn();if(typeof cleanup==='function')cleanup();}};
const h=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
const ui={Modal:'Modal',Button:'Button',Input:'Input',Checkbox:'Checkbox',StateDot:'StateDot'};
let apiImpl;
globalThis.__dshClientActionsTest={react,shared:{api:(...args)=>apiImpl(...args),stream:async()=>{},h,ui,useT:()=>key=>key,formatError,NAMESPACE:'namespace'}};
registerHooks({resolve(specifier,context,next){
 if(specifier==='react')return{url:'dsh-test:react',shortCircuit:true};
 if(specifier==='./shared.js'&&context.parentURL?.includes('/src/client/session-actions.js'))return{url:'dsh-test:shared',shortCircuit:true};
 return next(specifier,context);
},load(url,context,next){
 if(url==='dsh-test:react')return{format:'module',source:'export default globalThis.__dshClientActionsTest.react;',shortCircuit:true};
 if(url==='dsh-test:shared')return{format:'module',source:"const s=globalThis.__dshClientActionsTest.shared;export const api=s.api,stream=s.stream,h=s.h,ui=s.ui,useT=s.useT,formatError=s.formatError,NAMESPACE=s.NAMESPACE;",shortCircuit:true};
 return next(url,context);
}});
const {installSessionActions:install,messages}=await import('../src/client/session-actions.js?controller-tests');
function renderDialog(component,dialog,overrides={}){const calls=[];const tree=component({useActionDialog:read=>read(dialog),dismissAction:()=>calls.push('dismiss'),submitAction:value=>calls.push(['submit',value]),openFork:()=>calls.push('open'),allowNewFork:value=>calls.push(['allow',value]),...overrides});return{tree,calls};}
function findNodes(node,type,found=[]){if(!node||typeof node!=='object')return found;if(node.type===type)found.push(node);for(const child of node.children||[])findNodes(child,type,found);for(const value of Object.values(node.props||{}))if(value&&typeof value==='object')findNodes(value,type,found);return found;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
function fixture(t,handle){
 const providers=new Map(),registrations=new Map(),calls=[],opened=[],toasts=[],cleanup=[],nativeForks=[],selectionListeners=new Set();let current='remote',onUpdate;
 const metadata={ok:true,remote:true,sessionId:'remote',title:'Source',pinned:false,canFork:true,canClose:true,acpId:'remote-acp',busy:false,archived:false,titleSync:null,forkOperation:null};
 const api=async(method,args,signal)=>{calls.push({method,args,signal});const overridden=await handle?.(method,args);if(overridden!==undefined)return overridden;
  if(method==='sessionActions')return{...metadata,sessionId:args.sessionId};
  if(method==='sessionRename')return{ok:true,title:args.title,titleSync:{status:'synced'}};
  if(method==='sessionFork')return{ok:true,sessionId:'child',operation:{phase:'completed'}};
  return{ok:true};};
 const observable={getSnapshot:()=>({byId:{remote:{projectionValues:{fact:{remote:true}}},local:{}}}),subscribe:()=>()=>{}};
 const ctx={
  effect(fn){const result=fn();if(typeof result==='function')cleanup.push(result);},
  locale:{bind:()=>key=>key},
  sessions:{list:observable,binding:id=>({session:{projections:{faceOf:()=>({getSnapshot:()=>({remote:id==='remote'})})}}})},
  workspaces:{list:observable},uiSession:{adapter:{current:{getSnapshot:()=>({key:current}),subscribe:listener=>{selectionListeners.add(listener);return()=>selectionListeners.delete(listener);}}}},
  uiWorkspace:{openSession:id=>opened.push(id),forkSession:(...args)=>{nativeForks.push(args);return Promise.resolve();}},
  contextMenus:{register:definition=>{providers.set(definition.target,definition);return()=>providers.delete(definition.target);},notify:(...args)=>toasts.push(args)},
  slots:{inject(_name,fn){const result=fn();if(typeof result==='function')cleanup.push(result);},register(options,component){registrations.set(options.name,{...options,component});return()=>{};}},
 };
 apiImpl=api;
 install(ctx,{watch:(_method,_args,signal,listener)=>{onUpdate=listener;if(signal.aborted)return Promise.resolve();return new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));}});
 const dispose=()=>{for(const action of cleanup.reverse())action();};t.after(dispose);
 return{ctx,providers,calls,opened,toasts,nativeForks,metadata,dispose,update:event=>onUpdate(event),select:id=>{current=id;for(const listener of selectionListeners)listener();},registration:name=>registrations.get(name),props:()=>registrations.get('shell.overlay').inject(),dialog:()=>registrations.get('shell.overlay').inject().hooks.actionDialog.getSnapshot(),statuses:()=>registrations.get('sidebar.session.row.trailing').inject().hooks.remoteSessionForkStatuses.getSnapshot(),reopenStatus:id=>registrations.get('sidebar.session.row.trailing').inject().openForkStatus(id)};
}
async function header(f){return f.providers.get('remote-agent-session').resolve({sessionId:'remote'},new AbortController().signal)}
test('native fork service is routed to remote fork and delegated for local sessions',async t=>{
 const f=fixture(t);
 await f.ctx.uiWorkspace.forkSession('remote');
 await new Promise(resolve=>setImmediate(resolve));
 const call=f.calls.find(value=>value.method==='sessionFork');assert.ok(call);assert.equal(call.args.sessionId,'remote');assert.deepEqual(f.opened,['child']);
 await f.ctx.uiWorkspace.forkSession('local');assert.equal(f.nativeForks.length,1);assert.equal(f.nativeForks[0][0],'local');
});
test('header uses native structured actions and local row menus remain untouched',async t=>{
 const f=fixture(t);const actions=await header(f);assert.deepEqual(actions.map(action=>action.id),['rename','pin','fork','terminate']);
 const count=f.calls.length;assert.equal(f.providers.get('session'),undefined);assert.equal(f.calls.length,count);
});
test('pin operates on the captured session, not whichever session is now selected',async t=>{
 const f=fixture(t),actions=await header(f);f.select('other');await actions.find(action=>action.id==='pin').run();
 assert.deepEqual(f.calls.at(-1).args,{sessionId:'remote',pinned:true});
});
test('partial rename success preserves the dialog and a readable synchronization error',async t=>{
 const f=fixture(t,method=>method==='sessionRename'?{ok:true,title:'Native title',nativeCommitted:true,titleSync:{status:'unknown',error:{code:'timeout',message:'remote outcome unknown'}}}:undefined);
 (await header(f)).find(action=>action.id==='rename').run();await f.props().submitAction('New name');
 assert.equal(f.dialog().busy,false);assert.match(f.dialog().error,/remote outcome unknown/);assert.doesNotMatch(f.dialog().error,/\[object Object\]/);assert.equal(f.dialog().title,'Native title');
});
test('a completed fork does not steal navigation after the user switches sessions',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const done=f.props().submitAction();f.select('other');pending.resolve({ok:true,sessionId:'child'});await done;
 assert.deepEqual(f.opened,[]);assert.equal(f.toasts.length,1);f.toasts[0][2].run();assert.deepEqual(f.opened,['child']);
});
test('recoverable fork retries preserve the same operation id and target',async t=>{
 let attempts=0;const f=fixture(t,(method,args)=>method==='sessionFork'&&attempts++===0?{ok:false,error:'native publication failed',operation:{operationId:args.operationId,phase:'remoteCreated',outcome:'completed',recoverable:true}}:undefined);
 (await header(f)).find(action=>action.id==='fork').run();await f.props().submitAction();const id=f.calls.at(-1).args.operationId;
 await f.props().submitAction();const forks=f.calls.filter(call=>call.method==='sessionFork');assert.equal(forks.length,2);assert.equal(forks[1].args.operationId,id);assert.deepEqual(f.opened,['child']);
});
test('unknown remote outcomes require explicit new-operation consent',async t=>{
 const f=fixture(t,(method,args)=>method==='sessionFork'?{ok:false,error:'outcome unknown',operation:{operationId:args.operationId,phase:'remotePending',outcome:'unknown',recoverable:false}}:undefined);
 (await header(f)).find(action=>action.id==='fork').run();await f.props().submitAction();const first=f.calls.at(-1).args.operationId,count=f.calls.length;
 await f.props().submitAction();assert.equal(f.calls.length,count);
 f.props().allowNewFork(true);await f.props().submitAction();assert.notEqual(f.calls.at(-1).args.operationId,first);
});
test('client disposal cannot publish a late result or navigate a different page',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const done=f.props().submitAction();f.dispose();pending.resolve({ok:true,sessionId:'child'});await done;
 assert.deepEqual(f.opened,[]);assert.deepEqual(f.toasts,[]);assert.equal(f.dialog(),null);
});

test('native rename failures are visible on menu reopen and notify live outcomes only once',async t=>{
 const f=fixture(t);f.metadata.titleSync={status:'unknown',error:{message:'remote result unknown'}};
 const actions=await header(f);assert.equal(actions[0].label,'session.renameUnsynced');actions[0].run();assert.match(f.dialog().error,/remote result unknown/);
 f.props().dismissAction();
 f.update({type:'title_sync',snapshot:true,sessionId:'remote',revision:1,status:'unknown',title:'A',error:{message:'old'}});assert.equal(f.toasts.length,0);
 const update={type:'title_sync',sessionId:'remote',revision:2,status:'failed',title:'B',error:{message:'new failure'}};
 f.update(update);f.update(update);assert.equal(f.toasts.length,1);assert.match(f.toasts[0][0],/new failure/);
 await f.toasts[0][2].run();assert.equal(f.dialog().kind,'rename');assert.equal(f.dialog().sessionId,'remote');
});
test('archival blocks fork recovery instead of bypassing normal admission',async t=>{
 const f=fixture(t);f.metadata.archived=true;f.metadata.canFork=false;f.metadata.forkOperation={operationId:'recover',phase:'remoteCreated',outcome:'completed',recoverable:true};
 const actions=await header(f);assert.equal(actions.find(action=>action.id==='fork').disabled,true);assert.equal(actions.find(action=>action.id==='pin').disabled,true);
 actions.find(action=>action.id==='fork').run();const count=f.calls.length;await f.props().submitAction();assert.equal(f.calls.length,count);
});


test('ending a remote session opens a confirmation and targets the captured original session', async t=>{
 const f=fixture(t),actions=await header(f),end=actions.find(action=>action.id==='terminate');
 assert.equal(end.disabled,false);end.run();assert.equal(f.dialog().kind,'terminate');
 assert.equal(f.calls.filter(call=>call.method==='acpClose').length,0);
 f.select('other');await f.props().submitAction();
 assert.deepEqual(f.calls.find(call=>call.method==='acpClose').args,{id:'remote-acp',dshSessionId:'remote',confirm:true});
 assert.equal(f.dialog(),null);assert.equal(f.toasts.at(-1)[0],'session.terminated');
});
test('unconfirmed termination retains the confirmation and recovery error, never claims completion', async t=>{
 const f=fixture(t,method=>method==='acpClose'?{ok:false,code:'remote_broker_lost',error:'owner unavailable'}:undefined);
 (await header(f)).find(action=>action.id==='terminate').run();await f.props().submitAction();
 assert.equal(f.dialog().kind,'terminate');assert.equal(f.dialog().busy,false);assert.match(f.dialog().error,/owner unavailable/);
 assert.equal(f.toasts.length,0);
});
test('archived sessions can be explicitly ended but already-closed or absent owners cannot', async t=>{
 const f=fixture(t);f.metadata.archived=true;assert.equal((await header(f)).find(action=>action.id==='terminate').disabled,false);
 f.metadata.canClose=false;f.metadata.closed=true;
 const action=(await header(f)).find(action=>action.id==='terminate');assert.equal(action.disabled,true);
 action.run();const count=f.calls.length;await f.props().submitAction();assert.equal(f.calls.length,count);
});
test('termination confirmation describes irreversible task cancellation and preserved files in both locales',()=>{
 assert.match(source,/结束远端会话/);assert.match(source,/End remote session/);
 assert.match(source,/历史记录、SSH 配置和工作区文件会保留/);assert.match(source,/History, SSH configuration, and workspace files are retained/);
});

test('native remote click publishes a provisional dialog before metadata and repeated clicks reuse its identity',async t=>{
 const metadata=deferred();let f;f=fixture(t,method=>method==='sessionActions'?metadata.promise:undefined);
 const first=f.ctx.uiWorkspace.forkSession('remote');
 assert.equal(f.dialog().kind,'fork');assert.equal(f.dialog().metadata.pending,true);assert.equal(f.dialog().busy,true);
 const id=f.dialog().operationId;assert.ok(id);assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);
 const second=f.ctx.uiWorkspace.forkSession('remote');assert.equal(f.dialog().operationId,id);assert.equal(f.calls.filter(call=>call.method==='sessionActions').length,1);
 metadata.resolve({...f.metadata});await Promise.all([first,second]);await flush();
 assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,1);assert.equal(f.calls.find(call=>call.method==='sessionFork').args.operationId,id);
 assert.deepEqual(f.opened,['child']);
});

test('native metadata failure remains recoverable and notifies after dismissal',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionActions'?pending.promise:undefined);
 const clicked=f.ctx.uiWorkspace.forkSession('remote');f.props().dismissAction();pending.reject(Error('metadata offline'));await clicked;
 assert.equal(f.dialog(),null);assert.equal(f.toasts.length,1);assert.match(f.toasts[0][0],/metadata offline/);assert.equal(f.statuses().byId.remote,undefined);
});

test('a non-remote metadata result falls back to the native fork without stale status',async t=>{
 const f=fixture(t,method=>method==='sessionActions'?{ok:true,remote:false,sessionId:'remote',title:'Source'}:undefined);
 await f.ctx.uiWorkspace.forkSession('remote');assert.equal(f.nativeForks.length,1);assert.equal(f.dialog(),null);assert.deepEqual(f.statuses(),{byId:{}});
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:'nonremote-reopen',sourceSessionId:'remote',phase:'accepted',runState:'running',recoverable:true}});
 f.reopenStatus('remote');await flush();assert.equal(f.dialog().error,'session.forkUnavailable');assert.deepEqual(f.statuses(),{byId:{}});
});

test('completed fork can be opened explicitly and open failures stay in the dialog',async t=>{
 for(const fail of [false,true]){
  const f=fixture(t);(await header(f)).find(action=>action.id==='fork').run();f.select('other');await f.props().submitAction();
  assert.equal(f.dialog().operation.runState,'completed');assert.deepEqual(f.opened,[]);
  if(fail)f.ctx.uiWorkspace.openSession=async()=>{throw Error('open denied');};
  await f.props().openFork();
  if(fail){assert.match(f.dialog().error,/open denied/);assert.deepEqual(f.opened,[]);}else{assert.deepEqual(f.opened,['child']);assert.equal(f.dialog(),null);}
  await f.props().openFork();
 }
});

test('a live external running operation merges into a provisional task without stale row status',async t=>{
 const metadata=deferred(),f=fixture(t,method=>method==='sessionActions'?metadata.promise:undefined);await flush();
 const clicked=f.ctx.uiWorkspace.forkSession('remote');
 const running={operationId:'external-live',sessionId:'external-child',sourceSessionId:'remote',phase:'remoteCreated',activeStep:'binding',runState:'running',recoverable:true,revision:2};
 f.update({type:'fork',sessionId:'remote',operation:running});assert.equal(f.dialog().operationId,'external-live');assert.equal(f.statuses().byId.remote.status,'running');
 metadata.resolve({...f.metadata,canFork:false,activeForkOperation:running,forkOperation:running});await clicked;await flush();
 f.update({type:'fork',sessionId:'remote',operation:{...running,phase:'completed',activeStep:'completed',runState:'completed',recoverable:false,revision:3}});
 assert.deepEqual(f.opened,['external-child']);assert.equal(f.statuses().byId.remote,undefined);assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);
});

test('live recovery merges an existing historical task into the provisional identity',async t=>{
 const metadata=deferred(),f=fixture(t,method=>method==='sessionActions'?metadata.promise:undefined);await flush();const clicked=f.ctx.uiWorkspace.forkSession('remote');
 const interrupted={operationId:'known-external',sessionId:'external-child',sourceSessionId:'remote',phase:'remoteCreated',activeStep:'binding',runState:'interrupted',recoverable:true,revision:1};
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:interrupted});assert.notEqual(f.dialog().operationId,'known-external');
 const running={...interrupted,runState:'running',revision:2};f.update({type:'fork',sessionId:'remote',operation:running});assert.equal(f.dialog().operationId,'known-external');
 metadata.resolve({...f.metadata,canFork:false,activeForkOperation:running,forkOperation:running});await clicked;await flush();
 f.update({type:'fork',sessionId:'remote',operation:{...running,phase:'completed',activeStep:'completed',runState:'completed',recoverable:false,revision:3}});
 assert.deepEqual(f.opened,['external-child']);assert.equal(f.statuses().byId.remote,undefined);assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);
});

test('an interrupted reconnect snapshot releases a stalled request and preserves same-ID recovery',async t=>{
 const pending=deferred();let attempts=0;const f=fixture(t,(method,args)=>method==='sessionFork'?attempts++===0?pending.promise:{ok:true,sessionId:'child',operation:{operationId:args.operationId,sessionId:'child',phase:'completed',runState:'completed'}}:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const first=f.props().submitAction(),id=f.dialog().operationId;
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:id,sourceSessionId:'remote',phase:'remoteCreated',runState:'interrupted',recoverable:true,recoveryKind:'resume',revision:2}});
 assert.equal(f.dialog().busy,false);assert.equal(f.statuses().byId.remote.status,'recovery');
 const retry=f.props().submitAction();pending.resolve({ok:false,error:'stale request'});await Promise.all([first,retry]);
 assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,2);assert.deepEqual(f.opened,['child']);assert.equal(f.statuses().byId.remote,undefined);
});

test('an unknown reconnect snapshot releases consent while invalidating the old request',async t=>{
 const pending=deferred();let attempts=0;const f=fixture(t,(method,args)=>method==='sessionFork'?attempts++===0?pending.promise:{ok:true,sessionId:'child',operation:{operationId:args.operationId,sessionId:'child',phase:'completed',runState:'completed'}}:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const first=f.props().submitAction(),id=f.dialog().operationId;
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:id,sourceSessionId:'remote',phase:'remotePending',runState:'failed',recoverable:false,recoveryKind:'unknown',revision:2}});
 assert.equal(f.dialog().busy,false);assert.equal(f.dialog().operation.recoveryKind,'unknown');f.props().allowNewFork(true);const retry=f.props().submitAction();
 assert.notEqual(f.calls.filter(call=>call.method==='sessionFork')[1].args.operationId,id);pending.resolve({ok:false,error:'stale request'});await Promise.all([first,retry]);assert.deepEqual(f.opened,['child']);
});

test('historical unfinished snapshots cannot hijack a provisional native click',async t=>{
 const metadata=deferred();let f;f=fixture(t,method=>method==='sessionActions'?metadata.promise:undefined);await flush();
 const clicked=f.ctx.uiWorkspace.forkSession('remote'),id=f.dialog().operationId;
 for(const [index,runState] of ['interrupted','failed','running'].entries())f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:'older-'+index,sourceSessionId:'remote',phase:'remotePending',runState,recoverable:runState==='running',recoveryKind:runState==='failed'?'unknown':'resume'}});
 assert.equal(f.dialog().operationId,id);assert.deepEqual(f.opened,[]);assert.deepEqual(f.toasts,[]);
 metadata.resolve({...f.metadata});await clicked;await flush();assert.equal(f.calls.find(call=>call.method==='sessionFork').args.operationId,id);
});

test('a historical completed event cannot consume a provisional native click',async t=>{
 const metadata=deferred();let f;f=fixture(t,method=>method==='sessionActions'?metadata.promise:undefined);await flush();
 const clicked=f.ctx.uiWorkspace.forkSession('remote'),id=f.dialog().operationId;
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:'older-complete',sessionId:'older-child',sourceSessionId:'remote',phase:'completed',runState:'completed'}});
 assert.equal(f.dialog().operationId,id);assert.deepEqual(f.opened,[]);assert.deepEqual(f.toasts,[]);
 metadata.resolve({...f.metadata});await clicked;await flush();assert.equal(f.calls.find(call=>call.method==='sessionFork').args.operationId,id);assert.deepEqual(f.opened,['child']);
});

test('dismissing a busy fork keeps late completion alive and dedupes its Promise result',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const done=f.props().submitAction();const id=f.dialog().operationId;
 assert.equal(f.dialog().busy,true);f.props().dismissAction();assert.equal(f.dialog(),null);
 f.update({type:'fork',sessionId:'remote',operation:{operationId:id,sessionId:'child',sourceSessionId:'remote',phase:'completed',activeStep:'completed',runState:'completed',recoverable:false}});
 assert.deepEqual(f.opened,[]);assert.equal(f.toasts.length,1);
 pending.resolve({ok:true,sessionId:'child',operation:{operationId:id,sessionId:'child',phase:'completed',runState:'completed'}});await done;
 assert.equal(f.toasts.length,1);assert.deepEqual(f.opened,[]);f.toasts[0][2].run();assert.deepEqual(f.opened,['child']);
});

test('a reconnect completion snapshot notifies an observed dismissed fork without navigating',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const done=f.props().submitAction();const id=f.dialog().operationId;f.props().dismissAction();
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:id,sessionId:'child',sourceSessionId:'remote',phase:'completed',runState:'completed',recoverable:false}});
 assert.deepEqual(f.opened,[]);assert.equal(f.toasts.length,1);
 pending.resolve({ok:true,sessionId:'child',operation:{operationId:id,sessionId:'child',phase:'completed',runState:'completed'}});await done;
 assert.equal(f.toasts.length,1);assert.deepEqual(f.opened,[]);
});

test('completion delivered by Promise first ignores the duplicate completed event',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const done=f.props().submitAction();const id=f.dialog().operationId;
 pending.resolve({ok:true,sessionId:'child',operation:{operationId:id,sessionId:'child',phase:'completed',runState:'completed'}});await done;
 assert.deepEqual(f.opened,['child']);assert.equal(f.toasts.length,0);
 f.update({type:'fork',sessionId:'remote',operation:{operationId:id,sessionId:'child',phase:'completed',runState:'completed'}});
 assert.deepEqual(f.opened,['child']);assert.equal(f.toasts.length,0);
});

test('reopening a dismissed running fork never mints an ID or re-enables automatic navigation',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 const clicked=f.ctx.uiWorkspace.forkSession('remote');await clicked;await flush();
 const forks=f.calls.filter(call=>call.method==='sessionFork');assert.equal(forks.length,1);const id=forks[0].args.operationId;
 f.props().dismissAction();await f.ctx.uiWorkspace.forkSession('remote');await f.ctx.uiWorkspace.forkSession('remote');
 assert.equal(f.dialog().operationId,id);assert.equal(f.dialog().busy,true);assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,1);
 pending.resolve({ok:true,sessionId:'child',operation:{operationId:id,sessionId:'child',phase:'completed',runState:'completed'}});await flush();
 assert.deepEqual(f.opened,[]);assert.equal(f.toasts.length,1);
});

test('switching away and back before completion leaves opening explicit',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const done=f.props().submitAction();f.select('other');f.select('remote');
 pending.resolve({ok:true,sessionId:'child'});await done;assert.deepEqual(f.opened,[]);assert.equal(f.toasts.length,1);
});

test('running snapshots restore the same operation and native Fork reopens without resubmitting',async t=>{
 const f=fixture(t);await flush();
 const operation={operationId:'snapshot-running',sessionId:'child',sourceSessionId:'remote',phase:'accepted',activeStep:'checking',runState:'running',recoverable:true,createdAt:1000,stepStartedAt:1000,updatedAt:1000};
 f.metadata.activeForkOperation=operation;f.metadata.canFork=false;
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation});assert.equal(f.dialog(),null);assert.deepEqual(f.toasts,[]);
 const clicked=f.ctx.uiWorkspace.forkSession('remote');assert.equal(f.dialog().operationId,'snapshot-running');assert.equal(f.dialog().operation.activeStep,'checking');
 await clicked;await flush();assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);
 f.update({type:'fork',sessionId:'remote',operation:{...operation,phase:'completed',activeStep:'completed',runState:'completed',recoverable:false,durationMs:1200}});
 assert.deepEqual(f.opened,['child']);assert.equal(f.toasts.length,0);
});

test('historical snapshots cannot displace a restored running operation',async t=>{
 const f=fixture(t);await flush();
 const running={operationId:'current-running',sessionId:'new-child',sourceSessionId:'remote',phase:'accepted',activeStep:'checking',runState:'running',recoverable:true,createdAt:2000};
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:running});
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:'historical-complete',sessionId:'old-child',sourceSessionId:'remote',phase:'completed',runState:'completed',recoverable:false,createdAt:1000}});
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:'historical-interrupted',sourceSessionId:'remote',phase:'remoteCreated',runState:'interrupted',recoverable:true,createdAt:1500}});
 f.metadata.activeForkOperation=running;f.metadata.forkOperation=running;f.metadata.canFork=false;
 await f.ctx.uiWorkspace.forkSession('remote');await flush();assert.equal(f.dialog().operationId,'current-running');assert.equal(f.dialog().operation.runState,'running');
 assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);assert.deepEqual(f.toasts,[]);assert.deepEqual(f.opened,[]);
});

test('interrupted resumable snapshots recover with the durable operation ID',async t=>{
 const f=fixture(t);await flush();
 const operation={operationId:'snapshot-resume',sessionId:'child',sourceSessionId:'remote',phase:'remoteCreated',activeStep:'creatingRemote',runState:'interrupted',recoveryKind:'resume',recoverable:true,error:{message:'disconnected'}};
 f.metadata.forkOperation=operation;f.metadata.canFork=false;
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation});assert.equal(f.dialog(),null);
 await f.ctx.uiWorkspace.forkSession('remote');await flush();
 const call=f.calls.find(call=>call.method==='sessionFork');assert.ok(call);assert.equal(call.args.operationId,'snapshot-resume');assert.deepEqual(f.opened,['child']);
});

test('unknown snapshots cannot auto-retry and new-operation consent changes identity',async t=>{
 const f=fixture(t);await flush();
 const operation={operationId:'snapshot-unknown',sourceSessionId:'remote',phase:'remotePending',activeStep:'creatingRemote',runState:'interrupted',recoveryKind:'unknown',recoverable:false,outcome:'unknown'};
 f.metadata.forkOperation=operation;f.update({type:'fork',snapshot:true,sessionId:'remote',operation});
 await f.ctx.uiWorkspace.forkSession('remote');await flush();assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);
 assert.equal(f.dialog().operationId,'snapshot-unknown');f.props().allowNewFork(true);await f.props().submitAction();
 const call=f.calls.find(call=>call.method==='sessionFork');assert.ok(call);assert.notEqual(call.args.operationId,'snapshot-unknown');
});

test('completed reconnect snapshots restore state without replaying notification or navigation',async t=>{
 const f=fixture(t);await flush();
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:'old-complete',sessionId:'old-child',sourceSessionId:'remote',phase:'completed',runState:'completed',recoverable:false}});
 assert.equal(f.dialog(),null);assert.deepEqual(f.toasts,[]);assert.deepEqual(f.opened,[]);
});

test('live progress updates retain exact counts, real steps, and running state',async t=>{
 const f=fixture(t);const operation={operationId:'progress-op',sessionId:'child',sourceSessionId:'remote',phase:'accepted',activeStep:'checking',runState:'running',recoverable:true,createdAt:1000,stepStartedAt:1000,updatedAt:1000};
 f.metadata.activeForkOperation=operation;f.metadata.canFork=false;(await header(f)).find(action=>action.id==='fork').run();
 assert.equal(f.dialog().operation.activeStep,'checking');assert.equal(f.dialog().busy,true);
 f.update({type:'fork',sessionId:'remote',operation:{...operation,phase:'prepared',activeStep:'copyingHistory',stepStartedAt:1400,updatedAt:1600,progress:{processed:3,total:8}}});
 assert.equal(f.dialog().operation.activeStep,'copyingHistory');assert.deepEqual(f.dialog().operation.progress,{processed:3,total:8});assert.equal(f.dialog().busy,true);
 assert.deepEqual(present(f.dialog().operation,false,2600),{step:'copyingHistory',progress:{processed:3,total:8},running:true,elapsedSeconds:1});
});

test('progress presentation uses total elapsed seconds and never invents determinate counts',()=>{
 for(const step of ['checking','copyingHistory','creatingRemote','binding','restoringNative','flushing','completed'])assert.equal(present({activeStep:step,runState:'running'},false).step,step);
 assert.equal(present({activeStep:'flushing',runState:'running',createdAt:1000},false,16999).elapsedSeconds,15);
 assert.equal(present({activeStep:'completed',runState:'completed',durationMs:12999},false).elapsedSeconds,12);
 assert.equal(present({activeStep:'checking',runState:'running',progress:{processed:2}},false).progress,null);
 assert.equal(present({activeStep:'checking',runState:'running',progress:{processed:0,total:0}},false).progress,null);
 assert.equal(present({activeStep:'checking',runState:'running',progress:{processed:-1,total:4}},false).progress,null);
 assert.deepEqual(present({activeStep:'copyingHistory',runState:'running',progress:{processed:2,total:4}},false).progress,{processed:2,total:4});
 for(const activeStep of ['checking','creatingRemote','binding','restoringNative','flushing','completed'])assert.equal(present({activeStep,runState:'running',progress:{processed:2,total:4}},false).progress,null);
 assert.equal(source.includes('session.forkStep.restoringNative'),true);assert.match(source,/Closing this dialog does not cancel the fork/);assert.match(source,/关闭此对话框不会取消分叉/);
});

test('disposing with metadata pending ignores its late result and does not start a fork',async t=>{
 const metadata=deferred(),f=fixture(t,method=>method==='sessionActions'?metadata.promise:undefined);
 const clicked=f.ctx.uiWorkspace.forkSession('remote');assert.equal(f.dialog().kind,'fork');f.dispose();metadata.resolve({...f.metadata});await clicked;await flush();
 assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);assert.deepEqual(f.opened,[]);assert.deepEqual(f.toasts,[]);assert.equal(f.dialog(),null);
});

test('fork status uses a distinct trailing slot and never registers leading content',t=>{
 const f=fixture(t),registration=f.registration('sidebar.session.row.trailing');
 assert.ok(registration);assert.equal(registration.id,'remote-session.fork-status');assert.equal(registration.order,-90);assert.equal(registration.name,'sidebar.session.row.trailing');
 assert.equal(f.registration('sidebar.session.row.leading'),undefined);assert.deepEqual(f.statuses(),{byId:{}});
 assert.match(source,/event\.stopPropagation\(\);openForkStatus\(sessionId\)/);assert.match(source,/'session.forkStatusRunning':'分叉中'/);assert.match(source,/'session.forkStatusRecovery':'待恢复'/);
});

test('fork status store publishes running, resumable, unknown, and completion transitions',async t=>{
 const f=fixture(t);await flush();const store=f.registration('sidebar.session.row.trailing').inject().hooks.remoteSessionForkStatuses;let notifications=0;
 const unsubscribe=store.subscribe(()=>{notifications++;});t.after(unsubscribe);
 const running={operationId:'row-operation',sessionId:'child',sourceSessionId:'remote',phase:'remotePending',activeStep:'copyingHistory',runState:'running',recoverable:true};
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:running});const runningSnapshot=f.statuses();
 assert.deepEqual(runningSnapshot.byId.remote,{sessionId:'remote',operationId:'row-operation',status:'running'});assert.equal(notifications,1);
 f.update({type:'fork',sessionId:'remote',operation:{...running,progress:{processed:2,total:4}}});assert.equal(f.statuses(),runningSnapshot);assert.equal(notifications,1);
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{...running,runState:'interrupted',recoveryKind:'resume',recoverable:true}});
 assert.equal(f.statuses().byId.remote.status,'recovery');assert.equal(f.statuses().byId.remote.recoveryKind,'resume');assert.equal(f.statuses().byId.remote.recoverable,true);assert.equal(notifications,2);
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{...running,runState:'interrupted',recoveryKind:'unknown',recoverable:false,outcome:'unknown'}});
 assert.equal(f.statuses().byId.remote.recoveryKind,'unknown');assert.equal(f.statuses().byId.remote.recoverable,false);assert.equal(notifications,3);
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{...running,phase:'completed',runState:'completed',recoverable:false}});
 assert.deepEqual(f.statuses(),{byId:{}});assert.equal(notifications,4);
});

test('dismissing a busy dialog preserves its row status until completion',async t=>{
 const pending=deferred(),f=fixture(t,method=>method==='sessionFork'?pending.promise:undefined);
 (await header(f)).find(action=>action.id==='fork').run();const done=f.props().submitAction();const id=f.dialog().operationId,status=f.statuses();
 assert.equal(status.byId.remote.status,'running');f.props().dismissAction();assert.equal(f.statuses(),status);assert.equal(f.dialog(),null);
 pending.resolve({ok:true,sessionId:'child',operation:{operationId:id,sessionId:'child',phase:'completed',runState:'completed'}});await done;
 assert.deepEqual(f.statuses(),{byId:{}});
});

test('delayed metadata cannot regress a live completion back to running',async t=>{
 const metadata=deferred(),f=fixture(t,method=>method==='sessionActions'?metadata.promise:undefined);await flush();
 const running={operationId:'revision-race',sessionId:'child',sourceSessionId:'remote',phase:'remoteCreated',activeStep:'binding',runState:'running',recoverable:true,revision:2};
 f.update({type:'fork',snapshot:true,sessionId:'remote',operation:running});f.reopenStatus('remote');f.select('other');
 f.update({type:'fork',sessionId:'remote',operation:{...running,phase:'completed',activeStep:'completed',runState:'completed',recoverable:false,revision:3}});
 assert.equal(f.dialog().operation.runState,'completed');assert.equal(f.dialog().busy,false);
 metadata.resolve({...f.metadata,activeForkOperation:running,forkOperation:running});await flush();
 assert.equal(f.dialog().operation.runState,'completed');assert.equal(f.dialog().operation.revision,3);assert.equal(f.dialog().busy,false);
});

test('running row status reopens its task and fetches metadata without resubmitting',async t=>{
 const f=fixture(t);await flush();const operation={operationId:'row-running',sessionId:'child',sourceSessionId:'remote',phase:'accepted',activeStep:'checking',runState:'running',recoverable:true};
 f.metadata.activeForkOperation=operation;f.metadata.forkOperation=operation;f.metadata.canFork=false;f.update({type:'fork',snapshot:true,sessionId:'remote',operation});
 const status=f.statuses();f.reopenStatus('remote');assert.equal(f.dialog().operationId,'row-running');assert.equal(f.dialog().kind,'fork');assert.equal(f.statuses(),status);
 await flush();assert.equal(f.calls.filter(call=>call.method==='sessionActions').length,1);assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);assert.equal(f.statuses(),status);
 f.props().dismissAction();f.reopenStatus('remote');await flush();assert.equal(f.calls.filter(call=>call.method==='sessionActions').length,1);assert.equal(f.dialog().operationId,'row-running');
});

test('recovery row status only reopens details and never retries automatically',async t=>{
 const f=fixture(t);await flush();const operation={operationId:'row-recovery',sourceSessionId:'remote',phase:'remoteCreated',activeStep:'creatingRemote',runState:'interrupted',recoveryKind:'resume',recoverable:true};
 f.metadata.forkOperation=operation;f.metadata.canFork=false;f.update({type:'fork',snapshot:true,sessionId:'remote',operation});const status=f.statuses();
 f.reopenStatus('remote');assert.equal(f.dialog().operationId,'row-recovery');assert.equal(f.statuses(),status);await flush();
 assert.equal(f.calls.filter(call=>call.method==='sessionFork').length,0);assert.equal(f.statuses(),status);assert.equal(f.dialog().operation.recoverable,true);
});

test('disposal clears trailing fork status state',async t=>{
 const f=fixture(t);await flush();f.update({type:'fork',snapshot:true,sessionId:'remote',operation:{operationId:'dispose-row',sourceSessionId:'remote',phase:'accepted',runState:'running',recoverable:true}});
 assert.equal(f.statuses().byId.remote.status,'running');f.dispose();assert.deepEqual(f.statuses(),{byId:{}});
});

test('fork dialog renders real progress, elapsed time and a busy-safe close action',t=>{
 const f=fixture(t),component=f.registration('shell.overlay').component;
 const base={kind:'fork',key:'dialog',title:'Source',metadata:{pending:false,canFork:false,archived:false},error:'',allowNew:false};
 const running={...base,busy:true,operation:{operationId:'render-running',activeStep:'copyingHistory',runState:'running',recoverable:false,createdAt:Date.now()-5000,progress:{processed:3,total:10}}};
 const {tree,calls}=renderDialog(component,running),progress=findNodes(tree,'progress');
 assert.equal(progress.length,1);assert.equal(progress[0].props.max,10);assert.equal(progress[0].props.value,3);assert.equal(progress[0].props['aria-label'],'session.forkProgressLabel');
 assert.match(JSON.stringify(tree),/session\.forkStep\.copyingHistory/);assert.match(JSON.stringify(tree),/session\.forkHideKeepsRunning/);assert.match(JSON.stringify(tree),/session\.forkElapsed/);
 for(const node of findNodes(tree,'span').filter(value=>value.props.role==='status'))assert.doesNotMatch(JSON.stringify(node),/session\.forkElapsed/);
 findNodes(tree,'Modal')[0].props.onClose();assert.deepEqual(calls,['dismiss']);
 const indeterminate=renderDialog(component,{...base,busy:true,operation:{...running.operation,activeStep:'creatingRemote',progress:null}}).tree;
 assert.equal(findNodes(indeterminate,'progress')[0].props.value,undefined);
 const pending=renderDialog(component,{...base,busy:false,metadata:{pending:true,canFork:false,archived:false},operation:null}).tree;
 assert.match(JSON.stringify(pending),/session\.forkPreparing/);
 const unavailable=renderDialog(component,{...base,busy:false,operation:null}).tree;assert.match(JSON.stringify(unavailable),/session\.forkBusy/);
});

test('fork dialog renders recovery, unknown consent, operation errors and completed opening',t=>{
 const f=fixture(t),component=f.registration('shell.overlay').component;
 const base={kind:'fork',key:'dialog',title:'Source',metadata:{pending:false,canFork:false,archived:false},busy:false,error:'',allowNew:false};
 const recovery=renderDialog(component,{...base,operation:{operationId:'render-recovery',runState:'interrupted',recoverable:true,durationMs:2000}});
 assert.match(JSON.stringify(recovery.tree),/session\.forkRecovery/);assert.match(JSON.stringify(recovery.tree),/session\.recoverFork/);
 const unknown=renderDialog(component,{...base,allowNew:true,operation:{operationId:'render-unknown',runState:'failed',recoverable:false,outcome:'unknown',error:{message:'lost'}}});
 assert.match(JSON.stringify(unknown.tree),/session\.unknownFork/);assert.match(JSON.stringify(unknown.tree),/session\.newAfterUnknown/);
 findNodes(unknown.tree,'Checkbox')[0].props.onChange(true);assert.deepEqual(unknown.calls,[['allow',true]]);
 const completed=renderDialog(component,{...base,operation:{operationId:'render-complete',runState:'completed',phase:'completed',sessionId:'child'}});
 const primary=findNodes(completed.tree,'Button').find(node=>node.props.variant==='primary');assert.equal(primary.props.disabled,false);primary.props.onClick();assert.deepEqual(completed.calls,['open']);
});

test('fork trailing button renders running/recovery accessibility and stops row activation',t=>{
 const f=fixture(t),component=f.registration('sidebar.session.row.trailing').component,opened=[];
 for(const status of [{status:'running',operationId:'running'},{status:'recovery',recoveryKind:'unknown',operationId:'unknown'}]){
  const tree=component({sessionId:'remote',useRemoteSessionForkStatuses:read=>read({byId:{remote:status}}),openForkStatus:id=>opened.push(id)});
  assert.equal(tree.type,'button');assert.match(tree.props['aria-label'],new RegExp('^'+(status.status==='running'?'session.forkStatusRunning':'session.forkStatusRecovery')+':'));assert.match(tree.props['aria-label'],status.status==='running'?/session.forkStatusRunningTitle/:/session.forkStatusRecoveryTitle/);
  let prevented=false,stopped=false;tree.props.onClick({preventDefault:()=>{prevented=true;},stopPropagation:()=>{stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);
 }
 assert.deepEqual(opened,['remote','remote']);assert.equal(component({sessionId:'remote',useRemoteSessionForkStatuses:read=>read({byId:{}}),openForkStatus:()=>{}}),null);
});

test('fork dialog locale resources stay complete in Chinese and English',()=>{
 for(const key of ['session.forkPreparing','session.forkElapsed','session.forkHideKeepsRunning','session.forkRecovery','session.forkStep.copyingHistory','session.forkStep.creatingRemote','session.forkStatusRunning','session.forkStatusRecovery']){
  assert.equal(typeof messages.zh[key],'string',key);assert.equal(typeof messages.en[key],'string',key);
 }
});
