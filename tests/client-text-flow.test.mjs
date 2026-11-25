// Pure transforms + parsed source contracts only; no React/DOM/clipboard mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {parseMarkdown, tableCells, diffLines, stripTerminal} from '../src/client/ui-pure.js';
const source=readFileSync(new URL('../src/client/ui.js',import.meta.url),'utf8');
import {textControlWindow, readControlRows, terminalControlState} from '../src/client/native-text-controls.js';
const nativeSource=readFileSync(new URL('../src/client/native-text-controls.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/client/native-text-controls.css',import.meta.url),'utf8');
const factories=[[source,'createUi'],[nativeSource,'createNativeTextControls']].map(([code,name])=>{
 const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
 const factory=ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name===name).declaration;
 return {code,factory};
});
const section=name=>{for(const {code,factory} of factories){const node=factory.body.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);if(node)return code.slice(node.start,node.end);}assert.fail(name);};

test('copy is exported once and keeps payload-only clipboard, check, error and accessible icon-only contracts',()=>{
  assert.match(source,/CopyButton: CopyButton/);
  const copy=section('CopyButton');
  assert.match(copy,/clipboard\.writeText\(text\(props\.text\)\)/);
  assert.match(copy,/state === 'copied' \? 'check' : 'copy'/);
  assert.match(copy,/props\.iconOnly \? null : caption/);
  assert.match(copy,/'aria-label':/);assert.match(copy,/title:/);
  assert.match(copy,/role: 'status'/);assert.match(copy,/role: 'alert'/);
  assert.match(copy,/generation !== operation\.current/);
  assert.match(copy,/mounted\.current = false; operation\.current\+\+/);
  assert.doesNotMatch(copy,/execCommand|innerHTML|oldNumber|\.trim\(/);
});

test('text blocks have a lightweight banner, real all-row expansion, stable disclosure ID and icon-only actions',()=>{
  const block=section('TextBlock');
  const header=section('Header'), expansion=section('Expansion');
  assert.match(header,/'data-code-block-banner': true/);assert.doesNotMatch(nativeSource,/rsui-block-toolbar/);
  assert.match(block,/textControlWindow\(rows, props\.maxLines, expanded\)/);
  assert.match(block,/window\.head\.map\(rowView\)/);assert.match(block,/window\.tail\.map/);
  assert.match(block,/const id = React\.useId\(\)/);
  assert.match(expansion,/'aria-expanded': expanded, 'aria-controls': id/);
  assert.match(header,/'aria-pressed': wrapped, 'aria-controls': id/);
  assert.match(header,/title: wrapLabel,[\s\S]*?'aria-label': wrapLabel/);
  assert.match(header,/h\(CopyButton,[\s\S]*?iconOnly: true/);
  assert.match(block,/tabIndex: 0/);
  assert.doesNotMatch(block,/\\u200b/);
  assert.match(section('ReadBlock'),/typeof props\.text === 'string' \? props\.text/);
  assert.match(section('DiffBlock'),/copyText: text\(diff\.newText\)/);
  assert.match(section('renderBlocks'),/copyText: block\.text/);
});

test('native head/tail preview preserves all rows on expansion and complete copy data',()=>{
  const rows=Array.from({length:9},(_,index)=>({number:index+1,text:'line '+(index+1)}));
  const collapsed=textControlWindow(rows,4,false);
  assert.equal(collapsed.hidden,5);assert.deepEqual(collapsed.head,rows.slice(0,2));assert.deepEqual(collapsed.tail,rows.slice(-2));
  const expanded=textControlWindow(rows,4,true);
  assert.equal(expanded.hidden,5);assert.equal(expanded.head,rows);assert.deepEqual(expanded.tail,[]);
  const odd=textControlWindow(rows,3,false);assert.equal(odd.head.length,2);assert.equal(odd.tail.length,1);
  const one=textControlWindow(rows,1,false);assert.equal(one.head.length,1);assert.equal(one.tail.length,0);
  assert.equal(textControlWindow(rows,20,false).head,rows);
  assert.deepEqual(readControlRows({text:'first\nlast\n'}).map(row=>row.text),['first','last','']);
  assert.deepEqual(readControlRows({lines:[{number:42,text:'x'},'y']}),[{number:42,text:'x'},{number:2,text:'y'}]);
  assert.match(section('TextBlock'),/rows\.map\(row => row\.text\)\.join\('\\n'\)/);
  assert.match(section('TextBlock'),/copyText = props\.copyText == null/);
  assert.match(section('TextBlock'),/row\.oldNumber \?\? ''/);
  assert.match(section('TextBlock'),/row\.number \?\? ''/);
});

test('terminal status is supplied-only, absent exit is not success, and empty output is metadata rather than payload',()=>{
  const terminal=section('TerminalBlock');
  assert.match(terminal,/terminalControlState\(props\)/);
  assert.match(terminal,/h\(CopyButton, \{text: output/);
  assert.match(terminal,/rows\.length \? h\('div', \{id, tabIndex: 0/);
  assert.match(terminal,/rssh-native-terminal-empty/);
  assert.doesNotMatch(terminal,/Number\(props\.exitCode\)|'done'|'failed'|rows = \[\{ text: label/);
  const unknown=terminalControlState({output:'\u001b[31mout\u001b[0m',command:'echo out'});
  assert.equal(unknown.status,'No exit code');assert.equal(unknown.failed,false);assert.equal(unknown.output,'out');
  assert.equal(terminalControlState({exitCode:0}).status,'Exit code: 0');
  assert.equal(terminalControlState({exitCode:0}).failed,false);
  assert.equal(terminalControlState({exitCode:7}).failed,true);
  assert.equal(terminalControlState({signal:'SIGTERM',exitCode:0}).status,'Signal: SIGTERM');
  assert.equal(terminalControlState({running:true,signal:'SIGTERM',exitCode:7}).status,'Running');
  const empty=terminalControlState({});assert.equal(empty.output,'');assert.equal(empty.command,'');
  assert.equal(terminalControlState({labels:{noExitCode:'Unknown'}}).status,'Unknown');
});

test('text flow follows Host font axes without fixed vertical scroll cages or wide-table breakout',()=>{
  assert.match(css,/font: var\(--dsw-font-markdown-base\)/);
  assert.match(css,/font-size:\s*var\(--dsh-content-font-size,\s*14px\)/);
  assert.match(css,/line-height:\s*calc\(24px \+ var\(--dsh-content-font-delta,\s*0px\)\)/);
  assert.match(css,/font-size:\s*var\(--dsh-content-font-size-secondary,\s*13px\)/);
  assert.match(css,/font-family:\s*var\(--ds-font-family-code,\s*var\(--dsh-font-family-code/);
  assert.match(css,/font-size:\s*var\(--dsh-code-font-size,\s*11px\)/);
  assert.match(css,/line-height:\s*calc\(19px \+ var\(--dsh-code-font-delta,\s*0px\)\)/);
  assert.doesNotMatch(css,/480px|ui-monospace/);
  const contentRules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selector])=>/\.rssh-native-(?:text-body|terminal-output|code-block :where\(pre\)|markdown-table-scroll)/.test(selector));
  assert.ok(contentRules.length>=4);
  for(const [,selector,declarations] of contentRules){
    assert.doesNotMatch(declarations,/(?:max-)?height:\s*\d+px|margin-left:\s*-/ ,selector);
    if(/max-height:/.test(declarations))assert.match(declarations,/max-height:\s*(?:none|var\(--rssh-native-terminal-output-max-height, none\))/);
  }
  assert.match(css,/\.rssh-native-markdown-table-scroll\s*\{[^}]*max-width: 100%;[^}]*overflow-x: auto/);
  assert.match(css,/\.rssh-native-markdown p\s*\{\s*margin: 16px 0;/);
  assert.match(css,/\.rssh-native-markdown li > :where\(ul, ol\)\s*\{\s*margin-top: 4px;/);
  assert.match(section('renderBlocks'),/className: 'rssh-native-markdown-table-scroll', tabIndex: 0/);
  for(const code of [source,nativeSource])assert.doesNotMatch(code,/dangerouslySetInnerHTML|innerHTML|require\(['"]@deepseek-ai/);
});

test('owned Markdown keeps tight and loose lists distinct without splitting ordered starts',()=>{
  const tight=parseMarkdown('3. first\n4. next')[0];
  assert.equal(tight.loose,false);assert.equal(tight.start,3);assert.equal(tight.items.length,2);
  const loose=parseMarkdown('3. first\n\n4. next\n\n   second paragraph')[0];
  assert.equal(loose.loose,true);assert.equal(loose.start,3);assert.equal(loose.items.length,2);
  assert.equal(loose.items[1].children.length,2);
  assert.deepEqual(tableCells('| ``a`|b`` | end |'),['``a`|b``','end']);
  assert.equal(parseMarkdown('| a | b |\n| --- |')[0].type,'paragraph');
});

test('separate diff edits align interior context and preserve conflicts, empty final lines and both line-number axes',()=>{
  const before='first\nold\nshared\nold2\n<<<<<<< ours\n=======\n>>>>>>> theirs\n';
  const after='first\nnew\nshared\nnew2\n<<<<<<< ours\n=======\n>>>>>>> theirs\n';
  const rows=diffLines(before,after);
  assert.equal(rows.filter(r=>r.kind==='add').length,2);
  assert.equal(rows.filter(r=>r.kind==='remove').length,2);
  assert.ok(rows.some(r=>r.kind==='context'&&r.text==='shared'&&r.oldNumber===3&&r.number===3));
  assert.equal(rows.filter(r=>r.kind!=='add').map(r=>r.text).join('\n'),before);
  assert.equal(rows.filter(r=>r.kind!=='remove').map(r=>r.text).join('\n'),after);
  for(const [kind,axis] of [['add','oldNumber'],['remove','number']])assert.ok(rows.filter(r=>r.kind===kind).every(r=>r[axis]===null));
});

test('diff reconstruction and monotonic numbers hold for varied deterministic edits and bounded fallback',()=>{
  let seed=73;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let n=0;n<150;n++){
    const lines=()=>Array.from({length:next()%25},()=>['a','b','c','','<tag>','<<<<<<<'][next()%6]).join('\n');
    const before=lines(),after=lines(),rows=diffLines(before,after);
    for(const [value,excluded,axis] of [[before,'add','oldNumber'],[after,'remove','number']]){
      const selected=rows.filter(r=>r.kind!==excluded);
      assert.equal(selected.map(r=>r.text).join('\n'),value);
      assert.deepEqual(selected.map(r=>r[axis]),selected.map((_,i)=>i+1));
    }
  }
  const before='old\n'.repeat(10000),after='new\n'.repeat(10000),rows=diffLines(before,after);
  assert.equal(rows.filter(r=>r.kind!=='add').map(r=>r.text).join('\n'),before);
  assert.equal(rows.filter(r=>r.kind!=='remove').map(r=>r.text).join('\n'),after);
});

test('terminal removes bounded escape control strings in ESC and C1 forms without HTML interpretation',()=>{
  assert.equal(stripTerminal('a\x1bPprivate\x1b\\b\x1b_hidden\x1b\\c'),'abc');
  assert.equal(stripTerminal('\u009b31mred\u009b0m\u009d0;title\u009c'),'red');
  assert.equal(stripTerminal('safe\x1bPunterminated'),'safe');
  assert.equal(stripTerminal('<script>x</script>\r\n\ttext'),'<script>x</script>\n\ttext');
});
