import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dropHiddenCourses,
  filterNavMenuGroups,
  hiddenIdSet,
  isHiddenCourse,
  loadHiddenCourseIds,
  normaliseCourseKey,
} from '@/lib/courses/hiddenCourses';

/**
 * The hidden-course set and the pure filters built on it.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 * `CourseExtension.isPublished` used to gate ONLY pretty-URL resolution, so
 * un-publishing a course left it in the mega menu, /training-course, /schedule
 * and /search, every entry linking at a 404. The ruling is that hidden means
 * gone from everywhere.
 *
 * ── WHY EVERY CASE HERE BUILDS ITS OWN HIDDEN COURSE ────────────────────────
 * Measured against the live database on 2026-08-12: 78 extension rows, 0 with
 * `isPublished === false`. So there is no fixture in production that would make
 * any of this fire, and a test that reached for real data would pass while the
 * filter did nothing at all.
 *
 * `deps` on loadHiddenCourseIds for the same reason resolveCourse and
 * getCourseByCodeInsensitive carry theirs: the behaviour under test is which
 * read happens and what a FAILED read returns, neither of which is observable
 * from source text, and neither of which should need a Mongo connection to
 * verify. `error` is injected rather than captured off the global because
 * test/run.mjs runs every file in ONE process with concurrency:true.
 */

const CATALOG = [
  { course_id: 'COPILOT-STU', course_name: 'Copilot for Students' },
  { course_id: 'MSE-AI', course_name: 'Excel AI' },
  { course_id: 'Power-Apps', course_name: 'Power Apps for Business' },
];

function fakeModel(rows, { onQuery } = {}) {
  return {
    find(filter, projection) {
      onQuery?.({ filter, projection });
      return { lean: async () => rows };
    },
  };
}

// ── the key normalisation ───────────────────────────────────────────────────

test('codes compare uppercased, so a stored casing that lags upstream still hides', async () => {
  // The stored courseId is a COPY frozen when an admin last saved the row;
  // upstream renamed Power-Apps → POWER-APPS and nothing propagates it. An
  // exact-match set would silently stop hiding that course.
  const hidden = await loadHiddenCourseIds({
    connect: async () => {},
    model: fakeModel([{ courseId: 'Power-Apps' }]),
  });
  assert.equal(isHiddenCourse(hidden, 'POWER-APPS'), true);
  assert.equal(isHiddenCourse(hidden, 'power-apps'), true);
  assert.equal(isHiddenCourse(hidden, 'Power-Apps'), true);
});

test('CONTROL: a case-SENSITIVE set would let the renamed course through', () => {
  // Proves the assertion above is about the normalisation and not vacuous.
  const naive = new Set(['Power-Apps']);
  assert.equal(naive.has('POWER-APPS'), false);
});

test('normaliseCourseKey trims and uppercases; nullish becomes the empty string', () => {
  assert.equal(normaliseCourseKey('  mse-ai '), 'MSE-AI');
  assert.equal(normaliseCourseKey(null), '');
  assert.equal(normaliseCourseKey(undefined), '');
});

test('an empty code never matches, even against a set holding the empty string', () => {
  // A row with a blank courseId must not hide every course whose code failed
  // to read — that would empty the catalog from one bad document.
  const hidden = hiddenIdSet([{ courseId: '' }, { courseId: '   ' }]);
  assert.equal(hidden.size, 0);
  assert.equal(isHiddenCourse(hidden, ''), false);
  assert.equal(isHiddenCourse(hidden, null), false);
});

// ── dropHiddenCourses ───────────────────────────────────────────────────────

test('a hidden course leaves the list and the others are untouched', () => {
  const hidden = hiddenIdSet([{ courseId: 'COPILOT-STU' }]);
  const out = dropHiddenCourses(CATALOG, hidden);
  assert.deepEqual(out.map((c) => c.course_id), ['MSE-AI', 'Power-Apps']);
});

test('CONTROL: with nothing hidden the SAME list comes back whole', () => {
  // Without this, "COPILOT-STU is absent" would also pass against a filter that
  // dropped the first element of every list.
  const out = dropHiddenCourses(CATALOG, new Set());
  assert.deepEqual(out.map((c) => c.course_id), ['COPILOT-STU', 'MSE-AI', 'Power-Apps']);
});

test('a non-array in is an empty array out, not a throw', () => {
  assert.deepEqual(dropHiddenCourses(undefined, new Set(['X'])), []);
  assert.deepEqual(dropHiddenCourses(null, new Set(['X'])), []);
});

test('the id accessor is injectable, for rows that reach their code indirectly', () => {
  const rows = [
    { _id: 's1', course_ref: { course_id: 'COPILOT-STU' } },
    { _id: 's2', course_ref: { course_id: 'MSE-AI' } },
  ];
  const out = dropHiddenCourses(rows, hiddenIdSet([{ courseId: 'copilot-stu' }]),
    (s) => s?.course_ref?.course_id);
  assert.deepEqual(out.map((s) => s._id), ['s2']);
});

// ── the nav-menu snapshot shape ─────────────────────────────────────────────

const GROUPS = {
  P1: {
    items: [{ course_id: 'COPILOT-STU' }, { course_id: 'MSE-AI' }],
    firstCover: { course_id: 'COPILOT-STU', course_cover_url: 'https://x/1.jpg' },
  },
  P2: {
    items: [{ course_id: 'Power-Apps' }],
    firstCover: { course_id: 'Power-Apps', course_cover_url: 'https://x/2.jpg' },
  },
};

test('firstCover is CLEARED when it points at the hidden course', () => {
  // The cover is a SEPARATE copy of one course. Filtering `items` alone leaves
  // the hidden course's name and cover art rendered in column 4 of the menu.
  const out = filterNavMenuGroups(GROUPS, hiddenIdSet([{ courseId: 'COPILOT-STU' }]));
  assert.deepEqual(out.P1.items.map((c) => c.course_id), ['MSE-AI']);
  assert.equal(out.P1.firstCover, null);
});

test('CONTROL: a cover pointing at a VISIBLE course survives untouched', () => {
  // Otherwise "firstCover is null" would also pass against code that always
  // nulled it.
  const out = filterNavMenuGroups(GROUPS, hiddenIdSet([{ courseId: 'MSE-AI' }]));
  assert.equal(out.P1.firstCover.course_id, 'COPILOT-STU');
  assert.equal(out.P1.firstCover.course_cover_url, 'https://x/1.jpg');
});

test('a group whose last course is hidden DISAPPEARS, rather than rendering empty', () => {
  // Matches the rule syncNavMenuData already applies at write time: the mega
  // menu is a public-course browser, so a program with nothing to show must not
  // appear. Without this, hiding a one-course program leaves a dead entry.
  const out = filterNavMenuGroups(GROUPS, hiddenIdSet([{ courseId: 'POWER-APPS' }]));
  assert.deepEqual(Object.keys(out), ['P1']);
});

test('CONTROL: the same group is present when its course is visible', () => {
  const out = filterNavMenuGroups(GROUPS, new Set());
  assert.deepEqual(Object.keys(out), ['P1', 'P2']);
  assert.equal(out.P2.items.length, 1);
});

// ── the read itself ─────────────────────────────────────────────────────────

test('the read asks for EXPLICIT false and projects only the code', async () => {
  // Two claims, both load-bearing. `{isPublished:false}` and not
  // `{$ne:true}`: a row with the field absent is PUBLISHED, which is what the
  // schema default and resolveCourse's `isPublished !== false` both say, and
  // the three must not drift. The projection keeps the payload independent of
  // how large the catalog grows.
  let seen = null;
  await loadHiddenCourseIds({
    connect: async () => {},
    model: fakeModel([], { onQuery: (q) => { seen = q; } }),
  });
  assert.deepEqual(seen.filter, { isPublished: false });
  assert.deepEqual(seen.projection, { courseId: 1, _id: 0 });
});

test('ONE read, whatever the size of the catalog', async () => {
  // The cost ruling: one batched read, never one per course.
  let queries = 0;
  const hidden = await loadHiddenCourseIds({
    connect: async () => {},
    model: fakeModel(
      Array.from({ length: 40 }, (_, i) => ({ courseId: `C-${i}` })),
      { onQuery: () => { queries += 1; } }
    ),
  });
  assert.equal(queries, 1);
  assert.equal(hidden.size, 40);
});

test('a FAILED read fails OPEN — empty set, and it says so out loud', async () => {
  // Deliberate: fail-closed would empty every catalog page in the site on one
  // Mongo blip, and during a Mongo outage the course is reachable anyway
  // because resolveCourse reads the same collection to know it is hidden.
  const logs = [];
  const hidden = await loadHiddenCourseIds({
    connect: async () => { throw new Error('no primary'); },
    error: (msg) => logs.push(msg),
  });
  assert.equal(hidden.size, 0);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /UNFILTERED/);
  assert.match(logs[0], /no primary/, 'the cause is named');
});

test('CONTROL: the failure log is silent on the happy path', () => {
  // A helper that logged unconditionally would satisfy the test above while
  // saying nothing about failure.
  const logs = [];
  return loadHiddenCourseIds({
    connect: async () => {},
    model: fakeModel([{ courseId: 'X' }]),
    error: (msg) => logs.push(msg),
  }).then((hidden) => {
    assert.equal(hidden.size, 1);
    assert.deepEqual(logs, []);
  });
});

test('an empty hidden set short-circuits: the caller gets its own array back', () => {
  // Identity, not a copy — the zero-hidden case is the one every request pays
  // today (0 of 78 rows are hidden), so it must not allocate a new array per
  // listing render.
  assert.equal(dropHiddenCourses(CATALOG, new Set()), CATALOG);
  assert.equal(dropHiddenCourses(CATALOG, null), CATALOG);
});
