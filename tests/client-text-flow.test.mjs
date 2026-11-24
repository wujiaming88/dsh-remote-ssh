// Pure transforms + parsed source contracts only; no React/DOM/clipboard mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {parseMarkdown, tableCells, diffLines, stripTerminal} from '../src/client/ui-pure.js';
const source=readFileSync(new URL('../src/client/ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/client/ui.css',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const createUi=ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='createUi').declaration;
const section=name=>{const node=createUi.body.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);assert.ok(node,name);return source.slice(node.start,node.end);};

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
  assert.match(block,/rsui-block-banner/);assert.doesNotMatch(source,/rsui-block-toolbar/);
  assert.match(block,/shown = expanded \? rows : rows\.slice\(0, max\)/);
  assert.match(block,/var uid = React\.useId\(\)/);
  assert.match(block,/'aria-expanded': expanded, 'aria-controls': uid/);
  assert.match(block,/'aria-pressed': wrap, 'aria-controls': uid/);
  assert.match(block,/title: wrapCaption, 'aria-label': wrapCaption/);
  assert.match(block,/h\(CopyButton,[\s\S]*?iconOnly: true/);
  assert.match(block,/tabIndex: 0/);
  assert.doesNotMatch(block,/\\u200b/);
  assert.match(section('ReadBlock'),/typeof props\.text === 'string' \? props\.text/);
  assert.match(section('DiffBlock'),/copyText: text\(diff\.newText\)/);
  assert.match(section('renderBlocks'),/copyText: block\.text/);
});

test('terminal status is supplied-only, absent exit is not success, and empty output is metadata rather than payload',()=>{
  const terminal=section('TerminalBlock');
  assert.match(terminal,/if \(props\.running\)/);assert.match(terminal,/else if \(props\.signal\)/);
  assert.match(terminal,/else if \(props\.exitCode != null\)/);
  assert.match(terminal,/else status = label\(labels, 'noExitCode'/);
  assert.match(terminal,/copyText: output/);
  assert.match(terminal,/after: !rows\.length/);
  assert.doesNotMatch(terminal,/Number\(props\.exitCode\)|'done'|'failed'|rows = \[\{ text: label/);
});

test('text flow follows Host font axes without fixed vertical scroll cages or wide-table breakout',()=>{
  const blocks=css.slice(css.indexOf('/* Text-flow styles:'));
  assert.match(blocks,/font-size: var\(--dsh-content-font-size, 14px\)/);
  assert.match(blocks,/line-height: calc\(24px \+ var\(--dsh-content-font-delta, 0px\)\)/);
  assert.match(blocks,/font-size: var\(--dsh-content-font-size-secondary, 13px\)/);
  assert.match(blocks,/font-family: var\(--ds-font-family-code, var\(--dsh-font-family-code/);
  assert.match(blocks,/font-size: var\(--dsh-code-font-size, 11px\)/);
  assert.match(blocks,/line-height: calc\(19px \+ var\(--dsh-code-font-delta, 0px\)\)/);
  assert.match(blocks,/overflow-x: auto/);assert.doesNotMatch(blocks,/max-height|480px|overflow:\s*auto|margin-left:\s*-|ui-monospace/);
  assert.match(blocks,/\.rsui-markdown p \{ margin: 0;/);
  assert.match(blocks,/\.rsui-markdown li > :not\(:first-child\) \{ margin-top: 4px;/);
  assert.match(section('renderBlocks'),/className: 'rsui-markdown-table', tabIndex: 0/);
  assert.doesNotMatch(source,/dangerouslySetInnerHTML|innerHTML|require\(['"]@deepseek-ai/);
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
