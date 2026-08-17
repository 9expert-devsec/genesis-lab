import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchResults } from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts, orderTagsByMatch } from '@/lib/search/matchSearch';

/**
 * THE ARTICLE CARD'S TAG ROW, and the promotion section's grid.
 *
 * The tag row replaced the publish date. That is a real trade and it is worth
 * stating rather than burying: an article result no longer carries ANY recency
 * signal — nothing on the card says whether a piece is from this month or three
 * years ago. What it gains is that `tags` is a matched field, so a tag match is
 * now visible on the card, which is the same reasoning that let the "why it
 * matched" snippet go everywhere else.
 */

const R = (el) => renderToStaticMarkup(el);

const ARTICLE = {
  _id: 'a1', slug: 'a1', title: 'บทความตัวอย่าง', excerpt: 'สรุปสั้น',
  coverUrl: null, tags: ['Excel', 'Power BI', 'Dashboard', 'Automation'], snippet: null,
};

const oneArticle = (overrides = {}) => ({
  counts: { ...emptySearchCounts(), articles: 1 },
  total: 1,
  results: {
    courses: [], onlineCourses: [], careerPaths: [], schedules: [], promotions: [],
    articles: [{ ...ARTICLE, ...overrides }],
  },
});

const render = (overrides = {}, term = 'zzz') =>
  R(createElement(SearchResults, {
    status: 'ready', term, data: oneArticle(overrides), requestedTab: 'all',
  }));

const card = (html) => {
  const section = html.match(/<section[\s\S]*?<\/section>/);
  assert.ok(section, 'no article section rendered');
  const a = section[0].match(/<a [\s\S]*?<\/a>/);
  assert.ok(a, 'no article card rendered');
  return a[0];
};

/** The tag row's chips, as text, in DOM order. */
const chips = (html) => {
  const row = html.match(/<div class="mt-auto[^"]*">([\s\S]*?)<\/div><\/div>/);
  if (!row) return [];
  return [...row[1].matchAll(/<span class="min-w-0 truncate[^"]*">([\s\S]*?)<\/span>/g)]
    // Strip any <mark> the highlighter injected — a highlighted string is NOT a
    // contiguous substring of its own HTML, so the text has to be reassembled
    // before it can be compared. Fifth entry on this repo's trap list.
    .map((m) => m[1].replace(/<[^>]+>/g, ''));
};

/** The `+N` overflow marker, or null. */
const overflow = (html) => html.match(/<span class="shrink-0 text-\[10px\][^"]*">\+(\d+)<\/span>/)?.[1] ?? null;

// ── The row itself ──────────────────────────────────────────────────────────

test('the article card renders neutral tag chips, not coloured pills', () => {
  /**
   * Article tags are plain strings with no `color`. Borrowing the promotion
   * card's per-tag colours would imply a meaning that is not in the data.
   */
  const html = card(render());
  assert.deepEqual(chips(html), ['Excel', 'Power BI', 'Dashboard'], 'capped, in order');
  assert.match(html, /bg-gray-100[^"]*text-gray-600/, 'grey chips');
  assert.equal(/background-color:/.test(html), false, 'no inline per-tag colour');
});

test('the article card renders NO date', () => {
  /**
   * The accepted cost of the swap, asserted so it is a decision rather than an
   * oversight. `publishedAt` is not even projected any more.
   */
  const html = card(render({ publishedAt: '2026-01-15T00:00:00.000Z' }));
  assert.equal(/25(69|70)/.test(html), false, 'no Buddhist-era year anywhere');
  assert.equal(/\bม\.ค\.\b/.test(html), false, 'and no Thai month label');
});

test('the row is capped, and the remainder becomes +N', () => {
  // Four tags, cap of three.
  const html = card(render());
  assert.equal(chips(html).length, 3, 'three chips');
  assert.equal(overflow(html), '1', 'and one hidden behind +N');
});

test('CONTROL: raising the cap past the tag count removes the +N', () => {
  /**
   * The cap is a named constant in the component, so this control drives it
   * from the DATA side instead: with three tags and a cap of three there is no
   * remainder, so `+N` must disappear. If the marker were unconditional — or
   * the probe unable to see it — this would not move.
   */
  const exactly3 = card(render({ tags: ['Excel', 'Power BI', 'Dashboard'] }));
  assert.equal(chips(exactly3).length, 3);
  assert.equal(overflow(exactly3), null, 'nothing hidden, so no marker');

  const six = card(render({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }));
  assert.equal(chips(six).length, 3, 'still capped at three');
  assert.equal(overflow(six), '3', 'and the marker counts the real remainder');
});

test('a MATCHING tag is never the one hidden behind +N', () => {
  /**
   * If the query matched a tag, that tag is why the card is a result — hiding
   * it is the same failure the snippet existed to fix, on a field that is
   * already on the card. `Automation` is fourth in the authored order and would
   * fall outside a cap of three.
   */
  const html = card(render({}, 'automation'));
  const shown = chips(html);
  assert.equal(shown[0], 'Automation', 'the matched tag is promoted to the front');
  assert.equal(shown.length, 3);
  assert.equal(overflow(html), '1');
  assert.match(html, /<mark[^>]*>Automation<\/mark>/, 'and it is highlighted');
});

test('CONTROL: without the match, that same tag IS hidden', () => {
  // Proves the promotion is doing the work rather than the authored order
  // happening to be convenient.
  const unmatched = chips(card(render({}, 'zzz')));
  assert.equal(unmatched.includes('Automation'), false, 'fourth tag falls outside the cap');
  assert.deepEqual(unmatched, ['Excel', 'Power BI', 'Dashboard']);
});

test('an article with no tags renders no row and no gap', () => {
  for (const tags of [[], null, undefined]) {
    const html = card(render({ tags }));
    assert.equal(
      /<div class="mt-auto/.test(html), false,
      `tags=${JSON.stringify(tags)}: the row carries padding, so an empty one would show`,
    );
    assert.equal(overflow(html), null);
  }
});

test('the row is one line — it does not wrap', () => {
  const row = card(render()).match(/<div class="mt-auto[^"]*"><div class="([^"]*)">/);
  assert.ok(row, 'the chip container is gone');
  assert.equal(/flex-wrap/.test(row[1]), false, 'no wrapping — the cap is what bounds it');
  assert.match(row[1], /overflow-hidden/, 'and it clips rather than pushing the card wider');
});

// ── The ordering rule, purely ───────────────────────────────────────────────

test('orderTagsByMatch is stable and drops nothing', () => {
  const tags = ['Excel', 'Power BI', 'Dashboard', 'Automation'];
  assert.deepEqual(orderTagsByMatch(tags, 'automation'), ['Automation', 'Excel', 'Power BI', 'Dashboard']);
  assert.deepEqual(orderTagsByMatch(tags, 'zzz'), tags, 'no match leaves the authored order');
  assert.deepEqual(orderTagsByMatch(tags, ''), tags, 'and so does an empty term');
  assert.deepEqual(orderTagsByMatch(['a', 'ab', 'b'], 'a'), ['a', 'ab', 'b'], 'stable within groups');
  assert.deepEqual(orderTagsByMatch(null, 'x'), [], 'a missing list is empty, not a throw');
  assert.deepEqual(orderTagsByMatch(['ok', '', '  ', 3], 'x'), ['ok'], 'blanks and non-strings drop');
});

// ── The promotion section's grid ────────────────────────────────────────────

const promoPayload = (n) => ({
  counts: { ...emptySearchCounts(), promotions: n },
  total: n,
  results: {
    courses: [], onlineCourses: [], careerPaths: [], schedules: [], articles: [],
    promotions: Array.from({ length: n }, (_, i) => ({
      _id: `p${i}`, promotion_id: `P${i}`, title: `โปรโมชัน ${i}`,
      thumbnail_url: null, tags: [], snippet: null,
    })),
  },
});

test('the promotion section is two columns, on the same rule as the others', () => {
  /**
   * Reused, not re-invented: the course / online / career-path / article
   * sections all render `grid grid-cols-1 gap-3 md:grid-cols-2`, and promotions
   * now take the same string from the same place rather than a third rule.
   */
  const html = R(createElement(SearchResults, {
    status: 'ready', term: 'zzz', data: promoPayload(2), requestedTab: 'all',
  }));
  assert.match(
    html, /<div class="grid grid-cols-1 gap-3 md:grid-cols-2">/,
    'the promotion list must use the shared two-column grid',
  );
  assert.equal(
    /<div class="space-y-3">/.test(html), false,
    'and not the single-column stack it had',
  );
});

test('CONTROL: the schedule section still stacks — it is a row list, not cards', () => {
  /**
   * Without this, "promotions are a grid" could be satisfied by every section
   * becoming a grid, including the one that is deliberately full-width rows.
   */
  const html = R(createElement(SearchResults, {
    status: 'ready',
    term: 'zzz',
    data: {
      counts: { ...emptySearchCounts(), schedules: 1 },
      total: 1,
      results: {
        courses: [], onlineCourses: [], careerPaths: [], promotions: [], articles: [],
        schedules: [{ _id: 's1', dates: ['2026-10-17'], type: 'classroom', status: 'open',
          course_ref: { course_id: 'X', course_name: 'N', course_price: 1 } }],
      },
    },
    requestedTab: 'all',
  }));
  assert.match(html, /<div class="space-y-3">/, 'schedules keep the stacked list');
  assert.equal(/grid-cols-1 gap-3 md:grid-cols-2/.test(html), false);
});
