import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseJsonLd } from '@/lib/courses/buildCourseJsonLd';
import { courseCanonicalPath, courseCanonicalUrl } from '@/lib/courses/courseCanonicalPath';

/**
 * THE CANONICAL TAG AND THE JSON-LD NAME THE SAME PAGE.
 *
 * ══ WHY THIS IS AN EQUALITY TEST AND NOT TWO CORRECTNESS TESTS ══════════════
 * Before this round they disagreed, and each was individually defensible: the
 * metadata used the requested URL (correct for every OTHER page type the
 * catch-all serves) and the JSON-LD used the alias (correct for a course). Two
 * tests, one per side, would both have been green while a course reached at its
 * code URL told a crawler two different things about which page it is.
 *
 * So the assertion is `jsonLd.url === courseCanonicalUrl(...)` — computed from
 * the same function, compared as values. It cannot pass by both sides happening
 * to be right, and it cannot go stale if the rule changes.
 *
 * ── WHAT THIS TIER CAN AND CANNOT REACH ─────────────────────────────────────
 * `buildCourseJsonLd` is pure and is INVOKED here for real, with real fixtures.
 * `generateMetadata` is not reachable: it awaits `resolveCourse`, which opens a
 * Mongo connection and calls the upstream course API, and stubbing both to test
 * the two lines around them would be testing the stub. That half is asserted
 * from source in test/fs/courseCanonicalWiring, with the limitation stated
 * there — the same split test/fs/metaDescriptionWiring already makes for the
 * article page, and for the same reason.
 *
 * What is NOT verifiable from here at all: whether Google honours the
 * declaration. That is an outcome, not a fact about the markup. This file
 * proves what the page EMITS.
 */

const SITE = 'https://genesis-lab.9expert.app';

const COURSE = {
  course_id: 'VIBE-CODE-L1',
  course_name: 'Build Business Apps with Claude Code',
  course_teaser: 'สร้างแอปธุรกิจด้วย Claude Code',
  course_price: 12900,
};
const ALIAS = '/build-business-apps-with-claude-code-training-course';
const EXT = { urlAlias: ALIAS };

const jsonLd = (course, extension) =>
  buildCourseJsonLd({ course, extension, schedules: [], siteUrl: SITE });

// ── the equality that is the point of the round ─────────────────────────────
test('the JSON-LD url EQUALS the canonical URL, for an aliased course', () => {
  const built = jsonLd(COURSE, EXT);
  assert.ok(built, 'the builder returned null for a valid course');
  assert.equal(built.url, courseCanonicalUrl(COURSE, EXT, SITE));
  assert.equal(built.url, `${SITE}${ALIAS}`);
});

test('the JSON-LD url EQUALS the canonical URL, for a course with no alias', () => {
  // The other branch. If the builder kept a private fallback, this is where it
  // would show — the aliased case above would still pass.
  for (const extension of [null, undefined, { urlAlias: '' }, { urlAlias: '   ' }]) {
    const built = jsonLd(COURSE, extension);
    assert.equal(built.url, courseCanonicalUrl(COURSE, extension, SITE), JSON.stringify(extension));
    assert.equal(built.url, `${SITE}/vibe-code-l1-training-course`);
  }
});

test('the JSON-LD url has NO double slash — the defect this replaced', () => {
  // MEASURED before the change: aliases are stored WITH a leading slash and the
  // builder joined them as `${base}/${slug}`, so every one of the 80 aliased
  // courses emitted https://site//alias. It resolves to the same page, which is
  // why it survived, and it is a third spelling of a URL this round exists to
  // have one of.
  const built = jsonLd(COURSE, EXT);
  assert.ok(!built.url.replace(`${SITE}`, '').startsWith('//'),
    `the JSON-LD url is ${built.url}`);
  assert.ok(!/([^:])\/\//.test(built.url), `double slash in ${built.url}`);
});

test('a trailing slash on the base cannot produce one either', () => {
  // The join is the helper's, so the base is trimmed once rather than at each
  // call site. Asserted through the builder, because that is the caller that
  // passes a base it did not construct.
  const built = buildCourseJsonLd({ course: COURSE, extension: EXT, schedules: [], siteUrl: `${SITE}/` });
  assert.equal(built.url, `${SITE}${ALIAS}`);
});

// ── the builder reads the helper, not a copy ────────────────────────────────
test('changing the alias changes the JSON-LD url — the helper is really consulted', () => {
  // The equality tests above would all pass against a builder that ignored the
  // extension entirely, IF the helper did too. This pins that the value moves.
  const a = jsonLd(COURSE, { urlAlias: '/one' });
  const b = jsonLd(COURSE, { urlAlias: '/two' });
  assert.equal(a.url, `${SITE}/one`);
  assert.equal(b.url, `${SITE}/two`);
  assert.notEqual(a.url, b.url);
});

test('an alias stored without a leading slash still yields one canonical form', () => {
  // normaliseAlias is what decides; the builder does not get a second opinion.
  assert.equal(jsonLd(COURSE, { urlAlias: 'no-slash-course' }).url, `${SITE}/no-slash-course`);
  assert.equal(jsonLd(COURSE, { urlAlias: '/trailing-course/' }).url, `${SITE}/trailing-course`);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the builder really ran, and the url is not undefined on both sides', () => {
  // `assert.equal(undefined, undefined)` passes. If the builder stopped setting
  // `url` and the helper started returning null, every equality above would go
  // green against a pair of empty values.
  const built = jsonLd(COURSE, EXT);
  assert.equal(typeof built.url, 'string');
  assert.ok(built.url.length > SITE.length);
  assert.equal(built['@type'], 'Course', 'the builder did not produce a Course');
  assert.notEqual(courseCanonicalPath(COURSE, EXT), null);
});

test('CONTROL: the builder still refuses a course it cannot name', () => {
  // The pre-existing contract. If it started returning an object for a nameless
  // course, the sitemap and the page would both gain a URL out of nothing.
  assert.equal(buildCourseJsonLd({ course: null, extension: EXT, siteUrl: SITE }), null);
  assert.equal(buildCourseJsonLd({ course: {}, extension: EXT, siteUrl: SITE }), null);
});
