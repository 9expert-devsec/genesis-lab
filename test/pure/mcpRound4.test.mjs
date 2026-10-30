import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIST_LIVE_PROMOTIONS_DESCRIPTION,
  LIST_LIVE_PROMOTIONS_KINDS,
  PROMOTIONS_INCOMPLETE_WARNING,
  listLivePromotions,
} from '../../src/lib/mcp/tools/listLivePromotions.js';
import { listTrainingRounds } from '../../src/lib/mcp/tools/listTrainingRounds.js';
import { getCourseDetail } from '../../src/lib/mcp/tools/getCourseDetail.js';
import { listMasterclassRounds } from '../../src/lib/mcp/tools/listMasterclassRounds.js';
import { MCP_TOOL_NAMES } from '../../src/lib/mcp/register.js';
import { buildPromotionCards } from '../../src/lib/promotions/promotionCards.js';

/**
 * MCP round 4 — the gaps between what www shows and what /api/mcp returned,
 * measured 2026-10-30. One focused test per change, each with a control that
 * shows the probe goes red on the defect it replaces.
 */

const ORIGIN = 'https://www.9experttraining.com';

// ── list_live_promotions ───────────────────────────────────────────────────

const BUNDLE = {
  id: 'builder_page:p1:s1', kind: 'bundle', source: 'builder_page', title: 'CLAUDE CODE BUILDER DUO',
  url: `${ORIGIN}/promotions/claude-ai-duo`, live_until: '2027-03-15T16:59:59.999Z', is_live: true,
  price: { normal: 40800, special: 32640, currency: 'THB', discount_pct: 20 },
  courses: [
    { course_code: 'VIBE-CODE-L1', title: null, schedule_id: 'r1', dates: ['2026-12-23T00:00:00.000Z', '2026-12-24T00:00:00.000Z'],
      time: null, venue: null, offered_schedule_ids: ['r1', 'r2'] },
    { course_code: 'GONE-1', title: null, schedule_id: null, dates: [], time: null, venue: null, offered_schedule_ids: [] },
  ],
  bundle: { label: 'Bundle' }, description: 'จับคู่ 2 คอร์ส',
  image_url: 'https://res.cloudinary.com/x/duo.png',
};
const EARLY = {
  id: 'masterclass:b1', kind: 'early_bird', source: 'masterclass', title: 'DMC — รุ่นที่ 2', url: `${ORIGIN}/masterclass/mas-ai-dmc`,
  live_until: '2026-11-30T16:59:00.000Z', is_live: true, price: { normal: 12900, special: 9030, currency: 'THB', discount_pct: 30 },
  courses: [{ course_code: 'M-AI-DMC', title: 'AI Digital Marketing Creator Masterclass' }], image_url: 'https://res.cloudinary.com/x/dmc.webp',
};
const PAGE = {
  id: 'builder_page:p2', kind: 'page', source: 'builder_page', title: 'The Next Humans Skills',
  url: `${ORIGIN}/promotions/the-next-humans-skills`, live_until: null, is_live: true,
  price: { normal: null, special: null, currency: 'THB', discount_pct: null }, courses: [], image_url: null,
};
const CORPUS = { generated_at: '2026-10-30T08:00:00.000Z', sources: { builder_page: { ok: true, count: 2 } }, items: [BUNDLE, EARLY, PAGE] };

// The /promotions grid's own cards, as buildPromotionCards makes them.
const GRID_CARDS = [
  { key: 'builder:p1', href: '/promotions/claude-ai-duo', title: 'DUO page', cover: 'x', end: null, source: 'builder' },
  { key: 'builder:p2', href: '/promotions/the-next-humans-skills', title: 'The Next Humans Skills', cover: '', end: null, source: 'builder' },
  { key: 'custom:c1', href: '/promotions/yearly-promotion', title: '9EXPERT Promotion Exclusive สำหรับ Public Class',
    cover: 'https://res.cloudinary.com/x/yearly.jpg', end: null, source: 'custom' },
  { key: 'msdb:m1', href: '/promotions/summer', title: 'Summer', cover: '', end: '2026-12-31T16:59:59.000Z', source: 'msdb' },
];

const NAMES = { 'vibe-code-l1': { course_id: 'VIBE-CODE-L1', course_name: 'Build Business Apps with Claude Code' } };
const promoDeps = (extra = {}) => ({
  buildPromotionsCorpus: async () => CORPUS,
  getCourseByCodeInsensitive: async (code) => NAMES[String(code).toLowerCase()] ?? null,
  loadPromotionCards: async () => GRID_CARDS,
  warn: () => {},
  ...extra,
});

test('A1: bundle is a kind the tool offers and describes; kind=early_bird no longer swallows it, kind=bundle narrows to it', async () => {
  assert.deepEqual(LIST_LIVE_PROMOTIONS_KINDS, ['early_bird', 'bundle', 'page', 'all']);
  assert.match(LIST_LIVE_PROMOTIONS_DESCRIPTION, /kind "bundle"/);
  assert.match(LIST_LIVE_PROMOTIONS_DESCRIPTION, /price\.special is the net price/);
  const bundles = await listLivePromotions({ kind: 'bundle' }, promoDeps());
  assert.deepEqual(bundles.promotions.map((p) => p.kind), ['bundle']);
  const early = await listLivePromotions({ kind: 'early_bird' }, promoDeps());
  assert.deepEqual(early.promotions.map((p) => p.id), ['masterclass:b1']);
  // CONTROL: before round 4 the only way to see a bundle was kind=all.
  assert.ok(!['early_bird', 'page', 'all'].includes('bundle'));
});

test('A2: a failed source yields the generic warning; the source names go to the server log only', async () => {
  const logged = [];
  const out = await listLivePromotions({}, promoDeps({
    buildPromotionsCorpus: async () => ({ ...CORPUS, sources: { masterclass: { ok: false }, early_bird_config: { ok: false } } }),
    loadPromotionCards: async () => { throw new Error('mongo went away'); },
    warn: (...a) => logged.push(JSON.stringify(a.map((x) => (x instanceof Error ? x.message : x)))),
  }));
  assert.equal(out.warning, PROMOTIONS_INCOMPLETE_WARNING);
  for (const name of ['masterclass', 'builder_page', 'early_bird_config', 'promotion_cards', 'mongo']) {
    assert.ok(!out.warning.includes(name), `the warning names "${name}"`);
  }
  assert.ok(logged.join(' ').includes('masterclass') && logged.join(' ').includes('promotion_cards'), 'the log lost the names');
  // CONTROL: healthy → no warning key at all.
  assert.ok(!('warning' in (await listLivePromotions({}, promoDeps()))));
});

test('A3 + B2: image_url is emitted; bundle courses gain title, first-round dates and offered ids — and nothing for an unresolvable code', async () => {
  const out = await listLivePromotions({ kind: 'bundle' }, promoDeps());
  const [b] = out.promotions;
  assert.equal(b.image_url, BUNDLE.image_url);
  assert.deepEqual(b.courses[0], {
    course_code: 'VIBE-CODE-L1', title: 'Build Business Apps with Claude Code',
    dates: ['2026-12-23', '2026-12-24'], offered_schedule_ids: ['r1', 'r2'],
  });
  assert.deepEqual(b.courses[1], { course_code: 'GONE-1' }, 'no guessed title, no empty arrays');
  assert.ok(!/status|deadline/.test(JSON.stringify(b.courses)), 'no per-round status or deadline');
  // CONTROL: an early-bird row's course does not gain round fields.
  const [eb] = (await listLivePromotions({ kind: 'early_bird' }, promoDeps())).promotions;
  assert.deepEqual(eb.courses, [{ course_code: 'M-AI-DMC', title: 'AI Digital Marketing Creator Masterclass' }]);
});

test('B1: every /promotions card is listed — non-corpus cards as kind "page" with no price; corpus URLs are not duplicated', async () => {
  const out = await listLivePromotions({ kind: 'all' }, promoDeps());
  const urls = out.promotions.map((p) => p.url);
  for (const card of GRID_CARDS) assert.ok(urls.includes(`${ORIGIN}${card.href}`), `missing ${card.href}`);
  assert.equal(urls.filter((u) => u.endsWith('/promotions/claude-ai-duo')).length, 1, 'a builder page was listed twice');
  const yearly = out.promotions.find((p) => p.url.endsWith('/yearly-promotion'));
  assert.deepEqual(yearly, {
    id: 'page:yearly-promotion', kind: 'page', title: '9EXPERT Promotion Exclusive สำหรับ Public Class',
    url: `${ORIGIN}/promotions/yearly-promotion`, image_url: 'https://res.cloudinary.com/x/yearly.jpg',
  });
  const summer = out.promotions.find((p) => p.url.endsWith('/summer'));
  assert.equal(summer.live_until, '2026-12-31T16:59:59.000Z');
  assert.ok(!('price' in summer));
  assert.ok(!JSON.stringify(out.promotions.map((p) => p.id)).includes('msdb'), 'an internal source name leaked into an id');
  // CONTROL: without the grid's cards (the pre-round-4 shape) yearly-promotion is absent.
  const before = await listLivePromotions({ kind: 'all' }, promoDeps({ loadPromotionCards: undefined }));
  assert.ok(!before.promotions.some((p) => p.url.endsWith('/yearly-promotion')));
});

test('B1: the grid cards come from the same pure union the page calls', () => {
  const cards = buildPromotionCards({
    promotions: [{ promotion_id: 'm1', title: 'Summer', thumbnail_url: 't.jpg', start_date: null, end_date: null }],
    slugMap: { m1: 'summer' },
    builderPromotions: [], customPromotions: [],
  });
  assert.deepEqual(cards.map((c) => c.href), ['/promotions/summer']);
  // CONTROL: without the slug map the raw promotion_id is the slug, as on the page.
  assert.deepEqual(buildPromotionCards({ promotions: [{ promotion_id: 'm1', title: 'S' }] }).map((c) => c.href), ['/promotions/m1']);
});

// ── A4: one course URL across the three course tools ───────────────────────

const ALIASES = new Map([['VIBE-CODE-L2', '/build-ai-multi-agent-with-claude-code-training-course']]);
const L2 = { _id: 'oid-l2', course_id: 'VIBE-CODE-L2', course_name: 'Build AI Multi-Agent with Claude Code' };

test('A4: list_training_rounds gives the round its course alias, loading the map ONCE per call', async () => {
  let loads = 0;
  const items = ['a', 'b', 'c'].map((id) => ({ _id: id, course: L2, dates: ['2026-12-01T00:00:00.000Z'], status: 'open', type: 'classroom' }));
  const deps = {
    listSchedules: async () => ({ items }),
    getCourseByCodeInsensitive: async () => null,
    loadHiddenCourseIds: async () => new Set(),
    loadCourseAliasMap: async () => { loads += 1; return ALIASES; },
    todayKey: () => '2026-10-30',
    warn: () => {},
  };
  const out = await listTrainingRounds({}, deps);
  assert.deepEqual([...new Set(out.rounds.map((r) => r.course_url))], [`${ORIGIN}/build-ai-multi-agent-with-claude-code-training-course`]);
  assert.equal(loads, 1, 'the alias map was loaded per round');
  // CONTROL: no map → the derived path www redirects (the defect).
  const derived = await listTrainingRounds({}, { ...deps, loadCourseAliasMap: undefined });
  assert.equal(derived.rounds[0].course_url, `${ORIGIN}/vibe-code-l2-training-course`);
});

test('A4: get_course_detail emits the same aliased URL', async () => {
  const deps = { getCourseByCodeInsensitive: async () => L2, listOnlineCourses: async () => ({ items: [] }), loadCourseAliasMap: async () => ALIASES };
  assert.equal((await getCourseDetail({ course_id: 'vibe-code-l2', include_outline: false }, deps)).url,
    `${ORIGIN}/build-ai-multi-agent-with-claude-code-training-course`);
  // CONTROL
  assert.equal((await getCourseDetail({ course_id: 'vibe-code-l2' }, { ...deps, loadCourseAliasMap: undefined })).url,
    `${ORIGIN}/vibe-code-l2-training-course`);
});

// ── B3: list_masterclass_rounds ────────────────────────────────────────────

const NOW = new Date('2026-10-30T05:00:00.000Z'); // 12:00 Bangkok
const MC_COURSE = {
  _id: 'c-dmc', slug: 'mas-ai-dmc', course_code: 'M-AI-DMC', title_th: 'AI Digital Marketing Creator Masterclass',
  time_start: '09:00', time_end: '17:00', is_published: true,
  batches: [
    { _id: 'b1', course_id: 'c-dmc', course_slug: 'ai-content', batch_no: 1, batch_label: 'รุ่นที่ 1', status: 'full',
      dates: [{ date: '2026-09-25T17:00:00.000Z' }], venue_name: 'Asia Hotel | Bangkok', price_normal: 12900 },
    { _id: 'b2', course_id: 'c-dmc', course_slug: 'ai-content', batch_no: 2, batch_label: 'รุ่นที่ 2', status: 'open',
      dates: [{ date: '2026-12-18T17:00:00.000Z' }], venue_name: 'Asia Hotel | Bangkok',
      price_normal: 12900, price_early_bird: 9030, early_bird_active: true, early_bird_deadline: '2026-11-30T16:59:00.000Z',
      capacity: 50, registered_count: 7 },
    { _id: 'b3', course_id: 'c-dmc', batch_no: 3, status: 'full', dates: [{ date: '2027-02-12T17:00:00.000Z' }], price_normal: 12900 },
  ],
};
const mcDeps = (courses = [MC_COURSE]) => ({ getPublishedMasterclasses: async () => courses, now: () => NOW });

test('B3: upcoming batches only, Bangkok days, the course URL by the COURSE slug, price at one now, status in the site words', async () => {
  const out = await listMasterclassRounds({}, mcDeps());
  assert.deepEqual(out.rounds.map((r) => r.round), ['รุ่นที่ 2', 'รุ่นที่ 3'], 'a finished batch was returned');
  const [r2, r3] = out.rounds;
  assert.deepEqual(r2, {
    course_title: 'AI Digital Marketing Creator Masterclass', course_code: 'M-AI-DMC', url: `${ORIGIN}/masterclass/mas-ai-dmc`,
    round: 'รุ่นที่ 2', dates: ['2026-12-19'], first_day: '2026-12-19', time: '09:00–17:00', venue: 'Asia Hotel | Bangkok',
    status: 'เปิดรับ',
    price: { normal: 12900, current: 9030, is_early_bird: true, early_bird_until: '2026-11-30T16:59:00.000Z' },
  });
  assert.equal(r3.status, 'เต็ม');
  assert.deepEqual(r3.price, { normal: 12900, current: 12900, is_early_bird: false });
  const text = JSON.stringify(out);
  for (const w of ['registered_count', 'capacity', 'seat', 'ai-content']) assert.ok(!text.includes(w), `"${w}" leaked`);
  // CONTROL: the same batch judged after its early bird → no early-bird price.
  const later = await listMasterclassRounds({}, { ...mcDeps(), now: () => new Date('2026-12-01T00:00:00.000Z') });
  assert.equal(later.rounds[0].price.is_early_bird, false);
  assert.equal(later.rounds[0].price.current, 12900);
});

test('B3: course filter by slug or code (any case), date window, limit; an unknown course is a readable refusal', async () => {
  for (const course of ['MAS-AI-DMC', 'm-ai-dmc']) {
    assert.equal((await listMasterclassRounds({ course }, mcDeps())).total_matched, 2, course);
  }
  assert.deepEqual((await listMasterclassRounds({ to: '2026-12-31' }, mcDeps())).rounds.map((r) => r.round), ['รุ่นที่ 2']);
  assert.equal((await listMasterclassRounds({ limit: 1 }, mcDeps())).rounds.length, 1);
  await assert.rejects(listMasterclassRounds({ course: 'nope' }, mcDeps()), /masterclass course not found: "nope"/);
  // CONTROL: an unpublished course never contributes, whatever its batches.
  assert.equal((await listMasterclassRounds({}, mcDeps([{ ...MC_COURSE, is_published: false }]))).total_matched, 0);
});

test('the new tool is registered beside the others', () => {
  assert.deepEqual(MCP_TOOL_NAMES.slice(-2), ['list_live_promotions', 'list_masterclass_rounds']);
  assert.equal(MCP_TOOL_NAMES.length, 6);
});
