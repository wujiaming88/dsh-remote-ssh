import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, realpathSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AcpStore } from '../lib/acp-store.js';

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-store-pages-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new AcpStore({ storePath: join(dir, 'store.json') });
}
const event = (seq, text = `event-${seq}`) => ({ eventVersion: 1, generation: 'g', seq, type: 'text', text });

test('tail pagination walks a multi-chunk journal backwards without duplicates or re-scanning newer pages', t => {
  const store = fixture(t), id = 'journal';
  for (let seq = 1; seq <= 900; seq++) store.appendEvent(id, event(seq, `payload-${seq}-` + 'x'.repeat(200)));
  const tail = store.readEvents(id, { tail: true, limit: 70 });
  assert.deepEqual(tail.events.map(e => e.seq), Array.from({ length: 70 }, (_, i) => 831 + i));
  assert.equal(tail.hasEarlier, true); assert.equal(tail.hasMore, false);
  assert.ok(store.eventOffsets.get(id).has(tail.oldestSeq));
  // Appending newer events after a page must not affect the cached older cursor.
  store.appendEvent(id, event(901)); store.appendEvent(id, event(902));
  let before = tail.oldestSeq, seqs = [...tail.events.map(e => e.seq)];
  while (before > 1) {
    const page = store.readEvents(id, { tail: true, beforeSeq: before, limit: 70 });
    assert.equal(page.events.length, Math.min(70, before - 1));
    assert.ok(page.events.at(-1).seq < before);
    seqs = [...page.events.map(e => e.seq), ...seqs]; before = page.oldestSeq;
    assert.equal(page.hasEarlier, before > 1);
  }
  assert.deepEqual(seqs, Array.from({ length: 900 }, (_, i) => i + 1));
});

test('an unknown beforeSeq falls back to a backward scan and caches the page', t => {
  const store = fixture(t), id = 'fallback';
  for (let seq = 1; seq <= 30; seq++) store.appendEvent(id, event(seq));
  const page = store.readEvents(id, { tail: true, beforeSeq: 25, limit: 10 });
  assert.deepEqual(page.events.map(e => e.seq), [15,16,17,18,19,20,21,22,23,24]);
  assert.equal(page.hasEarlier, true);
  assert.ok(store.eventOffsets.get(id).has(page.oldestSeq));
  const first = store.readEvents(id, { tail: true, limit: 5 });
  assert.deepEqual(first.events.map(e => e.seq), [26,27,28,29,30]);
  const since = store.readEvents(id, { tail: true, limit: 10, sinceSeq: 27 });
  assert.deepEqual(since.events.map(e => e.seq), [28,29,30]); assert.equal(since.hasEarlier, false);
});

test('backward pagination skips a torn tail and preserves Unicode across chunk boundaries', t => {
  const store = fixture(t), id = 'unicode';
  for (let seq = 1; seq <= 400; seq++) store.appendEvent(id, event(seq, '🙂'.repeat(500) + seq));
  appendFileSync(store.historyPath(id), '{"eventVersion":1,"seq":');
  const tail = store.readEvents(id, { tail: true, limit: 3 });
  assert.deepEqual(tail.events.map(e => e.seq), [398,399,400]);
  assert.equal(tail.events.at(-1).text.endsWith('400'), true);
  const earlier = store.readEvents(id, { tail: true, beforeSeq: 398, limit: 3 });
  assert.deepEqual(earlier.events.map(e => e.seq), [395,396,397]);
});
