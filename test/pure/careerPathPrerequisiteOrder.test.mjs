import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  courseCodeKey,
  canonicaliseCurriculumCodes,
  prerequisitePairs,
  pairHolds,
  pairViolations,
  roundBlocker,
} from '@/lib/career-paths/prerequisiteOrder';

/**
 * THE CAREER-PATH PREREQUISITE ORDER — the one rule the pick step and the
 * server re-check both read. D lists P under "ต้องเรียนก่อน": with BOTH picked,
 * D's round starts strictly after P's round ends, by day. Dates are written the
 * way upstream sends them (midnight-UTC datetimes), not as bare days, so the
 * day cut is exercised on every case.
 */

const d = (...days) => days.map((x) => `${x}T00:00:00.000Z`);

// prompt-engineer, as measured 2026-10-12: PYTHON-L2 requires PYTHON-L1.
const PYTHON = [
  {
    kind: 'fixed',
    items: [
      { kind: 'public', snap: { code: 'PYTHON-L1' }, prerequisites: [] },
      { kind: 'public', snap: { code: 'PYTHON-L2' }, prerequisites: ['PYTHON-L1'] },
    ],
  },
];
const L1_APR = { dates: d('2027-04-26', '2027-04-27', '2027-04-28') }; // 26–28 เม.ย. 2570
const L2_NOV = d('2026-11-23', '2026-11-24', '2026-11-25');             // 23–25 พ.ย. 2569
const L2_MAR = d('2027-03-08', '2027-03-09', '2027-03-10');             // 8–10 มี.ค. 2570

test('PYTHON-L1 picked for 26–28 เม.ย. 2570 blocks both earlier PYTHON-L2 rounds', () => {
  const picks = { 'PYTHON-L1': L1_APR };
  for (const dates of [L2_NOV, L2_MAR]) {
    assert.deepEqual(roundBlocker(PYTHON, picks, 'PYTHON-L2', dates), {
      code: 'PYTHON-L1',
      needs: 'after',
    });
  }
  assert.equal(
    roundBlocker(PYTHON, picks, 'PYTHON-L2', d('2027-05-10', '2027-05-11')),
    null
  );
});

test('reverse direction: PYTHON-L2 picked first greys PYTHON-L1 rounds ending on/after its start', () => {
  const picks = { 'PYTHON-L2': { dates: L2_MAR } };
  assert.deepEqual(roundBlocker(PYTHON, picks, 'PYTHON-L1', L1_APR.dates), {
    code: 'PYTHON-L2',
    needs: 'before',
  });
  assert.equal(roundBlocker(PYTHON, picks, 'PYTHON-L1', d('2026-11-09', '2026-11-11')), null);
});

test('same day end/start is blocked; the next day is allowed', () => {
  const pre = d('2026-11-09', '2026-11-11');
  assert.equal(pairHolds(d('2026-11-11', '2026-11-12'), pre), false);
  assert.equal(pairHolds(['2026-11-11T09:00:00.000Z'], pre), false);
  assert.equal(pairHolds(d('2026-11-12'), pre), true);
});

test('overlap is a violation and is reported for the pair', () => {
  const picks = { 'PYTHON-L1': { dates: d('2026-11-09', '2026-11-11') }, 'PYTHON-L2': { dates: d('2026-11-10') } };
  assert.deepEqual(pairViolations(PYTHON, picks), [
    { dependent: 'PYTHON-L2', prerequisite: 'PYTHON-L1' },
  ]);
});

test('chain A → B → C: every pair is checked on its own', () => {
  const chain = [
    {
      kind: 'fixed',
      items: [
        { snap: { code: 'A' }, prerequisites: [] },
        { snap: { code: 'B' }, prerequisites: ['A'] },
        { snap: { code: 'C' }, prerequisites: ['B'] },
      ],
    },
  ];
  const ok = { A: { dates: d('2026-11-01') }, B: { dates: d('2026-11-05') }, C: { dates: d('2026-11-09') } };
  assert.deepEqual(pairViolations(chain, ok), []);
  const badBC = { ...ok, C: { dates: d('2026-11-05') } };
  assert.deepEqual(pairViolations(chain, badBC), [{ dependent: 'C', prerequisite: 'B' }]);
  // C against A alone is not a pair — only B links them.
  assert.equal(roundBlocker(chain, { A: ok.A }, 'C', d('2026-10-01')), null);
});

test('an unpicked prerequisite imposes nothing', () => {
  assert.equal(roundBlocker(PYTHON, {}, 'PYTHON-L2', L2_NOV), null);
  assert.deepEqual(pairViolations(PYTHON, { 'PYTHON-L2': { dates: L2_NOV } }), []);
});

test('a round with no dates cannot satisfy a pair it is part of', () => {
  assert.deepEqual(roundBlocker(PYTHON, { 'PYTHON-L1': L1_APR }, 'PYTHON-L2', []), {
    code: 'PYTHON-L1',
    needs: 'after',
  });
  assert.deepEqual(
    roundBlocker(PYTHON, { 'PYTHON-L2': { dates: L2_MAR } }, 'PYTHON-L1', undefined),
    { code: 'PYTHON-L2', needs: 'before' }
  );
  assert.deepEqual(
    pairViolations(PYTHON, { 'PYTHON-L1': { dates: [] }, 'PYTHON-L2': { dates: L2_MAR } }).length,
    1
  );
});

test('a prerequisite stored as `Power-Apps` matches a pick of `POWER-APPS`', () => {
  const citizen = [
    {
      kind: 'fixed',
      items: [
        { kind: 'public', course_id: 'POWER-APPS', prerequisites: [] },
        { kind: 'public', course_id: 'POWER-APPS-ADV', prerequisites: ['Power-Apps'] },
      ],
    },
  ];
  assert.equal(courseCodeKey('Power-Apps'), courseCodeKey('POWER-APPS'));
  assert.deepEqual(prerequisitePairs(citizen), [
    { dependent: 'POWER-APPS-ADV', prerequisite: 'POWER-APPS' },
  ]);
  const picks = { 'POWER-APPS': { dates: d('2026-11-10', '2026-11-11') } };
  assert.deepEqual(roundBlocker(citizen, picks, 'POWER-APPS-ADV', d('2026-10-21')), {
    code: 'POWER-APPS',
    needs: 'after',
  });
  assert.equal(roundBlocker(citizen, picks, 'POWER-APPS-ADV', d('2027-01-27')), null);
});

test('canonicaliseCurriculumCodes rewrites item and prerequisite codes, not the input', () => {
  const stored = [
    {
      kind: 'fixed',
      items: [
        { kind: 'public', snap: { code: 'Power-Apps', name: 'Power Apps' }, course_id: 'Power-Apps', prerequisites: [] },
        { kind: 'public', snap: { code: 'POWER-APPS-ADV' }, prerequisites: ['Power-Apps'] },
        { kind: 'external', externalName: 'X', prerequisites: [] },
      ],
    },
  ];
  const out = canonicaliseCurriculumCodes(stored, new Map([['Power-Apps', 'POWER-APPS']]));
  assert.equal(out[0].items[0].snap.code, 'POWER-APPS');
  assert.equal(out[0].items[0].snap.name, 'Power Apps');
  assert.equal(out[0].items[0].course_id, 'POWER-APPS');
  assert.deepEqual(out[0].items[1].prerequisites, ['POWER-APPS']);
  assert.equal(out[0].items[2].externalName, 'X');
  assert.equal(stored[0].items[0].snap.code, 'Power-Apps');
  assert.deepEqual(stored[0].items[1].prerequisites, ['Power-Apps']);
});

test('self and dangling prerequisites are ignored', () => {
  const odd = [
    { kind: 'fixed', items: [{ snap: { code: 'A' }, prerequisites: ['a', 'NOT-IN-PATH'] }] },
  ];
  assert.deepEqual(prerequisitePairs(odd), []);
});
