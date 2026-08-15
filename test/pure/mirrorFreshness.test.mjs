import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseMirror } from '@/lib/cache-console/mirrorFreshness';

/**
 * Freshness arithmetic for the four mirror collections.
 *
 * There is no per-collection status document and no cron route writes any
 * model, so `max(synced_at)` is the only freshness signal these collections
 * have. Everything derived from it is INFERRED — the console has to say so, and
 * these tests pin what the numbers actually mean so the copy cannot drift away
 * from the arithmetic.
 */

const T = (iso) => ({ synced_at: iso });

test('a healthy collection: every row stamped by the same run', () => {
  const rows = [T('2026-08-12T03:00:00.000Z'), T('2026-08-12T03:00:00.000Z'), T('2026-08-12T03:00:00.000Z')];
  assert.deepEqual(summariseMirror(rows), {
    count: 3,
    newest: '2026-08-12T03:00:00.000Z',
    staleRows: 0,
    neverSynced: 0,
  });
});

test('a row the last run did not touch shows as stale', () => {
  // The only available signal that a record may no longer exist upstream,
  // because no sync deletes.
  const rows = [
    T('2026-08-12T03:00:00.000Z'),
    T('2026-08-12T03:00:00.000Z'),
    T('2026-05-01T09:00:00.000Z'),
  ];
  const s = summariseMirror(rows);
  assert.equal(s.count, 3);
  assert.equal(s.staleRows, 1);
  assert.equal(s.newest, '2026-08-12T03:00:00.000Z');
});

test('CONTROL: the same three rows all-current give staleRows 0', () => {
  // Without this, "staleRows is 1" would also pass against an implementation
  // that returned count-1, or 1, or anything else constant.
  const rows = [
    T('2026-08-12T03:00:00.000Z'),
    T('2026-08-12T03:00:00.000Z'),
    T('2026-08-12T03:00:00.000Z'),
  ];
  assert.equal(summariseMirror(rows).staleRows, 0);
});

test('sub-second spread within one run is NOT counted as stale', () => {
  // A sync writes its rows in a loop. The shaped payloads take one `syncedAt`
  // per run, but reading them back through Mongo's date precision is not worth
  // trusting to the millisecond — a 1s tolerance keeps a healthy run from
  // reporting every row but one as stale.
  const rows = [
    T('2026-08-12T03:00:00.000Z'),
    T('2026-08-12T03:00:00.400Z'),
    T('2026-08-12T03:00:00.999Z'),
  ];
  assert.equal(summariseMirror(rows).staleRows, 0);
});

test('CONTROL: just past the tolerance IS counted', () => {
  // Proves the tolerance is a boundary and not an unconditional pass.
  const rows = [T('2026-08-12T03:00:00.000Z'), T('2026-08-12T03:00:01.500Z')];
  assert.equal(summariseMirror(rows).staleRows, 1);
});

test('"never stamped" is counted apart from "stamped by an older run"', () => {
  // Different facts. A row with no synced_at was never seen by a sync at all;
  // an older stamp means a sync ran and skipped it. Folding them together
  // would report a collection the sync has never touched as fully stale.
  const rows = [T('2026-08-12T03:00:00.000Z'), T(null), { }, T('bogus')];
  const s = summariseMirror(rows);
  assert.equal(s.count, 4);
  assert.equal(s.neverSynced, 3, 'null, missing and unparseable all count here');
  assert.equal(s.staleRows, 0, 'and none of them inflates the stale count');
});

test('a collection with no stamped rows at all reports newest: null', () => {
  const s = summariseMirror([T(null), {}]);
  assert.equal(s.newest, null);
  assert.equal(s.count, 2);
  assert.equal(s.neverSynced, 2);
  assert.equal(s.staleRows, 0);
});

test('an empty collection is zeros and a null, not a throw', () => {
  assert.deepEqual(summariseMirror([]), {
    count: 0, newest: null, staleRows: 0, neverSynced: 0,
  });
});

test('a non-array in is treated as empty', () => {
  for (const input of [null, undefined, 'x', 7, {}]) {
    assert.equal(summariseMirror(input).count, 0);
  }
});

test('Date objects work as well as ISO strings', () => {
  // Mongo hands back Dates through .lean(); the console serialises to ISO.
  // Both shapes reach this function depending on the call path.
  const rows = [
    { synced_at: new Date('2026-08-12T03:00:00.000Z') },
    { synced_at: new Date('2026-01-01T00:00:00.000Z') },
  ];
  const s = summariseMirror(rows);
  assert.equal(s.newest, '2026-08-12T03:00:00.000Z');
  assert.equal(s.staleRows, 1);
});

test('newest is always ISO, whatever went in', () => {
  // The console renders this verbatim; a locale-formatted string here would
  // make the column unsortable and timezone-ambiguous.
  const s = summariseMirror([{ synced_at: new Date('2026-08-12T03:00:00.000Z') }]);
  assert.match(s.newest, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
