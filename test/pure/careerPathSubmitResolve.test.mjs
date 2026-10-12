import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubmittedPicks } from '@/lib/career-paths/prerequisiteOrder';

/**
 * THE SERVER'S JUDGEMENT OF A SUBMITTED CAREER-PATH REGISTRATION
 * (createCareerPathRegistration → resolveSubmittedPicks). Every pick resolves to
 * the LIVE round it names — future for an ordinary pick, past for a transfer —
 * and the stored row's days come from that round, never from the payload.
 */

const d = (...days) => days.map((x) => `${x}T00:00:00.000Z`);
const TODAY = '2026-10-12';
const fmt = (dates) => `R(${dates.map((x) => x.slice(0, 10)).join(',')})`;

const CURRICULUM = [
  {
    kind: 'fixed',
    title: 'หลัก',
    items: [
      { kind: 'public', snap: { code: 'PYTHON-L1', name: 'Python Programming' }, prerequisites: [] },
      { kind: 'public', snap: { code: 'PYTHON-L2', name: 'Machine Learning using Python' }, prerequisites: ['PYTHON-L1'] },
      { kind: 'public', snap: { code: 'N8N-L1', name: 'n8n' }, prerequisites: [] },
    ],
  },
];
const FUTURE = {
  'PYTHON-L1': [{ _id: 'f-l1-nov', dates: d('2026-11-09', '2026-11-10', '2026-11-11'), type: 'Classroom' }],
  'PYTHON-L2': [
    { _id: 'f-l2-nov', dates: d('2026-11-23', '2026-11-24', '2026-11-25'), type: 'Online' },
    { _id: 'f-l2-early', dates: d('2026-11-10'), type: 'Online' },
  ],
  'N8N-L1': [{ _id: 'f-n8n-hyb', dates: d('2026-11-26', '2026-11-27'), type: 'hybrid' }],
};
const PAST = {
  'PYTHON-L1': [
    { scheduleId: 'p-l1-aug', dates: d('2026-08-03', '2026-08-04', '2026-08-05') },
    { scheduleId: 'p-l1-old', dates: d('2025-06-02', '2025-06-03') },
  ],
  'PYTHON-L2': [{ scheduleId: 'p-l2-sep', dates: d('2026-09-07', '2026-09-08') }],
  'N8N-L1': [{ scheduleId: 'p-n8n-jul', dates: d('2026-07-01', '2026-07-02') }],
};
const run = (selectedCourses) =>
  resolveSubmittedPicks({
    curriculum: CURRICULUM,
    schedulesByCourse: FUTURE,
    pastByCourse: PAST,
    selectedCourses,
    todayKey: TODAY,
    formatRound: fmt,
  });
const row = (courseCode, scheduleId, extra = {}) => ({
  courseName: courseCode,
  courseCode,
  scheduleId,
  round: 'from the browser',
  dates: d('1999-01-01'),
  startDate: '1999-01-01',
  endDate: '1999-01-01',
  type: 'classroom',
  ...extra,
});

test('a transfer resolves to its past round, and the tampered payload dates are replaced', () => {
  const out = run([
    row('PYTHON-L1', 'p-l1-aug', { type: 'transfer', dates: d('2026-10-01') }),
    row('PYTHON-L2', 'f-l2-early'), // would break the pair if L1 were a future pick
    row('N8N-L1', 'f-n8n-hyb', { type: 'Hybrid (MS Teams)' }),
  ]);
  assert.equal(out.error, undefined);
  const [l1, l2, n8n] = out.selectedCourses;
  assert.equal(l1.type, 'transfer');
  assert.deepEqual(l1.dates, PAST['PYTHON-L1'][0].dates);
  assert.equal(l1.startDate, '2026-08-03T00:00:00.000Z');
  assert.equal(l1.endDate, '2026-08-05T00:00:00.000Z');
  assert.equal(l1.round, 'R(2026-08-03,2026-08-04,2026-08-05)');
  assert.equal(l1.scheduleId, 'p-l1-aug');
  // Future picks: live dates and live type, never the payload's.
  assert.deepEqual(l2.dates, FUTURE['PYTHON-L2'][1].dates);
  assert.equal(l2.type, 'online');
  assert.equal(l2.round, 'R(2026-11-10)');
  // A hybrid round keeps the learner's resolved sub-mode.
  assert.equal(n8n.type, 'Hybrid (MS Teams)');
});

test('tampered dates on a future pick are replaced by the live round\'s', () => {
  const out = run([
    row('PYTHON-L1', 'f-l1-nov', { dates: d('2030-01-01'), round: 'fake' }),
    row('PYTHON-L2', 'f-l2-nov'),
    row('N8N-L1', 'f-n8n-hyb', { type: 'Hybrid (Classroom)' }),
  ]);
  assert.equal(out.error, undefined);
  assert.deepEqual(out.selectedCourses[0].dates, FUTURE['PYTHON-L1'][0].dates);
  assert.equal(out.selectedCourses[0].round, 'R(2026-11-09,2026-11-10,2026-11-11)');
  assert.equal(out.selectedCourses[0].type, 'classroom');
});

test('tampered dates cannot hide a broken pair: the live rounds are judged', () => {
  const out = run([
    row('PYTHON-L1', 'f-l1-nov'),
    row('PYTHON-L2', 'f-l2-early', { dates: d('2027-01-01') }),
    row('N8N-L1', 'f-n8n-hyb', { type: 'Hybrid (Classroom)' }),
  ]);
  assert.match(out.error, /ต้องเริ่มหลัง Python Programming/);
});

test('an unknown transfer scheduleId gets the transfer message, not "ไม่เปิดรับสมัครแล้ว"', () => {
  const out = run([
    row('PYTHON-L1', 'forged', { type: 'transfer', dates: d('2026-09-01') }),
    row('PYTHON-L2', 'f-l2-nov'),
    row('N8N-L1', 'f-n8n-hyb', { type: 'Hybrid (Classroom)' }),
  ]);
  assert.match(out.error, /Transfer Module/);
  assert.doesNotMatch(out.error, /ไม่เปิดรับสมัครแล้ว/);
});

test('an out-of-window transfer is refused with the out-of-window message', () => {
  const out = run([
    row('PYTHON-L1', 'p-l1-old', { type: 'transfer' }),
    row('PYTHON-L2', 'f-l2-nov'),
    row('N8N-L1', 'f-n8n-hyb', { type: 'Hybrid (Classroom)' }),
  ]);
  assert.equal(out.error, 'รอบอบรมนี้เกินระยะเวลาที่กำหนด จึงไม่สามารถใช้สิทธิ์ Transfer Module ได้');
});

test('three transfers are refused', () => {
  const out = run([
    row('PYTHON-L1', 'p-l1-aug', { type: 'transfer' }),
    row('PYTHON-L2', 'p-l2-sep', { type: 'transfer' }),
    row('N8N-L1', 'p-n8n-jul', { type: 'transfer' }),
  ]);
  assert.equal(out.error, 'ใช้สิทธิ์ Transfer ได้สูงสุด 2 หลักสูตร');
});

test('two transfers plus a future pick stand, and a missing course still fails the group', () => {
  const ok = run([
    row('PYTHON-L1', 'p-l1-aug', { type: 'transfer' }),
    row('PYTHON-L2', 'p-l2-sep', { type: 'transfer' }),
    row('N8N-L1', 'f-n8n-hyb', { type: 'Hybrid (Classroom)' }),
  ]);
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.selectedCourses.map((c) => c.type), ['transfer', 'transfer', 'Hybrid (Classroom)']);

  const missing = run([row('PYTHON-L1', 'p-l1-aug', { type: 'transfer' }), row('PYTHON-L2', 'f-l2-nov')]);
  assert.match(missing.error, /ยังเลือกรอบอบรมไม่ครบ/);
});

test('an unresolved hybrid sub-mode stays unresolved and fails the group', () => {
  const out = run([
    row('PYTHON-L1', 'f-l1-nov'),
    row('PYTHON-L2', 'f-l2-nov'),
    row('N8N-L1', 'f-n8n-hyb', { type: 'Hybrid (Anything)' }),
  ]);
  assert.match(out.error, /ยังเลือกรอบอบรมไม่ครบ/);
});

test('an ordinary pick whose round is not offered is still "ไม่เปิดรับสมัครแล้ว"', () => {
  const out = run([row('PYTHON-L1', 'gone'), row('PYTHON-L2', 'f-l2-nov'), row('N8N-L1', 'f-n8n-hyb')]);
  assert.match(out.error, /ไม่เปิดรับสมัครแล้ว/);
});
