import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * The wiring the pure tier cannot reach: that the two actions which change a
 * course's visibility actually EXECUTE the plan, and hand it the right inputs.
 *
 * `saveCourseExtension` and `deleteCourseExtension` are 'use server' modules
 * whose first line is `requireAdmin` — next-auth → next/headers — over a live
 * Mongo connection, so neither is callable under the verification loader. The
 * decision they delegate to is tested behaviourally in
 * test/pure/publishVisibilityPlan; these guards pin that the delegation exists
 * and is fed correctly, which is the part a source read can honestly claim.
 *
 * This class of defect has now shipped four times in this repo — landing,
 * navmenu, instructors, promotions — always as a write that reached Mongo and
 * never reached a visitor. Toggling เผยแพร่ / ซ่อน is the same shape: it changes
 * what every listing should show, and every listing bakes its output.
 */

const ACTIONS = 'src/lib/actions/course-extensions.js';

test('both actions run the visibility plan', () => {
  const { code, withImports } = readSource(ACTIONS);
  assert.match(
    withImports,
    /import \{ planVisibilityRevalidation \} from '@\/lib\/courses\/publishVisibilityPlan'/
  );
  // Read from `code`, so the import line alone cannot satisfy it. Exactly two:
  // one per action. A third would be a branch nobody has reasoned about.
  assert.equal(countCallSites(code, 'planVisibilityRevalidation'), 2);
});

test('the save path plans from the RAW before-document, not the audit summary', () => {
  /**
   * `extensionFields` coerces a missing `isPublished` to `false` — correct for
   * an audit line that reports a boolean, and wrong here, because the plan's
   * whole premise is that an ABSENT flag means visible. Feeding it the summary
   * would make the first save of any extension that lacks the field read as a
   * hide, and fire a full layout revalidation on an ordinary SEO edit.
   */
  const { code } = readSource(ACTIONS);
  assert.match(code, /const beforeDoc = await CourseExtension\.findOne\(\{ courseId \}\)\.lean\(\);/);
  assert.match(code, /const before = extensionFields\(beforeDoc\);/);

  /**
   * ── `after` MOVED FROM `update` TO `doc`, AND THAT IS THE POINT NOW ───────
   * This line used to assert `after: update`. It no longer can, and the change
   * is deliberate rather than incidental.
   *
   * `update` became PARTIAL: the action now writes only the keys a caller
   * actually named, so omission means leave-alone instead of clear (the
   * omisePaymentEnabled incident). A partial object is exactly the wrong input
   * for THIS plan, for the same reason the summary was: `isVisible` reads
   * `isPublished !== false`, so a MISSING flag reads as visible. Feeding it a
   * partial update would make any caller that omits the flag look like a
   * hide→show flip and fire the full layout revalidation on an ordinary edit —
   * the identical failure this test's own docstring describes, arriving from a
   * third direction.
   *
   * `doc` is the post-write document from `{ new: true }`, so it carries the
   * EFFECTIVE state of every field, written or carried forward. It was the more
   * correct argument even before; now it is the only correct one.
   */
  assert.match(code, /before: beforeDoc,\s*after: doc,/);
  assert.doesNotMatch(
    code, /before: beforeDoc,\s*after: update,/,
    'the plan is back on the PARTIAL update object',
  );
});

test('CONTROL: the audit trail still gets the SUMMARY, not the raw document', () => {
  // The two consumers want different shapes off the same read. If this ever
  // becomes `before: beforeDoc` the audit line starts logging whole gallery
  // arrays, which is the truncation case extensionFields exists to avoid.
  const { code } = readSource(ACTIONS);
  assert.match(code, /\n\s*before,\n/, 'recordAdminActionAfter is passed the summary');
  assert.match(code, /after:\s*extensionFields\(doc\)/);
});

test('the delete path plans with after: null — no extension means visible', () => {
  // Deleting the row that carried isPublished:false un-hides the course, so the
  // listings that were told to drop it have to be told to put it back.
  const { code } = readSource(ACTIONS);
  assert.match(code, /before: removed,\s*after: null,/);
});

test('the plan is executed, not merely computed', () => {
  // A plan whose result is dropped on the floor is the exact failure mode the
  // sync writers shipped: the decision was right and nothing acted on it.
  const { code } = readSource(ACTIONS);
  const executions = code.match(/for \(const \{ path, type \} of planVisibilityRevalidation\(/g) ?? [];
  assert.equal(executions.length, 2, 'both call sites loop over the plan');
  const loops = code.match(/\)\.paths\) \{\s*revalidatePath\(path, type\);\s*\}/g) ?? [];
  assert.equal(loops.length, 2, 'and both bodies call revalidatePath');
});

test('the four original per-course revalidations are still there', () => {
  // The new layout revalidation is ADDITIONAL. If it ever replaced them, a
  // visibility flip would regenerate the listings while the course's own admin
  // editor and detail page kept serving the previous state — which is the
  // original defect with the surfaces swapped.
  const { code } = readSource(ACTIONS);
  assert.match(code, /revalidatePath\(ADMIN_PATH\);/);
  assert.match(code, /revalidatePath\(`\$\{ADMIN_PATH\}\/\$\{courseId\}`\);/);
  assert.match(code, /if \(cleanAlias\) revalidatePath\(cleanAlias\);/);
  assert.match(code, /revalidatePath\(`\/\$\{courseId\.toLowerCase\(\)\}-training-course`\);/);
});

test('the scope matches the one the cache-writer round measured', () => {
  // Same `('/', 'layout')` as syncNavMenuData and syncCareerPaths, for the same
  // reason: PublicHeader mounts from three places with no shared URL prefix.
  // Asserted on the PLAN module, which is where the literal lives — one
  // definition, not a copy in each action.
  const { code } = readSource('src/lib/courses/publishVisibilityPlan.js');
  assert.match(code, /paths: \[\{ path: '\/', type: 'layout' \}\]/);
});

test('CONTROL: that scope literal appears in the writers this copied', () => {
  // Guards against pinning a string that exists nowhere else — the shape an
  // "absent" assertion takes when it silently becomes decorative.
  for (const rel of ['src/lib/navmenu/syncNavMenuData.js', 'src/lib/career-paths/syncCareerPaths.js']) {
    const { code } = readSource(rel);
    assert.match(code, /revalidatePath\('\/', 'layout'\)/, `${rel} uses the same scope`);
  }
});

test('the plan module stays dependency-free, so it can be tested at all', () => {
  // Same rule as courseRevalidatePlan.js: no next/cache, no db, no models. The
  // moment it imports one of those it stops being unit-testable and the
  // decision goes back to being observable only by reading source.
  const { withImports } = readSource('src/lib/courses/publishVisibilityPlan.js');
  for (const banned of ['next/cache', '@/lib/db/', '@/models/', 'mongoose']) {
    assert.ok(!withImports.includes(banned), `${banned} must not be imported here`);
  }
  assert.ok(!/^import /m.test(withImports), 'it imports nothing at all');
});
