import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import zh from '../src/client/zh.js';
import en from '../src/client/en.js';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
const chat=read('chat.js'),css=read('styles.css'),controls=read('composer-controls.js'),shared=read('shared.js');
const ast=parse(chat,{ecmaVersion:'latest',sourceType:'module'});
function nodes(node){return !node||typeof node!=='object'?[]:[node,...Object.values(node).flatMap(value=>Array.isArray(value)?value.flatMap(nodes):nodes(value))];}
const all=nodes(ast);
const declaration=name=>all.find(n=>n.type==='VariableDeclarator'&&n.id.name===name).init;
const h=(type,props,...children)=>({type,props,children});
function configExpression(name,state,options={}){
  const node=declaration(name),calls=[];
  const result=new Function('state','h','Select','PermissionIcon','t','busy','sending','action','return '+chat.slice(node.start,node.end))(state,h,'Select','PermissionIcon',key=>key,options.busy||'',!!options.sending,(...args)=>calls.push(args));
  return {result,calls};
}
const rule=name=>css.match(new RegExp('\\.'+name+' \\{([^}]+)\\}'))?.[1]||'';

test('composer has native surface, panel radius, text rhythm and bounded content sizing',()=>{
  const card=rule('ra-acp-composer'),textarea=rule('ra-acp-textarea');
  assert.match(card,/border-radius: var\(--dsw-radius-panel\)/);assert.match(card,/background: var\(--dsw-specific-input-major\)/);
  assert.match(card,/box-shadow: var\(--dsw-elevation-soft\)/);assert.match(card,/gap: 12px/);assert.match(card,/padding-top: 8px/);
  assert.match(card,/748px\) \+ 32px/);assert.match(card,/24px \+ var\(--dsh-content-font-delta/);
  assert.match(textarea,/field-sizing: content/);assert.match(textarea,/max-height: min\(336px, 40dvh\)/);assert.match(textarea,/padding: 4px 8px 0 14px/);
  assert.match(chat,/value: draft, rows: 1/);assert.match(css,/\.ra-acp-textarea::placeholder \{ color: var\(--dsw-alias-label-caption\)/);
});
test('permission stays left of model/reasoning and controls wrap instead of clipping',()=>{
  assert.match(chat,/h\(AttachmentButton,[\s\S]*?\),permission\)/);
  assert.match(chat,/className: 'ra-acp-compose-right'[\s\S]*?className: 'ra-acp-configs'[\s\S]*?h\(ComposerControls/);
  assert.doesNotMatch(chat,/ra-acp-config-label/);
  assert.match(rule('ra-acp-compose-bar'),/flex-wrap: wrap/);assert.match(rule('ra-acp-compose-bar'),/container-type: inline-size/);
  assert.match(css,/@container \(max-width: 460px\)/);assert.match(css,/\.rssh-permission-select \.rssh-selector-label \{ max-width: 96px/);
  assert.doesNotMatch(rule('ra-acp-compose-left'),/overflow-x: auto/);
  assert.match(shared,/'aria-label': `\$\{label\}/);assert.match(shared,/title: `\$\{label\}/);
});
test('selectors preserve advertised config IDs, values and current mode without defaults',()=>{
  const state={config:{models:{configId:'model',currentValue:'m',options:[{value:'m',name:'Actual model'}]},reasoning:{configId:'thought-level',currentValue:'high',options:[{value:'high',name:'High'}]},modes:{currentModeId:'plan',availableModes:[{id:'plan',name:'Plan'},{id:'bypass',name:'Full access'}]}}};
  const models=configExpression('configs',state);assert.equal(models.result.length,2);
  const model=models.result[0].children[0],reasoning=models.result[1].children[0];
  assert.equal(model.props.value,'m');assert.equal(model.props.options[0].label,'Actual model');
  reasoning.props.onChange('high');assert.deepEqual(models.calls,[['acpSetConfig',{configId:'thought-level',value:'high'}]]);
  const mode=configExpression('permission',state);assert.equal(mode.result.props.value,'plan');assert.ok(mode.result.props.icon);
  assert.deepEqual(mode.calls,[]);mode.result.props.onChange('bypass');assert.deepEqual(mode.calls,[['acpSetMode',{modeId:'bypass'}]]);
  assert.equal(configExpression('permission',{config:{}}).result,null);assert.deepEqual(configExpression('configs',{config:{}}).result,[]);
  assert.equal(configExpression('permission',state,{sending:true}).result.props.disabled,true);
});
test('attachment plus invokes only file selection and files reuse existing validation',()=>{
  assert.match(controls,/export function AttachmentButton/);assert.match(controls,/'aria-label':t\('acp.addAttachment'\)/);
  assert.match(rule('rssh-composer-add'),/width: 28px;[\s\S]*height: 28px/);
  assert.match(chat,/onClick:\(\)=>attachmentInput.current\?\.click\(\)/);
  const fileInput=all.find(n=>n.type==='CallExpression'&&n.callee.name==='h'&&n.arguments[0]?.value==='input');
  const calls=[],props=new Function('h','attachmentInput','sending','readingFiles','receiveFiles','return '+chat.slice(fileInput.start,fileInput.end))(h,{current:null},false,false,files=>calls.push(files)).props;
  assert.equal(props.hidden,true);assert.equal(props.multiple,true);
  const files=[{name:'hello.txt'}],event={target:{files,value:'selected'}};props.onChange(event);assert.deepEqual(calls,[files]);assert.equal(event.target.value,'');
  assert.match(chat,/combined.length > 16/);assert.match(chat,/capabilities.promptCapabilities\?\.image/);
});
test('dock is centered and reserves space before real metrics arrive',()=>{
  const dock=rule('rssh-compose-dock');assert.match(dock,/justify-content: center/);assert.match(dock,/gap: 0 12px/);
  assert.match(dock,/min-height: calc\(22px/);assert.match(dock,/padding-top: 4px/);assert.match(dock,/flex-wrap: wrap/);
  assert.match(css,/\.rssh-stats-trigger, \.rssh-usage-trigger \{ font-size: calc\(var\(--dsh-content-font-size-secondary, 13px\) - 1px\)/);
  assert.match(chat,/h\(SessionStatsPill,\{state\}\),h\(UsagePill,\{state\}\),h\(UsageMeter,\{state\}\)/);
});
test('placeholder advertises supported commands and file references, not native-only tasks',()=>{
  for(const locale of [zh,en]){assert.ok(locale['acp.addAttachment']);assert.match(locale['acp.composerPlaceholder'],/\//);assert.match(locale['acp.composerPlaceholder'],/@/);}
  assert.doesNotMatch(zh['acp.composerPlaceholder'],/创建任务|对话/);
  assert.match(css,/\.ra-acp-command-selected \{ background: var\(--dsw-alias-interactive-bg-hover\) !important/);
});
