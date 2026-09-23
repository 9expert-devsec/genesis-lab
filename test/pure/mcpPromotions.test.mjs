import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listLivePromotions } from '../../src/lib/mcp/tools/listLivePromotions.js';

/**
 * Promotions. The source is the design decision — see the tool's header for
 * why MSDB's own feed is never read.
 *
 * ── THE `page` ROW IS THE ONE THAT MATTERS ────────────────────────────────
 * Round 1 REFUTED the assumption that `price.normal` is null on every row: an
 * `early_bird` row carries a real number and a `page` row carries null across
 * the whole price object. Emitting `{normal: null, special: null, currency:
 * 'THB', discount_pct: null}` would read to a model as a priced offer with
 * missing data and invite it to guess. The whole object is dropped instead.
 */

const CORPUS = {
  generated_at: '2026-09-23T15:16:22.935Z',
  sources: { masterclass: { ok: true, count: 1 }, builder_page: { ok: true, count: 1 } },
  items: [
    {
      id: 'masterclass:aaa',
      kind: 'early_bird',
      source: 'masterclass',
      title: 'Claude AI for Data Analyst — รุ่นที่ 2',
      url: 'https://www.9experttraining.com/masterclass/mas-claude-ai-for-data-analyst',
      live_from: '2026-06-18T03:16:42.018Z',
      live_until: '2026-10-02T16:59:00.000Z',
      is_live: true,
      price: { normal: 12900, special: 9675, currency: 'THB', discount_pct: 25 },
      courses: [{ course_code: 'M-CLAUDE-DA', title: 'Claude AI for Data Analyst' }],
      bundle: null,
      description: 'เรียนรู้การวิเคราะห์ข้อมูล',
      image_url: 'https://res.cloudinary.com/x/y.png',
    },
    {
      id: 'builder_page:bbb',
      kind: 'page',
      source: 'builder_page',
      title: 'Promotions landing page',
      url: 'https://www.9experttraining.com/promotions',
      is_live: true,
      price: { normal: null, special: null, currency: 'THB', discount_pct: null },
      courses: [],
      bundle: null,
      description: 'several offers',
    },
    {
      id: 'masterclass:expired',
      kind: 'early_bird',
      title: 'Last year deal',
      url: 'https://www.9experttraining.com/masterclass/old',
      is_live: false,
      price: { normal: 9900, special: 7900, currency: 'THB', discount_pct: 20 },
      courses: [],
      description: 'over',
    },
  ],
};

const deps = (corpus = CORPUS) => ({ buildPromotionsCorpus: async () => corpus });

test('only live rows are returned', async () => {
  const out = await listLivePromotions({}, deps());
  assert.equal(out.total, 2);
  assert.ok(!JSON.stringify(out).includes('Last year deal'), 'an expired promotion must never be quotable');
});

test('a page row carries NO price object rather than a bag of nulls', async () => {
  const out = await listLivePromotions({}, deps());
  const page = out.promotions.find((p) => p.kind === 'page');
  assert.ok(page, 'the page row itself is still returned — it is a real page to visit');
  assert.ok(!('price' in page), 'no price key at all, so there is nothing for a model to fill in');
});

test('an early_bird row keeps its full price block', async () => {
  const out = await listLivePromotions({}, deps());
  const eb = out.promotions.find((p) => p.kind === 'early_bird');
  assert.deepEqual(eb.price, { normal: 12900, special: 9675, currency: 'THB', discount_pct: 25 });
  assert.equal(eb.live_until, '2026-10-02T16:59:00.000Z', 'the deadline must travel with the discount');
});

test('kind narrows the list', async () => {
  const eb = await listLivePromotions({ kind: 'early_bird' }, deps());
  assert.equal(eb.total, 1);
  assert.equal(eb.promotions[0].kind, 'early_bird');

  const pages = await listLivePromotions({ kind: 'page' }, deps());
  assert.equal(pages.total, 1);
  assert.equal(pages.promotions[0].kind, 'page');
});

test('no seat count appears anywhere', async () => {
  const out = await listLivePromotions({}, deps());
  const text = JSON.stringify(out).toLowerCase();
  for (const word of ['seat', 'capacity', 'remaining', 'places_left']) {
    assert.ok(!text.includes(word), `"${word}" must never appear — masterclass entries carry no seat data`);
  }
});

test('a failed source is reported, not silently read as "no promotions"', async () => {
  const degraded = {
    ...CORPUS,
    sources: { masterclass: { ok: false, count: 0, error: 'read_failed' }, builder_page: { ok: true, count: 1 } },
    items: [],
  };
  const out = await listLivePromotions({}, deps(degraded));
  assert.equal(out.total, 0);
  assert.match(out.warning, /masterclass/, 'an outage must be distinguishable from an empty promotions calendar');
});

test('a healthy read carries no warning', async () => {
  const out = await listLivePromotions({}, deps());
  assert.ok(!('warning' in out));
});

test('the whole payload is small enough to be cheap on every call', async () => {
  const out = await listLivePromotions({}, deps());
  assert.ok(Buffer.byteLength(JSON.stringify(out), 'utf8') < 20_000);
});
