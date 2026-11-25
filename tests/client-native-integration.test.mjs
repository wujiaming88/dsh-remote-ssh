import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parse} from 'acorn';

const root=new URL('../src/client/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const ast=source=>parse(source,{ecmaVersion:'latest',sourceType:'module'});
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>walk(child,visit));else if(value&&typeof value==='object')walk(value,visit);}
const property=(node,name)=>node?.properties?.find(item=>item.type==='Property'&&(item.key.name??item.key.value)===name)?.value;
function objectKeys(source,name){let keys;walk(ast(source),node=>{if(node.type==='VariableDeclarator'&&node.id.name===name){const value=node.init.type==='CallExpression'?node.init.arguments[0]:node.init;keys=value.properties.map(item=>item.key.name??item.key.value);}});assert.ok(keys,name);return keys;}

test('every direct native icon role exists and handmade SVGs stay confined to explicit data views',()=>{
  const icons=read('native-icons.js');
  const names=new Set([...objectKeys(icons,'NATIVE_ICON_DATA'),...objectKeys(icons,'NATIVE_ICON_SOURCES')]);
  let calls=0;
  for(const file of readdirSync(root).filter(name=>name.endsWith('.js'))){
    walk(ast(read(file)),node=>{
      if(node.type!=='CallExpression'||node.callee.name!=='h')return;
      if(node.arguments[0]?.name==='NativeIcon'){
        const name=property(node.arguments[1],'name');
        if(name?.type==='Literal'){assert.ok(names.has(name.value),`${file}: ${name.value}`);calls++;}
      }
      if(['svg','path','rect','circle','ellipse'].includes(node.arguments[0]?.value))
        assert.ok(['native-controls.js','usage.js'].includes(file),`untracked handmade SVG in ${file}`);
    });
  }
  assert.ok(calls>=14,'actual page callsites, not just a manually curated icon list');
});

test('copied controls and styles are wired once, without Harness Client runtime imports',()=>{
  const entry=read('index.js'),ui=read('ui.js');
  for(const [module,factory] of [['native-controls','createNativeControls'],['native-overlays','createNativeOverlays'],['native-text-controls','createNativeTextControls']]){
    assert.ok(ui.includes(`./${module}.js`));assert.ok(ui.includes(`${factory}(React`));
    assert.ok(entry.includes(`./${module}.css`));
  }
  for(const file of readdirSync(root).filter(name=>name.endsWith('.js'))){
    for(const node of ast(read(file)).body.filter(node=>node.type==='ImportDeclaration'))
      assert.doesNotMatch(node.source.value,/@deepseek-ai\/dsh-client/);
  }
  assert.doesNotMatch(ui,/function (?:Button|Input|Modal|Menu|TextBlock|MarkdownText)\(/);
  assert.match(read('disclosure.js'),/h\(ui\.StateDot,\{state:'ongoing',className:'rssh-flow-active-mark'\}\)/);
  assert.doesNotMatch(read('tool-stream.css').match(/\.rssh-flow-active-mark \{[^}]+\}/)?.[0]||'',/background:|border-radius:|width:|height:/);
});

test('all configuration selects use the copied Input shell and workspace flex tracks the wrapper',()=>{
  for(const file of ['workspaces.js','session-setup.js','settings.js','cards.js']){
    assert.match(read(file),/h\(ui\.SelectField,/);
    assert.doesNotMatch(read(file),/h\(['"]select['"]/);
  }
  const controls=read('native-controls.js');
  assert.match(controls,/const SelectField = React\.forwardRef/);
  assert.match(controls,/h\('select', \{\.\.\.props, ref,/);
  assert.match(controls,/name: 'chevron-down'/);
  assert.match(read('workspaces.js'),/\.rssh-flow-line > \.rssh-native-input-wrap\{flex:1;min-width:0\}/);
});

test('question checkbox adapters preserve boolean values and enum choice identities',()=>{
  const source=read('cards.js'),callbacks=[];
  walk(ast(source),node=>{
    if(node.type==='CallExpression'&&node.callee.name==='h'&&node.arguments[0]?.object?.name==='ui'&&node.arguments[0]?.property?.name==='Checkbox'){
      const callback=property(node.arguments[1],'onChange');callbacks.push(source.slice(callback.start,callback.end));
    }
  });
  assert.equal(callbacks.length,2);
  const changes=[];
  const make=(code,value,choice,key)=>Function('value','choice','key','setValue',`return (${code})`)(value,choice,key,(...args)=>changes.push(args));
  make(callbacks[0],null,null,'confirm')(true);
  make(callbacks[0],null,null,'confirm')(false);
  const original=[1,2];
  make(callbacks[1],original,2,'choices')(true);
  make(callbacks[1],original,1,'choices')(false);
  make(callbacks[1],undefined,'x','choices')(true);
  assert.deepEqual(changes,[['confirm',true],['confirm',false],['choices',[1,2]],['choices',[2]],['choices',['x']]]);
  assert.deepEqual(original,[1,2]);
  assert.match(source,/field\.type === 'boolean' \|\| field\.type === 'array' \? 'div' : 'label'/);
});

test('copied upstream license and adaptation notes are included in package deliverables',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  for(const file of ['THIRD_PARTY_NOTICES.md','docs/NATIVE_UI.md'])assert.ok(pkg.files.includes(file));
  const notices=readFileSync(new URL('../THIRD_PARTY_NOTICES.md',import.meta.url),'utf8');
  assert.match(notices,/Copyright \(c\) 2026 DeepSeek/);
  assert.match(notices,/Permission is hereby granted, free of charge/);
  assert.match(notices,/THE SOFTWARE IS PROVIDED "AS IS"/);
});
