/** Advertised adapter configuration and explicit permission-mode mappings. */
import { asObject } from "./acp-core.js";

export function flattenSelectOptions(options) {
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

export function findConfigOption(configOptions, category, ids) {
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

const MODEL_IDS = ["model"];
const REASONING_IDS = ["effort", "thought_level"];

/** session/new / session/resume 的响应 → 归一化配置快照（Host 与 UI 都以它为准）。 */
export function normalizeSessionConfig(sessionResponse) {
  const r = asObject(sessionResponse) || {};
  const configOptions = Array.isArray(r.configOptions) ? r.configOptions : [];
  let modes = asObject(r.modes);
  const modeOption = findConfigOption(configOptions, "mode", ["mode", "permission_mode"]);
  if (!modes && modeOption) modes = { currentModeId: modeOption.currentValue, availableModes: flattenSelectOptions(modeOption.options).map(o => ({ id: o.value, name: o.name, description: o.description })) };

  const modelOption = findConfigOption(configOptions, "model", MODEL_IDS);
  const reasoningOption = findConfigOption(configOptions, "thought_level", REASONING_IDS);

  const models = describeSelectOption(modelOption);

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

export const PERMISSION_MODES = {
  plan: ["plan", "read-only"],
  acceptEdits: ["acceptEdits", "workspace-write"],
  bypass: ["bypassPermissions", "agent-full-access"]
};

export function resolvePermissionMode(permission, modes) {
  const available = (modes && modes.availableModes) || [];
  const aliases = PERMISSION_MODES[permission] || [permission];
  return aliases.find(id => available.some(mode => mode.id === id)) || null;
}

export function emptyConfig(sessionId) {
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

