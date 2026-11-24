import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {anchoredScrollTop,mayRestoreTranscriptAnchor} from '../src/client/transcript-model.js';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
const disclosure=read('disclosure.js'),thought=read('thought.js'),scroll=read('transcript-scroll.js');
const css=read('tool-stream.css'),thoughtCss=read('styles.css');
// Source contracts and numeric transforms only: this does not render React or emulate a browser.

test('reading UI modules remain valid JavaScript without detached native timer methods',()=>{
  for(const source of [disclosure,thought,scroll]){
    assert.doesNotThrow(()=>parse(source,{ecmaVersion:'latest',sourceType:'module'}));
    assert.doesNotMatch(source,/this\.(?:later|cancel)\s*=\s*globalThis\.(?:setTimeout|clearTimeout)\s*;/);
  }
});
test('disclosure and reasoning bodies are initially lazy but stay mounted after first opening',()=>{
  for(const source of [disclosure,thought]){
    assert.match(source,/\[mounted,setMounted\]=React.useState\((?:open|false)\)/);
    assert.match(source,/if\(open\)setMounted\(true\)/);
    assert.match(source,/hidden:!open/);
    assert.match(source,/open\|\|mounted\?/);
    assert.doesNotMatch(source,/setMounted\(false\)/);
  }
});
test('only user interactions lock an owning process group, not programmatic focus',()=>{
  assert.match(disclosure,/function read\(event\) \{ if\(event.isTrusted\)onRead\?\.\(event\); \}/);
  assert.match(disclosure,/onPointerDown:event=>\{if\(event.button===0\)read\(event\);\}/);
  assert.match(disclosure,/onClick:read,onKeyDown:read/);
  assert.match(disclosure,/if\(open&&event.key==='Tab'\)read\(event\)/);
  assert.doesNotMatch(disclosure,/onFocus/);
});
test('expansion captures a local trigger before state changes and restores it after layout',()=>{
  assert.match(disclosure,/anchor\.dispatchEvent\(new CustomEvent\('rssh:reading-intent',\{bubbles:true,detail:\{anchor,afterLayout\}\}\)\)/);
  for(const source of [disclosure,thought]){
    assert.match(source,/requestReadingIntent\(event.currentTarget\)/);
    assert.match(source,/requestReadingIntent\(trigger.current,true\)/);
  }
  assert.match(scroll,/if\(readingAnchor.current\?\.anchor===event.detail.anchor\)restoreReadingAnchor\(\)/);
  assert.match(scroll,/event.target\?\.closest\?\.\('button,summary,\[role="button"\]'\)/);
  assert.match(scroll,/if\(event.isTrusted&&target\)captureReading\(target\)/);
  assert.doesNotMatch(scroll,/isNestedScroll\(event\)\|\|event.target.closest\('button,a,summary/);
});
test('reading listeners and anchors are scoped to viewport lifetime and cleaned up',()=>{
  for(const name of ['addEventListener','removeEventListener']){
    assert.ok(scroll.includes("viewport?."+name+"('rssh:reading-intent',onReadingIntent)"));
    assert.ok(scroll.includes("viewport?."+name+"('click',onReadingClick,true)"));
  }
  assert.match(scroll,/readingAnchor.current=null/);
  assert.match(scroll,/contentRef.current===saved.content&&lifetime.current===saved.lifetime/);
  assert.match(scroll,/!saved.anchor.isConnected\|\|!saved.content.contains\(saved.anchor\)\|\|!saved.anchor.getClientRects\(\).length/);
  assert.match(scroll,/interaction.current\+\+;scrollIntent.current=false;pagerRef.current.pause\(\);setFollow\(false\)/);
});
test('reading restoration uses trigger geometry and the same generation guard as history',()=>{
  assert.equal(anchoredScrollTop({currentTop:320,previousOffset:80,nextOffset:140}),380);
  assert.equal(anchoredScrollTop({currentTop:20,previousOffset:80,nextOffset:10}),0);
  const valid={startedAtGeneration:8,currentGeneration:8,sameViewport:true,live:true};
  assert.equal(mayRestoreTranscriptAnchor(valid),true);
  for(const patch of [{currentGeneration:9},{sameViewport:false},{live:false}])assert.equal(mayRestoreTranscriptAnchor({...valid,...patch}),false);
  assert.match(scroll,/if\(follow.current\)writeScroll\(viewport,viewport.scrollHeight\)/);
  assert.match(scroll,/readingAnchor.current\?\.interaction===interaction.current/);
  assert.match(scroll,/restorePrepend\(\);schedule\(\)/);
  assert.match(scroll,/\['ArrowDown','PageDown','End'\].includes\(event.key\)\)\{interaction.current\+\+;readingAnchor.current=null/);
  assert.match(scroll,/const latest=\(\)=>\{interaction.current\+\+;readingAnchor.current=null/);
  assert.match(scroll,/const canApply=\(\)=>live.current&&lifetime.current===epoch/);
  assert.doesNotMatch(scroll,/scrollIntoView|document\.querySelector|nextHeight|previousHeight/);
});
test('process groups no longer introduce an independently scrolling reading region',()=>{
  assert.doesNotMatch(disclosure,/processBodyScrollTop|following.current|tabIndex:scrollBody|onScroll:/);
  const groupRule=css.match(/\.rssh-process-disclosure > \.rssh-flow-body \{([^}]*)\}/)?.[1];
  assert.ok(groupRule);assert.doesNotMatch(groupRule,/max-height|overflow-y|scrollbar-gutter/);
  assert.match(css,/\.rssh-flow-raw-text[^}]*max-height: 260px/);
});
test('affordances, activity and focus are visible without hover or animation',()=>{
  assert.match(css,/\.rssh-disclosure-chevron \{[^}]*transform: rotate\(-90deg\)/);
  assert.doesNotMatch(css,/opacity:\s*0|@keyframes[^\n]*shimmer|animation:[^;]*shimmer/);
  assert.doesNotMatch(thoughtCss,/animation:[^;]*rssh-thought-shimmer/);
  assert.match(disclosure,/className:failed\?'rssh-flow-failure':'rssh-flow-status'/);
  assert.match(thought,/className:'rssh-flow-status','data-active':''/);
  for(const [source,selector] of [[css,'rssh-flow-toggle'],[thoughtCss,'rssh-thought-toggle']]){
    assert.match(source,new RegExp('\\.'+selector+':focus-visible \\{[^}]*outline: 2px solid var\\(--dsw-alias-state-info-primary\\);[^}]*outline-offset: 2px'));
  }
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/pointer: coarse/);
});
test('thought and tool bodies use one content axis without sticky thought headers',()=>{
  for(const source of [css,thoughtCss])assert.match(source,/padding-inline-start: calc\(40px \+ var\(--dsh-content-font-delta, 0px\)\)/);
  assert.match(css,/padding-inline-start: 16px/);
  assert.doesNotMatch(thoughtCss,/\.rssh-thought\[data-open\] \.rssh-thought-toggle\s*\{[^}]*position: sticky/);
});
