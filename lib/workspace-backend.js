import { realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, posix } from 'node:path';
import { normalizeBackend, validateWorkspace } from './config.js';
import { error } from './ssh.js';
import { inside } from './files.js';

async function canonical(path) {
  try { return await realpath(path); }
  catch (e) { if (e.code === 'ENOENT') return resolve(path); throw e; }
}
/** The installed DSH SessionStore / header-only persistence contract is the sole identity source. */
export async function resolveSessionBackend({ sessionId, sessions, persistence, workspaces, runtime, bindings, selectBackend, capture = true }) {
  if (typeof sessionId !== 'string' || !sessionId) throw error('session_required', 'DSH sessionId is required');
  const header = sessions.get(sessionId)?.header ?? (await persistence?.stat(sessionId))?.header;
  if (!header) throw error('session_not_found', 'DSH Session not found');
  if (!header.cwd || !isAbsolute(header.cwd)) throw error('session_cwd_unknown', 'DSH Session has no absolute workspace path');
  const cwd = await canonical(header.cwd); const hits = [];
  for (const record of workspaces) {
    if (!record?.mirrorPath || !isAbsolute(record.mirrorPath)) continue;
    let root;
    try { root = await canonical(record.mirrorPath); }
    catch (e) {
      if (inside(record.mirrorPath, header.cwd) || inside(record.mirrorPath, cwd)) throw error('workspace_unavailable', 'The registered remote workspace path is unavailable');
      continue;
    }
    if (inside(root, cwd)) hits.push({ record, root });
  }
  hits.sort((a, b) => b.root.length - a.root.length);
  // Local Sessions never inspect an ACP store or validate unrelated remote configuration.
  if (!hits.length) return { ok: true, sessionId, cwd, remote: false, workspace: null, backend: normalizeBackend(), binding: null, remoteCwd: null, canonicalRemotePath: null };
  if (hits.length > 1 && hits[0].root === hits[1].root && hits[0].record.profileId !== hits[1].record.profileId) throw error('workspace_ambiguous', 'Several profiles claim this workspace');
  const { record, root } = hits[0]; const workspace = { ...validateWorkspace(record), mirrorPath: root };
  const suffix = relative(root, cwd).split('\\').join('/');
  const remoteCwd = suffix ? posix.join(workspace.remotePath, suffix) : workspace.remotePath;
  let selected = await bindings.get(sessionId);
  if (!selected) {
    // Reading workspace/session metadata is never a backend-selection command.
    // The classifier may identify a historical native Session, but must not
    // inherit any workspace default or create a durable binding.
    const backend = await selectBackend(sessionId, workspace);
    if (!backend) return { ok: true, sessionId, cwd, remote: true, selectionRequired: true, workspace, backend: null, binding: null, remoteCwd, canonicalRemotePath: null };
    if (backend.type !== 'dsh') throw error('backend_selection_required', 'Choose Claude or Codex explicitly for this Session');
    return { ok: true, sessionId, cwd, remote: true, selectionRequired: false, workspace, backend, binding: null, remoteCwd, canonicalRemotePath: null };
  }
  if (selected.workspaceId !== workspace.id || selected.profileId !== workspace.profileId || selected.cwd !== cwd || selected.configuredRemotePath !== remoteCwd) throw error('binding_mismatch', 'Workspace identity changed after this Session was bound');
  if (selected.backend.type === 'dsh') return { ok: true, sessionId, cwd, remote: true, selectionRequired: false, workspace, backend: selected.backend, binding: null, remoteCwd, canonicalRemotePath: null };
  const active = runtime.findActive(sessionId);
  const binding = active ? active.state() : runtime.list({ dshSessionId: sessionId })[0] || null;
  if (binding && (binding.agent !== selected.backend.type || binding.profileId !== workspace.profileId || await canonical(binding.cwd) !== cwd || binding.configuredRemotePath !== remoteCwd)) throw error('binding_mismatch', 'ACP identity does not match the authoritative DSH workspace');
  const backend = binding ? normalizeBackend({ type: binding.agent, permission: binding.permission, model: binding.config?.model || '', modeId: binding.config?.mode || '', remoteRuntimeDir: binding.remoteRuntimeDir || '' }) : selected.backend;
  const canonicalRemotePath = binding?.remotePath?.startsWith('/') ? posix.resolve(binding.remotePath, ...suffix.split('/').filter(Boolean).map(() => '..')) : null;
  return { ok: true, sessionId, cwd, remote: true, selectionRequired: false, workspace, backend, binding, remoteCwd, canonicalRemotePath };
}
export function runtimeOptions(resolved, profile) {
  if (resolved.selectionRequired) throw error('backend_selection_required', 'Choose Claude or Codex and permissions for this Session first');
  if (!resolved.remote || !resolved.backend || resolved.backend.type === 'dsh') throw error('backend_not_acp', 'Select Claude or Codex for this remote workspace');
  return { profile, profileId: profile.id, workspaceId: resolved.workspace.id, agent: resolved.backend.type,
    cwd: resolved.cwd, remotePath: resolved.remoteCwd, configuredRemotePath: resolved.remoteCwd, dshSessionId: resolved.sessionId,
    permission: resolved.backend.permission, model: resolved.backend.model, modeId: resolved.backend.modeId,
    remoteRuntimeDir: resolved.backend.remoteRuntimeDir || undefined };
}
export function normalizeAttachments(input, resolved) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 16) throw error('bad_attachment', 'At most 16 attachments are accepted');
  let textBytes = 0, imageBytes = 0;
  return input.map(value => {
    if (!value || typeof value !== 'object') throw error('bad_attachment', 'Invalid attachment');
    if (value.path !== undefined) throw error('attachment_snapshot_required', 'Path attachments must be resolved through the Session file snapshot service');
    if (typeof value.text === 'string') {
      textBytes += Buffer.byteLength(value.text); if (textBytes > 1048576) throw error('attachment_too_large', 'Text attachments exceed 1 MiB');
      return { name: String(value.name || 'attachment.txt').slice(0, 256), text: value.text, mimeType: String(value.mimeType || 'text/plain') };
    }
    if (value.type === 'image' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.mimeType) && typeof value.data === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data)) {
      const bytes = Buffer.from(value.data, 'base64'); imageBytes += bytes.length;
      if (!bytes.length || imageBytes > 2097152) throw error('attachment_too_large', 'Image attachments exceed 2 MiB');
      const valid = value.mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : value.mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : value.mimeType === 'image/gif' ? /^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii')) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
      if (!valid) throw error('bad_attachment', 'Image MIME does not match its content');
      return { type: 'image', mimeType: value.mimeType, data: value.data };
    }
    throw error('attachment_unsupported', 'Only Session paths, text, and PNG/JPEG/WebP/GIF images are supported');
  });
}
