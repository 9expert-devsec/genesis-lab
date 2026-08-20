import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
// The ONE enumeration of the shared scope's dimensions. Imported rather than
// restated: a second copy here would be a second place to forget a dimension,
// which is the entire defect this file now guards against.
import { SCOPE_PARAMS } from '@/lib/registrations/listFilter';

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

/**
 * One exported action's body, bounded at the NEXT export.
 *
 * ── NOT `/export async function X\([\s\S]*?\n\}/`, AND THAT IS MEASURED ────
 * That was the shape here until round 8, and it broke the moment three of these
 * actions took multi-line destructured parameters: the non-greedy `\n}` stops at
 * the PARAMS' closing brace, so the "body" became the signature and every
 * assertion inside it failed on correct code.
 *
 * A second instance of the standing mechanism in test/sourceScan.mjs — an
 * assertion bound to the shape of an expression stops applying when the
 * expression is reformulated, and a signature spread over three lines is a
 * reformulation. Bounding on the next `export` is what the other guard files in
 * this suite already do, for this reason.
 */
function actionBody(name) {
  const start = ACTIONS.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} not found in the actions file`);
  const rest = ACTIONS.slice(start + 1);
  const next = rest.indexOf('export async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

// ── 0. EVERY DIMENSION REACHES EVERY CONSUMER ───────────────────────────────
//
// ══ THE GUARD THAT SHOULD HAVE CAUGHT `q`, AND DID NOT ══════════════════════
//
// This file's original tests are all of the form "`range` reaches X". Three of
// them, one per consumer, hand-written after the range defect was found. They
// were correct and they were useless against the NEXT dimension: nothing here
// ever asked whether the SET of filter dimensions was the same in all four
// places, so `q` — which the cards and the badges had never received — was not
// absent from the code by accident so much as absent from the ENUMERATION.
//
// A dimension nobody wrote a test for was a dimension with no test. That is the
// standing vacuity mechanism in its per-name costume: the guards were bound to
// the names that existed when they were written.
//
// So the set is derived from ONE source — `SCOPE_PARAMS`, exported beside
// `buildRegistrationScope` — and these tests read it. Adding a sixth dimension
// to the scope without threading it reddens here, with no test written for it.

test('every SCOPE_PARAM is accepted by all three query actions', () => {
  const sig = (name) => {
    const at = ACTIONS.indexOf(`export async function ${name}(`);
    assert.notEqual(at, -1, `${name} not found`);
    const open = ACTIONS.indexOf('{', at);
    const close = ACTIONS.indexOf('}', open);
    return ACTIONS.slice(open, close);
  };
  for (const action of ['listRegistrations', 'getRegistrationStatusCounts', 'getRegistrationTotal']) {
    const params = sig(action);
    for (const dim of SCOPE_PARAMS) {
      assert.match(params, new RegExp(`\\b${dim}\\b`),
        `${action} does not accept \`${dim}\` — that filter cannot reach it, and the number it `
        + 'produces will disagree with every other number on the screen');
    }
  }
});

test('every SCOPE_PARAM is PASSED by the page to all three', () => {
  /**
   * Accepting a parameter and being given one are different facts, and the `q`
   * defect was the second: both actions had a `q` in scope through the builder
   * the whole time — page.jsx simply never sent it.
   */
  for (const call of ['listRegistrations', 'getRegistrationStatusCounts', 'getRegistrationTotal']) {
    const m = new RegExp(`${call}\\(\\{([^}]*)\\}\\)`).exec(PAGE);
    assert.ok(m, `${call} call not found in page.jsx`);
    for (const dim of SCOPE_PARAMS) {
      assert.match(m[1], new RegExp(`\\b${dim}\\b`),
        `page.jsx drops \`${dim}\` on the way to ${call} — the numbers it feeds would ignore that filter`);
    }
  }
});

test('CONTROL: the enumeration is real, and the probe can miss a dimension', () => {
  /**
   * Two ways this pair could be vacuous: an EMPTY `SCOPE_PARAMS` satisfies every
   * loop above, and a matcher that matches anything satisfies them on a call
   * site that passes nothing.
   */
  assert.ok(SCOPE_PARAMS.length >= 5, `SCOPE_PARAMS holds only ${SCOPE_PARAMS.length} dimensions`);
  assert.ok(SCOPE_PARAMS.includes('q'), 'the dimension that leaked is not in the enumeration');
  assert.ok(!SCOPE_PARAMS.includes('source'),
    '`source` is in the enumeration — it selects the collection and is not a filter');

  // The matcher really would miss one: a call site naming four of the five.
  const short = 'q, range, from, to';
  assert.equal(/\bcourse\b/.test(short), false, 'the probe cannot see a missing dimension');
  assert.ok(/\bq\b/.test(short), 'the probe cannot see a present one either — it matches nothing');
});

// ── 1. The range reaches the LIST query ─────────────────────────────────────
//
// The original per-name tests are KEPT below rather than folded into the set
// check above. They are redundant with it by construction — but each names the
// SYMPTOM its dimension produced, and the set check names none. A future reader
// hitting a red set check learns that `course` is missing; these say what that
// looked like on screen the last time it happened.

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

/**
 * ── THE TOGGLE'S OTHER-SOURCE BADGE: PARALLEL, AND RANGE-FILTERED ───────────
 *
 * Two separate claims, and the second is the one that matters for the reader.
 *
 * PARALLEL: the brief was explicit that this joins the existing `Promise.all`
 * rather than becoming a sequential `await`. A serial round-trip added to a page
 * that already does three is a measurable cost for one integer, and "add it to
 * the Promise.all" is the kind of instruction that is followed on the day and
 * quietly undone by the next edit. Asserted by finding the call INSIDE the
 * array literal, not merely somewhere in the file.
 *
 * RANGE-FILTERED: the mockup shows raw totals. A badge reading 8 beside a
 * ทั้งหมด card reading 1 under "7 วัน" is one screen answering one question two
 * ways — which is the exact defect class this file was created for, when the
 * date chips filtered the cards and not the table. So the call must pass
 * `range`, and the action must apply it.
 */
test('the other source’s total is fetched IN the Promise.all, not awaited after it', () => {
  const all = /Promise\.all\(\[([\s\S]*?)\]\)/.exec(PAGE);
  assert.ok(all, 'page.jsx no longer has a Promise.all to join');
  assert.match(all[1], /getRegistrationTotal\(/,
    'the toggle badge query is not inside the Promise.all — it is a serial await');
});

test('the toggle badge follows the SAME range filter as everything else', () => {
  const call = /getRegistrationTotal\(\{([^}]*)\}\)/.exec(PAGE);
  assert.ok(call, 'getRegistrationTotal call not found in page.jsx');
  assert.match(call[1], /\brange\b/,
    'the toggle badge is fetched without `range` — it would show a raw total beside range-filtered cards');
  assert.match(call[1], /source:\s*otherSource/,
    'the badge query does not ask for the OTHER source — it would duplicate counts.total');
});

test('getRegistrationTotal applies the shared SCOPE, not just the shared date', () => {
  /**
   * ══ RE-POINTED IN ROUND 8, AND THE CLAIM GOT STRONGER ═════════════════════
   *
   * This asserted `rangeToDateFilter(range)`. Round 8 added a custom date range
   * and a course filter, so the date stopped being the only shared dimension —
   * and a toggle badge reading 39 beside a table filtered to one course is the
   * same defect this test was written for, arriving through a dimension it could
   * not see.
   *
   * The claim is therefore widened rather than moved: the total must share the
   * list query's WHOLE non-status scope, which is `buildRegistrationScope`. A
   * date-only assertion would now pass on an action that ignored the course.
   *
   * ── AND IT WENT RED WHEN THE EXPRESSION MOVED, WHICH IS THE POINT ────────
   * This is the standing vacuity case (test/sourceScan.mjs, defect 7) behaving
   * as it should for once: an fs assertion bound to the shape of an expression
   * SHOULD go red when that expression is reformulated, so a human re-reads it.
   * It did, and this is the re-read.
   */
  const body = actionBody('getRegistrationTotal');
  assert.match(body, /buildRegistrationScope\(/,
    'the total action hand-rolls its window instead of sharing the list query’s scope');
  // Every dimension reaches it — a scope call that forgot one would still match
  // the line above.
  for (const dim of ['range', 'from', 'to', 'course', 'source']) {
    assert.match(body, new RegExp(`\\b${dim}\\b`),
      `the total action does not take \`${dim}\` — its badge would ignore that filter`);
  }
});

test('CONTROL: the Promise.all extractor really reads the array, not the file', () => {
  // Every assertion above is a `match` inside a slice. If the slice were the
  // whole file they would all pass on a sequential await sitting below the
  // Promise.all — which is the exact thing the first test claims to forbid.
  const all = /Promise\.all\(\[([\s\S]*?)\]\)/.exec(PAGE);
  assert.ok(all[1].length < PAGE.length / 2, 'the extracted array is most of the file — the bound is wrong');
  assert.ok(!/const lastEdited/.test(all[1]),
    'the slice reaches past the Promise.all into the serial audit query below it');
  // And it can see something that IS in there, so it is not empty.
  assert.match(all[1], /listRegistrations\(/);
});

test('getRegistrationStatusCounts derives its scope from the SAME helper', () => {
  /**
   * RE-POINTED with `getRegistrationTotal` above, for the same reason and onto
   * the same helper. The cards, the toggle badges and the table now share every
   * non-status dimension rather than only the date.
   *
   * ── ASSERTED INSIDE THE ACTION, NOT PAGE-WIDE ─────────────────────────────
   * The old form matched anywhere in the file, so it would have been satisfied
   * by any other action using the helper. Bounded now, because after this change
   * there are two callers and a page-wide match cannot tell which one it found.
   */
  const body = actionBody('getRegistrationStatusCounts');
  assert.match(body, /buildRegistrationScope\(/,
    'the counts action no longer shares the list query’s scope derivation');
  for (const dim of ['range', 'from', 'to', 'course']) {
    assert.match(body, new RegExp(`\\b${dim}\\b`),
      `the counts action does not take \`${dim}\` — its cards would ignore that filter`);
  }
});

test('the shared scope reaches the LIST query too, or the three disagree', () => {
  /**
   * The third consumer. Two of the three sharing a helper while the list built
   * its own is the original defect: cards reading ทั้งหมด 1 above a table listing
   * every row. `buildRegistrationFilter` is the scope PLUS a status clause, so
   * this is asserted at the builder rather than at the action.
   */
  const list = actionBody('listRegistrations');
  assert.match(list, /buildRegistrationFilter\(\{[^}]*\bcourse\b[^}]*\}\)/,
    'the list query does not pass the course — the table would ignore it');
  assert.match(list, /buildRegistrationFilter\(\{[^}]*\bfrom\b[^}]*\}\)/,
    'the list query does not pass the custom range');

  // And `rangeToDateFilter` is no longer reachable from this file at all, so a
  // narrower second derivation cannot creep back beside the shared one.
  assert.equal(/rangeToDateFilter\(/.test(ACTIONS), false,
    'the narrower date-only helper is back in the actions file');
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

/**
 * ── THE CHIP ROW IS GONE, AND THIS TEST IS ITS REPLACEMENT ──────────────────
 *
 * This asserted `buildStatusChips(sourceStatuses)`. There are no chips any more:
 * the row duplicated the overview CARDS one for one — same statuses, same
 * navigate targets, same selected state, ทั้งหมด doing exactly what the ทั้งหมด
 * chip did — so it was deleted and the cards are the only status filter.
 *
 * THE ASSERTION IS INVERTED RATHER THAN DELETED. A removed test leaves the
 * screen free to grow a second status control again, which is the drift this
 * file exists for; an inverted one reddens the moment somebody adds one back and
 * says, in its message, where the filter lives now.
 *
 * `buildStatusChips` itself is deliberately NOT deleted from the status module.
 * It is a pure builder with its own tests, it is the shape the masterclass and
 * career-path screens would derive from if they are ever folded onto this
 * module, and deleting it would mean deleting coverage to remove four lines. It
 * simply has no caller on this screen, and the assertion below is what says so.
 */
test('no status chip row survives — the cards are the only status filter', () => {
  assert.ok(
    !/buildStatusChips/.test(CLIENT),
    'the status chip row is back in RegistrationsClient. It duplicates the overview '
    + 'cards one for one — same statuses, same targets, same selected state. If a '
    + 'SECOND status control is genuinely wanted, say so deliberately rather than '
    + 'letting one reappear beside the cards.',
  );
  // …and the cards, which are what it delegates to, are still built and still
  // built from the subset. Without this the assertion above would pass on a
  // screen that had lost BOTH controls.
  assert.match(CLIENT, /buildStatCards\(sourceStatuses\)/,
    'the cards are gone too — there is now no status filter on the screen at all');
});

/**
 * NO ตัวกรอง BUTTON EITHER.
 *
 * The mockup's panel header is a 390px search field, an 8px gap and a 79px
 * filter button. With the chips gone the button has nothing to disclose, and a
 * control that opens nothing is the dead-control defect this suite caught twice
 * by asserting on ELEMENTS rather than on text. The search field takes the whole
 * 477px instead.
 *
 * Asserted on the panel, not the client, because that is where the header lives.
 */
test('the panel header builds no filter button', () => {
  const panel = readSource('src/app/admin/registrations/_components/ListPanel.jsx');
  assert.ok(
    !panel.code.includes('ตัวกรอง'),
    'a ตัวกรอง control is in the panel header code. With the status chips gone there '
    + 'is nothing for it to open — build it when a non-status filter exists to attach it to.',
  );
  // The search field really does take the full group width, so this is not
  // passing because the whole right-hand group vanished.
  assert.match(panel.code, /w-\[477px\]/, 'the search group is not the full 477px');
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
