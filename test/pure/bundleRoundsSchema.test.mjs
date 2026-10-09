import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sectionSchema } from '@/lib/schemas/pageBuilder';
// ADDED beside the statement above rather than folded into it. The reader half
// of the same claim: the schema normalises on SAVE, these normalise on READ.
import {
  offeredRoundsOf,
  chooseItemRound,
  chooseItemRounds,
} from '@/lib/pageBuilder/chosenRounds';

/**
 * The item's new `rounds[]` shape, and the legacy `roundId` it must still read.
 *
 * ── WHY THIS IS AT THE SCHEMA BOUNDARY AND NOT AT A READ SITE ────────────
 * MEASURED before the change: 91 stored items across all three places a page's
 * sections live, every one on the legacy shape and none on the new one. So the
 * preprocess is not a compatibility nicety, it is the only reason any stored
 * bundle still renders — and the place to assert it is the parse, because that
 * is the single point every reader comes through.
 */

const section = (content) => ({
  id: 'sec-1',
  type: 'promotion_bundle',
  name: '',
  enabled: true,
  sortOrder: 0,
  content,
});

const parse = (content) => {
  const r = sectionSchema.safeParse(section(content));
  if (!r.success) {
    throw new Error('parse failed: ' + JSON.stringify(r.error.issues.map((i) => [i.path.join('.'), i.message])));
  }
  return r.data.content;
};

const parseFails = (content) => sectionSchema.safeParse(section(content)).success === false;

// ── the legacy shape normalises ─────────────────────────────────────────────

test('a LEGACY item (roundId + roundSnapshot) normalises to one offered round', () => {
  const snap = { id: 'r1', dates: ['2026-11-12'], type: 'onsite' };
  const out = parse({
    items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r1', roundSnapshot: snap }],
  });
  assert.deepEqual(out.items[0].rounds, [{ id: 'r1', snapshot: snap }]);
  assert.equal('roundId' in out.items[0], false, 'the legacy key does not survive the parse');
  assert.equal('pickUntil' in out.items[0].rounds[0], false, 'a legacy round carries no deadline');
});

test('a legacy item with a roundId and NO snapshot normalises too', () => {
  const out = parse({ items: [{ id: 'i1', courseId: 'C', roundId: 'r1' }] });
  assert.deepEqual(out.items[0].rounds, [{ id: 'r1' }]);
});

test('a legacy item with an EMPTY roundId becomes zero offered rounds, not one bad one', () => {
  // An author who added a course and never chose a round. `min(1)` on the id
  // would refuse `{ id: '' }`, so this must not produce one.
  for (const roundId of ['', '   ', undefined]) {
    const out = parse({ items: [{ id: 'i1', courseId: 'C', roundId }] });
    assert.deepEqual(out.items[0].rounds, [], `roundId=${JSON.stringify(roundId)}`);
  }
});

test('a legacy roundId is TRIMMED on the way in', () => {
  const out = parse({ items: [{ id: 'i1', courseId: 'C', roundId: '  r1  ' }] });
  assert.deepEqual(out.items[0].rounds, [{ id: 'r1' }]);
});

test('the preprocess does NOT touch an item that already has rounds[]', () => {
  // Including the mixed case a half-migrated document could show: both keys
  // present. `rounds` wins and the legacy key is dropped, never merged — two
  // sources for one fact is the thing this avoids.
  const out = parse({
    items: [{
      id: 'i1', courseId: 'C',
      roundId: 'LEGACY', roundSnapshot: { id: 'LEGACY', dates: [], type: '' },
      rounds: [{ id: 'r9' }],
    }],
  });
  assert.deepEqual(out.items[0].rounds, [{ id: 'r9' }]);
});

test('an item with an EMPTY rounds array is left empty, not re-derived from roundId', () => {
  const out = parse({ items: [{ id: 'i1', courseId: 'C', roundId: 'r1', rounds: [] }] });
  assert.deepEqual(out.items[0].rounds, [], 'an explicit empty list is an answer');
});

// ── the new shape ──────────────────────────────────────────────────────────

test('several offered rounds are kept in the authors order', () => {
  const out = parse({
    items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r3' }, { id: 'r1' }, { id: 'r2' }] }],
  });
  assert.deepEqual(out.items[0].rounds.map((r) => r.id), ['r3', 'r1', 'r2']);
});

test('pickUntil is accepted as YYYY-MM-DD and refused otherwise', () => {
  const out = parse({ items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r1', pickUntil: '2026-10-31' }] }] });
  assert.equal(out.items[0].rounds[0].pickUntil, '2026-10-31');

  for (const bad of ['2026-10-3', '31/10/2026', '2026-10-31T00:00:00Z', 'soon', '', 42, null]) {
    assert.equal(
      parseFails({ items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r1', pickUntil: bad }] }] }),
      true, `pickUntil ${JSON.stringify(bad)} must be refused at the boundary`,
    );
  }
});

test('an absent pickUntil is not written into the parsed round', () => {
  const out = parse({ items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r1' }] }] });
  assert.equal('pickUntil' in out.items[0].rounds[0], false);
});

test('an offered round with no id is refused', () => {
  assert.equal(parseFails({ items: [{ id: 'i1', courseId: 'C', rounds: [{ id: '' }] }] }), true);
});

test('the offered-round list is capped at 12', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}` }));
  assert.equal(parse({ items: [{ id: 'i1', courseId: 'C', rounds: twelve }] }).items[0].rounds.length, 12);
  assert.equal(
    parseFails({ items: [{ id: 'i1', courseId: 'C', rounds: [...twelve, { id: 'r12' }] }] }),
    true, 'a thirteenth is refused',
  );
});

test('an offered round is a CLOSED object — a status can never be stored on it', () => {
  // The snapshot shape's standing prohibition, restated at this boundary
  // because the pick rules ask about status on every render and a stored one
  // would be a second, stale answer.
  const out = parse({
    items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r1', snapshot: { id: 'r1', dates: [], type: '', status: 'open', signup_url: 'x' } }] }],
  });
  assert.equal('status' in out.items[0].rounds[0].snapshot, false);
  assert.equal('signup_url' in out.items[0].rounds[0].snapshot, false);
});

// ── sequential ─────────────────────────────────────────────────────────────

test('sequential defaults to false and both values round-trip', () => {
  assert.equal(parse({ items: [] }).sequential, false, 'absent reads as the behaviour it has today');
  assert.equal(parse({ items: [], sequential: true }).sequential, true);
  assert.equal(parse({ items: [], sequential: false }).sequential, false);
});

test('sequential refuses a non-boolean rather than coercing it', () => {
  for (const bad of ['true', 1, 0, null, {}]) {
    assert.equal(parseFails({ items: [], sequential: bad }), true, `sequential=${JSON.stringify(bad)}`);
  }
});

// ── the readers normalise RAW documents, which is the load-bearing half ─────

test('offeredRoundsOf normalises a RAW legacy item — nothing parses on read', () => {
  // The claim this file exists for. `sectionSchema.parse` runs on SAVE; every
  // public surface reads the page with .lean() and never parses it. So a reader
  // that trusted the preprocess alone would find `rounds` undefined for all 91
  // stored items.
  const snap = { id: 'r1', dates: ['2026-11-12'], type: 'onsite' };
  assert.deepEqual(
    offeredRoundsOf({ id: 'i1', courseId: 'C', roundId: 'r1', roundSnapshot: snap }),
    [{ id: 'r1', snapshot: snap }],
  );
  assert.deepEqual(offeredRoundsOf({ id: 'i1', roundId: 'r1' }), [{ id: 'r1' }]);
  assert.deepEqual(offeredRoundsOf({ id: 'i1', roundId: '  ' }), []);
  assert.deepEqual(offeredRoundsOf({ id: 'i1' }), []);
});

test('offeredRoundsOf prefers rounds[] and never merges the legacy key in', () => {
  assert.deepEqual(
    offeredRoundsOf({ roundId: 'LEGACY', rounds: [{ id: 'r9' }] }),
    [{ id: 'r9' }],
  );
  assert.deepEqual(offeredRoundsOf({ roundId: 'LEGACY', rounds: [] }), []);
});

test('offeredRoundsOf tolerates every broken shape and never mutates', () => {
  for (const v of [undefined, null, 0, '', [], {}, { rounds: 7 }, { rounds: [null, 3, {}] }]) {
    assert.doesNotThrow(() => offeredRoundsOf(v), `${JSON.stringify(v)}`);
  }
  assert.deepEqual(offeredRoundsOf({ rounds: [null, 3, { id: 'r1' }] }), [{ id: 'r1' }]);
  const item = { rounds: [{ id: 'r1' }] };
  const before = JSON.stringify(item);
  offeredRoundsOf(item);
  assert.equal(JSON.stringify(item), before, 'the input must not be mutated');
});

test('the SCHEMA and the READER agree on a legacy item', () => {
  // Two moments, one definition — the whole point of sharing the function.
  const raw = { id: 'i1', courseId: 'C', roundId: 'r1', roundSnapshot: { id: 'r1', dates: ['2026-11-12'], type: 'onsite' } };
  assert.deepEqual(parse({ items: [raw] }).items[0].rounds, offeredRoundsOf(raw));
});

test('chooseItemRounds returns all offered rounds and carries pickUntil through', () => {
  const rows = [
    { _id: 'r1', dates: ['2026-11-12'], type: 'onsite', status: 'open' },
    { _id: 'r2', dates: ['2026-12-10'], type: 'online', status: 'full' },
  ];
  const out = chooseItemRounds(
    rows,
    { id: 'i1', rounds: [{ id: 'r1', pickUntil: '2026-10-31' }, { id: 'r2' }] },
    '2026-10-08',
  );
  assert.deepEqual(out.map((r) => r.id), ['r1', 'r2'], 'the author order is kept');
  assert.equal(out[0].pickUntil, '2026-10-31');
  assert.equal(out[1].pickUntil, undefined);
  assert.equal(out[0].state, 'live');
  assert.equal(out[0].live.status, 'open', 'the LIVE row is carried, status and all');
});

test('chooseItemRound is still the FIRST offered round — legacy surfaces unchanged', () => {
  const rows = [{ _id: 'r1', dates: ['2026-11-12'], type: 'onsite', status: 'open' }];
  const legacy = { id: 'i1', courseId: 'C', roundId: 'r1' };
  const one = chooseItemRound(rows, legacy, '2026-10-08');
  assert.equal(one?.id, 'r1');
  // And it agrees with the list form, so the two cannot drift.
  assert.deepEqual(one, chooseItemRounds(rows, legacy, '2026-10-08')[0]);
});

test('a rolled-off offered round still draws from its snapshot', () => {
  // The never-silently-dropped rule, now across a list rather than one round.
  const out = chooseItemRounds(
    [],
    { id: 'i1', rounds: [{ id: 'r1', snapshot: { id: 'r1', dates: ['2026-11-12'], type: 'onsite' } }] },
    '2026-10-08',
  );
  assert.equal(out.length, 1, 'the round is not dropped');
  assert.equal(out[0].state, 'missing');
  assert.equal(out[0].live, null, 'and it carries no live row, so no status');
});
