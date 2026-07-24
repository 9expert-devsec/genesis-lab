import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowStickyBar } from '@/app/(public)/[...slug]/_components/CourseStickyCTA';

// ISSUE 2 (revised): the bar hides the moment the related-courses section
// (#related) intersects the viewport, and returns once it's fully back below
// the fold; if a course has NO related section, it falls back to hiding once
// the content zone (#course-content) scrolls past the top. jsdom does no
// layout, so the effect's live getBoundingClientRect values are inferred; this
// exercises the pure predicate the effect feeds. All *Top/*Bottom values are px
// from the viewport top (negative = above it).

const VH = 1000;
const belowThreshold = VH * 0.75 - 1; // lower bound NOT met (branches 2 & 3)
const aboveThreshold = VH * 0.75 + 1; // lower bound met

// #related states
const REL_BELOW_FOLD = { relatedTop: VH + 200, relatedBottom: VH + 600 }; // not entered yet
const REL_INTERSECTING = { relatedTop: VH - 100, relatedBottom: VH + 300 }; // top edge just entered
const REL_FULLY_ABOVE = { relatedTop: -600, relatedBottom: -100 }; // scrolled past into footer
const NO_RELATED = { relatedTop: null, relatedBottom: null };

const CONTENT_IN_VIEW = { contentBottom: 300 }; // content still extends below the top
const CONTENT_PAST = { contentBottom: -10 };

const show = (o) => shouldShowStickyBar({ scrollY: 0, innerHeight: VH, ...o });

// ── The new upper bound: #related intersection ──────────────────────────────
test('hides the instant the related section intersects the viewport', () => {
  assert.equal(
    show({ hasSchedules: false, ...REL_INTERSECTING, ...CONTENT_IN_VIEW, scrollY: aboveThreshold }),
    false,
    'related is on screen → hidden even though the content zone has NOT scrolled past and the lower bound is met',
  );
});

test('related still below the fold → not hidden by the upper bound', () => {
  assert.equal(
    show({ hasSchedules: false, ...REL_BELOW_FOLD, ...CONTENT_IN_VIEW, scrollY: aboveThreshold }),
    true,
    'related has not entered yet → the lower bound governs',
  );
});

test('reappears after scrolling back up so related is below the fold again', () => {
  // was hidden with related on screen; scroll up → related back below the fold
  assert.equal(
    show({ hasSchedules: false, ...REL_BELOW_FOLD, ...CONTENT_IN_VIEW, scrollY: aboveThreshold }),
    true,
  );
});

// ── Fallback: no related section ────────────────────────────────────────────
test('no related section → falls back to the content-zone bound (hidden past it)', () => {
  assert.equal(
    show({ hasSchedules: false, ...NO_RELATED, ...CONTENT_PAST, scrollY: VH }),
    false,
    'a course with no #related still hides at the content-zone end',
  );
});

test('no related section, still in the content zone → shown by the lower bound', () => {
  assert.equal(
    show({ hasSchedules: false, ...NO_RELATED, ...CONTENT_IN_VIEW, scrollY: aboveThreshold }),
    true,
  );
});

test('related scrolled fully above (into footer) → hidden via the content fallback', () => {
  assert.equal(
    show({ hasSchedules: false, ...REL_FULLY_ABOVE, ...CONTENT_PAST, scrollY: VH }),
    false,
  );
});

// ── Lower bounds still gate the show (branches 2 & 3) ───────────────────────
test('branch 2/3: hidden near the top even with related below the fold', () => {
  assert.equal(
    show({ hasSchedules: false, ...REL_BELOW_FOLD, ...CONTENT_IN_VIEW, scrollY: belowThreshold }),
    false,
  );
});

test('branch 2/3: shown once past 3/4 viewport, related still below the fold', () => {
  assert.equal(
    show({ hasSchedules: false, ...REL_BELOW_FOLD, ...CONTENT_IN_VIEW, scrollY: aboveThreshold }),
    true,
  );
});

// ── Branch 1 (#schedule lower bound) ────────────────────────────────────────
test('branch 1: revealed once #schedule above the top, related below the fold', () => {
  assert.equal(
    show({ hasSchedules: true, scheduleBottom: -5, ...REL_BELOW_FOLD, ...CONTENT_IN_VIEW }),
    true,
  );
});

test('branch 1: not revealed while #schedule bottom is still on screen', () => {
  assert.equal(
    show({ hasSchedules: true, scheduleBottom: 200, ...REL_BELOW_FOLD, ...CONTENT_IN_VIEW }),
    false,
  );
});

test('branch 1: related intersection overrides the schedule gate', () => {
  assert.equal(
    show({ hasSchedules: true, scheduleBottom: -500, ...REL_INTERSECTING, ...CONTENT_IN_VIEW }),
    false,
    'related on screen hides the bar even though the schedule gate says reveal',
  );
});

test('branch 1: no #schedule element (null) → not shown', () => {
  assert.equal(
    show({ hasSchedules: true, scheduleBottom: null, ...REL_BELOW_FOLD, ...CONTENT_IN_VIEW }),
    false,
  );
});

// ── Missing markers must not force-hide ─────────────────────────────────────
test('no related AND no content marker → does not force-hide; lower bound governs', () => {
  assert.equal(
    show({ hasSchedules: false, ...NO_RELATED, contentBottom: null, scrollY: aboveThreshold }),
    true,
    'missing #related and #course-content never silently kill the bar',
  );
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
// The current upper bound keys ONLY on the content zone: while related is partly
// on screen but the content zone has not yet scrolled past, it keeps the bar
// visible (the reported bug). Model that old rule and show it disagrees with the
// fix at exactly that point.
test('CONTROL: the old content-only bound keeps the bar visible while related is partly on screen', () => {
  const oldRule = ({ hasSchedules, scheduleBottom, contentBottom, scrollY, innerHeight }) => {
    if (contentBottom != null && contentBottom < 0) return false;
    if (hasSchedules) return scheduleBottom != null && scheduleBottom < 0;
    return scrollY > innerHeight * 0.75;
  };
  const relatedPartlyOnScreen = {
    hasSchedules: false,
    scheduleBottom: null,
    ...REL_INTERSECTING, // related top has entered the viewport
    ...CONTENT_IN_VIEW, // but the content zone has NOT scrolled past
    scrollY: aboveThreshold,
    innerHeight: VH,
  };
  assert.equal(oldRule(relatedPartlyOnScreen), true, 'old rule keeps the bar over the related section (the bug)');
  assert.equal(shouldShowStickyBar(relatedPartlyOnScreen), false, 'fix hides it the moment related appears');
});
