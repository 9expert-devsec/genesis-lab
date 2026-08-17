import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchResults } from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts } from '@/lib/search/matchSearch';
import { readSource } from '../sourceScan.mjs';

/**
 * THE COVER SLOT, and the per-card content that depends on it.
 *
 * ── THE BUG THIS BATCH EXISTS TO REMOVE ─────────────────────────────────────
 * The slot was `grid-cols-[auto_1fr]` with the cover `aspect-video h-full`,
 * which is circular: the track took its width from the cover, the cover took
 * its width from the ratio times its height, its height came from `h-full`
 * (the row height), and the row height came from THE TEXT COLUMN. So a card's
 * cover width was a function of how much text it happened to have — two
 * results with different title lengths got different cover widths, and none of
 * them was the ratio anyone asked for.
 *
 * The fix is one direction of dependency: the TRACK is a declared length, the
 * height follows from the ratio, and `h-full` is gone. These tests pin that
 * direction rather than any particular pixel.
 */

const R = (el) => renderToStaticMarkup(el);

const ROWS = {
  courses: {
    _id: 'c1', course_id: 'MSE-PBI', course_name: 'Power BI Desktop',
    course_price: 9000, course_trainingdays: 2,
    course_teaser: 'สร้าง Dashboard เชิงโต้ตอบสำหรับผู้บริหาร',
    course_cover_url: 'https://res.cloudinary.com/x/course.jpg',
    program: { program_name: 'Data Analytics', programiconurl: null }, snippet: null,
  },
  onlineCourses: {
    _id: 'o1', o_course_id: 'ONL-EXC', o_course_name: 'Excel Essentials Online',
    o_course_teaser: 'เรียนรู้สูตรและ PivotTable ด้วยตนเอง',
    o_course_cover_url: 'https://res.cloudinary.com/x/online.jpg',
    o_course_price: 990, o_number_lessons: 12,
    website_urls: ['https://academy.example/excel'], snippet: null,
  },
  careerPaths: {
    _id: 'cp1', title: 'Data Analyst', api_slug: 'data-analyst',
    short_description: 'เส้นทางสายข้อมูล',
    hero_image_url: 'https://upstream.example/hero.jpg', icon_url: null, snippet: null,
  },
  promotions: {
    _id: 'p1', promotion_id: 'PR1', api_slug: 'year-end', title: 'ลดราคาปลายปี',
    thumbnail_url: 'https://upstream.example/promo.jpg',
    start_date: '2026-11-01', end_date: '2026-12-31', tags: [], snippet: null,
  },
  articles: {
    _id: 'a1', slug: 'a1', title: 'บทความ', excerpt: 'สรุป',
    coverUrl: 'https://res.cloudinary.com/x/article.jpg',
    // The bottom row is a TAG row now — no tags means no row at all, which is
    // correct behaviour and would make the anchoring assertions vacuous.
    tags: ['excel'], snippet: null,
  },
};
const TYPES = Object.keys(ROWS);

const oneOf = (type, overrides = {}) => {
  const results = Object.fromEntries([...TYPES, 'schedules'].map((t) => [t, []]));
  results[type] = [{ ...ROWS[type], ...overrides }];
  return { counts: { ...emptySearchCounts(), [type]: 1 }, total: 1, results };
};

const render = (type, overrides = {}, term = 'zzz') =>
  R(createElement(SearchResults, {
    status: 'ready', term, data: oneOf(type, overrides), requestedTab: 'all',
  }));

const card = (html) => {
  const section = html.match(/<section[\s\S]*?<\/section>/);
  assert.ok(section, 'no result section rendered');
  const a = section[0].match(/<a [\s\S]*?<\/a>/);
  assert.ok(a, 'no card link rendered');
  return a[0];
};

/** The card's own class attribute — the grid track lives here. */
const cardClasses = (html) => {
  const m = card(html).match(/^<a [^>]*class="([^"]*)"/);
  assert.ok(m, 'the card has no class attribute');
  return m[1];
};

/** The cover slot's class attribute — the first <div> inside the card. */
const coverClasses = (html) => {
  const m = card(html).match(/<div class="([^"]*)"/);
  assert.ok(m, 'the cover slot is gone');
  return m[1];
};

// ── The track is a fixed length ─────────────────────────────────────────────

test('the cover track is a FIXED length, never `auto`', () => {
  /**
   * `auto` is the circularity. Matched on the whole declaration, because
   * `grid-cols-[128px_1fr]` is a substring of `sm:grid-cols-[128px_1fr]` and a
   * bare `includes` could not tell a base value from a breakpoint override.
   */
  for (const type of TYPES) {
    const classes = cardClasses(render(type));
    assert.equal(
      /grid-cols-\[auto/.test(classes), false,
      `${type}: an \`auto\` track makes the cover width depend on the text`,
    );
    const tracks = classes.match(/(^|\s|:)grid-cols-\[[^\]]+\]/g) ?? [];
    assert.ok(tracks.length >= 2, `${type}: expected a base and an sm: track, got ${tracks}`);
    for (const track of tracks) {
      assert.match(track, /\[\d+px_1fr\]/, `${type}: "${track}" is not a fixed length`);
    }
  }
});

test('16:9 cards and the square card use the two declared tracks', () => {
  for (const type of ['courses', 'onlineCourses', 'careerPaths', 'articles']) {
    const classes = cardClasses(render(type));
    assert.ok(classes.includes('grid-cols-[176px_1fr] sm:grid-cols-[256px_1fr]'), `${type}: 16:9 track`);
  }
  assert.ok(
    cardClasses(render('promotions')).includes('grid-cols-[136px_1fr] sm:grid-cols-[144px_1fr]'),
    'promotions: the square track',
  );
});

test('CONTROL: the track probe rejects the pre-change mobile widths', () => {
  // The mobile track moved from 128/72 to 176/136. Without this, the literals
  // above could go stale and the assertion would be describing a layout the
  // file no longer has — which is exactly what the arithmetic test below was
  // doing before it was rewritten.
  const classes = cardClasses(render('courses'));
  assert.equal(classes.includes('grid-cols-[128px_1fr]'), false, 'the old 16:9 track is gone');
  assert.equal(
    cardClasses(render('promotions')).includes('grid-cols-[72px_1fr]'), false,
    'and so is the old square track',
  );
});

test('the two tracks are level at sm and up, and deliberately are NOT below it', () => {
  /**
   * ABOVE `sm` the relationship is unchanged and is the reason the square track
   * is 144 rather than a round number: 256 x 9/16 = 144, and 144 x 1/1 = 144.
   * Cards can share a grid row there, so a promotion has to sit level with its
   * neighbours despite a different cover ratio.
   *
   * BELOW `sm` that requirement does not exist and the tracks no longer match:
   * 176 x 9/16 = 99 against 136 x 1/1 = 136. Each track is derived from ITS OWN
   * tallest text block so the declared ratio and the stretched height agree —
   * see RESULT_COVER_TRACK. It is safe precisely because the results list is
   * ONE COLUMN below `md`, so no two cards ever share a row to be level in.
   *
   * This test previously asserted `(128 * 9) / 16 === 72` and passed forever:
   * arithmetic on literals, checking nothing about the file. It is rewritten
   * to read the SOURCE.
   */
  assert.equal((256 * 9) / 16, 144, '16:9 at the wide track');
  assert.equal(144 * 1, 144, 'and 1:1 at the square track — level above sm');

  const src = readSource('src/app/(public)/search/_components/SearchClient.jsx').code;
  const track16 = Number(/grid-cols-\[(\d+)px_1fr\] sm:grid-cols-\[256px_1fr\]/.exec(src)[1]);
  const trackSq = Number(/grid-cols-\[(\d+)px_1fr\] sm:grid-cols-\[144px_1fr\]/.exec(src)[1]);
  assert.notEqual((track16 * 9) / 16, trackSq * 1, 'below sm the two heights differ, by design');

  // ...and the reason that is safe, read from the source rather than asserted.
  assert.match(src, /grid-cols-1 gap-3 md:grid-cols-2/, 'the list is one column below md');
  assert.match(src, /'space-y-3'/, 'and the non-grid sections are a plain stack');
});

test('CONTROL: the one-column claim would fail if the list went multi-column early', () => {
  // `grid-cols-2` without an md: prefix is the shape that would make two cards
  // share a row on a phone and make the differing mobile heights visible.
  const src = readSource('src/app/(public)/search/_components/SearchClient.jsx').code;
  assert.equal(/(^|\s)grid-cols-2/.test(src), false, 'no unqualified two-column list');
  assert.equal(/sm:grid-cols-2/.test(src), false, 'and none arriving at sm either');
});

test('no cover carries `h-full` — the ratio still floors the row', () => {
  /**
   * `h-full` is `height: 100%` against a parent whose height is content-derived
   * — the circular half of the original bug — and it stays gone at every width.
   * The cover's height now comes from `self-stretch`, which the GRID resolves
   * after sizing the row; that half is pinned in searchCoverStretch.test.mjs.
   *
   * What this file still owns is the RATIO, whose job survived the stretch: an
   * item's contribution to auto row sizing is unaffected by `align-self`, so
   * `aspect-video` / `aspect-square` are what hold the row at 144px whenever the
   * text column is shorter — which is four of the five types.
   */
  for (const type of TYPES) {
    const classes = coverClasses(render(type));
    assert.equal(
      /(^|\s)h-full(\s|$)/.test(classes), false,
      `${type}: the cover must not take its height from a percentage of the card`,
    );
    assert.match(classes, /aspect-(video|square)/, `${type}: the ratio must be declared`);
  }
});

test('CONTROL: the h-full probe would fire on the shape this replaced', () => {
  /**
   * Every assertion above is an absence. Run the matcher against the exact old
   * class string so it cannot be an absence that is simply unfindable.
   */
  const old = 'relative aspect-video h-full shrink-0 overflow-hidden bg-gray-100';
  assert.ok(/(^|\s)h-full(\s|$)/.test(old), 'the probe sees the old cover');
  assert.equal(
    /(^|\s)h-full(\s|$)/.test(coverClasses(render('courses'))), false,
    'and does not see one on the live card',
  );
  assert.ok(/grid-cols-\[auto/.test('group grid min-h-36 grid-cols-[auto_1fr]'), 'and the old track');
});

test('`min-h-36` is gone — the cover height IS the floor now', () => {
  /**
   * It was doing something and it is now redundant AT BEST: at the sm-and-up
   * track a 16:9 cover is exactly 144px, which is what `min-h-36` was forcing.
   * Below sm it was actively wrong — it would hold a card at 144px around a
   * 72px cover.
   */
  for (const type of TYPES) {
    assert.equal(
      /min-h-36/.test(cardClasses(render(type))), false,
      `${type}: min-h-36 duplicates the cover's own height above sm and harms below it`,
    );
  }
});

// ── Raw <img> covers are dimensioned ────────────────────────────────────────

test('every raw <img> cover carries width and height attributes', () => {
  /**
   * An `<img>` with no dimensions is laid out at its INTRINSIC size before the
   * stylesheet settles. `hero_image_url` is a ~1200px-wide banner, so the cover
   * column blew out and crushed the text column to a sliver — the "image
   * swallows the card" symptom, which is a pre-CSS layout artefact rather than
   * a CSS bug.
   */
  for (const type of ['careerPaths', 'promotions']) {
    const img = card(render(type)).match(/<img[^>]*>/);
    assert.ok(img, `${type}: no <img> rendered`);
    assert.match(img[0], /\swidth="\d+"/, `${type}: the cover needs an intrinsic width`);
    assert.match(img[0], /\sheight="\d+"/, `${type}: and an intrinsic height`);
  }
});

test('the dimensions match the slot each card actually uses', () => {
  const cp = card(render('careerPaths')).match(/<img[^>]*>/)[0];
  assert.match(cp, /width="256"/);
  assert.match(cp, /height="144"/);

  const promo = card(render('promotions')).match(/<img[^>]*>/)[0];
  assert.match(promo, /width="144"/);
  assert.match(promo, /height="144"/, 'square, matching its own track');
});

test('CONTROL: the dimension probe distinguishes a bare <img>', () => {
  // Without this, "carries width" could be matching an attribute that is
  // always present on every img in the document.
  assert.equal(/\swidth="\d+"/.test('<img src="x" class="y"/>'), false);
  assert.ok(/\swidth="\d+"/.test('<img src="x" width="256" height="144"/>'));
});

// ── the mobile ratio fix ────────────────────────────────────────────────────

/**
 * The mobile box, derived the way the component derives it.
 *
 * `aspect-video` / `aspect-square` set the row's FLOOR; above that floor the
 * box takes the text block's height and `object-cover` crops the width. So the
 * crop is a function of the track and the text height, and it is zero exactly
 * when the floor is at or above the text.
 */
const mobileBox = (track, ratio, textHeight) => {
  const height = Math.max(track / ratio, textHeight);
  const decoded = height * ratio;
  return { height, crop: decoded > track ? (decoded - track) / decoded : 0 };
};

test('the mobile track is derived so the ratio floor covers the text block', () => {
  // THE WHOLE FIX. Below sm the cover is `track x textHeight`, and it only
  // shows the declared ratio when the floor wins. Read the tracks from source
  // so the arithmetic cannot drift away from what ships.
  const src = readSource('src/app/(public)/search/_components/SearchClient.jsx').code;
  const track16 = Number(/grid-cols-\[(\d+)px_1fr\] sm:grid-cols-\[256px_1fr\]/.exec(src)[1]);
  const trackSq = Number(/grid-cols-\[(\d+)px_1fr\] sm:grid-cols-\[144px_1fr\]/.exec(src)[1]);

  // Tallest mobile text block per family, with the teaser dropped below sm.
  // online/article/careerPath top out at 96px; a promotion at 134px.
  assert.equal(mobileBox(track16, 16 / 9, 96).crop, 0, 'a 96px block shows a full 16:9 cover');
  assert.equal(mobileBox(trackSq, 1, 134).crop, 0, 'and a 134px promotion block a full square');
  // The course card alone adds a code line, so its 2-line body is 111px and
  // keeps a bounded residual rather than zero. Named, not hidden.
  const course = mobileBox(track16, 16 / 9, 111);
  assert.ok(course.crop > 0, 'the course 2-line case is the one residual');
  assert.ok(course.crop < 0.15, `and it stays bounded: ${(course.crop * 100).toFixed(1)}%`);
});

test('CONTROL: the pre-change geometry is what that probe rejects', () => {
  // Fired at the numbers that shipped before: a 128px track under a 154px
  // course block, which is the reported defect. If the model returned ~0 here
  // the assertions above would mean nothing.
  const before = mobileBox(128, 16 / 9, 154);
  assert.ok(before.crop > 0.5, `the old course card lost ${(before.crop * 100).toFixed(1)}% of its width`);
  assert.ok(mobileBox(72, 1, 134).crop > 0.4, 'and the old promotion track was no better');
  // ...and the model is not simply always-positive: give the floor room and it
  // reports zero.
  assert.equal(mobileBox(176, 16 / 9, 90).crop, 0);
});

test('the teaser is hidden below sm WITHOUT overriding the line clamp', () => {
  /**
   * `max-sm:hidden`, never `hidden sm:block`. Both this element and the career
   * path's description carry `line-clamp-2`, which works by setting
   * `display: -webkit-box` — an `sm:block` would replace that above the
   * breakpoint and silently unclamp the DESKTOP teaser to full length. The
   * `max-sm:` form only adds a rule below the breakpoint.
   */
  const src = readSource('src/app/(public)/search/_components/SearchClient.jsx').code;
  const teaser = /const RESULT_TEASER = '([^']+)'/.exec(src)[1];
  assert.match(teaser, /\bmax-sm:hidden\b/, 'hidden below sm');
  assert.match(teaser, /\bline-clamp-2\b/, 'and still clamped');
  assert.equal(/\bsm:block\b/.test(teaser), false, 'sm:block would kill the clamp above sm');
  assert.equal(/(^|\s)hidden(\s|$)/.test(teaser), false, 'and a bare `hidden` would kill it below');
});

test('CONTROL: the clamp-safety probe fires on the shape that would break it', () => {
  // The trap written out, so the assertion above is not just three greps.
  const trap = 'mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500 hidden sm:block';
  assert.equal(/\bmax-sm:hidden\b/.test(trap), false, 'the trap has no max-sm form');
  assert.equal(/\bsm:block\b/.test(trap), true, 'it has the display-overriding one');
});

test('every card that hides a teaser hides it the same way', () => {
  // The career path's description is its own class string — the five cards stay
  // separate on purpose — so it can drift. It must not.
  const src = readSource('src/app/(public)/search/_components/SearchClient.jsx').code;
  const clamped = src.match(/className="[^"]*line-clamp-2[^"]*"/g) ?? [];
  assert.ok(clamped.length >= 1, 'the career path description is a literal class string');
  for (const cls of clamped) {
    assert.match(cls, /\bmax-sm:hidden\b/, `${cls} must use the same mechanism`);
    assert.equal(/\bsm:block\b/.test(cls), false, `${cls} must not override the clamp`);
  }
});

test('CONTROL: that sweep is not vacuous — it finds the real class strings', () => {
  const src = readSource('src/app/(public)/search/_components/SearchClient.jsx').code;
  assert.match(src, /line-clamp-2 text-xs text-gray-500 max-sm:hidden/,
    'the career path description, verbatim from the shipped file');
});

test('the download width still covers the worst case, which is DESKTOP', () => {
  // A too-small `sizes` fails silently as a soft image. The mobile track moved,
  // so this is re-derived rather than assumed: desktop still governs because
  // the teaser still renders there.
  const src = readSource('src/app/(public)/search/_components/SearchClient.jsx').code;
  const sizes = Number(/const RESULT_COVER_SIZES = '(\d+)px'/.exec(src)[1]);
  const desktopWorst = 154 * (16 / 9);              // course, 2-line title, teaser shown
  const mobileWorst = mobileBox(176, 16 / 9, 111).height * (16 / 9);
  assert.ok(sizes >= desktopWorst, `${sizes}px must cover the ${desktopWorst.toFixed(0)}px desktop decode`);
  assert.ok(desktopWorst > mobileWorst, 'and desktop is still the worst case, not mobile');
});

test('CONTROL: the sizes probe would catch a value re-derived down to the track', () => {
  // The tempting mistake is to set `sizes` to the visible track width.
  assert.equal(176 >= 154 * (16 / 9), false, 'the mobile track alone would under-request');
  assert.equal(256 >= 154 * (16 / 9), false, 'and so would the desktop track');
});

// ── §2 the course teaser ────────────────────────────────────────────────────

const TEASER = 'สร้าง Dashboard เชิงโต้ตอบสำหรับผู้บริหาร';
const count = (hay, needle) => hay.split(needle).length - 1;

/**
 * How many PLAIN-TEASER paragraphs a card rendered.
 *
 * Counted by element, not by text, and that distinction is the whole reason
 * this helper exists: when the search term falls inside the teaser,
 * `highlightText` splits the string around a `<mark>`, so the teaser's own
 * words are no longer a contiguous substring of the HTML and a text count
 * reports 0 for a correctly-rendered card. `leading-relaxed` is unique to
 * RESULT_TEASER — the snippet line is `line-clamp-1` with no leading class.
 */
const teaserParagraphs = (html) =>
  count(html, 'line-clamp-2 text-xs leading-relaxed');

test('the course card renders its teaser when there is no snippet', () => {
  /**
   * The common case is a TITLE match, which yields no snippet — those cards
   * were showing a title and a price and nothing else, which is less context
   * than before this work started.
   */
  const html = card(render('courses', { snippet: null }, 'power'));
  assert.equal(teaserParagraphs(html), 1, 'the teaser must render exactly once');
  assert.equal(count(html, TEASER), 1, 'and carry its text, unsplit — no term inside it here');
});

test('the course card renders NO snippet at all', () => {
  /**
   * ── THE DEDUP IS GONE BECAUSE THE SNIPPET IS ──────────────────────────────
   * This card used to suppress its teaser when the snippet had been cut from
   * that same teaser, so the sentence was not printed twice. That whole problem
   * disappeared with the narrowing: a course now matches only on its name, its
   * code, its program and its teaser, and three of those four are printed here
   * — so there is nothing left for a snippet to explain.
   *
   * Asserted even when a snippet is handed in, because the card must not render
   * one whatever the payload says.
   */
  const html = card(render('courses', {
    snippet: { label: 'รายละเอียด', text: TEASER },
  }, 'dashboard'));
  assert.equal(teaserParagraphs(html), 1, 'the teaser renders exactly once');
  assert.equal(html.includes('>รายละเอียด</span>'), false, 'and no snippet label appears');
  assert.equal(/<span class="italic">/.test(html), false, 'nor a snippet body');
});

test('the online card renders no snippet either', () => {
  const html = card(render('onlineCourses', {
    snippet: { label: 'รายละเอียด', text: 'x' },
  }, 'excel'));
  assert.equal(html.includes('>รายละเอียด</span>'), false);
  assert.equal(/<span class="italic">/.test(html), false);
  assert.equal(teaserParagraphs(html), 1, 'the teaser is what carries the body');
});

test('the article card renders no snippet either, whatever it is handed', () => {
  /**
   * Asserted at the CARD, not only at the matcher.
   *
   * `matchSnippet` never produces one for articles, so removing the card's
   * `<MatchSnippet>` and putting it back are both invisible in behaviour — the
   * prop is always null. That makes the card-level claim untested unless it is
   * driven from the payload side, which is what this does. Without it, someone
   * re-adding the line here would introduce a card that renders a snippet the
   * moment anyone re-adds the SNIPPET_FIELDS entry, in a different commit.
   */
  const html = card(render('articles', {
    snippet: { label: 'สรุป', text: 'ข้อความบางส่วน' },
  }, 'ข้อความ'));
  assert.equal(html.includes('>สรุป</span>'), false, 'no snippet label on an article card');
  assert.equal(/<span class="italic">/.test(html), false, 'and no snippet body');
});

test('CONTROL: the snippet probe DOES see one on the card that still has it', () => {
  /**
   * Three "no snippet" absences in a row need a positive: the career-path card
   * is the type whose match can be invisible, and it still renders one.
   */
  const html = card(render('careerPaths', {
    snippet: { label: 'หลักสูตรในเส้นทาง', text: 'Tableau for Beginners' },
  }, 'tableau'));
  assert.ok(html.includes('>หลักสูตรในเส้นทาง</span>'), 'the label renders');
  assert.match(html, /<span class="italic">/, 'and the excerpt body');
  assert.match(html, /<mark[^>]*>Tableau<\/mark>/, 'with the term marked inside it');
});

// ── §3 the online card ──────────────────────────────────────────────────────

const O_TEASER = 'เรียนรู้สูตรและ PivotTable ด้วยตนเอง';

test('the online card renders its teaser', () => {
  // It was in the projection and in the matcher the whole time — the card had
  // simply lost the line. See the report.
  const html = card(render('onlineCourses', { snippet: null }));
  assert.equal(teaserParagraphs(html), 1, 'exactly one teaser paragraph');
  assert.equal(count(html, O_TEASER), 1, 'carrying its text');
});

test('the online card has no second call-to-action, only an icon indicator', () => {
  const html = card(render('onlineCourses'));
  assert.equal(
    html.includes('ไปที่ 9Expert Academy'), false,
    'the whole card is the link — a CTA inside it is a second one for the same place',
  );
  assert.match(html, /lucide-external-link/, 'the outbound indicator stays');
  assert.match(html, /class="sr-only"/, 'with a screen-reader equivalent, since the icon is hidden');
  // …and the indicator must NOT be interactive inside the card's own anchor.
  assert.equal((html.match(/<a\s/g) ?? []).length, 1, 'exactly one link');
  assert.equal((html.match(/<button/g) ?? []).length, 0, 'and nothing focusable nested in it');
});

test('the online metadata row is lessons then price, pinned to the bottom', () => {
  const html = card(render('onlineCourses'));
  const row = html.match(/<div class="(mt-auto[^"]*)">([\s\S]*?)<\/div>/);
  assert.ok(row, 'the bottom-anchored metadata row is gone');
  assert.match(row[1], /(^|\s)mt-auto(\s|$)/, 'anchored to the bottom of the text block');
  assert.match(row[1], /justify-between/, 'and justified apart');

  const lessonsAt = row[2].indexOf('12 บทเรียน');
  const priceAt = row[2].indexOf('990');
  assert.notEqual(lessonsAt, -1, 'lessons must render');
  assert.notEqual(priceAt, -1, 'price must render');
  assert.ok(lessonsAt < priceAt, 'lessons on the left, price on the right');
});

test('the bottom row stays anchored even with no teaser', () => {
  // The symptom `mt-auto` exists for: a short card floating its metadata up
  // under the title.
  const html = card(render('onlineCourses', { o_course_teaser: null, snippet: null }));
  assert.match(html, /<div class="mt-auto/, 'still anchored');
  assert.match(html, /flex min-w-0 flex-1 flex-col/, 'and the body is a column so mt-auto works');
});

test('the course card anchors its metadata row too — days LEFT, price RIGHT', () => {
  /**
   * The order reverses the shipped one (price-then-days), so DOM order is the
   * assertion, not mere presence.
   */
  const html = card(render('courses'));
  const row = html.match(/<div class="(mt-auto[^"]*)">([\s\S]*?)<\/div>/);
  assert.ok(row, 'the course card must anchor its metadata row');
  assert.match(row[1], /justify-between/);
  const daysAt = row[2].indexOf('2 วัน');
  const priceAt = row[2].indexOf('9,000');
  assert.notEqual(daysAt, -1, 'days must render');
  assert.notEqual(priceAt, -1, 'price must render');
  assert.ok(daysAt < priceAt, 'days on the left, price on the right');
});

test('CONTROL: mt-auto anchors the three cards with a bottom row, not all five', () => {
  /**
   * Without this, "mt-auto is present" could be a class every card carries,
   * which would say nothing about anchoring. Career paths and promotions have
   * no bottom row — their body is description and tags respectively.
   */
  for (const type of ['courses', 'onlineCourses', 'articles']) {
    assert.match(card(render(type)), /<div class="mt-auto/, `${type} anchors its bottom row`);
  }
  for (const type of ['careerPaths', 'promotions']) {
    assert.equal(
      /<div class="mt-auto/.test(card(render(type))), false,
      `${type} has no bottom-anchored row`,
    );
  }
});
