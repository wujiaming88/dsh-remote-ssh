import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { historyAnchorAttributes, historyAnchorAdjustment } from '../src/client/history-anchor.js';
import { initialState, reduceEvent, replay } from '../src/client/events.js';
import { transcriptEntries, anchoredScrollTop } from '../src/client/transcript-model.js';

const event = (seq, patch = {}) => ({ generation: 'g', seq, sessionId: 'root', turnId: 'turn', type: 'text', text: `chunk-${seq}`, ...patch });
const entries = events => transcriptEntries(replay(events).items);
const measure = (entry, top, bottom) => {
  const attrs = historyAnchorAttributes(entry);
  return { key: entry.key, members: JSON.parse(attrs['data-history-members']), ranges: JSON.parse(attrs['data-history-ranges']), versions: JSON.parse(attrs['data-history-versions']), top, bottom };
};
const anchor = (key, top, bottom, members = [key], ranges = [], versions = {}) => ({ key, top, bottom, members, ranges, versions });
const range = (firstSeq, lastSeq, generation = 'g', type = 'assistant') => ({ generation, firstSeq, lastSeq, type });

test('owned attributes contain item keys and factual text bounds, never transcript content', () => {
  const entry = entries([event(2, { text: 'PRIVATE TRANSCRIPT CONTENT' }), event(7)])[0];
  const attrs = historyAnchorAttributes(entry);
  assert.deepEqual(Object.keys(attrs), ['data-history-members', 'data-history-ranges', 'data-history-versions']);
  assert.deepEqual(JSON.parse(attrs['data-history-versions']), { 'g:2': 7 });
  assert.deepEqual(JSON.parse(attrs['data-history-members']), ['g:2']);
  assert.deepEqual(JSON.parse(attrs['data-history-ranges']), [range(2, 7)]);
  assert.doesNotMatch(JSON.stringify(attrs), /PRIVATE TRANSCRIPT CONTENT|chunk-/);
  assert.equal(entry.kind, 'process');
  assert.equal(entry.key, 'process:["root","turn"]');
});

test('process attributes include all normal member keys but ranges only for factual text', () => {
  const entry = entries([event(2, { type: 'thought' }), event(3, { type: 'thought' }), event(4, { type: 'tool_call', toolCallId: 'tool' }), event(5, { type: 'plan' })])[0];
  assert.equal(entry.kind, 'process');
  assert.deepEqual(historyAnchorAttributes(entry), {
    'data-history-members': JSON.stringify(['g:2', 'g:4', 'g:5']),
    'data-history-ranges': JSON.stringify([range(2, 3, 'g', 'thought')]),
    'data-history-versions': JSON.stringify({ 'g:2': 3, 'g:4': 4, 'g:5': 5 }),
  });
  assert.deepEqual(historyAnchorAttributes(), { 'data-history-members': '[]', 'data-history-ranges': '[]', 'data-history-versions': '{}' });
});

test('missing generation or unobserved/invalid sequence bounds never invent ranges', () => {
  for (const patch of [{ generation: '' }, { generation: undefined }, { seq: 0 }, { lastSeq: undefined }, { lastSeq: 1 }, { lastSeq: Infinity }, { lastSeq: '4' }, { type: 'tool' }]) {
    const item = { key: 'g:2', type: 'assistant', generation: 'g', seq: 2, lastSeq: 4, ...patch };
    assert.deepEqual(JSON.parse(historyAnchorAttributes({ kind: 'item', item })['data-history-ranges']), []);
  }
});

test('appendText records factual lastSeq on creation, append and replacement without changing first seq', () => {
  for (const type of ['text', 'thought']) {
    let state = reduceEvent(initialState(), event(3, { type, lastSeq: 999 }));
    assert.equal(state.items[0].seq, 3); assert.equal(state.items[0].lastSeq, 3);
    const original = state.items[0];
    state = reduceEvent(state, event(9, { type }));
    assert.equal(state.items[0].seq, 3); assert.equal(state.items[0].lastSeq, 9);
    assert.equal(original.lastSeq, 3);
    state = reduceEvent(state, event(12, { type, append: false, text: 'replacement' }));
    assert.equal(state.items[0].key, 'g:3'); assert.equal(state.items[0].seq, 3);
    assert.equal(state.items[0].lastSeq, 12); assert.equal(state.items[0].text, 'replacement');
    assert.equal(reduceEvent(state, event(9, { type })), state);
  }
});

test('any exact surviving key wins over an earlier absorbed member and uses top offsets', () => {
  const before = [anchor('process:g:8', -20, 80, ['g:8'], [], { 'g:8': 8 }), anchor('g:10', 80, 150)];
  const after = [anchor('process:g:2', -40, 280, ['g:2', 'g:8'], [], { 'g:2': 2, 'g:8': 8 }), anchor('g:10', 280, 900)];
  assert.deepEqual(historyAnchorAdjustment(before, after), { previousOffset: 80, nextOffset: 280 });
  assert.equal(anchoredScrollTop({ currentTop: 600, ...historyAnchorAdjustment(before, after) }), 800);
});

test('stable process keys use top offsets only for unchanged versioned membership', () => {
  const events = [event(2), event(8, { type: 'tool_call', toolCallId: 'tool', output: 'old' })];
  const before = measure(entries(events)[0], -20, 80), unchanged = measure(entries(events)[0], 40, 140);
  assert.equal(before.key, unchanged.key);
  assert.deepEqual(historyAnchorAdjustment([before], [unchanged]), { previousOffset: -20, nextOffset: 40 });
  for (const nextEvents of [
    [...events, event(9)],
    [...events, event(9, { type: 'tool_call_update', toolCallId: 'tool', output: 'new' })],
    events.map(value => ({ ...value, generation: 'other' })),
    [event(2, { type: 'thought' }), events[1]],
  ]) {
    const changed = measure(entries(nextEvents)[0], 40, 900);
    assert.equal(changed.key, before.key);
    assert.equal(historyAnchorAdjustment([before], [changed]), null);
  }
  for (const versions of [undefined, {}, { 'g:2': 2 }]) {
    assert.equal(historyAnchorAdjustment([{ ...before, versions }], [{ ...unchanged, versions }]), null);
  }
});

test('stable process prepend yields to a separate unchanged event anchor before bottom compensation', () => {
  const events = [event(2, { type: 'thought' }), event(8, { type: 'tool_call', toolCallId: 'tool' })];
  const before = measure(entries(events.slice(1))[0], -20, 80), after = measure(entries(events)[0], -20, 280);
  assert.equal(before.key, after.key);
  assert.deepEqual(historyAnchorAdjustment([before, anchor('g:10', 80, 150)], [after, anchor('g:10', 280, 900)]),
    { previousOffset: 80, nextOffset: 280 });
});

test('process first item shifting preserves a surviving member using group bottoms', () => {
  const events = [event(2, { type: 'thought' }), event(8, { type: 'tool_call', toolCallId: 'tool' }), event(9, { type: 'plan' })];
  const before = measure(entries(events.slice(1))[0], -25, 100);
  const after = measure(entries(events)[0], -25, 270);
  assert.equal(before.key, after.key);
  assert.deepEqual(historyAnchorAdjustment([before], [after]), { previousOffset: 100, nextOffset: 270 });
});

test('shared process suffix accepts pure prepend but rejects newly appended tool or thought members', () => {
  const events = [event(2, { type: 'thought' }), event(8, { type: 'tool_call', toolCallId: 'tool' }), event(9, { type: 'thought' })];
  const before = measure(entries(events.slice(1))[0], -25, 100);
  const after = measure(entries(events)[0], -25, 270);
  assert.deepEqual(historyAnchorAdjustment([before], [after]), { previousOffset: 100, nextOffset: 270 });
  for (const appended of [event(12, { type: 'tool_call', toolCallId: 'new-tool' }), event(12, { type: 'thought' })]) {
    const grown = measure(entries([...events, appended])[0], -25, 600);
    assert.equal(historyAnchorAdjustment([before], [grown]), null);
  }
});

test('same tool key with newer output seq invalidates bottom fallback even before unchanged suffix', () => {
  const events = [event(2, { type: 'thought' }), event(8, { type: 'tool_call', toolCallId: 'tool', output: 'old' }), event(9, { type: 'plan' })];
  const before = measure(entries(events.slice(1))[0], -25, 100);
  const after = measure(entries(events)[0], -25, 270);
  assert.deepEqual(historyAnchorAdjustment([before], [after]), { previousOffset: 100, nextOffset: 270 });
  const grown = measure(entries([...events, event(12, { type: 'tool_call_update', toolCallId: 'tool', output: 'much larger output' })])[0], -25, 900);
  assert.deepEqual(grown.members, after.members);
  assert.equal(before.versions['g:8'], 8); assert.equal(grown.versions['g:8'], 12);
  assert.equal(historyAnchorAdjustment([before], [grown]), null);
});

test('shared suffix requires factual versions; only standalone event keys identify a top without versions', () => {
  const before = anchor('process:g:8', -20, 80, ['g:8', 'g:9'], [], { 'g:8': 8, 'g:9': 9 });
  const next = anchor('process:g:2', -20, 280, ['g:2', 'g:8', 'g:9'], [], { 'g:2': 2, 'g:8': 8, 'g:9': 9 });
  assert.deepEqual(historyAnchorAdjustment([before], [next]), { previousOffset: 80, nextOffset: 280 });
  for (const versions of [undefined, {}, { 'g:8': 8 }, { 'g:8': 8, 'g:9': '9' }, { 'g:8': 8, 'g:9': Infinity }]) {
    assert.equal(historyAnchorAdjustment([{ ...before, versions }], [next]), null);
    assert.equal(historyAnchorAdjustment([before], [{ ...next, versions }]), null);
  }
  assert.equal(historyAnchorAdjustment([{ ...before, versions: undefined }], [{ ...next, key: before.key, top: 40, versions: undefined }]), null);
  assert.deepEqual(historyAnchorAdjustment([anchor('g:8', -20, 80)], [anchor('g:8', 40, 280)]), { previousOffset: -20, nextOffset: 40 });
});

test('an early matching partial thought cannot anchor a group with a newly appended tool', () => {
  const events = [event(2, { type: 'thought' }), event(8, { type: 'thought' }), event(11, { type: 'thought' })];
  const before = measure(entries(events.slice(1))[0], -25, 100);
  const after = measure(entries(events)[0], -25, 270);
  assert.deepEqual(historyAnchorAdjustment([before], [after]), { previousOffset: 100, nextOffset: 270 });
  const withTool = measure(entries([...events, event(12, { type: 'tool_call', toolCallId: 'new-tool' })])[0], -25, 600);
  assert.deepEqual(after.ranges, withTool.ranges);
  assert.equal(historyAnchorAdjustment([before], [withTool]), null);
  assert.equal(historyAnchorAdjustment([{ ...before, members: [...before.members, 'g:99'] }], [after]), null);
});

test('versions omit members whose current factual event sequence is unavailable', () => {
  const attrs = historyAnchorAttributes({ kind: 'process', items: [
    { key: 'g:1', type: 'thought', seq: 1 },
    { key: 'g:2', type: 'tool', tool: { output: 'private output' } },
    { key: 'g:3', type: 'subagent', subagent: { title: 'private title' } },
  ] });
  assert.deepEqual(JSON.parse(attrs['data-history-versions']), {});
  assert.doesNotMatch(JSON.stringify(attrs), /private/);
});

for (const type of ['text', 'thought']) test(`a single partial ${type} anchor survives a cut within its run`, () => {
  const events = [event(2, { type }), event(5, { type }), event(8, { type }), event(11, { type })];
  const before = measure(entries(events.slice(2))[0], -300, 60);
  const after = measure(entries(events)[0], -300, 460);
  assert.equal(before.key, after.key);
  assert.equal(before.members.some(member => after.members.includes(member)), false);
  assert.deepEqual(historyAnchorAdjustment([before], [after]), { previousOffset: 60, nextOffset: 460 });
  assert.equal(anchoredScrollTop({ currentTop: 300, ...historyAnchorAdjustment([before], [after]) }), 700);
});

test('generation boundaries and repeated turns with reused text never form anchors', () => {
  const old = measure(entries([event(8), event(11)])[0], -10, 80);
  for (const events of [
    [event(2, { generation: 'other' }), event(11, { generation: 'other' })],
    [event(20, { turnId: 'next-turn' }), event(24, { turnId: 'next-turn' })],
    [event(2, { type: 'thought' }), event(11, { type: 'thought' })],
  ]) assert.equal(historyAnchorAdjustment([old], [measure(entries(events)[0], -10, 300)]), null);
});

test('range matching handles colons in generation and does not parse ambiguous numeric-only keys', () => {
  const old = anchor('process:journal:version:8', -10, 80, ['journal:version:8'], [range(8, 11, 'journal:version', 'thought')]);
  const next = anchor('process:journal:version:2', -10, 280, ['journal:version:2'], [range(2, 11, 'journal:version', 'thought')]);
  assert.deepEqual(historyAnchorAdjustment([old], [next]), { previousOffset: 80, nextOffset: 280 });
  assert.equal(historyAnchorAdjustment([{ ...old, members: ['8'] }], [next]), null);
  assert.equal(historyAnchorAdjustment([{ ...old, ranges: [] }], [next]), null);
});

test('independent live tail growth cannot provide a whole-viewport height adjustment', () => {
  const old = anchor('g:8', -20, 80, ['g:8'], [range(8, 11)]);
  const newPrefix = anchor('g:2', -20, 280, ['g:2'], [range(2, 11)]);
  const tail = anchor('tail', 300, 1000000);
  assert.deepEqual(historyAnchorAdjustment([old], [newPrefix, tail]), { previousOffset: 80, nextOffset: 280 });
  assert.equal(historyAnchorAdjustment([old], [{ ...newPrefix, ranges: [range(2, 12)] }, tail]), null);
  assert.equal(historyAnchorAdjustment([old], [tail]), null);
});

test('ambiguous destinations, empty records and invalid measurements do not invent anchors', () => {
  const old = anchor('process:g:8', -10, 80, ['g:8'], [], { 'g:8': 8 });
  const next = anchor('process:g:2', -10, 280, ['g:2', 'g:8'], [], { 'g:2': 2, 'g:8': 8 });
  assert.equal(historyAnchorAdjustment([old], [next, { ...next, key: 'other' }]), null);
  assert.equal(historyAnchorAdjustment([anchor('same', 0, 10)], [anchor('same', 10, 20), anchor('same', 30, 40)]), null);
  for (const input of [undefined, null, {}, []]) assert.equal(historyAnchorAdjustment(input, [next]), null);
  for (const patch of [{ top: NaN }, { bottom: Infinity }, { top: '0' }, { top: 100, bottom: 90 }]) {
    assert.equal(historyAnchorAdjustment([{ ...old, ...patch }], [next]), null);
    assert.equal(historyAnchorAdjustment([old], [{ ...next, ...patch }]), null);
  }
});

test('helper is deterministic and does not mutate supplied metadata or measurements', () => {
  const old = anchor('process:g:8', -10.5, 80.25, Object.freeze(['g:8']), [], Object.freeze({ 'g:8': 8 }));
  const next = anchor('process:g:2', -10.5, 280.75, Object.freeze(['g:2', 'g:8']), [], Object.freeze({ 'g:2': 2, 'g:8': 8 }));
  const before = Object.freeze([Object.freeze(old)]), after = Object.freeze([Object.freeze(next)]);
  const expected = { previousOffset: 80.25, nextOffset: 280.75 };
  assert.deepEqual(historyAnchorAdjustment(before, after), expected);
  assert.deepEqual(historyAnchorAdjustment(before, after), expected);
});

test('both real transcript wrapper props spread owned metadata without changing existing anchors', () => {
  const source = readFileSync(new URL('../src/client/transcript.js', import.meta.url), 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const wrappers = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.name === 'h' && node.arguments[0]?.value === 'div') {
      const props = node.arguments[1]?.properties || [];
      if (props.some(prop => prop.key?.value === 'data-transcript-anchor')) wrappers.push(props);
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  };
  visit(ast);
  assert.equal(wrappers.length, 2);
  for (const props of wrappers) {
    const anchor = props.find(prop => prop.key?.value === 'data-transcript-anchor');
    assert.equal(source.slice(anchor.value.start, anchor.value.end), 'entry.key');
    assert.ok(props.some(prop => prop.type === 'SpreadElement' && prop.argument.callee?.name === 'historyAnchorAttributes' && prop.argument.arguments[0]?.name === 'entry'));
  }
  assert.ok(ast.body.some(node => node.type === 'ImportDeclaration' && node.source.value === './history-anchor.js' && node.specifiers.some(specifier => specifier.imported?.name === 'historyAnchorAttributes')));
});
