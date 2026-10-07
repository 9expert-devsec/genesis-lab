import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LineChart } from '@/components/admin/charts/LineChart';
import { Sparkline } from '@/components/admin/charts/Sparkline';
import { ADMIN_PAGES } from '@/lib/rbac/pages';
import { readSource } from '../sourceScan.mjs';

const pt = (label, value) => ({ label, value });

// ── LineChart: the optional not-collected band ───────────────────────────

test('LineChart draws a labelled band before the first collected point when asked', () => {
  const series = [pt('a', null), pt('b', null), pt('c', 4), pt('d', 6)];
  const html = renderToStaticMarkup(createElement(LineChart, { series, notCollectedBefore: 2 }));
  assert.match(html, /data-not-collected=""/);
  assert.match(html, /ยังไม่เริ่มเก็บ/);
});

test('LineChart draws NO band when the prop is omitted or 0 — the consent page is unchanged', () => {
  const series = [pt('a', null), pt('b', 3), pt('c', 4)];
  const without = renderToStaticMarkup(createElement(LineChart, { series, yMax: 100 }));
  assert.doesNotMatch(without, /data-not-collected/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(LineChart, { series, notCollectedBefore: 0 })), /data-not-collected/);
  const { code } = readSource('src/app/admin/consent-stats/page.jsx');
  assert.doesNotMatch(code, /notCollectedBefore/, 'consent-stats does not pass the band');
});

// ── Sparkline ─────────────────────────────────────────────────────────────

test('Sparkline: gaps split the line, a lone point is a dot, all-null is an empty box', () => {
  const html = renderToStaticMarkup(createElement(Sparkline, { values: [1, 2, null, 5, null], label: 'x' }));
  assert.equal((html.match(/<path/g) ?? []).length, 1);
  assert.equal((html.match(/<circle/g) ?? []).length, 1);
  const empty = renderToStaticMarkup(createElement(Sparkline, { values: [null, null], label: 'x' }));
  assert.match(empty, /data-chart="sparkline"/);
  assert.doesNotMatch(empty, /<path|<circle/);
});

// ── wiring ────────────────────────────────────────────────────────────────

test('the page is gated by requirePage with its own registered key', () => {
  const { code } = readSource('src/app/admin/article-views/page.jsx');
  assert.match(code, /await requirePage\('article_views'\);/);
  const overview = ADMIN_PAGES.find((g) => g.group === 'ภาพรวม').pages.map((p) => p.key);
  assert.equal(overview[overview.indexOf('consent_stats') + 1], 'article_views', 'registered directly after consent_stats');
});

test('sidebar: สถิติยอดวิวบทความ sits directly under สถิติความยินยอมคุกกี้', () => {
  const { code } = readSource('src/components/layout/AdminSidebar.jsx');
  const a = code.indexOf("href: '/admin/consent-stats'");
  const b = code.indexOf("href: '/admin/article-views'");
  assert.ok(a > 0 && b > a, 'both rows present, in order');
  const between = code.slice(a, b);
  assert.equal((between.match(/\{ label: /g) ?? []).length, 1, 'no other row between them');
  assert.match(code, /\{ label: 'สถิติยอดวิวบทความ', href: '\/admin\/article-views', icon: 'Eye', pageKey: 'article_views' \}/);
});

test('migrate-rbac seeds article_views to nobody, exactly like consent_stats', () => {
  const { code } = readSource('src/scripts/migrate-rbac.mjs');
  assert.match(code, /article_views: 'SUPER',/);
  assert.match(code, /'consent_stats', 'article_views'\]\);/, 'and excluded from the widened admin role');
});

test('all filter state is read from searchParams; nothing copies it into client state', () => {
  const page = readSource('src/app/admin/article-views/page.jsx').code;
  assert.match(page, /parseDateRange\(sp, bangkokDate\(\)\)/);
  assert.match(page, /parseDashboardQuery\(sp\)/);
  assert.doesNotMatch(page, /use client|useState/);
  const form = readSource('src/app/admin/article-views/_components/FilterForm.jsx').code;
  assert.doesNotMatch(form, /useState|useSearchParams/);
  assert.match(form, /router\.push\(/, 'push, so Back works');
});

test('sparkline data is fetched for the current page rows only', () => {
  const { code } = readSource('src/app/admin/article-views/page.jsx');
  assert.match(code, /getDailyByArticle\(pageData\.pageRows\.map\(\(r\) => r\.id\), from, to\)/);
});

test('the stale explanation on the page is the generated one', () => {
  const { code } = readSource('src/app/admin/article-views/page.jsx');
  assert.match(code, /\{staleExplanation\(\)\}/);
  assert.doesNotMatch(code, /STALE_TOP_PERCENT|STALE_MONTHS/, 'the page does not restate the constants');
});
