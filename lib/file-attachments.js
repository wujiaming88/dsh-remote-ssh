import { createHash } from 'node:crypto';
import { error, quote } from './ssh.js';

export const ATTACHMENT_LIMIT = 64 * 1024 * 1024;
export const BATCH_ATTACHMENT_LIMIT = 256 * 1024 * 1024;
export const REFERENCE_TEXT_LIMIT = 64 * 1024;
const VERIFIED_REFERENCE = Symbol('Host-verified file reference');
export const isVerifiedAttachmentText = value => value?.[VERIFIED_REFERENCE] === true;
export function attachmentIdentity({ sessionId, uploadId, name }, { reference = false } = {}) {
  if (typeof sessionId !== 'string' || !sessionId) throw error('session_required', 'DSH sessionId is required');
  if (typeof uploadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) throw error('bad_attachment', 'A UUID uploadId is required');
  if (typeof name !== 'string' || !name || name.length > 4096) throw error('bad_attachment', 'An attachment filename is required');
  // Names are labels, never paths or shell fragments. Return the canonical label
  // so a later reference derives exactly the same file, including Unicode names.
  let safe = name.normalize('NFC').split(/[\\/]/).pop().replace(/[^\p{L}\p{N} ._()-]/gu, '_').trim();
  if (!safe || /^\.+$/.test(safe)) safe = 'attachment';
  if (/^[.-]/.test(safe)) safe = 'file-' + safe;
  while (Buffer.byteLength(safe) > 180) safe = Array.from(safe).slice(0, -1).join('');
  safe = safe.trimEnd();
  if (reference && (name !== safe || uploadId !== uploadId.toLowerCase())) throw error('bad_attachment', 'Use the canonical upload descriptor');
  const session = createHash('sha256').update(sessionId).digest('hex');
  return { uploadId: uploadId.toLowerCase(), name: safe, parts: ['.dsh-attachments', session, uploadId.toLowerCase(), safe] };
}

// All traversal/publication is relative to pinned, O_NOFOLLOW directory handles.
// A per-upload lock serializes retries across Host processes. Files are linked
// into place without replacement, only after the complete bounded body arrives.
const SCRIPT = `import os,sys,json,stat,hashlib,fcntl,re
act,rawroot,session,uid,name,limit,version=sys.argv[1:]; limit=int(limit)
fds=[]; tmp=None; parent=None
try:
 root=os.path.realpath(os.path.expanduser(rawroot))
 flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
 fd=os.open('/',flags); fds.append(fd); chain=[]
 for part in root.split('/'):
  if part:
   child=os.open(part,flags,dir_fd=fd); fds.append(child); chain.append((fd,part,child)); fd=child
 for part in ['.dsh-attachments',session,uid]:
  if act=='upload':
   try: os.mkdir(part,0o700,dir_fd=fd)
   except FileExistsError: pass
  child=os.open(part,flags,dir_fd=fd); fds.append(child); chain.append((fd,part,child)); fd=child
 parent=fd
 def unchanged():
  for ancestor,part,child in chain:
   a=os.stat(part,dir_fd=ancestor,follow_symlinks=False); b=os.fstat(child)
   if not stat.S_ISDIR(a.st_mode) or (a.st_dev,a.st_ino)!=(b.st_dev,b.st_ino): raise ValueError('attachment_path_changed')
 def digest():
  f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
  before=os.fstat(f)
  if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1:
   os.close(f); raise ValueError('not_regular_file')
  with os.fdopen(f,'rb') as stream:
   if before.st_size>limit: raise ValueError('file_too_large')
   h=hashlib.sha256(); size=0
   for chunk in iter(lambda:stream.read(65536),b''):
    size+=len(chunk)
    if size>limit: raise ValueError('file_too_large')
    h.update(chunk)
   after=os.fstat(stream.fileno()); current=os.stat(name,dir_fd=parent,follow_symlinks=False)
   if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or (after.st_dev,after.st_ino)!=(current.st_dev,current.st_ino): raise ValueError('file_conflict')
   return size,'sha256:'+h.hexdigest()
 if act=='upload':
  data=sys.stdin.buffer.read(limit+1)
  if len(data)>limit: raise ValueError('file_too_large')
  expected='sha256:'+hashlib.sha256(data).hexdigest()
  try: lock=os.open('.lock',os.O_CREAT|os.O_EXCL|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600,dir_fd=parent)
  except FileExistsError: lock=os.open('.lock',os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
  fds.append(lock)
  if not stat.S_ISREG(os.fstat(lock).st_mode) or os.fstat(lock).st_nlink!=1: raise ValueError('not_regular_file')
  fcntl.flock(lock,fcntl.LOCK_EX)
  unchanged()
  # A killed publisher can leave its bounded staging file, or the second
  # hardlink between publication and staging unlink. Recover only these two
  # shapes under the UUID lock; unknown files, symlinks and foreign hardlinks
  # are not removed. Every lookup stays relative to the pinned UUID directory.
  for item in os.listdir(parent):
   if item in ['.lock',name]: continue
   if not re.fullmatch(r'\\.pending-[0-9a-f]{32}',item): raise ValueError('file_conflict')
   stale=os.open(item,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
   try:
    s=os.fstat(stale)
    if not stat.S_ISREG(s.st_mode) or s.st_size>limit: raise ValueError('file_conflict')
    if s.st_nlink!=1:
     published=os.stat(name,dir_fd=parent,follow_symlinks=False)
     if s.st_nlink!=2 or not stat.S_ISREG(published.st_mode) or (s.st_dev,s.st_ino)!=(published.st_dev,published.st_ino): raise ValueError('file_conflict')
    current=os.stat(item,dir_fd=parent,follow_symlinks=False)
    if not stat.S_ISREG(current.st_mode) or (s.st_dev,s.st_ino,s.st_nlink)!=(current.st_dev,current.st_ino,current.st_nlink): raise ValueError('file_conflict')
    unchanged(); os.unlink(item,dir_fd=parent)
   finally: os.close(stale)
  try: size,actual=digest()
  except FileNotFoundError:
   tmp='.pending-'+os.urandom(16).hex()
   out=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=parent)
   with os.fdopen(out,'wb') as stream: stream.write(data); stream.flush(); os.fsync(stream.fileno())
   unchanged()
   os.link(tmp,name,src_dir_fd=parent,dst_dir_fd=parent,follow_symlinks=False)
   os.unlink(tmp,dir_fd=parent); tmp=None
   size,actual=digest()
  if actual!=expected or size!=len(data): raise ValueError('file_conflict')
 elif act=='reference':
  size,actual=digest()
  if actual!=version: raise ValueError('file_conflict')
 else: raise ValueError('unsupported_operation')
 unchanged()
 print(json.dumps({'ok':True,'size':size,'version':actual,'remotePath':os.path.join(root,'.dsh-attachments',session,uid,name)}))
except Exception as e:
 print(json.dumps({'ok':False,'code':str(e) if isinstance(e,ValueError) else 'attachment_io_error','error':str(e)})); sys.exit(1)
finally:
 if tmp is not None:
  try: os.unlink(tmp,dir_fd=parent)
  except OSError: pass
 for fd in reversed(fds): os.close(fd)
`;
export function attachmentCommand({ action, root, identity, version }) {
  return ['python3', '-c', SCRIPT, action, root, identity.parts[1], identity.uploadId, identity.name, String(ATTACHMENT_LIMIT), version || '-'].map(quote).join(' ');
}
export function attachmentText(attachment) {
  return { [VERIFIED_REFERENCE]: true, type: 'text', name: attachment.name, remotePath: attachment.remotePath, size: attachment.size,
    text: 'Uploaded file (reference only; not automatically extracted or executed):\n' + JSON.stringify({ name: attachment.name, remotePath: attachment.remotePath, size: attachment.size }) };
}
