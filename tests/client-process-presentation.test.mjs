import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {toolFlowModel,processRowSummary} from '../src/client/tool-model.js';
import {processBodyScrollTop,followsTranscriptTail} from '../src/client/transcript-model.js';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');

test('ACP command-as-title is displayed once without modifying full input or output',()=>{
  for(const command of ['cd /remote/workspace && timeout 30 git status','echo first\nprintf "second\\n"','x'.repeat(5000)]){
    const payload={title:command,kind:'execute',status:'completed',rawInput:{command},output:'one\ntwo'};
    const before=JSON.stringify(payload),model=toolFlowModel(payload);
    assert.equal(model.title,command);assert.equal(model.summary,'');assert.equal(model.command,command);
    assert.equal(model.output,'one\ntwo');assert.equal(JSON.stringify(payload),before);
  }
});
test('an actual command description can replace a raw-command title, without inventing one',()=>{
  const command='git status',description='Check repository status';
  const described=toolFlowModel({title:command,rawInput:{command,description},kind:'execute'});
  assert.equal(described.title,description);assert.equal(described.summary,'');assert.equal(described.command,command);
  const custom=toolFlowModel({title:'Custom Agent title',rawInput:{command,description},kind:'execute'});
  assert.equal(custom.title,'Custom Agent title');assert.equal(custom.summary,'');assert.equal(custom.description,description);
  const truncated=toolFlowModel({title:command,rawInput:{truncated:true,command,description},kind:'execute'});
  assert.equal(truncated.title,command);assert.equal(truncated.summary,'');
});
test('path titles are not repeated, while distinct titles and metadata remain visible',()=>{
  const path='/remote/workspace/README.md';
  const same=toolFlowModel({kind:'read',title:path,locations:[{path}],output:'Full file contents'});
  assert.equal(same.title,path);assert.equal(same.summary,'');assert.equal(same.body,'read');
  const distinct=toolFlowModel({kind:'read',title:'Read project guide',locations:[{path}]});
  assert.equal(distinct.summary,path);
  const terminal=toolFlowModel({title:'pwd',terminals:[{command:'pwd',output:'/remote'}]});
  assert.equal(terminal.summary,'');assert.equal(terminal.command,'pwd');assert.equal(terminal.output,'/remote');
});
test('quiet row summaries never rewrite distinct command case or quoted whitespace',()=>{
  for(const [title,command] of [['echo "a b"','echo "a  b"'],['Echo HELLO','echo hello']]){
    const model=toolFlowModel({title,rawInput:{command}});
    assert.equal(model.title,title);assert.equal(model.command,command);assert.equal(model.summary,'');
  }
});
test('deduplication and compact mode never suppress real error details',()=>{
  const model=toolFlowModel({title:'run',kind:'execute',terminals:[{command:'run',output:'Permission denied\nFull diagnostic',exitStatus:1}]});
  assert.equal(model.summary,'');assert.equal(model.failed,true);assert.equal(model.error,'Permission denied');
  assert.equal(processRowSummary(model.summary,false,model.failed,model.error),'Permission denied');
  assert.equal(model.output,'Permission denied\nFull diagnostic');assert.equal(model.exit.exitCode,1);
});
test('tools and reasoning share a leading-only disclosure affordance with accessible buttons',()=>{
  const disclosure=read('disclosure.js'),thought=read('thought.js');
  for(const source of [disclosure,thought]){
    parse(source,{ecmaVersion:'latest',sourceType:'module'});
    assert.match(source,/h\(DisclosureLeading/);assert.match(source,/'aria-expanded':open,'aria-controls':id/);
    assert.doesNotMatch(source,/rssh-(?:flow|thought)-chevron/);
  }
  assert.match(disclosure,/className:'rssh-disclosure-leading','aria-hidden':true/);
  assert.match(disclosure,/className:'rssh-flow-title',title/);
  assert.match(disclosure,/open\|\|mounted\?\(typeof children==='function'\?children\(\):children\):null/);
  assert.match(thought,/!open&&summary&&\(running\|\|showPreview\)/);
});
test('row sizing and permanent disclosure affordances respect focus and reduced motion',async()=>{
  const css=read('tool-stream.css'),thoughtCss=read('styles.css');
  for(const sheet of [css,thoughtCss])assert.equal((await transform(sheet,{loader:'css'})).warnings.length,0);
  assert.match(css,/\.rssh-flow-toggle \{[^}]*font-size: var\(--dsh-content-font-size-secondary, 13px\)/);
  assert.match(css,/\.rssh-disclosure-leading \{[^}]*width: calc\(32px \+ var\(--dsh-content-font-delta/);
  assert.match(css,/\.rssh-disclosure-leading svg \{[^}]*width: 14px/);
  assert.doesNotMatch(css,/\.rssh-disclosure-chevron[^}]*opacity:\s*0/);
  assert.match(css,/\.rssh-flow-toggle:focus-visible \{[^}]*outline: 2px solid var\(--dsw-alias-state-info-primary\)/);
  assert.match(css,/\[aria-expanded=true\] > \.rssh-disclosure-leading \.rssh-disclosure-chevron \{ transform: rotate\(0deg\)/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/\.rssh-flow-title \{[^}]*max-width: 100%/);
  assert.match(css,/\.rssh-flow\[data-summary\] > \.rssh-flow-toggle \.rssh-flow-title \{[^}]*min-width: min\(14ch, 40%\)/);
  assert.doesNotMatch(css+thoughtCss,/rssh-(?:flow|thought)-chevron/);
});
test('bounded process lists open at the correct edge and respect readers leaving the live tail',()=>{
  const metrics={scrollHeight:900,clientHeight:400,scrollTop:200};
  assert.equal(processBodyScrollTop(metrics,{opening:true,running:true,following:false}),500);
  assert.equal(processBodyScrollTop(metrics,{opening:true,running:false,following:true}),0);
  assert.equal(processBodyScrollTop(metrics,{opening:false,running:true,following:false}),200);
  assert.equal(processBodyScrollTop(metrics,{opening:false,running:true,following:true}),500);
  assert.equal(processBodyScrollTop(metrics,{opening:false,running:false,following:true}),200);
  assert.equal(processBodyScrollTop({...metrics,scrollHeight:100},{opening:true,running:true}),0);
  assert.equal(followsTranscriptTail(metrics),false);
  assert.equal(followsTranscriptTail({...metrics,scrollTop:500}),true);
});
test('only explicitly bounded groups own a keyboard scrollport and preserve child state',()=>{
  const css=read('tool-stream.css'),disclosure=read('disclosure.js'),transcript=read('transcript.js');
  const group=css.match(/\.rssh-process-disclosure > \.rssh-flow-body \{([^}]*)\}/)?.[1];
  assert.ok(group);assert.doesNotMatch(group,/max-height|overflow-y|scrollbar-gutter/);
  assert.match(css,/\.rssh-process-disclosure\[data-open\] > \.rssh-flow-toggle \{ padding-bottom: 8px/);
  assert.match(css,/\.rssh-process-rows > [^\n]*\{ margin-top: 4px/);
  assert.match(transcript,/className:'rssh-process-disclosure'/);
  assert.match(css,/\.rssh-process-disclosure\[data-scroll-body\] > \.rssh-flow-body \{[^}]*max-height: min\(400px, 50vh\);[^}]*overflow-y: auto/);
  assert.match(disclosure,/role:bounded\?'region':undefined,tabIndex:bounded\?0:undefined/);
  assert.match(disclosure,/hidden:flat/);
  assert.match(disclosure,/onRead/);assert.match(disclosure,/open\|\|mounted\?/);
  assert.match(disclosure,/requestReadingIntent\(event.currentTarget\)/);
});
