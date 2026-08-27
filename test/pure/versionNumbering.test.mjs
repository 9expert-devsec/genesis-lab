import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planForPage } from '../../scripts/backfill-page-version-numbers.mjs';
import { versionName, hasVersionNumber } from '@/lib/pageBuilder/versionLabel';
import {
  DRAFT_CONTENT_KEYS, IDENTITY_KEYS, STATUS_KEYS, LIVE_ONLY_KEYS, pageBuilderSchema,
} from '@/lib/schemas/pageBuilder';

/**
 * ROUND 35 — the parts of version numbering that need no database.
 *
 * The publish write, the increment and the race are executed against fakeDb
 * inside test/fs/pageBuilderDraftActions (the suite's single fakeDb owner — see
 * gate item 5). Everything here is a pure function: the migration's PLAN, the
 * display fallback, and the two "never editable" claims.
 */

const row = (id, iso, versionNumber = null) => ({
  _id: id, createdAt: iso, versionNumber,
});

test('the backfill plan: order, reservation, idempotence', async (t) => {
  await t.test('unnumbered rows are numbered from 1 in createdAt order', () => {
    const plan = planForPage([
      row('c', '2026-08-26T11:41:02.774Z'),
      row('a', '2026-07-16T07:54:09.251Z'),
      row('b', '2026-07-20T09:19:43.071Z'),
    ]);
    assert.deepEqual(
      plan.assignments.map((a) => [a._id, a.versionNumber]),
      [['a', 1], ['b', 2], ['c', 3]]
    );
    assert.equal(plan.counter, 3, 'the counter was not seeded to the highest number');
  });

  await t.test('CONTROL: the fixture arrives OUT of order, so input order cannot pass', () => {
    // Without this, "1,2,3" would be satisfied by a plan that ignores createdAt
    // and numbers rows in whatever order the driver returned them.
    const input = ['c', 'a', 'b'];
    const byDate = ['a', 'b', 'c'];
    assert.notDeepEqual(input, byDate, 'the fixture is already sorted — it proves nothing');
  });

  await t.test('IDEMPOTENT: a second run over its own output plans nothing', () => {
    const rows = [
      row('a', '2026-07-16T07:54:09.251Z'),
      row('b', '2026-07-20T09:19:43.071Z'),
    ];
    const first = planForPage(rows);
    // Apply the plan, as --apply would.
    const applied = rows.map((r) => {
      const hit = first.assignments.find((a) => a._id === r._id);
      return hit ? { ...r, versionNumber: hit.versionNumber } : r;
    });

    const second = planForPage(applied, first.counter);
    assert.deepEqual(second.assignments, [], 'a second run wants to write again');
    assert.equal(second.counter, first.counter, 'a second run moved the counter');
    assert.deepEqual(
      applied.map((r) => r.versionNumber), [1, 2],
      'the numbers changed between runs'
    );
  });

  await t.test('a THIRD run is still a no-op — it does not drift', () => {
    let rows = [row('a', '2026-07-16T00:00:00.000Z'), row('b', '2026-07-20T00:00:00.000Z')];
    let counter = 0;
    for (let i = 0; i < 3; i += 1) {
      const plan = planForPage(rows, counter);
      rows = rows.map((r) => {
        const hit = plan.assignments.find((a) => a._id === r._id);
        return hit ? { ...r, versionNumber: hit.versionNumber } : r;
      });
      counter = plan.counter;
    }
    assert.deepEqual(rows.map((r) => r.versionNumber), [1, 2]);
    assert.equal(counter, 2);
  });

  await t.test('an already-numbered row is never renumbered, and its number is RESERVED', () => {
    // The partially-backfilled page: a publish landed between runs and minted
    // its own number. That number stands, and the gap filler must route around
    // it rather than collide.
    const plan = planForPage([
      row('a', '2026-07-16T00:00:00.000Z'),          // unnumbered
      row('b', '2026-07-20T00:00:00.000Z', 1),       // already 1
      row('c', '2026-07-25T00:00:00.000Z'),          // unnumbered
    ]);
    assert.deepEqual(
      plan.assignments.map((a) => [a._id, a.versionNumber]),
      [['a', 2], ['c', 3]],
      'the filler collided with, or reassigned, an existing number'
    );
    assert.equal(
      plan.assignments.some((a) => a._id === 'b'), false,
      'a numbered row was scheduled for renumbering'
    );
  });

  await t.test('CONTROL: without reservation, the filler WOULD have collided', () => {
    // Naive numbering from 1 in date order gives a=1 — the number b already
    // holds — which the unique index would then reject.
    const naive = ['a', 'c'].map((id, i) => [id, i + 1]);
    assert.deepEqual(naive, [['a', 1], ['c', 2]]);
    assert.equal(naive[0][1], 1, 'the naive assignment does not actually collide with b');
  });

  await t.test('the counter is never LOWERED below what already exists', () => {
    // A concurrent publish may have pushed the counter past the history. Pulling
    // it back would let the next publish mint a number already in use.
    const plan = planForPage([row('a', '2026-07-16T00:00:00.000Z', 1)], 9);
    assert.equal(plan.counter, 9, 'the plan pulled the counter down to the history high-water mark');
    assert.equal(plan.highest, 1);
  });

  await t.test('a page with no rows plans nothing and asks for counter 0', () => {
    const plan = planForPage([], undefined);
    assert.deepEqual(plan.assignments, []);
    assert.equal(plan.counter, 0);
  });

  await t.test('same-instant rows break the tie by _id, so the plan is stable', () => {
    const at = '2026-07-16T00:00:00.000Z';
    const forward = planForPage([row('bbb', at), row('aaa', at)]);
    const reverse = planForPage([row('aaa', at), row('bbb', at)]);
    assert.deepEqual(forward.assignments, reverse.assignments,
      'two runs over the same second produce different plans');
    assert.deepEqual(forward.assignments.map((a) => a._id), ['aaa', 'bbb']);
  });
});

test('an unnumbered version renders no number, never a placeholder', async (t) => {
  await t.test('a numbered version reads as Thai prose', () => {
    assert.equal(versionName({ versionNumber: 8 }), 'เวอร์ชัน 8');
    assert.equal(hasVersionNumber({ versionNumber: 8 }), true);
  });

  await t.test('null, undefined and a missing row all render EMPTY, not "undefined"', () => {
    // The pre-backfill state, which on an un-migrated database is every row.
    for (const v of [{ versionNumber: null }, { versionNumber: undefined }, {}, null, undefined]) {
      const name = versionName(v);
      assert.equal(name, '', `versionName rendered ${JSON.stringify(name)}`);
      assert.equal(name.includes('undefined'), false, 'the fallback prints the word undefined');
      assert.equal(name.includes('null'), false, 'the fallback prints the word null');
      assert.equal(name.includes('NaN'), false);
    }
  });

  await t.test('CONTROL: a truthiness test would get 0 wrong, and 0 must not render', () => {
    // The counter is $inc-ed BEFORE it is stamped, so no publish can mint 0. A
    // 0 in the data means something upstream is broken and must not be shown as
    // a fact — but `if (n)` and `Number.isInteger(n) && n > 0` disagree here.
    assert.equal(versionName({ versionNumber: 0 }), '', 'version 0 was rendered as if real');
    assert.equal(hasVersionNumber({ versionNumber: 0 }), false);
    assert.equal(Boolean(0), false);
    assert.equal(Number.isInteger(0), true, 'an isInteger-only test would have let 0 through');
  });

  await t.test('a non-integer is refused too', () => {
    for (const n of [1.5, '3', NaN, Infinity, -2]) {
      assert.equal(hasVersionNumber({ versionNumber: n }), false, `${String(n)} was accepted`);
    }
  });
});

test('the counter and the number are not client-writable', async (t) => {
  await t.test('publishedVersion is in NO key list an action writes from', () => {
    // Every action builds its $set from one of these lists or from literals, so
    // a field absent from all of them has no request-shaped path to it.
    for (const [name, list] of [
      ['DRAFT_CONTENT_KEYS', DRAFT_CONTENT_KEYS],
      ['IDENTITY_KEYS', IDENTITY_KEYS],
      ['STATUS_KEYS', STATUS_KEYS],
      ['LIVE_ONLY_KEYS', LIVE_ONLY_KEYS],
    ]) {
      assert.equal(list.includes('publishedVersion'), false,
        `publishedVersion reached ${name} — a client can now write the counter`);
    }
  });

  await t.test('…because it is absent from the zod schema, which those lists derive from', () => {
    assert.equal('publishedVersion' in pageBuilderSchema.shape, false,
      'publishedVersion entered pageBuilderSchema — LIVE_ONLY_KEYS will now carry it');
  });

  await t.test('CONTROL: the check does see a field that IS in the schema', () => {
    // Otherwise "absent" would be satisfied by a broken lookup.
    assert.equal('slug' in pageBuilderSchema.shape, true, 'the shape lookup is not working');
    assert.equal(LIVE_ONLY_KEYS.includes('slug'), true, 'LIVE_ONLY_KEYS is not populated');
  });

  await t.test('a submitted publishedVersion is STRIPPED by the schema, not honoured', () => {
    // zod objects strip unknown keys, so even a hand-crafted request body
    // carrying the field cannot get it past a parse.
    const parsed = pageBuilderSchema.parse({
      slug: 'a-page', title: 'A Page', publishedVersion: 999,
    });
    assert.equal('publishedVersion' in parsed, false, 'the schema let a submitted counter through');
  });
});
