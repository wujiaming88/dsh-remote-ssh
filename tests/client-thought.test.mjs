import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {thoughtSummary,thoughtIsStreaming} from '../src/client/thought-model.js';
import {initialState,reduceEvent} from '../src/client/events.js';

test('settled reasoning previews only its first line, without bold delimiters',()=>{
  assert.equal(thoughtSummary('**检查技能**\n\n具体步骤'), '检查技能');
  assert.equal(thoughtSummary('English summary\r\nnext'), 'English summary');
  assert.equal(thoughtSummary(''), '');
});
test('streaming previews wait for a completed first line instead of jittering per character',()=>{
  assert.equal(thoughtSummary('**正在检',true),'');
  assert.equal(thoughtSummary('**检查技能**\n继续',true),'检查技能');
  assert.equal(thoughtSummary('先检查\n\n**新的思考尚未完成',true),'先检查');
  assert.equal(thoughtSummary('先检查\n\n**第二段**\n后续',true),'第二段');
});
test('blank separators and CRLF advance to the latest completed paragraph',()=>{
  assert.equal(thoughtSummary('第一段\n\n第二段\n\n第三段未完成',true),'第二段');
  assert.equal(thoughtSummary('One\r\n\r\nTwo\r\nmore',true),'Two');
  assert.equal(thoughtSummary('First\n \nSecond\n\t\nThird',true),'Second');
  assert.equal(thoughtSummary('A\n \n \nB\n',true),'B');
});
test('only the live reasoning tail animates; history, forks and a following answer do not',()=>{
  const thought={type:'thought',key:'g:1',text:'reasoning'};
  assert.equal(thoughtIsStreaming(thought,[thought],true),true);
  assert.equal(thoughtIsStreaming(thought,[thought],false),false);
  assert.equal(thoughtIsStreaming(thought,[thought,{type:'assistant',key:'g:2'}],true),false);
  const inherited={...thought,inherited:true};assert.equal(thoughtIsStreaming(inherited,[inherited],true),false);
  assert.equal(thoughtIsStreaming(undefined,[],true),false);
});
test('child completion stops its own thought shimmer without idling the root or another turn',()=>{
  let state={...initialState(),running:true};
  state=reduceEvent(state,{type:'thought',seq:1,generation:'g',sessionId:'child',rootSessionId:'root',turnId:'child-turn',text:'child reasoning'});
  state=reduceEvent(state,{type:'stop',seq:2,generation:'g',sessionId:'child',rootSessionId:'root',turnId:'child-turn',stopReason:'end_turn',busy:false});
  assert.equal(state.running,true);assert.equal(state.items[0].streaming,false);
  assert.equal(thoughtIsStreaming(state.items[0],state.items,state.running),false);
  state=reduceEvent(state,{type:'thought',seq:3,generation:'g',sessionId:'child',rootSessionId:'root',turnId:'next-turn',text:'new reasoning'});
  assert.equal(thoughtIsStreaming(state.items.at(-1),state.items,state.running),true);
  state=reduceEvent(state,{type:'stop',seq:4,generation:'g',sessionId:'child',rootSessionId:'root',turnId:'child-turn',stopReason:'end_turn',busy:false});
  assert.equal(state.items.at(-1).streaming,true);
});
test('text chunks retain row identity so user disclosure state survives streaming',()=>{
  let state=reduceEvent(initialState(),{type:'thought',seq:1,generation:'g',sessionId:'root',turnId:'t',text:'one'});
  const key=state.items[0].key;
  state=reduceEvent(state,{type:'thought',seq:2,generation:'g',sessionId:'root',turnId:'t',text:' two'});
  assert.equal(state.items[0].key,key);assert.equal(state.items[0].text,'one two');
});
test('reasoning uses a lightweight disclosure rather than a framed UI button',()=>{
  const source=readFileSync(new URL('../src/client/thought.js',import.meta.url),'utf8');
  const cards=readFileSync(new URL('../src/client/cards.js',import.meta.url),'utf8');
  const chat=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  parse(source,{ecmaVersion:'latest',sourceType:'module'});
  assert.match(source,/h\('button',\{type:'button',className:'rssh-thought-toggle'/);
  assert.match(source,/'aria-expanded':open,'aria-controls':id/);
  assert.match(source,/id,hidden:!open,className:'rssh-thought-body'/);
  assert.match(source,/React.useState\(false\)/);assert.match(source,/setOpen\(value=>!value\)/);
  assert.doesNotMatch(source,/ui.Button|variant:|t\('acp.show'\)\)/);
  assert.doesNotMatch(cards,/function AcpThought/);
  assert.match(source,/renderFactorySlot\('conversation.chat.reasoning.content',\{text:item.text,running\}\)/);
  assert.doesNotMatch(source,/ui.MarkdownText/);
  assert.match(chat,/running:thoughtIsStreaming\(item,items,running\)/);
});
test('secondary typography, non-shrinking rows and reduced-motion are explicitly styled',()=>{
  const css=readFileSync(new URL('../src/client/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.rssh-thought\s*\{\s*flex: none;\s*min-width: 0;/);
  assert.match(css,/\.rssh-thought-toggle\s*\{[^}]*border: none;[^}]*background: transparent;/);
  assert.match(css,/\.rssh-thought-summary[^}]*text-overflow: ellipsis;\s*white-space: nowrap/);
  assert.match(css,/\.rssh-thought-body .rsui-markdown[^}]*color: var\(--dsw-alias-label-secondary\)/);
  assert.match(css,/animation: rssh-thought-shimmer/);assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/\.rssh-thought-toggle:focus-visible/);
});
