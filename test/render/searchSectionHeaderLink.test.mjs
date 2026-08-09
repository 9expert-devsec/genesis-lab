import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchResults } from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts } from '@/lib/search/matchSearch';
import { SEARCH_TABS } from '@/lib/search/searchTabs';

/**
 * `ดูทั้งหมด` LIVES IN THE SECTION HEADER.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * It rendered under the results grid, so WHERE it appeared was a function of how
 * many rows that section happened to have — six courses put it ~300px lower than
 * four promotions did. A control whose position depends on the content above it
 * is one the eye has to hunt for in every section. It now sits at the right-hand
 * end of the header row, opposite the title, always in the same place.
 *
 * It also lost its count: `ดูทั้งหมด (18) →` beside a badge reading `18` printed
 * the same number twice within a few centimetres.
 *
 * ── WHAT THIS FILE CANNOT SEE ───────────────────────────────────────────────
 * The DESTINATION. The control is a `<button>` calling `onTabChange(key)`, not
 * an anchor, so there is no href in the markup and no click in this tier. The
 * wiring — that the handler passed down is the section's own key — is pinned in
 * test/fs/searchResultCardStyling. What is asserted here is the markup: where it
 * renders, how often, what it says, and what it announces.
 */

const R = (el) => renderToStaticMarkup(el);

const mk = {
  courses: (i) => ({
    _id: `c${i}`, course_id: `C${i}`, course_name: `Course ${i}`,
    course_price: 1000, course_trainingdays: 1, course_teaser: 'teaser', snippet: null,
  }),
  onlineCourses: (i) => ({
    _id: `o${i}`, o_course_id: `O${i}`, o_course_name: `Online ${i}`,
    o_course_teaser: 'teaser', o_course_price: 990, o_number_lessons: 3,
    website_urls: ['https://academy.example/x'], snippet: null,
  }),
  careerPaths: (i) => ({
    _id: `cp${i}`, title: `Path ${i}`, api_slug: `path-${i}`,
    short_description: 'desc', snippet: null,
  }),
  schedules: (i) => ({
    _id: `s${i}`, dates: ['2026-10-17'], type: 'classroom', status: 'open',
    course_ref: { _id: 'c1', course_id: 'MSE-PBI', course_name: 'Power BI', course_price: 9000 },
  }),
  promotions: (i) => ({
    _id: `p${i}`, promotion_id: `P${i}`, api_slug: `promo-${i}`, title: `Promo ${i}`,
    thumbnail_url: null, tags: [], snippet: null,
  }),
  articles: (i) => ({
    _id: `a${i}`, slug: `a${i}`, title: `Article ${i}`, excerpt: 'e',
    coverUrl: null, tags: [], snippet: null,
  }),
};

/**
 * How many rows the `ทั้งหมด` tab shows per section before it truncates. Copied
 * from SECTIONS deliberately rather than imported — SECTIONS is not exported,
 * and a test that read the same constant the component reads could not tell a
 * changed preview from a correct one. The boundary tests below are what would go
 * red if one of these moved, which is the review moment they exist to force.
 */
const PREVIEW = {
  courses: 6, onlineCourses: 4, careerPaths: 4, schedules: 4, promotions: 4, articles: 6,
};
const TYPES = Object.keys(PREVIEW);

/**
 * The heading each section renders. Written out rather than imported for the
 * same reason as PREVIEW: SECTIONS is not exported, and a test reading the
 * component's own constant could not tell a renamed title from a correct one.
 *
 * `schedules` is `ตารางอบรม` — shortened from `ตารางอบรมที่กำลังเปิดรับสมัคร`,
 * which was 237px of unbreakable Thai and overflowed the 360px header row on its
 * own. The short name IS A SUBSTRING of the long one, so every assertion about
 * it below is an equality; `includes` would pass against the un-renamed title.
 */
const TITLE = {
  courses: 'หลักสูตร',
  onlineCourses: 'คอร์สออนไลน์',
  careerPaths: 'Career Path',
  schedules: 'ตารางอบรม',
  promotions: 'โปรโมชัน',
  articles: 'บทความ',
};

const render = (counts, requestedTab = 'all') => {
  const results = Object.fromEntries(
    TYPES.map((t) => [t, Array.from({ length: counts[t] ?? 0 }, (_, i) => mk[t](i))]),
  );
  const full = { ...emptySearchCounts(), ...counts };
  const total = Object.values(full).reduce((a, b) => a + b, 0);
  return R(createElement(SearchResults, {
    status: 'ready', term: 'zzz', data: { counts: full, results, total }, requestedTab,
  }));
};

/** Every rendered section, keyed by its Thai title. */
const sections = (html) => {
  const out = {};
  for (const m of html.matchAll(/<section[^>]*aria-label="ผลการค้นหา: ([^"]*)"([\s\S]*?)<\/section>/g)) {
    out[m[1]] = m[2];
  }
  assert.ok(Object.keys(out).length > 0, 'no section rendered — this file has lost its subject');
  return out;
};

/**
 * A section split at the end of its header row.
 *
 * DEPENDS ON THE HEADER CONTAINING NO NESTED `<div>` — it is an svg, an h2, a
 * span and a button, so the first `</div>` really does close it. If a wrapper is
 * ever added inside, this returns a truncated header and every "…is in the
 * header" assertion would start reading half a row, so it asserts its own shape
 * rather than trusting it.
 */
const split = (sectionHtml) => {
  const open = '<div class="mb-4 flex items-center gap-2">';
  const at = sectionHtml.indexOf(open);
  assert.notEqual(at, -1, 'the header row is gone');
  const end = sectionHtml.indexOf('</div>', at);
  assert.notEqual(end, -1, 'the header row never closes');
  const header = sectionHtml.slice(at, end + 6);
  assert.match(header, /<h2 [^>]*>/, 'the slice is not a header — it has no title');
  assert.equal(
    header.includes('grid-cols-1'), false,
    'the header slice swallowed the results grid — a nested <div> was added',
  );
  return { header, below: sectionHtml.slice(at + header.length) };
};

/** The `ดูทั้งหมด` control, or null. Matched by its accessible name. */
const seeAll = (scope) => {
  const m = scope.match(/<button type="button" aria-label="([^"]*)"[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/);
  return m ? { label: m[1], classes: m[2], inner: m[3] } : null;
};

/** Visible text only — tags dropped, so an attribute can never satisfy a copy check. */
const textOf = (htmlFragment) => htmlFragment.replace(/<[^>]*>/g, '');

// ── Where it renders ────────────────────────────────────────────────────────

test('every section that truncates renders ดูทั้งหมด, in its header row', () => {
  /**
   * All six sections, driven one over their own preview cap. Answering "which
   * sections have one" by ENUMERATION rather than by testing บทความ and assuming
   * — the caps differ (6/4/4/4/4/6) and nothing else asserts they are all wired.
   */
  const html = render(Object.fromEntries(TYPES.map((t) => [t, PREVIEW[t] + 1])));
  const byTitle = sections(html);
  assert.equal(Object.keys(byTitle).length, 6, 'all six sections must render');

  for (const type of TYPES) {
    const { header, below } = split(byTitle[TITLE[type]]);
    const link = seeAll(header);
    assert.ok(link, `${type}: no ดูทั้งหมด in the header row`);
    assert.equal(
      seeAll(below), null,
      `${type}: a second copy still renders below the grid`,
    );
  }
});

test('nothing resembling the old control survives below the grid', () => {
  /**
   * The other half of "it moved": the header now has one, and the area under the
   * results has none. Matched on the LABEL rather than on `<button>`, because a
   * section's rows can legitimately contain controls of their own and the claim
   * is about this one.
   *
   * `ทั้งหมด` is a substring of `ดูทั้งหมด` — the tab row's own label is the
   * shorter string — so the probe uses the longer one and is scoped inside the
   * section, where the tab row cannot reach it.
   */
  const html = render(Object.fromEntries(TYPES.map((t) => [t, PREVIEW[t] + 1])));
  for (const [title, body] of Object.entries(sections(html))) {
    const { below } = split(body);
    assert.equal(below.includes('ดูทั้งหมด'), false, `${title}: the label is still below the grid`);
    assert.equal(below.includes('mt-4'), false, `${title}: the old spacing is still there`);
  }
});

test('CONTROL: the below-the-grid probe DOES fire on the shape this replaced', () => {
  /**
   * Two absences in a row. Run the same two matchers against the markup the old
   * placement produced, so the absence cannot be one that is simply unfindable.
   */
  const old = '<div class="grid grid-cols-1 gap-3 md:grid-cols-2"></div>'
    + '<button type="button" class="mt-4 text-sm font-semibold text-[#2486FF] hover:underline">'
    + 'ดูทั้งหมด (8) →</button>';
  assert.ok(old.includes('ดูทั้งหมด'), 'the probe sees the old label');
  assert.ok(old.includes('mt-4'), 'and the old spacing');
  // …and `split` really is returning a non-empty region below the header.
  const html = render({ courses: 8 });
  const { below } = split(sections(html)['หลักสูตร']);
  assert.ok(below.includes('grid-cols-1'), 'the below-the-header slice contains the results grid');
  assert.ok(below.length > 200, 'and is not an empty string');
});

test('it renders exactly once per section', () => {
  const html = render({ courses: 8, promotions: 6 });
  for (const title of ['หลักสูตร', 'โปรโมชัน']) {
    const body = sections(html)[title];
    assert.equal(
      (body.match(/aria-label="ดูทั้งหมด/g) ?? []).length, 1,
      `${title}: expected one control`,
    );
  }
});

// ── When it renders, and when it does not ───────────────────────────────────

test('a section the ทั้งหมด tab is NOT truncating has no link', () => {
  // บทความ previews 6 and there are 2, so nothing is being hidden and an
  // invitation to see "all" of them would be pointing at the same rows.
  const html = render({ courses: 8, articles: 2 });
  assert.ok(seeAll(split(sections(html)['หลักสูตร']).header), 'the truncated section has one');
  assert.equal(
    seeAll(split(sections(html)['บทความ']).header), null,
    'the untruncated one must not',
  );
});

test('the boundary is EXACTLY the preview cap, per section', () => {
  /**
   * At the cap the grid already shows every row, so `count > visible.length` is
   * false and no link renders; one over, it does. Asserted per section because
   * the caps differ — courses and articles preview 6, the other four preview 4,
   * and a single shared number would have hidden that.
   */
  for (const type of TYPES) {
    const atCap = render({ [type]: PREVIEW[type] });
    assert.equal(
      seeAll(split(sections(atCap)[TITLE[type]]).header), null,
      `${type}: at ${PREVIEW[type]} rows nothing is hidden, so nothing may invite`,
    );
    const overCap = render({ [type]: PREVIEW[type] + 1 });
    assert.ok(
      seeAll(split(sections(overCap)[TITLE[type]]).header),
      `${type}: at ${PREVIEW[type] + 1} rows the link must appear`,
    );
  }
});

test('no link on a section tab, where nothing is truncated any more', () => {
  // On `หลักสูตร` the section renders all 8 rows, so the control would send the
  // reader to the view they are already looking at.
  const html = render({ courses: 8, articles: 7 }, 'courses');
  const byTitle = sections(html);
  assert.deepEqual(Object.keys(byTitle), ['หลักสูตร'], 'only the active tab renders');
  assert.equal(seeAll(split(byTitle['หลักสูตร']).header), null);
});

// ── What it says ────────────────────────────────────────────────────────────

test('the visible label carries no count — the badge is the count', () => {
  /**
   * Checked on the TEXT, with tags stripped, because the class attribute carries
   * `text-sm` and `gap-2`-style digits that a raw `/\d/` over the element would
   * match happily. A match in an attribute is not a match in the copy.
   */
  const html = render({ courses: 8, promotions: 6 });
  for (const title of ['หลักสูตร', 'โปรโมชัน']) {
    const link = seeAll(split(sections(html)[title]).header);
    const text = textOf(link.inner);
    assert.equal(/\d/.test(text), false, `${title}: the label still prints a number: "${text}"`);
    assert.equal(/[()]/.test(text), false, `${title}: and still brackets it`);
    assert.equal(text.trim(), 'ดูทั้งหมด', `${title}: unexpected label "${text}"`);
  }
});

test('CONTROL: the count probe DOES fire on the label it replaced', () => {
  // Without this, "no digits in the label" is satisfied by an extractor that
  // returns '' — which is exactly what a slightly wrong tag-strip produces.
  const before = textOf('<span class="hidden sm:inline">ดูทั้งหมด (8) </span>→');
  assert.ok(/\d/.test(before), 'the probe sees the count that used to be there');
  assert.ok(/[()]/.test(before), 'and the brackets around it');
  // …and it does NOT see digits that live only in the class attribute.
  assert.equal(
    /\d/.test(textOf('<span class="hidden sm:inline text-sm gap-2">ดูทั้งหมด </span>→')), false,
    'a digit in an attribute must not read as a digit in the copy',
  );
});

test('the badge still carries the count, so nothing was lost', () => {
  // Dropping the number from the link is only defensible while the header still
  // prints it once. Compared as a whole text node: `8` is a substring of `18`.
  const html = render({ courses: 18 });
  const { header } = split(sections(html)['หลักสูตร']);
  // Matched on the PILL's own shape, not on `shrink-0` — the layout guard below
  // owns that class, and a badge that lost it should fail there with the right
  // message rather than here with "the count badge is gone".
  const badge = header.match(/<span class="[^"]*rounded-full px-2 py-0\.5 text-xs font-bold[^"]*">([^<]*)<\/span>/);
  assert.ok(badge, 'the count badge is gone');
  assert.equal(badge[1], '18', 'and it must be the real count, exactly');
});

// ── What it announces ───────────────────────────────────────────────────────

test('the accessible name identifies which section the link belongs to', () => {
  /**
   * Below `sm` the visible content is a bare `→`. `aria-label` is unconditional
   * and overrides the content, so what is announced is the same at both widths
   * and is never a lone arrow. Compared for EQUALITY, not containment: a
   * truncated name is a substring of the correct one.
   */
  const html = render(Object.fromEntries(TYPES.map((t) => [t, PREVIEW[t] + 1])));
  for (const type of TYPES) {
    const link = seeAll(split(sections(html)[TITLE[type]]).header);
    assert.equal(
      link.label, `ดูทั้งหมด: ${TITLE[type]}`,
      `${type}: the announced name must name the section`,
    );
  }
  // The six names really are distinct — otherwise "it names the section" would
  // hold while every link announced the same thing.
  const labels = TYPES.map((t) => seeAll(split(sections(html)[TITLE[t]]).header).label);
  assert.equal(new Set(labels).size, 6, 'six sections, six distinct names');
});

// ── The label is unconditional, and there is no arrow ───────────────────────

test('the words render at every width — no responsive branch on the label', () => {
  /**
   * They were briefly `hidden sm:inline`, leaving a bare `→` on a phone, which
   * reads as decoration at the end of a heading rather than as a control.
   *
   * The probe is the ABSENCE of a visibility branch anywhere inside the button,
   * not the presence of the words: a `hidden` on a wrapper the words happen not
   * to be in today would still be a branch waiting to be reintroduced. Anchored
   * with `(^|\s)…(\s|$)` because `hidden` is a substring of `sm:hidden`,
   * `md:hidden` and `lg:hidden`, and `inline` of `sm:inline` and `inline-flex`.
   */
  const html = render({ courses: 8, promotions: 6 });
  for (const title of ['หลักสูตร', 'โปรโมชัน']) {
    const link = seeAll(split(sections(html)[title]).header);
    for (const attr of [link.classes, link.inner]) {
      assert.equal(
        /(^|\s|")(hidden|(sm|md|lg|xl|2xl):(hidden|inline|inline-block|block|flex))(\s|$|")/.test(attr),
        false,
        `${title}: the label must not branch on viewport width: "${attr}"`,
      );
    }
    assert.equal(
      link.inner.includes('<span'), false,
      `${title}: the wrapper the branch used to live on is gone too`,
    );
  }
});

test('the link is the words alone — no arrow glyph', () => {
  /**
   * The arrow was compensating for a label that was sometimes absent. With the
   * words always there it is a second affordance for the same thing, and the
   * only glyph in the row that means nothing on its own.
   *
   * Checked on the TEXT with tags stripped, since an arrow in an attribute is
   * not an arrow in the copy.
   */
  const html = render({ courses: 8, promotions: 6, careerPaths: 5 });
  for (const title of ['หลักสูตร', 'โปรโมชัน', 'Career Path']) {
    const link = seeAll(split(sections(html)[title]).header);
    const text = textOf(link.inner).trim();
    assert.equal(text, 'ดูทั้งหมด', `${title}: unexpected label "${text}"`);
    for (const glyph of ['→', '›', '»', '>', '⟶']) {
      assert.equal(text.includes(glyph), false, `${title}: "${glyph}" is still in the label`);
    }
  }
});

test('CONTROL: both probes DO fire on the shape they replaced', () => {
  /**
   * `hidden sm:inline` plus a trailing arrow, run through the same two matchers.
   * Without this, "no visibility branch" and "no arrow" are both satisfiable by
   * matchers that see nothing at all.
   */
  const before = '<span class="hidden sm:inline">ดูทั้งหมด </span>→';
  const branch = /(^|\s|")(hidden|(sm|md|lg|xl|2xl):(hidden|inline|inline-block|block|flex))(\s|$|")/;
  assert.ok(branch.test('hidden sm:inline'), 'the branch probe sees the class pair it forbids');
  assert.ok(branch.test(before), 'and sees it through the wrapper markup');
  assert.equal(branch.test(''), false, 'and does not fire on nothing');
  assert.ok(textOf(before).includes('→'), 'the arrow probe sees the arrow that was there');
  assert.equal(textOf(before).trim(), 'ดูทั้งหมด →', 'the old label, for the record');

  // …and the two forms are distinguishable: `inline-flex` on the BADGE must not
  // read as a visibility branch on the link.
  assert.equal(branch.test('ml-auto shrink-0 text-sm font-semibold'), false, 'the shipped classes are clean');
  assert.ok(branch.test('ml-auto lg:hidden'), 'while a real branch is caught');
});

// ── The 360px row ───────────────────────────────────────────────────────────

test('the schedule section is ตารางอบรม, exactly', () => {
  /**
   * The old name was 237px of unbreakable Thai at `text-lg` — the header row
   * came to 361px against a 328px content box — and Thai has no word boundaries,
   * so the truncation it forced would have cut mid-word on every phone.
   *
   * EQUALITY, not `includes`: `ตารางอบรม` is a prefix of
   * `ตารางอบรมที่กำลังเปิดรับสมัคร`, so a containment check passes unchanged
   * against the title being replaced. Asserted at the heading AND at the
   * section's accessible name, which is built from the same string.
   */
  const html = render({ schedules: 5 });
  const heading = sections(html)['ตารางอบรม'];
  assert.ok(heading !== undefined, 'no section is labelled ตารางอบรม');
  assert.equal(
    Object.keys(sections(html)).includes('ตารางอบรมที่กำลังเปิดรับสมัคร'), false,
    'the old name must not still be in the aria-label',
  );
  const h2 = split(heading).header.match(/<h2 class="[^"]*">([^<]*)<\/h2>/);
  assert.equal(h2[1], 'ตารางอบรม', 'the heading text, exactly');
});

test('every heading agrees with its own tab label', () => {
  /**
   * The rename ends a disagreement rather than merely shortening a string: the
   * tab has been called `ตารางอบรม` all along, so the page had two names for one
   * thing a few centimetres apart. Asserted for ALL SIX, because a guard that
   * only checked the one that was wrong would not notice the next one.
   *
   * Read from SEARCH_TABS, which is the tab row's real source; TITLE above is
   * this file's independent transcription of the headings, so the two sides of
   * the comparison do not come from the same place.
   */
  const byKey = Object.fromEntries(SEARCH_TABS.map((t) => [t.key, t.label]));
  for (const type of TYPES) {
    assert.equal(byKey[type], TITLE[type], `${type}: the tab and the heading disagree`);
  }
  // …and the headings really are what this file claims, live.
  const html = render(Object.fromEntries(TYPES.map((t) => [t, 1])));
  for (const type of TYPES) {
    const h2 = split(sections(html)[TITLE[type]]).header.match(/<h2 class="[^"]*">([^<]*)<\/h2>/);
    assert.equal(h2[1], byKey[type], `${type}: the rendered heading is not the tab label`);
  }
});

test('CONTROL: the title probe rejects the name it replaced', () => {
  // The substring trap, asserted rather than trusted — this is the one the brief
  // added for this round.
  assert.ok(
    'ตารางอบรมที่กำลังเปิดรับสมัคร'.startsWith('ตารางอบรม'),
    'the short name really is a prefix of the long one…',
  );
  assert.notEqual('ตารางอบรมที่กำลังเปิดรับสมัคร', 'ตารางอบรม', '…so only equality separates them');
  assert.ok('ตารางอบรมที่กำลังเปิดรับสมัคร'.includes('ตารางอบรม'), 'and includes() would not');
  // The same relationship one level down: ทั้งหมด inside ดูทั้งหมด.
  assert.ok('ดูทั้งหมด'.includes('ทั้งหมด'), 'the tab label sits inside the link label');
  assert.notEqual('ดูทั้งหมด', 'ทั้งหมด', 'which is why the link was not shortened to it');
});

test('the title is the only thing that yields when the row runs out of room', () => {
  /**
   * The BACKSTOP, not the fix. Every section now clears the 328px content box by
   * ~100px (Career Path is widest at 225px), so nothing truncates today —
   * `min-w-0 truncate` is what makes a future long title clip instead of
   * overflowing the row.
   *
   * `min-w-0` is the load-bearing half and `truncate` is useless without it: a
   * flex item will not shrink below its min-content width, and for spaceless
   * Thai the min-content width IS the whole title. Everything else on the row is
   * `shrink-0`, so what gives is the title and never the controls.
   */
  const html = render({ schedules: 5 });
  const { header } = split(sections(html)['ตารางอบรม']);

  const h2 = header.match(/<h2 class="([^"]*)">([^<]*)<\/h2>/);
  assert.ok(h2, 'the title is gone');
  assert.match(h2[1], /(^|\s)min-w-0(\s|$)/, 'without min-w-0 the title cannot shrink at all');
  assert.match(h2[1], /(^|\s)truncate(\s|$)/, 'and without truncate it overflows instead of clipping');
  assert.equal(h2[2], 'ตารางอบรม', 'the full title is in the DOM, unclipped');

  const icon = header.match(/<svg[^>]*class="([^"]*)"/);
  assert.match(icon[1], /(^|\s)shrink-0(\s|$)/, 'the icon must not squash');
  const badge = header.match(/<span class="([^"]*rounded-full px-2 py-0\.5 text-xs font-bold[^"]*)"/);
  assert.ok(badge, 'the badge is gone — this guard has lost one of its three subjects');
  assert.match(badge[1], /(^|\s)shrink-0(\s|$)/, 'nor the badge');
  const link = seeAll(header);
  assert.match(link.classes, /(^|\s)shrink-0(\s|$)/, 'nor the link');
  assert.match(link.classes, /(^|\s)ml-auto(\s|$)/, 'which is pushed to the far end of the row');
});

test('CONTROL: the shrink probes DO fire on a row that would collapse', () => {
  // Without this, "everything is shrink-0" could be satisfied by a matcher that
  // finds nothing — and the failure it guards is invisible until 360px.
  assert.equal(/(^|\s)shrink-0(\s|$)/.test('h-5 w-5 text-[#005CFF]'), false, 'a bare icon has none');
  assert.ok(/(^|\s)shrink-0(\s|$)/.test('h-5 w-5 shrink-0 text-[#005CFF]'));
  assert.equal(/(^|\s)min-w-0(\s|$)/.test('truncate text-lg font-bold'), false, 'truncate alone is not enough');
  // …and the live header really does carry them, so the probes have a subject.
  const { header } = split(sections(render({ courses: 8 }))['หลักสูตร']);
  assert.equal((header.match(/shrink-0/g) ?? []).length, 3, 'icon, badge and link');
});
