import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE CAREER-PATH REGISTRATION KEEPS THE ROUND'S REAL TRAINING DAYS.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * `SelectedCourseSchema` stored a round as `round` (a Thai label formatted in
 * the visitor's browser), `startDate` and `endDate`. All three answer "first day
 * to last day", so a round on 8, 10 and 12 ต.ค. — nothing on the 9th or the
 * 11th — was stored as "8–12" and the two missing days were unrecoverable.
 * src/lib/schedule/roundDateLabel.js names this exact file as one of the five
 * formatters that got it wrong; the fix that file made for the SCREEN could not
 * reach a document whose day list was never written down.
 *
 * ── WHY SOURCE-SCANNED AND NOT BEHAVIOURAL ──────────────────────────────────
 * The claim is "the payload the form submits carries the days". That payload is
 * built inside `handleConfirm` in a client component, from react-hook-form state
 * assembled across three wizard steps — there is no exported function to call
 * and no seam to inject at. A render test could drive the wizard, but it would
 * prove the CLICK works, not that the key reaches Mongo; the key can be dropped
 * from the object literal with every rendered pixel unchanged.
 *
 * So the object literal itself is the subject. Read through test/sourceScan.mjs,
 * which strips comments and normalises line endings — this repo's working tree
 * is CRLF, and the comments in the very files under test talk about `dates` at
 * length, so an unscrubbed matcher would be satisfied by prose.
 *
 * ── `raw` FOR LINE NUMBERS, `code` FOR CLAIMS ───────────────────────────────
 * `code` collapses each block comment to one space, so its line numbers are not
 * the file's. Every position assertion below reads `raw` (newline-normalised,
 * comments intact) and every "this is real code, not a comment" assertion reads
 * `code`. Both are asserted for the declaration, because either one alone is a
 * silent false pass.
 */

const MODEL = readSource('src/models/CareerPathRegistration.js');
const CLIENT = readSource(
  'src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx'
);

/**
 * The 1-based line numbers in `raw` whose text matches `re`.
 *
 * Split on '\n' alone is safe: `readSource` has already collapsed CRLF, which is
 * the whole reason it hands back `raw` rather than the bytes on disk.
 */
function linesMatching(raw, re) {
  return raw
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => re.test(line))
    .map(([n]) => n);
}

/**
 * The line `re` occurs on, asserted to be a real line number and to occur
 * EXACTLY ONCE, and printed so a failure elsewhere in this file can be located
 * without re-deriving it by hand.
 */
function soleLineOf(raw, re, label) {
  const hits = linesMatching(raw, re);
  assert.equal(hits.length, 1, `${label}: expected exactly one line, found ${hits.length}`);

  const [line] = hits;
  assert.notEqual(line, undefined, `${label}: no line number was computed`);
  assert.equal(typeof line, 'number', `${label}: line number is not numeric`);
  assert.ok(Number.isInteger(line) && line > 0, `${label}: ${line} is not a real line number`);

  console.log(`[careerPathRoundDays] ${label} → line ${line}`);
  return line;
}

// ── 1. The model declares the day list, per COURSE ──────────────────────────

const DATES_DECL = /\bdates:\s*\{\s*type:\s*\[String\]/;

test('the model declares the day list exactly once, as a string array', () => {
  soleLineOf(MODEL.raw, DATES_DECL, 'dates declaration');

  // The same construct in the SCRUBBED source, so the long note above the field
  // — which spells `dates` several times — cannot be what satisfied the line
  // reader. Without this, deleting the declaration and keeping its comment is a
  // green run.
  assert.match(MODEL.code, DATES_DECL, 'the declaration is a comment, not code');
});

test('it sits inside the SELECTED-COURSE sub-schema, not on the registration', () => {
  /**
   * A day list on the registration document would be one array for every round
   * the customer picked — a career path is N courses on N different rounds, and
   * the one thing that array could not say is which days belong to which course.
   * Position is the whole claim, so it is asserted rather than assumed.
   */
  const subSchema = soleLineOf(
    MODEL.raw,
    /const\s+SelectedCourseSchema\s*=/,
    'SelectedCourseSchema'
  );
  const registration = soleLineOf(
    MODEL.raw,
    /const\s+CareerPathRegistrationSchema\s*=/,
    'CareerPathRegistrationSchema'
  );
  const dates = soleLineOf(MODEL.raw, DATES_DECL, 'dates declaration');

  assert.ok(
    subSchema < dates && dates < registration,
    `dates is at ${dates}, outside SelectedCourseSchema (${subSchema}..${registration})`
  );
});

test('the day list defaults to an EMPTY ARRAY — absent, never null', () => {
  /**
   * Forward-only: every document written before this field existed reads back
   * `[]`, which is the honest answer ("this round's days were never recorded")
   * and lets a reader fall back to `round` on a truthiness check. `default: null`
   * would make the same question throw on `.length` at the reader instead.
   */
  assert.match(
    MODEL.code,
    /\bdates:\s*\{\s*type:\s*\[String\],\s*default:\s*\[\]\s*\}/,
    'the day list must default to []'
  );
});

// ── 2. The submitted payload carries it, RAW ────────────────────────────────

/** The `selectedCourses.push({ … })` object literal, as scrubbed text. */
const PUSH_LITERAL = (() => {
  const m = CLIENT.code.match(/selectedCourses\.push\(\{([\s\S]*?)\}\);/);
  assert.ok(m, 'selectedCourses.push({…}) not found — this guard has lost its subject');
  return m[1];
})();

test('the submitted payload carries the day list', () => {
  assert.match(
    PUSH_LITERAL,
    /\bdates:/,
    'the days are held at the pick site and dropped at submit — the defect this guard exists for'
  );
});

test('the payload reads the pick`s own days, array-guarded', () => {
  // `sel.dates` can be absent on a pick restored from an older shape, and a
  // non-array reaching a `[String]` path is a cast error at save time — which
  // surfaces as a failed registration, not as a missing field.
  assert.match(
    PUSH_LITERAL,
    /\bdates:\s*Array\.isArray\(sel\.dates\)\s*\?\s*sel\.dates\s*:\s*\[\]/,
    'the day list must come from the selection, guarded to an array'
  );
});

test('the day list is stored RAW — the payload formats nothing', () => {
  /**
   * Formatting here would be the sixth round-date formatter in this repo, and
   * the reason the day list is being persisted at all is that the fifth one
   * (`formatThaiRange`, in this same file) cannot be trusted with it. The label
   * is a reader's job, in one place.
   */
  const datesValue = PUSH_LITERAL.match(/\bdates:\s*([^\n]*)/)?.[1] ?? '';
  assert.notEqual(datesValue, '', 'the dates entry has no value to check');

  for (const banned of [/formatThaiRange/, /THAI_MONTHS/, /\b543\b/, /toLocale/]) {
    assert.doesNotMatch(
      datesValue,
      banned,
      `the day list is being formatted at the write site: ${datesValue.trim()}`
    );
  }
});

test('round, startDate and endDate are UNTOUCHED — the screen still says what it said', () => {
  /**
   * The day list is an ADDITION. Repointing `round` at a correct formatter in
   * the same change would alter what the confirmation screen and the admin
   * detail row read, on documents that are already filed, in a commit whose
   * subject is persistence.
   */
  for (const [key, re] of [
    ['round', /\bround:\s*sel\.round\b/],
    ['startDate', /\bstartDate:\s*sel\.startDate\b/],
    ['endDate', /\bendDate:\s*sel\.endDate\b/],
  ]) {
    assert.match(PUSH_LITERAL, re, `${key} must still be submitted, unchanged`);
  }

  // And `round` is still filled by the local formatter at the pick site.
  assert.match(
    CLIENT.code,
    /\bround:\s*formatThaiRange\(dates\)/,
    'the screen label must keep its current source'
  );
});

// ── 3. Controls ─────────────────────────────────────────────────────────────

test('CONTROL: soleLineOf refuses zero matches and refuses two', () => {
  // Both directions, because a reader that silently accepts either turns every
  // position assertion above into a coin flip.
  assert.throws(
    () => soleLineOf('a\nb\nc', /zzz-not-here/, 'absent'),
    /expected exactly one line, found 0/
  );
  assert.throws(
    () => soleLineOf('hit\nmiss\nhit', /hit/, 'doubled'),
    /expected exactly one line, found 2/
  );
});

test('CONTROL: the payload probes DO go red on a payload that omits the days', () => {
  /**
   * Without this the three payload assertions are vacuous — a matcher that can
   * never fire reports success forever. Fired at the literal as it stood BEFORE
   * this change, which is the exact text that has to stay caught.
   */
  const before = `
            courseName: sel.courseName,
            courseCode: sel.courseCode,
            round:      sel.round,
            startDate:  sel.startDate,
            endDate:    sel.endDate,
            type:       sel.type,
            scheduleId: sel.scheduleId,
  `;
  assert.equal(/\bdates:/.test(before), false, 'the old payload must read as missing');

  // And the raw-storage probe catches a formatted day list, which is the other
  // way this lands wrong: present, but a label.
  const formatted = 'dates:      formatThaiRange(sel.dates),';
  assert.match(formatted.match(/\bdates:\s*([^\n]*)/)[1], /formatThaiRange/);
});

test('CONTROL: both readers are reading the real files', () => {
  // Every "does not match" assertion above passes on an empty string, and
  // `readSource` returning one (wrong path, failed scrub) is silent.
  assert.ok(MODEL.raw.length > 1500, 'the model was actually read');
  assert.ok(CLIENT.code.length > 20000, 'the client was actually read');
  assert.match(MODEL.code, /collection:\s*'career_path_registrations'/, 'the right model');
  assert.ok(PUSH_LITERAL.length > 100, 'the push literal was actually captured');
});
