import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LineChart, lineSegments, tickIndices } from '@/components/admin/charts/LineChart';
import { readSource } from '../sourceScan.mjs';

const render = (props) => renderToStaticMarkup(createElement(LineChart, props));
const pt = (label, value) => ({ label, value });

test('missing values split the line into segments — a gap, not a drop to zero', () => {
  const series = [pt('a', 10), pt('b', 20), pt('c', null), pt('d', 30), pt('e', 40)];
  assert.deepEqual(lineSegments(series), [[0, 1], [3, 4]]);
  const html = render({ series, yMax: 100, title: 't' });
  assert.equal((html.match(/data-segment=""/g) ?? []).length, 2, 'two paths, broken at the gap');
  // CONTROL: the same series with zero instead of null is ONE path.
  const zero = render({ series: series.map((p) => (p.value === null ? pt(p.label, 0) : p)), yMax: 100 });
  assert.equal((zero.match(/data-segment=""/g) ?? []).length, 1);
});

test('a point with no neighbours is drawn as a dot, since it has no line', () => {
  const html = render({ series: [pt('a', null), pt('b', 50), pt('c', null)], yMax: 100 });
  assert.equal((html.match(/data-segment=""/g) ?? []).length, 0);
  assert.equal((html.match(/data-dot="isolated"/g) ?? []).length, 1);
});

test('each point carries a tooltip with its label and formatted value', () => {
  const html = render({ series: [pt('2026-10-01', 42.5)], yMax: 100, formatValue: (v) => `${v}%` });
  assert.match(html, /<title>2026-10-01: 42.5%<\/title>/);
});

test('all-empty series renders the empty text, no svg', () => {
  const html = render({ series: [pt('a', null)], emptyText: 'ว่าง' });
  assert.match(html, /ว่าง/);
  assert.doesNotMatch(html, /<svg/);
});

test('x ticks: at most 6, always first and last', () => {
  assert.deepEqual(tickIndices(3), [0, 1, 2]);
  const t = tickIndices(90);
  assert.equal(t.length, 6);
  assert.equal(t[0], 0);
  assert.equal(t.at(-1), 89);
});

test('the chart is plain data in, nothing consent-specific, no client hooks', () => {
  const { code } = readSource('src/components/admin/charts/LineChart.jsx');
  assert.doesNotMatch(code, /consent/i);
  assert.doesNotMatch(code, /use client|useState|useEffect/);
});

test('consent-stats page reads range/group from searchParams and renders the shared chart', () => {
  const { code } = readSource('src/app/admin/consent-stats/page.jsx');
  assert.match(code, /parseConsentStatsRange\(sp, bangkokDate\(\)\)/);
  assert.match(code, /date: \{ \$gte: from, \$lte: to \}/);
  assert.match(code, /<LineChart/);
  assert.match(code, /value: p\.rate === null \? null :/, 'no-data periods are passed as null (gaps)');
  assert.doesNotMatch(code, /useState|use client/, 'no filter state outside the URL');
  assert.match(code, /\{rangeLabel\(range\)\} \(\{from\} – \{to\}, เวลาไทย\)/, 'subtitle follows the range');
});
