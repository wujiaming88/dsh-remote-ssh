import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';

const source = await readFile(new URL('../src/client/native-controls.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/client/native-controls.css', import.meta.url), 'utf8');
const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
// Evaluate only the pure adapters selected by AST; never load React, the browser
// entry, or a renderer. No simulated DOM/component execution is involved.
const pureNames = ['buttonControlProps', 'inputControlProps', 'stateDotSize'];
const pureDeclarations = ast.body.flatMap(node => node.type === 'ExportNamedDeclaration' &&
  pureNames.includes(node.declaration?.id?.name) ? [node.declaration] : []);
const joinDeclaration = ast.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0]?.id.name === 'join');
const {buttonControlProps, inputControlProps, stateDotSize} = new Function(
  [joinDeclaration, ...pureDeclarations].map(node => source.slice(node.start, node.end)).join('\n') +
  `\nreturn {${pureNames.join(',')}};`)();
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

test('copied control factory exposes five native copies and a local select-shell adapter', () => {
  assert.deepEqual(ast.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value), ['./native-icons.js']);
  let members;
  walk(ast, node => {
    if (node.type === 'ReturnStatement' && node.argument?.type === 'ObjectExpression' &&
        node.argument.properties.some(property => property.key?.name === 'Button')) {
      members = node.argument.properties.map(property => property.key.name);
    }
  });
  assert.deepEqual(members, ['Button', 'Input', 'SelectField', 'Checkbox', 'Tag', 'StateDot']);
  assert.doesNotMatch(source, /(?:require\(|import\(|document\.|querySelector|innerHTML)/);
  assert.match(source, /Original symbols: Button Pi, Input DH, Checkbox cb, Tag Ep, StateDot zd/);
});

test('button adapter preserves loading, event, form and legacy default contracts', () => {
  const click = () => {};
  const props = buttonControlProps({loading: true, disabled: false, icon: 'x', children: 'Save',
    iconOnly: true, block: true, style: {color: 'inherit'}, className: 'extra', onClick: click,
    type: 'submit', 'aria-label': 'Save'});
  assert.equal(props.type, 'submit');
  assert.equal(props.disabled, true);
  assert.equal(props['aria-busy'], true);
  assert.equal(props.onClick, click);
  assert.equal(props['aria-label'], 'Save');
  assert.equal(props.className, 'rssh-native-button rssh-native-button-outline rssh-native-button-md extra');
  assert.deepEqual(props.style, {width: '100%', color: 'inherit'});
  for (const key of ['loading', 'icon', 'children', 'iconOnly', 'block']) assert.equal(key in props, false);
  assert.equal(buttonControlProps({disabled: true}).disabled, true);
  assert.equal(buttonControlProps({'aria-busy': true})['aria-busy'], true);
});

test('input adapter retains actual input attributes without leaking custom props', () => {
  const onChange = () => {};
  const props = inputControlProps({className: 'layout', icon: 'icon', prefix: 'prefix', suffix: 'suffix',
    size: 'sm', error: true, value: '', disabled: true, onChange, 'data-modal-autofocus': 'true'});
  assert.equal(props.className, 'rssh-native-input');
  assert.equal(props.type, 'text');
  assert.equal(props.size, undefined);
  assert.equal(props['aria-invalid'], true);
  assert.equal(props.disabled, true);
  assert.equal(props.onChange, onChange);
  assert.equal(props['data-modal-autofocus'], 'true');
  for (const key of ['icon', 'prefix', 'suffix', 'error']) assert.equal(key in props, false);
  assert.equal(inputControlProps({size: 20, type: 'number'}).size, 20);
  assert.equal(inputControlProps({'aria-invalid': true})['aria-invalid'], true);
});

test('checkbox copied structure keeps checked boolean callback and label association', () => {
  const checkbox = source.slice(source.indexOf('function Checkbox('), source.indexOf('function Tag('));
  assert.match(checkbox, /h\('label'/);
  assert.match(checkbox, /h\('input'/);
  assert.match(checkbox, /type: 'checkbox', checked, disabled/);
  assert.match(checkbox, /onChange\?\.\(event\.target\.checked\)/);
  assert.match(checkbox, /h\('span', null, label == null \? children : label\)/);
});

test('StateDot preserves installed geometry, phases, accessibility and reduced motion', () => {
  assert.equal(stateDotSize('ongoing'), 14);
  assert.equal(stateDotSize('done'), 10);
  assert.equal(stateDotSize('error', 20), 20);
  assert.match(source, /viewBox: '0 0 24 24'/);
  assert.equal((source.match(/r: '9\.5'/g) || []).length, 2);
  assert.match(source, /animation\.startTime = 0/);
  assert.match(source, /removeEventListener\('animationstart', sync\)/);
  assert.match(source, /React\.useLayoutEffect\(\(\) => state === 'ongoing' \? synchronizeSpinner\(spinnerRef\.current\) : undefined, \[state\]\)/);
  assert.match(source, /ref: spinnerRef/);
  assert.doesNotMatch(source, /ref: synchronizeSpinner/);
  assert.match(source, /role: label \? 'img' : undefined/);
  assert.match(css, /stroke-dasharray: 12 150/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /stroke-dasharray: 18 150/);
});

test('copied CSS is namespaced, theme-based and retains original control geometry', () => {
  assert.doesNotMatch(css, /\._\w|var\(--dsh-|#[0-9a-f]{3,8}\b|rgba?\(/i);
  for (const token of css.matchAll(/var\((--[\w-]+)/g)) assert.match(token[1], /^--dsw-/);
  assert.match(css, /\.rssh-native-button-md\s*\{\s*height: 36px/);
  assert.match(css, /\.rssh-native-button-sm\s*\{\s*height: 28px/);
  assert.match(css, /\.rssh-native-input-wrap\s*\{[^}]*height: 32px/);
   assert.match(css, /\.rssh-native-input-wrap\s*\{[^}]*box-sizing: border-box/);
   assert.match(css, /\.rssh-native-select\s*\{[^}]*width: 100%;[^}]*height: 100%/);
   assert.match(css, /\.rssh-native-select-chevron\s*\{[^}]*position: absolute;[^}]*pointer-events: none/);
  assert.match(css, /\.rssh-native-checkbox input\s*\{[^}]*width: 16px/);
  for (const tone of ['outline', 'solid', 'neutral', 'quiet', 'success', 'info', 'warning', 'danger']) {
    assert.ok(css.includes(`.rssh-native-tag[data-tone=${tone}]`));
  }
});
