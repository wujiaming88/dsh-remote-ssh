import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {menuPosition, text} from '../src/client/ui-pure.js';

const source = readFileSync(new URL('../src/client/native-overlays.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/client/native-overlays.css', import.meta.url), 'utf8');
const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
function collect(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => collect(child, predicate, result));
    else if (value && typeof value === 'object') collect(value, predicate, result);
  }
  return result;
}
function functionNode(name) {
  return collect(ast, node => node.type === 'FunctionDeclaration' && node.id.name === name)[0];
}
function compile(node, scope) {
  return Function(...Object.keys(scope), 'return (' + source.slice(node.start, node.end) + ')')(...Object.values(scope));
}
function controller(name, scope) { return compile(functionNode(name), scope); }
function propertyFunction(name, owner) {
  return collect(owner || ast, node => node.type === 'Property' && node.key.name === name && node.value.type === 'FunctionExpression');
}
function key(key, extra = {}) {
  return {key, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra};
}
// These are isolated controller inputs, not a React/DOM renderer. Tests compile
// the actual AST functions and exercise their event/state contracts directly.
function keyboard(role = 'menu') {
  const doc = {activeElement: null}, focused = [], closed = [];
  const nodes = ['Alpha', 'Beta', 'Bravo'].map(textContent => ({textContent,
    focus(options) { doc.activeElement = this; focused.push({node: this, options}); }}));
  doc.activeElement = nodes[0];
  let now = 1000;
  const search = {current: {text: '', time: 0}};
  const current = {current: {role}};
  const run = controller('onKeyDown', {current, candidates: () => nodes, panelRef: {current: {ownerDocument: doc}},
    close: restore => closed.push(restore), search, text, Date: {now: () => now}});
  return {run, nodes, doc, focused, closed, search, current, time(value) { now = value; }};
}

test('overlay API uses only local transforms and injected React/control instances', () => {
  const exported = ast.body.find(node => node.type === 'ExportNamedDeclaration');
  assert.equal(exported.declaration.id.name, 'createNativeOverlays');
  assert.deepEqual(exported.declaration.params[1].properties.map(node => node.key.name), ['Button', 'Icon']);
  assert.deepEqual(ast.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value), ['./ui-pure.js']);
  assert.match(source, /return \{Menu, Modal\}/);
  assert.doesNotMatch(source, /require\(|document\.body|createPortal|ReactDOM|appendChild|innerHTML|h\('svg'/);
  assert.match(source, /NOT an instance\/import of a Host control/);
  assert.match(source, /native\.js zp \(17793\), Zu \(17673\), Ed \(17691\), db \(18335\)/);
});

test('copied DOM keeps native visual hierarchy and icon sizes', () => {
  const modal = source.slice(functionNode('Modal').start, functionNode('Modal').end);
  for (const part of ['content', 'header', 'title', 'close', 'description', 'body', 'footer']) assert.ok(modal.includes('rssh-native-modal-' + part));
  assert.ok(modal.indexOf('rssh-native-modal-content') < modal.indexOf('rssh-native-modal-header'));
  assert.ok(modal.indexOf('rssh-native-modal-body') < modal.indexOf('rssh-native-modal-footer'));
  assert.match(modal, /h\('button', \{type: 'button', className: 'rssh-native-modal-close'/);
  assert.match(modal, /name: 'close', size: 14/);
  for (const part of ['material', 'viewport', 'item-wrap', 'item-icon', 'item-label', 'check']) assert.ok(source.includes('rssh-native-menu-' + part));
  assert.match(source, /name: 'check', size: 14/);
  assert.match(source, /role: selectable \? 'menuitemradio' : 'menuitem'/);
  assert.match(source, /'aria-checked': selectable \? selected : undefined/);
  assert.match(source, /item\.description \|\| item\.detail/);
});

test('CSS uses scoped native classes, native theme tokens and release values', () => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const classNames = [...clean.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]);
  assert.ok(classNames.length > 30);
  assert.ok(classNames.every(name => name.startsWith('rssh-native-')));
  assert.doesNotMatch(clean, /#[\da-fA-F]{3,8}\b|\._\w+|\.rsui-/);
  for (const match of clean.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(match[1].startsWith('--dsw-') || ['--dsh-frame-overlay-top', '--ds-transition-duration', '--ds-ease-in-out'].includes(match[1]), match[1]);
  }
  for (const declaration of ['padding: 6px 8px', 'min-height: 34px', 'gap: 6px', 'font-size: 13px',
    'padding: 22px 14px 12px 24px', 'width: min(380px, 100%)', 'gap: 20px', 'height: 28px',
    'background: var(--dsw-menu-surface-fill)', 'backdrop-filter: var(--dsw-menu-backdrop-filter)',
    'border-radius: var(--dsw-radius-panel)', 'box-shadow: var(--dsw-elevation-prominent)']) assert.ok(clean.includes(declaration), declaration);
  assert.match(clean, /\.rssh-native-menu\[hidden\] \{ display: none; \}/);
  assert.match(clean, /\.rssh-native-modal::backdrop/);
});

test('keyboard navigation wraps, handles endpoints and restores focus on Escape/Tab', () => {
  const k = keyboard();
  for (const [name, index] of [['ArrowUp', 2], ['ArrowDown', 0], ['End', 2], ['Home', 0]]) {
    const event = key(name); k.run(event); assert.equal(k.doc.activeElement, k.nodes[index]); assert.equal(event.prevented, true);
  }
  const escape = key('Escape'); k.run(escape);
  assert.equal(escape.prevented, true); assert.equal(escape.stopped, true); assert.deepEqual(k.closed, [true]);
  const tab = key('Tab'); k.run(tab); assert.equal(tab.prevented, false); assert.deepEqual(k.closed, [true, true]);
  assert.ok(k.focused.every(call => call.options.preventScroll));
});

test('typeahead accumulates for 600ms, expires, and ignores modifier/space input', () => {
  const k = keyboard();
  k.run(key('b')); assert.equal(k.doc.activeElement, k.nodes[1]);
  k.time(1100); k.run(key('r')); assert.equal(k.doc.activeElement, k.nodes[2]);
  for (const event of [key('x', {ctrlKey: true}), key('x', {altKey: true}), key('x', {metaKey: true}), key(' ')]) k.run(event);
  assert.equal(k.search.current.text, 'br');
  k.time(1800); k.run(key('a')); assert.equal(k.doc.activeElement, k.nodes[0]); assert.equal(k.search.current.text, 'a');
});

test('informational role=dialog cards keep disclosure keys and Tab but dismiss on Escape', () => {
  const k = keyboard('dialog');
  for (const name of ['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'a']) {
    const event = key(name); k.run(event); assert.equal(event.prevented, false);
  }
  assert.deepEqual(k.focused, []); assert.deepEqual(k.closed, []);
  k.run(key('Escape')); assert.deepEqual(k.closed, [true]);
  const blur = propertyFunction('onBlurCapture')[0].value;
  let closed = 0;
  const anchor = {contains: target => target === 'inside'};
  const run = compile(blur, {current: {current: {role: 'dialog', open: true}}, anchorRef: {current: anchor}, close: () => closed++});
  run({relatedTarget: 'inside'}); assert.equal(closed, 0);
  run({relatedTarget: 'outside'}); assert.equal(closed, 1);
});

test('menu selection preserves prevented clicks, disabled guards and close/refocus', () => {
  const click = propertyFunction('onClick', functionNode('Menu'))[0].value;
  const calls = [], item = {id: 'one', onClick: () => calls.push('item')};
  const run = compile(click, {item, props: {onSelect: id => calls.push(id)}, close: restore => calls.push(restore)});
  item.disabled = true; run({defaultPrevented: false}); assert.deepEqual(calls, []);
  item.disabled = false; run({defaultPrevented: true}); assert.deepEqual(calls, ['item']);
  calls.length = 0; run({defaultPrevented: false}); assert.deepEqual(calls, ['item', 'one', true]);
});

test('candidate controller excludes hidden and aria-disabled nodes', () => {
  let selector;
  const visible = {getAttribute: () => null}, disabled = {getAttribute: () => 'true'}, hidden = {hidden: true, getAttribute: () => null};
  const run = controller('candidates', {panelRef: {current: {querySelectorAll(value) { selector = value; return [visible, disabled, hidden]; }}}});
  assert.deepEqual(run(), [visible]);
  for (const role of ['menuitem', 'menuitemradio', 'menuitemcheckbox']) assert.ok(selector.includes('[role="' + role + '"]:not(:disabled)'));
  assert.ok(selector.includes('a[href]'));
});

test('outside and toggle controllers only dismiss outside owned refs and respect cleanup', () => {
  const calls = [], suppressToggle = {current: false};
  const outside = controller('outside', {anchor: {contains: value => value === 'anchor'}, panel: {contains: value => value === 'panel'}, close: value => calls.push(value)});
  outside({target: 'anchor'}); outside({target: 'panel'}); assert.deepEqual(calls, []);
  outside({target: 'elsewhere'}); assert.deepEqual(calls, [false]);
  const toggle = controller('onToggle', {suppressToggle, close: value => calls.push(value)});
  toggle({newState: 'open'}); toggle({newState: 'closed'}); assert.deepEqual(calls, [false, false]);
  suppressToggle.current = true; toggle({newState: 'closed'}); assert.deepEqual(calls, [false, false]);
  for (const pattern of [/removeEventListener\('beforetoggle', onToggle\)/, /removeEventListener\('pointerdown', outside\)/,
    /removeEventListener\('resize', position\)/, /removeEventListener\('scroll', position, true\)/, /observer\.disconnect\(\)/,
    /panel\.hidePopover\(\)/, /observer\.observe\(anchor\); observer\.observe\(panel\)/]) assert.match(source, pattern);
});

test('position controller retains viewport flip/clamp/end alignment', () => {
  assert.deepEqual(menuPosition({left: 190, right: 220, top: 140, bottom: 160}, {width: 100, height: 60}, {width: 240, height: 180}, 'end'), {left: 120, top: 76});
  const panel = {style: {}, getBoundingClientRect: () => ({width: 100, height: 60})};
  controller('position', {panel, anchor: {getBoundingClientRect: () => ({left: 2, right: 20, top: 1, bottom: 10})},
    win: {innerWidth: 240, innerHeight: 180}, current: {current: {align: 'start'}}, menuPosition})();
  assert.deepEqual(panel.style, {left: '8px', top: '14px'});
});

test('Modal cancellation/backdrop contracts and focus lifecycle remain controlled', () => {
  let closes = 0;
  const closeRef = {current: () => closes++};
  const cancel = compile(propertyFunction('onCancel')[0].value, {closeRef});
  const event = key('Escape'); cancel(event); assert.equal(event.prevented, true); assert.equal(closes, 1);
  const dialog = {getBoundingClientRect: () => ({left: 10, right: 100, top: 10, bottom: 100})};
  const props = {}, dialogRef = {current: dialog};
  const backdrop = compile(propertyFunction('onClick', functionNode('Modal'))[0].value, {props, dialogRef, closeRef});
  backdrop({target: dialog, clientX: 50, clientY: 50}); assert.equal(closes, 1);
  backdrop({target: {}, clientX: 0, clientY: 0}); assert.equal(closes, 1);
  backdrop({target: dialog, clientX: 0, clientY: 0}); assert.equal(closes, 2);
  props.closeOnBackdrop = false; backdrop({target: dialog, clientX: 0, clientY: 0}); assert.equal(closes, 2);
  for (const pattern of [/dialog\.showModal\(\)/, /if \(dialog\.open\) dialog\.close\(\); restoreFocus\(previous\)/,
    /data-modal-autofocus="true"/, /if \(preferred\) preferred\.focus\(\)/, /node\.isConnected/, /'aria-labelledby'/, /'aria-describedby'/,
    /props\.autoFocus !== false/, /selected \|\| options\[0\]/]) assert.match(source, pattern);
});
