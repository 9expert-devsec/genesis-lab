import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';

/**
 * ── ROUND 59 COMMIT 2: THE FOOTNOTE READ AS A LIST ITEM ───────────────────
 * Round 57 §E gave `footnote` its own surface because `features` draws a check
 * glyph per row and a VAT line is not something the buyer GETS. That half held
 * and is still asserted in priceCardPromotionFields.test.mjs: the footnote is a
 * `<p>`, outside the `<ul>`, with no glyph.
 *
 * What did not hold is the SEPARATION. A small muted line directly above a list
 * of small lines reads as an unglyphed first row, which is the same confusion
 * the separate element was meant to prevent. Separate in the schema is not
 * separate on the page.
 *
 * ── WHAT IS ASSERTED HERE, AND WHAT IS NOT ───────────────────────────────
 * Static markup has no layout, so this cannot measure how the two GROUPS read.
 * It asserts the two structural facts that make the reading possible: the
 * footnote is a sibling BEFORE the list and never inside it, and the list
 * carries a boundary when — and only when — a footnote is above it.
 *
 * ── THE CONTROL ──────────────────────────────────────────────────────────
 * The last test builds the footnote-inside-the-list markup by hand and runs the
 * SAME predicates over it. They must all fail. Without that, a green run here
 * is equally consistent with predicates that match anything.
 */
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const FOOTNOTE = '* ราคาดังกล่าวยังไม่รวม VAT 7%';
const BASE = { title: 'ราคาพิเศษ', price: '15,120 บาท', features: ['เอกสารประกอบการอบรม', 'ใบประกาศนียบัตร'] };

const draw = (content) => renderToStaticMarkup(PriceCardSection({ content, style: {} }));

/**
 * The predicates, as one object so the control can run exactly these and not a
 * paraphrase of them.
 */
const SEPARATED = {
  'the footnote is not inside the features list': (d) => {
    const p = [...d.querySelectorAll('p')].find((n) => n.textContent === FOOTNOTE);
    return Boolean(p) && p.closest('ul') === null;
  },
  /**
   * THE GLYPH IS A SIBLING, NOT A DESCENDANT — and the control is what caught
   * that. Asking `p.querySelector('svg')` looks inside the footnote's own
   * element, but `features` renders the tick as a sibling inside the `<li>`, so
   * that question passes on the very defect it is meant to reject. The row is
   * the nearest `<li>` if there is one, and only the footnote's own element
   * when there is not.
   */
  'no check glyph is drawn in the footnote row': (d) => {
    const p = [...d.querySelectorAll('p')].find((n) => n.textContent === FOOTNOTE);
    if (!p) return false;
    const row = p.closest('li') ?? p;
    return row.querySelector('svg') === null;
  },
  'the footnote comes BEFORE the list, not after it': (d) => {
    const p = [...d.querySelectorAll('p')].find((n) => n.textContent === FOOTNOTE);
    const ul = d.querySelector('ul');
    if (!p || !ul) return false;
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    return (p.compareDocumentPosition(ul) & 4) !== 0;
  },
  'a boundary divides the footnote from the list': (d) => {
    const ul = d.querySelector('ul');
    return Boolean(ul) && /\bborder-t\b/.test(ul.getAttribute('class') ?? '');
  },
};

test('a footnote above features is separated from them in the MARKUP', () => {
  const d = doc(draw({ ...BASE, footnote: FOOTNOTE }));
  for (const [claim, holds] of Object.entries(SEPARATED)) {
    assert.ok(holds(d), `not separated: ${claim}`);
  }
});

test('the boundary uses the card edge TOKEN, never a hand-picked colour', () => {
  const ul = doc(draw({ ...BASE, footnote: FOOTNOTE })).querySelector('ul');
  const cls = ul.getAttribute('class') ?? '';
  assert.match(cls, /border-\[var\(--surface-border\)\]/,
    'the rule is not the same token the card edge uses');
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(cls),
    'a raw hex reached the class attribute — a source colour, which round 30 put out of bounds');
});

test('NO footnote leaves the features list byte-identical — the stored shape', () => {
  /**
   * The boundary is gated on the PAIR. Four of the seven stored price_cards
   * have features and no footnote; their `<ul>` must not move at all, or the
   * commit is not additive for them.
   */
  const withNone = doc(draw(BASE)).querySelector('ul').getAttribute('class');
  assert.equal(withNone, 'mt-4 space-y-2 text-sm',
    'a card with features and no footnote changed its list class');
  const withEmpty = doc(draw({ ...BASE, footnote: '' })).querySelector('ul').getAttribute('class');
  assert.equal(withEmpty, withNone, 'an EMPTY footnote drew a boundary');
  const withBlank = doc(draw({ ...BASE, footnote: '   ' })).querySelector('ul').getAttribute('class');
  assert.equal(withBlank, withNone, 'a whitespace footnote drew a boundary');
});

test('a footnote with NO features draws no dangling boundary', () => {
  const d = doc(draw({ title: 'ราคาพิเศษ', price: '15,120 บาท', footnote: FOOTNOTE }));
  assert.equal(d.querySelector('ul'), null, 'a list appeared with no features');
  const p = [...d.querySelectorAll('p')].find((n) => n.textContent === FOOTNOTE);
  assert.ok(p, 'the footnote is not rendered');
  assert.ok(!/\bborder-t\b/.test(p.getAttribute('class') ?? ''),
    'the footnote grew a rule with nothing below it to separate from');
});

test('CONTROL — the same predicates FAIL when the footnote is inside the list', () => {
  /**
   * The defect this commit is about, built by hand: the footnote moved into the
   * `<ul>` as a row, glyph and all, with no boundary. Every predicate above
   * must reject it — and they must reject it for DIFFERENT reasons, which is
   * why they are listed rather than combined.
   */
  const inside = doc(
    '<div class="flex h-full flex-col rounded-9e-lg p-6">'
    + '<ul class="mt-4 space-y-2 text-sm">'
    + '<li class="flex items-start gap-2"><svg></svg><p>' + FOOTNOTE + '</p></li>'
    + '<li class="flex items-start gap-2"><svg></svg><span>เอกสารประกอบการอบรม</span></li>'
    + '</ul></div>',
  );
  const survived = Object.entries(SEPARATED).filter(([, holds]) => holds(inside)).map(([c]) => c);
  assert.deepEqual(survived, [],
    `these predicates passed on the DEFECT, so they do not discriminate: ${survived.join('; ')}`);
});
