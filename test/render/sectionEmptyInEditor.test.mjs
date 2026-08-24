import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';

/**
 * AN EMPTY SECTION SAYS SO IN THE EDITOR AND STILL PUBLISHES NOTHING.
 *
 * ── THE TWO HALVES, AND WHY THEY ARE ONE TEST FILE ────────────────────────
 * heading.jsx returns null for blank text; price_card returns null when title,
 * price and features are all blank; nine more do the same. So a just-added,
 * not-yet-filled section drew a zero-height box the author could not see — and
 * that is INDISTINGUISHABLE from the canvas being broken, which is how it was
 * reported. The editor now marks it.
 *
 * The public page must keep rendering nothing, and that is not a compromise —
 * it is the correct behaviour and the reason the marker had to be conditional
 * rather than unconditional. A half-filled section must not publish a stub.
 *
 * Both halves live here because the ONLY thing separating them is one flag. A
 * file that tested the editor half alone would go green against a marker that
 * also shipped to production, which is the failure that matters most.
 *
 * ── ONE FLAG, NOT TWO ─────────────────────────────────────────────────────
 * The gate is `path != null` — the same fact SectionRenderer already turns into
 * the `inEditor` prop it passes to every component. Not a second flag: a canvas
 * that could be in the editor by one measure and not by another is a bug
 * waiting for the day the two disagree. Asserted below by driving the SAME
 * section through both values of `path` and nothing else.
 */

const EMPTY_HEADING = { id: 'h1', type: 'heading', enabled: true, sortOrder: 0, content: { text: '' } };
const FULL_HEADING = { ...EMPTY_HEADING, content: { text: 'มีข้อความแล้ว' } };
const EMPTY_PRICE = {
  id: 'p1', type: 'price_card', enabled: true, sortOrder: 0,
  content: { title: '', price: '', features: [] },
};

/**
 * What an empty section publishes: the wrapper, the default spacing preset and
 * the default container width, with NOTHING inside. Written out in full rather
 * than matched loosely — a marker leaking to the public path would still
 * satisfy “contains the wrapper”, and this is the one assertion that cannot.
 *
 * Measured against the pre-change renderer and byte-identical to it.
 *
 * ── AMENDED BY ROUND 73, AND WHAT THAT DID NOT CHANGE ────────────────────
 * `px-4` became `px-2 md:px-4`: the section wrapper's side inset is halved
 * below 768px and unchanged from it (docs/mobile-padding.md, round 73). The
 * RULE these two assertions exist for is untouched — no editor marker may
 * reach the public path — and it is still asserted on the EXACT bytes, which
 * is the part with teeth. Only the wrapper's class moved, and it moved for a
 * reason recorded elsewhere; that is why this is an amendment and not a
 * pinned expectation edited to agree with whatever the code now does.
 */
const BARE = '<section class="pt-8 pb-8"><div class="mx-auto px-2 md:px-4 max-w-[1200px]"></div></section>';

const draw = (section, path) => renderToStaticMarkup(
  createElement(SectionRenderer, { section, depth: 0, path })
);

// ── the PUBLIC path renders nothing extra ─────────────────────────────────

test('PUBLIC: an empty heading renders the bare wrapper and no marker', () => {
  // The EXACT bytes, not a substring check: a marker that leaked to the public
  // path would still satisfy "contains the wrapper".
  assert.equal(draw(EMPTY_HEADING, null), BARE);
});

test('PUBLIC: an empty price_card renders the same bare wrapper', () => {
  // A second type, because a marker gated on the section TYPE rather than on the
  // editor flag would pass the heading case and fail here.
  assert.equal(draw(EMPTY_PRICE, null), BARE);
});

test('PUBLIC: nothing in the output names the empty state', () => {
  // The vocabulary check, in the direction that matters. `ว่าง` is the structure
  // tree's word for this fact and it must never reach a published page.
  for (const section of [EMPTY_HEADING, EMPTY_PRICE]) {
    const html = draw(section, null);
    assert.equal(html.includes('data-pb-empty'), false);
    assert.equal(html.includes('ว่าง'), false);
    assert.equal(html.includes('data-pb-path'), false);
  }
});

// ── the EDITOR path marks it ──────────────────────────────────────────────

test('EDITOR: an empty heading is marked, with the tree\'s own wording', () => {
  const html = draw(EMPTY_HEADING, ['sections', 0]);
  assert.equal(html.includes('data-pb-empty'), true);
  assert.equal(html.includes('ว่าง'), true);
  // The structure tree's sentence, verbatim — one vocabulary for one fact.
  assert.equal(html.includes('section นี้ยังว่าง จึงไม่แสดงผลบนหน้าเว็บ'), true);
  // The section's own type label, so two empty siblings are tellable apart.
  assert.equal(html.includes('หัวข้อ'), true);
});

test('EDITOR: the marker is CHROME — it carries no sample content', () => {
  // The constraint that keeps this from being worse than the blank box: nothing
  // an author could mistake for text they wrote or text that will publish. The
  // only words are the badge, the type name and the sentence explaining both.
  const html = draw(EMPTY_HEADING, ['sections', 0]);
  const text = html.replace(/<[^>]*>/g, '').trim();
  assert.equal(text, 'ว่าง หัวข้อ — section นี้ยังว่าง จึงไม่แสดงผลบนหน้าเว็บ');
});

test('EDITOR: a section WITH content gets no marker', () => {
  // Without this the editor half would pass against a marker on every section.
  const html = draw(FULL_HEADING, ['sections', 0]);
  assert.equal(html.includes('มีข้อความแล้ว'), true);
  assert.equal(html.includes('data-pb-empty'), false);
});

// ── the control: swap the branch, both directions go red ──────────────────

test('CONTROL: the ONLY difference between the two renders is the editor flag', () => {
  // Same section object, same renderer, one argument apart. If the marker were
  // gated on anything else — a type list, an env check, a second flag — this
  // would not hold, and the two halves above could both be green while the gate
  // meant something other than "in the editor".
  const publicHtml = draw(EMPTY_HEADING, null);
  const editorHtml = draw(EMPTY_HEADING, ['sections', 0]);
  assert.notEqual(publicHtml, editorHtml);
  assert.equal(publicHtml.includes('data-pb-empty'), false);
  assert.equal(editorHtml.includes('data-pb-empty'), true);
  // Swapping the branch swaps these two answers, so a swap fails BOTH lines
  // above rather than trading one green for another.
});

test('CONTROL: the marker follows sectionRendersEmpty, not a copy of it', () => {
  // The tree's badge and the canvas's marker must agree section for section.
  // Driving both off the same predicate here is what catches a future edit that
  // gives the canvas its own emptiness rule.
  for (const section of [EMPTY_HEADING, EMPTY_PRICE, FULL_HEADING]) {
    const marked = draw(section, ['sections', 0]).includes('data-pb-empty');
    assert.equal(marked, sectionRendersEmpty(section), `${section.type} disagrees with the tree`);
  }
});

test('CONTROL: the predicate is not constant across the fixtures', () => {
  // Otherwise the loop above is satisfied by a predicate that answers the same
  // way every time, in either direction.
  assert.equal(sectionRendersEmpty(EMPTY_HEADING), true);
  assert.equal(sectionRendersEmpty(FULL_HEADING), false);
});
