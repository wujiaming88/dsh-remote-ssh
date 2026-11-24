import {prepareSubmission,acknowledgeSubmission} from './submission.js';

// Draft/ack lifetime is independent of a mounted ChatPane and its HTTP subscription.
// Only text is persisted; attachment bytes and pending request identities stay in memory.
export class ComposerSession {
  constructor(sessionId,storage) {
    this.key=`remote-acp.draft.v3.${sessionId}`;
    try { this.storage=storage===undefined?(typeof window==='undefined'?null:window.localStorage):storage; } catch {}
    let draft='';try { draft=this.storage?.getItem(this.key)||''; } catch {}
    this.state={draft,attachments:[],sending:false,error:''};
    this.pending=null;this.attempt=0;this.listeners=new Set();
  }
  getSnapshot=()=>this.state;
  subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  publish(patch) {
    this.state={...this.state,...patch};
    if(Object.hasOwn(patch,'draft'))try { this.storage?.setItem(this.key,this.state.draft); } catch {}
    for(const listener of this.listeners)listener();
  }
  setDraft=value=>this.publish({draft:typeof value==='function'?value(this.state.draft):String(value)});
  setAttachments=value=>this.publish({attachments:typeof value==='function'?value(this.state.attachments):value});
  begin(kind) {
    if(this.state.sending)throw new Error('A submission is awaiting acknowledgment');
    const request=prepareSubmission(this.state.draft,this.state.attachments,this.pending);
    this.pending={...request,kind:request.kind||kind};
    const attempt=++this.attempt;
    this.publish({sending:true,error:''});
    return {request:this.pending,attempt};
  }
  acknowledge(requestId) {
    if(this.pending?.requestId!==requestId)return;
    const next=acknowledgeSubmission(this.state.draft,this.state.attachments,this.pending);
    this.pending=null;this.publish({...next,sending:false,error:''});
  }
  finish(request,attempt,error) {
    if(this.attempt!==attempt||this.pending?.requestId!==request.requestId)return;
    this.publish({sending:false,error:error?.message||''});
  }
  get hasContent() {return !!(this.state.draft||this.state.attachments.length||this.pending);}
  clear() {this.pending=null;this.attempt++;this.publish({draft:'',attachments:[],sending:false,error:''});}
}
