import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMasterclassCards,
  masterclassCardItem,
  cardPrice,
  durationLabel,
} from '@/lib/corpus/masterclassCards';
import { CORPUS_PUBLIC_ORIGIN } from '@/lib/corpus/promotions';
import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';
import { MASTERCLASS_LEVEL_LABEL } from '@/lib/masterclass/levelLabel';
import { GET, handleGet } from '@/app/api/corpus/masterclass-cards/route';

/**
 * WHAT /api/corpus/masterclass-cards IS ALLOWED TO SAY ABOUT A COURSE.
 *
 * Fixtures are modelled on the two live rows docs/masterclass-chat-card-phase-a.md
 * measured on 2026-09-16, AS getPublishedMasterclasses() hands them over: the
 * open|full batches attached under `batches`, sorted by batch_no, each already
 * spread with the wall-clock resolveBatchPrice — which the card feed must
 * re-judge against its own injected `now`. Every test pins a ruling taken
 * against that data:
 *
 *   · the batch is `batches[0]` — the one the listing card shows;
 *   · the price is resolveBatchPrice(batch, now): early bird until the
 *     deadline, the normal price after, null with no open batch;
 *   · seats, registered_count, capacity, status, course_slug never appear —
 *     the whole payload is grepped for the words, not just the key set;
 *   · the subtitle is the full field, never the card's 3-line clamp.
 *
 * Every read is injected, so no test here reaches Mongo. The route tests
 * touch process.env, so they are ONE top-level test with sequential subtests
 * (the runner runs top-level tests concurrently across files).
 */

const NOW = new Date('2026-09-16T06:00:00.000Z');          // measurement day, 13:00 Bangkok
const AFTER_DMC = new Date('2026-09-16T17:00:00.000Z');    // one minute after AI-DMC's early bird ends
const AFTER_ALL = new Date('2026-10-03T00:00:00.000Z');    // both early birds over

const INSTRUCTOR_MVP = { _id: '69f856c3aac437056dfc00fd', name: 'ชไลเวท พิพัฒพรรณวงศ์', name_en: 'Chalaivate Pipatpannawong', title: '9Expert Instructor | Microsoft MVP', bio: 'x' };
const INSTRUCTOR_CANVA = { _id: '69f856c3aac437056dfc00fc', name: 'โทวิทูร เอื้อประเสริฐวณิช', name_en: 'Thowithun Aueprasertvanich', title: '9Expert Instructor | Canvassador', bio: 'y' };
const INSTRUCTORS = [INSTRUCTOR_CANVA, INSTRUCTOR_MVP]; // Mongo order — Canva's id sorts first

/** A batch row exactly as the selector attaches it: every forbidden field present, price already spread with the wall clock. */
function attachedBatch(over = {}) {
  const b = {
    _id: '6a33631a749934f3c6c59acf', course_id: '6a3212236f20c8488c24fa65',
    course_slug: 'ai-content',                        // STALE on every live row — must never be read
    batch_no: 2, batch_label: 'รุ่นที่ 2', status: 'open',
    dates: [{ date: '2026-10-17T00:00:00.000Z', day_label: 'เสาร์ที่ 17 ตุลาคม 2569' }],
    venue_name: 'Asia Hotel | Bangkok',
    price_normal: 12900, price_early_bird: 9675, early_bird_active: true,
    early_bird_deadline: '2026-10-02T16:59:00.000Z',
    capacity: 50, registered_count: 7, createdAt: '2026-05-04T06:31:24.000Z',
    ...over,
  };
  // what getPublishedMasterclasses spreads on (judged at ITS call time — a different clock)
  return { ...b, price_type: 'early_bird', effective_price: b.price_early_bird, original_price: b.price_normal, is_early_bird: true };
}

const LONG_SUBTITLE = 'เรียนรู้การวิเคราะห์ข้อมูลด้วย Claude AI ตั้งแต่การตั้งคำถาม การเตรียมข้อมูล การวิเคราะห์ ไปจนถึงการสร้าง Dashboard และการนำเสนอผลลัพธ์ต่อผู้บริหาร ผ่าน Workshop เข้มข้นตลอดทั้งวัน';

const CLAUDE = {
  _id: '6a3212236f20c8488c24fa65', slug: 'mas-claude-ai-for-data-analyst', course_code: 'M-CLAUDE-DA',
  title_th: 'Claude AI for Data Analyst', subtitle_th: LONG_SUBTITLE,
  cover_image_url: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1782108378/9exp-genesis/masterclass/jw8l70zcannlfvjy6itl.webp',
  cover_image_public_id: '', hero_gradient_from: '#0f172a', hero_gradient_to: '#1e3a8a',
  gallery: [{ type: 'youtube', videoId: 'Ta9Au9mhWS4' }, { type: 'image', url: 'https://res.cloudinary.com/x/g1.webp' }],
  duration_days: 1, duration_hours: 7, schedule_days: ['เสาร์'], time_start: '09:00', time_end: '17:00',
  level: 'intermediate', instructor_ids: [INSTRUCTOR_MVP._id],
  license_options: { enabled: true, choices: [{ value: 'Own', label_th: 'License ของตัวเอง' }] },
  is_published: true, display_order: 0,
  batches: [attachedBatch()],
};

const DMC = {
  _id: '6a33db33b87c174eb4b5a737', slug: 'mas-ai-dmc', course_code: 'M-AI-DMC',
  title_th: 'AI Digital Marketing Creator Masterclass', subtitle_th: 'สร้างคอนเทนต์ด้วย AI',
  cover_image_url: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1783333443/9exp-genesis/masterclass/wgnrofx9womyejd0crx9.webp',
  duration_days: 1, duration_hours: 7, level: 'intermediate',
  instructor_ids: [INSTRUCTOR_MVP._id, INSTRUCTOR_CANVA._id],
  is_published: true, display_order: 1,
  batches: [attachedBatch({
    _id: '6a3a0000000000000000dmc1', course_id: '6a33db33b87c174eb4b5a737', batch_no: 1, batch_label: 'รุ่นที่ 1',
    price_early_bird: 9030, early_bird_deadline: '2026-09-16T16:59:00.000Z', registered_count: 1,
    dates: [{ date: '2026-09-26T00:00:00.000Z', day_label: 'เสาร์ที่ 26 กันยายน 2569' }],
  })],
};

const CONTRACT_KEYS = ['slug', 'title', 'subtitle', 'cover_image_url', 'instructors', 'level_label', 'duration_label', 'url', 'price'];
const PRICE_KEYS = ['amount', 'normal_amount', 'early_bird', 'early_bird_ends_at'];
const FORBIDDEN_WORDS = ['seat', 'registered', 'capacity', 'status', 'course_slug'];

function deps(overrides = {}) {
  return {
    now: NOW,
    readCourses: async () => [CLAUDE, DMC],
    readInstructors: async (ids) => INSTRUCTORS.filter((i) => ids.includes(i._id)),
    ...overrides,
  };
}

// ── the item: the exact contract, and nothing forbidden anywhere ────────────

test('cards: the item carries EXACTLY the contract key set, in that order, and the price block exactly its four keys', () => {
  const item = masterclassCardItem(CLAUDE, { instructors: [INSTRUCTOR_MVP], now: NOW });
  assert.deepEqual(Object.keys(item), CONTRACT_KEYS);
  assert.deepEqual(Object.keys(item.price), PRICE_KEYS);
  assert.equal(item.slug, 'mas-claude-ai-for-data-analyst');
  assert.equal(item.title, 'Claude AI for Data Analyst');
  assert.equal(item.url, `${CORPUS_PUBLIC_ORIGIN}/masterclass/mas-claude-ai-for-data-analyst`);
  assert.ok(item.url.startsWith('https://www.9experttraining.com/masterclass/'), 'the www host, never the subdomain');
});

test('cards: no forbidden word appears ANYWHERE in the payload — seats, registered, capacity, status, course_slug', async () => {
  const body = await buildMasterclassCards(deps());
  const json = JSON.stringify(body).toLowerCase();
  for (const w of FORBIDDEN_WORDS) assert.ok(!json.includes(w), `"${w}" leaked into the payload`);
  // and the specific values the batch carries that the ruling names
  for (const needle of ['ai-content', 'Asia Hotel', '2026-10-17', '2026-09-26', 'ตุลาคม', '"50"', ':50', 'License ของตัวเอง', 'g1.webp']) {
    assert.ok(!JSON.stringify(body).includes(needle), `${needle} leaked from the batch / course row`);
  }
  // CONTROL: the scan can fail — a payload that carries the batch verbatim trips it
  const leaky = JSON.stringify({ items: [{ ...masterclassCardItem(CLAUDE), batch: CLAUDE.batches[0] }] }).toLowerCase();
  assert.ok(FORBIDDEN_WORDS.some((w) => leaky.includes(w)));
});

test('cards: the cover is cover_image_url RAW — no transform, not the gallery, null when the course has none', () => {
  const item = masterclassCardItem(CLAUDE, { now: NOW });
  assert.equal(item.cover_image_url, CLAUDE.cover_image_url);
  const bare = masterclassCardItem({ ...CLAUDE, cover_image_url: '' }, { now: NOW });
  assert.equal(bare.cover_image_url, null, 'the feed does not fall back to the gallery or a static file — the widget omits the image block');
});

test('cards: the subtitle is subtitle_th at FULL length — never the listing card\'s 3-line clamp', () => {
  const item = masterclassCardItem(CLAUDE, { now: NOW });
  assert.equal(item.subtitle, LONG_SUBTITLE);
  assert.equal(item.subtitle.length, LONG_SUBTITLE.length);
  assert.equal(masterclassCardItem({ ...CLAUDE, subtitle_th: '  ' }, { now: NOW }).subtitle, null);
});

test('cards: instructors are display names in instructor_ids order; an id that resolves nothing is skipped', () => {
  const dmc = masterclassCardItem(DMC, { instructors: INSTRUCTORS, now: NOW });
  assert.deepEqual(dmc.instructors, ['ชไลเวท พิพัฒพรรณวงศ์', 'โทวิทูร เอื้อประเสริฐวณิช'], 'the course order, not Mongo order');
  const partial = masterclassCardItem(DMC, { instructors: [INSTRUCTOR_CANVA], now: NOW });
  assert.deepEqual(partial.instructors, ['โทวิทูร เอื้อประเสริฐวณิช']);
  assert.deepEqual(masterclassCardItem(DMC, { now: NOW }).instructors, []);
});

test('cards: level_label is the listing card\'s mapping (intermediate → "Intermediate"); an unmapped level passes through; none → null', () => {
  assert.equal(masterclassCardItem(CLAUDE, { now: NOW }).level_label, 'Intermediate');
  assert.equal(MASTERCLASS_LEVEL_LABEL.intermediate, 'Intermediate');
  assert.deepEqual(Object.keys(MASTERCLASS_LEVEL_LABEL), ['beginner', 'intermediate', 'advanced']);
  assert.equal(masterclassCardItem({ ...CLAUDE, level: 'expert' }, { now: NOW }).level_label, 'expert', 'as the card renders an unknown level');
  assert.equal(masterclassCardItem({ ...CLAUDE, level: '' }, { now: NOW }).level_label, null);
});

test('cards: duration_label is "<days> วัน · <hours> ชั่วโมง"; either half alone when the other is unset; null when both are', () => {
  assert.equal(masterclassCardItem(CLAUDE, { now: NOW }).duration_label, '1 วัน · 7 ชั่วโมง');
  assert.equal(durationLabel(2, null), '2 วัน');
  assert.equal(durationLabel(null, 14), '14 ชั่วโมง');
  assert.equal(durationLabel(null, undefined), null);
  assert.equal(durationLabel('1', '7'), '1 วัน · 7 ชั่วโมง');
});

// ── price: resolveBatchPrice against the injected now ───────────────────────

test('price: while the early bird is live — amount is the early-bird price, normal_amount and early_bird_ends_at are set', () => {
  const item = masterclassCardItem(CLAUDE, { now: NOW });
  assert.deepEqual(item.price, { amount: 9675, normal_amount: 12900, early_bird: true, early_bird_ends_at: '2026-10-02T16:59:00.000Z' });
  const dmc = masterclassCardItem(DMC, { now: NOW });
  assert.deepEqual(dmc.price, { amount: 9030, normal_amount: 12900, early_bird: true, early_bird_ends_at: '2026-09-16T16:59:00.000Z' });
});

test('price: after the early bird ends (injected now) — amount is the normal price, normal_amount and early_bird_ends_at are null', () => {
  // The attached row still says is_early_bird: true (the selector's wall clock); the feed must re-judge it.
  const dmc = masterclassCardItem(DMC, { now: AFTER_DMC });
  assert.deepEqual(dmc.price, { amount: 12900, normal_amount: null, early_bird: false, early_bird_ends_at: null });
  const claude = masterclassCardItem(CLAUDE, { now: AFTER_DMC });
  assert.equal(claude.price.early_bird, true, 'the Claude early bird runs to 2 Oct — one now, two answers');
  assert.equal(masterclassCardItem(CLAUDE, { now: AFTER_ALL }).price.amount, 12900);
  // the flag alone ends it too
  const off = { ...CLAUDE, batches: [attachedBatch({ early_bird_active: false })] };
  assert.deepEqual(masterclassCardItem(off, { now: NOW }).price, { amount: 12900, normal_amount: null, early_bird: false, early_bird_ends_at: null });
});

test('price: no open|full batch → price is null (the listing card\'s ยังไม่เปิดรับสมัคร state)', () => {
  assert.equal(masterclassCardItem({ ...CLAUDE, batches: [] }, { now: NOW }).price, null);
  assert.equal(masterclassCardItem({ ...CLAUDE, batches: undefined }, { now: NOW }).price, null);
  assert.equal(cardPrice(null, NOW), null);
});

test('price: the batch is batches[0] — the lowest-numbered open|full batch the selector put first, not the cheapest or the soonest', () => {
  const b2 = attachedBatch();                                                   // batch_no 2, 9,675
  const b3 = attachedBatch({ _id: 'b3', batch_no: 3, price_early_bird: 5000 }); // cheaper, later
  const item = masterclassCardItem({ ...CLAUDE, batches: [b2, b3] }, { now: NOW });
  assert.equal(item.price.amount, 9675);
  assert.equal(masterclassCardItem({ ...CLAUDE, batches: [b3, b2] }, { now: NOW }).price.amount, 5000, 'whatever the selector sorted first');
});

test('price: an early bird with no deadline is live and reports early_bird_ends_at: null', () => {
  const open = { ...CLAUDE, batches: [attachedBatch({ early_bird_deadline: null })] };
  assert.deepEqual(masterclassCardItem(open, { now: AFTER_ALL }).price, { amount: 9675, normal_amount: 12900, early_bird: true, early_bird_ends_at: null });
});

// ── the feed: the listing's order, one now ──────────────────────────────────

test('feed: the body is exactly { items }, one item per row from the injected read, in the read\'s (display_order) order', async () => {
  const body = await buildMasterclassCards(deps());
  assert.deepEqual(Object.keys(body), ['items']);
  assert.deepEqual(body.items.map((i) => i.slug), ['mas-claude-ai-for-data-analyst', 'mas-ai-dmc']);
  assert.equal(body.items[1].instructors.length, 2);
  // CONTROL: the read's order is honoured, not re-sorted by slug or title — swap it and the feed swaps
  const swapped = await buildMasterclassCards(deps({ readCourses: async () => [DMC, CLAUDE] }));
  assert.deepEqual(swapped.items.map((i) => i.slug), ['mas-ai-dmc', 'mas-claude-ai-for-data-analyst']);
});

test('feed: the default read IS the listing\'s selector — the same function /masterclass renders from', async () => {
  // The lib imports getPublishedMasterclasses lazily; the test tier stubs
  // dbConnect, so the real read cannot run here. What can be pinned is that
  // the selector exists under that name and the feed reads through `deps`.
  assert.equal(typeof getPublishedMasterclasses, 'function');
  const calls = [];
  await buildMasterclassCards(deps({ readCourses: async () => { calls.push('read'); return [DMC]; } }));
  assert.deepEqual(calls, ['read']);
});

test('feed: every item is judged against the ONE injected now — an invalid now falls back to the wall clock rather than throwing', async () => {
  const a = await buildMasterclassCards(deps({ now: AFTER_DMC }));
  assert.equal(a.items[0].price.early_bird, true);
  assert.equal(a.items[1].price.early_bird, false);
  const b = await buildMasterclassCards(deps({ now: 'not a date' }));
  assert.equal(b.items.length, 2);
});

// ── the route: fail closed, the same key, then the contract ─────────────────

const REQ = (key) => new Request('http://localhost/api/corpus/masterclass-cards', key == null ? {} : { headers: { 'x-api-key': key } });

test('route — driven sequentially (process.env.CORPUS_API_KEY is process-global)', async (t) => {
  const saved = process.env.CORPUS_API_KEY;
  try {
    await t.test('503 with no CORPUS_API_KEY configured — fail closed, no items on the refusal path', async () => {
      delete process.env.CORPUS_API_KEY;
      const res = await GET(REQ('any-key'));
      assert.equal(res.status, 503);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const body = await res.json();
      assert.equal(body.error, 'corpus_unavailable');
      assert.ok(!('items' in body));
    });

    await t.test('401 with an empty body on a wrong or missing key', async () => {
      process.env.CORPUS_API_KEY = 'secret-1';
      for (const key of ['secret-2', 'secret-1x', '', null]) {
        const res = await GET(REQ(key));
        assert.equal(res.status, 401, `key ${JSON.stringify(key)}`);
        assert.equal(await res.text(), '');
        assert.equal(res.headers.get('cache-control'), 'no-store');
      }
    });

    await t.test('200 with the right key — { items } in the contract shape, no-store, nothing forbidden in the JSON', async () => {
      process.env.CORPUS_API_KEY = 'secret-1';
      const res = await handleGet(REQ('secret-1'), deps());
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const text = await res.text();
      const body = JSON.parse(text);
      assert.deepEqual(Object.keys(body), ['items']);
      assert.equal(body.items.length, 2);
      for (const item of body.items) {
        assert.deepEqual(Object.keys(item), CONTRACT_KEYS, item.slug);
        assert.deepEqual(Object.keys(item.price), PRICE_KEYS, item.slug);
      }
      for (const w of FORBIDDEN_WORDS) assert.ok(!text.toLowerCase().includes(w), `"${w}" in the response`);
    });

    await t.test('500 corpus_invalid, logged, with nothing partial when the read throws', async () => {
      process.env.CORPUS_API_KEY = 'secret-1';
      const logged = [];
      const res = await handleGet(REQ('secret-1'), deps({
        readCourses: async () => { throw new Error('mongo down'); },
        log: (...a) => logged.push(a),
      }));
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: 'corpus_invalid' });
      assert.equal(logged.length, 1);
    });
  } finally {
    if (saved === undefined) delete process.env.CORPUS_API_KEY; else process.env.CORPUS_API_KEY = saved;
  }
});
