import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
import {parse} from 'acorn';

const status=readFileSync(new URL('../src/client/status.js',import.meta.url),'utf8');
const chat=readFileSync(new URL('../src/client/chat.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../src/client/index.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/client/styles.css',import.meta.url),'utf8');

test('failure and loading states render a structured status card, not a bare dot and text',()=>{
  parse(status,{ecmaVersion:'latest',sourceType:'module'});
  assert.match(status,/export function ConversationStatus/);
  assert.match(status,/export function PrepareRuntimeDialog/);
  assert.match(status,/role:error\?'alert':'status'/);
  assert.match(status,/'aria-hidden':true/);  // decorative warning icon
  assert.match(status,/statusTitle\(code,t\)/);
  assert.match(status,/onRetry\?h\(ui.Button,\{variant:needsPrepare\?'ghost':'primary'/);
  assert.match(status,/needsPrepare&&onPrepare/);
});
test('prepare dialog lists versions, directory and safety instead of dumping raw JSON',()=>{
  assert.doesNotMatch(status,/JSON\.stringify/);
  assert.match(status,/packages\.map\(pkg=>/);
  assert.match(status,/lastIndexOf\('@'\)/);
  assert.match(status,/t\('status.runtimeDir'\)/);assert.match(status,/t\('status.nodeRequirement'\)/);
  assert.match(status,/t\('status.safety'\)/);
});
test('chat pane routes both start failure and routing failure through the shared status UI',()=>{
  assert.match(chat,/h\(ConversationStatus, \{\n\s*kind: state.loading \? 'loading' : 'error'/);
  assert.match(chat,/code: state.failure\?\.code/);
  assert.match(chat,/needsPrepare: state.failure\?\.needsPrepare/);
  assert.match(chat,/nodeMissing: state.failure\?\.code === 'remote_node_missing'/);
  assert.match(chat,/h\(PrepareRuntimeDialog,/);
  assert.doesNotMatch(chat,/rssh-conversation-loading|acp.startFailed|acp.autoStarting|acp.prepareRuntime|acp.confirmPrepare/);
  assert.match(index,/h\(ConversationStatus, \{ kind: routing.phase === 'loading' \? 'loading' : 'error'/);
  assert.match(index,/onRetry: props.refreshBackend/);
});
test('status styles are calm, centered and theme-token only',async()=>{
  assert.match(css,/\.rssh-status\s*\{[^}]*align-items: center;[^}]*justify-content: center;/);
  assert.match(css,/\.rssh-status-code[^}]*font-family: var\(--ds-font-family-code/);
  assert.match(css,/\.rssh-status-actions/);assert.match(css,/\.rssh-prepare-list/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
  const vars=[...css.matchAll(/var\((--[\w-]+)/g)].map(match=>match[1]);
  assert.ok(vars.every(name=>['--dsw-alias-','--dsw-radius-','--ds-font-','--dsh-'].some(prefix=>name.startsWith(prefix))));
});
