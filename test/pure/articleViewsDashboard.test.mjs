import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_SKILL_LABEL,
  STALE_MONTHS,
  STALE_TOP_PERCENT,
  ageLabel,
  articleViewsHref,
  buildDailySeries,
  computeKpis,
  firstCollectedIndex,
  isPreviousAvailable,
  mergeArticleViews,
  paginate,
  parseDashboardQuery,
  previousPeriod,
  skillTotals,
  sortRows,
  staleArticles,
  staleExplanation,
} from '@/lib/articleViews/dashboard';
import { readSource } from '../sourceScan.mjs';

const art = (id, extra = {}) => ({ _id: id, title: `T${id}`, skills: [], ...extra });

// ── null before collection start, 0 after ─────────────────────────────────

test('a day BEFORE collection start is null; a day on/after with no row is a real 0', () => {
  const s = buildDailySeries({
    from: '2026-10-01',
    to: '2026-10-05',
    collectionStart: '2026-10-03',
    dayTotals: new Map([['2026-10-04', 7]]),
  });
  assert.deepEqual(s.map((p) => p.value), [null, null, 0, 7, 0]);
  assert.equal(firstCollectedIndex(s), 2);
});

test('nothing ever collected: every day is null, never 0', () => {
  const s = buildDailySeries({ from: '2026-10-01', to: '2026-10-03', collectionStart: null, dayTotals: {} });
  assert.deepEqual(s.map((p) => p.value), [null, null, null]);
  assert.equal(firstCollectedIndex(s), -1);
});

// ── left join ─────────────────────────────────────────────────────────────

test('left join keeps zero-view articles and ignores views of articles not in the list', () => {
  const rows = mergeArticleViews(
    [art('a'), art('b')],
    new Map([['a', 5], ['deleted', 99]]),
  );
  assert.deepEqual(rows.map((r) => [r.id, r.views]), [['a', 5], ['b', 0]]);
});

// ── KPIs ──────────────────────────────────────────────────────────────────

test('previous period is the equal-length window just before', () => {
  assert.deepEqual(previousPeriod({ from: '2026-10-01', to: '2026-10-07' }), { from: '2026-09-24', to: '2026-09-30' });
});

test('delta is null when the previous period crosses collection start', () => {
  const prev = previousPeriod({ from: '2026-10-01', to: '2026-10-07' }); // 09-24..09-30
  assert.equal(isPreviousAvailable(prev, '2026-09-25'), false, 'starts one day after prev.from');
  assert.equal(isPreviousAvailable(prev, '2026-09-24'), true, 'starts exactly on prev.from');
  assert.equal(isPreviousAvailable(prev, null), false, 'nothing collected');

  const rows = mergeArticleViews([art('a')], { a: 30 });
  const series = buildDailySeries({ from: '2026-10-01', to: '2026-10-07', collectionStart: '2026-09-25', dayTotals: {} });
  const k = computeKpis({ rows, series, previousTotal: 10, previousAvailable: false });
  assert.equal(k.deltaPct, null);
  assert.equal(k.previousTotal, null);
  const ok = computeKpis({ rows, series, previousTotal: 20, previousAvailable: true });
  assert.equal(ok.deltaPct, 50);
});

test('KPIs: totals, with-views / count, average over collected days only, peak', () => {
  const rows = mergeArticleViews([art('a'), art('b'), art('c')], { a: 6, b: 3 });
  const series = buildDailySeries({
    from: '2026-10-01',
    to: '2026-10-05',
    collectionStart: '2026-10-03',
    dayTotals: { '2026-10-03': 2, '2026-10-04': 7 },
  });
  const k = computeKpis({ rows, series, previousTotal: 0, previousAvailable: false });
  assert.equal(k.total, 9);
  assert.equal(k.withViews, 2);
  assert.equal(k.articleCount, 3);
  assert.equal(k.zeroCount, 1);
  assert.equal(k.avgPerDay, 3, '9 views over the 3 collected days, not over 5');
  assert.deepEqual(k.peak, { day: '2026-10-04', value: 7 });
});

test('no views at all: peak is null and the average is 0, not null, once collecting', () => {
  const rows = mergeArticleViews([art('a')], {});
  const series = buildDailySeries({ from: '2026-10-01', to: '2026-10-02', collectionStart: '2026-09-01', dayTotals: {} });
  const k = computeKpis({ rows, series, previousTotal: 0, previousAvailable: true });
  assert.equal(k.peak, null);
  assert.equal(k.avgPerDay, 0);
  assert.equal(k.deltaPct, null, 'no division by a zero previous total');
});

// ── per-skill ─────────────────────────────────────────────────────────────

test('an article with several skills counts toward each; no-skill bucket is last', () => {
  const rows = mergeArticleViews(
    [
      art('a', { skills: ['DATA', 'AI'] }),
      art('b', { skills: ['DATA', 'DATA'] }), // duplicate id counts once
      art('c', { skills: [] }),
    ],
    { a: 10, b: 5, c: 2 },
  );
  const t = skillTotals(rows, { DATA: 'Data', AI: 'AI' });
  assert.deepEqual(t, [
    { id: 'DATA', name: 'Data', value: 15 },
    { id: 'AI', name: 'AI', value: 10 },
    { id: null, name: NO_SKILL_LABEL, value: 2 },
  ]);
  const sum = t.reduce((s, x) => s + x.value, 0);
  assert.ok(sum > 17, 'the bars sum to more than the real total');
});

test('no no-skill bucket when every article has a skill', () => {
  const t = skillTotals(mergeArticleViews([art('a', { skills: ['X'] })], {}), {});
  assert.deepEqual(t, [{ id: 'X', name: 'X', value: 0 }]);
});

// ── stale ─────────────────────────────────────────────────────────────────

test('stale constants are 20% / 12 months and the explanation is generated from them', () => {
  assert.equal(STALE_TOP_PERCENT, 20);
  assert.equal(STALE_MONTHS, 12);
  const text = staleExplanation();
  assert.match(text, /20%/);
  assert.match(text, /12 เดือน/);
  const { code } = readSource('src/lib/articleViews/dashboard.js');
  assert.match(code, /\$\{STALE_TOP_PERCENT\}%/, 'interpolated, not typed');
  assert.match(code, /\$\{STALE_MONTHS\} เดือน/);
});

test('stale: top 20% by views (rounded up), content strictly older than 12 months', () => {
  const now = new Date('2026-10-07T00:00:00Z');
  const old = '2025-10-06T00:00:00Z'; // older than the cutoff (2025-10-07)
  const edge = '2025-10-07T00:00:00Z'; // exactly 12 months — NOT older
  const fresh = '2026-09-01T00:00:00Z';
  const ten = Array.from({ length: 10 }, (_, i) =>
    art(`r${i}`, { publishedAt: old }),
  );
  const rows = mergeArticleViews(ten, Object.fromEntries(ten.map((a, i) => [a._id, 100 - i])));
  // 10 viewed → top 2. Both old.
  assert.deepEqual(staleArticles(rows, now).map((r) => r.id), ['r0', 'r1']);

  // the third-ranked article is old but outside the top 20%
  rows[0].publishedAt = fresh;
  rows[1].contentUpdatedAt = edge;
  assert.deepEqual(staleArticles(rows, now).map((r) => r.id), [], 'r0 fresh, r1 exactly at the boundary');

  // contentUpdatedAt wins over publishedAt
  rows[1].contentUpdatedAt = '2025-10-06T23:59:59Z';
  assert.deepEqual(staleArticles(rows, now).map((r) => r.id), ['r1']);
});

test('stale ignores zero-view articles when sizing the top group, and rounds 1 viewed article up to 1', () => {
  const now = new Date('2026-10-07T00:00:00Z');
  const rows = mergeArticleViews(
    [art('a', { publishedAt: '2020-01-01' }), art('b', { publishedAt: '2020-01-01' })],
    { a: 3 },
  );
  assert.deepEqual(staleArticles(rows, now).map((r) => r.id), ['a']);
  assert.deepEqual(staleArticles(mergeArticleViews([art('z')], {}), now), []);
});

test('ageLabel', () => {
  const now = new Date('2026-10-07T00:00:00Z');
  assert.equal(ageLabel(new Date('2026-02-07T00:00:00Z'), now), '8 เดือน');
  assert.equal(ageLabel(new Date('2025-07-08T00:00:00Z'), now), '1 ปี 2 เดือน');
  assert.equal(ageLabel(new Date('2024-10-07T00:00:00Z'), now), '2 ปี');
  assert.equal(ageLabel(null, now), '—');
});

// ── URL state, sort, paging ───────────────────────────────────────────────

test('parseDashboardQuery defaults and fallbacks', () => {
  assert.deepEqual(parseDashboardQuery({}), {
    q: '', skill: '', program: '', status: 'active', sort: 'views', dir: 'desc', zero: false, page: 1, customOpen: false,
  });
  const p = parseDashboardQuery({ status: 'weird', sort: 'x', dir: 'up', page: '-3', zero: '1', range: 'custom' });
  assert.equal(p.status, 'active');
  assert.equal(p.sort, 'views');
  assert.equal(p.dir, 'desc');
  assert.equal(p.page, 1);
  assert.equal(p.zero, true);
  assert.equal(p.customOpen, true);
});

test('articleViewsHref omits defaults and orders params', () => {
  assert.equal(articleViewsHref({ status: 'active', sort: 'views', dir: 'desc', range: 30, page: 1 }), '/admin/article-views');
  assert.equal(
    articleViewsHref({ q: 'excel', status: 'all', range: 7, sort: 'published', dir: 'asc', page: 3 }, { skill: 'DATA', page: 1 }),
    '/admin/article-views?q=excel&skill=DATA&status=all&range=7&sort=published&dir=asc',
  );
  assert.equal(
    articleViewsHref({ from: '2026-09-01', to: '2026-09-30', range: 7, zero: true }),
    '/admin/article-views?from=2026-09-01&to=2026-09-30&zero=1',
  );
});

test('sortRows: views desc default, missing dates last either way', () => {
  const rows = [
    { title: 'a', views: 1, publishedAt: '2026-01-01' },
    { title: 'b', views: 5, publishedAt: null },
    { title: 'c', views: 3, publishedAt: '2025-01-01' },
  ];
  assert.deepEqual(sortRows(rows).map((r) => r.title), ['b', 'c', 'a']);
  assert.deepEqual(sortRows(rows, 'published', 'desc').map((r) => r.title), ['a', 'c', 'b']);
  assert.deepEqual(sortRows(rows, 'published', 'asc').map((r) => r.title), ['c', 'a', 'b']);
});

test('paginate clamps and reports a–b of N', () => {
  const rows = Array.from({ length: 30 }, (_, i) => i);
  assert.deepEqual(
    (({ page, pageCount, total, a, b }) => ({ page, pageCount, total, a, b }))(paginate(rows, 2, 25)),
    { page: 2, pageCount: 2, total: 30, a: 26, b: 30 },
  );
  assert.equal(paginate(rows, 99, 25).page, 2);
  assert.deepEqual((({ a, b, total }) => ({ a, b, total }))(paginate([], 1, 25)), { a: 0, b: 0, total: 0 });
});
