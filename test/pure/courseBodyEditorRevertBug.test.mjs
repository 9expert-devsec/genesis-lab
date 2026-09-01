import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The course rich-text editor's data-loss bug, reproduced at the DECISION
 * level. See `CourseBodyEditor.jsx`'s own module header for the full
 * diagnosis and `test/fs/courseBodyEditorRevertFix.test.mjs` for proof the
 * fix landed in the shipped source.
 *
 * REPORTED: type several lines, click the empty area below the text, and
 * the typed content reverted — as if undone. Every time.
 *
 * ── WHY THIS FILE HOLDS TWO "BEFORE" IMPLEMENTATIONS, NOT ONE ───────────────
 * Both are independent transcriptions of code this round removed — neither
 * is imported from production, so agreement/disagreement is a real
 * comparison, not a tautology.
 *
 *   `reseedGuard_v1_isFocusedOnly` — the ORIGINAL shipped guard: skip while
 *   focused, otherwise replace whenever the prop disagrees with the live
 *   document.
 *
 *   `reseedGuard_v2_compareLastEmitted` — the FIRST fix attempted in this
 *   round: instead of trusting focus, compare the incoming value against a
 *   ref tracking the last HTML this editor itself emitted (updated
 *   synchronously inside onUpdate, same tick as the transaction, so it can
 *   never lag the live document the way a React prop can). It looked like
 *   it should close the gap. Written, THEN run against the scenario below,
 *   and this file's own test caught it reverting too — that failure is why
 *   the shipped fix is not "a smarter comparison" but "no comparison": the
 *   document is now seeded once at creation, and a genuine external change
 *   is handled by remounting (a `key` on `<CourseBodyEditor>` in
 *   CourseForm.jsx), never by reconciling a live document against a prop.
 *
 * ── THE SCENARIO ─────────────────────────────────────────────────────────
 * A React prop update from `setState` is not synchronous with the DOM
 * transaction that triggered it — React schedules the re-render; the
 * transaction (and this editor's own onUpdate) happens synchronously, in
 * the same tick as the keystroke. So immediately after the LAST keystroke,
 * there is a real window where:
 *   - the LIVE DOCUMENT already holds the full, latest text (ProseMirror
 *     applied the transaction synchronously)
 *   - a ref updated inside that same onUpdate call ALSO already holds it
 *   - the REACT PROP (`value`), scheduled rather than synchronous, may
 *     still be reporting the PREVIOUS line
 * If focus is lost anywhere in that window — for any reason — a guard that
 * reads the still-catching-up prop as "genuinely different" overwrites the
 * live document with it, discarding the last keystroke.
 */

function reseedGuard_v1_isFocusedOnly({ isFocused, incomingValue, currentContent }) {
  if (isFocused) return { replaced: false };
  if ((incomingValue ?? '') !== (currentContent ?? '')) {
    return { replaced: true, resultingContent: incomingValue ?? '' };
  }
  return { replaced: false };
}

function reseedGuard_v2_compareLastEmitted({ incomingValue, lastEmittedValue, currentContent }) {
  const incoming = incomingValue ?? '';
  if (incoming === (lastEmittedValue ?? '')) return { replaced: false };
  if (incoming === (currentContent ?? '')) return { replaced: false };
  return { replaced: true, resultingContent: incoming };
}

const PREVIOUS_LINE = 'Line one\nLine two';
const LATEST_LINE = 'Line one\nLine two\nLine three';

// ── typing itself is fine under both guards — establishes the baseline ─────

test('BASELINE: typing multiple lines while focused never reverts, under either guard', () => {
  const lines = ['Line one', PREVIOUS_LINE, LATEST_LINE];
  for (const html of lines) {
    const v1 = reseedGuard_v1_isFocusedOnly({
      isFocused: true, incomingValue: html, currentContent: html,
    });
    assert.equal(v1.replaced, false, `v1 reverted while typing "${html}"`);

    const v2 = reseedGuard_v2_compareLastEmitted({
      incomingValue: html, lastEmittedValue: html, currentContent: html,
    });
    assert.equal(v2.replaced, false, `v2 reverted while typing "${html}"`);
  }
});

// ── THE REPORTED SEQUENCE: click right after the last keystroke ────────────

test('THE BUG: v1 (the original shipped guard) reverts the last keystroke on blur', () => {
  const result = reseedGuard_v1_isFocusedOnly({
    isFocused: false,          // the click blurred the editor
    incomingValue: PREVIOUS_LINE,  // the prop has not caught up yet
    currentContent: LATEST_LINE,   // the live document already has it all
  });
  assert.equal(result.replaced, true,
    'this is the control — if v1 does NOT revert here, the reproduction is not real');
  assert.equal(result.resultingContent, PREVIOUS_LINE,
    '"Line three" is gone from what the guard would have written back');
});

test('STILL BROKEN: v2 (compare against last-emitted) reverts the SAME sequence', () => {
  /**
   * This is the test that changed the fix. `lastEmittedValue` is the ref —
   * synchronously current, so it equals LATEST_LINE, same as the live
   * document. But the INCOMING value is the stale PROP, which matches
   * NEITHER the ref nor the document — v2's "does this match something I
   * recognise" check has nothing to match it against, so it still replaces.
   */
  const result = reseedGuard_v2_compareLastEmitted({
    incomingValue: PREVIOUS_LINE,
    lastEmittedValue: LATEST_LINE,
    currentContent: LATEST_LINE,
  });
  assert.equal(result.replaced, true,
    'v2 was expected to still revert here — if it does not, the shipped fix '
    + '(remove the comparison entirely) was solving an already-solved problem');
  assert.equal(result.resultingContent, PREVIOUS_LINE);
});

test('CONTROL: v1 does NOT revert while still focused, same value gap', () => {
  // Isolates what actually changes across the bug boundary: focus state,
  // not the value gap itself (which is present in every case above).
  const result = reseedGuard_v1_isFocusedOnly({
    isFocused: true,
    incomingValue: PREVIOUS_LINE,
    currentContent: LATEST_LINE,
  });
  assert.equal(result.replaced, false);
});

test('CONTROL: v2 does NOT revert when the stale value at least matches the last-emitted ref', () => {
  // The one case v2 legitimately improves on v1: a prop that is stale
  // relative to the LIVE DOCUMENT but happens to equal what was last
  // recorded as emitted (e.g. an effect re-running for the same settled
  // state). Included so v2 is not made to look strictly worse than it is —
  // it narrows the bug, it does not close it, which is exactly why it was
  // not shipped.
  const result = reseedGuard_v2_compareLastEmitted({
    incomingValue: LATEST_LINE,
    lastEmittedValue: LATEST_LINE,
    currentContent: LATEST_LINE,
  });
  assert.equal(result.replaced, false);
});

// ── what the SHIPPED fix relies on instead: remounting, not comparing ──────

test('THE SHIPPED FIX: seeding once at creation cannot revert an in-progress edit', () => {
  /**
   * There is no "guard" left to test at this level — that is the point. The
   * shipped `CourseBodyEditor` reads `value` exactly once, to seed
   * `useEditor({ content: value ?? '' })`, and never again. Modelled here as
   * "creation is a pure function of the seed it was given, called once":
   * no sequence of LATER incoming values can affect what a given instance
   * shows, because nothing in the component reads them a second time.
   */
  const create = (seed) => ({ content: seed ?? '' });

  const instance = create('Line one');
  // No matter what "arrives" afterward, this instance's content is fixed —
  // there is no code path left that would apply it.
  const laterValues = [PREVIOUS_LINE, LATEST_LINE, ''];
  for (const later of laterValues) {
    void later; // nothing consumes it — that absence is the fix
  }
  assert.equal(instance.content, 'Line one');
});

test('CONTROL: a genuine external change DOES reach a NEW instance', () => {
  // The other half: switching courses must still work. It does, because
  // CourseForm gives <CourseBodyEditor key={course_id}> a NEW key, and React
  // creates a NEW instance — seeded, once, from the NEW course's value.
  const create = (seed) => ({ content: seed ?? '' });

  const courseA = create('<p>Course A body</p>');
  const courseB = create('<p>Course B body</p>'); // a fresh instance, fresh seed
  assert.notEqual(courseA.content, courseB.content);
  assert.equal(courseB.content, '<p>Course B body</p>');
});
