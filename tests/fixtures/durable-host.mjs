/** Real disposable Host process used only by durable-recovery.test.mjs. */
import { readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createDurableLink } from '../../lib/durable-link.js';
import { buildDurableLaunchSpec, durableRemoteHelper } from '../../lib/durable-launch.js';

const locatorPath = process.argv[2];
let locator = JSON.parse(readFileSync(locatorPath, 'utf8'));
process.title = 'dsh-durable-test-host:' + locator.marker;
const emit = message => { if (process.connected) process.send(message); };
function persist() {
  const temp = locatorPath + '.' + process.pid + '.tmp';
  writeFileSync(temp, JSON.stringify(locator), { mode: 0o600 });
  renameSync(temp, locatorPath);
}
let currentHelper, armedDrop = false;
const children = [];
const launchSpec = buildDurableLaunchSpec({
  profile: { id: 'test', host: 'example.invalid', user: 'test', authMethod: 'key' },
  agent: 'claude', agentPath: process.execPath, remotePath: locator.workspace,
  remoteRuntimeDir: locator.runtime, identity: locator.identity,
  sessionOptions: locator.sessionOptions, create: !locator.identity.epoch,
});
const link = createDurableLink({
  identity: locator.identity, launchSpec, afterSeq: locator.cursor,
  getCursor: () => locator.cursor,
  retryDelays: [20, 40, 80], heartbeatMs: 1000, heartbeatTimeoutMs: 10000, startTimeoutMs: 15000,
  spawn(_command, _args, options) {
    const child = spawn(process.execPath, ['-e', '(' + durableRemoteHelper.toString() + ')()', locator.marker], options);
    currentHelper = child; children.push(child);
    emit({ type: 'helper', pid: child.pid });
    // Hide an admission ACK from the link, then kill only its disposable helper.
    // The durable owner has already persisted the intent before writing this ACK.
    const original = child.stdout.emit.bind(child.stdout);
    let buffered = '';
    child.stdout.emit = (event, ...args) => {
      if (event !== 'data') return original(event, ...args);
      buffered += String(args[0]); let end;
      while ((end = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
        let frame; try { frame = JSON.parse(line); } catch {}
        if (armedDrop && frame?.type === armedDrop) {
          armedDrop = false; emit({ type: 'ack_dropped', opId: frame.opId, pid: child.pid });
          child.kill('SIGKILL'); buffered = ''; return true;
        }
        original('data', line + '\n');
      }
      return true;
    };
    return child;
  },
  onIdentity(identity) { locator.identity = identity; persist(); },
  onEvent(event) {
    appendFileSync(locator.events, JSON.stringify(event) + '\n', { mode: 0o600 });
    locator.cursor = event.seq; persist(); emit({ type: 'event', event });
  },
  onState(message) { emit({ type: 'state', ...message }); },
  onConnection(state) { emit({ type: 'connection', ...state }); },
});
process.on('message', async message => {
  try {
    if (message.action === 'call') {
      armedDrop = message.dropResult ? 'result' : message.dropAccepted ? 'accepted' : false;
      const value = await link.call(message.method, message.args || {}, { opId: message.opId });
      emit({ type: 'reply', correlation: message.correlation, value });
    } else if (message.action === 'query') {
      emit({ type: 'reply', correlation: message.correlation, value: await link.query(message.opIds) });
    } else if (message.action === 'cut_helper') {
      currentHelper.kill('SIGKILL'); emit({ type: 'helper_cut', correlation: message.correlation });
    } else if (message.action === 'detach') {
      await link.close();
      await Promise.all(children.filter(child => child.exitCode == null && child.signalCode == null).map(child => new Promise(resolve => child.once('exit', resolve))));
      emit({ type: 'detached', correlation: message.correlation }); process.disconnect();
    }
  } catch (error) { emit({ type: 'reply', correlation: message.correlation, error: { code: error.code, message: error.message } }); }
});
try { const attached = await link.start(); emit({ type: 'ready', attached }); }
catch (error) { emit({ type: 'fatal', error: { code: error.code, message: error.message } }); }
