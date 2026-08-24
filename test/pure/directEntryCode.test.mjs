import { test } from 'node:test';
import assert from 'node:assert/strict';

import { directEntryCode } from '@/components/pageBuilder/editor/CoursePicker';

/**
 * ROUND 51 — what a directly-typed course code becomes when it is stored.
 *
 * ── THIS FILE EXISTS BECAUSE A BREAK CONTROL CAME BACK GREEN ──────────────
 * The rule is §F.3's: direct entry trims and does nothing else. It was written
 * inline in the single-value picker's click handler, and folding that handler's
 * output to upper case left the ENTIRE suite green — 7868 tests, none of which
 * could see it, because the handler only runs under a real click and the render
 * tier never fires one. The jsdom drive probe caught it, but the probe is not
 * part of `npm test`, so nothing that runs on every commit was holding it.
 *
 * So the rule moved into a function, and the function is tested here. That is
 * the whole reason it is a function: not tidiness, coverage.
 *
 * ── WHY CASE MATTERS MORE THAN IT LOOKS ───────────────────────────────────
 * Four of 79 upstream ids are mixed-case and the course query is exact-match. A
 * fold on the way in makes those four unreferenceable, and the author sees only
 * "the code I typed does not resolve" — with nothing on screen connecting that
 * to a normalisation that happened when they pressed the button.
 */

test('a typed code is trimmed', () => {
  assert.equal(directEntryCode('  MSE-AI  '), 'MSE-AI');
  assert.equal(directEntryCode('\tMSE-AI\n'), 'MSE-AI');
});

test('case is NOT folded — either way', () => {
  assert.equal(directEntryCode('MixedCase-Code'), 'MixedCase-Code');
  assert.equal(directEntryCode('lower-case-code'), 'lower-case-code');
  assert.equal(directEntryCode('UPPER-CASE-CODE'), 'UPPER-CASE-CODE');
});

test('nothing else is normalised — §F.3, no validation, no rewriting', () => {
  // Separators, dots, spaces inside, and a code shaped like nothing upstream
  // publishes. All of it is the author's to type and the resolver's to judge.
  for (const raw of ['MSE_AI', 'MSE.AI', 'MSE AI', 'ZZ-NO-SUCH-COURSE', '9EXPERT-2026', 'คอร์สไทย']) {
    assert.equal(directEntryCode(raw), raw, `${raw} was rewritten on the way in`);
  }
});

test('a blank is the empty string — the caller reads that as "do nothing"', () => {
  // Not "clear the field": the button must be inert on an empty box rather than
  // a way to wipe a stored code by pressing it twice.
  assert.equal(directEntryCode(''), '');
  assert.equal(directEntryCode('   '), '');
  assert.equal(directEntryCode('\n\t '), '');
});

test('a non-string is the empty string rather than a crash or a cast', () => {
  for (const junk of [null, undefined, 0, 42, {}, [], NaN, false]) {
    assert.equal(directEntryCode(junk), '', `${String(junk)} did not come back empty`);
  }
});

test('CONTROL — this function is what a fold would have to get past', () => {
  /**
   * The break that came back green, expressed as the comparison that catches
   * it. If `directEntryCode` ever folds case, these two stop differing and the
   * test above goes red naming the code.
   */
  const typed = 'MixedCase-Code';
  assert.notEqual(directEntryCode(typed), typed.toUpperCase(),
    'the typed code now matches its upper-cased form — a fold is in the path');
  assert.notEqual(directEntryCode(typed), typed.toLowerCase());
  assert.equal(directEntryCode(typed), typed);
});
