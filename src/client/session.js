import { api, stream, responseError } from './api.js';
import { initialState, applySnapshot, reduceEvent, replay } from './events.js';
import {ComposerSession} from './composer-session.js';

let clientSequence=0;
const ACCESS_DENIED=new Set(['unauthenticated','request_forbidden','remote_access_denied','http_401','http_403']);
const TERMINAL_ATTACH=new Set(['acp_not_found','acp_not_running','binding_mismatch','session_archived','session_not_found']);

// Browser subscription lifetime is independent from the remote agent lifetime.
export class SessionClient {
  constructor(backend, dependencies = {}) {
    this.backend = backend;
    this.viewKey = ++clientSequence;
    this.api = dependencies.api || api;
    this.stream = dependencies.stream || stream;
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
    this.attachController = null;
    this.onAuthorized = dependencies.onAuthorized || (()=>{});
    this.onBinding = dependencies.onBinding || (()=>{});
    this.retryBlocked = false;
    this.composer = dependencies.composer || new ComposerSession(backend.sessionId,dependencies.storage);
    this.onAccessDenied = dependencies.onAccessDenied || (error=>this.invalidate(error));
    this.later = dependencies.setTimeout || globalThis.setTimeout;
    this.cancelTimer = dependencies.clearTimeout || globalThis.clearTimeout;
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
    const reset=event.type==='replay'&&event.reset||event.generation&&this.state.cursor.generation&&event.generation!==this.state.cursor.generation;
    if(reset){this.events.clear();this.replayRevision++;}
    if (Number.isSafeInteger(event.seq)) this.events.set(event.seq, event);
    // Transport state is not journal state: replay/reset cannot disconnect a live stream.
    this.state = {...reduceEvent(this.state, event),connected:this.state.connected,everConnected:this.state.everConnected,replayRevision:this.replayRevision};
    if ((event.type === 'request_ack' || event.type === 'user_message') && event.requestId) this.acknowledge(event.requestId);
    for (const listener of this.listeners) listener();
  };
  controller() {
    const controller = new AbortController();
    if (this.disposed) controller.abort();
    this.controllers.add(controller);
    return controller;
  }
  async request(method, payload = {}) {
    const epoch=this.epoch;
    const controller = this.controller();
    try {
      const result = await this.api(method, payload, controller.signal);
      if (this.disposed||controller.signal.aborted||epoch!==this.epoch) throw Object.assign(new Error('Conversation detached'), { code: 'cancelled' });
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
    if (this.connecting) return this.connecting;
    if(this.ready&&!this.state.failure&&this.state.binding?.status!=='error'){this.attach();return Promise.resolve();}
    this.retryBlocked=false;
    this.connecting = this.startConnection().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async startConnection() {
    const epoch=this.epoch;this.ready=false;
    this.cancelTimer(this.retryTimer);this.attachController?.abort();
    this.publish({ loading: true, connected:false, error: '', failure: null });
    try {
      const id = this.state.binding?.id || this.backend.binding?.id;
      const result = id
        ? await this.request('acpResume', { id, dshSessionId: this.backend.sessionId })
        : await this.request('acpStart', { dshSessionId: this.backend.sessionId });
      if(this.disposed||epoch!==this.epoch)return;
      if (!result.session?.id) throw new Error('Invalid ACP session response');
      this.onBinding(result.session);
      this.state = applySnapshot(this.state, result.session);
      await this.history();
      if(this.disposed||this.retryBlocked||epoch!==this.epoch)return;
      this.ready=true;this.onAuthorized();
      this.attach();
    } catch (error) {
      if (!this.disposed&&epoch===this.epoch) this.publish({ loading: false, error: error.message, failure: error.result || { code: error.code } });
    }
  }
  async history(beforeSeq,{beforeApply,canApply}={}) {
    const epoch=this.epoch,revision=this.replayRevision;
    const id = this.state.binding?.id;
    if (!id) return;
    const startingCursor = this.state.cursor;
    const result = await this.request('acpEvents', { id, limit: 250,
      ...(beforeSeq == null ? { tail: true } : { beforeSeq }) });
    if(this.disposed||epoch!==this.epoch||revision!==this.replayRevision||canApply?.()===false)return;
    const current = this.state;
    const advanced = current.cursor.generation !== startingCursor.generation || current.cursor.seq > startingCursor.seq;
    if (advanced && result.cursor?.generation !== current.cursor.generation) return;
    const reset=result.reset||result.cursor?.generation&&current.cursor.generation&&result.cursor.generation!==current.cursor.generation;
    if(reset){this.events.clear();this.replayRevision++;}
    for (const event of result.events) this.events.set(event.seq, event);
    const next = replay([...this.events.values()], result.session, current);
    if (advanced) for (const key of ['binding', 'running', 'permissions', 'elicitations', 'config', 'capabilities', 'error', 'title']) next[key] = current[key];
    if(!reset)beforeApply?.();
    this.publish({ ...next, replayRevision:this.replayRevision, connected:current.connected, everConnected:current.everConnected, transportError:current.transportError, oldestSeq: result.oldestSeq, hasEarlier: !!result.hasEarlier });
    for (const event of result.events) if ((event.type === 'user_message' || event.type === 'request_ack') && event.requestId) this.acknowledge(event.requestId);
  }
  attach() {
    if (this.disposed || this.retryBlocked || this.attaching || !this.state.binding?.id) return;
    this.cancelTimer(this.retryTimer);this.retryTimer=null;
    this.attaching = true;
    const controller = this.controller();
    this.attachController=controller;
    const id = this.state.binding.id;
    const watch=()=>{
      this.cancelTimer(this.heartbeatTimer);
      this.heartbeatTimer=this.later(()=>{
        if(this.disposed||controller.signal.aborted)return;
        this.publish({connected:false,transportError:'Connection heartbeat timed out'});
        controller.abort();
      },this.heartbeatMs);
    };
    watch();
    Promise.resolve().then(()=>this.stream('acpAttach', { id, cursor: this.state.cursor }, controller.signal, event => {
      if (this.disposed||controller.signal.aborted||this.retryBlocked) return;
      this.retryCount = 0;watch();
      if(event.type!=='heartbeat')this.receive(event);
      if (!this.state.connected||this.state.transportError) this.publish({ connected: true, everConnected:true, transportError:'' });
    })).catch(error => {
      if(controller.signal.aborted||this.disposed)return;
      if(ACCESS_DENIED.has(error.code)){this.onAccessDenied(error);return;}
      if(TERMINAL_ATTACH.has(error.code)){
        this.retryBlocked=true;this.ready=false;
        this.publish({loading:false,failure:error.result||{code:error.code},error:error.message});
      }
      this.publish({ connected: false, transportError: error.message });
    }).finally(() => {
      this.cancelTimer(this.heartbeatTimer);this.heartbeatTimer=null;
      this.controllers.delete(controller);
      this.attaching = false;this.attachController=null;
      if (this.disposed||this.retryBlocked||this.connecting&&!this.ready) return;
      this.publish({ connected: false });
      this.retryTimer = this.later(() => this.attach(), Math.min(1000 * 2 ** this.retryCount++, 10000));
    });
  }
  async action(method, payload = {}) {
    const epoch=this.epoch;
    const result = await this.request(method, { id: this.state.binding?.id, dshSessionId: this.backend.sessionId, ...payload });
    if(this.disposed||epoch!==this.epoch)throw Object.assign(new Error('Conversation detached'),{code:'cancelled'});
    if (result.session) this.publish(applySnapshot(this.state, result.session));
    return result;
  }
  async sendDraft() {
    const {request,attempt}=this.composer.begin(this.state.running?'steer':'prompt');
    let failure;
    try {
      const result=await this.submit(request);
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
    if (kind ? kind==='steer' : this.state.running) {
      const result = await this.action('acpSteer', payload);
      this.acknowledge(requestId);
      return result;
    }
    const controller = this.controller();
    try {
      await this.stream('acpPrompt', { ...payload, cursor: this.state.cursor }, controller.signal, event=>{
        if(!controller.signal.aborted&&epoch===this.epoch)this.receive(event);
      });
    } catch(error) {
      if(!this.disposed&&!controller.signal.aborted&&epoch===this.epoch&&ACCESS_DENIED.has(error.code))this.onAccessDenied(error);
      throw error;
    } finally {
      this.controllers.delete(controller);
      // Stream termination is not a task state transition.
      if (!this.disposed&&!this.retryBlocked&&epoch===this.epoch) await this.action('acpState').catch(error => {
        if(!this.disposed&&!this.retryBlocked&&epoch===this.epoch)this.publish({ transportError: error.message });
      });
    }
  }
  async prepare(confirmed = false) {
    return this.request('acpPrepareRuntime', { sessionId: this.backend.sessionId, confirm: confirmed });
  }
  dispose() {
    this.disposed = true;
    this.cancelTimer(this.retryTimer);this.cancelTimer(this.heartbeatTimer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.listeners.clear();
    this.acknowledgements.clear();
    // Never cancel/close the Host session as a side effect of unmounting.
  }
}
