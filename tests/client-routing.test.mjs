import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackendRouter,knownRemoteBlank} from '../src/client/router.js';
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
function setup(t){const pending=[],visible=[];const router=createBackendRouter({load:sessionId=>new Promise(resolve=>pending.push({sessionId,resolve})),show:value=>visible.push(value)});t.after(()=>router.dispose());return{router,pending,visible}}
const remote=sessionId=>({ok:true,sessionId,remote:true,workspace:{id:'w'},backend:{type:'claude'}});
test('pending lookup and session-not-found cannot acquire native Chat',async t=>{
 const {router,pending,visible}=setup(t);router.select('local');await settle();assert.equal(visible.at(-1),false);
 pending[0].resolve({ok:false,code:'session_not_found',error:'not found'});await settle();assert.equal(router.getSnapshot().phase,'error');assert.equal(visible.at(-1),false);
 router.refresh();await settle();assert.equal(visible.at(-1),false);
});
test('late remote responses cannot seize a newer local session',async t=>{
 const {router,pending,visible}=setup(t);router.select('remote');await settle();router.select('local');await settle();
 pending[0].resolve(remote('remote'));await settle();assert.equal(router.getSnapshot().sessionId,'local');assert.equal(visible.at(-1),false);
 pending[1].resolve({ok:true,sessionId:'local',remote:false,backend:{type:'dsh'}});await settle();assert.equal(router.getSnapshot().phase,'native');
});
test('only complete remote identity and a supported backend own the surface',async t=>{
 for(const value of [{ok:true,sessionId:'s',remote:true,backend:{type:'claude'}},{...remote('s'),backend:{type:'unknown'}},{...remote('s'),backend:{type:'dsh'}},{...remote('s'),remote:false}]){
  const {router,pending,visible}=setup(t);router.select('s');await settle();pending[0].resolve(value);await settle();assert.equal(visible.at(-1),false);
 }
});
test('a confirmed remote owns one view and may retain its own failure state',async t=>{
 const {router,pending,visible}=setup(t);router.select('r');await settle();pending[0].resolve(remote('r'));await settle();assert.equal(visible.at(-1),true);
 router.refresh();await settle();pending[1].resolve({ok:false,error:'offline'});await settle();assert.equal(visible.at(-1),true);assert.equal(router.getSnapshot().ownsRemote,true);
 router.select('local');await settle();assert.equal(visible.at(-1),false);
});
test('wrong response identity fails closed and clearing selection releases ownership',async t=>{
 const {router,pending,visible}=setup(t);router.select('a');await settle();pending[0].resolve(remote('b'));await settle();assert.equal(visible.at(-1),false);
 router.select('');assert.equal(router.getSnapshot().phase,'native');assert.equal(visible.at(-1),false);
});
test('disposal prevents delayed requests and listeners from reviving UI',async t=>{
 const {router,pending,visible}=setup(t);let calls=0;router.subscribe(()=>calls++);router.select('s');await settle();router.dispose();const count=calls;
 pending[0].resolve(remote('s'));await settle();assert.equal(calls,count);assert.equal(visible.at(-1),false);
});

test('only genuine blank workspace metadata can provide a startup placeholder',()=>{
 const workspace={mirrorPath:'/private/profile/anchors/w',backend:{type:'claude'}};
 assert.equal(knownRemoteBlank({blank:true,cwd:workspace.mirrorPath},[workspace]),true);
 assert.equal(knownRemoteBlank({blank:false,cwd:workspace.mirrorPath},[workspace]),false);
 assert.equal(knownRemoteBlank({blank:true,cwd:workspace.mirrorPath+'-other'},[workspace]),false);
 assert.equal(knownRemoteBlank({blank:true,cwd:'/Users/local'},[workspace]),false);
 assert.equal(knownRemoteBlank({blank:true,cwd:'/Users/local'},undefined),false);
 assert.equal(knownRemoteBlank({blank:true,cwd:'/Users/local'},[null]),false);
});
test('known remote startup failures retain an error placeholder, not native Chat',async t=>{
 const {router,pending,visible}=setup(t);router.select('r',true,{blankWorkspace:true});await settle();
 assert.equal(visible.at(-1),true);assert.equal(router.getSnapshot().phase,'loading');assert.equal(router.getSnapshot().value,null);
 pending[0].resolve({ok:false,error:'backend unavailable'});await settle();assert.equal(visible.at(-1),true);assert.equal(router.getSnapshot().phase,'error');
 router.select('local',true,{});await settle();assert.equal(visible.at(-1),false);
});
test('native recorded remote facts cannot be downgraded by a missing private binding',async t=>{
 const {router,pending,visible}=setup(t);router.select('recorded',true,{recorded:true});await settle();
 pending[0].resolve({ok:true,sessionId:'recorded',remote:false,backend:{type:'dsh'}});await settle();
 assert.equal(visible.at(-1),true);assert.equal(router.getSnapshot().phase,'error');
});
