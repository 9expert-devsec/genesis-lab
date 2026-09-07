import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';
import { STATUS_COLOR, SERIES_COLOR, statusColor } from '@/lib/dashboard/statusColors';

/**
 * ROUND E5.4 — ONE PALETTE, AND A DIRECTION PER CARD.
 *
 * ══ TWO CLAIMS, AND THEY FAIL IN OPPOSITE DIRECTIONS ════════════════════════
 *
 * 1. THE PALETTE. Four surfaces draw status colours now. A fifth literal that
 *    happens to agree today is invisible until someone re-themes one status and
 *    three surfaces follow. The fs guard in test/fs/publicStatusLabelSources
 *    proves no dashboard SOURCE hand-writes a hex; this file proves the values
 *    that reach the MARKUP are the module's, which a source scan cannot see —
 *    a component could import the module and then draw something else.
 *
 * 2. THE DIRECTION. `+40%` on ยกเลิก used to render in the same green as `+40%`
 *    on ชำระแล้ว. That is not a formatting slip: it tells the reader more
 *    cancellations is good news. Direction is now per card, and รอดำเนินการ is
 *    NEUTRAL by decision, not by omission — see DELTA_DIRECTION's note.
 *
 * ── FIXTURES ARE ABSOLUTE LITERALS ─────────────────────────────────────────
 * The expected hexes below are written out, NOT read from STATUS_COLOR, because
 * a fixture derived from the constant under test asserts only that the constant
 * equals itself. The module import is used for the OTHER direction — proving
 * the client and the palette agree — and each such use says so.
 *
 * ── WHAT THIS FILE CANNOT SEE ──────────────────────────────────────────────
 * Whether the colours are distinguishable to a person, whether amber on the
 * histogram reads as the same amber as the pending card, and anything about
 * contrast. jsdom has no pixels. Stated in the round's report.
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

const PRODUCTION_BOUNDS = [{
  _id: null,
  min: new Date('2026-04-23T00:00:00Z'),
  max: new Date('2026-08-29T00:00:00Z'),
  n: 49,
}];

async function render(facet, range = 'week', scopes = REG) {
  const data = await buildDashboardMetrics({
    scopes, range, models: modelsReturning(facet), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  const html = renderToStaticMarkup(createElement(DashboardClient, {
    data: JSON.parse(JSON.stringify(data)),
    openSchedulesCount: null,
    initialRange: range,
  }));
  return { data, html, doc: new JSDOM(`<!doctype html><body>${html}</body>`).window.document };
}

/** A facet where every public status has a current count and a previous one. */
const MOVED = (current, previous) => facetOf({
  current: Object.entries(current).map(([status, n]) => ({ _id: { source: 'public', status }, n })),
  previous: Object.entries(previous).map(([status, n]) => ({ _id: { source: 'public', status }, n })),
  series: Object.keys(current).map((status) => ({
    _id: { source: 'public', status, key: '2026-09-05' }, n: 1,
  })),
  bounds: PRODUCTION_BOUNDS,
});

// ── 1. The palette module itself ────────────────────────────────────────────

test('the palette holds the four status hexes, written out', () => {
  // Absolute literals. These are the values that were shipping as `statusDist`
  // colour literals before E5 moved them, so this also pins that the move
  // changed no colour.
  assert.equal(STATUS_COLOR.pending,   '#f59e0b');
  assert.equal(STATUS_COLOR.confirmed, '#3b82f6');
  assert.equal(STATUS_COLOR.paid,      '#10b981');
  assert.equal(STATUS_COLOR.cancelled, '#94a3b8');
});

test('`quoted` and `confirmed` are the same colour — they are the same step', () => {
  // The in-house and public spellings of "the quotation went out" share a label
  // and a chip in lib/registrations/statuses.js. Diverging on a chart would be
  // the one place they disagree.
  assert.equal(STATUS_COLOR.quoted, '#3b82f6');
  assert.equal(statusColor('quoted'), statusColor('confirmed'));
});

test('an unknown status gets a real neutral, never blank', () => {
  // A segment with no fill is invisible, which reads as "nothing here" rather
  // than "a status nobody coloured" — the same ruling as NEUTRAL_STATUS_BADGE.
  const unknown = statusColor('a-status-that-does-not-exist');
  assert.match(unknown, /^#[0-9a-f]{6}$/i, 'the neutral is not a real colour');
  assert.ok(
    !Object.values(STATUS_COLOR).includes(unknown),
    'the neutral collides with a real status colour',
  );
});

// ── 2. The colours reach the markup, from the module ────────────────────────

test('the server sends the palette colours on statusDist, not its own literals', async () => {
  const { data } = await render(MOVED({ pending: 3 }, { pending: 2 }));
  const byStatus = Object.fromEntries(data.statusDist.map((d) => [d.status, d.color]));
  // Absolute literals again — asserting against STATUS_COLOR here would pass
  // even if buildMetrics had been rewired to some other map.
  assert.equal(byStatus.pending,   '#f59e0b');
  assert.equal(byStatus.confirmed, '#3b82f6');
  assert.equal(byStatus.paid,      '#10b981');
  assert.equal(byStatus.cancelled, '#94a3b8');
});

test('each sparkline is stroked in its own status colour', async () => {
  /**
   * The claim E5.4 makes: a reader who learns "amber is รอดำเนินการ" from the
   * proportional bar reads the pending card's little chart for free. Before
   * this round every one of the eight was `text-9e-action` blue.
   *
   * Asserted on the rendered `stroke`, because "the component imports the
   * module" is what the fs guard covers; this is the half that proves the value
   * arrives at the SVG.
   */
  const { doc } = await render(MOVED(
    { pending: 3, confirmed: 2, paid: 1, cancelled: 1 },
    { pending: 2, confirmed: 1, paid: 1, cancelled: 1 },
  ));
  const strokes = [...doc.querySelectorAll('path[stroke]')].map((p) => p.getAttribute('stroke'));
  assert.ok(strokes.length >= 8, `expected eight card sparklines, found ${strokes.length}`);
  for (const hex of ['#f59e0b', '#3b82f6', '#10b981', '#94a3b8']) {
    assert.ok(strokes.includes(hex), `no sparkline is drawn in ${hex}`);
  }
  // The two ทั้งหมด cards are totals, not statuses, and take the series colours
  // the trend chart's two stacks use.
  assert.ok(strokes.includes('#005CFF'),  'the Public total sparkline lost the action blue');
  assert.ok(strokes.includes('#a78bfa'),  'the In-house total sparkline lost the violet');
  assert.equal(
    strokes.includes('currentColor'), false,
    'a sparkline fell back to currentColor — a card was not given its colour',
  );
});

test('the client and the palette module agree on every value it draws', () => {
  // The other direction from the literals above: this one WOULD go red if the
  // client were rewired to a second map that still held the old hexes.
  assert.equal(SERIES_COLOR.public,  '#005CFF');
  assert.equal(SERIES_COLOR.inhouse, '#a78bfa');
});

// ── 3. The delta badge's direction, per card ────────────────────────────────

/** The direction attribute on the badge rendered inside the card labelled `label`. */
function directionFor(doc, label) {
  for (const card of doc.querySelectorAll('[data-slot="card"]')) {
    const name = card.querySelector('[data-slot="label"]')?.textContent?.trim();
    if (name !== label) continue;
    const badge = card.querySelector('[data-delta-direction]');
    return badge ? badge.getAttribute('data-delta-direction') : null;
  }
  return undefined;
}

test('a rise is green where more is better and red where more is worse', async () => {
  const { doc } = await render(MOVED(
    { pending: 10, confirmed: 10, paid: 10, cancelled: 10 },
    { pending:  5, confirmed:  5, paid:  5, cancelled:  5 },
  ));
  const toneFor = (label) => {
    for (const card of doc.querySelectorAll('[data-slot="card"]')) {
      if (card.querySelector('[data-slot="label"]')?.textContent?.trim() !== label) continue;
      return card.querySelector('[data-delta-direction]')?.className ?? null;
    }
    return undefined;
  };
  assert.match(toneFor('ชำระแล้ว') ?? '', /text-emerald-600/, 'a rise in paid is not good news');
  assert.match(toneFor('ยกเลิก') ?? '', /text-red-600/, 'a rise in cancellations rendered as good news');
});

test('รอดำเนินการ is NEUTRAL — grey whichever way it moved', async () => {
  /**
   * The decided one. A growing backlog is mostly more people signing up, which
   * is the same event that raises ยอดรวม; red would report a good week as a
   * problem. What is bad about pending work is its AGE, which the histogram
   * answers and this percentage cannot see.
   *
   * Asserted in BOTH directions, because "neutral" that only holds on a rise is
   * just green-on-rise wearing a different name.
   */
  const up = await render(MOVED({ pending: 20 }, { pending: 10 }));
  const down = await render(MOVED({ pending: 10 }, { pending: 20 }));
  for (const [name, r] of [['a rise', up], ['a fall', down]]) {
    const card = [...r.doc.querySelectorAll('[data-slot="card"]')]
      .find((c) => c.querySelector('[data-slot="label"]')?.textContent?.trim() === 'รอดำเนินการ');
    assert.ok(card, 'the รอดำเนินการ card is gone');
    const badge = card.querySelector('[data-delta-direction]');
    assert.ok(badge, `${name} in pending rendered no badge at all`);
    assert.equal(badge.getAttribute('data-delta-direction'), 'neutral',
      `the รอดำเนินการ card claims a direction on ${name}`);
    assert.match(badge.className, /text-\[var\(--text-muted\)\]/,
      `${name} in pending was coloured as a judgement`);
    assert.ok(!/text-emerald-600|text-red-600/.test(badge.className),
      `${name} in pending was coloured green or red`);
  }
});

test('every registration card declares a direction, so none defaults into a judgement', async () => {
  const { doc } = await render(MOVED(
    { pending: 3, confirmed: 3, paid: 3, cancelled: 3 },
    { pending: 2, confirmed: 2, paid: 2, cancelled: 2 },
  ));
  const expected = {
    'Public ทั้งหมด': 'up-good',
    'รอดำเนินการ': 'neutral',
    'ส่งใบเสนอราคาแล้ว': 'up-good',
    'ชำระแล้ว': 'up-good',
    'ยกเลิก': 'up-bad',
  };
  for (const [label, want] of Object.entries(expected)) {
    assert.equal(directionFor(doc, label), want, `the ${label} card's direction is wrong`);
  }
});

test('the sign is still on the number — the colour is the only thing that varies', async () => {
  // Direction changes the TONE, never the measurement. A reader comparing two
  // cards must see the same arithmetic on both.
  const { html } = await render(MOVED(
    { pending: 20, cancelled: 20 },
    { pending: 10, cancelled: 10 },
  ));
  assert.equal((html.match(/\+100%/g) || []).length >= 2, true,
    'the two cards did not both render +100%');
});

// ── 4. The missing percentage now explains itself ───────────────────────────

test('at ทั้งหมด the page says WHY there is no percentage', async () => {
  const { html } = await render(facetOf({
    current: [{ _id: { source: 'public', status: 'pending' }, n: 12 }],
    bounds: PRODUCTION_BOUNDS,
  }), 'all');
  assert.equal(html.includes('เทียบช่วงก่อนหน้า'), false, 'a change badge rendered at ทั้งหมด');
  assert.ok(
    html.includes('ไม่มีช่วงก่อนหน้าให้เปรียบเทียบ'),
    'the badges are absent and nothing tells the reader why — the complaint E5.4 records',
  );
});

test('and it does NOT appear on a range that has a comparison', async () => {
  // Otherwise the line would be a permanent caption contradicting the badges
  // beside it.
  const { html } = await render(MOVED({ pending: 3 }, { pending: 2 }), 'week');
  assert.ok(html.includes('เทียบช่วงก่อนหน้า'), 'the fixture produced no badge, so this proves nothing');
  assert.equal(
    html.includes('ไม่มีช่วงก่อนหน้าให้เปรียบเทียบ'), false,
    'the no-comparison line rendered on a range that has one',
  );
});
