import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HistoryPager,HISTORY_EDGE,scrollBoxConsumesUpward} from '../src/client/history-pager.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const edge={scrollTop:0,scrollHeight:1000,clientHeight:400};
function fixture(load) {
  const pages=[],changes=[];
  const page={identity:'session/generation/0',ready:true,hasEarlier:true,beforeSeq:1000};
  const pager=new HistoryPager({getPage:()=>page,load:async captured=>{
    pages.push({...captured});
    if(load)return load(page,captured);
    page.beforeSeq-=250;
  },changed:state=>changes.push(state)});
  pager.activate(true,page.identity);
  return {pager,page,pages,changes};
}
test('mount, resize and live growth alone never download old history',async()=>{
  const f=fixture();await f.pager.check(edge);await f.pager.check({...edge,scrollHeight:1200});assert.equal(f.pages.length,0);
});
test('reader near the top loads the captured cursor; outside threshold does not',async()=>{
  const f=fixture();await f.pager.check({...edge,scrollTop:HISTORY_EDGE+1},{gesture:true});assert.equal(f.pages.length,0);
  await f.pager.check({...edge,scrollTop:HISTORY_EDGE},{gesture:true});assert.equal(f.pages.length,1);assert.equal(f.pages[0].beforeSeq,1000);
});
test('in-flight load is synchronously coalesced across wheel, scroll and resize events',async()=>{
  const waiting=deferred(),f=fixture(async page=>{await waiting.promise;page.beforeSeq=750;});
  const first=f.pager.check(edge,{gesture:true});const second=f.pager.check(edge,{gesture:true});assert.equal(first,second);
  await tick();assert.equal(f.pages.length,1);assert.equal(f.pager.state.loading,true);
  waiting.resolve();await first;assert.equal(f.pager.state.loading,false);
});
test('short or invisible pages can advance on recheck, bounded to three pages per reader gesture',async()=>{
  const f=fixture(),short={scrollTop:0,scrollHeight:100,clientHeight:400};
  await f.pager.check(short,{gesture:true});
  for(let index=0;index<8;index++)await f.pager.check(short);
  assert.equal(f.pages.length,3);
  await f.pager.check(short,{gesture:true});assert.equal(f.pages.length,4);
});
test('moving away from the top and explicit latest stop further automatic paging',async()=>{
  const f=fixture();await f.pager.check(edge,{gesture:true});
  await f.pager.check({...edge,scrollTop:500});assert.equal(f.pages.length,1);
  f.pager.pause();await f.pager.check(edge);assert.equal(f.pages.length,1);
});
test('end of history, hidden viewport and unavailable session never fetch',async()=>{
  const f=fixture();f.page.hasEarlier=false;await f.pager.check(edge,{gesture:true});
  f.page.hasEarlier=true;f.page.ready=false;await f.pager.check(edge,{gesture:true});
  f.page.ready=true;await f.pager.check({...edge,clientHeight:0},{gesture:true});
  assert.equal(f.pages.length,0);
});
test('network error stays local and latched until explicit retry, not a scroll retry storm',async()=>{
  let failed=true;const f=fixture(page=>{if(failed)throw new Error('offline');page.beforeSeq=750;});
  await f.pager.check(edge,{gesture:true});assert.equal(f.pager.state.error.message,'offline');
  await f.pager.check(edge,{gesture:true});await f.pager.check(edge);assert.equal(f.pages.length,1);
  failed=false;await f.pager.check(edge,{retry:true});assert.equal(f.pages.length,2);assert.equal(f.pager.state.error,null);
});
test('unchanged, backwards and malformed cursors cannot create an endless load loop',async()=>{
  for(const value of [1000,1001,null,NaN]){
    const f=fixture(page=>{page.beforeSeq=value;});await f.pager.check(edge,{gesture:true});
    assert.equal(f.pager.state.error.code,'history_no_progress');
    for(let i=0;i<4;i++)await f.pager.check(edge,{gesture:true});assert.equal(f.pages.length,1);
  }
});
test('invalid initial cursor is visible but never sent to the Host',async()=>{
  for(const beforeSeq of [0,-1,null,undefined,NaN,1.1]){
    const f=fixture();f.page.beforeSeq=beforeSeq;await f.pager.check(edge,{gesture:true});
    assert.equal(f.pages.length,0);assert.equal(f.pager.state.error.code,'history_no_progress');
  }
});
test('an empty final page is an end, not a pagination error',async()=>{
  const f=fixture(page=>{page.hasEarlier=false;page.beforeSeq=null;});await f.pager.check(edge,{gesture:true});
  assert.equal(f.pager.state.error,null);await f.pager.check(edge,{gesture:true});assert.equal(f.pages.length,1);
});
test('session or journal replacement cannot consume old errors or overlap an old request',async()=>{
  const waiting=deferred(),f=fixture(()=>waiting.promise);
  const first=f.pager.check(edge,{gesture:true});await tick();
  f.pager.activate(false,f.page.identity);f.page.identity='other/generation/1';f.pager.activate(true,f.page.identity);
  assert.equal(f.pager.check(edge,{gesture:true}),first);assert.equal(f.pages.length,1);
  waiting.reject(new Error('old error'));await first;
  assert.equal(f.pager.state.error,null);assert.equal(f.pager.state.loading,false);
});
test('late page after unmount does not notify a retired view',async()=>{
  const waiting=deferred(),f=fixture(()=>waiting.promise);const pending=f.pager.check(edge,{gesture:true});await tick();
  f.pager.activate(false,f.page.identity);const count=f.changes.length;
  waiting.resolve();await pending;assert.equal(f.changes.length,count);
});
test('a stale scheduled reader check cannot fetch from a new journal identity',async()=>{
  const f=fixture();f.page.identity='replacement';await f.pager.check(edge,{gesture:true});assert.equal(f.pages.length,0);
});
test('a retired request queued before its first microtask never starts',async()=>{
  const f=fixture();const pending=f.pager.check(edge,{gesture:true});f.pager.activate(false,f.page.identity);
  await pending;assert.equal(f.pages.length,0);
});
test('nested scroll geometry respects upward consumption and contained boundaries',()=>{
  const inner={scrollTop:10,scrollHeight:900,clientHeight:300,overflowY:'auto',overscrollBehaviorY:'auto'};
  assert.equal(scrollBoxConsumesUpward(inner),true);
  assert.equal(scrollBoxConsumesUpward({...inner,scrollTop:0}),false);
  assert.equal(scrollBoxConsumesUpward({...inner,scrollTop:0,overscrollBehaviorY:'contain'}),true);
  assert.equal(scrollBoxConsumesUpward({...inner,overflowY:'hidden'}),false);
  assert.equal(scrollBoxConsumesUpward({...inner,scrollHeight:300}),false);
  assert.equal(scrollBoxConsumesUpward({...inner,scrollHeight:300,overscrollBehaviorY:'contain'}),true);
});
test('UI replaces routine Load earlier button with feedback and an error-only retry',()=>{
  const read=name=>readFileSync(new URL('../src/client/'+name,import.meta.url),'utf8');
  const chat=read('chat.js'),scroll=read('transcript-scroll.js'),css=read('styles.css');
  assert.doesNotMatch(chat,/acp\.loadEarlier|rssh-history-control/);
  assert.match(chat,/scroll.history.error\?h\(ui.Button/);assert.match(chat,/onClick:scroll.retryHistory/);
  assert.match(chat,/tabIndex:0,role:'region','aria-label':t\('acp.messageHistory'\)/);
  assert.match(chat,/onKeyDown:scroll.onKeyDown/);assert.match(chat,/load:\(page,beforeApply,canApply\)=>client.history\(page.beforeSeq,\{beforeApply,canApply\}\)/);
  assert.match(scroll,/const beforeApply=/);assert.match(scroll,/anchors:measurements\(viewport,content\)/);
  assert.match(scroll,/React.useLayoutEffect\(\(\)=>\{restorePrepend\(\);schedule\(\);\},\[items\]\)/);
  assert.match(scroll,/historyAnchorAdjustment\(saved.anchors/);assert.match(scroll,/isNestedScroll\(event\)/);
  assert.match(css,/\.rssh-history-status\s*\{[^}]*height: 32px;/);
  assert.match(css,/\.ra-acp-messages:focus-visible/);
  for(const language of ['zh.js','en.js'])for(const key of ['messageHistory','historyScrollHint','historyLoading','historyFailed','historyNoProgress','historyRetry','historyStart'])assert.ok(read(language).includes(`acp.${key}`));
});
