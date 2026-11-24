import {SessionClient} from './session.js';
import {ComposerSession} from './composer-session.js';

// Use immutable Host identity, not mutable title/model/permission or object identity.
export function sessionClientKey(backend) {
  return JSON.stringify([backend.sessionId,backend.workspace?.id,backend.workspace?.profileId,
    backend.workspace?.mirrorPath,backend.workspace?.remotePath,backend.cwd,backend.remoteCwd,backend.backend?.type]);
}
const differs=(a,b)=>!!(a&&b&&a!==b);
function bindingIdentity(backend,key,binding=backend.binding) {
  return {key,id:binding?.id,remotePath:binding?.remotePath,canonicalRemotePath:backend.canonicalRemotePath};
}
function changedIdentity(a,b) {
  return a.key!==b.key||['id','remotePath','canonicalRemotePath'].some(key=>differs(a[key],b[key]));
}
function retainKnown(previous,next) {
  return {...previous,...Object.fromEntries(Object.entries(next).filter(([,value])=>value!=null&&value!==''))};
}
function compatible(client,backend) {
  if(client.disposed||sessionClientKey(client.backend)!==sessionClientKey(backend))return false;
  const id=client.state.binding?.id||client.backend.binding?.id;
  if(id&&backend.binding?.id&&id!==backend.binding.id)return false;
  return !differs(client.backend.canonicalRemotePath,backend.canonicalRemotePath)&&!differs(client.state.binding?.remotePath,backend.binding?.remotePath);
}

// At most two warm subscriptions (HTTP/1.1 also needs room for prompt and metadata).
// Eviction closes browser requests only; the Host continues the remote task.
export class SessionClientPool {
  constructor({maxClients=2,idleMs=10*60*1000,createClient=(backend,deps)=>new SessionClient(backend,deps),
    storage,setTimeout:later=globalThis.setTimeout,clearTimeout:cancel=globalThis.clearTimeout}={}) {
    this.maxClients=maxClients;this.idleMs=idleMs;this.createClient=createClient;this.storage=storage;
    this.later=later;this.cancel=cancel;this.entries=new Map();this.drafts=new Map();this.identities=new Map();this.clock=0;this.disposed=false;this.denied=null;
  }
  peek(backend) {
    const entry=this.entries.get(backend.sessionId);
    return entry&&compatible(entry.client,backend)?entry.client:null;
  }
  acquire(backend) {
    if(this.disposed)throw new Error('Remote client pool is disposed');
    let entry=this.entries.get(backend.sessionId);
    const key=sessionClientKey(backend);
    if(entry&&!compatible(entry.client,backend)){
      if(entry.leases)throw Object.assign(new Error('This Session identity changed while another view is using it. Reopen the conversation.'),{code:'binding_mismatch'});
      entry.client.composer.clear();this.drafts.delete(entry.key);
      this.evict(backend.sessionId,entry);entry=null;
    }
    if(!entry){
      let previous=this.identities.get(backend.sessionId);
      const identity=bindingIdentity(backend,key);
      if(previous&&changedIdentity(previous,identity)){
        this.drafts.get(previous.key)?.clear();this.drafts.delete(previous.key);previous=null;
      }
      this.identities.set(backend.sessionId,retainKnown(previous,identity));
      let composer=this.drafts.get(key);
      if(!composer){composer=new ComposerSession(backend.sessionId,this.storage);this.drafts.set(key,composer);}
      const client=this.createClient(backend,{composer,onAccessDenied:error=>this.invalidate(error),onAuthorized:()=>{this.denied=null;},
        onBinding:snapshot=>{
          const previous=this.identities.get(backend.sessionId),next=bindingIdentity(backend,key,snapshot);
          const changed=previous&&changedIdentity(previous,next);
          if(changed)composer.clear();
          this.identities.set(backend.sessionId,retainKnown(changed?null:previous,next));
        }});
      if(this.denied)client.invalidate(this.denied);
      entry={client,key,leases:0,timer:null,used:0};this.entries.set(backend.sessionId,entry);
    }
    entry.client.backend={...backend,canonicalRemotePath:backend.canonicalRemotePath||entry.client.backend.canonicalRemotePath};entry.leases++;entry.used=++this.clock;
    this.cancel(entry.timer);entry.timer=null;this.trim();
    let released=false;
    return {client:entry.client,release:()=>{
      if(released)return;released=true;entry.leases--;
      if(this.entries.get(backend.sessionId)!==entry||entry.leases)return;
      entry.timer=this.later(()=>this.evict(backend.sessionId,entry),this.idleMs);
      this.trim();
    }};
  }
  trim() {
    while(this.entries.size>this.maxClients){
      const oldest=[...this.entries].filter(([,entry])=>!entry.leases).sort((a,b)=>a[1].used-b[1].used)[0];
      if(!oldest)break; // Never evict a mounted reader; trim again when its lease ends.
      this.evict(...oldest);
    }
  }
  evict(id,entry) {
    if(this.entries.get(id)!==entry)return;
    this.identities.set(id,retainKnown(this.identities.get(id),bindingIdentity(entry.client.backend,entry.key,entry.client.state.binding||entry.client.backend.binding)));
    this.entries.delete(id);this.cancel(entry.timer);entry.client.dispose();
    // Keep only user-owned draft/uncertain-send data, never another transcript cache.
    if(!entry.client.composer.hasContent){this.drafts.delete(entry.key);this.identities.delete(id);}
  }
  invalidate(error) {
    this.denied=error;
    for(const entry of this.entries.values())entry.client.invalidate(error);
    for(const draft of this.drafts.values())draft.clear();
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const [id,entry] of this.entries)this.evict(id,entry);
    this.drafts.clear();this.identities.clear();
  }
}
