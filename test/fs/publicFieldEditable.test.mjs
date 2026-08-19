import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE PUBLIC FORM AND THE PUBLIC ALLOWLIST NAME THE SAME FIELDS.
 *
 * ══ THIS GUARD DID NOT EXIST, AND A DEFECT WENT THROUGH THE GAP ═════════════
 *
 * Round 6 built the in-house version of this comparison
 * (fs/inhouseFieldEditable) because the in-house screen could not save anything.
 * THE PUBLIC SCREEN HAD NO EQUIVALENT, and one commit later it had the same
 * class of defect: `classDate`, `scheduleType` and `attendanceMode` were removed
 * from `updateRegistration`'s public allowlist — correctly, they belong to the
 * round action now — while the ข้อมูลคอร์ส card's free-text editor WAS LEFT IN
 * PLACE, still submitting all three.
 *
 * The whole suite stayed green. Every existing assertion asked whether the
 * controls RENDER, and they rendered perfectly; what had gone was the
 * relationship between what they send and what the server accepts. The symptom
 * was `ไม่มีข้อมูลที่จะอัปเดต` on save — loud, but only to whoever clicked.
 *
 * So this is the missing half of the pair, written after the fact and pointed at
 * the surface that had none. It is deliberately the SAME SHAPE as the in-house
 * one: neither side re-typed, both parsed from source.
 *
 * ══ WHY THE PARSE IS DIFFERENT FROM THE IN-HOUSE ONE ════════════════════════
 *
 * In-house exports its editable groups as functions, so that test calls them.
 * The public client holds its editable state as a dozen separate `useState`s and
 * builds payloads inline at each `save(...)` call. Exporting an equivalent
 * structure would be a refactor of a 1400-line component in service of a test.
 *
 * So the payload keys are read from the `save({ … })` CALL SITES, which is where
 * the client's promise to the server actually lives.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');
const CLIENT  = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');

/**
 * The PUBLIC branch of `updateRegistration` — everything after the in-house
 * allowlist's `else`.
 *
 * Bounded by the two markers rather than by brace matching: a regex cannot
 * balance the braces of a body full of object literals and arrow functions
 * (sourceScan's header, defect 6), and both ends are asserted so a rename fails
 * loudly instead of handing back a slice of something else.
 */
function publicBranch(code) {
  /**
   * BOUNDED ON CODE, NOT ON THE COMMENT THAT LABELS IT.
   *
   * The first draft started at `// Public editable fields` and found nothing:
   * `readSource().code` strips comments, so the marker was deleted before the
   * search ran. That is the standing "strip comments before matching" rule
   * biting from the other side — the usual failure is a comment satisfying an
   * assertion, and this is a comment being relied on as an anchor and vanishing.
   *
   * The anchors are now real statements: the in-house allowlist loop's closing
   * `else`, and the emptiness check that ends the whole block.
   */
  const marker = code.indexOf('const inhouseFields');
  assert.notEqual(marker, -1, 'the in-house allowlist is gone — the branch structure changed');
  const start = code.indexOf('} else {', marker);
  assert.notEqual(start, -1, 'the public branch of updateRegistration is gone');
  const end = code.indexOf('if (Object.keys(update).length === 0)', start);
  assert.notEqual(end, -1, 'the end of the public branch is gone');
  const body = code.slice(start, end);
  assert.ok(body.length > 400, `the public branch parsed to ${body.length} chars`);
  // …and it really is the PUBLIC branch, not a slice of the in-house one.
  assert.ok(body.includes('data.coordinator'), 'the slice does not contain the public coordinator branch');
  assert.ok(!body.includes('contactFirstName'), 'the slice reaches into the in-house allowlist');
  return body;
}

const PUBLIC_BRANCH = publicBranch(ACTIONS.code);

/**
 * Every top-level key the public branch reads off `data`.
 *
 * `data.invoice`, `data.coordinator`, … — the NESTED reads (`c.firstName`,
 * `inv.taxId`) are deliberately not collected: the allowlist accepts the whole
 * subdocument at the top level and copies its keys one at a time, so the
 * question this test asks is answered at the top level.
 */
const ACCEPTED = new Set([...PUBLIC_BRANCH.matchAll(/\bdata\.(\w+)/g)].map((m) => m[1]));

/**
 * Every top-level key the client submits through `save(…)`.
 *
 * ── TWO CALL SHAPES, AND MISSING THE SECOND MADE THE GUARD LIE ─────────────
 *
 * Most cards pass an inline literal — `save({ notes }, 'save-notes')`. The
 * INVOICE card does not: it builds the payload in a variable first, because the
 * value depends on a toggle —
 *
 *     const payload = requestInvoice && invoice ? { invoice } : { invoice: null };
 *     save(payload, 'save-invoice');
 *
 * A parser that only read `save({` found no `invoice` anywhere and then reported
 * it as an ACCEPTED-BUT-UNREACHABLE field — a false finding about the one card
 * whose payload is conditional. Exempting it would have hidden a real mismatch
 * on the most complex form on the screen.
 *
 * So an identifier argument is followed to its `const` and every object literal
 * in that expression is read. The payloads are flat at the top level, so a
 * brace-bounded slice is safe here in a way it is not for the action body.
 */
function submittedKeys(code) {
  const keys = new Set();
  /**
   * SPLIT ON COMMAS, do not match across them.
   *
   * A first draft used `/(?:^|,)\s*(\w+)\s*(?::|,|$)/g` and silently dropped
   * every OTHER key: the match CONSUMES the trailing comma, so the next key has
   * no leading `,` left to match against and `^` (no `m` flag) only ever matches
   * index 0. `{ a, b, c }` yielded `a` and `c`.
   *
   * It failed loudly here only because `attendeesCount` happened to be the
   * dropped one and the allowlist named it. Had the skipped key been one the
   * allowlist did not name, DIRECTION A would have gone quietly green — the
   * guard reporting "everything the form submits is accepted" while not having
   * looked at half of it.
   */
  const addFrom = (inner) => {
    for (const part of inner.split(',')) {
      const name = /^\s*(\w+)/.exec(part)?.[1];
      if (name) keys.add(name);
    }
  };

  for (const m of code.matchAll(/\bsave\(\s*([A-Za-z_$][\w$]*|\{[^}]*\})/g)) {
    const arg = m[1];
    if (arg.startsWith('{')) { addFrom(arg.slice(1, -1)); continue; }
    // An identifier: read the literals out of its declaration.
    const decl = new RegExp(String.raw`const ${arg}\s*=\s*([^;]+);`).exec(code);
    assert.ok(decl, `save() is passed \`${arg}\`, which has no const declaration this parser can find`);
    for (const lit of decl[1].matchAll(/\{([^}]*)\}/g)) addFrom(lit[1]);
  }
  return keys;
}

const SUBMITTED = submittedKeys(CLIENT.code);

// ── 0. Both sides parsed to something ───────────────────────────────────────

test('both sides parsed — neither set is empty', () => {
  // Without this, both directions below pass vacuously: ∅ ⊆ anything.
  assert.ok(ACCEPTED.size >= 5, `the allowlist parsed to only ${ACCEPTED.size} names: [${[...ACCEPTED]}]`);
  assert.ok(SUBMITTED.size >= 3, `the client parsed to only ${SUBMITTED.size} names: [${[...SUBMITTED]}]`);
});

test('CONTROL: the two parsers find the fields that ARE there', () => {
  for (const known of ['coordinator', 'attendees', 'invoice', 'notes']) {
    assert.ok(ACCEPTED.has(known), `the allowlist parser missed ${known}`);
  }
  for (const known of ['coordinator', 'attendees', 'notes']) {
    assert.ok(SUBMITTED.has(known), `the save-call parser missed ${known}`);
  }
});

// ── 1. DIRECTION A: a submitted field the allowlist does not accept ─────────

test('every field the public form submits is accepted by updateRegistration', () => {
  /**
   * THE ONE THAT WOULD HAVE CAUGHT THE ROUND EDITOR. It submitted `classDate`,
   * `scheduleType` and `attendanceMode` for one commit after they were removed
   * from the allowlist, and nothing anywhere said so.
   */
  const rejected = [...SUBMITTED].filter((f) => !ACCEPTED.has(f));
  assert.deepEqual(rejected, [],
    'these fields are submitted by a public edit card and are NOT read by '
    + `updateRegistration's public branch. The save cannot land: ${rejected.join(', ')}`);
});

// ── 2. DIRECTION B: an accepted field no form offers ────────────────────────

/**
 * Accepted by the action, not submitted through `save(...)`, with a reason each.
 *
 * An allowlist rather than an equality, because these are rulings — but each has
 * to be argued for in a diff rather than sliding in.
 */
const NOT_SUBMITTED_BY_SAVE = {
  // DERIVED BY THE ACTION from whether `invoice` is null — the card sends one
  // payload and the server sets both fields. It is one control, not two, and a
  // client that sent `requestInvoice` separately could contradict its own
  // invoice object.
  requestInvoice: 'derived by the action from the invoice payload',
};

test('every accepted public field is submitted by some card, or is a stated gap', () => {
  const unreachable = [...ACCEPTED].filter(
    (f) => !SUBMITTED.has(f) && !(f in NOT_SUBMITTED_BY_SAVE),
  );
  assert.deepEqual(unreachable, [],
    'these fields are writable by updateRegistration and no public card submits them — '
    + `the screen can display them and cannot change them: ${unreachable.join(', ')}`);
});

// ── 3. THE FOUR ROUND FIELDS ARE ON NEITHER SIDE ───────────────────────────

test('no round field is submitted through save() OR accepted by the allowlist', () => {
  /**
   * The round moves only through `updateRegistrationRound`, which takes an ID
   * and derives the rest. Both sides are asserted, because the defect this file
   * was written for was a MISMATCH — one side moved and the other did not — and
   * a guard that only watched one of them would have been just as blind.
   */
  for (const field of ['classId', 'classDate', 'scheduleType', 'attendanceMode']) {
    assert.ok(!ACCEPTED.has(field),
      `${field} is back in updateRegistration's public branch — the coupling hole is open`);
    assert.ok(!SUBMITTED.has(field),
      `${field} is submitted through save() — it must go through updateRegistrationRound`);
  }
});

test('the round IS still editable — through its own action', () => {
  // Without this, the assertion above is satisfied by a screen that lost the
  // ability to change a round entirely, which is the regression this UI work
  // exists to close.
  assert.match(CLIENT.code, /updateRegistrationRound\(doc\._id,\s*\{/,
    'the client no longer calls the round action at all');
  assert.match(CLIENT.code, /classId:\s*roundDraft\.classId/,
    'the round payload does not carry the chosen id');
  assert.ok(!/classDate:\s*/.test(CLIENT.code.slice(
    CLIENT.code.indexOf('updateRegistrationRound(doc._id'),
    CLIENT.code.indexOf('updateRegistrationRound(doc._id') + 400,
  )), 'the round payload carries a date label — the client must not send one');
});
