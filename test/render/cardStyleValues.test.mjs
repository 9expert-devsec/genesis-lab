import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardSurfaceClass, SECTION_STYLE_CAPS } from '@/lib/pageBuilder/presets';
import { CARD_STYLES } from '@/lib/schemas/sections/base';

/**
 * ── ROUND 58: NO DECLARED cardStyle VALUE IS INERT ────────────────────────
 * docs/promo-card-style.md §A. Round 18's lesson, stated as an assertion: a
 * control that offers a value nothing honours is a lie the author cannot
 * detect — they pick it, the page is unchanged, no error is raised.
 *
 * ── WHAT WAS ALREADY PINNED, AND WHY IT IS NOT THIS ───────────────────────
 * `assertComplete('cardStyle', …)` in presets.js throws at module load if a
 * value has no MAP ENTRY — but an entry of `''` satisfies it, and `plain`'s
 * legitimately is. `readerSets.test.mjs` proves each reader genuinely reads the
 * prop, but only across ONE pair of values (`shadow` vs `plain`); emptying
 * `filled` or `gradient` leaves that green. So the gap between "every value has
 * an entry" and "every value does something" is real and nothing stood in it.
 *
 * ── THROUGH THE SANCTIONED PATH, NOT THE RAW FUNCTION ─────────────────────
 * `cardStyleClass` is private by design (2C.3) and test/fs/styleCaps.test.mjs
 * locks it shut. This asks the same question through `cardSurfaceClass`, the
 * capability helper, which is the only path a component has.
 *
 * NOT self-retiring, and that is deliberate: round 56's MAX_SECTION_DEPTH
 * assertion retires when the pages it protects get built, but this one's
 * subject grows — a sixth cardStyle value (§I step 2) is covered the moment it
 * is declared, which is exactly when the round-18 failure could recur.
 */
const READERS = Object.entries(SECTION_STYLE_CAPS)
  .filter(([, props]) => props.includes('cardStyle'))
  .map(([type]) => type);

test('the cardStyle reader-set is non-empty (the walk below can report a difference)', () => {
  assert.ok(READERS.length > 0, 'no type declares cardStyle — every assertion below would pass vacuously');
});

test('every cardStyle value except `plain` resolves to a NON-EMPTY class', () => {
  for (const type of READERS) {
    for (const value of CARD_STYLES) {
      const cls = cardSurfaceClass(type, { cardStyle: value });
      if (value === 'plain') {
        assert.equal(cls, '', `${type}: \`plain\` must stay the no-treatment value`);
      } else {
        assert.notEqual(cls, '', `${type}: cardStyle "${value}" is INERT — the control offers it and nothing honours it`);
      }
    }
  }
});

test('the cardStyle values are pairwise DISTINCT (two names, two treatments)', () => {
  for (const type of READERS) {
    const seen = new Map();
    for (const value of CARD_STYLES) {
      const cls = cardSurfaceClass(type, { cardStyle: value });
      assert.ok(!seen.has(cls), `${type}: "${value}" and "${seen.get(cls)}" resolve to the same class — one of them is a duplicate control`);
      seen.set(cls, value);
    }
  }
});

test('every reader resolves each value IDENTICALLY (the map is shared, not per-type)', () => {
  const [first, ...rest] = READERS;
  for (const value of CARD_STYLES) {
    const expected = cardSurfaceClass(first, { cardStyle: value });
    for (const type of rest) {
      assert.equal(cardSurfaceClass(type, { cardStyle: value }), expected,
        `"${value}" means something different on ${type} than on ${first} — §F's cross-type answer no longer holds`);
    }
  }
});

test('control: a NON-reader is unaffected by every value (the helper really gates)', () => {
  for (const value of CARD_STYLES) {
    assert.equal(cardSurfaceClass('heading', { cardStyle: value }), '');
  }
});

test('control: absent, null and unknown all fall back to the `plain` treatment', () => {
  assert.equal(cardSurfaceClass('price_card', {}), '');
  assert.equal(cardSurfaceClass('price_card', null), '');
  assert.equal(cardSurfaceClass('price_card', { cardStyle: 'no-such-style' }), '');
});
