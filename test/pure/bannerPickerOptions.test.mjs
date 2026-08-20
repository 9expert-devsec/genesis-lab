import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findArticleOption,
  findCourseOption,
  getBannerArticleOptions,
  getBannerCourseOptions,
} from '@/lib/banners/pickerOptions';
import { COURSE_KINDS } from '@/lib/banners/bannerTypes';

/**
 * WHAT THE TWO PICKERS ARE ALLOWED TO CHOOSE FROM, AND WHAT THEY MUST WARN
 * ABOUT.
 *
 * ── WHY EVERY ONE OF THESE PATHS NEEDS A UNIT TEST ──────────────────────────
 * Measured against the live data on the day this was written:
 *
 *   · the hidden-course set is EMPTY — zero CourseExtension rows with
 *     `isPublished: false`;
 *   · 488 of 488 articles are `active`, and 488 of 488 have `publishedAt <= now`.
 *
 * So NOT ONE of the three "this target would be silently dropped" branches can
 * be observed against production data. They are the whole point of the warning
 * and none of them fires today. That is exactly the situation in which a
 * "verified by looking at it" claim is worthless, and it is why the fixtures
 * below manufacture each case explicitly.
 *
 * Every lookup is injected, for the reason `resolveFeatureContentRefs` carries
 * its own `deps`: what these functions DO is decide which rows an admin can
 * pick, and that is not observable from source text.
 */

const INCLASS = [
  { _id: 'up-1', course_id: 'CLAUDE-AI', course_name: 'Claude Cowork for Business' },
  { _id: 'up-2', course_id: 'SQL-PG-Query', course_name: 'PostgreSQL Query' },
  { _id: 'up-3', course_id: 'POWER-APPS', course_name: 'Power Apps' },
];

const ONLINE = [
  // Both live leading-space ids, verbatim.
  { _id: 'up-9', o_course_id: ' ONL-CYS', o_course_name: 'Cyber Security Online' },
  { _id: 'up-10', o_course_id: ' ONL-MSE-PQ-PM', o_course_name: 'Power Query Online' },
  { _id: 'up-11', o_course_id: 'ONL-EXC', o_course_name: 'Excel Online' },
];

const deps = (over = {}) => ({
  listCourses: async () => ({ items: INCLASS }),
  listOnline: async () => ONLINE,
  loadHidden: async () => new Set(),
  ...over,
});

// ── courses ────────────────────────────────────────────────────────────────

test('both namespaces are returned, each row tagged with its kind', () => {
  return getBannerCourseOptions(deps()).then(({ items, error }) => {
    assert.equal(error, null);
    assert.equal(items.length, 6);
    assert.equal(items.filter((o) => o.kind === COURSE_KINDS.INCLASS).length, 3);
    assert.equal(items.filter((o) => o.kind === COURSE_KINDS.ONLINE).length, 3);
  });
});

test('a leading space is trimmed for DISPLAY and kept in the stored key', async () => {
  const { items } = await getBannerCourseOptions(deps());
  const cys = items.find((o) => o.upstreamId === 'up-9');
  assert.equal(cys.code, 'ONL-CYS', 'the label still shows the space');
  assert.equal(cys.courseId, ' ONL-CYS', 'the stored key was silently edited');
});

test('a mixed-case id is shown and stored exactly as upstream spells it', async () => {
  const { items } = await getBannerCourseOptions(deps());
  const q = items.find((o) => o.upstreamId === 'up-2');
  assert.equal(q.courseId, 'SQL-PG-Query');
  assert.equal(q.code, 'SQL-PG-Query');
});

test('the mixed-case list is DERIVED from the feed, never hardcoded', async () => {
  // The old note in models/Banner.js listed five, `Power-Apps` among them.
  // Upstream fixed that one to POWER-APPS. A picker that filtered on a
  // remembered list would show a course that no longer exists and hide one that
  // does; this asserts the module simply passes through whatever it is handed.
  const { items } = await getBannerCourseOptions(deps());
  const mixed = items
    .filter((o) => o.kind === COURSE_KINDS.INCLASS)
    .map((o) => o.code)
    .filter((c) => c !== c.toUpperCase());
  assert.deepEqual(mixed, ['SQL-PG-Query']);
  assert.equal(items.some((o) => o.code === 'Power-Apps'), false);
  assert.equal(items.some((o) => o.code === 'POWER-APPS'), true);
});

test('a hidden course is LISTED and MARKED, never quietly dropped', async () => {
  // Absence is the one outcome that teaches the admin nothing: they would look
  // for the course, not find it, and have no way to learn why.
  const { items } = await getBannerCourseOptions(
    deps({ loadHidden: async () => new Set(['SQL-PG-QUERY']) })
  );
  const hidden = items.find((o) => o.courseId === 'SQL-PG-Query');
  assert.ok(hidden, 'the hidden course was dropped from the picker');
  assert.equal(hidden.resolvable, false);
  // …and nothing else was marked.
  assert.equal(items.filter((o) => !o.resolvable).length, 1);
});

test('the hidden check is case- and space-insensitive, like the resolver', async () => {
  // `normaliseCourseKey` is trim + upper-case on BOTH sides. A hidden set keyed
  // one way and a feed spelled another must still match, or hiding silently
  // stops working — which is the failure hiddenCourses.js exists to remove.
  const { items } = await getBannerCourseOptions(
    deps({ loadHidden: async () => new Set(['ONL-MSE-PQ-PM']) })
  );
  const pq = items.find((o) => o.upstreamId === 'up-10');
  assert.equal(pq.resolvable, false, 'a leading space defeated the hidden check');
});

test('an upstream failure returns an EMPTY list and an error, never a throw', async () => {
  // The banner admin pages had no upstream dependency before the pickers. MSDB
  // being down must not turn "edit a banner" into a 500 — the other fifteen
  // fields have nothing to do with courses.
  const { items, error } = await getBannerCourseOptions(
    deps({ listCourses: async () => { throw new Error('ECONNREFUSED'); } })
  );
  assert.deepEqual(items, []);
  assert.match(String(error), /ECONNREFUSED/);
});

test('findCourseOption tries upstreamId FIRST, then the normalised code', async () => {
  const { items } = await getBannerCourseOptions(deps());
  // The stable id resolves even when the code it was saved with has moved on.
  const byId = findCourseOption(items, {
    upstreamId: 'up-3',
    courseId: 'Power-Apps',
    kind: COURSE_KINDS.INCLASS,
  });
  assert.equal(byId.courseId, 'POWER-APPS');

  // And the code alone resolves, case-folded.
  const byCode = findCourseOption(items, {
    upstreamId: '',
    courseId: 'sql-pg-query',
    kind: COURSE_KINDS.INCLASS,
  });
  assert.equal(byCode.upstreamId, 'up-2');
});

test('findCourseOption never crosses the namespace boundary', async () => {
  // The two namespaces share no field names, so a course found in the wrong one
  // is a record that resolves to nothing. The picker must warn about that
  // rather than show a confident match.
  const { items } = await getBannerCourseOptions(deps());
  const wrong = findCourseOption(items, {
    upstreamId: 'up-2',
    courseId: 'SQL-PG-Query',
    kind: COURSE_KINDS.ONLINE,
  });
  assert.equal(wrong, null);
});

test('findCourseOption returns null for a reference nothing matches', async () => {
  const { items } = await getBannerCourseOptions(deps());
  assert.equal(
    findCourseOption(items, { upstreamId: '', courseId: 'GONE', kind: COURSE_KINDS.INCLASS }),
    null
  );
  assert.equal(findCourseOption(items, null), null);
});

// ── articles ───────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-20T00:00:00.000Z');

const ARTICLES = [
  { slug: 'local-llm-คืออะไร', title: 'Local LLM คืออะไร', active: true, publishedAt: new Date('2026-01-01T00:00:00.000Z') },
  { slug: '5-เทคนิคทำให้-excel-เร็วขึ้น', title: '5 เทคนิค Excel', active: true, publishedAt: new Date('2026-02-01T00:00:00.000Z') },
  { slug: 'inactive-one', title: 'ปิดอยู่', active: false, publishedAt: new Date('2026-01-01T00:00:00.000Z') },
  { slug: 'future-one', title: 'ยังไม่ถึงเวลา', active: true, publishedAt: new Date('2027-01-01T00:00:00.000Z') },
  { slug: 'draft-one', title: 'ยังไม่ตั้งเวลา', active: true, publishedAt: null },
];

const articleDeps = { now: NOW, findArticles: async () => ARTICLES };

test('EVERY article is offered — not just the six flagged featuredOnLanding', async () => {
  // That flag drives the BlogSection's own selection and has nothing to do with
  // banners: the resolver looks a slug up with a plain `$in` and never reads it.
  // A picker limited to it would be a restriction with no visible cause.
  const { items } = await getBannerArticleOptions(articleDeps);
  assert.equal(items.length, ARTICLES.length);
});

test('a Thai slug is carried through untouched', async () => {
  const { items } = await getBannerArticleOptions(articleDeps);
  assert.equal(items[0].slug, 'local-llm-คืออะไร');
  assert.equal(items[1].slug, '5-เทคนิคทำให้-excel-เร็วขึ้น');
});

test('inactive, future-dated and undated articles are all marked unresolvable', async () => {
  const { items } = await getBannerArticleOptions(articleDeps);
  const by = (slug) => items.find((o) => o.slug === slug);

  assert.equal(by('local-llm-คืออะไร').resolvable, true);

  assert.equal(by('inactive-one').resolvable, false);
  assert.equal(by('inactive-one').active, false);

  assert.equal(by('future-one').resolvable, false);
  assert.equal(by('future-one').active, true, 'the warning must be able to say WHICH');
  assert.equal(by('future-one').published, false);

  // A null publishedAt is a draft. `null <= now` coerces to `0 <= now`, which is
  // TRUE — so a naive comparison would call every draft published. Pinned.
  assert.equal(by('draft-one').resolvable, false);
  assert.equal(by('draft-one').published, false);
});

test('CONTROL: the two flags are independent, so the warning cannot say the wrong thing', async () => {
  const { items } = await getBannerArticleOptions(articleDeps);
  const inactive = items.find((o) => o.slug === 'inactive-one');
  assert.equal(inactive.published, true, 'inactive-one IS published; it is merely off');
});

test('a read failure returns an EMPTY list and an error, never a throw', async () => {
  const { items, error } = await getBannerArticleOptions({
    findArticles: async () => { throw new Error('no mongo'); },
  });
  assert.deepEqual(items, []);
  assert.match(String(error), /no mongo/);
});

test('findArticleOption matches EXACT bytes', async () => {
  const { items } = await getBannerArticleOptions(articleDeps);
  assert.equal(findArticleOption(items, 'local-llm-คืออะไร').title, 'Local LLM คืออะไร');
  // No folding, no encoding, no trimming into a match that is not there.
  assert.equal(findArticleOption(items, encodeURIComponent('local-llm-คืออะไร')), null);
  assert.equal(findArticleOption(items, 'local-llm-'), null);
  assert.equal(findArticleOption(items, ''), null);
});
