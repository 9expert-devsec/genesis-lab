import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_EPSILON,
  SCROLL_INTENT_KEYS,
  isViewerScrollKey,
  isViewerWheel,
  stripScrollState,
} from '@/lib/home/featureStripScroll';

/**
 * The two filmstrip rules that had no guard, and both of them are rules about
 * LYING to the reader.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE, STATED FIRST ─────────────────────────
 * These are the functions FeatureContentStrip actually calls — not a copy — so
 * a test of them is a test of the shipped decision. What it is NOT is a test of
 * the wiring: this tier has no compositor, no scroll container and no events,
 * so it cannot see that `stripScrollState` is fed the right element's numbers,
 * nor that `isViewerWheel` is attached to `onWheel` rather than to nothing.
 *
 * One half of rule (c) is a browser guarantee and is unfalsifiable here by
 * construction: that assigning `scrollLeft` emits a `scroll` event and NO
 * pointer/wheel/key event. That is what makes the separation structural rather
 * than a timing race, and it is verified in a real browser (Chrome, CDP) —
 * auto-slide scrolls the strip and `data-fc-paused` stays "none", while a
 * dispatched horizontal wheel flips it to "user". Saying so here rather than
 * writing an assertion that could not fail.
 */

// ── (b) A FADE IS SHOWN ONLY WHEN THERE IS MORE THAT WAY ────────────────────
//
// The failure this prevents is not a crash, it is a lie: a gradient at an edge
// with nothing behind it tells the reader to keep swiping into a wall.

test('a strip whose content fits gets NO fades and NO position bar', () => {
  const s = stripScrollState({ scrollLeft: 0, scrollWidth: 800, clientWidth: 800 });
  assert.equal(s.overflows, false, 'a strip that fits must not claim to overflow');
  // Both edge flags true means both fades are suppressed by the component's
  // `overflows && !atX` guard even before `overflows` is consulted.
  assert.equal(s.atStart, true);
  assert.equal(s.atEnd, true);
});

test('at the start: no leading fade, trailing fade shown', () => {
  const s = stripScrollState({ scrollLeft: 0, scrollWidth: 3000, clientWidth: 1000 });
  assert.equal(s.overflows, true);
  assert.equal(s.atStart, true, 'nothing to the left, so no leading fade');
  assert.equal(s.atEnd, false, 'there IS more to the right, so the trailing fade shows');
});

test('mid-scroll: both fades, because there is more in both directions', () => {
  const s = stripScrollState({ scrollLeft: 1000, scrollWidth: 3000, clientWidth: 1000 });
  assert.equal(s.atStart, false);
  assert.equal(s.atEnd, false);
});

test('at the end: leading fade shown, NO trailing fade', () => {
  const s = stripScrollState({ scrollLeft: 2000, scrollWidth: 3000, clientWidth: 1000 });
  assert.equal(s.atStart, false, 'there IS more to the left');
  assert.equal(s.atEnd, true, 'nothing to the right, so no trailing fade');
});

test('a fractional pixel short of the end still counts as the end', () => {
  // The real defect: scrollLeft is fractional on a scaled display while
  // scrollWidth - clientWidth rounds separately, so a strip that is visually
  // finished reports a stray pixel of remaining scroll — and an exact
  // comparison then paints a trailing fade over nothing.
  const s = stripScrollState({ scrollLeft: 1999, scrollWidth: 3000, clientWidth: 1000 });
  assert.equal(s.atEnd, true, `within ${EDGE_EPSILON}px of the end must read as the end`);
});

test('CONTROL: a pixel beyond the epsilon is NOT the end', () => {
  // Without this, "atEnd is true" above could be passing because the function
  // returns true unconditionally.
  const s = stripScrollState({ scrollLeft: 1990, scrollWidth: 3000, clientWidth: 1000 });
  assert.equal(s.atEnd, false, 'genuinely 10px of scroll left must still show the fade');
});

test('the thumb is sized to the visible fraction and offset by scroll', () => {
  const s = stripScrollState({ scrollLeft: 600, scrollWidth: 3000, clientWidth: 1000 });
  assert.equal(s.thumbWidth, (1000 / 3000) * 100);
  assert.equal(s.thumbLeft, (600 / 3000) * 100);
});

test('an unmeasured scroller yields numbers, never NaN', () => {
  // A scroller that has not been laid out reports 0, and NaN in a style
  // attribute is a silently broken bar rather than a loud failure.
  const s = stripScrollState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  assert.ok(Number.isFinite(s.thumbWidth), 'thumbWidth must be a number');
  assert.ok(Number.isFinite(s.thumbLeft), 'thumbLeft must be a number');
  assert.equal(s.overflows, false, 'an unmeasured strip must not claim to overflow');
});

test('called with nothing at all it still returns a usable state', () => {
  const s = stripScrollState();
  assert.equal(s.overflows, false);
  assert.ok(Number.isFinite(s.thumbWidth));
});

// ── (c) WHICH SCROLLS ARE THE VIEWER'S ──────────────────────────────────────
//
// Wrong in one direction, the carousel stops itself on its own first tick.
// Wrong in the other, it fights the reader's finger.

test('a horizontal wheel over the strip IS the viewer', () => {
  assert.equal(isViewerWheel({ deltaX: 120, deltaY: 0 }), true);
  assert.equal(isViewerWheel({ deltaX: -120, deltaY: 0 }), true, 'either direction');
  assert.equal(isViewerWheel({ deltaX: 40, deltaY: 12 }), true, 'mostly horizontal counts');
});

test('a VERTICAL wheel over the strip is the page going by, not the viewer', () => {
  // The false positive this prevents: someone scrolling the page with the
  // cursor resting over the strip would otherwise stop auto-slide for good
  // without ever having touched it.
  assert.equal(isViewerWheel({ deltaX: 0, deltaY: 120 }), false);
  assert.equal(isViewerWheel({ deltaX: 12, deltaY: 40 }), false, 'mostly vertical does not count');
});

test('shift+wheel is the keyboard-modified horizontal gesture and counts', () => {
  // It reports its movement on deltaY, so the magnitude test alone would miss it.
  assert.equal(isViewerWheel({ deltaX: 0, deltaY: 120, shiftKey: true }), true);
});

test('an event that moved nothing is not intent', () => {
  assert.equal(isViewerWheel({ deltaX: 0, deltaY: 0 }), false);
  assert.equal(isViewerWheel({}), false);
  assert.equal(isViewerWheel(), false);
});

test('the container-scrolling keys ARE the viewer', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']) {
    assert.equal(isViewerScrollKey(key), true, `${key} scrolls the strip`);
  }
});

test('Tab is NOT, because tabbing past a carousel must not seize it', () => {
  // Focus already pauses auto-slide transiently, which is the right strength
  // for that gesture. Taking PERMANENT control would be a trap.
  assert.equal(isViewerScrollKey('Tab'), false);
  assert.equal(SCROLL_INTENT_KEYS.has('Tab'), false);
});

test('activation keys are NOT scroll intent — they go through onSelect', () => {
  assert.equal(isViewerScrollKey('Enter'), false);
  assert.equal(isViewerScrollKey(' '), false);
});

test('CONTROL: an ordinary key is not scroll intent either', () => {
  // Proves the predicate is a membership test and not "return true".
  assert.equal(isViewerScrollKey('a'), false);
  assert.equal(isViewerScrollKey(undefined), false);
});
