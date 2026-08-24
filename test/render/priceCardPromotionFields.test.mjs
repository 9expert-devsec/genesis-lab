import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 57, step 1 — `price_card` gains the four promotion fields.
 *
 * docs/promotion-page-coverage.md §B measured both live promotion pages using
 * this card as a promotion price panel rather than the pricing tier it was
 * built as, and put SEVEN of its fourteen field gaps here.
 *
 * ── THE DEFAULT RULE, AND WHY IT IS NOT ROUND 50's ────────────────────────
 * All four are strings defaulting to `''`, and absent renders NOTHING. That is
 * §H's rule for a field that ADDS something no page has ever shown.
 *
 * Round 50's `showPrice` on `course_card` is the OTHER kind: it can REMOVE
 * something every stored card shows, so it defaults ON and is read `!== false`.
 * Copying that shape here would put a stray element on every card in
 * production. A test below pins that the two rules stayed apart.
 *
 * The mechanism that makes absent safe is not new: this renderer already gates
 * `title`, `price`, `period` and the button on `.trim()`, so an absent key and
 * an empty string take the same branch and that branch emits nothing.
 */

const draw = (content) => renderToStaticMarkup(
  createElement(PriceCardSection, { content, style: {}, layout: {} }));

const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

/** A card an author could already have stored, with none of the new keys. */
const STORED = { title: 'แพ็กเกจ', price: '฿12,900', period: '/ คน', features: ['ก', 'ข'] };

const NEW_FIELDS = ['originalPrice', 'discountBadge', 'footnote', 'ribbon'];

// ── ABSENT RENDERS NOTHING ─────────────────────────────────────────────────

test('a card with NONE of the new keys renders exactly what it always did', () => {
  /**
   * The byte-identity claim, at the level this tier can assert it: adding the
   * four keys as empty strings must not change a single byte, because absent
   * and '' take the same branch.
   *
   * The git-level version — HEAD's component pulled out of git and rendered
   * beside the current one over every stored shape — is measured in
   * scripts/_measure-round57-field-additions.mjs and reported with the commit.
   */
  const withoutKeys = draw(STORED);
  const withEmptyKeys = draw({ ...STORED, originalPrice: '', discountBadge: '', footnote: '', ribbon: '' });
  assert.equal(withEmptyKeys, withoutKeys, 'an empty new field changed the render');
});

for (const field of NEW_FIELDS) {
  test(`ABSENT ${field} renders nothing — the case every stored card is in`, () => {
    /**
     * Named per field because this is the case a reviewer would not think to
     * write, and the one that would touch every published card if it were
     * wrong. Every card in the database is in exactly this state right now.
     */
    const absent = draw(STORED);
    const set = draw({ ...STORED, [field]: 'X' });
    assert.notEqual(set, absent, `${field} renders nothing even when set — the field is not wired`);
    assert.ok(!absent.includes('X'), `${field} leaked into the absent render`);
  });
}

test('CONTROL — a truthiness check that treats ABSENT as set would fail these', () => {
  /**
   * The trap, made to fire. `content.originalPrice !== ''` is TRUE for an
   * absent key (undefined !== ''), so a renderer written that way would draw an
   * empty strikethrough on every stored card. This proves the two readings
   * disagree on exactly the input every stored card presents.
   */
  const stored = { ...STORED };
  for (const field of NEW_FIELDS) {
    assert.equal(Object.hasOwn(stored, field), false, `${field} is present in the fixture`);
    assert.equal(stored[field] !== '', true,
      `${field}: the wrong reading does NOT treat absent as set — this control proves nothing`);
    const shipped = typeof stored[field] === 'string' ? stored[field].trim() : '';
    assert.equal(Boolean(shipped), false, `${field}: the shipped reading treated absent as set`);
  }
});

test('whitespace is treated as empty, not as content', () => {
  assert.equal(draw({ ...STORED, originalPrice: '   ', discountBadge: '\t', footnote: ' ', ribbon: '\n' }),
    draw(STORED), 'a whitespace-only field drew something');
});

// ── EACH FIELD DOES ITS OWN JOB ────────────────────────────────────────────

test('originalPrice renders struck through', () => {
  const d = doc(draw({ ...STORED, originalPrice: '40,800 บาท' }));
  const el = [...d.querySelectorAll('span')].find((s) => s.textContent === '40,800 บาท');
  assert.ok(el, 'the original price is not rendered');
  assert.match(el.getAttribute('class') ?? '', /line-through/, 'the original price is not struck through');
});

test('discountBadge renders as its own element', () => {
  const d = doc(draw({ ...STORED, discountBadge: 'ลด 20%' }));
  assert.ok([...d.querySelectorAll('span')].some((s) => s.textContent === 'ลด 20%'),
    'the discount badge is not rendered as its own element');
});

test('E — footnote is a SEPARATE surface from features, with no check glyph', () => {
  /**
   * §B #10's reason for the field existing: `features` draws a Check per row
   * and a VAT line is not something the buyer gets. If the footnote were folded
   * into features it would render with a tick beside it.
   */
  const d = doc(draw({ ...STORED, footnote: '* ราคานี้ยังไม่รวม VAT 7%' }));
  const foot = [...d.querySelectorAll('p')].find((p) => p.textContent === '* ราคานี้ยังไม่รวม VAT 7%');
  assert.ok(foot, 'the footnote is not rendered');
  assert.equal(foot.closest('ul'), null, 'the footnote landed inside the features list');
  assert.equal(foot.querySelector('svg'), null, 'the footnote drew a glyph — it is being treated as a feature');
  // …and the features list is still its own thing, still with glyphs.
  assert.equal(d.querySelectorAll('ul li').length, STORED.features.length);
});

test('D — an empty ribbon changes no LAYOUT, not merely no text', () => {
  /**
   * A corner element that reserved space when empty would fail the
   * byte-identity claim even with no visible text. The conditional class is
   * therefore part of the claim: without a ribbon the card's class attribute
   * must not move at all.
   *
   * ── AMENDED IN ROUND 59, AND THE CLAIM GOT STRONGER ──────────────────────
   * This used to assert the card gains `relative` when a ribbon is set. That
   * token is gone because the ribbon is no longer absolutely positioned (see
   * price_card.jsx and docs/promo-card-style.md §B), so the assertion was
   * describing an implementation that no longer exists.
   *
   * It is replaced by the thing it was a proxy for: the WHOLE class attribute
   * of a ribbon-less card, compared against a card that never had the key. A
   * named token could go stale again; a full-attribute comparison cannot, and
   * it also catches a class added for some unrelated reason.
   */
  const clsOf = (content) => doc(draw(content)).querySelector('div').getAttribute('class') ?? '';
  const { ribbon: _drop, ...noRibbonKey } = STORED;
  assert.equal(clsOf(STORED), clsOf(noRibbonKey),
    'an empty ribbon changed the card class — a stored card without the key would move');
  assert.ok(!/\brelative\b/.test(clsOf(STORED)),
    'the card gained a positioning context with no ribbon — every stored card just changed');
  assert.equal(doc(draw(STORED)).querySelector('[data-pb-ribbon]'), null,
    'an empty ribbon still emitted an element');

  const with_ = doc(draw({ ...STORED, ribbon: 'Early Bird ลด 20%' }));
  const rib = with_.querySelector('[data-pb-ribbon]');
  assert.ok(rib, 'the ribbon is not rendered when set');
  assert.equal(rib.textContent, 'Early Bird ลด 20%');
  assert.match(with_.querySelector('div').getAttribute('class') ?? '', /\boverflow-hidden\b/,
    'a ribbon longer than the card is wide has nothing clipping it to the rounded edge');
});

test('the fail-closed rule is unchanged — new fields alone do not make a card render', () => {
  // The card renders nothing without a title, price or features. A ribbon is
  // not content, so a card carrying only a ribbon must still render nothing.
  assert.equal(draw({ ribbon: 'x', originalPrice: '1', discountBadge: 'y', footnote: 'z' }), '',
    'a card with no title, price or features started rendering');
});

// ── THE SCHEMA ─────────────────────────────────────────────────────────────

test('the schema defaults all four to the empty string', () => {
  const parsed = sectionSchema.parse({
    id: 's1', type: 'price_card', name: '', enabled: true, sortOrder: 0,
    content: { title: 'x' }, settings: {}, layout: {}, style: {}, advanced: {},
  });
  for (const f of NEW_FIELDS) assert.equal(parsed.content[f], '', `${f} does not default to ''`);
});

test('CONTROL — a non-empty default would change every stored card', () => {
  /**
   * Names the alternative that was rejected. If any default were non-empty, a
   * card parsed on its next save would gain a visible element the author never
   * typed — and the render below is what that would look like.
   */
  const asIfDefaulted = draw({ ...STORED, ribbon: 'DEFAULT' });
  assert.notEqual(asIfDefaulted, draw(STORED),
    'a non-empty default renders the same as an empty one — then the default would not matter');
});

// ── THE TWO RULES STAYED APART ─────────────────────────────────────────────

test("round 50's showPrice was NOT harmonised into this round's pattern", () => {
  /**
   * The inversion §H warns about. `showPrice` removes something every card
   * shows, so it must stay `!== false`; these four add something no card shows,
   * so they must stay `.trim()`-gated. Rewriting either to match the other
   * would be a silent behaviour change on a public renderer.
   *
   * course_card's own tests cover what showPrice DOES — this only pins that the
   * two readings did not converge.
   */
  const courseCard = readSource('src/components/pageBuilder/sections/course_card.jsx').code;
  assert.match(courseCard, /content\?\.showPrice\s*!==\s*false/,
    'showPrice stopped reading absent as ON — round 50 built that and this round may not move it');

  const priceCard = readSource('src/components/pageBuilder/sections/price_card.jsx').code;
  assert.ok(!/!==\s*false/.test(priceCard),
    "price_card adopted round 50's remove-shaped reading for an add-shaped field");
  for (const f of NEW_FIELDS) {
    assert.ok(new RegExp(`content\\?\\.${f} === 'string' \\? content\\.${f}\\.trim\\(\\) : ''`).test(priceCard),
      `${f} is not read with the trim guard that makes absent safe`);
  }
});

// ── K: THE CONTROLS ────────────────────────────────────────────────────────

const panel = (content) => renderToStaticMarkup(createElement(SectionContentEditor, {
  type: 'price_card', content, patch: () => {}, resolved: undefined, courses: [],
}));

test('the editor offers one control per field, each with its own label', () => {
  const markup = panel({ title: 'x' });
  for (const [label, hint] of [
    ['ราคาก่อนลด', 'ขีดฆ่าไว้เหนือราคา'],
    ['ป้ายส่วนลด', 'ป้ายเล็กข้างราคาก่อนลด'],
    ['หมายเหตุใต้ราคา', 'ตัวเล็กใต้ราคา'],
    ['ป้ายมุมการ์ด', 'ข้อความแถบเฉียงมุมบนขวา'],
  ]) {
    assert.ok(markup.includes(label), `the ${label} control is missing`);
    assert.ok(markup.includes(hint), `the ${label} control lost its hint`);
  }
});

test('K — every label in this panel wraps exactly one control (round 55)', () => {
  /**
   * Round 55's defect was a `<label>` around a composite: a click anywhere
   * inside forwards to the first labelable descendant. One input per label is
   * the correct use and is what these four are.
   */
  const d = doc(panel({ title: 'x' }));
  const labels = [...d.querySelectorAll('label')];
  assert.ok(labels.length >= 8, `only ${labels.length} labels — the panel did not render`);
  for (const l of labels) {
    const n = l.querySelectorAll('button, input, select, textarea, output, meter, progress').length;
    assert.ok(n <= 1, `a label wraps ${n} controls — a stray click would activate the first`);
  }
});
