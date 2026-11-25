import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import {textControlLabel, textControlWindow, textControlStatus, readControlRows, terminalControlState} from '../src/client/native-text-controls.js';
import {diffLines, parseMarkdown, inlineTokens} from '../src/client/ui-pure.js';

const source = await readFile(new URL('../src/client/native-text-controls.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/client/native-text-controls.css', import.meta.url), 'utf8');
const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

test('native text factory imports only safe transforms, with explicit adaptation provenance', () => {
  assert.deepEqual(ast.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value), ['./ui-pure.js']);
  let members;
  walk(ast, node => {
    if (node.type === 'ReturnStatement' && node.argument?.type === 'ObjectExpression' &&
      node.argument.properties.some(property => property.key?.name === 'TextBlock')) {
      members = node.argument.properties.map(property => property.key.name);
    }
  });
  assert.deepEqual(members, ['TextBlock', 'ReadBlock', 'DiffBlock', 'TerminalBlock', 'MarkdownText']);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|document\.|querySelector|ReactDOM|require\(/);
  for (const symbol of ['ZB 19364', 'Rp 19378', 'GB 19418', 'rW 19487', 'Zb', 'Bp 20427']) assert.ok(source.includes(symbol));
});

test('head/tail preview is complete on expansion and never duplicates rows', () => {
  for (let length = 0; length < 70; length++) {
    for (let limit = 1; limit < 25; limit++) {
      const rows = Array.from({length}, (_, number) => ({number}));
      const collapsed = textControlWindow(rows, limit, false), expanded = textControlWindow(rows, limit, true);
      assert.equal(collapsed.hidden, Math.max(0, length - limit));
      assert.equal(collapsed.head.length + collapsed.tail.length, Math.min(length, limit));
      assert.equal(new Set([...collapsed.head, ...collapsed.tail]).size, Math.min(length, limit));
      assert.deepEqual(expanded.head, rows);
      assert.deepEqual(expanded.tail, []);
      assert.equal(expanded.hidden, collapsed.hidden);
      if (collapsed.tail.length) assert.equal(collapsed.tail.at(-1), rows.at(-1));
    }
  }
  assert.equal(textControlWindow(Array(25).fill('x'), NaN, false).hidden, 5);
});

test('window status counts visible head plus tail, then all rows after expansion', () => {
  const rows = Array.from({length: 100}, (_, number) => ({number}));
  const collapsed = textControlWindow(rows, 20, false), expanded = textControlWindow(rows, 20, true);
  const labels = {window: (shown, total) => `${shown} shown of ${total}`};
  assert.equal(textControlStatus(collapsed, 100, labels), '20 shown of 100');
  assert.equal(textControlStatus(expanded, 100, labels), '100 shown of 100');
  assert.equal(textControlStatus(collapsed, 500), '20 / 500');
  assert.equal(textControlStatus(expanded, 500), '100 / 500');
  assert.equal(textControlStatus(collapsed, 100, labels, '+1 / −1'), '+1 / −1');
  assert.equal(textControlStatus(collapsed, undefined), undefined);
  assert.equal(textControlStatus(textControlWindow([], 20, false), 0), '0 / 0');
  assert.match(source, /textControlStatus\(window, props\.totalLines, labels, props\.status\)/);
});

test('read rows retain explicit line numbers, whitespace, blanks and safe text coercion', () => {
  assert.deepEqual(readControlRows({lines: [{number: 40, text: '  x'}, {number: 41, text: ''}, 'last']}),
    [{number: 40, text: '  x'}, {number: 41, text: ''}, {number: 3, text: 'last'}]);
  assert.deepEqual(readControlRows({text: 'a\r\n\r\nb\n'}),
    [{number: 1, text: 'a'}, {number: 2, text: ''}, {number: 3, text: 'b'}, {number: 4, text: ''}]);
  assert.deepEqual(readControlRows({text: ''}), []);
  assert.match(source, /copyText: props\.copyText == null[\s\S]*\? props\.text : props\.copyText/);
});

test('terminal never infers successful exit from missing state or output text', () => {
  const labels = {noExitCode: 'Unknown exit', exitCode: value => `Exit ${value}`, running: 'Running', signal: value => `Signal ${value}`};
  assert.deepEqual(terminalControlState({output: '\u001b[31mexit code 0\u001b[0m', command: '\u001b[1mls\u001b[0m', labels}),
    {output: 'exit code 0', command: 'ls', status: 'Unknown exit', failed: false});
  assert.equal(terminalControlState({exitCode: null, labels}).status, 'Unknown exit');
  assert.equal(terminalControlState({exitCode: 0, labels}).status, 'Exit 0');
  assert.equal(terminalControlState({exitCode: 7, labels}).failed, true);
  assert.equal(terminalControlState({signal: 'SIGTERM', labels}).status, 'Signal SIGTERM');
  assert.equal(terminalControlState({running: true, exitCode: 7, labels}).status, 'Running');
  assert.equal(terminalControlState({running: true, exitCode: 7, labels}).failed, false);
});

test('native diff view preserves full old/new alignment and copies complete new text', () => {
  const rows = diffLines('same\nold\nlast', 'same\nnew\nlast');
  assert.deepEqual(rows.map(row => row.kind), ['context', 'remove', 'add', 'context']);
  assert.equal(rows[1].oldNumber, 2);
  assert.equal(rows[2].number, 2);
  assert.match(source, /diffLines\(diff\.oldText, diff\.newText\)/);
  assert.match(source, /copyText: text\(diff\.newText\)/);
  assert.match(source, /row\.oldNumber \?\? ''/);
  assert.match(source, /row\.number \?\? ''/);
});

test('Markdown remains driven by the safe parser with native element layout', () => {
  const blocks = parseMarkdown('# title\n\n<script>bad()</script>\n\n```js\nconst a = 1;\n```');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks.find(block => block.type === 'code').text, 'const a = 1;');
  assert.equal(inlineTokens('[x](javascript:alert(1))').some(token => token.type === 'link'), false);
  assert.match(source, /parseMarkdown\(props\.text\)/);
  assert.match(source, /rel: .*'noopener noreferrer'/);
  assert.match(source, /'rssh-native-markdown-table-scroll', tabIndex: 0/);
  assert.match(source, /type: 'checkbox', checked: item\.checked, disabled: true/);
});

test('localization functions, copy feedback labels and disclosure ARIA stay intact', () => {
  assert.equal(textControlLabel({expand: count => `${count} more`}, 'expand', '', 8), '8 more');
  assert.equal(textControlLabel({}, 'copy', 'Copy'), 'Copy');
  assert.equal(textControlLabel({copy: ''}, 'copy', 'Copy'), '');
  assert.match(source, /'aria-expanded': expanded, 'aria-controls': id/);
  assert.match(source, /copyFailed: codeLabels\.copyFailedLabel/);
  assert.match(source, /h\(CopyButton, \{text: copyText, labels/);
  assert.match(source, /h\(CopyButton, \{text: output, labels/);
});

test('native typography/card/terminal CSS is copied, scoped and uses no hashed selectors', () => {
  assert.doesNotMatch(css, /\._[a-zA-Z]+_[a-z0-9]+_\d+|--dsl-|#[0-9a-f]{3,8}\b|rgba?\(/i);
  for (const token of css.matchAll(/var\((--[\w-]+)/g)) {
    assert.match(token[1], /^(?:--dsw-|--rssh-native-|--ds-font-family-code$|--ds-transition-duration$|--ds-ease-in-out$|--dsh-(?:content-font-(?:size(?:-secondary)?|delta)|code-font-(?:size|delta)|font-family-code(?:-default)?)$)/);
  }
  assert.match(css, /font: var\(--dsw-font-markdown-base\)/);
  assert.match(css, /font: var\(--dsw-font-markdown-h1\)/);
  assert.match(css, /padding: 10px 18px 8px 22px/);
  assert.match(css, /padding: 6px 22px 20px/);
  assert.match(css, /--rssh-native-terminal-gutter: 30px/);
  assert.match(css, /background: var\(--dsw-alias-code-diff-added\)/);
  assert.match(css, /\.rssh-native-read-block\[data-code-wrap=true\]/);
});

test('named text and terminal blocks remain semantic sections', () => {
  const roots = [];
  walk(ast, node => {
    if (node.type !== 'CallExpression' || node.callee.name !== 'h') return;
    const props = node.arguments[1];
    if (props?.type !== 'ObjectExpression') return;
    const property = name => props.properties.find(value => (value.key?.name || value.key?.value) === name);
    if (property('data-read') || property('data-terminal')) roots.push(node);
  });
  assert.equal(roots.length, 2);
  for (const root of roots) {
    assert.equal(root.arguments[0].value, 'section');
    assert.ok(root.arguments[1].properties.some(value => value.key?.value === 'aria-label'));
  }
});

test('native baseline keeps independent Host body and code font preferences', () => {
  assert.match(css, /font: var\(--dsw-font-markdown-base\)/);
  assert.match(css, /font: var\(--dsw-font-markdown-code-block\)/);
  assert.match(css, /font-size: var\(--dsh-content-font-size, 14px\)/);
  assert.match(css, /line-height: calc\(24px \+ var\(--dsh-content-font-delta, 0px\)\)/);
  assert.match(css, /font-size: var\(--dsh-code-font-size, 11px\)/);
  assert.match(css, /line-height: calc\(19px \+ var\(--dsh-code-font-delta, 0px\)\)/);
  assert.match(css, /--rssh-native-terminal-font: var\(--dsh-code-font-size, 11px\)/);
  assert.match(css, /--dsh-font-family-code-default, monospace/);
  const capped = [...css.matchAll(/([^{}]+)\{([^{}]*max-height:[^{}]*)\}/g)].filter(match => /max-height:\s*\d+(?:px|vh|rem)/.test(match[2]));
  assert.equal(capped.length, 1);
  assert.match(capped[0][1], /rssh-native-terminal-header/);
  assert.match(css, /\.rssh-native-terminal-output\s*\{\s*max-height: none;/);
});

test('diff keeps native plus/minus markers as well as semantic colors', () => {
  assert.match(css, /\.rssh-native-diff-add:before\s*\{\s*content: "\+ "/);
  assert.match(css, /\.rssh-native-diff-del:before\s*\{\s*content: "- "/);
  assert.match(css, /\.rssh-native-diff-add\s*\{\s*color: var\(--dsw-alias-state-success-primary\)/);
  assert.match(css, /\.rssh-native-diff-del\s*\{\s*color: var\(--dsw-alias-state-error-primary\)/);
  assert.match(source, /style: diff \? \{color: 'inherit'\}/);
});
