import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prerequisiteLock,
  prerequisiteLockMessage,
  prerequisiteLockViolations,
  clearLockedPicks,
  thaiListParts,
  resolveSubmittedPicks,
} from '@/lib/career-paths/prerequisiteOrder';

/**
 * THE CAREER-PATH PREREQUISITE LOCK — on top of the pair order. A course is
 * locked while any prerequisite is neither picked nor transferred; a locked
 * course's round picks are cleared down the chain, and the server refuses one.
 */

const d = (...days) => days.map((x) => `${x}T00:00:00.000Z`);

const item = (code, name, prerequisites = []) => ({
  kind: 'public',
  snap: { code, name },
  prerequisites,
});

// PYTHON-L1 → PYTHON-L2 → PYTHON-L3, and DS needs both L1 and SQL.
const CURRICULUM = [
  {
    kind: 'fixed',
    title: 'หลัก',
    items: [
      item('PYTHON-L1', 'Python Programming'),
      item('PYTHON-L2', 'Machine Learning using Python', ['PYTHON-L1']),
      item('PYTHON-L3', 'Deep Learning', ['PYTHON-L2']),
      item('SQL', 'SQL Fundamentals'),
      item('POWERBI', 'Power BI'),
      item('DS', 'Data Science', ['PYTHON-L1', 'SQL', 'POWERBI']),
    ],
  },
];
const NAMES = Object.fromEntries(CURRICULUM[0].items.map((it) => [it.snap.code, it.snap.name]));
const allOpen = () => true;
const round = (...days) => ({ scheduleId: days[0], dates: d(...days), type: 'classroom' });
const transfer = { type: 'transfer', scheduleId: 'past', dates: d('2026-08-03') };

test('a course with an unpicked prerequisite is locked; a picked one unlocks it', () => {
  assert.deepEqual(prerequisiteLock(CURRICULUM, {}, 'PYTHON-L2', allOpen), {
    kind: 'pick',
    codes: ['PYTHON-L1'],
  });
  assert.equal(
    prerequisiteLockMessage(prerequisiteLock(CURRICULUM, {}, 'PYTHON-L2', allOpen), NAMES),
    'กรุณาเลือกรอบอบรมหลักสูตร Python Programming ก่อน'
  );
  const picks = { 'PYTHON-L1': round('2026-11-09', '2026-11-11') };
  assert.equal(prerequisiteLock(CURRICULUM, picks, 'PYTHON-L2', allOpen), null);
  // A course with no prerequisites is never locked.
  assert.equal(prerequisiteLock(CURRICULUM, {}, 'PYTHON-L1', allOpen), null);
  // Case-insensitive, like every other code match.
  assert.equal(prerequisiteLock(CURRICULUM, { 'python-l1': round('2026-11-09') }, 'PYTHON-L2', allOpen), null);
});

test('a TRANSFERRED prerequisite satisfies the lock, with no date order to keep', () => {
  const picks = { 'PYTHON-L1': transfer };
  assert.equal(prerequisiteLock(CURRICULUM, picks, 'PYTHON-L2', allOpen), null);
  // Even a dependent round that starts before the transferred round's date.
  assert.deepEqual(
    prerequisiteLockViolations(CURRICULUM, { ...picks, 'PYTHON-L2': round('2026-01-05') }),
    []
  );
});

test('several prerequisites: all must be satisfied, and the message joins the missing ones', () => {
  const none = prerequisiteLock(CURRICULUM, {}, 'DS', allOpen);
  assert.deepEqual(none.codes, ['PYTHON-L1', 'SQL', 'POWERBI']);
  assert.equal(
    prerequisiteLockMessage(none, NAMES),
    'กรุณาเลือกรอบอบรมหลักสูตร Python Programming, SQL Fundamentals และ Power BI ก่อน'
  );
  const two = prerequisiteLock(CURRICULUM, { SQL: round('2026-11-02') }, 'DS', allOpen);
  assert.equal(
    prerequisiteLockMessage(two, NAMES),
    'กรุณาเลือกรอบอบรมหลักสูตร Python Programming และ Power BI ก่อน'
  );
  const satisfied = { 'PYTHON-L1': transfer, SQL: round('2026-11-02'), POWERBI: round('2026-11-03') };
  assert.equal(prerequisiteLock(CURRICULUM, satisfied, 'DS', allOpen), null);
  assert.deepEqual(thaiListParts(['A']), ['A']);
});

test('an unsatisfied prerequisite with NO open rounds gets the contact-or-Transfer message', () => {
  const sqlClosed = (c) => c !== 'SQL';
  const lock = prerequisiteLock(CURRICULUM, {}, 'DS', sqlClosed);
  assert.deepEqual(lock, { kind: 'no-rounds', codes: ['SQL'] });
  assert.equal(
    prerequisiteLockMessage(lock, NAMES),
    'ยังไม่มีรอบเปิดรับของหลักสูตร SQL Fundamentals — ติดต่อเจ้าหน้าที่หรือเลือก Transfer หากเคยเรียนแล้ว'
  );
  // Transferred, it is satisfied: no rounds needed.
  const after = prerequisiteLock(CURRICULUM, { SQL: transfer }, 'DS', sqlClosed);
  assert.deepEqual(after, { kind: 'pick', codes: ['PYTHON-L1', 'POWERBI'] });
});

test('un-picking a prerequisite clears the dependent and cascades down the chain; transfers stay', () => {
  const picks = {
    'PYTHON-L2': round('2026-12-01'),
    'PYTHON-L3': round('2027-01-10'),
    SQL: round('2026-11-02'),
  };
  // PYTHON-L1 was just un-picked.
  const { picks: out, cleared } = clearLockedPicks(CURRICULUM, picks);
  assert.deepEqual(Object.keys(out), ['SQL']);
  assert.deepEqual(cleared, { 'PYTHON-L2': 'PYTHON-L1', 'PYTHON-L3': 'PYTHON-L2' });
  assert.ok(picks['PYTHON-L2'], 'input not mutated');
  // A TRANSFERRED dependent needs none of its prerequisites.
  const kept = clearLockedPicks(CURRICULUM, { 'PYTHON-L2': transfer, 'PYTHON-L3': round('2027-01-10') });
  assert.deepEqual(kept.cleared, {});
});

test('the server refuses a dependent round whose prerequisite is neither picked nor transferred', () => {
  const curriculum = [
    {
      kind: 'fixed',
      items: [item('PYTHON-L1', 'Python Programming'), item('PYTHON-L2', 'Machine Learning using Python', ['PYTHON-L1'])],
    },
  ];
  const run = (selectedCourses) =>
    resolveSubmittedPicks({
      curriculum,
      schedulesByCourse: {
        'PYTHON-L1': [{ _id: 'l1', dates: d('2026-11-09', '2026-11-11'), type: 'Classroom' }],
        'PYTHON-L2': [{ _id: 'l2', dates: d('2026-11-23'), type: 'Classroom' }],
      },
      pastByCourse: { 'PYTHON-L1': [{ scheduleId: 'p1', dates: d('2026-08-03') }] },
      selectedCourses,
      todayKey: '2026-10-12',
      formatRound: () => '',
    });
  const row = (courseCode, scheduleId, extra = {}) => ({ courseCode, scheduleId, type: 'classroom', ...extra });

  // The lock is judged before the group rule, so the refusal names the course.
  const refused = run([row('PYTHON-L2', 'l2')]);
  assert.equal(
    refused.error,
    'ต้องเลือกรอบอบรมหรือ Transfer หลักสูตร Python Programming ก่อน จึงจะเลือกรอบของ Machine Learning using Python ได้'
  );
  assert.equal(run([row('PYTHON-L1', 'l1'), row('PYTHON-L2', 'l2')]).error, undefined);
  assert.equal(
    run([row('PYTHON-L1', 'p1', { type: 'transfer' }), row('PYTHON-L2', 'l2')]).error,
    undefined
  );
});
