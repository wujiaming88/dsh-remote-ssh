import { resolve, relative, isAbsolute, join, basename } from 'node:path';
import { error, quote, remotePath } from './ssh.js';
import { sessionPublishCommand, parsePublication } from './session-files.js';

export const TEXT_LIMIT = 4 * 1024 * 1024;
export const TRANSFER_LIMIT = 64 * 1024 * 1024;
export const inside = (root, path) => { const rel = relative(root, path); return rel === '' || !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'); };
const FILE_SCRIPT = `import os,sys,json,stat,base64,hashlib
act,path,root,limit=sys.argv[1:]; limit=int(limit); path=os.path.abspath(os.path.expanduser(path)); root=os.path.realpath(os.path.expanduser(root)) if root else None
try:
 canonical=os.path.realpath(path)
 if root and os.path.commonpath([root,canonical])!=root: raise ValueError('path_outside_workspace')
 s=os.lstat(path)
 kind='symlink' if stat.S_ISLNK(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'file' if stat.S_ISREG(s.st_mode) else 'other'
 out={'ok':True,'path':path,'canonicalPath':canonical,'type':kind,'size':s.st_size,'mtimeMs':int(s.st_mtime)*1000}
 if act=='list':
  if not os.path.isdir(path): raise ValueError('not_directory')
  entries=[]; truncated=False
  with os.scandir(path) as items:
   for e in items:
    if len(entries)>=2000: truncated=True; break
    try:
     st=e.stat(follow_symlinks=False); typ='symlink' if e.is_symlink() else 'directory' if e.is_dir() else 'file'
     entries.append({'name':e.name,'path':e.path,'type':typ,'size':st.st_size})
    except FileNotFoundError: pass
  out.update(entries=sorted(entries,key=lambda e:(e['type']!='directory',e['name'])),truncated=truncated)
 elif act=='read':
  if kind!='file': raise ValueError('not_regular_file')
  with open(path,'rb') as f: data=f.read(limit+1)
  if len(data)>limit: raise ValueError('file_too_large')
  out.update(data=base64.b64encode(data).decode('ascii'),version='sha256:'+hashlib.sha256(data).hexdigest())
 elif act!='stat': raise ValueError('unsupported_operation')
 print(json.dumps(out))
except Exception as e: print(json.dumps({'ok':False,'code':str(e) if isinstance(e,ValueError) else 'file_io_error','error':str(e)})); sys.exit(1)
`;
export async function runPython(ssh, profile, script, args, options = {}) {
  const command = "command -v python3 >/dev/null 2>&1 || { printf '%s\\n' " + quote(JSON.stringify({ ok: false, code: 'remote_python_missing', error: 'Remote Python 3 is required for workspace files and worktree operations' })) + "; exit 127; }; python3 -c " + quote(script) + ' ' + args.map(quote).join(' ');
  const result = await ssh.run(profile, command, options);
  try { const parsed = JSON.parse(result.stdout.trim()); if (typeof parsed.ok === 'boolean') return parsed; } catch {}
  throw error(result.code || 'remote_protocol_error', result.error || 'Remote command did not return a valid bounded JSON result');
}
export function createFiles({ ssh, configuration, resolveSession }) {
  const mutations = new Map();
  function mutate(target, operation) {
    const key = target.binding.workspace.id + '|' + target.path;
    const task = (mutations.get(key) || Promise.resolve()).then(operation);
    const tail = task.catch(() => {}); mutations.set(key, tail);
    tail.then(() => { if (mutations.get(key) === tail) mutations.delete(key); });
    return task;
  }
  async function target(args) {
    const binding = await resolveSession(args.sessionId);
    if (!binding.remote) throw error('not_remote_workspace', 'The Session does not belong to a remote workspace');
    const raw = args.path ?? '.';
    if (typeof raw !== 'string' || !raw || raw.includes('\0')) throw error('invalid_path', 'A file path is required');
    const path = resolve(binding.cwd, raw);
    if (!inside(binding.workspace.mirrorPath, path)) throw error('path_outside_workspace', 'The path is outside this Session workspace');
    const rel = relative(binding.workspace.mirrorPath, path).split('\\').join('/');
    const root = binding.canonicalRemotePath || binding.workspace.remotePath;
    const remote = root.replace(/\/+$/, '') + (rel ? '/' + rel : '') || '/';
    return { binding, profile: configuration.profile(binding.workspace.profileId), path, remotePath: remotePath(remote), root };
  }
  async function readTarget(t, action, limit) { return runPython(ssh, t.profile, FILE_SCRIPT, [action, t.remotePath, t.root, String(limit)], { maxBytes: Math.ceil(limit * 1.4) + 1024 * 1024 }); }
  async function sessionFiles(args) {
    const t = await target(args); const action = args.action || 'stat'; let result;
    if (action === 'write') {
      if (t.binding.archived) throw error('session_archived', 'Archived Sessions cannot write files');
      if (t.path === t.binding.workspace.mirrorPath) throw error('invalid_path', 'Cannot overwrite the workspace root');
      if (typeof args.content !== 'string' || Buffer.byteLength(args.content) > TEXT_LIMIT) throw error('file_too_large', 'Text writes are limited to 4 MiB');
      if (args.expectedVersion !== undefined && !/^sha256:[0-9a-f]{64}$/.test(args.expectedVersion)) throw error('invalid_version', 'expectedVersion must come from sessionFiles.read');
      const command = sessionPublishCommand({ path: t.remotePath, root: t.root, maxBytes: TEXT_LIMIT, overwrite: args.expectedVersion !== undefined, expectedVersion: args.expectedVersion, base64: true });
      result = await mutate(t, async () => parsePublication(await ssh.run(t.profile, command, { input: Buffer.from(args.content).toString('base64') })));
    } else {
      result = await readTarget(t, action, TEXT_LIMIT);
      if (result.ok && action === 'read') {
        const bytes = Buffer.from(result.data, 'base64'); delete result.data;
        result.binary = bytes.includes(0); result.content = '';
        try { result.content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { result.binary = true; }
        if (result.binary) result.content = '';
        result.truncated = false;
      }
      if (result.ok && action === 'list') result.entries = result.entries.map(entry => ({ ...entry, path: join(t.path, entry.name) }));
    }
    return { ...result, sessionId: args.sessionId, workspaceId: t.binding.workspace.id, path: t.path, remotePath: t.remotePath, source: 'remote' };
  }
  async function listDir(args) {
    const profile = configuration.profile(args.profileId);
    return runPython(ssh, profile, FILE_SCRIPT, ['list', remotePath(args.path || profile.remoteRoot), '', String(TEXT_LIMIT)]);
  }
  async function upload(args, bytes) {
    const t = await target(args);
    if (t.binding.archived) throw error('session_archived', 'Archived Sessions cannot upload');
    if (bytes.length > TRANSFER_LIMIT) throw error('file_too_large', 'Upload limit is 64 MiB');
    const command = sessionPublishCommand({ path: t.remotePath, root: t.root, maxBytes: TRANSFER_LIMIT, overwrite: args.overwrite === true, expectedVersion: args.expectedVersion });
    const result = await mutate(t, async () => parsePublication(await ssh.run(t.profile, command, { input: bytes, timeoutMs: 120000 })));
    return { ...result, path: t.path, remotePath: t.remotePath, sessionId: args.sessionId };
  }
  async function download(args) {
    const t = await target(args); const result = await readTarget(t, 'read', TRANSFER_LIMIT);
    if (!result.ok) throw error(result.code, result.error);
    const data = Buffer.from(result.data, 'base64');
    const ext = basename(t.path).split('.').pop().toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'application/octet-stream';
    return { data, name: basename(t.path), mime, inline: args.inline === true && mime.startsWith('image/') };
  }
  async function snapshotAttachment(args) {
    const t = await target(args); const result = await readTarget(t, 'read', TEXT_LIMIT);
    if (!result.ok) throw error(result.code, result.error);
    const bytes = Buffer.from(result.data, 'base64'); const name = basename(t.path);
    const mimeType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[name.split('.').pop().toLowerCase()];
    if (mimeType) {
      if (bytes.length > 2097152) throw error('attachment_too_large', 'Image path attachments are limited to 2 MiB');
      return { type: 'image', mimeType, name, data: bytes.toString('base64') };
    }
    if (bytes.length > 1048576) throw error('attachment_too_large', 'Text path attachments are limited to 1 MiB');
    if (bytes.includes(0)) throw error('attachment_unsupported', 'This binary file cannot be attached');
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw error('attachment_unsupported', 'Only UTF-8 text and supported raster images can be attached'); }
    return { name, mimeType: 'text/plain', text };
  }
  return { sessionFiles, listDir, upload, download, snapshotAttachment };
}
