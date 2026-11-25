import test from 'node:test';
import assert from 'node:assert/strict';
import {toolFlowModel, toolBodyParts} from '../src/client/tool-model.js';
import {toolHeaderPresentation} from '../src/client/tool-header-model.js';

// Use the real body model; rawInput is optional presentation-only source data.
const header = (tool, options) => toolHeaderPresentation({...toolFlowModel(tool), rawInput: tool.rawInput}, options);

test('every ACP kind has a deliberate localized label and semantic icon', () => {
  const expected = {
    read: ['Read', 'read'], edit: ['Edit', 'edit'], search: ['Search', 'search'],
    execute: ['Execute', 'terminal'], fetch: ['Fetch', 'link'], delete: ['Delete', 'trash'],
    move: ['Move', 'tool'], think: ['Think', 'thought'], other: ['Other', 'tool'],
  };
  for (const [kind, [label, icon]] of Object.entries(expected)) {
    const result = header({kind, title: 'Actual supplied title'});
    assert.equal(result.labelKey, `flow.tool${label}`);
    assert.equal(result.icon, icon);
    assert.equal(result.summary, 'Actual supplied title');
  }
  assert.equal(header({kind: 'READ'}).labelKey, 'flow.toolRead');
});

test('read and edit show their structured path once instead of Read path plus path', () => {
  for (const kind of ['read', 'edit']) {
    const result = header({kind, title: `${kind} /remote/project/a.js`, locations: [{path: '/remote/project/a.js', line: 24}]});
    assert.equal(result.summary, '/remote/project/a.js:24');
    assert.equal(result.path, '/remote/project/a.js');
    assert.equal(result.pathLabel, result.summary);
    assert.equal(result.title, undefined);
  }
});

test('multiple locations preserve order, line distinctions and whole distinct paths', () => {
  const result = header({kind: 'read', title: 'Read selected files', locations: [
    {path: '/root/src/a.js', line: 2}, {path: 'src/a.js', line: 2},
    {path: '/root/src/a.js', line: 3}, {path: '/root/src/a.js', line: 2},
    {path: '/other/src/a.js'},
  ]});
  assert.equal(result.summary, '/root/src/a.js:2 · src/a.js:2 · /root/src/a.js:3 · /other/src/a.js');
  assert.equal(result.pathLabel, '/root/src/a.js:2');
  assert.notEqual(result.summary, result.pathLabel);
});

test('distinct colon-containing paths are not merged by coincidentally equal display labels', () => {
  const result = header({kind: 'read', locations: [{path: '/root/a', line: 2}, {path: '/root/a:2'}]});
  assert.equal(result.path, '/root/a');
  assert.equal(result.pathLabel, '/root/a:2');
  assert.equal(result.summary, '/root/a:2 · /root/a:2');
  assert.notEqual(result.summary, result.pathLabel);
});

test('path-looking titles and commands never become link targets or inferred kinds', () => {
  for (const kind of [undefined, '', 'custom', '__proto__', 'constructor']) {
    const result = header({kind, title: 'Read /remote/a.js', rawInput: {command: 'cat /remote/a.js'}});
    assert.equal(result.labelKey, undefined);
    assert.equal(result.title, 'Read /remote/a.js');
    assert.equal(result.icon, 'tool');
    assert.equal(result.path, undefined);
    assert.equal(result.pathLabel, undefined);
  }
  const result = header({kind: 'read', title: 'Read /remote/a.js'});
  assert.equal(result.summary, 'Read /remote/a.js');
  assert.equal(result.path, undefined);
});

test('invalid locations do not stringify objects, strip roots or invent link targets', () => {
  const tool = {kind: 'edit', title: 'Edit supplied document', locations: [null, 'a.js', {}, {path: 42}, {path: {}}, {path: ''}, {path: '  '}]};
  assert.deepEqual(header(tool), {labelKey: 'flow.toolEdit', icon: 'edit', summary: 'Edit supplied document'});
  assert.equal(header({...tool, locations: [...tool.locations, {path: '../a.js'}]}).path, '../a.js');
});

test('only integer nonnegative line metadata is displayed without guessing or coercion', () => {
  for (const line of [undefined, null, '4', -1, 1.5, NaN, Infinity]) {
    assert.equal(header({kind: 'read', locations: [{path: 'a.js', line}]}).summary, 'a.js');
  }
  assert.equal(header({kind: 'read', locations: [{path: 'a.js', line: 0}]}).summary, 'a.js:0');
  assert.equal(header({kind: 'read', locations: [{path: 'a.js', line: 4}]}).summary, 'a.js:4');
});

test('explicit raw-input paths supply non-linked summaries only', () => {
  for (const field of ['path', 'file_path', 'filePath']) {
    const result = header({kind: 'read', title: 'Read', rawInput: {[field]: '/actual/a.js'}});
    assert.equal(result.summary, '/actual/a.js');
    assert.equal(result.path, undefined);
    assert.equal(result.pathLabel, undefined);
  }
  assert.equal(header({kind: 'read', title: 'Read', rawInput: {path: 'wrong'}, locations: [{path: 'actual'}]}).summary, 'actual');
  assert.equal(header({kind: 'read', title: 'Read', rawInput: {truncated: true, path: 'partial'}}).summary, 'Read');
});

test('search uses actual pattern or query and retains distinct structured locations', () => {
  const result = header({kind: 'search', title: 'Search files', rawInput: {pattern: 'foo.*bar'}, locations: [{path: 'src'}, {path: 'tests'}]});
  assert.equal(result.summary, 'foo.*bar · src · tests');
  assert.notEqual(result.pathLabel, result.summary);
  assert.equal(header({kind: 'search', title: 'Search selected folders', locations: [{path: 'src'}, {path: 'tests'}]}).summary, 'src · tests');
  assert.equal(header({kind: 'search', title: 'Search', rawInput: {query: 'specific phrase'}}).summary, 'specific phrase');
  assert.equal(toolHeaderPresentation({...toolFlowModel({kind: 'search'}), pattern: 'a|b'}).summary, 'a|b');
  assert.equal(header({kind: 'search', title: 'Search actual title', rawInput: 'rg foo src'}).summary, 'Search actual title');
});

test('execute prefers supplied descriptions and titles without interpreting shell intent', () => {
  const command = 'rg TODO src && git diff --stat';
  const tool = {kind: 'execute', title: 'Check current changes', rawInput: {command, description: 'Inspect requested work'}};
  assert.equal(header(tool).summary, 'Inspect requested work');
  assert.equal(header({...tool, description: 'Top-level actual description'}).summary, 'Top-level actual description');
  assert.equal(header({kind: 'execute', title: 'User supplied title', rawInput: {command}}).summary, 'User supplied title');
  assert.equal(header({kind: 'execute', rawInput: {command}}).summary, command);
  assert.equal(header({kind: 'execute', rawInput: {command: 'cat a.js'}}).icon, 'terminal');
});

test('fetch uses explicit URL while other kinds keep genuine supplied summaries', () => {
  assert.equal(header({kind: 'fetch', title: 'Fetch reference', rawInput: {url: 'https://example.test/reference'}}).summary, 'https://example.test/reference');
  assert.equal(header({kind: 'think', title: 'Compare approaches', description: 'Evaluate actual constraints'}).summary, 'Evaluate actual constraints');
  assert.equal(header({kind: 'other', title: 'Custom operation'}).summary, 'Custom operation');
});

test('unknown kinds retain supplied titles and only use declared locations as links', () => {
  const result = header({kind: 'future-kind', title: 'Custom provider operation', locations: [{path: '/remote/a.js'}]});
  assert.deepEqual(result, {title: 'Custom provider operation', icon: 'tool', summary: '/remote/a.js', path: '/remote/a.js', pathLabel: '/remote/a.js'});
  assert.equal(header({title: '/remote/a.js', locations: [{path: '/remote/a.js'}]}).summary, '');
});

test('subagent identity changes only the icon, never inventing a tool kind', () => {
  const result = header({title: 'Delegate review'}, {subagent: true});
  assert.deepEqual(result, {title: 'Delegate review', icon: 'agent', summary: ''});
  const read = {kind: 'read', locations: [{path: 'a.js'}]};
  assert.deepEqual(header(read, {subagent: true}), {...header(read), icon: 'agent'});
});

test('projection never mutates source model, original custom title, status or detail bodies', () => {
  const tool = {kind: 'read', title: 'Compare configuration before deployment', status: 'failed',
    locations: [{path: '/remote/config.js'}], output: 'Permission denied',
    diffs: [{type: 'diff', path: '/remote/config.js', oldText: 'a', newText: 'b'}],
  };
  const model = toolFlowModel(tool);
  const before = structuredClone(model);
  const bodies = toolBodyParts(model);
  toolHeaderPresentation(model);
  assert.deepEqual(model, before);
  assert.equal(model.title, tool.title);
  assert.equal(model.failed, true);
  assert.equal(model.error, 'Permission denied');
  assert.deepEqual(toolBodyParts(model), bodies);
  assert.equal(toolFlowModel({kind: 'execute', rawInput: {command: 'pwd'}}).title, 'pwd');
});

test('long paths and exact search whitespace are not truncated or normalized', () => {
  const path = `/remote/${'a'.repeat(120)}/file.js`;
  assert.equal(header({kind: 'read', locations: [{path}]}).summary, path);
  assert.equal(header({kind: 'search', rawInput: {pattern: '  literal spaces  '}}).summary, '  literal spaces  ');
});
