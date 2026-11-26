/** ACP peer fixture: real SDK, file gates instead of timing assumptions. */
import { agent, ndJsonStream } from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';
import { appendFileSync, writeFileSync, existsSync, watch, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspace = process.cwd();
const marker = readFileSync(join(workspace, 'fixture-marker'), 'utf8');
process.title = 'dsh-durable-test-adapter:' + marker;
writeFileSync(join(workspace, 'adapter-owner.json'), JSON.stringify({ marker, pid: process.pid }), { mode: 0o600 });
const trace = (type, detail = {}) => appendFileSync(join(workspace, 'adapter-trace.ndjson'), JSON.stringify({ type, pid: process.pid, marker, ...detail }) + '\n', { mode: 0o600 });
function gate(name) {
  const path = join(workspace, name);
  return new Promise((resolve, reject) => {
    if (existsSync(path)) return resolve();
    const watcher = watch(workspace, () => { if (existsSync(path)) { watcher.close(); resolve(); } });
    watcher.on('error', reject);
    if (existsSync(path)) { watcher.close(); resolve(); }
  });
}
const app = agent()
  .onRequest('initialize', () => { trace('initialize'); return { protocolVersion: 1, agentCapabilities: {}, _meta: { steering: { supported: false } } }; })
  .onRequest('session/new', ctx => {
    trace('new', { cwd: ctx.params.cwd });
    return { sessionId: 'same-remote-session', modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }, { id: 'acceptEdits', name: 'Accept Edits' }] } };
  })
  .onRequest('session/resume', () => { trace('resume'); throw Error('Live attach must never resume history'); })
  .onRequest('session/set_mode', ctx => { trace('set_mode', { modeId: ctx.params.modeId }); return {}; })
  .onRequest('session/prompt', async ctx => {
    trace('prompt', { text: ctx.params.prompt[0]?.text });
    await ctx.client.notify('session/update', { sessionId: 'same-remote-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'waiting for offline release' } } });
    await gate('release-permission');
    trace('offline_progress');
    await ctx.client.notify('session/update', { sessionId: 'same-remote-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'continued after Host death' } } });
    trace('permission_requested');
    const permission = await ctx.client.request('session/request_permission', {
      sessionId: 'same-remote-session', toolCall: { toolCallId: 'edit-1', title: 'Edit remote file', kind: 'edit', status: 'pending' },
      options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'deny', name: 'Deny', kind: 'reject_once' }],
    });
    trace('permission_answered', { outcome: permission.outcome });
    await gate('release-form');
    trace('form_requested');
    const answer = await ctx.client.request('elicitation/create', {
      sessionId: 'same-remote-session', mode: 'form', message: 'Choose',
      requestedSchema: { type: 'object', properties: { answer: { type: 'string', enum: ['yes', 'no'] } }, required: ['answer'] },
    });
    trace('form_answered', { action: answer.action });
    await ctx.client.notify('session/update', { sessionId: 'same-remote-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'completed same remote run' } } });
    trace('completed');
    return { stopReason: 'end_turn' };
  })
  .onRequest('session/close', () => { trace('close'); return {}; });
trace('started');
app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
