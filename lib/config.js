import z from '@deepseek-ai/schemastery';
import { isAbsolute } from 'node:path';
import { error, remotePath, validateProfile } from './ssh.js';

export const CONFIG_VERSION = 3;
const Backend = z.object({ type: z.union(['claude', 'codex']).default('claude'), permission: z.string().default('acceptEdits'), model: z.string().default(''), modeId: z.string().default(''), remoteRuntimeDir: z.string().default('') });
const Worktree = z.object({ repo: z.string().default(''), path: z.string().default(''), branch: z.string().default(''), owned: z.boolean().default(false) });
const Profile = z.object({ id: z.string(), name: z.string(), host: z.string(), user: z.string(), port: z.number().default(22), authMethod: z.string().default('key'), keyPath: z.string().default(''), proxyJump: z.string().default(''), remoteRoot: z.string().default('~') });
const Workspace = z.object({ id: z.string(), profileId: z.string(), title: z.string(), remotePath: z.string(), mirrorPath: z.string(), shellWorkspaceId: z.string().default(''), backend: Backend.default({ type: 'claude', permission: 'acceptEdits', model: '', modeId: '', remoteRuntimeDir: '' }), worktree: Worktree.default({ repo: '', path: '', branch: '', owned: false }) });
/** All mutable configuration lives in volatile references; edits do not restart the runtime. */
export const Config = z.object({ schemaVersion: z.number().default(CONFIG_VERSION).volatile(), profiles: z.array(Profile).default([]).volatile(), workspacesV3: z.array(Workspace).default([]).volatile() });

export function normalizeBackend(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('invalid_backend', 'backend must be an object');
  if (Object.keys(input).some(key => !['type', 'permission', 'model', 'modeId', 'remoteRuntimeDir'].includes(key))) throw error('backend_schema_unsupported', 'Unknown backend configuration fields');
  const value = { type: input.type ?? 'dsh', permission: input.permission ?? 'acceptEdits', model: input.model ?? '', modeId: input.modeId ?? '', remoteRuntimeDir: input.remoteRuntimeDir ?? '' };
  if (!['dsh', 'claude', 'codex'].includes(value.type) || !['plan', 'acceptEdits', 'bypass'].includes(value.permission)) throw error('invalid_backend', 'Invalid backend type or permission');
  for (const key of ['model', 'modeId', 'remoteRuntimeDir']) if (typeof value[key] !== 'string' || /[\0\r\n]/.test(value[key]) || value[key].length > 1024) throw error('invalid_backend', 'Invalid backend ' + key);
  if (value.remoteRuntimeDir) remotePath(value.remoteRuntimeDir);
  return value;
}
export function normalizeRemoteBackend(input = {}) {
  const backend = normalizeBackend({ type: 'claude', ...input });
  if (!['claude', 'codex'].includes(backend.type)) throw error('invalid_remote_backend', 'Remote workspaces require Claude or Codex; native DSH belongs to local workspaces');
  return backend;
}
export function normalizeWorktreeRecord(value) {
  if (value == null || value.owned === false) return null;
  if (value.owned !== true || !value.repo?.startsWith('/') || !value.path?.startsWith('/') || value.path === value.repo || !value.branch || /[\0\r\n]/.test(value.repo + value.path + value.branch)) throw error('invalid_worktree_record', 'Invalid owned worktree record');
  return { repo: value.repo, path: value.path, branch: value.branch, owned: true };
}
export function validateWorkspace(value) {
  if (!value || !['id', 'profileId', 'title', 'mirrorPath'].every(key => typeof value[key] === 'string' && value[key]) || !isAbsolute(value.mirrorPath)) throw error('invalid_workspace', 'Invalid workspace record');
  return { id: value.id, profileId: value.profileId, title: value.title, mirrorPath: value.mirrorPath, shellWorkspaceId: value.shellWorkspaceId || '', remotePath: remotePath(value.remotePath), backend: normalizeRemoteBackend(value.backend), ...(normalizeWorktreeRecord(value.worktree) ? { worktree: normalizeWorktreeRecord(value.worktree) } : {}) };
}
export function publicProfile(value) { return validateProfile(value); }
export function createConfiguration(ctx, config) {
  for (const key of ['schemaVersion', 'profiles', 'workspacesV3']) if (typeof config[key]?.get !== 'function') throw error('configuration_contract', 'Modern DSH volatile configuration is required');
  function snapshot() {
    if (config.schemaVersion.get() !== CONFIG_VERSION) throw error('configuration_schema_unsupported', 'Unsupported remote SSH configuration version');
    return { schemaVersion: CONFIG_VERSION, profiles: structuredClone(config.profiles.get()), workspaces: structuredClone(config.workspacesV3.get()) };
  }
  let tail = Promise.resolve();
  function update(change) {
    const task = tail.then(async () => {
      const before = snapshot(); const next = await change(before);
      next.profiles = next.profiles.map(validateProfile); next.workspaces = next.workspaces.map(validateWorkspace);
      if (!ctx.fiber.entry || !ctx.configEditor?.edit) throw error('configuration_unavailable', 'The profile config editor is unavailable');
      await ctx.configEditor.edit(ctx.fiber.entry, current => ({ ...current, schemaVersion: CONFIG_VERSION, profiles: next.profiles, workspacesV3: next.workspaces }));
      return snapshot();
    });
    tail = task.catch(() => {}); return task;
  }
  return { snapshot, update, profile(id) { const found = snapshot().profiles.find(p => p.id === id); if (!found) throw error('profile_not_found', 'SSH profile not found'); return validateProfile(found); } };
}
