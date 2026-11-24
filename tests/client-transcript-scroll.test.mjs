import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { followsTranscriptTail } from '../src/client/transcript-model.js';

const source = readFileSync(new URL('../src/client/transcript-scroll.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const hook = ast.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'useTranscriptScroll').declaration;
// Exercise the actual numeric scroll callbacks with a deterministic frame queue.
// This does not mount React or emulate/render a DOM or browser.
const names = ['setFollow', 'measureTail', 'writeScroll', 'schedule', 'onScroll', 'onWheel', 'onPointerDown', 'latest', 'onTouchStart', 'onTouchMove', 'onTouchEnd'];
const declarations = hook.body.body.filter(node => node.type === 'VariableDeclaration' && node.declarations.some(value => names.includes(value.id.name)));
assert.equal(declarations.length, names.length);
const callbacks = new Function('environment', `
  const { follow, frame, live, viewportRef, interaction, expectedScroll, setFollowing, setShowLatest, requestAnimationFrame, followsTranscriptTail, lastScrollTop, requestHistory, pagerRef, isNestedScroll, scrollIntent, touchPoint } = environment;
  ${declarations.map(node => source.slice(node.start, node.end)).join('\n')}
  return { ${names.join(',')} };
`);
function fixture(metrics = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400 }) {
  const frames = [], state = { following: true, showLatest: false, measurements: 0, historyRequests: [], paused: 0 };
  const environment = {
    touchPoint: { current: null }, scrollIntent: { current: false }, lastScrollTop: { current: metrics.scrollTop }, requestHistory: options => state.historyRequests.push(options),
    pagerRef: { current: { pause: () => state.paused++ } }, isNestedScroll: () => false,
    follow: { current: true }, frame: { current: null }, live: { current: true },
    viewportRef: { current: { ...metrics } }, interaction: { current: 0 }, expectedScroll: { current: null },
    setFollowing: value => { state.following = value; },
    setShowLatest: value => { state.showLatest = value; state.measurements++; },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, followsTranscriptTail,
  };
  return { ...callbacks(environment), state, environment, viewport: environment.viewportRef.current,
    flush() { for (const callback of frames.splice(0)) callback(); }, pendingFrames: () => frames.length };
}

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
  assert.match(chat, /scroll\.showLatest\?h\(ui\.Button,\{variant:'outline',className:'rssh-jump-latest'/);
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
