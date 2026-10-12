import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TRANSFERS,
  TRANSFER_OUT_OF_WINDOW_MESSAGE,
  isTransfer,
  transferWindowStart,
  transferRoundAllowed,
  transferViolations,
  pairViolations,
  roundBlocker,
} from '@/lib/career-paths/prerequisiteOrder';

/**
 * THE CAREER-PATH TRANSFER MODULE RULES. A transfer is an ordinary pick with
 * `type: 'transfer'` naming a PAST round; it must have ended, its last day must
 * be on/after today − 1 year (inclusive, Bangkok day keys), at most two per
 * registration, and it sits outside every prerequisite pair. Dates are written
 * as upstream sends them (midnight-UTC datetimes).
 */

const d = (...days) => days.map((x) => `${x}T00:00:00.000Z`);
const TODAY = '2026-10-12';

const PATH = [
  {
    kind: 'fixed',
    items: [
      { kind: 'public', snap: { code: 'PYTHON-L1' }, prerequisites: [] },
      { kind: 'public', snap: { code: 'PYTHON-L2' }, prerequisites: ['PYTHON-L1'] },
      { kind: 'public', snap: { code: 'N8N-L1' }, prerequisites: [] },
    ],
  },
];

test('window boundary is inclusive: 2025-10-12 allowed, 2025-10-11 not, for 2026-10-12', () => {
  assert.equal(transferWindowStart(TODAY), '2025-10-12');
  assert.equal(transferRoundAllowed(d('2025-10-10', '2025-10-11', '2025-10-12'), TODAY), true);
  assert.equal(transferRoundAllowed(d('2025-10-09', '2025-10-10', '2025-10-11'), TODAY), false);
});

test('a Feb 29 registration date cuts off at Feb 28 of the year before', () => {
  assert.equal(transferWindowStart('2028-02-29'), '2027-02-28');
  assert.equal(transferRoundAllowed(d('2027-02-28'), '2028-02-29'), true);
  assert.equal(transferRoundAllowed(d('2027-02-27'), '2028-02-29'), false);
  assert.equal(transferWindowStart('2025-02-28'), '2024-02-28');
});

test('a round that has not ended is not transferable', () => {
  assert.equal(transferRoundAllowed(d('2026-10-11', '2026-10-12'), TODAY), false);
  assert.equal(transferRoundAllowed(d('2026-10-12'), TODAY), false);
  assert.equal(transferRoundAllowed(d('2026-11-09'), TODAY), false);
  assert.equal(transferRoundAllowed(d('2026-10-10', '2026-10-11'), TODAY), true);
});

test('empty dates are not transferable', () => {
  assert.equal(transferRoundAllowed([], TODAY), false);
  assert.equal(transferRoundAllowed(undefined, TODAY), false);
});

const PAST = {
  'PYTHON-L1': [
    { scheduleId: 'p1-recent', dates: d('2026-08-03', '2026-08-04', '2026-08-05') },
    { scheduleId: 'p1-old', dates: d('2025-06-02', '2025-06-03') },
  ],
  'PYTHON-L2': [{ scheduleId: 'p2-recent', dates: d('2026-09-07', '2026-09-08') }],
  'N8N-L1': [{ scheduleId: 'n8n-recent', dates: d('2026-07-01', '2026-07-02') }],
};
const transfer = (scheduleId, dates = []) => ({ type: 'transfer', scheduleId, dates });

test('valid transfers produce no violation', () => {
  const picks = { 'PYTHON-L1': transfer('p1-recent'), 'N8N-L1': transfer('n8n-recent') };
  assert.deepEqual(transferViolations(PATH, picks, PAST, TODAY), []);
  assert.equal(isTransfer(picks['PYTHON-L1']), true);
  assert.equal(isTransfer({ type: 'classroom' }), false);
});

test('three transfers is one over MAX_TRANSFERS', () => {
  assert.equal(MAX_TRANSFERS, 2);
  const picks = {
    'PYTHON-L1': transfer('p1-recent'),
    'PYTHON-L2': transfer('p2-recent'),
    'N8N-L1': transfer('n8n-recent'),
  };
  const out = transferViolations(PATH, picks, PAST, TODAY);
  assert.deepEqual(out, [{ code: null, message: 'ใช้สิทธิ์ Transfer ได้สูงสุด 2 หลักสูตร' }]);
});

test('a transfer of a course not in the path is refused', () => {
  const out = transferViolations(PATH, { 'SQL-101': transfer('x') }, PAST, TODAY);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'SQL-101');
  assert.match(out[0].message, /ไม่อยู่ใน Career Path นี้/);
});

test('an unknown scheduleId is refused, and the pick\'s own dates are not trusted', () => {
  // The pick claims in-window dates; the id names no past round of the course.
  const out = transferViolations(
    PATH,
    { 'PYTHON-L1': transfer('forged', d('2026-09-01')) },
    PAST,
    TODAY
  );
  assert.equal(out.length, 1);
  assert.match(out[0].message, /ไม่พบรอบอบรมที่เลือก/);
});

test('a past round outside the window gets the out-of-window message', () => {
  const out = transferViolations(PATH, { 'PYTHON-L1': transfer('p1-old', d('2026-09-01')) }, PAST, TODAY);
  assert.deepEqual(out, [{ code: 'PYTHON-L1', message: TRANSFER_OUT_OF_WINDOW_MESSAGE }]);
});

test('course codes match without regard to case', () => {
  const out = transferViolations(PATH, { 'python-l1': transfer('p1-recent') }, PAST, TODAY);
  assert.deepEqual(out, []);
});

test('a prerequisite pair with a transfer on either side is not a violation', () => {
  // Transferred prerequisite: the dependent may pick a round that would
  // otherwise start too early.
  const transferredPre = {
    'PYTHON-L1': transfer('p1-recent', d('2026-08-03', '2026-08-05')),
    'PYTHON-L2': { type: 'classroom', dates: d('2026-08-04') },
  };
  assert.deepEqual(pairViolations(PATH, transferredPre), []);
  assert.equal(roundBlocker(PATH, transferredPre, 'PYTHON-L2', d('2026-08-01')), null);

  // Transferred dependent: not checked against its own prerequisite.
  const transferredDep = {
    'PYTHON-L1': { type: 'classroom', dates: d('2026-11-09', '2026-11-11') },
    'PYTHON-L2': transfer('p2-recent', d('2026-09-07', '2026-09-08')),
  };
  assert.deepEqual(pairViolations(PATH, transferredDep), []);
  assert.equal(roundBlocker(PATH, transferredDep, 'PYTHON-L1', d('2026-12-01')), null);
});

test('an all-normal pair still violates as before', () => {
  const picks = {
    'PYTHON-L1': { type: 'classroom', dates: d('2026-11-09', '2026-11-11') },
    'PYTHON-L2': { type: 'online', dates: d('2026-11-11') },
  };
  assert.deepEqual(pairViolations(PATH, picks), [
    { dependent: 'PYTHON-L2', prerequisite: 'PYTHON-L1' },
  ]);
  assert.deepEqual(roundBlocker(PATH, { 'PYTHON-L1': picks['PYTHON-L1'] }, 'PYTHON-L2', d('2026-11-10')), {
    code: 'PYTHON-L1',
    needs: 'after',
  });
});
