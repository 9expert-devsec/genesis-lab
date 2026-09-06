import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PromotionBundleSection } from '@/components/pageBuilder/sections/promotion_bundle';
import { isBundleRegistrationOpen } from '@/lib/pageBuilder/bundleRegistration';
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';
import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { newSection } from '@/lib/pageBuilder/newSection';

/**
 * `promotion_bundle`, commit 1: the section's OWN panel — name, blurb, the two
 * prices, the discount code, and the open/closed switch. The item cards and the
 * derived percentage arrive in later commits and are not asserted here.
 *
 * ── EVERY CLAIM HAS A CONTROL, AND WHY SOME ARE SHAPED ODDLY ──────────────
 * The standing rule is that a new test ships something proving it can go red.
 * Where the claim is "X renders", the control is the same probe over content
 * that must NOT produce X — discrimination, not existence. Where the claim is
 * about a DISTINCTION (null vs 0, open vs closed), the control asserts the two
 * sides genuinely differ, because an equality that compared two identical
 * renders would pass while the feature did nothing.
 */

/**
 * `pageId`/`sectionId` default to the PAIR, because the bundle-level affordance
 * is now a register link keyed on it — a render without the pair draws no
 * button (correctly: that is the editor canvas, which threads neither). Tests
 * that are about the pair itself pass their own.
 */
const doc = (content, style, ref = { pageId: 'p1', sectionId: 'sec-1' }) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(PromotionBundleSection, { content, style, ...ref }),
    )}</body>`,
  ).window.document;

const q = (content, sel) => doc(content).querySelector(sel);
const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

const FULL = {
  name: 'Bundle 1',
  blurb: 'เรียนครบชุดในราคาสุดคุ้ม',
  listPrice: 40800,
  netPrice: 32640,
  discountCode: 'EXP1',
};

// ── the panel draws what was authored ──────────────────────────────────────

test('a fully authored bundle draws its name, blurb, both prices and its code', () => {
  const d = doc(FULL);
  assert.equal(text(d.querySelector('h3')), 'Bundle 1');
  assert.equal(text(d.querySelector('p')), 'เรียนครบชุดในราคาสุดคุ้ม');
  assert.match(text(d.querySelector('[data-testid="bundle-net-price"]')), /32,640/);
  assert.match(text(d.querySelector('[data-testid="bundle-list-price"]')), /40,800/);
  assert.equal(text(d.querySelector('[data-testid="bundle-code"]')), 'EXP1');
});

test('CONTROL: the same probes find NOTHING when the fields are absent', () => {
  // Discrimination for every selector above, over a section that is authored
  // (so it renders at all) but carries none of those fields.
  const d = doc({ items: [{ id: 'i1', courseId: 'MSE-L1' }] });
  assert.equal(d.querySelector('h3'), null);
  assert.equal(d.querySelector('[data-testid="bundle-net-price"]'), null);
  assert.equal(d.querySelector('[data-testid="bundle-list-price"]'), null);
  assert.equal(d.querySelector('[data-testid="bundle-code"]'), null);
  // …and the wrapper IS there, so the nulls above are the fields being absent
  // rather than the whole section having failed closed.
  assert.notEqual(d.querySelector('[data-pb-bundle]'), null);
});

// ── the short label: the pill, and the course-list heading ────────────────
//
// `label` is a SECOND name field, not a slice of `name`: the pill reads
// "Bundle 1" while the headline reads the long sentence, and neither is
// derivable from the other. It is also not derived from the section's POSITION
// — reordering a page must not rename its bundles.

const ITEM = { id: 'i1', courseId: 'MSE-L1' };

test('an authored label draws the pill, above the headline', () => {
  const d = doc({ ...FULL, label: 'Bundle 1' });
  const pill = d.querySelector('[data-testid="bundle-label"]');
  assert.equal(text(pill), 'Bundle 1');

  // ABOVE the headline, not merely present. compareDocumentPosition is the
  // structural claim; asserting only that both exist would pass with the pill
  // rendered underneath, or inside, the <h3>.
  const h3 = d.querySelector('h3');
  assert.notEqual(h3, null);
  assert.ok(
    pill.compareDocumentPosition(h3) & 4, // DOCUMENT_POSITION_FOLLOWING
    'the pill is not before the headline',
  );
});

test('an ABSENT label draws no pill — not an empty one', () => {
  /**
   * The distinction that matters: `querySelector` returning null, not a pill
   * whose text happens to be ''. An empty pill is a dark rectangle on the page
   * with nothing in it, which is the failure this asserts against.
   */
  for (const content of [FULL, { ...FULL, label: '' }, { ...FULL, label: '   ' }]) {
    assert.equal(
      doc(content).querySelector('[data-testid="bundle-label"]'),
      null,
      `a pill was drawn for label ${JSON.stringify(content.label)}`,
    );
  }
  // …and a non-string cannot smuggle one in either.
  assert.equal(doc({ ...FULL, label: 7 }).querySelector('[data-testid="bundle-label"]'), null);
});

test('CONTROL: the pill probe finds one when a label IS set', () => {
  // Without this, the four nulls above would pass on a component that never
  // renders a pill at all.
  assert.notEqual(
    doc({ ...FULL, label: 'Bundle 1' }).querySelector('[data-testid="bundle-label"]'),
    null,
  );
});

test('the course-list heading carries the label, and the count', () => {
  const d = doc({ ...FULL, label: 'Bundle 1', items: [ITEM, { id: 'i2', courseId: 'PBI-L1' }] });
  assert.equal(
    text(d.querySelector('[data-testid="bundle-items-heading"]')),
    'หลักสูตรที่ร่วมรายการ Bundle 1 (2 คอร์ส)',
  );
});

test('without a label the heading drops the label AND its space', () => {
  /**
   * `หลักสูตรที่ร่วมรายการ (2 คอร์ส)` — one space before the bracket, not two.
   * A stand-in word was rejected: inventing a name the author declined to type
   * is the opposite of "absent renders nothing".
   *
   * Asserted on the RAW textContent rather than the whitespace-collapsed
   * helper, because collapsing is exactly what would hide a double space.
   */
  const d = doc({ ...FULL, items: [ITEM, { id: 'i2', courseId: 'PBI-L1' }] });
  const raw = d.querySelector('[data-testid="bundle-items-heading"]').textContent;
  assert.equal(raw, 'หลักสูตรที่ร่วมรายการ (2 คอร์ส)');
  assert.equal(raw.includes('  '), false, 'the label left its space behind');
});

test('CONTROL: the two heading forms genuinely differ', () => {
  // An equality that compared two identical strings would pass while the
  // interpolation did nothing.
  const withLabel = doc({ ...FULL, label: 'Bundle 1', items: [ITEM] })
    .querySelector('[data-testid="bundle-items-heading"]').textContent;
  const without = doc({ ...FULL, items: [ITEM] })
    .querySelector('[data-testid="bundle-items-heading"]').textContent;
  assert.notEqual(withLabel, without);
  assert.ok(withLabel.includes('Bundle 1'));
  assert.equal(without.includes('Bundle 1'), false);
});

test('the heading counts what the DOCUMENT holds, and is absent with no items', () => {
  // One item, one คอร์ส — the count is items.length, so an unresolvable course
  // still counts and the heading agrees with the cards beneath it.
  assert.equal(
    text(doc({ ...FULL, items: [ITEM] }).querySelector('[data-testid="bundle-items-heading"]')),
    'หลักสูตรที่ร่วมรายการ (1 คอร์ส)',
  );
  // No items → no heading. A heading over nothing is the empty-block failure
  // this repo keeps fixing in other sections.
  assert.equal(doc(FULL).querySelector('[data-testid="bundle-items-heading"]'), null);
  assert.equal(doc({ ...FULL, label: 'Bundle 1' }).querySelector('[data-testid="bundle-items-heading"]'), null);
});

test('the label reaches NEITHER the quotation link NOR any other surface', () => {
  /**
   * It is display only. The registration document carries `name` (through
   * buildBundleTag's four explicit fields) and the confirmation email carries
   * `bundleName` — both enumerate their fields, so a new content key cannot
   * ride along. What this file CAN check is the section's own output: the
   * register link is keyed on (pageId, sectionId) and must not gain the label.
   */
  const d = doc({ ...FULL, label: 'Bundle 1', items: [ITEM] });
  const href = d.querySelector('[data-testid="bundle-register"]').getAttribute('href');
  assert.equal(href.includes('Bundle'), false, 'the label leaked into the quotation link');
  assert.equal(href, '/registration/bundle?page=p1&section=sec-1');
});

// ── the fail-closed guard, and its mirror ─────────────────────────────────

test('nothing authored at all renders NOTHING', () => {
  assert.equal(doc({}).querySelector('[data-pb-bundle]'), null);
  assert.equal(doc({ items: [] }).querySelector('[data-pb-bundle]'), null);
  // A freshly minted section is exactly this state — so adding one to a page
  // draws nothing on the public site until the author types something.
  assert.equal(doc(newSection('promotion_bundle').content).querySelector('[data-pb-bundle]'), null);
});

test('CONTROL: any ONE authored field is enough to make it draw', () => {
  /**
   * The guard is an AND over six fields, so a control that flipped only one of
   * them would leave five untested. Each is perturbed alone, from the same
   * empty base.
   */
  const cases = [
    ['name', { name: 'B' }],
    ['blurb', { blurb: 'x' }],
    ['discountCode', { discountCode: 'EXP1' }],
    ['listPrice', { listPrice: 1 }],
    ['netPrice', { netPrice: 1 }],
    ['items', { items: [{ id: 'i1', courseId: 'MSE-L1' }] }],
  ];
  for (const [field, content] of cases) {
    assert.notEqual(
      doc(content).querySelector('[data-pb-bundle]'),
      null,
      `${field} alone no longer makes the bundle render — the guard is now wider than the ` +
        'sectionRendersEmpty case that mirrors it',
    );
  }
});

test('sectionRendersEmpty MIRRORS the component guard, case for case', () => {
  /**
   * `sectionRendersEmpty` is a second reader of the component's own null guard
   * and its header says so: if the two disagree the structure tree marks a
   * section that draws, or fails to mark one that does not. This drives BOTH
   * over the same inputs rather than asserting each separately.
   */
  const drew = (content) => doc(content).querySelector('[data-pb-bundle]') !== null;
  const inputs = [
    {},
    { items: [] },
    { name: 'B' },
    { blurb: 'x' },
    { discountCode: 'EXP1' },
    { listPrice: 0 },
    { netPrice: 0 },
    { items: [{ id: 'i1', courseId: 'MSE-L1' }] },
    /**
     * ADDED with `label`, into the EXISTING mirror rather than beside it. The
     * label is deliberately NOT one of the six authored fields, so a bundle
     * carrying only a label must be empty to BOTH readers — otherwise the page
     * draws a lone dark pill and the tree says the section is blank, or the
     * reverse. This row is the one that would go red if either side adopted it.
     */
    { label: 'Bundle 1' },
    { label: 'Bundle 1', name: 'B' },
    FULL,
  ];
  for (const content of inputs) {
    assert.equal(
      sectionRendersEmpty({ type: 'promotion_bundle', content }),
      !drew(content),
      `the two readers disagree about ${JSON.stringify(content)}`,
    );
  }
});

test('CONTROL: the mirror check can fail — a different type answers differently', () => {
  // Without this, "the two agree" could be two functions that both answer the
  // same constant. `course_card` with no courseId is empty; the bundle fixture
  // with the same content is not.
  assert.equal(sectionRendersEmpty({ type: 'course_card', content: {} }), true);
  assert.equal(sectionRendersEmpty({ type: 'promotion_bundle', content: { name: 'B' } }), false);
  assert.notEqual(
    sectionRendersEmpty({ type: 'course_card', content: {} }),
    sectionRendersEmpty({ type: 'promotion_bundle', content: { name: 'B' } }),
  );
});

// ── null is not zero, all the way to the screen ───────────────────────────

test('a price of 0 RENDERS; an unset price renders no element at all', () => {
  /**
   * The distinction the schema keeps (`null` = not set, `0` = free) has to
   * survive to the markup or it is bookkeeping. A truthiness check anywhere on
   * this path would delete a zero price from the page.
   */
  assert.match(text(q({ netPrice: 0 }, '[data-testid="bundle-net-price"]')), /0/);
  assert.equal(q({ netPrice: null, name: 'B' }, '[data-testid="bundle-net-price"]'), null);
  assert.equal(q({ name: 'B' }, '[data-testid="bundle-net-price"]'), null);
  // The whole price paragraph goes when BOTH are unset, rather than an empty
  // <p> being left behind.
  assert.equal(q({ name: 'B' }, '[data-testid="bundle-prices"]'), null);
});

test('CONTROL: the zero and the unset renders genuinely differ', () => {
  // If both produced the same markup, the assertions above would be comparing a
  // constant to itself.
  const zero = renderToStaticMarkup(createElement(PromotionBundleSection, { content: { name: 'B', netPrice: 0 } }));
  const unset = renderToStaticMarkup(createElement(PromotionBundleSection, { content: { name: 'B', netPrice: null } }));
  assert.notEqual(zero, unset);
  assert.equal(unset.includes('bundle-net-price'), false);
});

// ── the open/closed switch ────────────────────────────────────────────────

test('OPEN (the absent default) draws the register button and the code', () => {
  /**
   * ── WHAT THIS ASSERTED BEFORE, AND WHY IT CHANGED ────────────────────────
   * It asserted the code and the COPY BUTTON. The copy button is gone: the
   * bundle-level affordance is now a link into the quotation form, and
   * `CopyCodeButton` had no callers left and was deleted with it.
   *
   * The CODE stays, as selectable text — `content.discountCode` is a schema
   * field and a field with no reader is what this repo keeps removing.
   */
  for (const content of [FULL, { ...FULL, registrationOpen: true }]) {
    const d = doc(content);
    assert.notEqual(d.querySelector('[data-testid="bundle-register"]'), null);
    assert.notEqual(d.querySelector('[data-testid="bundle-code"]'), null);
    assert.equal(d.querySelector('[data-testid="bundle-closed"]'), null);
  }
});

test('the register button reads สมัคร Bundle นี้', () => {
  /**
   * Pinned because nothing pinned it before, and it is the one string on this
   * section a visitor acts on. It says สมัคร while the flow it starts is still
   * a QUOTATION request — the confirmation mail opens
   * "เราได้รับคำขอใบเสนอราคาสำหรับ …" — so the two describe one act in two
   * registers, deliberately, and a future round changing either should have to
   * change this line and notice the other.
   */
  assert.equal(
    text(doc(FULL).querySelector('[data-testid="bundle-register"]')),
    'สมัคร Bundle นี้',
  );
  // The wording it REPLACED, gone from the render — not merely the new string
  // present somewhere alongside the old.
  assert.equal(
    doc(FULL).body.textContent.includes('ขอใบเสนอราคาแพ็กเกจนี้'),
    false,
    'the old quotation wording is still on the page',
  );
});

test('CONTROL: the label probe reads the button, not a constant', () => {
  // The assertion above would pass on a reader that returned the expected
  // string regardless. A render with no button must produce null, and the
  // closed state must produce something ELSE.
  assert.equal(
    doc(FULL, undefined, {}).querySelector('[data-testid="bundle-register"]'),
    null,
    'a button rendered without the pair',
  );
  const closed = doc({ ...FULL, registrationOpen: false });
  assert.equal(closed.querySelector('[data-testid="bundle-register"]'), null);
  assert.equal(
    closed.body.textContent.includes('สมัคร Bundle นี้'),
    false,
    'the closed bundle still offers the button label',
  );
});

// ── the two-column panel ──────────────────────────────────────────────────
//
// Geometry belongs to the browser tier and is measured there. What a render
// test CAN hold is the STRUCTURE the geometry depends on: which block each
// thing lives in, and the DOM order that decides the stacked reading order.

test('the offer is in the left column and the courses in the right', () => {
  const d = doc({ ...FULL, label: 'Bundle 1', items: [ITEM] });
  const left = d.querySelector('[data-testid="bundle-left"]');
  const right = d.querySelector('[data-testid="bundle-right"]');
  assert.notEqual(left, null, 'there is no left column');
  assert.notEqual(right, null, 'there is no right column');

  // Each surface in the column that owns it — asserted by containment, not by
  // presence anywhere on the panel.
  for (const sel of [
    '[data-testid="bundle-label"]',
    '[data-testid="bundle-discount"]',
    '[data-testid="bundle-prices"]',
    '[data-testid="bundle-vat-note"]',
    '[data-testid="bundle-register"]',
  ]) {
    assert.notEqual(left.querySelector(sel), null, `${sel} is not in the left column`);
    assert.equal(right.querySelector(sel), null, `${sel} leaked into the right column`);
  }
  for (const sel of ['[data-testid="bundle-items-heading"]', '[data-testid="bundle-items"]']) {
    assert.notEqual(right.querySelector(sel), null, `${sel} is not in the right column`);
    assert.equal(left.querySelector(sel), null, `${sel} is still in the left column`);
  }
});

test('the LEFT column comes first in the DOM — which is the stacked order', () => {
  /**
   * Below the two-column breakpoint the grid collapses to one column and the
   * DOM order becomes the reading order. The price and the button must reach a
   * phone BEFORE the course list, which is also how the desktop layout reads,
   * so there is no reordering rule to keep in step — the source order is it.
   */
  const d = doc({ ...FULL, items: [ITEM] });
  const left = d.querySelector('[data-testid="bundle-left"]');
  const right = d.querySelector('[data-testid="bundle-right"]');
  assert.ok(
    left.compareDocumentPosition(right) & 4, // DOCUMENT_POSITION_FOLLOWING
    'the course column precedes the offer column — a phone would meet the cards first',
  );
});

test('CONTROL: the containment probe can fail — the panel holds both columns', () => {
  // Without this, every `right.querySelector(...) === null` above would pass on
  // a render where the right column were empty, or absent entirely.
  const d = doc({ ...FULL, items: [ITEM] });
  const panel = d.querySelector('[data-pb-bundle]');
  assert.notEqual(panel.querySelector('[data-testid="bundle-items"]'), null);
  assert.notEqual(panel.querySelector('[data-testid="bundle-register"]'), null);
  // …and the two columns are siblings under the panel, not nested one inside
  // the other, which would make every containment assertion above vacuous.
  const left = d.querySelector('[data-testid="bundle-left"]');
  const right = d.querySelector('[data-testid="bundle-right"]');
  assert.equal(left.contains(right), false, 'the right column is inside the left');
  assert.equal(right.contains(left), false, 'the left column is inside the right');
});

test('the price block is three lines: ราคาปกติ, the net price, the VAT note', () => {
  const d = doc({ ...FULL, items: [ITEM] });
  const prices = d.querySelector('[data-testid="bundle-prices"]');
  assert.match(text(prices), /ราคาปกติ/);
  assert.match(text(prices), /40,800/);
  assert.match(text(prices), /32,640/);
  assert.match(text(prices), /บาท/);
  assert.equal(
    text(d.querySelector('[data-testid="bundle-vat-note"]')),
    '* ราคาดังกล่าวยังไม่รวม VAT 7%',
  );
  // The list price is struck through — the whole point of showing it.
  assert.notEqual(d.querySelector('[data-testid="bundle-list-price"]'), null);
});

test('CONTROL: the VAT note goes with the price block, not the panel', () => {
  // An unpriced bundle must not print a footnote about a price it does not
  // state — which is what a note rendered outside the block would do.
  const d = doc({ name: 'B', items: [ITEM] });
  assert.equal(d.querySelector('[data-testid="bundle-prices"]'), null);
  assert.equal(d.querySelector('[data-testid="bundle-vat-note"]'), null);
});

test('the register link carries the PAIR, not the section id alone', () => {
  /**
   * `duplicatePageBuilderPage` keeps section ids by design, so two bundles on a
   * duplicated promotion page share one. A link carrying only the section id
   * could not say which page the quotation came from.
   */
  const href = doc(FULL).querySelector('[data-testid="bundle-register"]').getAttribute('href');
  assert.match(href, /[?&]page=p1(&|$)/, 'the link does not carry the page id');
  assert.match(href, /[?&]section=sec-1(&|$)/, 'the link does not carry the section id');
  assert.ok(href.startsWith('/registration/bundle?'), `unexpected target: ${href}`);
});

test('NO pageId, NO button — the editor canvas draws the code and nothing to click', () => {
  /**
   * The canvas renders SectionRenderer directly and threads no page id. A link
   * missing half its key is worse than no link: it would resolve to a different
   * bundle on a duplicated page, or to nothing. And the canvas previews a page
   * that may not be published, which the form would refuse anyway.
   */
  const d = doc(FULL, undefined, {});
  assert.equal(d.querySelector('[data-testid="bundle-register"]'), null);
  // The code is still drawn, so this is the BUTTON being withheld rather than
  // the whole offer block failing closed.
  assert.notEqual(d.querySelector('[data-testid="bundle-code"]'), null);
});

test('CONTROL: half a pair is still no button', () => {
  for (const ref of [{ pageId: 'p1' }, { sectionId: 'sec-1' }, { pageId: '', sectionId: 'sec-1' }]) {
    assert.equal(
      doc(FULL, undefined, ref).querySelector('[data-testid="bundle-register"]'),
      null,
      `a button was drawn from ${JSON.stringify(ref)}`,
    );
  }
  // …and the complete pair DOES draw one, so the nulls above discriminate.
  assert.notEqual(doc(FULL).querySelector('[data-testid="bundle-register"]'), null);
});

test('CLOSED replaces both with a state message, and the section stays visible', () => {
  const d = doc({ ...FULL, registrationOpen: false });
  // Visible — hiding it would read as a broken page to anyone holding a link.
  assert.notEqual(d.querySelector('[data-pb-bundle]'), null);
  assert.equal(text(d.querySelector('h3')), 'Bundle 1');
  assert.match(text(d.querySelector('[data-testid="bundle-net-price"]')), /32,640/);

  assert.notEqual(d.querySelector('[data-testid="bundle-closed"]'), null);
  // The code goes WITH the button: a displayed code is an invitation to use it,
  // and a closed bundle's code will not be honoured. The register link goes for
  // the more direct reason that a closed bundle must not be registerable.
  assert.equal(d.querySelector('[data-testid="bundle-code"]'), null);
  assert.equal(d.querySelector('[data-testid="bundle-register"]'), null);
});

test('the closed state is BUTTON-SHAPED and inert, in the live button’s box', () => {
  /**
   * It was a left-aligned <p> in a bordered box, which read as an error notice
   * rather than as the button's disabled twin. It now matches the live button's
   * box exactly and differs only in surface and cursor.
   *
   * The box classes are compared AGAINST THE LIVE BUTTON rather than asserted
   * as literals, so the two cannot drift: change the button's padding and this
   * goes red until the closed state follows.
   */
  const live = doc(FULL).querySelector('[data-testid="bundle-register"]');
  const closed = doc({ ...FULL, registrationOpen: false })
    .querySelector('[data-testid="bundle-closed"]');
  assert.notEqual(closed, null);

  for (const shape of ['w-full', 'rounded-9e-md', 'px-4', 'py-3', 'text-sm', 'font-bold',
                       'inline-flex', 'items-center', 'justify-center']) {
    assert.ok(live.getAttribute('class').includes(shape), `the LIVE button lost ${shape}`);
    assert.ok(closed.getAttribute('class').includes(shape), `the closed state lost ${shape}`);
  }
});

test('the closed state is not a control, and takes no tab stop', () => {
  /**
   * NOT a <button disabled> — a control that exists to do nothing is a promise
   * the page cannot keep, and a reader announces it as a dimmed button, raising
   * "how do I enable it". NOT an <a> without an href — a placeholder anchor
   * with no role, which is the dead stop this asserts against.
   *
   * A <span> has no implicit role and no tab stop. The check is structural: the
   * element's tag, and the absence of every attribute or tag that would make it
   * focusable.
   */
  const closed = doc({ ...FULL, registrationOpen: false })
    .querySelector('[data-testid="bundle-closed"]');

  assert.equal(closed.tagName, 'SPAN', `the closed state is a <${closed.tagName.toLowerCase()}>`);
  assert.equal(closed.hasAttribute('href'), false, 'it is a link');
  assert.equal(closed.hasAttribute('tabindex'), false, 'it was given a tab stop');
  assert.equal(closed.hasAttribute('disabled'), false, 'a <span> cannot be disabled — wrong element');
  assert.equal(closed.getAttribute('aria-disabled'), 'true');

  // Nothing focusable ANYWHERE inside it either — a nested link or button would
  // reintroduce the dead stop through the back door.
  assert.equal(
    closed.querySelectorAll('a, button, input, select, textarea, [tabindex]').length,
    0,
    'the closed state contains a focusable descendant',
  );
});

test('CONTROL: the focusability probe fires on the shapes it forbids', () => {
  /**
   * Without this, every negative above would pass on an element the probe
   * simply failed to find. The same three checks are run against elements that
   * SHOULD trip them — including the live register button, which is a real
   * <a href> and must look focusable to this probe.
   */
  const live = doc(FULL).querySelector('[data-testid="bundle-register"]');
  assert.equal(live.tagName, 'A', 'the live button is not an anchor — the contrast is gone');
  assert.equal(live.hasAttribute('href'), true);

  /**
   * The panel needs an ITEM for this half: with the bundle closed, the register
   * button and the code chip both go, and a bundle with no items has nothing
   * focusable left — the selector would find zero and prove nothing. A card
   * carries a real course link, which is what the probe must be able to see.
   */
  const d = doc({ ...FULL, registrationOpen: false, items: [ITEM] });
  const wrapper = d.querySelector('[data-pb-bundle]');
  assert.ok(
    wrapper.querySelectorAll('a, button, input, select, textarea, [tabindex]').length > 0,
    'the selector finds nothing anywhere on the panel — it cannot discriminate',
  );
  // …and the closed element is still not one of them, on that same render.
  assert.equal(
    wrapper
      .querySelector('[data-testid="bundle-closed"]')
      .querySelectorAll('a, button, input, select, textarea, [tabindex]').length,
    0,
  );
});

test('CONTROL: only a literal false closes it — every other value leaves it open', () => {
  /**
   * `!== false`, not truthiness. A `.lean()` read applies no Mongoose defaults
   * and JSON drops `undefined`, so this key can arrive ABSENT — and absent must
   * mean OPEN, or a switch nobody touched would close every stored bundle.
   */
  for (const v of [undefined, true]) {
    assert.notEqual(
      doc({ ...FULL, registrationOpen: v }).querySelector('[data-testid="bundle-register"]'),
      null,
      `registrationOpen: ${String(v)} closed the bundle`,
    );
  }
  assert.equal(
    doc({ ...FULL, registrationOpen: false }).querySelector('[data-testid="bundle-register"]'),
    null,
  );
});

test('the RENDERER and the FORM read the same open/closed predicate', () => {
  /**
   * Asserted behaviourally over a grid of stored values rather than by reading
   * an import: whatever removes the bundle-level affordance from the page must
   * be exactly what `isBundleRegistrationOpen` refuses, or a bundle showing the
   * closed message stays registerable through a stale link — the one failure
   * the round brief names outright.
   *
   * The odd values are the point. `0`, `''` and `null` are not things an author
   * can type, but a bad write could store one, and a truthiness check on either
   * side would silently retire a live promotion for each of them.
   */
  const stored = [undefined, true, false, null, 0, '', 'false', 1, {}];
  for (const v of stored) {
    const drewAffordance =
      doc({ ...FULL, registrationOpen: v }).querySelector('[data-testid="bundle-register"]') !== null;
    assert.equal(
      drewAffordance,
      isBundleRegistrationOpen({ ...FULL, registrationOpen: v }),
      `the page and the predicate disagree about registrationOpen: ${JSON.stringify(v)}`,
    );
  }
  // CONTROL: the grid contains BOTH answers, so the loop above is not comparing
  // two constant trues.
  assert.equal(stored.some((v) => isBundleRegistrationOpen({ registrationOpen: v })), true);
  assert.equal(stored.some((v) => !isBundleRegistrationOpen({ registrationOpen: v })), true);
});

// ── the schema's own claims ───────────────────────────────────────────────

test('the schema keeps null and 0 apart, and refuses a price that is not an integer', () => {
  const parse = (content) => sectionSchema.safeParse({ id: 's1', type: 'promotion_bundle', content });

  assert.equal(parse({}).data.content.listPrice, null, 'an unset price must parse to null, not 0');
  assert.equal(parse({ listPrice: 0 }).data.content.listPrice, 0);

  // NOT coerced from a string, deliberately: a coercion here would silently
  // accept an editor that forgot to parse its own input, and the bug would
  // surface later as a wrong percentage rather than at the save that caused it.
  assert.equal(parse({ listPrice: '12900' }).success, false);
  assert.equal(parse({ listPrice: 12900.5 }).success, false);
  assert.equal(parse({ listPrice: -1 }).success, false);
});

test('CONTROL: the refusals above are about the VALUE, not a schema that rejects everything', () => {
  const parse = (content) => sectionSchema.safeParse({ id: 's1', type: 'promotion_bundle', content });
  assert.equal(parse({ listPrice: 40800, netPrice: 32640 }).success, true);
  assert.equal(parse({}).success, true);
});

test('an item REQUIRES an id — that is what lets the editor key its rows by identity', () => {
  /**
   * ItemList's index keys are safe only for rows with no local state, and a
   * bundle row holds CourseSelectPicker, which has some. So items carry an id
   * and the schema is what guarantees one is present rather than the component
   * hoping for it.
   */
  const parse = (items) =>
    sectionSchema.safeParse({ id: 's1', type: 'promotion_bundle', content: { items } });

  assert.equal(parse([{ courseId: 'MSE-L1' }]).success, false, 'an item without an id was accepted');
  assert.equal(parse([{ id: '', courseId: 'MSE-L1' }]).success, false, 'an empty id was accepted');
  assert.equal(parse([{ id: 'i1', courseId: 'MSE-L1' }]).success, true);
});

test("a round snapshot may carry ONLY {id, dates, type} — status and signup_url are stripped", () => {
  /**
   * The prohibition roundSnapshotShape makes executable, re-asserted at THIS
   * type's boundary because reuse is not the same as coverage: if a later round
   * gave bundle items their own snapshot shape, the strip could be lost here
   * while course_schedule's stayed green.
   *
   * A stored `status` is the seats-left signal and cannot be true about a round
   * nobody can fetch; a stored `signup_url` is a link to a round that is not
   * there.
   */
  const parsed = sectionSchema.parse({
    id: 's1',
    type: 'promotion_bundle',
    content: {
      items: [{
        id: 'i1',
        courseId: 'MSE-L1',
        roundId: 'r1',
        roundSnapshot: {
          id: 'r1',
          dates: ['2026-08-20'],
          type: 'classroom',
          status: 'เปิดรับ',
          signup_url: 'https://example.test/x',
        },
      }],
    },
  });
  const snap = parsed.content.items[0].roundSnapshot;
  assert.deepEqual(Object.keys(snap).sort(), ['dates', 'id', 'type']);
  assert.equal('status' in snap, false);
  assert.equal('signup_url' in snap, false);
});

test('CONTROL: the strip check would see a key that survived', () => {
  // The same probe over an object that DOES keep its extra keys — otherwise
  // "status is absent" could be a test of an object that was never built.
  const passthrough = { id: 'r1', dates: [], type: '', status: 'เปิดรับ' };
  assert.equal('status' in passthrough, true);
  assert.notDeepEqual(Object.keys(passthrough).sort(), ['dates', 'id', 'type']);
});

// ── the derived discount chip (commit 5) ──────────────────────────────────

test('the discount chip is DERIVED from the two prices, and matches a hand-checked pair', () => {
  // 40,800 → 32,640 is the real pair from the promotion page the survey read;
  // 32640/40800 = 0.8, so 20%.
  const d = doc({ ...FULL });
  assert.equal(text(d.querySelector('[data-testid="bundle-discount"]')), 'ลด 20%');
});

test('no chip when there is nothing honest to show', () => {
  const chip = (content) => doc({ name: 'B', ...content }).querySelector('[data-testid="bundle-discount"]');
  assert.equal(chip({ netPrice: 32640 }), null, 'unset list price');
  assert.equal(chip({ listPrice: 40800 }), null, 'unset net price');
  assert.equal(chip({ listPrice: 0, netPrice: 0 }), null, 'a zero list price');
  assert.equal(chip({ listPrice: 10000, netPrice: 10000 }), null, '0% advertises nothing');
  // The one that matters most: no `ลด -8%` on a pair the editor is warning
  // about and publishBlockers is refusing.
  assert.equal(chip({ listPrice: 10000, netPrice: 12000 }), null, 'a negative discount was drawn');
});

test('CONTROL: the chip probe does find one when the pair supports it', () => {
  // Otherwise every null above would be satisfied by a renderer that never
  // draws a chip at all.
  assert.notEqual(doc({ name: 'B', listPrice: 100, netPrice: 90 }).querySelector('[data-testid="bundle-discount"]'), null);
  assert.equal(text(doc({ name: 'B', listPrice: 100, netPrice: 90 }).querySelector('[data-testid="bundle-discount"]')), 'ลด 10%');
});

test('the percentage is not stored — it is absent from the parsed content', () => {
  /**
   * The two prices are what must match a real quotation; the percentage is
   * display. A stored copy would be a third number able to drift from the two
   * it describes, with nothing to notice.
   */
  const parsed = sectionSchema.parse({
    id: 's1', type: 'promotion_bundle',
    content: { listPrice: 40800, netPrice: 32640, discountPercent: 99 },
  });
  assert.equal('discountPercent' in parsed.content, true,
    'passthrough keeps unknown keys — so this asserts the RENDERER ignores it, below');
  // The renderer computes its own answer and never reads a stored one: a
  // planted 99 does not reach the page.
  const d = doc({ listPrice: 40800, netPrice: 32640, discountPercent: 99, name: 'B' });
  assert.equal(text(d.querySelector('[data-testid="bundle-discount"]')), 'ลด 20%');
});
