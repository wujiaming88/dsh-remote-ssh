import {prepareSubmission,acknowledgeSubmission,submissionSignature} from './submission.js';
import {prepareFileAttachments} from './file-intake.js';

// Draft/ack lifetime is independent of a mounted ChatPane and its HTTP subscription.
// Only text is persisted; attachment bytes and pending request identities stay in memory.
export class ComposerSession {
  constructor(sessionId,storage) {
    this.key=`remote-acp.draft.v3.${sessionId}`;
    this.quoteKey=`remote-acp.quotes.v1.${sessionId}`;
    try { this.storage=storage===undefined?(typeof window==='undefined'?null:window.localStorage):storage; } catch {}
    let draft='';try { draft=this.storage?.getItem(this.key)||''; } catch {}
    let quotes=[];try { const value=JSON.parse(this.storage?.getItem(this.quoteKey)||'[]'); if(Array.isArray(value))quotes=value.filter(q=>q&&typeof q.id==='string'&&typeof q.text==='string').map(q=>({id:q.id,text:q.text,summary:String(q.summary||q.text).slice(0,120)})); } catch {}
    this.state={draft,quotes,attachments:[],sending:false,readingFiles:false,uploads:{},error:'',pendingKind:null};
    this.pending=null;this.attempt=0;this.intakeEpoch=0;this.listeners=new Set();
  }
  getSnapshot=()=>this.state;
  subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  publish(patch) {
    this.state={...this.state,...patch};
    this.state.pendingKind=this.pending?.signature===submissionSignature(this.state.draft,this.state.attachments,this.state.quotes)?this.pending.kind:null;
    if(Object.hasOwn(patch,'draft'))try { this.storage?.setItem(this.key,this.state.draft); } catch {}
    if(Object.hasOwn(patch,'quotes'))try { this.storage?.setItem(this.quoteKey,JSON.stringify(this.state.quotes)); } catch {}
    for(const listener of this.listeners)listener();
  }
  setDraft=value=>this.publish({draft:typeof value==='function'?value(this.state.draft):String(value)});
  addQuote=value=>{if(!value||typeof value.text!=='string'||!value.text.trim())return false;this.publish({quotes:[...this.state.quotes,{id:String(value.id||`q-${Date.now()}`),text:value.text,summary:String(value.summary||value.text).slice(0,120)}]});return true;};
  removeQuote=id=>this.publish({quotes:this.state.quotes.filter(value=>value.id!==id)});
  retainedUploads(attachments, pending=this.pending) {
    const ids=new Set([...attachments.map(file=>file.uploadId),...(pending?.attachments||[]).map(file=>file.uploadId)]);
    return Object.fromEntries(Object.entries(this.state.uploads).filter(([id])=>ids.has(id)));
  }
  setAttachments=value=>{
    const attachments=typeof value==='function'?value(this.state.attachments):value;
    this.publish({attachments,uploads:this.retainedUploads(attachments)});
  };
  setUpload(uploadId,value) {this.publish({uploads:{...this.state.uploads,[uploadId]:value}});}
  async receiveFiles(files,capabilities,formatFailure=error=>error.message) {
    if(this.state.sending||this.state.readingFiles||!files.length)return;
    const epoch=++this.intakeEpoch;
    this.publish({readingFiles:true,error:''});
    try {
      const added=await prepareFileAttachments(files,this.state.attachments,capabilities);
      if(epoch!==this.intakeEpoch)return;
      // This composer belongs to one immutable session binding, even when its view unmounts.
      this.setAttachments(previous=>[...previous,...added]);
    } catch(error) {
      if(epoch===this.intakeEpoch)this.publish({error:formatFailure(error)});
      throw error;
    } finally {if(epoch===this.intakeEpoch)this.publish({readingFiles:false});}
  }
  begin(kind) {
    if(this.state.readingFiles)throw new Error('Files are still being read');
    if(this.state.sending)throw new Error('A submission is awaiting acknowledgment');
    const request=prepareSubmission(this.state.draft,this.state.attachments,this.pending,undefined,this.state.quotes);
    if(!['prompt','queue','steer'].includes(kind))throw Object.assign(new Error('Invalid message submission mode'),{code:'bad_request'});
    if(request.kind&&request.kind!==kind) {
      const error=Object.assign(new Error('The previous message is awaiting confirmation. Retry its original mode before changing modes.'),{code:'submission_mode_locked'});
      this.publish({error:error.message});throw error;
    }
    this.pending={...request,kind};
    const attempt=++this.attempt;
    this.publish({sending:true,error:''});
    return {request:this.pending,attempt};
  }
  acknowledge(requestId) {
    if(this.pending?.requestId!==requestId)return;
    const next=acknowledgeSubmission(this.state.draft,this.state.attachments,this.pending,this.state.quotes);
    this.pending=null;this.publish({...next,quotes:next.draft===''?[]:this.state.quotes,uploads:this.retainedUploads(next.attachments,null),sending:false,error:''});
  }
  finish(request,attempt,error) {
    if(this.attempt!==attempt||this.pending?.requestId!==request.requestId)return;
    // These outcomes prove the adapter never consumed this message. Keep the
    // draft, but allow a fresh explicitly selected mode. Unknown outcomes keep
    // the immutable request identity and require an explicit same-mode retry.
    const unconsumed=['steering_not_injected','steering_unsupported','steer_content_unsupported','no_active_turn','queue_full','bad_attachment','bad_prompt','attachment_unsupported'].includes(error?.code);
    // A retry's local validation failure says nothing about the earlier attempt
    // whose receipt was lost. Never release that identity and blindly resend.
    if(unconsumed&&!request.uncertain)this.pending=null;
    else if(error)this.pending={...this.pending,uncertain:true};
    this.publish({sending:false,error:error?.message||''});
  }
  get hasContent() {return !!(this.state.draft||this.state.attachments.length||this.state.readingFiles||this.pending);}
  clear() {this.pending=null;this.attempt++;this.intakeEpoch++;this.publish({draft:'',quotes:[],attachments:[],sending:false,readingFiles:false,uploads:{},error:''});}
}
