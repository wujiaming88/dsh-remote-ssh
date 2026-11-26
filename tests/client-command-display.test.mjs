import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import * as model from '../src/client/tool-model.js';
import {toolHeaderPresentation} from '../src/client/tool-header-model.js';
import {acpContentText} from '../src/client/presentation.js';
import {createNativeTextControls} from '../src/client/native-text-controls.js';
import {initialState,reduceEvent,replay} from '../src/client/events.js';
const script="python3 - <<'PY'\nfrom pathlib import Path\n\nif True:\n    value = '<script>not HTML</script>'\n\tprint(value)\nPY\n";
const h=(type,props,...children)=>({type,props:{...props,...(children.length?{children}:{} )}});
const React={createElement:h,Fragment:'Fragment',useState:value=>[value,()=>{}],useId:()=>':test:'};
const ui=createNativeTextControls(React,{Button:'Button',Icon:'Icon',CopyButton:'CopyButton'});
const source=readFileSync(new URL('../src/client/cards.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
function component(name,dependencies){
  const declaration=ast.body.map(node=>node.declaration||node).find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);
  return new Function(...Object.keys(dependencies),`return (${source.slice(declaration.start,declaration.end)});`)(...Object.values(dependencies));
}
const dependencies={h,React,ui,...model,toolHeaderPresentation,acpContentText,AcpResultText:'Result'};
const AcpToolBody=component('AcpToolBody',dependencies);
const AcpToolCard=component('AcpToolCard',{...dependencies,AcpToolBody,payloadItem:(_props,type,tool)=>({type,tool}),nested:()=>null,
  Disclosure:'Disclosure',FlowIcon:'FlowIcon',UiButton:'Button',AcpSubagentMeta:'Subagent',AcpNativeDetails:'Raw',AcpSourceFallback:'Fallback'});
function nodes(value,result=[]){
  if(Array.isArray(value)){value.forEach(child=>nodes(child,result));return result;}
  if(!value||typeof value!=='object')return result;
  result.push(value);nodes(value.props?.children,result);return result;
}
function body(tool){const card=AcpToolCard({tool,t:key=>key,labels:{terminal:{},read:{},diff:{},markdown:{}}});return nodes(card).find(node=>node.type==='Disclosure').props.children();}

test('heredoc repeated as ACP title appears only in the native terminal, never as ordinary prose',()=>{
  const tool={kind:'execute',title:script,rawInput:{command:script},status:'in_progress'};
  const before=JSON.stringify(tool),expanded=body(tool),elements=nodes(expanded);
  assert.equal(elements.some(node=>node.props?.className==='rssh-flow-text'),false);
  const terminal=nodes(AcpToolBody(elements.find(node=>node.type===AcpToolBody).props)).find(node=>node.type===ui.TerminalBlock);
  assert.equal(terminal.props.command,script);assert.equal(terminal.props.maxLines,Number.MAX_SAFE_INTEGER);
  assert.equal(terminal.props.className,'rssh-native-tool-terminal-body');assert.equal(JSON.stringify(tool),before);
  assert.equal(elements.find(node=>node.type==='Raw').props.payload.title,script);
});

test('independent action descriptions remain visible and different terminal commands are not collapsed',()=>{
  const tool={kind:'execute',title:script,rawInput:{command:script,description:'Update the patch'},terminals:[{command:script},{command:'git diff'}]};
  const value=model.toolFlowModel(tool);
  assert.deepEqual(model.toolDetailTitles(tool,value),['Update the patch']);
  assert.deepEqual(model.toolBodyParts(value).filter(part=>part.kind==='terminal').map(part=>part.command),[script,'git diff']);
  assert.deepEqual(model.toolDetailTitles({title:'Check resulting patch'},value),['Check resulting patch','Update the patch']);
});

test('structured top-level commands work, while multiline title-only data stays literal text',()=>{
  const supplied={kind:'execute',command:script,title:script};
  assert.equal(model.toolFlowModel(supplied).command,script);
  assert.deepEqual(model.toolDetailTitles(supplied,model.toolFlowModel(supplied)),[]);
  const unknown={title:script,name:'unknown-tool'};
  assert.equal(model.toolFlowModel(unknown).body,'generic');assert.equal(model.toolFlowModel(unknown).command,'');
  const code=nodes(body(unknown)).find(node=>node.type===ui.TextBlock);
  assert.equal(code.props.lang,'text');assert.equal(code.props.copyText,script);
  assert.equal(code.props.rows.map(row=>row.text).join('\n'),script);
});

test('native terminal keeps every command line, indentation, blanks and separate output copying',()=>{
  const long=script+'\n'+Array.from({length:300},(_,index)=>'    # '+index+' '+ 'x'.repeat(200)).join('\n');
  const tree=nodes(ui.TerminalBlock({command:long,output:'result\n',maxLines:Number.MAX_SAFE_INTEGER}));
  const commands=tree.filter(node=>node.props?.className==='rssh-native-terminal-command rssh-native-command-text');
  assert.equal(commands.map(node=>node.props.children[0]).join('\n'),long);
  assert.equal(tree.find(node=>node.type==='CopyButton').props.text,'result\n');
  assert.equal(tree.some(node=>node.props?.dangerouslySetInnerHTML),false);
});

test('streaming updates and history replay retain exact command bytes and remove the same duplicate title',()=>{
  const events=[{generation:'g',seq:1,type:'tool_call',toolCallId:'cmd',kind:'execute',title:script,rawInput:{command:script},status:'in_progress'},
    {generation:'g',seq:2,type:'tool_call_update',toolCallId:'cmd',status:'completed',output:'done'}];
  const live=events.reduce(reduceEvent,initialState()),history=replay(events);
  for(const state of [live,history]){
    const tool=state.items[0].tool,value=model.toolFlowModel(tool);
    assert.equal(value.command,script);assert.deepEqual(model.toolDetailTitles(tool,value),[]);
  }
});

test('Bash-specific native wrapping and bounded command header do not cap or truncate original script data',()=>{
  const css=readFileSync(new URL('../src/client/native-tool-row.css',import.meta.url),'utf8');
  const textCss=readFileSync(new URL('../src/client/native-text-controls.css',import.meta.url),'utf8');
  assert.match(css,/\.rssh-tool-flow \.rssh-native-tool-terminal-body\s*\{[^}]*--rssh-native-terminal-command-whitespace: pre-wrap/);
  assert.match(textCss,/\.rssh-native-terminal-header\s*\{[^}]*max-height: 150px;[^}]*overflow-y: auto/);
  assert.match(textCss,/\.rssh-native-command-text\s*\{[^}]*min-width: 0;[^}]*overflow-x: auto/);
  assert.match(css,/rssh-process-disclosure\[data-scroll-body\][^{}]*\{ max-height: none; overflow-y: visible;/);
});
