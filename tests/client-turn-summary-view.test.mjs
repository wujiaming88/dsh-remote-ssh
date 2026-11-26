import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
const adapter=read('transcript.js'),view=read('turn-summary-view.js'),css=read('turn-summary-view.css');
// Static source contracts and the real CSS compiler, not simulated browser acceptance.
test('settled turn view has factual duration, no false arrow, and accessible whole-turn controls',()=>{
  for(const source of [adapter,view])parse(source,{sourceType:'module',ecmaVersion:'latest'});
  assert.match(view,/h\(collapsible\?'button':'div'/);
  assert.match(view,/'aria-expanded':collapsible\?open:undefined,'aria-controls':collapsible\?controls:undefined/);
  assert.match(view,/collapsible\?h\('span',\{className:'rssh-turn-summary-toggle'/);
  assert.match(view,/name:'chevron-down',size:14,className:'rssh-turn-summary-chevron'/);
  assert.match(view,/h\('time',\{dateTime:`PT\$\{summary.seconds\}S`\}/);
  assert.match(view,/failedCount\?` · \$\{t\('flow.hadFailures'\)\} \$\{failedCount\}`/);
  assert.doesNotMatch(view,/Date\.now|setInterval|aria-live|useSessions|useChat/);
});
test('each turn summary controls its one process while final reply stays outside',()=>{
  assert.match(adapter,/summary.ownerKey!==entry.key/);
  assert.match(adapter,/controls:summary.processKeys.map\(processRegionId\).join\(' '\)/);
  assert.match(adapter,/const processRegionId=key=>`\$\{turnRegionPrefix\}-\$\{encodeURIComponent\(key\)\}`/);
  assert.match(adapter,/summary\?\.afterOwner|turnData\?\.afterOwner/);
  const render=adapter.split('return entries.map(entry=>{')[1];
  const prose=render.split('const facts=processTreeSummary')[0];
  assert.match(prose,/render\(entry.item,entry\)/);
  assert.doesNotMatch(prose,/hidden:|turnHidden/);
  assert.match(render,/hidden:turnHidden&&!turnSummary/);
  assert.match(render,/key:'process-part',id:processRegionId\(entry.key\),className:'rssh-turn-process-part',hidden:turnHidden/);
  assert.match(render,/h\(Disclosure,\{className:'rssh-process-disclosure'/);
  assert.doesNotMatch(render,/!turnHidden\s*&&|turnHidden\?null/);
});
test('grouped assistant prose keeps metadata and a settled turn has only one disclosure control',()=>{
  const disclosure=read('disclosure.js');
  parse(disclosure,{sourceType:'module',ecmaVersion:'latest'});
  assert.match(adapter,/transcriptEntries\(top,\{turns,allItems:items\}\)/);
  assert.match(adapter,/transcriptEntries\(children,\{turns,allItems:items\}\)/);
  assert.match(adapter,/render\(item,entry.responses.get\(item.key\),ancestors\)/);
  assert.match(adapter,/children:\(\)=>entry.items.map\(item=>render\(item,entry.responses.get\(item.key\)\)\)/);
  assert.match(adapter,/hideTrigger:!!turnData,open:turnData\?turnPresentations.get\(entry.scope\).open:presentation.open/);
  assert.match(disclosure,/hideTrigger=false/);
  assert.match(disclosure,/hidden:flat\|\|hideTrigger/);
  assert.match(disclosure,/open\|\|mounted\?/);
  assert.doesNotMatch(adapter,/turnData\?h\(.*Disclosure|turnData\?null/);
});
test('completion preserves focused readers and explicit collapse focuses its visible trigger',()=>{
  assert.match(adapter,/focused\?\.scope===scope/);
  assert.match(adapter,/const focusProtection=processFocusProtection\(entries,policy,manual,focused\)/);
  assert.match(adapter,/const readingManual=focusProtection\?/);
  assert.match(adapter,/React.useLayoutEffect\(\(\)=>\{\s*if\(focusProtection\)/);
  assert.match(adapter,/focusedProcess.current=\{\.\.\.focused,wasFlat:false\}/);
  assert.match(adapter,/typeof previous\[scope\]!=='boolean'/);
  assert.match(adapter,/onFocusCapture:\(\)=>\{focusedProcess.current=\{scope:entry.scope,key:entry.key,wasFlat:presentation.flat\};\}/);
  assert.match(adapter,/!event.currentTarget.contains\(event.relatedTarget\)/);
  assert.match(adapter,/event.currentTarget.focus\(\{preventScroll:true\}\);\s*requestReadingIntent\(event.currentTarget\);\s*setTurnOpen/);
});
test('native summary geometry remains scoped and collapsed process wrappers leave no blank rows',async()=>{
  assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
  assert.match(css,/min-height: calc\(33px \+ var\(--dsh-content-font-delta, 0px\)\)/);
  assert.match(css,/border-bottom: 0.5px solid var\(--dsw-alias-border-l2\)/);
  assert.match(css,/margin-left: 8px/);
  assert.match(css,/\.rssh-turn-summary-toggle \{[^}]*width: 28px; height: 28px;[^}]*border: 0\.5px solid var\(--dsw-alias-border-l2\);[^}]*border-radius: 999px/);
  assert.match(css,/font-variant-numeric: tabular-nums/);
  assert.match(css,/\.rssh-turn-process-part\[hidden\], \.rssh-process-group\[hidden\] \{ display: none; \}/);
  assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion: reduce/);
  const index=read('index.js');
  assert.equal(index.split("from './turn-summary-view.css'").length-1,1);
  assert.match(index,/\+ turnSummaryCss \+/);
});
