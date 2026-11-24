/** User permission gates and conservative form-elicitation validation. */
import { AcpError } from "./acp-core.js";
import { mapToolCall } from "./acp-events.js";

/** bypass 模式下自动选：只选择明确 allow 选项；不猜测未知选项。 */
export function pickAutoPermissionOption(options) {
  const list = Array.isArray(options) ? options : [];
  return (
    list.find(function (o) { return o && o.kind === "allow_once"; }) ||
    list.find(function (o) { return o && o.kind === "allow_always"; }) ||
    null
  );
}

export function selectedOutcome(optionId) {
  return { outcome: { outcome: "selected", optionId: String(optionId) } };
}
export function cancelledOutcome() {
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
  }

  /** 返回 { id, promise }。requestId 由 JSON-RPC 提供时原样字符串化。 */
  enqueue(params, requestId) {
    const id = requestId == null || requestId === "" ? "perm" + ++this.seq : String(requestId);
    const options = (Array.isArray(params && params.options) ? params.options : []).map(function (o) {
      return { optionId: String((o && o.optionId) || ""), name: String((o && o.name) || ""), kind: String((o && o.kind) || "") };
    });

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
    return { id, promise };
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

/** Conservative ACP form subset. Unknown validation keywords are declined,
 * not ignored; regex/format and nested objects need a dedicated validator. */
export function elicitationSchemaSupport(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "Schema must be an object";
  if (JSON.stringify(schema).length > 65536) return "Schema exceeds size limit";
  const topKeys = ["type", "title", "description", "properties", "required", "additionalProperties", "_meta"];
  if (Object.keys(schema).some(key => !topKeys.includes(key)) || (schema.type != null && schema.type !== "object")) return "Unsupported object schema";
  const properties = schema.properties || {};
  if (Array.isArray(properties) || typeof properties !== "object" || Object.keys(properties).length > 100) return "Unsupported properties";
  if (schema.required != null && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== "string" || !Object.hasOwn(properties, key)))) return "Invalid required fields";
  for (const [name, property] of Object.entries(properties)) {
    if (["__proto__", "constructor", "prototype"].includes(name)) return "Unsafe property name";
    if (!property || !["string", "number", "integer", "boolean", "array"].includes(property.type)) return "Unsupported property type: " + name;
    const metadata = ["type", "title", "description", "default", "_meta"];
    const allowed = metadata.concat(property.type === "string" ? ["minLength", "maxLength", "enum", "oneOf"] : property.type === "array" ? ["minItems", "maxItems", "items"] : property.type === "boolean" ? [] : ["minimum", "maximum"]);
    if (Object.keys(property).some(key => !allowed.includes(key))) return "Unsupported schema keyword: " + name;
    if (property.enum != null && property.oneOf != null) return "Ambiguous string choices";
    if (property.enum != null && (!Array.isArray(property.enum) || property.enum.some(value => typeof value !== "string"))) return "Invalid enum";
    if (property.oneOf != null && (!Array.isArray(property.oneOf) || property.oneOf.some(value => !value || typeof value.const !== "string" || Object.keys(value).some(key => !["const", "title", "description", "_meta"].includes(key))))) return "Unsupported oneOf";
    for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) if (property[key] != null && (!Number.isFinite(property[key]) || (key !== "minimum" && key !== "maximum" && (!Number.isInteger(property[key]) || property[key] < 0)))) return "Invalid constraint";
    if (property.type === "array") {
      const items = property.items;
      if (!items || Object.keys(items).some(key => !["type", "enum", "anyOf", "_meta"].includes(key))) return "Unsupported array items";
      if (items.type != null && items.type !== "string") return "Only string arrays are supported";
      if (items.enum != null && items.anyOf != null) return "Ambiguous array choices";
      if (items.anyOf != null && !Array.isArray(items.anyOf)) return "Invalid array choices";
      const choices = items.enum || items.anyOf?.map(value => value?.const);
      if (!Array.isArray(choices) || choices.some(value => typeof value !== "string")) return "Array must declare string choices";
      if (items.anyOf?.some(value => Object.keys(value).some(key => !["const", "title", "description", "_meta"].includes(key)))) return "Unsupported array choice";
    }
  }
  return null;
}

export function validateElicitationContent(schema, content) {
  const unsupported = elicitationSchemaSupport(schema);
  if (unsupported) throw new AcpError(unsupported, "elicitation_schema_unsupported");
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new AcpError("Form content must be an object", "invalid_elicitation_content");
  if (JSON.stringify(content).length > 65536) throw new AcpError("Form content too large", "invalid_elicitation_content");
  const properties = schema.properties || {};
  const invalid = message => { throw new AcpError(message, "invalid_elicitation_content"); };
  for (const name of schema.required || []) if (!Object.hasOwn(content, name)) invalid("Missing required field: " + name);
  for (const [name, value] of Object.entries(content)) {
    const property = Object.hasOwn(properties, name) ? properties[name] : null;
    if (!property) invalid("Unknown field: " + name);
    if (property.type === "array") {
      const choices = property.items.enum || property.items.anyOf.map(choice => choice.const);
      if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !choices.includes(item)) || new Set(value).size !== value.length) invalid("Invalid multi-select: " + name);
      if ((property.minItems != null && value.length < property.minItems) || (property.maxItems != null && value.length > property.maxItems)) invalid("Selection count out of range: " + name);
    } else if (property.type === "string") {
      if (typeof value !== "string") invalid("Expected string: " + name);
      const choices = property.enum || property.oneOf?.map(choice => choice.const);
      if (choices && !choices.includes(value)) invalid("Value is not an allowed choice: " + name);
      const length = [...value].length;
      if ((property.minLength != null && length < property.minLength) || (property.maxLength != null && length > property.maxLength)) invalid("String length out of range: " + name);
    } else if (property.type === "boolean") {
      if (typeof value !== "boolean") invalid("Expected boolean: " + name);
    } else {
      if (typeof value !== "number" || !Number.isFinite(value) || (property.type === "integer" && !Number.isInteger(value))) invalid("Expected " + property.type + ": " + name);
      if ((property.minimum != null && value < property.minimum) || (property.maximum != null && value > property.maximum)) invalid("Number out of range: " + name);
    }
  }
  return content;
}

