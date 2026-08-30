import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';

/**
 * ── ROUND 59 COMMIT 1: THE RIBBON WAS TRUNCATING AUTHOR TEXT ──────────────
 * docs/promo-card-style.md §B, and the measurement that replaced round 58 §A3's
 * guess: scripts/_probe-round59-ribbon-window.mjs.
 *
 * WHAT WAS ACTUALLY WRONG. Round 57's ribbon was a 144px-wide (`w-36`) box,
 * absolutely positioned at `-right-10 top-4` and turned 45°, inside a card
 * carrying `overflow-hidden`. Only about 85px of that box can ever lie inside
 * the corner, so both ends were clipped — and the characters lost measured
 * IDENTICAL at card widths 320 / 445 / 640:
 *
 *     chars in ribbon   3   10   17   32
 *     chars lost        0    0    1   13     (same at every width)
 *
 * So it was not "the card is too small". A fixed-width box was laid across a
 * fixed-length corner chord, and any ribbon past ~16 characters was silently
 * eaten on every card. `ribbon` is a free author string with no length cap, so
 * that is a control quietly discarding what the author typed.
 *
 * ── WHAT THIS FILE CAN AND CANNOT ASSERT ─────────────────────────────────
 * Static markup has no layout, so this CANNOT measure clipping. It asserts the
 * CAUSE is gone — no fixed width, no rotation, not taken out of flow — and the
 * browser probe measures the EFFECT (0 characters lost at every width tested,
 * 14px instead of 11px, flush at the card's top and right edges). Saying which
 * half is which matters more than the count of assertions.
 *
 * ── THE CONTROL ──────────────────────────────────────────────────────────
 * `PRE_FIX_CLASSES` is round 57's exact class string. The last test runs the
 * same predicates over it and requires them to FAIL, so a green run here means
 * the checks discriminate rather than that they match anything at all.
 */
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const CONTENT = {
  title: 'ราคาพิเศษสำหรับรอบนี้',
  price: '15,120 บาท',
  features: ['เอกสารประกอบการอบรม'],
  ribbon: 'Early Bird ลด 20%',
};

const draw = (content = CONTENT, style = {}) =>
  renderToStaticMarkup(PriceCardSection({ content, style }));

const ribbonClass = (content = CONTENT) =>
  doc(draw(content)).querySelector('[data-pb-ribbon]')?.getAttribute('class') ?? '';

/** Round 57's geometry, verbatim — the control's subject. */
const PRE_FIX_CLASSES =
  'pointer-events-none absolute -right-10 top-4 w-36 rotate-45 py-1 text-center '
  + 'text-[11px] font-bold text-[var(--pb-accent-on)] bg-[color:var(--pb-accent-fill)]';

/** The three properties that made the old band clip. Each is one predicate. */
const CLIPPERS = {
  'a fixed width the corner cannot contain': (c) => /\bw-\d/.test(c),
  'a rotation that pushes both ends outside the card': (c) => /\brotate-/.test(c),
  'removal from flow, so the box owns no layout': (c) => /\babsolute\b/.test(c),
};

test('the ribbon carries none of the three properties that clipped it', () => {
  const cls = ribbonClass();
  for (const [why, hits] of Object.entries(CLIPPERS)) {
    assert.ok(!hits(cls), `the ribbon still has ${why} — class was: ${cls}`);
  }
});

test('the ribbon is IN FLOW, so the title cannot be overlapped by construction', () => {
  const cls = ribbonClass();
  // Shrink-to-fit and right-aligned. Without `self-end` a flex column stretches
  // the item to full width and the corner ornament becomes a banner.
  assert.match(cls, /\bself-end\b/, 'the ribbon would stretch to the card width');
  // The negative margins cancel the card's own p-6 so the box sits flush.
  assert.match(cls, /\B-mt-6\b/, 'the ribbon is not flush with the card top');
  assert.match(cls, /\B-mr-6\b/, 'the ribbon is not flush with the card right edge');
  // Its outer corner must use the CARD's radius, or the two curves disagree.
  assert.match(cls, /\brounded-tr-9e-lg\b/, 'the ribbon corner does not follow the card corner');
});

test('the ribbon is legible — the size that only existed to fit the corner is gone', () => {
  const cls = ribbonClass();
  assert.ok(!/text-\[11px\]/.test(cls), 'the ribbon is still at the 11px the rotated band needed');
  assert.match(cls, /\btext-sm\b/, 'the ribbon has no explicit type size');
});

test('the ribbon renders the author string in full, whatever its length', () => {
  for (const text of ['20%', 'Early Bird', 'Early Bird ลด 20%', 'Early Bird ลด 20% วันนี้เท่านั้น']) {
    const rib = doc(draw({ ...CONTENT, ribbon: text })).querySelector('[data-pb-ribbon]');
    assert.equal(rib.textContent, text, 'the ribbon element does not carry the whole string');
  }
});

test('the ribbon is the FIRST child, so it occupies the corner rather than floating over it', () => {
  const card = doc(draw()).querySelector('div');
  assert.equal(card.firstElementChild.getAttribute('data-pb-ribbon'), '',
    'something is rendered above the ribbon — it would no longer sit in the corner');
});

test('CONTROL — the same predicates FAIL against round 57 geometry', () => {
  const named = [];
  for (const [why, hits] of Object.entries(CLIPPERS)) {
    if (hits(PRE_FIX_CLASSES)) named.push(why);
  }
  assert.deepEqual(named, Object.keys(CLIPPERS),
    'the pre-fix class string is not caught by all three predicates — they do not discriminate');
  assert.ok(!/\bself-end\b/.test(PRE_FIX_CLASSES), 'the in-flow check does not discriminate');
  assert.ok(/text-\[11px\]/.test(PRE_FIX_CLASSES), 'the legibility check does not discriminate');
});
