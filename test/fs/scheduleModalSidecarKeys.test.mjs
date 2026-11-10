import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * WHICH SIDECAR KEYS THE SCHEDULE MODAL PUTS INTO ITS FORM, AND WHICH IT DOES NOT.
 *
 * The writer (`sidecarSetFields`) reads PRESENCE, so which keys the form carries
 * is the whole contract:
 *
 *   admin_note      SENT, unconditionally, blank included — หมายเหตุ, on screen.
 *   max_seats       NOT SENT AT ALL (input hidden 2026-11-09). The 8 stored
 *                   seat counts must be left alone.
 *   price_override  NOT SENT AT ALL (input hidden 2026-11-09; 0 rows use it).
 *                   Its public readers — resolveCheckoutPricing, the Omise
 *                   charge — are unchanged.
 *   instructor_ids  NOT SENT AT ALL. It has no input on this form, so the form
 *                   has no opinion, and the 4 stored rosters must be left alone.
 *
 * History: `max_seats` was once removed, restored as "wanted for in-house
 * quotations", and is now hidden again by an explicit decision after a grep of
 * src/ found no reader of it outside /admin/schedules.
 *
 * ── WHY A SOURCE GUARD AND NOT A RENDER ASSERTION ───────────────────────────
 * The payload is built inside `submitNow`, a click handler on a component that
 * is only mounted after an admin opens the modal. `renderToStaticMarkup` never
 * runs it, and there is no exported seam to call it through — so the thing that
 * must be asserted (which keys reach `FormData`) is not observable from a
 * rendered string. It IS observable in the source, exactly.
 *
 * The complementary half — what the WRITER does with a present or absent key —
 * is a pure test, in test/pure/scheduleLocalFields. Neither is sufficient by
 * itself: this file would pass on a writer that nulls everything, and that file
 * would pass on a modal that renders an input it never submits. Together they
 * are the guarantee that a stored roster survives a save and a typed seat count
 * reaches the database.
 *
 * Comments are stripped by test/sourceScan.mjs, so the docstrings in the modal
 * that NAME these fields while explaining the arrangement do not trip this.
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

test('the modal writes NO instructor_ids key into its submit payload', () => {
  /**
   * The one sidecar field with no input on the form. 4 stored rosters depend on
   * the key being ABSENT rather than blank: the writer reads presence, so
   * sending it at all — even as '' — is an instruction to empty them.
   */
  const keys = formDataKeys(readSource(MODAL).code);
  assert.equal(
    keys.has('instructor_ids'),
    false,
    `${MODAL} sends "instructor_ids" — an absent key is what keeps the stored roster; `
      + 'sending it at all, even blank, empties it',
  );
});

/*
 * ── 2026-11-09: THE "ข้อมูลเฉพาะ Genesis" BLOCK IS HIDDEN ─────────────────────
 * Decision: hide the per-round price input (0 rows use it) and — because a grep
 * of src/ found no `max_seats` reader outside /admin/schedules — the seat input
 * too. UI only. The three tests that pinned those inputs ON SCREEN and SENT are
 * replaced by their inverse: neither key is sent at all, so the presence-based
 * writer leaves the 8 stored seat counts (and any price) exactly as they are.
 * `admin_note` (หมายเหตุ) takes the block's place and IS sent, unconditionally.
 */

test('the modal sends NEITHER max_seats NOR price_override — the stored values survive', () => {
  const keys = formDataKeys(readSource(MODAL).code);
  assert.equal(keys.has('max_seats'), false, `${MODAL} sends max_seats — even blank, that nulls a stored seat count`);
  assert.equal(keys.has('price_override'), false, `${MODAL} sends price_override — even blank, that nulls a stored price`);
});

test('the seat and price INPUTS are gone from the JSX', () => {
  const code = readSource(MODAL).code;
  assert.equal(/setMaxSeats|setPriceOverride|value=\{maxSeats\}|value=\{priceOverride\}/.test(code), false,
    'a seat or price input (or its state) is still in the modal');
  assert.equal(code.includes('ข้อมูลเฉพาะ Genesis (ไม่ส่งไป MSDB)'), false, 'the hidden section heading is still rendered');
});

test('admin_note is sent UNCONDITIONALLY from a textarea bound to its state', () => {
  const code = readSource(MODAL).code;
  assert.ok(formDataKeys(code).has('admin_note'), 'the note is not in the submit payload');
  assert.match(code, /(?<!\)\s*)fd\.set\(\s*['"]admin_note['"]\s*,\s*adminNote\s*\)/, 'admin_note must be set unconditionally');
  assert.match(code, /<textarea[\s\S]*?value=\{adminNote\}/, 'no textarea is bound to the note');
  assert.match(code, /setAdminNote\(e\.target\.value\)/, 'the textarea cannot be typed into');
  assert.match(code, /หมายเหตุ/);
});

test('the วิทยากร input is really gone from the JSX, not just from submit', () => {
  /**
   * The converse, and the one that stayed removed. A payload guard alone would
   * pass on a modal that still renders the checkbox list and silently discards
   * every tick — worse than either state, because the form would look like it
   * works.
   */
  const code = readSource(MODAL).code;
  assert.equal(
    /toggleInstructor|setInstructorIds|const \[instructorIds/.test(code),
    false,
    'the วิทยากร checkbox list or its state is still in the modal',
  );
});

test('the SCHEMA still declares all three — the removal was UI-only, not a drop', () => {
  /**
   * The other direction, and the reason it is worth a test: the next person to
   * read this screen finds no input for `instructor_ids` and may conclude the
   * column is dead. It is not — the 4 stored rosters are retained deliberately
   * and the grid still renders them — so the schema going missing is a
   * regression this guard names out loud.
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

test('the admin grid still RENDERS the retained roster and the seat count', () => {
  /**
   * `instructor_ids` has no input any more, so the grid cell is the ONLY place
   * a human can see that the 4 stored rosters still exist. If this read is ever
   * removed too, they become invisible AND uneditable, and nothing on screen
   * would say they are there. `max_seats` is checked alongside it because the
   * two cells are one block and are most likely to be deleted together.
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
  for (const present of ['course_id', 'dates_json', 'status', 'type', 'signup_url', 'schedule_id', 'admin_note']) {
    assert.ok(keys.has(present), `the extractor missed "${present}" — it is not reading the payload`);
  }
  assert.ok(keys.size >= 6);
});

test('CONTROL: the extractor DOES fire on a reintroduced roster key', () => {
  // The exact line that was removed, plus the blank-string form that is the
  // likelier accident. Both must be seen, or the absence assertion is vacuous.
  assert.ok(formDataKeys("for (const id of ids) fd.append('instructor_ids', id);").has('instructor_ids'));
  assert.ok(formDataKeys("fd.set('instructor_ids', '');").has('instructor_ids'));
});

test('CONTROL: the extractor DOES fire on a reintroduced seat or price key', () => {
  // The two lines this round removed. If the extractor could not see them, the
  // "sends NEITHER" assertion above would pass vacuously.
  assert.ok(formDataKeys("fd.set('max_seats', maxSeats);").has('max_seats'));
  assert.ok(formDataKeys("fd.set('price_override', priceOverride);").has('price_override'));
});

test('CONTROL: the sweep is reading real code, not an empty string', () => {
  const src = readSource(MODAL);
  assert.ok(src.code.length > 5000, `${MODAL} was not actually read`);
  assert.ok(readSource('src/models/ScheduleLocal.js').code.length > 200);
});
