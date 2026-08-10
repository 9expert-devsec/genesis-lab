import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickyBarOccupancyHeight } from '@/lib/stickyBarOccupancy';

/**
 * The occupancy rule: how much of the viewport's bottom edge a sticky bottom
 * bar is occupying, as a pure function of state. The effects in the two
 * components that use it are thin callers, so everything decidable lives here.
 *
 * TWO callers now — CourseStickyCTA and the masterclass detail bar — which is
 * why the rule moved out of the first of them and into src/lib. These tests
 * cover the rule once, for both.
 *
 * ── OCCUPANCY ONLY ──────────────────────────────────────────────────────────
 * The published number is height + the bar's own bottom offset, and NOTHING
 * else. An earlier version added a 12px gap sourced from the dock's `gap-3`;
 * it double-counted (the dock is already anchored at bottom-8, so its children
 * landed 44px above the card rather than 12) and it made this file depend on a
 * class in another one. Spacing is the consumer's. The totals below are
 * therefore exact sums of two terms, asserted as such, so a third summand
 * reappearing fails here rather than being absorbed.
 *
 * ── THE RULE THIS FILE EXISTS TO PROTECT ────────────────────────────────────
 * ONE rule covers both ways the bar goes away. Pressing X and scrolling out of
 * the reveal window are the same fact from the consumer's side, and if they
 * ever diverge the dock stays lifted over nothing every time the bar slides
 * away on scroll. That is why the dismiss and the scroll-hide cases below are
 * asserted to produce the IDENTICAL number rather than merely both being
 * falsy-ish, and why there is a control showing the assertion can tell a
 * split rule apart from a unified one.
 *
 * Unmount is the third way the bar goes away and is NOT decidable here — it is
 * effect teardown. It is guarded in test/fs/stickyBarClearanceWiring.
 *
 * This file is pure: it holds no module state and writes to no store, so it
 * needs none of b31dd75's describe/concurrency discipline.
 */

// A fully-occupying bar at the small-screen breakpoint: 7rem card, bottom-2.
const VISIBLE = {
  dismissed: false,
  revealed: true,
  cardHeight: 112,
  bottomOffset: 8,
};

// ── the one rule ────────────────────────────────────────────────────────────

test('a revealed bar occupies its height PLUS its own bottom offset, and nothing else', () => {
  assert.equal(stickyBarOccupancyHeight(VISIBLE), 112 + 8);
  // Spelled out as a literal too: the sum-of-terms form above would still hold
  // if a constant were folded into one of the terms.
  assert.equal(stickyBarOccupancyHeight(VISIBLE), 120);
});

test('no spacing is folded in — the total is exactly the two occupancy terms', () => {
  // The regression this guards is a gap summand coming back. Any constant
  // added to the result shows up as a non-zero remainder here, whatever its
  // size and wherever in the expression it hides.
  for (const [cardHeight, bottomOffset] of [[112, 8], [120, 24], [96, 0], [200, 6]]) {
    assert.equal(
      stickyBarOccupancyHeight({ ...VISIBLE, cardHeight, bottomOffset }) - (cardHeight + bottomOffset),
      0,
      `${cardHeight}+${bottomOffset} must publish exactly ${cardHeight + bottomOffset}`
    );
  }
});

test('CONTROL: that remainder check would catch a re-added gap', () => {
  // Same arithmetic against a resolver that still adds 12. Without this, the
  // "remainder is 0" assertions could be passing because the probe cannot see
  // a summand at all.
  const withGap = ({ cardHeight, bottomOffset }) => cardHeight + bottomOffset + 12;
  assert.equal(withGap({ cardHeight: 112, bottomOffset: 8 }) - (112 + 8), 12);
});

test('the bottom offset is part of the number, not the consumer\'s problem', () => {
  // bottom-2 (8px) below md, bottom-6 (24px) from md up. Same card, different
  // total — a consumer that had to add this itself would need the breakpoint.
  const small = stickyBarOccupancyHeight({ ...VISIBLE, bottomOffset: 8 });
  const medium = stickyBarOccupancyHeight({ ...VISIBLE, bottomOffset: 24 });
  assert.equal(medium - small, 16, 'the responsive offset moves the published total');
});

test('the height is not assumed — a taller card publishes a bigger number', () => {
  // The cover thumbnail is `hidden sm:block`, so the card genuinely grows.
  const withoutCover = stickyBarOccupancyHeight({ ...VISIBLE, cardHeight: 112 });
  const withCover = stickyBarOccupancyHeight({ ...VISIBLE, cardHeight: 120 });
  assert.equal(withCover - withoutCover, 8, 'a measured height flows straight through');
});

// ── both ways of going away, and they must agree ────────────────────────────

test('X dismiss publishes 0', () => {
  assert.equal(stickyBarOccupancyHeight({ ...VISIBLE, dismissed: true }), 0);
});

test('scrolled out of the reveal window publishes 0', () => {
  assert.equal(stickyBarOccupancyHeight({ ...VISIBLE, revealed: false }), 0);
});

test('dismiss and scroll-hide produce the IDENTICAL number — one rule, not two', () => {
  const byDismiss = stickyBarOccupancyHeight({ ...VISIBLE, dismissed: true });
  const byScroll = stickyBarOccupancyHeight({ ...VISIBLE, revealed: false });
  assert.equal(
    byDismiss,
    byScroll,
    'if these ever diverge the dock stays lifted over nothing whenever the bar ' +
      'slides away on scroll'
  );
  assert.equal(byDismiss, 0, 'and the shared answer is 0');
});

test('dismissed wins even while revealed is still true', () => {
  // The reveal effect keeps running after dismiss (the component returns null
  // but stays mounted), so this combination is reachable, not hypothetical.
  assert.equal(stickyBarOccupancyHeight({ ...VISIBLE, dismissed: true, revealed: true }), 0);
});

test('CONTROL: the agreement assertion can tell a SPLIT rule from a unified one', () => {
  // A rule that special-cases the X — the exact defect the shared assertion
  // above is there to catch. Fired through the same comparison, it fails.
  const split = ({ dismissed, cardHeight, bottomOffset }) =>
    dismissed ? 0 : cardHeight + bottomOffset;

  const byDismiss = split({ ...VISIBLE, dismissed: true });
  const byScroll = split({ ...VISIBLE, revealed: false });
  assert.equal(byDismiss, 0, 'the split rule still zeroes on dismiss...');
  assert.equal(byScroll, 120, '...but leaves the dock lifted on scroll-hide');
  assert.notEqual(byDismiss, byScroll, 'so the equality assertion above is not vacuous');
});

// ── the unmeasured case fails toward the status quo ─────────────────────────

test('an unmeasured height publishes 0 rather than a guess', () => {
  // Before the measuring effect has run, cardHeight is 0. Publishing a guessed
  // 112 here would move the dock to a wrong place and look intentional; 0
  // leaves it exactly where it already was.
  assert.equal(stickyBarOccupancyHeight({ ...VISIBLE, cardHeight: 0 }), 0);
});

test('a nonsensical height publishes 0 too', () => {
  for (const bad of [NaN, Infinity, -Infinity, -50, '112', null, undefined]) {
    assert.equal(
      stickyBarOccupancyHeight({ ...VISIBLE, cardHeight: bad }),
      0,
      `cardHeight ${String(bad)} must not reach the store`
    );
  }
});

test('a nonsensical bottom offset degrades to 0 WITHOUT discarding the height', () => {
  // Different direction from cardHeight on purpose: a missing offset is a small
  // error (the bar is still there and still that tall), so dropping just the
  // offset keeps the dock clear of the card. Dropping everything would put the
  // dock back under a bar that is plainly on screen.
  for (const bad of [NaN, undefined, null, -4, 'x']) {
    assert.equal(
      stickyBarOccupancyHeight({ ...VISIBLE, bottomOffset: bad }),
      112,
      `bottomOffset ${String(bad)} drops only itself`
    );
  }
});

test('CONTROL: the two degradation directions are genuinely different', () => {
  // Without this, both "publishes 0" and "keeps the height" could be describing
  // the same behaviour and one of the two tests above would be meaningless.
  const badHeight = stickyBarOccupancyHeight({ ...VISIBLE, cardHeight: NaN });
  const badOffset = stickyBarOccupancyHeight({ ...VISIBLE, bottomOffset: NaN });
  assert.equal(badHeight, 0);
  assert.notEqual(badOffset, 0);
});

// ── no spacing knob at all ──────────────────────────────────────────────────

test('there is no gap parameter — a caller cannot inject spacing here', () => {
  // The resolver used to take `gap` with a default. Removing the term is only
  // half the job: leaving the parameter would let a caller put spacing back
  // without touching this file, which is the coupling being removed.
  const asIfSupported = stickyBarOccupancyHeight({ ...VISIBLE, gap: 40 });
  assert.equal(
    asIfSupported,
    120,
    'an unrecognised `gap` is simply ignored, not honoured'
  );
});

test('CONTROL: a resolver that DID honour gap answers differently', () => {
  // Proves the assertion above is reading a real refusal rather than a value
  // that happens to coincide.
  const honoursGap = ({ cardHeight, bottomOffset, gap = 0 }) => cardHeight + bottomOffset + gap;
  assert.equal(honoursGap({ cardHeight: 112, bottomOffset: 8, gap: 40 }), 160);
  assert.notEqual(honoursGap({ cardHeight: 112, bottomOffset: 8, gap: 40 }), 120);
});
