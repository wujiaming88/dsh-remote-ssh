import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {composerControls} from '../src/client/composer-controls-model.js';
import zh from '../src/client/zh.js';
import en from '../src/client/en.js';
const get=overrides=>composerControls({running:false,draft:'',attachments:[],sending:false,busy:'',status:'ready',...overrides});

test('idle empty composer offers a disabled Send, not Stop',()=>{
  const value=get();assert.equal(value.primaryStops,false);assert.equal(value.primaryDisabled,true);assert.equal(value.independentStop,false);assert.equal(value.label,'acp.send');
});
test('running empty composer replaces the primary Send with Stop',()=>{
  for(const draft of ['', ' \n ']){const value=get({running:true,draft});assert.equal(value.primaryStops,true);assert.equal(value.primaryDisabled,false);assert.equal(value.independentStop,false);assert.equal(value.label,'acp.stop');}
});
test('running draft or attachment keeps the primary Steer input action',()=>{
  for(const patch of [{draft:'next instruction'},{attachments:[{path:'test.txt'}]}]){const value=get({running:true,...patch});assert.equal(value.primaryStops,false);assert.equal(value.primaryDisabled,false);assert.equal(value.label,'acp.steer');assert.equal(value.independentStop,false);}
});
test('unacknowledged Send retains an independent Stop without enabling resubmission',()=>{
  const value=get({running:true,draft:'message',sending:true});assert.equal(value.primaryStops,false);assert.equal(value.primaryDisabled,true);assert.equal(value.independentStop,true);assert.equal(value.label,'acp.sending');
});
test('cancellation feedback disables duplicate Stop and updates its accessible label',()=>{
  const value=get({running:true,busy:'acpCancel'});assert.equal(value.primaryStops,true);assert.equal(value.stopping,true);assert.equal(value.primaryDisabled,true);assert.equal(value.label,'acp.stopping');
  assert.equal(zh['acp.stopping'],'正在停止…');assert.equal(en['acp.stopping'],'Stopping…');
});
test('Stop is not gated on a send failure and Send waits for pending attachment reads',()=>{
  assert.equal(get({running:true,status:'error'}).primaryDisabled,false);
  assert.equal(get({draft:'hello',readingFiles:true}).primaryDisabled,true);
  assert.equal(get({draft:'hello',busy:'acpSetConfig'}).primaryDisabled,true);
});
test('icon buttons use native geometry, accessibility and cancel wiring without text or draft mutation',()=>{
  const controls=readFileSync(new URL('../src/client/composer-controls.js',import.meta.url),'utf8');
  const chat=readFileSync(new URL('../src/client/chat.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/client/native-composer-view.css',import.meta.url),'utf8');
  parse(controls,{ecmaVersion:'latest',sourceType:'module'});
  const native=readFileSync(new URL('../src/client/native-icons.js',import.meta.url),'utf8');

  assert.match(controls,/h\(NativeIcon,\{name:'composer-stop',size:16\}\)/);
  assert.match(controls,/h\(NativeIcon,\{name:'composer-send',size:16\}\)/);
  assert.match(native,/"stop":\s*\{\s*"key": "stop-fill"/);
  assert.match(native,/M12\.5 2\.5H3\.5C2\.94772 2\.5 2\.5 2\.94772 2\.5 3\.5/);
  assert.match(native,/M7\.97571 14\.5732L8\.02421 2\.34139/);
  assert.match(controls,/name:'composer-sending',size:16,className:'rssh-native-composer-sendingSpinner'/);
  assert.match(controls,/'aria-label':t\(controls.label\)/);assert.match(controls,/'aria-busy':/);assert.match(controls,/onMouseDown:keepFocus/);
  assert.match(controls,/onClick:controls.primaryStops\?props.onStop:props.onSend/);
  assert.doesNotMatch(controls,/setDraft|setAttachments|dangerouslySetInnerHTML|@deepseek-ai/);
  assert.match(chat,/onStop:\(\)=>action\('acpCancel'\),onSend:send/);
  assert.doesNotMatch(chat,/state.running \? h\(ui.Button[^\n]+acpCancel/);
  assert.match(css,/\.rssh-native-composer-primary\s*\{[^}]*width: 34px;[^}]*height: 34px;/);
  assert.match(css,/background: var\(--dsw-alias-button-info-fill\)/);
  assert.match(css,/animation: rssh-native-input-sending 800ms linear infinite/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: 2400ms/);
});
