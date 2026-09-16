import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseCarousel, PromotionCarousel } from '@/components/chat/ChatCards';
import { MasterclassCard, MasterclassCarousel } from '@/components/chat/ChatCards';
import { CareerPathCard, CareerPathCarousel } from '@/components/chat/ChatCards';
import { ChatPanel } from '@/components/chat/ChatPanel';

// Paging controls that have nowhere to page to.
//
// Both carousels are the same component underneath — they differ only in card
// width and key — so the guard is written once and asserted on both, which is
// also how the defect reached both in the first place.

const html = (Comp, items) => renderToStaticMarkup(createElement(Comp, { items }));
const chevrons = (markup) =>
  (markup.match(/aria-label="(?:ก่อนหน้า|ถัดไป)"/g) ?? []).length;

const COURSES = [
  { course_id: 'GEN-AI-L1', title: 'Generative AI', image_url: '', price: '14,900 ฿' },
  { course_id: 'CC-AI', title: 'AI Content Creator', image_url: '', price: '14,900 ฿' },
];
const PROMOS = [
  { id: 'p1', title: 'โปรโมชันที่ 1', image_url: '' },
  { id: 'p2', title: 'โปรโมชันที่ 2', image_url: '' },
];

// The two live rows as /api/corpus/masterclass-cards serves them (2026-09-16).
const COVER = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1783333443/9exp-genesis/masterclass/wgnrofx9womyejd0crx9.webp';
const DMC = {
  slug: 'mas-ai-dmc', title: 'AI Digital Marketing Creator Masterclass',
  subtitle: 'ยกระดับการสร้างคอนเทนต์ด้วยเครื่องมือ ChatGPT และ Google AI Tool สำหรับนักการตลาดยุคใหม่ เรียนรู้การทำ Deep Research, Content Strategy และ Content Funnel เพื่อเพิ่มโอกาสทางธุรกิจ',
  cover_image_url: COVER, instructors: ['ชไลเวท พิพัฒพรรณวงศ์', 'โทวิทูร เอื้อประเสริฐวณิช'],
  level_label: 'Intermediate', duration_label: '1 วัน · 7 ชั่วโมง',
  url: 'https://www.9experttraining.com/masterclass/mas-ai-dmc',
  price: { amount: 9030, normal_amount: 12900, early_bird: true, early_bird_ends_at: '2026-09-16T16:59:00Z' },
};
const CLAUDE = {
  slug: 'mas-claude-ai-for-data-analyst', title: 'Claude AI for Data Analyst', subtitle: null, cover_image_url: null,
  instructors: ['ชไลเวท พิพัฒพรรณวงศ์'], level_label: null, duration_label: null,
  url: 'https://www.9experttraining.com/masterclass/mas-claude-ai-for-data-analyst', price: null,
};
const MASTERCLASSES = [DMC, CLAUDE];
const LIVE_NOW = new Date('2026-09-16T06:00:00Z');   // 13:00 Bangkok — the DMC early bird still on
const EXPIRED_NOW = new Date('2026-09-16T17:00:00Z'); // a minute after it ends

const card = (item, now) => renderToStaticMarkup(createElement(MasterclassCard, { item, now }));

// The live Prompt Engineer and Data Analyst paths as /api/corpus/career-path-cards serves them (2026-09-16).
const CP_COVER = 'https://res.cloudinary.com/ddva7xvdt/image/upload/q_auto,f_auto/v1780907648/msdb/career-path/inubjgibwvuofhsboef1.jpg';
const PROMPT_ENGINEER = {
  slug: 'prompt-engineer', title: 'Prompt Engineer',
  short_description: 'เขียน Prompt อย่างโปร และสื่อสารกับ AI ได้ตรงใจ สร้าง Workflow อัตโนมัติ ลดเวลาทำงานซ้ำซ้อน ยกระดับทักษะ AI ให้ทันโลก เพิ่มขีดความสามารถองค์กร',
  hero_image_url: CP_COVER,
  courses: [
    { code: 'PYTHON-L1', name: 'Python Programming' }, { code: 'PYTHON-L2', name: 'Machine Learning using Python' },
    { code: 'GEN-AI-L1', name: 'Generative AI for Business Transformation' }, { code: 'COPILOT-STU', name: 'AI Agents with Microsoft Copilot Studio' },
    { code: 'N8N-L1', name: 'Workflow Automation with n8n' },
  ],
  course_count: 5,
  url: 'https://www.9experttraining.com/prompt-engineer-career-path',
  price: { sale: 51935, full: 61100, discount_percent: 15 },
};
const DATA_ANALYST = {
  slug: 'data-analyst', title: 'Data Analyst', short_description: null, hero_image_url: null,
  courses: [], course_count: 0, url: 'https://www.9experttraining.com/data-analyst-career-path', price: null,
};
const CAREER_PATHS = [PROMPT_ENGINEER, DATA_ANALYST];
const cpCard = (item) => renderToStaticMarkup(createElement(CareerPathCard, { item }));
const cpPriceRow = (markup) => markup.match(/<div class="mt-3" data-chat-price="">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
const priceRow = (markup) => markup.match(/<div class="mt-3" data-chat-price="[^"]*">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';

test('a single card renders no paging controls', () => {
  assert.equal(chevrons(html(CourseCarousel, COURSES.slice(0, 1))), 0, 'course carousel');
  assert.equal(chevrons(html(PromotionCarousel, PROMOS.slice(0, 1))), 0, 'promotion carousel');
  assert.equal(chevrons(html(MasterclassCarousel, MASTERCLASSES.slice(0, 1))), 0, 'masterclass carousel');
  assert.equal(chevrons(html(CareerPathCarousel, CAREER_PATHS.slice(0, 1))), 0, 'career-path carousel');
});

test('CONTROL: two cards DO render both controls', () => {
  // Without this, "no chevrons" would pass for a carousel that lost its
  // controls entirely, or for one that renders nothing at all.
  assert.equal(chevrons(html(CourseCarousel, COURSES)), 2, 'course carousel');
  assert.equal(chevrons(html(PromotionCarousel, PROMOS)), 2, 'promotion carousel');
  assert.equal(chevrons(html(MasterclassCarousel, MASTERCLASSES)), 2, 'masterclass carousel');
  assert.equal(chevrons(html(CareerPathCarousel, CAREER_PATHS)), 2, 'career-path carousel');
});

test('CONTROL: the single-card case still renders its card', () => {
  // The other way the assertion above could pass for the wrong reason: hiding
  // the whole carousel rather than just its controls.
  const course = html(CourseCarousel, COURSES.slice(0, 1));
  assert.ok(course.includes('Generative AI'), 'the one course is still shown');
  const promo = html(PromotionCarousel, PROMOS.slice(0, 1));
  assert.ok(promo.includes('โปรโมชันที่ 1'), 'and the one promotion is too');
  // …and an empty list is still nothing at all.
  assert.equal(html(CourseCarousel, []), '');
  assert.equal(html(PromotionCarousel, []), '');
  const mc = html(MasterclassCarousel, MASTERCLASSES.slice(0, 1));
  assert.ok(mc.includes('AI Digital Marketing Creator Masterclass'), 'and the one masterclass is too');
  assert.equal(html(MasterclassCarousel, []), '');
  const cp = html(CareerPathCarousel, CAREER_PATHS.slice(0, 1));
  assert.ok(cp.includes('Prompt Engineer'), 'and the one career path is too');
  assert.equal(html(CareerPathCarousel, []), '');
});

// ── the career-path card ────────────────────────────────────────────────────

test('career-path card: cover, title, short_description under line-clamp-3, the courses line, the price row, then "ดูเส้นทาง" — top to bottom', () => {
  const m = cpCard(PROMPT_ENGINEER);
  assert.match(m, /<img src="https:\/\/res\.cloudinary\.com\/[^"]+\/msdb\/career-path\/inubjgibwvuofhsboef1\.jpg"[^>]*loading="lazy"/, 'the raw hero img');
  const order = ['<img', 'Prompt Engineer', PROMPT_ENGINEER.short_description, '5 หลักสูตร: Python Programming, Machine Learning using Python, Generative AI for Business Transformation และอีก 2 หลักสูตร', '51,935 บาท', 'ดูเส้นทาง']
    .map((s) => m.indexOf(s));
  assert.ok(order.every((i) => i >= 0), `every piece is present: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the specified order');
  assert.match(m, /line-clamp-3[^"]*">เขียน Prompt/, 'the description is clamped by CSS, the whole string in the DOM');
  assert.match(m, /<a href="https:\/\/www\.9experttraining\.com\/prompt-engineer-career-path" target="_blank" rel="noreferrer"/, 'same target/rel as the masterclass card');
  assert.match(m, /var\(--surface\)/, 'the shared token vocabulary');
  for (const never of ['ที่นั่ง', 'seat', 'registration', 'เงื่อนไข', 'Early Bird', 'ถึง ']) assert.ok(!m.includes(never), `never rendered: ${never}`);
});

test('career-path card: a null hero renders NO <img>; null description → no clamp block; the card itself still renders', () => {
  const m = cpCard(DATA_ANALYST);
  assert.ok(!/<img\b/.test(m), 'no img');
  assert.ok(!m.includes('line-clamp-3'));
  assert.ok(m.includes('Data Analyst') && m.includes('ดูเส้นทาง'));
  assert.ok(m.startsWith('<div class="h-full overflow-hidden'), 'the shell opens straight onto the body');
});

test('career-path card: a null price renders no price row; 0 courses renders no courses line', () => {
  const m = cpCard(DATA_ANALYST);
  assert.equal(cpPriceRow(m), '');
  assert.ok(!m.includes('data-chat-price') && !m.includes('บาท') && !m.includes('ลด '));
  assert.ok(!m.includes('data-chat-courses') && !m.includes('หลักสูตร'), 'no courses line at 0');
});

test('career-path card: the price row — sale via formatBaht + บาท, full struck only when greater than sale, the ลด pill only when the percent is non-null', () => {
  const full = cpPriceRow(cpCard(PROMPT_ENGINEER));
  assert.match(full, />51,935 บาท</, 'sale, formatted');
  assert.match(full, /line-through">61,100 บาท</, 'full, struck');
  assert.match(full, /rounded-full bg-\[var\(--surface-muted\)\][^"]*">ลด 15%</, 'the pill reads ลด 15%');
  // full null → no strike; full equal to or below sale → no strike either
  for (const [label, price] of [['null full', { sale: 51935, full: null, discount_percent: 15 }], ['equal', { sale: 51935, full: 51935, discount_percent: 15 }], ['below', { sale: 51935, full: 50000, discount_percent: 15 }]]) {
    const row = cpPriceRow(cpCard({ ...PROMPT_ENGINEER, price }));
    assert.match(row, />51,935 บาท</, label);
    assert.ok(!row.includes('line-through'), `${label}: no strike`);
    assert.match(row, /ลด 15%/, `${label}: the pill is independent of the strike`);
  }
  // discount_percent null → no pill, strike still shown
  const noPct = cpPriceRow(cpCard({ ...PROMPT_ENGINEER, price: { sale: 51935, full: 61100, discount_percent: null } }));
  assert.ok(!noPct.includes('ลด '), 'no pill');
  assert.match(noPct, /line-through">61,100 บาท</);
  // the live inconsistent row is shown as served — 33,830 / 39,000 / ลด 15%
  const acc = cpPriceRow(cpCard({ ...PROMPT_ENGINEER, price: { sale: 33830, full: 39000, discount_percent: 15 } }));
  assert.match(acc, />33,830 บาท</);
  assert.match(acc, /line-through">39,000 บาท</);
  assert.match(acc, /ลด 15%/);
});

test('career-path card: the courses line for 3 and 6 courses matches the pure helper — names, then "และอีก n หลักสูตร"', () => {
  const three = { ...DATA_ANALYST, courses: PROMPT_ENGINEER.courses.slice(0, 3), course_count: 3 };
  assert.ok(cpCard(three).includes('3 หลักสูตร: Python Programming, Machine Learning using Python, Generative AI for Business Transformation<'), 'three names, no tail');
  const six = { ...DATA_ANALYST, courses: [...PROMPT_ENGINEER.courses, { code: 'X', name: 'Sixth Course' }], course_count: 6 };
  assert.ok(cpCard(six).includes('6 หลักสูตร: Python Programming, Machine Learning using Python, Generative AI for Business Transformation และอีก 3 หลักสูตร<'));
});

// ── the masterclass card ────────────────────────────────────────────────────

test('masterclass card: cover, title, the FULL subtitle under a CSS clamp, instructors joined, level + duration pills, the link', () => {
  const m = card(DMC, LIVE_NOW);
  assert.match(m, new RegExp(`<img src="${COVER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*loading="lazy"`), 'the raw cover img');
  const order = ['<img', DMC.title, DMC.subtitle, 'ชไลเวท พิพัฒพรรณวงศ์, โทวิทูร เอื้อประเสริฐวณิช', 'Intermediate', '1 วัน · 7 ชั่วโมง', '9,030', 'ดูรายละเอียด']
    .map((s) => m.indexOf(s));
  assert.ok(order.every((i) => i >= 0), `every piece is present: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'top to bottom in the specified order');
  assert.match(m, /line-clamp-3[^"]*">ยกระดับ/, 'the subtitle is clamped by CSS…');
  assert.ok(m.includes(DMC.subtitle), '…and the whole string is in the DOM, never cut in JS');
  assert.match(m, /<a href="https:\/\/www\.9experttraining\.com\/masterclass\/mas-ai-dmc" target="_blank" rel="noreferrer"/, 'same link + target handling as the course card');
  assert.match(m, /var\(--surface\)/, 'the course card\'s token vocabulary');
  for (const never of ['ที่นั่ง', 'เต็ม', 'seat', 'countdown', 'เหลือ']) assert.ok(!m.includes(never), `never rendered: ${never}`);
});

test('masterclass card: a null cover renders NO <img> at all — the block is omitted, not a placeholder', () => {
  const m = card(CLAUDE, LIVE_NOW);
  assert.ok(!/<img\b/.test(m), 'no img');
  assert.ok(m.includes('Claude AI for Data Analyst'), 'the card itself still renders');
  assert.ok(m.startsWith('<div class="h-full overflow-hidden'), 'the shell opens straight onto the body');
});

test('masterclass card: a null price renders no price row; null level/duration render no pills and no meta row', () => {
  const m = card(CLAUDE, LIVE_NOW);
  assert.equal(priceRow(m), '', 'no price row');
  assert.ok(!m.includes('data-chat-price'));
  assert.ok(!m.includes('บาท'), 'no baht anywhere');
  assert.ok(!m.includes('Early Bird'));
  assert.ok(!m.includes('Intermediate') && !m.includes('ชั่วโมง'), 'no level, no duration');
  assert.ok(!/flex flex-wrap items-center gap-2 text-xs/.test(m), 'the meta row itself is skipped when both are null');
  // one of the two present → only that pill
  const levelOnly = card({ ...CLAUDE, level_label: 'Advanced' }, LIVE_NOW);
  assert.ok(levelOnly.includes('Advanced') && !levelOnly.includes('ชั่วโมง'));
});

test('masterclass card: a LIVE early bird — the early-bird amount, the normal price struck through, and "Early Bird ถึง 16 ก.ย." for 2026-09-16T16:59:00Z', () => {
  const row = priceRow(card(DMC, LIVE_NOW));
  assert.ok(row, 'a price row is present');
  assert.match(row, /data-chat-price="early-bird"/);
  assert.match(row, /9,030 บาท/, 'the amount, through formatBaht');
  assert.match(row, /line-through">12,900 บาท</, 'the normal price, struck');
  assert.match(row, /Early Bird ถึง 16 ก\.ย\.</, 'the Bangkok calendar day, abbreviated Thai month, no year');
  assert.ok(!row.includes('2569') && !row.includes('2026'), 'no year');
  // The zone is pinned to Asia/Bangkok, not the machine: 17:00Z is already the 17th there.
  const nextDay = priceRow(card({ ...DMC, price: { ...DMC.price, early_bird_ends_at: '2026-09-16T17:00:00Z' } }, LIVE_NOW));
  assert.match(nextDay, /ถึง 17 ก\.ย\./);
  const oct = priceRow(card({ ...DMC, price: { ...DMC.price, early_bird_ends_at: '2026-10-02T16:59:00Z' } }, LIVE_NOW));
  assert.match(oct, /ถึง 2 ต\.ค\./, 'no leading zero');
});

test('masterclass card: an EXPIRED early bird (injected now) — the normal price, no strike, no label; the snapshot flag is overridden', () => {
  const row = priceRow(card(DMC, EXPIRED_NOW));
  assert.match(row, /data-chat-price="normal"/);
  assert.match(row, />12,900 บาท</, 'the price after the early bird');
  assert.ok(!row.includes('9,030'), 'the early-bird amount is gone');
  assert.ok(!row.includes('line-through'), 'nothing struck');
  assert.ok(!row.includes('Early Bird'), 'no label');
  // early_bird: false from the endpoint renders the same way
  const plain = priceRow(card({ ...DMC, price: { amount: 12900, normal_amount: null, early_bird: false, early_bird_ends_at: null } }, LIVE_NOW));
  assert.match(plain, />12,900 บาท</);
  assert.ok(!plain.includes('line-through') && !plain.includes('Early Bird'));
});

// ── the panel: absent today, a third carousel when sent ────────────────────

const storeWith = (messages) => ({
  init() {}, send() {}, reset() {}, rate() {}, messages, isLoading: false, error: '', errorCode: '',
  lastAssistant: messages.findLast?.((m) => m.role === 'assistant') ?? null, sessionId: 'sess-test',
});
const USER = { id: 'u1', role: 'user', text: 'มี Masterclass ไหม', createdAt: 1 };
const assistant = (extra) => ({
  id: 'a1', role: 'assistant', text: 'มีครับ', createdAt: 2,
  quickReplies: [], courses: COURSES.slice(0, 1), promotions: [], serverMessageId: null, rating: null, ...extra,
});
const panel = (messages) => renderToStaticMarkup(createElement(ChatPanel, { onClose() {}, store: storeWith(messages) }));

test('panel: with the field ABSENT (today) there is no masterclass markup, and the reply renders exactly as before', () => {
  const before = panel([USER, assistant()]);
  const explicitEmpty = panel([USER, assistant({ masterclasses: [] })]);
  assert.ok(!before.includes('data-chat-masterclasses'), 'no masterclass block');
  assert.ok(!before.includes('>Masterclass<'), 'no heading');
  assert.ok(before.includes('Generative AI'), 'the course carousel is still there');
  assert.equal(explicitEmpty, before, 'an explicit [] and an absent field render the same bytes');
});

test('panel: with `careerPaths` ABSENT (today) there is no career-path markup, and the reply renders byte-identically to before', () => {
  const before = panel([USER, assistant({ masterclasses: MASTERCLASSES })]);
  const explicitEmpty = panel([USER, assistant({ masterclasses: MASTERCLASSES, careerPaths: [] })]);
  assert.ok(!before.includes('data-chat-career-paths'), 'no career-path block');
  assert.ok(!before.includes('>Career Path<'), 'no heading');
  assert.ok(before.includes('Generative AI') && before.includes('data-chat-masterclasses'), 'the other carousels are still there');
  assert.equal(explicitEmpty, before, 'an explicit [] and an absent field render the same bytes');
});

test('panel: `careerPaths` renders its own carousel BEFORE the courses, in the order received; courses then masterclasses keep their order after it', () => {
  const m = panel([USER, assistant({ careerPaths: CAREER_PATHS, masterclasses: MASTERCLASSES })]);
  assert.ok(m.includes('data-chat-career-paths') && m.includes('>Career Path<'), 'the block and its heading');
  const ordered = ['>Career Path<', 'Prompt Engineer', 'Data Analyst', '>คอร์สแนะนำ<', '>Generative AI<', '>Masterclass<', 'AI Digital Marketing Creator Masterclass'].map((s) => m.indexOf(s));
  assert.ok(ordered.every((i) => i >= 0), `every piece is present: ${ordered}`);
  assert.deepEqual([...ordered].sort((a, b) => a - b), ordered, 'career paths → courses → masterclasses, each in received order');
  const cpBlock = m.slice(m.indexOf('data-chat-career-paths'), m.indexOf('>คอร์สแนะนำ<'));
  assert.equal(chevrons(cpBlock), 2, 'two career-path cards page');
  // received order is honoured, not alphabetical
  const swapped = panel([USER, assistant({ careerPaths: [DATA_ANALYST, PROMPT_ENGINEER] })]);
  assert.ok(swapped.indexOf('Data Analyst') < swapped.indexOf('Prompt Engineer'));
});

test('panel: a `masterclasses` array on the message renders its own carousel, after the courses, in the order received', () => {
  const m = panel([USER, assistant({ masterclasses: MASTERCLASSES })]);
  assert.ok(m.includes('data-chat-masterclasses'), 'the block');
  assert.ok(m.includes('>Masterclass<'), 'the heading');
  const ordered = ['Generative AI', 'AI Digital Marketing Creator Masterclass', 'Claude AI for Data Analyst'].map((s) => m.indexOf(s));
  assert.ok(ordered.every((i) => i >= 0));
  assert.deepEqual([...ordered].sort((a, b) => a - b), ordered, 'courses first, then the masterclasses as received');
  assert.equal(chevrons(m.slice(m.indexOf('data-chat-masterclasses'))), 2, 'two cards page');
});
