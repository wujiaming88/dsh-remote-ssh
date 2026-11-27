#!/usr/bin/env node
// Real Host transport E2E. Requires a valid SSH/Kerberos session and Pi 1.6.1+
// prepared on the remote host. This is intentionally not part of `npm test`.
// Usage:
//   PI_E2E_HOST=host PI_E2E_USER=user PI_E2E_REMOTE_PATH=/home/user \
//   PI_E2E_RUNTIME_DIR='~/.local/share/dsh-remote-acp/v1' node tests/pi-plugin-e2e.mjs
import {spawn} from 'node:child_process';
import {buildRemoteAcpLaunchSpec, connectAcp, prepareRemoteAcp} from '../lib/acp-transport.js';

const host = process.env.PI_E2E_HOST;
const user = process.env.PI_E2E_USER;
if (!host || !user) throw new Error('PI_E2E_HOST and PI_E2E_USER are required');
const profile = {id: 'pi-plugin-e2e', host, user, port: Number(process.env.PI_E2E_PORT || 22), authMethod: process.env.PI_E2E_AUTH || 'kerberos'};
const remotePath = process.env.PI_E2E_REMOTE_PATH || `/home/${user}`;
const remoteRuntimeDir = process.env.PI_E2E_RUNTIME_DIR || '~/.local/share/dsh-remote-acp/v1';
const options = {profile, agent: 'pi', remotePath, remoteRuntimeDir, spawn};
console.log('PREPARE', host);
const prepared = await prepareRemoteAcp(options, {confirmed: true});
console.log('PREPARED', prepared.agent, prepared.adapterEntry);
const events = [];
const controller = await connectAcp({launchSpec: buildRemoteAcpLaunchSpec({...options, action: 'start'}), spawn, env: process.env,
  onUpdate: update => events.push(update), onStderr: text => process.env.PI_E2E_DEBUG && console.error(text.slice(-500))});
try {
  const ready = await controller.ready;
  console.log('SESSION', ready.sessionId);
  const result = await controller.prompt('Reply with exactly PI_PLUGIN_E2E_OK and no other text.');
  const text = events.filter(update => update.sessionUpdate === 'agent_message_chunk').map(update => update.content?.text || '').join('');
  if (result.stopReason !== 'end_turn' || !text.includes('PI_PLUGIN_E2E_OK')) throw new Error(`Unexpected Pi response: ${result.stopReason} ${text}`);
  console.log('PLUGIN_E2E_OK');
} finally { await controller.close(); }
