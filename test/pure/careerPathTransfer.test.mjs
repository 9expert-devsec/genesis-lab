import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maxTransfers,
  TRANSFER_LIMIT_MESSAGE,
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
 * be on/after today − 1 year (inclusive, Bangkok day keys), at most one fewer
 * than the smallest complete selection, and it sits outside every prerequisite
 * pair. Dates are written
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
// An ordinary pick beside the transfers: a selection of transfers only is
// refused on its own (see the limit tests below).
const ATTENDED = { 'PYTHON-L2': { type: 'classroom', scheduleId: 'future-1', dates: d('2026-11-23') } };

test('valid transfers produce no violation', () => {
  const picks = { 'PYTHON-L1': transfer('p1-recent'), 'N8N-L1': transfer('n8n-recent'), ...ATTENDED };
  assert.deepEqual(transferViolations(PATH, picks, PAST, TODAY), []);
  assert.equal(isTransfer(picks['PYTHON-L1']), true);
  assert.equal(isTransfer({ type: 'classroom' }), false);
});

test('three transfers in a three-course path is one over maxTransfers', () => {
  assert.equal(maxTransfers(PATH), 2);
  const picks = {
    'PYTHON-L1': transfer('p1-recent'),
    'PYTHON-L2': transfer('p2-recent'),
    'N8N-L1': transfer('n8n-recent'),
  };
  const out = transferViolations(PATH, picks, PAST, TODAY);
  assert.deepEqual(out, [{ code: null, message: TRANSFER_LIMIT_MESSAGE }]);
});

test('a transfer of a course not in the path is refused', () => {
  const out = transferViolations(PATH, { 'SQL-101': transfer('x'), ...ATTENDED }, PAST, TODAY);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'SQL-101');
  assert.match(out[0].message, /ไม่อยู่ใน Career Path นี้/);
});

test('an unknown scheduleId is refused, and the pick\'s own dates are not trusted', () => {
  // The pick claims in-window dates; the id names no past round of the course.
  const out = transferViolations(
    PATH,
    { 'PYTHON-L1': transfer('forged', d('2026-09-01')), ...ATTENDED },
    PAST,
    TODAY
  );
  assert.equal(out.length, 1);
  assert.match(out[0].message, /ไม่พบรอบอบรมที่เลือก/);
});

test('a past round outside the window gets the out-of-window message', () => {
  const out = transferViolations(PATH, { 'PYTHON-L1': transfer('p1-old', d('2026-09-01')), ...ATTENDED }, PAST, TODAY);
  assert.deepEqual(out, [{ code: 'PYTHON-L1', message: TRANSFER_OUT_OF_WINDOW_MESSAGE }]);
});

test('course codes match without regard to case', () => {
  const out = transferViolations(PATH, { 'python-l1': transfer('p1-recent'), ...ATTENDED }, PAST, TODAY);
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

test('pruneTransferPicks drops a vanished or out-of-window transfer and keeps the first 2 by course order', async () => {
  const { pruneTransferPicks } = await import('@/lib/career-paths/prerequisiteOrder');
  const normal = { type: 'classroom', scheduleId: 'future-1', dates: d('2026-11-09') };

  // Round vanished from the past list.
  let r = pruneTransferPicks(PATH, { 'PYTHON-L1': transfer('gone'), 'PYTHON-L2': normal }, PAST, TODAY);
  assert.equal(r.dropped, true);
  assert.deepEqual(Object.keys(r.picks), ['PYTHON-L2']);
  assert.equal(r.picks['PYTHON-L2'], normal);

  // Still listed, but outside the window now.
  r = pruneTransferPicks(PATH, { 'PYTHON-L1': transfer('p1-old') }, PAST, TODAY);
  assert.deepEqual(r, { picks: {}, dropped: true });

  // Three stored transfers: the last in curriculum order goes, whatever the
  // key order of the stored object.
  r = pruneTransferPicks(
    PATH,
    { 'N8N-L1': transfer('n8n-recent'), 'PYTHON-L2': transfer('p2-recent'), 'PYTHON-L1': transfer('p1-recent') },
    PAST,
    TODAY
  );
  assert.equal(r.dropped, true);
  assert.deepEqual(Object.keys(r.picks).sort(), ['PYTHON-L1', 'PYTHON-L2']);

  // Nothing to prune.
  r = pruneTransferPicks(PATH, { 'PYTHON-L1': transfer('p1-recent'), 'PYTHON-L2': normal }, PAST, TODAY);
  assert.equal(r.dropped, false);
});

// ── The transfer limit: at least one course is attended ─────────────────────

const fixedPath = (n) => [
  { kind: 'fixed', items: Array.from({ length: n }, (_, i) => ({ kind: 'public', snap: { code: `C${i + 1}` } })) },
];

test('maxTransfers is the smallest complete selection minus one', () => {
  assert.equal(maxTransfers(fixedPath(5)), 4);
  assert.equal(maxTransfers(fixedPath(6)), 5);
  // 3 Fixed + choose 2 of 5 → a complete selection is 5 courses.
  const withChoice = [
    ...fixedPath(3),
    {
      kind: 'choice',
      chooseMin: 2,
      chooseMax: 3,
      items: Array.from({ length: 5 }, (_, i) => ({ kind: 'public', snap: { code: `E${i + 1}` } })),
    },
  ];
  assert.equal(maxTransfers(withChoice), 4);
  // A one-course path allows none; an empty one never goes below zero.
  assert.equal(maxTransfers(fixedPath(1)), 0);
  assert.equal(maxTransfers([]), 0);
});

test('a selection of transfers only is refused, whatever the count', async () => {
  const { transferLimitError } = await import('@/lib/career-paths/prerequisiteOrder');
  const five = fixedPath(5);
  const t = { type: 'transfer', scheduleId: 'x' };
  const n = { type: 'classroom', scheduleId: 'f' };
  assert.equal(transferLimitError(five, { C1: t, C2: t, C3: t, C4: t, C5: n }), null);
  assert.equal(transferLimitError(five, { C1: t, C2: t, C3: t, C4: t, C5: t }), TRANSFER_LIMIT_MESSAGE);
  // Two transfers and nothing else is refused too — the second clause on its own.
  assert.equal(transferLimitError(five, { C1: t, C2: t }), TRANSFER_LIMIT_MESSAGE);
  assert.equal(transferLimitError(five, {}), null);
});

// ── Manual transfer rounds ──────────────────────────────────────────────────

test('manualTransferRoundError: the rules, each at its boundary', async () => {
  const { manualTransferRoundError } = await import('@/lib/career-paths/prerequisiteOrder');
  const err = (a, b) => manualTransferRoundError(a, b, TODAY);
  assert.equal(err('2026-09-14', '2026-09-16'), null);
  assert.match(err('2026-09-16', '2026-09-14'), /วันเริ่มอบรมต้องไม่อยู่หลัง/);
  // Must have ended: the last day is yesterday at the latest.
  assert.match(err('2026-10-10', '2026-10-12'), /ต้องจบก่อนวันนี้/);
  assert.equal(err('2026-10-10', '2026-10-11'), null);
  // Window start (today − 1 year) is allowed; the day before is not.
  assert.equal(err('2025-10-10', '2025-10-12'), null);
  assert.equal(err('2025-10-09', '2025-10-11'), TRANSFER_OUT_OF_WINDOW_MESSAGE);
  // 7 training days (span 6) is fine; 8 (span 7) is too long.
  assert.equal(err('2026-09-01', '2026-09-07'), null);
  assert.equal(err('2026-09-01', '2026-09-08'), 'ช่วงวันที่อบรมยาวเกินไป กรุณาตรวจสอบอีกครั้ง');
  // Malformed or missing.
  assert.match(err('2026-9-1', '2026-09-03'), /รูปแบบวันที่ไม่ถูกต้อง/);
  assert.match(err('2026-02-30', '2026-03-01'), /รูปแบบวันที่ไม่ถูกต้อง/);
  assert.match(err('', '2026-09-03'), /กรุณาระบุ/);
});

test('dayRangeKeys lists every day, across a month end', async () => {
  const { dayRangeKeys } = await import('@/lib/career-paths/prerequisiteOrder');
  assert.deepEqual(dayRangeKeys('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(dayRangeKeys('2026-10-02', '2026-09-29'), []);
});

test('a manual transfer is judged on its typed days, never a past-round lookup', () => {
  const manual = (startDate, endDate) => ({ type: 'transfer', transferManual: true, scheduleId: null, startDate, endDate });
  const normal = { type: 'classroom', scheduleId: 'f', dates: d('2026-11-09') };
  assert.deepEqual(transferViolations(PATH, { 'PYTHON-L1': manual('2026-09-14', '2026-09-16'), 'N8N-L1': normal }, {}, TODAY), []);
  assert.deepEqual(
    transferViolations(PATH, { 'PYTHON-L1': manual('2025-01-01', '2025-01-02'), 'N8N-L1': normal }, {}, TODAY),
    [{ code: 'PYTHON-L1', message: TRANSFER_OUT_OF_WINDOW_MESSAGE }]
  );
  // It counts toward the limit like any transfer.
  const three = {
    'PYTHON-L1': manual('2026-09-14', '2026-09-16'),
    'PYTHON-L2': transfer('p2-recent'),
    'N8N-L1': transfer('n8n-recent'),
  };
  assert.deepEqual(transferViolations(PATH, three, PAST, TODAY), [{ code: null, message: TRANSFER_LIMIT_MESSAGE }]);
});

test('pruneTransferPicks keeps a still-valid manual transfer and drops a stale one', async () => {
  const { pruneTransferPicks } = await import('@/lib/career-paths/prerequisiteOrder');
  const manual = (startDate, endDate) => ({ type: 'transfer', transferManual: true, scheduleId: null, startDate, endDate });
  let r = pruneTransferPicks(PATH, { 'PYTHON-L1': manual('2026-09-14', '2026-09-16') }, PAST, TODAY);
  assert.equal(r.dropped, false);
  // A year later the same days are out of the window.
  r = pruneTransferPicks(PATH, { 'PYTHON-L1': manual('2026-09-14', '2026-09-16') }, PAST, '2027-10-12');
  assert.deepEqual(r, { picks: {}, dropped: true });
});

test('pruneTransferPicks: the limit drops the last transfers; a half-made draft keeps a lone one', async () => {
  const { pruneTransferPicks } = await import('@/lib/career-paths/prerequisiteOrder');
  const two = fixedPath(2);
  const past = {
    C1: [{ scheduleId: 'c1', dates: d('2026-09-01') }],
    C2: [{ scheduleId: 'c2', dates: d('2026-09-02') }],
  };
  // maxTransfers(two) is 1, so the limit already drops C2 — leaving a draft
  // with C1 only, which is incomplete and keeps its transfer.
  let r = pruneTransferPicks(two, { C2: transfer('c2'), C1: transfer('c1') }, past, TODAY);
  assert.deepEqual(Object.keys(r.picks), ['C1']);
  assert.equal(r.dropped, true);
  // A lone transfer on a half-made draft is kept.
  r = pruneTransferPicks(two, { C1: transfer('c1') }, past, TODAY);
  assert.deepEqual(r, { picks: { C1: transfer('c1') }, dropped: false });
  // A one-course path allows no transfer at all (maxTransfers 0).
  r = pruneTransferPicks(fixedPath(1), { C1: transfer('c1') }, past, TODAY);
  assert.deepEqual(r, { picks: {}, dropped: true });
});
