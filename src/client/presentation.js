// Event presentation helpers: pure, session identity is carried by the model.




export function acpBlockLabels(t) {
  var codeToolbar = {
    codeLabel: t("acp.code"),
    wrapLabel: t("acp.wrap"),
    unwrapLabel: t("acp.unwrap")
  };
  var collapseAria = t("acp.collapseAria");
  var expandAria = function (count) { return t("acp.expandAria", { count: count }); };
  var collapse = t("acp.collapse");
  var expand = function (count) { return t("acp.expand", { count: count }); };
  return {
    markdown: {
      code: {
        copyLabel: t("acp.copy"),
        copiedLabel: t("acp.copied"),
        toolbarLabels: codeToolbar
      },
      footnotes: t("acp.footnotes")
    },
    diff: {
      codeLabel: codeToolbar.codeLabel, wrapLabel: codeToolbar.wrapLabel, unwrapLabel: codeToolbar.unwrapLabel,
      copy: t("acp.copy"), copied: t("acp.copied"),
      collapseAria: collapseAria, expandAria: expandAria,
      collapse: collapse, expand: expand
    },
    read: {
      codeLabel: codeToolbar.codeLabel, wrapLabel: codeToolbar.wrapLabel, unwrapLabel: codeToolbar.unwrapLabel,
      window: function (shown, total) { return t("acp.readWindow", { shown: shown, total: total }); },
      copy: t("acp.copy"), copied: t("acp.copied"),
      collapseAria: collapseAria, expandAria: expandAria,
      collapse: collapse, expand: expand
    },
    terminal: {
      commandLine: function (n) { return t("acp.commandLine", { n: n }); },
      signal: function (signal) { return t("acp.signal", { signal: signal }); },
      exitCode: function (code) { return t("acp.exitCode", { code: code }); },
      noExitCode: t("acp.noExitCode"),
      running: t("acp.running"),
      failed: t("acp.failed"),
      done: t("acp.done"),
      copy: t("acp.copy"), copied: t("acp.copied"),
      noOutput: t("acp.noOutput"),
      collapseAria: collapseAria,
      collapse: collapse,
      expandAria: expandAria,
      expand: expand
    }
  };
}

export function acpShortId(value) {
  var text = String(value == null ? "" : value);
  if (!text) return "";
  if (text.length <= 16) return text;
  return text.slice(0, 8) + "…" + text.slice(-4);
}

export function acpJsonText(value, max) {
  if (value === undefined) return "";
  try {
    var text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!text) return "";
    var limit = max || 4000;
    return text.length > limit ? text.slice(0, limit) + "…" : text;
  } catch (e) {
    return String(value);
  }
}

export function acpNativeName(native) {
  if (typeof native === "string") return native;
  if (native && typeof native === "object") {
    return String(native.sessionUpdate || native.sessionUpdateType || native.type || native.name || "");
  }
  return "";
}

export function acpContentText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(acpContentText).filter(Boolean).join("\n\n");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (value.content !== undefined) return acpContentText(value.content);
    if (value.message !== undefined) return acpContentText(value.message);
    return acpJsonText(value, 4000);
  }
  return String(value);
}

export function acpNormalizeExit(exitStatus) {
  if (exitStatus === undefined || exitStatus === null || exitStatus === "") {
    return { exitCode: undefined, signal: undefined, running: true };
  }
  if (typeof exitStatus === "number") return { exitCode: exitStatus, signal: undefined, running: false };
  if (typeof exitStatus === "string") {
    if (/^\d+$/.test(exitStatus)) return { exitCode: Number(exitStatus), signal: undefined, running: false };
    if (exitStatus === "running") return { exitCode: undefined, signal: undefined, running: true };
    return { exitCode: undefined, signal: exitStatus, running: false };
  }
  if (typeof exitStatus === "object") {
    var code = exitStatus.exitCode !== undefined ? exitStatus.exitCode
      : exitStatus.exit_code !== undefined ? exitStatus.exit_code : exitStatus.code;
    if (code !== undefined && code !== null) {
      return { exitCode: Number(code), signal: exitStatus.signal, running: false };
    }
    if (exitStatus.signal) return { exitCode: undefined, signal: String(exitStatus.signal), running: false };
    return { exitCode: undefined, signal: undefined, running: exitStatus.running === true };
  }
  return {};
}

export function acpNativeState(state) {
  var raw = state;
  if (raw && typeof raw === "object") raw = raw.type || raw.state || raw.status || "";
  var value = String(raw || "").toLowerCase();
  if (value === "running" || value === "in_progress" || value === "working") {
    return { dot: "ongoing", key: "acp.stateRunning", tone: "neutral" };
  }
  if (value === "requires_action" || value === "requires-action" || value === "waiting" || value === "pending") {
    return { dot: "warning", key: "acp.stateRequiresAction", tone: "warning" };
  }
  if (value === "idle" || value === "done" || value === "completed") {
    return { dot: value === "done" || value === "completed" ? "done" : "idle", key: "acp.stateIdle", tone: "neutral" };
  }
  if (value === "failed" || value === "error") {
    return { dot: "warning", key: "acp.toolFailed", tone: "warning" };
  }
  return { dot: "idle", key: "acp.stateUnknown", tone: "neutral" };
}

export function acpIsSubagentTool(tool) {
  if (!tool) return false;
  if (tool.subagent && typeof tool.subagent === "object") return true;
  var name = String(tool.name || tool.title || "").toLowerCase();
  var kind = String(tool.kind || "").toLowerCase();
  if (/^(agent|task|subagent)$/.test(name) || /^agent\s*[:\-]/.test(name)) return true;
  if (/^(agent|task|subagent)$/.test(kind)) return true;
  var raw = tool.rawInput;
  if (raw && typeof raw === "object" && !raw.truncated) {
    if (raw.subagent_type || raw.subagentType || raw.agent_id || raw.agentId || raw.agent) return true;
  }
  return false;
}

export function acpSubagentFromTool(tool) {
  var t = tool || {};
  var raw = t.rawInput && typeof t.rawInput === "object" && !t.rawInput.truncated ? t.rawInput : {};
  var out = t.rawOutput && typeof t.rawOutput === "object" && !t.rawOutput.truncated ? t.rawOutput : {};
  var sub = t.subagent && typeof t.subagent === "object" ? t.subagent : {};
  return {
    toolCallId: String(t.toolCallId || ""),
    agentId: String(sub.agentId || sub.agent || raw.subagent_type || raw.subagentType || raw.agent_id || raw.agentId || raw.agent || ""),
    sessionId: String(sub.sessionId || out.sessionId || raw.sessionId || ""),
    title: String(sub.title || t.title || t.name || ""),
    description: String(sub.description || raw.description || t.title || t.name || ""),
    background: sub.background === true || raw.run_in_background === true || raw.background === true || out.background === true,
    outputFile: String(sub.outputFile || out.outputFile || out.output_file || raw.outputFile || raw.output_file || ""),
    state: sub.state !== undefined ? sub.state : t.status,
    summary: String(sub.summary || (typeof t.output === "string" ? t.output : "")),
    native: sub.native !== undefined ? sub.native : t.native,
    nativeMeta: sub.nativeMeta !== undefined ? sub.nativeMeta : t.nativeMeta
  };
}

export function acpSubagentKey(sub) {
  var s = sub || {};
  return String(s.agentId || s.sessionId || s.taskId || s.toolUseId || s.toolCallId || s.id || "");
}

function acpItemPayload(item) { return item && (item.type === "tool" ? item.tool : item.type === "subagent" ? item.subagent : item) || {}; }
function acpItemSession(item) {
  var data = acpItemPayload(item);
  return String(item && item.sessionId || data.sessionId || "");
}
export function acpItemId(item) {
  if (!item) return "";
  var data = acpItemPayload(item);
  var local = item.type === "tool" ? data.toolCallId || item.key
    : item.type === "subagent" ? item._key || data._key || data.taskId || data.toolUseId || data.agentId || item.key
      : item.key || item.id || item.messageId;
  return local == null || local === "" ? "" : JSON.stringify([acpItemSession(item), String(local)]);
}

// The explicit wire parent only. Resolved child-session ownership is in built.parents.
export function acpItemParent(item) {
  if (!item) return "";
  var data = acpItemPayload(item);
  var parent = item.parentToolCallId || data.parentToolCallId;
  if (!parent) return "";
  return JSON.stringify([String(item.parentSessionId || data.parentSessionId || acpItemSession(item)), String(parent)]);
}

export function acpChildrenFor(item, childMap, ancestors) {
  var id = acpItemId(item);
  if (!id || !childMap) return [];
  var seen = ancestors || [];
  return (childMap[id] || []).filter(function (child) {
    var cid = acpItemId(child);
    return cid && cid !== id && seen.indexOf(cid) < 0;
  });
}

// Pure frontend projection: never mutates events or synthesizes native log records.
// Ambiguous/missing ownership remains visible at root with a source fallback.
export function acpBuildChildMap(items) {
  var map = Object.create(null), known = Object.create(null), parents = Object.create(null), fallbacks = Object.create(null);
  var byId = Object.create(null), sessions = Object.create(null), childSources = Object.create(null), owners = Object.create(null);
  function fallback(item, reason) {
    var data = acpItemPayload(item);
    fallbacks[acpItemId(item)] = { reason: reason, sessionId: acpItemSession(item),
      parentToolCallId: String(item.parentToolCallId || data.parentToolCallId || ""),
      rootSessionId: String(item.rootSessionId || data.rootSessionId || "") };
  }
  items.forEach(function (item) {
    var id = acpItemId(item), sid = acpItemSession(item);
    if (!id) return;
    (byId[id] || (byId[id] = [])).push(item);
    if (sid) sessions[sid] = true;
    var data = acpItemPayload(item), root = item.rootSessionId || data.rootSessionId;
    if (sid && root && String(root) !== sid) childSources[sid] = true;
  });
  Object.keys(byId).forEach(function (id) {
    known[id] = byId[id].length === 1;
    if (!known[id]) byId[id].forEach(function (item) { fallback(item, "ambiguous"); });
  });
  items.forEach(function (item) {
    var data = acpItemPayload(item);
    // Only actual declared child sessions, not names, descriptions or keywords.
    var sub = item.type === "subagent" ? data : item.type === "tool" ? data.subagent : null;
    var childSession = sub && sub.sessionId;
    var id = acpItemId(item);
    var actualChild = childSession && (String(childSession) !== acpItemSession(item) || childSources[childSession]);
    if (actualChild && sessions[childSession] && known[id]) {
      var list = owners[childSession] || (owners[childSession] = []);
      if (list.indexOf(id) < 0) list.push(id);
    }
  });
  items.forEach(function (item) {
    var id = acpItemId(item), data = acpItemPayload(item), sid = acpItemSession(item);
    if (!id || !known[id]) return;
    var explicit = acpItemParent(item), root = String(item.rootSessionId || data.rootSessionId || "");
    var parent = explicit;
    // Root scope is a valid explicit source only when no same-session parent exists.
    if (explicit && !byId[explicit] && root && root !== sid && !(item.parentSessionId || data.parentSessionId)) {
      var rootParent = JSON.stringify([root, String(item.parentToolCallId || data.parentToolCallId)]);
      if (byId[rootParent]) parent = rootParent;
    }
    if (explicit) {
      if (parent !== id && known[parent]) parents[id] = parent;
      else fallback(item, parent === id ? "cycle" : byId[parent] ? "ambiguous" : "missing-parent");
      return;
    }
    var candidates = (owners[sid] || []).filter(function (owner) { return owner !== id; });
    if (candidates.length === 1) parents[id] = candidates[0];
    else if (candidates.length > 1) fallback(item, "ambiguous");
    else if (root && root !== sid) fallback(item, "unassigned-session");
  });
  // Cut every cycle edge, not just the first one: all cycle members remain root-visible.
  var visited = Object.create(null);
  Object.keys(parents).forEach(function (start) {
    var path = [], positions = Object.create(null), current = start;
    while (parents[current] && !visited[current]) {
      if (positions[current] !== undefined) {
        path.slice(positions[current]).forEach(function (id) { delete parents[id]; fallback(byId[id][0], "cycle"); });
        break;
      }
      positions[current] = path.length; path.push(current); current = parents[current];
    }
    path.forEach(function (id) { visited[id] = true; });
  });
  items.forEach(function (item) {
    var parent = parents[acpItemId(item)];
    if (parent) (map[parent] || (map[parent] = [])).push(item);
  });
  return { map: map, known: known, parents: parents, fallbacks: fallbacks };
}

export function acpCommandName(command) {
  return String((command && command.name) || "").replace(/^\/+/, "");
}

export function acpCommandGroup(command) {
  var group = String((command && (command.group || command.category || command.kind || command.source)) || "").trim();
  if (group) return group;
  var name = acpCommandName(command).toLowerCase();
  var desc = String((command && command.description) || "");
  if (name === "skills" || name.indexOf("skill") === 0 || /skill/i.test(desc)) return "Skills";
  return "Commands";
}

export function acpCommandGroups(commands, query) {
  var needle = String(query || "").trim().toLowerCase();
  var buckets = {};
  var order = [];
  for (var i = 0; i < commands.length; i++) {
    var command = commands[i] || {};
    var name = acpCommandName(command);
    if (!name) continue;
    var hint = command.input && command.input.hint ? String(command.input.hint) : "";
    var haystack = (name + " " + String(command.description || "") + " " + hint).toLowerCase();
    if (needle && haystack.indexOf(needle) < 0) continue;
    var group = acpCommandGroup(command);
    if (!buckets[group]) { buckets[group] = []; order.push(group); }
    buckets[group].push(command);
  }
  order.sort(function (a, b) {
    var rank = function (g) { return g === "Skills" ? 0 : g === "Commands" ? 1 : 2; };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return order.map(function (group) { return { name: group, items: buckets[group] }; });
}

export function acpQuestionField(input) {
  var field = Object.assign({}, input || {});
  var choices = field.oneOf || field.anyOf;
  if (!field.enum && Array.isArray(choices) && choices.every(function (choice) { return choice.const !== undefined; })) {
    field.enum = choices.map(function (choice) { return choice.const; });
    field.enumNames = choices.map(function (choice) { return choice.title || String(choice.const); });
    field.enumDescriptions = choices.map(function (choice) { return choice.description || ""; });
  }
  if (!field.type && Array.isArray(field.enum) && field.enum.length) {
    var inferred = typeof field.enum[0];
    if (field.enum.every(function (value) { return typeof value === inferred; })) field.type = inferred;
  }
  if (field.type === "array" && field.items) field.items = acpQuestionField(field.items);
  return field;
}

export function acpQuestionAnswersValid(schema, answers) {
  var fields = schema.properties || {};
  if ((schema.required || []).some(function (key) { return answers[key] === undefined || answers[key] === ""; })) return false;
  return Object.keys(answers).every(function (key) {
    var field = acpQuestionField(fields[key]); var value = answers[key];
    if (value === undefined) return true;
    if (field.enum && field.enum.indexOf(value) < 0) return false;
    if (field.type === "boolean") return typeof value === "boolean";
    if (field.type === "string") return typeof value === "string" &&
      (field.minLength == null || value.length >= field.minLength) && (field.maxLength == null || value.length <= field.maxLength);
    if (field.type === "integer" || field.type === "number") return typeof value === "number" && Number.isFinite(value) &&
      (field.type !== "integer" || Number.isInteger(value)) &&
      (field.minimum == null || value >= field.minimum) && (field.maximum == null || value <= field.maximum);
    if (field.type === "array") return Array.isArray(value) &&
      (field.minItems == null || value.length >= field.minItems) && (field.maxItems == null || value.length <= field.maxItems) &&
      (!field.uniqueItems || new Set(value).size === value.length) &&
      !!field.items && Array.isArray(field.items.enum) && value.every(function (item) { return field.items.enum.indexOf(item) >= 0; });
    return false;
  });
}
