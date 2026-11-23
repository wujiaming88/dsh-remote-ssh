/**
 * ACP Host Runtime（无 DSH 依赖）
 *
 * 把远端 Claude Code / Codex 通过「本地 ACP adapter + SSH wrapper」接进 DSH：
 *
 *   远端 agent 进程  ← stdio →  ssh  ← stdio →  本地 adapter（Node）  ← stdio →  DSH Host
 *
 * 这一层只负责 Host/HTTP 能用的「会话对象」与 NDJSON 事件：
 *   · 每个 ACP 会话一个 adapter 子进程 + 一个 `client()` 连接；
 *   · wrapper 由本模块生成/复用（~/.dsh/remote-ssh/acp/<agent>-remote.mjs），
 *     adapter 通过 CLAUDE_CODE_EXECUTABLE / CODEX_PATH 指向它；
 *   · wrapper 用 ssh 执行远端 `bash -ic 'exec <agentPath> ...'`，
 *     参数以 base64 JSON 交给远端 python3 解码（避免 shell 注入与超长命令）；
 *   · session/update 映射成稳定、可渲染的简洁事件（文本/思考/工具/diff/终端/计划/命令/配置）；
 *   · session/request_permission 挂起为 `permission` 事件，等 Host 回传 optionId；
 *   · 支持 steer（_session/steering，turn 进行中追加消息）、cancel、resume/close、session 列表。
 *
 * 设计约束：纯 ESM + Node 内置模块；ACP SDK / adapter 都是**懒加载**，单元测试不需要装依赖。
 */

import { spawn as nodeSpawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, chmod, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PassThrough, Readable, Writable } from "node:stream";

/** 可走 ACP 的 agent。pi 目前没有官方 ACP adapter，仍走旧的 -p/--mode json。 */
export const ACP_AGENTS = {
  claude: {
    id: "claude",
    label: "Claude Code",
    cmd: "claude",
    adapterPackage: "@agentclientprotocol/claude-agent-acp",
    adapterEntry: "dist/index.js",
    envVar: "CLAUDE_CODE_EXECUTABLE",
    wrapperName: "claude-remote.mjs",
    extraEnv: {}
  },
  codex: {
    id: "codex",
    label: "Codex",
    cmd: "codex",
    adapterPackage: "@agentclientprotocol/codex-acp",
    adapterEntry: "dist/index.js",
    envVar: "CODEX_PATH",
    wrapperName: "codex-remote.mjs",
    extraEnv: { NO_BROWSER: "1" }
  }
};

const PROTOCOL_VERSION = 1;
const MAX_TEXT_CHUNK = 16000;
const MAX_TOOL_TEXT = 12000;
const MAX_DIFF_TEXT = 40000;
const MAX_RAW_JSON = 8000;
const MAX_EVENTS = 1000;
const DEFAULT_START_TIMEOUT_MS = 90000;
const DEFAULT_CLOSE_TIMEOUT_MS = 4000;

/** 客户端能力：声明我们理解 plan / configOptions(boolean) / notices / compaction；
 *  不声明 fs/terminal（agent 在远端自己有文件系统，不需要 Host 代读代写）。 */
export const ACP_CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
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

function truncate(text, max) {
  const s = String(text == null ? "" : text);
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…（已截断 " + (s.length - max) + " 字符）";
}

function asObject(value) {
  return value && typeof value === "object" ? value : null;
}

/** 把任意值收窄成可控大小的 rawInput/rawOutput。 */
export function summarizeRaw(value, max) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const limit = max || MAX_RAW_JSON;
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") return String(value);
    if (json.length <= limit) return value;
    return { truncated: true, preview: json.slice(0, limit) };
  } catch (e) {
    return truncate(String(value), limit);
  }
}

/** 单块内容 → 可渲染结构（不内联图片/音频二进制）。 */
export function summarizeContentBlock(block) {
  if (!block || typeof block !== "object") return null;
  switch (block.type) {
    case "text":
      return { type: "text", text: truncate(block.text || "", MAX_TEXT_CHUNK) };
    case "image":
      return { type: "image", mimeType: block.mimeType || "", uri: block.uri || "", dataLength: block.data ? String(block.data).length : 0 };
    case "audio":
      return { type: "audio", mimeType: block.mimeType || "", dataLength: block.data ? String(block.data).length : 0 };
    case "resource_link":
      return { type: "resource_link", uri: block.uri || "", name: block.name || "", title: block.title || "", mimeType: block.mimeType || "", size: block.size || 0 };
    case "resource": {
      const r = block.resource || {};
      if (typeof r.text === "string") {
        return { type: "resource", uri: r.uri || "", mimeType: r.mimeType || "", text: truncate(r.text, MAX_TOOL_TEXT) };
      }
      return { type: "resource", uri: r.uri || "", mimeType: r.mimeType || "", dataLength: r.blob ? String(r.blob).length : 0 };
    }
    default:
      return { type: block.type || "unknown" };
  }
}

function mapToolContentItem(item) {
  if (!item || typeof item !== "object") return { type: "unknown" };
  if (item.type === "content") {
    const block = summarizeContentBlock(item.content);
    return block || { type: "unknown" };
  }
  if (item.type === "diff") {
    const out = {
      type: "diff",
      path: String(item.path || ""),
      newText: truncate(item.newText || "", MAX_DIFF_TEXT)
    };
    if (item.oldText != null) out.oldText = truncate(item.oldText, MAX_DIFF_TEXT);
    if (typeof item.newText === "string" && item.newText.length > MAX_DIFF_TEXT) out.truncated = true;
    if (typeof item.oldText === "string" && item.oldText.length > MAX_DIFF_TEXT) out.truncated = true;
    return out;
  }
  if (item.type === "terminal") return { type: "terminal", terminalId: String(item.terminalId || "") };
  if (item.type === "session") return { type: "session", sessionId: String(item.sessionId || "") };
  return { type: String(item.type || "unknown") };
}

/** 第一个非空字符串（用于从多种 native 字段里尽力提取）。 */
function firstString(values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

/** 取 `<tag>...</tag>` 的内容；用于 Claude `<task-notification>` 这类文本协议。 */
function markerTagText(text, tag) {
  const s = String(text == null ? "" : text);
  const open = "<" + tag + ">";
  const close = "</" + tag + ">";
  const start = s.indexOf(open);
  if (start === -1) return undefined;
  const end = s.indexOf(close, start + open.length);
  if (end === -1) return undefined;
  return s.slice(start + open.length, end);
}

/**
 * Claude Code 的 task 通知：`<task-notification>` 里带 `<task-id>` / `<tool-use-id>` /
 * `<status>` / `<summary>` / `<output-file>`。与 adapter 自己的 taskNotificationsOf 同口径：
 * 只有同时有 task-id 和 status 才算完整通知（没有 status 的是「仍在运行」check-in）。
 */
export function parseTaskNotification(text) {
  const s = String(text == null ? "" : text);
  const open = "<task-notification>";
  const close = "</task-notification>";
  const start = s.indexOf(open);
  if (start === -1) return null;
  const end = s.indexOf(close, start + open.length);
  if (end === -1) return null;
  const body = s.slice(start + open.length, end).split("<result>", 1)[0];
  const field = function (tag) {
    const v = markerTagText(body, tag);
    return v == null ? "" : v.trim();
  };
  const taskId = field("task-id");
  const status = field("status");
  if (!taskId || !status) return null;
  return {
    taskId,
    toolUseId: field("tool-use-id"),
    status,
    summary: field("summary"),
    outputFile: field("output-file"),
    text: truncate(s, MAX_TOOL_TEXT)
  };
}

function isAgentToolName(value) {
  const s = String(value == null ? "" : value).trim();
  return /^(agent|task)$/i.test(s) || /^agent\s*[:\-]/i.test(s);
}

/** 从 Claude Agent/Task 工具调用里尽力提取 subagent 元数据。 */
function subagentFromToolCall(t, meta) {
  const claude = meta && asObject(meta.claudeCode) ? meta.claudeCode : {};
  const raw = asObject(t.rawInput) || {};
  const response = asObject(claude.toolResponse) || {};
  const toolName = firstString([claude.toolName, t.name, t.title]) || "";
  if (!isAgentToolName(toolName) && !isAgentToolName(t.name) && !isAgentToolName(t.title)) return null;

  const scanText = [raw.prompt, raw.description, t.rawOutput, claude.description]
    .filter(function (v) { return typeof v === "string"; })
    .join("\n");
  const agentId = firstString([
    raw.subagent_type,
    raw.agentId,
    raw.agent_id,
    raw.agent,
    response.agentId,
    response.agent_id,
    response.taskId,
    response.task_id,
    markerTagText(scanText, "task-id")
  ]);
  const description = firstString([raw.description, raw.prompt, claude.description, response.description]);
  const outputFile = firstString([
    raw.output_file,
    raw.outputFile,
    claude.outputFile,
    claude.output_file,
    response.outputFile,
    response.output_file,
    markerTagText(scanText, "output-file")
  ]);
  const background =
    raw.run_in_background === true ||
    raw.run_in_background === "true" ||
    raw.background === true ||
    claude.background === true ||
    claude.backgrounded === true;

  return {
    agentId: agentId == null ? null : String(agentId),
    description: description == null ? null : truncate(description, 2000),
    background: !!background,
    outputFile: outputFile == null ? null : String(outputFile),
    toolName: toolName || null
  };
}

/** 工具调用的公共结构（tool_call / tool_call_update / permission.toolCall 共用）。 */
export function mapToolCall(toolCall, sessionUpdate) {
  const t = asObject(toolCall) || {};
  const meta = asObject(t._meta);
  const out = { toolCallId: String(t.toolCallId || "") };
  if (sessionUpdate) out.sessionUpdate = String(sessionUpdate);
  if (meta) out.nativeMeta = summarizeRaw(meta);
  if (t.title != null) out.title = String(t.title);
  if (t.name != null) out.name = String(t.name);
  if (t.kind != null) out.kind = String(t.kind);
  if (t.status != null) out.status = String(t.status);
  if (Array.isArray(t.locations)) {
    out.locations = t.locations
      .map(function (l) { return l && l.path ? { path: String(l.path), line: l.line == null ? null : Number(l.line) } : null; })
      .filter(Boolean);
  }
  if (Array.isArray(t.content)) {
    out.content = t.content.map(mapToolContentItem);
    out.diffs = out.content.filter(function (c) { return c.type === "diff"; });
    out.terminals = out.content.filter(function (c) { return c.type === "terminal"; });
    const texts = out.content.filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; });
    if (texts.length) out.output = truncate(texts.join(""), MAX_TOOL_TEXT);
  }
  if (t.rawInput !== undefined) out.rawInput = summarizeRaw(t.rawInput);
  if (t.rawOutput !== undefined) {
    out.rawOutput = summarizeRaw(t.rawOutput);
    if (typeof t.rawOutput === "string") out.output = truncate(t.rawOutput, MAX_TOOL_TEXT);
    else if (t.rawOutput && typeof t.rawOutput === "object" && typeof t.rawOutput.output === "string") {
      out.output = truncate(t.rawOutput.output, MAX_TOOL_TEXT);
    }
  }
  // Claude 子 Agent：子调用的 _meta.claudeCode.parentToolUseId 指向父 Agent toolCallId。
  const claude = meta && asObject(meta.claudeCode) ? meta.claudeCode : null;
  const parentToolCallId = firstString([
    claude && claude.parentToolUseId,
    t.parentToolCallId,
    meta && meta.parentToolUseId
  ]);
  out.parentToolCallId = parentToolCallId == null ? null : String(parentToolCallId);
  const subagent = subagentFromToolCall(t, meta);
  if (subagent) out.subagent = subagent;
  return out;
}

function mapPlanEntry(entry) {
  const e = asObject(entry) || {};
  return {
    content: String(e.content || ""),
    priority: String(e.priority || "medium"),
    status: String(e.status || "pending")
  };
}

export function mapAvailableCommands(commands) {
  return (Array.isArray(commands) ? commands : []).map(function (c) {
    const x = asObject(c) || {};
    return {
      name: String(x.name || ""),
      description: String(x.description || ""),
      input: x.input && typeof x.input === "object" ? { hint: String(x.input.hint || "") } : null
    };
  });
}

/** 把 Codex / Claude 的 state 对象归一化（`state_update` 与 `subagent_update.state` 共用）。 */
function mapStateValue(state) {
  const s = asObject(state);
  if (!s) return state == null ? null : String(state);
  const out = { state: s.state == null ? null : String(s.state) };
  if (s.stopReason !== undefined) out.stopReason = s.stopReason == null ? null : String(s.stopReason);
  if (s.error !== undefined) {
    out.error = summarizeRaw(s.error);
    const e = asObject(s.error);
    if (e && e.message) out.errorMessage = String(e.message);
  }
  return out;
}

function contentBlocksOf(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function joinedText(blocks) {
  return truncate(
    blocks.filter(function (b) { return b && b.type === "text"; }).map(function (b) { return b.text; }).join(""),
    MAX_TEXT_CHUNK
  );
}

/** Codex terminal 输出是 base64；解码失败时保留原始字符串。 */
function decodeTerminalData(data) {
  if (typeof data !== "string") return "";
  try {
    return Buffer.from(data, "base64").toString("utf8");
  } catch (e) {
    return data;
  }
}

/**
 * session/update → 稳定事件（不含 agent/model 等会话级元数据，由 AcpSession 统一补齐）。
 * 保留 native（原始 sessionUpdate）与 nativeMeta（_meta 截断）。
 * context.sessionId 是外层 SessionNotification.sessionId，用于子会话 update（state/terminal 等）。
 */
export function mapSessionUpdate(update, context) {
  const u = asObject(update);
  if (!u) return null;
  const ev = mapSessionUpdateCore(u);
  if (!ev) return null;
  if (ev.native === undefined) ev.native = String(u.sessionUpdate || "unknown");
  if (ev.nativeMeta === undefined && u._meta !== undefined && u._meta !== null) {
    ev.nativeMeta = summarizeRaw(u._meta);
  }
  if (context && context.sessionId && (ev.sessionId === undefined || ev.sessionId === null || ev.sessionId === "")) {
    ev.sessionId = String(context.sessionId);
  }
  return ev;
}

function mapSessionUpdateCore(u) {
  switch (u.sessionUpdate) {
    case "agent_message_chunk": {
      const c = summarizeContentBlock(u.content) || {};
      if (c.type !== "text") return { type: "text", text: "", content: c, messageId: u.messageId || null };
      return { type: "text", text: c.text, messageId: u.messageId || null };
    }
    case "agent_thought_chunk": {
      const c = summarizeContentBlock(u.content) || {};
      return { type: "thought", text: c.type === "text" ? c.text : "", content: c, messageId: u.messageId || null };
    }
    case "user_message_chunk": {
      const c = summarizeContentBlock(u.content) || {};
      const text = c.type === "text" ? c.text : "";
      const task = parseTaskNotification(text);
      if (task) {
        return {
          type: "subagent_update",
          taskId: task.taskId,
          toolUseId: task.toolUseId || null,
          agentId: task.taskId,
          parentToolCallId: task.toolUseId || null,
          status: task.status,
          summary: task.summary,
          outputFile: task.outputFile || null,
          description: task.summary || null,
          text: task.text,
          native: "user_message_chunk"
        };
      }
      return { type: "user_message", text, content: c, messageId: u.messageId || null };
    }
    case "agent_message": {
      const content = contentBlocksOf(u.content).map(summarizeContentBlock).filter(Boolean);
      return { type: "text", text: joinedText(content), content, messageId: u.messageId || null, full: true };
    }
    case "agent_thought": {
      const content = contentBlocksOf(u.content).map(summarizeContentBlock).filter(Boolean);
      return { type: "thought", text: joinedText(content), content, messageId: u.messageId || null, full: true };
    }
    case "tool_call":
      return Object.assign({ type: "tool_call" }, mapToolCall(u, "tool_call"));
    case "tool_call_update":
      return Object.assign({ type: "tool_call_update" }, mapToolCall(u, "tool_call_update"));
    case "plan":
      return { type: "plan", entries: (Array.isArray(u.entries) ? u.entries : []).map(mapPlanEntry) };
    case "plan_update": {
      const plan = asObject(u.plan) || {};
      const out = { type: "plan", planId: String(plan.planId || ""), planType: String(plan.type || "items") };
      if (Array.isArray(plan.entries)) out.entries = plan.entries.map(mapPlanEntry);
      if (typeof plan.content === "string") out.content = truncate(plan.content, MAX_TOOL_TEXT);
      if (plan.path) out.path = String(plan.path);
      return out;
    }
    case "plan_removed":
      return { type: "plan_removed", planId: String(u.planId || "") };
    case "available_commands_update":
      return { type: "commands", commands: mapAvailableCommands(u.availableCommands) };
    case "current_mode_update":
      return { type: "mode", currentModeId: String(u.currentModeId || "") };
    case "config_option_update":
      return { type: "config", configOptions: Array.isArray(u.configOptions) ? u.configOptions : [] };
    case "session_info_update": {
      const meta = asObject(u._meta);
      const codex = meta && asObject(meta.codex) ? meta.codex : null;
      const out = { type: "session_info" };
      if (u.title !== undefined) out.title = u.title == null ? null : String(u.title);
      if (u.updatedAt !== undefined) out.updatedAt = u.updatedAt == null ? null : String(u.updatedAt);
      if (meta) out.meta = meta;
      if (codex && asObject(codex.threadStatus)) out.threadStatus = String(codex.threadStatus.type || "");
      // Codex 把「模型网络重连 / turn 失败」放在 session_info_update._meta.codex.error 里，
      // 不映射的话 UI 只会看到一串 session_info，误以为 agent 卡死。
      if (codex && asObject(codex.error)) {
        const e = codex.error;
        return {
          type: "error",
          code: "agent_error",
          message: String(e.message || "agent error"),
          retryable: !!e.willRetry,
          details: summarizeRaw(e, MAX_RAW_JSON),
          sessionUpdate: "session_info_update",
          meta
        };
      }
      return out;
    }
    case "usage_update":
      return {
        type: "usage",
        used: Number(u.used || 0),
        size: Number(u.size || 0),
        cost: u.cost && typeof u.cost === "object" ? { amount: Number(u.cost.amount || 0), currency: String(u.cost.currency || "") } : null
      };
    case "notice":
      return {
        type: "notice",
        severity: String(u.severity || "info"),
        title: String(u.title || ""),
        description: u.description == null ? "" : String(u.description)
      };
    case "compaction_update":
      return {
        type: "compaction",
        compactionId: String(u.compactionId || ""),
        status: String(u.status || ""),
        summary: Array.isArray(u.summary) ? u.summary.map(summarizeContentBlock).filter(Boolean) : null,
        error: u.error == null ? "" : String(u.error)
      };
    case "compaction_summary_chunk":
      return { type: "compaction_chunk", compactionId: String(u.compactionId || ""), content: summarizeContentBlock(u.content) };
    case "subagent":
    case "subagent_update": {
      const meta = asObject(u._meta);
      const claude = meta && asObject(meta.claudeCode) ? meta.claudeCode : null;
      const parentToolCallId = firstString([
        claude && claude.parentToolUseId,
        u.parentToolCallId,
        meta && meta.parentToolUseId
      ]);
      const out = {
        type: u.sessionUpdate,
        sessionId: u.sessionId == null ? null : String(u.sessionId),
        title: u.title == null ? null : String(u.title),
        description: u.description == null ? null : String(u.description),
        state: mapStateValue(u.state),
        capabilities: summarizeRaw(u.capabilities),
        cwd: u.cwd == null ? null : String(u.cwd),
        parentToolCallId: parentToolCallId == null ? null : String(parentToolCallId)
      };
      if (Array.isArray(u.additionalDirectories)) out.additionalDirectories = u.additionalDirectories.map(String);
      if (meta) out.nativeMeta = summarizeRaw(meta);
      return out;
    }
    case "state_update": {
      const out = Object.assign({ type: "state" }, mapStateValue(u));
      return out;
    }
    case "terminal_update": {
      const output = asObject(u.output);
      const data = output && typeof output.data === "string" ? output.data : null;
      const exitStatus = asObject(u.exitStatus);
      const size = asObject(u.size);
      return {
        type: "terminal",
        terminalId: String(u.terminalId || ""),
        command: u.command == null ? null : String(u.command),
        cwd: u.cwd == null ? null : String(u.cwd),
        output: decodeTerminalData(data),
        outputBase64: data,
        exitStatus: exitStatus ? { exitCode: exitStatus.exitCode == null ? null : Number(exitStatus.exitCode), signal: exitStatus.signal == null ? null : String(exitStatus.signal) } : null,
        size: size ? { cols: Number(size.cols || 0), rows: Number(size.rows || 0) } : null,
        chunk: false
      };
    }
    case "terminal_output_chunk":
      return {
        type: "terminal",
        terminalId: String(u.terminalId || ""),
        output: decodeTerminalData(u.data),
        outputBase64: typeof u.data === "string" ? u.data : null,
        exitStatus: null,
        chunk: true
      };
    case "session_message":
    case "session_message_chunk": {
      const content = contentBlocksOf(u.content).map(summarizeContentBlock).filter(Boolean);
      return {
        type: "session_message",
        messageId: u.messageId == null ? null : String(u.messageId),
        senderSessionId: u.senderSessionId == null ? null : String(u.senderSessionId),
        recipientSessionId: u.recipientSessionId == null ? null : String(u.recipientSessionId),
        senderMessageId: u.senderMessageId == null ? null : String(u.senderMessageId),
        recipientMessageId: u.recipientMessageId == null ? null : String(u.recipientMessageId),
        sender: u.senderSessionId == null ? null : String(u.senderSessionId),
        recipient: u.recipientSessionId == null ? null : String(u.recipientSessionId),
        content,
        text: joinedText(content),
        chunk: u.sessionUpdate === "session_message_chunk"
      };
    }
    case "prompt_suggestions_update": {
      const suggestions = (Array.isArray(u.suggestions) ? u.suggestions : []).map(function (s) {
        const x = asObject(s) || {};
        const content = contentBlocksOf(x.prompt).map(summarizeContentBlock).filter(Boolean);
        return { text: joinedText(content), content };
      });
      return { type: "suggestions", suggestions };
    }
    default:
      return { type: "update", sessionUpdate: String(u.sessionUpdate || "unknown"), update: summarizeRaw(u, MAX_TOOL_TEXT) };
  }
}

/** 权限请求 → permission 事件。requestId 统一转字符串，便于 JSON 往返。 */
export function mapPermissionRequest(params, requestId) {
  const p = asObject(params) || {};
  const options = (Array.isArray(p.options) ? p.options : []).map(function (o) {
    const x = asObject(o) || {};
    return {
      optionId: String(x.optionId || ""),
      name: String(x.name || ""),
      kind: String(x.kind || "")
    };
  });
  const out = {
    type: "permission",
    requestId: requestId == null ? "" : String(requestId),
    tool: mapToolCall(p.toolCall),
    options,
    native: "session/request_permission"
  };
  if (p._meta !== undefined && p._meta !== null) out.nativeMeta = summarizeRaw(p._meta);
  return out;
}

/** bypass 模式下自动选：优先 allow_always，其次 allow_once，再退回第一个 option。 */
export function pickAutoPermissionOption(options) {
  const list = Array.isArray(options) ? options : [];
  return (
    list.find(function (o) { return o && o.kind === "allow_always"; }) ||
    list.find(function (o) { return o && o.kind === "allow_once"; }) ||
    list[0] ||
    null
  );
}

function selectedOutcome(optionId) {
  return { outcome: { outcome: "selected", optionId: String(optionId) } };
}
function cancelledOutcome() {
  return { outcome: { outcome: "cancelled" } };
}

/**
 * 权限闸门：request() 挂起，respond()/cancel() 放行。
 * 纯内存、无 ACP 依赖，单独测试挂起/应答语义。
 */
export class PermissionBroker {
  constructor(opts) {
    const o = opts || {};
    this.pending = new Map();
    this.seq = 0;
    this.timeoutMs = Number(o.timeoutMs) > 0 ? Number(o.timeoutMs) : 0;
    this.autoAllow = !!o.autoAllow;
    this.logger = o.logger || null;
  }

  /** 返回 { id, promise }。requestId 由 JSON-RPC 提供时原样字符串化。 */
  enqueue(params, requestId) {
    const id = requestId == null || requestId === "" ? "perm" + ++this.seq : String(requestId);
    const options = (Array.isArray(params && params.options) ? params.options : []).map(function (o) {
      return { optionId: String((o && o.optionId) || ""), name: String((o && o.name) || ""), kind: String((o && o.kind) || "") };
    });

    if (this.autoAllow) {
      const pick = pickAutoPermissionOption(options);
      return { id, auto: true, promise: Promise.resolve(pick ? selectedOutcome(pick.optionId) : cancelledOutcome()) };
    }

    let resolve;
    const promise = new Promise(function (r) { resolve = r; });
    const entry = { id, requestId: requestId == null ? null : requestId, params, options, promise, resolve, createdAt: Date.now(), timer: null };
    if (this.timeoutMs > 0) {
      entry.timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        resolve(cancelledOutcome());
      }, this.timeoutMs);
      if (entry.timer.unref) entry.timer.unref();
    }
    this.pending.set(id, entry);
    return { id, auto: false, promise };
  }

  get(id) {
    return this.pending.get(String(id)) || null;
  }

  list() {
    return Array.from(this.pending.values()).map(function (p) {
      return {
        requestId: p.id,
        sessionId: p.params && p.params.sessionId ? String(p.params.sessionId) : "",
        tool: mapToolCall(p.params && p.params.toolCall),
        options: p.options,
        createdAt: p.createdAt
      };
    });
  }

  /** 返回 false 表示 requestId 不存在或 optionId 不在可选列表里。 */
  respond(id, optionId) {
    const key = String(id);
    const entry = this.pending.get(key);
    if (!entry) return false;
    if (optionId == null || optionId === "") return false;
    const hit = entry.options.find(function (o) { return o.optionId === String(optionId); });
    if (!hit) return false;
    this.pending.delete(key);
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve(selectedOutcome(hit.optionId));
    return true;
  }

  cancel(id) {
    const key = String(id);
    const entry = this.pending.get(key);
    if (!entry) return false;
    this.pending.delete(key);
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve(cancelledOutcome());
    return true;
  }

  cancelAll() {
    const n = this.pending.size;
    for (const [key, entry] of this.pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.resolve(cancelledOutcome());
      this.pending.delete(key);
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// 会话配置（models / modes / reasoning effort / configOptions）
// ---------------------------------------------------------------------------

function flattenSelectOptions(options) {
  const out = [];
  for (const item of Array.isArray(options) ? options : []) {
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item.options)) {
      const group = String(item.name || item.group || "");
      for (const o of item.options) {
        if (!o || typeof o !== "object" || o.value === undefined) continue;
        out.push({ value: String(o.value), name: String(o.name || o.value), description: String(o.description || ""), group });
      }
    } else if (item.value !== undefined) {
      out.push({ value: String(item.value), name: String(item.name || item.value), description: String(item.description || ""), group: "" });
    }
  }
  return out;
}

function findConfigOption(configOptions, category, ids) {
  const list = Array.isArray(configOptions) ? configOptions : [];
  const byCategory = category ? list.find(function (o) { return o && o.category === category; }) : null;
  if (byCategory) return byCategory;
  return list.find(function (o) { return o && ids.indexOf(String(o.id || "")) >= 0; }) || null;
}

function describeSelectOption(option) {
  if (!option) return null;
  const out = {
    configId: String(option.id || ""),
    name: String(option.name || ""),
    category: option.category == null ? null : String(option.category),
    type: String(option.type || "select"),
    currentValue: option.currentValue,
    options: flattenSelectOptions(option.options)
  };
  if (option.description != null) out.description = String(option.description);
  return out;
}

const MODEL_IDS = ["model", "models", "model_id"];
const REASONING_IDS = ["effort", "reasoning_effort", "reasoning", "thinking", "thought_level", "thoughtLevel"];

/** session/new / session/resume/load 的响应 → 归一化配置快照（Host 与 UI 都以它为准）。 */
export function normalizeSessionConfig(sessionResponse) {
  const r = asObject(sessionResponse) || {};
  const configOptions = Array.isArray(r.configOptions) ? r.configOptions : [];
  const modes = asObject(r.modes);

  const modelOption = findConfigOption(configOptions, "model", MODEL_IDS);
  const reasoningOption = findConfigOption(configOptions, "thought_level", REASONING_IDS);

  let models = describeSelectOption(modelOption);
  if (!models && asObject(r.models)) {
    const m = r.models;
    models = {
      configId: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: m.currentModelId || m.currentModel || m.currentValue || null,
      options: (Array.isArray(m.availableModels) ? m.availableModels : []).map(function (x) {
        if (typeof x === "string") return { value: x, name: x, description: "", group: "" };
        return { value: String(x && x.id ? x.id : x && x.value ? x.value : ""), name: String((x && (x.name || x.displayName)) || x), description: "", group: "" };
      })
    };
  }

  let normalizedModes = null;
  if (modes) {
    normalizedModes = {
      currentModeId: String(modes.currentModeId || ""),
      availableModes: (Array.isArray(modes.availableModes) ? modes.availableModes : []).map(function (m) {
        const x = asObject(m) || {};
        return { id: String(x.id || ""), name: String(x.name || x.id || ""), description: x.description == null ? "" : String(x.description) };
      })
    };
  }

  return {
    sessionId: String(r.sessionId || ""),
    modes: normalizedModes,
    models,
    reasoning: describeSelectOption(reasoningOption),
    configOptions,
    model: models ? models.currentValue : null,
    mode: normalizedModes ? normalizedModes.currentModeId : null,
    reasoningEffort: reasoningOption ? reasoningOption.currentValue : null,
    meta: r._meta || null
  };
}

/** config_option_update / set_config_option 响应 → 新的配置快照（保留 modes 的可用列表）。 */
export function mergeConfigOptions(previous, configOptions, sessionId) {
  const prev = asObject(previous) || {};
  const next = normalizeSessionConfig({
    sessionId: sessionId || prev.sessionId || "",
    modes: prev.modes ? { currentModeId: prev.modes.currentModeId, availableModes: prev.modes.availableModes } : null,
    configOptions: Array.isArray(configOptions) ? configOptions : prev.configOptions || []
  });
  if (!next.modes && prev.modes) next.modes = prev.modes;
  return next;
}

// ---------------------------------------------------------------------------
// ACP wrapper（SSH）
// ---------------------------------------------------------------------------

function posixQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/** 远端 python3 引导脚本：
 *
 *  1) 解 base64 JSON（agentPath / args / remotePath）；
 *  2) cd 到远端工作目录；
 *  3) 经 `bash -ic 'exec ...'` 启动 agent（保证 ~/.bashrc 里的 key/proxy 生效）；
 *  4) 关键点：bash 自己的启动输出走 stderr，agent 的 stdout 在 exec 前恢复到原 fd ——
 *     否则 HPC 登录脚本里的一句 echo 就能污染 ACP 的 NDJSON 管道。
 */
const REMOTE_PYTHON = [
  "import base64,json,os,sys",
  "try:",
  "    spec=json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))",
  "except Exception as exc:",
  "    sys.stderr.write('[dsh-acp] bad wrapper payload: %s\\n' % exc); sys.exit(2)",
  "cwd=os.path.expanduser(spec.get('remotePath') or '~')",
  "try:",
  "    os.chdir(cwd)",
  "except Exception as exc:",
  "    sys.stderr.write('[dsh-acp] cannot cd to %s: %s\\n' % (cwd, exc)); sys.exit(2)",
  "args=[str(a) for a in (spec.get('args') or [])]",
  "agent=os.path.expanduser(spec.get('agentPath') or 'claude')",
  "argv=[agent]+args",
  "try:",
  "    import shlex,subprocess",
  "    orig=os.dup(1)",
  "    os.set_inheritable(orig, True)",
  "    cmd='exec 1>&%d %d>&-; exec ' % (orig, orig) + shlex.join(argv)",
  "    proc=subprocess.Popen(['/bin/bash','-ic',cmd], stdout=2, pass_fds=(orig,))",
  "    sys.exit(proc.wait())",
  "except FileNotFoundError:",
  "    os.execvp(argv[0], argv)"
].join("\n");

/** 生成 wrapper 文本（纯函数，便于测试）。profile 里不允许出现 password。 */
export function renderWrapper(opts) {
  const o = opts || {};
  const agent = String(o.agent || "claude");
  const def = ACP_AGENTS[agent];
  if (!def) throw new AcpError("不支持的 ACP agent: " + agent, "unsupported_agent");
  const profile = asObject(o.profile) || {};
  const authMethod = String(profile.authMethod || (profile.keyPath ? "key" : "kerberos"));
  if (authMethod === "password") {
    throw new AcpError("ACP 不支持密码认证：请改用私钥或 Kerberos (GSSAPI)", "password_unsupported");
  }
  if (!profile.host || !profile.user) throw new AcpError("missing host/user for ACP wrapper", "bad_profile");
  const config = {
    agent,
    host: String(profile.host),
    user: String(profile.user),
    port: Number(profile.port || 22),
    authMethod: authMethod === "kerberos" ? "kerberos" : "key",
    keyPath: String(profile.keyPath || ""),
    proxyJump: String(profile.proxyJump || ""),
    remotePath: String(o.remotePath || "~"),
    agentPath: String(o.agentPath || def.cmd)
  };
  const literal = JSON.stringify(config, null, 2).replace(/\n/g, "\n");
  return [
    "#!/usr/bin/env node",
    "// Auto-generated by @wujiaming88/dsh-remote-ssh (ACP host runtime).",
    "// Reads .remote-ssh.json in cwd and DSH_ACP_* env overrides; never stores secrets.",
    "import { spawn } from 'node:child_process';",
    "import { existsSync, readFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "const CONFIG = " + literal + ";",
    "function marker() {",
    "  try {",
    "    const p = join(process.cwd(), '.remote-ssh.json');",
    "    if (!existsSync(p)) return null;",
    "    const j = JSON.parse(readFileSync(p, 'utf8'));",
    "    return j && j.host && j.user ? j : null;",
    "  } catch (e) { return null; }",
    "}",
    "function env(name, fallback) {",
    "  const v = process.env[name];",
    "  return typeof v === 'string' && v !== '' ? v : fallback;",
    "}",
    "const cfg = Object.assign({}, CONFIG);",
    "const m = marker();",
    "if (m) {",
    "  if (m.authMethod) cfg.authMethod = m.authMethod;",
    "  if (m.keyPath !== undefined) cfg.keyPath = m.keyPath;",
    "  if (m.proxyJump !== undefined) cfg.proxyJump = m.proxyJump;",
    "  if (m.remotePath) cfg.remotePath = m.remotePath;",
    "  if (m.host) cfg.host = m.host;",
    "  if (m.user) cfg.user = m.user;",
    "  if (m.port) cfg.port = m.port;",
    "}",
    "cfg.host = env('DSH_ACP_HOST', cfg.host);",
    "cfg.user = env('DSH_ACP_USER', cfg.user);",
    "cfg.port = Number(env('DSH_ACP_PORT', cfg.port));",
    "cfg.keyPath = env('DSH_ACP_KEY_PATH', cfg.keyPath);",
    "cfg.authMethod = env('DSH_ACP_AUTH_METHOD', cfg.authMethod);",
    "cfg.proxyJump = env('DSH_ACP_PROXY_JUMP', cfg.proxyJump);",
    "cfg.remotePath = env('DSH_ACP_REMOTE_PATH', cfg.remotePath);",
    "cfg.agentPath = env('DSH_ACP_AGENT_PATH', cfg.agentPath);",
    "const authMethod = String(cfg.authMethod || (cfg.keyPath ? 'key' : 'kerberos'));",
    "if (authMethod === 'password') {",
    "  console.error('[dsh-acp] password auth is not supported; use key or kerberos');",
    "  process.exit(2);",
    "}",
    "if (!cfg.host || !cfg.user) {",
    "  console.error('[dsh-acp] missing host/user (write .remote-ssh.json or set DSH_ACP_HOST/DSH_ACP_USER)');",
    "  process.exit(2);",
    "}",
    "const payload = Buffer.from(JSON.stringify({",
    "  agentPath: cfg.agentPath || " + JSON.stringify(def.cmd) + ",",
    "  args: process.argv.slice(2),",
    "  remotePath: cfg.remotePath || '~'",
    "})).toString('base64');",
    "function sq(s) { return \"'\" + String(s).replace(/'/g, \"'\\\\''\") + \"'\"; }",
    "const remoteCmd = 'python3 -c ' + sq(" + JSON.stringify(REMOTE_PYTHON) + ") + ' ' + sq(payload);",
    "const sshArgs = ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3'];",
    "if (cfg.proxyJump) sshArgs.push('-J', String(cfg.proxyJump));",
    "sshArgs.push('-p', String(cfg.port || 22));",
    "if (authMethod === 'kerberos') {",
    "  sshArgs.push('-o', 'GSSAPIAuthentication=yes', '-o', 'PreferredAuthentications=gssapi-with-mic');",
    "} else if (cfg.keyPath) {",
    "  sshArgs.push('-i', String(cfg.keyPath));",
    "}",
    "sshArgs.push(String(cfg.user) + '@' + String(cfg.host), remoteCmd);",
    "const child = spawn('ssh', sshArgs, { stdio: 'inherit', env: process.env });",
    "child.on('error', function (err) { console.error('[dsh-acp] ssh spawn failed: ' + String(err && err.message ? err.message : err)); process.exit(127); });",
    "child.on('exit', function (code, signal) { process.exit(code == null ? (signal ? 1 : 0) : code); });"
  ].join("\n") + "\n";
}

export function wrapperFileName(agent) {
  const def = ACP_AGENTS[agent];
  if (!def) throw new AcpError("不支持的 ACP agent: " + agent, "unsupported_agent");
  return def.wrapperName;
}

/**
 * 生成/复用 wrapper。内容相同不重写（只读一次），不同则原子替换并 chmod 755。
 * 返回 { path, created, content }。
 */
export async function ensureWrapper(opts) {
  const o = opts || {};
  const agent = String(o.agent || "");
  const def = ACP_AGENTS[agent];
  if (!def) throw new AcpError("不支持的 ACP agent: " + agent, "unsupported_agent");
  const dir = o.wrapperDir || join(o.homeDir || homedir(), ".dsh", "remote-ssh", "acp");
  const file = join(dir, def.wrapperName);
  const content = renderWrapper(o);
  await mkdir(dir, { recursive: true });
  let existing = null;
  try { existing = await readFile(file, "utf8"); } catch (e) { existing = null; }
  if (existing === content) return { path: file, created: false, content };
  const tmp = file + ".tmp-" + process.pid + "-" + Date.now().toString(36);
  await writeFile(tmp, content, { encoding: "utf8", mode: 0o755 });
  await rename(tmp, file);
  try { await chmod(file, 0o755); } catch (e) { /* Windows 无 POSIX 权限，忽略 */ }
  return { path: file, created: true, content };
}

function readMarkerSync(dir) {
  if (!dir) return null;
  try {
    const p = join(dir, ".remote-ssh.json");
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8"));
    return j && j.host && j.user ? j : null;
  } catch (e) {
    return null;
  }
}

function resolveAdapterEntry(agent, opts) {
  const o = opts || {};
  if (o.adapterEntry) return o.adapterEntry;
  const def = ACP_AGENTS[agent];
  if (!def) throw new AcpError("不支持的 ACP agent: " + agent, "unsupported_agent");
  const requireBase = o.requireBase || import.meta.url;
  const req = createRequire(requireBase);
  const short = def.adapterPackage.split("/")[1];
  const candidates = [];
  if (o.adapterRoot) candidates.push(join(o.adapterRoot, "@agentclientprotocol", short, def.adapterEntry));
  try {
    const pjPath = req.resolve(def.adapterPackage + "/package.json");
    candidates.push(join(dirname(pjPath), def.adapterEntry));
    try {
      const pj = JSON.parse(readFileSync(pjPath, "utf8"));
      const bin = typeof pj.bin === "string" ? pj.bin : pj.bin && pj.bin[Object.keys(pj.bin)[0]];
      if (bin) candidates.push(join(dirname(pjPath), bin));
    } catch (e) { /* 读取 package.json 失败时用候选路径兜底 */ }
  } catch (e) { /* 继续尝试直接 resolve */ }
  try { candidates.push(req.resolve(def.adapterPackage)); } catch (e) {}
  candidates.push(join(process.cwd(), "node_modules", "@agentclientprotocol", short, def.adapterEntry));
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  throw new AcpError(
    "找不到 ACP adapter " + def.adapterPackage + "（请安装插件依赖；安装后应存在 " + def.adapterEntry + "）",
    "adapter_missing"
  );
}

async function loadSdk(opts) {
  const o = opts || {};
  if (o.sdk) return o.sdk;
  if (o.sdkPath) return await import(pathToFileURL(o.sdkPath).href);
  try {
    return await import("@agentclientprotocol/sdk");
  } catch (e) {
    try {
      const req = createRequire(o.requireBase || import.meta.url);
      const pjPath = req.resolve("@agentclientprotocol/sdk/package.json");
      const pj = JSON.parse(readFileSync(pjPath, "utf8"));
      const main = pj.main || "dist/v1/stable/acp.js";
      return await import(pathToFileURL(join(dirname(pjPath), main)).href);
    } catch (e2) {
      throw new AcpError(
        "缺少 @agentclientprotocol/sdk（请安装插件依赖）。原始错误: " + String(e && e.message ? e.message : e),
        "sdk_missing"
      );
    }
  }
}

function normalizeCapabilities(init) {
  const i = asObject(init) || {};
  const meta = asObject(i._meta) || {};
  const steeringMeta = asObject(meta.steering) || {};
  return {
    protocolVersion: i.protocolVersion == null ? null : i.protocolVersion,
    agentCapabilities: asObject(i.agentCapabilities) || {},
    authMethods: Array.isArray(i.authMethods) ? i.authMethods : [],
    steering: { supported: !!steeringMeta.supported, protocol: steeringMeta.supported ? "_session/steering" : null },
    meta
  };
}

function withTimeout(promise, ms, label, onTimeout) {
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

function deferred() {
  let resolve, reject;
  const promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * 建立一条 ACP 连接。
 *
 * 返回 controller（在 adapter 启动后立即返回，连接生命周期在后台跑）：
 *   ready / prompt / steer / cancel / close / setConfig / setMode
 *
 * 可注入 `opts.connectImpl` 供纯单元测试替换（不启动子进程 / 不加载 SDK）。
 */
async function connectAcp(opts) {
  if (opts.connectImpl) return await opts.connectImpl(opts);

  const sdk = await loadSdk(opts);
  const adapter = opts.spawn(opts.nodePath || process.execPath, [opts.adapterEntry], {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  const ready = deferred();
  const closeGate = deferred();
  const turns = [];
  const allTurns = [];
  let active = null;
  let context = null;
  let closing = false;
  let initialized = null;
  let stderrTail = "";

  function failAll(err) {
    while (turns.length) {
      const t = turns.shift();
      if (!t.settled) {
        t.settled = true;
        t.reject(err);
      }
    }
  }

  adapter.stderr.setEncoding("utf8");
  adapter.stderr.on("data", function (chunk) {
    stderrTail = (stderrTail + String(chunk)).slice(-8192);
    try { if (opts.onStderr) opts.onStderr(String(chunk)); } catch (e) {}
  });
  adapter.on("error", function (err) {
    const e = new AcpError("ACP adapter 启动失败: " + String(err && err.message ? err.message : err) + (stderrTail ? " | stderr: " + stderrTail.slice(-1200) : ""), "adapter_spawn");
    ready.reject(e);
    failAll(e);
    try { opts.onFatal && opts.onFatal(e); } catch (e2) {}
  });
  adapter.on("exit", function (code, signal) {
    if (closing) return;
    const e = new AcpError(
      "ACP adapter 退出（code=" + code + ", signal=" + signal + "）" + (stderrTail ? " | stderr: " + stderrTail.slice(-1600) : ""),
      "adapter_exit"
    );
    ready.reject(e);
    failAll(e);
    try { opts.onFatal && opts.onFatal(e); } catch (e2) {}
  });

  const app = sdk.client({ name: "dsh-remote-ssh" })
    .onRequest("session/request_permission", async function (ctx) {
      const params = ctx && ctx.params !== undefined ? ctx.params : ctx;
      const requestId = ctx && ctx.requestId !== undefined ? ctx.requestId : undefined;
      if (!opts.onPermission) return cancelledOutcome();
      return await opts.onPermission(params, requestId);
    })
    .onRequest("*", async function (ctx) {
      const method = ctx && ctx.method ? ctx.method : "unknown";
      try { opts.onClientRequest && opts.onClientRequest(method, ctx && ctx.params); } catch (e) {}
      throw new AcpError("unsupported ACP client request: " + method, "unsupported_client_request");
    });

  // 可选协议日志（DSH_ACP_DEBUG=1）：排查 adapter 卡住/未知 client 请求时使用。
  const debug = !!(opts.debug || process.env.DSH_ACP_DEBUG === "1");
  const stdinTee = new PassThrough();
  const stdoutTee = new PassThrough();
  stdinTee.pipe(adapter.stdin);
  adapter.stdout.pipe(stdoutTee);
  if (debug) {
    stdinTee.on("data", function (chunk) {
      for (const line of String(chunk).split("\n")) if (line.trim()) process.stderr.write("[acp>>] " + line + "\n");
    });
    stdoutTee.on("data", function (chunk) {
      for (const line of String(chunk).split("\n")) if (line.trim()) process.stderr.write("[acp<<] " + line + "\n");
    });
  }
  const stream = sdk.ndJsonStream(Writable.toWeb(stdinTee), Readable.toWeb(stdoutTee));

  function startPump() {
    (async function pump() {
      for (;;) {
        let message;
        try {
          message = await active.nextUpdate();
        } catch (err) {
          if (!closing) {
            const e = err instanceof Error ? err : new AcpError(String(err), "update_stream");
            failAll(e);
            try { opts.onFatal && opts.onFatal(e); } catch (e2) {}
          }
          return;
        }
        if (message.kind === "stop") {
          const turn = turns.shift();
          if (turn && !turn.settled) {
            turn.settled = true;
            turn.resolve({ stopReason: message.stopReason, response: message.response });
          }
        } else {
          try { opts.onUpdate && opts.onUpdate(message.update, message.notification); } catch (e) {}
        }
      }
    })();
  }

  const run = app.connectWith(stream, async function (ctx) {
    context = ctx;
    initialized = await ctx.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: opts.clientCapabilities || ACP_CLIENT_CAPABILITIES
    });

    let sessionResponse;
    if (opts.resumeSessionId) {
      const resumeParams = { sessionId: String(opts.resumeSessionId), cwd: opts.cwd, mcpServers: [] };
      try {
        sessionResponse = await ctx.request("session/resume", resumeParams);
      } catch (e1) {
        try {
          sessionResponse = await ctx.request("session/load", resumeParams);
        } catch (e2) {
          throw new AcpError(
            "无法 resume ACP 会话 " + opts.resumeSessionId + "（session/resume 与 session/load 均失败）: " +
              String(e1 && e1.message ? e1.message : e1) + " / " + String(e2 && e2.message ? e2.message : e2),
            "resume_failed"
          );
        }
      }
      if (typeof ctx.attachSession !== "function") {
        throw new AcpError("ACP SDK 不支持 attachSession，无法恢复会话", "resume_unsupported");
      }
      active = ctx.attachSession(sessionResponse);
    } else {
      active = await ctx.buildSession({ cwd: opts.cwd, mcpServers: [] }).start();
      sessionResponse = active.newSessionResponse;
    }

    const capabilities = normalizeCapabilities(initialized);
    ready.resolve({ sessionId: active.sessionId, sessionResponse, initialize: initialized, capabilities });
    startPump();
    await closeGate.promise;
    try { active.dispose(); } catch (e) {}
  });

  run.catch(function (err) {
    ready.reject(err);
    failAll(err);
    if (!closing) {
      try { opts.onFatal && opts.onFatal(err); } catch (e) {}
    }
  });

  const controller = {
    adapter,
    ready: ready.promise,
    get initialize() { return initialized; },
    async prompt(text) {
      if (closing) throw new AcpError("ACP 会话已关闭", "closed");
      const turn = deferred();
      turns.push(turn);
      const response = active.prompt(text);
      response.then(function (res) {
        // pump 通常已用 stop 结算；这里兜底（例如 stop 被 SDK 吞掉）。
        if (!turn.settled) {
          turn.settled = true;
          turn.resolve({ stopReason: res && res.stopReason, response: res });
        }
      }, function (err) {
        if (!turn.settled) {
          turn.settled = true;
          turn.reject(err);
        }
        const i = turns.indexOf(turn);
        if (i >= 0) turns.splice(i, 1);
      });
      return await turn.promise;
    },
    async steer(text) {
      if (closing) throw new AcpError("ACP 会话已关闭", "closed");
      if (!context || !active) throw new AcpError("ACP 会话尚未就绪", "not_ready");
      return await context.request("_session/steering", {
        sessionId: active.sessionId,
        prompt: [{ type: "text", text: String(text) }],
        _meta: { steering: { idleBehavior: "promptRequired" } }
      });
    },
    async cancel() {
      if (!context || !active) return false;
      await context.notify("session/cancel", { sessionId: active.sessionId });
      return true;
    },
    async setConfig(configId, value) {
      if (!context || !active) throw new AcpError("ACP 会话尚未就绪", "not_ready");
      return await context.request("session/set_config_option", {
        sessionId: active.sessionId,
        configId: String(configId),
        value
      });
    },
    async setMode(modeId) {
      if (!context || !active) throw new AcpError("ACP 会话尚未就绪", "not_ready");
      return await context.request("session/set_mode", { sessionId: active.sessionId, modeId: String(modeId) });
    },
    async close() {
      if (closing) return;
      closing = true;
      if (context && active) {
        try {
          await withTimeout(
            context.request("session/close", { sessionId: active.sessionId }),
            DEFAULT_CLOSE_TIMEOUT_MS,
            "session/close"
          );
        } catch (e) { /* adapter 未实现 close 时忽略 */ }
      }
      try { active && active.dispose(); } catch (e) {}
      closeGate.resolve();
      try { adapter.stdin.end(); } catch (e) {}
      try { await withTimeout(run, DEFAULT_CLOSE_TIMEOUT_MS, "adapter close"); } catch (e) {}
      try { adapter.kill("SIGTERM"); } catch (e) {}
      const killTimer = setTimeout(function () { try { adapter.kill("SIGKILL"); } catch (e) {} }, 2000);
      if (killTimer.unref) killTimer.unref();
    }
  };
  return controller;
}

// ---------------------------------------------------------------------------
// 持久化（session id / 会话元数据）
// ---------------------------------------------------------------------------

function defaultStorePath() {
  return process.env.DSH_REMOTE_SSH_ACP_STORE || join(homedir(), ".dsh", "remote-ssh", "acp", "sessions.json");
}

export class AcpStore {
  constructor(opts) {
    const o = opts || {};
    this.path = o.storePath || defaultStorePath();
    this.records = null;
  }

  read() {
    if (this.records) return this.records;
    this.records = { version: 1, sessions: [] };
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      if (raw && Array.isArray(raw.sessions)) this.records = { version: raw.version || 1, sessions: raw.sessions.filter(function (s) { return s && s.id; }) };
    } catch (e) { /* 首次使用 / 文件损坏时从空开始 */ }
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
    if (!record || !record.id) return null;
    const data = this.read();
    const key = String(record.id);
    const idx = data.sessions.findIndex(function (s) { return String(s.id) === key; });
    if (idx >= 0) data.sessions[idx] = Object.assign({}, data.sessions[idx], record);
    else data.sessions.push(record);
    this.save();
    return this.get(key);
  }

  remove(id) {
    const data = this.read();
    const key = String(id || "");
    const before = data.sessions.length;
    data.sessions = data.sessions.filter(function (s) { return String(s.id) !== key; });
    const removed = data.sessions.length !== before;
    if (removed) this.save();
    return removed;
  }

  save() {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = this.path + ".tmp-" + process.pid;
      writeFileSync(tmp, JSON.stringify(this.read(), null, 2), "utf8");
      renameSync(tmp, this.path);
    } catch (e) { /* 持久化失败不影响内存会话 */ }
  }
}

// ---------------------------------------------------------------------------
// AcpSession
// ---------------------------------------------------------------------------

function normalizeAgent(agent) {
  const a = String(agent || "").toLowerCase();
  if (a === "claude" || a === "claude-code" || a === "claude_code") return "claude";
  if (a === "codex") return "codex";
  return a;
}

function normalizePermission(p) {
  const v = String(p || "");
  if (v === "plan" || v === "bypass" || v === "acceptEdits") return v;
  return "acceptEdits";
}

function emptyConfig(sessionId) {
  return {
    sessionId: sessionId || "",
    modes: null,
    models: null,
    reasoning: null,
    configOptions: [],
    model: null,
    mode: null,
    reasoningEffort: null,
    meta: null
  };
}

export class AcpSession {
  constructor(opts) {
    const o = opts || {};
    this.opts = o;
    this.agent = normalizeAgent(o.agent || "claude");
    this.def = ACP_AGENTS[this.agent] || null;
    this.id = String(o.id || newSessionId());
    this.profile = asObject(o.profile) || {};
    this.mirrorCwd = String(o.mirrorCwd || o.cwd || "");
    this.cwd = String(o.cwd || this.mirrorCwd);
    this.remotePath = String(o.remotePath || "~");
    this.agentPath = String(o.agentPath || "");
    this.permissionMode = normalizePermission(o.permission);
    this.wrapperDir = o.wrapperDir || join(o.homeDir || homedir(), ".dsh", "remote-ssh", "acp");
    this.logger = o.logger || null;
    this.spawn = o.spawn || nodeSpawn;
    this.nodePath = o.nodePath || process.execPath;
    this.sdkPath = o.sdkPath || "";
    this.adapterRoot = o.adapterRoot || "";
    this.adapterEntryOverride = o.adapterEntry || "";
    this.connectImpl = o.connectImpl || null;
    this.startTimeoutMs = Number(o.startTimeoutMs) > 0 ? Number(o.startTimeoutMs) : DEFAULT_START_TIMEOUT_MS;
    this.promptTimeoutMs = Number(o.promptTimeoutMs) > 0 ? Number(o.promptTimeoutMs) : 0;
    this.permissionTimeoutMs = Number(o.permissionTimeoutMs) > 0 ? Number(o.permissionTimeoutMs) : 0;
    this.maxEvents = Number(o.maxEvents) > 0 ? Number(o.maxEvents) : MAX_EVENTS;
    this.createdAt = Number(o.createdAt) || Date.now();
    this.startedAt = 0;
    this.sessionId = String(o.sessionId || "");
    this.resumeSessionId = String(o.resumeSessionId || "");
    this.status = "idle";
    this.lastError = null;
    this.lastStderr = "";
    this.config = emptyConfig(this.sessionId);
    this.capabilities = null;
    this.initialize = null;
    this.adapter = null;
    this.controller = null;
    this.events = [];
    this.eventSeq = 0;
    this.subscribers = new Set();
    this.pendingTurns = 0;
    this.streamActive = false;
    this.closed = false;
    this.broker = new PermissionBroker({
      autoAllow: false,
      timeoutMs: this.permissionTimeoutMs,
      logger: this.logger
    });
  }

  get alive() {
    return this.status === "starting" || this.status === "ready" || this.status === "prompting";
  }

  get busy() {
    return this.pendingTurns > 0 || this.streamActive;
  }

  decorate(payload) {
    const out = Object.assign({}, payload, {
      ts: Date.now(),
      agent: this.agent,
      agentLabel: this.def ? this.def.label : this.agent,
      sessionId: this.sessionId || "",
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
    if (ev.type === "config") {
      this.config = mergeConfigOptions(this.config, ev.configOptions, this.sessionId);
      ev.config = this.config;
    } else if (ev.type === "mode") {
      if (this.config.modes) this.config.modes.currentModeId = ev.currentModeId;
      else this.config.modes = { currentModeId: ev.currentModeId, availableModes: [] };
      this.config.mode = ev.currentModeId;
    }
    ev.seq = ++this.eventSeq;
    const full = this.decorate(ev);
    this.events.push(full);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    for (const fn of Array.from(this.subscribers)) {
      try { fn(full); } catch (e) {}
    }
    return full;
  }

  subscribe(fn, opts) {
    if (typeof fn !== "function") return function () {};
    if (!opts || opts.replay !== false) {
      for (const ev of this.events.slice()) {
        try { fn(ev); } catch (e) {}
      }
    }
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  bufferedEvents() {
    return this.events.slice();
  }

  beginStream() {
    if (this.streamActive) throw new AcpError("另一个 acpPrompt 正在流式输出（请用 acpSteer 追加消息）", "prompt_stream_busy");
    this.streamActive = true;
    return () => { this.streamActive = false; };
  }

  _emitUpdate(rawUpdate, notification) {
    const mapped = mapSessionUpdate(rawUpdate, { sessionId: notification && notification.sessionId });
    if (!mapped) return;
    this._emit(mapped);
  }

  async handlePermissionRequest(params, requestId) {
    const mapped = mapPermissionRequest(params, requestId);
    if (this.permissionMode === "bypass") {
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

  async start() {
    if (this.status !== "idle") throw new AcpError("会话已启动或已关闭（status=" + this.status + "）", "bad_state");
    if (!this.def) throw new AcpError("不支持的 ACP agent: " + this.agent, "unsupported_agent");
    this.status = "starting";
    try {
      if (!this.mirrorCwd) throw new AcpError("缺少 mirrorCwd", "bad_request");
      let st;
      try { st = await stat(this.mirrorCwd); } catch (e) { throw new AcpError("本地镜像目录不存在: " + this.mirrorCwd, "mirror_missing"); }
      if (!st.isDirectory()) throw new AcpError("mirrorCwd 不是目录: " + this.mirrorCwd, "mirror_missing");

      if (String(this.profile.authMethod || "") === "password") {
        throw new AcpError("ACP 不支持密码认证：请改用私钥或 Kerberos (GSSAPI)", "password_unsupported");
      }

      const marker = readMarkerSync(this.mirrorCwd);
      if ((!this.remotePath || this.remotePath === "~") && marker && marker.remotePath) this.remotePath = String(marker.remotePath);

      const wrapper = await ensureWrapper({
        agent: this.agent,
        profile: this.profile,
        remotePath: this.remotePath,
        agentPath: this.agentPath,
        wrapperDir: this.wrapperDir
      });
      const adapterEntry = this.connectImpl
        ? (this.adapterEntryOverride || "test-adapter")
        : resolveAdapterEntry(this.agent, {
            adapterEntry: this.adapterEntryOverride,
            adapterRoot: this.adapterRoot
          });

      const env = Object.assign({}, process.env, this.opts.env || {}, this.def.extraEnv || {});
      env[this.def.envVar] = wrapper.path;
      // wrapper 每会话的连接参数（优先于 .remote-ssh.json / 生成时嵌入值）
      env.DSH_ACP_HOST = String(this.profile.host || "");
      env.DSH_ACP_USER = String(this.profile.user || "");
      env.DSH_ACP_PORT = String(this.profile.port || 22);
      env.DSH_ACP_KEY_PATH = String(this.profile.keyPath || "");
      env.DSH_ACP_AUTH_METHOD = String(this.profile.authMethod || (this.profile.keyPath ? "key" : "kerberos"));
      env.DSH_ACP_PROXY_JUMP = String(this.profile.proxyJump || "");
      env.DSH_ACP_REMOTE_PATH = this.remotePath;
      env.DSH_ACP_AGENT_PATH = this.agentPath || this.def.cmd;

      const controller = await connectAcp({
        sdk: this.opts.sdk,
        sdkPath: this.sdkPath,
        requireBase: this.opts.requireBase,
        adapterEntry,
        adapterRoot: this.adapterRoot,
        spawn: this.spawn,
        nodePath: this.nodePath,
        cwd: this.mirrorCwd,
        env,
        resumeSessionId: this.resumeSessionId,
        connectImpl: this.connectImpl,
        clientCapabilities: this.opts.clientCapabilities,
        debug: !!(this.opts.debug || process.env.DSH_ACP_DEBUG === "1"),
        onClientRequest: this.opts.onClientRequest,
        onStderr: (chunk) => { this.lastStderr = (this.lastStderr + chunk).slice(-8192); },
        onUpdate: (update, notification) => this._emitUpdate(update, notification),
        onPermission: (params, requestId) => this.handlePermissionRequest(params, requestId),
        onFatal: (err) => {
          this.lastError = String(err && err.message ? err.message : err);
          if (this.status !== "closed") this.status = "error";
          this.broker.cancelAll();
          this._emit({ type: "error", message: this.lastError, code: (err && err.code) || "acp_error", fatal: true });
        }
      });
      this.controller = controller;

      let ready;
      try {
        ready = await withTimeout(controller.ready, this.startTimeoutMs, "ACP initialize/session/new", () => {
          try { controller.close(); } catch (e) {}
        });
      } catch (err) {
        const extra = this.lastStderr ? " | adapter stderr: " + this.lastStderr.slice(-1600) : "";
        throw new AcpError(String(err && err.message ? err.message : err) + extra, (err && err.code) || "start_failed");
      }

      this.sessionId = ready.sessionId;
      this.initialize = ready.initialize;
      this.capabilities = ready.capabilities || normalizeCapabilities(ready.initialize);
      this.config = normalizeSessionConfig(ready.sessionResponse);
      this.config.sessionId = this.sessionId;
      this.adapter = controller.adapter || null;
      this.startedAt = Date.now();
      this.status = "ready";
      this._emit({
        type: "session",
        session: {
          id: this.id,
          sessionId: this.sessionId,
          agent: this.agent,
          agentLabel: this.def.label,
          cwd: this.cwd,
          mirrorCwd: this.mirrorCwd,
          remotePath: this.remotePath,
          permission: this.permissionMode,
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
      try { if (this.controller) await this.controller.close(); } catch (e) {}
      throw err instanceof AcpError ? err : new AcpError(this.lastError, (err && err.code) || "start_failed");
    }
  }

  _enqueueTurn(text) {
    this.pendingTurns++;
    let promise;
    try {
      promise = this.controller.prompt(String(text));
    } catch (err) {
      this.pendingTurns = Math.max(0, this.pendingTurns - 1);
      throw err;
    }
    promise.finally(() => { this.pendingTurns = Math.max(0, this.pendingTurns - 1); }).catch(() => {});
    return promise;
  }

  /** 发一条 prompt，等本 turn 的 stop。返回 { stopReason, response }。 */
  async prompt(text, opts) {
    if (this.status === "closed") throw new AcpError("ACP 会话已关闭", "closed");
    if (this.status === "error") throw new AcpError(this.lastError || "ACP 会话不可用", "session_error");
    if (this.status !== "ready" && this.status !== "prompting") throw new AcpError("ACP 会话尚未就绪（status=" + this.status + "）", "not_ready");
    const value = String(text == null ? "" : text);
    if (!value.trim()) throw new AcpError("消息不能为空", "empty_prompt");
    this.status = "prompting";
    this._emit({ type: "user_message", text: value, steering: false });
    let result;
    try {
      result = await withTimeout(
        this._enqueueTurn(value),
        this.promptTimeoutMs,
        "ACP prompt",
        () => { try { this.cancel(); } catch (e) {} }
      );
      return { stopReason: (result && result.stopReason) || "end_turn", response: result ? result.response : null };
    } finally {
      if (this.status === "prompting") this.status = "ready";
    }
  }

  /** turn 进行中追加消息：优先走 _session/steering（注入当前 turn），否则排到 prompt 队列。 */
  async steer(text) {
    if (this.status === "closed") throw new AcpError("ACP 会话已关闭", "closed");
    if (this.pendingTurns <= 0) throw new AcpError("当前没有进行中的 turn（请用 acpPrompt）", "no_active_turn");
    const value = String(text == null ? "" : text);
    if (!value.trim()) throw new AcpError("消息不能为空", "empty_prompt");
    this._emit({ type: "user_message", text: value, steering: true });

    const steeringSupported = !!(this.capabilities && this.capabilities.steering && this.capabilities.steering.supported);
    if (steeringSupported && this.controller && typeof this.controller.steer === "function") {
      try {
        const res = await withTimeout(this.controller.steer(value), 30000, "ACP steering");
        const outcome = res && res.outcome ? String(res.outcome) : "injected";
        if (outcome === "injected") return { outcome: "injected", steering: true };
        if (outcome === "promptRequired" || outcome === "failed") {
          this._enqueueTurn(value);
          return { outcome: "queued", steering: false };
        }
      } catch (err) {
        try { this.logger?.warn?.("[dsh-remote-ssh] ACP steering 失败，回退为排队: " + String(err && err.message ? err.message : err)); } catch (e) {}
      }
    }
    this._enqueueTurn(value);
    return { outcome: "queued", steering: false };
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
    if (this.status === "closed") return { ok: false, error: "会话已关闭" };
    const cancelled = this.broker.cancelAll();
    if (cancelled) this._emit({ type: "permission_cancelled", count: cancelled });
    let sent = false;
    try {
      sent = await this.controller.cancel();
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err), sent: false, cancelledPermissions: cancelled };
    }
    return { ok: true, sent, cancelledPermissions: cancelled };
  }

  async setConfig(configId, value) {
    if (!this.controller) throw new AcpError("会话尚未启动", "not_ready");
    const id = String(configId || "");
    if (!id) throw new AcpError("缺少 configId", "bad_request");
    const response = await this.controller.setConfig(id, value);
    const configOptions = response && Array.isArray(response.configOptions) ? response.configOptions : this.config.configOptions;
    this.config = mergeConfigOptions(this.config, configOptions, this.sessionId);
    this._emit({ type: "config", configId: id, value, configOptions, config: this.config });
    return { configId: id, value, config: this.config, configOptions, response: summarizeRaw(response) };
  }

  async setMode(modeId) {
    if (!this.controller) throw new AcpError("会话尚未启动", "not_ready");
    const id = String(modeId || "");
    if (!id) throw new AcpError("缺少 modeId", "bad_request");
    const response = await this.controller.setMode(id);
    if (!this.config.modes) this.config.modes = { currentModeId: id, availableModes: [] };
    this.config.modes.currentModeId = id;
    this.config.mode = id;
    this._emit({ type: "mode", currentModeId: id, config: this.config });
    return { modeId: id, config: this.config, response: summarizeRaw(response) };
  }

  state() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      agent: this.agent,
      agentLabel: this.def ? this.def.label : this.agent,
      profileId: String(this.profile.id || this.opts.profileId || ""),
      cwd: this.cwd,
      mirrorCwd: this.mirrorCwd,
      remotePath: this.remotePath,
      permission: this.permissionMode,
      status: this.status,
      alive: this.alive,
      busy: this.busy,
      pendingTurns: this.pendingTurns,
      streamActive: this.streamActive,
      config: this.config,
      capabilities: this.capabilities,
      pendingPermissions: this.broker.list(),
      bufferedEvents: this.events.length,
      lastError: this.lastError,
      createdAt: this.createdAt,
      startedAt: this.startedAt
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.status = "closed";
    this.broker.cancelAll();
    try { if (this.controller) await this.controller.close(); } catch (e) {}
    this.subscribers.clear();
  }
}

export function newSessionId() {
  return "acp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// Runtime（多会话 + 持久化 + resume）
// ---------------------------------------------------------------------------

/**
 * createAcpRuntime({ getProfile, storePath, wrapperDir, sdkPath, adapterRoot, ... })
 *   getProfile(profileId) 由 Host 提供（用于 resume 时取连接配置）。
 *   createSession 可注入（测试用）；默认 new AcpSession()。
 */
export function createAcpRuntime(options) {
  const o = options || {};
  const sessions = new Map();
  const store = o.store || new AcpStore({ storePath: o.storePath });
  const defaults = {
    logger: o.logger,
    spawn: o.spawn,
    nodePath: o.nodePath,
    wrapperDir: o.wrapperDir,
    homeDir: o.homeDir,
    sdk: o.sdk,
    sdkPath: o.sdkPath,
    adapterRoot: o.adapterRoot,
    adapterEntry: o.adapterEntry,
    connectImpl: o.connectImpl,
    startTimeoutMs: o.startTimeoutMs,
    promptTimeoutMs: o.promptTimeoutMs,
    permissionTimeoutMs: o.permissionTimeoutMs,
    maxEvents: o.maxEvents,
    requireBase: o.requireBase,
    env: o.env,
    clientCapabilities: o.clientCapabilities,
    debug: o.debug,
    onClientRequest: o.onClientRequest
  };
  const makeSession = o.createSession || function (args) { return new AcpSession(args); };

  function recordOf(session) {
    return {
      id: session.id,
      profileId: String(session.profile && session.profile.id ? session.profile.id : ""),
      agent: session.agent,
      cwd: session.cwd,
      mirrorCwd: session.mirrorCwd,
      remotePath: session.remotePath,
      sessionId: session.sessionId,
      permission: session.permissionMode,
      createdAt: session.createdAt,
      updatedAt: Date.now()
    };
  }

  const runtime = {
    store,
    sessions,
    async create(args) {
      const a = args || {};
      const profile = asObject(a.profile) || {};
      const session = makeSession(Object.assign({}, defaults, a, {
        id: a.id || newSessionId(),
        profile,
        profileId: profile.id || a.profileId || "",
        agent: a.agent,
        mirrorCwd: a.mirrorCwd || a.cwd,
        cwd: a.cwd || a.mirrorCwd,
        remotePath: a.remotePath,
        agentPath: a.agentPath,
        permission: a.permission
      }));
      await session.start();
      sessions.set(session.id, session);
      store.upsert(recordOf(session));
      return session;
    },
    async resume(id, args) {
      const key = String(id || "");
      const live = sessions.get(key);
      if (live && live.alive) return live;
      const record = store.get(key);
      if (!record) throw new AcpError("未找到可 resume 的 ACP 会话: " + key, "session_not_found");
      const profile = asObject(args && args.profile) || (o.getProfile ? o.getProfile(record.profileId) : null);
      if (!profile) throw new AcpError("连接配置已删除，无法 resume: " + record.profileId, "profile_missing");
      const session = makeSession(Object.assign({}, defaults, {
        id: record.id,
        profile,
        profileId: record.profileId,
        agent: record.agent,
        mirrorCwd: record.mirrorCwd,
        cwd: record.cwd,
        remotePath: record.remotePath,
        agentPath: (args && args.agentPath) || "",
        permission: record.permission,
        resumeSessionId: record.sessionId,
        createdAt: record.createdAt
      }));
      await session.start();
      sessions.set(session.id, session);
      store.upsert(recordOf(session));
      return session;
    },
    get(id) {
      return sessions.get(String(id || "")) || null;
    },
    list() {
      const out = [];
      const seen = new Set();
      for (const record of store.list()) {
        const live = sessions.get(String(record.id));
        if (live) {
          seen.add(String(record.id));
          out.push(Object.assign(live.state(), { persisted: true }));
        } else {
          out.push({
            id: record.id,
            sessionId: record.sessionId || "",
            agent: record.agent,
            agentLabel: ACP_AGENTS[record.agent] ? ACP_AGENTS[record.agent].label : record.agent,
            profileId: record.profileId || "",
            cwd: record.cwd || "",
            mirrorCwd: record.mirrorCwd || "",
            remotePath: record.remotePath || "",
            permission: record.permission || "",
            status: "detached",
            alive: false,
            busy: false,
            resumable: true,
            createdAt: record.createdAt || 0,
            updatedAt: record.updatedAt || 0
          });
        }
      }
      for (const [id, session] of sessions) {
        if (!seen.has(id)) out.push(session.state());
      }
      return out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    },
    async close(id) {
      const key = String(id || "");
      const session = sessions.get(key);
      if (session) {
        await session.close();
        sessions.delete(key);
      }
      const removed = store.remove(key);
      return { ok: !!session || removed, closed: !!session, removed };
    },
    async closeAll() {
      const ids = Array.from(sessions.keys());
      for (const id of ids) {
        try { await runtime.close(id); } catch (e) {}
      }
      return ids.length;
    }
  };
  return runtime;
}
