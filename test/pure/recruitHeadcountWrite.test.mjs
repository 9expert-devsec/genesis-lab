import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetFakeDb, all, seed } from '../fakeDb.mjs';
import { createRecruit, updateRecruit } from '@/lib/actions/recruits';
import { MAX_HEADCOUNT } from '@/lib/recruitHeadcount';

/**
 * THE SERVER DOES NOT TRUST THE PAYLOAD.
 *
 * ══ WHY THIS EXECUTES THE ACTION INSTEAD OF READING IT ══════════════════════
 * The claim is behavioural: "a value that never went through the input is
 * normalised before it is stored". A source scan can see that
 * `normalizeHeadcount` is CALLED; it cannot see that the call is on the write
 * path rather than beside it, that its result is what reaches the payload, or
 * that an empty submission ends up as null rather than as 0. Those are the
 * things that break, and the only way to ask them is to run the action and look
 * at what landed. test/fakeDb.mjs exists for exactly this.
 *
 * ── ONE PARENT, AWAITED SUBTESTS — SEQUENTIAL BY CONSTRUCTION ───────────────
 * Copied from test/pure/avatarWrite rather than reinvented, and the first
 * draft of this file is why. It used top-level tests with a `beforeEach` that
 * called resetFakeDb, which reads correctly and does not isolate: the runner
 * drives files with `concurrency: true`, top-level tests start together, and
 * the shared module-level store accumulated rows across them — measured, three
 * postings where the test expected one. Nested awaited subtests cannot
 * interleave, so the reset at the top of each scenario actually holds.
 *
 * ── THE FAKE IS STRICTER THAN PRODUCTION HERE, ON PURPOSE ───────────────────
 * The model is stubbed, so Mongoose's own casting does NOT run: real Mongoose
 * would quietly turn a stray '3.7' on a Number path into 3.7 before it reached
 * the database. That would mask the bug rather than fix it — leaning on schema
 * casting IS trusting the payload, one layer further down. With the fake,
 * whatever the action hands over is what gets stored, so an assertion that the
 * stored value is `null` is an assertion that THE ACTION decided so.
 *
 * ── WHAT IT STILL CANNOT SEE ────────────────────────────────────────────────
 * Mongo's own behaviour: index constraints, cast errors on a real Number path,
 * and whether `null` round-trips as null rather than as a missing field. Named
 * in the round report as unverified.
 */

const BASE = {
  title: 'Data Analyst',
  description: 'ทำงานกับข้อมูล',
};

const only = () => {
  const rows = all('Recruit');
  assert.equal(rows.length, 1, `expected exactly one posting, found ${rows.length}`);
  return rows[0];
};

/**
 * Payloads that never went near the input.
 *
 * `min="1" step="1" max` on the <input> are a convenience for whoever is
 * typing. This action is reachable by anyone with a session and a fetch call,
 * and none of those attributes travel with the request.
 */
const BYPASS = [
  ['a fraction', '3.7'],
  ['a fraction as a number', 3.7],
  ['a negative', '-2'],
  ['zero', 0],
  ['text', 'abc'],
  ['over the cap', MAX_HEADCOUNT + 1],
  ['an array that would coerce', [5]],
  ['a boolean that would coerce', true],
  ['an object', { n: 3 }],
];

test('the recruit write path, executed', async (t) => {
  /** One case, with the shared fake database reset first. */
  const scenario = (name, fn) => t.test(name, async () => {
    resetFakeDb();
    await fn();
  });

  // ── the blank submission ──────────────────────────────────────────────────
  await scenario('a blank submission stores null — not 0, and not the empty string', async () => {
    // What the form actually sends when the admin leaves the field alone: the
    // input's own value, which is ''. `Number('')` is 0, so the naive version
    // of this stores a real headcount for a posting that declared none, and the
    // public card then renders "จำนวน 0 ตำแหน่ง".
    const res = await createRecruit({ ...BASE, headcount: '' });
    assert.equal(res.ok, true, res.error);
    const doc = only();
    assert.equal(doc.headcount, null, `stored ${JSON.stringify(doc.headcount)}`);
    assert.notEqual(doc.headcount, 0, 'an empty input became a real headcount of 0');
    assert.notEqual(doc.headcount, '', 'the empty string was stored verbatim');
  });

  await scenario('a submission with the key absent altogether also stores null', async () => {
    // Not the same path: '' goes through the string branch, `undefined` through
    // the nullish one. A payload built anywhere but this form omits the key.
    const res = await createRecruit({ ...BASE });
    assert.equal(res.ok, true, res.error);
    assert.equal(only().headcount, null);
  });

  await scenario('a real headcount is stored as a NUMBER, not the string it arrived as', async () => {
    // The input is type="number" but its value is still a string. If the action
    // passed it through, the field would hold '3' and every render site would
    // be comparing and formatting a string.
    const res = await createRecruit({ ...BASE, headcount: '3' });
    assert.equal(res.ok, true, res.error);
    const doc = only();
    assert.equal(doc.headcount, 3);
    assert.equal(typeof doc.headcount, 'number', `stored a ${typeof doc.headcount}`);
  });

  // ── payloads that never went near the input ───────────────────────────────
  for (const [label, value] of BYPASS) {
    await scenario(`create: ${label} is normalised by the SERVER, not stored raw`, async () => {
      const res = await createRecruit({ ...BASE, headcount: value });
      assert.equal(res.ok, true, res.error);
      const doc = only();
      assert.equal(doc.headcount, null,
        `${JSON.stringify(value)} was stored as ${JSON.stringify(doc.headcount)}`);
    });
  }

  await scenario('create: the cap boundary is enforced server-side, inclusive', async () => {
    // Both sides, so "the cap is enforced" cannot be satisfied by rejecting
    // everything large including the legal value.
    assert.equal((await createRecruit({ ...BASE, headcount: MAX_HEADCOUNT })).ok, true);
    assert.equal(only().headcount, MAX_HEADCOUNT);
    resetFakeDb();
    assert.equal((await createRecruit({ ...BASE, headcount: MAX_HEADCOUNT + 1 })).ok, true);
    assert.equal(only().headcount, null);
  });

  // ── the update path ───────────────────────────────────────────────────────
  await scenario('update: clearing the input sets the stored value back to null', async () => {
    const created = await createRecruit({ ...BASE, headcount: 5 });
    assert.equal(only().headcount, 5);
    const res = await updateRecruit(created.data._id, { headcount: '' });
    assert.equal(res.ok, true, res.error);
    assert.equal(only().headcount, null, 'the old value survived being cleared');
  });

  await scenario('update: a bypassing payload is normalised on the way in', async () => {
    const created = await createRecruit({ ...BASE, headcount: 5 });
    for (const [label, value] of BYPASS) {
      // eslint-disable-next-line no-await-in-loop
      const res = await updateRecruit(created.data._id, { headcount: value });
      assert.equal(res.ok, true, res.error);
      assert.equal(only().headcount, null, `${label} was written through`);
      // Put a real value back, so the next case has something to overwrite and
      // a no-op update cannot pass as a successful clear.
      // eslint-disable-next-line no-await-in-loop
      await updateRecruit(created.data._id, { headcount: 5 });
      assert.equal(only().headcount, 5);
    }
  });

  await scenario('update: OMITTING the key leaves the stored value alone', async () => {
    // The file's existing contract for every other field: `!== undefined` means
    // "was submitted". A partial update from elsewhere must not silently clear
    // a headcount it never mentioned — the difference between "not sent" and
    // "sent empty", and the reason the form always sends the key.
    const created = await createRecruit({ ...BASE, headcount: 5 });
    const res = await updateRecruit(created.data._id, { title: 'Data Analyst II' });
    assert.equal(res.ok, true, res.error);
    const doc = only();
    assert.equal(doc.headcount, 5, 'an unrelated edit cleared the headcount');
    assert.equal(doc.title, 'Data Analyst II', 'the edit that WAS made did not land');
  });

  // ── the legacy posting ────────────────────────────────────────────────────
  await scenario('a posting written before this field existed round-trips unchanged', async () => {
    // No migration and no backfill: the field simply is not there. Editing an
    // unrelated part of such a posting must not invent one, and must not fail.
    //
    // SEEDED rather than created-then-deleted: `all()` hands back clones, so
    // deleting the key off one would change nothing in the store and the test
    // would pass against a document that still had the field — a false green in
    // exactly the direction that matters.
    const legacy = seed('Recruit', {
      slug: 'legacy-analyst',
      title: 'Legacy Analyst',
      description: 'เขียนไว้ก่อนมีฟิลด์นี้',
      employmentType: 'full-time',
      active: true,
      order: 0,
    });
    assert.equal('headcount' in only(), false, 'the fixture is not actually legacy-shaped');

    const res = await updateRecruit(legacy._id, { title: 'Renamed' });
    assert.equal(res.ok, true, res.error);
    const after = only();
    assert.equal(after.title, 'Renamed');
    assert.equal('headcount' in after, false,
      'an unrelated edit invented a headcount field on a legacy posting');
    assert.equal(after.headcount, undefined);
  });

  // ── CONTROL ───────────────────────────────────────────────────────────────
  await scenario('CONTROL: the action really writes, and this test reads it back', async () => {
    // Every assertion above is `stored value === null`. If the action never
    // wrote anything, `only()` would throw on the row count — but if it wrote a
    // document with no headcount key at all, `doc.headcount` would be
    // `undefined`, and under NON-strict equal `undefined == null` passes. This
    // file imports node:assert/strict so it would not; asserted anyway, because
    // that single substitution would make the whole file vacuous.
    const res = await createRecruit({ ...BASE, headcount: '7' });
    assert.equal(res.ok, true, res.error);
    const doc = only();
    assert.equal(doc.headcount, 7, 'the write path stored nothing');
    assert.notEqual(doc.headcount, null);
    assert.throws(() => assert.equal(undefined, null),
      'strict equal is not in force — undefined would pass as null everywhere above');
  });

  await scenario('CONTROL: the reset really isolates — rows do not carry over', async () => {
    // The defect the first draft of this file had. If resetFakeDb were not
    // reached (or the subtests interleaved), every `only()` above would be
    // reading a store filled by its predecessors, and the failures would look
    // like the action writing too much rather than like the harness leaking.
    assert.equal(all('Recruit').length, 0, 'the store was not empty at scenario start');
    await createRecruit({ ...BASE });
    assert.equal(all('Recruit').length, 1);
  });
});
