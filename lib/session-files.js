/** Atomic, bounded publication for the session-scoped routes. No local fallback. */
export function sessionPublishCommand({ path, root, maxBytes, overwrite = false, expectedVersion, base64 = false }) {
  const quote = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const script = `import os,sys,tempfile,base64,json,stat,hashlib
p=os.path.abspath(os.path.expanduser(sys.argv[1])); root=os.path.realpath(os.path.expanduser(sys.argv[2])); limit=int(sys.argv[3]); overwrite=sys.argv[4]=='1'; encoded=sys.argv[5]=='1'
tmp=None
try:
 parent=os.path.realpath(os.path.dirname(p))
 if os.path.commonpath([root,parent])!=root or p==root: raise ValueError('path_outside_workspace')
 if os.path.islink(p): raise ValueError('symlink_write_refused')
 def stamp():
  try:
   s=os.stat(p,follow_symlinks=False)
   if not stat.S_ISREG(s.st_mode): raise ValueError('not_regular_file')
   return (s.st_ino,s.st_size,s.st_mtime_ns)
  except FileNotFoundError: return None
 before=stamp()
 if before is not None and not overwrite: raise ValueError('file_exists')
 def digest():
  h=hashlib.sha256()
  with open(p,'rb') as f:
   for chunk in iter(lambda:f.read(65536),b''): h.update(chunk)
  return 'sha256:'+h.hexdigest()
 if sys.argv[6]!='-' and (before is None or digest()!=sys.argv[6]): raise ValueError('file_conflict')
 data=sys.stdin.buffer.read((limit*4//3+8 if encoded else limit)+1)
 if encoded: data=base64.b64decode(data,validate=False)
 if len(data)>limit: raise ValueError('file_too_large')
 fd,tmp=tempfile.mkstemp(prefix='.dsh-upload-',dir=parent)
 with os.fdopen(fd,'wb') as f:
  f.write(data); f.flush(); os.fsync(f.fileno())
 if stamp()!=before or (sys.argv[6]!='-' and digest()!=sys.argv[6]): raise ValueError('file_conflict')
 if before is None:
  try: os.link(tmp,p)
  except FileExistsError: raise ValueError('file_exists')
  os.unlink(tmp); tmp=None
 else:
  os.chmod(tmp,stat.S_IMODE(os.stat(p,follow_symlinks=False).st_mode)); os.replace(tmp,p); tmp=None
 s=os.stat(p); print(json.dumps({'ok':True,'size':s.st_size,'mtimeMs':int(s.st_mtime)*1000,'version':'sha256:'+hashlib.sha256(data).hexdigest()}))
except Exception as e:
 print(json.dumps({'ok':False,'code':str(e),'error':str(e)})); sys.exit(1)
finally:
 if tmp:
  try: os.unlink(tmp)
  except OSError: pass
`;
  return ['python3', '-c', quote(script), quote(path), quote(root), String(maxBytes), overwrite ? '1' : '0', base64 ? '1' : '0', quote(expectedVersion || '-')].join(' ');
}
export function parsePublication(result) {
  const lines = String(result?.stdout || '').trim().split('\n');
  try { const out = JSON.parse(lines.at(-1)); if (typeof out.ok === 'boolean') return out; } catch {}
  return { ok: false, code: result?.code || 'file_write_failed', error: String(result?.error || result?.stderr || result?.message || 'Remote file publication failed') };
}
