import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,reduceEvent} from '../src/client/events.js';
import {formatTurnTime,turnMessageMeta,normalizeTurnUsage,turnUsageRows,turnUsageText} from '../src/client/message-meta-model.js';

const event=(seq,type,extra={})=>({generation:'g',seq,type,sessionId:'root',turnId:'turn-1',...extra});
const usage={inputTokens:31158,cachedReadTokens:19803008,cachedWriteTokens:0,outputTokens:17282,totalTokens:19851448};

test('turn footer snapshots per-turn token usage at stop and reuses it during history projection', () => {
  let state=initialState();
  state=reduceEvent(state,event(1,'config',{config:{models:{currentValue:'deepseek-account/deepseek-flash'}}}));
  state=reduceEvent(state,event(2,'turn_start',{ts:1000}));
  state=reduceEvent(state,event(3,'stop',{stopReason:'end_turn',busy:false,ts:new Date(2026,10,26,17,10,5).getTime(),
    response:{usage}}));
  const turn=state.turns[JSON.stringify(['root','turn-1'])];
  const meta=turnMessageMeta(turn);
  assert.equal(meta.tokens,'19.9M');
  assert.equal(meta.usage.total,19851448);
  assert.equal(meta.usage.model,'deepseek-account/deepseek-flash');
  assert.match(String(meta.usage.cacheHit),/^99\.8/);
  assert.equal(meta.time,'17:10');
  assert.equal(meta.dateTime,new Date(turn.endedAt).toISOString());
  assert.equal(turnUsageText(meta.usage),'19,851,448 tok');
});

test('quota counters are accepted when the adapter exposes only token_count/model_usage', () => {
  const normalized=normalizeTurnUsage({_meta:{quota:{token_count:{inputTokens:10,cachedInputTokens:90,cachedWriteTokens:0,outputTokens:5,totalTokens:105},
    model_usage:[{model:'provider/model'}]}}});
  assert.deepEqual(normalized,{total:105,input:10,cacheRead:90,cacheWrite:0,output:5,cacheHit:90,model:'provider/model'});
  const rows=turnUsageRows(normalized,{model:'Model',cacheHit:'Cache',input:'Input',cacheRead:'Read',cacheWrite:'Write',output:'Output'});
  assert.deepEqual(rows.map(row=>row[0]),['Model','Cache','Input','Read','Write','Output']);
  assert.equal(rows[4][1],'0 tok');
});

test('missing usage or completion time stays explicit instead of being invented', () => {
  assert.deepEqual(turnMessageMeta({}),{usage:null,tokens:null,endedAt:null,time:null,dateTime:null});
  assert.equal(formatTurnTime(null),null);assert.equal(formatTurnTime(0),null);assert.equal(formatTurnTime(NaN),null);
  assert.equal(turnMessageMeta({tokens:{total:-1},endedAt:-1}).tokens,null);
  assert.equal(turnMessageMeta({tokens:{total:0},endedAt:new Date(2026,10,26,9,5).getTime()}).tokens,'0');
  assert.equal(normalizeTurnUsage(null),null);
  assert.deepEqual(turnUsageRows(null,{}),[]);
});

test('assistant footer carries exactly copy, usage and completion time with a details popover', () => {
  const transcript=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  const view=readFileSync(new URL('../src/client/native-message-view.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/client/native-message-view.css',import.meta.url),'utf8');
  assert.match(transcript,/h\(NativeMessageActions,\{clock:'end'\},[\s\S]*NativeMessageCopy[\s\S]*NativeMessageUsage[\s\S]*NativeMessageTime/);
  assert.match(transcript,/tokens:meta\.tokens,usage:meta\.usage/);
  assert.match(transcript,/labels:\{model:t\('flow\.usageModel'\),cacheHit:t\('flow\.cacheHit'\)/);
  assert.match(transcript,/time:meta\.time,dateTime:meta\.dateTime/);
  assert.match(view,/export function NativeMessageUsage/);
  assert.match(view,/export function NativeMessageTime/);
  assert.match(view,/h\(NativeIcon,\{name:'stats'/);
  assert.match(view,/h\(ui\.Menu,\{open,onClose:\(\)=>setOpen\(false\),autoFocus:false,role:'dialog',align:'end'/);
  assert.match(view,/rssh-turn-usage-total/);
  assert.match(css,/\.rssh-native-message-meta/);
  assert.match(css,/font-variant-numeric: tabular-nums/);
  assert.match(css,/\.rssh-turn-usage-panel/);
  assert.match(css,/\.rssh-turn-usage-row/);
});
