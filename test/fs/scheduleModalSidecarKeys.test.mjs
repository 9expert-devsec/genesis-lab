import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE SCHEDULE MODAL NEVER PUTS `max_seats` OR `instructor_ids` INTO ITS FORM.
 *
 * ── WHY A SOURCE GUARD AND NOT A RENDER ASSERTION ───────────────────────────
 * The payload is built inside `submitNow`, a click handler on a component that
 * is only mounted after an admin opens the modal. `renderToStaticMarkup` never
 * runs it, and there is no exported seam to call it through — so the thing that
 * must be asserted (which keys reach `FormData`) is not observable from a
 * rendered string. It IS observable in the source, exactly.
 *
 * The complementary half — that the WRITER leaves an absent key alone — is a
 * pure test, in test/pure/scheduleLocalFields. Neither is sufficient by itself:
 * this file would pass on a writer that nulls everything, and that file would
 * pass on a modal that sends `max_seats: ''`. Together they are the guarantee
 * that a stored seat count survives a save.
 *
 * ── WHAT IS BEING PROTECTED ─────────────────────────────────────────────────
 * Five ScheduleLocal rows hold a `max_seats` and four hold an `instructor_ids`
 * roster. The inputs for both were removed from the modal; the data was
 * deliberately kept, and `max_seats` is expected back for in-house quotations.
 * A future edit that re-adds either key to the payload — even set to a blank
 * string, which is the most likely accident — would erase those rows on the
 * next ordinary save.
 *
 * Comments are stripped by test/sourceScan.mjs, so the docstrings in the modal
 * that NAME these fields while explaining their removal do not trip this.
 */

const MODAL = 'src/app/admin/schedules/_components/SchedulesAdminClient.jsx';

/** Every literal key written into a FormData in the file. */
function formDataKeys(code) {
  const keys = new Set();
  for (const m of code.matchAll(/\bfd\.(?:set|append)\(\s*['"]([^'"]+)['"]/g)) {
    keys.add(m[1]);
  }
  return keys;
}

test('the modal writes NEITHER removed key into its submit payload', () => {
  const keys = formDataKeys(readSource(MODAL).code);
  for (const removed of ['max_seats', 'instructor_ids']) {
    assert.equal(
      keys.has(removed),
      false,
      `${MODAL} still sends "${removed}" — an absent input is what keeps the stored value; `
        + 'sending the key at all, even blank, overwrites it',
    );
  }
});

test('and it still writes price_override, which it is authoritative for', () => {
  /**
   * The positive half, and it is load-bearing rather than symmetric. Unlike the
   * other two, `price_override` has live PUBLIC readers — the registration
   * wizard's per-round price — and it decides the amount charged through Omise
   * (lib/registration/resolve-price.js). Its input stays, so its key must too:
   * with the writer now treating an absent key as "leave alone", a modal that
   * stopped sending it would make a per-round price impossible to change.
   */
  const keys = formDataKeys(readSource(MODAL).code);
  assert.equal(keys.has('price_override'), true, `${MODAL} no longer sends price_override at all`);
});

test('price_override is sent UNCONDITIONALLY, so a cleared box can reset it', () => {
  /**
   * The old line was `if (priceOverride !== '') fd.set('price_override', …)`.
   * That guard was harmless while the writer clobbered everything — a missing
   * key nulled the field, which happened to be what clearing the box meant.
   * Now that an absent key means "leave alone", the same guard would make a
   * price settable but never unsettable. The set must be unguarded.
   */
  const code = readSource(MODAL).code;
  assert.match(
    code,
    /(?<!\)\s*)fd\.set\(\s*['"]price_override['"]\s*,\s*priceOverride\s*\)/,
    'price_override must be set unconditionally, not behind an emptiness guard',
  );
  assert.equal(
    /if\s*\([^)]*priceOverride[^)]*\)\s*fd\.set/.test(code),
    false,
    'the `!== \'\'` guard is back — a cleared price would no longer reset the round',
  );
});

test('the two removed inputs are really gone from the JSX, not just from submit', () => {
  /**
   * A payload guard alone would pass on a modal that still renders both inputs
   * and silently discards what the admin types — which is worse than either
   * state, because the form would look like it works.
   */
  const code = readSource(MODAL).code;
  assert.equal(
    /setMaxSeats|const \[maxSeats/.test(code),
    false,
    'the จำนวนที่นั่ง input or its state is still in the modal',
  );
  assert.equal(
    /toggleInstructor|setInstructorIds|const \[instructorIds/.test(code),
    false,
    'the วิทยากร checkbox list or its state is still in the modal',
  );
});

test('the SCHEMA still declares all three — this was a UI removal, not a drop', () => {
  /**
   * The other direction, and the reason it is worth a test: the next person to
   * read this screen finds no input for `max_seats` and may conclude the column
   * is dead. It is not. The data is retained deliberately and the field is
   * expected back for in-house quotation requests, so the schema going missing
   * is a regression this guard names out loud.
   */
  const model = readSource('src/models/ScheduleLocal.js').code;
  for (const field of ['max_seats', 'price_override', 'instructor_ids']) {
    assert.match(
      model,
      new RegExp(`\\b${field}\\s*:`),
      `ScheduleLocal no longer declares ${field} — the UI removal must not become a schema drop`,
    );
  }
});

test('the admin grid still RENDERS the retained values', () => {
  /**
   * The data stays visible even though it is no longer editable here, which is
   * what makes "the values are still there" checkable by a human rather than
   * only by a database client. If these reads are ever removed too, the stored
   * rows become invisible AND uneditable, and nothing on screen would say they
   * exist.
   */
  const code = readSource(MODAL).code;
  assert.match(code, /local\?\.max_seats\s*!=\s*null/, 'the grid stopped showing the seat count');
  assert.match(code, /local\?\.instructor_ids/, 'the grid stopped showing the instructor names');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the key extractor DOES find the keys the modal really sends', () => {
  /**
   * Every assertion above is an absence, and an extractor that matched nothing
   * would satisfy all of them together — the worst possible combination. So the
   * probe is proved to see the keys that ARE there.
   */
  const keys = formDataKeys(readSource(MODAL).code);
  for (const present of ['course_id', 'dates_json', 'status', 'type', 'signup_url', 'schedule_id']) {
    assert.ok(keys.has(present), `the extractor missed "${present}" — it is not reading the payload`);
  }
  assert.ok(keys.size >= 6);
});

test('CONTROL: the extractor DOES fire on a reintroduced key', () => {
  // Run against the exact line that was removed, plus the blank-string form
  // that is the likelier accident.
  assert.ok(formDataKeys("if (maxSeats) fd.set('max_seats', maxSeats);").has('max_seats'));
  assert.ok(formDataKeys("fd.set('max_seats', '');").has('max_seats'));
  assert.ok(formDataKeys("for (const id of ids) fd.append('instructor_ids', id);").has('instructor_ids'));
});

test('CONTROL: the sweep is reading real code, not an empty string', () => {
  const src = readSource(MODAL);
  assert.ok(src.code.length > 5000, `${MODAL} was not actually read`);
  assert.ok(readSource('src/models/ScheduleLocal.js').code.length > 200);
});
