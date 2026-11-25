import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const source = readFileSync(new URL('../src/client/native-icons.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
function staticValue(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(staticValue);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(property => [property.key.value ?? property.key.name, staticValue(property.value)]));
  throw new Error('Non-static icon data: ' + node.type);
}
function exportedLiteral(name) {
  const declaration = ast.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.declarations?.[0]?.id.name === name).declaration.declarations[0];
  return staticValue(declaration.init.type === 'CallExpression' ? declaration.init.arguments[0] : declaration.init);
}
const data = exportedLiteral('NATIVE_ICON_DATA');
const sources = exportedLiteral('NATIVE_ICON_SOURCES');
function walk(node, visit) {
  visit(node);
  node[2].forEach(child => walk(child, visit));
}

// Tests inspect syntax and plain SVG data only. No React/DOM emulation, bundle
// execution, or connected-page access is used.

const required = ['send', 'stop', 'spinner', 'add', 'plus', 'close', 'remove', 'chevron-down', 'chevron-right', 'chevron-up', 'folder', 'folder-open', 'sidebar', 'file', 'code', 'image', 'copy', 'check', 'wrap', 'nowrap', 'tool', 'agent', 'subagent', 'state-check', 'plan', 'message', 'native', 'source', 'thought', 'lightbulb', 'running', 'clock', 'pause', 'refresh', 'upload', 'download', 'more', 'warning', 'shield', 'permission', 'usage', 'stats'];

test('all requested icon roles point to documented copied native shapes', () => {
  assert.equal(exportedLiteral('NATIVE_ICON_VERSION'), '0.2.2-rc.5');
  assert.equal(exportedLiteral('NATIVE_ICON_SOURCE_SHA256'), '65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b');
  assert.equal(Object.keys(data).length, 47);
  for (const role of required) {
    assert.ok(sources[role], role);
    assert.ok(data[sources[role].key], role);
    assert.ok(sources[role].symbol && sources[role].compiled && sources[role].line, role);
  }
  assert.match(sources.running.note, /Static native brand mark/);
  assert.match(sources.image.note, /neutral sheet-mark colors mapped/);
  assert.deepEqual(exportedLiteral('NATIVE_ICON_FALLBACKS'), {});
});

test('copied geometry and SVG structure retain their reviewed snapshot', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'), 'bf7b8cda6aede64daa8ae17706c4864a6a0f2b238abdb0d641d3c43c4fc7dd11');
  assert.equal(data['send-outline'][1].viewBox, '0 0 16 16');
  assert.equal(data['send-outline'][2][1][1].d, 'M7.97571 14.5732L8.02421 2.34139');
  assert.equal(data['plus-outline'][2][0][1].d, 'M8 2V14');
  assert.equal(data['reference-file'][2][0][1].d, 'M4.9375 5.90295H11.0625');
  assert.equal(data['fish-logo'][1].viewBox, '0 0 23.16 17.04');
  assert.equal(data['file-image'][2][2][1].transform, 'translate(14 16) scale(1.12) translate(-14 -16)');
});

test('static nodes contain SVG only, no native class dependency or executable markup', () => {
  const tags = new Set(['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'defs', 'mask', 'clipPath', 'linearGradient', 'radialGradient', 'stop']);
  for (const [name, icon] of Object.entries(data)) {
    assert.equal(icon[0], 'svg', name);
    assert.match(icon[1].viewBox, /^0 0 [\d.]+ [\d.]+$/, name);
    walk(icon, ([tag, attributes, children]) => {
      assert.ok(tags.has(tag), name + ': ' + tag);
      assert.ok(Array.isArray(children));
      for (const [attribute, value] of Object.entries(attributes)) {
        assert.doesNotMatch(attribute, /^(?:on|dangerouslySetInnerHTML|className|style)/);
        if (typeof value === 'string') assert.doesNotMatch(value, /(?:javascript:|data:|--dsw-static-)/);
      }
    });
  }
  const imports = ast.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value);
  assert.deepEqual(imports, ['react']);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.innerHTML\b|document\.|window\.|ReactDOM|require\(/);
  assert.doesNotMatch(source, /from ['"]@deepseek-ai\//);
});

test('component source contract preserves sizing, accessibility and unique local references', () => {
  const exported = ast.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'NativeIcon');
  assert.equal(exported.declaration.type, 'FunctionDeclaration');
  const component = source.slice(exported.start, exported.end);
  assert.match(component, /size = 16, weight = 'regular'/);
  assert.match(component, /const instanceId = React\.useId\(\)/);
  assert.match(component, /weight === 'medium' \? 1\.3 : 1/);
  assert.match(component, /'aria-hidden': true, focusable: false, \.\.\.props/);
  assert.match(component, /width: size, height: size \* height \/ width/);
  assert.match(component, /throw new Error\('Unknown native icon: '/);
  assert.match(component, /'rssh-icon-' \+ instanceId\.replace/);
  const render = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'renderNode');
  const rendering = source.slice(render.start, render.end);
  assert.match(rendering, /key === 'id'\) value = prefix \+ value/);
  assert.match(rendering, /'url\(#' \+ prefix \+ id \+ '\)'/);
  assert.match(rendering, /key === 'href' \|\| key === 'xlinkHref'/);
  assert.match(rendering, /value = '#' \+ prefix \+ value\.slice\(1\)/);
  assert.match(rendering, /React\.createElement\(tag/);
  assert.match(rendering, /renderNode\(child, prefix, stroke/);
});
