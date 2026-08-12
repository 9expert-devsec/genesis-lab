import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAPSE_SHRINK_RATIO,
  PREVIEW_MAX_AGE_MS,
  VERDICT,
  assessBuild,
  assessReplace,
  assessPreview,
  permitsWrite,
  mirrorCollapseConfirmLabel,
  mirrorDeleteLabel,
  overrideLossLines,
  previewWindowNote,
} from '@/lib/cache-console/resetPlan';

/**
 * THE THREE RULINGS, EACH WITH THE ASSERTION THAT GOES RED IF IT IS REVERSED.
 *
 * Written before the actions, because that ordering is what has caught these
 * three rounds running and code review has caught none of them.
 *
 * "Reversed" is a stronger requirement than "broken". A test that only fails
 * when the code throws does not defend a ruling — the way these rulings get
 * lost is someone implementing the sensible-looking opposite (delete first then
 * rebuild; apply the shrink and log a warning; trust the numbers the client
 * sent). Each ruling below names the reversal it is defending against.
 */

// ══ RULING 1 — SYNC-THEN-REPLACE, NEVER DELETE-THEN-SYNC ═══════════════════

test('RULING 1 REVERSED: an incomplete build must NOT be allowed to replace', () => {
  // The reversal: treating "I got some rows" as good enough. An incomplete
  // build that still produced rows is the dangerous case precisely because it
  // looks like data — this is the 22-of-27-programs shape.
  const a = assessBuild({ complete: false, itemCount: 5 });
  assert.equal(a.verdict, VERDICT.REFUSE_INCOMPLETE);
  assert.equal(permitsWrite(a.verdict), false);
  assert.match(a.reason, /untouched/);
});

test('RULING 1 REVERSED: an EMPTY build must not be allowed to replace either', () => {
  const a = assessBuild({ complete: true, itemCount: 0 });
  assert.equal(a.verdict, VERDICT.REFUSE_EMPTY);
  assert.equal(permitsWrite(a.verdict), false);
});

test('CONTROL: a complete, non-empty build IS permitted', () => {
  // Without this, every assertion above passes against `assessBuild` returning
  // a refusal unconditionally — which would be safe and useless.
  const a = assessBuild({ complete: true, itemCount: 27 });
  assert.equal(a.verdict, VERDICT.OK);
  assert.equal(permitsWrite(a.verdict), true);
});

test('there is NO confirmation path out of an incomplete build', () => {
  /**
   * Deliberate asymmetry with the collapse guard, and the reason is worth
   * pinning: a shrink is a judgement an admin can legitimately overrule from a
   * number on screen; "I could not read upstream" is not. If a `confirmed`
   * flag ever starts opening this gate, that is the ruling being reversed.
   */
  for (const confirmed of [true, false]) {
    const a = assessBuild({ complete: false, itemCount: 5, confirmed });
    assert.equal(a.verdict, VERDICT.REFUSE_INCOMPLETE, `confirmed=${confirmed}`);
  }
});

// ══ RULING 2 — THE COLLAPSE GUARD ══════════════════════════════════════════

test('RULING 2 REVERSED: an empty incoming set is refused, and is NOT confirmable', () => {
  // The reversal that matters most: making empty just another confirmable
  // collapse. unwrap() cannot tell "no rows" from "unreadable response", so no
  // click should be able to turn that into a full purge.
  const unconfirmed = assessReplace({ beforeCount: 27, afterCount: 0 });
  assert.equal(unconfirmed.verdict, VERDICT.REFUSE_EMPTY);

  const confirmed = assessReplace({ beforeCount: 27, afterCount: 0, confirmed: true });
  assert.equal(
    confirmed.verdict, VERDICT.REFUSE_EMPTY,
    'confirming must NOT unlock an empty replace'
  );
  assert.equal(permitsWrite(confirmed.verdict), false);
});

test('RULING 2 REVERSED: a collapse does not apply without confirmation', () => {
  // The incident: 27 → 5 is an 81% loss.
  const a = assessReplace({ beforeCount: 27, afterCount: 5 });
  assert.equal(a.verdict, VERDICT.CONFIRM_COLLAPSE);
  assert.equal(permitsWrite(a.verdict), false);
  assert.equal(a.removed, 22);
  assert.match(a.reason, /22/, 'the refusal names the numbers');
  assert.match(a.reason, /27/);
});

test('a collapse DOES apply once confirmed — it is a gate, not a ban', () => {
  const a = assessReplace({ beforeCount: 27, afterCount: 5, confirmed: true });
  assert.equal(a.verdict, VERDICT.OK);
  assert.equal(permitsWrite(a.verdict), true);
});

test('an ordinary purge is NOT gated — the guard must stay rare to stay read', () => {
  // A dialog that always appears is a dialog that gets clicked through, and
  // then the one that mattered is clicked through too. 1 of 40 is routine.
  const a = assessReplace({ beforeCount: 40, afterCount: 39 });
  assert.equal(a.verdict, VERDICT.OK);
  assert.equal(a.removed, 1);
});

test('the threshold boundary is exclusive, and both sides are pinned', () => {
  // 20% of 40 is exactly 8. At the threshold: allowed. Past it: gated.
  const at = assessReplace({ beforeCount: 40, afterCount: 32 });
  assert.equal(at.shrinkRatio, COLLAPSE_SHRINK_RATIO);
  assert.equal(at.verdict, VERDICT.OK, 'exactly at the threshold is allowed');

  const past = assessReplace({ beforeCount: 40, afterCount: 31 });
  assert.ok(past.shrinkRatio > COLLAPSE_SHRINK_RATIO);
  assert.equal(past.verdict, VERDICT.CONFIRM_COLLAPSE, 'one row past it is gated');
});

test('the threshold is a RATIO, so it scales across collection sizes', () => {
  // Same absolute loss, different collections, different answers — which is the
  // whole reason it is not an absolute count. 3 rows out of 12 is a third of
  // career_paths; 3 out of 40 is routine housekeeping in faqs.
  assert.equal(assessReplace({ beforeCount: 12, afterCount: 9 }).verdict, VERDICT.CONFIRM_COLLAPSE);
  assert.equal(assessReplace({ beforeCount: 40, afterCount: 37 }).verdict, VERDICT.OK);
});

test('GROWTH is never gated', () => {
  const a = assessReplace({ beforeCount: 5, afterCount: 27 });
  assert.equal(a.verdict, VERDICT.OK);
  assert.equal(a.removed, 0);
  assert.equal(a.delta, 22);
});

test('an empty collection accepting its first rows is not a collapse', () => {
  // before 0 → any after. Dividing by zero here would produce NaN and a
  // comparison that is false for every input, silently disabling the guard.
  const a = assessReplace({ beforeCount: 0, afterCount: 10 });
  assert.equal(a.verdict, VERDICT.OK);
  assert.equal(a.shrinkRatio, 0);
});

test('0 → 0 is not an empty-purge refusal — there is nothing to lose', () => {
  const a = assessReplace({ beforeCount: 0, afterCount: 0 });
  assert.equal(a.verdict, VERDICT.OK);
});

test('missing or non-numeric counts do not silently disable the guard', () => {
  // NaN comparisons are all false, so a bad input must not read as "no shrink".
  const a = assessReplace({ beforeCount: 27, afterCount: undefined });
  assert.equal(a.verdict, VERDICT.REFUSE_EMPTY, 'unknown after is treated as empty');
  const b = assessReplace({});
  assert.equal(b.verdict, VERDICT.OK, '0 → 0 with nothing supplied');
});

test('the threshold is ONE named constant, in range, not a literal', () => {
  assert.equal(typeof COLLAPSE_SHRINK_RATIO, 'number');
  assert.ok(COLLAPSE_SHRINK_RATIO > 0 && COLLAPSE_SHRINK_RATIO < 1);
});

// ══ RULING 3 — PREVIEW BEFORE APPLY ════════════════════════════════════════

const NOW = 1_760_000_000_000;
const LIVE = { target: 'faqs', beforeCount: 40 };
const FRESH = { target: 'faqs', beforeCount: 40, issuedAt: NOW - 1_000 };

test('RULING 3 REVERSED: apply with NO preview is refused', () => {
  for (const p of [null, undefined, 'yes', 42]) {
    const a = assessPreview(p, LIVE, NOW);
    assert.equal(a.verdict, VERDICT.REFUSE_NO_PREVIEW, `preview=${JSON.stringify(p)}`);
    assert.equal(permitsWrite(a.verdict), false);
  }
});

test('RULING 3 REVERSED: a STALE preview is refused', () => {
  const stale = { ...FRESH, issuedAt: NOW - PREVIEW_MAX_AGE_MS - 1 };
  const a = assessPreview(stale, LIVE, NOW);
  assert.equal(a.verdict, VERDICT.REFUSE_STALE);
  assert.match(a.reason, /\d+ วินาที/, 'the refusal names the window');
});

test('CONTROL: exactly at the window is still accepted — the boundary is pinned', () => {
  // Without this, "stale is refused" would also pass against an implementation
  // that refused every preview.
  const edge = { ...FRESH, issuedAt: NOW - PREVIEW_MAX_AGE_MS };
  assert.equal(assessPreview(edge, LIVE, NOW).verdict, VERDICT.OK);
});

test('RULING 3 REVERSED: a preview whose world MOVED is refused, however fresh', () => {
  /**
   * The lost-update shape, and the part the time window does NOT cover: a cron
   * fired one second after the preview. The clock says fresh; the numbers on
   * the admin's screen describe a collection that no longer exists.
   */
  const drifted = assessPreview(FRESH, { target: 'faqs', beforeCount: 38 }, NOW);
  assert.equal(drifted.verdict, VERDICT.REFUSE_DRIFTED);
  assert.match(drifted.reason, /40/, 'names what the preview saw');
  assert.match(drifted.reason, /38/, 'and what is there now');
});

test('a preview for a DIFFERENT cache cannot be spent on this one', () => {
  const a = assessPreview({ ...FRESH, target: 'instructors' }, LIVE, NOW);
  assert.equal(a.verdict, VERDICT.REFUSE_WRONG_TARGET);
});

test('a preview from the FUTURE is refused rather than treated as fresh', () => {
  // A negative age would otherwise sail past a `age > MAX` check, so a clock
  // skew or a fabricated issuedAt would buy an unlimited window.
  const a = assessPreview({ ...FRESH, issuedAt: NOW + 60_000 }, LIVE, NOW);
  assert.equal(a.verdict, VERDICT.REFUSE_STALE);
});

test('a preview with no issuedAt at all is refused', () => {
  const a = assessPreview({ target: 'faqs', beforeCount: 40 }, LIVE, NOW);
  assert.equal(a.verdict, VERDICT.REFUSE_STALE);
});

test('CONTROL: a fresh, matching, correctly-targeted preview IS accepted', () => {
  const a = assessPreview(FRESH, LIVE, NOW);
  assert.equal(a.verdict, VERDICT.OK);
  assert.equal(permitsWrite(a.verdict), true);
});

test('the window is ONE named constant and is short', () => {
  assert.equal(typeof PREVIEW_MAX_AGE_MS, 'number');
  assert.ok(PREVIEW_MAX_AGE_MS > 0);
  assert.ok(
    PREVIEW_MAX_AGE_MS <= 10 * 60_000,
    'a "short declared window" — anything approaching a cron cadence is not one'
  );
});

test('permitsWrite is true for OK and false for EVERY refusal', () => {
  // The single chokepoint the actions branch on. A new verdict added without
  // being considered here would default to permitting the write if this were
  // written as a deny-list, so it is an allow-list of exactly one.
  assert.equal(permitsWrite(VERDICT.OK), true);
  for (const [name, v] of Object.entries(VERDICT)) {
    if (v === VERDICT.OK) continue;
    assert.equal(permitsWrite(v), false, `${name} must not permit a write`);
  }
});

// ══ LABELS FOR POST-CLICK STATES — the class round 5 found unassertable ════
//
// Every assertion below covers a string that used to live in a client
// component branch reachable only after a preview returned. Nothing could see
// them: renderToStaticMarkup reaches only the initial render, and no test may
// mount a React root (isolation:'none'). Round 5's control-break proved the
// gap by stripping numbers out of one such label and watching the suite stay
// green. These are the rest of that class, moved out and covered.

test('RULING REVERSED: the collapse confirm label names BOTH numbers', () => {
  // "ยืนยัน" beneath a table is a button people press having read the heading
  // and not the rows. What is being destroyed goes in the control's own label.
  const label = mirrorCollapseConfirmLabel({ doomedTotal: 35, beforeCount: 40 });
  assert.match(label, /35/, 'how many rows go');
  assert.match(label, /40/, 'and what they go from');
});

test('CONTROL: different numbers produce a different collapse label', () => {
  // Without this, "contains 35" passes for a hardcoded string.
  const label = mirrorCollapseConfirmLabel({ doomedTotal: 3, beforeCount: 12 });
  assert.match(label, /3/);
  assert.match(label, /12/);
  assert.ok(!label.includes('35'), 'the other fixture\'s number is gone');
});

test('RULING REVERSED: the ordinary delete label states the count', () => {
  const label = mirrorDeleteLabel({ doomedTotal: 7 });
  assert.match(label, /7/);
});

test('both mirror labels are total — malformed input does not throw', () => {
  // The component renders no button in those states, but a label that threw
  // would take down the panel that is the only route to the action.
  for (const bad of [undefined, null, {}, { doomedTotal: 'x' }]) {
    assert.equal(typeof mirrorCollapseConfirmLabel(bad), 'string');
    assert.equal(typeof mirrorDeleteLabel(bad), 'string');
  }
});

test('RULING REVERSED: the override loss list is ONE LINE PER SECTION', () => {
  /**
   * An ARRAY, not a joined string. A single line containing every number would
   * satisfy a `.includes` assertion while rendering as one unreadable run-on —
   * and the component maps over this, so the shape is the contract.
   */
  const lines = overrideLossLines([
    { section: 'programs', before: 25, after: 3, lost: 22, ratio: 0.88 },
    { section: 'banners', before: 15, after: 2, lost: 13, ratio: 0.867 },
  ]);
  assert.equal(lines.length, 2, 'one line per shrunken section');
  assert.match(lines[0], /programs/);
  assert.match(lines[0], /25/);
  assert.match(lines[0], /3/);
  assert.match(lines[0], /22/);
  assert.match(lines[0], /88/);
  assert.match(lines[1], /banners/);
});

test('the loss list derives `lost` when the caller did not supply it', () => {
  // The refusal record is Mixed in the schema; a row written by an older build
  // may carry before/after without lost.
  const [line] = overrideLossLines([{ section: 's', before: 10, after: 4, ratio: 0.6 }]);
  assert.match(line, /หายไป 6/);
});

test('an empty or malformed shrink list yields an empty list, not a throw', () => {
  for (const bad of [[], null, undefined, 'nope', 42]) {
    assert.deepEqual(overrideLossLines(bad), []);
  }
});

test('THE STALENESS COPY IS DERIVED FROM THE CONSTANT, never written out', () => {
  /**
   * Both components carried "ประมาณ 2 นาที" as prose beside a constant of
   * 120_000, with nothing holding the two together — raise or lower the window
   * and the UI would confidently state the old one. The window is a safety
   * property; the sentence describing it must not be able to disagree.
   */
  const note = previewWindowNote();
  assert.match(note, new RegExp(String(PREVIEW_MAX_AGE_MS / 60_000)), 'states the real window');
  assert.match(note, /นาที/);
  assert.match(note, /ปฏิเสธ/, 'and says what happens when it lapses');
});

test('CONTROL: the note tracks the constant rather than repeating a literal', () => {
  /**
   * The claim is that the sentence is COMPUTED. Proven by arithmetic on the
   * constant rather than by a second hardcoded number: whatever
   * PREVIEW_MAX_AGE_MS is, the note names that many minutes and not 2.
   */
  const minutes = PREVIEW_MAX_AGE_MS / 60_000;
  assert.equal(Number.isInteger(minutes), true, 'the window is a whole number of minutes today');
  assert.ok(previewWindowNote().includes(`${minutes} นาที`));
  // And if it were ever set to a non-multiple of a minute, the note falls back
  // to seconds rather than rounding a safety window in the copy.
  assert.match(previewWindowNote(), /\d+ (นาที|วินาที)/);
});

test('CONTROL: the note is COMPUTED — a different window gives a different note', () => {
  /**
   * The assertion the first draft of this section could not make. Hardcoding
   * `seconds = 120` inside the function produced a byte-identical string while
   * PREVIEW_MAX_AGE_MS happened to be 120_000, so severing the derivation
   * reddened nothing. Passing the window in is what makes "this tracks the
   * constant" observable rather than merely true today.
   */
  assert.match(previewWindowNote(300_000), /5 นาที/);
  assert.match(previewWindowNote(60_000), /1 นาที/);
  assert.ok(!previewWindowNote(300_000).includes('2 นาที'));
  // A window that is not a whole number of minutes falls back to seconds
  // rather than rounding a safety property in the copy.
  assert.match(previewWindowNote(90_000), /90 วินาที/);
});
