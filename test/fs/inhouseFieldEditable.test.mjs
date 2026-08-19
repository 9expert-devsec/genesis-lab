import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';
import {
  INHOUSE_EDITABLE_GROUPS,
} from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';

/**
 * THE IN-HOUSE FORM AND THE IN-HOUSE ALLOWLIST NAME THE SAME FIELDS.
 *
 * ══ THE DEFECT THIS EXISTS FOR ══════════════════════════════════════════════
 *
 * Round 2 gave `updateRegistration` a `source === 'inhouse'` branch with a
 * 26-name allowlist. NO CLIENT WAS EVER POINTED AT IT. `InhouseDetailClient`
 * imported `updateInhouseStatus`, `updateInhouseAdminNotes` and
 * `deleteInhouseRegistration` and nothing else, spread `editProps` onto exactly
 * ONE of its six cards, and typed its `editSection` as `'notes' | null`. So 25
 * allowlisted fields were rendered by the read view and editable by nothing at
 * all, and every existing test was green throughout — because they all asked
 * whether the CONTROLS render, and the controls that were missing render
 * nothing to look for.
 *
 * ══ WHY A RENDER TEST CANNOT REPLACE THIS ═══════════════════════════════════
 *
 * A render test proves a แก้ไข button exists. It cannot prove a SAVE LANDS, and
 * the gap between those two is the whole failure mode here: a field the form
 * submits that the allowlist does not name is dropped by
 * `if (data[f] !== undefined)` and the action still returns `{ok: true}`. The
 * card closes. The value is unchanged after a refresh. Nothing on the screen,
 * in the response, or in the audit trail says a word about it. It is the same
 * class as the invoice branch trap and articleSchema's strip mode, and it is
 * invisible to every tier except this one.
 *
 * ══ NEITHER SIDE IS RE-TYPED HERE, WHICH IS WHAT MAKES IT WORTH RUNNING ═════
 *
 * The FORM side is `INHOUSE_EDITABLE_GROUPS` — the actual functions the
 * component seeds its `useState` from and re-seeds on cancel, imported and
 * CALLED, so the keys are the keys the cards really submit.
 *
 * The SERVER side is parsed out of `updateRegistration`'s source, out of the
 * `inhouseFields` array literal itself.
 *
 * A third hand-written list in this file would make the test agree with itself
 * and with nothing else — which is exactly how 25 unreachable fields sat in the
 * allowlist for two rounds without a single assertion noticing.
 */

const SHARED = readSource('src/lib/actions/registrations.js');

/**
 * The `inhouseFields` array literal, as a set of names.
 *
 * Read from `code` (comments stripped) — the docstring above the literal NAMES
 * several fields it explains the ABSENCE of (`skillLevel`, `branch`,
 * `companyName`, …), and against raw source those would be harvested as members
 * of the allowlist they are documented as being excluded from. That inversion is
 * the standing "strip comments before matching source" rule earning itself
 * again, and the control below proves the stripping is real.
 */
function parseInhouseAllowlist(code) {
  const start = code.indexOf('const inhouseFields = [');
  assert.notEqual(start, -1, 'the inhouseFields allowlist literal is gone or was renamed');
  const end = code.indexOf('];', start);
  assert.notEqual(end, -1, 'the inhouseFields literal is unterminated');
  const body = code.slice(start, end);
  return new Set([...body.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)].map((m) => m[1]));
}

const ALLOWLIST = parseInhouseAllowlist(SHARED.code);

/**
 * Every key every card submits, unioned.
 *
 * A probe document with NO fields set, deliberately: the seeds fall back to
 * their defaults and still produce the full key set, so this measures the
 * SHAPE the form writes rather than the shape one fixture happens to have.
 */
const FORM_FIELDS = new Set(
  Object.values(INHOUSE_EDITABLE_GROUPS).flatMap((seed) => Object.keys(seed({}))),
);

// ── 0. The two sets are real ────────────────────────────────────────────────

test('both sides parsed to something — neither is an empty set', () => {
  // Without this, both directions below pass vacuously the day the literal is
  // renamed or the export disappears: ∅ ⊆ anything, in both directions.
  assert.ok(ALLOWLIST.size >= 20, `the allowlist parsed to only ${ALLOWLIST.size} names`);
  assert.ok(FORM_FIELDS.size >= 15, `the form parsed to only ${FORM_FIELDS.size} names`);
  // FIVE, not six. The `notes` group left when internal notes became an
  // append-only array: `adminNotes` is no longer written through
  // `updateRegistration` at all, so it is not a field this form submits and it
  // is not in the allowlist either. See §4.
  assert.equal(Object.keys(INHOUSE_EDITABLE_GROUPS).length, 5,
    'a card was added or removed without this test being told');
});

test('CONTROL: the allowlist parser reads the LITERAL, not the docstring above it', () => {
  // `companyName`, `branch` and `skillLevel` all appear by name in the comment
  // block explaining why they are NOT writable. A parser reading raw source
  // would harvest them as members. This is the assertion that says the comment
  // stripping is doing real work rather than being decorative.
  for (const excluded of ['companyName', 'branch', 'skillLevel', 'onsiteAddress']) {
    assert.ok(!ALLOWLIST.has(excluded),
      `${excluded} was harvested from the docstring — the parser is reading comments`);
  }
  // …and the same names ARE present in the file, so the check above is measuring
  // the STRIPPING rather than their simple absence.
  //
  // `raw`, not `withImports`. Both `code` and `withImports` come back
  // comment-scrubbed — they differ only in whether IMPORTS survive — so reading
  // this half from `withImports` asks "is this comment-only name present with
  // comments removed", which is No for exactly the names that make the control
  // work. The first draft did that and reddened here, which is the control
  // controlling itself: it reported the parser clean and the fixture broken,
  // and the fixture was.
  for (const excluded of ['companyName', 'branch', 'skillLevel', 'onsiteAddress']) {
    assert.ok(SHARED.raw.includes(excluded),
      `${excluded} is not in the file at all — this control no longer controls anything`);
  }
});

// ── 1. DIRECTION A: a field the form submits that the allowlist omits ───────

/**
 * THE ONE THAT MUST REDDEN. This is the silent-drop direction: the form sends
 * it, the action does not name it, the save reports success and stores nothing.
 */
test('every field the in-house form submits is named by the allowlist', () => {
  const unwritable = [...FORM_FIELDS].filter((f) => !ALLOWLIST.has(f));
  assert.deepEqual(unwritable, [],
    'these fields are submitted by an in-house edit card and are NOT in '
    + "updateRegistration's inhouse allowlist. They will be dropped silently: "
    + `the save returns ok and changes nothing — ${unwritable.join(', ')}`);
});

test('the guard is per-card, so a reader can see WHICH card broke', () => {
  // The union above says a name is missing; this says where from. Same claim,
  // reported at the granularity someone has to act on.
  for (const [section, seed] of Object.entries(INHOUSE_EDITABLE_GROUPS)) {
    const missing = Object.keys(seed({})).filter((f) => !ALLOWLIST.has(f));
    assert.deepEqual(missing, [], `the ${section} card submits unwritable fields: ${missing.join(', ')}`);
  }
});

// ── 2. DIRECTION B: an allowlisted field no form offers ─────────────────────

/**
 * The direction that was 25-deep and silent for two rounds.
 *
 * It is an ALLOWLIST of KNOWN GAPS rather than an equality, because two of them
 * are rulings rather than oversights and an equality would force a future reader
 * to either build them or quietly delete the guard. Each entry states its own
 * reason; an entry added without one is the thing to push back on in review.
 */
const NOT_OFFERED_BY_THE_FORM = {
  // An ARRAY OF UPSTREAM COURSE CODES. The only honest control is a picker
  // backed by the same course list page.jsx resolves names from; a free-text
  // box lets an admin type a code that resolves to nothing, which the read view
  // then renders identically to the upstream-is-down case. Reported as open.
  coursesInterested: 'needs a course picker, not a text box',
};

/**
 * `adminNotes` IS NOT AN EXEMPTION — IT IS OUT OF THE ALLOWLIST ENTIRELY.
 *
 * It used to be in both lists. It is now in neither, because internal notes are
 * APPEND-ONLY and written exclusively by `addInternalNote` with `$push`. Listing
 * it as a "stated gap" above would have been exactly wrong: an exemption says
 * "writable by the action, not offered by this form", and the whole point is
 * that `updateRegistration` MUST NOT be able to write it. §4 asserts the
 * absence from both sides.
 */
const APPEND_ONLY_FIELDS = ['adminNotes'];

test('every allowlisted in-house field is offered by some card, or is a stated gap', () => {
  const unreachable = [...ALLOWLIST].filter(
    (f) => !FORM_FIELDS.has(f) && !(f in NOT_OFFERED_BY_THE_FORM),
  );
  assert.deepEqual(unreachable, [],
    'these fields are writable by updateRegistration and no in-house card offers '
    + 'a control for them — the screen displays them and cannot change them: '
    + unreachable.join(', '));
});

test('the stated gaps are still IN the allowlist — a gap is not a deletion', () => {
  // If a name here ever leaves the allowlist, the exemption above stops being an
  // exemption and starts hiding the fact that the field became unwritable
  // entirely. That is a different decision and deserves a different diff.
  for (const [field, why] of Object.entries(NOT_OFFERED_BY_THE_FORM)) {
    assert.ok(ALLOWLIST.has(field), `${field} left the allowlist; its exemption (${why}) is now stale`);
    assert.ok(!FORM_FIELDS.has(field), `${field} IS now offered by a card — remove its exemption`);
  }
});

// ── 3. The client actually calls the shared action, with the source ─────────

/**
 * The two directions above compare the form's field names to the allowlist and
 * would BOTH pass on a screen that still calls nothing — the exact state this
 * round found. So the wiring is asserted too.
 */
const CLIENT = readSource('src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx');

test('the in-house client calls updateRegistration with the inhouse source', () => {
  // The import list is matched LOOSELY on the binding, not on the whole
  // statement: the module also exports `addInternalNote`, which the client now
  // imports beside this one, and a `\{\s*updateRegistration\s*\}` pattern fails
  // the moment a second name joins the braces. That is a matcher that breaks on
  // correct code every time the file grows.
  assert.match(CLIENT.withImports, /import\s*\{[^}]*\bupdateRegistration\b[^}]*\}\s*from\s*'@\/lib\/actions\/registrations'/,
    'the in-house client does not import the shared field writer');
  assert.match(CLIENT.code, /updateRegistration\(\s*doc\._id\s*,\s*payload\s*,\s*'inhouse'\s*\)/,
    "the save must pass 'inhouse' — the public branch names almost none of these fields, "
    + 'so every one would be dropped and the save would still report success');
});

// ── 4. The append-only field is out of BOTH lists ───────────────────────────

test('adminNotes is in neither the allowlist nor the form — it is append-only', () => {
  /**
   * ══ THE HOLE THIS CLOSES ═══════════════════════════════════════════════════
   *
   * Internal notes are append-only, enforced by `addInternalNote` using `$push`
   * and by its signature taking a body string and nothing else. NONE OF THAT
   * MATTERS if `updateRegistration` can still `$set` the array: a caller sends
   * `adminNotes: []` and the whole record is erased, or sends a rewritten array
   * and overwrites any note in it. Same defect, different door.
   *
   * So the name must be absent from the allowlist, and absent from the form's
   * groups, and this asserts both. It is a one-word change to put either back
   * and no render test could see it.
   */
  for (const field of APPEND_ONLY_FIELDS) {
    assert.ok(!ALLOWLIST.has(field),
      `${field} is back in updateRegistration's allowlist — an append-only field is $set-able again`);
    assert.ok(!FORM_FIELDS.has(field),
      `${field} is submitted by an edit card — the form would overwrite the whole array`);
  }
});

test('the append-only field IS still written, just not by that action', () => {
  // Without this, the assertion above is satisfied by a field nobody writes at
  // all — which would mean the feature had been deleted rather than moved.
  assert.match(SHARED.code, /export async function addInternalNote\(/,
    'addInternalNote is gone — adminNotes now has no writer at all');
  assert.match(SHARED.code, /\$push:\s*\{\s*adminNotes:/,
    'addInternalNote does not $push adminNotes');
});

test('there is exactly ONE updateRegistration call site, not one per card', () => {
  /**
   * Six cards call `save(...)`; `save` calls `updateRegistration` once. Threading
   * the source through each card instead would be six chances to write 'public'
   * by accident — which does not throw, does not warn, and sends the payload
   * through the PUBLIC allowlist, where almost none of these fields are named.
   * Every one would be dropped and the save would still report success.
   *
   * Counted on the CALL, not on the string `'inhouse'`. The first draft counted
   * the string and reddened at 4 — because `effectiveStatus(status, 'inhouse')`,
   * `isSystemSet(liveStatus, 'inhouse')` and the ข้อมูลระบบ card's
   * `doc.source ?? 'inhouse'` are three entirely legitimate other uses. A guard
   * that cannot tell the save path from a status lookup is measuring the wrong
   * thing, and adjusting the expected number to 4 would have made it measure
   * nothing at all.
   */
  assert.equal(countCallSites(CLIENT.code, 'updateRegistration'), 1,
    'updateRegistration must be called from exactly one place in this client');
});
