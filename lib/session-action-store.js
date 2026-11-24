import { readFile, open, mkdir, rename } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { error } from './ssh.js';

const SCHEMA = 'dsh-remote-session-actions/v1';
const PHASES = new Set(['prepared', 'remotePending', 'remoteCreated', 'bound', 'nativeCreated', 'completed', 'failed']);
export function validForkProof(p) {
  return !!p && ['operationId', 'sourceId', 'sourceSessionId', 'sourceDshSessionId', 'childId', 'childDshSessionId', 'nativePrefixHash'].every(k => typeof p[k] === 'string' && p[k])
    && Number.isSafeInteger(p.nativeBoundary) && p.nativeBoundary >= 0
    && /^[a-f0-9]{64}$/.test(p.nativePrefixHash)
    && typeof p.cut?.generation === 'string' && !!p.cut.generation && Number.isSafeInteger(p.cut?.seq) && p.cut.seq >= 0
    && (p.ancestors === undefined || Array.isArray(p.ancestors) && p.ancestors.every(a => a && typeof a.sourceId === 'string' && a.sourceId && typeof a.sourceDshSessionId === 'string' && a.sourceDshSessionId && Number.isSafeInteger(a.nativeBoundary) && a.nativeBoundary >= 0 && a.nativeBoundary <= p.nativeBoundary));
}
/** Metadata only. Never stores prompts, seed events, credentials, or a fabricated transcript. */
export class SessionActionStore {
  constructor(path) {
    if (!isAbsolute(path)) throw error('action_store_path', 'An absolute operation store path is required');
    this.path = path; this.data = null; this.loading = null; this.tail = Promise.resolve();
  }
  async load() {
    if (this.data) return this.data;
    if (!this.loading) this.loading = this.read().finally(() => { this.loading = null; });
    return this.loading;
  }
  async read() {
    let data;
    try {
      const raw = await readFile(this.path, 'utf8');
      if (Buffer.byteLength(raw) > 8 * 1024 * 1024) throw error('action_store_invalid', 'Operation metadata exceeds 8 MiB');
      data = JSON.parse(raw);
    } catch (e) {
      if (e.code !== 'ENOENT') throw error('action_store_unreadable', e.message);
      data = { schema: SCHEMA, version: 1, forks: {}, titles: {} };
    }
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    if (!object(data) || data.schema !== SCHEMA || data.version !== 1 || !object(data.forks) || !object(data.titles)) throw error('action_store_invalid', 'Unknown session action metadata format');
    for (const [id, op] of Object.entries(data.forks)) {
      if (op?.operationId !== id || !PHASES.has(op.phase) || !['sourceDshSessionId', 'sourceId', 'childDshSessionId', 'nativePrefixHash', 'workspaceSignature', 'profileSignature'].every(k => typeof op[k] === 'string' && op[k])
          || !Number.isSafeInteger(op.nativeBoundary) || op.nativeBoundary < 0 || (op.proof && !validForkProof(op.proof))) throw error('action_store_invalid', 'Invalid fork operation metadata');
    }
    for (const [id, title] of Object.entries(data.titles)) if (!id || !Number.isSafeInteger(title?.revision) || typeof title.title !== 'string' || !['pending', 'synced', 'failed', 'unknown'].includes(title.status)) throw error('action_store_invalid', 'Invalid title synchronization metadata');
    this.data = data; return data;
  }
  fork(id) { return this.data && Object.hasOwn(this.data.forks, id) ? this.data.forks[id] : null; }
  title(id) { return this.data && Object.hasOwn(this.data.titles, id) ? this.data.titles[id] : null; }
  latest(id) { return Object.values(this.data?.forks || {}).filter(op => op.sourceDshSessionId === id || op.childDshSessionId === id).sort((a, b) => b.createdAt - a.createdAt)[0] || null; }
  saveFork(value) { return this.save('forks', value.operationId, value); }
  saveTitle(id, value) { return this.save('titles', id, value); }
  save(kind, id, value) {
    const task = this.tail.then(async () => {
      const data = await this.load();
      const next = { ...data, [kind]: { ...data[kind], [id]: structuredClone(value) } };
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = this.path + '.' + randomUUID() + '.tmp';
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(next)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.path);
      if (process.platform !== 'win32') {
        const directory = await open(dirname(this.path), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      }
      this.data = next;
      return next[kind][id];
    });
    this.tail = task.catch(() => {}); return task;
  }
}
