import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';

// Extract exported pure declarations from the real ESM source. No React or DOM
// mock is involved, and parsing also checks the complete production modules.
function pureExports(path, names) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const declarations = ast.body.filter(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' && names.includes(node.declaration.id.name));
  assert.equal(declarations.length, names.length);
  return new Function(declarations.map(node => source.slice(node.declaration.start, node.declaration.end)).join('\n') + `\nreturn {${names.join(',')}};`)();
}
const { profilePayload } = pureExports('../src/client/settings.js', ['profilePayload']);
const { createFlowLifetime, remoteWorkspacePayload } = pureExports('../src/client/workspaces.js', ['createFlowLifetime', 'remoteWorkspacePayload']);
const profile = { name: ' Box ', host: ' box ', user: ' me ', port: '22', authMethod: 'key', keyPath: ' ~/.ssh/id_ed25519 ', remoteRoot: ' ~/repo ', proxyJump: ' jump ' };
const form = { profileId: 'p1', remotePath: ' ~/repo ', type: 'claude', permission: 'acceptEdits', confirmBypass: false, worktree: false, branch: '', base: '' };

test('Profile payload contains only the supported explicit key fields', () => {
  assert.deepEqual(profilePayload(profile), { name: 'Box', host: 'box', user: 'me', port: 22, authMethod: 'key', keyPath: '~/.ssh/id_ed25519', remoteRoot: '~/repo', proxyJump: 'jump' });
});
test('Kerberos never persists an irrelevant private-key path', () => {
  assert.equal(profilePayload({ ...profile, authMethod: 'kerberos' }).keyPath, '');
});
test('Profile edits preserve identity and reject unknown authentication', () => {
  assert.equal(profilePayload({ ...profile, id: 'p1' }).id, 'p1');
  assert.equal(profilePayload({ ...profile, authMethod: 'unknown' }), null);
});
test('Missing connection fields and invalid ports do not reach the Host', () => {
  for (const patch of [{ host: ' ' }, { user: '' }, { port: 0 }, { port: 65536 }, { port: '22bad' }, { port: 1.5 }]) assert.equal(profilePayload({ ...profile, ...patch }), null);
});
test('Remote creation defaults to Claude with acceptEdits and no optional worktree', () => {
  assert.deepEqual(remoteWorkspacePayload(form), { value: { profileId: 'p1', remotePath: '~/repo', backend: { type: 'claude', permission: 'acceptEdits' } } });
});
test('Remote workspaces accept only actual remote Agent backends', () => {
  for (const type of ['claude', 'codex']) assert.equal(remoteWorkspacePayload({ ...form, type }).value.backend.type, type);
  assert.equal(remoteWorkspacePayload({ ...form, type: 'unknown' }).error, 'invalid');
  assert.equal(remoteWorkspacePayload({ ...form, type: 'dsh' }).error, 'invalid');
});
test('Bypass requires explicit confirmation and forwards it to the Host', () => {
  assert.equal(remoteWorkspacePayload({ ...form, permission: 'bypass' }).error, 'bypassConfirm');
  assert.equal(remoteWorkspacePayload({ ...form, permission: 'bypass', confirmBypass: true }).value.confirmBypass, true);
  assert.equal(remoteWorkspacePayload({ ...form, permission: 'plan', confirmBypass: true }).value.confirmBypass, undefined);
});
test('Owned worktree request carries branch and optional base, never ownership claims', () => {
  assert.deepEqual(remoteWorkspacePayload({ ...form, worktree: true, branch: ' feature/new ', base: ' main ' }).value.worktree, { branch: 'feature/new', base: 'main' });
  assert.deepEqual(remoteWorkspacePayload({ ...form, worktree: true, branch: 'topic' }).value.worktree, { branch: 'topic' });
});
test('Bad paths and branch/base values cannot be submitted', () => {
  for (const patch of [{ profileId: '' }, { remotePath: '' }, { remotePath: '/repo\nnext' }, { remotePath: '/repo\0' }]) assert.equal(remoteWorkspacePayload({ ...form, ...patch }).error, 'invalid');
  for (const patch of [{ branch: '' }, { branch: '-force' }, { branch: 'a..b' }, { branch: 'space branch' }, { base: '-x' }, { base: 'main\nnext' }]) assert.equal(remoteWorkspacePayload({ ...form, worktree: true, branch: 'topic', ...patch }).error, 'invalidBranch');
});
test('Closed and reopened directory flows reject all earlier settlements', () => {
  const life = createFlowLifetime(); const first = life.open(); assert.equal(life.accepts(first), true);
  life.close(); assert.equal(life.accepts(first), false);
  const second = life.open(); assert.equal(life.accepts(first), false); assert.equal(life.accepts(second), true);
  assert.equal(life.settle(first), false); assert.equal(life.settle(second), true);
});
test('A directory flow can report only one outcome per open', () => {
  const life = createFlowLifetime(); const token = life.open();
  assert.equal(life.settle(token), true); assert.equal(life.settle(token), false); assert.equal(life.accepts(token), false);
});
test('StrictMode cleanup/setup re-arms a fresh epoch, not the cancelled request', () => {
  const life = createFlowLifetime(); const discarded = life.open(); life.close(); const active = life.open();
  assert.notEqual(discarded, active); assert.equal(life.settle(discarded), false); assert.equal(life.settle(active), true);
});
