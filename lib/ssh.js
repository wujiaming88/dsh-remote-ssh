import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, basename, isAbsolute } from 'node:path';

export const error = (code, message) => Object.assign(new Error(message), { code });
export const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
export function remotePath(value) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value) || !(value.startsWith('/') || value === '~' || value.startsWith('~/'))) throw error('invalid_remote_path', 'Remote path must be absolute or ~/relative');
  return value;
}
export function quotePath(value) {
  remotePath(value);
  return value === '~' ? '~' : value.startsWith('~/') ? '~/' + quote(value.slice(2)) : quote(value);
}
export function validateProfile(input) {
  if (!input || typeof input !== 'object') throw error('invalid_profile', 'SSH profile is required');
  for (const key of ['id', 'name', 'host', 'user']) if (typeof input[key] !== 'string' || !input[key].trim() || /[\0\r\n]/.test(input[key])) throw error('invalid_profile', 'Invalid profile ' + key);
  if (/^[\s-]|\s/.test(input.host) || /[\s@]/.test(input.user)) throw error('invalid_profile', 'Invalid SSH host or user');
  if (!['key', 'kerberos'].includes(input.authMethod)) throw error('ssh_auth_unsupported', 'Only SSH key/agent and Kerberos authentication are supported');
  const port = input.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw error('invalid_profile', 'SSH port must be between 1 and 65535');
  for (const key of ['keyPath', 'proxyJump']) if (input[key] !== undefined && (typeof input[key] !== 'string' || /[\0\r\n]/.test(input[key]))) throw error('invalid_profile', 'Invalid ' + key);
  if (input.password) throw error('ssh_auth_unsupported', 'Password profiles are not accepted; existing credentials are not migrated');
  return { id: input.id, name: input.name, host: input.host, user: input.user, port, authMethod: input.authMethod, keyPath: input.keyPath || '', proxyJump: input.proxyJump || '', remoteRoot: remotePath(input.remoteRoot || '~') };
}
export function sshArgs(profile, command) {
  const p = validateProfile(profile);
  const args = ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2', '-p', String(p.port)];
  if (p.proxyJump) args.push('-J', p.proxyJump);
  if (p.authMethod === 'kerberos') args.push('-o', 'GSSAPIAuthentication=yes', '-o', 'PreferredAuthentications=gssapi-with-mic');
  else if (p.keyPath) args.push('-i', p.keyPath.startsWith('~/') ? join(homedir(), p.keyPath.slice(2)) : p.keyPath);
  return [...args, '--', p.user + '@' + p.host, command];
}
export function classifySshFailure(text) {
  if (/permission denied|publickey|gssapi|kerberos|credentials|authentication/i.test(text)) return 'ssh_authentication_failed';
  if (/timed? ?out|timeout/i.test(text)) return 'ssh_timeout';
  if (/resolve hostname|connection refused|no route|connection closed/i.test(text)) return 'ssh_connection_failed';
  return 'ssh_command_failed';
}
/** Every process belongs to this instance. Construction and disposal never connect to SSH. */
export function createSshExecutor({ spawnFn = spawn, executable = 'ssh' } = {}) {
  const running = new Set(); let disposed = false;
  function run(profile, command, { input, signal, timeoutMs = 30000, maxBytes = 8 * 1024 * 1024 } = {}) {
    if (disposed || signal?.aborted) return Promise.reject(error('ssh_cancelled', 'SSH operation cancelled'));
    return new Promise((resolve, reject) => {
      let child, timer, settled = false, bytes = 0;
      const stdout = [], stderr = [];
      function finish(failure, code) {
        if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        running.delete(abort);
        if (failure) { try { child?.kill('SIGKILL'); } catch {} reject(failure); return; }
        const out = Buffer.concat(stdout).toString('utf8'); const err = Buffer.concat(stderr).toString('utf8');
        resolve({ ok: code === 0, exitCode: code, stdout: out, stderr: err, ...(code ? { code: classifySshFailure(err), error: err.trim() || 'SSH command exited ' + code } : {}) });
      }
      function abort() { finish(error('ssh_cancelled', 'SSH operation cancelled')); }
      try { child = spawnFn(executable, sshArgs(profile, command), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
      catch (e) { finish(error('ssh_spawn_failed', e.message)); return; }
      running.add(abort); signal?.addEventListener('abort', abort, { once: true });
      const collect = destination => chunk => { const b = Buffer.from(chunk); bytes += b.length; if (bytes > maxBytes) finish(error('ssh_output_too_large', 'SSH output exceeds the bounded response limit')); else destination.push(b); };
      child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
      child.on('error', e => finish(error('ssh_spawn_failed', e.message))); child.on('close', code => finish(null, code));
      child.stdin.on('error', e => { if (e.code !== 'EPIPE') finish(error('ssh_input_failed', e.message)); });
      timer = setTimeout(() => finish(error('ssh_timeout', 'SSH operation timed out')), timeoutMs);
      if (signal?.aborted) { abort(); return; }
      child.stdin.end(input === undefined ? undefined : input);
    });
  }
  return { run, shutdown() { disposed = true; for (const abort of [...running]) abort(); } };
}

const match = (pattern, name) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(name);
/** Bounded local OpenSSH config discovery. No SSH connection or credential reads. */
export async function listSshConfigHosts({ home = homedir() } = {}) {
  const base = join(home, '.ssh'); const blocks = [{ patterns: ['*'], options: {} }]; const seen = new Set(); const warnings = [];
  let block = blocks[0], count = 0;
  async function load(file, depth) {
    if (depth > 8 || count >= 32 || seen.has(file)) return;
    seen.add(file); count++; let text;
    try { text = await readFile(file, 'utf8'); } catch (e) { seen.delete(file); if (e.code !== 'ENOENT') warnings.push('Cannot read SSH configuration ' + file); return; }
    if (Buffer.byteLength(text) > 1024 * 1024) throw error('ssh_config_too_large', 'SSH config exceeds 1 MiB');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+#.*$/, '').trim(); if (!line || line.startsWith('#')) continue;
      const found = /^(\S+)\s+(.*)$/.exec(line); if (!found) continue;
      const key = found[1].toLowerCase(); const value = found[2].replace(/^"(.*)"$/, '$1');
      if (key === 'host') { block = { patterns: value.split(/\s+/), options: {} }; blocks.push(block); }
      else if (key === 'include') {
        for (let path of value.split(/\s+/)) {
          path = path.startsWith('~/') ? join(home, path.slice(2)) : isAbsolute(path) ? path : join(base, path);
          if (/[*?]/.test(dirname(path))) { warnings.push('Skipped unsupported directory glob: ' + path); continue; }
          if (/[*?]/.test(basename(path))) {
            let entries = []; try { entries = await readdir(dirname(path)); } catch {}
            for (const name of entries.sort().filter(name => match(basename(path), name)).slice(0, 32)) await load(join(dirname(path), name), depth + 1);
          } else await load(path, depth + 1);
        }
      } else if (key === 'match') { block = { patterns: [], options: {} }; blocks.push(block); warnings.push('Match blocks require OpenSSH evaluation and are not imported'); }
      else if (!(key in block.options)) block.options[key] = value;
    }
    seen.delete(file);
  }
  await load(join(base, 'config'), 0);
  const aliases = [...new Set(blocks.flatMap(block => block.patterns).filter(p => p && !/[*?!]/.test(p)))];
  const hosts = aliases.map(name => {
    const options = {};
    for (const block of blocks) {
      if (block.patterns.some(p => p.startsWith('!') && match(p.slice(1), name)) || !block.patterns.some(p => !p.startsWith('!') && match(p, name))) continue;
      for (const [key, value] of Object.entries(block.options)) if (!(key in options)) options[key] = value;
    }
    return { name, hostName: options.hostname || name, user: options.user || '', port: Number(options.port || 22), identityFile: options.identityfile || '', proxyJump: options.proxyjump || '', gssapi: /^yes$/i.test(options.gssapiauthentication || '') };
  });
  return { ok: true, hosts, warnings };
}
