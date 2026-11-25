/** Remote-only ACP session orchestration and Host API. */
import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AcpError, ACP_AGENTS, MAX_EVENTS, MAX_TOOL_TEXT, DEFAULT_START_TIMEOUT_MS, asObject, truncate, normalizeAgent, normalizePermission, newSessionId, deferred, withTimeout, readCursor } from "./acp-core.js";
import { summarizeRaw, summarizeContentBlock, mapSessionUpdate, mapPermissionRequest } from "./acp-events.js";
import { PermissionBroker, pickAutoPermissionOption, selectedOutcome, cancelledOutcome, elicitationSchemaSupport, validateElicitationContent } from "./acp-requests.js";
import { normalizeSessionConfig, mergeConfigOptions, flattenSelectOptions, findConfigOption, PERMISSION_MODES, resolvePermissionMode, emptyConfig } from "./acp-config.js";
import { AcpStore, ACP_EVENT_VERSION } from "./acp-store.js";
import { createForkActions } from "./acp-forks.js";
import { REMOTE_ACP_RUNTIME_DIR, buildRemoteAcpLaunchSpec, remoteAcpPreparationPlan, probeRemoteAcp, prepareRemoteAcp, connectAcp, normalizeCapabilities, supportsSessionAction } from "./acp-transport.js";

export { AcpError, ACP_AGENTS, ACP_CLIENT_CAPABILITIES, ACP_SSH_HOST_KEY_POLICY, newSessionId } from "./acp-core.js";
export { summarizeRaw, summarizeContentBlock, parseTaskNotification, mapToolCall, mapAvailableCommands, mapSessionUpdate, mapPermissionRequest } from "./acp-events.js";
export { PermissionBroker, pickAutoPermissionOption, elicitationSchemaSupport, validateElicitationContent } from "./acp-requests.js";
export { normalizeSessionConfig, mergeConfigOptions, resolvePermissionMode } from "./acp-config.js";
export { AcpStore, ACP_STORE_SCHEMA, ACP_STORE_VERSION, ACP_RECORD_VERSION, ACP_EVENT_VERSION } from "./acp-store.js";
export { REMOTE_ACP_RUNTIME_DIR, REMOTE_ACP_PACKAGES, buildRemoteAcpLaunchSpec, remoteAcpPreparationPlan, probeRemoteAcp, prepareRemoteAcp } from "./acp-transport.js";

export class AcpSession {
  constructor(opts) {
    const o = opts || {};
    this.opts = o;
    this.agent = normalizeAgent(o.agent || "claude");
    this.def = ACP_AGENTS[this.agent] || null;
    this.id = String(o.id || newSessionId());
    this.profile = asObject(o.profile) || {};
    this.cwd = String(o.cwd || "");
    this.remotePath = String(o.remotePath || "~");
    this.configuredRemotePath = String(o.configuredRemotePath || o.remotePath || "~");
    this.remoteRuntimeDir = String(o.remoteRuntimeDir || REMOTE_ACP_RUNTIME_DIR);
    this.agentPath = String(o.agentPath || "");
    this.requestedPermission = normalizePermission(o.permission);
    this.permissionMode = "default";
    this.permissionStatus = { requested: this.requestedPermission, supported: false, applied: false };
    this.workspaceId = String(o.workspaceId || "");
    this.spawn = o.spawn || nodeSpawn;
    this.connectImpl = o.connectImpl || null;
    this.startTimeoutMs = Number(o.startTimeoutMs) > 0 ? Number(o.startTimeoutMs) : DEFAULT_START_TIMEOUT_MS;
    this.promptTimeoutMs = Number(o.promptTimeoutMs) > 0 ? Number(o.promptTimeoutMs) : 0;
    this.permissionTimeoutMs = Number(o.permissionTimeoutMs) > 0 ? Number(o.permissionTimeoutMs) : 0;
    this.maxEvents = Number(o.maxEvents) > 0 ? Number(o.maxEvents) : MAX_EVENTS;
    this.createdAt = Number(o.createdAt) || Date.now();
    this.startedAt = 0;
    this.sessionId = String(o.sessionId || "");
    this.resumeSessionId = String(o.resumeSessionId || "");
    // DSH 会话绑定：一个 DSH conversation 最多一个 active ACP 会话。
    this.dshSessionId = String(o.dshSessionId || "");
    this.reused = false;
    this.replacedId = "";
    this.status = "idle";
    this.lastError = null;
    this.lastStderr = "";
    this.config = o.config || emptyConfig(this.sessionId);
    this.capabilities = null;
    this.initialize = null;
    this.adapter = null;
    this.controller = null;
    this.events = (o.history && o.history.events) || [];
    this.eventSeq = Number(o.history && o.history.lastSeq) || Number(o.eventSeq) || 0;
    this.generation = (o.history && o.history.generation) || o.generation || randomUUID();
    this.commands = o.commands || [];
    this.persistenceError = null;
    this.turnQueue = [];
    this.activeTurn = null;
    this.turnSeq = 0;
    this.cancelling = false;
    this.modeChanging = false;
    this.configChanging = 0;
    this.forking = false;
    this.title = o.title ?? null;
    this.titleStatus = o.titleStatus || { outcome: "unchanged" };
    this.titleBlocked = !!o.titleStatus?.timeout;
    this.titlePending = 0;
    this.titleQueue = Promise.resolve();
    this.forkOrigin = o.forkOrigin || null;
    this.forkOperation = o.forkOperation || null;
    this.requests = new Map((o.requests || []).slice(-1000).map(r => [r.requestId, r]));
    this.subscribers = new Set();
    this.turnLifecycleSubscribers = new Set();
    this.pendingElicitations = new Map();
    this.pendingTurns = 0;
    this.closed = false;
    this.broker = new PermissionBroker({
      timeoutMs: this.permissionTimeoutMs
    });
  }

  get alive() {
    return this.status === "starting" || this.status === "ready" || this.status === "prompting";
  }

  get busy() {
    return this.pendingTurns > 0;
  }

  decorate(payload) {
    const out = Object.assign({}, payload, {
      ts: Date.now(),
      eventVersion: ACP_EVENT_VERSION,
      generation: this.generation,
      turnId: payload.turnId || (this.activeTurn && this.activeTurn.id) || undefined,
      requestId: payload.requestId || ((!payload.turnId || payload.turnId === this.activeTurn?.id) && this.activeTurn?.requestId) || undefined,
      agent: this.agent,
      agentLabel: this.def ? this.def.label : this.agent,
      sessionId: this.sessionId || "",
      dshSessionId: this.dshSessionId || "",
      model: this.config ? this.config.model : null,
      mode: this.config ? this.config.mode : null,
      reasoningEffort: this.config ? this.config.reasoningEffort : null
    });
    // 子 Agent / 子会话事件自带自己的 sessionId：保留它，并把根会话放到 rootSessionId。
    const own = payload && payload.sessionId;
    if (own !== undefined && own !== null && String(own) !== "") {
      out.sessionId = String(own);
      if (this.sessionId && String(own) !== String(this.sessionId)) out.rootSessionId = String(this.sessionId);
    }
    return out;
  }

  _emit(payload) {
    if (!payload || typeof payload !== "object") return null;
    const ev = Object.assign({}, payload);
    const rootUpdate = !ev.sessionId || String(ev.sessionId) === this.sessionId;
    if (rootUpdate && ev.type === "session_info" && Object.hasOwn(ev, "title") && !this.titlePending) {
      this.title = ev.title;
      this.titleStatus = { outcome: "confirmed", source: "session_info" };
      this.titleBlocked = false;
    }
    if (rootUpdate && ev.type === "config") {
      this.config = mergeConfigOptions(this.config, ev.configOptions, this.sessionId);
      const modeOption = findConfigOption(ev.configOptions, "mode", ["mode", "permission_mode"]);
      if (modeOption) {
        this.config.mode = String(modeOption.currentValue || "");
        this.config.modes = { currentModeId: this.config.mode, availableModes: flattenSelectOptions(modeOption.options).map(o => ({ id: o.value, name: o.name })) };
        this._syncPermission(this.config.mode);
      }
      ev.config = this.config;
    } else if (rootUpdate && ev.type === "mode") {
      if (this.config.modes) this.config.modes.currentModeId = ev.currentModeId;
      else this.config.modes = { currentModeId: ev.currentModeId, availableModes: [] };
      this.config.mode = ev.currentModeId;
      this._syncPermission(ev.currentModeId);
    } else if (rootUpdate && ev.type === "commands") {
      this.commands = ev.commands;
    }
    ev.seq = ++this.eventSeq;
    const full = this.decorate(ev);
    if (full.config) full.config = JSON.parse(JSON.stringify(full.config));
    try { this.opts.onEvent?.(full, this); } catch (e) { this.persistenceError = String(e.message || e); }
    this.events.push(full);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    for (const fn of Array.from(this.subscribers)) {
      try { fn(full); } catch (e) {}
    }
    return full;
  }

  subscribe(fn, opts = {}) {
    if (typeof fn !== "function") throw new AcpError("Subscriber must be a function", "bad_request");
    if (opts.replay !== false) {
      let cursor = opts.cursor, page;
      do {
        page = this.eventsSince(cursor, { limit: this.maxEvents });
        for (const event of page.events) { try { fn(event); } catch {} }
        cursor = page.cursor;
      } while (page.hasMore);
    }
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  /** In-process admission observer; content is never persisted in the public lifecycle event. */
  subscribeTurnLifecycle(fn) {
    if (typeof fn !== "function") throw new AcpError("Turn observer must be a function", "bad_request");
    this.turnLifecycleSubscribers.add(fn);
    return () => this.turnLifecycleSubscribers.delete(fn);
  }

  eventsSince(cursor, opts = {}) {
    const c = readCursor(cursor);
    const reset = !!c.generation && c.generation !== this.generation;
    const sinceSeq = reset ? 0 : c.seq;
    let result;
    if (this.opts.eventStore) {
      result = this.opts.eventStore.readEvents(this.id, { sinceSeq, limit: opts.limit || 1000, tail: !!opts.tail || opts.beforeSeq != null, beforeSeq: opts.beforeSeq });
    } else {
      const matching = this.events.filter(event => event.seq > sinceSeq && (opts.beforeSeq == null || event.seq < opts.beforeSeq));
      const limit = Math.max(1, Math.min(10000, opts.limit || 1000));
      const tail = !!opts.tail || opts.beforeSeq != null;
      result = { events: tail ? matching.slice(-limit) : matching.slice(0, limit), hasMore: !tail && matching.length > limit, hasEarlier: tail && matching.length > limit };
    }
    const events = result.events;
    return { events, cursor: { generation: this.generation, seq: events.at(-1)?.seq ?? sinceSeq }, reset, hasMore: result.hasMore, hasEarlier: result.hasEarlier || false, oldestSeq: events[0]?.seq || null };
  }

  /** Bounded in-memory diagnostics. Persistent history is read through eventsSince. */
  bufferedEvents() { return this.events.slice(); }

  _emitUpdate(rawUpdate, notification) {
    if (this.closed) return;
    const mapped = mapSessionUpdate(rawUpdate, { sessionId: notification && notification.sessionId });
    if (!mapped) return;
    this._emit(mapped);
  }

  async handlePermissionRequest(params, requestId) {
    if (this.forking || this.closed || this.opts.forkSessionId && this.status === "starting") return cancelledOutcome();
    const mapped = mapPermissionRequest(params, requestId);
    if (this.permissionMode === "bypass" && !this.modeChanging) {
      const auto = pickAutoPermissionOption(mapped.options);
      this._emit(Object.assign({}, mapped, {
        autoResolved: true,
        resolvedOptionId: auto ? auto.optionId : ""
      }));
      return auto ? selectedOutcome(auto.optionId) : cancelledOutcome();
    }
    const gate = this.broker.enqueue(params, requestId);
    mapped.requestId = gate.id;
    this._emit(mapped);
    return await gate.promise;
  }

  async handleElicitationRequest(params, requestId, signal) {
    if (this.forking) return { action: "decline" };
    const id = requestId == null ? "elicit-" + randomUUID() : String(requestId);
    const reason = params?.mode !== "form" ? "Only form elicitation is supported; URL requests are never auto-approved" : elicitationSchemaSupport(params.requestedSchema);
    const event = { type: "elicitation", requestId: id, message: truncate(params?.message || "", MAX_TOOL_TEXT), requestedSchema: reason ? summarizeRaw(params?.requestedSchema || null, 65536) : params.requestedSchema, sessionId: params?.sessionId || this.sessionId, ...(params?.toolCallId ? { toolCallId: params.toolCallId } : {}), ...(params?.requestId != null ? { scopeRequestId: params.requestId } : {}), supported: !reason };
    if (reason || this.closed || signal?.aborted) {
      this._emit({ ...event, supported: false, reason: reason || "Session closed" });
      this._emit({ type: "elicitation_resolved", requestId: id, action: "decline", reason: reason || "Session closed" });
      return { action: "decline" };
    }
    const gate = deferred();
    const onAbort = () => this._resolveElicitation(id, { action: "cancel" }, "Request aborted");
    const entry = { ...gate, event, schema: params.requestedSchema, cleanup: () => signal?.removeEventListener("abort", onAbort) };
    if (this.pendingElicitations.has(id)) throw new AcpError("Duplicate elicitation id", "elicitation_conflict");
    this.pendingElicitations.set(id, entry);
    signal?.addEventListener("abort", onAbort, { once: true });
    this._emit(event);
    return await gate.promise;
  }

  _resolveElicitation(id, response, reason) {
    const entry = this.pendingElicitations.get(String(id));
    if (!entry) return false;
    this.pendingElicitations.delete(String(id));
    entry.cleanup();
    // Do not persist form answers (they can contain credentials).
    this._emit({ type: "elicitation_resolved", requestId: String(id), action: response.action, ...(reason ? { reason } : {}) });
    entry.resolve(response);
    return true;
  }

  _cancelElicitations(reason = "Cancelled") {
    const ids = [...this.pendingElicitations.keys()];
    for (const id of ids) this._resolveElicitation(id, { action: "cancel" }, reason);
    return ids.length;
  }

  async elicitation(args = {}) {
    const id = String(args.requestId || "");
    const entry = this.pendingElicitations.get(id);
    if (!entry) throw new AcpError("Elicitation not pending", "elicitation_not_found");
    const action = String(args.action || "");
    if (!["accept", "decline", "cancel"].includes(action)) throw new AcpError("Invalid elicitation action", "bad_request");
    const response = action === "accept" ? { action, content: validateElicitationContent(entry.schema, args.content ?? {}) } : { action };
    this._resolveElicitation(id, response);
    return { ok: true, requestId: id, action };
  }

  async start() {
    if (this.status !== "idle") throw new AcpError("会话已启动或已关闭（status=" + this.status + "）", "bad_state");
    if (!this.def) throw new AcpError("不支持的 ACP agent: " + this.agent, "unsupported_agent");
    this.status = "starting";
    try {
      const launchSpec = buildRemoteAcpLaunchSpec({ profile: this.profile, agent: this.agent, remotePath: this.remotePath, remoteRuntimeDir: this.remoteRuntimeDir, agentPath: this.agentPath, sshPath: this.opts.sshPath });
      const env = Object.assign({}, process.env, this.opts.env || {});

      const controller = await connectAcp({
        sdk: this.opts.sdk,
        launchSpec,
        mcpServers: this.opts.mcpServers || [],
        spawn: this.spawn,
        env,
        resumeSessionId: this.resumeSessionId,
        forkSessionId: this.opts.forkSessionId,
        onForkSubmitted: this.opts.onForkSubmitted,
        onForkResponse: this.opts.onForkResponse,
        connectImpl: this.connectImpl,
        clientCapabilities: this.opts.clientCapabilities,
        debug: !!(this.opts.debug || process.env.DSH_ACP_DEBUG === "1"),
        onClientRequest: this.opts.onClientRequest,
        onStderr: (chunk) => { this.lastStderr = (this.lastStderr + chunk).slice(-8192); },
        onUpdate: (update, notification) => this._emitUpdate(update, notification),
        onPermission: (params, requestId) => this.handlePermissionRequest(params, requestId),
        onElicitation: (params, requestId, signal) => this.handleElicitationRequest(params, requestId, signal),
        onFatal: (err) => {
          if (this.closed) return;
          this._clearQueued("Adapter disconnected before submission");
          if (this.activeTurn) this._finishTurn(this.activeTurn, null, err);
          this.lastError = String(err && err.message ? err.message : err);
          if (this.status !== "closed") this.status = "error";
          this.broker.cancelAll();
          this._cancelElicitations();
          this._emit({ type: "error", message: this.lastError, code: (err && err.code) || "acp_error", fatal: true });
        }
      });
      this.controller = controller;

      let ready;
      try {
        ready = await withTimeout(controller.ready, this.startTimeoutMs, "ACP initialize/session/new", () => {
          // Fork failures are disposed once, and awaited, by the outer catch.
          try { if (!this.opts.forkSessionId) controller.close()?.catch?.(() => {}); } catch (e) {}
        });
      } catch (err) {
        const extra = this.lastStderr ? " | adapter stderr: " + this.lastStderr.slice(-1600) : "";
        throw new AcpError(String(err && err.message ? err.message : err) + extra, (err && err.code) || "start_failed");
      }

      if (this.opts.forkSessionId && (typeof ready.sessionId !== "string" || !ready.sessionId || ready.sessionId === this.opts.forkSessionId)) throw new AcpError("Fork must return a distinct real remote sessionId", "fork_invalid_response");
      this.sessionId = ready.sessionId;
      if (ready.protocolCwd) this.remotePath = ready.protocolCwd;
      this.initialize = ready.initialize;
      this.capabilities = ready.capabilities || normalizeCapabilities(ready.initialize);
      this.config = normalizeSessionConfig(ready.sessionResponse);
      this.config.sessionId = this.sessionId;
      this.adapter = controller.adapter || null;
      this.startedAt = Date.now();
      if (this.opts.forkSessionId) await withTimeout(this._confirmForkConfig(this.opts.forkConfig), this.startTimeoutMs, "ACP fork config confirmation");
      else await this.setMode(this.opts.modeId || this.requestedPermission);
      if (!this.opts.forkSessionId && this.opts.model) {
        if (!this.config.models) throw new AcpError("Adapter does not advertise model selection", "config_unsupported");
        await this.setConfig(this.config.models.configId, this.opts.model);
      }
      this.status = "ready";
      this._emit({
        type: "session",
        session: {
          id: this.id,
          sessionId: this.sessionId,
          agent: this.agent,
          agentLabel: this.def.label,
          cwd: this.cwd,
          remotePath: this.remotePath,
            remoteRuntimeDir: this.remoteRuntimeDir,
          permission: this.permissionMode,
          dshSessionId: this.dshSessionId,
          resumed: !!this.resumeSessionId
        },
        config: this.config,
        capabilities: this.capabilities
      });
      return this;
    } catch (err) {
      this.lastError = String(err && err.message ? err.message : err);
      this.status = "error";
      this.broker.cancelAll();
      this._cancelElicitations();
      try { if (this.controller) await (this.opts.forkSessionId ? this.controller.dispose() : this.controller.close()); } catch (e) {}
      throw err instanceof AcpError ? err : new AcpError(this.lastError, (err && err.code) || "start_failed");
    }
  }

  _guardFork() {
    if (this.forking) throw new AcpError("Session fork is in progress", "fork_busy");
  }

  async _confirmForkConfig(source) {
    if (!source?.mode) throw new AcpError("Source mode is unconfirmed", "fork_config_unconfirmed");
    // Never send options to session/fork: Codex does not advertise options.
    // Use only individually advertised settings, retaining the source permission.
    if (this.config.mode !== source.mode) await this.setMode(source.mode);
    else this._syncPermission(this.config.mode);
    for (const [field, descriptor] of [["model", "models"], ["reasoningEffort", "reasoning"]]) {
      if (this.closed || this.status === "error") throw new AcpError("Fork configuration confirmation interrupted", "fork_config_unconfirmed");
      if (source[field] == null) continue;
      if (this.config[field] !== source[field]) {
        const option = this.config[descriptor];
        if (!option) throw new AcpError("Fork did not advertise " + field, "fork_config_unconfirmed");
        await this.setConfig(option.configId, source[field]);
      }
    }
    if (["mode", "model", "reasoningEffort"].some(field => source[field] != null && this.config[field] !== source[field])) throw new AcpError("Fork configuration was not confirmed", "fork_config_unconfirmed");
  }

  setTitle(title) {
    try {
      this._guardFork();
      if (this.closed || this.status !== "ready" && this.status !== "prompting") throw new AcpError("Session is not ready", "not_ready");
      if (!supportsSessionAction(this.capabilities, "title") || typeof this.controller?.setTitle !== "function") throw new AcpError("Adapter does not advertise session title", "title_unsupported");
      if (typeof title !== "string" || !title.trim()) throw new AcpError("Title must be a non-empty string", "bad_title");
      if (this.titleBlocked) throw Object.assign(new AcpError("Previous title request timed out; reconcile before renaming", "title_outcome_unknown"), { titleStatus: this.titleStatus });
    } catch (error) { return Promise.reject(error); }
    this.titlePending++;
    const operation = this.titleQueue.catch(() => {}).then(async () => {
      if (this.titleBlocked) {
        this.titlePending--;
        throw Object.assign(new AcpError("Previous title request timed out; queued rename not sent", "title_outcome_unknown"), { titleStatus: this.titleStatus });
      }
      const previous = this.title;
      let confirmed = false, submitted = false;
      try {
        if (this.closed) throw new AcpError("Session closed before title submission", "closed");
        submitted = true;
        const response = await withTimeout(this.controller.setTitle(title), this.startTimeoutMs, "ACP session/set_title");
        if (typeof response?.title !== "string" || !response.title.trim()) throw new AcpError("Adapter did not confirm title", "title_unconfirmed");
        confirmed = true;
        this.title = response.title;
        this.titleStatus = { outcome: "confirmed", previous, requested: title };
        this.opts.persistMetadata?.(this);
        this._emit({ type: "title", title: this.title, titleStatus: this.titleStatus });
        return { title: this.title, previous, titleStatus: this.titleStatus };
      } catch (error) {
        const remoteTitle = this.title;
        this.title = previous;
        if (error.code === "timeout") this.titleBlocked = true;
        // Even RPC errors can follow partial transcript writes. Only local
        // pre-submission failure proves that nothing was changed remotely.
        this.titleStatus = { outcome: submitted ? "unknown" : "failed", previous, requested: title, ...(confirmed ? { remoteTitle, persistenceFailed: true } : {}), ...(this.titleBlocked ? { timeout: true } : {}), error: String(error.message || error) };
        try { this.opts.persistMetadata?.(this); } catch (persistError) { this.persistenceError = String(persistError.message || persistError); }
        this._emit({ type: "title", title: previous, titleStatus: this.titleStatus });
        error.titleStatus = this.titleStatus;
        throw error;
      } finally { this.titlePending--; }
    });
    this.titleQueue = operation;
    return operation;
  }

  preparePrompt(text, opts = {}) {
    const value = String(text == null ? "" : text);
    const attachments = opts.attachments || [];
    if (!Array.isArray(attachments)) throw new AcpError("attachments must be an array", "bad_attachment");
    if (!value.trim() && !attachments.length) throw new AcpError("消息不能为空", "empty_prompt");
    const capabilities = this.capabilities?.agentCapabilities?.promptCapabilities || {};
    const blocks = value ? [{ type: "text", text: value }] : [];
    for (const attachment of attachments) {
      const a = asObject(attachment);
      if (!a) throw new AcpError("Invalid attachment", "bad_attachment");
      let block = a;
      if (!a.type && typeof a.text === "string") {
        block = { type: "resource", resource: { uri: a.uri || "attachment:" + encodeURIComponent(a.name || "text"), mimeType: a.mimeType || "text/plain", text: a.text } };
      } else if (!a.type && a.uri) {
        block = { type: "resource_link", uri: String(a.uri), name: String(a.name || a.uri), mimeType: a.mimeType };
      }
      const supported = block.type === "image" ? capabilities.image : block.type === "audio" ? capabilities.audio
        : (block.type === "resource" || block.type === "resource_link") ? capabilities.embeddedContext : false;
      if (!supported) throw new AcpError("Adapter does not support attachment type: " + (block.type || "path"), "attachment_unsupported");
      if ((block.type === "image" || block.type === "audio") && (!block.mimeType || typeof block.data !== "string")) throw new AcpError("Attachment requires mimeType/data", "bad_attachment");
      if (block.type === "resource" && (!block.resource?.uri || (typeof block.resource.text !== "string" && typeof block.resource.blob !== "string"))) throw new AcpError("Invalid embedded resource", "bad_attachment");
      if (block.type === "resource_link" && !block.uri) throw new AcpError("Attachment requires uri", "bad_attachment");
      if (JSON.stringify(block).length > 8 * 1024 * 1024) throw new AcpError("Attachment too large", "attachment_too_large");
      blocks.push(block);
    }
    return { value, prompt: attachments.length ? blocks : value, content: blocks.map(summarizeContentBlock), attachments: attachments.map((a, i) => ({ type: blocks[blocks.length - attachments.length + i].type, name: String(a.name || a.resource?.uri || a.uri || "attachment"), mimeType: String(a.mimeType || a.resource?.mimeType || "") })) };
  }

  _enqueueTurn(text, opts = {}) {
    if (this.cancelling) throw new AcpError("Cancellation is in progress", "turn_cancelling");
    const prepared = this.preparePrompt(text, opts);
    const gate = deferred();
    const turn = { ...prepared, ...gate, id: this.generation + ":" + (++this.turnSeq) + ":" + randomUUID(), requestId: opts.requestId ? String(opts.requestId) : undefined, settled: false };
    // Queued steer callers do not await completion; errors still produce events.
    turn.promise.catch(() => {});
    if (turn.requestId) this.requests.set(turn.requestId, { requestId: turn.requestId, kind: opts.requestKind || "prompt", turnId: turn.id, promise: turn.promise, status: "pending" });
    this.turnQueue.push(turn);
    this.pendingTurns++;
    this._emit({ type: "user_message", text: prepared.value, content: prepared.content, attachments: prepared.attachments, turnId: turn.id, requestId: turn.requestId, delivery: this.activeTurn ? "queued" : "accepted", steering: false, queued: !!this.activeTurn });
    this._drainTurns();
    return turn;
  }

  _finishTurn(turn, result, error) {
    if (turn.settled) return;
    turn.settled = true;
    this.pendingTurns = Math.max(0, this.pendingTurns - 1);
    const stopReason = error ? (error.code === "cancelled" ? "cancelled" : "error") : (result?.stopReason || "unknown");
    const resultValue = { turnId: turn.id, requestId: turn.requestId, stopReason, response: result?.response || null };
    if (turn.requestId && this.requests.get(turn.requestId)?.kind !== "steer") this.requests.set(turn.requestId, { requestId: turn.requestId, kind: "prompt", turnId: turn.id, status: error && error.code !== "cancelled" ? "unknown" : "completed", result: summarizeRaw(resultValue) });
    if (error) this._emit({ type: "error", turnId: turn.id, requestId: turn.requestId, code: error.code || "prompt_failed", message: String(error.message || error), fatal: false });
    for (const [id, request] of this.requests) {
      if (this.requests.size <= 1000) break;
      if (request.status !== "pending") this.requests.delete(id);
    }
    this._emit({ type: "stop", turnId: turn.id, requestId: turn.requestId, stopReason, busy: this.pendingTurns > 0, pendingTurns: this.pendingTurns, submitted: !!turn.submitted, response: result?.response ? summarizeRaw(result.response) : null });
    if (error && error.code !== "cancelled") turn.reject(error);
    else turn.resolve(resultValue);
  }

  _clearQueued(reason = "Cancelled before submission") {
    const queued = this.turnQueue.splice(0);
    for (const turn of queued) this._finishTurn(turn, null, new AcpError(reason, "cancelled"));
    return queued.length;
  }

  _drainTurns() {
    if (this.activeTurn || this.cancelling || this.closed || this.status === "error") return;
    const turn = this.turnQueue.shift();
    if (!turn) { if (this.status === "prompting") this.status = "ready"; return; }
    this.activeTurn = turn;
    this.status = "prompting";
    (async () => {
      try {
        // Display names belong to native history, not the ACP image wire block.
        const prompt = Array.isArray(turn.prompt) ? turn.prompt.map(block => {
          if (block.type !== 'image' || !Object.hasOwn(block, 'name')) return block;
          const { name, ...wire } = block; return wire;
        }) : turn.prompt;
        const pending = this.controller.prompt(prompt);
        turn.submitted = true;
        const started = this._emit({ type: "turn_start", turnId: turn.id, requestId: turn.requestId, submitted: true });
        for (const observer of this.turnLifecycleSubscribers) {
          try { observer({ ...started, content: typeof turn.prompt === "string" ? [{ type: "text", text: turn.prompt }] : turn.prompt }); } catch {}
        }
        const result = await withTimeout(pending, this.promptTimeoutMs, "ACP prompt");
        this._finishTurn(turn, result);
      } catch (error) {
        this._finishTurn(turn, null, error);
        // A failed/timeout prompt can have been accepted remotely. Never submit
        // the next turn into an unknown transport state or blindly retry it.
        this.lastError = String(error.message || error);
        if (!this.closed) this.status = "error";
        this._clearQueued("Previous turn outcome unknown");
        this.broker.cancelAll();
        this._cancelElicitations();
        try { await this.controller.dispose?.(); } catch {}
      } finally {
        if (this.activeTurn === turn) this.activeTurn = null;
        this._drainTurns();
      }
    })();
  }

  _requestReplay(requestId, kind) {
    if (!requestId) return null;
    const prior = this.requests.get(String(requestId));
    if (!prior) return null;
    if (prior.kind !== kind) throw new AcpError("requestId already used for another operation", "request_conflict");
    if (prior.promise) return prior.promise;
    if (prior.status === "completed") return Promise.resolve(prior.result);
    throw new AcpError("Previous request outcome unknown; not resent", "request_outcome_unknown");
  }

  async prompt(text, opts = {}) {
    this._guardFork();
    const replay = this._requestReplay(opts.requestId, "prompt");
    if (replay) {
      const result = await replay;
      this._emit({ type: "request_ack", requestId: String(opts.requestId), turnId: result.turnId, delivery: "accepted", deduplicated: true });
      return { ...result, deduplicated: true };
    }
    if (this.closed) throw new AcpError("ACP 会话已关闭", "closed");
    if (this.status !== "ready" && this.status !== "prompting") throw new AcpError(this.lastError || "ACP 会话尚未就绪", this.status === "error" ? "session_error" : "not_ready");
    return await this._enqueueTurn(text, opts).promise;
  }

  async command(name, input = "") {
    const key = String(name || "").replace(/^\//, "");
    const command = this.commands.find(c => c.name.replace(/^\//, "") === key);
    if (!command) throw new AcpError("Command not advertised: " + key, "command_unsupported");
    if (/\r|\n/.test(key)) throw new AcpError("Invalid command", "bad_request");
    return await this.prompt("/" + key + (input ? " " + String(input) : ""));
  }

  async steer(text, opts = {}) {
    this._guardFork();
    const replay = this._requestReplay(opts.requestId, "steer");
    if (replay) {
      const result = await replay;
      this._emit({ type: "request_ack", requestId: String(opts.requestId), turnId: result.turnId, delivery: result.outcome === "injected" ? "steered" : "queued", deduplicated: true });
      return { ...result, deduplicated: true };
    }
    const promise = this._steer(text, opts);
    if (opts.requestId) {
      const requestId = String(opts.requestId);
      this.requests.set(requestId, { requestId, kind: "steer", status: "pending", promise });
      promise.then(result => {
        this.requests.set(requestId, { requestId, kind: "steer", status: "completed", result });
        this._emit({ type: "steering_result", requestId, ...result });
      }, error => {
        this.requests.set(requestId, { requestId, kind: "steer", status: "unknown" });
        this._emit({ type: "steering_result", requestId, outcome: "unknown", message: String(error.message || error) });
      });
    }
    return await promise;
  }

  async _steer(text, opts) {
    if (!this.activeTurn || this.status !== "prompting") throw new AcpError("当前没有进行中的 turn", "no_active_turn");
    const value = String(text == null ? "" : text);
    if (!value.trim()) throw new AcpError("消息不能为空", "empty_prompt");
    const supported = !!this.capabilities?.steering?.supported && typeof this.controller?.steer === "function";
    if (!supported) {
      const turn = this._enqueueTurn(value, { requestId: opts.requestId, requestKind: "steer" });
      return { outcome: "queued", steering: false, turnId: turn.id, requestId: opts.requestId };
    }
    const turnId = this.activeTurn.id;
    // Emit accepted user input only after explicit injection acknowledgement.
    let result;
    try { result = await withTimeout(this.controller.steer(value), 30000, "ACP steering"); }
    catch (error) {
      this._emit({ type: "steering_result", turnId, outcome: "unknown", message: String(error.message || error) });
      throw new AcpError("Steering outcome unknown; not resent: " + String(error.message || error), "steering_unknown");
    }
    if (result?.outcome === "injected") {
      this._emit({ type: "user_message", text: value, turnId, requestId: opts.requestId, delivery: "steered", steering: true });
      return { outcome: "injected", steering: true, turnId, requestId: opts.requestId };
    }
    // Only an explicit promptRequired proves no injection occurred.
    if (result?.outcome === "promptRequired") {
      const turn = this._enqueueTurn(value, { requestId: opts.requestId, requestKind: "steer" });
      return { outcome: "queued", steering: false, turnId: turn.id, requestId: opts.requestId };
    }
    this._emit({ type: "steering_result", turnId, outcome: "unknown", response: summarizeRaw(result) });
    throw new AcpError("Steering outcome unknown; not resent", "steering_unknown");
  }

  async permission(args) {
    const a = args || {};
    const requestId = String(a.requestId == null ? "" : a.requestId);
    if (!requestId) throw new AcpError("缺少 requestId", "bad_request");
    const entry = this.broker.get(requestId);
    if (!entry) throw new AcpError("权限请求不存在或已处理: " + requestId, "permission_not_found");
    if (a.cancelled === true || a.optionId == null || a.optionId === "") {
      const ok = this.broker.cancel(requestId);
      if (ok) this._emit({ type: "permission_resolved", requestId, outcome: "cancelled" });
      return { requestId, outcome: "cancelled", ok };
    }
    const ok = this.broker.respond(requestId, String(a.optionId));
    if (!ok) throw new AcpError("optionId 不在该权限请求的可选列表中: " + String(a.optionId), "bad_option");
    this._emit({ type: "permission_resolved", requestId, optionId: String(a.optionId), outcome: "selected" });
    return { requestId, optionId: String(a.optionId), outcome: "selected", ok: true };
  }

  async cancel() {
    this._guardFork();
    if (this.closed) return { ok: false, error: "会话已关闭" };
    this.cancelling = true;
    const cancelledQueued = this._clearQueued();
    const cancelled = this.broker.cancelAll();
    this._cancelElicitations();
    if (cancelled) this._emit({ type: "permission_cancelled", count: cancelled });
    try {
      const sent = this.activeTurn ? await this.controller.cancel() : false;
      return { ok: true, sent, cancelledPermissions: cancelled, cancelledQueued };
    } catch (err) {
      return { ok: false, error: String(err.message || err), sent: false, cancelledPermissions: cancelled, cancelledQueued };
    } finally { this.cancelling = false; this._drainTurns(); }
  }

  async setConfig(configId, value) {
    this._guardFork();
    if (!this.controller || this.closed) throw new AcpError("会话尚未启动或已关闭", "not_ready");
    const id = String(configId || "");
    const option = this.config.configOptions.find(o => o.id === id);
    if (!option) throw new AcpError("Config option not advertised: " + id, "config_unsupported");
    if (option.type === "boolean" ? typeof value !== "boolean" : !flattenSelectOptions(option.options).some(o => o.value === String(value))) throw new AcpError("Config value not advertised", "bad_option");
    const modeOption = option.category === "mode" || ["mode", "permission_mode"].includes(id);
    if (modeOption && this.modeChanging) throw new AcpError("Mode change in progress", "mode_busy");
    if (modeOption) { this.modeChanging = true; this.permissionMode = "default"; }
    this.configChanging++;
    try {
      const response = await this.controller.setConfig(id, value);
      if (!Array.isArray(response?.configOptions)) throw new AcpError("Adapter did not confirm config change", "config_unconfirmed");
      this._emit({ type: "config", configId: id, value, configOptions: response.configOptions });
      return { configId: id, value, config: this.config, configOptions: this.config.configOptions, response: summarizeRaw(response) };
    } catch (error) {
      if (modeOption) this.permissionMode = "default";
      throw error;
    } finally { this.configChanging--; if (modeOption) this.modeChanging = false; }
  }

  _syncPermission(modeId) {
    const permission = Object.keys(PERMISSION_MODES).find(key => PERMISSION_MODES[key].includes(modeId)) || "default";
    this.permissionMode = permission;
    this.permissionStatus = { requested: this.requestedPermission, supported: true, applied: true, modeId, effective: permission };
  }

  async setMode(modeId) {
    this._guardFork();
    if (!this.controller || this.closed) throw new AcpError("会话尚未启动或已关闭", "not_ready");
    if (this.modeChanging) throw new AcpError("Mode change in progress", "mode_busy");
    const requested = String(modeId || "");
    const id = resolvePermissionMode(requested, this.config.modes);
    if (!id || typeof this.controller.setMode !== "function") {
      this.permissionMode = "default"; // unsupported exit requests still revoke Host bypass
      this.permissionStatus = { requested, supported: false, applied: false, effective: this.permissionMode };
      throw new AcpError("Adapter does not advertise mode: " + requested, "mode_unsupported");
    }
    this.modeChanging = true; // disable Host auto-approval immediately, including while leaving bypass
    const prior = this.permissionMode;
    this.permissionMode = "default";
    try {
      const response = await this.controller.setMode(id);
      this.requestedPermission = PERMISSION_MODES[requested] ? requested : (Object.keys(PERMISSION_MODES).find(key => PERMISSION_MODES[key].includes(id)) || "default");
      this._emit({ type: "mode", currentModeId: id, config: this.config });
      return { modeId: id, permission: this.permissionMode, permissionStatus: this.permissionStatus, config: this.config, response: summarizeRaw(response) };
    } catch (error) {
      // An ambiguous failure must not restore bypass auto-approval.
      this.permissionMode = "default";
      this.permissionStatus = { requested, supported: true, applied: false, effective: "default", previous: prior };
      throw error;
    } finally { this.modeChanging = false; }
  }

  state() {
    const lifecycle = this.alive ? "active" : (this.status === "error" ? "error" : (this.status === "closed" ? "closed" : (this.status === "detached" ? "detached" : "idle")));
    return {
      id: this.id,
      sessionId: this.sessionId,
      dshSessionId: this.dshSessionId,
      agent: this.agent,
      agentLabel: this.def ? this.def.label : this.agent,
      profileId: String(this.profile.id || this.opts.profileId || ""),
      cwd: this.cwd,
      remotePath: this.remotePath,
      runtimeTransport: "remote",
      configuredRemotePath: this.configuredRemotePath,
      remoteRuntimeDir: this.remoteRuntimeDir,
      executionBoundary: "remote-adapter-and-agent",
      permission: this.permissionMode,
      permissionStatus: this.permissionStatus,
      workspaceId: this.workspaceId,
      generation: this.generation,
      cursor: { generation: this.generation, seq: this.eventSeq },
      commands: this.commands,
      persistenceError: this.persistenceError,
      status: this.status,
      lifecycle,
      detached: this.status === "detached",
      resumable: !this.alive && !!this.sessionId && this.status !== "closed",
      alive: this.alive,
      busy: this.busy,
      pendingTurns: this.pendingTurns,
      forking: this.forking,
      title: this.title, titleStatus: this.titleStatus,
      forkOrigin: this.forkOrigin, forkOperation: this.forkOperation,
      config: this.config,
      capabilities: this.capabilities,
      pendingPermissions: this.broker.list(),
      pendingElicitations: [...this.pendingElicitations.values()].map(entry => entry.event),
      bufferedEvents: this.events.length,
      lastError: this.lastError,
      createdAt: this.createdAt,
      startedAt: this.startedAt
    };
  }

  /** 只停当前 turn（session/cancel），不关闭会话、不移除绑定。 */
  async stop() {
    const r = await this.cancel();
    return Object.assign({}, r, {
      stopped: true,
      closed: false,
      id: this.id,
      dshSessionId: this.dshSessionId,
      status: this.status
    });
  }

  async dispose() {
    this._guardFork();
    if (this.closed) return;
    this.closed = true;
    this.status = "detached";
    this.broker.cancelAll();
    this._cancelElicitations();
    this._clearQueued("Runtime shutdown");
    if (this.activeTurn) this._finishTurn(this.activeTurn, null, new AcpError("Runtime shutdown; remote outcome unknown", "runtime_shutdown"));
    if (this.controller) {
      await this.controller.dispose();
    }
    this._emit({ type: "lifecycle", status: "detached" });
    this.subscribers.clear();
    this.turnLifecycleSubscribers.clear();
  }

  async close() {
    this._guardFork();
    if (this.closed) return;
    this.closed = true;
    this.status = "closed";
    this.broker.cancelAll();
    this._cancelElicitations();
    this._clearQueued("Session closed");
    if (this.activeTurn) this._finishTurn(this.activeTurn, null, new AcpError("Session closed", "cancelled"));
    try { if (this.controller) await this.controller.close(); } finally { this.subscribers.clear(); this.turnLifecycleSubscribers.clear(); }
  }
}

/**
 * createAcpRuntime({ getProfile, storePath, ... })
 *   getProfile(profileId) 由 Host 提供（用于 resume 时取连接配置）。
 *   createSession 可注入（测试用）；默认 new AcpSession()。
 */
export function createAcpRuntime(options) {
  const o = options || {};
  const sessions = new Map();
  const store = o.store || new AcpStore({ storePath: o.storePath });
  const locks = new Map();
  const remoteActions = new Map();
  let shuttingDown = false;
  const makeSession = o.createSession || (args => new AcpSession(args));

  function locked(key, operation) {
    if (shuttingDown) return Promise.reject(new AcpError("Runtime is shutting down", "runtime_shutdown"));
    const before = locks.get(key) || Promise.resolve();
    const result = before.catch(() => {}).then(operation);
    locks.set(key, result);
    result.finally(() => {
      if (locks.get(key) === result) locks.delete(key);
      // Metadata observers cannot change operation outcomes or Agent lifetime.
      try { o.onActivity?.(); } catch {}
    }).catch(() => {});
    return result;
  }
  function remoteAction(fn, args = {}, approval) {
    if (shuttingDown) return Promise.reject(new AcpError("Runtime is shutting down", "runtime_shutdown"));
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    args.signal?.addEventListener("abort", onAbort, { once: true });
    if (args.signal?.aborted) controller.abort();
    const promise = Promise.resolve().then(() => fn({ ...o, ...args, signal: controller.signal }, approval));
    remoteActions.set(controller, promise);
    promise.finally(() => { remoteActions.delete(controller); args.signal?.removeEventListener("abort", onAbort); }).catch(() => {});
    return promise;
  }
  function lockKey(id, args = {}) {
    const bound = args.dshSessionId || sessions.get(String(id))?.dshSessionId || store.get(id)?.dshSessionId;
    return bound ? "binding:" + bound : "session:" + String(id);
  }
  function recordOf(session) {
    return {
      id: session.id, profileId: String(session.profile?.id || session.opts?.profileId || ""),
      workspaceId: session.workspaceId,
      recordVersion: 3, agent: session.agent, cwd: session.cwd,
      remotePath: session.remotePath, agentPath: session.agentPath || "",
      remoteRuntimeDir: session.remoteRuntimeDir, configuredRemotePath: session.configuredRemotePath,
      sessionId: session.sessionId, dshSessionId: session.dshSessionId || "",
      permission: session.permissionMode,
      requestedPermission: session.requestedPermission, permissionStatus: session.permissionStatus,
      config: session.config, commands: session.commands, capabilities: session.capabilities,
      title: session.title, titleStatus: session.titleStatus,
      forkOrigin: session.forkOrigin, forkOperation: session.forkOperation,
      generation: session.generation, eventSeq: session.eventSeq,
      requests: [...session.requests.values()].slice(-1000).map(({ promise, ...request }) => request),
      createdAt: session.createdAt, updatedAt: Date.now()
    };
  }
  function activeByDsh(id) {
    return [...sessions.values()].find(s => s.alive && s.dshSessionId === String(id)) || null;
  }
  function sameBinding(session, args) {
    const profileId = String(session.profile?.id || session.profileId || "");
    return profileId === String(args.profile?.id || args.profileId || "") &&
      normalizeAgent(session.agent) === normalizeAgent(args.agent || "claude") &&
      (!args.remoteRuntimeDir || session.remoteRuntimeDir === args.remoteRuntimeDir) &&
      String(session.cwd || "") === String(args.cwd || "") &&
      (!args.remotePath || session.remotePath === args.remotePath || session.configuredRemotePath === args.remotePath) &&
      (!args.agentPath || session.agentPath === args.agentPath) &&
      (!args.workspaceId || session.workspaceId === args.workspaceId) &&
      (!args.permission || session.requestedPermission === args.permission) &&
      (!args.modeId || session.config?.mode === args.modeId) &&
      (!args.model || session.config?.model === args.model);
  }
  function conflict(existing) {
    const err = new AcpError("Binding configuration differs; explicitly replace or resume existing history", "binding_conflict");
    err.activeId = existing.id;
    return err;
  }
  function build(args) {
    const session = makeSession({ ...o, ...args, eventStore: store,
      persistMetadata(session) { store.upsert(recordOf(session)); },
      onEvent(event, session) {
        store.appendEvent(session.id, event);
        if (!store.get(session.id) || ["session", "config", "mode", "commands", "lifecycle", "user_message", "stop", "steering_result", "title", "session_info"].includes(event.type)) store.upsert(recordOf(session));
        o.onEvent?.(event, session);
      }
    });
    return session;
  }
  async function detach(id, reason) {
    const session = sessions.get(String(id));
    if (!session) return { ok: !!store.get(id), detached: !!store.get(id), id: String(id) };
    await session.dispose();
    store.upsert({ ...recordOf(session), detachedReason: String(reason || "shutdown") });
    sessions.delete(String(id));
    return { ok: true, detached: true, closed: false, id: String(id), dshSessionId: session.dshSessionId || "" };
  }
  async function resumeUnlocked(id, args = {}) {
    const key = String(id);
    const live = sessions.get(key);
    if (live?.alive) return live;
    if (live) await detach(key, "resume");
    const record = store.get(key);
    if (!record) throw new AcpError("未找到可 resume 的 ACP 会话: " + key, "session_not_found");
    if (!record.sessionId) throw new AcpError("ACP record has no remote session to resume", "session_not_resumable");
    const active = record.dshSessionId && activeByDsh(record.dshSessionId);
    if (active && active.id !== key) throw conflict(active);
    const profile = args.profile || (o.getProfile ? await o.getProfile(record.profileId) : null);
    if (!profile) throw new AcpError("连接配置已删除，无法 resume: " + record.profileId, "profile_missing");
    const history = store.readEvents(key, { tail: true, limit: o.maxEvents || MAX_EVENTS });
    const session = build({ ...record, ...args, id: key, profile,
      permission: record.requestedPermission,
      modeId: args.modeId || record.config?.mode,
      model: args.model || record.config?.model,
      resumeSessionId: record.sessionId, history });
    sessions.set(key, session);
    await session.start();
    store.upsert(recordOf(session));
    return session;
  }
  const runtime = {
    store, sessions,
    ...createForkActions({ sessions, store, build, recordOf, locked, lockKey }),
    async setTitle(id, title) {
      const live = sessions.get(String(id));
      if (live?.alive) return await live.setTitle(title);
      return locked(lockKey(id), async () => {
        const current = sessions.get(String(id));
        if (current?.alive) return await current.setTitle(title);
        const record = store.get(id);
        if (!record) throw new AcpError("Session not found", "session_not_found");
        let controller, metadata;
        try {
          if (typeof title !== "string" || !title.trim()) throw new AcpError("Title must be a non-empty string", "bad_title");
          if (!record.sessionId) throw new AcpError("Record has no remote session identity", "session_not_resumable");
          if (!record.remotePath.startsWith("/") || /[\0\r\n]/.test(record.remotePath)) throw new AcpError("Stored remotePath must be absolute", "bad_remote_path");
          const profile = o.getProfile ? await o.getProfile(record.profileId) : null;
          if (!profile) throw new AcpError("Connection profile is unavailable", "profile_missing");
          // A metadata-only facade deliberately keeps its events out of the
          // conversation journal and never becomes an active runtime session.
          metadata = new AcpSession({ ...record, profile, permission: record.requestedPermission,
            startTimeoutMs: o.startTimeoutMs,
            persistMetadata(session) {
              store.upsert({ ...record, title: session.title, titleStatus: session.titleStatus, updatedAt: Date.now() });
            }
          });
          const launchSpec = buildRemoteAcpLaunchSpec({ profile, agent: record.agent, remotePath: record.remotePath, remoteRuntimeDir: record.remoteRuntimeDir, agentPath: record.agentPath, sshPath: o.sshPath });
          controller = await connectAcp({ sdk: o.sdk, spawn: o.spawn || nodeSpawn,
            env: { ...process.env, ...o.env }, launchSpec,
            connectImpl: o.connectImpl, clientCapabilities: o.clientCapabilities,
            titleSessionId: record.sessionId,
            onPermission: async () => cancelledOutcome(),
            onElicitation: async () => ({ action: "decline" })
          });
          const ready = await withTimeout(controller.ready, metadata.startTimeoutMs, "ACP title initialize");
          metadata.controller = controller;
          metadata.capabilities = ready.capabilities || normalizeCapabilities(ready.initialize);
          metadata.status = "ready";
          return await metadata.setTitle(title);
        } catch (error) {
          const titleStatus = error.titleStatus || { outcome: "failed", previous: record.title ?? null, requested: title, error: String(error.message || error) };
          try { store.upsert({ ...record, title: record.title ?? null, titleStatus, updatedAt: Date.now() }); }
          catch (persistError) { titleStatus.persistenceError = String(persistError.message || persistError); }
          error.titleStatus = titleStatus;
          throw error;
        } finally {
          // Never session/close a cold/archived target, even after failure.
          try { await controller?.dispose(); } catch {}
          const latest = store.get(id);
          if (current && latest) { current.title = latest.title ?? null; current.titleStatus = latest.titleStatus; }
        }
      });
    },
    bindDshSession(id, dshSessionId) {
      return locked("binding:" + String(dshSessionId), async () => {
        const session = sessions.get(String(id));
        if (!session) throw new AcpError("Session not found", "session_not_found");
        session._guardFork();
        const binding = String(dshSessionId || "");
        if (!binding || session.dshSessionId && session.dshSessionId !== binding || [...sessions.values(), ...store.list()].some(s => s.id !== session.id && s.dshSessionId === binding)) throw new AcpError("DSH binding conflicts", "binding_conflict");
        const previous = session.dshSessionId;
        session.dshSessionId = binding;
        try { store.upsert(recordOf(session)); } catch (error) { session.dshSessionId = previous; throw error; }
        return session;
      });
    },
    probeRemote(args) { return remoteAction(probeRemoteAcp, args); },
    preparationPlan(args) { return remoteAcpPreparationPlan({ ...o, ...args }); },
    prepareRemote(args, approval) { return remoteAction(prepareRemoteAcp, args, approval); },
    create(args = {}) {
      const id = args.id || newSessionId();
      return locked(lockKey(id, args), async () => {
        const a = { ...args, id, agent: normalizeAgent(args.agent || "claude") };
        let replacedId = "";
        if (a.dshSessionId) {
          const existing = activeByDsh(a.dshSessionId) || store.list().filter(r => r.dshSessionId === a.dshSessionId).sort((x, y) => y.createdAt - x.createdAt)[0];
          if (existing) {
            if (a.replace !== true) {
              if (!sameBinding(existing, a)) throw conflict(existing);
              const reused = existing.alive ? existing : await resumeUnlocked(existing.id, { profile: a.profile });
              reused.reused = true;
              reused.replacedId = "";
              return reused;
            }
            replacedId = existing.id;
            await detach(existing.id, "replaced"); // retain historical record + journal
          }
        }
        if (sessions.has(id) || store.get(id)) throw new AcpError("Session id already exists", "session_exists");
        const session = build(a);
        session.reused = false;
        session.replacedId = replacedId;
        sessions.set(session.id, session);
        await session.start();
        store.upsert(recordOf(session));
        return session;
      });
    },
    resume(id, args = {}) { return locked(lockKey(id), () => resumeUnlocked(id, args)); },
    get(id) { return sessions.get(String(id || "")) || null; },
    findActive(id) { return activeByDsh(String(id || "")); },
    list(args) {
      const out = new Map();
      for (const record of store.list()) {
        const live = sessions.get(String(record.id));
        out.set(String(record.id), live ? { ...live.state(), persisted: true } : {
          ...record, runtimeTransport: "remote", agentLabel: ACP_AGENTS[record.agent]?.label || record.agent,
          status: "detached", lifecycle: "detached", detached: true,
          resumable: !!record.sessionId, alive: false, busy: false, persisted: true,
          cursor: { generation: record.generation, seq: record.eventSeq || 0 }
        });
      }
      for (const [id, session] of sessions) if (!out.has(id)) out.set(id, session.state());
      return [...out.values()].filter(s => args?.dshSessionId == null || s.dshSessionId === String(args.dshSessionId)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    events(id, cursor, opts = {}) {
      const live = sessions.get(String(id));
      if (live?.eventsSince) return live.eventsSince(cursor, opts);
      const record = store.get(id);
      if (!record) throw new AcpError("Session not found", "session_not_found");
      const c = readCursor(cursor);
      const reset = !!c.generation && c.generation !== record.generation;
      const page = store.readEvents(id, { sinceSeq: reset ? 0 : Number(c.seq) || 0, limit: opts.limit, tail: !!opts.tail || opts.beforeSeq != null, beforeSeq: opts.beforeSeq });
      return { events: page.events, reset, hasMore: page.hasMore, hasEarlier: page.hasEarlier, oldestSeq: page.oldestSeq, cursor: { generation: page.generation || record.generation, seq: page.events.at(-1)?.seq || (reset ? 0 : Number(c.seq) || 0) } };
    },
    async elicitation(id, args) {
      const session = sessions.get(String(id));
      if (!session) throw new AcpError("Session not found", "session_not_found");
      return await session.elicitation(args);
    },
    async stop(id) {
      const session = sessions.get(String(id));
      if (!session) throw new AcpError("未找到 ACP 会话", "session_not_found");
      return await session.stop();
    },
    shutdownSession(id, args = {}) {
      if (sessions.get(String(id))?.forking) return Promise.reject(new AcpError("Session fork is in progress", "fork_busy"));
      return locked(lockKey(id), () => detach(id, args.reason));
    },
    close(id) {
      if (sessions.get(String(id))?.forking) return Promise.reject(new AcpError("Session fork is in progress", "fork_busy"));
      return locked(lockKey(id), async () => {
        const key = String(id), session = sessions.get(key), record = store.get(key);
        const dshSessionId = session?.dshSessionId || record?.dshSessionId || "";
        if (session) { await session.close(); sessions.delete(key); }
        const removed = store.remove(key);
        return { ok: !!session || removed, closed: !!session, removed, dshSessionId };
      });
    },
    async shutdown() {
      shuttingDown = true;
      for (const controller of remoteActions.keys()) controller.abort();
      await Promise.allSettled([...remoteActions.values()]);
      await Promise.allSettled([...locks.values()]);
      const ids = [...sessions.keys()];
      const results = await Promise.allSettled(ids.map(id => detach(id, "runtime_shutdown")));
      const failed = results.find(r => r.status === "rejected");
      if (failed) throw failed.reason;
      return ids.length;
    },
    dispose() { return runtime.shutdown(); }
  };
  return runtime;
}
