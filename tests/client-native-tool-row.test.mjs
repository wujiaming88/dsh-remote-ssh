import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {toolHeaderPresentation} from '../src/client/tool-header-model.js';
import {toolFlowModel,processRowSummary} from '../src/client/tool-model.js';
const read=path=>readFileSync(new URL('../src/client/'+path,import.meta.url),'utf8');
const row=read('native-tool-row.js'),css=read('native-tool-row.css'),cards=read('cards.js'),disclosure=read('disclosure.js');
const ast=parse(row,{ecmaVersion:'latest',sourceType:'module'});
// Execute only standalone scalar/event-policy functions. No React, fake DOM,
// browser, component invocation or custom renderer participates in these tests.
function policy(name) {
  const node=ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name===name).declaration;
  return Function('return ('+row.slice(node.start,node.end)+')')();
}
const fileTarget=policy('nativeToolFileTarget'),rowKey=policy('nativeToolRowKeyDown'),fileKey=policy('nativeToolFileKeyDown');
function header(tool,compact=false) {
  const model=toolFlowModel(tool),presentation=toolHeaderPresentation({...model,rawInput:tool.rawInput});
  return {...presentation,summary:processRowSummary(presentation.summary,!compact,model.failed,model.error),failed:model.failed};
}

test('single structured path opens its unmodified value, not title or line label',()=>{
  const model=header({kind:'read',title:'Read /invented/from/title',locations:[{path:'/remote/a b.js',line:19}],status:'completed'});
  assert.equal(model.summary,'/remote/a b.js:19');
  assert.equal(fileTarget({...model,onOpenOutput:()=>{}}),'/remote/a b.js');
  assert.equal(fileTarget({...model,onOpenOutput:undefined}),undefined);
});
test('multi-file summaries, failures, compact rows and unstructured titles are never first-file links',()=>{
  for(const tool of [
    {kind:'edit',locations:[{path:'a'},{path:'b'}]},
    {kind:'read',title:'Read /not-a-target'},
    {kind:'read',rawInput:{path:'/not-structured'}},
    {kind:'read',locations:[{path:'a'}],status:'failed',error:'a'},
  ])assert.equal(fileTarget({...header(tool),onOpenOutput:()=>{}}),undefined);
  assert.equal(fileTarget({...header({kind:'read',locations:[{path:'a'}]},true),onOpenOutput:()=>{}}),undefined);
});
test('failure summaries take precedence even when compact hides normal summaries',()=>{
  const tool={kind:'execute',title:'Long original command title',rawInput:{command:'printf full'},status:'failed',error:'Permission denied\nfull detail'};
  assert.equal(header(tool,true).summary,'Permission denied');
});
test('row Enter/Space toggle once; child file keys do not reach row toggle',()=>{
  let toggles=0,prevented=0,stopped=0;
  for(const key of ['Enter',' ']) {
    rowKey({key,target:'row',currentTarget:'row',preventDefault(){prevented++;}},()=>toggles++);
    rowKey({key,target:'file',currentTarget:'row',preventDefault(){throw Error('child must not be prevented');}},()=>toggles++);
    fileKey({key,stopPropagation(){stopped++;}});
  }
  rowKey({key:'Escape',target:'row',currentTarget:'row',preventDefault(){throw Error('unexpected');}},()=>toggles++);
  assert.deepEqual([toggles,prevented,stopped],[2,2,2]);
});
test('copied native row uses role-button div and isolated real file button',()=>{
  assert.match(row,/h\('div',\{ref:trigger,className:'rssh-native-tool-row',role:'button',tabIndex:0/);
  assert.match(row,/'aria-expanded':open,'aria-controls':id/);
  assert.match(row,/!decoration&&target!==undefined\?h\('button'/);
  assert.match(row,/event\.stopPropagation\(\);onOpenOutput\(target\)/);
  assert.match(row,/name:'chevron-up',size:14/);
  assert.match(row,/name:'chevron-down',size:14/);
  assert.match(row,/'aria-hidden':true,inert:''/);
  assert.doesNotMatch(row,/title\.(?:split|match)|dangerouslySetInnerHTML/);
});
test('native geometry stays intrinsic title + 2px separator + flexible summary',()=>{
  assert.match(css,/\.rssh-native-tool-leading \{[^}]*width: calc\(16px[^}]*margin-right: 6px/s);
  assert.match(css,/\.rssh-native-tool-title \{ flex: none;/);
  assert.match(css,/\.rssh-native-tool-sep \{ flex: none; width: 2px; height: 2px;[^}]*margin: 0 8px/);
  assert.match(css,/\.rssh-native-tool-summary \{ flex: 1 1 auto; min-width: 0;[^}]*text-overflow: ellipsis/);
  assert.match(css,/\.rssh-native-tool-file-link \{\s*flex: 0 1 auto;[^}]*text-decoration: underline dotted;/s);
  assert.doesNotMatch(read('tool-stream.css'),/flex: [^;}]*60%|flex: [^;}]*40%/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/\.rssh-native-tool-row:focus-visible/);
});
test('native body views retain full commands, output, raw errors, sources and children',()=>{
  parse(cards,{ecmaVersion:'latest',sourceType:'module'});
  parse(disclosure,{ecmaVersion:'latest',sourceType:'module'});
  for(const name of ['DiffBlock','TerminalBlock','ReadBlock'])assert.match(cards,new RegExp('h\\(ui\\.'+name));
  assert.match(cards,/className:'rssh-native-tool-terminal-body',labels:labels\.terminal,maxLines:Number\.MAX_SAFE_INTEGER/);
  assert.match(cards,/originalTitles=toolDetailTitles\(tool,model\)/);
  assert.match(read('tool-model.js'),/\[tool\.title,model\.title,model\.description\]/);
  assert.match(cards,/\['title','name','command','errorMessage','error','exitStatus','exitCode'\]/);
  assert.match(cards,/h\(AcpMarkdown,\{text,labels:labels\.markdown\}\)/);
  assert.doesNotMatch(cards,/lines\.slice\(0,20\)/);
  assert.match(cards,/h\(AcpNativeDetails,\{t,payload:tool\}\),nested\(props,item\)/);
  assert.match(cards,/h\(AcpSourceFallback,\{item,t,fallback:props\.sourceFallback\}\)/);
  assert.match(css,/max-height: 150px; overflow-y: auto/);
  assert.match(css,/--rssh-native-terminal-output-max-height: 224px/);
});
test('native CSS parses without warnings and bounded process owns the scrollport',async()=>{
  assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
  assert.match(css,/\.rssh-process-disclosure\[data-scroll-body\] :is\([^}]+\) \{ max-height: none; overflow-y: visible;/);
});
test('owned disclosure retains lazy-mounted state and reading anchors around native header',()=>{
  assert.match(disclosure,/nativeTool\?h\(NativeToolRow,\{\.\.\.nativeTool,title,summary,icon,running,failed,status,open,id,trigger,toggle,hidden:flat\|\|hideTrigger\}\)/);
  assert.match(disclosure,/requestReadingIntent\(event\.currentTarget\)/);
  assert.match(disclosure,/open\|\|mounted\?\(typeof children==='function'\?children\(\):children\):null/);
  assert.match(disclosure,/boundedProcessScroll\(body/);
});
