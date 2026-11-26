import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileType, filePreviewKind} from '../src/client/file-type-model.js';
import {languageForFile, tokenize, highlightLines, HIGHLIGHT_LIMIT} from '../src/client/syntax-highlight.js';

const types = (...tokens) => tokens.map(token => token.type);

test('file glyphs recognize languages, config formats and images without remote assets', () => {
  assert.equal(fileType('.claude.json').label, '{}');
  assert.equal(fileType('README').kind, 'markdown');
  assert.equal(fileType('set_proxy.sh').label, '>_');
  assert.equal(fileType('thinking-high.sh').kind, 'shell');
  assert.equal(fileType('veadk-java/pom.xml').kind, 'xml');
  assert.equal(fileType('Main.java').kind, 'java');
  assert.equal(fileType('main.py').kind, 'python');
  assert.equal(fileType('component.tsx').kind, 'tsx');
  assert.equal(fileType('deploy.yaml').kind, 'yaml');
  assert.equal(fileType('Dockerfile').kind, 'docker');
  assert.equal(fileType('Makefile').kind, 'make');
  assert.equal(fileType('.gitignore').kind, 'git');
  assert.equal(fileType('.bashrc').kind, 'shell');
  assert.equal(fileType('settings.ini').kind, 'ini');
  assert.equal(fileType('photo.avif').kind, 'image');
  assert.equal(fileType('unknown.bin').kind, 'file');
  assert.equal(fileType('folder', {directory: true}).kind, 'directory');
  assert.equal(filePreviewKind('README.md'), 'markdown');
  assert.equal(filePreviewKind('package.json'), 'json');
  assert.equal(filePreviewKind('photo.webp'), 'image');
  assert.equal(filePreviewKind('archive.zip'), 'binary');
  assert.equal(filePreviewKind('notes.txt'), 'text');
});

test('language selection covers code and config while unknown text stays plain', () => {
  assert.equal(languageForFile('a.ts'), 'typescript');
  assert.equal(languageForFile('a.py'), 'python');
  assert.equal(languageForFile('a.go'), 'go');
  assert.equal(languageForFile('a.rs'), 'rust');
  assert.equal(languageForFile('a.yml'), 'yaml');
  assert.equal(languageForFile('a.toml'), 'toml');
  assert.equal(languageForFile('a.ini'), 'ini');
  assert.equal(languageForFile('.env.local'), 'ini');
  assert.equal(languageForFile('a.html'), 'html');
  assert.equal(languageForFile('a.css'), 'css');
  assert.equal(languageForFile('a.sql'), 'sql');
  assert.equal(languageForFile('Dockerfile'), 'docker');
  assert.equal(languageForFile('notes.txt'), 'plain');
});

test('tokenizer marks code, comments, config keys and markup without executing content', () => {
  const js = tokenize('const msg = "hello"; // note\nreturn 42;', 'javascript');
  assert.ok(types(...js).includes('keyword')); assert.ok(types(...js).includes('string'));
  assert.ok(types(...js).includes('comment')); assert.ok(types(...js).includes('number'));
  const json = tokenize('{"name": "dsh", "count": 2, "ok": true}', 'json');
  assert.equal(json.find(token => token.type === 'key').text, '"name"');
  assert.ok(types(...json).includes('literal'));
  const yaml = tokenize('name: dsh\nlist:\n  - "one" # note', 'yaml');
  assert.equal(yaml.find(token => token.type === 'key').text, 'name');
  assert.ok(types(...yaml).includes('comment'));
  const xml = tokenize('<file name="a.txt">text</file>', 'xml');
  assert.ok(types(...xml).includes('tag')); assert.ok(types(...xml).includes('attr'));
  assert.ok(types(...xml).includes('string'));
  const python = tokenize('def main():\n    return "🙂"  # safe', 'python');
  assert.ok(types(...python).includes('keyword')); assert.ok(python.some(token => token.text.includes('🙂')));
  const shell = tokenize('if [ -n $HOME ]; then echo ok; fi', 'shell');
  assert.ok(types(...shell).includes('variable'));
});

test('line splitting preserves empty lines and large input falls back to plain rows', () => {
  const lines = highlightLines('a\n\nb', 'javascript');
  assert.equal(lines.length, 3); assert.equal(lines[1].tokens.length, 0);
  const huge = highlightLines('x'.repeat(HIGHLIGHT_LIMIT + 1), 'javascript');
  assert.ok(huge.length >= 1); assert.ok(huge[0].tokens.every(token => token.type === 'plain'));
});

test('preview wiring is local React text, type-aware and keeps an explicit source mode', () => {
  const files = readFileSync(new URL('../src/client/files.js', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../src/client/syntax-preview.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/client/ui.js', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../lib/files.js', import.meta.url), 'utf8');
  assert.match(files, /h\(SyntaxPreview,\{text:content,language,label:preview\.path\}\)/);
  assert.match(files, /setSourceMode\(value=>!value\)/);
  assert.match(files, /fileKind === 'image'/);
  assert.doesNotMatch(preview, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(ui, /createFileTypeIcon\(React\)/);
  for (const mime of ['avif: \'image/avif\'', 'bmp: \'image/bmp\'', 'ico: \'image/x-icon\'']) assert.ok(host.includes(mime));
});
