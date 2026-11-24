import { readFile, open, mkdir, rename } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeBackend } from './config.js';
import { error } from './ssh.js';

const SCHEMA = 'dsh-remote-workspace-bindings/v1';
/** Immutable per-Session backend selection. This file is unrelated to any earlier plugin store. */
export class BackendBindings {
  constructor(path) {
    if (!isAbsolute(path)) throw error('binding_store_path', 'An absolute binding store path is required');
    this.path = path; this.records = null; this.loading = null; this.tail = Promise.resolve();
  }
  async load() {
    if (this.records) return this.records;
    if (!this.loading) this.loading = this.read().finally(() => { this.loading = null; });
    return this.loading;
  }
  async read() {
    let data;
    try { const raw = await readFile(this.path, 'utf8'); if (Buffer.byteLength(raw) > 8 * 1024 * 1024) throw error('binding_store_too_large', 'Binding metadata exceeds 8 MiB'); data = JSON.parse(raw); }
    catch (e) { if (e.code === 'ENOENT') data = { schema: SCHEMA, version: 1, bindings: [] }; else throw error(e.code || 'binding_store_unreadable', e.message); }
    if (data.schema !== SCHEMA || data.version !== 1 || !Array.isArray(data.bindings)) throw error('binding_schema_unsupported', 'Unknown backend binding format; no migration was performed');
    const records = new Map();
    for (const record of data.bindings) {
      if (!record || !['sessionId', 'workspaceId', 'profileId', 'cwd', 'configuredRemotePath'].every(key => typeof record[key] === 'string' && record[key]) || records.has(record.sessionId)) throw error('binding_store_invalid', 'Invalid or duplicate backend binding');
      records.set(record.sessionId, { ...record, backend: normalizeBackend(record.backend) });
    }
    this.records = records; return records;
  }
  // Synchronous creation gates use only this already-loaded cache. A failed load
  // is handled by the Host and must never veto unrelated local Session recovery.
  peek(id) { return this.records?.get(id) || null; }
  async get(id) { return (await this.load()).get(id) || null; }
  async bindFork(record) {
    const existing = await this.get(record.sessionId);
    if (existing && (['workspaceId', 'profileId', 'cwd', 'configuredRemotePath'].some(key => existing[key] !== record[key]) || JSON.stringify(existing.forkProof) !== JSON.stringify(record.forkProof))) throw error('binding_conflict', 'Fork child already has another backend binding');
    return this.bind(record);
  }
  async bind(record) {
    const task = this.tail.then(async () => {
      const records = await this.load(); if (records.has(record.sessionId)) return records.get(record.sessionId);
      const next = { ...record, backend: normalizeBackend(record.backend), createdAt: Date.now() };
      const all = [...records.values(), next];
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = this.path + '.' + randomUUID() + '.tmp';
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ schema: SCHEMA, version: 1, bindings: all })); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.path);
      if (process.platform !== 'win32') {
        const directory = await open(dirname(this.path), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      }
      records.set(record.sessionId, next); return next;
    });
    this.tail = task.catch(() => {}); return task;
  }
}
