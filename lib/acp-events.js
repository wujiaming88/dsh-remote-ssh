/** Pure ACP notification/content projection. No I/O or session state. */
import { asObject, truncate, MAX_RAW_JSON, MAX_TEXT_CHUNK, MAX_TOOL_TEXT, MAX_DIFF_TEXT } from "./acp-core.js";

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
    raw.agentId,
    raw.agent_id,
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
    agentType: firstString([raw.subagent_type, raw.agentType]),
    taskId: firstString([raw.taskId, raw.task_id, response.taskId, response.task_id, markerTagText(scanText, "task-id")]),
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
  if (parentToolCallId != null) out.parentToolCallId = String(parentToolCallId);
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
  if (u.turnId != null) ev.turnId = String(u.turnId);
  if (u.messageId != null) ev.messageId = String(u.messageId);
  const parent = firstString([u.parentToolCallId, u._meta?.claudeCode?.parentToolUseId, u._meta?.parentToolUseId]);
  if (parent != null) ev.parentToolCallId = parent;
  if (ev.type === "text" || ev.type === "thought") ev.append = !ev.full;
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
          ...(task.toolUseId ? { parentToolCallId: task.toolUseId } : {}),
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
    case "usage_update": {
      const nonnegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
      const amount = nonnegative(u.cost?.amount);
      return {
        type: "usage",
        used: nonnegative(u.used),
        size: nonnegative(u.size),
        cost: amount === null ? null : { amount, currency: typeof u.cost.currency === "string" ? u.cost.currency : "" }
      };
    }
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
        ...(parentToolCallId == null ? {} : { parentToolCallId: String(parentToolCallId) })
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

