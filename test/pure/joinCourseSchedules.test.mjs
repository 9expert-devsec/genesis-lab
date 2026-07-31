import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinCourseSchedules } from '@/lib/schedule/joinCourseSchedules';

// The public /schedule course↔schedule join. Pure (no next/*, no db) so the
// lossy part — which courses get dropped and why — is verifiable without a Next
// request context. The FETCH (upstream, cached) and the console.warn live in
// page.jsx; this tier locks the join and its loss accounting.
//
// Incident this exists for: PYTHON-L1 (course _id 69267e3bbbad44df87120492)
// disappeared from /schedule entirely. Upstream's /schedules endpoint filters
// out rows with an empty `signup_url`, so the course arrived from
// /public-course with an EMPTY schedule list and the join dropped it — the
// correct behaviour, made invisible by the absence of any signal. See
// docs/api-domains.md:276-278 for upstream's filter.

const PY_L1 = '69267e3bbbad44df87120492'; // the incident course
const PY_L2 = '692681a7c6276dd48490c9d9';

const course = (id, code, extra = {}) => ({
  _id: id,
  course_id: code,
  course_name: `${code} name`,
  course_trainingdays: 3,
  course_price: 11900,
  program: {
    _id: '68da61c687a228e4c5f4c2d4',
    program_id: 'PYTHON',
    program_name: 'Python',
    programiconurl: 'https://cdn/icon.png',
  },
  ...extra,
});

// `course` as a populated object — the shape /schedules actually returns.
const schedPopulated = (id, courseId, dates) => ({
  _id: id,
  course: { _id: courseId, course_id: 'X', course_name: 'X' },
  dates,
  status: 'open',
  type: 'classroom',
  signup_url: 'https://signup/x',
});

// `course` as a bare ObjectId string — the other shape that arrives.
const schedString = (id, courseId, dates) => ({
  _id: id,
  course: courseId,
  dates,
  status: 'open',
  type: 'classroom',
  signup_url: 'https://signup/x',
});

test('happy path: 2 courses / 3 schedules → rows keep render fields, nothing dropped', () => {
  const courses = [course(PY_L1, 'PYTHON-L1'), course(PY_L2, 'PYTHON-L2')];
  const schedules = [
    schedPopulated('s1', PY_L1, ['2026-08-03T00:00:00.000Z']),
    schedPopulated('s2', PY_L1, ['2026-09-14T00:00:00.000Z']),
    schedPopulated('s3', PY_L2, ['2026-08-17T00:00:00.000Z']),
  ];

  const { rows, dropped, orphans } = joinCourseSchedules(courses, schedules);

  assert.equal(rows.length, 2);
  assert.deepEqual(dropped, [], 'nothing dropped when every course has a schedule');
  assert.deepEqual(orphans, [], 'no orphans when every ref resolves');

  // input order preserved
  assert.deepEqual(rows.map((r) => r.course_id), ['PYTHON-L1', 'PYTHON-L2']);
  // schedules attached to the RIGHT course, in input order
  assert.deepEqual(rows[0].schedules.map((s) => s._id), ['s1', 's2']);
  assert.deepEqual(rows[1].schedules.map((s) => s._id), ['s3']);

  // exactly the fields the table renders — no more, no less
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    '_id', 'course_id', 'course_name', 'course_price',
    'course_trainingdays', 'program', 'schedules',
  ]);
  assert.deepEqual(Object.keys(rows[0].program).sort(), [
    '_id', 'program_id', 'program_name', 'programiconurl',
  ]);
});

test('a course with zero schedules is dropped from rows and named in dropped', () => {
  const courses = [course(PY_L1, 'PYTHON-L1'), course(PY_L2, 'PYTHON-L2')];
  const schedules = [schedPopulated('s3', PY_L2, ['2026-08-17T00:00:00.000Z'])];

  const { rows, dropped } = joinCourseSchedules(courses, schedules);

  assert.deepEqual(rows.map((r) => r.course_id), ['PYTHON-L2'], 'only the course with a session renders');
  assert.deepEqual(dropped, ['PYTHON-L1'], 'the dropped course is named, not silently gone');
});

test('orphan schedule (ref matches no course) is counted, never rendered', () => {
  const courses = [course(PY_L2, 'PYTHON-L2')];
  const schedules = [
    schedPopulated('s3', PY_L2, ['2026-08-17T00:00:00.000Z']),
    schedPopulated('ghost1', 'deadbeefdeadbeefdeadbeef', ['2026-08-20T00:00:00.000Z']),
    schedPopulated('ghost2', 'deadbeefdeadbeefdeadbeef', ['2026-08-21T00:00:00.000Z']),
  ];

  const { rows, orphans } = joinCourseSchedules(courses, schedules);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].schedules.map((s) => s._id), ['s3'], 'orphans never leak into a row');
  assert.deepEqual(orphans, [{ ref: 'deadbeefdeadbeefdeadbeef', count: 2 }],
    'orphan ref reported once with its lost-row count');
});

test('mixed ref shapes: bare string ref AND populated {_id} both join', () => {
  const courses = [course(PY_L1, 'PYTHON-L1'), course(PY_L2, 'PYTHON-L2')];
  const schedules = [
    schedString('s-str', PY_L1, ['2026-08-03T00:00:00.000Z']),
    schedPopulated('s-obj', PY_L2, ['2026-08-17T00:00:00.000Z']),
  ];

  const { rows, dropped, orphans } = joinCourseSchedules(courses, schedules);

  assert.deepEqual(dropped, [], 'neither shape falls through to dropped');
  assert.deepEqual(orphans, [], 'neither shape falls through to orphans');
  assert.deepEqual(rows[0].schedules.map((s) => s._id), ['s-str'], 'string ref joined');
  assert.deepEqual(rows[1].schedules.map((s) => s._id), ['s-obj'], 'populated ref joined');
});

test('a schedule with NO resolvable course ref is skipped, not thrown on', () => {
  const courses = [course(PY_L2, 'PYTHON-L2')];
  const schedules = [
    { _id: 'noref', dates: ['2026-08-17T00:00:00.000Z'] },      // no `course` at all
    { _id: 'nullref', course: null, dates: ['2026-08-18T00:00:00.000Z'] },
    schedPopulated('s3', PY_L2, ['2026-08-19T00:00:00.000Z']),
  ];

  const { rows, orphans } = joinCourseSchedules(courses, schedules);

  assert.deepEqual(rows[0].schedules.map((s) => s._id), ['s3']);
  assert.deepEqual(orphans, [], 'a missing ref is not an orphan — there is nothing to orphan');
});

test('REGRESSION (PYTHON-L1 incident): course present upstream but schedule-filtered lands in dropped by code', () => {
  // Exactly the production shape on 2026-07-27: /public-course returns
  // PYTHON-L1, /schedules returns NOTHING for it (both its sessions carry
  // signup_url: '' and are excluded upstream), while PYTHON-L2 comes through.
  const courses = [course(PY_L1, 'PYTHON-L1'), course(PY_L2, 'PYTHON-L2')];
  const schedules = [schedPopulated('6a101561ef482973a440eef9', PY_L2, [
    '2026-08-17T00:00:00.000Z',
    '2026-08-18T00:00:00.000Z',
    '2026-08-19T00:00:00.000Z',
  ])];

  const { rows, dropped, orphans } = joinCourseSchedules(courses, schedules);

  // The rendering behaviour that must NOT change: PYTHON-L1 stays hidden.
  assert.ok(!rows.some((r) => r.course_id === 'PYTHON-L1'),
    'a course with no bookable session is still hidden — this is correct');
  // The observability that was missing: it is named on the way out.
  assert.ok(dropped.includes('PYTHON-L1'),
    'PYTHON-L1 is reported as dropped so the silence that caused the investigation cannot recur');
  assert.equal(orphans.length, 0, 'the join itself was never the fault — 0 orphans, as in production');
});

test('dropped falls back to _id when a course carries no course_id (log never prints undefined)', () => {
  const { dropped } = joinCourseSchedules([{ _id: 'abc123' }], []);
  assert.deepEqual(dropped, ['abc123']);
});

// META-CONTROL — carries TWO distinct claims, because commit 1 makes two:
//
//   1. The DROP RULE is unchanged (same courses hidden) — count equality.
//   2. The ROW PAYLOAD is byte-identical (same fields, same nesting, same
//      nullish fallbacks, same whitelist) — deep equality.
//
// Claim 2 needs the deep compare: a refactor that silently omitted
// `course_trainingdays`, `course_price` or `program.programiconurl` — or that
// silently WIDENED the whitelist and started shipping `course_teaser` to the
// client — keeps the row COUNT identical and would sail past a length check.
//
// The oracle below is a verbatim transcription of the inline map/join that
// lived in page.jsx before this refactor (see git history for the original).
// It is deliberately NOT a call to joinCourseSchedules — an oracle that calls
// the implementation compares it to itself and proves nothing.
//
// Verified by hand, twice: (a) deleting `course_trainingdays` from the returned
// object in joinCourseSchedules.js turns this red on the deep compare; (b) adding
// a `course_teaser` pass-through turns it red on the same assertion AND on the
// whitelist check. Both reverted. If you delete the field selection, this fails;
// if you delete this test, nothing else catches it.
test('CONTROL: fixed join is deep-identical to the pre-fix replica, and only it reports the loss', () => {
  // VERBATIM pre-fix implementation from page.jsx — do not "improve" it.
  const preFix = (courses, schedules) => {
    const schedulesByCourseId = new Map();
    for (const s of schedules) {
      const ref = typeof s.course === 'string' ? s.course : s.course?._id;
      if (!ref) continue;
      const list = schedulesByCourseId.get(String(ref)) ?? [];
      list.push(s);
      schedulesByCourseId.set(String(ref), list);
    }
    const coursesWithSchedules = courses
      .map((c) => {
        const list = schedulesByCourseId.get(String(c._id)) ?? [];
        if (list.length === 0) return null;
        return {
          _id: c._id,
          course_id: c.course_id,
          course_name: c.course_name,
          course_trainingdays: c.course_trainingdays ?? null,
          course_price: c.course_price ?? null,
          program: c.program
            ? {
                _id: c.program._id,
                program_id: c.program.program_id,
                program_name: c.program.program_name,
                programiconurl: c.program.programiconurl ?? null,
              }
            : null,
          schedules: list,
        };
      })
      .filter(Boolean);
    return { rows: coursesWithSchedules, dropped: [], orphans: [] }; // the silence, reproduced
  };

  // FIXTURE — deliberately spans every branch of the field selection. A fixture
  // where every optional field is populated cannot catch a dropped `?? null`
  // fallback; one where none are cannot catch a dropped field. This has both.

  // (a) every whitelisted field present and non-default, PLUS the extra upstream
  //     fields /public-course really sends, which the whitelist must strip.
  const RICH = {
    _id: PY_L2,
    course_id: 'PYTHON-L2',
    course_name: 'Machine Learning using Python',
    course_trainingdays: 3,
    course_price: 11900,
    program: {
      _id: '68da61c687a228e4c5f4c2d4',
      program_id: 'PYTHON',
      program_name: 'Python',
      programiconurl: 'https://res.cloudinary.com/ddva7xvdt/icon.png',
    },
    // ↓ must NOT survive the join — payload-size guarantee for the client bundle
    course_teaser: 'ภาษา Python สำหรับผู้เริ่มต้น',
    course_cover_url: 'https://res.cloudinary.com/ddva7xvdt/cover.webp',
    skills: ['68d4f5b3581cb350290597de'],
    course_type_public: true,
    course_type_inhouse: true,
    training_topics: [{ title: 'x', bullets: [] }],
    sort_order: 1,
    __v: 0,
  };

  // (b) exercises `course_trainingdays ?? null`, `course_price ?? null` and
  //     `program.programiconurl ?? null` — all three absent upstream.
  const SPARSE = {
    _id: 'c-dev-vs-01',
    course_id: 'DEV-VS-01',
    course_name: 'Visual Studio Essentials',
    program: {
      _id: '68d4f5b3581cb350290597de',
      program_id: 'DEV',
      program_name: 'Programming',
    },
  };

  // (c) exercises the `program: null` branch (course with no program at all).
  const NO_PROGRAM = {
    _id: 'c-sql-bi-etl',
    course_id: 'SQL-BI-ETL',
    course_name: 'SQL Server ETL',
    course_trainingdays: 2,
    course_price: 9900,
    program: null,
  };

  // (d) the incident course — no schedules, so it must be dropped by both.
  const DROPPED = course(PY_L1, 'PYTHON-L1');

  const courses = [DROPPED, RICH, SPARSE, NO_PROGRAM];
  const schedules = [
    schedPopulated('s-rich-1', PY_L2, ['2026-08-17T00:00:00.000Z']),
    schedPopulated('s-rich-2', PY_L2, ['2026-09-21T00:00:00.000Z']),
    schedString('s-sparse', 'c-dev-vs-01', ['2026-08-24T00:00:00.000Z']),
    schedPopulated('s-noprog', 'c-sql-bi-etl', ['2026-10-05T00:00:00.000Z']),
  ];

  const old = preFix(courses, schedules);
  const fixed = joinCourseSchedules(courses, schedules);

  // CLAIM 2 — the row payload is byte-identical: same rows, same order, same
  // fields, same nested program, same nullish fallbacks. This is the assertion
  // a silently-narrowed or silently-widened whitelist cannot survive.
  assert.deepStrictEqual(fixed.rows, old.rows, 'refactor changed the row payload');

  // CLAIM 1 — the drop rule is unchanged. Kept ALONGSIDE the deep compare:
  // these are two distinct claims and a deep-equal on rows says nothing about
  // which courses were excluded before the comparison ever started.
  assert.equal(old.rows.length, fixed.rows.length, 'the fix changes no rendering behaviour');
  assert.deepEqual(fixed.rows.map((r) => r.course_id), ['PYTHON-L2', 'DEV-VS-01', 'SQL-BI-ETL']);

  // The fixture is load-bearing in BOTH directions — pin it, so a future edit
  // that populates every optional field silently defangs nothing.
  assert.equal(fixed.rows[1].course_trainingdays, null, 'trainingdays fallback exercised');
  assert.equal(fixed.rows[1].course_price, null, 'price fallback exercised');
  assert.equal(fixed.rows[1].program.programiconurl, null, 'programiconurl fallback exercised');
  assert.equal(fixed.rows[2].program, null, 'program:null branch exercised');
  assert.equal(fixed.rows[0].course_trainingdays, 3, 'and the non-default path too');
  assert.equal(fixed.rows[0].program.programiconurl, RICH.program.programiconurl);

  // The whitelist is a payload-size guarantee: widening it ships dead weight to
  // every client. Assert the extras are stripped, by name and exhaustively.
  for (const leak of [
    'course_teaser', 'course_cover_url', 'skills', 'course_type_public',
    'course_type_inhouse', 'training_topics', 'sort_order', '__v',
  ]) {
    assert.ok(!(leak in fixed.rows[0]), `upstream field '${leak}' leaked into the row payload`);
  }
  assert.deepEqual(Object.keys(fixed.rows[0]).sort(), [
    '_id', 'course_id', 'course_name', 'course_price',
    'course_trainingdays', 'program', 'schedules',
  ], 'row carries EXACTLY the whitelisted fields — no more, no less');

  // ...and only one of the two implementations can tell you what it threw away.
  assert.ok(!old.dropped.includes('PYTHON-L1'), 'pre-fix join reports nothing — this is the bug');
  assert.ok(fixed.dropped.includes('PYTHON-L1'), 'fixed join names the dropped course');
});

// META-CONTROL — same argument for `orphans`. A hardcoded `orphans: []` passes
// every other orphan assertion in this file except the non-empty one above;
// this pins that the empty result in production is a MEASUREMENT, not a literal.
test('CONTROL: orphans is measured, not hardcoded empty', () => {
  const withOrphan = joinCourseSchedules(
    [course(PY_L2, 'PYTHON-L2')],
    [schedPopulated('ghost', 'ffffffffffffffffffffffff', ['2026-08-20T00:00:00.000Z'])]
  );
  const withoutOrphan = joinCourseSchedules(
    [course(PY_L2, 'PYTHON-L2')],
    [schedPopulated('s3', PY_L2, ['2026-08-17T00:00:00.000Z'])]
  );
  assert.equal(withOrphan.orphans.length, 1, 'an unmatched ref IS reported');
  assert.equal(withoutOrphan.orphans.length, 0, 'a matched ref is NOT reported');
});
