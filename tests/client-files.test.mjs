import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {formatFileSize,fileEntryPath,fileDirectory,fileViewState} from '../src/client/files-model.js';
import {fileParentTarget} from '../src/client/ui-pure.js';
import {formatError} from '../src/client/api.js';

const source=readFileSync(new URL('../src/client/files.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
// Execute the actual component/controller with deterministic hook scheduling.
// This checks state and rendered props, not browser layout or native DOM behavior.
const body=ast.body.filter(n=>n.type!=='ImportDeclaration').map(n=>{
  const declaration=n.type==='ExportNamedDeclaration'?n.declaration:n;
  return source.slice(declaration.start,declaration.end);
}).join('\n');
const create=new Function('React','h','ui','api','useT','formatError','FileGlyph','fileParentTarget','formatFileSize','fileEntryPath','fileDirectory','fileViewState','HTTP_BASE','window','fetch',body+';return {RemoteFilesSidebar,assertFileCloseAllowed,messages};');
const flat=node=>!node||typeof node!=='object'?[]:[node,...node.children.flatMap(flat)];
const text=node=>typeof node==='string'?node:node?.children?.map(text).join('')||'';
function fixture(t,path){
  const hooks=[],effects=[],requests=[],events=new Map();let cursor=0,changed=false,tree;
  const effect=(fn,deps)=>{const i=cursor++,old=hooks[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=fn();});}};
  const React={Fragment:'Fragment',useState(initial){const i=cursor++;hooks[i]??={value:initial};return[hooks[i].value,value=>{hooks[i].value=typeof value==='function'?value(hooks[i].value):value;changed=true;}];},useRef(value){const i=cursor++;hooks[i]??={current:value};return hooks[i];},useEffect:effect,useLayoutEffect:effect};
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(c=>c!==null&&c!==undefined&&c!==false)});
  const api=(method,args)=>new Promise(resolve=>requests.push({method,args,resolve}));
  const window={addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
  const {RemoteFilesSidebar,assertFileCloseAllowed,messages}=create(React,h,{Button:'Button',Modal:'Modal',StateDot:'StateDot'},api,()=> (key,args)=>key+(args?':'+args.count:''),formatError,'Glyph',fileParentTarget,formatFileSize,fileEntryPath,fileDirectory,fileViewState,'/remote',window,()=>{throw Error('Unexpected upload')});
  const props={sessionId:'s1',useTabInfo:()=>({tab:{id:'files',navigation:{revision:1,params:{path}}}})};
  function render(){let limit=20;do{changed=false;cursor=0;tree=RemoteFilesSidebar(props);while(effects.length)effects.shift()();assert.ok(--limit>0,'hook render converges');}while(changed);return tree;}
  t.after(()=>{for(const hook of hooks)hook?.cleanup?.();});
  render();
  return {requests,events,messages,render,get tree(){return tree;},all:()=>flat(tree),byClass:name=>flat(tree).find(n=>n.props.className===name),button:label=>flat(tree).find(n=>n.type==='Button'&&(n.props['aria-label']===label||text(n)===label)),close:()=>assertFileCloseAllowed('s1',{id:'files'}),async reply(value,index=requests.length-1){requests[index].resolve(value);await Promise.resolve();render();}};
}

test('file sizes omit unknown values and use honest binary units',()=>{
  for(const value of [undefined,null,NaN,-1,Infinity,'1024'])assert.equal(formatFileSize(value),'');
  assert.equal(formatFileSize(0),'0 B');assert.equal(formatFileSize(1024),'1 KiB');assert.equal(formatFileSize(1536),'1.5 KiB');assert.equal(formatFileSize(4*1024**2),'4 MiB');
});
test('navigation preserves relative and absolute paths and root-level preview return',()=>{
  assert.equal(fileEntryPath('.','a.txt'),'a.txt');assert.equal(fileEntryPath('/work/','a.txt'),'/work/a.txt');
  assert.equal(fileDirectory('a.txt'),'.');assert.equal(fileDirectory('/a.txt'),'/');
  assert.equal(fileParentTarget('.','a.txt'),'.');assert.equal(fileParentTarget('.'),null);
  assert.equal(fileParentTarget('/workspace/nested'),'/workspace');assert.equal(fileParentTarget('nested/child'),'nested');
});
test('empty, loading, failed and stale results remain distinct',()=>{
  const state={busy:false,loaded:false,preview:null,entries:[],error:''};
  assert.equal(fileViewState(state),'list');assert.equal(fileViewState({...state,busy:true}),'loading');
  assert.equal(fileViewState({...state,error:'bad'}),'error');assert.equal(fileViewState({...state,loaded:true}),'empty');
  assert.equal(fileViewState({...state,loaded:true,error:'bad'}),'error');
  assert.equal(fileViewState({...state,loaded:true,error:'bad',entries:[{}]}),'list');
  assert.equal(fileViewState({...state,preview:{}}),'preview');
});
test('initial load, empty directory and localized count render without fabricated rows',async t=>{
  const f=fixture(t);assert.equal(f.requests[0].args.path,'.');assert.match(text(f.tree),/agents.loading/);assert.doesNotMatch(text(f.tree),/files.empty/);
  await f.reply({ok:true,entries:[]});assert.match(text(f.tree),/files.empty/);assert.match(text(f.tree),/files.items:0/);
  assert.equal(f.button('agents.parent').props.disabled,true);assert.equal(f.button('files.root').props.disabled,true);
  assert.deepEqual(Object.keys(f.messages.zh).sort(),Object.keys(f.messages.en).sort());
});
test('rows occupy the file body with full-name titles and only known file sizes',async t=>{
  const f=fixture(t);await f.reply({ok:true,entries:[{name:'folder',type:'directory',size:4096},{name:'very-long-name.txt',type:'file',size:1536},{name:'link',type:'symlink'}]});
  const rows=f.all().filter(n=>n.props.className==='rssh-files-row');assert.equal(rows.length,3);
  assert.equal(rows[1].props.title,'very-long-name.txt');assert.match(text(rows[1]),/1.5 KiB/);assert.doesNotMatch(text(rows[0]),/KiB/);
  rows[1].props.onClick();f.render();assert.equal(f.requests.at(-1).args.action,'read');assert.equal(f.requests.at(-1).args.path,'very-long-name.txt');
});
test('refresh retains existing rows and offers explicit retry after a read failure',async t=>{
  const f=fixture(t);await f.reply({ok:true,entries:[{name:'a',type:'directory'}]});
  f.button('agents.refresh').props.onClick();f.render();assert.ok(f.byClass('rssh-files-list'));assert.equal(f.byClass('rssh-files-row').props.disabled,true);
  await f.reply({ok:false,error:'Offline'});assert.ok(f.byClass('rssh-files-list'));assert.match(text(f.tree),/Offline/);
  f.button('files.retry').props.onClick();f.render();assert.equal(f.requests.at(-1).args.path,'.');
});
test('initial failure is not shown as an empty directory and retries its actual path',async t=>{
  const f=fixture(t,'nested/a.txt');await f.reply({ok:false,error:'No connection'});
  assert.match(text(f.tree),/files.failed/);assert.doesNotMatch(text(f.tree),/files.empty/);
  f.button('files.retry').props.onClick();f.render();assert.equal(f.requests.at(-1).args.path,'nested/a.txt');assert.equal(f.requests.at(-1).args.action,'read');
});
test('editor locks during reads and writes and dirty state guards navigation and closing',async t=>{
  const f=fixture(t,'a.txt');await f.reply({ok:true,content:'original',binary:false,version:'v1',size:8});
  f.byClass('rssh-file-editor').props.onChange({target:{value:'edited'}});f.render();
  assert.equal(f.button('agents.parent').props.disabled,true);assert.equal(f.button('files.root').props.disabled,true);assert.ok(f.events.has('beforeunload'));assert.throws(f.close,/Save or discard/);
  f.button('acp.saveFile').props.onClick();f.render();assert.equal(f.requests.at(-1).args.content,'edited');assert.equal(f.requests.at(-1).args.expectedVersion,'v1');
  assert.equal(f.byClass('rssh-file-editor').props.readOnly,true);assert.equal(f.button('acp.discardFile').props.disabled,true);
  await f.reply({ok:true,version:'v2'});assert.equal(f.byClass('rssh-file-editor').props.readOnly,false);assert.equal(f.button('agents.parent').props.disabled,false);assert.doesNotThrow(f.close);
  f.button('agents.refresh').props.onClick();f.render();assert.equal(f.byClass('rssh-file-editor').props.readOnly,true);
});
test('discard restores loaded content and failed save retains edited content',async t=>{
  const f=fixture(t,'a.txt');await f.reply({ok:true,content:'original',binary:false});
  f.byClass('rssh-file-editor').props.onChange({target:{value:'edited'}});f.render();f.button('acp.saveFile').props.onClick();f.render();
  await f.reply({ok:false,error:'Conflict'});assert.equal(f.byClass('rssh-file-editor').props.value,'edited');assert.throws(f.close);
  f.button('acp.discardFile').props.onClick();f.render();assert.equal(f.byClass('rssh-file-editor').props.value,'original');assert.doesNotThrow(f.close);
});
test('oversized preview provides one explanation and returns to its correct directory',async t=>{
  const f=fixture(t,'nested/large.dat');await f.reply({ok:false,code:'file_too_large'});
  assert.match(text(f.tree),/acp.previewTooLarge/);assert.doesNotMatch(text(f.tree),/agents.binary/);assert.ok(f.all().find(n=>n.type==='a'&&n.props.download===''));
  f.button('agents.parent').props.onClick();f.render();assert.equal(f.requests.at(-1).args.path,'nested');assert.equal(f.requests.at(-1).args.action,'list');
});
test('image retry remounts a failed image rather than merely clearing feedback',async t=>{
  const f=fixture(t,'a.png');await f.reply({ok:true,binary:true});const image=f.byClass('rssh-files-image');
  image.props.onError();f.render();f.button('files.retry').props.onClick();f.render();await f.reply({ok:true,binary:true});
  assert.notEqual(f.byClass('rssh-files-image').props.key,image.props.key);
});
test('truncated directories are disclosed instead of displaying an exact total',async t=>{
  const f=fixture(t);await f.reply({ok:true,entries:[],truncated:true});assert.match(text(f.tree),/files.truncated/);assert.doesNotMatch(text(f.tree),/files.items/);
});
test('full-height CSS has no legacy caps and bundle wires stylesheet and translations',()=>{
  const css=readFileSync(new URL('../src/client/files.css',import.meta.url),'utf8'),legacy=readFileSync(new URL('../src/client/styles.css',import.meta.url),'utf8'),index=readFileSync(new URL('../src/client/index.js',import.meta.url),'utf8');
  const rule=name=>css.match(new RegExp('\\.'+name+' \\{([^}]+)\\}'))?.[1]||'';
  for(const name of ['rssh-session-files','rssh-files-list','rssh-file-document','rssh-file-editor','rssh-files-image-view'])assert.match(rule(name),/min-height: 0/);
  assert.match(rule('rssh-session-files'),/overflow: hidden/);assert.match(rule('rssh-files-list'),/flex: 1 1 0/);
  assert.match(rule('rssh-file-editor'),/resize: none/);assert.match(rule('rssh-files-toolbar'),/min-height: 38px/);
  assert.doesNotMatch(css,/max-height: (220|320)px|min-height: (240|360)px/);assert.doesNotMatch(legacy,/\.ra-file-list|\.rssh-file-editor/);
  assert.match(css,/@container rssh-files/);assert.match(index,/import filesCss from '\.\/files.css'/);assert.match(index,/\+ filesCss/);assert.match(index,/\.\.\.fileMessages.zh/);assert.match(index,/\.\.\.fileMessages.en/);
});
