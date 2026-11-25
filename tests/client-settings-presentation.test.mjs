import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {connectionRowKey} from '../src/client/settings-model.js';
const source=readFileSync(new URL('../src/client/settings.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/client/settings.css',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const declarations=ast.body.flatMap(node=>node.type==='ExportNamedDeclaration'?[node.declaration]:[node]);
const declaration=name=>declarations.find(node=>node?.type==='FunctionDeclaration'&&node.id.name===name);
const functionSource=name=>{const node=declaration(name);assert.ok(node,name);return source.slice(node.start,node.end);};
const profile={id:'p',name:'Box',host:'box',user:'user',port:22,authMethod:'key',keyPath:'~/.ssh/key',proxyJump:''};

test('connection result identity changes with credentials/target but not a display rename',()=>{
  const before=connectionRowKey(profile);
  for(const patch of [{authMethod:'kerberos'},{keyPath:'~/.ssh/new-key'},{host:'other'},{user:'other'},{port:2222},{proxyJump:'jump'},{id:'another'}])assert.notEqual(connectionRowKey({...profile,...patch}),before);
  assert.equal(connectionRowKey({...profile,name:'Renamed'}),before);
  assert.equal(connectionRowKey({...profile,remoteRoot:'/new'}),before);
  assert.match(source,/h\(ConnectionRow,\{key:connectionRowKey\(profile\),profile/);
});
test('native density uses separator rows rather than framed cards and heavy titles',()=>{
  assert.match(css,/\.rssh-settings-row\s*\{[^}]*padding: 16px 0;[^}]*border-bottom: \.5px solid var\(--dsw-alias-border-l2\)/);
  const list=css.match(/\.rssh-settings-list\s*\{([^}]+)\}/)[1];assert.doesNotMatch(list,/border|radius|overflow: hidden/);
  assert.match(css,/\.rssh-settings-row-title[^}]*font-size: 14px; line-height: 20px; font-weight: 400/);
  assert.match(css,/\.rssh-settings-muted[^}]*font-size: 12px; line-height: 18px/);
  assert.doesNotMatch(css,/font-family:monospace|font-weight:600|font-weight:700/);
});
test('layout responds to the actual settings container, not just the window size',async()=>{
  assert.match(css,/container: rssh-settings \/ inline-size/);
  assert.match(css,/@container rssh-settings \(max-width: 430px\)/);
  assert.match(css,/\.rssh-settings-row[^}]*flex-wrap: wrap/);
  assert.match(css,/\.rssh-settings-info[^}]*flex: 1 1 200px/);
  const result=await transform(css,{loader:'css'});assert.equal(result.warnings.length,0);
  assert.doesNotMatch(css,/position: fixed|--dsw-static|#[0-9a-fA-F]{3,8}/);
  const vars=[...css.matchAll(/var\((--[\w-]+)/g)].map(match=>match[1]);assert.ok(vars.every(name=>name.startsWith('--dsw-alias-')));
});
test('connection tests are explicit and their feedback stays in the owning row',()=>{
  const row=functionSource('ConnectionRow');
  assert.match(row,/const test=\(\)=>\{setResult\(''\);request.run\('testConnection',\{id:profile.id\}/);
  assert.match(row,/onClick:test/);assert.match(row,/'data-tone':'success',role:'status'/);
  assert.match(row,/'data-tone':'error',role:'alert'/);assert.match(row,/request.busy/);
  const lifetime=functionSource('useRequest');assert.match(lifetime,/live.current = false; pending.current = false; generation.current\+\+/);
  assert.match(lifetime,/if \(!live.current \|\| token !== generation.current\) return/);
  assert.doesNotMatch(functionSource('SettingsSection'),/testConnection/);
});
test('more menus capture the row, remain keyboard accessible and preserve confirmations',()=>{
  const menu=functionSource('SettingsMore');
  assert.match(menu,/h\(ui.Menu/);assert.match(menu,/'aria-label':label/);assert.match(menu,/onAction\(id\)/);
  assert.match(menu,/name/);assert.match(source,/onEdit:\(\)=>setDialog\(\{kind:'profile',target:profile\}\)/);
  assert.match(source,/onDelete:\(\)=>setDialog\(\{kind:'deleteProfile',target:profile\}\)/);
  const confirm=functionSource('DeleteDialog');assert.match(confirm,/if \(blocked \|\| worktree && !confirmed\) return/);
  assert.match(confirm,/confirm: true/);assert.match(source,/workspaces.some\(workspace => workspace.profileId === dialog.target.id\)/);
});
test('primary action and modal styling stay scoped to SSH settings',()=>{
  assert.match(source,/variant:'primary',onClick:\(\)=>setDialog\(\{kind:'profile',target:null\}\)/);
  assert.equal((source.match(/className:'rssh-settings-dialog'/g)||[]).length,3);
  const controls=readFileSync(new URL('../src/client/native-controls.css',import.meta.url),'utf8');
  assert.match(controls,/\.rssh-native-button-primary\s*\{[^}]*background: var\(--dsw-alias-button-primary-fill\);\s*color: var\(--dsw-alias-label-primary-foreground\)/);
  assert.doesNotMatch(css,/--dsw-alias-button-primary-fill/); // visual primary state belongs to the copied control, not a settings repaint
  assert.match(css,/\.rssh-settings-dialog \.rssh-native-button\.rssh-settings-destructive/);
  assert.match(source,/className:'rssh-settings-destructive'/);
  assert.doesNotMatch(source,/function BackendEditor|workspace\.backend|kind:'backend'/);
  assert.doesNotMatch(source,/require\(|@deepseek-ai\/dsh-client-ui-primitives|document\.querySelector|window\.fetch\s*=/);
});
