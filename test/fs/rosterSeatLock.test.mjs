import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE SEAT LOCK, AND THE REQUIRED-FIELD ASYMMETRY THAT CAME WITH IT.
 *
 * ══ THE LOCK IS THE SERVER'S. THE BUTTON IS A COURTESY. ═════════════════════
 *
 * Round 8 makes "the roster may not exceed attendeesCount" a rule. The client
 * disables its + button at capacity — twice, in two places — but every
 * `'use server'` export is a POST endpoint, so the only thing that actually
 * holds is `updateRegistration`. The control that proves the button is not the
 * enforcement is `scripts/_control-round8.mjs apply client-unlock`: it removes
 * BOTH client guards and the server assertions here stay green, which is the
 * point.
 *
 * ══ THE REQUIRED-FIELD ASYMMETRY IS DELIBERATE AND IS ASSERTED BOTH WAYS ════
 *
 * The admin path requires ชื่อ + นามสกุล. The customer wizard's zod still
 * requires all four. That is not drift and it is the kind of thing a reader
 * "tidies" into consistency, so BOTH directions are pinned:
 *
 *   · tightening the MODEL/admin path back to four → red
 *   · loosening the WIZARD's zod to two → red
 *
 * The reasoning lives at both sites. In one line: the model is the storage FLOOR
 * and must accept everything any legitimate writer may write; the wizard's zod
 * is a PRODUCT DECISION about what we accept from a customer, and it is
 * deliberately stricter than the floor. A registration with no way to contact
 * the attendee is a different product; an admin recording a walk-in whose email
 * nobody took is a different decision.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');
const SCHEMA  = readSource('src/lib/schemas/register-public.js');
const MODEL   = readSource('src/models/RegisterPublic.js');
const CLIENT  = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');
const INFO    = readSource('src/lib/registrations/attendeeInfo.js');

function actionBody(name) {
  const start = ACTIONS.code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone`);
  const rest = ACTIONS.code.slice(start + 1);
  const next = rest.indexOf('export async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

const UPDATE = actionBody('updateRegistration');

// ════════════════════════════════════════════════════════════════════════════
// 1. THE LOCK, ON THE SERVER
// ════════════════════════════════════════════════════════════════════════════

test('the roster ceiling is enforced in updateRegistration, both cases', () => {
  /**
   * TWO CASES, and the split is not cosmetic:
   *
   *   · the payload sets the COUNT too — compare in JS, because the ceiling is
   *     the number arriving, not the one in the document;
   *   · the payload sets only the ROWS — compare in the FILTER with `$expr`
   *     against the STORED count, which keeps it atomic and costs no read.
   *
   * `$expr` for both would be wrong in the first case: it sees the document
   * BEFORE the write, so it would compare against a count on its way out.
   */
  assert.match(UPDATE, /if \(update\.attendeesCount !== undefined\)/,
    'the two ceiling cases are not distinguished');
  assert.match(UPDATE, /rosterLength > update\.attendeesCount/,
    'the in-payload ceiling is not compared');
  assert.match(UPDATE, /filter\.\$expr = \{ \$gte: \['\$attendeesCount', rosterLength\] \}/,
    'the stored ceiling is not enforced in the filter');
  // …and it is genuinely on the filter the write uses.
  assert.match(UPDATE, /findOneAndUpdate\(filter,/);
});

test('the refusal NAMES the seat lock rather than blaming cancellation', () => {
  /**
   * The `$expr` clause makes `findOneAndUpdate` return null, which is the same
   * signal the cancellation lock produces. Without a dedicated branch an
   * over-capacity save would report "ใบสมัครนี้ถูกยกเลิกแล้ว" on a record that
   * is not cancelled — a message about a different rule entirely, which is
   * worse than a generic one because it sends the reader somewhere false.
   */
  assert.ok(UPDATE.includes('เกินจำนวนที่สมัครไว้'), 'the seat-lock refusal has no message');
  assert.match(UPDATE, /select\('status attendeesCount'\)/,
    'the refusal path cannot tell which rule fired — it does not read the count');
  // It is tested BEFORE the cancellation branch, or the wrong message wins.
  const over = UPDATE.indexOf('เกินจำนวนที่สมัครไว้');
  const cancelledMsg = UPDATE.indexOf('ใบสมัครนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้');
  assert.ok(over !== -1 && cancelledMsg !== -1 && over < cancelledMsg,
    'the cancellation message is reached first — it would mask the seat lock');
  // …and the branch excludes genuinely cancelled records, so the two stay distinct.
  assert.match(UPDATE, /existing\.status !== 'cancelled'/,
    'the seat-lock refusal would fire on a cancelled record too');
});

test('nothing truncates the roster — the already-over record keeps everyone', () => {
  /**
   * The rule REFUSES a payload; it never edits one to fit. One production
   * record is already over (2 attendees against a count of 1) and no code path
   * anywhere deletes an attendee to satisfy a rule invented after the data.
   *
   * Asserted as the absence of the shapes that would do it, over the whole
   * action — a claim about the body, which is what the source tier is for.
   */
  /**
   * SCOPED TO THE ATTENDEES BLOCK, not the whole action — measured, not assumed.
   * A first draft searched the entire body and reddened on correct code:
   * `update.notes = String(...).trim().slice(0, 500)` is a legitimate `.slice(0,`
   * one field away. A probe that cannot tell a note's length cap from a roster
   * truncation is not a probe about rosters.
   */
  const start = UPDATE.indexOf('if (data.attendees !== undefined)');
  assert.notEqual(start, -1, 'the attendees branch is gone');
  const block = UPDATE.slice(start, UPDATE.indexOf('if (data.invoice !== undefined)', start));
  assert.ok(block.length > 400, 'the attendees branch did not parse');

  for (const shape of ['.slice(', '.splice(', 'pop()', 'shift()']) {
    assert.equal(block.includes(shape), false,
      `the attendees branch contains \`${shape}\` — the roster must never be trimmed to fit`);
  }
  // The rows written are the rows received, one for one.
  assert.match(block, /update\.attendees = data\.attendees\.map\(/,
    'the roster is not written as a straight map of what arrived');
});

test('CONTROL: the truncation probe fires on a body that DOES trim', () => {
  // Four absences in a row is the shape that passes on an empty string.
  const guilty = "update.attendees = data.attendees.slice(0, stored.attendeesCount);";
  assert.ok(['.slice(', '.splice(', 'pop()', 'shift()'].some((s) => guilty.includes(s)),
    'the probe cannot see a truncation even when one is there');
});

test('the duplicate rule is imported, not re-implemented in the action', () => {
  /**
   * The screens and the server must agree about what "the same attendee twice"
   * means. A second copy here is how they come to disagree.
   *
   * `withImports`, NOT `code` — `readSource().code` STRIPS THE IMPORT LINES, so
   * an assertion about an import written against `code` fails on a perfectly
   * correct file. Same trap publicStatusWriteGate documents for the statuses
   * import, and the first draft of this line walked into it.
   */
  assert.match(ACTIONS.withImports, /import \{ firstDuplicateAttendee \} from '@\/lib\/registrations\/attendeeInfo'/,
    'the action does not import the shared duplicate rule');
  assert.equal(ACTIONS.code.includes("from '@/lib/registrations/attendeeInfo'"), false,
    'the control is inert — `code` did NOT strip the import, so the line above proves nothing about which view it read');
  assert.match(UPDATE, /firstDuplicateAttendee\(update\.attendees\)/,
    'the action does not apply the duplicate rule to what it is about to write');
  assert.ok(UPDATE.includes('ซ้ำกับรายชื่อก่อนหน้า'), 'the duplicate refusal has no message');
  // The message names WHICH row, or a roster of up to 50 is a hunt.
  assert.match(UPDATE, /ท่านที่ \$\{dup \+ 1\}/, 'the duplicate refusal does not name the row');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. REQUIRED FIELDS — TWO ON THE ADMIN PATH, FOUR IN THE WIZARD
// ════════════════════════════════════════════════════════════════════════════

test('the ADMIN path requires only ชื่อ and นามสกุล', () => {
  assert.match(UPDATE, /if \(!a\.firstName\?\.trim\(\) \|\| !a\.lastName\?\.trim\(\)\)/,
    'the admin attendee check is not the two-field one');
  // Email and phone are no longer part of the refusal…
  assert.equal(/!a\.email\?\.trim\(\)/.test(UPDATE), false, 'the admin path still requires an email');
  assert.equal(/!a\.phone\?\.trim\(\)/.test(UPDATE), false, 'the admin path still requires a phone');
  // …and are still WRITTEN, defaulting to empty rather than being dropped.
  assert.match(UPDATE, /email:\s*String\(a\.email \?\? ''\)/, 'a missing email is not coerced');
  assert.match(UPDATE, /phone:\s*String\(a\.phone \?\? ''\)/, 'a missing phone is not coerced');
});

test('the MODEL is the floor and accepts what the admin path writes', () => {
  /**
   * The model must permit everything any legitimate writer may write, or the
   * admin path would be refused one level down by a validator it does not run.
   * (`updateRegistration` writes with `runValidators:false`, so the sub-schema's
   * `required` would not fire on a save — but leaving it `required` would be a
   * declaration that contradicts the writer, and the next person to turn
   * validators on would break the admin path with a one-word change.)
   */
  const attendee = MODEL.code.slice(
    MODEL.code.indexOf('const AttendeeSchema'),
    MODEL.code.indexOf('const', MODEL.code.indexOf('const AttendeeSchema') + 10),
  );
  assert.ok(attendee.length > 100, 'the AttendeeSchema block did not parse');
  assert.match(attendee, /firstName:[^\n]*required: true/, 'firstName stopped being required on the model');
  assert.match(attendee, /lastName:[^\n]*required: true/, 'lastName stopped being required on the model');
  assert.equal(/email:[^\n]*required: true/.test(attendee), false,
    'the model still requires an email — it is the storage FLOOR and must accept what the admin writes');
  assert.equal(/phone:[^\n]*required: true/.test(attendee), false,
    'the model still requires a phone — see above');
});

test('the WIZARD’s zod is UNCHANGED and still demands all four', () => {
  /**
   * ── THE OTHER DIRECTION, AND IT IS THE ONE THAT WOULD BE "TIDIED" ─────────
   * A reader seeing the model relaxed will reach for this next, in the name of
   * consistency. It is not an inconsistency: this is what we accept FROM A
   * CUSTOMER, and a public registration with no way to contact the attendee is
   * a different product from the one we sell.
   */
  const attendeeSchema = SCHEMA.code.slice(
    SCHEMA.code.indexOf('export const attendeeSchema'),
    SCHEMA.code.indexOf('});', SCHEMA.code.indexOf('export const attendeeSchema')),
  );
  assert.ok(attendeeSchema.length > 100, 'the zod attendeeSchema did not parse');
  for (const field of ['firstName', 'lastName', 'email', 'phone']) {
    assert.ok(attendeeSchema.includes(`${field}:`), `the wizard schema lost ${field}`);
  }
  assert.match(attendeeSchema, /email:\s*z\.string\(\)\.email\(/,
    'the wizard stopped requiring a well-formed email');
  // Was a local `thaiPhoneRegex` constant; now the shared validator/formatter
  // from src/lib/registration/thaiPhone.js (see that ticket's commits) — the
  // marker changed because the underlying implementation genuinely did, not
  // because the requirement weakened. `thaiPhone(` still means "a phone is
  // required and validated", which is what this test is actually pinning.
  assert.match(attendeeSchema, /phone:\s*thaiPhone\(/,
    'the wizard stopped requiring a validated phone');
  // Nothing optional crept in.
  assert.equal(/\.optional\(\)/.test(attendeeSchema), false,
    'a wizard attendee field became optional — that changes what a CUSTOMER may submit');
});

test('the EDITOR agrees with the server about which fields are required', () => {
  /**
   * ══ TWO COPIES OF ONE RULE, PAIRED SO THEY CANNOT DRIFT SILENTLY ═══════════
   *
   * `REQUIRED_ATTENDEE_FIELDS` in the detail client decides whether the editor
   * shows a warning; `updateRegistration` decides whether the save lands. The
   * client's copy exists because a page-level error AFTER a failed save cannot
   * say WHICH of up to fifty rows is at fault, and the admin has already left
   * the field.
   *
   * Two copies is a real risk and it is taken knowingly, so this is the pairing:
   * both name exactly firstName and lastName, and neither names email or phone.
   *
   * ── AND A GAP THIS CLOSES, FOUND BY RE-READING RATHER THAN BY A FAILURE ───
   * Removing `required` from the email and phone `EditField`s bound NOTHING —
   * no assertion anywhere read those props. The screen could have gone on
   * showing a red asterisk beside a field the server accepts empty, which is the
   * screen contradicting the server, and every test would have stayed green.
   */
  assert.match(CLIENT.code, /const REQUIRED_ATTENDEE_FIELDS = \['firstName', 'lastName'\]/,
    'the editor no longer names its required fields, or names different ones');

  // The asterisk follows the same two. Bounded to the attendee editor's four
  // controls, because `required` is also correct on the coordinator's fields.
  const start = CLIENT.code.indexOf('const missing = missingRequired(a);');
  assert.notEqual(start, -1, 'the attendee editor no longer computes its missing fields');
  const editor = CLIENT.code.slice(start, CLIENT.code.indexOf('</div>', CLIENT.code.indexOf('เบอร์โทร', start)));
  assert.match(editor, /label="ชื่อ" required/, 'ชื่อ lost its required marker');
  assert.match(editor, /label="นามสกุล" required/, 'นามสกุล lost its required marker');
  assert.match(editor, /label="อีเมล" type="email" value=/,
    'the attendee email still carries `required` — the screen contradicts the server');
  assert.match(editor, /label="เบอร์โทร" type="tel" value=/,
    'the attendee phone still carries `required` — the screen contradicts the server');
});

test('the warning renders in the ROW, before the save, and does not disable it', () => {
  /**
   * "It must not be a silent save that looks successful" — the failure mode that
   * has shipped on this screen twice. The warning is in the row it is about,
   * above the fields, while the editor is open.
   *
   * It deliberately does NOT disable บันทึก: a disabled save with fifty rows on
   * screen is a button that refuses and explains nothing, and the server refusal
   * is the thing that actually holds.
   *
   * ══ THIS CLAIM IS MADE AGAINST SHAPE, AND HERE IS WHY IT COULD NOT BE MADE
   *    AGAINST BEHAVIOUR ═════════════════════════════════════════════════════
   *
   * The attendee EDITOR is behind `editSection`, which a click sets and which
   * `renderToStaticMarkup` cannot reach — and `createRoot` is banned in this
   * suite (isolation:'none' leaks globalThis.window and once broke twenty-eight
   * render tests). So no tier here can render the warning and read it. Stated
   * rather than left implicit, because a shape guard is a compromise and the
   * next reader should know this one was not a preference.
   *
   * ── AND THE CONTROL CAUGHT THIS TEST BEING VACUOUS ───────────────────────
   * The first version asserted that the warning's STRINGS were in the file —
   * `บันทึกไม่ได้จนกว่าจะกรอกครบ` and the `border-9e-accent/50` class. The
   * `silent-save` control changes the CONDITION to `{false ? (`, leaving every
   * one of those strings exactly where it was, and the test STAYED GREEN on a
   * screen that no longer warns about anything.
   *
   * That is the standing mechanism: an assertion bound to the presence of a
   * token stops applying when the expression AROUND the token is reformulated.
   * So what is pinned now is the CONDITION — that the warning is rendered on
   * `missing.length` — not merely that its words exist somewhere in the file.
   */
  assert.match(CLIENT.code, /const missingRequired = \(a\) =>/, 'the per-row check is gone');
  assert.match(CLIENT.code, /const missing = missingRequired\(a\);/,
    'the editor row no longer computes its own missing fields');

  // THE CONDITION, not the strings: the warning must be gated on there BEING
  // something missing, and the row's border on the same expression.
  assert.match(CLIENT.code, /\{missing\.length \? \(\s*\n\s*<p className="mb-2 text-\[11px\]/,
    'the row warning is not rendered on `missing.length` — it may be dead behind a constant');
  assert.match(CLIENT.code, /missing\.length \? 'border-9e-accent\/50'/,
    'an incomplete row is not marked in the layout');

  // …and the words are still the words, which the condition alone does not say.
  assert.ok(CLIENT.code.includes('บันทึกไม่ได้จนกว่าจะกรอกครบ'),
    'the row warning does not say the save will be refused');
  assert.ok(CLIENT.code.includes('ต้องกรอก'), 'the row warning does not name what is missing');

  // …and nothing disables the card's save on it.
  assert.equal(/disabled=\{[^}]*missing/.test(CLIENT.code), false,
    'the missing-field state disables a control — it is a warning, not a gate');
});

test('CONTROL: the condition probe rejects a warning gated on a constant', () => {
  /**
   * The exact shape `silent-save` produces. Without this, the assertion above is
   * a regex nobody has watched reject anything, and the token-presence version
   * it replaced looked just as convincing.
   */
  const dead = '{false ? (\n                          <p className="mb-2 text-[11px] leading-[16px] text-9e-accent">';
  assert.equal(/\{missing\.length \? \(\s*\n\s*<p className="mb-2 text-\[11px\]/.test(dead), false,
    'the probe accepts a warning that can never render');
  // …and it DOES accept the live shape, so it is not rejecting everything.
  const live = '{missing.length ? (\n                          <p className="mb-2 text-[11px] leading-[16px] text-9e-accent">';
  assert.ok(/\{missing\.length \? \(\s*\n\s*<p className="mb-2 text-\[11px\]/.test(live),
    'the probe cannot see the shape it is written for');
  // The old, defeated form would have passed BOTH — which is the finding.
  assert.ok(dead.includes('text-9e-accent') && live.includes('text-9e-accent'),
    'the control is inert — the token must be present in both, or it was never the trap');
});

test('CONTROL: the two parsers really are reading two different files', () => {
  // Four absences and four presences across two sources is the shape that
  // passes when one of the reads returned an empty string.
  assert.ok(MODEL.code.length > 2000 && SCHEMA.code.length > 2000, 'a source scrubbed to nothing');
  assert.ok(MODEL.code.includes('AttendeeSchema'), 'the model parser is on the wrong file');
  assert.ok(SCHEMA.code.includes('attendeeSchema'), 'the schema parser is on the wrong file');
  // And they genuinely disagree, which is the whole subject of this section.
  // Marker changed from the old local `thaiPhoneRegex` constant to
  // `thaiPhone(` (the shared validator call) — `.code` strips imports, so the
  // OLD marker would not appear in SCHEMA.code at all now that the regex
  // moved into src/lib/registration/thaiPhone.js and is imported, not
  // declared locally. `thaiPhone(` is still exactly the phone-validation
  // marker this test needs: present in the zod schema, absent from the
  // Mongoose model, which has no validation regex of any kind for phone.
  assert.ok(SCHEMA.code.includes('thaiPhone(') && !MODEL.code.includes('thaiPhone('),
    'the two files are not the two layers this test thinks they are');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE CLIENT'S TWO DOORS READ ONE ANSWER
// ════════════════════════════════════════════════════════════════════════════

test('both + buttons read the SAME seatsAvailable, derived once', () => {
  /**
   * There are two ways to add a row: the read view's button and the dashed
   * add-row inside the open editor. A lock on one is bypassed through the other
   * — and the editor's is the one an admin actually reaches for, since it is
   * already open.
   *
   * Asserted as "derived once, read twice" rather than "both are disabled",
   * because two independent derivations would satisfy the second and drift.
   */
  assert.equal((CLIENT.code.match(/const seatsAvailable = rosterHasRoom\(/g) ?? []).length, 1,
    'seatsAvailable is derived more than once, or not at all');
  assert.equal((CLIENT.code.match(/disabled=\{!seatsAvailable\}/g) ?? []).length, 2,
    'the two add-row doors do not both read the shared answer');
  assert.equal((CLIENT.code.match(/title=\{seatsAvailable \? undefined : SEATS_FULL_REASON\}/g) ?? []).length, 2,
    'a disabled add-row does not state why');
});

test('the reason is ONE literal, not three wordings of one rule', () => {
  assert.match(CLIENT.code, /const SEATS_FULL_REASON = 'เพิ่มรายชื่อครบตามจำนวนที่สมัครแล้ว'/,
    'the seat-full reason is not a single named literal');
  // Three surfaces read it: two titles and the visible sentence.
  assert.ok((CLIENT.code.match(/SEATS_FULL_REASON/g) ?? []).length >= 4,
    'the reason literal has fewer readers than the surfaces that state it');
});

test('rosterHasRoom is the shared question, and the client does not re-derive it', () => {
  assert.match(INFO.code, /export function rosterHasRoom/, 'the shared question is gone');
  // The client must not compute the comparison itself.
  assert.equal(/named\s*[<>]=?\s*count/.test(CLIENT.code), false,
    'the client re-derives the seat comparison — that is the second copy');
});
