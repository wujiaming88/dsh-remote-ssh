import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { error, remotePath, quote } from './ssh.js';
import { normalizeWorktreeRecord, validateWorkspace } from './config.js';
import { inside } from './files.js';
import { runPython } from './files.js';

const WORKTREE_SCRIPT = `import os,sys,subprocess,json
act,repo,branch,base=sys.argv[1:]; repo=os.path.realpath(os.path.expanduser(repo))
def git(*args): return subprocess.run(['git','-C',repo,*args],capture_output=True,text=True,timeout=50)
try:
 root=git('rev-parse','--show-toplevel')
 if root.returncode: raise ValueError(root.stderr.strip() or 'Not a Git repository')
 repo=root.stdout.strip()
 if act=='list':
  r=git('worktree','list','--porcelain','-z'); entries=[]; item={}
  if r.returncode: raise ValueError(r.stderr)
  for field in r.stdout.split('\\0'):
   if field.startswith('worktree '):
    if item: entries.append(item)
    item={'path':field[9:],'branch':''}
   elif field.startswith('branch '): item['branch']=field[18:] if field.startswith('branch refs/heads/') else field[7:]
  if item: entries.append(item)
  print(json.dumps({'ok':True,'repo':repo,'worktrees':entries}))
 else:
  valid=git('check-ref-format','--branch',branch)
  if valid.returncode: raise ValueError('Invalid Git branch')
  path=os.path.join(os.path.dirname(repo),os.path.basename(repo)+'-'+branch.replace('/','-'))
  existing=git('show-ref','--verify','--quiet','refs/heads/'+branch).returncode==0
  args=['worktree','add']+([] if existing else ['-b',branch])+['--',path]+([branch] if existing else [base] if base else [])
  result=git(*args)
  out={'repo':repo,'path':path,'branch':branch,'owned':result.returncode==0}
  if result.returncode: print(json.dumps({'ok':False,'code':'worktree_create_failed','error':result.stderr.strip(),'worktreeCreated':None,'recovery':out})); sys.exit(1)
  print(json.dumps({'ok':True,**out}))
except Exception as e: print(json.dumps({'ok':False,'code':'worktree_failed','error':str(e)})); sys.exit(1)
`;
export function requireBypassConfirmation(args, next, previous) {
  if (next.permission === 'bypass' && previous?.permission !== 'bypass' && args.confirmBypass !== true) throw error('confirmation_required', 'Bypass permissions require explicit user confirmation');
}
export function createWorkspaces({ configuration, registry, runtime, ssh, stateDir }) {
  const removing = new Set(); let tail = Promise.resolve();
  const serialize = action => { const task = tail.then(action); tail = task.catch(() => {}); return task; };
  const matches = (record, ws) => record.profileId === ws.profileId && (record.workspaceId === ws.id || record.cwd && inside(ws.mirrorPath, record.cwd));
  const remoteUnconfirmed = record => !!record.remoteExecution && record.remoteExecution.taskStatus !== 'closed';
  const running = record => remoteUnconfirmed(record) || record.alive || record.status === 'starting' || record.busy || record.pendingTurns > 0 || record.pendingPermissions?.length || record.pendingElicitations?.length;
  function requireRemoteTermination(records) {
    const pending = records.filter(remoteUnconfirmed);
    if (pending.length) throw Object.assign(error('remote_execution_active', 'Durable remote Sessions may still be running. Explicitly close them and confirm remote termination before removing their recovery configuration'), { details: { activeSessionIds: pending.map(record => record.id) } });
  }
  async function shutdown(ws) {
    const records = runtime.list({}).filter(record => matches(record, ws));
    requireRemoteTermination(records);
    for (const record of records) await runtime.shutdownSession(record.id, { reason: 'workspace-unregistered' });
  }
  function assertAvailable(id) { if (removing.has(id)) throw error('workspace_removing', 'Workspace is being removed'); }
  async function register(args, owned) {
    const profile = configuration.profile(args.profileId); remotePath(args.remotePath);
    const previous = configuration.snapshot().workspaces.find(w => w.profileId === profile.id && w.remotePath === args.remotePath);
    if (Object.hasOwn(args, 'backend')) throw error('workspace_backend_unsupported', 'Choose the Agent and permissions when creating a Session, not on the workspace');
    const id = previous?.id || randomUUID(); const directory = previous?.mirrorPath || join(stateDir, 'workspaces', id);
    await mkdir(directory, { recursive: true });
    const title = String(args.title || previous?.title || args.remotePath.split('/').filter(Boolean).pop() || profile.name);
    const native = await registry.create(directory, title);
    const mirrorPath = native.path;
    if (native.title !== title) await native.setTitle(title);
    const workspace = validateWorkspace({ id, profileId: profile.id, title, remotePath: args.remotePath, mirrorPath, shellWorkspaceId: native.id, ...(previous?.backend ? { backend: previous.backend } : {}), worktree: owned || previous?.worktree });
    const result = await configuration.update(snapshot => ({ ...snapshot, workspaces: [...snapshot.workspaces.filter(w => w.id !== id), workspace] }));
    return { ok: true, workspace, workspaceId: native.id, mirrorPath, workspaces: result.workspaces, reused: !!previous };
  }
  async function create(args) {
    return serialize(async () => {
      if (Object.hasOwn(args, 'backend')) throw error('workspace_backend_unsupported', 'Choose the Agent and permissions when creating a Session, not on the workspace');
      if (!args.worktree) return register(args);
      const { branch, base = '' } = args.worktree;
      if (typeof branch !== 'string' || !branch || branch.startsWith('-') || /[\0\r\n]/.test(branch) || typeof base !== 'string' || base.startsWith('-') || /[\0\r\n]/.test(base)) throw error('invalid_worktree', 'Invalid worktree branch/base');
      const created = await runPython(ssh, configuration.profile(args.profileId), WORKTREE_SCRIPT, ['create', remotePath(args.remotePath), branch, base], { timeoutMs: 60000 });
      if (!created.ok) return created;
      const worktree = normalizeWorktreeRecord(created);
      try { return { ...await register({ ...args, remotePath: created.path }, worktree), worktreeCreated: true, worktree }; }
      catch (e) { return { ok: false, code: 'worktree_registration_failed', error: e.message, worktreeCreated: true, recovery: worktree }; }
    });
  }
  async function unregister(ws) {
    await shutdown(ws);
    if (ws.shellWorkspaceId && registry.get(ws.shellWorkspaceId)) await registry.delete(ws.shellWorkspaceId);
    const result = await configuration.update(snapshot => ({ ...snapshot, workspaces: snapshot.workspaces.filter(w => w.id !== ws.id) }));
    return { ok: true, workspaces: result.workspaces, historyPreserved: true, filesPreserved: true };
  }
  async function remove(args) {
    return serialize(async () => {
      const ws = configuration.snapshot().workspaces.find(w => w.id === args.id);
      if (!ws) return { ok: true, workspaces: configuration.snapshot().workspaces };
      removing.add(ws.id); try { return await unregister(ws); } finally { removing.delete(ws.id); }
    });
  }
  async function removeWorktree(args) {
    return serialize(async () => {
      const ws = configuration.snapshot().workspaces.find(w => w.id === args.workspaceId);
      if (!ws) throw error('workspace_not_found', 'Workspace not found');
      const owned = normalizeWorktreeRecord(ws.worktree);
      if (!owned || owned.path !== ws.remotePath) throw error('worktree_not_owned', 'Only a recorded owned worktree can be removed');
      if (args.confirm !== true) throw error('confirmation_required', 'Removing the remote worktree requires explicit confirmation');
      removing.add(ws.id);
      try {
        const active = runtime.list({}).filter(r => matches(r, ws) && running(r));
        if (active.length) return { ok: false, code: 'worktree_active', error: 'Stop and archive the running Sessions first', activeSessionIds: active.map(r => r.id) };
        const profile = configuration.profile(ws.profileId);
        const list = await runPython(ssh, profile, WORKTREE_SCRIPT, ['list', owned.repo, '', '']);
        if (!list.ok) return list;
        if (list.worktrees[0]?.path === owned.path || !list.worktrees.some(w => w.path === owned.path && w.branch === owned.branch)) throw error('worktree_binding_mismatch', 'Git worktree registration no longer matches the owned record');
        const result = await ssh.run(profile, 'git -C ' + quote(owned.repo) + ' worktree remove -- ' + quote(owned.path), { timeoutMs: 60000 });
        if (!result.ok) return { ok: false, code: 'worktree_remove_failed', error: result.error, worktreeRemoved: false };
        try { return { ...await unregister(ws), worktreeRemoved: true, branchPreserved: true }; }
        catch (e) { return { ok: false, code: 'worktree_unregister_failed', error: e.message, worktreeRemoved: true, recovery: { ...owned, workspaceId: ws.id } }; }
      } finally { removing.delete(ws.id); }
    });
  }
  async function update(args) {
    return serialize(async () => {
      const ws = configuration.snapshot().workspaces.find(w => w.id === args.id);
      if (!ws) throw error('workspace_not_found', 'Workspace not found');
      if (args.remotePath !== undefined && args.remotePath !== ws.remotePath) throw error('workspace_path_immutable', 'Create another workspace instead of changing its identity');
      if (Object.hasOwn(args, 'backend')) throw error('workspace_backend_unsupported', 'Workspace backend settings are read-only legacy metadata; choose the Agent per Session');
      const next = validateWorkspace({ ...ws, title: args.title || ws.title });
      const native = registry.get(ws.shellWorkspaceId); if (native && args.title) await native.setTitle(next.title);
      const result = await configuration.update(snapshot => ({ ...snapshot, workspaces: snapshot.workspaces.map(w => w.id === next.id ? next : w) }));
      return { ok: true, workspace: next, workspaces: result.workspaces };
    });
  }
  async function removeProfile(args) {
    return serialize(async () => {
      const all = configuration.snapshot(); const owned = all.workspaces.filter(w => w.profileId === args.id);
      for (const ws of owned) removing.add(ws.id);
      try {
        const records = runtime.list({}).filter(record => record.profileId === args.id);
        requireRemoteTermination(records);
        for (const record of records) await runtime.shutdownSession(record.id, { reason: 'profile-unregistered' });
        for (const ws of owned) if (ws.shellWorkspaceId && registry.get(ws.shellWorkspaceId)) await registry.delete(ws.shellWorkspaceId);
        const result = await configuration.update(snapshot => ({ ...snapshot, profiles: snapshot.profiles.filter(p => p.id !== args.id), workspaces: snapshot.workspaces.filter(w => w.profileId !== args.id) }));
        return { ok: true, profiles: result.profiles, workspaces: result.workspaces, historyPreserved: true, filesPreserved: true };
      } finally { for (const ws of owned) removing.delete(ws.id); }
    });
  }
  return { create, update, remove, removeWorktree, removeProfile, assertAvailable };
}
