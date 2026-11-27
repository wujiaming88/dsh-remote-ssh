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

export function createForkActions({ sessions, store, build, recordOf, locked, lockKey }) {
  const operations = new Map();
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
  return {
    forkOperation: lookup,
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
          try {
            if (sessions.has(id) || store.get(id)) throw new AcpError("Child session id already exists", "session_exists");
            if (dshSessionId && [...sessions.values(), ...store.list()].some(s => s.dshSessionId === dshSessionId)) throw new AcpError("Child DSH binding already exists", "binding_conflict");
            // Durable intent precedes any child connection or remote fork call.
            save(op);
            // Remote ownership survives SSH/Host loss. Reserve the source at its
            // broker as well as locally before a child can submit session/fork.
            await source.reserveFork?.(op);
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
            // route them through _emit: that applies config/runtime state.
            let cursor = 0, page;
            do {
              page = store.readEvents(source.id, { sinceSeq: cursor, beforeSeq: cut.seq + 1, limit: 1000 });
              for (const original of page.events) {
                cursor = original.seq;
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
                store.appendEvent(id, inherited);
                child.events.push(inherited);
                if (child.events.length > child.maxEvents) child.events.shift();
              }
            } while (page.hasMore);
            await child.start();
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
          }
        };
        // Shutdown awaits these locks before reclaiming owned transports.
        return locked(lockKey(source.id), () => locked(lockKey(id, { dshSessionId }), run)).finally(() => { source.forking = false; });
      } catch (error) { return Promise.reject(error); }
    }
  };
}
