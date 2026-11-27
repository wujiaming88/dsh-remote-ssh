import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, realpathSync, appendFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
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

test('streaming iteration matches forward reads, filters without paging and preserves Unicode and torn-tail handling', async t => {
  const store = fixture(t), id = 'streaming';
  for (let seq = 1; seq <= 600; seq++) store.appendEvent(id, event(seq, 'row-' + seq + '-🙂'.repeat(500)));
  appendFileSync(store.historyPath(id), '{"eventVersion":1,"seq":');
  const expected = store.readEvents(id, { limit: 1000 }).events;
  const streamed = [];
  for await (const ev of store.streamEvents(id)) streamed.push(ev);
  assert.deepEqual(streamed, expected);
  const filtered = [];
  for await (const ev of store.streamEvents(id, { sinceSeq: 50, beforeSeq: 55 })) filtered.push(ev.seq);
  assert.deepEqual(filtered, [51,52,53,54]);
});

test('streaming yields a valid unterminated final record and retries event-directory creation failures', async t => {
  const store = fixture(t), id = 'unterminated';
  store.appendEvent(id, event(1));
  appendFileSync(store.historyPath(id), JSON.stringify(event(2, 'final-without-newline')));
  const seen = []; for await (const ev of store.streamEvents(id)) seen.push(ev.seq);
  assert.deepEqual(seen, [1,2]);
  const blocked = fixture(t), directory = blocked.path + '.events';
  writeFileSync(directory, 'not a directory');
  await assert.rejects(blocked.appendEvents('retry', [event(1)]), error => ['EEXIST','ENOTDIR'].includes(error.code));
  assert.equal(blocked.eventDirectoryReady, null);
  unlinkSync(directory); await blocked.appendEvents('retry', [event(1)]);
  assert.deepEqual(blocked.readEvents('retry').events.map(ev => ev.seq), [1]);
});

test('streaming iteration applies journal validation and promptly propagates abort reasons', async t => {
  const store = fixture(t), id = 'stream-validation';
  store.appendEvent(id, event(1));
  appendFileSync(store.historyPath(id), '\n{"eventVersion":2,"generation":"g","seq":2,"type":"text"}\n');
  await assert.rejects(async () => { for await (const ev of store.streamEvents(id)) void ev; }, { code: 'history_schema_unsupported' });

  const other = 'stream-abort';
  for (let seq = 1; seq <= 20; seq++) store.appendEvent(other, event(seq));
  const controller = new AbortController(), seen = [];
  await assert.rejects(async () => {
    for await (const ev of store.streamEvents(other, { signal: controller.signal })) {
      seen.push(ev.seq);
      if (seen.length === 3) controller.abort(Error('stop streaming'));
    }
  }, /stop streaming/);
  assert.deepEqual(seen, [1,2,3]);
});

test('async batch appends preserve exact journal bytes and reject an invalid batch before writing', async t => {
  const store = fixture(t), id = 'batch', first = event(1, 'first'), second = event(2, 'second🙂');
  await store.appendEvents(id, [first, second]);
  const expected = '\n' + JSON.stringify(first) + '\n\n' + JSON.stringify(second) + '\n';
  assert.equal(readFileSync(store.historyPath(id), 'utf8'), expected);
  await store.appendEvents(id, []);
  assert.equal(readFileSync(store.historyPath(id), 'utf8'), expected);
  await assert.rejects(store.appendEvents(id, [event(3), { ...event(4), eventVersion: 2 }]), { code: 'history_schema_unsupported' });
  await assert.rejects(store.appendEvents(id, [event(3)], []), { code: 'history_corrupt' });
  await assert.rejects(store.appendEvents(id, [event(3)], [null]), { code: 'history_corrupt' });
  assert.equal(readFileSync(store.historyPath(id), 'utf8'), expected);
  const third = event(3, 'serialized');
  await store.appendEvents(id, [third], [JSON.stringify(third)]);
  assert.equal(readFileSync(store.historyPath(id), 'utf8'), expected + '\n' + JSON.stringify(third) + '\n');
  assert.deepEqual(store.readEvents(id).events, [first, second, third]);
});
