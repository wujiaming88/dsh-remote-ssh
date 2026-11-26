import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { transform } from 'esbuild';
import { markdownImageAlt, outputImageSource } from '../src/client/output-image-model.js';
import { inlineTokens } from '../src/client/ui-pure.js';
import { createNativeTextControls } from '../src/client/native-text-controls.js';

const source = readFileSync(new URL('../src/client/output-image.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/client/output-image.css', import.meta.url), 'utf8');
parse(source, { ecmaVersion: 'latest', sourceType: 'module' });

const request = {
  id: 'acp:1',
  dshSessionId: 'session-1',
  turnId: 'turn-1',
  generation: 'generation-a',
  fromSeq: 3,
  throughSeq: 9,
  sourceSessionId: 'source-session',
};

test('markdownImageAlt flattens nested inline tokens and falls back to empty text', () => {
  assert.equal(markdownImageAlt({ children: [{ type: 'text', text: '授权二维码' }] }), '授权二维码');
  assert.equal(markdownImageAlt({ children: [
    { type: 'text', text: 'a' },
    { type: 'em', children: [{ type: 'text', text: 'b' }] },
    { type: 'strong', children: [{ type: 'code', text: 'c' }, { type: 'text', text: 'd' }] },
  ] }), 'abcd');
  assert.equal(markdownImageAlt({ children: [] }), '');
  assert.equal(markdownImageAlt({}), '');
  assert.equal(markdownImageAlt(null), '');
  assert.equal(markdownImageAlt(undefined), '');
});

test('markdownImageAlt agrees with the safe parser for a real image token', () => {
  const [token] = inlineTokens('![授权二维码](/tmp/lark-auth-qr.png)');
  assert.equal(token.image, true);
  assert.equal(token.href, '/tmp/lark-auth-qr.png');
  assert.equal(markdownImageAlt(token), '授权二维码');
});

test('outputImageSource classifies plain http(s) as remote without rewriting the href', () => {
  assert.deepEqual(outputImageSource(request, 'https://example.com/a.png'), { kind: 'remote', src: 'https://example.com/a.png' });
  assert.deepEqual(outputImageSource(request, 'http://example.com/a.png'), { kind: 'remote', src: 'http://example.com/a.png' });
  const signed = 'https://example.com/a.png?token=abc&sig=d%2Fe%3D#frag';
  assert.deepEqual(outputImageSource(request, signed), { kind: 'remote', src: signed });
  // request is irrelevant for remote classification.
  assert.deepEqual(outputImageSource(null, 'https://example.com/a.png'), { kind: 'remote', src: 'https://example.com/a.png' });
});

test('outputImageSource refuses every non-http(s) scheme and protocol-relative URL', () => {
  for (const href of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'blob:https://example.com/uuid',
    'mailto:a@b.example',
    '//example.com/a.png',
    '',
    '   ',
  ]) {
    assert.equal(outputImageSource(request, href), null, href);
  }
  // A malformed http(s) value that safeHref rejects is also refused.
  assert.equal(outputImageSource(request, 'https://example.com/a b.png'), null);
});

test('outputImageSource builds a scoped local URL with verbatim query fields', () => {
  const result = outputImageSource(request, '/tmp/lark-auth-qr.png');
  assert.equal(result.kind, 'local');
  const url = new URL(result.src, 'http://localhost');
  assert.equal(url.origin, 'http://localhost');
  assert.equal(url.pathname, '/remote-ssh/v3/output-image');
  assert.equal(url.searchParams.get('id'), 'acp:1');
  assert.equal(url.searchParams.get('dshSessionId'), 'session-1');
  assert.equal(url.searchParams.get('turnId'), 'turn-1');
  assert.equal(url.searchParams.get('generation'), 'generation-a');
  assert.equal(url.searchParams.get('fromSeq'), '3');
  assert.equal(url.searchParams.get('throughSeq'), '9');
  assert.equal(url.searchParams.get('sourceSessionId'), 'source-session');
  assert.equal(url.searchParams.get('href'), '/tmp/lark-auth-qr.png');
});

test('local source keeps href and every request field intact through URL encoding', () => {
  const tricky = {
    ...request,
    id: '../?id=other&x=1',
    dshSessionId: 's&1',
    turnId: 'turn=1&a',
    generation: 'g/x?',
    sourceSessionId: 'src source',
  };
  const href = '/tmp/lark auth/qr?.png#frag';
  const url = new URL(outputImageSource(tricky, href).src, 'http://localhost');
  assert.equal(url.searchParams.get('id'), tricky.id);
  assert.equal(url.searchParams.get('dshSessionId'), tricky.dshSessionId);
  assert.equal(url.searchParams.get('turnId'), tricky.turnId);
  assert.equal(url.searchParams.get('generation'), tricky.generation);
  assert.equal(url.searchParams.get('sourceSessionId'), tricky.sourceSessionId);
  assert.equal(url.searchParams.get('href'), href);
});

test('local source requires a usable session request and accepts relative paths', () => {
  assert.equal(outputImageSource(null, '/tmp/a.png'), null);
  assert.equal(outputImageSource({}, '/tmp/a.png'), null);
  assert.equal(outputImageSource({ id: 'acp:1' }, '/tmp/a.png'), null);
  assert.equal(outputImageSource({ dshSessionId: 's1' }, '/tmp/a.png'), null);
  assert.equal(outputImageSource({ id: 'acp:1', dshSessionId: 's1' }, './a.png').kind, 'local');
  assert.equal(outputImageSource({ id: 'acp:1', dshSessionId: 's1' }, '../a.png').kind, 'local');
});

test('MarkdownText sends the actual image token to the scoped renderer instead of creating a link', () => {
  const React={
    Fragment:'fragment',
    useMemo:factory=>factory(),
    createElement:(type,props,...children)=>({type,props:{...(props||{}),children}}),
  };
  const {MarkdownText}=createNativeTextControls(React,{Button:'button',Icon:'icon',CopyButton:'copy'});
  let rendered;
  const tree=MarkdownText({text:'![授权二维码](/tmp/lark-auth-qr.png)',labels:{},renderImage:(token,index)=>{
    rendered={token,index};return {type:'output-image',props:{href:token.href}};
  }});
  assert.equal(rendered.token.image,true);assert.equal(rendered.token.href,'/tmp/lark-auth-qr.png');assert.equal(rendered.index,0);
  assert.equal(JSON.stringify(tree).includes('"type":"a"'),false);
  assert.equal(JSON.stringify(tree).includes('output-image'),true);
});

test('transcript and Host wiring carry the current message proof to the scoped output-image route', () => {
  const transcript=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  const host=readFileSync(new URL('../lib/index.js',import.meta.url),'utf8');
  assert.match(transcript,/fromSeq:item\.seq,throughSeq:item\.lastSeq\|\|item\.seq/);
  assert.match(transcript,/sourceSessionId:item\.sessionId/);
  assert.match(transcript,/renderImage:\(token,index\)=>h\(OutputImage/);
  assert.match(host,/createOutputImages\(\{ record, runtime, configuration, ssh \}\)/);
  assert.match(host,/HTTP_BASE \+ '\/output-image'/);
  assert.match(host,/outputImageHandler\(\{ authorize, images: host\.outputImages \}\)/);
});

test('OutputImage renders only button/img/modal, never an anchor or custom Escape handler', () => {
  assert.match(source, /ui\.Modal/);
  assert.match(source, /outputImageSource\(request, href\)/);
  assert.match(source, /\[href, request\?\.id, request\?\.generation\]/);
  assert.doesNotMatch(source, /\[request, href\]/);
  assert.match(source, /src: source\.src/);
  assert.match(source, /onError/);
  assert.match(source, /retryThumb/);
  assert.match(source, /retryPreview/);
  assert.match(source, /acp\.imagePreviewUnavailable/);
  assert.match(source, /acp\.imagePreviewLoading/);
  assert.match(source, /previewState !== 'ready'/);
  assert.match(source, /setZoom/);
  assert.match(source, /acp\.zoomIn/);
  assert.match(source, /acp\.zoomOut/);
  assert.match(source, /acp\.resetZoom/);
  assert.doesNotMatch(source, /<a\b/);
  assert.doesNotMatch(source, /h\(['"]a['"]/);
  assert.doesNotMatch(source, /onKeyDown|key\s*===?\s*['"]Escape|addEventListener\(['"]keydown/);
  assert.doesNotMatch(source, /window\.|document\.|dangerouslySetInnerHTML|innerHTML/);
});

test('output image stylesheet is valid, prefixed and uses only copied native tokens', async () => {
  assert.match(css, /\.rssh-output-image-thumb/);
  assert.match(css, /\.rssh-output-image-modal/);
  assert.match(css, /\.rssh-output-image-stage/);
  assert.match(css, /\.rssh-output-image-toolbar/);
  assert.match(css, /\.rssh-output-image-unavailable/);
  assert.doesNotMatch(css, /\._\w|#[0-9a-f]{3,8}\b|rgba?\(/i);
  for (const token of css.matchAll(/var\((--[\w-]+)/g)) {
    assert.match(token[1], /^(?:--dsw-|--ds-)/);
  }
  assert.equal((await transform(css, { loader: 'css' })).warnings.length, 0);
});
