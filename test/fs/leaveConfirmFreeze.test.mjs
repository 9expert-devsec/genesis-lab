import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * The leave dialog's freeze and its confirm label, guarded against SHAPE.
 *
 * ── WHY NOT RENDERED ───────────────────────────────────────────────────────
 * LeaveConfirmDialog's content is inside a Radix `Dialog.Portal`, which emits
 * NOTHING under renderToStaticMarkup — the same constraint round 5 hit with
 * PublishDialog's note and the discard confirm. Asserting on that markup would
 * compare two empty strings and pass while proving nothing. So this reuses that
 * round's compromise rather than inventing a new one: a probe per claim, each
 * paired with a DISCRIMINATION control that asserts the same probe comes out
 * the other way on the pre-change shape.
 *
 * The BEHAVIOUR underneath is tested for real in test/pure/leaveAttempt, which
 * drives beginAttempt/attemptView across a sequence of renders. What can only
 * be checked here is that the hook and the dialog actually use them.
 */

const GUARD = 'src/components/pageBuilder/editor/useLeaveGuard.js';
const DIALOG = 'src/components/pageBuilder/editor/LeaveConfirmDialog.jsx';
const DECISION = 'src/lib/pageBuilder/leaveGuard.js';

// ── the hook freezes, and freezes ONLY the copy ────────────────────────────

test('the hook holds one attempt object and derives pending/reason from it', () => {
  const { code } = readSource(GUARD);
  assert.match(code, /const \[attempt, setAttempt\] = useState\(null\);/, 'the attempt state is gone');
  assert.match(
    code, /const \{ pending, reason: shownReason \} = attemptView\(attempt, reason\);/,
    'pending/reason are no longer derived from the attempt'
  );
  // The old free-standing pending state must be GONE, not sitting beside it.
  assert.equal(
    /const \[pending, setPending\]/.test(code), false,
    'the old pending state is still there — two sources for one fact'
  );
  assert.equal(countCallSites(code, 'setPending'), 0, 'setPending still has call sites');
});

test('CONTROL: the probe rejects the PRE-CHANGE shape', () => {
  const before = 'const [pending, setPending] = useState(null);\n      setPending(\'back\');';
  assert.equal(/const \[attempt, setAttempt\] = useState\(null\);/.test(before), false);
  assert.equal(/const \[pending, setPending\]/.test(before), true, 'the probe cannot see the old shape at all');
});

test('both exits capture the reason at the moment they open', () => {
  const { code } = readSource(GUARD);
  // Captured from the REF, not from a closed-over render value: these listeners
  // are registered once, so a direct `reason` would be the reason as of mount.
  assert.match(code, /setAttempt\(beginAttempt\('back', reasonRef\.current\)\)/, 'the back exit does not capture');
  assert.match(code, /setAttempt\(beginAttempt\('link', reasonRef\.current\)\)/, 'the link exit does not capture');
  assert.match(code, /const reasonRef = useRef\(reason\);/, 'the live-reason ref is gone');
  // countCallSites also matches the `export function beginAttempt(` DECLARATION
  // — its regex only excludes a preceding `.`/word char, not the `function`
  // keyword — so counting invocations means counting the invocation form.
  assert.equal((code.match(/beginAttempt\('/g) ?? []).length, 2, 'an exit opens an attempt without capturing');
});

test('CONTROL: capturing from the render value instead of the ref is rejected', () => {
  // The bug this shape avoids: a listener registered once reads the reason as of
  // MOUNT, which is a different wrong value from the live one, not a fix.
  const stale = "setAttempt(beginAttempt('back', reason));";
  assert.equal(/setAttempt\(beginAttempt\('back', reasonRef\.current\)\)/.test(stale), false);
});

test('closing releases the freeze, so the next attempt captures fresh', () => {
  const { code } = readSource(GUARD);
  // Both exits from the dialog — confirm and cancel — must clear it.
  const clears = code.match(/setAttempt\(null\);/g) ?? [];
  assert.equal(clears.length, 2, 'confirmLeave and cancelLeave do not both clear the attempt');
  assert.match(code, /const confirmLeave = useCallback\(\(\) => \{[\s\S]{0,200}?setAttempt\(null\);/);
  assert.match(code, /const cancelLeave = useCallback\(\(\) => \{[\s\S]{0,200}?setAttempt\(null\);/);
});

test('`blocked` stays LIVE — only the copy is frozen', () => {
  const { code } = readSource(GUARD);
  // The listeners must keep seeing real state; freezing `blocked` would leave
  // the guard interposing on a page with nothing left to protect.
  assert.match(code, /const blocked = shouldBlockLeave\(state\);/, 'blocked is no longer computed live');
  assert.match(
    code, /return \{ blocked, reason: shownReason, pending, confirmLeave, cancelLeave \};/,
    'the hook returns the wrong reason, or froze blocked too'
  );
});

test('the pure decision module is UNTOUCHED by this round', () => {
  // Explicitly out of scope: what counts as dirty/saving/conflict is settled.
  const { code } = readSource(DECISION);
  assert.match(code, /export function leaveBlockReason\(state\) \{/);
  assert.match(code, /if \(conflict\) return 'conflict';/);
  assert.match(code, /if \(saving\) return 'saving';/);
  assert.match(code, /if \(dirty\) return 'dirty';/);
  assert.match(code, /export function shouldBlockLeave\(state\) \{/);
  assert.match(code, /return leaveBlockReason\(state\) !== null;/);
});

// ── the confirm label ──────────────────────────────────────────────────────

test('the confirm label is per-reason, and only `saving` differs', () => {
  const { code } = readSource(DIALOG);
  // EXACT map, not a substring sweep: 'ออกตอนนี้' and 'ออกโดยไม่บันทึก' both begin
  // with 'ออก', so a bare includes() cannot tell which label a file carries.
  assert.match(code, /const CONFIRM_LABEL = \{\s*saving: 'ออกตอนนี้',\s*\};/, 'the saving label is missing or reworded');
  assert.match(code, /const DEFAULT_CONFIRM_LABEL = 'ออกโดยไม่บันทึก';/, 'the default label changed');
  assert.match(
    code, /\{CONFIRM_LABEL\[reason\] \?\? DEFAULT_CONFIRM_LABEL\}/,
    'the button does not select its label by reason'
  );
  // dirty and conflict must NOT have entries — they keep the default, which is
  // accurate for both.
  assert.equal(/CONFIRM_LABEL = \{[\s\S]*?\bdirty\s*:/.test(code), false, 'dirty got its own label');
  assert.equal(/CONFIRM_LABEL = \{[\s\S]*?\bconflict\s*:/.test(code), false, 'conflict got its own label');
});

test('CONTROL: the probe rejects a hardcoded label', () => {
  // The pre-change shape: one blunt string for all three reasons.
  const before = '              ออกโดยไม่บันทึก\n            </button>';
  assert.equal(/\{CONFIRM_LABEL\[reason\] \?\? DEFAULT_CONFIRM_LABEL\}/.test(before), false);
});

test('the DESCRIPTION strings are untouched — only the button overclaimed', () => {
  const { code } = readSource(DIALOG);
  // All three keep their exact wording; the 'saving' one already hedges with
  // "อาจ" (may), which is what made the blunt button the mismatch.
  assert.ok(code.includes('กำลังบันทึกอยู่ ยังไม่เสร็จ — ถ้าออกตอนนี้ การบันทึกอาจถูกยกเลิกกลางคัน และงานที่ค้างอยู่มีอยู่แค่ในแท็บนี้เท่านั้น'));
  assert.ok(code.includes('ยังมีการแก้ไขที่ยังไม่ได้บันทึก — งานที่ค้างอยู่มีอยู่แค่ในแท็บนี้เท่านั้น ออกไปแล้วจะไม่สามารถกู้คืนได้'));
  assert.ok(code.includes('การแก้ไขนี้ชนกับการแก้ไขของคนอื่น ระบบจึงหยุดบันทึกอัตโนมัติไปแล้ว — งานที่ค้างอยู่มีอยู่แค่ในแท็บนี้เท่านั้น ออกไปแล้วจะหายทั้งหมด'));
});

// ── departure: TWO entry points, ONE implementation ────────────────────────

test('a departure has exactly two entry points and exactly one implementation', () => {
  // Round 6 asserted ONE entry point, because auto-complete did not exist yet.
  // Round 8 adds the second — and note what did NOT change: `depart?.()` is
  // still called from exactly one place, because the effect goes through
  // confirmLeave rather than reimplementing it. The count that would have moved
  // if departure had been duplicated is the count that stayed put.
  const { code } = readSource(GUARD);

  // THE IMPLEMENTATION — one, inside confirmLeave.
  const departures = code.match(/depart\?\.\(\)/g) ?? [];
  assert.equal(departures.length, 1, 'a departure is COMPLETED from more than one place');
  assert.match(
    code, /const confirmLeave = useCallback\(\(\) => \{[\s\S]{0,300}?depart\?\.\(\);/,
    'the one departure site is not confirmLeave'
  );

  // THE ENTRY POINTS — exactly two, named:
  //   1. manual — confirmLeave handed to EditorShell, which binds it to the
  //      dialog's confirm button;
  //   2. auto   — the block-clear effect in this file.
  // Anything else invoking confirmLeave, here or by a second returned alias, is
  // a third entry point and fails this.
  const invocations = code.match(/(?<![.\w$])confirmLeave\(\)/g) ?? [];
  assert.equal(invocations.length, 1, 'confirmLeave is invoked from somewhere other than the auto-complete effect');
  assert.match(
    code, /useEffect\(\(\) => \{\s*if \(shouldAutoComplete\(\{ pending, blocked \}\)\) confirmLeave\(\);\s*\}, \[pending, blocked, confirmLeave\]\);/,
    'the auto entry point is missing, or is not gated on shouldAutoComplete'
  );
  const returned = code.match(/return \{ blocked, reason: shownReason, pending, confirmLeave, cancelLeave \};/g) ?? [];
  assert.equal(returned.length, 1, 'the manual entry point is not handed out exactly once');
});

test('CONTROL: a THIRD entry point is caught', () => {
  // The probe run over a file that grew one more caller. Both halves must
  // reject it — an extra confirmLeave() call AND an extra depart?.() — because
  // a third site could arrive as either shape.
  const extraCaller = 'if (somethingElse) confirmLeave();\n    if (shouldAutoComplete({ pending, blocked })) confirmLeave();';
  assert.equal(
    (extraCaller.match(/(?<![.\w$])confirmLeave\(\)/g) ?? []).length, 2,
    'the probe cannot see a second invocation at all'
  );
  const extraImpl = 'depart?.();\n  const other = departRef.current;\n  other?.();\n  depart?.();';
  assert.notEqual(
    (extraImpl.match(/depart\?\.\(\)/g) ?? []).length, 1,
    'the probe cannot see a duplicated departure implementation'
  );
});

test('CONTROL: the probe does not count the declaration as an invocation', () => {
  // `const confirmLeave = useCallback(() => {` is not a call site. A probe that
  // counted it would report two entry points on a correct file and one on a
  // broken one — backwards, and green in the wrong direction.
  const decl = 'const confirmLeave = useCallback(() => {';
  assert.deepEqual(decl.match(/(?<![.\w$])confirmLeave\(\)/g), null);
});

test('the auto-complete gate reads the LIVE block, not the frozen reason', () => {
  // The freeze governs what the dialog SAYS; this governs whether there is
  // still anything to say it about. Gating on the frozen reason would leave the
  // dialog up forever, since a frozen value never changes by definition.
  const { code } = readSource(GUARD);
  assert.match(code, /shouldAutoComplete\(\{ pending, blocked \}\)/, 'the gate is not reading the live blocked');
  assert.equal(
    /shouldAutoComplete\(\{ pending, (reason|shownReason) \}\)/.test(code), false,
    'the gate is reading a frozen value, which never changes'
  );
});

test('the rationale for auto-completing, and for why it was unsafe before, is recorded', () => {
  // This block is the only place the round-6 -> round-7 -> round-8 ordering is
  // written down: the deferral, its precondition, and why the precondition is
  // now met. Losing it loses why the effect is allowed to exist.
  const { raw } = readSource(GUARD);
  assert.match(raw, /AUTO-COMPLETING A DEPARTURE ONCE THERE IS NOTHING LEFT TO LOSE/);
  assert.match(raw, /WHY THIS WAS UNSAFE UNTIL ROUND 7/, 'the deferral and its precondition are undocumented');
  assert.match(raw, /A CONFLICTED SESSION NEVER REACHES THIS/, 'the conflict argument is undocumented');
  assert.match(raw, /publishing/, 'the round-7 mechanism this depends on is not named');
});
