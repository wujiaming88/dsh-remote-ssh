import { api, stream, responseError, uploadFileAttachment } from './api.js';
import { initialState, applySnapshot, reduceEvent, replay } from './events.js';
import {ComposerSession} from './composer-session.js';

let clientSequence=0;
const ACCESS_DENIED=new Set(['unauthenticated','request_forbidden','remote_access_denied','http_401','http_403']);
const TERMINAL_ATTACH=new Set(['acp_not_found','acp_not_running','binding_mismatch','session_archived','session_not_found']);
// Diagnostics are bounded protocol identifiers, never remote error text or payloads.
const subscriptionFailureCode=error=>ACCESS_DENIED.has(error.code)||TERMINAL_ATTACH.has(error.code)||
  ['network_error','cancelled'].includes(error.code)||/^http_[1-5]\d{2}$/.test(error.code||'')?error.code:'stream_error';

// Browser subscription lifetime is independent from the remote agent lifetime.
export class SessionClient {
  constructor(backend, dependencies = {}) {
    this.backend = backend;
    this.viewKey = ++clientSequence;
    this.api = dependencies.api || api;
    this.stream = dependencies.stream || stream;
    this.uploadAttachment = dependencies.uploadAttachment || uploadFileAttachment;
    this.state = initialState();
    this.listeners = new Set();
    this.acknowledgements = new Set();
    this.events = new Map();
    this.controllers = new Set();
    this.disposed = false;
    this.retryTimer = null;
    this.attaching = false;
    this.retryCount = 0;
    this.connecting = null;
    this.ready = false;
    this.epoch = 0;
    this.replayRevision = 0;
    // Control snapshots can change SSH/runtime state without advancing the journal.
    this.snapshotRevision = 0;
    this.attachController = null;
    this.onAuthorized = dependencies.onAuthorized || (()=>{});
    this.onBinding = dependencies.onBinding || (()=>{});
    this.retryBlocked = false;
    this.suspended = false;
    this.composer = dependencies.composer || new ComposerSession(backend.sessionId,dependencies.storage);
    this.onAccessDenied = dependencies.onAccessDenied || (error=>this.invalidate(error));
    // Window timers reject a SessionClient receiver; only bind native defaults.
    this.later = dependencies.setTimeout || globalThis.setTimeout.bind(globalThis);
    this.cancelTimer = dependencies.clearTimeout || globalThis.clearTimeout.bind(globalThis);
    this.heartbeatMs = dependencies.heartbeatMs || 45000;
    this.heartbeatTimer = null;
  }
  getSnapshot = () => this.state;
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  onAcknowledged(listener) { this.acknowledgements.add(listener); return () => this.acknowledgements.delete(listener); }
  acknowledge(requestId) {
    this.composer.acknowledge(requestId);
    for(const listener of this.acknowledgements)listener(requestId);
  }
  markClosed(snapshot) {
    if(this.disposed||!snapshot||snapshot.id!==this.state.binding?.id)return;
    this.ready=false;this.retryBlocked=true;this.snapshotRevision++;
    this.cancelTimer(this.retryTimer);this.cancelTimer(this.heartbeatTimer);this.attachController?.abort();
    this.publish({...applySnapshot(this.state,{...snapshot,status:'closed',busy:false,pendingPermissions:[],pendingElicitations:[]}),connected:false,transportError:'',subscriptionDiagnostic:null,failure:null,error:snapshot.lastError||''});
  }
  invalidate(error) {
    this.epoch++;this.retryBlocked=true;this.ready=false;
    this.cancelTimer(this.retryTimer);this.cancelTimer(this.heartbeatTimer);
    for(const controller of this.controllers)controller.abort();
    this.events.clear();this.composer.clear();
    this.publish({...initialState(),everConnected:false,transportError:'',loading:false,error:error.message,failure:error.result||{code:error.code}});
  }
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  receive = event => {
    if (this.disposed||this.retryBlocked||event?.type==='heartbeat') return;
    if(event?.type==='snapshot'){
      const snapshot=event.state,cursor=snapshot?.cursor;
      // A control snapshot may not skip history, roll it back, or change binding.
      if(!snapshot||snapshot.id!==this.state.binding?.id||!cursor||cursor.seq!==this.state.cursor.seq||cursor.generation!==this.state.cursor.generation)return;
      if(snapshot.status==='closed')this.markClosed(snapshot);
      else {this.snapshotRevision++;this.publish(applySnapshot(this.state,snapshot));}
      return;
    }
    const reset=event.type==='replay'&&event.reset||event.generation&&this.state.cursor.generation&&event.generation!==this.state.cursor.generation;
    if(reset){this.events.clear();this.replayRevision++;}
    if (Number.isSafeInteger(event.seq)) this.events.set(event.seq, event);
    // Transport state is not journal state: replay/reset cannot disconnect a live stream.
    this.state = {...reduceEvent(this.state, event),connected:this.state.connected,everConnected:this.state.everConnected,
      transportError:this.state.transportError,subscriptionDiagnostic:this.state.subscriptionDiagnostic,replayRevision:this.replayRevision};
    if ((event.type === 'request_ack' || event.type === 'user_message') && event.requestId) this.acknowledge(event.requestId);
    for (const listener of this.listeners) listener();
  };
  controller() {
    const controller = new AbortController();
    if (this.disposed || this.suspended) controller.abort();
    this.controllers.add(controller);
    return controller;
  }
  async request(method, payload = {}) {
    const epoch=this.epoch;
    const controller = this.controller();
    try {
      const result = await this.api(method, payload, controller.signal);
      if (this.disposed||this.suspended||controller.signal.aborted||epoch!==this.epoch) throw Object.assign(new Error('Conversation detached'), { code: 'cancelled' });
      if (!result.ok) {
        const error=responseError(result);
        if(ACCESS_DENIED.has(error.code))this.onAccessDenied(error);
        throw error;
      }
      return result;
    } finally { this.controllers.delete(controller); }
  }
  ensureConnected() {return this.retryBlocked?Promise.resolve():this.connect();}
  connect() {
    if(this.disposed)return Promise.resolve();
    this.suspended=false;
    if (this.connecting) return this.connecting;
    if(this.ready&&!this.state.failure&&this.state.binding?.status!=='error'&&!['error','disconnected','detached'].includes(this.state.binding?.transportState)){this.attach();return Promise.resolve();}
    this.retryBlocked=false;
    this.connecting = this.startConnection().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async startConnection() {
    const epoch=this.epoch;this.ready=false;
    this.cancelTimer(this.retryTimer);this.attachController?.abort();
    // Keep a previously loaded transcript visible while the durable owner is
    // re-attached; only a genuinely cold Session needs the full-page loader.
    this.publish({ loading: !this.state.binding?.id, connected:false, error: '', failure: null });
    try {
      const id = this.state.binding?.id || this.backend.binding?.id;
      const result = id
        ? await this.request('acpResume', { id, dshSessionId: this.backend.sessionId })
        : await this.request('acpStart', { dshSessionId: this.backend.sessionId });
      if(this.disposed||this.suspended||epoch!==this.epoch)return;
      if (!result.session?.id) throw new Error('Invalid ACP session response');
      this.onBinding(result.session);
      this.state = applySnapshot(this.state, result.session);
      await this.history();
      if(this.disposed||this.suspended||this.retryBlocked||epoch!==this.epoch)return;
      this.onAuthorized();
      if(this.state.binding?.status==='closed'){this.markClosed(this.state.binding);return;}
      this.ready=true;this.attach();
    } catch (error) {
      if (!this.disposed&&!this.suspended&&epoch===this.epoch) this.publish({ loading: false, error: error.message, failure: error.result || { code: error.code } });
    }
  }
  async history(beforeSeq,{beforeApply,canApply}={}) {
    const epoch=this.epoch,revision=this.replayRevision,snapshotRevision=this.snapshotRevision;
    const id = this.state.binding?.id;
    if (!id) return;
    const startingCursor = this.state.cursor;
    const result = await this.request('acpEvents', { id, limit: 250,
      ...(beforeSeq == null ? { tail: true } : { beforeSeq }) });
    if(this.disposed||this.suspended||epoch!==this.epoch||revision!==this.replayRevision||canApply?.()===false)return;
    const current = this.state;
    const advanced = current.cursor.generation !== startingCursor.generation || current.cursor.seq > startingCursor.seq;
    if (advanced && result.cursor?.generation !== current.cursor.generation) return;
    const snapshotChanged=snapshotRevision!==this.snapshotRevision;
    const sameGeneration=result.cursor?.generation===current.cursor.generation;
    // A late page from another journal cannot revive an observed terminal close.
    if(snapshotChanged&&current.binding?.status==='closed'&&!sameGeneration)return;
    const reset=result.reset||result.cursor?.generation&&current.cursor.generation&&result.cursor.generation!==current.cursor.generation;
    if(reset){this.events.clear();this.replayRevision++;}
    for (const event of result.events) this.events.set(event.seq, event);
    const next = replay([...this.events.values()], result.session, current);
    // An empty journal has no event from which to learn its generation. Only a
    // zero-head history cursor can establish it without skipping unseen events.
    if(!next.cursor.generation&&next.cursor.seq===0&&result.cursor?.seq===0&&
      typeof result.cursor.generation==='string'&&result.cursor.generation)
      next.cursor={generation:result.cursor.generation,seq:0};
    // Journal updates and same-generation control snapshots supersede a history
    // request's snapshot. Never carry old-journal runtime state across a reset.
    if (advanced||snapshotChanged&&sameGeneration) for (const key of ['binding', 'running', 'permissions', 'elicitations', 'config', 'capabilities', 'commands', 'error', 'title']) next[key] = current[key];
    if(!reset)beforeApply?.();
    this.publish({ ...next, replayRevision:this.replayRevision, connected:current.connected, everConnected:current.everConnected,
      transportError:current.transportError,subscriptionDiagnostic:current.subscriptionDiagnostic,oldestSeq: result.oldestSeq, hasEarlier: !!result.hasEarlier });
    for (const event of result.events) if ((event.type === 'user_message' || event.type === 'request_ack') && event.requestId) this.acknowledge(event.requestId);
  }
  attach() {
    if (this.disposed || this.suspended || this.retryBlocked || this.attaching || !this.state.binding?.id) return;
    this.cancelTimer(this.retryTimer);this.retryTimer=null;
    this.attaching = true;
    const controller = this.controller();
    this.attachController=controller;
    const id = this.state.binding.id;
    let outcome=null;
    const diagnostic=(reason,code=null)=>({reason,code,retryAttempt:Math.min(this.retryCount+1,Number.MAX_SAFE_INTEGER)});
    const watch=()=>{
      this.cancelTimer(this.heartbeatTimer);
      this.heartbeatTimer=this.later(()=>{
        if(this.disposed||controller.signal.aborted)return;
        outcome='heartbeat_timeout';
        this.publish({connected:false,transportError:'Connection heartbeat timed out',subscriptionDiagnostic:diagnostic(outcome)});
        controller.abort();
      },this.heartbeatMs);
    };
    watch();
    Promise.resolve().then(()=>this.stream('acpAttach', { id, cursor: this.state.cursor }, controller.signal, event => {
      if (this.disposed||this.suspended||controller.signal.aborted||this.retryBlocked) return;
      this.retryCount = 0;watch();
      if(event.type!=='heartbeat')this.receive(event);
      if (!controller.signal.aborted&&!this.retryBlocked&&(!this.state.connected||this.state.transportError||this.state.subscriptionDiagnostic))
        this.publish({ connected: true, everConnected:true, transportError:'',subscriptionDiagnostic:null });
    })).catch(error => {
      if(controller.signal.aborted||this.disposed||this.suspended)return;
      if(ACCESS_DENIED.has(error.code)){this.onAccessDenied(error);return;}
      if(TERMINAL_ATTACH.has(error.code)){
        this.retryBlocked=true;this.ready=false;
        this.publish({loading:false,failure:error.result||{code:error.code},error:error.message});
      }
      outcome='error';
      this.publish({ connected: false, transportError: error.message,subscriptionDiagnostic:diagnostic(outcome,subscriptionFailureCode(error)) });
    }).finally(() => {
      const ownsAttach=this.attachController===controller;
      if(ownsAttach){this.cancelTimer(this.heartbeatTimer);this.heartbeatTimer=null;this.attaching=false;this.attachController=null;}
      this.controllers.delete(controller);
      if (!ownsAttach||this.disposed||this.suspended||this.retryBlocked||this.connecting&&!this.ready) return;
      this.publish({ connected: false,...(!outcome&&!controller.signal.aborted?{subscriptionDiagnostic:diagnostic('eof')}:{}) });
      const delay=Math.min(1000 * 2 ** this.retryCount,10000);
      this.retryCount=Math.min(this.retryCount+1,Number.MAX_SAFE_INTEGER);
      this.retryTimer = this.later(() => this.attach(), delay);
    });
  }
  async action(method, payload = {}) {
    const epoch=this.epoch,snapshotRevision=this.snapshotRevision,startingCursor=this.state.cursor,id=this.state.binding?.id;
    const result = await this.request(method, { id, dshSessionId: this.backend.sessionId, ...payload });
    if(this.disposed||this.suspended||epoch!==this.epoch)throw Object.assign(new Error('Conversation detached'),{code:'cancelled'});
    if (result.session) {
      const current=this.state,cursor=result.session.cursor;
      const changed=snapshotRevision!==this.snapshotRevision||current.cursor.generation!==startingCursor.generation||current.cursor.seq>startingCursor.seq;
      const newerHead=cursor?.generation===current.cursor.generation&&!!cursor.generation&&Number.isSafeInteger(cursor.seq)&&cursor.seq>current.cursor.seq;
      const sameBinding=current.binding?.id===id&&(!result.session.id||result.session.id===current.binding?.id);
      // An operation receipt is still returned, even when its snapshot lost the
      // race to live delivery. Missing cursors cannot prove freshness; neither
      // late receipts nor different bindings may revive an observed close.
      if(sameBinding&&current.binding?.status!=='closed'&&(!changed||newerHead)){
        this.snapshotRevision++;this.publish(applySnapshot(current,result.session));
      }
    }
    return result;
  }
  async prepareUploads(request,attempt) {
    if(!this.state.binding)throw new Error('Agent is not connected');
    const epoch=this.epoch,controller=this.controller();
    const active=()=>!this.disposed&&!this.suspended&&!this.retryBlocked&&!controller.signal.aborted&&epoch===this.epoch&&
      this.composer.pending?.requestId===request.requestId&&this.composer.attempt===attempt;
    const check=()=>{if(!active())throw Object.assign(new Error('File upload interrupted; the draft was not sent'),{code:'cancelled'});};
    try {
      const result=[];
      for(const file of request.attachments) {
        check();
        if(file.type!=='file_upload'){result.push(file);continue;}
        let receipt=this.composer.getSnapshot().uploads[file.uploadId]?.receipt;
        if(!receipt) {
          this.composer.setUpload(file.uploadId,{status:'uploading'});
          try {
            receipt=await this.uploadAttachment(this.backend.sessionId,file,controller.signal);
            check();
            this.composer.setUpload(file.uploadId,{status:'uploaded',remotePath:receipt.remotePath,receipt});
          } catch(error) {
            // An evicted view keeps its composer. Clear a stale spinner even when
            // the client is disposed, but never overwrite a newer attempt or clear.
            if(this.composer.pending?.requestId===request.requestId&&this.composer.attempt===attempt)
              this.composer.setUpload(file.uploadId,{status:'failed',error:error.message});
            throw error;
          }
        }
        result.push(receipt);
      }
      check();return result;
    } catch(error) {
      if(active()&&ACCESS_DENIED.has(error.code))this.onAccessDenied(error);
      throw error;
    } finally {this.controllers.delete(controller);}
  }
  async sendDraft(mode='queue') {
    const pendingKind=this.composer.getSnapshot().pendingKind;
    const kind=mode==='retry'&&pendingKind?pendingKind:this.state.running?(mode==='steer'?'steer':'queue'):'prompt';
    if(!['queue','steer','retry'].includes(mode))throw Object.assign(new Error('Invalid message submission mode'),{code:'bad_request'});
    if(kind==='steer'&&!pendingKind&&this.state.capabilities?.steering?.supported!==true){
      const error=Object.assign(new Error('This adapter does not advertise native steering. Choose queue instead.'),{code:'steering_unsupported'});
      this.composer.publish({error:error.message});throw error;
    }
    const {request,attempt}=this.composer.begin(kind);
    let failure;
    try {
      let submission=request;
      if(request.attachments.some(file=>file.type==='file_upload')) {
        const attachments=await this.prepareUploads(request,attempt);
        if(this.disposed||this.suspended||this.retryBlocked||this.composer.pending?.requestId!==request.requestId||this.composer.attempt!==attempt)
          throw Object.assign(new Error('Conversation detached'),{code:'cancelled'});
        submission={...request,attachments};
      }
      const result=await this.submit(submission);
      if(this.composer.pending?.requestId===request.requestId)throw Object.assign(new Error('Message acknowledgment is unknown. Retry will reuse the same request.'),{code:'acknowledgment_unknown'});
      return result;
    }
    catch(error){failure=error;throw error;}
    finally {this.composer.finish(request,attempt,failure);}
  }
  async submit({ text, attachments = [], requestId, kind }) {
    if (!this.state.binding) throw new Error('Agent is not connected');
    this.publish({ error: '' });
    const epoch=this.epoch;
    const payload = { id: this.state.binding.id, dshSessionId: this.backend.sessionId, text, attachments, requestId };
    const submissionKind=kind||(this.state.running?'queue':'prompt');
    if (submissionKind==='steer'||submissionKind==='queue') {
      const result = await this.action(submissionKind==='steer'?'acpSteer':'acpQueue', payload);
      if(submissionKind==='steer'&&result.requestId===requestId&&result.outcome==='promptRequired')throw Object.assign(new Error('The running turn ended before injection. Your draft was kept; send again or choose queue.'),{code:'steering_not_injected'});
      const accepted=result.requestId===requestId&&(submissionKind==='steer'?result.outcome==='injected':result.accepted===true&&['queued','started'].includes(result.outcome));
      if(!accepted)throw Object.assign(new Error('Message acknowledgment is unknown. Retry the original request; it was not resent.'),{code:'acknowledgment_unknown'});
      this.acknowledge(requestId);
      return result;
    }
    const controller = this.controller();
    try {
      await this.stream('acpPrompt', { ...payload, cursor: this.state.cursor }, controller.signal, event=>{
        if(!this.suspended&&!controller.signal.aborted&&epoch===this.epoch)this.receive(event);
      });
    } catch(error) {
      if(!this.disposed&&!this.suspended&&!controller.signal.aborted&&epoch===this.epoch&&ACCESS_DENIED.has(error.code))this.onAccessDenied(error);
      throw error;
    } finally {
      this.controllers.delete(controller);
      // Stream termination is not a task state transition.
      if (!this.disposed&&!this.suspended&&!this.retryBlocked&&epoch===this.epoch) await this.action('acpState').catch(error => {
        if(!this.disposed&&!this.suspended&&!this.retryBlocked&&epoch===this.epoch)this.publish({ transportError: error.message });
      });
    }
  }
  async prepare(confirmed = false) {
    return this.request('acpPrepareRuntime', { sessionId: this.backend.sessionId, confirm: confirmed });
  }
  // Close the browser subscription and stop the retry loop while retaining the
  // projected transcript and binding so a later remount can re-attach instantly
  // instead of re-running resume/history. Never cancels or closes remote work.
  suspend() {
    if (this.disposed || this.suspended) return;
    this.suspended = true;
    this.cancelTimer(this.retryTimer);this.retryTimer=null;
    this.cancelTimer(this.heartbeatTimer);this.heartbeatTimer=null;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.attaching = false;this.attachController=null;
    this.connecting = null;
    this.listeners.clear();
    this.acknowledgements.clear();
    if (this.state.connected) this.publish({ connected: false });
  }
  resume() { this.suspended = false; }
  dispose() {
    this.disposed = true;
    this.suspended = false;
    this.cancelTimer(this.retryTimer);this.cancelTimer(this.heartbeatTimer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.listeners.clear();
    this.acknowledgements.clear();
    // Never cancel/close the Host session as a side effect of unmounting.
  }
}
