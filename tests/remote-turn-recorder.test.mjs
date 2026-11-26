import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

// Desktop's own Electron runtime reads its packaged ASAR. These fixtures create
// isolated Cordis stores only: no profile, user Session, model, or SSH is opened.
if (!process.versions.electron) {
  test('installed DSH offline RemoteTurnRecorder integration', () => {
    assert.ok(process.env.DSH_NODE_EXECUTABLE, 'DSH_NODE_EXECUTABLE is required for installed-version integration');
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.env.DSH_NODE_EXECUTABLE, [fileURLToPath(import.meta.url)], {
      env, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /tests [1-9][0-9]*/, 'ASAR-aware child must actually execute the integration tests');
    process.stdout.write(result.stdout);
  });
} else {
  const installed = createRequire(join(process.env.DSH_INSTALL_DIR, 'package.json'));
  const { Context } = await import(installed.resolve('@deepseek-ai/cordis'));
  const { SessionStore, SESSION_FORMAT_VERSION } = await import(installed.resolve('@deepseek-ai/dsh-session'));
  const { SessionProjectionRegistry } = await import(installed.resolve('@deepseek-ai/dsh-session-projection'));
  const { ApiSessionList } = await import(pathToFileURL(join(dirname(installed.resolve('@deepseek-ai/dsh-api-session-controller/package.json')), 'lib/types/list.js')).href);
  const { RemoteTurnRecorder } = await import('../lib/remote-turn-recorder.js');
  const { REMOTE_SESSION_PROJECTION_KEY } = await import('../lib/protocol.js');
  const { AcpSession } = await import('../lib/acp.js');
  const tick = () => new Promise(resolve => setImmediate(resolve));
  function gate() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

  async function fixture(t) {
    const ctx = new Context();
    await ctx.plugin(SessionStore);
    await ctx.plugin(SessionProjectionRegistry);
    let nativeCalls = 0;
    const list = new ApiSessionList({
      sessionProjections: ctx.sessionProjections,
      agents: { get: () => undefined, prompt: () => { nativeCalls++; throw Error('Native model must not run'); } },
      attachments: { imageLimits: { maxImageBytes: 1, maxImagesPerMessage: 1, maxMessageImageBytes: 1, maxImagePixels: 1, maxImageDimension: 1, mediaTypes: ['image/png'] } },
      logger: ctx.logger,
    }, 5);
    await list.initialize();
    const detachments = [], recorders = [], acps = [];
    t.after(async () => {
      for (const acp of acps) await acp.dispose();
      for (const recorder of recorders) { try { await recorder.dispose(); } catch {} }
      for (const detach of detachments) detach();
      await ctx.fiber.dispose();
    });
    function native(id, seed) {
      const session = ctx.sessions.prepare(id, seed ? { seed, eventState: 'detached', inheritedEventCount: 0, meta: { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd: tmpdir(), isSeeded: false } } : { meta: { cwd: tmpdir() } });
      const detach = ctx.sessions.enter(session); ctx.sessions.announce(session); detachments.push(detach);
      return { session, detach };
    }
    async function acp(id, dshSessionId) {
      const pending = [], calls = [];
      const controller = {
        ready: Promise.resolve({ sessionId: 'remote-' + id, protocolCwd: '/remote/work', initialize: { agentCapabilities: { promptCapabilities: { image: true } }, _meta: { steering: { supported: true } } }, sessionResponse: { sessionId: 'remote-' + id, modes: { currentModeId: 'default', availableModes: [{ id: 'acceptEdits' }] } } }),
        setMode: async () => ({}),
        prompt: content => { calls.push(content); const next = gate(); pending.push(next); return next.promise; },
        steer: async () => ({ outcome: 'injected' }),
        cancelCalls: 0,
        async cancel() { this.cancelCalls++; pending.at(-1)?.resolve({ stopReason: 'cancelled' }); return true; },
        async dispose() {}, async close() {},
      };
      const session = new AcpSession({ id, dshSessionId, agent: 'claude', profile: { id: 'fixture', host: 'unused.invalid', user: 'fixture', authMethod: 'key' }, remotePath: '/remote/work', connectImpl: () => controller });
      await session.start(); acps.push(session);
      return { session, controller, pending, calls };
    }
    async function recorder(options = {}) {
      const result = await RemoteTurnRecorder.create({ sessions: ctx.sessions, sessionProjections: ctx.sessionProjections, ...options });
      recorders.push(result); return result;
    }
    return { ctx, list, native, acp, recorder, nativeCalls: () => nativeCalls };
  }

  test('real execution changes native blank eligibility; queued/cancelled input does not open a turn', async t => {
    const f = await fixture(t), native = f.native('native-a'), spare = f.native('native-blank');
    const remote = await f.acp('acp-a', native.session.id), recorder = await f.recorder();
    recorder.attach(remote.session, native.session); await recorder.flush();
    assert.equal(f.list.summaryFor(native.session).blank, true);
    const one = remote.session.prompt('first real prompt'), queued = remote.session.prompt('queued but never executed');
    await recorder.flush();
    assert.deepEqual(native.session.snapshotEvents().map(event => event.type), ['turn/start', 'user/message']);
    assert.equal(native.session.deriveMessages()[0].content[0].text, 'first real prompt');
    assert.deepEqual(f.ctx.sessions.list().filter(session => f.list.summaryFor(session).blank).map(session => session.id), [spare.session.id]);
    assert.equal(remote.calls.length, 1);
    await remote.session.cancel(); await one; await queued; await recorder.flush(); await tick();
    assert.deepEqual(native.session.snapshotEvents().map(event => event.type), ['turn/start', 'user/message', 'turn/end']);
    assert.equal(native.session.snapshotEvents().at(-1).data.reason.kind, 'aborted');
    const next = remote.session.prompt('second real prompt'); await recorder.flush();
    remote.pending.at(-1).resolve({ stopReason: 'end_turn' }); await next; await recorder.flush();
    const events = native.session.snapshotEvents();
    assert.deepEqual(events.filter(event => event.type === 'turn/start').map(event => event.data.turn), [1, 2]);
    assert.deepEqual(events.filter(event => event.type === 'turn/end').map(event => event.data.turn), [1, 2]);
    assert.equal(events.some(event => event.type.startsWith('step/') || event.type.startsWith('assistant/')), false);
    assert.equal(f.nativeCalls(), 0);
    assert.equal(remote.session.bufferedEvents().filter(event => event.type === 'turn_start').every(event => !Object.hasOwn(event, 'content')), true);
  });

  test('public wire exposes only a durable remote fact without marking blank/native sessions or republishing internal changes', async t => {
    const f = await fixture(t), native = f.native('wire-remote'), untouched = f.native('wire-blank'), ordinary = f.native('wire-native');
    const remote = await f.acp('acp-wire', native.session.id), recorder = await f.recorder();
    const wire = session => f.ctx.sessionProjections.snapshot(session, [REMOTE_SESSION_PROJECTION_KEY]).values[REMOTE_SESSION_PROJECTION_KEY];
    recorder.attach(remote.session, native.session); await recorder.flush();
    assert.deepEqual(wire(native.session), { remote: false });
    assert.deepEqual(wire(untouched.session), { remote: false });
    assert.equal(native.session.seq, 0); assert.equal(untouched.session.seq, 0);
    ordinary.session.append([
      ['turn/start', { turn: 1 }],
      ['user/message', { id: 'ordinary-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'ordinary native input' }] }, { surfaceOp: 'append' }],
      ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
    ]);
    assert.deepEqual(wire(ordinary.session), { remote: false });
    const changes = [];
    f.ctx.sessionProjections.onChanged((session, key, value) => {
      if (session === native.session && key === REMOTE_SESSION_PROJECTION_KEY) changes.push(value);
    });
    const pending = remote.session.prompt('real remote input'); pending.catch(() => {}); await recorder.flush();
    assert.deepEqual(wire(native.session), { remote: true });
    assert.deepEqual(changes, [{ remote: false }, { remote: true }]); // First live publication, then the committed remote user message.
    remote.pending[0].resolve({ stopReason: 'end_turn' }); await pending; await recorder.flush();
    assert.deepEqual(changes, [{ remote: false }, { remote: true }]); // Closing a turn only changes private projection state.
    assert.equal(f.ctx.sessionProjections.summaryKeys().has(REMOTE_SESSION_PROJECTION_KEY), true);
    assert.deepEqual(wire(untouched.session), { remote: false }); assert.equal(untouched.session.seq, 0);
  });

  test('steered user input belongs to the active turn and does not fabricate a second turn', async t => {
    const f = await fixture(t), native = f.native('steering'), remote = await f.acp('acp-steering', native.session.id), recorder = await f.recorder();
    recorder.attach(remote.session, native.session);
    const pending = remote.session.prompt('original'); await recorder.flush();
    await remote.session.steer('actual injected request', { requestId: 'steer-1' }); await recorder.flush();
    remote.pending[0].resolve({ stopReason: 'end_turn' }); await pending; await recorder.flush();
    const events = native.session.snapshotEvents();
    assert.deepEqual(events.map(event => event.type), ['turn/start', 'user/message', 'user/message', 'turn/end']);
    assert.deepEqual(native.session.deriveMessages().map(message => message.content[0].text), ['original', 'actual injected request']);
  });

  test('late steering ACK records Host-admitted attachment content before ending its original native turn', async t => {
    const f = await fixture(t), native = f.native('late-steering'), remote = await f.acp('acp-late-steering', native.session.id), recorder = await f.recorder();
    const ack = gate(), requestId = 'late-steer', admitted = [{type:'text',text:'consider this'}, {type:'text',text:'Host-admitted file reference: /remote/work/report.pdf'}];
    remote.controller.steer = () => ack.promise;
    remote.session.nativeContentFor = event => event.requestId === requestId ? admitted : undefined;
    recorder.attach(remote.session,native.session);
    const prompt = remote.session.prompt('original'); await recorder.flush();
    const steering = remote.session.steer('consider this',{requestId,attachments:[{type:'text',text:admitted[1].text}]});
    remote.pending[0].resolve({stopReason:'end_turn'}); await tick(); await recorder.flush();
    assert.deepEqual(native.session.snapshotEvents().map(event=>event.type),['turn/start','user/message']);
    ack.resolve({outcome:'injected'}); await steering; await prompt; await recorder.flush();
    assert.deepEqual(native.session.snapshotEvents().map(event=>event.type),['turn/start','user/message','user/message','turn/end']);
    assert.deepEqual(native.session.deriveMessages()[1].content,admitted);
    assert.equal(remote.controller.cancelCalls,0);
  });

  test('projection rebuild restores the numeric counter and suppresses replay duplicates', async t => {
    const f = await fixture(t), initial = f.native('restored'), remote = await f.acp('acp-restored', initial.session.id), recorder = await f.recorder();
    recorder.attach(remote.session, initial.session);
    const pending = remote.session.prompt('persisted user content'); await recorder.flush();
    remote.pending[0].resolve({ stopReason: 'end_turn' }); await pending; await recorder.flush();
    const seed = JSON.parse(JSON.stringify(initial.session.snapshotEvents()));
    await recorder.dispose(); initial.detach();
    const restored = f.native('restored', seed), nextRecorder = await f.recorder();
    const restoredCount = restored.session.seq; // DSH itself appends session/end-seed on restore.
    assert.deepEqual(f.ctx.sessionProjections.snapshot(restored.session, [REMOTE_SESSION_PROJECTION_KEY]).values[REMOTE_SESSION_PROJECTION_KEY], { remote: true });
    assert.equal(restored.session.seq, restoredCount); // The public fact rebuilds before any private ACP attach/RPC.
    nextRecorder.attach(remote.session, restored.session); await nextRecorder.flush();
    assert.equal(restored.session.seq, restoredCount);
    const next = remote.session.prompt('after restore'); await nextRecorder.flush();
    remote.pending[1].resolve({ stopReason: 'end_turn' }); await next; await nextRecorder.flush();
    assert.deepEqual(restored.session.snapshotEvents().filter(event => event.type === 'turn/start').map(event => event.data.turn), [1, 2]);
    assert.equal(f.list.summaryFor(restored.session).blank, false);
  });

  test('pre-admission rejects unsupported native content before any remote or native turn', async t => {
    const f = await fixture(t), native = f.native('admission'), remote = await f.acp('acp-admission', native.session.id), recorder = await f.recorder();
    recorder.attach(remote.session, native.session); await recorder.flush();
    await assert.rejects(recorder.prepare(remote.session, '', { attachments: [{ type: 'image', mimeType: 'image/png', data: 'AA==' }] }), { code: 'native_content_admission_required' });
    assert.equal(remote.calls.length, 0); assert.equal(native.session.seq, 0); assert.equal(f.list.summaryFor(native.session).blank, true);
    await recorder.prepare(remote.session, 'admitted text'); assert.equal(native.session.seq, 0);
    const pending = remote.session.prompt('admitted text'); await recorder.flush();
    remote.pending[0].resolve({ stopReason: 'end_turn' }); await pending; await recorder.flush();
    assert.equal(native.session.deriveMessages()[0].content[0].text, 'admitted text');
  });

  test('explicit file-reference text records exactly the ACP content without embeddedContext capability', async t => {
    const f = await fixture(t), native = f.native('file-reference'), remote = await f.acp('acp-file-reference', native.session.id), recorder = await f.recorder();
    recorder.attach(remote.session, native.session);
    const options = { attachments: [{ type: 'text', name: 'archive.zip', remotePath: '/remote/work/.dsh-attachments/session/id/archive.zip', size: 123,
      text: 'Uploaded file: archive.zip (123 bytes) at /remote/work/.dsh-attachments/session/id/archive.zip' }] };
    const admitted = await recorder.prepare(remote.session, 'Inspect this file', options);
    const pending = remote.session.prompt('Inspect this file', options); await recorder.flush();
    assert.deepEqual(remote.calls[0], admitted);
    assert.deepEqual(native.session.deriveMessages()[0].content, remote.calls[0]);
    assert.equal(remote.session.bufferedEvents().find(event => event.type === 'user_message').attachments[0].remotePath, options.attachments[0].remotePath);
    remote.pending[0].resolve({ stopReason: 'end_turn' }); await pending; await recorder.flush();
    assert.equal(f.nativeCalls(), 0);
  });

  test('existing nonblank native conversations are preserved and never rebound remotely', async t => {
    const f = await fixture(t), native = f.native('native-history'), remote = await f.acp('acp-foreign', native.session.id), recorder = await f.recorder();
    native.session.append([
      ['turn/start', { turn: 1 }],
      ['user/message', { id: 'native-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'native conversation' }] }, { surfaceOp: 'append' }],
      ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
    ]);
    const before = native.session.seq;
    assert.throws(() => recorder.attach(remote.session, native.session), { code: 'native_session_not_blank' });
    assert.equal(native.session.seq, before); assert.equal(remote.calls.length, 0);
  });

  test('actual SessionStore eviction blocks stale writes without cancelling the external task', async t => {
    const f = await fixture(t), native = f.native('evicted'), remote = await f.acp('acp-evicted', native.session.id), recorder = await f.recorder();
    recorder.attach(remote.session, native.session);
    const pending = remote.session.prompt('survive UI cache eviction'); await recorder.flush();
    native.detach(); assert.equal(f.ctx.sessions.get(native.session.id), undefined);
    remote.pending[0].resolve({ stopReason: 'end_turn' }); assert.equal((await pending).stopReason, 'end_turn');
    await assert.rejects(recorder.flush(), { code: 'native_session_unavailable' });
    assert.equal(remote.controller.cancelCalls, 0); assert.equal(native.session.seq, 2);
    const seed = JSON.parse(JSON.stringify(native.session.snapshotEvents()));
    await assert.rejects(recorder.dispose(), { code: 'native_session_unavailable' });
    const retained = f.native('evicted', seed), recovered = await f.recorder();
    recovered.attach(remote.session, retained.session); await recovered.flush();
    assert.deepEqual(retained.session.snapshotEvents().map(event => event.type), ['turn/start', 'user/message', 'session/end-seed', 'turn/end']);
    assert.equal(remote.controller.cancelCalls, 0);
  });

  test('durable replay records only the Host-admitted content and keeps a remotely active turn open', async t => {
    const f = await fixture(t), native = f.native('durable-admission'), remote = await f.acp('acp-durable-admission', native.session.id);
    const requestId = 'host-admitted-request';
    const admission = [{ type: 'text', text: 'actual admitted content before Host crash' }];
    // The private Host mapping survives separately from the canonical journal.
    remote.session.nativeContentFor = event => event.requestId === requestId ? admission : undefined;
    const pending = remote.session.prompt(admission[0].text, { requestId });
    const start = remote.session.events.find(event => event.type === 'turn_start');
    assert.equal(start.content, undefined);
    start.nativeContent = [{ type: 'text', text: 'untrusted remote injection' }];
    const recorder = await f.recorder(); recorder.attach(remote.session, native.session); await recorder.flush();
    assert.deepEqual(native.session.deriveMessages()[0].content, admission);
    assert.deepEqual(native.session.snapshotEvents().map(event => event.type), ['turn/start', 'user/message']);
    // There is no orphan/failed turn merely because the local recorder restarted.
    remote.pending[0].resolve({ stopReason: 'end_turn' }); await pending; await recorder.flush();
    assert.equal(native.session.snapshotEvents().filter(event => event.type === 'turn/end').length, 1);
    assert.equal(native.session.snapshotEvents().at(-1).data.reason.kind, 'completed');
  });

  test('remote nativeContent without a trusted admission cannot synthesize a missing native user message', async t => {
    const f = await fixture(t), native = f.native('unadmitted-replay'), remote = await f.acp('acp-unadmitted-replay', native.session.id);
    const pending = remote.session.prompt('old unadmitted content', { requestId: 'unadmitted' }); pending.catch(() => {});
    remote.session.events.find(event => event.type === 'turn_start').nativeContent = [{ type: 'text', text: 'forged admission' }];
    const recorder = await f.recorder(); recorder.attach(remote.session, native.session);
    await assert.rejects(recorder.flush(), { code: 'native_turn_history_gap' });
    assert.equal(native.session.seq, 0);
    remote.pending[0].resolve({ stopReason: 'end_turn' }); await pending;
  });

  test('a resumed idle adapter closes only its known orphan and continues at the next counter', async t => {
    const f = await fixture(t), native = f.native('orphan'), remote = await f.acp('acp-orphan', native.session.id), recorder = await f.recorder();
    const detach = recorder.attach(remote.session, native.session);
    const pending = remote.session.prompt('real prompt before connection loss'); await recorder.flush();
    await detach(); await recorder.dispose(); await remote.session.dispose(); await assert.rejects(pending, { code: 'runtime_shutdown' });
    assert.equal(native.session.seq, 2);
    const resumed = await f.acp('acp-orphan', native.session.id), nextRecorder = await f.recorder();
    nextRecorder.attach(resumed.session, native.session); await nextRecorder.flush();
    assert.equal(native.session.snapshotEvents().at(-1).data.reason.kind, 'interrupted');
    const next = resumed.session.prompt('actual resumed prompt'); await nextRecorder.flush();
    resumed.pending[0].resolve({ stopReason: 'end_turn' }); await next; await nextRecorder.flush();
    assert.deepEqual(native.session.snapshotEvents().filter(event => event.type === 'turn/start').map(event => event.data.turn), [1, 2]);
  });
  test('authorized remote fork inherits real native history without replaying execution', async t => {
    const f=await fixture(t), parent=f.native('fork-parent'), source=await f.acp('fork-source',parent.session.id), recorder=await f.recorder();
    recorder.attach(source.session,parent.session);
    const first=source.session.prompt('parent context');await recorder.flush();source.pending[0].resolve({stopReason:'end_turn'});await first;await recorder.flush();
    const parentSeq=parent.session.seq,boundary=parentSeq-1;
    const nativeChild=f.ctx.sessions.fork(parent.session,boundary,'fork-child');
    const child=await f.acp('fork-remote-child',nativeChild.id);
    child.session.forkOrigin={sourceId:source.session.id,sourceDshSessionId:parent.session.id};
    const proof={operationId:'fork-op',sourceId:source.session.id,sourceDshSessionId:parent.session.id,childId:child.session.id,childDshSessionId:nativeChild.id,nativeBoundary:boundary,ancestors:[]};
    assert.equal(recorder.inspect(nativeChild).inherited.length,1);
    assert.equal(f.ctx.sessionProjections.snapshot(nativeChild,[REMOTE_SESSION_PROJECTION_KEY]).values[REMOTE_SESSION_PROJECTION_KEY].remote,true);
    assert.throws(()=>recorder.attach(child.session,nativeChild),{code:'native_fork_unbound'});
    child.session.events.push({type:'turn_start',inherited:true,submitted:true,turnId:'inherited-only',seq:++child.session.eventSeq,generation:child.session.generation});
    const childSeq=nativeChild.seq;
    recorder.attach(child.session,nativeChild,{forkOrigin:proof});await recorder.flush();assert.equal(nativeChild.seq,childSeq);
    const next=child.session.prompt('child only');await recorder.flush();child.pending[0].resolve({stopReason:'end_turn'});await next;await recorder.flush();
    assert.deepEqual(nativeChild.snapshotEvents().filter(event=>event.type==='turn/start').map(event=>event.data.turn),[1,2]);
    assert.equal(parent.session.seq,parentSeq);assert.equal(f.nativeCalls(),0);
  });
  test('fork-of-fork requires the explicit ancestor chain and rejects a wrong prefix', async t => {
    const f=await fixture(t), parent=f.native('ancestor'), source=await f.acp('ancestor-acp',parent.session.id), recorder=await f.recorder();
    recorder.attach(source.session,parent.session);const one=source.session.prompt('ancestor');await recorder.flush();source.pending[0].resolve({stopReason:'end_turn'});await one;await recorder.flush();
    const rootBoundary=parent.session.seq-1,childNative=f.ctx.sessions.fork(parent.session,rootBoundary,'descendant');
    const child=await f.acp('descendant-acp',childNative.id);child.session.forkOrigin={sourceId:source.session.id,sourceDshSessionId:parent.session.id};
    const proof={sourceId:source.session.id,sourceDshSessionId:parent.session.id,childId:child.session.id,childDshSessionId:childNative.id,nativeBoundary:rootBoundary,ancestors:[]};
    recorder.attach(child.session,childNative,{forkOrigin:proof});const two=child.session.prompt('descendant');await recorder.flush();child.pending[0].resolve({stopReason:'end_turn'});await two;await recorder.flush();
    const boundary=childNative.seq-1,grandNative=f.ctx.sessions.fork(childNative,boundary,'grandchild'),grand=await f.acp('grandchild-acp',grandNative.id);
    grand.session.forkOrigin={sourceId:child.session.id,sourceDshSessionId:childNative.id};
    const nextProof={sourceId:child.session.id,sourceDshSessionId:childNative.id,childId:grand.session.id,childDshSessionId:grandNative.id,nativeBoundary:boundary,ancestors:[]};
    assert.throws(()=>recorder.attach(grand.session,grandNative,{forkOrigin:nextProof}),{code:'native_fork_history_mismatch'});
    nextProof.ancestors=[{sourceId:source.session.id,sourceDshSessionId:parent.session.id,nativeBoundary:rootBoundary}];
    assert.throws(()=>recorder.attach(grand.session,grandNative,{forkOrigin:{...nextProof,nativeBoundary:boundary-1}}),{code:'native_fork_unbound'});
    recorder.attach(grand.session,grandNative,{forkOrigin:nextProof});const three=grand.session.prompt('grandchild');await recorder.flush();grand.pending[0].resolve({stopReason:'end_turn'});await three;await recorder.flush();
    assert.deepEqual(grandNative.snapshotEvents().filter(event=>event.type==='turn/start').map(event=>event.data.turn),[1,2,3]);assert.equal(f.nativeCalls(),0);
  });

}
