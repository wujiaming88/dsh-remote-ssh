import {stream} from './api.js';
import {CompletionReceipts,validCompletionId} from './session-completion.js';

const STATES=new Set(['running','waiting','idle','error','disconnected','completed','stopped']);
const AUTH_ERRORS=new Set(['remote_access_denied','request_forbidden','unauthenticated','http_401','http_403']);
const TERMINAL_ERRORS=new Set([...AUTH_ERRORS,'api_not_found','http_404']);
export function sessionStatusEntry(value) {
  if(!value||typeof value.sessionId!=='string'||!value.sessionId||value.sessionId.length>1024)return null;
  const entry={sessionId:value.sessionId,status:STATES.has(value.status)?value.status:'unknown'};
  if(entry.status==='waiting'&&['permission','elicitation'].includes(value.waitingFor))entry.waitingFor=value.waitingFor;
  if(entry.status==='completed'&&validCompletionId(value.completionId))entry.completionId=value.completionId;
  return entry;
}
const sameEntry=(a,b)=>a?.sessionId===b?.sessionId&&a?.status===b?.status&&a?.waitingFor===b?.waitingFor&&a?.completionId===b?.completionId&&a?.completionUnread===b?.completionUnread&&a?.lastCompletionId===b?.lastCompletionId;

// One overview connection for the whole sidebar, not a retained Agent/ACP stream
// for each row. No titles, paths, prompts or permission payloads enter this store.
export class SessionStatusStore {
  constructor({connect=stream,receipts=new CompletionReceipts(),setTimeout=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimeout=id=>globalThis.clearTimeout(id)}={}) {
    this.connect=connect;this.schedule=setTimeout;this.unschedule=clearTimeout;
    this.receipts=receipts;this.views=new Map();
    this.state={byId:{},connected:false};this.listeners=new Set();this.started=false;this.blocked=false;this.epoch=0;this.failures=0;
    this.controller=null;this.retry=null;this.watchdog=null;this.task=null;
  }
  isViewing(id){
    for(const view of this.views.values())if(view.sessionId===id){try{if(view.visible())return true;}catch{}}
    return false;
  }
  completion(entry){
    if(entry.status!=='completed')return entry;
    if(entry.completionId&&this.isViewing(entry.sessionId))this.receipts.mark(entry.sessionId,entry.completionId);
    return {...entry,completionUnread:!!entry.completionId&&this.receipts.get(entry.sessionId)!==entry.completionId};
  }
  readVisible(sessionId){
    const previous=this.state.byId[sessionId];
    if(!previous||!this.isViewing(sessionId))return;
    // Opening during a feed outage may acknowledge only the last observed
    // completion, never an unseen future turn that could have finished offline.
    if(previous.status==='unknown'&&previous.lastCompletionId)this.receipts.mark(sessionId,previous.lastCompletionId);
    if(previous.status!=='completed')return;
    const entry=this.completion(previous);
    if(!sameEntry(previous,entry))this.publish({...this.state.byId,[sessionId]:entry},this.state.connected);
  }
  watchView(sessionId,visible){
    const token=Symbol('conversation-view');this.views.set(token,{sessionId,visible});
    this.readVisible(sessionId);
    return ()=>this.views.delete(token);
  }
  getSnapshot=()=>this.state;
  subscribe=listener=>{this.listeners.add(listener);return ()=>this.listeners.delete(listener);};
  publish(byId,connected) {
    if(this.state.byId===byId&&this.state.connected===connected)return;
    this.state={byId,connected};
    for(const listener of this.listeners){try{listener();}catch{}}
  }
  unknown() {
    const byId=Object.fromEntries(Object.entries(this.state.byId).map(([id,entry])=>{
      const lastCompletionId=entry.status==='completed'?entry.completionId:entry.lastCompletionId;
      return [id,{sessionId:entry.sessionId,status:'unknown',...(lastCompletionId?{lastCompletionId}:{})}];
    }));
    this.publish(byId,false);
  }
  receive(event) {
    if(!event||typeof event!=='object')return false;
    if(event.type==='reset') {
      this.publish({},false);
      if(event.reason==='access_revoked'){this.receipts.clear();this.blocked=true;this.controller?.abort();}
      return true;
    }
    if(event.type==='snapshot'&&Array.isArray(event.sessions)) {
      const entries=event.sessions.map(sessionStatusEntry).filter(Boolean).map(entry=>this.completion(entry));
      this.receipts.retain(new Set(entries.map(entry=>entry.sessionId)));
      this.publish(Object.fromEntries(entries.map(entry=>[entry.sessionId,entry])),true);return true;
    }
    if(event.type==='upsert') {
      const value=sessionStatusEntry(event.session);if(!value)return false;
      const entry=this.completion(value);
      const previous=this.state.byId[entry.sessionId];
      this.publish(sameEntry(previous,entry)?this.state.byId:{...this.state.byId,[entry.sessionId]:entry},true);return true;
    }
    if(event.type==='remove'&&typeof event.sessionId==='string') {
      this.receipts.remove(event.sessionId);
      const byId={...this.state.byId};delete byId[event.sessionId];this.publish(byId,true);return true;
    }
    if(event.type==='heartbeat'){this.publish(this.state.byId,true);return true;}
    return false;
  }
  clearTimer(name) {if(this[name]!==null){this.unschedule(this[name]);this[name]=null;}}
  start() {if(this.started)return;this.started=true;this.blocked=false;this.open();}
  open() {
    if(!this.started||this.blocked)return;
    this.clearTimer('retry');
    const epoch=++this.epoch,controller=new AbortController();this.controller=controller;
    const current=()=>this.started&&epoch===this.epoch;
    const arm=()=>{
      this.clearTimer('watchdog');
      this.watchdog=this.schedule(()=>{this.watchdog=null;if(current()){this.unknown();controller.abort();}},45_000);
    };
    arm();
    this.task=(async()=>{
      try {
        await this.connect('sessionActivityEvents',{},controller.signal,event=>{
          if(!current()||controller.signal.aborted)return;
          if(this.receive(event)&&!this.blocked){if(event.type==='heartbeat')this.failures=0;arm();}
        });
      } catch(error) {
        if(current()&&TERMINAL_ERRORS.has(error?.code)) {
          if(AUTH_ERRORS.has(error.code))this.receipts.clear();
          this.blocked=true;this.publish({},false);
        }
      } finally {
        if(!current())return;
        this.clearTimer('watchdog');this.controller=null;
        if(this.blocked)return;
        this.unknown();
        const delay=Math.min(30_000,1000*2**Math.min(this.failures++,5));
        this.retry=this.schedule(()=>{this.retry=null;this.open();},delay);
      }
    })();
  }
  dispose() {
    this.started=false;this.epoch++;this.controller?.abort();this.controller=null;
    this.clearTimer('retry');this.clearTimer('watchdog');this.views.clear();this.publish({},false);this.listeners.clear();
  }
}
