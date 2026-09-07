import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';
import { bucketForRange, windowLabel } from '@/lib/dashboard/ranges';

/**
 * The trend chart: the window it draws, the window it CLAIMS to draw, and the
 * two series.
 *
 * ══ THE DEFECT ══════════════════════════════════════════════════════════════
 * The header said ทั้งหมด; the chart said "แนวโน้มการลงทะเบียน (7 วัน)" and drew
 * seven bars, all empty, because the newest registration is older than a week.
 * One screen, two contradictory claims, and the one that was wrong was the one
 * nobody could check.
 *
 * Every render below is driven by the REAL `buildDashboardMetrics` over a
 * controlled facet, so what is under test is the pair — the payload the server
 * would produce, and the title the component puts on it.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z');
const REG = { registrations: true, system: false };

const MODEL_NAMES = [
  'RegisterPublic', 'RegisterInhouse',
  'Banner', 'Promotion', 'Article', 'FeaturedReview', 'Recruit',
  // Round E3's action queue: (d) reads masterclass, (e) reads the webhook log.
  'MasterclassRegistration', 'WebhookLog',
];
const COLLECTION_OF = {
  RegisterPublic: 'register_public', RegisterInhouse: 'register_inhouse',
  Banner: 'banners', Promotion: 'promotions', Article: 'articles',
  FeaturedReview: 'featured_reviews', Recruit: 'recruits',
  MasterclassRegistration: 'masterclass_registrations', WebhookLog: 'webhook_logs',
};

function modelsReturning(facet) {
  return Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(0),
    aggregate: () => Promise.resolve([facet]),
  }]));
}

const facetOf = (over = {}) => ({ current: [], previous: [], series: [], bounds: [], ...over });

/** A corpus that spans April–August, so ทั้งหมด has an axis to draw. */
const SPANNING_BOUNDS = [{
  _id: null,
  min: new Date('2026-04-23T00:00:00Z'),
  max: new Date('2026-08-29T00:00:00Z'),
  n: 49,
}];

async function render(facet, range) {
  const data = await buildDashboardMetrics({
    scopes: REG, range, models: modelsReturning(facet), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  return {
    html: renderToStaticMarkup(createElement(DashboardClient, {
      data: JSON.parse(JSON.stringify(data)),
      openSchedulesCount: null,
      initialRange: range,
    })),
    data,
  };
}

/** A facet with one populated bucket, keyed for whatever bucket size applies. */
const populated = (key) => facetOf({
  current: [{ _id: { source: 'public', status: 'pending' }, n: 9 }],
  series: [
    { _id: { source: 'public', key }, n: 9 },
    { _id: { source: 'inhouse', key }, n: 4 },
  ],
  bounds: SPANNING_BOUNDS,
});

// ── the render is asserted before anything is concluded from it ─────────────
test('trend: the chart renders at all, with bars', async () => {
  const { html } = await render(populated('2026-08'), 'all');
  assert.ok(html.includes('แนวโน้มการลงทะเบียน'), 'no chart heading');
  assert.ok(html.includes('9'), 'no public figure drew');
  assert.ok(html.length > 2000, `rendered ${html.length} chars — a vacuous baseline`);
});

// ── 6. THE TITLE STATES THE WINDOW IT DREW ──────────────────────────────────

test('trend: the title names the window, and it is NOT hard-coded to 7 วัน', async () => {
  const seen = [];
  for (const range of ['today', 'week', 'month', 'all']) {
    const { html } = await render(populated('2026-08'), range);
    const label = windowLabel(range);
    assert.ok(
      html.includes(`แนวโน้มการลงทะเบียน — ${label}`),
      `range=${range}: the chart does not say "${label}"`,
    );
    seen.push(label);
  }
  // Four DISTINCT titles. A component that printed one string for every range
  // would satisfy the loop above if that string happened to match.
  assert.equal(new Set(seen).size, 4, 'the title did not change with the range');
});

test('trend: the OLD hard-coded title is gone from the source of truth', async () => {
  // Named explicitly, because the string is what shipped and a reader grepping
  // for it should land on its removal rather than on nothing.
  const { html } = await render(populated('2026-08'), 'all');
  assert.equal(
    html.includes('แนวโน้มการลงทะเบียน (7 วัน)'), false,
    'the fixed seven-day title is still being rendered at ทั้งหมด',
  );
});

test('trend: the subtitle names the bucket size the SERVER chose', async () => {
  const WORD = { hour: 'ชั่วโมง', day: 'วัน', month: 'เดือน' };
  for (const range of ['today', 'week', 'month', 'all']) {
    const { html, data } = await render(populated('2026-08'), range);
    assert.equal(data.bucket, bucketForRange(range), `${range}: payload bucket is wrong`);
    assert.ok(
      html.includes(`จำนวนรายการต่อ${WORD[data.bucket]}`),
      `${range}: the subtitle does not name the ${data.bucket} bucket`,
    );
  }
});

// ── 5. BUCKET SIZE CHANGES WITH THE RANGE, in the rendered axis ─────────────

test('trend: ทั้งหมด draws MONTHLY bars, not one per day', async () => {
  const { html, data } = await render(populated('2026-08'), 'all');
  assert.equal(data.bucket, 'month');
  /**
   * SIX buckets, April through September — not five.
   *
   * MEASURED: the first version of this expected April–August, the span of the
   * DATA. The axis runs from the oldest record to the window's end, and ทั้งหมด
   * ends TODAY, which is 5 September. So the current month gets a bar even
   * though nothing has landed in it yet, and July gets one even though nothing
   * landed in it at all. Both are right for the same reason: a month with no
   * registrations is a fact about the month, and closing the gap would make the
   * series look denser than the data is.
   */
  assert.deepEqual(
    data.trend.map((d) => d.key),
    ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
    'the axis must span oldest-record → today, with the empty months kept',
  );
  assert.equal(data.trend.find((d) => d.key === '2026-07').publicCount, 0, 'July is empty and drawn');
  assert.equal(data.trend.find((d) => d.key === '2026-09').publicCount, 0, 'September is empty and drawn');
  assert.ok(html.includes('ส.ค. 69'), 'the axis is not labelled in months (ส.ค. 2569)');
  // 131 days separate the bounds; a daily chart would draw that many.
  assert.ok(data.trend.length < 20, 'a daily axis crept back in at ทั้งหมด');
});

test('trend: 7 วัน draws seven DAILY bars', async () => {
  const { data } = await render(populated('2026-09-01'), 'week');
  assert.equal(data.bucket, 'day');
  assert.equal(data.trend.length, 7, `expected 7 daily bars, got ${data.trend.length}`);
});

test('trend: วันนี้ draws HOURLY bars', async () => {
  const { data } = await render(populated('2026-09-05T10'), 'today');
  assert.equal(data.bucket, 'hour');
  assert.ok(data.trend.length > 1, 'วันนี้ drew a single bar — that is not a trend');
  assert.ok(data.trend.length <= 25, `${data.trend.length} hourly bars in one day`);
  assert.ok(data.trend.every((d) => /T\d\d$/.test(d.key)), 'the keys are not hourly');
});

test('trend: the axis label format follows the bucket', async () => {
  const hour = await render(populated('2026-09-05T10'), 'today');
  assert.ok(hour.html.includes('10:00'), 'an hourly axis must show a time');

  const day = await render(populated('2026-09-01'), 'week');
  assert.ok(day.html.includes('ก.ย.'), 'a daily axis must show a day and month');

  const month = await render(populated('2026-08'), 'all');
  assert.ok(month.html.includes('ส.ค. 69'), 'a monthly axis must show a month and BE year');
});

// ── E3.3: the In-house series ───────────────────────────────────────────────

test('trend: BOTH series are drawn, and the legend names them', async () => {
  const { html, data } = await render(populated('2026-08'), 'all');
  const aug = data.trend.find((d) => d.key === '2026-08');
  assert.equal(aug.publicCount, 9);
  assert.equal(aug.inhouseCount, 4, 'the in-house series is missing from the payload');

  assert.ok(html.includes('>Public<'), 'the Public legend entry is missing');
  assert.ok(html.includes('>In-house<'), 'the In-house legend entry is missing');
  assert.ok(
    html.includes('Public + In-house'),
    'the subtitle still claims Public only',
  );
  // The stacked total is what the bar is labelled with.
  assert.ok(html.includes('>13<'), 'the stacked total 9+4 is not shown');
});

test('trend: the in-house bar has its own colour, distinct from public', async () => {
  const { html } = await render(populated('2026-08'), 'all');
  assert.ok(html.includes('bg-9e-action'), 'the public series lost its colour');
  assert.ok(html.includes('bg-violet-400'), 'the in-house series has no colour of its own');
});

// ── an empty window says so rather than drawing flat zeros ──────────────────

test('trend: an empty window renders the empty state, not a row of zero bars', async () => {
  const { html, data } = await render(facetOf({ bounds: SPANNING_BOUNDS }), 'today');
  assert.equal(data.trend.reduce((s, d) => s + d.publicCount + d.inhouseCount, 0), 0);
  assert.ok(
    html.includes('ไม่มีการลงทะเบียนในช่วงที่เลือก'),
    'a chart of flat zero bars looks like a measurement rather than an absence',
  );
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the title assertions can fail — they are not substring luck', async () => {
  // Every "the title says X" assertion would hold for a component that printed
  // every label at once. It prints exactly one.
  const { html } = await render(populated('2026-08'), 'all');
  assert.ok(html.includes(windowLabel('all')));
  for (const other of ['today', 'week', 'month']) {
    assert.equal(
      html.includes(windowLabel(other)), false,
      `the ทั้งหมด page also renders the ${other} label`,
    );
  }
});

test('CONTROL: the bar count really varies with the range', async () => {
  // Without this, "ทั้งหมด draws 5 bars" and "7 วัน draws 7" could both hold for
  // a chart that ignored the payload and drew a fixed number.
  const counts = [];
  for (const [range, key] of [['today', '2026-09-05T10'], ['week', '2026-09-01'], ['all', '2026-08']]) {
    const { data } = await render(populated(key), range);
    counts.push(data.trend.length);
  }
  assert.equal(new Set(counts).size, 3, `bar counts did not vary: ${counts}`);
});
