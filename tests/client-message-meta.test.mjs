import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,reduceEvent} from '../src/client/events.js';
import {formatTurnTime,turnMessageMeta} from '../src/client/message-meta-model.js';

const event=(seq,type,extra={})=>({generation:'g',seq,type,sessionId:'root',turnId:'turn-1',...extra});

test('turn footer snapshots usage at stop and reuses it during history projection', () => {
  let state=initialState();
  state=reduceEvent(state,event(1,'turn_start',{ts:1000}));
  state=reduceEvent(state,event(2,'usage',{used:46900000,size:50000000,ts:2000}));
  state=reduceEvent(state,event(3,'stop',{stopReason:'end_turn',busy:false,ts:new Date(2026,10,26,17,10,5).getTime()}));
  const turn=state.turns[JSON.stringify(['root','turn-1'])];
  assert.equal(turn.usage.used,46900000);
  const meta=turnMessageMeta(turn);
  assert.equal(meta.tokens,'46.9M');
  assert.equal(meta.time,'17:10');
  assert.equal(meta.dateTime,new Date(turn.endedAt).toISOString());
  assert.equal(state.usage.used,46900000);
});

test('missing usage or completion time stays explicit instead of being invented', () => {
  assert.deepEqual(turnMessageMeta({}),{tokens:null,endedAt:null,time:null,dateTime:null});
  assert.equal(formatTurnTime(null),null);assert.equal(formatTurnTime(0),null);assert.equal(formatTurnTime(NaN),null);
  assert.equal(turnMessageMeta({usage:{used:-1},endedAt:-1}).tokens,null);
  assert.equal(turnMessageMeta({usage:{used:0},endedAt:new Date(2026,10,26,9,5).getTime()}).tokens,'0');
});

test('assistant footer carries exactly copy, usage and completion time', () => {
  const transcript=readFileSync(new URL('../src/client/transcript.js',import.meta.url),'utf8');
  const view=readFileSync(new URL('../src/client/native-message-view.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/client/native-message-view.css',import.meta.url),'utf8');
  assert.match(transcript,/h\(NativeMessageActions,\{clock:'end'\},[\s\S]*NativeMessageCopy[\s\S]*NativeMessageUsage[\s\S]*NativeMessageTime/);
  assert.match(transcript,/tokens:meta\.tokens,label:t\('flow\.usage'\)/);
  assert.match(transcript,/time:meta\.time,dateTime:meta\.dateTime/);
  assert.match(view,/export function NativeMessageUsage/);
  assert.match(view,/export function NativeMessageTime/);
  assert.match(view,/h\(NativeIcon,\{name:'stats'/);
  assert.match(css,/\.rssh-native-message-meta/);
  assert.match(css,/font-variant-numeric: tabular-nums/);
});
