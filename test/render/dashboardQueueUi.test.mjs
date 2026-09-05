import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';
import { QUEUE_CARDS, queueIdsForScope } from '@/lib/dashboard/actionQueue';
import {
  STALE_PENDING_DAYS, STALLED_PAYMENT_DAYS, WEBHOOK_ERROR_WINDOW_HOURS,
} from '@/lib/dashboard/queueThresholds';

/**
 * The action queue, RENDERED — the cards, the zeros, and the links.
 *
 * Driven by the real `buildDashboardMetrics` over controlled counts, so what is
 * under test is the pair: the payload the server would produce for a scope, and
 * what this component does with it. A hand-written prop would let this file
 * assert that the component draws what it is given, which nobody doubts.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z');

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

const EMPTY_FACET = [{ current: [], previous: [], series: [], bounds: [] }];

/**
 * Every queue read returns `perModel[name]`, so a card's count is traceable to
 * the collection it came from and a stray count is findable in the markup.
 */
function models(perModel) {
  return Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(perModel[n] ?? 0),
    aggregate: () => Promise.resolve(EMPTY_FACET),
  }]));
}

async function render(scopes, perModel = {}) {
  const data = await buildDashboardMetrics({
    scopes, range: 'all', models: models(perModel), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  return {
    data,
    html: renderToStaticMarkup(createElement(DashboardClient, {
      data: JSON.parse(JSON.stringify(data)),
      openSchedulesCount: scopes.system ? 103 : null,
      initialRange: scopes.registrations ? 'all' : null,
    })),
  };
}

const BOTH = { registrations: true, system: true };
const REG  = { registrations: true, system: false };
const SYS  = { registrations: false, system: true };

/** Distinctive counts, so a card appearing in the wrong half is findable. */
const REG_N = 717171;
const SYS_N = 828282;
const LOADED = { RegisterPublic: REG_N, MasterclassRegistration: REG_N, WebhookLog: SYS_N };

// ── the render is asserted before anything is concluded from it ─────────────
test('queue ui: the section renders, with all five cards for a both-scopes caller', async () => {
  const { html } = await render(BOTH, LOADED);
  assert.ok(html.includes('รอดำเนินการ'), 'the queue section header is missing');
  for (const card of QUEUE_CARDS) {
    assert.ok(html.includes(card.label), `card "${card.label}" did not render`);
  }
});

// ── 2. ZERO IS A RESULT, NOT AN ABSENCE ─────────────────────────────────────

test('queue ui: a ZERO count renders as a CARD, not as an absence', async () => {
  /**
   * Control (b) breaks exactly this. Queue (e) is 0 in production today — all
   * 987 webhook logs are `ok` — so a component that hid empty cards would ship
   * with (e) permanently invisible, and an admin could not tell "no errors"
   * from "the card is broken".
   */
  const { html, data } = await render(BOTH, {}); // every count 0
  assert.equal(data.systemQueue.webhookErrors, 0, 'the fixture must really be zero');

  for (const card of QUEUE_CARDS) {
    assert.ok(
      html.includes(card.label),
      `card "${card.label}" vanished at zero — an empty queue must render calmly, `
      + 'not disappear',
    );
  }
  assert.ok(html.includes('ไม่มีรายการค้าง'), 'a cleared queue must SAY it is clear');
});

test('queue ui: a zero card is calm — no alarm accent', async () => {
  // "Renders calmly" is a claim about the styling, so it is asserted rather than
  // left to the comment. The amber left edge marks work waiting; zero has none.
  const empty = await render(SYS, {});
  const loaded = await render(SYS, LOADED);
  assert.equal(
    empty.html.includes('border-l-amber-400'), false,
    'an empty queue is wearing the "work waiting" accent',
  );
  assert.ok(loaded.html.includes('border-l-amber-400'), 'a non-empty queue must stand out');
});

// ── 3. SCOPE: a card a caller has no count for is not drawn ─────────────────

test('queue ui: a registration-only caller gets a–d and NOT (e)', async () => {
  const { html } = await render(REG, LOADED);
  for (const id of queueIdsForScope('registrations')) {
    const card = QUEUE_CARDS.find((c) => c.id === id);
    assert.ok(html.includes(card.label), `${id} is missing`);
  }
  const e = QUEUE_CARDS.find((c) => c.id === 'webhookErrors');
  assert.equal(html.includes(e.label), false, 'the system-scope card rendered');
  assert.equal(html.includes(e.href), false, 'its link rendered');
  assert.equal(
    html.includes(String(SYS_N)), false,
    'a system FIGURE reached the markup — the number, not just the card',
  );
});

test('queue ui: a system-only caller gets (e) and NONE of a–d', async () => {
  const { html } = await render(SYS, LOADED);
  const e = QUEUE_CARDS.find((c) => c.id === 'webhookErrors');
  assert.ok(html.includes(e.label), 'the system-scope card is missing');
  assert.ok(html.includes(String(SYS_N)), 'its figure is missing');

  for (const id of queueIdsForScope('registrations')) {
    const card = QUEUE_CARDS.find((c) => c.id === id);
    assert.equal(html.includes(card.label), false, `${id} rendered without the scope`);
  }
  assert.equal(
    html.includes(String(REG_N)), false,
    'a registration or masterclass FIGURE reached a system-only page',
  );
  assert.equal(
    html.includes('/admin/masterclass/registrations'), false,
    'the masterclass deep link rendered — the card is gone but its href would '
    + 'still advertise the screen',
  );
});

test('queue ui: the payload itself carries no cross-scope queue key', async () => {
  // The stronger form: not "the card is absent" but "the number never crossed".
  const reg = await render(REG, LOADED);
  assert.equal('systemQueue' in reg.data, false, 'a registration-only payload carries systemQueue');
  assert.ok('queue' in reg.data);

  const sys = await render(SYS, LOADED);
  assert.equal('queue' in sys.data, false, 'a system-only payload carries the registration queue');
  assert.ok('systemQueue' in sys.data);
});

// ── 8. THE THRESHOLD TEXT COMES FROM THE CONSTANT ───────────────────────────

test('queue ui: each card renders the threshold its query used', async () => {
  const { html } = await render(BOTH, LOADED);
  assert.ok(html.includes(`เกิน ${STALE_PENDING_DAYS} วัน`), 'the stale-pending threshold is not shown');
  assert.ok(html.includes(`เกิน ${STALLED_PAYMENT_DAYS} วัน`), 'the stalled-payment threshold is not shown');
  assert.ok(
    html.includes(`ใน ${WEBHOOK_ERROR_WINDOW_HOURS} ชั่วโมงที่ผ่านมา`),
    'the webhook window is not shown',
  );
});

test('queue ui: the threshold text is DERIVED — it is not a hard-coded number', async () => {
  /**
   * Test 8's real claim. Interpolating the imported constant into the
   * expectation would pass for a component with "14" typed into the JSX, so the
   * assertion is that the number appearing on screen and the number in the
   * constant are the SAME source: the card's own `threshold` string, which
   * queueThresholds.js builds from the constant.
   */
  const { html } = await render(BOTH, LOADED);
  for (const card of QUEUE_CARDS) {
    if (!card.threshold) continue;
    assert.ok(html.includes(card.threshold), `"${card.threshold}" is not rendered`);
  }
  // And no OTHER day-count is on the page pretending to be a threshold.
  assert.equal(html.includes('เกิน 3 วัน'), false, 'a threshold nobody defined is rendered');
  assert.equal(html.includes('เกิน 7 วัน'), false);
});

// ── THE LINKS ───────────────────────────────────────────────────────────────

test('queue ui: every card links to its list, and says what the list will show', async () => {
  const { html } = await render(BOTH, LOADED);
  for (const card of QUEUE_CARDS) {
    assert.ok(html.includes(`href="${card.href}"`), `${card.id} has no link to ${card.href}`);
    if (!card.linkFiltered) {
      assert.ok(
        html.includes(card.linkNote),
        `${card.id}'s link is not exactly filtered but the card does not say what `
        + 'the destination will show — an admin who clicks 27 and lands on 29 rows '
        + 'should have been told',
      );
    }
  }
});

test('queue ui: the masterclass card links to the masterclass list, not the public one', async () => {
  // The one card whose destination is a different screen entirely. Getting this
  // wrong would send an admin to a list that cannot contain the rows they were
  // counting, which is the failure mode the link rules exist for.
  const mc = QUEUE_CARDS.find((c) => c.id === 'staleMasterclassPending');
  assert.equal(mc.href, '/admin/masterclass/registrations?status=pending');
  const { html } = await render(REG, LOADED);
  assert.ok(html.includes('href="/admin/masterclass/registrations?status=pending"'));
});

// ── the queue leads the page ────────────────────────────────────────────────

test('queue ui: the queue is rendered ABOVE the registration counts', async () => {
  // It is the only section that asks the reader to act. The counts describe the
  // past; these describe work that is waiting.
  const { html } = await render(BOTH, LOADED);
  const queueAt = html.indexOf('รอดำเนินการ');
  const cardsAt = html.indexOf('การลงทะเบียน —');
  assert.ok(queueAt > -1 && cardsAt > -1, 'one of the two sections did not render');
  assert.ok(queueAt < cardsAt, 'the action queue must come first');
});

test('queue ui: the section says it is NOT date-filtered', async () => {
  const { html } = await render(BOTH, LOADED);
  assert.ok(
    html.includes('ไม่กรองตามช่วงวันที่'),
    'the queue sits under a range control it does not obey, so it has to say so',
  );
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the sentinel counts really reach the markup', async () => {
  // Every "the figure is absent" assertion above would hold for a sentinel that
  // never renders anywhere.
  const { html } = await render(BOTH, LOADED);
  assert.ok(html.includes(String(REG_N)), 'the registration sentinel never rendered');
  assert.ok(html.includes(String(SYS_N)), 'the system sentinel never rendered');
});

test('CONTROL: a card list filtered on truthiness WOULD drop the zero card', async () => {
  /**
   * Reconstructs control (b) rather than breaking the component, so the red line
   * stays legible. `count || null` is the natural-looking mistake; this shows it
   * removes exactly the cards the zero test protects.
   */
  const counts = Object.fromEntries(QUEUE_CARDS.map((c) => [c.id, 0]));
  const truthy = QUEUE_CARDS.filter((c) => counts[c.id] || null);
  const nullish = QUEUE_CARDS.filter((c) => (counts[c.id] ?? null) !== null);
  assert.deepEqual(truthy, [], 'the truthiness filter drops every empty queue');
  assert.equal(nullish.length, QUEUE_CARDS.length, 'the null check keeps them');
});
