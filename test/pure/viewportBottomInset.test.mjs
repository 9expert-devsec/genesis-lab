import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  subscribe,
  getRevision,
  getServerRevision,
  bottomInsetAcross,
  setOccupiedBox,
  clearOccupiedBox,
} from '@/lib/viewportBottomInset';

/**
 * viewportBottomInset — the pure store, tested without a DOM and without React.
 *
 * ── IT HOLDS BOXES NOW, AND THE NEGATIVE IS THE POINT ───────────────────────
 * The store used to hold one number per publisher and answer with the greatest.
 * That asserted bottom-edge occupancy is uniform across the width, which is
 * false, and the visible defect was a dock lifting at viewport widths where the
 * bar could not reach it. So the assertions below come in pairs: a box that
 * DOES intersect the asking span reports its height, and a box that does NOT
 * reports 0. The second half is the bug fix and has its own controls.
 *
 * ── HOW THE CONTROLS WORK HERE ──────────────────────────────────────────────
 * A pure store has no markup to diff, so a control cannot be "render it the old
 * way". Each guard is paired with a REFERENCE TWIN — the same few lines with
 * that one guard removed, hand-written rather than derived from the
 * implementation — and the same probe is fired at both. Every guard was also
 * checked by mutation; the commit message lists which test each one reddens.
 *
 * ── ISOLATION ───────────────────────────────────────────────────────────────
 * test/run.mjs uses `isolation: 'none', concurrency: true`: module state is
 * shared across every file in every tier and tests interleave. Hence the
 * describe with concurrency: 1 and cleanup in afterEach — an assertion that
 * throws skips whatever cleanup sits in the test body, which is exactly when
 * isolation matters. (Measured on the scalar version: in-body cleanup turned 1
 * failure into 11 cascading ones.)
 */

// ── THIS FILE'S PRIVATE LANE ────────────────────────────────────────────────
// test/render/floatingDockClearance also writes to this store, and with
// `isolation: 'none', concurrency: true` the two files run in one process at
// the same time. A describe-level concurrency: 1 orders each file internally
// and does nothing about that. Two things therefore have to be private:
//
//   the KEYS — both files naturally reach for 'bar', and one file's cleanup
//              would delete the other's box mid-test;
//   the SPAN — occupancy is spatial, so "is the store empty" can be asked of a
//              REGION instead of globally. Each file claims a disjoint stretch
//              of the imaginary viewport and only ever asserts about its own.
//
// Measured: before the lanes, this file passed alone and failed in the full
// suite — exactly the shape of leak test/withTZ.mjs records.
const LANE = 0;
const LANE_END = 5_000;

// Nullish and empty keys pass through unprefixed: the store is supposed to
// refuse them, and 'store:null' would be a perfectly valid key.
const k = (name) => (name == null || name === '' ? name : `store:${name}`);

// A span standing in for a consumer hugging the right edge of a 1000px
// viewport: the real dock is `right-4` and ~44px wide, so 940..984.
const RIGHT_EDGE = { left: LANE + 940, right: LANE + 984 };

// The course bar at that width: capped at 860px, left-aligned, px-4 inside.
const BAR_BOX = { height: 120, left: LANE + 16, right: LANE + 844 };

describe('viewportBottomInset', { concurrency: 1 }, () => {
  const publishedKeys = new Set();
  const openListeners = new Set();

  function publish(key, box) {
    publishedKeys.add(k(key));
    setOccupiedBox(k(key), box);
  }

  function drop(key) {
    clearOccupiedBox(k(key));
  }

  function listen(fn) {
    const off = subscribe(fn);
    openListeners.add(off);
    return off;
  }

  beforeEach(() => {
    assert.equal(
      bottomInsetAcross(LANE, LANE_END),
      0,
      'clean start — a previous test leaked a box into this one'
    );
  });

  afterEach(() => {
    for (const off of openListeners) off();
    openListeners.clear();
    for (const key of publishedKeys) clearOccupiedBox(key);
    publishedKeys.clear();
  });

  // ── the query: occupied HERE but not THERE ────────────────────────────────

  test('a box reports its height to a span it intersects', () => {
    publish('bar', BAR_BOX);
    assert.equal(bottomInsetAcross(16, 844), 120, 'the bar\'s own column');
    assert.equal(bottomInsetAcross(800, 900), 120, 'a span straddling its right edge');
  });

  test('THE DEFECT: a box reports ZERO to a span it does not reach', () => {
    // This is the whole bug. Under the scalar store this returned 120 and the
    // dock lifted over nothing at ~1050px.
    publish('bar', BAR_BOX);
    assert.equal(
      bottomInsetAcross(RIGHT_EDGE.left, RIGHT_EDGE.right),
      0,
      'a consumer at the right edge is not above the bar and must not move'
    );
  });

  test('CONTROL: the same box IS seen by a span that does reach it', () => {
    // Without this, "reports ZERO" would also hold for a store that had simply
    // lost the box, or for a query that always returns 0.
    publish('bar', BAR_BOX);
    assert.equal(bottomInsetAcross(RIGHT_EDGE.left, RIGHT_EDGE.right), 0);
    assert.equal(bottomInsetAcross(0, 200), 120, 'the box is genuinely in the store');
  });

  test('touching edges do NOT intersect — the measured 904px threshold', () => {
    // At 904px the bar's right edge and the dock's left edge are both at 844.
    // Strict comparison makes that a touch rather than an overlap, which is
    // what the click-test measured.
    publish('bar', BAR_BOX);
    assert.equal(bottomInsetAcross(844, 888), 0, 'exactly touching: no lift');
    assert.equal(bottomInsetAcross(843, 887), 120, 'one pixel of overlap: lift');
  });

  test('CONTROL: a non-strict comparison would break that threshold', () => {
    // The twin uses <= / >=, the classic off-by-one. Same inputs, wrong answer.
    const loose = (box, left, right) => box.left <= right && box.right >= left;
    assert.equal(loose(BAR_BOX, 844, 888), true, 'the loose test counts a touch...');
    assert.equal(BAR_BOX.left < 888 && BAR_BOX.right > 844, false, '...the strict one does not');
  });

  // ── several publishers ────────────────────────────────────────────────────

  test('the greatest INTERSECTING box wins, not the greatest box', () => {
    publish('tall-elsewhere', { height: 300, left: 0, right: 100 });
    publish('short-here', { height: 60, left: 900, right: 1000 });
    assert.equal(
      bottomInsetAcross(RIGHT_EDGE.left, RIGHT_EDGE.right),
      60,
      'the 300px box is nowhere near this span'
    );
  });

  test('CONTROL: a width-blind max would answer 300 to that same question', () => {
    // The scalar store, reproduced in three lines. This is what shipped.
    const scalarMax = (heights) => heights.reduce((m, h) => (h > m ? h : m), 0);
    assert.equal(scalarMax([300, 60]), 300, 'the old behaviour...');
    assert.notEqual(scalarMax([300, 60]), 60, '...is the defect being fixed');
  });

  test('two intersecting boxes compose by max', () => {
    publish('a', { height: 64, left: 0, right: 1000 });
    publish('b', { height: 96, left: 0, right: 1000 });
    assert.equal(bottomInsetAcross(100, 200), 96, 'the taller one governs');
    drop('b');
    assert.equal(bottomInsetAcross(100, 200), 64, 'and removing it falls back');
  });

  test('a zero-height box is present but occupies nothing', () => {
    // How a publisher says "still here, currently covering nothing" — dismissed,
    // scrolled away, or mid-slide.
    publish('bar', { ...BAR_BOX, height: 0 });
    assert.equal(bottomInsetAcross(0, 200), 0);
  });

  // ── subscribe / notify ────────────────────────────────────────────────────

  test('subscribe returns an unsubscribe that actually detaches the listener', () => {
    let detached = 0;
    let stillAttached = 0;
    const off = listen(() => { detached += 1; });
    listen(() => { stillAttached += 1; });

    off();
    publish('sub', BAR_BOX);

    // The CONTROL is in the same publish: a still-subscribed listener MUST have
    // fired, or `detached === 0` would also hold for a publish that did nothing.
    assert.equal(stillAttached, 1, 'CONTROL: the publish really did notify');
    assert.equal(detached, 0, 'the unsubscribed listener was not called');
  });

  test('republishing an IDENTICAL box notifies nobody', () => {
    let calls = 0;
    listen(() => { calls += 1; });

    publish('bar', BAR_BOX);
    publish('bar', { ...BAR_BOX });
    publish('bar', { ...BAR_BOX });

    // A real publisher republishes its measurement on every layout tick.
    assert.equal(calls, 1, 'three publishes of one box are one notification');
  });

  test('CONTROL: a store without the equality guard notifies every time', () => {
    const twin = (() => {
      const map = new Map();
      let n = 0;
      return { set: (k, b) => { map.set(k, b); n += 1; }, count: () => n };
    })();
    twin.set('bar', BAR_BOX);
    twin.set('bar', { ...BAR_BOX });
    twin.set('bar', { ...BAR_BOX });
    assert.equal(twin.count(), 3, 'so the probe can tell the two apart');
  });

  test('a box that moves only horizontally still notifies', () => {
    // Same height, different span — invisible to a height-only comparison, and
    // it changes the answer for every consumer near the moved edge.
    let calls = 0;
    publish('bar', BAR_BOX);
    listen(() => { calls += 1; });
    publish('bar', { ...BAR_BOX, right: 900 });
    assert.equal(calls, 1, 'the span is part of the identity of a box');
    assert.equal(bottomInsetAcross(880, 920), 120, 'and the query sees the new edge');
  });

  test('the revision advances on a real change and holds still otherwise', () => {
    const before = getRevision();
    publish('bar', BAR_BOX);
    const after = getRevision();
    assert.notEqual(after, before, 'a change moves the revision');
    publish('bar', { ...BAR_BOX });
    assert.equal(getRevision(), after, 'an identical republish does not');
  });

  // ── refusal and clamping ──────────────────────────────────────────────────

  test('a negative height clamps to 0', () => {
    publish('clamp', { ...BAR_BOX, height: 50 });
    assert.equal(bottomInsetAcross(0, 200), 50, 'a real value first');
    publish('clamp', { ...BAR_BOX, height: -25 });
    assert.equal(bottomInsetAcross(0, 200), 0, 'clamped, not stored as -25');
  });

  test('CONTROL: without the clamp a negative would survive', () => {
    const noClamp = (h) => (Number.isFinite(h) ? h : null);
    assert.equal(noClamp(-25), -25);
    assert.notEqual(noClamp(-25), 0);
  });

  test('a non-finite height is refused, leaving the previous box in place', () => {
    publish('finite', { ...BAR_BOX, height: 80 });
    for (const bad of [NaN, Infinity, -Infinity, '64', null, undefined, {}, []]) {
      publish('finite', { ...BAR_BOX, height: bad });
      assert.equal(bottomInsetAcross(0, 200), 80, `height ${String(bad)} must not land`);
    }
  });

  test('an unusable SPAN is refused rather than clamped', () => {
    // Different direction from height on purpose: there is no safe value to
    // clamp a span toward, and a guessed span would answer intersection
    // questions about a region the publisher is not in.
    publish('span', { ...BAR_BOX });
    for (const bad of [
      { height: 120, left: 500, right: 500 },
      { height: 120, left: 900, right: 100 },
      { height: 120, left: NaN, right: 200 },
      { height: 120, left: 0, right: undefined },
    ]) {
      publish('span', bad);
      assert.equal(
        bottomInsetAcross(0, 200),
        120,
        'the last good box survives an unusable span'
      );
    }
  });

  test('CONTROL: the two refusal directions are genuinely different', () => {
    // A clamped height lands as 0 and CHANGES the answer; a refused span leaves
    // the previous box untouched. If both did the same thing one of the two
    // tests above would be describing nothing.
    publish('dir', { ...BAR_BOX, height: 90 });
    publish('dir', { ...BAR_BOX, height: -5 });
    assert.equal(bottomInsetAcross(0, 200), 0, 'clamped height changed the answer');
    publish('dir', { ...BAR_BOX, height: 90 });
    publish('dir', { height: 90, left: 10, right: 10 });
    assert.equal(bottomInsetAcross(0, 200), 90, 'refused span did not');
  });

  test('a nullish or empty key is refused', () => {
    for (const key of [null, undefined, '']) {
      publish(key, BAR_BOX);
      assert.equal(bottomInsetAcross(0, 2000), 0, `${String(key)} must not become a bucket`);
    }
  });

  test('an unusable asking span answers 0', () => {
    publish('bar', BAR_BOX);
    for (const [l, r] of [[NaN, 100], [0, NaN], [500, 500], [900, 100]]) {
      assert.equal(bottomInsetAcross(l, r), 0, `span ${l}..${r} answers 0`);
    }
    assert.equal(bottomInsetAcross(0, 200), 120, 'CONTROL: a usable span still answers');
  });

  test('clearing a key that was never set does not notify', () => {
    let calls = 0;
    listen(() => { calls += 1; });
    drop('never-set');
    assert.equal(calls, 0);
  });

  // ── the server snapshot ───────────────────────────────────────────────────

  test('getServerRevision is 0 even while the client store has moved', () => {
    assert.equal(getServerRevision(), 0);
    publish('ssr', BAR_BOX);
    // CONTROL: the client side really did move at this instant, so the two are
    // being shown to be independent rather than both trivially 0.
    assert.notEqual(getRevision(), 0, 'CONTROL: the client revision advanced');
    assert.equal(getServerRevision(), 0, 'the server revision is unmoved by it');
  });

  test('this file leaves the store EMPTY for everything that runs after it', () => {
    assert.equal(bottomInsetAcross(LANE, LANE_END), 0, 'no box from this file survives');
  });
});
