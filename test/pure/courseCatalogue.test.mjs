import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOGUE_KEYS, projectCourseCatalogue, catalogueOrEmpty,
} from '@/lib/pageBuilder/courseCatalogue';

/**
 * THE PROJECTION, NOT THE PAYLOAD, IS WHAT CROSSES TO THE CLIENT.
 *
 * ── WHY THIS ASSERTION EXISTS, AND WHY IT IS ABOUT BYTES ───────────────────
 * The failure is silent and expensive. Handing `items` straight down instead of
 * the mapped projection changes no behaviour, renders identically, breaks no
 * other test, and ships 1.2 MB into every editor page load. There is no symptom
 * to notice — which is exactly the shape of defect this suite exists for.
 *
 * Measured live on 2026-08-29, 79 courses
 * (`scripts/_probe-round46-course-payload.mjs`):
 *
 *     full list                    1,229,727 bytes
 *     {course_id, course_name}         6,318 bytes      194.6x
 *
 * A 194.6x ratio discriminates overwhelmingly, so the size assertion below can
 * be crude and still be certain. It is not a benchmark; it is a tripwire.
 *
 * ── AND WHY THE KEY SET IS ASSERTED AS A SET ───────────────────────────────
 * A spot check that the two expected keys are present would pass on a
 * projection that also carried `related_courses` — 36.9% of the payload on its
 * own. The regression is a key ADDED, so the assertion has to be about the
 * whole set, not about membership.
 *
 * The fixture below is shaped like a real upstream row (37 keys) with the two
 * heavy ones carrying realistic bulk, so the ratio it produces is a property of
 * the projection rather than of a toy object.
 */

/** One upstream row, with the two keys that carry 68.6% of the real payload. */
function upstreamRow(i) {
  const filler = (n) => Array.from({ length: n }, (_, k) => `topic ${k} for course ${i}`);
  return {
    _id: `oid-${i}`,
    course_id: `CODE-${i}`,
    course_name: `Course number ${i}`,
    course_teaser: 'teaser '.repeat(20),
    course_trainingdays: 2,
    course_traininghours: 12,
    course_price: 9900,
    course_netprice: 10593,
    course_cover_url: `https://example.com/cover-${i}.jpg`,
    program: { program_id: 'P1', program_name: 'Programme One' },
    skills: [{ skill_id: 'S1' }, { skill_id: 'S2' }],
    course_objectives: filler(8),
    course_target_audience: filler(6),
    course_prerequisites: filler(4),
    training_topics: filler(40),
    related_courses: Array.from({ length: 5 }, (_, k) => ({
      _id: `rel-${i}-${k}`, course_id: `REL-${i}-${k}`, course_name: `Related ${k}`,
      course_teaser: 'teaser '.repeat(20), training_topics: filler(20),
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    __v: 0,
  };
}

const CATALOG = Array.from({ length: 79 }, (_, i) => upstreamRow(i));
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');

// ── the key set ───────────────────────────────────────────────────────────

test('every row carries EXACTLY the two catalogue keys', () => {
  const rows = projectCourseCatalogue(CATALOG);
  assert.equal(rows.length, 79);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [...CATALOGUE_KEYS].sort());
  }
});

test('CONTROL: the source rows carry far more than that', () => {
  // Otherwise the assertion above is satisfied by a fixture that never had
  // anything to strip, and would stay green against no projection at all.
  assert.equal(Object.keys(CATALOG[0]).length > 15, true);
  assert.equal('related_courses' in CATALOG[0], true);
  assert.equal('training_topics' in CATALOG[0], true);
});

// ── the size ──────────────────────────────────────────────────────────────

test('THE PROJECTION IS ORDERS OF MAGNITUDE SMALLER THAN THE PAYLOAD', () => {
  const full = bytes(CATALOG);
  const projected = bytes(projectCourseCatalogue(CATALOG));
  assert.equal(projected * 20 < full, true,
    `the projection is only ${(full / projected).toFixed(1)}x smaller — a heavy key is crossing`);
  // An absolute ceiling as well as a ratio: a ratio alone stays green if BOTH
  // sides grow, which is what happens when a heavy key is added upstream and
  // then also passed through.
  assert.equal(projected < 60_000, true, `the projection is ${projected} bytes`);
});

test('CONTROL: the full payload FAILS that same size assertion', () => {
  // The tripwire has to be able to fire. This is the exact regression — passing
  // `items` where the projection belongs — run through the same check.
  const full = bytes(CATALOG);
  assert.equal(full < 60_000, false, `the fixture is only ${full} bytes; it cannot demonstrate the cost`);
  assert.equal(full * 20 < full, false);
});

test('the two heavy keys are gone by name', () => {
  // Named, so a failure says WHICH key crossed rather than only that the total
  // moved. These two are 68.6% of the real payload between them.
  const json = JSON.stringify(projectCourseCatalogue(CATALOG));
  assert.equal(json.includes('related_courses'), false);
  assert.equal(json.includes('training_topics'), false);
  assert.equal(json.includes('course_teaser'), false);
});

// ── shape and order ───────────────────────────────────────────────────────

test('upstream order is preserved', () => {
  // The catalogue is scrolled in the order listPublicCourses returns — the
  // stored programme/skill arrangement it applies at the origin. Sorting here
  // would show an admin a different order from every other admin screen.
  const rows = projectCourseCatalogue(CATALOG);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.course_id), ['CODE-0', 'CODE-1', 'CODE-2']);
});

test('a row with no course_id is dropped; a missing name becomes an empty string', () => {
  const rows = projectCourseCatalogue([
    { course_id: 'A', course_name: 'Alpha' },
    { course_name: 'no code at all' },
    { course_id: 'B' },
    { course_id: '', course_name: 'blank code' },
  ]);
  assert.deepEqual(rows, [
    { course_id: 'A', course_name: 'Alpha' },
    { course_id: 'B', course_name: '' },
  ]);
});

test('a non-array is survived', () => {
  for (const bad of [undefined, null, 'nope', 42, {}]) {
    assert.deepEqual(projectCourseCatalogue(bad), []);
  }
});

// ── the read, and its fail-open ───────────────────────────────────────────

test('catalogueOrEmpty asks for the WHOLE catalogue, hidden courses included', () => {
  // An admin must be able to keep and re-choose a code the public list filters
  // out; the picker cannot offer what it was never sent.
  let asked = null;
  return catalogueOrEmpty({
    fetchList: async (opts) => { asked = opts; return { items: [{ course_id: 'A', course_name: 'Alpha' }] }; },
  }).then((rows) => {
    assert.deepEqual(asked, { includeHidden: true });
    assert.deepEqual(rows, [{ course_id: 'A', course_name: 'Alpha' }]);
  });
});

/**
 * ── THE ASSERTIONS THE ROUTES ACTUALLY DEPEND ON ──────────────────────────
 * Everything above tests `projectCourseCatalogue`. The routes do not call it —
 * they call `catalogueOrEmpty`, and THAT is what crosses to the client.
 *
 * Measured, not reasoned: replacing this function's body with
 * `return res.items` — the exact regression §H names — left all 22 cases in
 * this round GREEN, because the fixtures handed to `catalogueOrEmpty` were
 * already projection-shaped and could not tell a projection from a pass-through.
 * A guard that cannot see the defect it was written for is worse than none,
 * because it is a reason not to look again.
 *
 * So these three drive the SAME fat upstream rows the size tests use, through
 * the seam the routes use.
 */
test('catalogueOrEmpty PROJECTS — it does not hand upstream rows through', async () => {
  const rows = await catalogueOrEmpty({ fetchList: async () => ({ items: CATALOG }) });
  assert.equal(rows.length, 79);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [...CATALOGUE_KEYS].sort());
  }
});

test('what catalogueOrEmpty returns is ORDERS OF MAGNITUDE smaller than what it read', async () => {
  const rows = await catalogueOrEmpty({ fetchList: async () => ({ items: CATALOG }) });
  const crossed = bytes(rows);
  const read = bytes(CATALOG);
  assert.equal(crossed * 20 < read, true,
    `only ${(read / crossed).toFixed(1)}x smaller — a heavy key is crossing to the client`);
  assert.equal(crossed < 60_000, true, `${crossed} bytes cross to the client`);
});

test('the heavy keys are absent from what catalogueOrEmpty returns', async () => {
  // By name, so a failure says WHICH key crossed. These two are 68.6% of the
  // real payload between them.
  const json = JSON.stringify(await catalogueOrEmpty({ fetchList: async () => ({ items: CATALOG }) }));
  assert.equal(json.includes('related_courses'), false);
  assert.equal(json.includes('training_topics'), false);
  assert.equal(json.includes('course_teaser'), false);
});

test('catalogueOrEmpty FAILS OPEN when the read throws', async () => {
  // The editor must open when upstream is down. Safe precisely because the
  // catalogue is authoritative for nothing: a code can still be typed, every
  // stored code still displays, and the resolver still judges them.
  const rows = await catalogueOrEmpty({
    fetchList: async () => { throw new Error('upstream is down'); },
  });
  assert.deepEqual(rows, []);
});

test('CONTROL: the same call succeeds when the read does', async () => {
  // Without this, the fail-open case passes against a function that always
  // returns [] and never calls anything.
  const rows = await catalogueOrEmpty({
    fetchList: async () => ({ items: [{ course_id: 'A', course_name: 'Alpha' }] }),
  });
  assert.deepEqual(rows, [{ course_id: 'A', course_name: 'Alpha' }]);
});

test('catalogueOrEmpty survives a response with no items', async () => {
  for (const res of [{}, { items: null }, null]) {
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(await catalogueOrEmpty({ fetchList: async () => res }), []);
  }
});
