import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listPublicCourses } from '@/lib/api/public-courses';

/**
 * The origin orders. Driven through the `deps` seam with fixtures, so these are
 * REAL application checks — the array a caller receives is inspected — rather
 * than the co-presence a source scan could manage.
 *
 * This is the whole point of ordering at the origin: one set of assertions
 * covers all 25 call sites at once, because there is no second place a course
 * list can come from.
 */

const course = (course_id, program_id, skills = [], createdAt = '2026-01-01T00:00:00.000Z') => ({
  course_id, createdAt,
  program: { program_id },
  skills: skills.map((skill_id) => ({ skill_id })),
});

// Upstream deliberately returns these in an order that is NOT the stored one.
const UPSTREAM = [
  course('P1-A', 'P1', ['AI']),
  course('P1-B', 'P1', ['AI']),
  course('P2-A', 'P2', ['AI']),
  course('P3-B', 'P3', []),
  course('P3-A', 'P3', []),
];

const ORDER = {
  programRank: new Map([['P2', 0], ['P1', 1]]),          // P2 before P1
  programCourseOrder: new Map([['P1', ['P1-B', 'P1-A']], ['P2', ['P2-A']]]),
  skillCourseOrder: new Map([['AI', ['P2-A', 'P1-B', 'P1-A']]]),
};

/**
 * The stub HONOURS the filter, as upstream does. A stub that returned the whole
 * catalogue for `{program:'P1'}` would make every expectation below a puzzle
 * and would stop the filtered cases testing filtered behaviour at all.
 */
const deps = (overrides = {}) => ({
  fetchUpstream: async (_path, { params } = {}) => {
    let items = UPSTREAM;
    if (params?.program) items = items.filter((c) => c.program.program_id === params.program);
    if (params?.skill) items = items.filter((c) => c.skills.some((s) => s.skill_id === params.skill));
    // unwrap() reads `items` off the TOP level, not out of a `data` envelope.
    return { items, total: items.length };
  },
  loadHidden: async () => new Set(),
  loadOrder: async () => ORDER,
  ...overrides,
});

const ids = (r) => (r.items ?? []).map((c) => c.course_id);

test('a {program} call takes THAT programme\'s stored list', async () => {
  const r = await listPublicCourses({ program: 'P1' }, deps());
  assert.deepEqual(ids(r), ['P1-B', 'P1-A']);
  assert.notDeepEqual(ids(r), ['P1-A', 'P1-B'], 'upstream order must not survive');
});

test('a {skill} call takes THAT skill\'s stored list', async () => {
  const r = await listPublicCourses({ skill: 'AI' }, deps());
  assert.deepEqual(ids(r), ['P2-A', 'P1-B', 'P1-A']);
});

test('an unfiltered call takes the cross-category order', async () => {
  // Programme rank first (P2 before P1, then unranked P3), then rank inside
  // each programme; P3's two are unlisted so they take createdAt/code.
  const r = await listPublicCourses({}, deps());
  assert.deepEqual(ids(r), ['P2-A', 'P1-B', 'P1-A', 'P3-A', 'P3-B']);
  assert.notDeepEqual(ids(r), UPSTREAM.map((c) => c.course_id),
    'the fixture must disagree with upstream order or it proves nothing');
});

test('THE includeHidden PATH IS ORDERED TOO — above the early return', async () => {
  /**
   * The non-negotiable one. `if (includeHidden) return result` sits at
   * public-courses.js:68 and THIRTEEN of the twenty-five call sites take it,
   * including syncNavMenuData (the entire mega menu) and syncLandingData.
   *
   * Ordering below that return would leave the highest-traffic surface on
   * upstream's order — and because the seed captures the order the site already
   * renders, the mistake looks CORRECT on the day it ships and only surfaces
   * the first time an admin rearranges something.
   */
  const hidden = await listPublicCourses({ includeHidden: true }, deps());
  assert.deepEqual(ids(hidden), ['P2-A', 'P1-B', 'P1-A', 'P3-A', 'P3-B'],
    'the includeHidden path returned upstream order — the sort is below the early return');

  // The mega menu's exact shape: syncNavMenuData calls
  // `{ ...filter, includeHidden: true }` with filter = {program} or {skill}.
  const filtered = await listPublicCourses({ program: 'P1', includeHidden: true }, deps());
  assert.deepEqual(ids(filtered), ['P1-B', 'P1-A'],
    'a filtered includeHidden call must also be ordered');
});

test('hidden filtering still happens, and happens AFTER ordering', async () => {
  const r = await listPublicCourses({}, deps({ loadHidden: async () => new Set(['P1-B']) }));
  assert.deepEqual(ids(r), ['P2-A', 'P1-A', 'P3-A', 'P3-B'], 'ordered, then filtered');
  assert.equal(r.total, 4, 'total is re-derived from the filtered list');
});

test('a null order leaves the array EXACTLY as upstream sent it', async () => {
  // Both failure modes — read failed, or nothing seeded — return null, and
  // neither may reorder the site. "Order nothing" would make every course
  // unlisted and fall to createdAt DESC, so a database blip would reshuffle
  // every listing.
  const r = await listPublicCourses({}, deps({ loadOrder: async () => null }));
  assert.deepEqual(ids(r), UPSTREAM.map((c) => c.course_id));
});

test('a category the STORE does not know orders deterministically', async () => {
  // The {program} filter falls back to `_id` when program_id is absent, so
  // upstream can honour a value the order store has never seen. Everything is
  // then unlisted and takes the genesis-owned fallback — never upstream's array
  // order by accident.
  const r = await listPublicCourses({ program: 'P3' }, deps({
    loadOrder: async () => ({ ...ORDER, programCourseOrder: new Map() }),
  }));
  assert.equal(r.items.length, 2, 'upstream still returned the programme’s courses');
  assert.deepEqual(ids(r), ['P3-A', 'P3-B'], 'equal createdAt, so course_id ASC decides');
});

test('the upstream array is not mutated', async () => {
  const before = UPSTREAM.map((c) => c.course_id);
  await listPublicCourses({}, deps());
  assert.deepEqual(UPSTREAM.map((c) => c.course_id), before);
});
