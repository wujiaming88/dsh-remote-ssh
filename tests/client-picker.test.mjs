import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { pickerScrollTop } from '../src/client/picker.js';
import { acpCommandGroups } from '../src/client/presentation.js';

const css = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/client/chat.js', import.meta.url), 'utf8');
const ast = parse(chat, { ecmaVersion: 'latest', sourceType: 'module' });
function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'));
  assert.ok(match, selector);
  return Object.fromEntries(match[1].split(';').map(value => value.trim()).filter(Boolean).map(value => {
    const colon = value.indexOf(':'); return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
  }));
}
function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => walk(item, visitor));
    else if (value && typeof value === 'object') walk(value, visitor);
  }
}

test('candidate rows cannot shrink into adjacent long descriptions', () => {
  const row = declarations('.ra-acp-cmd-row');
  assert.equal(row.flex, '0 0 auto');
  assert.equal(row['font-size'], '13px');
  assert.equal(row['line-height'], '20px');
  assert.equal(row.overflow, 'hidden');
  const panel = declarations('.ra-acp-cmd-panel');
  assert.equal(panel['overflow-y'], 'auto');
  assert.equal(panel['overflow-x'], 'hidden');
  assert.equal(panel['min-height'], '0');
  assert.equal(panel.position, 'relative');
});
test('names ellipsize and descriptions have a bounded two-line footprint', () => {
  const name = declarations('.ra-acp-cmd-label');
  assert.equal(name['white-space'], 'nowrap');
  assert.equal(name['text-overflow'], 'ellipsis');
  assert.equal(name.overflow, 'hidden');
  const description = declarations('.ra-acp-cmd-description');
  assert.equal(description.flex, 'none');
  assert.equal(description['-webkit-line-clamp'], '2');
  assert.equal(description['line-height'], '16px');
  assert.equal(description['max-height'], '32px');
  assert.equal(description.overflow, 'hidden');
  assert.equal(description['overflow-wrap'], 'anywhere');
});
test('row labels and descriptions have explicit text containers, with full description retained', () => {
  const tags = new Map();
  walk(ast, node => {
    if (node.type !== 'CallExpression' || node.callee.name !== 'h' || node.arguments[1]?.type !== 'ObjectExpression') return;
    const name = node.arguments[1].properties.find(property => property.key?.name === 'className')?.value.value;
    if (name) tags.set(name, node.arguments[0].value);
  });
  assert.equal(tags.get('ra-acp-cmd-heading'), 'span');
  assert.equal(tags.get('ra-acp-cmd-label'), 'span');
  assert.equal(tags.get('ra-acp-cmd-description'), 'small');
  assert.match(chat, /title: value\.description \|\| value\.path/);
  assert.match(chat, /ref: pickerPanel/);
  assert.doesNotMatch(chat, /scrollIntoView\(/);
});
test('long Unicode skill descriptions are not modified or truncated as command data', () => {
  const description = '中文说明，mixed English and Unicode 😀 '.repeat(100);
  const command = { name: 'example', description };
  const group = acpCommandGroups([command], '中文');
  assert.equal(group.flatMap(value => value.items)[0].description, description);
});
test('keyboard scrolling is bounded to the picker geometry', () => {
  assert.equal(pickerScrollTop({ scrollTop: 0, height: 300, itemTop: 600, itemHeight: 64 }), 364);
  assert.equal(pickerScrollTop({ scrollTop: 400, height: 300, itemTop: 10, itemHeight: 64 }), 10);
  assert.equal(pickerScrollTop({ scrollTop: 100, height: 300, itemTop: 120, itemHeight: 64 }), 100);
  assert.equal(pickerScrollTop({ scrollTop: 0, height: 80, itemTop: 70, itemHeight: 64 }), 54);
  assert.equal(pickerScrollTop({ scrollTop: 8, height: 0, itemTop: 70, itemHeight: 64 }), 8);
});
