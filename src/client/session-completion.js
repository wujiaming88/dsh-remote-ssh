const KEY='dsh-remote-ssh:completion-seen:v1';
const LIMIT=4096;
export const validCompletionId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validSessionId=value=>typeof value==='string'&&value.length>0&&value.length<=1024;

// Read receipts are per browser tab, survive its reload, and contain only ids.
// Storage denial/quota/corruption cannot prevent viewing or alter Agent state.
export class CompletionReceipts {
  constructor({storage=()=>globalThis.sessionStorage}={}) {
    this.storage=storage;this.seen=new Map();
    try {
      const raw=this.storage()?.getItem(KEY);
      if(!raw||raw.length>2*1024*1024)return;
      const data=JSON.parse(raw);
      if(data?.version!==1||!Array.isArray(data.entries))return;
      for(const pair of data.entries.slice(-LIMIT))if(Array.isArray(pair)&&validSessionId(pair[0])&&validCompletionId(pair[1]))this.seen.set(pair[0],pair[1]);
    } catch {}
  }
  get(id){return this.seen.get(id);}
  save(){try{const storage=this.storage();if(this.seen.size)storage?.setItem(KEY,JSON.stringify({version:1,entries:[...this.seen].slice(-LIMIT)}));else storage?.removeItem(KEY);}catch{}}
  mark(id,completionId){
    if(!validSessionId(id)||!validCompletionId(completionId)||this.seen.get(id)===completionId)return;
    this.seen.delete(id);this.seen.set(id,completionId);
    this.save();
  }
  remove(id){if(this.seen.delete(id))this.save();}
  retain(ids){let changed=false;for(const id of this.seen.keys())if(!ids.has(id)){this.seen.delete(id);changed=true;}if(changed)this.save();}
  clear(){this.seen.clear();this.save();}
}

export function foregroundConversation(){
  return globalThis.document?.visibilityState==='visible'&&globalThis.document?.hasFocus()===true;
}
function subscribeForeground(listener){
  const doc=globalThis.document,win=globalThis.window;
  doc?.addEventListener('visibilitychange',listener);
  win?.addEventListener('focus',listener);win?.addEventListener('blur',listener);
  return ()=>{doc?.removeEventListener('visibilitychange',listener);win?.removeEventListener('focus',listener);win?.removeEventListener('blur',listener);};
}
// Called only from the mounted conversation's effect, never from a sidebar row.
// canView reads current public routing/panel sources at the instant of delivery,
// so stale React effects cannot acknowledge a different or covered main panel.
export function watchSessionCompletion(store,sessionId,{canView,isForeground=foregroundConversation,subscribe=subscribeForeground}){
  const release=store.watchView(sessionId,()=>canView()&&isForeground());
  const refresh=()=>store.readVisible(sessionId);
  const unsubscribe=subscribe(refresh);refresh();
  return ()=>{unsubscribe();release();};
}
