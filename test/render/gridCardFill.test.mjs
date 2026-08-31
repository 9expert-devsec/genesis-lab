import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 70 — CARDS IN ONE GRID ROW SHARE ONE HEIGHT.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ─────────────────────────────────────
 * Equal height is a LAYOUT fact and there is no layout here — no CSS is
 * applied, so every rect would be zero. What this tier CAN assert is the thing
 * the browser then acts on: that the chain from the grid item down to the card
 * surface is unbroken, on every card type, and that it is NOT built for
 * anything else.
 *
 * The chain was measured, in headless Chrome, by
 * scripts/_measure-round70-grid-fill.mjs. Four cards of four label lengths in a
 * four-column `card_grid`:
 *
 *   surface heights BEFORE   168 / 204 / 272 / 204   (3 distinct)
 *   surface heights AFTER    308 / 308 / 308 / 308   (1 distinct)
 *
 * and the same instrument run against the pre-change components is the control:
 * strip the fix and all four groups diverge again.
 *
 * ── WHY THE MIDDLE ELEMENT IS THE ONE THAT MATTERS ────────────────────────
 * The grid ITEM was never short — measured at the full 272px of its row, which
 * is why the editor's selection outline looked right while the card did not.
 * The first short link was SectionRenderer's own container <div>. That is why
 * `price_card` carrying `flex h-full flex-col` for rounds fixed nothing:
 * `height:100%` against an auto-height parent computes to `auto`. Both halves
 * are needed, so both halves are asserted, and each has a control that fails if
 * only one is present.
 */

const GRID_TYPES = ['card_grid', 'highlight_grid'];
const NOT_GRID_TYPES = ['two_column', 'container', 'full_width'];

const card = (id, type, content, style = {}) => ({ id, type, enabled: true, content, style });

/** Four labels of four different lengths — the input that produced four heights. */
const LABELS = [
  { title: 'ก' },
  { title: 'กขค', description: 'ง' },
  { title: 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ', description: 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธน' },
  { title: 'กข', description: 'คง' },
];

const iconChildren = () => LABELS.map((l, i) => card(`c${i}`, 'icon_card', { ...l, icon: 'Rocket' }));

const renderSection = (section, resolvedData = null) =>
  renderToStaticMarkup(createElement(SectionRenderer, { section, resolvedData }));

const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

// ── 1. THE CHAIN IS UNBROKEN INSIDE A GRID ─────────────────────────────────

for (const type of GRID_TYPES) {
  test(`${type}: every child's container is told to fill, so the surface can`, () => {
    const d = doc(renderSection(card('g', type, { children: iconChildren() }, {})));
    const sections = [...d.querySelectorAll('section section')];
    assert.equal(sections.length, 4, 'the four children did not render as four sections');

    for (const [i, s] of sections.entries()) {
      const container = s.firstElementChild;
      // Boundary-matched: `h-full` must be its own class, not a substring of one.
      assert.match(container.getAttribute('class') ?? '', /(^|\s)h-full(\s|$)/,
        `child ${i}: SectionRenderer's container <div> does not fill — the link that was short`);
      const surface = container.firstElementChild;
      assert.match(surface.getAttribute('class') ?? '', /(^|\s)h-full(\s|$)/,
        `child ${i}: the card surface does not fill`);
    }
  });
}

test('CONTROL: outside those two layouts the container is NOT told to fill', () => {
  /**
   * The assertion above passes just as well on a blanket `h-full` applied to
   * every section on every page, which is a height nobody asked for. This is
   * what separates the two: every OTHER container in CONTAINER_SLOTS — a
   * `two_column` slot, a `container`, a `full_width` — holds the same
   * icon_card and none of their containers may carry it. (`tabs` and
   * `accordion` are deliberately absent: they nest no sections at all, so
   * naming them here would assert about markup that does not exist.)
   */
  let checked = 0;
  for (const type of NOT_GRID_TYPES) {
    // Each of these nests its children under a different slot name; feed all of
    // them and let the type pick the one it reads.
    const kids = iconChildren();
    const d = doc(renderSection(card('g', type, { children: kids, left: kids, right: [] }, {})));
    const sections = [...d.querySelectorAll('section section')];
    assert.ok(sections.length > 0, `${type} rendered no child sections — the control is vacuous`);
    for (const s of sections) {
      checked += 1;
      assert.equal(/(^|\s)h-full(\s|$)/.test(s.firstElementChild.getAttribute('class') ?? ''), false,
        `${type}: a child outside a shared track was given a full height it did not ask for`);
    }
  }
  assert.ok(checked >= 4, 'the control examined too few sections to mean anything');
});

test('CONTROL: a top-level section is untouched', () => {
  const d = doc(renderSection(card('t', 'icon_card', { icon: 'Rocket', title: 'ก' }, {})));
  const container = d.querySelector('section').firstElementChild;
  assert.equal(/(^|\s)h-full(\s|$)/.test(container.getAttribute('class') ?? ''), false,
    'a section rendered on its own gained a fill');
});

test('CONTROL: the card surface alone would NOT have fixed it', () => {
  /**
   * Rendered on its own, `icon_card` still carries `h-full` — and that is
   * exactly the state `price_card` was already in while still coming out
   * short. So a test that only checked the surface would have passed for
   * rounds against the broken layout. This names that.
   */
  const surface = renderToStaticMarkup(IconCardSection({ content: { icon: 'Rocket', title: 'ก' }, style: {} }));
  assert.match(surface, /(^|\s|")h-full(\s|")/, 'the card surface lost its half of the fix');

  const before = readSource('src/components/pageBuilder/sections/price_card.jsx').code;
  assert.match(before, /(^|\s|')flex h-full flex-col/,
    'price_card no longer carries the h-full that demonstrably did nothing on its own — '
    + 'if that was removed, the control this test rests on is gone');
});

// ── 2. THE FILL RESOLVES AGAINST THE ROW, NOT THE GRID ─────────────────────

test('the fill is NOT put on the <section>, which would size a card to the whole grid', () => {
  /**
   * A percentage height on a GRID ITEM resolves against the grid container, not
   * its row. On a two-row grid that would make every card as tall as both rows
   * plus the gap. Measured after the fix: row 1 came out 308/308/308/308 and
   * row 2 204/204/204/204 — equal WITHIN each row and different BETWEEN them,
   * which is only possible if the section was left alone.
   */
  const d = doc(renderSection(card('g', 'card_grid', { children: iconChildren() }, {})));
  for (const [i, s] of [...d.querySelectorAll('section section')].entries()) {
    assert.equal(/(^|\s)h-full(\s|$)/.test(s.getAttribute('class') ?? ''), false,
      `child ${i}: the <section> itself carries h-full — on a two-row grid every card `
      + 'becomes as tall as both rows together');
  }
});

test('highlight_grid stretches its child through its own box, not through the section', () => {
  // Its per-child box IS the grid item (round 29), so the box is what has to
  // pass the height on. `grid` on a single-child box does that with no class on
  // the child, which this component cannot add.
  const { code } = readSource('src/components/pageBuilder/sections/highlight_grid.jsx');
  const box = /className="([^"]*rounded-9e-lg[^"]*border-l-4[^"]*)"/.exec(code);
  assert.ok(box, 'the per-child box is gone from highlight_grid');
  assert.match(box[1], /(^|\s)grid(\s|$)/,
    'the box no longer stretches its child, so the chain below it is auto-height again');
});

// ── 3. §E — CENTRED IS A FIXED PROPERTY OF THE TYPE ────────────────────────

test('icon_card centres, unconditionally, with no control to turn it off', () => {
  /**
   * §E's decision, recorded as a test so reversing it is deliberate. Centred
   * matches `stat_card` and `instructor_card`, its two nearest neighbours,
   * which both centre with no control either. If a later round wants
   * left-aligned it adds `align` DEFAULTING to 'center' — §H's rule — and this
   * assertion is what it must come through.
   */
  for (const content of [
    { icon: 'Rocket', title: 'ก' },
    { imageSrc: 'https://res.cloudinary.com/x/a.png', title: 'ก' },
    { title: 'ก', description: 'ข', align: 'left' }, // an author cannot opt out
  ]) {
    const markup = renderToStaticMarkup(IconCardSection({ content, style: {} }));
    const cls = (/<div class="([^"]*)"/.exec(markup) ?? [])[1] ?? '';
    assert.match(cls, /(^|\s)text-center(\s|$)/, `${JSON.stringify(content)} did not centre`);
  }
});

test('CONTROL: its two neighbours centre the same way, so this is consistency not novelty', () => {
  for (const rel of ['stat_card', 'instructor_card']) {
    const { code } = readSource(`src/components/pageBuilder/sections/${rel}.jsx`);
    assert.match(code, /(^|[\s'\"])text-center([\s'\"])/,
      `${rel} no longer centres — §E's justification for icon_card rested on it`);
  }
});

// ── 4. §F — THE ICON BRANCH'S BOX AFTER THE RESIZE ─────────────────────────

test('the icon branch and the image branch share ONE box at the new size', () => {
  /**
   * Round 69 sized the image to the Lucide chip so that swapping icon→image
   * could not move a card's height. Round 70 moves the box to 80px and the
   * invariant has to survive the move — so the CHIP grew too. Measured at
   * 80×80 on both branches, card height 240 either way.
   */
  const boxOf = (m) => (/<div class="(mb-3 inline-flex[^"]*)"/.exec(m) ?? [])[1] ?? '';
  const withIcon = boxOf(renderToStaticMarkup(IconCardSection({ content: { icon: 'Rocket', title: 'ก' }, style: {} })));
  const withImage = boxOf(renderToStaticMarkup(IconCardSection({
    content: { imageSrc: 'https://res.cloudinary.com/x/a.png', title: 'ก' }, style: {},
  })));
  const size = (c) => c.split(/\s+/).filter((x) => /^[hw]-\d+$/.test(x)).sort();

  assert.deepEqual(size(withIcon), ['h-20', 'w-20'], 'the icon chip is not the 80px box');
  assert.deepEqual(size(withImage), ['h-20', 'w-20'], 'the image box is not the 80px box');
  assert.deepEqual(size(withIcon), size(withImage),
    'the two branches diverged — swapping icon→image now moves the card height');
});

test('CONTROL: the glyph inside the chip grew with it, and both are stock scale values', () => {
  // A chip that grew while its glyph stayed at 24px would be a box with a speck
  // in it; the assertion above cannot see that, so it is checked here.
  const markup = renderToStaticMarkup(IconCardSection({ content: { icon: 'Rocket', title: 'ก' }, style: {} }));
  const svg = (/<svg[^>]*\sclass="([^"]*)"/.exec(markup) ?? [])[1] ?? '';
  assert.match(svg, /(^|\s)h-10(\s|$)/, 'the glyph did not grow with its chip');
  assert.match(svg, /(^|\s)w-10(\s|$)/, 'the glyph did not grow with its chip');
  // 20 and 10 are on Tailwind's stock spacing scale; 22 (=88px) is not, which is
  // why the box is 80 and not the middle of the design's 80-90 range.
  assert.equal(/(^|\s)[hw]-22(\s|$)/.test(markup), false, 'an off-scale size was minted for the box');
});

test('next/image sizes moved with the box — a stale sizes ships the wrong file', () => {
  const markup = renderToStaticMarkup(IconCardSection({
    content: { imageSrc: 'https://res.cloudinary.com/x/a.png', title: 'ก' }, style: {},
  }));
  const { code } = readSource('src/components/pageBuilder/sections/icon_card.jsx');
  assert.match(code, /sizes="80px"/, 'sizes does not match the 80px box');
  assert.equal(code.includes('sizes="44px"'), false, 'the old 44px sizes is still there');
  assert.match(markup, /<img[\s>]/, 'the image branch stopped rendering, so the check above is vacuous');
});
