import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {formatError} from '../src/client/api.js';
const source=readFileSync(new URL('../src/client/session-actions.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const declaration=ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='installSessionActions').declaration;
// Exercise the actual action controller and callbacks, not React/DOM rendering.
const install=new Function('api','formatError','NAMESPACE','REMOTE_SESSION_PROJECTION_KEY','ActionsDialog',source.slice(declaration.start,declaration.end)+'\nreturn installSessionActions;');
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes});return{promise,resolve}};
function fixture(t,handle){
 const providers=new Map(),calls=[],opened=[],toasts=[],cleanup=[],nativeForks=[];let dialogRegistration,current='remote',onUpdate;
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
  workspaces:{list:observable},uiSession:{adapter:{current:{getSnapshot:()=>({key:current})}}},
  uiWorkspace:{openSession:id=>opened.push(id),forkSession:(...args)=>{nativeForks.push(args);return Promise.resolve();}},
  contextMenus:{register:definition=>{providers.set(definition.target,definition);return()=>providers.delete(definition.target);},notify:(...args)=>toasts.push(args)},
  slots:{inject(_name,fn){const result=fn();if(typeof result==='function')cleanup.push(result);},register(options){dialogRegistration=options;return()=>{};}},
 };
 install(api,formatError,'namespace','fact',()=>{throw Error('No renderer is invoked by these tests')})(ctx,{watch:(_method,_args,signal,listener)=>{onUpdate=listener;if(signal.aborted)return Promise.resolve();return new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));}});
 const dispose=()=>{for(const action of cleanup.reverse())action();};t.after(dispose);
 return{ctx,providers,calls,opened,toasts,nativeForks,metadata,dispose,update:event=>onUpdate(event),select:id=>{current=id;},props:()=>dialogRegistration.inject(),dialog:()=>dialogRegistration.inject().hooks.actionDialog.getSnapshot()};
}
async function header(f){return f.providers.get('remote-agent-session').resolve({sessionId:'remote'},new AbortController().signal)}
test('native fork service is routed to remote fork and delegated for local sessions',async t=>{
 const f=fixture(t);
 let analysed=null;await f.ctx.uiWorkspace.forkSession('remote',id=>{analysed=id;});assert.equal(analysed,'child');
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
