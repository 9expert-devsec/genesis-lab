import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  previewFingerprint,
  countsFromPreview,
  diffAgainstPreview,
  codeTaken,
  detectPartialRename,
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

// ── Half-finished detection ─────────────────────────────────────────────────

test('rows only on the OLD code → not started', () => {
  const d = detectPartialRename({ oldCounts: counts({ article: 3 }), newCounts: counts() });
  assert.equal(d.state, 'not-started');
  assert.equal(d.partial, false);
});

test('rows only on the NEW code → complete', () => {
  const d = detectPartialRename({ oldCounts: counts(), newCounts: counts({ article: 3 }) });
  assert.equal(d.state, 'complete');
  assert.equal(d.partial, false);
});

/**
 * THE CASE THAT MAKES RESUMABILITY REAL.
 *
 * Idempotent steps are worth nothing if an interruption is invisible: the admin
 * sees a failed request and cannot tell whether it wrote nothing, everything,
 * or the first four stores. Naming the stores still on the old code is what
 * turns "re-run it" into an instruction rather than a hope.
 */
test('rows on BOTH → partial, and the unfinished stores are NAMED', () => {
  const d = detectPartialRename({
    oldCounts: counts({ scheduleLocal: 4, article: 18 }),
    newCounts: counts({ courseExtension: 1, programOrder: 1 }),
  });
  assert.equal(d.state, 'partial');
  assert.equal(d.partial, true);
  assert.deepEqual(d.stillOnOldCode.sort(), ['article', 'scheduleLocal'].sort());
  assert.deepEqual(d.alreadyOnNewCode.sort(), ['courseExtension', 'programOrder'].sort());
});

test('rows on neither → empty, which is not a partial', () => {
  const d = detectPartialRename({ oldCounts: counts(), newCounts: counts() });
  assert.equal(d.state, 'empty');
  assert.equal(d.partial, false);
});

test('CONTROL: the four states are genuinely distinct', () => {
  const seen = new Set([
    detectPartialRename({ oldCounts: counts({ article: 1 }), newCounts: counts() }).state,
    detectPartialRename({ oldCounts: counts(), newCounts: counts({ article: 1 }) }).state,
    detectPartialRename({ oldCounts: counts({ article: 1 }), newCounts: counts({ promotion: 1 }) }).state,
    detectPartialRename({ oldCounts: counts(), newCounts: counts() }).state,
  ]);
  assert.equal(seen.size, 4, 'the detector collapses states together');
});
