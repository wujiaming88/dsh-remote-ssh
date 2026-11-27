import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {composerConfiguration} from '../src/client/native-composer-model.js';
import zh from '../src/client/zh.js';
import en from '../src/client/en.js';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
const chat=read('chat.js'),css=read('native-composer-view.css'),view=read('native-composer-view.js'),controls=read('composer-controls.js');
const rule=name=>[...css.matchAll(new RegExp('\\.rssh-native-composer-'+name+' \\{([^}]+)\\}','g'))].map(match=>match[1]).join('\n');

test('InputBar and DraftEditor trees are copied as explicit props-only presentation seats',()=>{
  parse(view,{ecmaVersion:'latest',sourceType:'module'});parse(chat,{ecmaVersion:'latest',sourceType:'module'});
  for(const name of ['root','card','overlayAnchor','accessory','scroll','grow','input','placeholder','row','tools','modes','trailing','standardControls','activity','dock'])assert.ok(view.includes(`rssh-native-composer-${name}`),name);
  for(const marker of ['data-composer-card','data-composer-overlay','data-input-scroll','data-composer-placeholder','data-composer-dock'])assert.ok(view.includes(marker));
  assert.match(chat,/h\(NativeComposerView/);assert.match(chat,/editor: \{value: draft, readOnly: sending/);
  assert.match(chat,/overlay: commandMenuOpen/);assert.match(chat,/modes: permission, controls: configs/);
  assert.match(chat,/primary: h\(ComposerControls/);assert.match(chat,/dock: h\(React.Fragment/);
  assert.doesNotMatch(view,/useSession|useInput|useProjection|@deepseek-ai|querySelector|createRoot/);
  assert.doesNotMatch(chat,/className: 'ra-acp-composer'|className: 'ra-acp-compose-bar'/);
});
test('complete native geometry keeps card, sole draft scrollport and standard control wrappers',async()=>{
  assert.match(css,/InputBar\.module\.css/);
  assert.match(rule('card'),/border-radius: var\(--dsw-radius-panel\)/);assert.match(rule('card'),/gap: 12px/);
  assert.match(rule('card'),/padding-top: 8px/);assert.match(rule('card'),/box-shadow: var\(--dsw-elevation-soft\)/);
  assert.match(rule('scroll'),/max-height: var\(--dsh-composer-text-max-height, calc\(14/);assert.match(rule('scroll'),/margin-right: 4px/);
  assert.match(rule('input'),/min-height: 36px/);assert.match(rule('input'),/padding: 4px 8px 0 14px/);
  assert.match(css,/field-sizing: content; overflow: hidden/);
  assert.match(rule('row'),/flex-wrap: wrap/);assert.match(rule('row'),/container-type: inline-size/);
  assert.match(rule('trailing'),/flex: none/);assert.match(rule('standardControls'),/gap: 12px/);
  assert.match(css,/@container \(max-width: 560px\)/);
  assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
});
test('scoping preserves SVG URLs, inherited Host width axes and narrow multi-selector control seats',()=>{
  assert.ok(css.includes("xmlns='http://www.w3.org/2000/svg'"));
  assert.doesNotMatch(css,/rssh-native-composer-w3|rssh-native-composer-org/);
  assert.doesNotMatch(css,/--dsh-composer-(side-clearance|card-max-width|text-max-height)\s*:/);
  assert.match(css,/var\(--dsh-composer-side-clearance, 16px\)/);
  assert.match(rule('trailing'),/max-width: 100%/);
  assert.match(rule('standardControls'),/flex: 1 1 auto; flex-wrap: wrap/);
  assert.match(css,/\.rssh-native-composer-row \.rssh-native-menu-anchor \{ min-width: 0; max-width: 100%/);
  assert.match(css,/max-width: min\(150px, 100%\)/);
});
test('pure selector adapter preserves advertised config IDs, values and mode without defaults',()=>{
  const config={models:{configId:'model',currentValue:'m',options:[{value:'m',name:'Actual model'}]},reasoning:{configId:'thought-level',currentValue:'high',options:[{value:'high',name:'High'}]},modes:{currentModeId:'plan',availableModes:[{id:'plan',name:'Plan'},{id:'bypass',name:'Full access'}]}};
  const {selectors,permission}=composerConfiguration(config,key=>key);
  assert.equal(selectors.length,2);assert.equal(selectors[0].value,'m');assert.equal(selectors[0].options[0].label,'Actual model');
  assert.equal(selectors[1].configId,'thought-level');assert.equal(permission.value,'plan');
  assert.deepEqual(permission.options.map(value=>value.id),['plan','bypass']);
  assert.deepEqual(composerConfiguration({},key=>key),{selectors:[],permission:null});
  assert.equal(composerConfiguration(config,key=>key,true).permission.disabled,true);
  assert.ok(composerConfiguration(config,key=>key,true).selectors.every(value=>value.disabled));
  assert.match(chat,/onChange:value=>action\('acpSetConfig',\{configId,value\}\)/);
  assert.match(chat,/onChange:modeId=>action\('acpSetMode',\{modeId\}\)/);
});
test('native plain buttons avoid generic Button padding and retain local file intake and focus',()=>{
  assert.match(controls,/h\('button',\{type:'button',className:'rssh-native-composer-add'/);
  assert.match(controls,/name:'composer-add',weight:'medium',size:14/);
  assert.match(rule('add'),/width: 28px/);assert.match(rule('primary'),/width: 34px/);
  assert.match(chat,/onClick:\(\)=>attachmentInput.current\?\.click\(\)/);
  assert.match(chat,/type:'file',hidden:true,multiple:true,disabled:sending\|\|readingFiles/);
  assert.match(chat,/event.target.value='';receiveFiles\(files\)/);
  assert.match(chat,/composer\.receiveFiles\(files,state\.capabilities/);assert.match(chat,/webkitGetAsEntry\?\.\(\)\?\.isDirectory/);
  assert.match(view,/event.currentTarget.contains\(target\)/);assert.match(view,/inputRef.current\?\.focus\(\{preventScroll: true\}\)/);
});
test('controlled draft, IME, picker and retained client ownership remain in the adapter',()=>{
  assert.match(chat,/event.isComposing \|\| event.nativeEvent.isComposing/);
  assert.match(chat,/const gesture=composerEnterGesture\(event\)/);
  assert.match(chat,/\['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'\]/);
  assert.match(chat,/pickerScrollTop\(/);assert.match(chat,/client.sendDraft\(pendingKind\?'retry':mode\)/);
  assert.match(chat,/React.useSyncExternalStore\(composer.subscribe,composer.getSnapshot,composer.getSnapshot\)/);
  assert.match(chat,/onPaste: event => \{ if \(event.clipboardData.files.length\)/);
  assert.doesNotMatch(view,/sendDraft|receiveFiles|setDraft|uploads\[/);
});
test('dock reserves a native row; no invented hero floor for a merely empty transcript',()=>{
  assert.match(rule('dock'),/justify-content: center/);assert.match(rule('dock'),/gap: 12px/);
  assert.match(css,/\.rssh-native-composer-root:not\(\.rssh-native-composer-hero\) > \.rssh-native-composer-dock/);
  assert.match(css,/min-height: calc\(22px/);
  assert.match(chat,/h\(SessionStatsPill,\{state\}\),h\(UsagePill,\{state\}\),h\(UsageMeter,\{state\}\)/);
  assert.doesNotMatch(chat,/data-empty/);
});
test('placeholder advertises only remote-supported commands and references',()=>{
  for(const locale of [zh,en]){assert.ok(locale['acp.addAttachment']);assert.match(locale['acp.composerPlaceholder'],/\//);assert.match(locale['acp.composerPlaceholder'],/@/);}
  assert.doesNotMatch(zh['acp.composerPlaceholder'],/创建任务|对话/);
  assert.match(css,/\.rssh-permission-select \.rssh-selector-label \{ max-width: 96px/);
});
