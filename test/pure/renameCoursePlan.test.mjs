import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  previewFingerprint,
  countsFromPreview,
  diffAgainstPreview,
  codeTaken,
  detectRenameState,
  RENAME_STATE,
  RENAME_WRITE_STORES,
} from '@/lib/courses/renameCoursePlan';

/**
 * The rename's decisions, driven for real: may it run, does it still agree with
 * what the admin was shown, and is a previous attempt half-finished.
 *
 * Every case here is one production cannot show us — nobody has renamed a
 * course yet, so there is no collision to observe, no divergence in flight and
 * no interrupted run to inspect. They are fixtures precisely because they are
 * the states the action exists to refuse.
 */

const counts = (over = {}) => {
  const base = Object.fromEntries(RENAME_WRITE_STORES.map((k) => [k, 0]));
  return { ...base, ...over };
};

// ── The preview token ───────────────────────────────────────────────────────

test('the fingerprint is stable for the same facts, whatever the key order', () => {
  const a = previewFingerprint({ oldCode: 'MSE-L1', newCode: 'X', counts: { article: 3, promotion: 1 } });
  const b = previewFingerprint({ oldCode: 'MSE-L1', newCode: 'X', counts: { promotion: 1, article: 3 } });
  assert.equal(a, b);
});

test('the fingerprint changes when ANY store count changes', () => {
  const before = previewFingerprint({ oldCode: 'A', newCode: 'B', counts: counts({ article: 3 }) });
  for (const key of RENAME_WRITE_STORES) {
    const after = previewFingerprint({ oldCode: 'A', newCode: 'B', counts: counts({ article: 3, [key]: 9 }) });
    assert.notEqual(after, before, `a change to ${key} did not move the fingerprint`);
  }
});

test('the fingerprint changes when either code changes', () => {
  const base = previewFingerprint({ oldCode: 'A', newCode: 'B', counts: counts() });
  assert.notEqual(previewFingerprint({ oldCode: 'A', newCode: 'C', counts: counts() }), base);
  assert.notEqual(previewFingerprint({ oldCode: 'Z', newCode: 'B', counts: counts() }), base);
});

test('NOT READ fingerprints differently from ZERO', () => {
  // "nobody looked" must not be able to masquerade as "nothing to change" —
  // that is the whole preview-first property.
  const read = previewFingerprint({ oldCode: 'A', newCode: 'B', counts: counts({ article: 0 }) });
  const unread = previewFingerprint({ oldCode: 'A', newCode: 'B', counts: { ...counts(), article: null } });
  assert.notEqual(read, unread);
});

test('the fingerprint is not a constant, and covers every write store', () => {
  const f = previewFingerprint({ oldCode: 'A', newCode: 'B', counts: counts() });
  for (const key of RENAME_WRITE_STORES) assert.ok(f.includes(key), `${key} is not in the fingerprint`);
  assert.ok(!RENAME_WRITE_STORES.includes('registerPublic'), 'a historical store leaked into the write set');
  assert.ok(!RENAME_WRITE_STORES.includes('careerPathRegistration'));
});

test('countsFromPreview reads the preview shape the action passes it', () => {
  const preview = { stores: [{ key: 'article', count: 18 }, { key: 'promotion', count: 3 }] };
  assert.deepEqual(countsFromPreview(preview), { article: 18, promotion: 3 });
  assert.deepEqual(countsFromPreview({}), {});
});

// ── Divergence ──────────────────────────────────────────────────────────────

test('matching counts are no divergence', () => {
  const d = diffAgainstPreview(counts({ article: 18 }), counts({ article: 18 }));
  assert.equal(d.ok, true);
  assert.deepEqual(d.divergences, []);
});

test('a store that wrote MORE than promised is a divergence, and is named', () => {
  const d = diffAgainstPreview(counts({ article: 18 }), counts({ article: 19 }));
  assert.equal(d.ok, false);
  assert.deepEqual(d.divergences, [{ store: 'article', expected: 18, actual: 19 }]);
});

test('a store that wrote FEWER is also a divergence', () => {
  const d = diffAgainstPreview(counts({ coursePromoLink: 2 }), counts({ coursePromoLink: 0 }));
  assert.equal(d.ok, false);
  assert.equal(d.divergences[0].store, 'coursePromoLink');
});

test('an absent actual reads as 0, not as agreement', () => {
  const d = diffAgainstPreview(counts({ article: 1 }), {});
  assert.equal(d.ok, false);
});

// ── Collision, including formerCodes ────────────────────────────────────────

test('a free code is not taken', () => {
  assert.deepEqual(
    codeTaken('NEW-CODE', { liveCodes: ['MSE-L1'], formerCodes: ['OLD-1'] }),
    { taken: false, where: null, matched: null }
  );
});

test('a LIVE code is taken, and the stored spelling is reported', () => {
  const r = codeTaken('mse-l1', { liveCodes: ['MSE-L1'] });
  assert.equal(r.taken, true);
  assert.equal(r.where, 'live');
  assert.equal(r.matched, 'MSE-L1');
});

/**
 * A RETIRED CODE IS TAKEN TOO, and this is the case the whole field exists for.
 *
 * Reusing one resurrects an ambiguity that is still reachable: an old link, an
 * old quotation, and `/search`'s own formerCodes match would now land on a
 * DIFFERENT course than the customer meant.
 */
test('a FORMER code is taken', () => {
  const r = codeTaken('OLD-1', { liveCodes: ['MSE-L1'], formerCodes: ['OLD-1'] });
  assert.equal(r.taken, true);
  assert.equal(r.where, 'former');
  assert.equal(r.matched, 'OLD-1');
});

test('former-code collision is case-insensitive', () => {
  assert.equal(codeTaken('old-1', { formerCodes: ['OLD-1'] }).taken, true);
});

test("a course's OWN code is not a collision — that is the course being renamed", () => {
  assert.equal(codeTaken('MSE-L1', { liveCodes: ['MSE-L1'], exceptCode: 'MSE-L1' }).taken, false);
  assert.equal(codeTaken('mse-l1', { liveCodes: ['MSE-L1'], exceptCode: 'MSE-L1' }).taken, false);
});

test('renaming BACK to a code this course used to hold is allowed', () => {
  // A legitimate undo. `exceptCode` is the course's current code, so its own
  // former codes are only excluded when they match it — this pins the case
  // where the admin reverses a rename they just made.
  const r = codeTaken('OLD-1', { formerCodes: ['OLD-1'], exceptCode: 'OLD-1' });
  assert.equal(r.taken, false);
});

test('a blank code is not "taken" — that is a different error', () => {
  assert.equal(codeTaken('', { liveCodes: ['MSE-L1'] }).taken, false);
  assert.equal(codeTaken(null, { liveCodes: ['MSE-L1'] }).taken, false);
});

// ── The two-sided state model ───────────────────────────────────────────────

/**
 * `detectPartialRename` became `detectRenameState` when upstream joined the
 * inputs, because the old name described one of six answers. The rename is not
 * cosmetic: before this, `complete` was returned for a rename whose MSDB half
 * had never happened — the screen reporting success on exactly the failure it
 * exists to catch.
 */

const up = (hasOldCode, hasNewCode) => ({ hasOldCode, hasNewCode });
const at = (o = {}, n = {}, upstream = up(true, false)) =>
  detectRenameState({ oldCounts: counts(o), newCounts: counts(n), upstream });

test('neither side moved → not started', () => {
  const d = at({ article: 3 }, {}, up(true, false));
  assert.equal(d.state, RENAME_STATE.NOT_STARTED);
  assert.equal(d.genesis, 'old');
});

/**
 * THE NORMAL INTERVAL, and the state that used to be called `complete`.
 *
 * Genesis rows are all on the new code and MSDB is not. Everything looks
 * finished from the genesis side, which is precisely why upstream has to be
 * consulted before the word `complete` is used.
 */
test('genesis done, upstream NOT → the interval, and it is NOT complete', () => {
  const d = at({}, { article: 3 }, up(true, false));
  assert.equal(d.state, RENAME_STATE.UPSTREAM_PENDING);
  assert.notEqual(d.state, RENAME_STATE.COMPLETE);
  assert.equal(d.genesis, 'new');
});

test('BOTH sides on the new code → complete', () => {
  const d = at({}, { article: 3 }, up(false, true));
  assert.equal(d.state, RENAME_STATE.COMPLETE);
});

/**
 * THE STATE OBSERVED ON THE REAL SITE, 2026-08-16.
 *
 * MSDB was renamed with genesis untouched. Not a half-finished phase 1 — the
 * reverse — and it needs its own name because the advice is the opposite: this
 * one can be undone by renaming MSDB back.
 */
test('upstream moved, genesis did NOT → upstream-only, and it is not partial', () => {
  const d = at({ article: 3 }, {}, up(false, true));
  assert.equal(d.state, RENAME_STATE.UPSTREAM_ONLY);
  assert.equal(d.partial, false, 'the reverse divergence must not read as an interrupted phase 1');
  assert.equal(d.genesis, 'old');
});

test('genesis rows on BOTH codes → genesis-partial, with the unfinished stores NAMED', () => {
  const d = at({ scheduleLocal: 4, article: 18 }, { courseExtension: 1, programOrder: 1 }, up(true, false));
  assert.equal(d.state, RENAME_STATE.GENESIS_PARTIAL);
  assert.equal(d.partial, true);
  assert.deepEqual(d.stillOnOldCode.sort(), ['article', 'scheduleLocal'].sort());
  assert.deepEqual(d.alreadyOnNewCode.sort(), ['courseExtension', 'programOrder'].sort());
});

test('an interrupted phase 1 stays partial even once upstream has moved', () => {
  // The fix is the same either way — re-run phase 1 — so the most actionable
  // state wins over the upstream axis.
  const d = at({ article: 1 }, { courseExtension: 1 }, up(false, true));
  assert.equal(d.state, RENAME_STATE.GENESIS_PARTIAL);
});

test('upstream holding BOTH codes is a conflict, not a rename in progress', () => {
  const d = at({ article: 3 }, {}, up(true, true));
  assert.equal(d.state, RENAME_STATE.UPSTREAM_CONFLICT);
});

test('upstream holding NEITHER code is unknown, not "not started"', () => {
  const d = at({ article: 3 }, {}, up(false, false));
  assert.equal(d.state, RENAME_STATE.UNKNOWN);
});

// ── Reversibility ───────────────────────────────────────────────────────────

/**
 * THE ONE FACT THAT TELLS AN ADMIN WHETHER TO GO FORWARD OR BACK.
 *
 * Established by experiment: an upstream-only divergence undoes COMPLETELY by
 * renaming MSDB back, because genesis never moved. Once genesis has written it
 * does not — the reverse rename is refused by its own collision and formerCodes
 * guards.
 */
test('REVERSIBLE exactly while genesis has not written', () => {
  assert.equal(at({ article: 3 }, {}, up(false, true)).reversible, true, 'upstream-only must be reversible');
  assert.equal(at({ article: 3 }, {}, up(true, false)).reversible, true, 'not-started has nothing to undo');
  assert.equal(at({}, {}, up(true, false)).reversible, true, 'no genesis rows at all');

  assert.equal(at({}, { article: 3 }, up(true, false)).reversible, false, 'the interval is NOT reversible');
  assert.equal(at({}, { article: 3 }, up(false, true)).reversible, false, 'a completed rename is not reversible');
  assert.equal(at({ article: 1 }, { promotion: 1 }, up(true, false)).reversible, false, 'a partial wrote something');
});

test('reversibility tracks the GENESIS side, not the upstream one', () => {
  // Same genesis position, both upstream positions → same answer.
  assert.equal(at({ article: 1 }, {}, up(true, false)).reversible, at({ article: 1 }, {}, up(false, true)).reversible);
  assert.equal(at({}, { article: 1 }, up(true, false)).reversible, at({}, { article: 1 }, up(false, true)).reversible);
});

// ── Upstream not read ───────────────────────────────────────────────────────

test('with NO upstream reading, the state is unknown rather than guessed', () => {
  // Absent is not the same as "upstream has neither" — a caller that forgot to
  // pass it must not receive a confident answer.
  const d = detectRenameState({ oldCounts: counts({ article: 1 }), newCounts: counts() });
  assert.equal(d.state, RENAME_STATE.UNKNOWN);
  assert.equal(d.upstream.read, false);
});

test('a reading is marked as read, even when both answers are false', () => {
  const d = at({ article: 1 }, {}, up(false, false));
  assert.equal(d.upstream.read, true);
  assert.deepEqual(
    { hasOldCode: d.upstream.hasOldCode, hasNewCode: d.upstream.hasNewCode },
    { hasOldCode: false, hasNewCode: false }
  );
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: every declared state is reachable', () => {
  const seen = new Set([
    at({ article: 1 }, {}, up(true, false)).state,
    at({}, { article: 1 }, up(true, false)).state,
    at({}, { article: 1 }, up(false, true)).state,
    at({ article: 1 }, {}, up(false, true)).state,
    at({ article: 1 }, { promotion: 1 }, up(true, false)).state,
    at({ article: 1 }, {}, up(true, true)).state,
    at({ article: 1 }, {}, up(false, false)).state,
  ]);
  for (const s of Object.values(RENAME_STATE)) {
    assert.ok(seen.has(s), `${s} is unreachable — it can never be shown`);
  }
  assert.equal(seen.size, Object.keys(RENAME_STATE).length, 'the detector collapses states together');
});

test('CONTROL: the two axes are independent — neither alone decides the state', () => {
  // Same genesis, different upstream → different state.
  assert.notEqual(at({}, { article: 1 }, up(true, false)).state, at({}, { article: 1 }, up(false, true)).state);
  // Same upstream, different genesis → different state.
  assert.notEqual(at({ article: 1 }, {}, up(false, true)).state, at({}, { article: 1 }, up(false, true)).state);
});
