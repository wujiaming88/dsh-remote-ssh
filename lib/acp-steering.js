import { AcpError } from "./acp-core.js";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const TEXT_APPLICATION_MIME_TYPES = new Set([
  "application/json", "application/xml", "application/javascript", "application/typescript",
  "application/x-yaml", "application/yaml", "application/toml", "application/x-sh",
  "application/sql", "application/graphql"
]);

function unsupported() {
  // Never include prompt content, resource URIs, or private paths in this error.
  throw new AcpError("This content is not supported by native steering; use queued send instead", "steer_content_unsupported");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireCapability(capabilities, key) {
  if (capabilities?.promptCapabilities?.[key] !== true) unsupported();
}

function isHttpUri(uri) {
  if (typeof uri !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(uri).protocol); } catch { return false; }
}

function isBase64(value) {
  return typeof value === "string" && value.length > 0 && value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

/**
 * Validate a prepared prompt specifically for native steering. Call after the
 * normal preparePrompt admission checks; this does not change ordinary prompts.
 * Returns content blocks without modifying them or reading/uploading any file.
 *
 * Pinned implementations audited: codex-acp v2.9.0 (buildPromptItems),
 * claude-agent-acp v0.109.1 (promptToClaude and blobResourceToClaude).
 * Both accept four block types, but Claude silently drops unsupported steer
 * blocks/MIMEs. Codex renders non-image blobs as base64 text, not native files;
 * reject those here rather than promising native document steering.
 */
export function prepareSteeringPrompt(preparedPrompt, capabilities, agent) {
  if (capabilities?.steering?.supported !== true || !["claude", "codex"].includes(agent)) {
    throw new AcpError("Adapter does not advertise native steering", "steering_unsupported");
  }
  const prompt = typeof preparedPrompt === "string" ? [{ type: "text", text: preparedPrompt }] : preparedPrompt;
  if (!Array.isArray(prompt) || prompt.length === 0) throw new AcpError("Steering requires non-empty prompt content", "bad_prompt");
  for (const block of prompt) {
    if (!isRecord(block)) throw new AcpError("Invalid steering content block", "bad_attachment");
    switch (block.type) {
      case "text":
        if (typeof block.text !== "string") throw new AcpError("Text content requires a string", "bad_attachment");
        break;
      case "image":
        requireCapability(capabilities, "image");
        if (!IMAGE_MIME_TYPES.has(block.mimeType)) unsupported();
        if (block.data != null && block.data !== "" && !isBase64(block.data)) {
          throw new AcpError("Image content requires valid base64 data", "bad_attachment");
        }
        if (!isBase64(block.data) && !isHttpUri(block.uri)) unsupported();
        break;
      case "resource_link":
        if (typeof block.uri !== "string" || !block.uri || typeof block.name !== "string") {
          throw new AcpError("Resource link requires uri/name", "bad_attachment");
        }
        break;
      case "resource": {
        requireCapability(capabilities, "embeddedContext");
        const resource = block.resource;
        if (!isRecord(resource) || typeof resource.uri !== "string" || !resource.uri) {
          throw new AcpError("Embedded resource requires a URI", "bad_attachment");
        }
        // Do not accept ambiguous resources that one adapter would treat as text
        // and the other would treat as a blob.
        if (Object.hasOwn(resource, "text")) {
          if (typeof resource.text !== "string" || Object.hasOwn(resource, "blob")) {
            throw new AcpError("Embedded text resource has an invalid shape", "bad_attachment");
          }
          break;
        }
        if (!isBase64(resource.blob)) throw new AcpError("Embedded blob requires valid base64 data", "bad_attachment");
        const rawMime = resource.mimeType;
        if (typeof rawMime !== "string") unsupported();
        // Claude normalizes blob MIME parameters/case and image/jpg; Codex
        // preserves the MIME in its data URI, so keep its accepted set exact.
        let mime = agent === "claude" ? rawMime.split(";")[0].trim().toLowerCase() : rawMime;
        if (agent === "claude" && mime === "image/jpg") mime = "image/jpeg";
        if (IMAGE_MIME_TYPES.has(mime)) {
          requireCapability(capabilities, "image");
          break;
        }
        const claudeText = mime.startsWith("text/") || TEXT_APPLICATION_MIME_TYPES.has(mime) || mime.endsWith("+json") || mime.endsWith("+xml");
        if (agent !== "claude" || !(mime === "application/pdf" || claudeText)) unsupported();
        break;
      }
      default:
        unsupported();
    }
  }
  return prompt;
}
