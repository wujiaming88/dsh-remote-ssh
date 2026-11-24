import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inlineTokens,parseMarkdown} from '../src/client/ui-pure.js';
const links=tokens=>tokens.flatMap(token=>[...(token.type==='link'?[token]:[]),...links(token.children||[])]);
const text=tokens=>tokens.map(token=>token.text??text(token.children||[])).join('');

test('bare authorization-shaped URL preserves the complete literal query and visible label',()=>{
  const url='https://accounts.example.test/oauth/device/verify?flow_id=sample_A-b123&user_code=DEMO-1234&redirect=%2Fdocs%3Fa%3D1&scope=a*b~c+d#continue';
  const source='请打开以下链接：\n\n'+url,tokens=inlineTokens(source);
  assert.equal(links(tokens).length,1);assert.equal(links(tokens)[0].href,url);
  assert.equal(text(links(tokens)[0].children),url);assert.equal(text(tokens),source);
});
test('multiple HTTP and HTTPS links preserve case, Unicode, ports and IPv6',()=>{
  const urls=['HTTP://localhost:8080/a','https://例子.测试/路径?q=中文','https://[::1]:8443/a?b=2'];
  const source=urls.join(' 和 '),tokens=inlineTokens(source);
  assert.deepEqual(links(tokens).map(link=>link.href),urls);assert.equal(text(tokens),source);
});
test('Chinese and English prose punctuation stays outside the clickable destination',()=>{
  for(const [prefix,suffix] of [['（','）。'],['“','”，'],['','!?'],['[','];'],['','。下一句'],['URL:','...']]){
    const url='https://example.test/path?q=a_b-c',source=prefix+url+suffix,tokens=inlineTokens(source);
    assert.deepEqual(links(tokens).map(link=>link.href),[url],source);assert.equal(text(tokens),source);
  }
});
test('balanced URL brackets and encoded punctuation are preserved',()=>{
  const url='https://example.test/a_(b)/[c]/{d}?q=%29%2E&next=a(b)';
  const source='('+url+').',tokens=inlineTokens(source);
  assert.equal(links(tokens)[0].href,url);assert.equal(text(tokens),source);
});
test('angle autolinks preserve explicitly delimited terminal punctuation',()=>{
  const url='https://example.test/path?q=value;';
  assert.deepEqual(links(inlineTokens('<'+url+'>')).map(link=>link.href),[url]);
  assert.equal(text(inlineTokens('<'+url+'>')),url);
});
test('inline code and long multiple-backtick code spans do not become links',()=>{
  for(const marker of ['`','``','```']){
    const content='prefix '+ 'x'.repeat(5000)+' https://example.test/a?q=x'+(marker.length>1?' `literal` ':'');
    const tokens=inlineTokens(marker+content+marker+' https://outside.test');
    assert.equal(tokens[0].type,'code');assert.equal(tokens[0].text,content);
    assert.deepEqual(links(tokens).map(link=>link.href),['https://outside.test']);
  }
});
test('fenced code remains a code block rather than inline link content',()=>{
  const url='https://example.test/a?q=1&x=2';
  const blocks=parseMarkdown('```text\n'+url+'\n```\n\n'+url);
  assert.deepEqual(blocks[0],{type:'code',text:url,language:'text'});
  assert.equal(links(inlineTokens(blocks[1].text))[0].href,url);
});
test('existing Markdown anchors do not acquire nested links, including formatted labels',()=>{
  for(const label of ['https://label.test','**https://label.test**','*https://label.test*','~~https://label.test~~']){
    const tokens=inlineTokens('['+label+'](https://destination.test "title")');
    assert.equal(links(tokens).length,1);assert.equal(tokens[0].href,'https://destination.test');
    assert.equal(tokens[0].title,'title');assert.equal(text(tokens[0].children),'https://label.test');
  }
});
test('bare links in emphasis retain their formatting without parsing URL underscores',()=>{
  const url='https://example.test/a_b?q=one_two';
  for(const marker of ['**','*','~~']){
    const tokens=inlineTokens(marker+url+marker);
    assert.equal(links(tokens)[0].href,url);assert.equal(text(tokens),url);
  }
});
test('unsupported schemes and embedded URL-like identifiers stay literal',()=>{
  for(const source of ['javascript:alert(1)','data:text/html,<svg>','file:///tmp/x','ftp://example.test/a','//example.test','www.example.test','xhttps://example.test','name@https://example.test','ftp://example.test/https://nested.test']){
    const tokens=inlineTokens(source);assert.equal(links(tokens).length,0,source);assert.equal(text(tokens),source);
  }
});
test('malformed hosts and unsafe hidden/control characters do not create partial links',()=>{
  for(const source of ['http://','https:///example.test','https://?q=1','http://[bad]/x','https://example.test:bad/x','https://example.test/\u0000hidden','https://example.test/\u202ehidden','https://example.test/\\hidden']){
    const tokens=inlineTokens(source);assert.equal(links(tokens).length,0,source);assert.equal(text(tokens),source);
  }
});
test('URL length beyond the old inline lookahead is not truncated; oversized candidates stay literal',()=>{
  const url='https://example.test/?token='+ 'a'.repeat(6000)+'&code=sample';
  assert.equal(links(inlineTokens(url))[0].href,url);
  const oversized=url+'b'.repeat(20000);const tokens=inlineTokens(oversized);
  assert.equal(links(tokens).length,0);assert.equal(text(tokens),oversized);
});
test('stream updates produce the complete current URL and do not join actual line breaks',()=>{
  const first='https://example.test/?a=1',next=first+'&b=2';
  assert.equal(links(inlineTokens(first))[0].href,first);assert.equal(links(inlineTokens(next))[0].href,next);
  assert.equal(text(inlineTokens(first+'\n&b=2')),first+'\n&b=2');
  assert.equal(links(inlineTokens(first+'\n&b=2'))[0].href,first);
});
test('adversarial rejected URLs and oversized code preserve source without recursion growth',()=>{
  for(const source of ['http://'.repeat(10000),'`'+'x'.repeat(100000)+' https://example.test`']){
    const tokens=inlineTokens(source);assert.equal(links(tokens).length,0);assert.equal(text(tokens),source);
  }
});
test('existing renderer keeps native anchors, external isolation and wrapping instead of click handlers',()=>{
  const source=readFileSync(new URL('../src/client/ui.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/client/ui.css',import.meta.url),'utf8');
  assert.match(source,/token.type === 'link'[^\n]*h\('a'/);
  assert.match(source,/target:[^\n]*'_blank'/);assert.match(source,/rel:[^\n]*'noopener noreferrer'/);
  assert.doesNotMatch(source,/dangerouslySetInnerHTML|\.innerHTML\b/);
  assert.match(css,/\.rsui-markdown\s*\{[^}]*overflow-wrap: anywhere/);
  assert.match(css,/\.rsui-markdown a\s*\{[^}]*text-decoration: underline/);
});
