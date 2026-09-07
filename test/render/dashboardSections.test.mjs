import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';

/**
 * What the dashboard DRAWS for each scope combination.
 *
 * ══ THIS TIER PROVES THE WEAKER HALF, AND SAYS SO ═══════════════════════════
 *
 * Markup can show that a section is absent. It cannot show that a figure was
 * never queried, and it cannot show that a figure is absent from the PAYLOAD —
 * a component that receives every number and renders half of them passes every
 * assertion in this file while shipping the lot to devtools. Those two claims
 * are asserted in test/pure/dashboardScopes, over read counts and over the
 * serialised object.
 *
 * So the rendering assertions here are deliberately fed a payload built by the
 * REAL `buildDashboardMetrics` rather than a hand-written fixture. A fixture
 * would let this file assert that the component hides what it was not given,
 * which is a claim about a component nobody is worried about; driving it with
 * the real builder means the thing under test is the pair — the payload the
 * server would actually produce, and what this component actually does with it.
 */

/** Counts that are unmistakable in the output, so a stray one is findable. */
const REG_SENTINEL = 918273;
const SYS_SENTINEL = 445566;

/**
 * A string that appears ONLY inside the ภาพรวมระบบ section.
 *
 * MEASURED, and the reason this constant exists: the first version of this file
 * matched on 'ภาพรวมระบบ' itself, which is ALSO the page's permanent subtitle
 * ('ภาพรวมระบบ 9Expert Training') under the heading. That string renders for
 * every scope combination including none, so the registration-only assertion
 * failed — correctly, and against the test rather than the code. Every other
 * absence assertion in the file would have passed vacuously the same way had the
 * strip been the thing that went missing.
 *
 * The section's SUBTITLE is unique to it and is the honest discriminator.
 */
const STRIP_ONLY = 'ข้อมูล Live — ไม่กรองตามวันที่';

/**
 * `MasterclassRegistration` is a REGISTRATION-scope model since round E3 —
 * queue card (d) is the first masterclass figure on this page.
 *
 * MEASURED: without it here, the masterclass double returned SYS_SENTINEL, card
 * (d) rendered it on a registration-only page, and the "no system figure
 * reached the markup" assertion failed. The assertion was right; the fixture's
 * idea of which models are registration-scoped had gone stale.
 */
const REG_MODELS = new Set([
  'RegisterPublic', 'RegisterInhouse', 'MasterclassRegistration',
]);
const MODEL_NAMES = [
  'RegisterPublic', 'RegisterInhouse',
  'Banner', 'Promotion', 'Article', 'FeaturedReview', 'Recruit',
  // Round E3's action queue: (d) reads masterclass, (e) reads the webhook log.
  'MasterclassRegistration', 'WebhookLog',
];

/**
 * Collection names, because `readRegistrations` builds its `$unionWith` from
 * `RegisterInhouse.collection.name`. A double without this renders a page from a
 * pipeline production could never send.
 */
const COLLECTION_OF = Object.freeze({
  RegisterPublic: 'register_public',
  RegisterInhouse: 'register_inhouse',
  Banner: 'banners',
  Promotion: 'promotions',
  Article: 'articles',
  FeaturedReview: 'featured_reviews',
  Recruit: 'recruits',
  MasterclassRegistration: 'masterclass_registrations',
  WebhookLog: 'webhook_logs',
});

/**
 * The registration aggregation's result, carrying REG_SENTINEL wherever a
 * registration figure can come from — the status counts, the previous period and
 * the series — so any one of them leaking into a system-only page is findable.
 *
 * The content counts stay on `countDocuments`, which is what the ภาพรวมระบบ
 * strip still uses.
 */
function sentinelModels() {
  return Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(REG_MODELS.has(n) ? REG_SENTINEL : SYS_SENTINEL),
    aggregate: () => Promise.resolve([{
      current: [
        { _id: { source: 'public', status: 'pending' }, n: REG_SENTINEL },
        { _id: { source: 'inhouse', status: 'pending' }, n: REG_SENTINEL },
      ],
      previous: [{ _id: { source: 'public', status: 'pending' }, n: REG_SENTINEL }],
      series: [
        { _id: { source: 'public', key: '2026-08' }, n: REG_SENTINEL },
        { _id: { source: 'inhouse', key: '2026-08' }, n: REG_SENTINEL },
      ],
      bounds: [{ _id: null, min: new Date('2026-04-23T00:00:00Z'), max: new Date('2026-08-29T00:00:00Z'), n: REG_SENTINEL }],
    }]),
  }]));
}

/** A pinned clock, so every window and bucket below is reproducible. */
const NOW = new Date('2026-09-05T04:00:00.000Z');

async function renderFor(scopes, { range = 'today', openSchedulesCount = 7788 } = {}) {
  const data = await buildDashboardMetrics({ scopes, range, models: sentinelModels(), now: NOW });
  __setPathname('/admin');
  __setSearchParams('');
  return renderToStaticMarkup(createElement(DashboardClient, {
    // Serialised and back, exactly as a server component hands it over — so a
    // key that only survives by reference cannot pass for one on the wire.
    data: JSON.parse(JSON.stringify(data)),
    openSchedulesCount: scopes.system ? openSchedulesCount : null,
    initialRange: scopes.registrations ? range : null,
  }));
}

const BOTH = { registrations: true,  system: true  };
const REG  = { registrations: true,  system: false };
const SYS  = { registrations: false, system: true  };
const NONE = { registrations: false, system: false };

// ── the render is asserted before anything is concluded from it ─────────────
test('dashboard render: the both-scopes page is the real, populated one', async () => {
  const html = await renderFor(BOTH);
  assert.ok(html.length > 2000, `rendered only ${html.length} chars — a vacuous baseline`);
  assert.ok(html.includes('แดชบอร์ด'), 'the heading is missing');
  assert.ok(html.includes(String(REG_SENTINEL)), 'no registration figure rendered');
  assert.ok(html.includes(String(SYS_SENTINEL)), 'no system figure rendered');
  assert.ok(html.includes(STRIP_ONLY), 'the system strip is missing');
  assert.ok(html.includes('การลงทะเบียน'), 'the registration section is missing');
});

// ── 6. both scopes: today's dashboard, unchanged ────────────────────────────
test('dashboard render: BOTH scopes shows every section and the range control', async () => {
  const html = await renderFor(BOTH);
  assert.ok(html.includes('การลงทะเบียน —'),          'registration section header');
  /**
   * The chart's title is now the WINDOW IT DREW, not a fixed "(7 วัน)".
   * Round E3 replaced the hard-coded string; asserting it here would pin the
   * defect. What this file cares about is that the chart is PRESENT for a
   * caller holding the scope — which window it names is
   * test/render/dashboardTrendChart's subject.
   */
  assert.ok(html.includes('แนวโน้มการลงทะเบียน —'),   'trend chart');
  assert.ok(html.includes('สัดส่วนสถานะ Public'),      'status donut');
  assert.ok(html.includes(STRIP_ONLY),                'system strip');
  assert.ok(html.includes('รอบอบรมที่เปิดอยู่'),        'open-rounds tile');
  for (const label of ['วันนี้', '7 วัน', 'เดือนนี้', 'ทั้งหมด']) {
    assert.ok(html.includes(label), `range option ${label} is missing`);
  }
});

// ── 4. registration-only ────────────────────────────────────────────────────
test('dashboard render: REGISTRATION-only draws no system strip and no system figure', async () => {
  const html = await renderFor(REG);
  assert.ok(html.includes('การลงทะเบียน —'), 'the registration section must still render');
  assert.ok(html.includes(String(REG_SENTINEL)), 'its own figures must still render');

  assert.equal(html.includes(STRIP_ONLY), false, 'the system strip rendered');
  assert.equal(html.includes('รอบอบรมที่เปิดอยู่'), false, 'the open-rounds tile rendered');
  assert.equal(
    html.includes(String(SYS_SENTINEL)), false,
    'a system FIGURE reached the markup — the number, not just the card',
  );
});

// ── 5. system-only: the mirror image, asserted on the NUMBER ────────────────
test('dashboard render: SYSTEM-only draws no registration or payment NUMBER', async () => {
  const html = await renderFor(SYS);
  assert.ok(html.includes(STRIP_ONLY), 'the system strip must still render');
  assert.ok(html.includes(String(SYS_SENTINEL)), 'its own figures must still render');

  assert.equal(
    html.includes(String(REG_SENTINEL)), false,
    'a registration figure reached the markup for an admin without '
    + 'dashboard_registrations',
  );
  for (const gone of [
    'การลงทะเบียน —', 'Public ทั้งหมด', 'In-house ทั้งหมด',
    'แนวโน้มการลงทะเบียน (7 วัน)', 'สัดส่วนสถานะ Public',
    'ส่งใบเสนอราคาแล้ว', 'ชำระแล้ว',
  ]) {
    assert.equal(html.includes(gone), false, `'${gone}' rendered without the scope`);
  }
  assert.equal(
    html.includes('/admin/registrations'), false,
    'a deep link into the registrations list rendered — the cards are gone but '
    + 'their hrefs would still advertise the screen',
  );
});

// ── 8. the range control belongs to the registration scope ──────────────────
/**
 * A range option as it is actually RENDERED — `>ทั้งหมด<` inside its button.
 *
 * MEASURED: the bare word was enough until round E3, and then queue card (e)'s
 * link note ("รายการทั้งหมดที่ยังเก็บอยู่") legitimately contained ทั้งหมด and the
 * assertion failed against correct output. The same shape of loose matcher as
 * the ภาพรวมระบบ one above: a substring that is unique today and is not a
 * property of the thing being asserted.
 *
 * The tag boundaries make it the CONTROL's label rather than any occurrence of
 * the word.
 */
const rangeOption = (label) => `>${label}</button>`;

test('dashboard render: SYSTEM-only sees no range control at all', async () => {
  const html = await renderFor(SYS);
  for (const label of ['7 วัน', 'เดือนนี้', 'ทั้งหมด'].map(rangeOption)) {
    assert.equal(html.includes(label), false, `range option ${label} rendered`);
  }
});

test('dashboard render: a range in the URL changes NOTHING for a system-only admin', async () => {
  // Test 8. The page resolves `initialRange` to null without the scope, and the
  // action ignores `range` without the scope, so all four renders must be
  // byte-identical — including the one for a range the admin never asked for.
  const renders = [];
  for (const range of ['today', 'week', 'month', 'all']) {
    renders.push(await renderFor(SYS, { range }));
  }
  const [first, ...rest] = renders;
  for (const [i, html] of rest.entries()) {
    assert.equal(html, first, `range ${['week', 'month', 'all'][i]} changed the output`);
  }
});

test('dashboard render: the same range DOES change a registration-only page', async () => {
  // The other direction, so the assertion above is about the scope rather than
  // about `initialRange` being inert everywhere.
  const today = await renderFor(REG, { range: 'today' });
  const all   = await renderFor(REG, { range: 'all' });
  assert.notEqual(today, all, 'the range control never highlights a different option');
});

// ── 7. neither scope: it renders, it explains, it is not a full view ────────
test('dashboard render: NEITHER scope renders an explanation, not a blank or a full view', async () => {
  const html = await renderFor(NONE);

  assert.ok(html.includes('แดชบอร์ด'), 'the page must still render its heading');
  assert.ok(
    html.includes('บทบาทของคุณยังไม่ได้เปิดส่วนใดของแดชบอร์ด'),
    'the no-section state must SAY what happened',
  );
  assert.ok(
    html.includes('บทบาทและสิทธิ์'),
    'and name where the permission is granted, so the admin can ask for it',
  );

  // Not a crash, not a blank …
  assert.ok(html.length > 300, 'rendered almost nothing — indistinguishable from a blank');
  // … and above all not a silent full view.
  assert.equal(html.includes(String(REG_SENTINEL)), false);
  assert.equal(html.includes(String(SYS_SENTINEL)), false);
  assert.equal(html.includes(STRIP_ONLY), false, 'the system strip rendered with no scope');
  for (const label of ['7 วัน', 'เดือนนี้', 'ทั้งหมด']) {
    assert.equal(html.includes(label), false, 'the range control rendered with no data behind it');
  }
});

test('dashboard render: a failed fetch is still distinguishable from no permission', async () => {
  // `data: null` means the action threw. It must NOT be mistaken for the
  // no-scope state — one is worth a refresh and the other never will be.
  __setPathname('/admin');
  __setSearchParams('');
  const html = renderToStaticMarkup(createElement(DashboardClient, {
    data: null, openSchedulesCount: null, initialRange: null,
  }));
  assert.ok(html.includes('กรุณารีเฟรช'));
  assert.equal(html.includes('บทบาทของคุณยังไม่ได้เปิดส่วนใดของแดชบอร์ด'), false);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the sentinels are findable, so their absence means something', async () => {
  // Every "the figure is absent" assertion above would hold for a sentinel that
  // never appears in any render. Both do appear, in the both-scopes page.
  const html = await renderFor(BOTH);
  assert.ok(html.includes(String(REG_SENTINEL)));
  assert.ok(html.includes(String(SYS_SENTINEL)));
  assert.ok(html.includes('7788'), 'the open-rounds prop reached the markup too');
});

test('CONTROL: a component handed the full payload WOULD render the figures', async () => {
  // Proves the absence assertions are about the payload's shape rather than
  // about this component refusing to draw a sentinel. Same component, same
  // scopes flag as the system-only case, but with the registration data left in
  // — which is what "filter in the client" looks like — and the figures appear.
  const full = await buildDashboardMetrics({
    scopes: { registrations: true, system: true }, range: 'today', models: sentinelModels(), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  const html = renderToStaticMarkup(createElement(DashboardClient, {
    data: { ...JSON.parse(JSON.stringify(full)), scopes: { registrations: true, system: false } },
    openSchedulesCount: null,
    initialRange: 'today',
  }));
  assert.ok(
    html.includes(String(REG_SENTINEL)),
    'the component does draw registration figures when it is given them — so the '
    + 'system-only case above passes because the SERVER withheld them',
  );
});
