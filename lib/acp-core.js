/** Shared domain primitives for the remote-only ACP runtime. */
import { randomUUID } from "node:crypto";
export const PROTOCOL_VERSION = 1;
export const MAX_TEXT_CHUNK = 16000;
export const MAX_TOOL_TEXT = 12000;
export const MAX_DIFF_TEXT = 40000;
export const MAX_RAW_JSON = 8000;
export const MAX_EVENTS = 1000;
export const DEFAULT_START_TIMEOUT_MS = 90000;
export const DEFAULT_CLOSE_TIMEOUT_MS = 4000;

export const ACP_AGENTS = {
  claude: {
    id: "claude",
    label: "Claude Code",
    cmd: "claude",
    adapterPackage: "@agentclientprotocol/claude-agent-acp",
    envVar: "CLAUDE_CODE_EXECUTABLE",
  },
  codex: {
    id: "codex",
    label: "Codex",
    cmd: "codex",
    adapterPackage: "@agentclientprotocol/codex-acp",
    envVar: "CODEX_PATH",
  }
};

export const ACP_SSH_HOST_KEY_POLICY = "accept-new";

export const ACP_CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
  elicitation: { form: {} }, // URL flow is deliberately not advertised
  session: {
    configOptions: { boolean: true },
    notices: {},
    compaction: {}
  },
  plan: {}
};

export class AcpError extends Error {
  constructor(message, code) {
    super(String(message == null ? "ACP error" : message));
    this.name = "AcpError";
    this.code = code || "acp_error";
  }
}

export function truncate(text, max) {
  const s = String(text == null ? "" : text);
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…（已截断 " + (s.length - max) + " 字符）";
}

export function asObject(value) {
  return value && typeof value === "object" ? value : null;
}

export function withTimeout(promise, ms, label, onTimeout) {
  if (!ms || ms <= 0) return promise;
  let timer;
  const timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      const err = new AcpError((label || "ACP 操作") + " 超时（" + ms + "ms）", "timeout");
      try { if (onTimeout) onTimeout(); } catch (e) {}
      reject(err);
    }, ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(function () { if (timer) clearTimeout(timer); });
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export function normalizeAgent(agent) {
  const a = String(agent || "").toLowerCase();
  if (a === "claude") return "claude";
  if (a === "codex") return "codex";
  return a;
}

export function normalizePermission(p) {
  const v = String(p || "");
  if (v === "plan" || v === "bypass" || v === "acceptEdits") return v;
  return "acceptEdits";
}

export function newSessionId() { return "acp_" + randomUUID(); }

export function readCursor(cursor) {
  if (cursor == null) return { seq: 0 };
  if (typeof cursor !== "object" || Array.isArray(cursor) || (cursor.seq != null && (!Number.isSafeInteger(cursor.seq) || cursor.seq < 0)) || (cursor.generation != null && typeof cursor.generation !== "string")) throw new AcpError("Cursor must contain generation and non-negative integer seq", "bad_cursor");
  return { generation: cursor.generation, seq: cursor.seq ?? 0 };
}
