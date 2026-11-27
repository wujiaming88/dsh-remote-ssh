/** Latest-whole-session forks. The journal is display-only, never prompt input. */
import { randomUUID } from "node:crypto";
import { AcpError, newSessionId, readCursor } from "./acp-core.js";
import { supportsSessionAction } from "./acp-transport.js";

// Normalized journal types from acp-events.js, plus read-only turn lifecycle.
// Session/config/commands/suggestions and approval state are not inherited.
const DISPLAY_EVENTS = new Set([
  "user_message", "text", "thought", "tool_call", "tool_call_update",
  "plan", "plan_removed", "usage", "notice", "compaction", "compaction_chunk",
  "subagent", "subagent_update", "state", "terminal", "session_message", "update",
  "turn_start", "stop", "error"
]);
const COPY_BATCH_EVENTS = 1000;
const COPY_BATCH_BYTES = 8 * 1024 * 1024;
const PROGRESS_INTERVAL_MS = 100;

export function createForkActions({ sessions, store, build, recordOf, locked, lockKey }) {
  const operations = new Map();
  const controllers = new Map();
  function lookup(id) {
    const op = operations.get(String(id)) || store.getForkOperation(String(id));
    if (!op) return null;
    // A persisted pending operation may have reached the remote before a crash.
    return { ...op, outcome: op.outcome === "pending" ? "unknown" : op.outcome };
  }
  function save(op) {
    operations.set(op.operationId, { ...op });
    store.saveForkOperation(op);
  }
  function failure(op, error) {
    return Object.assign(error instanceof Error ? error : new AcpError(String(error), "fork_failed"), {
      operationId: op.operationId, outcome: op.outcome, childId: op.childId,
      remoteSessionId: op.remoteSessionId || null
    });
  }
  function interruptForks(reason) {
    const error = reason instanceof Error ? reason : new AcpError(typeof reason === "string" ? reason : "ACP runtime is shutting down", "runtime_shutdown");
    for (const controller of controllers.values()) controller.abort(error);
    return controllers.size;
  }
  return {
    forkOperation: lookup,
    interruptForks,
    fork(sourceId, args = {}) {
      const operationId = String(args.operationId || randomUUID());
      try {
        const prior = lookup(operationId);
        if (prior) throw failure(prior, new AcpError("Fork operation already exists; recover its recorded outcome, never resend", "fork_operation_exists"));
        const source = sessions.get(String(sourceId));
        if (!source) throw new AcpError("Fork requires a live source session", "session_not_found");
        if (source.closed || source.status !== "ready" || source.busy || source.pendingTurns || source.activeTurn || source.turnQueue.length || source.broker.list().length || source.pendingElicitations.size || [...source.requests.values()].some(request => request.status === "pending") || source.modeChanging || source.configChanging || source.forking || source.remoteForkReservation || source.cancelling || source.titlePending) throw new AcpError("Fork requires an idle source without pending actions", "fork_busy");
        if (!supportsSessionAction(source.capabilities, "fork")) throw new AcpError("Adapter does not advertise session fork", "fork_unsupported");
        // Pi has no ACP session mode and its built-in tools are autonomous; its
        // permissionStatus is intentionally unsupported, so there is no mode to
        // confirm for a fork.
        if (source.agent !== "pi" && (!source.permissionStatus?.applied || source.permissionStatus.modeId !== source.config.mode || source.permissionStatus.effective !== source.permissionMode)) throw new AcpError("Source permission configuration is unconfirmed; refusing potential escalation", "fork_config_unconfirmed");
        if (args.cursorId != null || args.cut != null && args.cut !== "latest" || args.turnId != null || args.beforeSeq != null) throw new AcpError("Only the latest whole session can be forked", "fork_cut_unsupported");
        const cut = { generation: source.generation, seq: source.eventSeq };
        if (args.cursor != null) {
          const cursor = readCursor(args.cursor);
          if (cursor.generation !== cut.generation || cursor.seq !== cut.seq) throw new AcpError("Historical fork cuts are not supported", "fork_cut_unsupported");
        }
        const remotePath = args.remotePath ?? source.remotePath;
        if (typeof remotePath !== "string" || !remotePath.startsWith("/") || /[\0\r\n]/.test(remotePath)) throw new AcpError("Fork requires an absolute remotePath", "bad_remote_path");
        const id = String(args.id || newSessionId()), dshSessionId = String(args.dshSessionId || "");
        if (id === source.id || sessions.has(id) || store.get(id)) throw new AcpError("Child session id already exists", "session_exists");
        if (dshSessionId && (dshSessionId === source.dshSessionId || [...sessions.values(), ...store.list()].some(s => s.dshSessionId === dshSessionId))) throw new AcpError("Child DSH binding already exists", "binding_conflict");
        const op = { operationId, sourceId: source.id, sourceSessionId: source.sessionId, childId: id, dshSessionId, remotePath, cut, outcome: "prepared", createdAt: Date.now() };
        const sourceConfig = structuredClone(source.config);
        operations.set(operationId, { ...op });
        source.forking = true; // acquired before returning: prompt cannot race admission
        const run = async () => {
          let child;
          const controller = new AbortController(), signal = controller.signal;
          const onAbort = () => controller.abort(args.signal.reason);
          controllers.set(operationId, controller);
          args.signal?.addEventListener("abort", onAbort, { once: true });
          if (args.signal?.aborted) onAbort();
          const throwIfAborted = () => {
            if (!signal.aborted) return;
            throw signal.reason instanceof Error ? signal.reason : new AcpError(String(signal.reason || "Fork aborted"), "fork_aborted");
          };
          try {
            if (sessions.has(id) || store.get(id)) throw new AcpError("Child session id already exists", "session_exists");
            if (dshSessionId && [...sessions.values(), ...store.list()].some(s => s.dshSessionId === dshSessionId)) throw new AcpError("Child DSH binding already exists", "binding_conflict");
            // Durable intent precedes any child connection or remote fork call.
            save(op);
            throwIfAborted();
            // Remote ownership survives SSH/Host loss. Reserve the source at its
            // broker as well as locally before a child can submit session/fork.
            await source.reserveFork?.(op);
            throwIfAborted();
            child = build({ id, profile: source.profile, agent: source.agent,
              cwd: args.cwd ?? source.cwd, remotePath,
              configuredRemotePath: args.configuredRemotePath ?? source.configuredRemotePath,
              workspaceId: args.workspaceId ?? source.workspaceId,
              remoteRuntimeDir: source.remoteRuntimeDir, agentPath: source.agentPath,
              permission: source.requestedPermission, dshSessionId, title: source.title,
              titleStatus: { outcome: "unknown", source: "inherited" },
              forkSessionId: source.sessionId, forkConfig: sourceConfig,
              forkOrigin: { sourceId: source.id, sourceSessionId: source.sessionId, sourceDshSessionId: source.dshSessionId, cut },
              forkOperation: op,
              onForkSubmitted() { op.outcome = "pending"; save(op); },
              onForkResponse(response) {
                if (typeof response?.sessionId === "string" && response.sessionId && response.sessionId !== source.sessionId) {
                  child.sessionId = response.sessionId;
                  op.remoteSessionId = response.sessionId; op.outcome = "remoteCreated"; save(op);
                }
              }
            });
            sessions.set(id, child);
            // Copy only display events to independent sequence/generation. Do not
            // route them through _emit: that applies config/runtime state. The
            // source is scanned once; batches and the child buffer stay bounded.
            let processed = 0, lastProgress = 0;
            const reportProgress = force => {
              if (typeof args.onProgress !== "function") return null;
              const now = Date.now();
              if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return null;
              return Promise.resolve(args.onProgress({ processed, total: cut.seq })).then(() => { lastProgress = Date.now(); });
            };
            await reportProgress(true);
            let batch = [], batchLines = [], batchBytes = 0;
            const flush = async () => {
              if (!batch.length) return;
              throwIfAborted();
              const pending = batch, pendingLines = batchLines;
              batch = []; batchLines = []; batchBytes = 0;
              await store.appendEvents(id, pending, pendingLines);
              const maxEvents = Math.min(1000, child.maxEvents);
              const retained = pending.slice(Math.max(0, pending.length - maxEvents));
              const overflow = Math.max(0, child.events.length + retained.length - maxEvents);
              if (overflow) child.events.splice(0, overflow);
              child.events.push(...retained);
              throwIfAborted();
            };
            for await (const original of store.streamEvents(source.id, { beforeSeq: cut.seq + 1, signal })) {
              processed++;
              throwIfAborted();
              const progress = reportProgress(false);
              if (progress) await progress;
              if (!DISPLAY_EVENTS.has(original.type)) continue;
              const { requestId, displayRequestId: priorDisplayRequestId, turnId, rootSessionId, ...display } = original;
              const inheritedId = value => child.generation + ":inherited:" + value;
              // Presentation correlation is not an operational deduplication
              // key. Keep it stable when inherited history is forked again.
              const displayRequestId = priorDisplayRequestId || (requestId ? "inherited:" + source.id + ":" + requestId : undefined);
              const inherited = { ...display, inherited: true,
                ...(displayRequestId ? { displayRequestId } : {}),
                origin: { id: source.id, sessionId: original.sessionId, rootSessionId, generation: original.generation, seq: original.seq, turnId, requestId, ...(original.origin ? { inheritedOrigin: original.origin } : {}) },
                generation: child.generation, seq: ++child.eventSeq,
                sessionId: inheritedId(original.sessionId || source.sessionId), dshSessionId,
                ...(rootSessionId ? { rootSessionId: inheritedId(rootSessionId) } : {}),
                ...(turnId ? { turnId: child.generation + ":inherited:" + turnId } : {}) };
              const line = JSON.stringify(inherited);
              const bytes = Buffer.byteLength(line) + 2;
              if (bytes > COPY_BATCH_BYTES) throw new AcpError("An inherited event exceeds the 8 MiB fork batch limit", "fork_event_too_large");
              if (batch.length && (batch.length >= COPY_BATCH_EVENTS || batchBytes + bytes > COPY_BATCH_BYTES)) await flush();
              batch.push(inherited); batchLines.push(line); batchBytes += bytes;
              if (batch.length >= COPY_BATCH_EVENTS || batchBytes >= COPY_BATCH_BYTES) await flush();
            }
            await flush();
            await reportProgress(true);
            throwIfAborted();
            await child.start();
            throwIfAborted();
            if (!op.remoteSessionId) { op.remoteSessionId = child.sessionId; op.outcome = "remoteCreated"; save(op); }
            if (child.persistenceError) throw new AcpError(child.persistenceError, "fork_persistence_failed");
            store.upsert(recordOf(child));
            op.outcome = "completed";
            save(op);
            child.forkOperation = { ...op };
            store.upsert(recordOf(child));
            await source.releaseFork?.(op);
            return child;
          } catch (error) {
            op.outcome = op.remoteSessionId ? "localCommitFailed" : op.outcome === "pending" || ["remote_detached", "runtime_shutdown", "timeout"].includes(error.code) ? "unknown" : "failed";
            op.error = String(error.message || error);
            try { save(op); } catch (persistError) { op.persistenceError = String(persistError.message || persistError); operations.set(operationId, { ...op }); }
            if (child) { child.forkOperation = { ...op }; try { await child.dispose(); } catch {} }
            // With an unknown submitted fork, keep the remote reservation until
            // child identity/outcome can be reconciled; never unlock by timeout.
            if (op.outcome !== "unknown") {
              try { await source.releaseFork?.(op); }
              catch (releaseError) { op.releaseError = String(releaseError.message || releaseError); try { save(op); } catch {} }
            }
            throw failure(op, error);
          } finally {
            controllers.delete(operationId);
            args.signal?.removeEventListener("abort", onAbort);
          }
        };
        // Shutdown awaits these locks before reclaiming owned transports.
        return locked(lockKey(source.id), () => locked(lockKey(id, { dshSessionId }), run)).finally(() => { source.forking = false; });
      } catch (error) { return Promise.reject(error); }
    }
  };
}
