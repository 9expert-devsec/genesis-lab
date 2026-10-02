import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinCourseSchedules, scheduleListRows } from '@/lib/schedule/joinCourseSchedules';
import { listPublicCourses } from '@/lib/api/public-courses';

/**
 * /schedule lists every PUBLIC, non-hidden course, rounds or not.
 *
 * Driven through the same three steps the page takes — listPublicCourses (with
 * its upstream and the hidden set injected), joinCourseSchedules, then
 * scheduleListRows — so "hidden → absent" is proved by the real filter rather
 * than by a fixture that simply leaves the hidden course out.
 *
 * Measured 2026-10-02 against the live feed: 77 courses, 45 with
 * course_type_public true and 32 false (every one of the 32 priced 0, i.e. the
 * "Inhouse Only" label). /public-course carries no e-learning courses — those
 * come from /online-course and have never been on /schedule — so "online" here
 * is the ROUND type, which this change must leave alone.
 */

const course = (id, code, isPublic, extra = {}) => ({
  _id: id,
  course_id: code,
  course_name: `${code} name`,
  course_trainingdays: 3,
  course_price: isPublic ? 12900 : 0,
  course_type_public: isPublic,
  course_type_inhouse: true,
  program: { _id: 'p1', program_id: 'SQL', program_name: 'Microsoft SQL Server', programiconurl: null },
  ...extra,
});
const round = (id, courseId, type = 'hybrid') => ({
  _id: id,
  course: { _id: courseId },
  dates: ['2026-11-03T00:00:00.000Z'],
  status: 'open',
  type,
});

const UPSTREAM = [
  course('a', 'WITH-ROUND', true),
  course('b', 'SQL-BI-ETL', true), // the SSIS case: public, its only round closed
  course('c', 'INHOUSE-ONLY', false),
  course('d', 'HIDDEN-PUB', true),
  course('e', 'ONLINE-ROUND', true),
];
const ROUNDS = [round('r1', 'a'), round('r2', 'e', 'online')];

async function pageRows() {
  const { items } = await listPublicCourses({}, {
    fetchUpstream: async () => ({ items: UPSTREAM, total: UPSTREAM.length }),
    loadOrder: async () => null,
    loadHidden: async () => new Set(['HIDDEN-PUB']),
    loadAliases: async () => new Map(),
  });
  const { rows } = joinCourseSchedules(items, ROUNDS);
  return scheduleListRows(items, rows);
}
const byCode = (rows) => Object.fromEntries(rows.map((r) => [r.course_id, r]));

test('a public course WITH rounds keeps its joined row and its rounds', async () => {
  const r = byCode(await pageRows())['WITH-ROUND'];
  assert.ok(r, 'the course with a round is missing');
  assert.deepEqual(r.schedules.map((s) => s._id), ['r1']);
});

test('a public course with NO rounds is listed, with an empty round list', async () => {
  const r = byCode(await pageRows())['SQL-BI-ETL'];
  assert.ok(r, 'the public course with no round was dropped');
  assert.deepEqual(r.schedules, []);
  assert.equal(r.course_name, 'SQL-BI-ETL name');
  assert.equal(r.course_trainingdays, 3);
  assert.equal(r.course_price, 12900);
  assert.equal(r.program.program_name, 'Microsoft SQL Server', 'it must sit in its program group');
});

test('an in-house-only course is absent', async () => {
  assert.equal(byCode(await pageRows())['INHOUSE-ONLY'], undefined);
});

test('a hidden course is absent', async () => {
  assert.equal(byCode(await pageRows())['HIDDEN-PUB'], undefined);
});

test('a course whose round is ONLINE renders exactly as before', async () => {
  const r = byCode(await pageRows())['ONLINE-ROUND'];
  assert.deepEqual(r.schedules.map((s) => [s._id, s.type]), [['r2', 'online']]);
});

test('order is the course order, and the shape of a no-round row equals a joined row', async () => {
  const rows = await pageRows();
  assert.deepEqual(rows.map((r) => r.course_id), ['WITH-ROUND', 'SQL-BI-ETL', 'ONLINE-ROUND']);
  assert.deepEqual(Object.keys(rows[1]).sort(), Object.keys(rows[0]).sort());
});

test('only an explicit course_type_public === true earns an empty row', () => {
  const missingFlag = { ...course('x', 'NO-FLAG', true) };
  delete missingFlag.course_type_public;
  assert.deepEqual(scheduleListRows([missingFlag], []), []);
});
