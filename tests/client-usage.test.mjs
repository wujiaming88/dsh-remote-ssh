import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {usageDetails,formatTokens,formatPercentage,formatCost,sessionStats,formatElapsed,formatCompactTokens,usageSummary} from '../src/client/usage-model.js';
import {initialState,reduceEvent} from '../src/client/events.js';
import {mapSessionUpdate} from '../lib/acp-events.js';

const fixture={usage:{used:18398,size:256000,cost:{amount:0.074216,currency:'USD'}},
  config:{model:'ark/deepseek-flash',models:{currentValue:'ark/deepseek-flash',options:[{value:'ark/deepseek-flash',name:'DeepSeek Flash'}]},
    reasoningEffort:'high',reasoning:{currentValue:'high',options:[{value:'high',name:'High'}]},
    modes:{currentModeId:'plan',availableModes:[{id:'plan',name:'Plan'}]}},
  binding:{agent:'claude',agentLabel:'Claude Code',sessionId:'remote-123',remotePath:'/remote/project',pendingTurns:0},connected:true};

test('context and cumulative cost keep their actual protocol meaning',()=>{
  const value=usageDetails(fixture);
  assert.equal(value.percent,18398/256000*100);assert.equal(value.remaining,237602);assert.equal(value.capacity,256000);
  assert.equal(value.model,'DeepSeek Flash');assert.equal(value.modelId,'ark/deepseek-flash');assert.equal(value.reasoning,'High');assert.equal(value.mode,'Plan');
  assert.deepEqual(value.cost,{amount:0.074216,currency:'USD'});assert.equal(value.status,'ready');assert.equal(value.connected,true);
});
test('missing, zero and invalid values are distinguishable instead of inventing free usage',()=>{
  const empty=usageDetails({});assert.equal(empty.used,null);assert.equal(empty.capacity,null);assert.equal(empty.percent,null);assert.equal(empty.cost,null);
  const zero=usageDetails({usage:{used:0,size:256000,cost:{amount:0,currency:'USD'}}});assert.equal(zero.percent,0);assert.equal(zero.remaining,256000);assert.equal(zero.cost.amount,0);
  for(const value of [null,undefined,NaN,Infinity,-1,'12']){
    const state=usageDetails({usage:{used:value,size:0,cost:{amount:value}}});assert.equal(state.used,null);assert.equal(state.percent,null);assert.equal(state.cost,null);
  }
});
test('unusual context occupancy has an honest label and a bounded visual bar',()=>{
  const over=usageDetails({usage:{used:120,size:100}});assert.equal(over.percent,120);assert.equal(over.barPercent,100);assert.equal(over.remaining,0);assert.equal(over.tone,'error');
  assert.equal(usageDetails({usage:{used:95,size:100}}).tone,'warning');
  assert.equal(usageDetails({usage:{used:10,size:100}}).tone,'normal');
});
test('unknown selectors stay unreported and current option labels are used when present',()=>{
  const absent=usageDetails({config:{models:{currentValue:null,options:[]},reasoning:{currentValue:null,options:[]}}});assert.equal(absent.model,null);assert.equal(absent.reasoning,null);
  assert.equal(usageDetails({config:{model:'provider/model'}}).model,'provider/model');
  assert.equal(usageDetails({...fixture,permissions:[{requestId:'p'}],running:true}).status,'waiting');
});
test('formatting adds grouping, preserves cost precision and never displays NaN',()=>{
  assert.equal(formatTokens(null),'—');assert.equal(formatPercentage(null),'—');assert.equal(formatCost(null),'—');
  assert.equal(formatTokens(256000).replace(/[^0-9]/g,''),'256000');
  assert.match(formatPercentage(7.186),/^7[.,]2%$/);
  assert.match(formatCost({amount:0.074216,currency:'USD'}),/0[.,]074216 USD$/);
  assert.match(formatCost({amount:0,currency:'USD'}),/0[.,]00 USD$/);
  assert.doesNotMatch(formatCost({amount:0.0000004,currency:'USD'}),/^0[.,]0+ USD$/);
});
test('root usage is not overwritten by subagents or inherited source-session billing',()=>{
  const root=reduceEvent(initialState(),{type:'usage',generation:'g',seq:1,sessionId:'root',used:20,size:100,cost:{amount:1,currency:'USD'}});
  const child=reduceEvent(root,{type:'usage',generation:'g',seq:2,sessionId:'child',rootSessionId:'root',used:99,size:100,cost:{amount:5,currency:'USD'}});
  assert.equal(child.usage,root.usage);
  const fork=reduceEvent(initialState(),{type:'usage',generation:'g',seq:1,sessionId:'root',inherited:true,used:20,size:100,cost:{amount:1,currency:'USD'}});
  assert.equal(fork.usage,null);
});
test('Host usage mapping validates amounts without converting absence to zero',()=>{
  const missing=mapSessionUpdate({sessionUpdate:'usage_update'});assert.deepEqual(missing,{type:'usage',used:null,size:null,cost:null,native:'usage_update'});
  const valid=mapSessionUpdate({sessionUpdate:'usage_update',used:0,size:100,cost:{amount:0,currency:'USD'}});assert.equal(valid.used,0);assert.equal(valid.cost.amount,0);
  assert.equal(mapSessionUpdate({sessionUpdate:'usage_update',used:Infinity,size:-1,cost:{amount:NaN}}).cost,null);
});
test('context meter is a click-open ring below the composer, not a hover icon',()=>{
  const ui=readFileSync(new URL('../src/client/native-overlays.js',import.meta.url),'utf8');
  const usage=readFileSync(new URL('../src/client/usage.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/client/styles.css',import.meta.url),'utf8');
  assert.match(usage,/export function UsageMeter/);
  assert.match(usage,/if \(details.percent === null\) return null/);   // render nothing without data
  assert.match(usage,/viewBox:'0 0 14 14'/);assert.match(usage,/strokeDasharray/);assert.match(usage,/rotate\(-90 7 7\)/);
  assert.match(usage,/onClick:\(\)=>setOpen\(value=>!value\)/);         // click-open, not hover
  assert.doesNotMatch(usage,/onMouseEnter|onMouseLeave|onFocusCapture|onBlurCapture/);
  assert.match(usage,/role:'dialog',align:'end'/);
  assert.match(usage,/t\('usage.context'\)/);assert.doesNotMatch(usage,/'usage.cost'/);
  assert.match(usage,/~\$\{formatTokens\(details.used\)\} \/ \$\{formatTokens\(details.capacity\)\}/);
  assert.doesNotMatch(usage,/h\('details'|usage.details|usage.path|usage.sessionId/);
  assert.match(css,/\.rssh-meter-trigger\s*\{[^}]*border-radius: var\(--dsw-radius-sm\)/);
  assert.match(css,/\.rssh-meter-track[^}]*stroke: var\(--dsw-alias-border-l3\)/);
  assert.match(css,/\.rssh-meter-panel\s*\{[^}]*width: min\(264px/);
  assert.match(css,/\.rssh-meter-bar/);assert.match(css,/\.rssh-meter-segment/);
  assert.match(ui,/if \(current.current.role === 'dialog'\) return;/);
  const vars=[...css.matchAll(/var\((--[\w-]+)/g)].map(match=>match[1]);
  assert.ok(vars.every(name=>['--dsw-alias-','--dsw-radius-','--dsw-specific-input-major','--dsw-specific-selector','--dsw-elevation-soft','--dsw-specific-bubble','--dsw-specific-menu','--dsw-menu-backdrop-filter','--dsw-elevation-prominent','--dsw-font-','--ds-font-','--dsh-'].some(prefix=>name.startsWith(prefix))));
});

test('session statistics count settled turns, running work and elapsed age from ACP facts',()=>{
  const base=initialState();
  const turns=JSON.stringify(['root','t1']);
  let state={...base,turns:{[turns]:{status:'completed',startedAt:1000,endedAt:5000}},binding:{...base.binding,startedAt:1000}};
  const stats=sessionStats(state);
  assert.equal(stats.completed,1);assert.equal(stats.running,0);assert.equal(stats.startedAt,1000);
  assert.equal(formatElapsed(4000),'4s');assert.equal(formatElapsed(140000),'2m 20s');assert.equal(formatElapsed(null),'—');
  assert.equal(sessionStats({}).completed,0);assert.equal(sessionStats({}).startedAt,null);
  assert.equal(sessionStats({turns:{[turns]:{status:'running'}},binding:{startedAt:0,createdAt:999}}).startedAt,999);
});
test('session statistics pill is a click-open dock entry beside the context meter',()=>{
  const usage=readFileSync(new URL('../src/client/usage.js',import.meta.url),'utf8');
  const chat=readFileSync(new URL('../src/client/chat.js',import.meta.url),'utf8');
  assert.match(usage,/export function SessionStatsPill/);
  assert.match(usage,/sessionStats\(state\)/);assert.match(usage,/formatElapsed\(elapsedMs\)/);
  assert.match(usage,/setInterval\(\(\)=>setNow\(Date.now\(\)\),30000\)/);
  assert.match(usage,/if \(stats.completed===0 && stats.running===0\) return null/);
  assert.match(chat,/h\('div',\{className:'rssh-compose-dock'\},h\(SessionStatsPill,\{state\}\),h\(UsagePill,\{state\}\),h\(UsageMeter,\{state\}\)\)/);
});


test('compact context tokens remain visible but cost-only readings are hidden',()=>{
  assert.equal(formatCompactTokens(null),'—');assert.equal(formatCompactTokens(0),'0');
  assert.match(formatCompactTokens(28100),/^28[.,]1K$/);assert.equal(formatCompactTokens(1000000),'1M');
  assert.equal(usageSummary(usageDetails({})),null);
  assert.deepEqual(usageSummary(usageDetails({usage:{used:0}})),{kind:'context',value:'0 tok'});
  assert.equal(usageSummary(usageDetails({usage:{used:28100}})).kind,'context');
  for (const amount of [0,0.42]) assert.equal(usageSummary(usageDetails({usage:{cost:{amount,currency:'USD'}}})),null);
  assert.deepEqual(usageSummary(usageDetails({usage:{used:0,cost:{amount:1,currency:'USD'}}})),{kind:'context',value:'0 tok'});
});
test('usage and activity use distinct icons, honest labels, and independent availability',()=>{
  const source=readFileSync(new URL('../src/client/usage.js',import.meta.url),'utf8');
  assert.match(source,/export function UsagePill/);assert.match(source,/if\(!summary\)return null/);
  assert.match(source,/h\(NativeIcon,\{name:'stats',size:14/);
  assert.match(source,/h\(NativeIcon,\{name:'usage',size:14/);
  assert.match(source,/h\(StatsIcon\)/);assert.match(source,/h\(UsageIcon\)/);
  const icons=readFileSync(new URL('../src/client/native-icons.js',import.meta.url),'utf8');
  const iconAst=parse(icons,{ecmaVersion:'latest',sourceType:'module'});
  const map=iconAst.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.declarations?.[0]?.id.name==='NATIVE_ICON_SOURCES').declaration.declarations[0].init.arguments[0];
  const key=name=>map.properties.find(property=>property.key.value===name).value.properties.find(property=>property.key.value==='key').value.value;
  assert.equal(key('stats'),'data-outline');assert.equal(key('usage'),'gauge-outline');assert.notEqual(key('stats'),key('usage'));
  assert.doesNotMatch(source,/usage\.contextNote|rssh-meter-note|这是当前上下文占用|并非累计输入|Current context occupancy, not cumulative/);
  assert.match(source,/row\('usage.contextUsed'/);assert.match(source,/'stats.elapsed':'Session age'/);
  assert.doesNotMatch(source,/usage\.cost|formatCost|details\.cost|累计费用|最终账单|Cumulative cost|final invoice/);
  assert.match(source,/row\('usage.model',details.model\)/);assert.match(source,/row\('usage.capacity'/);
  assert.match(source,/const reading=stats.running>0/); // age stays in details, not masquerading as execution duration
  assert.doesNotMatch(source,/tok\/s|cacheHit|decodeSpeed|stats.steps/);
  assert.match(source,/if\(details.percent===null\)setOpen\(false\)/);
});


test('Escape closes every dock popover from its trigger without swallowing Tab or closed Escape',()=>{
  const source=readFileSync(new URL('../src/client/usage.js',import.meta.url),'utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const node=ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='dismissUsagePopover').declaration;
  const dismiss=new Function(source.slice(node.start,node.end)+';return dismissUsagePopover;')();
  const calls=[];
  const event=key=>({key,preventDefault:()=>calls.push('prevent'),stopPropagation:()=>calls.push('stop')});
  dismiss(event('Tab'),true,()=>calls.push('close'));dismiss(event('Escape'),false,()=>calls.push('close'));assert.deepEqual(calls,[]);
  dismiss(event('Escape'),true,()=>calls.push('close'));assert.deepEqual(calls,['prevent','stop','close']);
  assert.equal([...source.matchAll(/onKeyDown:event=>dismissUsagePopover/g)].length,3);
});
