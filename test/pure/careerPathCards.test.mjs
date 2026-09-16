import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCareerPathCards,
  careerPathCardItem,
  careerPathPrice,
  careerPathCourses,
  bareCareerPathSlug,
} from '@/lib/corpus/careerPathCards';
import { CORPUS_PUBLIC_ORIGIN } from '@/lib/corpus/promotions';
import { careerPathHref } from '@/lib/utils';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { GET, handleGet } from '@/app/api/corpus/career-path-cards/route';

/**
 * WHAT /api/corpus/career-path-cards IS ALLOWED TO SAY ABOUT A CAREER PATH.
 *
 * Fixtures are modelled on live `career_paths` rows docs/career-path-chat-card-phase-a.md
 * measured on 2026-09-16, as getActiveCareerPaths() hands them over — every
 * admin-only and MSDB-only field present, so the mapper's silence about them
 * is asserted against rows that actually carry them. Each test pins a ruling:
 *
 *   · the slug is BARE, the url carries `-career-path` exactly once, built
 *     through the site's own careerPathHref;
 *   · courses are `{ code, name }` only, in curriculum order, across groups;
 *   · price is exactly what PriceSummary renders: sale, struck full only when
 *     sale < full, the stored discountPct (never re-derived) under the same
 *     condition, null when the page shows no price;
 *   · the two internally inconsistent live rows are served as the page shows
 *     them, not "fixed";
 *   · registrations, seats, conditions, outline links and MSDB ids never appear.
 *
 * Every read is injected, so no test here reaches Mongo. The route tests
 * touch process.env, so they are ONE top-level test with sequential subtests.
 */

const COVER = (id) => `https://res.cloudinary.com/ddva7xvdt/image/upload/q_auto,f_auto/v1780907648/msdb/career-path/${id}.jpg`;

/** A live-shaped row: everything the sync stores plus the admin fields, so the forbidden-key scan has something to catch. */
function row(over = {}) {
  return {
    _id: '6a3cccc000000000000000aa',
    career_path_id: '699ecb4f63ca14138ab0404f',
    api_slug: 'prompt-engineer-career-path',
    title: 'Prompt Engineer',
    short_description: 'เขียน Prompt อย่างโปร และสื่อสารกับ AI ได้ตรงใจ สร้าง Workflow อัตโนมัติ ลดเวลาทำงานซ้ำซ้อน ยกระดับทักษะ AI ให้ทันโลก เพิ่มขีดความสามารถองค์กร',
    tagline: 'คอร์สเรียน Prompt Engineer จาก 9Expert …', intro: 'Generative AI เข้ามามีบทบาทสำคัญในองค์กร …', description_html: '',
    objectives: ['a'], suitable_for: ['b'], prerequisites: ['c'], benefits: ['d'],
    hero_image_url: COVER('inubjgibwvuofhsboef1'), hero_image_alt: 'Prompt Engineer',
    roadmap_image_url: COVER('roadmap'), roadmap_image_alt: '',
    links: { detailUrl: 'https://www.9experttraining.com/prompt-engineer-career-path', signupUrl: 'https://career-path.9experttraining.com/career/prompt-engineer-class', outlineUrl: 'https://9exp.link/prompt-engineer-course-outline-2' },
    price: { fullPrice: 61100, salePrice: 51935, discountPct: 15, currency: 'THB' },
    curriculum: [{ kind: 'fixed', title: '', chooseMin: 0, chooseMax: 0, items: [
      { kind: 'public', publicCourse: '6a00000000000000000000b1', prerequisites: [], note: '', snap: { code: 'PYTHON-L1', name: 'Python Programming', teaser: 'x', days: 3, hours: 18, price: 11900, imageUrl: COVER('c1'), publicUrl: 'https://www.9experttraining.com/python-programming-training-course' } },
      { kind: 'public', snap: { code: 'PYTHON-L2', name: 'Machine Learning using Python', days: 3, hours: 18, price: 11900, imageUrl: COVER('c2'), publicUrl: 'https://www.9experttraining.com/machine-learning-python-training-course' } },
      { kind: 'public', snap: { code: 'GEN-AI-L1', name: 'Generative AI for Business Transformation', days: 2, hours: 12, price: 14900, imageUrl: COVER('c3'), publicUrl: 'https://www.9experttraining.com/generative-ai-for-business-training-course' } },
      { kind: 'public', snap: { code: 'COPILOT-STU', name: 'AI Agents with Microsoft Copilot Studio', days: 1, hours: 6, price: 7500, imageUrl: COVER('c4'), publicUrl: 'https://www.9experttraining.com/x' } },
      { kind: 'public', snap: { code: 'N8N-L1', name: 'Workflow Automation with n8n', days: 2, hours: 12, price: 14900, imageUrl: COVER('c5'), publicUrl: 'https://www.9experttraining.com/y' } },
    ] }],
    upstream_status: 'active', upstream_order: 0, synced_at: '2026-09-16T06:00:50.614Z',
    is_active: true, display_order: 0,
    localCourses: [], requiredSelections: 0, registrationOpen: true,
    registerBannerUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1779442517/9exp-genesis/career-paths/banner.png', registerBannerPublicId: '9exp-genesis/career-paths/banner',
    createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-09-16T06:00:50.614Z',
    ...over,
  };
}

const PROMPT = row();
const VISUAL = row({
  career_path_id: '69a002ed141cd4eeab1d31ae', api_slug: 'visual-communication-and-presentation-career-path',
  title: 'Visual Communication & Presentation', display_order: 9,
  price: { fullPrice: 43200, salePrice: 36720, discountPct: 15, currency: 'THB' },
  curriculum: [
    { kind: 'fixed', title: 'Core Courses', items: [
      { kind: 'public', snap: { code: 'CANVA-L1', name: 'Canva Pro for Smart Working', price: 8900 } },
      { kind: 'public', snap: { code: 'CANVA-L2', name: 'Canva AI for Business Accelerator', price: 10900 } },
      { kind: 'public', snap: { code: 'GEN-AI-L1', name: 'Generative AI for Business Transformation', price: 14900 } },
    ] },
    { kind: 'choice', title: 'เลือกเรียนระหว่าง', chooseMin: 1, chooseMax: 1, items: [
      { kind: 'public', snap: { code: 'MSE-L4', name: 'Microsoft Excel Advanced PivotTable and PivotChart', price: 8500 } },
      { kind: 'public', snap: { code: 'POWER-BI', name: 'Power BI Desktop for Business Analytics', price: 8500 } },
    ] },
  ],
});
// The two live rows whose stored numbers are internally inconsistent — served as the page shows them.
const ACCOUNTING = row({ api_slug: 'accounting-and-finance-career-path', title: 'Accounting & Finance', display_order: 4, registrationOpen: false,
  price: { fullPrice: 39000, salePrice: 33830, discountPct: 15, currency: 'THB' } });
const RPA = row({ api_slug: 'rpa-developer-career-path', title: 'RPA Developer', display_order: 3,
  price: { fullPrice: 51600, salePrice: 43800, discountPct: 15, currency: 'THB' } });

const CONTRACT_KEYS = ['slug', 'title', 'short_description', 'hero_image_url', 'courses', 'course_count', 'url', 'price'];
const COURSE_KEYS = ['code', 'name'];
const PRICE_KEYS = ['sale', 'full', 'discount_percent'];
const FORBIDDEN_WORDS = ['seat', 'capacity', 'registration', 'outline', 'condition'];

const deps = (rows = [PROMPT, RPA, ACCOUNTING, VISUAL], overrides = {}) => ({ readPaths: async () => rows, ...overrides });

// ── the item: the exact contract, nothing else ──────────────────────────────

test('cards: the item carries EXACTLY the contract key set, in that order; every course entry exactly { code, name }; price exactly its three keys', () => {
  const item = careerPathCardItem(PROMPT);
  assert.deepEqual(Object.keys(item), CONTRACT_KEYS);
  for (const c of item.courses) assert.deepEqual(Object.keys(c), COURSE_KEYS);
  assert.deepEqual(Object.keys(item.price), PRICE_KEYS);
  assert.equal(item.title, 'Prompt Engineer');
  assert.equal(item.short_description, PROMPT.short_description, 'full length, never truncated');
  assert.equal(item.hero_image_url, PROMPT.hero_image_url, 'the raw cover, transform and all — what both pages render');
});

test('cards: no forbidden word ANYWHERE in the payload — seat, capacity, registration, outline, condition — and no MSDB id, course URL or signup link', async () => {
  const body = await buildCareerPathCards(deps());
  const json = JSON.stringify(body);
  for (const w of FORBIDDEN_WORDS) assert.ok(!json.toLowerCase().includes(w), `"${w}" leaked into the payload`);
  for (const needle of ['699ecb4f63ca14138ab0404f', '6a3cccc0', 'career-path.9experttraining.com', '9exp.link', 'training-course', 'banner.png', 'roadmap', 'publicCourse', 'teaser', '"days"', '"hours"', 'currency', 'discountPct', 'localCourses', 'is_active', 'display_order', 'tagline', 'intro']) {
    assert.ok(!json.includes(needle), `${needle} leaked from the row`);
  }
  // CONTROL: the scan can fail — a payload carrying the row verbatim trips it.
  const leaky = JSON.stringify({ items: [{ ...careerPathCardItem(PROMPT), row: PROMPT }] }).toLowerCase();
  assert.ok(FORBIDDEN_WORDS.some((w) => leaky.includes(w)));
});

test('cards: absent / blank short_description and hero_image_url are null — one spelling of "no data"', () => {
  const bare = careerPathCardItem(row({ short_description: '  ', hero_image_url: '' }));
  assert.equal(bare.short_description, null);
  assert.equal(bare.hero_image_url, null);
  assert.equal(bare.title, 'Prompt Engineer');
});

// ── slug and url ────────────────────────────────────────────────────────────

test('slug: BARE — the -career-path suffix is stripped; an already-bare slug is unchanged', () => {
  assert.equal(careerPathCardItem(PROMPT).slug, 'prompt-engineer');
  assert.equal(careerPathCardItem(VISUAL).slug, 'visual-communication-and-presentation');
  assert.equal(bareCareerPathSlug('data-analyst'), 'data-analyst');
  assert.equal(bareCareerPathSlug(' data-analyst-career-path '), 'data-analyst');
  assert.equal(bareCareerPathSlug('career-path-x'), 'career-path-x', 'only a trailing suffix is stripped');
});

test('url: the canonical detail URL on the www host, the suffix EXACTLY once, through the site\'s own careerPathHref', () => {
  const item = careerPathCardItem(PROMPT);
  assert.equal(item.url, 'https://www.9experttraining.com/prompt-engineer-career-path');
  assert.equal(item.url, `${CORPUS_PUBLIC_ORIGIN}${careerPathHref(PROMPT.api_slug)}`);
  assert.equal(item.url, PROMPT.links.detailUrl, 'and it equals what MSDB stores as detailUrl');
  assert.equal((item.url.match(/-career-path/g) ?? []).length, 1);
  assert.equal(item.url, `${CORPUS_PUBLIC_ORIGIN}/${item.slug}-career-path`, 'url is the contract\'s <slug>-career-path');
  // an upstream row stored with a bare slug still gets one suffix (careerPathHref is idempotent)
  const bare = careerPathCardItem(row({ api_slug: 'data-analyst' }));
  assert.equal(bare.url, 'https://www.9experttraining.com/data-analyst-career-path');
  assert.equal(bare.slug, 'data-analyst');
});

// ── courses ─────────────────────────────────────────────────────────────────

test('courses: { code, name } in curriculum order across groups; course_count equals courses.length', () => {
  const p = careerPathCardItem(PROMPT);
  assert.deepEqual(p.courses.map((c) => c.code), ['PYTHON-L1', 'PYTHON-L2', 'GEN-AI-L1', 'COPILOT-STU', 'N8N-L1']);
  assert.deepEqual(p.courses[0], { code: 'PYTHON-L1', name: 'Python Programming' });
  assert.equal(p.course_count, 5);
  assert.equal(p.course_count, p.courses.length);
  // the one live path with a choice group: the choice items follow the fixed ones, flat — the card carries no group structure
  const v = careerPathCardItem(VISUAL);
  assert.deepEqual(v.courses.map((c) => c.code), ['CANVA-L1', 'CANVA-L2', 'GEN-AI-L1', 'MSE-L4', 'POWER-BI']);
  assert.equal(v.course_count, 5);
  assert.ok(!JSON.stringify(v).includes('choice') && !JSON.stringify(v).includes('เลือกเรียนระหว่าง'));
});

test('courses: an empty or missing curriculum gives [] and course_count 0; an item with neither code nor name is skipped', () => {
  for (const curriculum of [undefined, null, [], [{ kind: 'fixed', items: [] }], [{ kind: 'fixed' }]]) {
    const item = careerPathCardItem(row({ curriculum }));
    assert.deepEqual(item.courses, []);
    assert.equal(item.course_count, 0);
  }
  assert.deepEqual(careerPathCourses([{ items: [{ snap: {} }, { kind: 'external', externalName: 'Outside Course', externalUrl: 'https://x' }, { course_id: 'MSE-L1' }] }]),
    [{ code: '', name: 'Outside Course' }, { code: 'MSE-L1', name: '' }]);
});

// ── price: exactly what PriceSummary renders ────────────────────────────────

test('price: sale, struck full and the STORED discountPct — never re-derived — when sale < full', () => {
  assert.deepEqual(careerPathCardItem(PROMPT).price, { sale: 51935, full: 61100, discount_percent: 15 });
  // the percent is the page's own value, not (1 - sale/full): a row storing 20 shows 20 even though the numbers say 15
  assert.deepEqual(careerPathPrice({ fullPrice: 61100, salePrice: 51935, discountPct: 20 }), { sale: 51935, full: 61100, discount_percent: 20 });
  // missing discountPct → the page prints "ลด 0%"
  assert.deepEqual(careerPathPrice({ fullPrice: 61100, salePrice: 51935 }), { sale: 51935, full: 61100, discount_percent: 0 });
});

test('price: the two internally inconsistent live rows are served exactly as the page shows them — not corrected', () => {
  // Accounting & Finance: full 39,000 but the sale price was derived from 39,800 (33,830 / 39,000 = 86.7 %); the page prints "ลด 15%"
  assert.deepEqual(careerPathCardItem(ACCOUNTING).price, { sale: 33830, full: 39000, discount_percent: 15 });
  // RPA Developer: 43,800 ≠ 0.85 × 51,600 (= 43,860); the page prints "ลด 15%"
  assert.deepEqual(careerPathCardItem(RPA).price, { sale: 43800, full: 51600, discount_percent: 15 });
});

test('price: null when the page shows no price — no object, empty object, both zero/null', () => {
  for (const price of [undefined, null, {}, { currency: 'THB' }, { fullPrice: 0, salePrice: 0 }, { fullPrice: null, salePrice: null, discountPct: 15 }, 'free']) {
    assert.equal(careerPathCardItem(row({ price })).price, null, JSON.stringify(price));
  }
});

test('price: no strike and no percent when there is nothing to strike — sale ≥ full, or only one of the two present', () => {
  assert.deepEqual(careerPathPrice({ fullPrice: 50000, salePrice: 50000, discountPct: 15 }), { sale: 50000, full: null, discount_percent: null }, 'equal: the page renders neither the strike nor the label');
  assert.deepEqual(careerPathPrice({ fullPrice: 50000, salePrice: 55000, discountPct: 15 }), { sale: 55000, full: null, discount_percent: null }, 'sale above full');
  assert.deepEqual(careerPathPrice({ fullPrice: 50000 }), { sale: 50000, full: null, discount_percent: null }, 'full only → the headline is the full price');
  assert.deepEqual(careerPathPrice({ salePrice: 42500, discountPct: 15 }), { sale: 42500, full: null, discount_percent: null }, 'sale only → nothing to strike');
});

// ── the feed: the listing's order ───────────────────────────────────────────

test('feed: the body is exactly { items }, one per row from the injected read, in the read\'s (display_order) order — never re-sorted', async () => {
  const body = await buildCareerPathCards(deps());
  assert.deepEqual(Object.keys(body), ['items']);
  assert.deepEqual(body.items.map((i) => i.slug), ['prompt-engineer', 'rpa-developer', 'accounting-and-finance', 'visual-communication-and-presentation']);
  // CONTROL: swap the read and the feed swaps — MSDB's sortOrder would put a different row first
  const swapped = await buildCareerPathCards(deps([VISUAL, PROMPT]));
  assert.deepEqual(swapped.items.map((i) => i.slug), ['visual-communication-and-presentation', 'prompt-engineer']);
  assert.deepEqual((await buildCareerPathCards(deps([]))).items, []);
});

test('feed: the default read IS the listing\'s selector, and the feed reads through deps', async () => {
  assert.equal(typeof getActiveCareerPaths, 'function');
  const calls = [];
  await buildCareerPathCards(deps([PROMPT], { readPaths: async () => { calls.push('read'); return [PROMPT]; } }));
  assert.deepEqual(calls, ['read']);
});

// ── the route: fail closed, the same key, then the contract ─────────────────

const REQ = (key) => new Request('http://localhost/api/corpus/career-path-cards', key == null ? {} : { headers: { 'x-api-key': key } });

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

    await t.test('200 with the right key — { items } in the contract shape on every item, no-store, nothing forbidden in the JSON', async () => {
      process.env.CORPUS_API_KEY = 'secret-1';
      const res = await handleGet(REQ('secret-1'), deps());
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const text = await res.text();
      const body = JSON.parse(text);
      assert.deepEqual(Object.keys(body), ['items']);
      assert.equal(body.items.length, 4);
      for (const item of body.items) {
        assert.deepEqual(Object.keys(item), CONTRACT_KEYS, item.slug);
        for (const c of item.courses) assert.deepEqual(Object.keys(c), COURSE_KEYS, item.slug);
        assert.deepEqual(Object.keys(item.price), PRICE_KEYS, item.slug);
        assert.equal(item.course_count, item.courses.length, item.slug);
      }
      for (const w of FORBIDDEN_WORDS) assert.ok(!text.toLowerCase().includes(w), `"${w}" in the response`);
    });

    await t.test('500 corpus_invalid, logged, with nothing partial when the read throws', async () => {
      process.env.CORPUS_API_KEY = 'secret-1';
      const logged = [];
      const res = await handleGet(REQ('secret-1'), deps([], {
        readPaths: async () => { throw new Error('mongo down'); },
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
