import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  previewViewportCaveat, PREVIEW_VIEWPORT_CAVEAT,
} from '@/lib/pageBuilder/previewViewportCaveat';

/**
 * The predicate behind the toolbar's caveat, over ALL THREE viewports.
 *
 * The claim being defended is small and exact: a caveat is shown whenever the
 * canvas is clamped, and not when it is not. Two ways for that to go wrong —
 * a clamped viewport losing its caveat (the author is misled again) and
 * 'desktop' gaining one (noise on the default view) — so both directions are
 * asserted rather than just the positive one.
 */

test('every clamped viewport gets the caveat', () => {
  assert.equal(previewViewportCaveat('tablet'), PREVIEW_VIEWPORT_CAVEAT);
  assert.equal(previewViewportCaveat('mobile'), PREVIEW_VIEWPORT_CAVEAT);
});

test('desktop gets NO caveat — there is no clamp to be misled by', () => {
  assert.equal(previewViewportCaveat('desktop'), null);
});

test('CONTROL: the two answers are genuinely different', () => {
  // Guards the pair above against a rewrite that returns the same thing for
  // everything — under which both tests above could still be made to pass by
  // adjusting one constant, and neither would mean anything.
  assert.notEqual(previewViewportCaveat('desktop'), previewViewportCaveat('mobile'));
  assert.ok(PREVIEW_VIEWPORT_CAVEAT.length > 40, 'the caveat copy is empty or a stub');
});

test('an unknown viewport is treated as clamped (fail-closed)', () => {
  // A fourth device added to VIEWPORTS must not arrive without its caveat. This
  // is the direction that matters: a caveat that shows when it need not is
  // noise; one that is missing when it is needed is the defect being fixed.
  assert.equal(previewViewportCaveat('watch'), PREVIEW_VIEWPORT_CAVEAT);
  assert.equal(previewViewportCaveat(undefined), PREVIEW_VIEWPORT_CAVEAT);
  assert.equal(previewViewportCaveat(null), PREVIEW_VIEWPORT_CAVEAT);
});

test('CONTROL: the predicate keys off desktop specifically, not off truthiness', () => {
  // If it were written as `viewport ? CAVEAT : null` the empty string would be
  // the one that escapes, and 'desktop' would wrongly get a caveat. Pinning the
  // two apart is what makes "not desktop" the actual rule.
  assert.equal(previewViewportCaveat(''), PREVIEW_VIEWPORT_CAVEAT);
  assert.equal(previewViewportCaveat('desktop'), null);
});

test('the copy points at the Preview link and names the visibility inversion', () => {
  // The caveat has to be actionable — "this is not real" without "here is where
  // real lives" leaves the author with nothing to do. Both halves are asserted
  // because the copy is the whole deliverable of this half of the round.
  assert.match(PREVIEW_VIEWPORT_CAVEAT, /ดูตัวอย่าง/, 'the caveat no longer points at Preview');
  assert.match(PREVIEW_VIEWPORT_CAVEAT, /breakpoint/, 'the caveat no longer says what is not simulated');
  assert.match(PREVIEW_VIEWPORT_CAVEAT, /สลับกัน/, 'the caveat no longer warns that visibility inverts');
});
