import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseLinkHref } from '@/lib/courses/courseLinkHref';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';
import { courseHref } from '@/lib/utils';

/**
 * A LINK AND THE PAGE'S OWN CANONICAL TAG CANNOT DISAGREE.
 *
 * ══ THE ASSERTION THAT BINDS THIS ROUND TO U2 ═══════════════════════════════
 * Round U2 made the canonical tag, og:url, the Course JSON-LD, the
 * BreadcrumbList and the sitemap all compute their URL from one function. This
 * round brings internal links into that set. The test below is what makes it a
 * SET rather than five things that currently agree: for the same fixture,
 * `courseLinkHref(row)` and `courseCanonicalPath(course, extension)` are
 * compared as VALUES, from the same function.
 *
 * Two separately-correct tests would both stay green while a link pointed at
 * `/vibe-code-l1-training-course` and the page it landed on declared
 * `/build-business-apps-with-claude-code-training-course` canonical. That is
 * exactly the state the site was in before U2.
 */

const row = (course_id, urlAlias) => ({ course_id, course_name: 'X', urlAlias });

// ── the equality ────────────────────────────────────────────────────────────
const EQUAL_CASES = [
  ['an alias', 'VIBE-CODE-L1', '/build-business-apps-with-claude-code-training-course'],
  ['no alias', 'POWER-BI', null],
  ['an empty alias', 'POWER-BI', ''],
  ['a whitespace alias', 'POWER-BI', '   '],
  ['an alias with no leading slash', 'POWER-BI', 'pretty-course'],
  ['an alias with a trailing slash', 'POWER-BI', '/pretty-course/'],
  ['a bare slash', 'POWER-BI', '/'],
  ['a mixed-case code', 'SQL-PG-Query', null],
];

for (const [label, code, alias] of EQUAL_CASES) {
  test(`link path EQUALS courseCanonicalPath — ${label}`, () => {
    const course = { course_id: code };
    const extension = { urlAlias: alias };
    assert.equal(
      courseLinkHref(row(code, alias)),
      courseCanonicalPath(course, extension),
      'the link and the canonical tag would name different pages',
    );
  });
}

test('the equality is not vacuous — the two branches give different answers', () => {
  // Every case above compares two calls. If both sides returned a constant, all
  // eight would pass. This pins that the value actually moves with the input.
  assert.notEqual(courseLinkHref(row('A', '/pretty')), courseLinkHref(row('A', null)));
  assert.equal(courseLinkHref(row('A', '/pretty')), '/pretty');
  assert.equal(courseLinkHref(row('A', null)), '/a-training-course');
});

// ── the double slash, which this repo has shipped three times ───────────────
test('NO DOUBLE SLASH — this function never concatenates', () => {
  // The defect in three previous places: `courseHref('/pretty')` →
  // `//pretty-training-course`, and `${base}/${alias}` in the JSON-LD and the
  // BreadcrumbList. All three were a JOIN going wrong. This function performs
  // no join, so there is nothing to get wrong — asserted rather than argued,
  // over every alias shape the data actually contains.
  for (const alias of ['/pretty', 'pretty', '/pretty/', '   /pretty   ', null, '']) {
    const href = courseLinkHref(row('CODE', alias));
    assert.ok(!href.includes('//'), `${JSON.stringify(alias)} produced ${href}`);
    assert.ok(href.startsWith('/'), `${JSON.stringify(alias)} produced ${href}`);
  }
});

test('A STORED `//x` NO LONGER PASSES THROUGH — U4 closed the gap', () => {
  /**
   * ── THE FINDING THIS TEST USED TO RECORD, NOW REPAIRED ───────────────────
   * `normaliseAlias` stripped TRAILING slashes and added a leading one if
   * missing, but did not collapse leading ones — so `//pretty` was storable and
   * survived to here unchanged. A browser reads `//pretty` as a
   * protocol-relative URL, `https://pretty`, so it was not a path on this site
   * at all.
   *
   * U3 deliberately did NOT fix it in this function: collapsing it here alone
   * would have made the link disagree with `courseCanonicalPath`, and therefore
   * with the canonical tag, the JSON-LD, the BreadcrumbList and the sitemap,
   * all of which would still have emitted `//pretty`. Round U4 fixed it in
   * `normaliseAlias` instead — the one function all five read through — so all
   * five moved in the same commit.
   *
   * MEASURED against the live collection before the change: 0 of the 80 stored
   * aliases have this shape, so nothing needed migrating.
   */
  assert.equal(courseLinkHref(row('CODE', '//pretty')), '/pretty');

  // THE ASSERTION THAT MATTERS, and it is unchanged in intent: whatever this
  // function returns, the canonical tag returns the same thing. It was true
  // when both emitted `//pretty` and it is true now that both emit `/pretty`.
  // A link that quietly differs from the page's own canonical is the precise
  // defect these two functions exist to prevent.
  assert.equal(
    courseLinkHref(row('CODE', '//pretty')),
    courseCanonicalPath({ course_id: 'CODE' }, { urlAlias: '//pretty' }),
    'the link and the canonical tag diverged on a malformed alias — the one '
    + 'thing this function must never do',
  );
});

test('CONTROL: courseHref DOES produce the double slash — the defect is real', () => {
  // Not a straw man. This is why the mega menu strips the leading slash at
  // nav-course-preview.js before calling, and why that workaround becomes
  // unnecessary rather than being copied to ten more call sites.
  assert.equal(courseHref('/pretty-training-course'), '//pretty-training-course');
  assert.notEqual(courseLinkHref(row('CODE', '/pretty-training-course')), '//pretty-training-course');
});

// ── the fallback ────────────────────────────────────────────────────────────
test('a course that cannot be named falls back to the catalogue, not to ""', () => {
  // `<a href="">` reloads the current page and reads as a dead link rather than
  // a missing one. `courseHref('')` already returned '/training-course', so no
  // call site changes behaviour on this path.
  for (const c of [null, undefined, {}, { course_id: '' }, { course_id: '   ' }, { urlAlias: '' }]) {
    assert.equal(courseLinkHref(c), '/training-course', JSON.stringify(c));
  }
  assert.equal(courseHref(''), '/training-course', 'the pre-existing fallback changed');
});

test('an alias alone is enough, even with no course code', () => {
  // The alias is the stronger claim. A row that somehow lost its code but kept
  // its alias still links correctly rather than falling to the catalogue.
  assert.equal(courseLinkHref({ urlAlias: '/orphan-course' }), '/orphan-course');
});

// ── it DELEGATES, it does not reimplement ──────────────────────────────────
test('the alias wins over the code, and the code is lower-cased — from the shared rule', () => {
  assert.equal(courseLinkHref(row('POWER-BI', '/pretty')), '/pretty');
  assert.equal(courseLinkHref(row('POWER-BI', null)), '/power-bi-training-course');
  assert.equal(courseLinkHref(row('SQL-PG-Query', null)), '/sql-pg-query-training-course');
});

test('an underscore in a code is NOT rewritten — the round-trip rule holds here too', () => {
  // courseCanonicalPath deliberately does not do `coursePathFromId`'s `_` → `-`
  // rewrite, because resolveCourse recovers the id by uppercasing. A link that
  // rewrote it would point at a different course, or none.
  assert.equal(courseLinkHref(row('POWER_BI', null)), '/power_bi-training-course');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: it reads urlAlias off the ROW, not off a nested extension', () => {
  // The shape adaptation is the only thing this function does. If it looked for
  // `course.extension.urlAlias`, every list row would fall through to the
  // derived path — silently, because that is a working URL.
  assert.equal(courseLinkHref({ course_id: 'A', urlAlias: '/on-the-row' }), '/on-the-row');
  assert.equal(courseLinkHref({ course_id: 'A', extension: { urlAlias: '/nested' } }),
    '/a-training-course', 'a nested extension was read — the row shape is what arrives');
});
