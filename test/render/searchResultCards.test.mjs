import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SearchClient,
  SearchResults,
} from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts } from '@/lib/search/matchSearch';
import { siteConfig } from '@/config/site';

/**
 * The five result CARDS, and the search box's single clear control.
 *
 * All five moved onto the article card's shape — a cover on the left, a text
 * block on the right — sharing style CONSTANTS rather than a shared component.
 * What each test here checks is per-card: its own cover field, its own fallback
 * icon, its own metadata. The "declared once" half is an fs guard, because a
 * duplicated class string renders identically to a shared one.
 */

const R = (el) => renderToStaticMarkup(el);

const ROWS = {
  courses: {
    _id: 'c1', course_id: 'MSE-PBI', course_name: 'Power BI Desktop',
    course_price: 9000, course_trainingdays: 2, course_cover_url: 'https://res.cloudinary.com/x/course.jpg',
    program: { program_name: 'Data Analytics', programiconurl: null }, snippet: null,
  },
  onlineCourses: {
    _id: 'o1', o_course_id: 'ONL-EXC', o_course_name: 'Excel Essentials Online',
    o_course_cover_url: 'https://res.cloudinary.com/x/online.jpg', o_course_price: 990,
    o_number_lessons: 12, website_urls: ['https://academy.example/excel'], snippet: null,
  },
  careerPaths: {
    _id: 'cp1', title: 'Data Analyst', api_slug: 'data-analyst',
    short_description: 'เส้นทางสายข้อมูล',
    hero_image_url: 'https://upstream.example/hero.jpg', icon_url: null, snippet: null,
  },
  promotions: {
    _id: 'p1', promotion_id: 'PR1', api_slug: 'year-end', title: 'ลดราคาปลายปี',
    thumbnail_url: 'https://upstream.example/promo.jpg',
    start_date: '2026-11-01', end_date: '2026-12-31',
    tags: [{ label: 'ลดราคา', color: '#FF0000' }, { label: 'ใหม่' }], snippet: null,
  },
  articles: {
    _id: 'a1', slug: 'a1', title: 'บทความ', excerpt: 'สรุป',
    coverUrl: 'https://res.cloudinary.com/x/article.jpg', publishedAt: null, snippet: null,
  },
};

const TYPES = Object.keys(ROWS);

/** A ready payload holding exactly one row of one type. */
const oneOf = (type, overrides = {}) => {
  const results = Object.fromEntries(TYPES.map((t) => [t, []]));
  results.schedules = [];
  results[type] = [{ ...ROWS[type], ...overrides }];
  return {
    counts: { ...emptySearchCounts(), [type]: 1 },
    total: 1,
    results,
  };
};

const render = (type, overrides = {}, term = 'zzz') =>
  R(createElement(SearchResults, {
    status: 'ready', term, data: oneOf(type, overrides), requestedTab: 'all',
  }));

/** The one card in the render — every type's card is the outermost <a>. */
const card = (html) => {
  const m = html.match(/<section[\s\S]*?<\/section>/);
  assert.ok(m, 'no result section rendered');
  const a = m[0].match(/<a [\s\S]*?<\/a>/);
  assert.ok(a, 'no card link rendered');
  return a[0];
};

// ── Each card renders its own cover ─────────────────────────────────────────

const COVERS = {
  courses: 'course.jpg',
  onlineCourses: 'online.jpg',
  careerPaths: 'hero.jpg',
  promotions: 'promo.jpg',
  articles: 'article.jpg',
};

test('every card type renders its own cover field', () => {
  for (const [type, file] of Object.entries(COVERS)) {
    const html = card(render(type));
    assert.ok(
      html.includes(file),
      `${type}: the cover from its own field must render (expected ${file})`,
    );
  }
});

const FALLBACK_ICON = {
  courses: 'lucide-graduation-cap',
  onlineCourses: 'lucide-monitor-play',
  careerPaths: 'lucide-map',
  promotions: 'lucide-tag',
  articles: 'lucide-book-open',
};

const CLEAR_COVER = {
  courses: { course_cover_url: null },
  onlineCourses: { o_course_cover_url: null },
  careerPaths: { hero_image_url: null, icon_url: null },
  promotions: { thumbnail_url: null },
  articles: { coverUrl: null },
};

test('every card type has its OWN fallback icon when the cover is absent', () => {
  for (const [type, icon] of Object.entries(FALLBACK_ICON)) {
    const html = card(render(type, CLEAR_COVER[type]));
    assert.ok(html.includes(icon), `${type}: expected the ${icon} fallback`);
    assert.equal(html.includes(COVERS[type]), false, `${type}: no cover should render`);
  }
});

test('CONTROL: the fallback icons are DISTINCT — not one icon for all five', () => {
  /**
   * Without this, a single shared placeholder would satisfy every assertion
   * above, because each `includes` would be matching the same string.
   */
  const icons = Object.values(FALLBACK_ICON);
  assert.equal(new Set(icons).size, icons.length, 'the expectations themselves are distinct');
  // …and each render carries ONLY its own.
  for (const [type, icon] of Object.entries(FALLBACK_ICON)) {
    const html = card(render(type, CLEAR_COVER[type]));
    for (const other of icons.filter((i) => i !== icon)) {
      assert.equal(html.includes(other), false, `${type} must not render ${other}`);
    }
  }
});

test('the career-path cover falls back to icon_url when there is no hero', () => {
  const html = card(render('careerPaths', { hero_image_url: null, icon_url: 'https://x/icon.png' }));
  assert.ok(html.includes('icon.png'));
  assert.equal(html.includes('lucide-map'), false, 'the icon IS a cover — no placeholder');
});

test('NOT CHECKED HERE: next/image vs <img> — the stub erases the difference', () => {
  /**
   * Recorded as a test so the gap is visible rather than merely absent.
   *
   * test/stub-next-image.mjs renders `next/image` as a bare `<img src alt>`,
   * dropping every next-only prop. That is the right stub — this tier has no
   * image optimiser — but it means a next/image cover and a raw <img> cover
   * produce IDENTICAL markup here, so no render assertion can tell them apart.
   *
   * The choice per card is therefore pinned in the fs tier, by source. What
   * this tier CAN still say is that both paths emit a cover at all, which the
   * tests above do.
   */
  const withImage = card(render('courses'));      // <Image> in the source
  const withRawImg = card(render('careerPaths')); // <img> in the source
  assert.match(withImage, /<img /, 'the stub flattens next/image to <img>…');
  assert.match(withRawImg, /<img /, '…which is exactly what the raw one emits');
  assert.equal(
    /_next\/image/.test(withImage), false,
    'and no optimiser markers survive the stub, so they cannot be told apart',
  );
});

// ── The promotion card's square slot ────────────────────────────────────────

test('the promotion cover slot is SQUARE; the others are 16:9', () => {
  /**
   * `thumbnail_url` is rendered `aspect-square` on /promotions and at 80x80 in
   * CoursePromoSection, so the source images are authored square. A 16:9 box
   * with `object-cover` crops ~25% off the top AND bottom — on a promo poster,
   * the headline and the price.
   */
  assert.match(card(render('promotions')), /\baspect-square\b/);
  for (const type of ['courses', 'onlineCourses', 'careerPaths', 'articles']) {
    const html = card(render(type));
    assert.match(html, /\baspect-video\b/, `${type} keeps the 16:9 slot`);
    assert.equal(/\baspect-square\b/.test(html), false, `${type} is not square`);
  }
});

test('every cover SLOT still clips the same way', () => {
  // The ratio is the ONLY thing the promotion card varies.
  for (const type of TYPES) {
    assert.match(card(render(type)), /overflow-hidden/, `${type}: the slot must clip`);
  }
});

test('EVERY cover carries object-cover, next/image ones included', () => {
  /**
   * This used to assert the opposite for the three next/image cards, and the
   * reason was a limitation of the harness rather than of the component:
   * test/stub-next-image.mjs dropped `className` along with the next-only
   * props, so those cards rendered an <img> with no class at all and the claim
   * could only be made in the fs tier, by reading source.
   *
   * The stub now forwards `className` and `style`, which is what next/image
   * itself does. So the claim is checkable HERE, on the emitted tree, for all
   * five — and the fs-tier version of it is no longer the only guard.
   */
  for (const type of TYPES) {
    assert.match(card(render(type)), /object-cover/, `${type}: the image must fill its slot`);
  }
});

test('CONTROL: the cover probe reads the IMAGE, not the slot around it', () => {
  /**
   * `object-cover` anywhere in the card would satisfy the substring search
   * above — including on the wrapper, where it would do nothing at all. This
   * ties the class to the ELEMENT that carries the cover's own src.
   *
   * Located by that src rather than by tag name, deliberately: two of these
   * five are a raw <img> and three are next/image, and pinning the tag would
   * make the control fail the day one of them is switched — which this file
   * already documents as a legitimate change, and is not what is guarded here.
   */
  for (const type of TYPES) {
    const html = card(render(type));
    const at = html.indexOf(COVERS[type]);
    assert.ok(at > -1, `${type}: the cover src is not in the card`);
    const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
    assert.match(tag, /object-cover/,
      `${type}: the class must be on the element carrying the src, not around it`);
  }
});

// ── Per-card metadata stays per-card ────────────────────────────────────────

test('each card renders the metadata that only it has', () => {
  assert.ok(card(render('courses')).includes('2 วัน'), 'course: training days');
  assert.ok(card(render('onlineCourses')).includes('12 บทเรียน'), 'online: lessons');
  assert.ok(card(render('careerPaths')).includes('เส้นทางสายข้อมูล'), 'path: short description');
  assert.ok(card(render('articles')).includes('สรุป'), 'article: excerpt');
});

test('the course card does NOT print the program name', () => {
  /**
   * `program.program_name` stays SEARCHABLE — a query for a program returns
   * every course in it — but the line is gone from the card. The accepted cost,
   * named here so it is a decision rather than an omission: a course matched
   * only on its program shows no on-card reason for being a result.
   */
  const html = card(render('courses'));
  assert.equal(
    html.includes('Data Analytics'), false,
    'the program line must be gone from the card',
  );
  assert.ok(html.includes('MSE-PBI'), 'the code stays…');
  assert.ok(html.includes('Power BI Desktop'), '…and so does the name');
});

test('the course code renders BEFORE the title in DOM order', () => {
  /**
   * SCOPED TO THE TEXT BLOCK, and that is not tidiness. The cover renders
   * `alt="Power BI Desktop"` — the title string, in an ATTRIBUTE, ahead of
   * everything in the body — so a whole-card `indexOf` reports the title first
   * and the assertion fails on correct markup. Another costume for the
   * substring family: a match in an attribute is not a match in the copy.
   */
  const html = card(render('courses'));
  const body = html.slice(html.indexOf('<div class="flex min-w-0'));
  assert.ok(body.length > 100, 'the text block is gone');

  const codeAt = body.indexOf('MSE-PBI');
  const titleAt = body.indexOf('Power BI Desktop');
  assert.notEqual(codeAt, -1, 'the code must render');
  assert.notEqual(titleAt, -1, 'the title must render');
  assert.ok(codeAt < titleAt, 'the code is an identifier — it is read first');
  assert.match(body, /<p class="font-mono[^"]*">MSE-PBI<\/p><h3/, 'a muted line above the heading');
});

test('the coloured tag row is promotion-only', () => {
  const promo = card(render('promotions'));
  assert.match(promo, /background-color:#FF0000/, 'an editor-set colour is used verbatim');
  assert.ok(promo.includes('>ลดราคา</span>'), 'and its label renders');
  assert.match(promo, /bg-gray-100 text-gray-600[^"]*">ใหม่</, 'a colourless tag gets the grey pill');
  assert.ok(promo.includes('1 พ.ย. 69'), 'and the date range label');

  // No other card grew a tag row.
  for (const type of ['courses', 'onlineCourses', 'careerPaths', 'articles']) {
    assert.equal(
      /background-color:#FF0000/.test(card(render(type))), false,
      `${type} must not render promotion tags`,
    );
  }
});

// ── The online card still links out ─────────────────────────────────────────

test('the online card still links outbound', () => {
  const html = card(render('onlineCourses'));
  assert.match(html, /^<a href="https:\/\/academy\.example\/excel"/, 'the feed’s own URL');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /lucide-external-link/, 'and is marked as leaving the site');
});

test('the online card still falls back to the academy root', () => {
  const html = card(render('onlineCourses', { website_urls: [] }));
  assert.ok(html.startsWith(`<a href="${siteConfig.academyUrl}"`), 'fallback href');
  assert.notEqual(siteConfig.academyUrl, 'https://academy.example/excel', 'the two really differ');
});

test('the four internal cards never open a new tab', () => {
  for (const type of ['courses', 'careerPaths', 'promotions', 'articles']) {
    assert.equal(/target="_blank"/.test(card(render(type))), false, `${type} links internally`);
  }
});

// ── The why-it-matched snippet ──────────────────────────────────────────────

test('a non-title match renders a highlighted, labelled snippet', () => {
  // Career paths are one of the two types that still produce a snippet — the
  // match may be a course name INSIDE the path, with nothing else to show it.
  const html = card(render('careerPaths', {
    snippet: { label: 'หลักสูตรในเส้นทาง', text: 'Tableau for Beginners' },
  }, 'tableau'));
  assert.ok(html.includes('>หลักสูตรในเส้นทาง</span>'), 'the field label reads as an excerpt marker');
  assert.match(html, /<mark[^>]*>Tableau<\/mark>/, 'and the term is marked inside it');
  // Matched as `class="italic"`, NOT as the bare word: `highlightText` emits
  // `not-italic` on its <mark>, and "italic" is a substring of "not-italic".
  // The same trap that has already cost a red run in this repo, in CSS form.
  assert.match(html, /<span class="italic">/, 'styled as a quotation, not as the item’s own copy');
});

test('a TITLE match renders no snippet at all', () => {
  const html = card(render('careerPaths', { snippet: null }, 'data'));
  assert.equal(html.includes('หลักสูตรในเส้นทาง'), false, 'no label');
  assert.equal(/<span class="italic">/.test(html), false, 'and no excerpt line');
  assert.match(html, /<mark[^>]*>Data<\/mark>/, 'the title itself is what carries the highlight');
});

test('CONTROL: the snippet probe distinguishes present from absent', () => {
  // Without this, both assertions above would hold against a card that never
  // rendered a snippet.
  const withSnip = card(render('careerPaths', {
    snippet: { label: 'หลักสูตรในเส้นทาง', text: 'Tableau for Beginners' },
  }, 'tableau'));
  assert.ok(withSnip.includes('>หลักสูตรในเส้นทาง</span>'));
  assert.match(withSnip, /<mark[^>]*>Tableau<\/mark>/);
  assert.equal(card(render('careerPaths')).includes('หลักสูตรในเส้นทาง'), false);
});

// ── The search box: one clear control, and not type="search" ────────────────

test('the search input is NOT type="search"', () => {
  /**
   * `type="search"` makes Chrome render its own
   * `::-webkit-search-cancel-button`, so restoring the app's clear button put
   * TWO ✕ in one field. Matched as the exact attribute, because `type="text"`
   * and `type="search"` are both substrings of longer attribute soup.
   */
  const html = R(createElement(SearchClient, { initialQ: 'power bi' }));
  const input = html.match(/<input[^>]*>/)?.[0];
  assert.ok(input, 'the search input is gone');
  assert.equal(/type="search"/.test(input), false, 'the native clear must not be re-enabled');
  assert.match(input, /type="text"/);
});

test('the searchbox ROLE survives the type change', () => {
  // `type="search"` maps to the searchbox role and `type="text"` maps to
  // textbox — without the explicit role the fix would silently downgrade what
  // assistive tech announces.
  const input = R(createElement(SearchClient, { initialQ: 'x' })).match(/<input[^>]*>/)[0];
  assert.match(input, /role="searchbox"/);
  assert.match(input, /aria-label="ค้นหา"/, 'and the label is unchanged');
});

test('exactly ONE clear control renders when the field has a value', () => {
  const html = R(createElement(SearchClient, { initialQ: 'power bi' }));
  assert.equal(
    (html.match(/aria-label="ล้างคำค้นหา"/g) ?? []).length, 1,
    'the app must render its clear button exactly once',
  );
  // The other ✕ was the browser's, which only exists for type="search" — its
  // absence is asserted through the type, above.
  const inputAt = html.indexOf('<input');
  const buttonAt = html.indexOf('aria-label="ล้างคำค้นหา"');
  assert.ok(inputAt < buttonAt, 'Tab must still reach the input first');
});

test('no clear control renders when there is nothing to clear', () => {
  const html = R(createElement(SearchClient, { initialQ: '' }));
  assert.equal((html.match(/aria-label="ล้างคำค้นหา"/g) ?? []).length, 0);
});
