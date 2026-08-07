import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCourseByCodeInsensitive } from '@/lib/api/public-courses';

/**
 * getCourseByCodeInsensitive — the case-tolerant course lookup.
 *
 * Upstream `?course_id=` is exact-match case-sensitive and 5 of 77 courses have
 * mixed-case ids, so every URL built from a lowercased id missed and those
 * courses were unreachable (catalog redirect on the registration page, hard 404
 * on the detail page).
 *
 * The fake below models upstream EXACTLY: `fetchByCode` matches the id string
 * verbatim and nothing else. The control near the bottom proves that, because a
 * fixture that was accidentally case-insensitive would make every test here
 * vacuous.
 *
 * `info` is injected rather than captured off the global. test/run.mjs runs
 * every file in one process with `concurrency: true`, so swapping console.info
 * collects other files' output — an earlier version of this file did exactly
 * that and failed only in the full suite, never alone.
 *
 * INFO, NOT WARN — and the name is load-bearing. A mixed-case course_id is
 * VALID; the fallback reports a COST (one extra list lookup), not a defect, so
 * the helper logs at info level. The dep is destructured as `info`, and an
 * unknown key in `deps` is silently ignored — pass `warn:` and it is dropped on
 * the floor while `info` quietly binds to the real console.info. Nothing goes
 * red: the capture array simply never fills, and every `deepEqual(logs, [])`
 * passes for the wrong reason. "the old dep name is inert" below exists to
 * catch exactly that, so a rename back cannot land green.
 */

const CATALOG = [
  { _id: '1', course_id: 'COPILOT-STU', course_name: 'Copilot for Students' },
  { _id: '2', course_id: 'Power-Apps', course_name: 'Power Apps for Business' },
  { _id: '3', course_id: 'SQL-PG-Query', course_name: 'PostgreSQL Query' },
];

function harness() {
  const calls = { byCode: [], list: 0 };
  const logs = [];
  const deps = {
    fetchByCode: async (id) => {
      calls.byCode.push(id);
      return CATALOG.find((c) => c.course_id === id) ?? null; // verbatim, like upstream
    },
    fetchList: async () => {
      calls.list += 1;
      return { items: CATALOG, total: CATALOG.length };
    },
    info: (msg) => logs.push(msg),
  };
  return { calls, logs, deps };
}

// ── The happy path must not pay for the fallback ───────────────────────────

test('an already-uppercase id resolves via the direct call, list untouched', async () => {
  const { calls, logs, deps } = harness();
  const course = await getCourseByCodeInsensitive('COPILOT-STU', deps);
  assert.equal(course?.course_id, 'COPILOT-STU');
  assert.equal(calls.list, 0, 'the list endpoint must not be fetched');
  assert.deepEqual(calls.byCode, ['COPILOT-STU'], 'exactly one lookup');
  assert.deepEqual(logs, [], 'and there is no extra cost to report');
});

test('CONTROL: the fallback path DOES fetch the list', async () => {
  // Without this, "list untouched" above passes for a helper that has no
  // fallback at all — which is the code this replaced.
  const { calls, deps } = harness();
  await getCourseByCodeInsensitive('POWER-APPS', deps);
  assert.equal(calls.list, 1, 'the miss path reaches the list');
});

// ── The five ───────────────────────────────────────────────────────────────

test('a mixed-case id resolves via the fallback', async () => {
  const { calls, deps } = harness();
  const course = await getCourseByCodeInsensitive('POWER-APPS', deps);
  assert.equal(course?.course_id, 'Power-Apps', 'the real record comes back');
  assert.deepEqual(
    calls.byCode,
    ['POWER-APPS', 'Power-Apps'],
    'direct miss, then re-fetch by the id upstream actually stores'
  );
});

test('the lowercase form the URL carries also resolves', async () => {
  // /registration/public?course=power-apps and /power-apps-training-course are
  // both built from course_id.toLowerCase(); the callers uppercase before
  // calling, but the helper must not depend on that.
  const { deps } = harness();
  const course = await getCourseByCodeInsensitive('power-apps', deps);
  assert.equal(course?.course_id, 'Power-Apps');
});

test('the fallback logs the cost, naming both the attempted and the real casing', async () => {
  const { logs, deps } = harness();
  await getCourseByCodeInsensitive('SQL-PG-QUERY', deps);
  assert.equal(logs.length, 1, 'exactly one line');
  assert.match(logs[0], /SQL-PG-QUERY/, 'the casing that was looked up');
  assert.match(logs[0], /SQL-PG-Query/, 'and the casing upstream stores');

  // Anchored on "needed the case-insensitive fallback" and NOT on
  // /case-insensitive/ alone: that substring is in the old wording too, so an
  // assertion on it would pass either side of this change and pin nothing.
  assert.match(
    logs[0],
    /needed the case-insensitive fallback/,
    'the line reports which id paid for the extra list lookup'
  );

  // A mixed-case course_id is VALID — nothing upstream is wrong and nobody
  // should be told to go edit those five records. The old wording ended "Fix
  // the casing upstream." and read as exactly that instruction.
  assert.doesNotMatch(
    logs[0],
    /fix the casing/i,
    'mixed case is legitimate — the line must not ask anyone to change upstream data'
  );
});

test('CONTROL: nothing is logged on the direct path', async () => {
  // Pairs with the test above: proves the info probe can be empty, so asserting
  // one line on the fallback means something.
  const { logs, deps } = harness();
  await getCourseByCodeInsensitive('COPILOT-STU', deps);
  assert.deepEqual(logs, []);
});

test('CONTROL: the OLD dep name is inert — `warn:` captures nothing', async () => {
  // The failure mode this whole rename exists to prevent. An unknown key in
  // `deps` is silently ignored, so a file still passing `warn:` does not go
  // red — `info` falls back to the real console.info, the probe never fills,
  // and every `deepEqual(logs, [])` above passes for the wrong reason.
  //
  // Both are passed at once, on a call that DEFINITELY logs, so the only reason
  // `strays` can be empty is that the helper ignored `warn` entirely. Rename the
  // parameter back and this goes red instead of quietly passing.
  const strays = [];
  const seen = [];
  const { deps } = harness();
  await getCourseByCodeInsensitive('SQL-PG-QUERY', {
    ...deps,
    warn: (msg) => strays.push(msg),
    info: (msg) => seen.push(msg),
  });
  assert.equal(seen.length, 1, 'the `info` dep is the one that binds…');
  assert.deepEqual(strays, [], '…and `warn` is dead weight the helper never calls');
});

// ── A genuine miss must still miss ─────────────────────────────────────────

test('an absent id resolves to null through both paths', async () => {
  const { calls, logs, deps } = harness();
  const course = await getCourseByCodeInsensitive('NO-SUCH-COURSE', deps);
  assert.equal(course, null);
  assert.equal(calls.list, 1, 'the fallback was tried…');
  assert.deepEqual(calls.byCode, ['NO-SUCH-COURSE'], '…and gave up without a re-fetch');
  // Reframed with the log level: the line reports a course that PAID the extra
  // list lookup, and a miss resolved nothing, so there is no cost to attribute.
  // (The old wording here — "not a casing incident" — implied the fallback was
  // an incident at all, which under the current framing it is not.)
  assert.deepEqual(logs, [], 'nothing resolved, so no lookup cost to report');
});

test('the fallback does not match a near-miss', async () => {
  // Exact-except-case. Anything looser and a typo'd link lands the user on some
  // other course's registration form.
  const { deps } = harness();
  for (const near of [
    'POWERAPPS',   // punctuation removed
    'POWER-APP',   // prefix
    'POWER-APPSX', // suffix
    'POWER_APPS',  // different separator
    ' POWER-APPS', // leading space
    'POWER-APPS ', // trailing space
  ]) {
    assert.equal(
      await getCourseByCodeInsensitive(near, deps),
      null,
      `"${near}" differs by more than case and must not match Power-Apps`
    );
  }
});

test('CONTROL: the case-insensitive comparison is real, and only case-deep', async () => {
  // The pair that pins the comparison from both sides at once. Tighten the
  // helper to exact-match and the first assertion goes red; loosen it to
  // fuzzy/normalized matching and the second does.
  const { deps } = harness();
  assert.ok(
    await getCourseByCodeInsensitive('POWER-APPS', deps),
    'differs from "Power-Apps" by case ALONE → must resolve'
  );
  assert.equal(
    await getCourseByCodeInsensitive('POWERAPPS', deps),
    null,
    'differs by case AND a hyphen → must not resolve'
  );
});

test('CONTROL: the fake models upstream exact-match, not a lenient stand-in', async () => {
  // If fetchByCode were itself case-insensitive, every test above would pass
  // against a helper with no fallback logic whatsoever.
  const { deps } = harness();
  assert.equal(await deps.fetchByCode('Power-Apps'), CATALOG[1], 'verbatim hits');
  assert.equal(await deps.fetchByCode('POWER-APPS'), null, 'uppercase misses');
  assert.equal(await deps.fetchByCode('power-apps'), null, 'lowercase misses');
});

// ── Edges ──────────────────────────────────────────────────────────────────

test('a falsy id short-circuits without touching upstream at all', async () => {
  for (const falsy of [null, undefined, '', 0]) {
    const { calls, deps } = harness();
    assert.equal(await getCourseByCodeInsensitive(falsy, deps), null);
    assert.equal(calls.list, 0);
    assert.equal(calls.byCode.length, 0, `"${falsy}" must not reach upstream`);
  }
});

test('an empty list is a miss, not a crash', async () => {
  const noop = () => {};
  assert.equal(
    await getCourseByCodeInsensitive('ANYTHING', {
      fetchByCode: async () => null,
      fetchList: async () => ({ items: [], total: 0 }),
      info: noop,
    }),
    null
  );
  assert.equal(
    await getCourseByCodeInsensitive('ANYTHING', {
      fetchByCode: async () => null,
      fetchList: async () => ({}),
      info: noop,
    }),
    null
  );
});

test('a list row with no course_id never matches', async () => {
  // `String(undefined ?? '').toLowerCase()` is '' — it must not collide with a
  // real lookup, and the falsy guard above means '' never gets this far anyway.
  assert.equal(
    await getCourseByCodeInsensitive('SOMETHING', {
      fetchByCode: async () => null,
      fetchList: async () => ({ items: [{ _id: 'x' }, { _id: 'y', course_id: null }] }),
      info: () => {},
    }),
    null
  );
});

// ── THE LOOKUP KEY IS AN INPUT ─────────────────────────────────────────────
//
// The rule these pin: the string the caller searched WITH must never appear in
// what comes back. Callers get the upstream record byte for byte.
//
// This is not a display concern. `resolve-price.js` calls the EXACT
// `getCourseByCode(courseCode)` with the id `RegisterWizard` stored on the
// registration document, and `charge/route.js` turns a miss into a 422
// `price_unavailable`. Normalise the id here and Omise checkout dies for every
// mixed-case course — and stays dead for every row already written, because the
// wrong value is in Mongo by then. `getCourseExtension` is an exact Mongo
// `findOne({ courseId })` too, so a normalised id silently drops the detail
// page's SEO overrides and gallery instead of erroring.
//
// The CATALOG harness above returns CATALOG rows by reference, which makes a
// whole-record `deepEqual` pass on identity alone and assert nothing. This
// second harness clones on every fetch — which is also the more faithful fake,
// since a real network read never hands back the same object twice.

const UPSTREAM_ROW = Object.freeze({
  _id: '507f1f77bcf86cd799439011',
  course_id: 'SQL-PG-Query',
  // Mixed case in a SECOND field, so a blanket normalisation of the whole
  // record is caught even if course_id itself were left alone.
  course_name: 'PostgreSQL Query for Data Analysts',
  course_teaser: '',            // empty string — must survive, not become undefined
  course_price: 12900,
  course_netprice: 0,           // zero — must survive a truthiness-based cleanup
  course_trainingdays: 2,
  course_traininghours: null,   // null — must survive a nullish-stripping cleanup
  course_cover_url: 'https://res.cloudinary.com/x/sql-pg-query.png',
  program: { _id: 'p1', program_name: 'Database' },
  skills: [{ _id: 's1', skill_id: 'SQL' }],
});

const DIRECT_ROW = Object.freeze({
  _id: '1',
  course_id: 'COPILOT-STU',
  course_name: 'Copilot for Students',
});

function cloningHarness() {
  const catalog = [DIRECT_ROW, UPSTREAM_ROW];
  const calls = { byCode: [], list: 0 };
  const clone = (row) => (row ? structuredClone(row) : null);
  const deps = {
    fetchByCode: async (id) => {
      calls.byCode.push(id);
      return clone(catalog.find((c) => c.course_id === id) ?? null); // verbatim
    },
    fetchList: async () => {
      calls.list += 1;
      return { items: catalog.map(clone), total: catalog.length };
    },
    info: () => {},
  };
  return { calls, deps };
}

test('the fallback returns course_id exactly as upstream spells it', async () => {
  const { deps } = cloningHarness();
  const course = await getCourseByCodeInsensitive('SQL-PG-QUERY', deps);
  assert.equal(course.course_id, 'SQL-PG-Query', 'upstream casing, verbatim');
  assert.notEqual(
    course.course_id,
    'SQL-PG-QUERY',
    'the normalised key the caller searched with must not come back out'
  );
});

test('the record comes back whole — every field, not just course_id', async () => {
  // Deliberately the WHOLE object, not a field list: this is what makes a
  // future normalisation of ANY field — a trim, a case fold, a dropped null,
  // an injected default — fail here rather than reach a caller.
  const { deps } = cloningHarness();
  const course = await getCourseByCodeInsensitive('SQL-PG-QUERY', deps);
  assert.deepEqual(course, UPSTREAM_ROW);
});

test('the lookup key appears NOWHERE in the returned record', async () => {
  // The general form of the rule, independent of which field is involved: an
  // input string must not be reachable anywhere in the output.
  const { deps } = cloningHarness();
  const course = await getCourseByCodeInsensitive('SQL-PG-QUERY', deps);
  assert.ok(
    !JSON.stringify(course).includes('SQL-PG-QUERY'),
    'the lookup key leaked into the returned record'
  );
});

test('the uppercase happy path is unchanged — whole record, no list fetch', async () => {
  const { calls, deps } = cloningHarness();
  const course = await getCourseByCodeInsensitive('COPILOT-STU', deps);
  assert.deepEqual(course, DIRECT_ROW, 'the direct row, untouched');
  assert.equal(calls.list, 0, 'the 72 uppercase courses still never fetch the list');
  assert.deepEqual(calls.byCode, ['COPILOT-STU'], 'still exactly one lookup');
});

// ── Controls ───────────────────────────────────────────────────────────────

/**
 * The defect these tests exist to catch, written out and executed: a helper
 * that hands back the string it searched with instead of the record it found.
 * Running it proves the assertions above have teeth — without this, all four
 * pass just as happily against a helper that could never fail them.
 */
async function substitutesTheLookupKey(courseId, deps) {
  const found = await getCourseByCodeInsensitive(courseId, deps);
  return found && { ...found, course_id: courseId }; // ← the bug
}

test('CONTROL: substituting the lookup key turns all three assertions red', async () => {
  const { deps } = cloningHarness();
  const mutant = await substitutesTheLookupKey('SQL-PG-QUERY', deps);

  assert.equal(mutant.course_id, 'SQL-PG-QUERY', 'the mutant does substitute…');

  assert.throws(
    () => assert.equal(mutant.course_id, 'SQL-PG-Query'),
    assert.AssertionError,
    '…so the verbatim-casing assertion fails against it'
  );
  assert.throws(
    () => assert.deepEqual(mutant, UPSTREAM_ROW),
    assert.AssertionError,
    '…and so does the whole-record assertion'
  );
  assert.throws(
    () => assert.ok(!JSON.stringify(mutant).includes('SQL-PG-QUERY')),
    assert.AssertionError,
    '…and so does the key-leak scan'
  );
});

test('CONTROL: the whole-record assertion catches ANY field, not just course_id', async () => {
  // Pairs with the mutant above, which only touches course_id. If deepEqual were
  // ever weakened to a field-by-field check on the id alone, these go green and
  // stop protecting the other 36 keys.
  const { deps } = cloningHarness();
  const course = await getCourseByCodeInsensitive('SQL-PG-QUERY', deps);

  for (const [label, mutated] of [
    ['a case fold on another field', { ...course, course_name: course.course_name.toUpperCase() }],
    ['a dropped null',              { ...course, course_traininghours: undefined }],
    ['an empty string coerced',     { ...course, course_teaser: null }],
    ['a zero treated as missing',   { ...course, course_netprice: null }],
    ['an injected default',         { ...course, course_level: 'beginner' }],
    ['a normalised nested field',   { ...course, program: { _id: 'p1', program_name: 'DATABASE' } }],
  ]) {
    assert.throws(
      () => assert.deepEqual(mutated, UPSTREAM_ROW),
      assert.AssertionError,
      `${label} must fail the whole-record assertion`
    );
  }
});

test('CONTROL: the fake clones, so deepEqual is structural and not identity', async () => {
  // Without this, `deepEqual(course, UPSTREAM_ROW)` could be passing because the
  // helper returned the very object the fixture points at — which would be true
  // of a substituting helper too, had it mutated in place.
  const { deps } = cloningHarness();
  const course = await getCourseByCodeInsensitive('SQL-PG-QUERY', deps);
  assert.notEqual(course, UPSTREAM_ROW, 'a different object…');
  assert.notEqual(course.program, UPSTREAM_ROW.program, '…cloned nested, too…');
  assert.deepEqual(course, UPSTREAM_ROW, '…that is structurally identical');
});

test('CONTROL: the cloning fake still models upstream exact-match', async () => {
  // Same guard the CATALOG harness carries: a case-insensitive fake would make
  // every fallback test in this section vacuous.
  const { deps } = cloningHarness();
  assert.ok(await deps.fetchByCode('SQL-PG-Query'), 'verbatim hits');
  assert.equal(await deps.fetchByCode('SQL-PG-QUERY'), null, 'uppercase misses');
  assert.equal(await deps.fetchByCode('sql-pg-query'), null, 'lowercase misses');
});
