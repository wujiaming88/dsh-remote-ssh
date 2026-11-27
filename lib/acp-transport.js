/** Remote bootstrap, explicit preparation, and SDK 2.9.1 SSH stdio transport. */
import { spawn as nodeSpawn } from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { client, ndJsonStream } from "@agentclientprotocol/sdk";
import { AcpError, ACP_AGENTS, ACP_CLIENT_CAPABILITIES, ACP_SSH_HOST_KEY_POLICY, PROTOCOL_VERSION, DEFAULT_CLOSE_TIMEOUT_MS, asObject, normalizeAgent, deferred, withTimeout } from "./acp-core.js";
import { cancelledOutcome } from "./acp-requests.js";

function posixQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/** Private remote prefix; installation happens only through explicit prepare. */
export const REMOTE_ACP_RUNTIME_DIR = "~/.local/share/dsh-remote-acp/v1";
export const REMOTE_ACP_PACKAGES = Object.freeze({
  "@agentclientprotocol/sdk": "2.9.1",
  "@agentclientprotocol/claude-agent-acp": "0.109.1",
  "@agentclientprotocol/codex-acp": "2.9.0",
  "@wujiaming88/pi-agent-acp": "0.1.5"
});
export const REMOTE_ACP_INSTALL_SPECS = Object.freeze({
  "@wujiaming88/pi-agent-acp": "github:wujiaming88/pi-agent-acp#v0.1.5"
});
const REMOTE_RUNTIME_MARKER = "[dsh-acp-runtime] ";

/**
 * The pinned Claude adapter hardcodes steering priority to `now`, which moves a
 * foreground tool to the background instead of waiting for it. Claude Code's
 * own queue waits for the current tool and then handles the message in the same
 * turn. The SDK already supports `later`; expose that choice to the Host with a
 * small, exact, idempotent source patch. Any mismatch leaves the adapter
 * untouched and the Host falls back to turn-boundary queueing.
 */
export function patchClaudeSteeringSource(source) {
  const MARKER = "/* dsh-steering-priorities */";
  const input = String(source || "");
  if (input.includes(MARKER)) return { source: input, patched: true };
  const priority = /userMessage\.priority\s*=\s*\n?\s*\(session\.openUserInputs\?\.size \?\? 0\) > 0 \? STEER_PRIORITY_LATER : STEER_PRIORITY_NOW;/g;
  const capability = /steering:\s*\{\s*\n?\s*supported:\s*true,\s*\n?\s*\}/g;
  const priorityMatches = [...input.matchAll(priority)], capabilityMatches = [...input.matchAll(capability)];
  if (priorityMatches.length !== 1 || capabilityMatches.length !== 1) throw Object.assign(new Error("Pinned Claude ACP adapter layout changed; steering priority patch was not applied"), { code: "steering_patch_unavailable" });
  let output = input.replace(priority, `userMessage.priority = params._meta?.steering?.priority === "later" ? STEER_PRIORITY_LATER : params._meta?.steering?.priority === "now" ? STEER_PRIORITY_NOW : ((session.openUserInputs?.size ?? 0) > 0 ? STEER_PRIORITY_LATER : STEER_PRIORITY_NOW); ${MARKER}`);
  output = output.replace(capability, `steering: { supported: true, priorities: ["now", "later"] } ${MARKER}`);
  return { source: output, patched: true };
}

// Serialized into `node -e` on the remote host. No local module, filesystem,
// credentials or MCP process crosses this transport boundary.
function remoteBootstrap(patchClaudeSteeringSource) {
  const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const { createRequire } = require("node:module");
  const { pathToFileURL } = require("node:url");
  const { spawnSync } = require("node:child_process");
  const marker = "[dsh-acp-runtime] ";
  const spec = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));
  function fail(code, message) {
    const error = { type: "error", code, message, prepareRequired: code === "remote_prepare_required" };
    process.stderr.write(marker + JSON.stringify(error) + "\n");
    if (spec.action !== "start") process.stdout.write(JSON.stringify({ ok: false, error }) + "\n");
    process.exitCode = 2;
  }
  function expand(value) {
    return value === "~" ? os.homedir() : value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
  }
  function executable(value) {
    const expanded = expand(value);
    const candidates = expanded.includes("/") ? [expanded] : (process.env.PATH || "").split(path.delimiter).map(dir => path.join(dir, expanded));
    return candidates.find(file => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } });
  }
  (async () => {
    if (Number(process.versions.node.split(".")[0]) < 22) throw Object.assign(new Error("Remote ACP requires Node.js >=22; install/activate Node 22+ in the remote login shell, then retry"), { code: "remote_node_unsupported" });
    const root = expand(spec.runtimeDir);
    if (!path.isAbsolute(root)) throw Object.assign(new Error("remoteRuntimeDir must be absolute or ~/relative"), { code: "bad_remote_runtime_dir" });
    if (spec.action === "prepare") {
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      const npm = executable("npm");
      if (!npm) throw Object.assign(new Error("Remote npm is missing; install npm for Node 22+ before preparing ACP"), { code: "remote_npm_missing" });
      const packages = Object.entries(spec.packages).map(([name, version]) => name + "@" + (spec.installSpecs?.[name] || version));
      // Optional native CLI packages are required. Lifecycle scripts remain
      // disabled; no shell interpolation or automatic global installation.
      const installation = spawnSync(npm, ["install", "--prefix", root, "--ignore-scripts", "--include=optional", "--no-audit", "--no-fund", "--save-exact", ...packages], { stdio: ["ignore", 2, 2], timeout: 300000, env: process.env });
      if (installation.error || installation.status !== 0) throw Object.assign(new Error("Remote npm installation failed: " + (installation.error?.message || installation.status)), { code: "remote_prepare_failed" });
    }
    const adapterDir = path.join(root, "node_modules", spec.adapterPackage);
    const adapterEntry = path.join(adapterDir, spec.adapterEntry || "dist/index.js");
    const versions = {};
    for (const name of ["@agentclientprotocol/sdk", spec.adapterPackage]) {
      let manifest;
      try { manifest = JSON.parse(fs.readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")); }
      catch { throw Object.assign(new Error("Missing remote " + name + "; explicitly prepare the remote ACP runtime before starting"), { code: "remote_prepare_required" }); }
      versions[name] = manifest.version;
      if (manifest.version !== spec.packages[name]) throw Object.assign(new Error("Remote " + name + " must be " + spec.packages[name] + " (found " + manifest.version + "); explicitly prepare/update the remote ACP runtime"), { code: "remote_prepare_required" });
    }
    if (!fs.existsSync(adapterEntry)) throw Object.assign(new Error("Remote adapter entry missing; prepare the remote ACP runtime"), { code: "remote_prepare_required" });
    let steeringPriorities = [];
    if (spec.agent === "claude") {
      try {
        const file = path.join(adapterDir, "dist/v1/acp-agent.js");
        const before = fs.readFileSync(file, "utf8");
        const result = patchClaudeSteeringSource(before);
        if (result.source !== before) {
          const temporary = file + ".dsh-" + process.pid;
          fs.writeFileSync(temporary, result.source, { mode: fs.statSync(file).mode & 0o777 });
          fs.renameSync(temporary, file);
        }
        steeringPriorities = ["now", "later"];
      } catch (error) {
        process.stderr.write(marker + JSON.stringify({ type: "warning", code: "steering_patch_unavailable", message: String(error.message || error) }) + "\n");
      }
    }
    const cwd = fs.realpathSync(expand(spec.remotePath));
    if (!fs.statSync(cwd).isDirectory()) throw Object.assign(new Error("Remote workspace is not a directory"), { code: "remote_cwd_missing" });
    process.chdir(cwd);
    // Agent executable overrides come only from this validated launch request.
    delete process.env.CLAUDE_CODE_EXECUTABLE;
    delete process.env.CODEX_PATH;
    delete process.env.PI_ACP_PI_BIN;
    if (spec.agentPath) {
      const cli = executable(spec.agentPath);
      if (!cli) throw Object.assign(new Error("Remote agent executable not found: " + spec.agentPath), { code: "remote_agent_missing" });
      process.env[spec.envVar] = cli;
    } else if (spec.agent === "claude") {
      try {
        const helper = await import(pathToFileURL(path.join(adapterDir, "dist/claude-cli.js")).href);
        const cli = await helper.claudeCliPath();
        fs.accessSync(cli, fs.constants.X_OK);
      } catch (error) { throw Object.assign(new Error("Remote Claude native CLI missing; prepare with optional dependencies: " + error.message), { code: "remote_prepare_required" }); }
    } else if (spec.agent === "pi") {
      const cli = executable("pi");
      if (!cli) throw Object.assign(new Error("Remote Pi CLI is missing; install Pi 1.6.1+ on the remote host"), { code: "remote_prepare_required" });
      process.env.PI_ACP_PI_BIN = cli;
    } else {
      try { createRequire(adapterEntry).resolve("@openai/codex/bin/codex.js"); }
      catch { throw Object.assign(new Error("Remote Codex CLI dependency missing; prepare with optional dependencies"), { code: "remote_prepare_required" }); }
    }
    if (spec.agent === "codex") process.env.NO_BROWSER = "1";
    const ready = { type: "ready", runtimeTransport: "remote", cwd, runtimeDir: root, nodeVersion: process.versions.node, versions, agent: spec.agent, adapterEntry, steeringPriorities };
    if (spec.action !== "start") { process.stdout.write(JSON.stringify({ ok: true, ...ready }) + "\n"); return; }
    process.stderr.write(marker + JSON.stringify(ready) + "\n");
    process.argv = [process.execPath, adapterEntry];
    await import(pathToFileURL(adapterEntry).href);
  })().catch(error => fail(error.code && String(error.code).startsWith("remote_") ? error.code : "remote_preflight_failed", String(error.message || error)));
}

/** Pure command construction. It never connects or installs anything. */
export function buildRemoteAcpLaunchSpec(opts = {}) {
  const profile = asObject(opts.profile) || {};
  const agent = normalizeAgent(opts.agent || "claude");
  const def = ACP_AGENTS[agent];
  if (!def) throw new AcpError("Unsupported ACP agent", "unsupported_agent");
  const auth = String(profile.authMethod || (profile.keyPath ? "key" : "kerberos"));
  if (auth === "password") throw new AcpError("Remote ACP requires SSH key or Kerberos authentication", "password_unsupported");
  if (!["key", "kerberos"].includes(auth)) throw new AcpError("Unsupported SSH authentication", "bad_profile");
  if (!profile.host || !profile.user || /[\r\n\0]/.test(String(profile.host) + String(profile.user)) || String(profile.host).startsWith("-")) throw new AcpError("Invalid SSH host/user", "bad_profile");
  const port = Number(profile.port || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AcpError("Invalid SSH port", "bad_profile");
  const action = opts.action || "start";
  if (!["start", "probe", "prepare"].includes(action)) throw new AcpError("Invalid remote runtime action", "bad_request");
  const remotePath = String(opts.remotePath || "~");
  const runtimeDir = String(opts.remoteRuntimeDir || REMOTE_ACP_RUNTIME_DIR);
  if (![remotePath, runtimeDir].every(value => (value.startsWith("/") || value === "~" || value.startsWith("~/")) && !/[\0\r\n]/.test(value))) throw new AcpError("Remote paths must be absolute or ~/relative", "bad_remote_path");
  const payload = { action, agent, remotePath, runtimeDir, agentPath: String(opts.agentPath || ""), adapterPackage: def.adapterPackage, adapterEntry: def.adapterEntry || "dist/index.js", envVar: def.envVar, packages: REMOTE_ACP_PACKAGES, installSpecs: REMOTE_ACP_INSTALL_SPECS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  const source = "const patchClaudeSteeringSource=(" + patchClaudeSteeringSource.toString() + ");(" + remoteBootstrap.toString() + ")(patchClaudeSteeringSource)";
  const missingNode = REMOTE_RUNTIME_MARKER + JSON.stringify({ type: "error", code: "remote_node_missing", message: "Remote Node.js is missing; activate Node.js >=22 in the remote login shell, then explicitly prepare ACP" });
  // fd3 preserves protocol stdout; bash startup chatter is redirected to stderr.
  const script = "command -v node >/dev/null 2>&1 || { printf '%s\\n' " + posixQuote(missingNode) + " >&2; exit 127; }; exec 1>&3 3>&-; exec node -e " + posixQuote(source) + " " + posixQuote(encoded);
  const remoteCommand = "exec /bin/bash -ic " + posixQuote(script) + " 3>&1 1>&2";
  const args = ["-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=" + ACP_SSH_HOST_KEY_POLICY, "-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3"];
  if (profile.proxyJump) args.push("-J", String(profile.proxyJump));
  args.push("-p", String(port));
  if (auth === "kerberos") args.push("-o", "GSSAPIAuthentication=yes", "-o", "PreferredAuthentications=gssapi-with-mic");
  else if (profile.keyPath) args.push("-i", String(profile.keyPath));
  args.push("--", String(profile.user) + "@" + String(profile.host), remoteCommand);
  return { command: opts.sshPath || "ssh", args, remoteCommand, runtimeTransport: "remote", action, payload, bootstrapSource: source };
}

export function remoteAcpPreparationPlan(opts = {}) {
  const launch = buildRemoteAcpLaunchSpec({ ...opts, action: "prepare" });
  return { ...launch, requiresConfirmation: true, nodeRequirement: ">=22", installScripts: false, packages: Object.entries(REMOTE_ACP_PACKAGES).map(([name, version]) => name + "@" + (REMOTE_ACP_INSTALL_SPECS[name] || version)), description: "Install fixed ACP adapters in a private remote directory; npm network access is required. Agent credentials remain on the remote host." };
}

async function runRemoteAcpAction(opts, action) {
  if (opts.signal?.aborted) throw new AcpError("Remote ACP operation cancelled", "remote_cancelled");
  const launch = buildRemoteAcpLaunchSpec({ ...opts, action });
  const child = (opts.spawn || nodeSpawn)(launch.command, launch.args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", data => { stdout = (stdout + data).slice(-65536); });
  child.stderr.on("data", data => { stderr = (stderr + data).slice(-65536); });
  function kill() { try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {} }
  const cancelled = deferred();
  const onAbort = () => { kill(); cancelled.reject(new AcpError("Remote ACP operation cancelled", "remote_cancelled")); };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  if (opts.signal?.aborted) onAbort();
  const operation = new Promise((resolve, reject) => {
    child.on("error", error => reject(new AcpError(String(error.message || error), "remote_transport_error")));
    child.on("close", code => {
      const results = stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      const result = results.at(-1);
      if (code === 0 && result?.ok === true) resolve(result);
      else {
        const detail = parseRemoteRuntimeMessage(stderr, "error") || result?.error;
        const error = new AcpError(detail?.message || "Remote ACP " + action + " failed (exit " + code + "): " + stderr.slice(-2000), detail?.code || "remote_transport_error");
        error.prepareRequired = !!detail?.prepareRequired;
        reject(error);
      }
    });
  });
  try { return await withTimeout(Promise.race([operation, cancelled.promise]), opts.timeoutMs || (action === "prepare" ? 330000 : 30000), "Remote ACP " + action, kill); }
  finally { opts.signal?.removeEventListener("abort", onAbort); }
}

function parseRemoteRuntimeMessage(text, type) {
  for (const line of String(text).split(/\r?\n/).reverse()) {
    const offset = line.indexOf(REMOTE_RUNTIME_MARKER);
    if (offset < 0) continue;
    try { const value = JSON.parse(line.slice(offset + REMOTE_RUNTIME_MARKER.length)); if (value.type === type) return value; } catch {}
  }
  return null;
}

export function probeRemoteAcp(opts = {}) { return runRemoteAcpAction(opts, "probe"); }
export function prepareRemoteAcp(opts = {}, approval = {}) {
  if (approval.confirmed !== true) throw new AcpError("Remote installation requires explicit user confirmation", "confirmation_required");
  return runRemoteAcpAction(opts, "prepare");
}

export function supportsSessionAction(capabilities, action) {
  const value = capabilities?.agentCapabilities?.sessionCapabilities?.[action];
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeCapabilities(init) {
  const i = asObject(init) || {};
  const meta = asObject(i._meta) || {};
  const steeringMeta = asObject(meta.steering) || {};
  const priorities = Array.isArray(steeringMeta.priorities)
    ? [...new Set(steeringMeta.priorities.filter(value => value === "now" || value === "later"))] : [];
  return {
    protocolVersion: i.protocolVersion == null ? null : i.protocolVersion,
    agentCapabilities: asObject(i.agentCapabilities) || {},
    promptCapabilities: asObject(i.agentCapabilities?.promptCapabilities) || {},
    authMethods: Array.isArray(i.authMethods) ? i.authMethods : [],
    steering: { supported: steeringMeta.supported === true, protocol: steeringMeta.supported === true ? "_session/steering" : null,
      ...(priorities.length ? { priorities } : {}) },
    meta
  };
}

/**
 * 建立一条 ACP 连接。
 *
 * 返回 controller（在 adapter 启动后立即返回，连接生命周期在后台跑）：
 *   ready / prompt / steer / cancel / close / setConfig / setMode
 *
 * 可注入 `opts.connectImpl` 供纯单元测试替换（不启动子进程 / 不加载 SDK）。
 */
export async function connectAcp(opts) {
  if (opts.connectImpl) return await opts.connectImpl(opts);

  const sdk = opts.sdk || { client, ndJsonStream };
  const launch = opts.launchSpec;
  const transportReady = deferred();
  transportReady.promise.catch(() => {});
  let protocolCwd;
  const adapter = opts.spawn(launch.command, launch.args, {
    env: opts.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32"
  });

  const ready = deferred();
  const closeGate = deferred();
  const turns = [];
  let active = null;
  let context = null;
  let closing = false;
  let initialized = null;
  let stderrTail = "";

  function killAdapter(signal) {
    // Reclaim the owned SSH process group; remote adapters handle stdio EOF.
    if (process.platform !== "win32" && Number.isInteger(adapter.pid) && adapter.pid > 0) {
      try { process.kill(-adapter.pid, signal); return; } catch (e) { if (e.code === "ESRCH") return; }
    }
    try { adapter.kill(signal); } catch {}
  }

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
    stderrTail = (stderrTail + String(chunk)).slice(-16384);
    const message = parseRemoteRuntimeMessage(stderrTail, "ready");
    if (message && typeof message.cwd === "string" && message.cwd.startsWith("/")) {
      protocolCwd = message.cwd;
      transportReady.resolve(message);
    }
    const failure = parseRemoteRuntimeMessage(stderrTail, "error");
    if (failure) {
      const error = new AcpError(failure.message, failure.code || "remote_preflight_failed");
      error.prepareRequired = !!failure.prepareRequired;
      transportReady.reject(error); ready.reject(error);
    }
    try { if (opts.onStderr) opts.onStderr(String(chunk)); } catch (e) {}
  });
  adapter.on("error", function (err) {
    const e = new AcpError("ACP adapter 启动失败: " + String(err && err.message ? err.message : err) + (stderrTail ? " | stderr: " + stderrTail.slice(-1200) : ""), "adapter_spawn");
    transportReady.reject(e);
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
    transportReady.reject(e);
    ready.reject(e);
    failAll(e);
    try { opts.onFatal && opts.onFatal(e); } catch (e2) {}
  });

  const app = sdk.client({ name: "dsh-remote-ssh" })
    .onRequest("session/request_permission", async function (ctx) {
      const { params, requestId } = ctx;
      if (!opts.onPermission) return cancelledOutcome();
      return await opts.onPermission(params, requestId);
    })
    .onRequest("elicitation/create", async function (ctx) {
      if (!opts.onElicitation) return { action: "decline" };
      return await opts.onElicitation(ctx.params, ctx.requestId, ctx.signal);
    })
    .onRequest("*", async function (ctx) {
      const method = ctx && ctx.method ? ctx.method : "unknown";
      try { opts.onClientRequest && opts.onClientRequest(method, ctx && ctx.params); } catch (e) {}
      throw new AcpError("unsupported ACP client request: " + method, "unsupported_client_request");
    })
    .onNotification("session/update", function (ctx) {
      const notification = ctx.params;
      if (!closing && notification?.update) opts.onUpdate?.(notification.update, notification);
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

  const run = app.connectWith(stream, async function (ctx) {
    context = ctx;
    await transportReady.promise;
    initialized = await ctx.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: opts.clientCapabilities || ACP_CLIENT_CAPABILITIES
    });

    let sessionResponse;
    if (opts.titleSessionId) {
      if (!supportsSessionAction(initialized, "title")) throw new AcpError("Adapter does not advertise session title", "title_unsupported");
      // Metadata-only connection: never create/resume the target or replay its
      // history. The owner must dispose this transport (not close the session).
      sessionResponse = { sessionId: String(opts.titleSessionId) };
    } else if (opts.forkSessionId) {
      if (!supportsSessionAction(initialized, "fork")) throw new AcpError("Adapter does not advertise session fork", "fork_unsupported");
      opts.onForkSubmitted?.();
      sessionResponse = await ctx.request("session/fork", { sessionId: String(opts.forkSessionId), cwd: protocolCwd, mcpServers: [] });
      opts.onForkResponse?.(sessionResponse);
      if (typeof sessionResponse?.sessionId !== "string" || !sessionResponse.sessionId || sessionResponse.sessionId === String(opts.forkSessionId)) throw new AcpError("Fork must return a distinct real remote sessionId", "fork_invalid_response");
    } else if (opts.resumeSessionId) {
      const resumeParams = { sessionId: String(opts.resumeSessionId), cwd: protocolCwd, mcpServers: opts.mcpServers || [] };
      sessionResponse = await ctx.request("session/resume", resumeParams);
      sessionResponse = { ...(sessionResponse || {}), sessionId: String(opts.resumeSessionId) };
    } else {
      sessionResponse = await ctx.request("session/new", { cwd: protocolCwd, mcpServers: opts.mcpServers || [] });
    }
    if (!sessionResponse?.sessionId) throw new AcpError("Adapter omitted sessionId", "protocol_error");
    active = { sessionId: String(sessionResponse.sessionId) };

    const capabilities = normalizeCapabilities(initialized);
    ready.resolve({ sessionId: active.sessionId, sessionResponse, initialize: initialized, capabilities, protocolCwd });
    await closeGate.promise;
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
      turn.promise.catch(() => {});
      turns.push(turn);
      const response = Promise.resolve(context.request("session/prompt", { sessionId: active.sessionId, prompt: typeof text === "string" ? [{ type: "text", text }] : text }));
      response.then(function (res) {
        // JSON-RPC response is the sole completion authority for this request.
        if (!turn.settled) {
          turn.settled = true;
          turn.resolve({ stopReason: res && res.stopReason, response: res });
          const i = turns.indexOf(turn);
          if (i >= 0) turns.splice(i, 1);
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
    async steer(text, options = {}) {
      if (closing) throw new AcpError("ACP 会话已关闭", "closed");
      if (!context || !active) throw new AcpError("ACP 会话尚未就绪", "not_ready");
      if (normalizeCapabilities(initialized).steering.supported !== true) throw new AcpError("Adapter does not advertise native steering", "steering_unsupported");
      const prompt = typeof text === "string" ? [{ type: "text", text }] : text;
      if (!Array.isArray(prompt) || prompt.length === 0) throw new AcpError("Steering requires non-empty prompt content", "bad_prompt");
      const priority = options?.priority === "later" || options?.priority === "now" ? options.priority : null;
      // This is an independent acceptance request, not another prompt lifecycle.
      // Keep content blocks intact and leave idle-race content owned by the Host.
      return await context.request("_session/steering", {
        sessionId: active.sessionId,
        prompt,
        _meta: { steering: { idleBehavior: "promptRequired", ...(priority ? { priority } : {}) } }
      });
    },
    async cancel() {
      if (!context || !active) return false;
      await context.notify("session/cancel", { sessionId: active.sessionId });
      return true;
    },
    async setTitle(title) {
      if (closing || !context || !active) throw new AcpError("ACP session is not ready", "not_ready");
      if (!supportsSessionAction(initialized, "title")) throw new AcpError("Adapter does not advertise session title", "title_unsupported");
      return await context.request("session/set_title", { sessionId: active.sessionId, title });
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
    async dispose() { return await this.close({ preserve: true }); },
    async close(options) {
      if (closing) return;
      closing = true;
      transportReady.reject(new AcpError("ACP transport closed", "closed"));
      failAll(new AcpError("ACP transport closed", "closed"));
      if (!opts.titleSessionId && !(options && options.preserve) && context && active) {
        try {
          await withTimeout(
            context.request("session/close", { sessionId: active.sessionId }),
            DEFAULT_CLOSE_TIMEOUT_MS,
            "session/close"
          );
        } catch (e) { /* Always continue reclaiming the transport after a close error. */ }
      }
      closeGate.resolve();
      try { adapter.stdin.end(); } catch (e) {}
      try { await withTimeout(run, DEFAULT_CLOSE_TIMEOUT_MS, "adapter close"); } catch (e) {}
      killAdapter("SIGTERM");
      const killTimer = setTimeout(function () { killAdapter("SIGKILL"); }, 2000);
      if (killTimer.unref) killTimer.unref();
    }
  };
  return controller;
}

