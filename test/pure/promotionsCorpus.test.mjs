import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromotionsCorpus,
  builderPageItems,
  earlyBirdConfigItems,
  masterclassItems,
  sortItems,
  CORPUS_PUBLIC_ORIGIN,
} from '@/lib/corpus/promotions';
import { corpusAuthStatus } from '@/lib/corpus/promotionsAuth';
import { GET } from '@/app/api/corpus/promotions/route';

/**
 * WHAT /api/corpus/promotions IS ALLOWED TO SAY IS ON SALE.
 *
 * Every fixture below is modelled on a row docs/promotions-corpus-phase-a.md
 * measured on 2026-09-12, so each test pins a decision that was taken against
 * real data rather than a shape invented for the test:
 *
 *   · three early_bird_configs rows carry `is_active: true` with deadlines
 *     110 / 35 / 2 days in the past — the filter must be the DEADLINE alone;
 *   · masterclass_batches.course_slug is stale on every live batch
 *     (`ai-content` where the course is `mas-ai-dmc`) — the join must be the
 *     ObjectId, and a slug that happens to match a real course must not rescue
 *     a batch whose id resolves nothing;
 *   · the cron route skips auth when its secret is unset — this one must not.
 *
 * Every read is injected, so no test here can reach Mongo; `now` is injected
 * too, so "in the future" is a fact of the fixture and not of the day the
 * suite happens to run.
 */

const NOW = new Date('2026-09-13T00:00:00.000Z');
const PAST = '2026-09-10T16:59:59.999Z';
const FUTURE = '2026-10-02T16:59:00.000Z';

// ── early_bird_configs: the deadline is the filter, is_active is a field ────

const EB_ROWS = [
  // The three live rows that pass `is_active` with a deadline in the past.
  { _id: 'eb-mse-ai',  course_id: 'MSE-AI',          special_price: 10965, deadline: '2026-05-25T05:59:00Z', is_active: true,  promotion_id: '69f84930' },
  { _id: 'eb-mse-l1',  course_id: 'MSE-L1',          special_price: 1000,  deadline: '2026-08-08T13:57:00Z', is_active: true,  promotion_id: '6a0c0a24' },
  { _id: 'eb-cop-adv', course_id: 'COPILOT-STU-ADV', special_price: 12665, deadline: PAST,                   is_active: true,  owner_page_id: 'page-copilot' },
];

test('an early_bird_configs row with is_active: true and a past deadline is NOT returned', () => {
  const items = earlyBirdConfigItems(EB_ROWS, { pages: [], now: NOW });
  assert.deepEqual(items, [], 'all three is_active rows have expired; none may be served');
});

test('CONTROL: the same rows with a future deadline ARE returned — the deadline is what flipped them', () => {
  const rows = EB_ROWS.map((r) => ({ ...r, deadline: FUTURE }));
  const items = earlyBirdConfigItems(rows, { pages: [], now: NOW });
  assert.deepEqual(items.map((i) => i.id), ['early_bird_config:eb-mse-ai', 'early_bird_config:eb-mse-l1', 'early_bird_config:eb-cop-adv']);
  assert.equal(items[0].live_until, FUTURE);
  assert.equal(items[0].price.special, 10965);
  assert.equal(items[0].price.normal, null, 'the list price is not on the row and is not invented');
});

test('CONTROL: is_active: false with a future deadline is STILL returned — the flag is not in the filter either way', () => {
  const items = earlyBirdConfigItems(
    [{ _id: 'eb-pbi', course_id: 'POWER-BI', special_price: 59999, deadline: FUTURE, is_active: false }],
    { pages: [], now: NOW }
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].is_active, false, 'reported as a field');
  assert.equal(items[0].is_live, true, 'but it does not decide liveness');
});

test('a row whose owning page does not resolve gets url: null — never a legacy promotion_id slug', () => {
  const items = earlyBirdConfigItems(
    [{ _id: 'eb-legacy', course_id: 'MSE-AI', special_price: 10965, deadline: FUTURE, is_active: true, promotion_id: '69f84930', owner_page_id: '' }],
    { pages: [], now: NOW }
  );
  assert.equal(items[0].url, null);
  assert.ok(!JSON.stringify(items[0]).includes('69f84930'), 'the MSDB promotion id does not leak into any field');
});

test('a row whose owning page was served as a builder early-bird item is folded into it, not duplicated', () => {
  const page = livePage({ _id: 'page-copilot', slug: 'promotion-copilot', promotionKind: 'early_bird',
    earlyBird: { courseRef: '6a0000', courseCode: 'COPILOT-STU-ADV', scheduleId: '6a4b5bc0', specialPrice: 12665, deadline: FUTURE } });
  const row = { _id: 'eb-cop-adv', course_id: 'COPILOT-STU-ADV', special_price: 12665, deadline: FUTURE, is_active: true, owner_page_id: 'page-copilot' };
  const served = earlyBirdConfigItems([row], { pages: [page], now: NOW, servedPageIds: new Set(['page-copilot']) });
  assert.deepEqual(served, [], 'the page item already carries every field the row does');
  // …and the row is served, WITH the page's URL, when the page was not served
  // as an early-bird item (e.g. its binding is incomplete).
  const alone = earlyBirdConfigItems([row], { pages: [page], now: NOW, servedPageIds: new Set() });
  assert.equal(alone[0].url, `${CORPUS_PUBLIC_ORIGIN}/promotions/promotion-copilot`);
});

// ── auth: fail closed ───────────────────────────────────────────────────────

test('a missing CORPUS_API_KEY refuses rather than allows', async () => {
  assert.equal(corpusAuthStatus('any-key', undefined), 503);
  assert.equal(corpusAuthStatus('any-key', ''), 503);
  assert.equal(corpusAuthStatus('any-key', '   '), 503, 'whitespace is not a key');

  // Through the route, with the variable genuinely absent from the process.
  const saved = process.env.CORPUS_API_KEY;
  delete process.env.CORPUS_API_KEY;
  try {
    const res = await GET(new Request('http://localhost/api/corpus/promotions', { headers: { 'x-api-key': 'any-key' } }));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.error, 'corpus_unavailable');
    assert.ok(!('items' in body), 'no corpus is served on the refusal path');
  } finally {
    if (saved !== undefined) process.env.CORPUS_API_KEY = saved;
  }
});

test('CONTROL: with a key configured, only the matching key is 200; wrong and absent are 401 with an empty body', async () => {
  assert.equal(corpusAuthStatus('secret-1', 'secret-1'), 200);
  assert.equal(corpusAuthStatus('secret-2', 'secret-1'), 401);
  assert.equal(corpusAuthStatus('secret-1x', 'secret-1'), 401, 'a longer key with the right prefix is not close enough');
  assert.equal(corpusAuthStatus(null, 'secret-1'), 401);
  assert.equal(corpusAuthStatus('', 'secret-1'), 401);

  const saved = process.env.CORPUS_API_KEY;
  process.env.CORPUS_API_KEY = 'secret-1';
  try {
    const res = await GET(new Request('http://localhost/api/corpus/promotions', { headers: { 'x-api-key': 'secret-2' } }));
    assert.equal(res.status, 401);
    assert.equal(await res.text(), '', 'no body detail on a rejected key');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  } finally {
    if (saved === undefined) delete process.env.CORPUS_API_KEY; else process.env.CORPUS_API_KEY = saved;
  }
});

// ── masterclass: the ObjectId is the join, course_slug is stale ─────────────

const COURSES = [
  { _id: 'c-dmc', slug: 'mas-ai-dmc', course_code: 'M-AI-DMC', title_th: 'AI Digital Marketing Creator Masterclass',
    subtitle_th: 'สร้างคอนเทนต์ด้วย AI', time_start: '09:00', time_end: '17:00', is_published: true },
  { _id: 'c-cda', slug: 'mas-claude-ai-for-data-analyst', course_code: 'M-CDA', title_th: 'Claude AI for Data Analyst',
    subtitle_th: '', time_start: '09:00', time_end: '17:00', is_published: true },
];

const DMC_BATCH_1 = {
  _id: 'b-dmc-1', course_id: 'c-dmc', course_slug: 'ai-content', // STALE, verbatim from the live row
  batch_no: 1, batch_label: 'รุ่นที่ 1', status: 'open',
  dates: [{ date: '2026-09-26T00:00:00Z', day_label: 'เสาร์' }], venue_name: 'Asia Hotel | Bangkok',
  price_normal: 12900, price_early_bird: 9030, early_bird_deadline: '2026-09-16T16:59:00Z', early_bird_active: true,
  capacity: 50, registered_count: 7, createdAt: '2026-05-04T06:31:24Z',
};

test('a masterclass batch whose course_slug is stale still resolves its course and URL via the ObjectId', () => {
  const [item] = masterclassItems({ batches: [DMC_BATCH_1], courses: COURSES }, NOW);
  assert.ok(item, 'the batch is served');
  assert.equal(item.url, `${CORPUS_PUBLIC_ORIGIN}/masterclass/mas-ai-dmc`, 'the COURSE slug, not the batch copy');
  assert.ok(!item.url.includes('ai-content'));
  assert.equal(item.title, 'AI Digital Marketing Creator Masterclass — รุ่นที่ 1');
  assert.deepEqual(item.price, { normal: 12900, special: 9030, currency: 'THB', discount_pct: 30 });
  assert.deepEqual(item.courses[0], {
    course_code: 'M-AI-DMC', title: 'AI Digital Marketing Creator Masterclass', schedule_id: null,
    dates: ['2026-09-26'], time: '09:00–17:00', venue: 'Asia Hotel | Bangkok',
  });
  assert.equal('seats' in item.courses[0], false, 'seats are ABSENT, not null — registered_count is not trustworthy');
  assert.equal('seats' in item, false);
  assert.equal(item.live_until, '2026-09-16T16:59:00.000Z');
  assert.equal(item.description, 'สร้างคอนเทนต์ด้วย AI');
});

test('CONTROL: a batch whose course_slug names a real course but whose course_id resolves nothing is NOT served', () => {
  const orphan = { ...DMC_BATCH_1, _id: 'b-orphan', course_id: 'c-gone', course_slug: 'mas-ai-dmc' };
  assert.deepEqual(masterclassItems({ batches: [orphan], courses: COURSES }, NOW), [],
    'if the slug were consulted this would resolve — it must not');
});

test('masterclass gates: draft batch, unpublished course, and a deadline past the injected now are all excluded', () => {
  const draft = { ...DMC_BATCH_1, _id: 'b-draft', status: 'draft' };
  const unpublished = { ...DMC_BATCH_1, _id: 'b-unpub', course_id: 'c-unpub' };
  const expired = { ...DMC_BATCH_1, _id: 'b-expired', early_bird_deadline: PAST };
  const courses = [...COURSES, { ...COURSES[0], _id: 'c-unpub', slug: 'mas-hidden', is_published: false }];
  const items = masterclassItems({ batches: [draft, unpublished, expired, DMC_BATCH_1], courses }, NOW);
  assert.deepEqual(items.map((i) => i.id), ['masterclass:b-dmc-1']);
  // CONTROL for the clock: the "expired" batch is live when judged a week earlier.
  const earlier = new Date('2026-09-01T00:00:00Z');
  assert.equal(masterclassItems({ batches: [expired], courses }, earlier).length, 1,
    'liveness is judged against the injected now, not the wall clock');
});

// ── builder pages ───────────────────────────────────────────────────────────

function livePage(over = {}) {
  return {
    _id: 'page-1', slug: 'promo', title: 'Promo', pageType: 'promotion', status: 'published',
    publishStartDate: '2026-09-01T17:00:00Z', publishEndDate: '2026-10-31T16:59:59.999Z',
    promotionKind: 'none', earlyBird: {}, sections: [], createdAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

test('an early-bird page carries the min-of-two deadline and dies with its publish window', () => {
  const binding = { courseRef: '6a0000', courseCode: 'COPILOT-STU-ADV', scheduleId: '6a4b5bc0', specialPrice: 12665, deadline: '2026-11-30T16:59:59.999Z' };
  const live = livePage({ promotionKind: 'early_bird', earlyBird: binding });
  const [item] = builderPageItems([live], NOW);
  assert.equal(item.kind, 'early_bird');
  assert.equal(item.live_until, '2026-10-31T16:59:59.999Z', 'publishEndDate is earlier than the author deadline and wins');
  assert.equal(item.url, `${CORPUS_PUBLIC_ORIGIN}/promotions/promo`);
  assert.deepEqual(item.price, { normal: null, special: 12665, currency: 'THB', discount_pct: null });
  assert.equal(item.courses[0].course_code, 'COPILOT-STU-ADV');
  assert.equal(item.courses[0].schedule_id, '6a4b5bc0');

  // The live Copilot page, verbatim: published, window ended 2026-09-10.
  const ended = livePage({ promotionKind: 'early_bird', earlyBird: { ...binding, deadline: PAST }, publishEndDate: PAST });
  assert.deepEqual(builderPageItems([ended], NOW), []);
});

test('a bundle page yields one item per OPEN bundle section, and none at all when the page is closed', () => {
  const open = { id: 's1', type: 'promotion_bundle', content: { name: 'ดีลสุดคุ้ม', blurb: 'จับคู่ 2 คอร์ส', label: 'Bundle', listPrice: 40800, netPrice: 32640, discountCode: '', registrationOpen: true,
    items: [{ id: 'i1', courseId: 'VIBE-CODE-L1', roundId: 'r1', roundSnapshot: { id: 'r1', dates: ['2026-10-19', '2026-10-20'], type: '' } }] } };
  const shut = { id: 's2', type: 'promotion_bundle', content: { name: 'ปิดแล้ว', listPrice: 55700, netPrice: 38990, registrationOpen: false, items: [] } };
  const page = livePage({ _id: 'page-bundle', slug: 'promotion-claude-ai-bundle', promotionKind: 'bundle', sections: [open, shut] });

  const items = builderPageItems([page], NOW);
  assert.deepEqual(items.map((i) => i.id), ['builder_page:page-bundle:s1']);
  assert.equal(items[0].kind, 'bundle');
  assert.equal(items[0].title, 'ดีลสุดคุ้ม');
  assert.deepEqual(items[0].bundle, { label: 'Bundle', list_price: 40800, net_price: 32640, discount_code: null, registration_open: true });
  assert.equal(items[0].price.discount_pct, 20);
  assert.deepEqual(items[0].courses[0].dates, ['2026-10-19', '2026-10-20']);

  assert.deepEqual(builderPageItems([{ ...page, status: 'closed' }], NOW), [], 'the live bundle page is closed today; it must serve nothing');
});

test('a windowless published page of no kind is served as kind "page" with every price field null', () => {
  const [item] = builderPageItems([livePage({ slug: 'the-next-humans-skills', publishStartDate: null, publishEndDate: null })], NOW);
  assert.equal(item.kind, 'page');
  assert.equal(item.live_until, null);
  assert.deepEqual(item.price, { normal: null, special: null, currency: 'THB', discount_pct: null });
  assert.deepEqual(item.courses, []);
});

// ── the whole corpus: isolation, dedupe, order, one clock ──────────────────

test('one failing source is named in `sources` and does not empty the response', async () => {
  const logged = [];
  const out = await buildPromotionsCorpus({
    now: NOW,
    readMasterclass: async () => ({ batches: [DMC_BATCH_1], courses: COURSES }),
    readBuilderPages: async () => { throw new Error('mongo went away'); },
    readEarlyBirdConfigs: async () => [{ _id: 'eb-pbi', course_id: 'POWER-BI', special_price: 59999, deadline: FUTURE, is_active: false }],
    log: (...args) => logged.push(args),
  });
  assert.equal(out.generated_at, NOW.toISOString(), 'the one instant every item was judged against');
  assert.deepEqual(out.sources, {
    masterclass:       { ok: true,  count: 1 },
    builder_page:      { ok: false, count: 0, error: 'read_failed' },
    early_bird_config: { ok: true,  count: 1 },
  });
  assert.deepEqual(out.items.map((i) => i.id), ['masterclass:b-dmc-1', 'early_bird_config:eb-pbi']);
  assert.equal(logged.length, 1, 'the failure went to the server-side log');
  assert.ok(!JSON.stringify(out).includes('mongo went away'), 'and its message did not go to the client');
});

test('the corpus is ordered by soonest live_until, null last, then id — the same bytes twice', async () => {
  const deps = {
    now: NOW,
    readMasterclass: async () => ({ batches: [DMC_BATCH_1], courses: COURSES }),
    readBuilderPages: async () => [
      livePage({ _id: 'page-z', slug: 'z', publishEndDate: null }),
      livePage({ _id: 'page-a', slug: 'a', publishEndDate: null }),
      livePage({ _id: 'page-soon', slug: 'soon', publishEndDate: '2026-09-14T16:59:59.999Z' }),
    ],
    readEarlyBirdConfigs: async () => [],
  };
  const a = await buildPromotionsCorpus(deps);
  const b = await buildPromotionsCorpus(deps);
  assert.deepEqual(a.items.map((i) => i.id), [
    'builder_page:page-soon',   // 2026-09-14
    'masterclass:b-dmc-1',      // 2026-09-16
    'builder_page:page-a',      // no deadline, by id
    'builder_page:page-z',
  ]);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('CONTROL: sortItems is not the input order', () => {
  const shuffled = [{ id: 'b', live_until: null }, { id: 'a', live_until: FUTURE }, { id: 'c', live_until: PAST }];
  assert.deepEqual(sortItems(shuffled).map((i) => i.id), ['c', 'a', 'b']);
});
