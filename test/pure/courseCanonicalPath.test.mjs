import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseCanonicalPath, courseCanonicalUrl } from '@/lib/courses/courseCanonicalPath';
import { normaliseAlias } from '@/lib/courses/aliasAvailability';

/**
 * The one rule for a course's canonical URL.
 *
 * ══ WHY A PURE TIER FOR SOMETHING SO SMALL ══════════════════════════════════
 * Because it is the fact three surfaces disagreed about. The page's canonical
 * tag followed the request, the JSON-LD used the alias, and the sitemap said
 * nothing — so a course reached at its code URL declared itself canonical in
 * one place and declared the alias canonical in another. Neither was a broken
 * function; both were copies of a rule.
 *
 * Pinning the rule here is what lets the three consumers be tested for
 * AGREEMENT (test/render/courseCanonicalMetadata asserts the canonical tag and
 * the JSON-LD are equal) rather than each being separately plausible.
 *
 * ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────
 * Nothing here says which URLs resolve. Both forms still serve 200; this
 * function only decides which one the site DECLARES.
 */

const course = (course_id) => ({ course_id });
const ext = (urlAlias) => ({ urlAlias });

// ── the alias wins when it is set ───────────────────────────────────────────
test('an alias is the canonical path', () => {
  assert.equal(
    courseCanonicalPath(course('VIBE-CODE-L1'), ext('/build-business-apps-with-claude-code-training-course')),
    '/build-business-apps-with-claude-code-training-course',
  );
});

test('the alias is normalised the way it was normalised on the way in', () => {
  // The SAME function the save path and the conflict check use. If this drifted,
  // a stored alias could render as a URL the database would not recognise.
  const cases = [
    ['no leading slash', 'my-course', '/my-course'],
    ['a trailing slash', '/my-course/', '/my-course'],
    ['both', 'my-course/', '/my-course'],
    ['surrounding whitespace', '  /my-course  ', '/my-course'],
    ['several trailing slashes', '/my-course///', '/my-course'],
  ];
  for (const [label, stored, expected] of cases) {
    assert.equal(courseCanonicalPath(course('CODE'), ext(stored)), expected, label);
    // …and it really is the shared normaliser, not a lookalike.
    assert.equal(courseCanonicalPath(course('CODE'), ext(stored)), normaliseAlias(stored), label);
  }
});

// ── the derived path is the fallback ────────────────────────────────────────
const EMPTY_ALIASES = [
  ['an empty alias', ''],
  ['whitespace only', '   '],
  ['a bare slash', '/'],
  ['null', null],
  ['undefined', undefined],
];

for (const [label, alias] of EMPTY_ALIASES) {
  test(`${label} falls through to the derived path`, () => {
    assert.equal(courseCanonicalPath(course('POWER-BI'), ext(alias)), '/power-bi-training-course');
  });
}

test('a missing extension entirely falls through to the derived path', () => {
  // The common case for a course nobody has opened in the admin: there is no
  // CourseExtension row at all, and resolveCourse serves it at the derived path.
  assert.equal(courseCanonicalPath(course('POWER-BI'), null), '/power-bi-training-course');
  assert.equal(courseCanonicalPath(course('POWER-BI'), undefined), '/power-bi-training-course');
});

test('the derived path lower-cases the course code', () => {
  // Upstream ids are mostly upper-case and five are mixed. The URL form is
  // lower-case — that is what every internal link emits and what resolveCourse
  // uppercases back.
  assert.equal(courseCanonicalPath(course('SQL-PG-Query'), null), '/sql-pg-query-training-course');
  assert.equal(courseCanonicalPath(course('MS-SQL-19-Prov'), null), '/ms-sql-19-prov-training-course');
});

test('THE DERIVED PATH ROUND-TRIPS THROUGH resolveCourse — no underscore rewrite', () => {
  // The reason this file does not reuse `coursePathFromId` from the webhook
  // revalidation planner: that one also rewrites `_` to `-`, and resolveCourse
  // recovers the id by UPPERCASING the fragment. So its output for `POWER_BI`
  // resolves to `POWER-BI` — a different course, or none at all.
  //
  // A wrong cache-purge path is a missed purge. A wrong canonical is a page
  // telling Google to index a 404. Same shape, different cost.
  assert.equal(courseCanonicalPath(course('POWER_BI'), null), '/power_bi-training-course');
  // …and the inverse resolveCourse performs recovers the original id.
  const recovered = '/power_bi-training-course'.slice(1, -'-training-course'.length).toUpperCase();
  assert.equal(recovered, 'POWER_BI');
});

// ── null rather than a guess ────────────────────────────────────────────────
test('no course_id and no alias yields null, not a broken path', () => {
  // A caller that cannot name the page must omit the claim. Returning
  // '/-training-course' or '/undefined-training-course' would be a URL, and the
  // sitemap would publish it.
  for (const c of [null, undefined, {}, { course_id: '' }, { course_id: '   ' }]) {
    assert.equal(courseCanonicalPath(c, null), null, JSON.stringify(c));
    assert.equal(courseCanonicalPath(c, ext('')), null, JSON.stringify(c));
  }
});

test('…but an alias alone is enough, even with no course at all', () => {
  // The alias is the stronger claim; a course row is only needed for the
  // fallback. This matters for a caller holding an extension and no upstream
  // row — which is exactly the orphan case the sitemap has to exclude for a
  // DIFFERENT reason (the page 404s), not because the path is unknowable.
  assert.equal(courseCanonicalPath(null, ext('/orphan-course')), '/orphan-course');
});

// ── the absolute form ───────────────────────────────────────────────────────
test('courseCanonicalUrl joins the origin without doubling the slash', () => {
  const c = course('POWER-BI');
  assert.equal(courseCanonicalUrl(c, null, 'https://x.test'), 'https://x.test/power-bi-training-course');
  assert.equal(courseCanonicalUrl(c, null, 'https://x.test/'), 'https://x.test/power-bi-training-course');
  assert.equal(courseCanonicalUrl(c, null, 'https://x.test///'), 'https://x.test/power-bi-training-course');
});

test('courseCanonicalUrl is null exactly when the path is', () => {
  // So a caller can test one thing. If it returned the bare origin instead,
  // the sitemap would emit the homepage once per unnameable course.
  assert.equal(courseCanonicalUrl(null, null, 'https://x.test'), null);
  assert.equal(courseCanonicalUrl({}, ext('  '), 'https://x.test'), null);
});

test('courseCanonicalUrl and courseCanonicalPath cannot disagree', () => {
  // The absolute form is the path plus an origin and nothing else. Stated as an
  // assertion because "and also prepend the base" is the kind of thing that
  // acquires a second rule.
  for (const [c, e] of [[course('A-B'), null], [course('A-B'), ext('/pretty')], [null, ext('/pretty')]]) {
    assert.equal(courseCanonicalUrl(c, e, 'https://x.test'), `https://x.test${courseCanonicalPath(c, e)}`);
  }
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the two branches really are different, and both really fire', () => {
  // Every assertion above pins one branch. If the function ignored the
  // extension, the alias tests would fail — but if it ignored the COURSE, the
  // derived tests would still pass for a fixture that happened to carry both.
  const c = course('POWER-BI');
  assert.notEqual(courseCanonicalPath(c, ext('/pretty')), courseCanonicalPath(c, null));
  assert.equal(courseCanonicalPath(c, ext('/pretty')), '/pretty');
  assert.equal(courseCanonicalPath(c, null), '/power-bi-training-course');
  // and the course_id is genuinely read, not hardcoded
  assert.notEqual(courseCanonicalPath(course('OTHER'), null), courseCanonicalPath(c, null));
});
