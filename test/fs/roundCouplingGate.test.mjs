import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { ROUND_FIELDS } from '@/lib/registrations/roundSelection';

/**
 * THE FOUR COUPLED ROUND FIELDS MOVE TOGETHER, OR NOT AT ALL.
 *
 * ══ THE DEFECT, AND WHY IT IS INVISIBLE ═════════════════════════════════════
 *
 * A registration stores `classId`, `classDate`, `scheduleType` and
 * `attendanceMode`. They describe ONE round. Before this round, three of them
 * were in `updateRegistration`'s allowlist and `classId` was in none — so a
 * caller could set the date LABEL to anything while the ID went on pointing at
 * the old round.
 *
 * NOTHING ON SCREEN WOULD REVEAL THAT. The detail page renders the label; the id
 * appears only in ข้อมูลระบบ as an opaque 24-character string nobody
 * cross-checks. The registration would say one round and mean another, and the
 * first anyone would know is an attendee arriving on the wrong day.
 *
 * That is worse than the free-text box it replaces, which at least does not
 * claim to be linked to anything.
 *
 * ══ WHAT IS ASSERTED, AND WHY IT IS AN fs GUARD ═════════════════════════════
 *
 * The action is a `'use server'` export reaching next-auth and mongoose, so
 * nothing here can call it. These are SHAPE checks on the code it contains.
 * They are the only tier that can see the thing that matters most — a field
 * NAME back in an allowlist — which is a one-word change with no rendered
 * symptom at all.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');

function actionBody(code, name) {
  const start = code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone`);
  const rest = code.slice(start + 1);
  const nextIdx = rest.indexOf('export async function ');
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

const UPDATE_BODY = actionBody(ACTIONS.code, 'updateRegistration');
const ROUND_BODY  = actionBody(ACTIONS.code, 'updateRegistrationRound');

// ── 1. THE HOLE IS SHUT ─────────────────────────────────────────────────────

test('NONE of the four round fields is writable through updateRegistration', () => {
  /**
   * THE ASSERTION THIS FILE EXISTS FOR. `classDate`, `scheduleType` and
   * `attendanceMode` were all in that allowlist; `classId` never was, which is
   * what made the other three dangerous rather than merely redundant.
   *
   * Read from the action BODY with comments stripped — the removal is explained
   * in a docstring that names all four, and against raw source that comment
   * would satisfy this in exactly the wrong direction.
   */
  for (const field of ROUND_FIELDS) {
    assert.ok(!UPDATE_BODY.includes(field),
      `${field} is writable through updateRegistration again. That action is a wholesale $set: `
      + 'a caller could set the label without the id, and the record would name one round and '
      + 'point at another with nothing on screen to say so.');
  }
});

test('CONTROL: the allowlist probe still finds the fields that ARE there', () => {
  // Without this, the assertion above passes on an empty string — a renamed
  // function, a changed marker, a body that failed to parse.
  for (const field of ['coordinator', 'attendees', 'invoice', 'notes']) {
    assert.ok(UPDATE_BODY.includes(field), `${field} should still be editable through updateRegistration`);
  }
  assert.ok(UPDATE_BODY.length > 500, `the updateRegistration body parsed to ${UPDATE_BODY.length} chars`);
});

// ── 2. THE PAYLOAD CARRIES AN ID, AND THE SERVER DERIVES THE REST ───────────

test('the signature takes classId and attendanceMode — and NOT the labels', () => {
  /**
   * REQUIREMENT 1, structurally. The client cannot send `classDate` or
   * `scheduleType` because there is nowhere to put them. A client that cannot
   * send a label cannot send one that disagrees with the id.
   */
  const sig = /export async function updateRegistrationRound\(([^)]*)\)/.exec(ACTIONS.code);
  assert.ok(sig, 'updateRegistrationRound signature not found');
  const params = sig[1];
  assert.match(params, /classId/, 'the payload does not carry classId');
  assert.match(params, /attendanceMode/, 'the payload cannot carry the hybrid choice');
  assert.ok(!/classDate/.test(params), 'the client can send a date LABEL — that is the coupling hole');
  assert.ok(!/scheduleType/.test(params), 'the client can send a schedule TYPE');
});

test('REQUIREMENT 2: the server derives all four through the shared helper', () => {
  // `roundFieldsFor` is RegisterWizard's own rule, extracted. Deriving them
  // inline here would be a second implementation of the coupling, and the one
  // that drifted would be the admin's — the surface with the fewest eyes on it.
  assert.match(ACTIONS.withImports, /import\s*\{[^}]*\broundFieldsFor\b[^}]*\}\s*from\s*'@\/lib\/registrations\/roundSelection'/,
    'the action does not import the shared round derivation');
  assert.match(ROUND_BODY, /roundFieldsFor\(round,\s*attendanceMode\)/,
    'the action does not call the shared derivation');
  assert.match(ROUND_BODY, /\$set:\s*fields/,
    'the action does not write the derived object — it must not assemble its own');
});

test('the SAME helper is what RegisterWizard uses — not a copy', () => {
  const WIZARD = readSource('src/components/registration/RegisterWizard.jsx');
  assert.match(WIZARD.withImports, /from\s*"@\/lib\/registrations\/roundSelection"/,
    'the wizard no longer imports the shared module');
  assert.ok(!/function formatClassDates/.test(WIZARD.code),
    'RegisterWizard has its own formatClassDates again — two labels for one round');
});

// ── 3. REQUIREMENT 3: the round must belong to this course ──────────────────

test('the candidate rounds are fetched FOR THIS REGISTRATION’S COURSE', () => {
  /**
   * Enforced by CONSTRUCTION rather than by comparison: the list is fetched for
   * the course on the document, and a classId not among them is refused. There
   * is no branch that could compare the wrong two things.
   *
   * Without it, anything that can POST could move an attendee onto another
   * course's round, and the screen would render the new date beside the old
   * course name perfectly happily.
   */
  assert.match(ROUND_BODY, /getCourseByCodeInsensitive\(doc\.courseId\)/,
    'the course is not resolved from the registration itself');
  assert.match(ROUND_BODY, /listSchedulesByCourse\(course\._id/,
    'the rounds are not fetched for that course');
  assert.match(ROUND_BODY, /rounds\.find\(\(r\) => String\(r\?\._id\) === String\(classId\)\)/,
    'the chosen id is not looked up among that course’s rounds');
  assert.match(ROUND_BODY, /ไม่ได้อยู่ในหลักสูตรของรายการนี้/,
    'a round from another course is not refused with its own message');
});

test('an unverifiable course REFUSES rather than writing', () => {
  // Upstream down, or the course withdrawn. Writing anyway would store exactly
  // the unverified round this action exists to prevent.
  assert.match(ROUND_BODY, /if \(!course\?\._id\)/, 'a missing course is not handled');
  assert.match(ROUND_BODY, /if \(!rounds\)/, 'a failed schedule fetch is not handled');
});

// ── 4. REQUIREMENT 4: hybrid requires a choice ──────────────────────────────

test('a hybrid round with no attendanceMode is REJECTED, not guessed', () => {
  // `roundFieldsFor` returns null in that case and the action refuses. Guessing
  // `classroom` for someone who meant Teams sends them to a building.
  assert.match(ROUND_BODY, /if \(!fields\)/, 'the null return is not treated as a refusal');
  assert.match(ROUND_BODY, /Hybrid/, 'the hybrid refusal has no message of its own');
  assert.ok(!/attendanceMode\s*\|\|\s*'classroom'/.test(ROUND_BODY),
    'the action defaults a hybrid choice — that is the guess this forbids');
});

// ── 5. REQUIREMENT 6: the audit exception, and its bounds ───────────────────

test('THE AUDIT EXCEPTION: before/after carry these four fields and no others', () => {
  /**
   * Every other field edit here records the act only, because the collection
   * holds personal data and the trail is append-only forever. These four are not
   * personal data, and moving a person between rounds is the change most worth
   * tracing on this screen.
   *
   * The payload is built by PICKING `ROUND_FIELDS` rather than by spreading, so
   * a field added to the registration later cannot join the row by accident.
   */
  assert.match(ROUND_BODY, /ROUND_FIELDS\.map\(\(f\) => \[f, source\?\.\[f\] \?\? null\]\)/,
    'the audit payload is not built by picking the four named fields');
  assert.match(ROUND_BODY, /before:\s*pick\(doc\)/, 'no before payload');
  assert.match(ROUND_BODY, /after:\s*pick\(fields\)/, 'no after payload');
  assert.ok(!/\.\.\.doc/.test(ROUND_BODY), 'the document is spread somewhere — that is how a name gets in');
});

test('the exception is EXPLAINED at the line, so it does not read as a mistake', () => {
  /**
   * The instruction was explicit: write the reason at that line, otherwise the
   * next reader sees a diff payload beside `update`'s bare `{}` and "fixes" the
   * inconsistency.
   *
   * Asserted against RAW source, because the subject IS a comment — the standing
   * "strip comments before matching" rule has exactly this exception, and
   * reading `code` here would delete the thing being checked.
   */
  const rawStart = ACTIONS.raw.indexOf('export async function updateRegistrationRound(');
  assert.notEqual(rawStart, -1);
  const rawBody = ACTIONS.raw.slice(rawStart, ACTIONS.raw.indexOf('\nexport ', rawStart + 1));
  assert.match(rawBody, /EXCEPTION TO THE NO-DIFF AUDIT RULE/,
    'the audit exception is not announced where it happens');
  assert.match(rawBody, /NOT PERSONAL DATA/, 'the reason the four fields are permitted is not stated');
  assert.match(rawBody, /Do not\./, 'nothing tells the next reader not to "fix" the inconsistency');
});

test('the contract permits it WITHOUT relaxing the PII cap', () => {
  /**
   * The pair could have been raised to `full`, which would have permitted a
   * field diff on `updateRegistration` too — the action that edits the
   * customer's name, email and phone. It was not.
   */
  /**
   * ── MATCHED PER LINE, NOT WITH `[^)]*` ────────────────────────────────────
   * The first draft bounded the entry with `[^)]*` and failed on a correct
   * contract: the pair's LABEL is `'ใบสมัครอบรม (Public)'`, whose own
   * parenthesis ends the character class before the policy argument is reached.
   * That is defect 6 from sourceScan's header exactly — a matcher bounded by a
   * delimiter that occurs inside its own subject — and the lesson there is to
   * bound on a statement, never on `)`.
   */
  const CONTRACT = readSource('src/lib/audit/auditContract.js');
  const entryLine = (menu, entity) => {
    const line = CONTRACT.code.split('\n')
      .find((l) => l.includes(`entry('${menu}', '${entity}'`));
    assert.ok(line, `no contract entry for ${menu}|${entity}`);
    return line;
  };

  const pub = entryLine('registrations', 'public');
  assert.match(pub, /ROUND_AND_STATUS_POLICY/, 'the public registration pair is not on the allowlist policy');
  assert.ok(!/'full'/.test(pub), 'the public registration pair was raised to a full diff — the PII cap is gone');
  assert.match(entryLine('registrations', 'inhouse'), /'status_only'/,
    'the in-house pair moved too — it has no rounds and should not have');
});
