import { test } from 'node:test';
import assert from 'node:assert/strict';

import { walkSources, readSource } from '../sourceScan.mjs';

/**
 * Course order is owned by the origin. Nothing else may decide it.
 *
 * ── WHY THIS GUARD ASKS A DIFFERENT QUESTION THAN IT ORIGINALLY WOULD ──────
 * The first design ordered courses at each of eleven surfaces, and the only
 * question a source scan could ask was "does this surface mention the
 * comparator" — co-presence, which passes for a surface that calls it and drops
 * the result, or calls it with the wrong category's list.
 *
 * Ordering moved INTO listPublicCourses, the single origin of every course list
 * in this codebase. That makes both of those regressions unreachable rather than
 * guarded, and changes the question this file can ask to one that is actually
 * checkable: DOES ANYTHING SORT COURSES OUTSIDE THE ORIGIN?
 *
 * ── WHAT THIS GUARD CAN SEE ────────────────────────────────────────────────
 *   1. the comparator is defined in exactly one module
 *   2. the origin applies it, on EVERY path, above the `includeHidden` return
 *   3. no file that imports the origin re-sorts what the origin returned
 *
 * ── THE RESIDUAL HOLE, NAMED ───────────────────────────────────────────────
 * A SURFACE THAT RE-SORTS OR RE-GROUPS AFTER THE ORIGIN. Course arrays reach
 * components as PROPS, and a component that receives an ordered array and sorts
 * it again is not an importer of the origin, so check 3 never sees it. A source
 * scan also cannot tell a `.sort(` that re-orders courses from one that orders
 * the GROUPS those courses were bucketed into — the second is legitimate and
 * common.
 *
 * The two known legitimate group-sorts, examined and CLEARED, so the next
 * reader knows which calls were looked at rather than re-deriving it:
 *
 *   · training-course/_components/CourseListClient.jsx:74 and :126 — sorts the
 *     PROGRAMME GROUPS by ProgramOrder rank and then Thai locale, and the
 *     distinct programme names for the filter. The courses inside each group
 *     are pushed in array order, i.e. the order the origin supplied.
 *   · training-course/_components/CourseTableGroup.jsx (added in 73b0ac3) —
 *     re-groups for the table view. Same shape: groups move, courses do not.
 *
 * If either ever starts sorting the courses themselves, this file will not
 * notice. That is the honest limit of a source guard over a props hand-off, and
 * it is the reason the origin — not this file — is what makes the order correct.
 *
 * WHAT IT ALSO CANNOT SEE: whether the STORED list is sensible. A category
 * whose courseOrder is nonsense produces a nonsense page and every assertion
 * here passes.
 */

const ORIGIN = 'src/lib/api/public-courses.js';
const COMPARATOR = 'src/lib/courses/courseOrder.js';

const FILES = walkSources('src');
const importsOrigin = (f) =>
  f.rel !== ORIGIN && /from\s+['"][^'"]*api\/public-courses['"]/.test(f.withImports);

/**
 * An ARRAY sort whose argument is a comparator function.
 *
 * Mongo's `.sort({ field: 1 })` takes an object and is a query sort, not a
 * re-ordering of a list the origin returned — excluding it by argument SHAPE
 * rather than by filename keeps the rule mechanical.
 */
const arraySorts = (code) =>
  [...code.matchAll(/\.sort\(\s*(\(|function|[A-Za-z_$][\w$]*\s*(,|\)))/g)];

/**
 * Origin importers whose array `.sort(` is examined and cleared, with the
 * reason. An entry here is a RULING, and it is visible in a diff — which is the
 * point, since a source scan cannot make this judgement itself.
 */
const CLEARED = new Map([
  // Sorts the FAQ BUCKETS it just derived — `{ref_id, name, href, total}` rows —
  // alphabetically for the admin picker. Never a course array; the course names
  // are looked up into those rows, not ordered.
  ['src/app/admin/local-faqs/page.jsx', 'sorts derived FAQ buckets by name, not courses'],
]);
// NOTE for whoever adds the next entry: Mongo's `.sort({ field: 1 })` needs no
// ruling. `arraySorts` excludes it by ARGUMENT SHAPE, so course-extensions and
// searchCorpus — both of which sort documents out of the database — never reach
// this map. Only an in-memory array sort does.

test('the comparator is defined in exactly ONE module', () => {
  // Two implementations of "what order are courses in" is how the mega menu and
  // the programme page start disagreeing, silently, because R4 seeded them
  // identical.
  const owners = FILES
    .filter((f) => /export function (makeCategoryComparator|makeGlobalComparator|compareUnlisted)\b/.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(owners, [COMPARATOR], `comparator logic leaked into: ${owners.join(', ')}`);
});

test('the origin applies the order on every path', () => {
  const { code } = readSource(ORIGIN);
  assert.match(code, /orderCoursesInCategory\(/, 'the filtered branches must order');
  assert.match(code, /orderCoursesGlobally\(/, 'the unfiltered branch must order');
  assert.match(code, /const order = await loadOrder\(\)/, 'the order must be read');
});

test('the order is applied ABOVE the includeHidden early return', () => {
  /**
   * The one that cannot be got wrong quietly. THIRTEEN of the twenty-five call
   * sites pass `includeHidden: true`, including syncNavMenuData — the entire
   * mega menu — and syncLandingData. Below the return, those surfaces keep
   * upstream's order, and because the seed captured that same order the mistake
   * looks correct until the first time someone rearranges a category.
   */
  const { code } = readSource(ORIGIN);
  const applied = code.indexOf('const order = await loadOrder()');
  const earlyReturn = code.indexOf('if (includeHidden) return result;');
  assert.ok(applied !== -1 && earlyReturn !== -1, 'both landmarks must exist');
  assert.ok(
    applied < earlyReturn,
    'the ordering sits BELOW the includeHidden early return — the mega menu and '
    + 'syncLandingData would serve upstream order, and the seed hides it'
  );
});

test('the origin takes NO opt-out parameter', () => {
  // Ruled: the order is a property of the origin, not a request a caller may
  // decline. "Did this caller opt out, and should it have?" is unanswerable
  // from source, which is exactly the hole ordering at the origin closes.
  const { code } = readSource(ORIGIN);
  for (const escape of [/skipOrder/, /unordered/, /noOrder/, /rawOrder/]) {
    assert.ok(!escape.test(code), `an opt-out (${escape}) appeared in the origin`);
  }
});

test('nothing that imports the origin re-sorts what it returned', () => {
  /**
   * The check that replaced co-presence. An origin importer holding an array
   * `.sort(` is either re-deciding the order — which the origin now owns — or
   * sorting something else, and the second needs a ruling recorded in CLEARED
   * so the judgement is visible in a diff rather than made silently by whoever
   * reads the file next.
   */
  const offenders = [];
  for (const f of FILES) {
    if (!importsOrigin(f)) continue;
    if (!arraySorts(f.code).length) continue;
    if (CLEARED.has(f.rel)) continue;
    offenders.push(f.rel);
  }
  assert.deepEqual(
    offenders, [],
    'these import the origin AND sort an array — the origin owns course order, so '
    + 'either remove the sort or record a ruling in CLEARED:\n  ' + offenders.join('\n  ')
  );
});

test('the scan is not vacuous — it sees the origin, its importers, and their sorts', () => {
  // Every assertion above passes over an empty set if the import probe stops
  // matching. Pinned loosely enough to survive a new page, tightly enough to
  // fail if the walk breaks.
  const importers = FILES.filter(importsOrigin).map((f) => f.rel);
  assert.ok(importers.length >= 20, `only ${importers.length} origin importers found`);
  assert.ok(importers.includes('src/lib/navmenu/syncNavMenuData.js'), 'the mega menu must be in the class');
  assert.ok(importers.includes('src/lib/landing/syncLandingData.js'));

  // And the cleared entries must still be real, so a stale ruling is noticed.
  for (const rel of CLEARED.keys()) {
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f, `CLEARED names ${rel}, which no longer exists`);
    assert.ok(arraySorts(f.code).length > 0, `${rel} no longer sorts — drop its CLEARED entry`);
  }
});
