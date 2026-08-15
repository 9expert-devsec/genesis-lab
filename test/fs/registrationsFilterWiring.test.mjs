import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE SEAM THE PURE TESTS CANNOT SEE.
 *
 * test/pure/registrationRangeFilter and test/pure/inhouseStatusSingleSource
 * prove that the shared builders behave correctly. Neither can prove that the
 * two server actions actually CALL them — and that is precisely where the bug
 * lived: `getRegistrationStatusCounts` had a perfectly good date window that
 * `listRegistrations` never received, and both files were internally consistent
 * while the screen showed two different answers.
 *
 * `listRegistrations` and `getRegistrationStatusCounts` are `'use server'`
 * functions that call `requireAdmin` and open a Mongo connection on their first
 * line, so neither can be invoked from this runner. A source scan is the only
 * available proof that the wiring exists, and it is a real one: it fails the
 * moment either action goes back to hand-rolling its own filter.
 *
 * Read through sourceScan, which strips comments and import lines — so the
 * prose in these very files explaining the wiring cannot satisfy a matcher, and
 * neither can the `import` statement that names the helpers.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js').code;
const PAGE    = readSource('src/app/admin/registrations/page.jsx').code;
const CLIENT  = readSource('src/app/admin/registrations/_components/RegistrationsClient.jsx').code;

// ── 1. The range reaches the LIST query ─────────────────────────────────────

test('listRegistrations accepts a `range` argument', () => {
  const sig = /export async function listRegistrations\(\{([^}]*)\}/.exec(ACTIONS);
  assert.ok(sig, 'listRegistrations signature not found');
  assert.match(sig[1], /\brange\b/, 'listRegistrations does not take `range` — the date chips cannot reach it');
});

test('listRegistrations builds its filter with the shared builder', () => {
  assert.match(ACTIONS, /buildRegistrationFilter\(\s*\{[^}]*\brange\b/,
    'the list filter is not built from buildRegistrationFilter with a range');
});

test('the page passes `range` into listRegistrations, not only into the counts', () => {
  const call = /listRegistrations\(\{([^}]*)\}\)/.exec(PAGE);
  assert.ok(call, 'listRegistrations call not found in page.jsx');
  assert.match(call[1], /\brange\b/, 'page.jsx drops `range` on the way to the list query');
});

test('getRegistrationStatusCounts derives its window from the SAME helper', () => {
  assert.match(ACTIONS, /rangeToDateFilter\(\s*range\s*\)/,
    'the counts action no longer shares the list query’s date derivation');
});

/**
 * The hand-rolled window is GONE, not merely bypassed.
 *
 * A second copy left behind in the file is how the two derivations drift back
 * apart: the next edit lands on whichever one the author happened to read.
 */
test('no hand-rolled date window survives in the actions file', () => {
  assert.ok(!/setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(ACTIONS),
    'a hand-rolled midnight boundary is still in registrations.js');
  assert.ok(!/from\.setDate\(/.test(ACTIONS), 'a hand-rolled week boundary is still in registrations.js');
});

// ── 2. The statuses are counted from the array ──────────────────────────────

test('the counts action enumerates INHOUSE_STATUS_VALUES rather than naming statuses', () => {
  assert.match(ACTIONS, /INHOUSE_STATUS_VALUES\.map\(/,
    'per-status counting is not driven by the shared status array');
});

/**
 * NO IN-HOUSE STATUS IS NAMED AS A LITERAL in the actions file.
 *
 * This is the assertion that would have caught the original defect at its
 * source: the four `status: 'new'` / `'contacted'` / `'closed-won'` /
 * `'closed-lost'` literals were the reason `quoted` was never counted. A
 * literal here means somebody is enumerating statuses by hand again.
 *
 * `PUBLIC_STATUSES` is deliberately excluded from this rule — the public set is
 * a different list on a different collection and has not been consolidated.
 */
test('no in-house status value appears as a literal in the actions file', () => {
  // The retired five AND the live three. A `status: 'pending'` literal in this
  // file would be the same defect wearing the new vocabulary.
  const values = ['new', 'contacted', 'quoted', 'closed-won', 'closed-lost', 'pending', 'cancelled'];
  for (const value of values) {
    const literal = new RegExp(`status:\\s*'${value}'`);
    assert.ok(!literal.test(ACTIONS), `status: '${value}' is hand-named in registrations.js`);
  }
});

test('the write-side Set is derived from the shared values, not respelled', () => {
  assert.match(ACTIONS, /INHOUSE_STATUSES\s*=\s*new Set\(\s*INHOUSE_STATUS_VALUES\s*\)/,
    'the status allowlist is not derived from the shared array');
});

// ── 3. The client's two lists come from the builders ────────────────────────

/**
 * ── BUILT FROM THE PER-SOURCE SUBSET, NOT ARGUMENT-LESS ─────────────────────
 *
 * These matched `buildStatCards()` and `buildStatusChips()` — the argument-less
 * form — because in round 1 each source had its own module and the bare call
 * meant "this module's list".
 *
 * Round 2 folded both vocabularies into one module where the builders DEFAULT
 * TO PUBLIC. The bare call is now the bug rather than the fix: on an in-house
 * render it would build the public strip, ชำระแล้ว card and all, over a
 * collection that can never hold one — and every "one card per status"
 * assertion in the render tier would still pass, over the wrong vocabulary.
 *
 * So the rule inverted: the builders must be called WITH the resolved subset.
 */
test('the stat cards are built from the per-source subset', () => {
  assert.match(CLIENT, /buildStatCards\(sourceStatuses\)/, 'statCards is not built from the resolved subset');
  assert.ok(!/buildStatCards\(\s*\)/.test(CLIENT), 'the argument-less form defaults to the PUBLIC list');
});

test('the filter chips are built from the same subset', () => {
  assert.match(CLIENT, /buildStatusChips\(sourceStatuses\)/, 'statusOptions is not built from the resolved subset');
  assert.ok(!/buildStatusChips\(\s*\)/.test(CLIENT), 'the argument-less form defaults to the PUBLIC list');
});

test('the subset is resolved ONCE, from `source`', () => {
  // Two `statusesForSource(source)` calls would be two places to get it wrong,
  // and getting it wrong means a chip whose card is missing — the original
  // defect, rebuilt from newer parts.
  assert.match(CLIENT, /const sourceStatuses\s*=\s*statusesForSource\(source\)/);
  assert.equal((CLIENT.match(/statusesForSource\(/g) ?? []).length, 1,
    'the per-source list must be resolved exactly once');
});

/**
 * No in-house status LABEL is written into the client any more.
 *
 * The labels were the visible half of the drift — `ส่งใบเสนอราคาแล้ว` existed in
 * the chip list and in no card. If a label reappears here it means a list was
 * hand-written again, whatever it is called.
 */
test('no in-house status label is hard-coded in the list client', () => {
  // The five original in-house labels PLUS the three the collapse replaced them
  // with. Keeping the retired five is not dead weight: a well-meaning "restore
  // the old wording" edit is exactly the shape this guards, and they are the
  // strings that would be pasted back.
  const labels = [
    'ใหม่', 'ติดต่อแล้ว', 'ส่งใบเสนอราคาแล้ว', 'ปิดงานสำเร็จ', 'ไม่สำเร็จ',
    'รอดำเนินการ', 'ยกเลิก',
  ];
  for (const label of labels) {
    assert.ok(!CLIENT.includes(label), `the label ${label} is hard-coded in RegistrationsClient`);
  }
});

/**
 * THE GRID IS DERIVED FROM THE CARD COUNT.
 *
 * `grid-cols-5` over a six-card set is what left the sixth status with nowhere
 * to render. A fixed column count is wrong for any list whose length is data.
 */
test('the stat strip has no fixed column count', () => {
  assert.ok(!/grid-cols-\d/.test(CLIENT), 'a fixed grid-cols-N is back on the stat strip');
});

test('the stat strip sizes its columns from statCards.length', () => {
  assert.match(CLIENT, /gridTemplateColumns[\s\S]{0,80}statCards\.length/,
    'the column count is not derived from the number of cards');
});

/**
 * CONTROL: these matchers CAN fail.
 *
 * Every assertion above is a `match`/`ok` over one file, and a typo in a path
 * would make `readSource` throw rather than silently pass — but a matcher
 * pointed at the wrong CONTENT fails quietly-green forever. This proves the
 * three sources actually contain code, and that the scrubber has not reduced
 * them to comments-only.
 */
test('CONTROL: the scanned sources are real, non-empty code', () => {
  for (const [name, src] of [['actions', ACTIONS], ['page', PAGE], ['client', CLIENT]]) {
    assert.ok(src.length > 400, `${name} scrubbed to ${src.length} chars — the scan is inert`);
  }
  assert.match(ACTIONS, /export async function listRegistrations/);
  assert.match(CLIENT, /export function RegistrationsClient/);
});
