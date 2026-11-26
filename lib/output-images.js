/** Read-only remote output images for the DSH remote Session plugin.
 *
 * A rendered assistant message may reference a remote file (for example an
 * authorization QR code) with inline Markdown such as `![授权二维码](/tmp/lark-auth-qr.png)`.
 * The browser fetches it through `GET /remote-ssh/v3/output-image?...`; this backend
 * proves that the referenced path appears verbatim in the recorded assistant text,
 * then reads the file read-only over SSH. It never widens the existing files
 * sandbox, never reads Host-local paths, and never starts/resumes/cancels ACP work.
 */
import { posix } from 'node:path';
import { error, quote } from './ssh.js';

export const OUTPUT_IMAGE_LIMIT = 8 * 1024 * 1024;
const READ_TIMEOUT_MS = 30000;
const MAX_SEQ_SPAN = 8192;

/** Minimal, conservative Markdown image parser (no src/client import). */
const IMAGE_REFERENCE_RE = /!\[([^\]]*)\]\(([^)]*)\)/g;

/**
 * action='read', no workspace-root restriction, but the remote side must still
 * realpath + lstat the file: no symlink (final or intermediate), no directory,
 * a regular file only, and a bounded read. The path is server-side; /tmp here is
 * the remote /tmp, not the Host /tmp.
 */
const READ_SCRIPT = `import os,sys,json,stat,base64
act,path,limit=sys.argv[1:]; limit=int(limit); path=os.path.abspath(os.path.expanduser(path))
try:
 canonical=os.path.realpath(path)
 s=os.lstat(path)
 kind='symlink' if stat.S_ISLNK(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'file' if stat.S_ISREG(s.st_mode) else 'other'
 out={'ok':True,'path':path,'canonicalPath':canonical,'type':kind,'size':s.st_size}
 if act=='read':
  if kind!='file': raise ValueError('not_regular_file')
  if canonical!=path: raise ValueError('path_through_symlink')
  with open(path,'rb') as f: data=f.read(limit+1)
  if len(data)>limit: raise ValueError('file_too_large')
  out.update(data=base64.b64encode(data).decode('ascii'))
 else: raise ValueError('unsupported_operation')
 print(json.dumps(out))
except Exception as e: print(json.dumps({'ok':False,'code':str(e) if isinstance(e,ValueError) else 'image_io_error','error':str(e)})); sys.exit(1)
`;

function eventOrigin(event) {
  return [event.sessionId, event.turnId, event.messageId, event.parentToolCallId].map(value => value || '').join('|');
}

function imageMimeType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function validateArgs(args) {
  if (!args || typeof args !== 'object') throw error('invalid_image_request', 'Output image request arguments are required');
  if (typeof args.id !== 'string' || !args.id) throw error('invalid_image_request', 'An ACP Session id is required');
  if (typeof args.dshSessionId !== 'string' || !args.dshSessionId) throw error('invalid_image_request', 'A DSH Session identity is required');
  if (typeof args.turnId !== 'string' || !args.turnId || args.turnId.length > 1024) throw error('invalid_image_request', 'A bounded turn identity is required');
  if (typeof args.generation !== 'string' || !args.generation) throw error('invalid_image_request', 'An ACP event generation is required');
  if (!Number.isSafeInteger(args.fromSeq) || !Number.isSafeInteger(args.throughSeq)
      || args.fromSeq < 1 || args.fromSeq > args.throughSeq || args.throughSeq - args.fromSeq >= MAX_SEQ_SPAN) throw error('invalid_image_request', 'fromSeq and throughSeq must satisfy 1 <= fromSeq <= throughSeq and span fewer than 8192 events');
  if (typeof args.sourceSessionId !== 'string' || !args.sourceSessionId) throw error('invalid_image_request', 'The source ACP Session identity is required');
  if (typeof args.href !== 'string' || !args.href || args.href.length > 4096 || /[\0\r\n]/.test(args.href)) throw error('invalid_image_request', 'A bounded image reference path is required');
}

function parseImageDestination(raw) {
  const value = String(raw).trim();
  if (!value) return null;
  if (value.startsWith('<')) {
    const end = value.indexOf('>');
    return end === -1 ? null : value.slice(1, end);
  }
  const found = /^([^\s"'()]+)/.exec(value);
  return found ? found[1] : null;
}

/** Return every `![alt](href)` reference in the text, with href angle brackets stripped. */
function parseImageReferences(text) {
  const refs = [];
  IMAGE_REFERENCE_RE.lastIndex = 0;
  let match;
  while ((match = IMAGE_REFERENCE_RE.exec(text)) !== null) {
    if (match.index > 0 && text[match.index - 1] === '\\') continue; // escaped \![...]
    const href = parseImageDestination(match[2]);
    if (href != null) refs.push({ alt: match[1], href });
  }
  return refs;
}

function resolveRemotePath(resolved, href) {
  if (href.split('/').includes('..') || href.includes('://') || href.startsWith('-')) throw error('invalid_image_href', 'The image path must not traverse, reference a URL, or begin with a dash');
  if (href.startsWith('/')) return href;                       // absolute remote path (/tmp/... is server-side)
  if (href === '~' || href.startsWith('~/')) return href;      // ~ / ~/... home expansion on the remote
  if (href.startsWith('~')) throw error('invalid_image_href', 'Only ~ and ~/ home paths are supported');
  const root = resolved?.canonicalRemotePath || resolved?.workspace?.remotePath;
  if (typeof root !== 'string' || !root || /[\0\r\n]/.test(root)) throw error('invalid_image_href', 'The remote workspace root is unavailable');
  return posix.join(root, href);                               // relative to the captured remote root
}

async function readEventsInRange(runtime, args) {
  const { id, generation, fromSeq, throughSeq } = args;
  const total = throughSeq - fromSeq + 1;
  const bySeq = new Map();
  let cursor = { generation, seq: fromSeq - 1 };
  for (let guard = 0; guard < 64; guard++) {
    const page = await runtime.events(id, cursor, { limit: total });
    if (page.reset) throw error('generation_mismatch', 'The ACP event generation changed while reading the output image reference');
    const list = Array.isArray(page.events) ? page.events : [];
    for (const event of list) {
      if (!event || !Number.isSafeInteger(event.seq)) continue;
      if (event.seq < fromSeq || event.seq > throughSeq) continue;
      if (!bySeq.has(event.seq)) bySeq.set(event.seq, event);
    }
    if (!page.hasMore) break;
    const lastSeq = list.length ? list[list.length - 1].seq : null;
    const nextSeq = lastSeq != null ? lastSeq : (page.cursor?.seq ?? null);
    if (nextSeq == null || nextSeq <= cursor.seq) break;
    cursor = { generation: page.cursor?.generation || generation, seq: nextSeq };
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** Concatenate contiguous text chunks honoring append:false (full replacement) resets. */
function reconstructText(events) {
  let text = '';
  let lastOrigin = null;
  for (const event of events) {
    const origin = eventOrigin(event);
    const chunk = String(event.text || '');
    text = (lastOrigin === origin && event.append !== false) ? text + chunk : chunk;
    lastOrigin = origin;
  }
  return text;
}

function bindingSignature(resolved) {
  return [resolved?.workspace?.profileId, resolved?.binding?.id ?? null, resolved?.canonicalRemotePath ?? null, resolved?.workspace?.remotePath ?? null].join('\u0000');
}

async function runRemoteRead(ssh, profile, remotePath, signal) {
  const command = "command -v python3 >/dev/null 2>&1 || { printf '%s\\n' " + quote(JSON.stringify({ ok: false, code: 'remote_python_missing', error: 'Remote Python 3 is required to read output images' })) + "; exit 127; }; python3 -c " + quote(READ_SCRIPT) + ' ' + ['read', remotePath, String(OUTPUT_IMAGE_LIMIT)].map(quote).join(' ');
  const result = await ssh.run(profile, command, { signal, timeoutMs: READ_TIMEOUT_MS, maxBytes: Math.ceil(OUTPUT_IMAGE_LIMIT * 1.4) + 1024 * 1024 });
  try {
    const parsed = JSON.parse(result.stdout.trim());
    if (typeof parsed?.ok === 'boolean') return parsed;
  } catch {}
  throw error(result.code || 'remote_protocol_error', result.error || 'Remote command did not return a valid bounded JSON result');
}

export function createOutputImages({ record, runtime, configuration, ssh }) {
  async function read(args, signal) {
    validateArgs(args);
    const found = await record(args);
    if (!found?.state || found.state.sessionId !== args.sourceSessionId) throw error('source_session_mismatch', 'The image reference does not belong to this ACP Session');

    const events = await readEventsInRange(runtime, args);
    const textEvents = events.filter(event => event.type === 'text' && event.sessionId === args.sourceSessionId && event.turnId === args.turnId);
    const total = args.throughSeq - args.fromSeq + 1;
    if (textEvents.length !== total) throw error('event_gap', 'Assistant text events are not contiguous across the requested sequence range');
    for (let i = 0; i < textEvents.length; i++) {
      if (textEvents[i].seq !== args.fromSeq + i) throw error('event_gap', 'Assistant text events are not contiguous across the requested sequence range');
    }
    const text = reconstructText(textEvents);
    const matches = parseImageReferences(text).filter(ref => ref.href === args.href);
    if (matches.length !== 1) throw error('image_reference_mismatch', 'The requested remote path is not proven by a unique assistant image reference');

    const remotePath = resolveRemotePath(found.resolved, args.href);
    const profile = configuration.profile(found.resolved.workspace.profileId);
    const result = await runRemoteRead(ssh, profile, remotePath, signal);
    if (!result.ok) throw error(result.code, result.error);
    if (typeof result.data !== 'string') throw error('remote_protocol_error', 'Remote read did not return image bytes');
    const data = Buffer.from(result.data, 'base64');
    if (data.length > OUTPUT_IMAGE_LIMIT) throw error('image_too_large', 'Output images are limited to 8 MiB');
    const mimeType = imageMimeType(data);
    if (!mimeType) throw error('unsupported_image_type', 'Only PNG, JPEG, GIF and WebP images are supported');

    const after = await record(args);
    if (after?.state?.sessionId !== args.sourceSessionId) throw error('source_session_mismatch', 'The source ACP Session changed while reading the output image');
    if (bindingSignature(found.resolved) !== bindingSignature(after.resolved)) throw error('binding_mismatch', 'The remote Session binding changed while reading the output image');
    return { data, mimeType, name: posix.basename(remotePath) };
  }
  return { read };
}

/** GET handler fully aligned with lib/message-attachments.js messageImageHandler. */
export function outputImageHandler({ authorize, images }) {
  return async (req, res) => {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    req.on('aborted', cancel);
    try {
      if (req.method !== 'GET') throw Object.assign(error('method_not_allowed', 'GET required'), { status: 405 });
      const url = new URL(req.url, 'http://dsh.invalid');
      const rawFrom = url.searchParams.get('fromSeq');
      const rawThrough = url.searchParams.get('throughSeq');
      const args = {
        id: url.searchParams.get('id'),
        dshSessionId: url.searchParams.get('dshSessionId'),
        turnId: url.searchParams.get('turnId'),
        generation: url.searchParams.get('generation'),
        fromSeq: /^(0|[1-9]\d*)$/.test(rawFrom || '') ? Number(rawFrom) : NaN,
        throughSeq: /^(0|[1-9]\d*)$/.test(rawThrough || '') ? Number(rawThrough) : NaN,
        sourceSessionId: url.searchParams.get('sourceSessionId'),
        href: url.searchParams.get('href'),
      };
      const permitted = authorize(req, 'outputImage', args);
      const result = await images.read(args, abort.signal);
      if (!permitted()) throw Object.assign(error('remote_access_denied', 'Session access was revoked'), { status: 403 });
      res.writeHead(200, { 'content-type': result.mimeType, 'content-length': result.data.byteLength, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'content-disposition': "inline; filename*=UTF-8''" + encodeURIComponent(result.name) });
      res.end(Buffer.from(result.data));
    } catch (e) {
      if (!res.headersSent) res.writeHead(e.status || 404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify({ ok: false, error: { code: e.code || 'output_image_unavailable', message: 'Output image is unavailable' } }));
    } finally { req.removeListener('aborted', cancel); }
  };
}
