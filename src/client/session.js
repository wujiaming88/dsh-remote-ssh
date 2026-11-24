import { api, stream, responseError } from './api.js';
import { initialState, applySnapshot, reduceEvent, replay } from './events.js';

// Browser subscription lifetime is independent from the remote agent lifetime.
export class SessionClient {
  constructor(backend, dependencies = {}) {
    this.backend = backend;
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
  }
  getSnapshot = () => this.state;
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  onAcknowledged(listener) { this.acknowledgements.add(listener); return () => this.acknowledgements.delete(listener); }
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  receive = event => {
    if (this.disposed) return;
    if (event.generation && this.state.cursor.generation && event.generation !== this.state.cursor.generation) this.events.clear();
    if (event.type === 'replay' && event.reset) this.events.clear();
    if (Number.isSafeInteger(event.seq)) this.events.set(event.seq, event);
    this.state = reduceEvent(this.state, event);
    if ((event.type === 'request_ack' || event.type === 'user_message') && event.requestId) {
      for (const listener of this.acknowledgements) listener(event.requestId);
    }
    for (const listener of this.listeners) listener();
  };
  controller() {
    const controller = new AbortController();
    if (this.disposed) controller.abort();
    this.controllers.add(controller);
    return controller;
  }
  async request(method, payload = {}) {
    const controller = this.controller();
    try {
      const result = await this.api(method, payload, controller.signal);
      if (this.disposed) throw Object.assign(new Error('Conversation detached'), { code: 'cancelled' });
      if (!result.ok) throw responseError(result);
      return result;
    } finally { this.controllers.delete(controller); }
  }
  connect() {
    if (this.connecting) return this.connecting;
    this.connecting = this.startConnection().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async startConnection() {
    this.publish({ loading: true, error: '', failure: null });
    try {
      const id = this.state.binding?.id || this.backend.binding?.id;
      const result = id
        ? await this.request('acpResume', { id, dshSessionId: this.backend.sessionId })
        : await this.request('acpStart', { dshSessionId: this.backend.sessionId });
      if (!result.session?.id) throw new Error('Invalid ACP session response');
      this.state = applySnapshot(this.state, result.session);
      await this.history();
      this.attach();
    } catch (error) {
      if (!this.disposed) this.publish({ loading: false, error: error.message, failure: error.result || { code: error.code } });
    }
  }
  async history(beforeSeq) {
    const id = this.state.binding?.id;
    if (!id) return;
    const startingCursor = this.state.cursor;
    const result = await this.request('acpEvents', { id, limit: 250,
      ...(beforeSeq == null ? { tail: true } : { beforeSeq }) });
    const current = this.state;
    const advanced = current.cursor.generation !== startingCursor.generation || current.cursor.seq > startingCursor.seq;
    if (advanced && result.cursor?.generation !== current.cursor.generation) return;
    if (result.reset || (result.cursor?.generation && current.cursor.generation && result.cursor.generation !== current.cursor.generation)) this.events.clear();
    for (const event of result.events) this.events.set(event.seq, event);
    const next = replay([...this.events.values()], result.session, current);
    if (advanced) for (const key of ['binding', 'running', 'permissions', 'elicitations', 'config', 'capabilities', 'error', 'title']) next[key] = current[key];
    this.publish({ ...next, oldestSeq: result.oldestSeq, hasEarlier: !!result.hasEarlier });
    for (const event of result.events) if ((event.type === 'user_message' || event.type === 'request_ack') && event.requestId) {
      for (const listener of this.acknowledgements) listener(event.requestId);
    }
  }
  attach() {
    if (this.disposed || this.attaching || !this.state.binding?.id) return;
    this.attaching = true;
    const controller = this.controller();
    const id = this.state.binding.id;
    this.stream('acpAttach', { id, cursor: this.state.cursor }, controller.signal, event => {
      if (this.disposed) return;
      this.retryCount = 0;
      if (!this.state.connected) this.publish({ connected: true });
      this.receive(event);
    }).catch(error => {
      if (!controller.signal.aborted) this.publish({ connected: false, transportError: error.message });
    }).finally(() => {
      this.controllers.delete(controller);
      this.attaching = false;
      if (this.disposed) return;
      this.publish({ connected: false });
      this.retryTimer = setTimeout(() => this.attach(), Math.min(1000 * 2 ** this.retryCount++, 10000));
    });
  }
  async action(method, payload = {}) {
    const result = await this.request(method, { id: this.state.binding?.id, dshSessionId: this.backend.sessionId, ...payload });
    if (result.session) this.publish(applySnapshot(this.state, result.session));
    return result;
  }
  async submit({ text, attachments = [], requestId }) {
    if (!this.state.binding) throw new Error('Agent is not connected');
    this.publish({ error: '' });
    const payload = { id: this.state.binding.id, dshSessionId: this.backend.sessionId, text, attachments, requestId };
    if (this.state.running) {
      const result = await this.action('acpSteer', payload);
      for (const listener of this.acknowledgements) listener(requestId);
      return result;
    }
    const controller = this.controller();
    try {
      await this.stream('acpPrompt', { ...payload, cursor: this.state.cursor }, controller.signal, this.receive);
    } finally {
      this.controllers.delete(controller);
      // Stream termination is not a task state transition.
      if (!this.disposed) await this.action('acpState').catch(error => this.publish({ transportError: error.message }));
    }
  }
  async prepare(confirmed = false) {
    return this.request('acpPrepareRuntime', { sessionId: this.backend.sessionId, confirm: confirmed });
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.retryTimer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.listeners.clear();
    this.acknowledgements.clear();
    // Never cancel/close the Host session as a side effect of unmounting.
  }
}
