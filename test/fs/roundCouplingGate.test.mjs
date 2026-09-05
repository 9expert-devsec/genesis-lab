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

// ── 6. A BUNDLE LEG'S ROUND CANNOT BE MOVED ─────────────────────────────────

/**
 * ══ A RULE THAT LIVES ONLY IN A DISABLED BUTTON IS NOT A RULE ══════════════
 *
 * A promotion registration cannot change its round: one package price was
 * quoted over the exact rounds the customer registered for, and moving one
 * afterwards silently changes what was sold.
 *
 * It is enforced in TWO places and this section asserts BOTH, because either
 * alone is a hole:
 *
 *   · the ACTION refuses — every export of a `'use server'` module is a POST
 *     endpoint, so the screen cannot be the enforcement;
 *   · the SCREEN does not offer it AND SAYS WHY — an admin who cannot see the
 *     reason will try another way, and the other way is the endpoint.
 *
 * The Early Bird round is the precedent for the first half and the reason the
 * second half is not treated as decoration.
 */

const DETAIL = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');
const ROUND_MODULE = readSource('src/lib/registrations/roundSelection.js');

test('BOTH sentences are declared in ONE module, not one per side', () => {
  // Two hand-written sentences about one rule drift, and the one that drifts is
  // the one the admin actually reads.
  assert.match(ROUND_MODULE.code, /export const BUNDLE_ROUND_LOCK_HINT\s*=/,
    'the screen-side hint is not declared beside the rule');
  assert.match(ROUND_MODULE.code, /export const BUNDLE_ROUND_LOCK_ERROR\s*=/,
    'the action-side refusal is not declared beside the rule');
  /**
   * ── ASSERTED BY INDEX, NOT BY A CONSTRUCTED REGEX ────────────────────────
   * The first draft built `new RegExp(name + '[\\s\\S]{0,200}…')` and the
   * escaping did not survive the way it was written to disk: the pattern
   * compiled to `[sS]` — a character class of two letters — and the assertion
   * failed against a file that plainly satisfied it. Index arithmetic has no
   * escaping to lose, and the distance it measures is the thing meant.
   */
  const PACKAGE_WORD = 'แพ็กเกจ';
  for (const name of ['BUNDLE_ROUND_LOCK_HINT', 'BUNDLE_ROUND_LOCK_ERROR']) {
    const at = ROUND_MODULE.code.indexOf(name);
    assert.notEqual(at, -1, `${name} is gone`);
    const declaration = ROUND_MODULE.code.slice(at, at + 220);
    assert.ok(declaration.includes(PACKAGE_WORD),
      `${name} does not mention the package — the admin cannot tell why. Got: ${declaration.slice(0, 120)}`);
  }
});

test('CONTROL: the index probe can fail — it is not matching the whole file', () => {
  // The bounded slice must NOT contain a word that appears elsewhere in the
  // module, or "the declaration mentions X" is really "the file mentions X".
  const at = ROUND_MODULE.code.indexOf('BUNDLE_ROUND_LOCK_HINT');
  const declaration = ROUND_MODULE.code.slice(at, at + 220);
  assert.equal(declaration.includes('roundFieldsFor'), false,
    'the 220-char slice has run into the rest of the module');
  assert.ok(ROUND_MODULE.code.includes('roundFieldsFor'),
    'the control is comparing against a word that is not in the file at all');
});

test('THE ACTION REFUSES a bundle leg, before any upstream call', () => {
  assert.match(ACTIONS.withImports,
    /import\s*\{[^}]*\bBUNDLE_ROUND_LOCK_ERROR\b[^}]*\}\s*from\s*'@\/lib\/registrations\/roundSelection'/,
    'the action does not import the shared refusal');
  assert.match(ROUND_BODY, /if \(doc\.bundle\) \{/,
    'updateRegistrationRound does not refuse a bundle leg — the round is movable by POST');
  assert.match(ROUND_BODY, /error: BUNDLE_ROUND_LOCK_ERROR/,
    'the refusal does not carry the shared reason');

  // It must READ the tag, or `doc.bundle` is undefined on every document and
  // the guard is dead code that always passes.
  assert.match(ROUND_BODY, /\.select\('[^']*\bbundle\b[^']*'\)/,
    'the pre-read does not project `bundle` — the lock would never fire');
});

test('the refusal is cheap: it precedes the course and schedule fetches', () => {
  const lock  = ROUND_BODY.indexOf('if (doc.bundle)');
  const course = ROUND_BODY.indexOf('getCourseByCodeInsensitive');
  const rounds = ROUND_BODY.indexOf('listSchedulesByCourse');
  assert.ok(lock !== -1 && course !== -1 && rounds !== -1, 'a marker is missing');
  assert.ok(lock < course && lock < rounds,
    'the bundle refusal happens after an upstream round trip it did not need');
});

test('the cancellation lock still answers FIRST', () => {
  // A cancelled record is read-only to every action on this screen and must
  // give the same answer here as everywhere else — a cancelled bundle leg is
  // refused as cancelled, not as bundled.
  const cancelled = ROUND_BODY.indexOf("doc.status === 'cancelled'");
  const lock = ROUND_BODY.indexOf('if (doc.bundle)');
  assert.ok(cancelled !== -1 && lock !== -1);
  assert.ok(cancelled < lock, 'the bundle lock now pre-empts the cancellation lock');
});

test('THE SCREEN withholds the control THROUGH THE SHARED GATE', () => {
  /**
   * `editProps` is the single producer of `onEdit`. A hand-made object spread
   * past it is the exact shape fs/registrationActionsDerived already caught
   * once, and a second door here would be that defect with a better excuse.
   */
  /**
   * The lock reads the ONE flag the request view derives from the tag, rather
   * than testing `doc.bundle` a second time. Both facts are asserted: that the
   * flag comes from the tag, and that the round gate reads the flag — a lock
   * derived from something else would satisfy the second alone.
   */
  assert.match(DETAIL.code, /const isBundleRequest = Boolean\(doc\.bundle\)/,
    'the request-view flag is no longer derived from the tag');
  assert.match(DETAIL.code, /const roundLockedByBundle = isBundleRequest/,
    'the round lock no longer reads that flag');
  assert.match(DETAIL.code, /editProps\('course', rounds\.length > 0 && !roundLockedByBundle\)/,
    'the lock does not go through the single edit gate');
});

test('THE SCREEN SAYS WHY, and the package reason outranks the shortage', () => {
  /**
   * A bundle leg whose course also has no upcoming rounds must not be told
   * "ไม่มีรอบให้เลือกในขณะนี้" — "not at the moment" invites the admin back
   * tomorrow, and then to look for another way. Only one of the two reasons
   * will ever stop being true.
   */
  assert.match(DETAIL.withImports,
    /import\s*\{[\s\S]*?\bBUNDLE_ROUND_LOCK_HINT\b[\s\S]*?\}\s*from\s*'@\/lib\/registrations\/roundSelection'/,
    'the screen does not import the shared hint');

  const lockHint = DETAIL.code.indexOf('BUNDLE_ROUND_LOCK_HINT');
  const noRounds = DETAIL.code.indexOf('ไม่มีรอบให้เลือกในขณะนี้');
  const gone     = DETAIL.code.indexOf('รอบนี้ไม่เปิดรับแล้ว');
  assert.ok(lockHint !== -1, 'the package reason is not rendered at all');
  assert.ok(noRounds !== -1 && gone !== -1, 'an existing reason disappeared');
  assert.ok(lockHint < noRounds && lockHint < gone,
    'the package reason is not the first branch — a locked leg would be told rounds are merely unavailable');
});

test('ORDINARY registrations are untouched — the control is still offered', () => {
  /**
   * The rule is about bundle legs only. If this ever reads as an unconditional
   * lock, เปลี่ยนรอบ has been removed from the whole screen and nobody asked
   * for that.
   */
  assert.ok(!/editProps\('course', false\)/.test(DETAIL.code), 'the round card is locked for everyone');
  assert.match(DETAIL.code, /rounds\.length > 0/, 'the availability condition is gone');
  assert.match(DETAIL.code, /onSave=\{handleSaveRound\}/, 'the round card can no longer save at all');
});

test('CONTROL: these probes are reading real files with real content', () => {
  assert.ok(DETAIL.code.length > 20000, `the detail client parsed to ${DETAIL.code.length} chars`);
  assert.ok(ROUND_MODULE.code.length > 2000, `roundSelection parsed to ${ROUND_MODULE.code.length} chars`);
  assert.ok(ROUND_BODY.includes('roundFieldsFor'), 'the round action body is not the round action');
  // …and a name that is certainly absent does not match, so the matchers can fail.
  assert.equal(/BUNDLE_ROUND_LOCK_NONSENSE/.test(ROUND_MODULE.code), false);
});
