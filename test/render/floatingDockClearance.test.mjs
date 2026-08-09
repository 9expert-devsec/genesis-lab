import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, useSyncExternalStore } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FloatingActionDockView } from '@/components/ui/FloatingActionDock';
import {
  subscribe,
  getRevision,
  getServerRevision,
  bottomInsetAcross,
  setOccupiedBox,
  clearOccupiedBox,
} from '@/lib/viewportBottomInset';

/**
 * The dock clears whatever occupies the bottom edge IN ITS OWN COLUMN, applied
 * as an inline padding-bottom.
 *
 * ── THE DEFECT THIS FILE NOW GUARDS ─────────────────────────────────────────
 * The store used to answer with a single greatest height, so the dock lifted at
 * every viewport width — including the ones where the bar is nowhere near it.
 * Screenshot at ~1050px: the dock floating with nothing underneath. So the
 * positive case ("a box in my column lands as padding") is no longer enough on
 * its own; the NEGATIVE case ("a box outside my column lands as ZERO") is the
 * fix, and it gets its own control.
 *
 * ── WHAT THE RENDER TIER CANNOT SEE HERE, STATED PLAINLY ────────────────────
 * This tier renders to a string. It dispatches no events, runs no effects,
 * performs no layout and has no compositor. So NONE of the following is
 * verified by anything in this repository:
 *   - that the padding transition animates, or animates smoothly;
 *   - that the dock's travel stays in step with the bar's own transform;
 *   - that the ResizeObserver fires when the chat launcher expands on hover,
 *     or that the resulting move reads as a glide rather than a jump;
 *   - that the horizontal-only measurement really does break the padding →
 *     height → observer feedback loop in a live browser;
 *   - that prefers-reduced-motion flattens it (a CSS cascade question).
 * Those are click-tested by a human and by nothing else. What IS checked below
 * is the value that reaches the DOM and the shape it takes.
 *
 * ── TEST ISOLATION, INHERITED FROM b31dd75 ──────────────────────────────────
 * test/run.mjs uses `isolation: 'none', concurrency: true`: module state is
 * shared across every file in every tier, and tests interleave. This file
 * WRITES to viewportBottomInset, so it takes the same discipline — a describe()
 * with concurrency: 1, and cleanup in afterEach because a throwing assertion
 * skips whatever cleanup sits in the test body. The last test asserts the store
 * is left empty, so a leak cannot surface later in an unrelated file.
 */

const PATH = '/data-analytics/power-bi-desktop';

// ── THIS FILE'S PRIVATE LANE ────────────────────────────────────────────────
// test/pure/viewportBottomInset writes to the same store, and under
// `isolation: 'none', concurrency: true` both files run in one process at the
// same time — a describe-level concurrency: 1 orders each file internally and
// does nothing about that. Both files would otherwise reach for the key 'bar',
// and both would ask "is the store empty" of the whole store.
//
// Occupancy is spatial, so the fix is spatial: each file claims a disjoint
// stretch of the imaginary viewport, prefixes its keys, and only ever asserts
// about its own lane. The offset changes no relative geometry — every span
// below is the real 1000px-viewport arithmetic, shifted wholesale.
// (Measured: before the lanes, both files passed alone and this pair failed in
// the full suite.)
const LANE = 1_000_000;
const LANE_END = LANE + 5_000;
const k = (name) => `dock:${name}`;

// A 1000px viewport. The dock is `right-4` and ~44px wide, so it owns the
// right-hand strip; the bar's card is capped at 860 and left-aligned with px-4.
const DOCK_COLUMN = { left: LANE + 940, right: LANE + 984 };
const BAR_BOX = { height: 120, left: LANE + 16, right: LANE + 844 };

const dockHtml = (props = {}) =>
  renderToStaticMarkup(createElement(FloatingActionDockView, { pathname: PATH, ...props }));

/** The dock container's opening tag — the element that carries the padding. */
function container(html) {
  const m = html.match(/<div[^>]*data-floating-dock[^>]*>/);
  if (!m) {
    throw new Error(
      'the dock container did not render, or lost its data-floating-dock anchor. ' +
        'A missing container would make every "does not contain" check below pass ' +
        'vacuously, so this throws rather than returning an empty string.'
    );
  }
  return m[0];
}

describe('FloatingActionDock bottom-inset clearance', { concurrency: 1 }, () => {
  afterEach(() => {
    clearOccupiedBox(k('bar'));
    clearOccupiedBox(k('probe'));
  });

  // ── the query decides, and WHERE is half of it ────────────────────────────

  test('THE FIX: a box outside the dock\'s column resolves to ZERO', () => {
    setOccupiedBox(k('bar'), BAR_BOX);
    assert.equal(
      bottomInsetAcross(DOCK_COLUMN.left, DOCK_COLUMN.right),
      0,
      'the bar ends at 844 and the dock starts at 940 — nothing to clear'
    );
    // ...and that zero is what the dock renders.
    const tag = container(dockHtml({ bottomInset: bottomInsetAcross(DOCK_COLUMN.left, DOCK_COLUMN.right) }));
    assert.match(tag, /style="padding-bottom:0"/, 'so the dock does not move');
  });

  test('CONTROL: the SAME box in the SAME store does lift a dock that overlaps it', () => {
    // Without this, "resolves to ZERO" would also hold if the box had never
    // been stored, if the query always returned 0, or if the dock ignored the
    // prop. Only the asking column differs between the two.
    setOccupiedBox(k('bar'), BAR_BOX);
    const overlapping = bottomInsetAcross(LANE + 800, LANE + 900);
    assert.equal(overlapping, 120, 'a column that overlaps the bar gets the height');

    const tag = container(dockHtml({ bottomInset: overlapping }));
    assert.match(tag, /style="padding-bottom:120px"/, 'and it lands as padding');
  });

  test('the 904px threshold: touching is not overlapping', () => {
    setOccupiedBox(k('bar'), BAR_BOX);
    assert.equal(bottomInsetAcross(LANE + 844, LANE + 888), 0, 'edges meet exactly — no lift');
    assert.equal(bottomInsetAcross(LANE + 843, LANE + 887), 120, 'one pixel of overlap — lift');
  });

  // ── the inert default ─────────────────────────────────────────────────────

  test('with no inset supplied the dock renders zero padding', () => {
    // `0`, not `0px`: React omits the unit for a zero-valued numeric style.
    const tag = container(dockHtml());
    assert.match(tag, /style="padding-bottom:0"/);
  });

  test('CONTROL: the padding probe reads a real value when there is one', () => {
    const tag = container(dockHtml({ bottomInset: 64 }));
    assert.equal(/style="padding-bottom:0"/.test(tag), false, 'it is no longer 0');
    assert.match(tag, /style="padding-bottom:64px"/, 'it is the supplied value');
  });

  // ── the applied value ─────────────────────────────────────────────────────

  test('a non-zero inset lands as inline padding-bottom, not as an anchor class', () => {
    const tag = container(dockHtml({ bottomInset: 96 }));
    assert.match(tag, /style="padding-bottom:96px"/, 'inline style carries the value');
    assert.match(tag, /\bbottom-8\b/, 'the bottom anchor is still the literal resting one');
    assert.equal(
      /bottom-96px|bottom-\[96px\]/.test(tag),
      false,
      'the value never becomes a Tailwind class — one built at runtime emits no CSS'
    );
  });

  test('CONTROL: the anchor probes distinguish the two lift cases', () => {
    const resting = container(dockHtml());
    const lifted = container(
      renderToStaticMarkup(
        createElement(FloatingActionDockView, { pathname: '/masterclass/excel/register' })
      )
    );
    assert.match(resting, /\bbottom-8\b/, 'resting path anchors at bottom-8');
    assert.match(lifted, /\bbottom-24\b/, 'register path still lifts to bottom-24');
    assert.equal(/\bbottom-24\b/.test(resting), false, 'and the two are genuinely different');
  });

  test('the transition is a static class trio, so Tailwind can actually see it', () => {
    const tag = container(dockHtml({ bottomInset: 32 }));
    assert.match(tag, /transition-\[padding-bottom\]/, 'transitions the padding property');
    assert.match(tag, /duration-300/, "matches the bar's duration");
    assert.match(tag, /ease-in-out/, "matches the bar's easing");
    assert.equal(
      /style="[^"]*transition/.test(tag),
      false,
      'the transition is not inline — the class and the keyword are different curves'
    );
  });

  // ── the prop seam, and why it still has to exist ──────────────────────────

  test('the prop seam still lets the render tier exercise a NON-ZERO inset', () => {
    // 8315f22 made bottomInset a prop because renderToStaticMarkup always takes
    // the getServerSnapshot branch. That is still true with a revision-based
    // snapshot, so the seam is still what makes every non-zero assertion above
    // possible. Asserted rather than assumed, because losing it would silently
    // reduce this whole file to testing 0.
    assert.match(container(dockHtml({ bottomInset: 77 })), /style="padding-bottom:77px"/);
  });

  test('a server render reads getServerRevision, so a live store cannot leak into markup', () => {
    function StoreProbe() {
      const rev = useSyncExternalStore(subscribe, getRevision, getServerRevision);
      return createElement('div', { 'data-rev': String(rev) });
    }

    setOccupiedBox(k('probe'), BAR_BOX);
    // CONTROL: the publish really happened, so the assertion below is about
    // independence rather than about an empty store.
    assert.notEqual(getRevision(), 0, 'CONTROL: the client revision really advanced');

    const html = renderToStaticMarkup(createElement(StoreProbe));
    assert.match(html, /data-rev="0"/, 'the server render is 0 even so');
  });

  // ── no leak ───────────────────────────────────────────────────────────────

  test('this file leaves the store EMPTY for everything that runs after it', () => {
    assert.equal(bottomInsetAcross(LANE, LANE_END), 0, 'no box from this file survives');
    assert.equal(getServerRevision(), 0, 'and the server revision is unconditionally 0');
  });
});
