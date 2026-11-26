import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { sleepInhibitorCommand, createSleepInhibitor, createActivitySleepGuard } from '../lib/sleep-inhibitor.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('platform commands keep the Host awake without asserting display activity', () => {
  assert.deepEqual(sleepInhibitorCommand('darwin', 4242), { command: '/usr/bin/caffeinate', args: ['-i', '-m', '-s', '-w', '4242'] });
  assert.deepEqual(sleepInhibitorCommand('linux', 4242), { command: 'systemd-inhibit',
    args: ['--what=idle:sleep', '--why=DSH remote Agent is running', '--mode=block',
      'sh', '-c', 'while kill -0 4242 2>/dev/null; do sleep 5; done'] });
  assert.equal(sleepInhibitorCommand('win32'), null);
});

test('one inhibitor child is shared across turns and released after the stop grace', async () => {
  const spawned = [], warnings = [];
  const spawn = (command, args) => {
    const child = new EventEmitter(); child.killed = 0; child.kill = signal => { child.killed++; child.signal = signal; };
    spawned.push({ command, args, child }); return child;
  };
  const inhibitor = createSleepInhibitor({ platform: 'darwin', spawn, logger: { warn: (...args) => warnings.push(args.join(' ')) }, stopGraceMs: 0 });
  inhibitor.update(true); inhibitor.update(true);
  assert.equal(spawned.length, 1); assert.equal(inhibitor.active, true);
  assert.deepEqual(spawned[0].args.slice(0, 3), ['-i', '-m', '-s']);
  assert.equal(spawned[0].args[3], '-w'); assert.equal(spawned[0].args[4], String(process.pid));
  inhibitor.update(false);
  assert.equal(inhibitor.active, true); // still inside the grace window
  await tick(); await tick();
  assert.equal(inhibitor.active, false); assert.equal(spawned[0].child.killed, 1);
  assert.equal(warnings.length, 0);
  inhibitor.dispose();
});

test('a back-to-back turn cancels teardown, and disposal never leaves a child alive', async () => {
  const spawned = [], timers = [];
  const spawn = () => {
    const child = new EventEmitter(); child.killed = 0; child.kill = () => { child.killed++; };
    spawned.push(child); return child;
  };
  const inhibitor = createSleepInhibitor({ platform: 'darwin', spawn, stopGraceMs: 50 });
  inhibitor.update(true); inhibitor.update(false); inhibitor.update(true);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(spawned.length, 1); assert.equal(spawned[0].killed, 0);
  inhibitor.update(false); inhibitor.dispose();
  assert.equal(spawned[0].killed, 1); assert.equal(inhibitor.active, false);
});

test('unsupported platforms are a no-op and report one bounded warning', () => {
  const warnings = [];
  const inhibitor = createSleepInhibitor({ platform: 'win32', logger: { warn: (...args) => warnings.push(args.join(' ')) } });
  inhibitor.update(true); inhibitor.update(true);
  assert.equal(inhibitor.active, false); assert.equal(warnings.length, 1);
});

test('activity guard tracks running and waiting sessions and releases when all settle', () => {
  let listener;
  const states = [{ sessionId: 'a', status: 'running' }, { sessionId: 'b', status: 'idle' }];
  const activity = {
    snapshot: () => states,
    subscribe: fn => { listener = fn; return () => { listener = null; }; },
  };
  const updates = [];
  const inhibitor = { update: value => updates.push(value), dispose: () => updates.push('disposed') };
  const guard = createActivitySleepGuard({ activity, inhibitor });
  assert.deepEqual(guard.activeSessions, ['a']); assert.deepEqual(updates, [true]);
  listener({ type: 'upsert', session: { sessionId: 'b', status: 'waiting' } });
  assert.deepEqual(updates, [true, true]); assert.deepEqual(guard.activeSessions, ['a', 'b']);
  listener({ type: 'upsert', session: { sessionId: 'a', status: 'completed' } });
  listener({ type: 'remove', sessionId: 'b' });
  assert.deepEqual(updates, [true, true, true, false]);
  listener({ type: 'reset' }); assert.equal(updates.at(-1), false);
  guard.dispose(); assert.equal(updates.at(-1), 'disposed'); assert.equal(listener, null);
});
