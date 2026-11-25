import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';

const source=readFileSync(new URL('../src/client/disclosure.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/client/tool-stream.css',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
// Extract actual numeric policy functions, not React or a fabricated DOM renderer.
const declaration=name=>ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name===name).declaration;
const extract=(name,bindings={})=>{const node=declaration(name);return new Function(...Object.keys(bindings),`return (${source.slice(node.start,node.end)})`)(...Object.values(bindings));};
const scroll=extract('boundedProcessScroll'),atTail=extract('processScrollFollowsTail');
const scrollUpdate=extract('processScrollUpdate',{processScrollFollowsTail:atTail});
const metrics={scrollTop:80,scrollHeight:1000,clientHeight:400};
const opened={open:true,wasOpen:false,flat:false,scrollBody:true,wasBounded:true,running:true,following:false};
const update={...opened,wasOpen:true};

test('first opening a running group starts at the tail, including nonoverflowing content',()=>{
  assert.deepEqual(scroll(metrics,opened),{top:600,following:true});
  assert.deepEqual(scroll({...metrics,scrollHeight:200},opened),{top:0,following:true});
});
test('first opening historical content starts at the top without live following',()=>{
  assert.deepEqual(scroll(metrics,{...opened,running:false,following:true}),{top:0,following:false});
});
test('closed, flat and deliberately unbounded reading groups do not write scroll positions',()=>{
  for(const patch of [{open:false},{flat:true},{scrollBody:false}])assert.deepEqual(scroll(metrics,{...opened,...patch}),{top:null,following:false});
});
test('an already-open flat group becoming bounded is not treated as a first opening',()=>{
  assert.deepEqual(scroll(metrics,{...update,wasBounded:false,following:true}),{top:null,following:false});
  assert.deepEqual(scroll(metrics,{...update,wasBounded:false,running:false}),{top:null,following:false});
});
test('an already-open group losing its cap stops following until a real later opening',()=>{
  assert.deepEqual(scroll(metrics,{...update,scrollBody:false,following:true}),{top:null,following:false});
  assert.deepEqual(scroll(metrics,{...opened,wasBounded:false}),{top:600,following:true});
});
test('new live output only advances readers who are still following',()=>{
  assert.deepEqual(scroll({...metrics,scrollHeight:1500},{...update,following:true}),{top:1100,following:true});
  assert.deepEqual(scroll({...metrics,scrollHeight:1500},{...update,following:false}),{top:null,following:false});
});
test('completion never resets an already open process to the top or bottom',()=>{
  assert.deepEqual(scroll(metrics,{...update,running:false,following:true}),{top:null,following:false});
});
test('following has a finite tail threshold and does not depend on text or title',()=>{
  assert.equal(atTail({...metrics,scrollTop:568}),true);
  assert.equal(atTail({...metrics,scrollTop:567}),false);
  assert.equal(atTail({...metrics,scrollHeight:200,scrollTop:0}),true);
  assert.equal(atTail({...metrics,scrollTop:NaN}),false);
  assert.deepEqual(scroll({...metrics,scrollHeight:Infinity},opened),{top:null,following:false});
});
const component=declaration('ownedDisclosure');
const method=name=>component.body.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);
const controller=(name,bindings)=>{const node=method(name);return new Function(...Object.keys(bindings),`return (${source.slice(node.start,node.end)})`)(...Object.values(bindings));};
test('trusted reading immediately pauses inner following; synthetic reading does not pin a group',()=>{
  const following={current:true},events=[];
  const read=controller('read',{following,scrollIntent:{current:0},pointerScroll:{current:false},bounded:false,onRead:event=>events.push(event)});
  read({isTrusted:false});assert.equal(following.current,true);assert.equal(events.length,0);
  read({isTrusted:true});assert.equal(following.current,false);assert.equal(events.length,1);
  assert.deepEqual(scroll(metrics,{...update,following:following.current}),{top:null,following:false});
});
function readingController(bounded=true){
  const reads=[],anchors=[];
  const refs={bounded,following:{current:true},expectedScroll:{current:null},lastTop:{current:600},scrollIntent:{current:0},pointerScroll:{current:false},touchY:{current:null},bodyRef:{current:'process-body'},onRead:event=>reads.push(event),requestReadingIntent:anchor=>anchors.push(anchor),processScrollUpdate:scrollUpdate,processScrollFollowsTail:atTail};
  for(const name of ['read','bodyScroll','acceptsGesture','setScrollIntent','bodyWheel','bodyKeyDown','bodyPointerDown','bodyTouchStart','bodyTouchMove'])refs[name]=controller(name,refs);
  return {...refs,reads,anchors};
}
const eventFor=box=>({isTrusted:true,target:box,currentTarget:box});
test('own scroll writes cannot re-enable following after a reader paused it',()=>{
  const c=readingController(),box={...metrics,scrollTop:600};
  c.following.current=false;c.expectedScroll.current=600;
  c.bodyScroll(eventFor(box));assert.equal(c.following.current,false);assert.equal(c.expectedScroll.current,null);
});
test('scrolling away pauses following and an explicit downward return to the tail resumes it, ignoring nested scrolls',()=>{
  const c=readingController(),box={...metrics};
  c.bodyScroll({...eventFor(box),target:{}});assert.equal(c.following.current,true);
  c.bodyScroll(eventFor(box));assert.equal(c.following.current,false);
  c.bodyWheel({...eventFor(box),deltaY:60});
  box.scrollTop=600;c.bodyScroll(eventFor(box));assert.equal(c.following.current,true);
});
test('a ten-pixel upward gesture inside the tail threshold stays paused through subsequent output',()=>{
  const c=readingController(),box={...metrics,scrollTop:600};
  c.bodyWheel({...eventFor(box),deltaY:-10});assert.equal(c.following.current,false);
  box.scrollTop=590;c.bodyScroll(eventFor(box));assert.equal(c.following.current,false);
  assert.deepEqual(scroll({...box,scrollHeight:1200},{...update,following:c.following.current}),{top:null,following:false});
});
test('selection or expansion followed by layout clamping and resize does not revive following',()=>{
  const c=readingController(),box={...metrics,scrollTop:600};
  c.scrollIntent.current=1;c.read({isTrusted:true});assert.equal(c.scrollIntent.current,0);
  box.scrollHeight=800;box.scrollTop=400;c.bodyScroll(eventFor(box));assert.equal(c.following.current,false);
  box.scrollHeight=900;box.scrollTop=500;c.bodyScroll(eventFor(box));assert.equal(c.following.current,false);
  assert.deepEqual(scroll(box,{...update,following:c.following.current}),{top:null,following:false});
});
test('keyboard downward intent can resume but upward and editable-input keys cannot',()=>{
  const c=readingController(),box={...metrics,scrollTop:600,tagName:'DIV'};
  c.bodyKeyDown({...eventFor(box),key:'ArrowUp'});assert.equal(c.following.current,false);
  c.bodyKeyDown({...eventFor(box),key:'End'});assert.equal(c.following.current,true);
  c.bodyKeyDown({...eventFor(box),target:{tagName:'INPUT'},key:'End'});assert.equal(c.following.current,false);
});
test('vertical touch direction controls following and also pins a flat reading process',()=>{
  for(const bounded of [true,false]){
    const c=readingController(bounded),box={...metrics,scrollTop:600};
    c.bodyTouchStart({...eventFor(box),touches:[{clientY:100}]});
    c.bodyTouchMove({...eventFor(box),touches:[{clientY:120}]});assert.equal(c.following.current,false);
    c.bodyTouchMove({...eventFor(box),touches:[{clientY:90}]});
    assert.equal(c.following.current,bounded);assert.ok(c.reads.length>=3);
    assert.equal(c.anchors.length>0,bounded);
  }
});
test('flat wheel reading pins without an inner or outer anchor scroll request',()=>{
  const c=readingController(false),box={...metrics,scrollTop:600};
  c.bodyWheel({...eventFor(box),deltaY:-40});assert.equal(c.reads.length,1);assert.equal(c.anchors.length,0);
  assert.equal(c.scrollIntent.current,0);assert.equal(c.following.current,false);
});
test('a viewport background press is not a scrollbar drag, while a gutter press requires downward movement',()=>{
  const c=readingController(),box={...metrics,scrollTop:500,clientWidth:300,clientLeft:0};
  c.bodyPointerDown({...eventFor(box),button:0,pointerType:'mouse',offsetX:100});assert.equal(c.pointerScroll.current,false);
  c.bodyPointerDown({...eventFor(box),button:0,pointerType:'mouse',offsetX:305});assert.equal(c.pointerScroll.current,true);
  c.lastTop.current=500;box.scrollTop=490;c.bodyScroll(eventFor(box));assert.equal(c.following.current,false);
  box.scrollTop=600;c.bodyScroll(eventFor(box));assert.equal(c.following.current,true);
});
test('bounded trusted reading tells the outer viewport to pause, whereas synthetic reading never does',()=>{
  const c=readingController();c.read({isTrusted:false});assert.equal(c.anchors.length,0);
  c.read({isTrusted:true});assert.deepEqual(c.anchors,['process-body']);assert.equal(c.reads.length,1);
  assert.match(source,/body\.addEventListener\('scrollend',stop\)/);
  assert.match(source,/body\.removeEventListener\('scrollend',stop\)/);
  assert.match(source,/removeEventListener\('pointerup',pointerEnd,true\)/);
  assert.match(source,/removeEventListener\('pointercancel',pointerEnd,true\)/);
});
test('scroll liveness can differ from the header current-activity state',()=>{
  assert.match(source,/scrollRunning=running/);
  assert.equal((source.match(/running:scrollRunning/g)||[]).length,2);
  assert.match(source,/\[open,flat,scrollBody,scrollRunning,children\]/);
  assert.match(source,/\[open,bounded,scrollRunning\]/);
  assert.match(source,/'data-running':running\?'':undefined/);
});
test('flat and bounded modes retain one component body and mounted children',()=>{
  assert.match(source,/flat=false/);
  assert.match(source,/const bounded=scrollBody&&!flat/);
  assert.match(source,/h\('button',\{ref:trigger,hidden:flat/);
  assert.equal((source.match(/h\('div',\{ref:bodyRef/g)||[]).length,1);
  assert.match(source,/role:bounded\?'region':undefined,tabIndex:bounded\?0:undefined,'aria-label':bounded\?title:undefined/);
  assert.match(source,/open\|\|mounted\?/);assert.doesNotMatch(source,/setMounted\(false\)/);
  assert.match(source,/requestReadingIntent\(event.currentTarget\)/);
  assert.match(source,/requestReadingIntent\(trigger.current,true\)/);
  assert.match(source,/observer\.disconnect\(\)/);assert.match(source,/if\(!live\|\|bodyRef.current!==body\)return/);
});
test('only explicitly bounded groups get the capped region; raw diagnostics cannot nest a second scrollport',async()=>{
  assert.match(css,/\.rssh-process-disclosure\[data-scroll-body\] > \.rssh-flow-body \{[^}]*max-height: min\(400px, 50vh\);[^}]*overflow-y: auto/);
  assert.match(css,/\.rssh-process-disclosure\[data-scroll-body\] \.rssh-flow-raw-text \{ max-height: none; overflow: visible; \}/);
  assert.match(css,/\.rssh-flow-raw-text \{[^}]*max-height: 260px; overflow: auto/);
  assert.match(css,/\.rssh-flow-toggle\[hidden\] \{ display: none; \}/);
  assert.match(css,/\.rssh-process-disclosure\[data-flat\] > \.rssh-flow-body \{ margin: 0; \}/);
  assert.equal((await transform(css,{loader:'css'})).warnings.length,0);
});
test('expanded command details wrap without introducing another scrollport',()=>{
  const rule=css.match(/\.rssh-flow-command \{([^}]*)\}/)?.[1];assert.ok(rule);
  for(const declaration of ['min-width: 0','max-width: 100%','white-space: pre-wrap','overflow-wrap: anywhere'])assert.ok(rule.includes(declaration));
  assert.doesNotMatch(rule,/max-height|overflow(?:-[xy])?:\s*(?:auto|scroll)/);
});
test('tool titles have protected space and contrast while the group activity retains remaining width',()=>{
  assert.match(css,/\.rssh-flow \{[^}]*color: var\(--dsw-alias-label-tertiary\)/);
  assert.match(css,/\.rssh-flow-toggle \{[^}]*color: inherit/);
  assert.match(css,/\.rssh-flow-title \{[^}]*color: inherit/);
  assert.match(css,/\.rssh-flow-toggle:hover \{ color: var\(--dsw-alias-label-secondary\)/);
  assert.match(css,/\.rssh-flow\[data-summary\] > \.rssh-flow-toggle \.rssh-flow-title \{ flex: 1 1 60%; min-width: min\(14ch, 40%\)/);
  assert.match(css,/\.rssh-flow-summary \{[^}]*color: var\(--dsw-alias-label-tertiary\)/);
  assert.match(css,/\.rssh-process-disclosure\[data-summary\] > \.rssh-flow-toggle \.rssh-flow-title \{ flex: 0 0 auto/);
  assert.match(css,/\.rssh-process-disclosure > \.rssh-flow-toggle \.rssh-flow-summary \{ flex: 1 1 auto/);
  assert.match(css,/\.rssh-disclosure-chevron \{[^}]*transform: rotate\(-90deg\)/);
  assert.match(css,/\.rssh-flow-toggle:focus-visible/);assert.match(css,/@media \(pointer: coarse\)/);
});
