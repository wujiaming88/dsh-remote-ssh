import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
const view=read('native-message-view.js'),css=read('native-message-view.css'),adapter=read('transcript.js');
// Source/real CSS validation only: no React or DOM simulation.
test('copied user content places attachments before the bubble and actions outside the stack',()=>{
  parse(view,{ecmaVersion:'latest',sourceType:'module'});
  const user=view.split('export function NativeUserMessage')[1].split('export function NativeAssistantMessage')[0];
  assert.match(user,/h\('div',\{className:'rssh-native-user-stack'\},\s*attachments,\s*text\?h\('div'/);
  assert.match(user,/delivery\):null\),\s*actions\)/);
  assert.match(user,/'data-pending-steering':pending\?'':undefined/);
  assert.match(adapter,/text:String\(item.text\|\|''\).trim\(\)\?item.text:''/);
  assert.match(adapter,/latest:item===latestUser,pending:item.delivery==='queued'/);
  assert.match(adapter,/latestUser=entries.findLast\(entry=>entry.item\?\.type==='user'\)\?\.item/);
  assert.match(adapter,/!ancestors.length&&\(!item.rootSessionId\|\|item.rootSessionId===item.sessionId\)\?attachmentContext:null/);
});
test('assistant view keeps keyed streaming content and interrupted marker separate from actions',()=>{
  assert.match(adapter,/h\(NativeAssistantMessage,\{key:item.key\|\|id/);
  const assistant=adapter.split("case 'assistant': {")[1].split("case 'thought':")[0];
  assert.equal((assistant.match(/h\(NativeMessageCopy,/g)||[]).length,1);
  assert.match(assistant,/h\(NativeMessageCopy,\{text:copy.part,labels:\{\.\.\.copyLabels,copy:t\('flow.copyPart'\)\}\}\)/);
  assert.doesNotMatch(assistant,/copy\.turn|flow\.copyTurn|iconOnly:false/);
  assert.match(view,/h\('div',\{className:'rssh-native-assistant-body'\},body,/);
  assert.match(view,/interrupted\?h\('span',\{className:'rssh-native-assistant-stopped'\}/);
  assert.match(css,/--dsh-assistant-block-gap: 16px/);
  assert.match(css,/rssh-native-assistant-footer \{ margin-top: 16px; margin-left: -6px/);
});
test('all assistant copy actions use hover or keyboard focus without hiding touch controls',()=>{
  const assistant=view.split('export function NativeAssistantMessage')[1];
  assert.match(assistant,/'data-actions-reveal':'hover'/);
  assert.doesNotMatch(assistant,/\btail\b|'always'/);
  assert.match(css,/@media \(hover: hover\)\s*\{\s*:is\(\.rssh-native-user,\.rssh-native-assistant\)\[data-actions-reveal='hover'\] \.rssh-native-message-actions \{ opacity: 0;/);
  assert.match(css,/\[data-actions-reveal='hover'\]:hover \.rssh-native-message-actions,/);
  assert.match(css,/\[data-actions-reveal='hover'\]:focus-within \.rssh-native-message-actions \{ opacity: 1;/);
  // Preserve layout and keyboard reachability: no display/visibility hiding or tabindex removal.
  assert.doesNotMatch(css,/display:\s*none|visibility:\s*hidden/);
  assert.doesNotMatch(assistant,/tabIndex|aria-hidden/);
});
test('message chrome uses native action geometry without invented clocks or capabilities',()=>{
  assert.match(view,/h\(ui.CopyButton,\{text,labels,iconOnly/);
  assert.doesNotMatch(view,/Date\.now|onBranch|useSessions|useChat|@deepseek-ai\//);
  assert.match(css,/width: calc\(28px \+ var\(--dsh-content-font-delta, 0px\)\)/);
  assert.match(css,/\[data-clock='end'\] .rssh-native-message-action svg \{ width: calc\(17px/);
  assert.match(css,/@media \(hover: hover\)/);
  assert.match(css,/:focus-within .rssh-native-message-actions \{ opacity: 1/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css,/pointer-events:\s*none/);
});
test('native view styles are loaded once after the previous shared layout and remain valid CSS',async()=>{
  const entry=read('index.js');
  for(const name of ['native-message-view','native-tool-row','native-composer-view','native-attachment-view']){
    assert.equal(entry.split(`from './${name}.css'`).length-1,1);
    const result=await transform(read(name+'.css'),{loader:'css'});
    assert.equal(result.warnings.length,0,name);
  }
  assert.match(entry,/\+ css \+ "\\n" \+ nativeMessageCss/);
});
