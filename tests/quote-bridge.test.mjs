import test from 'node:test';
import assert from 'node:assert/strict';
import {insertQuoteIntoDraft,installQuoteBridge,quoteMarkdown} from '../src/client/quote-bridge.js';

test('quote text becomes ordinary Markdown blockquote lines', () => {
  assert.equal(quoteMarkdown('one\r\ntwo  \n'), '> one\n> two');
  assert.equal(quoteMarkdown('  leading\n\nlast'), '>   leading\n> \n> last');
  assert.equal(quoteMarkdown(' \n\t'), null);
});

test('quote inserts at the caret or replaces the selected span', () => {
  assert.deepEqual(insertQuoteIntoDraft('hello world','quoted',6,6), {draft:'hello \n> quoted\n\nworld',caret:17});
  assert.deepEqual(insertQuoteIntoDraft('hello world','quoted',0,5), {draft:'> quoted\n\n world',caret:10});
  assert.deepEqual(insertQuoteIntoDraft('', 'quoted', 0, 0), {draft:'> quoted\n\n',caret:10});
  assert.equal(insertQuoteIntoDraft('draft','   ',0,0), null);
  assert.equal(insertQuoteIntoDraft('draft',null,0,0), null);
});

test('bridge replaces insertQuote until disposed and preserves other calls', () => {
  const calls=[];
  const inputActions={insertQuote(text){calls.push(['native',text]);return false;}};
  const dispose=installQuoteBridge(inputActions,text=>{calls.push(['remote',text]);return true;});
  assert.equal(inputActions.insertQuote('x'),true);
  assert.deepEqual(calls,[['remote','x']]);
  dispose();
  assert.equal(inputActions.insertQuote('y'),false);
  assert.deepEqual(calls,[['remote','x'],['native','y']]);
});

test('bridge falls back for empty text and cannot break an immutable action face', () => {
  const calls=[];
  const inputActions={insertQuote(text){calls.push(text);return false;}};
  const dispose=installQuoteBridge(inputActions,()=>undefined);
  assert.equal(inputActions.insertQuote('fallback'),false);
  assert.deepEqual(calls,['fallback']);
  dispose();
  const frozen=Object.freeze({insertQuote(){return true;}});
  assert.doesNotThrow(()=>installQuoteBridge(frozen,()=>true)());
  assert.equal(frozen.insertQuote('x'),true);
});
