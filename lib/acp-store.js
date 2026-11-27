/** Versioned snapshots and separately paged event journals. Host owns the path. */
import { readFileSync, mkdirSync, writeFileSync, renameSync, appendFileSync, createReadStream, openSync, readSync, closeSync, unlinkSync, fstatSync } from "node:fs";
import { mkdir as mkdirAsync, appendFile as appendFileAsync } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { randomUUID } from "node:crypto";
import { dirname, join, isAbsolute, resolve } from "node:path";
import { AcpError } from "./acp-core.js";

export const ACP_STORE_SCHEMA = "dsh-remote-acp/v3";
export const ACP_STORE_VERSION = 3;
export const ACP_RECORD_VERSION = 3;
export const ACP_EVENT_VERSION = 1;

function validateRecord(record) {
  if (!record || record.recordVersion !== ACP_RECORD_VERSION) throw new AcpError("Unsupported ACP record schema; existing data is not migrated", "store_schema_unsupported");
  const strings = ["id", "profileId", "workspaceId", "agent", "cwd", "remotePath", "configuredRemotePath", "remoteRuntimeDir", "agentPath", "sessionId", "dshSessionId", "permission", "requestedPermission", "generation"];
  if (strings.some(key => typeof record[key] !== "string") || !record.id || !record.generation || !["claude", "codex", "pi"].includes(record.agent)) throw new AcpError("Invalid v3 ACP record identity", "store_corrupt");
  if (!Number.isSafeInteger(record.eventSeq) || record.eventSeq < 0 || !Number.isFinite(record.createdAt) || !Number.isFinite(record.updatedAt)) throw new AcpError("Invalid v3 ACP record sequence/timestamps", "store_corrupt");
  if (!record.config || typeof record.config !== "object" || !Array.isArray(record.commands) || !Array.isArray(record.requests)) throw new AcpError("Invalid v3 ACP record state", "store_corrupt");
  return record;
}

export class AcpStore {
  constructor(opts) {
    const o = opts || {};
    if (typeof o.storePath !== "string" || !isAbsolute(o.storePath)) throw new AcpError("Host must provide an absolute v3 ACP storePath", "store_path_required");
    this.path = resolve(o.storePath);
    this.records = null;
    // Byte offsets are an in-memory pagination cache only. They are never part
    // of the journal format and a shrink/rewrite falls back to a fresh scan.
    this.eventOffsets = new Map();
    this.eventSizes = new Map();
    this.eventDirectoryReady = null;
  }

  read() {
    if (this.records) return this.records;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      if (!raw || raw.schema !== ACP_STORE_SCHEMA || raw.version !== ACP_STORE_VERSION) throw new AcpError("Unsupported ACP snapshot schema; choose a fresh v3 storePath. Existing data is untouched", "store_schema_unsupported");
      if (!Array.isArray(raw.sessions)) throw new Error("Invalid sessions snapshot");
      if (raw.forkOperations != null && (!Array.isArray(raw.forkOperations) || raw.forkOperations.some(op => !op || typeof op.operationId !== "string" || typeof op.outcome !== "string"))) throw new Error("Invalid fork operations");
      this.records = { schema: ACP_STORE_SCHEMA, version: ACP_STORE_VERSION, sessions: raw.sessions.map(validateRecord), forkOperations: raw.forkOperations || [] };
    } catch (e) {
      if (e instanceof AcpError) throw e;
      if (e.code !== "ENOENT") throw new AcpError("ACP store unreadable: " + e.message, "store_corrupt");
      this.records = { schema: ACP_STORE_SCHEMA, version: ACP_STORE_VERSION, sessions: [] };
    }
    return this.records;
  }

  list() {
    return this.read().sessions.slice();
  }

  get(id) {
    const key = String(id || "");
    return this.read().sessions.find(function (s) { return String(s.id) === key; }) || null;
  }

  upsert(record) {
    if (!record || !record.id) throw new AcpError("ACP record id is required", "store_corrupt");
    const data = this.read();
    const key = String(record.id);
    const idx = data.sessions.findIndex(function (s) { return String(s.id) === key; });
    const next = validateRecord(idx >= 0 ? { ...data.sessions[idx], ...record } : record);
    const previous = data.sessions;
    data.sessions = idx >= 0 ? data.sessions.map((item, i) => i === idx ? next : item) : [...data.sessions, next];
    try { this.save(); } catch (error) { data.sessions = previous; throw error; }
    return this.get(key);
  }

  getForkOperation(operationId) {
    return this.read().forkOperations?.find(op => op.operationId === String(operationId)) || null;
  }

  saveForkOperation(operation) {
    const data = this.read(), previous = data.forkOperations;
    data.forkOperations = [...(previous || []).filter(op => op.operationId !== operation.operationId), { ...operation }];
    try { this.save(); } catch (error) { data.forkOperations = previous; throw error; }
    return operation;
  }

  remove(id) {
    const data = this.read();
    const key = String(id || "");
    const before = data.sessions.length;
    data.sessions = data.sessions.filter(function (s) { return String(s.id) !== key; });
    const removed = data.sessions.length !== before;
    if (removed) {
      this.save();
      this.eventOffsets.delete(key);
      this.eventSizes.delete(key);
      const file = this.historyPath(key); // fixed directory + hex-only basename
      if (dirname(file) !== this.path + ".events") throw new AcpError("Invalid history path", "bad_path");
      try { unlinkSync(file); } catch (e) { if (e.code !== "ENOENT") throw e; }
    }
    return removed;
  }

  historyPath(id) {
    return join(this.path + ".events", Buffer.from(String(id)).toString("hex") + ".ndjson");
  }

  appendEvent(id, event) {
    this.read();
    if (event.eventVersion !== ACP_EVENT_VERSION) throw new AcpError("Unsupported ACP event schema", "history_schema_unsupported");
    mkdirSync(this.path + ".events", { recursive: true, mode: 0o700 });
    // Leading newline isolates a torn final write after a crash.
    appendFileSync(this.historyPath(id), "\n" + JSON.stringify(event) + "\n", { mode: 0o600 });
  }

  // Forks serialize their batches, so one asynchronous append preserves journal
  // order while avoiding one synchronous filesystem operation per event.
  async appendEvents(id, events, serialized = null) {
    this.read();
    if (!Array.isArray(events) || serialized !== null && (!Array.isArray(serialized) || serialized.length !== events.length)) throw new AcpError("ACP event batch must be an array", "history_corrupt");
    const data = events.map((event, index) => {
      if (event.eventVersion !== ACP_EVENT_VERSION) throw new AcpError("Unsupported ACP event schema", "history_schema_unsupported");
      const line = serialized === null ? JSON.stringify(event) : serialized[index];
      if (typeof line !== "string") throw new AcpError("Invalid serialized ACP event batch", "history_corrupt");
      return "\n" + line + "\n";
    }).join("");
    if (!data) return;
    if (!this.eventDirectoryReady) {
      this.eventDirectoryReady = mkdirAsync(this.path + ".events", { recursive: true, mode: 0o700 }).catch(error => {
        this.eventDirectoryReady = null; throw error;
      });
    }
    await this.eventDirectoryReady;
    await appendFileAsync(this.historyPath(id), data, { mode: 0o600 });
  }

  _eventFromString(line) {
    line = line.replace(/\r$/, "");
    if (!line.trim()) return null;
    let ev;
    try { ev = JSON.parse(line); } catch { return null; } // torn journal tail
    if (ev.eventVersion !== ACP_EVENT_VERSION) throw new AcpError("Unsupported ACP event schema", "history_schema_unsupported");
    if (!Number.isSafeInteger(ev.seq) || ev.seq < 1 || typeof ev.generation !== "string" || !ev.generation || typeof ev.type !== "string") throw new AcpError("Invalid ACP event record", "history_corrupt");
    return ev;
  }

  _eventFromLine(buffer) {
    return this._eventFromString(buffer.toString("utf8"));
  }

  // Paged history is read backwards from a cached byte offset. A 100+ MiB
  // journal must never be re-parsed from byte zero for every scroll page.
  _readTailEvents(id, file, { limit, beforeSeq, sinceSeq = 0 }) {
    const empty = { events: [], lastSeq: 0, generation: null, hasMore: false, hasEarlier: false, oldestSeq: null, firstOffset: null };
    let fd;
    try { fd = openSync(file, "r"); }
    catch (error) { if (error.code === "ENOENT") return empty; throw error; }
    try {
      const size = fstatSync(fd).size;
      const key = String(id);
      let offsets = this.eventOffsets.get(key);
      if (!offsets) { offsets = new Map(); this.eventOffsets.set(key, offsets); }
      const previousSize = this.eventSizes.get(key);
      if (previousSize != null && size < previousSize) { offsets.clear(); this.eventOffsets.set(key, offsets); }
      this.eventSizes.set(key, size);
      const cached = beforeSeq != null && Number.isSafeInteger(Number(beforeSeq)) ? offsets.get(Number(beforeSeq)) : null;
      let position = Number.isSafeInteger(cached) && cached >= 0 && cached <= size ? cached : size;
      let pending = Buffer.alloc(0), lastSeq = 0, generation = null;
      const found = [];
      const chunkSize = 256 * 1024;
      while ((position > 0 || pending.length) && found.length < limit) {
        if (position > 0) {
          const step = Math.min(chunkSize, position);
          position -= step;
          const chunk = Buffer.allocUnsafe(step);
          let got = 0;
          while (got < step) {
            const n = readSync(fd, chunk, got, step - got, position + got);
            if (!n) break;
            got += n;
          }
          if (!got) break;
          if (got < step) position += step - got;
          pending = pending.length ? Buffer.concat([chunk.subarray(0, got), pending]) : chunk.subarray(0, got);
        }
        let end = pending.length;
        while (end > 0 && found.length < limit) {
          const newline = pending.lastIndexOf(0x0a, end - 1);
          if (newline < 0 && position > 0) break; // partial first line; read one chunk further back
          const start = newline < 0 ? 0 : newline + 1;
          const ev = this._eventFromLine(pending.subarray(start, end));
          if (ev) {
            lastSeq = Math.max(lastSeq, ev.seq);
            generation = ev.generation || generation;
            if ((beforeSeq == null || ev.seq < Number(beforeSeq)) && ev.seq > Number(sinceSeq || 0)) found.push({ event: ev, offset: position + start });
          }
          end = newline < 0 ? 0 : newline;
        }
        pending = pending.subarray(0, end);
      }
      found.reverse();
      if (found.length >= limit) {
        // Any remaining bytes (or an unread earlier chunk) prove that another
        // page exists. Whitespace-only padding is the only false positive.
        const rest = pending.length ? pending.toString("utf8").trim() : "";
        found.hasEarlier = !!(rest || position > 0);
      }
      for (const row of found) offsets.set(row.event.seq, row.offset);
      const events = found.map(row => row.event);
      return { events, lastSeq, generation, hasMore: false, hasEarlier: events.length >= limit ? found.hasEarlier : false,
        oldestSeq: events[0]?.seq ?? null, firstOffset: found[0]?.offset ?? null };
    } finally { closeSync(fd); }
  }

  readEvents(id, { sinceSeq = 0, limit = 1000, tail = false, beforeSeq } = {}) {
    this.read();
    limit = Math.max(1, Math.min(10000, Number(limit) || 1000));
    if (tail) return this._readTailEvents(id, this.historyPath(id), { limit, beforeSeq, sinceSeq });
    const events = [];
    let fd, rest = "", lastSeq = 0, lastGeneration = null, matched = 0;
    const consume = (line) => {
      const ev = this._eventFromString(line);
      if (!ev) return;
      lastSeq = Math.max(lastSeq, ev.seq);
      lastGeneration = ev.generation || lastGeneration;
      if (beforeSeq != null && ev.seq >= Number(beforeSeq)) return;
      if (ev.seq <= sinceSeq) return;
      matched++;
      if (tail || events.length < limit) events.push(ev);
      if (tail && events.length > limit) events.shift();
    };
    try {
      fd = openSync(this.historyPath(id), "r");
      const buffer = Buffer.alloc(65536);
      // StringDecoder preserves Unicode across read boundaries.
      const decoder = new StringDecoder("utf8");
      let n;
      while ((n = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
        rest += decoder.write(buffer.subarray(0, n));
        let newline;
        while ((newline = rest.indexOf("\n")) >= 0) {
          consume(rest.slice(0, newline));
          rest = rest.slice(newline + 1);
        }
        if (rest.length > 16 * 1024 * 1024) throw new AcpError("ACP journal event exceeds limit", "history_corrupt");
      }
      rest += decoder.end();
      if (rest) consume(rest);
    } catch (e) { if (e.code !== "ENOENT") throw e; }
    finally { if (fd !== undefined) closeSync(fd); }
    return { events, lastSeq, generation: lastGeneration, hasMore: !tail && matched > events.length, hasEarlier: !!tail && matched > events.length, oldestSeq: events[0]?.seq || null };
  }

  // Single-pass, bounded-memory counterpart to forward readEvents pagination.
  // Invalid/torn lines are ignored and valid records use the same validation.
  async *streamEvents(id, { sinceSeq = 0, beforeSeq, signal } = {}) {
    this.read();
    const throwIfAborted = () => {
      if (!signal?.aborted) return;
      const reason = signal.reason;
      throw reason instanceof Error ? reason : new AcpError(typeof reason === "string" ? reason : "ACP journal streaming aborted", "history_aborted");
    };
    throwIfAborted();
    const input = createReadStream(this.historyPath(id), { highWaterMark: 65536, signal });
    const decoder = new StringDecoder("utf8");
    let rest = "";
    const consume = line => {
      const ev = this._eventFromString(line);
      if (!ev || beforeSeq != null && ev.seq >= Number(beforeSeq) || ev.seq <= sinceSeq) return null;
      return ev;
    };
    try {
      for await (const chunk of input) {
        throwIfAborted();
        rest += decoder.write(chunk);
        let offset = 0, newline;
        while ((newline = rest.indexOf("\n", offset)) >= 0) {
          throwIfAborted();
          const ev = consume(rest.slice(offset, newline));
          offset = newline + 1;
          if (ev) yield ev;
        }
        rest = rest.slice(offset);
        if (rest.length > 16 * 1024 * 1024) throw new AcpError("ACP journal event exceeds limit", "history_corrupt");
      }
      throwIfAborted();
      rest += decoder.end();
      if (rest) {
        const ev = consume(rest);
        if (ev) yield ev;
      }
    } catch (error) {
      if (signal?.aborted) throwIfAborted();
      if (error.code !== "ENOENT") throw error;
    } finally {
      input.destroy();
    }
  }

  save() {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmp = this.path + ".tmp-" + process.pid + "-" + randomUUID();
    writeFileSync(tmp, JSON.stringify(this.read(), null, 2), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
}

