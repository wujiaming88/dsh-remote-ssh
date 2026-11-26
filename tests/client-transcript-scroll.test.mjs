import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { followsTranscriptTail,anchoredScrollTop,mayRestoreTranscriptAnchor } from '../src/client/transcript-model.js';

const source = readFileSync(new URL('../src/client/transcript-scroll.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const hook = ast.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'useTranscriptScroll').declaration;
// Exercise the actual numeric scroll callbacks with a deterministic frame queue.
// This does not mount React or emulate/render a DOM or browser.
const names = ['setFollow', 'measureTail', 'writeScroll', 'schedule', 'onScroll', 'onWheel', 'onKeyDown', 'onPointerDown', 'latest', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'pauseReading', 'captureReading', 'restoreReadingAnchor', 'onReadingIntent', 'onReadingClick'];
const declarations = hook.body.body.filter(node =>
  node.type === 'VariableDeclaration' && node.declarations.some(value => names.includes(value.id.name)) ||
  node.type === 'FunctionDeclaration' && names.includes(node.id.name));
assert.equal(declarations.length, names.length);
const restoreNode=ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='readingAnchorScrollTop').declaration;
const readingAnchorScrollTop=new Function('anchoredScrollTop','mayRestoreTranscriptAnchor',`${source.slice(restoreNode.start,restoreNode.end)};return readingAnchorScrollTop;`)(anchoredScrollTop,mayRestoreTranscriptAnchor);
const callbacks = new Function('environment', `
  const { follow, frame, live, viewportRef, contentRef, lifetime, readingAnchor, interaction, expectedScroll, setFollowing, setShowLatest, requestAnimationFrame, followsTranscriptTail, anchoredScrollTop, mayRestoreTranscriptAnchor, readingAnchorScrollTop, lastScrollTop, requestHistory, pagerRef, isNestedScroll, scrollIntent, touchPoint } = environment;
  ${declarations.map(node => source.slice(node.start, node.end)).join('\n')}
  return { ${names.join(',')} };
`);
function fixture(metrics = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400 }) {
  const frames = [], state = { following: true, showLatest: false, measurements: 0, historyRequests: [], paused: 0 };
  const environment = {
    touchPoint: { current: null }, scrollIntent: { current: false }, lastScrollTop: { current: metrics.scrollTop }, requestHistory: options => state.historyRequests.push(options),
    pagerRef: { current: { pause: () => state.paused++ } }, isNestedScroll: () => false,
    follow: { current: true }, frame: { current: null }, live: { current: true },
    viewportRef: { current: { ...metrics } }, contentRef: { current: Symbol('content') }, lifetime: { current: 1 }, readingAnchor: { current: null },
    interaction: { current: 0 }, expectedScroll: { current: null },
    setFollowing: value => { state.following = value; },
    setShowLatest: value => { state.showLatest = value; state.measurements++; },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, followsTranscriptTail,anchoredScrollTop,mayRestoreTranscriptAnchor,readingAnchorScrollTop,
  };
  return { ...callbacks(environment), state, environment, viewport: environment.viewportRef.current,
    flush() { for (const callback of frames.splice(0)) callback(); }, pendingFrames: () => frames.length };
}

test('the shared reading-intent pause stops outer follow and pagination before later stream growth',()=>{
  const f=fixture();f.latest();f.flush();
  f.environment.scrollIntent.current=true;
  f.pauseReading();
  assert.equal(f.state.following,false);assert.equal(f.environment.scrollIntent.current,false);
  assert.equal(f.state.historyRequests.length,0);assert.ok(f.state.paused>0);
  f.viewport.scrollHeight=1500;f.schedule();f.flush();
  assert.equal(f.viewport.scrollTop,600);assert.equal(f.state.following,false);
  assert.match(source,/function captureReading\(anchor\)[\s\S]*?pauseReading\(\)/);
});
test('pointer selection and upward wheel at the bottom pause following without showing a button', () => {
  const f = fixture();
  f.onPointerDown({ button: 0, target: { closest: () => null } });
  assert.equal(f.state.following, false); assert.equal(f.state.showLatest, false);
  f.schedule(); f.flush(); assert.equal(f.state.showLatest, false);
  f.latest(); f.flush(); f.onWheel({ deltaY: -1 });
  f.schedule(); f.flush(); assert.equal(f.state.following, false); assert.equal(f.state.showLatest, false);
});
test('only real scroll distance beyond 32px shows the button; returning to the tail hides it', () => {
  const f = fixture();
  for (const [scrollTop, showLatest] of [[600, false], [568, false], [567.5, true], [300, true], [590, false], [601, false]]) {
    f.viewport.scrollTop = scrollTop; f.onScroll();
    assert.equal(f.state.showLatest, showLatest); assert.equal(f.state.following, !showLatest);
  }
});
test('nonoverflowing content never shows jump-to-latest after a pause', () => {
  const f = fixture({ scrollHeight: 200, scrollTop: 0, clientHeight: 400 });
  f.onWheel({ deltaY: -100 }); f.schedule(); f.flush();
  assert.equal(f.state.showLatest, false); assert.equal(f.viewport.scrollTop, 0);
});
test('paused stream growth updates visibility without moving the reading position', () => {
  const f = fixture(); f.setFollow(false);
  f.viewport.scrollHeight = 1200; f.schedule(); f.flush();
  assert.equal(f.viewport.scrollTop, 600); assert.equal(f.state.showLatest, true); assert.equal(f.state.following, false);
});
test('resize and content collapse hide the button even when follow remains paused', () => {
  const f = fixture(); f.setFollow(false); f.viewport.scrollHeight = 1200; f.schedule(); f.flush();
  assert.equal(f.state.showLatest, true);
  f.viewport.clientHeight = 600; f.schedule(); f.flush(); assert.equal(f.state.showLatest, false);
  f.viewport.clientHeight = 400; f.viewport.scrollHeight = 900; f.schedule(); f.flush();
  assert.equal(f.state.showLatest, false); assert.equal(f.state.following, false);
});
test('following growth measures after scrolling and coalesces resize frames', () => {
  const f = fixture(); f.viewport.scrollHeight = 1200; f.schedule(); f.schedule();
  assert.equal(f.pendingFrames(), 1); f.flush();
  assert.equal(f.viewport.scrollTop, 800); assert.equal(f.state.showLatest, false); assert.equal(f.state.measurements, 1);
});
test('jump-to-latest and anchor writes update visibility immediately after their position changes', () => {
  const f = fixture(); f.viewport.scrollTop = 200; f.onScroll(); assert.equal(f.state.showLatest, true);
  f.latest(); f.flush(); assert.equal(f.state.following, true); assert.equal(f.state.showLatest, false); assert.equal(f.viewport.scrollTop, 600);
  f.writeScroll(f.viewport, 100); assert.equal(f.state.showLatest, true);
  f.writeScroll(f.viewport, 1000); assert.equal(f.state.showLatest, false);
});
test('queued frame measures pause intent at execution and cannot update after disposal', () => {
  const f = fixture(); f.viewport.scrollHeight = 1200; f.schedule(); f.setFollow(false); f.flush();
  assert.equal(f.viewport.scrollTop, 600); assert.equal(f.state.showLatest, true);
  const count = f.state.measurements; f.schedule(); f.environment.live.current = false; f.flush();
  assert.equal(f.state.measurements, count);
});
test('rendering uses measured visibility and observes resizes independent of follow intent', () => {
  const chat = readFileSync(new URL('../src/client/chat.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');
  assert.match(chat, /scroll\.showLatest\?h\(ui\.Button,\{variant:'outline',className:'rssh-jump-latest'/);
  assert.match(css, /\.rssh-jump-latest \{[^}]*border: 0\.5px solid var\(--dsw-alias-border-l2\);[^}]*border-radius: 50%;[^}]*background: var\(--dsw-alias-bg-base\);[^}]*box-shadow: none/);
  assert.doesNotMatch(css, /\.rssh-jump-latest \{[^}]*box-shadow: var\(--dsw-alias-shadow-popup\)/);
  assert.doesNotMatch(chat, /!scroll\.following\?h\(ui\.Button/);
  assert.match(source, /new ResizeObserver\(schedule\)/);
  assert.match(source, /observer\.observe\(viewport\);observer\.observe\(content\)/);
  assert.match(source, /React\.useLayoutEffect\(\(\)=>\{restorePrepend\(\);schedule\(\);\},\[items\]\)/);
  assert.match(source, /live.current=true;setFollow\(true\);setShowLatest\(false\)/);
});


test('outer upward scrolling and wheel-at-top arm history while downward browsing pauses it', () => {
  const f=fixture();f.onWheel({deltaY:-1});f.viewport.scrollTop=100;f.onScroll();
  assert.ok(f.state.historyRequests.some(options=>options?.gesture));
  const count=f.state.historyRequests.length;f.viewport.scrollTop=150;f.onScroll();
  assert.equal(f.state.historyRequests.length,count);assert.ok(f.state.paused>0);
  f.viewport.scrollTop=0;f.onWheel({deltaY:-100});
  assert.equal(f.state.historyRequests.at(-1).gesture,true);
});
test('programmatic anchor writes and nested scroll events do not create new reader intent', () => {
  const f=fixture();f.writeScroll(f.viewport,100);f.onScroll();
  assert.equal(f.state.historyRequests.length,0);
  f.onScroll({target:{},currentTarget:{}});assert.equal(f.state.historyRequests.length,0);
  f.onWheel({deltaY:-100,ctrlKey:true});assert.equal(f.state.historyRequests.length,0);
});

test('layout-generated upward scroll without a reader gesture does not arm history',()=>{
  const f=fixture();f.viewport.scrollTop=0;f.onScroll();
  assert.equal(f.state.historyRequests.length,0);
  f.onPointerDown({button:0,target:{closest:()=>null}});f.viewport.scrollTop=100;f.onScroll();
  f.viewport.scrollTop=0;f.onScroll();assert.equal(f.state.historyRequests.length,0);
});

test('touch can request history without an overflow scroll event and ignores taps or horizontal gestures',()=>{
  const f=fixture({scrollTop:0,scrollHeight:100,clientHeight:400});
  const touch=(x,y)=>({touches:[{clientX:x,clientY:y}]});
  f.onTouchStart(touch(100,100));assert.equal(f.state.historyRequests.length,0);
  f.onTouchMove(touch(140,101));assert.equal(f.state.historyRequests.length,0);
  f.onTouchMove(touch(140,151));assert.equal(f.state.historyRequests.at(-1).gesture,true);
  f.onTouchEnd();assert.equal(f.environment.touchPoint.current,null);
  const count=f.state.historyRequests.length;f.onTouchStart({touches:[{},{}]});
  f.onTouchMove(touch(150,200));assert.equal(f.state.historyRequests.length,count);
});


function readingSnapshot(f,offset=80) {
  return {viewport:f.viewport,content:f.environment.contentRef.current,lifetime:f.environment.lifetime.current,
    interaction:f.environment.interaction.current,offset};
}
function readingMeasurements(f,patch={}) {
  return {viewport:f.viewport,content:f.environment.contentRef.current,lifetime:f.environment.lifetime.current,
    interaction:f.environment.interaction.current,live:true,following:false,visible:true,
    scrollTop:f.viewport.scrollTop,offset:80,...patch};
}
test('actual pure reading restore preserves the trigger offset and applies bounded scroll writes',()=>{
  const f=fixture({scrollTop:200,scrollHeight:1400,clientHeight:400}),saved=readingSnapshot(f,80);
  const before={...saved};
  const top=readingAnchorScrollTop(saved,readingMeasurements(f,{offset:230}));
  assert.equal(top,350);f.writeScroll(f.viewport,top);
  assert.equal(f.viewport.scrollTop,350);assert.equal(f.state.showLatest,true);assert.deepEqual(saved,before);
  // A post-restore measurement at the original offset must not compensate twice.
  assert.equal(readingAnchorScrollTop(saved,readingMeasurements(f,{offset:80})),350);
  assert.equal(readingAnchorScrollTop(saved,readingMeasurements(f,{scrollTop:20,offset:-80})),0);
  f.writeScroll(f.viewport,readingAnchorScrollTop(saved,readingMeasurements(f,{offset:5000})));
  assert.equal(f.viewport.scrollTop,1000);
});
test('actual pure reading restore rejects stale lifetime, new intent, wrong identity and invisible targets',()=>{
  const f=fixture(),saved=readingSnapshot(f);
  assert.equal(readingAnchorScrollTop(saved,readingMeasurements(f)),600);
  for(const patch of [{lifetime:2},{interaction:1},{viewport:Symbol('other viewport')},{content:Symbol('other content')},
    {live:false},{following:true},{visible:false},{offset:NaN},{scrollTop:Infinity}]){
    assert.equal(readingAnchorScrollTop(saved,readingMeasurements(f,patch)),null);
  }
  assert.equal(readingAnchorScrollTop({...saved,offset:Infinity},readingMeasurements(f)),null);
  assert.equal(readingAnchorScrollTop(null,readingMeasurements(f)),null);
});
test('real restore callback consumes invalid anchors before attempting geometry access',()=>{
  for(const change of ['lifetime','interaction','viewport','content','disposed','following']){
    const f=fixture();f.setFollow(false);
    f.environment.readingAnchor.current={...readingSnapshot(f),anchor:Symbol('opaque retired anchor')};
    if(change==='lifetime')f.environment.lifetime.current++;
    if(change==='interaction')f.environment.interaction.current++;
    if(change==='viewport')f.environment.viewportRef.current={...f.viewport};
    if(change==='content')f.environment.contentRef.current=Symbol('replacement content');
    if(change==='disposed')f.environment.live.current=false;
    if(change==='following')f.setFollow(true);
    assert.doesNotThrow(()=>f.restoreReadingAnchor(),change);
    assert.equal(f.environment.readingAnchor.current,null);assert.equal(f.viewport.scrollTop,600);
  }
});
test('expansion layout scroll cannot restore follow or trigger history; a new key gesture cancels its anchor',()=>{
  const f=fixture();f.setFollow(false);
  f.environment.readingAnchor.current=readingSnapshot(f);
  f.viewport.scrollTop=590;f.onScroll();
  assert.equal(f.state.following,false);assert.equal(f.state.historyRequests.length,0);
  f.onKeyDown({key:'PageDown'});
  assert.equal(f.environment.readingAnchor.current,null);assert.equal(f.environment.interaction.current,1);
  f.viewport.scrollTop=595;f.onScroll();assert.equal(f.state.following,true);
});
test('return to latest cancels a pending reading restore instead of snapping back on the next frame',()=>{
  const f=fixture();f.setFollow(false);f.viewport.scrollTop=200;
  f.environment.readingAnchor.current={...readingSnapshot(f),anchor:Symbol('reading target')};
  f.latest();assert.equal(f.environment.readingAnchor.current,null);f.flush();
  assert.equal(f.viewport.scrollTop,600);assert.equal(f.state.following,true);
  assert.doesNotThrow(()=>f.restoreReadingAnchor());assert.equal(f.viewport.scrollTop,600);
});
test('only the matching after-layout event may consume a captured anchor',()=>{
  const f=fixture();f.setFollow(false);
  const anchor=Symbol('trigger'),saved={...readingSnapshot(f),anchor};f.environment.readingAnchor.current=saved;
  f.onReadingIntent({detail:{afterLayout:true,anchor:Symbol('another trigger')}});
  assert.equal(f.environment.readingAnchor.current,saved);
  // The original target no longer belongs to this lifetime: matching event consumes
  // the snapshot but cannot read its opaque geometry or mutate the retired viewport.
  f.environment.lifetime.current++;
  f.onReadingIntent({detail:{afterLayout:true,anchor}});
  assert.equal(f.environment.readingAnchor.current,null);assert.equal(f.viewport.scrollTop,600);
});
test('unrecognized reading candidates do not fabricate intent or require a DOM renderer',()=>{
  const f=fixture();
  for(const candidate of [null,undefined,Symbol('not an element'),{nodeType:3}])f.captureReading(candidate);
  assert.equal(f.environment.readingAnchor.current,null);assert.equal(f.environment.interaction.current,0);
  assert.equal(f.state.following,true);assert.equal(f.pendingFrames(),0);
});
