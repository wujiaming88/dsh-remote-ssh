import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';

const source = readFileSync(new URL('../src/client/session-status.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
function exported(name) {
  const declaration = ast.body.find(node => node.type === 'ExportNamedDeclaration'
    && (node.declaration?.id?.name === name || node.declaration?.declarations?.some(item => item.id.name === name)))?.declaration;
  assert.ok(declaration, `missing export ${name}`);
  return source.slice(declaration.start, declaration.end);
}
// Exercise the actual pure mapper and registration closure, not a React/DOM mock.
const presentation = new Function(`${exported('sessionStatusPresentation')}\nreturn sessionStatusPresentation;`)();
const messages = new Function(`${exported('messages')}\nreturn messages;`)();
const entry = (status, extra = {}) => ({ sessionId: 'remote', status, ...extra });

const cases = [
  ['running', undefined, 'ongoing', 'running'],
  ['waiting', 'permission', 'warning', 'permission'],
  ['waiting', 'elicitation', 'warning', 'elicitation'],
  ['waiting', undefined, 'warning', 'waiting'],
  ['waiting', 'future-interaction', 'warning', 'waiting'],
  ['idle', undefined, 'idle', 'idle'],
  ['error', undefined, 'error', 'error'],
  ['disconnected', undefined, 'idle', 'disconnected'],
  ['completed', undefined, 'done', 'completed'],
  ['stopped', undefined, 'idle', 'stopped'],
  ['unknown', undefined, 'idle', 'unknown'],
  ['future-status', undefined, 'idle', 'unknown'],
];

test('remote status mapping preserves waiting reasons and terminal distinctions', () => {
  for (const [status, waitingFor, state, label] of cases) {
    assert.deepEqual(presentation(entry(status, { waitingFor }), 'remote'), {
      state, label: `sessionStatus.${label}`,
    });
  }
});

test('local, unavailable and mismatched rows never borrow the selected remote state', () => {
  for (const missing of [undefined, null, false, {}]) assert.equal(presentation(missing, 'local'), null);
  assert.equal(presentation(entry('running'), 'local'), null);
  assert.equal(presentation(entry('running'), ''), null);
  assert.equal(presentation({ status: 'running' }, 'local'), null);
  assert.equal(presentation(entry('running', { sessionId: 'other' }), 'remote'), null);
});

test('lost overview becomes unknown instead of retaining a spinner or claiming completion', () => {
  assert.equal(presentation(entry('running'), 'remote').state, 'ongoing');
  assert.deepEqual(presentation(entry('unknown', { waitingFor: 'permission' }), 'remote'), {
    state: 'idle', label: 'sessionStatus.unknown',
  });
  // Authorization reset clears the entry rather than presenting unknown local rows.
  assert.equal(presentation(undefined, 'remote'), null);
});

test('every status has distinct Chinese and English remote-specific accessible copy', () => {
  const labels = new Set(cases.map(value => `sessionStatus.${value[3]}`));
  assert.deepEqual(Object.keys(messages.zh).sort(), [...labels].sort());
  assert.deepEqual(Object.keys(messages.en).sort(), [...labels].sort());
  for (const key of labels) {
    assert.match(messages.zh[key], /^远端/);
    assert.match(messages.en[key], /^Remote session/);
  }
  assert.equal(new Set(Object.values(messages.zh)).size, labels.size);
  assert.equal(new Set(Object.values(messages.en)).size, labels.size);
});

test('registration is declaration-aware, leading-only and shares the supplied observable', () => {
  const store = { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} };
  const component = () => { throw Error('No renderer is invoked by these tests'); };
  const install = new Function('NAMESPACE', 'RemoteSessionStatus',
    `${exported('installSessionStatus')}\nreturn installSessionStatus;`)('namespace', component);
  let callback, options, registeredComponent, disposed = 0;
  const unregister = () => { disposed++; };
  const ctx = { slots: {
    inject(name, run) { assert.equal(name, 'sidebar.session.row.leading'); callback = run; return 'declaration-lifetime'; },
    register(value, implementation) { options = value; registeredComponent = implementation; return unregister; },
  } };
  assert.equal(install(ctx, store), 'declaration-lifetime');
  assert.equal(options, undefined); // Wait for the owner's public slot declaration.
  const dispose = callback();
  assert.equal(options.name, 'sidebar.session.row.leading');
  assert.equal(options.id, 'remote-ssh.status');
  assert.equal(options.locale, 'namespace');
  assert.equal(registeredComponent, component);
  assert.equal(options.inject().hooks.remoteSessionStatuses, store);
  assert.equal(options.inject().hooks.remoteSessionStatuses, store);
  assert.equal(dispose, unregister);
  dispose(); assert.equal(disposed, 1);
  assert.equal(callback(), unregister); // Re-register when the owner declaration returns.
});

test('component uses owned themed status glyphs with textual accessible status', () => {
  const imports = ast.body.filter(node => node.type === 'ImportDeclaration');
  assert.deepEqual(imports.map(node=>node.source.value), ['./shared.js']);
  const css=readFileSync(new URL('../src/client/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.rssh-session-status-dot \{ width: 10px; height: 10px/);
  assert.match(css,/\.rssh-session-status-dot\[data-state=ongoing\] \{ width: 14px; height: 14px/);
  const component = exported('RemoteSessionStatus');
  assert.match(component, /useRemoteSessionStatuses\(snapshot => snapshot\.byId\[sessionId\]\)/);
  assert.match(component, /if \(!presentation\) return null/);
  assert.match(component, /t\(presentation\.label\)/);
  assert.match(component, /role: 'img', title: label, 'aria-label': label/);
  assert.match(component, /h\(ui.StateDot, \{ state: presentation\.state, className: 'rssh-session-status-dot' \}\)/);
  assert.doesNotMatch(component, /size:|style:|onClick:|tabIndex:/);
});

test('decoration does not open streams, retain sessions, mutate native state or invent replacement slots', () => {
  assert.deepEqual(ast.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value), [
    './shared.js',
  ]);
  assert.doesNotMatch(source, /sidebar\.session\.row\.(?:trailing|status)|useSessionStatus|useSessions|useProjection/);
  assert.doesNotMatch(source, /\.binding\(|\.retain\(|\.observeRunning\(|markSeen|fetch\(|EventSource|SessionClient|setInterval|document\.|localStorage/);
});
