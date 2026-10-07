import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  bucketConsentDays,
  consentStatsHref,
  daySpan,
  parseConsentStatsRange,
  parseIsoDate,
  rangeLabel,
  weekStart,
} from '@/lib/consentStatsRange';

const TODAY = '2026-10-07'; // a Wednesday
const HOST = 'www.9experttraining.com';

test('default is the last 30 days, daily, ending today', () => {
  const r = parseConsentStatsRange({}, TODAY);
  assert.equal(r.mode, 'preset');
  assert.equal(r.days, 30);
  assert.equal(r.from, '2026-09-08');
  assert.equal(r.to, TODAY);
  assert.equal(r.group, 'day');
  assert.equal(r.error, null);
  assert.equal(rangeLabel(r), '30 วันล่าสุด');
});

test('presets 7 and 90; an unknown preset is the default, not an error', () => {
  assert.equal(parseConsentStatsRange({ range: '7' }, TODAY).from, '2026-10-01');
  assert.equal(parseConsentStatsRange({ range: '90' }, TODAY).from, '2026-07-10');
  const odd = parseConsentStatsRange({ range: '45' }, TODAY);
  assert.equal(odd.days, 30);
  assert.equal(odd.error, null);
});

test('group=week selects weekly; anything else is daily', () => {
  assert.equal(parseConsentStatsRange({ group: 'week' }, TODAY).group, 'week');
  assert.equal(parseConsentStatsRange({ group: 'month' }, TODAY).group, 'day');
});

test('custom range is used as given and labelled with its length', () => {
  const r = parseConsentStatsRange({ from: '2026-09-01', to: '2026-09-10', range: '7' }, TODAY);
  assert.equal(r.mode, 'custom', 'from/to win over range');
  assert.deepEqual([r.from, r.to, r.days], ['2026-09-01', '2026-09-10', 10]);
  assert.equal(rangeLabel(r), 'ช่วงที่กำหนดเอง (10 วัน)');
});

test('from > to is rejected with an inline message and falls back to the default', () => {
  const r = parseConsentStatsRange({ from: '2026-09-10', to: '2026-09-01' }, TODAY);
  assert.equal(r.mode, 'preset');
  assert.equal(r.days, 30);
  assert.match(r.error, /วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด/);
  assert.deepEqual(r.input, { from: '2026-09-10', to: '2026-09-01' }, 'what was typed is kept for the form');
});

test('a span over 365 days is capped to 365 ending at `to`, with a notice', () => {
  const r = parseConsentStatsRange({ from: '2024-01-01', to: '2026-09-30' }, TODAY);
  assert.equal(r.mode, 'custom');
  assert.equal(r.to, '2026-09-30');
  assert.equal(daySpan(r.from, r.to), 365);
  assert.match(r.error, /365/);
  // exactly 365 is allowed without a notice
  const ok = parseConsentStatsRange({ from: addDays('2026-09-30', -364), to: '2026-09-30' }, TODAY);
  assert.equal(ok.error, null);
  assert.equal(ok.days, 365);
});

test('to after today is clamped; malformed or half-given dates fall back with a message', () => {
  assert.equal(parseConsentStatsRange({ from: '2026-10-01', to: '2026-12-31' }, TODAY).to, TODAY);
  for (const sp of [{ from: '2026-02-31', to: '2026-03-02' }, { from: '2026-09-01' }, { to: 'x' }]) {
    const r = parseConsentStatsRange(sp, TODAY);
    assert.equal(r.mode, 'preset');
    assert.ok(r.error, JSON.stringify(sp));
  }
});

test('parseIsoDate rejects roll-over dates', () => {
  assert.equal(parseIsoDate('2026-02-28'), '2026-02-28');
  assert.equal(parseIsoDate('2026-02-31'), null);
  assert.equal(parseIsoDate('2026-2-3'), null);
});

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-10-07'), '2026-10-05'); // Wed → Mon
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Mon → itself
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sun → previous Mon
});

test('daily buckets cover every day in range, marking days with no data', () => {
  const docs = [
    { date: '2026-10-01', accept_all: 1 },
    { date: '2026-10-03', accept_all: 2 },
    { date: '2026-09-01', accept_all: 9 }, // outside the range — ignored
  ];
  const p = bucketConsentDays(docs, { from: '2026-10-01', to: '2026-10-04', group: 'day' });
  assert.deepEqual(p.map((x) => x.key), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(p.map((x) => x.hasData), [true, false, true, false]);
  assert.equal(p[0].label, '2026-10-01');
});

test('weekly buckets are Monday–Sunday, clipped to the range at both ends', () => {
  const docs = [
    { date: '2026-10-01', accept_all: 1 }, // Thu, first partial week
    { date: '2026-10-02', accept_all: 1 },
    { date: '2026-10-06', accept_all: 1 }, // Tue, second week
  ];
  const p = bucketConsentDays(docs, { from: '2026-10-01', to: '2026-10-14', group: 'week' });
  assert.deepEqual(
    p.map((x) => [x.from, x.to]),
    [
      ['2026-10-01', '2026-10-04'],
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-14'],
    ],
  );
  assert.deepEqual(p.map((x) => x.docs.length), [2, 1, 0]);
  assert.deepEqual(p.map((x) => x.hasData), [true, true, false]);
  assert.equal(p[1].label, '2026-10-05 – 2026-10-11');
});

test('consentStatsHref omits defaults and keeps the other dimensions', () => {
  const base = { host: HOST, defaultHost: HOST };
  assert.equal(consentStatsHref({ ...base, range: 30, group: 'day' }), '/admin/consent-stats');
  assert.equal(consentStatsHref({ ...base, range: 7, group: 'week' }), '/admin/consent-stats?range=7&group=week');
  assert.equal(
    consentStatsHref({ ...base, host: 'localhost:3000', from: '2026-09-01', to: '2026-09-10', range: 7 }),
    '/admin/consent-stats?host=localhost%3A3000&from=2026-09-01&to=2026-09-10',
  );
});
