import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
const root=fileURLToPath(new URL('..',import.meta.url));
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const read=path=>readFileSync(join(root,path),'utf8');

test('bundle has one modern plugin and no native configuration overrides',()=>{
 const patch=read('cordis.patch.yml');
 assert.match(patch,/- insert:/);assert.match(patch,/id: remote-ssh/);
 assert.doesNotMatch(patch,/better-sidebar|terminal-controller|!!js|shell:/);
 assert.equal(pkg.scripts.test,'node --test tests/*.test.mjs');
 assert.ok(pkg.files.includes('lib/*.js'));
});
test('all production Host modules are reachable from the actual package entries',()=>{
 const seen=new Set();
 function visit(path){path=resolve(path);if(seen.has(path))return;seen.add(path);assert.ok(existsSync(path),path);
  const tree=parse(readFileSync(path,'utf8'),{ecmaVersion:'latest',sourceType:'module'});
  for(const node of tree.body){const spec=node.source?.value;if(spec?.startsWith('.'))visit(resolve(dirname(path),spec));}
 }
 visit(join(root,'lib/index.js'));visit(join(root,'lib/client.js'));
 const files=readdirSync(join(root,'lib')).filter(name=>name.endsWith('.js')).map(name=>resolve(root,'lib',name));
 assert.deepEqual(files.filter(file=>!seen.has(file)),[],'unreachable production files must be deleted');
});
test('no legacy transport, native monkeypatches, or dormant UI implementations remain',()=>{
 const files=[...readdirSync(join(root,'lib')).filter(name=>name.endsWith('.js')).map(name=>'lib/'+name),
  ...readdirSync(join(root,'src/client')).filter(name=>name.endsWith('.js')).map(name=>'src/client/'+name)];
 for(const file of files)assert.doesNotMatch(read(file),/local-wrapper|legacyNativeFsBridge|installFsReadBridge|installFsWriteBridge|dsh-better-sidebar|body:has\(\.ra-acp|RemoteAgentsPanel|AgentFilesModal|syncDown|syncUp|tmux|__DSH_MODULES__/i,file);
 assert.ok(!existsSync(join(root,'src/client-main.js')));assert.ok(!existsSync(join(root,'lib/client-ui.js')));
});
test('local dependencies contain no remote adapter or removed YAML runtime',()=>{
 assert.equal(pkg.dependencies['@agentclientprotocol/claude-agent-acp'],undefined);
 assert.equal(pkg.dependencies['@agentclientprotocol/codex-acp'],undefined);
 assert.equal(pkg.dependencies.yaml,undefined);
 assert.equal(pkg.dependencies['@agentclientprotocol/sdk'],'2.9.1');
 assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-tools'],'0.2.2-rc.5');
 assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-client-ui-primitives'],undefined);
});
test('every literal runtime locale key has both Chinese and English text',async()=>{
 const zh=(await import('../src/client/zh.js')).default,en=(await import('../src/client/en.js')).default;
 const missing=[];
 for(const name of readdirSync(join(root,'src/client')).filter(name=>name.endsWith('.js')&&!['zh.js','en.js','settings.js','workspaces.js'].includes(name))){
  const source=read('src/client/'+name);
  for(const match of source.matchAll(/\bt\(['"]((?:acp|agents|common)\.[^'"]+)['"]/g))if(!(match[1] in zh)||!(match[1] in en))missing.push(name+':'+match[1]);
 }
 assert.deepEqual(missing,[]);
});
