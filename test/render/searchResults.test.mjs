import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SearchClient,
  SearchResults,
} from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts } from '@/lib/search/matchSearch';
import { SEARCH_TABS } from '@/lib/search/searchTabs';
import { siteConfig } from '@/config/site';

/**
 * /search, rendered.
 *
 * ── WHY `SearchResults` AND NOT `SearchClient` FOR MOST OF THIS ─────────────
 * Search moved to the server, so `SearchClient` is a shell: query state, a
 * debounce, a fetch. A static render of it can only ever show the "type at
 * least 2 characters" prompt — loading, ready, empty and error are all
 * downstream of a network reply that no server render will ever receive.
 *
 * `SearchResults` is the presentational half and takes `{ status, term, data }`
 * as props, so each of those four states is one render away. Same
 * shell/presentational seam as ScheduleClient/ScheduleBoard.
 *
 * The search BOX is the shell's, and it renders statically — so the focus-ring
 * assertions run against `SearchClient` directly.
 */

const R = (el) => renderToStaticMarkup(el);

const COURSE = {
  _id: 'c1',
  course_id: 'MSE-PBI',
  course_name: 'Power BI Desktop',
  course_price: 9000,
  course_trainingdays: 2,
  course_teaser: 'สร้าง Dashboard เชิงโต้ตอบ',
  program: { program_name: 'Data Analytics', programiconurl: null },
};

const ONLINE = {
  _id: 'o1',
  o_course_id: 'ONL-EXC',
  o_course_name: 'Excel Essentials Online',
  o_course_teaser: 'เรียนด้วยตนเอง',
  o_course_cover_url: null,
  o_course_price: 990,
  o_number_lessons: 12,
  website_urls: ['https://academy.example/excel'],
  program: { program_name: 'Office', programiconurl: null },
};

const ARTICLE = { _id: 'a1', slug: 'x', title: 'บทความ', excerpt: 'สรุป', coverUrl: null, publishedAt: null };

/** A ready payload with exactly the counts asked for. */
const payload = (counts) => {
  const results = {
    courses: Array.from({ length: counts.courses ?? 0 }, (_, i) => ({ ...COURSE, _id: `c${i}` })),
    onlineCourses: Array.from({ length: counts.onlineCourses ?? 0 }, (_, i) => ({ ...ONLINE, _id: `o${i}` })),
    careerPaths: Array.from({ length: counts.careerPaths ?? 0 }, (_, i) => ({ _id: `cp${i}`, title: 'Data Analyst', api_slug: 'data-analyst' })),
    schedules: Array.from({ length: counts.schedules ?? 0 }, (_, i) => ({
      _id: `s${i}`, dates: ['2026-10-17'], type: 'classroom', status: 'open',
      course_ref: { _id: 'c1', course_id: 'MSE-PBI', course_name: 'Power BI Desktop', course_price: 9000 },
    })),
    promotions: Array.from({ length: counts.promotions ?? 0 }, (_, i) => ({ _id: `p${i}`, promotion_id: `P${i}`, title: 'ลดราคา', tags: [] })),
    articles: Array.from({ length: counts.articles ?? 0 }, (_, i) => ({ ...ARTICLE, _id: `a${i}`, slug: `a${i}` })),
  };
  const full = { ...emptySearchCounts(), ...counts };
  const total = Object.values(full).reduce((a, b) => a + b, 0);
  return { counts: full, results, total };
};

const renderResults = (props = {}) =>
  R(createElement(SearchResults, {
    status: 'ready',
    term: 'power',
    data: payload({ courses: 2, articles: 1 }),
    requestedTab: 'all',
    ...props,
  }));

/** The tab row's `<button>`s, as `{ label, count, active }`. */
const tabs = (html) => {
  const row = html.match(/<div class="flex min-h-9 flex-wrap gap-2">([\s\S]*?)<\/div>/)?.[1] ?? '';
  return [...row.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)\(([0-9]+)\)<\/button>/g)]
    .map((m) => ({ label: m[2].trim(), count: Number(m[3]), active: m[1] === 'true' }));
};

// ── Zero-count tabs ─────────────────────────────────────────────────────────

test('no tab with a 0 count renders, and ทั้งหมด always does', () => {
  const html = renderResults({ data: payload({ courses: 2, articles: 1 }) });
  const labels = tabs(html).map((t) => t.label);
  assert.deepEqual(labels, ['ทั้งหมด', 'หลักสูตร', 'บทความ']);

  // Every other tab's label is absent from the row entirely — matched as a tab
  // ENTRY rather than by substring, because Thai labels are substrings of other
  // strings on the page (a section heading uses the same words).
  for (const missing of ['คอร์สออนไลน์', 'Career Path', 'ตารางอบรม', 'โปรโมชัน']) {
    assert.equal(labels.includes(missing), false, `${missing} has a 0 count and must not render`);
  }
});

test('ทั้งหมด renders even when absolutely nothing matched', () => {
  const html = renderResults({ data: payload({}) });
  assert.deepEqual(tabs(html).map((t) => t.label), ['ทั้งหมด']);
  assert.ok(html.includes('ไม่พบผลลัพธ์สำหรับ'), 'and the empty state is shown');
});

test('CONTROL: a tab with a count DOES render — the row is not always short', () => {
  // Without this, "these tabs are absent" is satisfied by a tab row that never
  // renders anything at all.
  const html = renderResults({ data: payload({ courses: 1, onlineCourses: 1, careerPaths: 1, schedules: 1, promotions: 1, articles: 1 }) });
  assert.deepEqual(
    tabs(html).map((t) => t.label),
    SEARCH_TABS.map((t) => t.label),
    'every tab renders when every bucket has a hit',
  );
});

test('the counts in the labels are the real ones, and ทั้งหมด is the total', () => {
  const html = renderResults({ data: payload({ courses: 4, articles: 3 }) });
  const byLabel = Object.fromEntries(tabs(html).map((t) => [t.label, t.count]));
  assert.equal(byLabel['หลักสูตร'], 4);
  assert.equal(byLabel['บทความ'], 3);
  assert.equal(byLabel['ทั้งหมด'], 7);
});

// ── The active tab falls back ───────────────────────────────────────────────

test('the active tab falls back to ทั้งหมด when its own count reaches 0', () => {
  /**
   * The transition, rendered: the user is on โปรโมชัน and one more keystroke
   * drops that count to 0. The tab is gone; if the active state went with it,
   * NO tab would be highlighted and the panel below would be empty for a reason
   * the page never states.
   */
  const before = renderResults({
    requestedTab: 'promotions',
    data: payload({ promotions: 2, courses: 5 }),
  });
  const activeBefore = tabs(before).find((t) => t.active);
  assert.equal(activeBefore?.label, 'โปรโมชัน', 'the chosen tab is active while it exists');

  const after = renderResults({
    requestedTab: 'promotions',
    data: payload({ courses: 5 }),
  });
  const activeAfter = tabs(after).find((t) => t.active);
  assert.equal(activeAfter?.label, 'ทั้งหมด', 'and falls back once it does not');
  assert.equal(tabs(after).filter((t) => t.active).length, 1, 'exactly one tab is ever active');
});

test('the remembered choice is honoured again when the count comes back', () => {
  // Derived, not overwritten: deleting a character restores the tab the user
  // picked. An effect that reset the state could not do this.
  const html = renderResults({ requestedTab: 'promotions', data: payload({ promotions: 1 }) });
  assert.equal(tabs(html).find((t) => t.active)?.label, 'โปรโมชัน');
});

test('the tab row reserves its height so the results below do not jump', () => {
  // Tabs appear and disappear on every keystroke. The row still rewraps; the
  // reserved band is what stops the panel beneath it from moving with it.
  const html = renderResults();
  assert.match(html, /<div class="flex min-h-9 flex-wrap gap-2">/);
});

// ── Loading, empty and error are three distinct states ──────────────────────

test('loading renders the skeleton and says so', () => {
  const html = renderResults({ status: 'loading', data: null });
  assert.match(html, /role="status"/);
  assert.ok(html.includes('กำลังค้นหา'), 'loading must announce itself');
  assert.match(html, /animate-pulse/, 'and show the skeleton');
  assert.equal(html.includes('ไม่พบผลลัพธ์'), false, 'loading is not emptiness');
  assert.equal(html.includes('ค้นหาไม่สำเร็จ'), false, 'loading is not failure');
});

test('an EMPTY result says nothing matched', () => {
  const html = renderResults({ status: 'ready', data: payload({}) });
  assert.ok(html.includes('ไม่พบผลลัพธ์สำหรับ'));
  assert.equal(html.includes('ค้นหาไม่สำเร็จ'), false);
  assert.equal(/animate-pulse/.test(html), false);
});

test('a FAILED request says it failed — not that nothing matched', () => {
  /**
   * The conflation this exists to prevent: rendering "ไม่พบผลลัพธ์" after a
   * failed request tells the visitor their query has no matches, which is a
   * claim the page has no evidence for. Different states, different words, and
   * a way to retry.
   */
  const html = renderResults({ status: 'error', data: null });
  assert.match(html, /role="alert"/);
  assert.ok(html.includes('ค้นหาไม่สำเร็จ'));
  assert.ok(html.includes('ลองอีกครั้ง'), 'and offers a retry');
  assert.equal(html.includes('ไม่พบผลลัพธ์'), false, 'failure must NOT read as emptiness');
  assert.equal(/animate-pulse/.test(html), false);
});

test('CONTROL: the three state probes are mutually exclusive on real renders', () => {
  /**
   * Each assertion above is partly an absence. If the three markers were absent
   * from every render — a typo in one string — all three tests would pass
   * together. Asserted as a matrix instead.
   */
  const marks = { loading: 'กำลังค้นหา', empty: 'ไม่พบผลลัพธ์', error: 'ค้นหาไม่สำเร็จ' };
  const renders = {
    loading: renderResults({ status: 'loading', data: null }),
    empty: renderResults({ status: 'ready', data: payload({}) }),
    error: renderResults({ status: 'error', data: null }),
  };
  for (const [state, html] of Object.entries(renders)) {
    for (const [marker, text] of Object.entries(marks)) {
      assert.equal(
        html.includes(text), state === marker,
        `${state} render: "${text}" should ${state === marker ? '' : 'NOT '}be present`,
      );
    }
  }
});

// ── Online course results ───────────────────────────────────────────────────

/** The online section's markup only. */
const onlineRegion = (html) => {
  const start = html.indexOf('aria-label="ผลการค้นหา: คอร์สออนไลน์"');
  assert.notEqual(start, -1, 'the online section did not render');
  return html.slice(start, html.indexOf('</section>', start));
};

test('an online-course result links OUT, and says so', () => {
  const html = renderResults({ data: payload({ onlineCourses: 1 }) });
  const region = onlineRegion(html);
  const anchor = region.match(/<a href="([^"]*)"([^>]*)>/);
  assert.ok(anchor, 'no link rendered for the online course');
  assert.equal(anchor[1], 'https://academy.example/excel', 'the feed’s own URL');
  assert.match(anchor[2], /target="_blank"/, 'it must open off-site');
  assert.match(anchor[2], /rel="noopener noreferrer"/);
  /**
   * The "ไปที่ 9Expert Academy" text CTA is gone on purpose: the whole card is
   * already the link, so a call-to-action inside it was a second one for the
   * same destination. What must survive is the outbound INDICATOR — the icon,
   * plus a screen-reader equivalent, since an aria-hidden icon announces
   * nothing.
   */
  assert.equal(
    region.includes('ไปที่ 9Expert Academy'), false,
    'the redundant second CTA must be gone',
  );
  assert.match(region, /lucide-external-link/, 'the icon-only indicator stays');
  assert.match(region, /class="sr-only"[^>]*> \(เปิดเว็บไซต์ภายนอก\)</, 'announced, not just drawn');
});

test('an online course with no website_urls falls back to the academy root', () => {
  const data = payload({ onlineCourses: 1 });
  data.results.onlineCourses[0] = { ...ONLINE, website_urls: [] };
  const region = onlineRegion(renderResults({ data }));
  const href = region.match(/<a href="([^"]*)"/)?.[1];
  assert.equal(href, siteConfig.academyUrl, 'a card with no direct link must still be reachable');
});

test('CONTROL: the fallback probe distinguishes the two hrefs', () => {
  // Without this, both assertions above would pass against a card that always
  // rendered the same URL.
  assert.notEqual(siteConfig.academyUrl, 'https://academy.example/excel');
  const withUrl = onlineRegion(renderResults({ data: payload({ onlineCourses: 1 }) }));
  assert.equal(withUrl.includes(siteConfig.academyUrl), false, 'the direct link is used when present');
});

test('an internal result is NOT rendered as an outbound link', () => {
  // The distinction has to be visible: a classroom course must not look like an
  // off-site one.
  const html = renderResults({ data: payload({ courses: 1 }) });
  const start = html.indexOf('aria-label="ผลการค้นหา: หลักสูตร"');
  const region = html.slice(start, html.indexOf('</section>', start));
  assert.match(region, /<a href="\/[^"]*"/, 'courses link internally');
  assert.equal(/target="_blank"/.test(region), false, 'and never open a new tab');
});

// ── The focus ring ──────────────────────────────────────────────────────────

const shell = () => R(createElement(SearchClient, { initialQ: '' }));

/** The search box's wrapper `<div>` and the `<input>` inside it. */
const searchBox = (html) => {
  const wrapper = html.match(/<div class="([^"]*rounded-2xl bg-white[^"]*)">/)?.[1];
  const input = html.match(/<input[^>]*class="([^"]*)"/)?.[1];
  assert.ok(wrapper, 'the search pill wrapper is gone');
  assert.ok(input, 'the search input is gone');
  return { wrapper, input };
};

test('the focus ring is on the WRAPPER, not on the input', () => {
  /**
   * globals.css has `*:focus-visible { ring-2 ring-offset-2 }` for the whole
   * site. `*` matched this input, which is `h-full w-full` inside the rounded
   * pill, so the ring drew a square-cornered rectangle floating INSIDE a
   * rounded container. The ring has to move to the container — `focus-within`,
   * because the wrapper is a plain <div> that is never itself focused.
   */
  const { wrapper } = searchBox(shell());
  assert.match(wrapper, /\bfocus-within:ring-2\b/, 'the wrapper takes the ring');
  assert.match(wrapper, /\bfocus-within:ring-9e-brand\b/, 'in the brand colour');
  assert.match(wrapper, /\bfocus-within:ring-offset-2\b/);
  // NO trailing `\b` here: the class ends in `]`, and `\b` between `]` and a
  // space is not a boundary at all — the assertion would never match a correct
  // render. Same family of trap as the Thai-substring one, in regex form.
  assert.ok(
    wrapper.includes('focus-within:ring-offset-[#0D1B2A]'),
    'offset pinned to the hero',
  );
});

test('the input suppresses its own ring — with the variant that can win', () => {
  /**
   * `focus:outline-none` was already there and did nothing, because the global
   * rule uses `ring`, not `outline`. The suppression must be `focus-visible:`
   * — the same variant as the rule it overrides — or it never applies at all.
   */
  const { input } = searchBox(shell());
  assert.match(input, /\bfocus-visible:ring-0\b/, 'ring suppressed on the input');
  assert.match(input, /\bfocus-visible:ring-offset-0\b/, 'and its offset too');
  assert.equal(
    /\bfocus:ring-0\b/.test(input), false,
    'focus: is the wrong variant — the global rule is focus-visible:',
  );
});

test('focus is never left with NO indication anywhere', () => {
  // The ring moves; it does not disappear. A box with neither is worse than the
  // square-cornered ring this replaced.
  const { wrapper, input } = searchBox(shell());
  assert.ok(/focus-within:ring-2/.test(wrapper), 'something still shows focus');
  assert.ok(/focus-visible:ring-0/.test(input), 'and the input defers to it rather than doubling it');
});

// ── The clear button ────────────────────────────────────────────────────────

test('the clear button is restored, and sits AFTER the input', () => {
  /**
   * `type="search"`'s native clear is absent in Firefox and hidden on iOS, so
   * the affordance cannot be left to the browser. DOM order is the whole
   * accessibility requirement: a clear button a keyboard user reaches on the
   * way INTO the field is worse than none at all.
   */
  const html = R(createElement(SearchClient, { initialQ: 'power bi' }));
  assert.ok(html.includes('aria-label="ล้างคำค้นหา"'), 'the clear button must render when there is a query');
  const inputAt = html.indexOf('<input');
  const buttonAt = html.indexOf('aria-label="ล้างคำค้นหา"');
  assert.ok(inputAt < buttonAt, 'Tab must reach the input before the clear button');
});

test('the clear button is absent when there is nothing to clear', () => {
  assert.equal(shell().includes('aria-label="ล้างคำค้นหา"'), false);
});

// ── The shell ships no corpus ───────────────────────────────────────────────

test('the shell renders the prompt, not results, before a reply arrives', () => {
  // A static render has no network, which is exactly the first paint a visitor
  // gets: prompt and suggestions, no corpus, no empty-result claim.
  const html = shell();
  assert.ok(html.includes('พิมพ์อย่างน้อย'), 'the minimum-characters prompt');
  assert.equal(html.includes('ไม่พบผลลัพธ์'), false, 'and no premature "nothing found"');
  assert.equal(html.includes('ค้นหาไม่สำเร็จ'), false);
});
