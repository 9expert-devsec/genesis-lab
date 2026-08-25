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

// ── the auto-complete that is deliberately absent ──────────────────────────

test('the hook does NOT auto-complete when the block clears, and says why', () => {
  // Specified, and not built: publish() clears `saving` between its flush and
  // its promote, so `blocked` is false while a write is still in flight. An
  // auto-complete would navigate away mid-publish, and nothing in the save path
  // is wired to an AbortController. Guarded so the reasoning is not lost.
  const { code, raw } = readSource(GUARD);
  // The precise claim: a departure is completed from EXACTLY ONE place, the
  // explicit confirmLeave. An auto-complete would be a second invocation site.
  // (An earlier probe here searched for an effect mentioning `!blocked`, which
  // matched the two legitimate early-returns the exit listeners already have —
  // a probe that reports a defect that is not there is its own bug.)
  const departures = code.match(/depart\?\.\(\)/g) ?? [];
  assert.equal(departures.length, 1, 'a departure is completed from more than one place');
  assert.match(
    code, /const confirmLeave = useCallback\(\(\) => \{[\s\S]{0,300}?depart\?\.\(\);/,
    'the one departure site is not confirmLeave'
  );
  assert.match(raw, /WHY THE DIALOG DOES NOT AUTO-COMPLETE/, 'the rationale is undocumented');
  assert.match(raw, /AbortController/, 'the missing-cancellation half of the reasoning is undocumented');
});
