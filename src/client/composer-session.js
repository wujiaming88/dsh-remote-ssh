import {prepareSubmission,acknowledgeSubmission} from './submission.js';
import {prepareFileAttachments} from './file-intake.js';

// Draft/ack lifetime is independent of a mounted ChatPane and its HTTP subscription.
// Only text is persisted; attachment bytes and pending request identities stay in memory.
export class ComposerSession {
  constructor(sessionId,storage) {
    this.key=`remote-acp.draft.v3.${sessionId}`;
    try { this.storage=storage===undefined?(typeof window==='undefined'?null:window.localStorage):storage; } catch {}
    let draft='';try { draft=this.storage?.getItem(this.key)||''; } catch {}
    this.state={draft,attachments:[],sending:false,readingFiles:false,uploads:{},error:''};
    this.pending=null;this.attempt=0;this.intakeEpoch=0;this.listeners=new Set();
  }
  getSnapshot=()=>this.state;
  subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  publish(patch) {
    this.state={...this.state,...patch};
    if(Object.hasOwn(patch,'draft'))try { this.storage?.setItem(this.key,this.state.draft); } catch {}
    for(const listener of this.listeners)listener();
  }
  setDraft=value=>this.publish({draft:typeof value==='function'?value(this.state.draft):String(value)});
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
    const request=prepareSubmission(this.state.draft,this.state.attachments,this.pending);
    if((request.kind||kind)==='steer'&&request.attachments.length) {
      const error=Object.assign(new Error('Keep attachments in the draft until the current turn ends'),{code:'steer_attachments_unsupported'});
      this.publish({error:error.message});throw error;
    }
    this.pending={...request,kind:request.kind||kind};
    const attempt=++this.attempt;
    this.publish({sending:true,error:''});
    return {request:this.pending,attempt};
  }
  acknowledge(requestId) {
    if(this.pending?.requestId!==requestId)return;
    const next=acknowledgeSubmission(this.state.draft,this.state.attachments,this.pending);
    this.pending=null;this.publish({...next,uploads:this.retainedUploads(next.attachments,null),sending:false,error:''});
  }
  finish(request,attempt,error) {
    if(this.attempt!==attempt||this.pending?.requestId!==request.requestId)return;
    this.publish({sending:false,error:error?.message||''});
  }
  get hasContent() {return !!(this.state.draft||this.state.attachments.length||this.state.readingFiles||this.pending);}
  clear() {this.pending=null;this.attempt++;this.intakeEpoch++;this.publish({draft:'',attachments:[],sending:false,readingFiles:false,uploads:{},error:''});}
}
