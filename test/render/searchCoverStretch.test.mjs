import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchResults } from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts } from '@/lib/search/matchSearch';

/**
 * THE COVER FILLS ITS SIDE OF THE CARD — AT EVERY WIDTH.
 *
 * ── WHAT WAS WRONG, IN TWO ROUNDS ───────────────────────────────────────────
 * 1. The mobile track is 128px and the cover was `aspect-video self-start`, so
 *    it was 72px tall inside a row the text column holds at 140-190px. Every
 *    card, in every section, had 70-120px of bare card beside a small thumbnail.
 *    Fixed by `self-stretch`, scoped to below `sm`.
 * 2. That scope was wrong. The theory was that a 256px 16:9 cover (144px tall)
 *    matched the desktop text column, so `self-start` left nothing behind above
 *    `sm`. The course card's text column is ~154px — and because grid items in
 *    one row share that row's height, a card beside a taller sibling is taller
 *    still. So the same strip of background reappeared on desktop, smaller.
 *
 * `self-stretch` is now unqualified, and the `sm:` override is gone.
 *
 * ── WHY THIS IS NOT THE OLD CIRCULARITY WEARING A HAT ───────────────────────
 * The bug `self-start` was introduced to kill ran WIDTH ← height ← row ← text.
 * It needed an `auto` TRACK to close the loop. Both tracks are declared lengths,
 * so the width is settled before layout begins and a height taken from the row
 * cannot reach back into it. Width pinned, height from the row is what a
 * thumbnail strip does; the reverse is what nothing should do.
 *
 * `h-full` is still banned and is NOT the same thing: it is `height: 100%`
 * against a content-sized parent — the circular half — where `align-self:
 * stretch` is resolved by the grid, which has already sized the row.
 *
 * ── WHAT THIS FILE PINS ─────────────────────────────────────────────────────
 * Nothing here can lay anything out — there is no layout engine in this tier —
 * so what is asserted is the DIRECTION of each declaration, that NO breakpoint
 * takes the stretch away again, and that the mobile treatment is byte-for-byte
 * what it already was. The ratio's remaining job (the row's 144px floor) is
 * pinned next door in searchCoverSizing.test.mjs.
 */

const R = (el) => renderToStaticMarkup(el);

const ROWS = {
  courses: {
    _id: 'c1', course_id: 'MSE-PBI', course_name: 'Power BI Desktop',
    course_price: 9000, course_trainingdays: 2, course_teaser: 'สร้าง Dashboard',
    course_cover_url: 'https://res.cloudinary.com/x/course.jpg', snippet: null,
  },
  onlineCourses: {
    _id: 'o1', o_course_id: 'ONL-EXC', o_course_name: 'Excel Essentials Online',
    o_course_teaser: 'เรียนด้วยตนเอง', o_course_price: 990, o_number_lessons: 12,
    o_course_cover_url: 'https://res.cloudinary.com/x/online.jpg',
    website_urls: ['https://academy.example/excel'], snippet: null,
  },
  careerPaths: {
    _id: 'cp1', title: 'Data Analyst', api_slug: 'data-analyst',
    short_description: 'เส้นทางสายข้อมูล',
    hero_image_url: 'https://upstream.example/hero.jpg', icon_url: null, snippet: null,
  },
  promotions: {
    _id: 'p1', promotion_id: 'PR1', api_slug: 'year-end', title: 'ลดราคาปลายปี',
    thumbnail_url: 'https://upstream.example/promo.jpg', tags: [], snippet: null,
  },
  articles: {
    _id: 'a1', slug: 'a1', title: 'บทความ', excerpt: 'สรุป',
    coverUrl: 'https://res.cloudinary.com/x/article.jpg', tags: ['excel'], snippet: null,
  },
};
const TYPES = Object.keys(ROWS);

const render = (type) => {
  const results = Object.fromEntries([...TYPES, 'schedules'].map((t) => [t, []]));
  results[type] = [ROWS[type]];
  return R(createElement(SearchResults, {
    status: 'ready',
    term: 'zzz',
    data: { counts: { ...emptySearchCounts(), [type]: 1 }, total: 1, results },
    requestedTab: 'all',
  }));
};

/** The cover slot's class attribute — the first `<div>` inside the card link. */
const coverClasses = (html) => {
  const section = html.match(/<section[\s\S]*?<\/section>/);
  assert.ok(section, 'no result section rendered');
  const link = section[0].match(/<a [\s\S]*?<\/a>/);
  assert.ok(link, 'no card link rendered');
  const cover = link[0].match(/<div class="([^"]*)"/);
  assert.ok(cover, 'the cover slot is gone');
  return cover[1];
};

/**
 * THE ONE PREDICATE, used by every assertion below AND by the controls.
 *
 * Written once and shared on purpose: a control that re-implements the matcher
 * proves that the CONTROL's matcher can fail, which is not the claim. Both the
 * shipped string and the mutations are read by exactly this function.
 *
 * Every clause is boundary-anchored, because an unprefixed Tailwind utility is a
 * substring of its own breakpoint variant — `self-start` occurs inside
 * `sm:self-start`, and a bare `includes` cannot tell a base value from an
 * override. (`self-start` is NOT a substring of `self-stretch`; the boundaries
 * are there for the variant, not for that pair.)
 */
const coverVerdict = (classes) => ({
  /** Fills the row. Unprefixed, so it is in force from 0px up. */
  stretches: /(^|\s)self-stretch(\s|$)/.test(classes),
  /**
   * ANY breakpoint that takes the stretch away again — `sm:self-start`,
   * `lg:self-start`, `md:self-end`, all of them. This is the clause the brief's
   * control targets, and it is written as a family rather than as the one
   * literal that was there, because `lg:self-start` would reintroduce the
   * identical strip of background 384px later.
   */
  cancelledAtABreakpoint: /(^|\s)(sm|md|lg|xl|2xl):self-(start|end|center|baseline|auto)(\s|$)/.test(classes),
  /** The circular half: `height: 100%` against a content-sized parent. */
  usesHFull: /(^|\s)h-full(\s|$)/.test(classes),
  /** A base `self-start` is the original shape: 72px cover, dead space. */
  pinnedToRatio: /(^|\s)self-start(\s|$)/.test(classes),
});

/**
 * THE MOBILE TREATMENT, FROZEN.
 *
 * The whole class string as it shipped last round, so "mobile did not move" is
 * one equality rather than a list of clauses that could each be true while the
 * string as a whole changed. The claim being made is exact: the ONLY edit is the
 * removal of the ` sm:self-start` qualifier, and every other token — the
 * positioning context, the width, the clipping, the placeholder fill — is
 * untouched. A phone renders the same cover it rendered before this change.
 */
const PREVIOUS_COVER_BASE = 'relative w-full self-stretch sm:self-start overflow-hidden bg-gray-100';

// ── One state, at every width ───────────────────────────────────────────────

test('every cover stretches to the card height, at every width', () => {
  for (const type of TYPES) {
    const v = coverVerdict(coverClasses(render(type)));
    assert.ok(v.stretches, `${type}: the cover must fill the card's height`);
    assert.equal(
      v.pinnedToRatio, false,
      `${type}: a base self-start is the 72px thumbnail this work removed`,
    );
  }
});

test('and NO breakpoint takes the stretch away again', () => {
  /**
   * THE assertion this round exists for. `sm:self-start` reverted the cover to a
   * ratio-derived 144px on desktop while the card could be taller, which is the
   * strip of background under the course covers. Any variant that cancels
   * `align-self: stretch` restores it at some width.
   */
  for (const type of TYPES) {
    const v = coverVerdict(coverClasses(render(type)));
    assert.equal(
      v.cancelledAtABreakpoint, false,
      `${type}: a breakpoint override puts the dead strip back above that width`,
    );
    assert.equal(
      v.usesHFull, false,
      `${type}: h-full is the circular form — the grid resolves the stretch, not a % of the parent`,
    );
  }
});

test('CONTROL: restoring sm:self-start reddens the assertion above', () => {
  /**
   * The mutation named in the brief, run through the SAME predicate the tests
   * above use. Without this, "no breakpoint cancels the stretch" is satisfiable
   * by a matcher that cannot see a breakpoint at all.
   *
   * Four mutations: the exact string that was removed, the same defect one
   * breakpoint later, `h-full`, and dropping the stretch outright.
   */
  const shipped = coverClasses(render('courses'));
  const v = coverVerdict(shipped);
  assert.equal(v.cancelledAtABreakpoint, false, 'the shipped string is clean…');
  assert.ok(v.stretches, '…and really does stretch');

  assert.ok(
    coverVerdict(`${shipped} sm:self-start`).cancelledAtABreakpoint,
    'the qualifier this change removed must be caught if it comes back',
  );
  assert.ok(
    coverVerdict(`${shipped} lg:self-start`).cancelledAtABreakpoint,
    'and the same defect at a later breakpoint',
  );
  assert.ok(coverVerdict(`${shipped} h-full`).usesHFull, 'and the circular form');
  assert.equal(
    coverVerdict(shipped.replace('self-stretch', 'self-start')).stretches, false,
    'and dropping the stretch outright',
  );
  // …and the predicate is reading a real class string, not an empty one.
  assert.ok(shipped.length > 30, `the cover class attribute was read: "${shipped}"`);
});

test('CONTROL: the boundary anchoring really distinguishes base from variant', () => {
  // The trap this file is written around, asserted directly rather than trusted.
  assert.ok('sm:self-start'.includes('self-start'), 'the substring relationship is real…');
  assert.equal(
    coverVerdict('relative w-full sm:self-start').pinnedToRatio, false,
    '…and the anchored probe is not fooled by it',
  );
  assert.ok(
    coverVerdict('relative w-full self-start').pinnedToRatio,
    'while a genuine base self-start is still seen',
  );
  // `self-stretch` must not read as a `self-start`, in either direction.
  assert.equal(coverVerdict('relative self-stretch').pinnedToRatio, false);
  assert.equal(coverVerdict('relative self-start').stretches, false);
});

// ── Mobile did not move ─────────────────────────────────────────────────────

test('the mobile cover treatment is byte-for-byte what it already was', () => {
  /**
   * The brief's standing rule for this round, stated as an equality rather than
   * as a set of clauses: the shipped string IS the previous string with exactly
   * ` sm:self-start` taken out of it. Anything else that moved — a lost
   * `relative`, a changed placeholder fill, a reordered token — fails here even
   * though every clause-level probe above would still pass.
   */
  const expected = PREVIOUS_COVER_BASE.replace(' sm:self-start', '');
  for (const type of ['courses', 'onlineCourses', 'careerPaths', 'articles']) {
    assert.equal(
      coverClasses(render(type)), `${expected} aspect-video`,
      `${type}: the 16:9 slot changed by more than the dropped qualifier`,
    );
  }
  assert.equal(
    coverClasses(render('promotions')), `${expected} aspect-square`,
    'promotions: the square slot changed by more than the dropped qualifier',
  );
});

test('CONTROL: the byte-for-byte probe DOES fire on any other edit', () => {
  /**
   * Without this the equality above is only as strong as `coverClasses`: if it
   * returned '' the assertion would fail loudly, but a mutation test is what
   * proves the comparison is sensitive to the tokens it claims to protect.
   */
  const expected = `${PREVIOUS_COVER_BASE.replace(' sm:self-start', '')} aspect-video`;
  const live = coverClasses(render('courses'));
  assert.equal(live, expected, 'the live string matches…');
  for (const mutation of [
    expected.replace('relative', 'absolute'),
    expected.replace('bg-gray-100', 'bg-gray-200'),
    expected.replace('overflow-hidden', ''),
    `${expected} sm:self-start`,
  ]) {
    assert.notEqual(live, mutation, `an edit to "${mutation}" must break the equality`);
  }
  // …and the frozen string really is the one that shipped last round.
  assert.ok(
    PREVIOUS_COVER_BASE.includes(' sm:self-start'),
    'the qualifier being removed was really in the previous value',
  );
});

// ── The ratio still has a job under stretch ─────────────────────────────────

test('the ratio is still declared — it is what floors the row at 144px', () => {
  /**
   * `aspect-video` / `aspect-square` are NOT dead weight now that the cover
   * always stretches. An item's contribution to AUTO ROW SIZING is unaffected by
   * `align-self`, so the ratio still decides how tall the row is when the text
   * is shorter than 144px — which is four of the five card types. Remove it and
   * a short card collapses to its text height, taking the cover with it.
   */
  for (const type of TYPES) {
    const classes = coverClasses(render(type));
    assert.match(
      classes, /(^|\s)aspect-(video|square)(\s|$)/,
      `${type}: without a ratio the row has no floor and the cover no intrinsic height`,
    );
  }
  // Promotions keep the SQUARE ratio, so their 144px floor matches the 16:9
  // cards' — that is the whole reason the square track is 144 and not a round
  // number, and it survives the stretch.
  assert.match(coverClasses(render('promotions')), /(^|\s)aspect-square(\s|$)/);
  assert.match(coverClasses(render('courses')), /(^|\s)aspect-video(\s|$)/);
});

test('NOT CHECKED HERE: what the browser downloads — the stub erases `sizes`', () => {
  /**
   * `object-cover` scales the source until it COVERS the box, and the limiting
   * dimension is the height — so a 16:9 cover in a 154px-tall card is decoded at
   * ~274px wide at EVERY width: the visible box is 128px or 256px, the bitmap is
   * neither. The `sizes` attribute therefore had to change with this layout, and
   * it did — but test/stub-next-image.mjs drops every next-only prop, so no
   * render-tier assertion about it could ever mean anything. It is pinned in
   * test/fs/searchResultCardStyling instead.
   *
   * Written as a passing test rather than a comment so the claim is discoverable
   * from a test run, in the same shape this suite already uses for the
   * next/image-vs-<img> distinction.
   */
  const img = render('courses').match(/<img[^>]*>/);
  assert.ok(img, 'a cover really did render');
  assert.equal(/\ssizes=/.test(img[0]), false, 'and the stub really did drop the attribute');
});
