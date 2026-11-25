import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as pure from '../src/client/ui-pure.js';
const plain=value=>value;
const source=readFileSync(new URL('../src/client/ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/client/ui.css',import.meta.url),'utf8');

test('one bundle factory owns UI and only imports Host React',()=>{
 const bundle=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
 assert.equal((bundle.match(/window\.__ModuleLoader__\.load\(/g)||[]).length,1);
 const imports=[...bundle.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g)].map(match=>match[1]);
 assert.ok(imports.includes('react'));assert.ok(imports.every(name=>name==='react'));
 assert.doesNotMatch(source,/dangerouslySetInnerHTML|\.innerHTML\b|document\.body|ReactDOM|https?:\/\/cdn/);
 assert.match(source,/dialog\.showModal\(\)/);assert.match(source,/panel\.showPopover\(\)/);
 assert.match(source,/props\.autoFocus !== false/);
 const variables=[...css.matchAll(/var\((--[\w-]+)/g)].map(match=>match[1]);
 const typography = new Set(['--ds-font-family-code', '--dsh-font-family-code', '--dsh-font-family-code-default', '--dsh-content-font-size', '--dsh-content-font-size-secondary', '--dsh-content-font-delta', '--dsh-code-font-size', '--dsh-code-font-delta']);
 assert.ok(variables.length>30);assert.ok(variables.every(name=>name.startsWith('--dsw-alias-')||typography.has(name)));
});
test('owned UI exports every control used by the live modules',()=>{
 const directory=new URL('../src/client/',import.meta.url);
 const used=new Set(readdirSync(directory).filter(name=>name.endsWith('.js')&&name!=='ui.js').flatMap(name=>[...readFileSync(new URL(name,directory),'utf8').matchAll(/ui\.([A-Z]\w*)/g)].map(match=>match[1])));
 const exported=source.slice(source.indexOf('Object.assign(exports,'));
 for(const name of used)assert.match(exported,new RegExp(`\\b${name}:`),name);
});

test('URL allowlist rejects executable and ambiguous schemes', () => {
  for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<svg>', 'vbscript:x', '//evil.example', '\\evil.example', 'java\nscript:x', 'foo:bar', 'https://x.test/\u0000']) {
    assert.equal(pure.safeHref(value), null, value);
  }
  for (const value of ['https://example.com/a?q=x#L2', 'http://localhost:8080/x', 'mailto:a@example.com', '/remote-ssh/file', '../a.txt', './src/main.js#L1', '#heading']) {
    assert.equal(pure.safeHref(value), value);
  }
  assert.equal(pure.safeHref(''), null);
});

test('inline Markdown is text-safe and supports short emphasis, code, links', () => {
  assert.deepEqual(plain(pure.inlineTokens('**a** *b* ~~c~~ `x < y`')), [
    { type: 'strong', children: [{ type: 'text', text: 'a' }] }, { type: 'text', text: ' ' },
    { type: 'em', children: [{ type: 'text', text: 'b' }] }, { type: 'text', text: ' ' },
    { type: 'del', children: [{ type: 'text', text: 'c' }] }, { type: 'text', text: ' ' },
    { type: 'code', text: 'x < y' }
  ]);
  assert.deepEqual(plain(pure.inlineTokens('<script>alert(1)</script>')), [{ type: 'text', text: '<script>alert(1)</script>' }]);
  assert.equal(pure.inlineTokens('[bad](javascript:alert(1))').some(t => t.type === 'link'), false);
  const link = pure.inlineTokens('[Docs](<https://example.com/a> "Read docs")')[0];
  assert.equal(link.type, 'link'); assert.equal(link.href, 'https://example.com/a'); assert.equal(link.title, 'Read docs');
  const file = pure.inlineTokens('[source](src/main.js#L20)')[0];
  assert.equal(file.href, 'src/main.js#L20');
  const image = pure.inlineTokens('![alt](https://example.com/a.png)')[0];
  assert.equal(image.type, 'link'); assert.equal(image.image, true);
  assert.deepEqual(plain(pure.inlineTokens('\\*literal\\* snake_case')), [{ type: 'text', text: '*literal* snake_case' }]);
});

test('Markdown blocks preserve fences, nested lists, ordered start and quotes', () => {
  const blocks = pure.parseMarkdown('# Title\n\nparagraph\nline 2\n\n```js\n<script>\n```\n\n- first\n  - nested\n- [x] done\n\n3. third\n4. fourth\n\n> quoted\n> next\n\n---');
  assert.deepEqual(plain(blocks.map(b => b.type)), ['heading', 'paragraph', 'code', 'list', 'list', 'quote', 'hr']);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].text, 'paragraph\nline 2');
  assert.deepEqual(plain(blocks[2]), { type: 'code', text: '<script>', language: 'js' });
  assert.equal(blocks[3].items[0].children[1].type, 'list');
  assert.equal(blocks[3].items[1].checked, true);
  assert.equal(blocks[4].ordered, true); assert.equal(blocks[4].start, 3);
  assert.equal(blocks[5].children[0].text, 'quoted\nnext');
  assert.equal(pure.parseMarkdown('~~~\nunclosed')[0].text, 'unclosed');
  assert.equal(pure.parseMarkdown('````txt\n```\n````')[0].text, '```');
});

test('tables handle escaped pipes and preserve inline code', () => {
  assert.deepEqual(plain(pure.tableCells('| name | a\\|b | `c|d` |')), ['name', 'a|b', '`c|d`']);
  assert.deepEqual(plain(pure.tableDivider('| :--- | :---: | ---: |')), ['left', 'center', 'right']);
  assert.equal(pure.tableDivider('| a | b |'), null);
  const table = pure.parseMarkdown('| Name | Value |\n| --- | ---: |\n| a | **2** |')[0];
  assert.equal(table.type, 'table'); assert.deepEqual(plain(table.rows), [['a', '**2**']]);
});

test('diff preserves complete before and after content with accurate line numbers', () => {
  const rows = plain(pure.diffLines('same\nold\nend', 'same\nnew\nend'));
  assert.deepEqual(rows, [
    { kind: 'context', text: 'same', oldNumber: 1, number: 1 },
    { kind: 'remove', text: 'old', oldNumber: 2, number: null },
    { kind: 'add', text: 'new', oldNumber: null, number: 2 },
    { kind: 'context', text: 'end', oldNumber: 3, number: 3 }
  ]);
  assert.ok(pure.diffLines(null, 'new').every(row => row.kind === 'add'));
  assert.ok(pure.diffLines('old', '').every(row => row.kind === 'remove'));
  assert.deepEqual(plain(pure.diffLines('', '')), []);
  for (const [before, after] of [['a\nb\na\nc', 'a\nx\na\ny'], ['a\n', 'b\n'], ['a', 'a']]) {
    const result = pure.diffLines(before, after);
    assert.equal(result.filter(r => r.kind !== 'add').map(r => r.text).join('\n'), before);
    assert.equal(result.filter(r => r.kind !== 'remove').map(r => r.text).join('\n'), after);
  }
});

test('terminal strips ANSI/OSC control sequences without interpreting HTML', () => {
  assert.equal(pure.stripTerminal('\x1b[31mred\x1b[0m\r\nnext\tcol'), 'red\nnext\tcol');
  assert.equal(pure.stripTerminal('\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\'), 'link');
  assert.equal(pure.stripTerminal('ok\x1b]0;unterminated'), 'ok');
  assert.equal(pure.stripTerminal('<img onerror=alert(1)>\x07'), '<img onerror=alert(1)>');
  assert.equal(pure.stripTerminal('first\roverwrite'), 'first\noverwrite');
});

test('menu geometry clamps horizontally and flips above when space is limited', () => {
  assert.deepEqual(plain(pure.menuPosition({ left: 200, right: 250, top: 100, bottom: 125 }, { width: 160, height: 120 }, { width: 300, height: 300 }, 'end')), { left: 90, top: 129 });
  assert.deepEqual(plain(pure.menuPosition({ left: 280, right: 300, top: 260, bottom: 280 }, { width: 160, height: 120 }, { width: 300, height: 300 }, 'start')), { left: 132, top: 136 });
  assert.deepEqual(plain(pure.menuPosition({ left: -100, right: 20, top: -100, bottom: -20 }, { width: 160, height: 120 }, { width: 300, height: 300 }, 'start')), { left: 8, top: 8 });
  for (const value of [0, -1, undefined, NaN, Infinity]) assert.equal(pure.limitLines(value), 20);
  assert.equal(pure.limitLines(8.5), 8);
});

test('large plain Markdown and diffs remain bounded without recursion overflow', () => {
  const big = 'safe text with <html> & symbols '.repeat(3000);
  assert.equal(pure.inlineTokens(big)[0].text, big);
  assert.equal(pure.parseMarkdown('> '.repeat(30) + 'deep').length, 1);
  const malformed = '[x]('.repeat(10000);
  assert.equal(pure.inlineTokens(malformed).map(token => token.text).join(''), malformed);
  assert.equal(pure.diffLines('x\n'.repeat(10000), 'y\n'.repeat(10000)).length, 20001);
});
