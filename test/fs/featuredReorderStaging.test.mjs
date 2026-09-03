import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceForScanning } from '../sourceScan.mjs';

/**
 * Deferred (staged) reorder for the featured-list family — the shape this
 * round moved featured-courses, featured-online-courses and featured-reviews
 * to, matching courses/_components/CoursesAdminClient.jsx's ProgramGroupBody
 * (dirty/error/saving, explicit save+cancel, resetItems on cancel).
 *
 * SOURCE-SHAPE GUARDS, not behavioural ones — stated plainly rather than
 * implied. This runner has no jsdom (see
 * test/render/courseEditorUnsavedGuard.test.mjs's own header for the same
 * limit elsewhere in this suite), so a real drag/drop or a real click cannot
 * be simulated here. What CAN be checked, and is checked below: that the
 * code a drop and a save actually RUN is shaped the way the ticket asked for
 * — a drop touches no server action, a save batches with allSettled and a
 * failure never advances the saved baseline, cancel never writes, and a
 * channel splice arriving mid-drag is queued rather than applied. Nothing
 * here proves the browser actually behaves this way at runtime; that is a
 * click-test, and this file says so rather than claiming otherwise.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const raw = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
// Comments AND imports stripped — every assertion below is about the RUNTIME
// shape of a function body, and an import line or a comment mentioning
// persistReorder/Promise.all would otherwise satisfy a naive substring check.
const body = (rel) => readSourceForScanning(path.join(ROOT, rel));

const SCREENS = [
  {
    menu: 'featured-courses',
    list: 'src/app/admin/featured-courses/_components/FeaturedCourseList.jsx',
    varName: 'courses',
  },
  {
    menu: 'featured-online-courses',
    list: 'src/app/admin/featured-online-courses/_components/FeaturedOnlineCourseList.jsx',
    varName: 'courses',
  },
  {
    menu: 'featured-reviews',
    list: 'src/app/admin/featured-reviews/_components/FeaturedReviewList.jsx',
    varName: 'items',
  },
];

/** The body of a named function, from its declaration to its matching close. */
function extractFunction(code, name) {
  const start = code.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const braceStart = code.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return code.slice(start, i + 1);
}

for (const { menu, list, varName } of SCREENS) {
  const code = body(list);

  // ── R1a: a drop performs no write ────────────────────────────────────────

  test(`${menu}: useDragReorder's onReorder only sets dirty — no write on drop`, () => {
    assert.match(
      code,
      new RegExp(`useDragReorder\\(initial,\\s*\\(\\)\\s*=>\\s*setDirty\\(true\\)\\)`),
      'onReorder is not the flag-setter shape — a drop may be writing again'
    );
  });

  test(`${menu}: the old immediate-write persistReorder helper is gone`, () => {
    assert.doesNotMatch(code, /persistReorder/, 'the pre-staging write-on-drop helper is still present');
  });

  test(`${menu}: handleReorder (↑/↓) is a synchronous local swap — no write`, () => {
    const fn = extractFunction(code, 'handleReorder');
    assert.ok(fn, 'handleReorder is gone');
    assert.doesNotMatch(fn, /await/, 'handleReorder still awaits something — it should be synchronous now');
    assert.doesNotMatch(fn, /update(FeaturedCourse|FeaturedOnlineCourse|FeaturedReview)\(/, 'handleReorder still calls the update action directly');
    assert.match(fn, /setDirty\(true\)/, 'handleReorder does not stage — nothing marks the list unsaved');
  });

  // ── R1b: Promise.allSettled, not Promise.all, for the save batch ────────

  test(`${menu}: the save batch uses Promise.allSettled`, () => {
    assert.match(code, /Promise\.allSettled\(/, 'no allSettled batch found — was Promise.all kept instead?');
  });

  test(`${menu}: CONTROL — Promise.all (paired, throws-on-first-rejection) is not used anywhere`, () => {
    // The pre-staging handleReorder used Promise.all for its two-row swap —
    // exactly the shape whose partial failure was silent. Proves it is gone,
    // not merely that allSettled was ADDED alongside it.
    assert.doesNotMatch(code, /Promise\.all\(/, 'a Promise.all call survives — a partial failure there is still silent');
  });

  // ── R1b/R1d: failure leaves the list staged; cancel never writes ────────

  test(`${menu}: a failed save reports the error but does not advance the baseline or clear dirty`, () => {
    const fn = extractFunction(code, 'handleSave');
    assert.ok(fn, 'handleSave is gone');
    const failStart = fn.indexOf('if (failed.length > 0)');
    assert.notEqual(failStart, -1, 'the partial/total-failure branch is gone');
    const failBranch = fn.slice(failStart, fn.indexOf('return;', failStart) + 'return;'.length);
    assert.match(failBranch, /setError\(/, 'a failed save does not report which rows failed');
    assert.doesNotMatch(failBranch, /setDirty\(false\)/, 'a failed save clears dirty — the retry affordance is gone');
    assert.doesNotMatch(failBranch, /baselineRef\.current\s*=/, 'a failed save advances the baseline — a retry would then re-diff against the wrong order');
  });

  test(`${menu}: cancel reverts to the baseline and performs no write`, () => {
    const fn = extractFunction(code, 'cancel');
    assert.ok(fn, 'cancel is gone');
    assert.match(fn, /resetItems\(baselineRef\.current\)/, 'cancel does not revert to the saved baseline');
    assert.match(fn, /setDirty\(false\)/);
    assert.doesNotMatch(fn, /update(FeaturedCourse|FeaturedOnlineCourse|FeaturedReview)\(/, 'cancel calls the update action — it should write nothing');
  });

  // ── R1e: a channel splice cannot land into a dirty list ──────────────────

  test(`${menu}: a channel splice arriving while dirty is queued, not applied`, () => {
    const sinkStart = code.indexOf('useAddedRowSink((doc)');
    assert.notEqual(sinkStart, -1, 'the AddedRowChannel sink is gone');
    const sinkEnd = code.indexOf('});', sinkStart) + '});'.length;
    const sink = code.slice(sinkStart, sinkEnd);
    assert.match(sink, /if\s*\(dirty\)\s*\{/, 'the sink does not check dirty before applying a splice');
    assert.match(sink, /setPendingAdds\(/, 'a dirty-time splice is not queued anywhere');
    // The dirty branch must return BEFORE the insertFeaturedRow splice runs.
    const dirtyBranch = sink.slice(sink.indexOf('if (dirty)'), sink.indexOf('return;') + 'return;'.length);
    assert.doesNotMatch(dirtyBranch, /insertFeaturedRow/, 'the queued branch still splices the row in directly');
  });

  // ── R1g: the dead sentinel is gone ───────────────────────────────────────

  test(`${menu}: the dead '__reorder__' busyId sentinel is gone`, () => {
    assert.doesNotMatch(code, /__reorder__/, "the sentinel survives — nothing anywhere ever compared against it (repo-wide grep, see this round's report)");
  });

  // ── R1h: exactly one call in the save batch carries the sync ────────────

  test(`${menu}: exactly one call in the save batch is NOT marked skipSync`, () => {
    assert.match(code, /skipSync['"]?,\s*i\s*===\s*0\s*\?\s*['"]false['"]\s*:\s*['"]true['"]/, 'the one-call-syncs shape is gone — R1h (collapse to one sync per save) may no longer hold');
  });
}

// ── R1c: updateFeaturedCourse's callers, and the return-shape change ───────

test('featured-courses: handleToggle checks ok:false before applying its optimistic flip', () => {
  const code = body('src/app/admin/featured-courses/_components/FeaturedCourseList.jsx');
  const fn = extractFunction(code, 'handleToggle');
  assert.ok(fn, 'handleToggle is gone');
  assert.match(fn, /res\?\.ok === false/, 'handleToggle no longer checks the refusal — updateFeaturedCourse can now return {ok:false} instead of throwing, and this is the only thing that keeps a failed toggle from showing as succeeded');
});

test('updateFeaturedCourse returns {ok:false, error} on a write failure instead of throwing', () => {
  const code = body('src/lib/actions/featured-courses.js');
  const fn = extractFunction(code, 'updateFeaturedCourse');
  assert.ok(fn, 'updateFeaturedCourse is gone');
  assert.match(fn, /catch\s*\(err\)\s*\{\s*return\s*\{\s*ok:\s*false/, 'no try/catch returning {ok:false} — a Mongo failure is still an unhandled rejection');
});

// ── CONTROL: the pre-staging shape really would fail every check above ────

test('CONTROL: the pre-staging shape (write-on-drop, no cancel, no dirty state) fails the presence checks', () => {
  const preStaging = `
export function FeaturedCourseList({ courses: initial }) {
  async function persistReorder(newOrder, prevOrder) {
    const updates = newOrder.map((c) => updateFeaturedCourse(c._id, new FormData()));
    if (updates.length > 0) await Promise.all(updates);
  }
  const { items: courses, setItems: setCourses, getDragProps } = useDragReorder(initial, async (next, prev) => {
    setCourses(next);
    setBusyId('__reorder__');
    try { await persistReorder(next, prev); } finally { setBusyId(null); }
  });
  useAddedRowSink((doc) => setCourses((cur) => insertFeaturedRow(cur, doc)));
  async function handleReorder(course, direction) {
    await Promise.all([updateFeaturedCourse(a._id, fdA), updateFeaturedCourse(b._id, fdB)]);
  }
}`;
  assert.doesNotMatch(preStaging, /useDragReorder\(initial,\s*\(\)\s*=>\s*setDirty\(true\)\)/);
  assert.match(preStaging, /persistReorder/);
  assert.match(preStaging, /Promise\.all\(/);
  assert.match(preStaging, /__reorder__/);
  assert.doesNotMatch(preStaging, /if\s*\(dirty\)\s*\{/);
});
