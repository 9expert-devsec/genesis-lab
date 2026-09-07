import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';

/**
 * EQUAL CARD HEIGHTS — asserted as the STRUCTURE that produces them.
 *
 * ══ WHAT THIS FILE CAN AND CANNOT PROVE ═════════════════════════════════════
 *
 * Equal height is a pixel fact. `renderToStaticMarkup` has no layout engine, no
 * CSS and no box model, so a render test CANNOT measure a height, and one that
 * claimed to would be lying. Saying so here rather than quietly asserting
 * something weaker and naming it "equal heights".
 *
 * What it CAN prove is the property the fix rests on: every card emits the same
 * named slots in the same order, whichever optional parts its caller passed. A
 * card missing a slot is the defect — it was the chip row's absence on two of
 * the five that made them differ — and a card missing a slot is exactly what
 * this catches.
 *
 * The remaining pixel claims (the min-h values really equal the rendered heights
 * of a chip and a delta; the row is level at every breakpoint) are unverified
 * without a browser and the report says so.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z');
const REG = { registrations: true, system: false };

const MODEL_NAMES = [
  'RegisterPublic', 'RegisterInhouse',
  'Banner', 'Promotion', 'Article', 'FeaturedReview', 'Recruit',
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

/** A populated window WITH a previous period, so the delta slot has content. */
const POPULATED = facetOf({
  current: [
    { _id: { source: 'public',  status: 'pending' }, n: 12 },
    { _id: { source: 'inhouse', status: 'pending' }, n: 4 },
  ],
  previous: [
    { _id: { source: 'public',  status: 'pending' }, n: 10 },
    { _id: { source: 'inhouse', status: 'pending' }, n: 2 },
  ],
  series: [
    { _id: { source: 'public',  key: '2026-09-01' }, n: 12 },
    { _id: { source: 'inhouse', key: '2026-09-01' }, n: 4 },
  ],
  bounds: [{ _id: null, min: new Date('2026-04-23T00:00:00Z'), max: new Date('2026-09-01T00:00:00Z'), n: 16 }],
});

async function render(facet, range = 'week') {
  const data = await buildDashboardMetrics({
    scopes: REG, range, models: modelsReturning(facet), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  return renderToStaticMarkup(createElement(DashboardClient, {
    data: JSON.parse(JSON.stringify(data)),
    openSchedulesCount: null,
    initialRange: range,
  }));
}

/**
 * Split the markup into one string per stat card.
 *
 * Bounded on the NEXT card's opening marker rather than on a closing `</div>` —
 * the cards nest divs, so a naive close-tag scan would truncate every card at
 * its first inner slot and every "the slot is present" assertion would fail for
 * the wrong reason.
 */
function statCards(html) {
  const parts = html.split('data-slot="card"');
  return parts.slice(1).map((p) => `data-slot="card"${p}`);
}

/** Which named slots a card emits, in order. */
function slotsOf(cardHtml) {
  return [...cardHtml.matchAll(/data-slot="([a-z]+)"/g)].map((m) => m[1]);
}

// ── the split is asserted before anything is concluded from it ──────────────
test('card shell: the markup really splits into the eight registration cards', async () => {
  const html = await render(POPULATED);
  const cards = statCards(html);
  assert.equal(
    cards.length, 8,
    `expected 5 public + 3 in-house stat cards, found ${cards.length} — the split `
    + 'is broken and every assertion below would be about nothing',
  );
});

// ── 3. EVERY CARD IN A ROW HAS THE SAME STRUCTURE ──────────────────────────

test('card shell: every card emits the SAME slots, in the same order', async () => {
  const html = await render(POPULATED);
  const cards = statCards(html);
  const shapes = cards.map(slotsOf);

  const [first, ...rest] = shapes;
  assert.deepEqual(
    first, ['card', 'label', 'value', 'badge', 'sparkline', 'delta'],
    'the card shell changed — if a slot was added, add it here deliberately',
  );
  for (const [i, shape] of rest.entries()) {
    assert.deepEqual(
      shape, first,
      `card ${i + 2} has a different structure: ${shape} vs ${first}. That is the `
      + 'defect — two of the five carried no chip row and so were a chip shorter.',
    );
  }
});

test('card shell: the chip slot is present on cards WITHOUT a chip', async () => {
  /**
   * The heart of it. "Public ทั้งหมด" passes no `badge`; its neighbours do. The
   * slot has to exist either way, or the space is not reserved and the fix is a
   * special case waiting to be re-broken by the next optional part.
   */
  const html = await render(POPULATED);
  const cards = statCards(html);

  const totalCard = cards.find((c) => c.includes('Public ทั้งหมด'));
  assert.ok(totalCard, 'the Public ทั้งหมด card was not found');
  assert.ok(totalCard.includes('data-slot="badge"'), 'the chip slot is missing on a chipless card');
  // …and it really is empty, i.e. the slot is reserving space rather than
  // holding a chip nobody asked for.
  const badgeBlock = totalCard.slice(totalCard.indexOf('data-slot="badge"'));
  assert.equal(
    /rounded-full/.test(badgeBlock.slice(0, 200)), false,
    'a chip was rendered on a card that passed none',
  );

  const chipCard = cards.find((c) => c.includes('รอ<'));
  assert.ok(chipCard, 'no card with a chip was found — the contrast is missing');
  assert.ok(/rounded-full/.test(chipCard), 'the chip card lost its chip');
});

test('card shell: the reserved slots carry a min-height, not just a margin', async () => {
  // A slot with no min-height collapses to zero when empty, which is the same
  // as not having it. This is what makes the space RESERVED.
  const html = await render(POPULATED);
  const card = statCards(html)[0];
  assert.match(card, /data-slot="badge"[^>]*min-h-\[/, 'the chip slot reserves no height');
  assert.match(card, /data-slot="delta"[^>]*min-h-\[/, 'the delta slot reserves no height');
});

test('card shell: the card stretches to the row — h-full on BOTH the link and the card', async () => {
  /**
   * The anchor is the grid item. Without `h-full` on the anchor the card cannot
   * know the row height; without it on the card, the anchor stretches and the
   * card inside does not — which is the state that made the borders line up
   * while the contents did not.
   */
  const html = await render(POPULATED);
  const card = statCards(html)[0];
  assert.match(card, /data-slot="card"[^>]*h-full/, 'the card does not stretch');
  assert.match(html, /<a[^>]*class="[^"]*h-full[^"]*"[^>]*>\s*<div data-slot="card"/,
    'the anchor wrapping a card does not stretch');
});

test('card shell: the delta slot is pinned to the bottom', async () => {
  // `mt-auto` in a flex column. Without it the delta floats under whatever
  // content precedes it and sits at a different height on a chipless card.
  const html = await render(POPULATED);
  const card = statCards(html)[0];
  assert.match(card, /data-slot="card"[^>]*flex-col/, 'the card is not a flex column');
  assert.match(card, /data-slot="delta"[^>]*mt-auto/, 'the delta slot is not pinned');
});

test('card shell: the structure holds when the delta is ABSENT too', async () => {
  // ทั้งหมด sends no delta at all (there is no period before everything), so the
  // delta slot is empty on every card. The shape must not change.
  const html = await render(POPULATED, 'all');
  const shapes = statCards(html).map(slotsOf);
  assert.ok(shapes.length >= 8);
  for (const shape of shapes) {
    assert.deepEqual(shape, ['card', 'label', 'value', 'badge', 'sparkline', 'delta']);
  }
  assert.equal(html.includes('เทียบช่วงก่อนหน้า'), false, 'a delta rendered at ทั้งหมด');
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the slot scanner can see a DIFFERENCE, so equality means something', () => {
  // Without this, "every card has the same slots" would hold for a scanner that
  // returned the same list regardless of input.
  const withChip = '<div data-slot="card"><p data-slot="label"></p><div data-slot="badge"></div></div>';
  const without  = '<div data-slot="card"><p data-slot="label"></p></div>';
  assert.deepEqual(slotsOf(withChip), ['card', 'label', 'badge']);
  assert.deepEqual(slotsOf(without),  ['card', 'label']);
  assert.notDeepEqual(slotsOf(withChip), slotsOf(without));
});

test('CONTROL: the card splitter counts cards, not divs', () => {
  const two = '<div data-slot="card"><div data-slot="label"></div></div>'
            + '<div data-slot="card"><div data-slot="label"></div></div>';
  assert.equal(statCards(two).length, 2);
  assert.equal(statCards('<div>nothing</div>').length, 0);
});
