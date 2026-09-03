import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * WHICH SIDECAR KEYS THE SCHEDULE MODAL PUTS INTO ITS FORM, AND WHICH IT DOES NOT.
 *
 * The writer (`sidecarSetFields`) reads PRESENCE, so which keys the form carries
 * is the whole contract:
 *
 *   max_seats       SENT, unconditionally, blank included — the admin can set
 *                   the cap AND clear it back to ไม่จำกัด.
 *   price_override  SENT, unconditionally, blank included — same rule, and it
 *                   additionally feeds resolveCheckoutPricing and the Omise
 *                   charge.
 *   instructor_ids  NOT SENT AT ALL. It has no input on this form, so the form
 *                   has no opinion, and the 4 stored rosters must be left alone.
 *
 * `max_seats` was briefly removed from this modal and is BACK: "keep max_seats"
 * meant the admin must still be able to ENTER it, not merely that the stored
 * number survives. The 5 stored seat counts were never at risk — the
 * presence-based writer is what guarantees that — so restoring it was re-adding
 * an input, with no data to recover.
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

test('it DOES write max_seats and price_override, the two inputs on screen', () => {
  /**
   * The positive half, and load-bearing rather than symmetric.
   *
   * `max_seats` was briefly removed from this modal and is BACK — the admin
   * must be able to ENTER a seat cap, not merely have the stored number
   * survive. `price_override` never left, and additionally has live PUBLIC
   * readers (the registration wizard's per-round price) and decides the amount
   * charged through Omise (lib/registration/resolve-price.js).
   *
   * With the writer treating an absent key as "leave alone", a modal that
   * stopped sending either would render an input that silently does nothing.
   */
  const keys = formDataKeys(readSource(MODAL).code);
  assert.equal(keys.has('max_seats'), true, `${MODAL} no longer sends max_seats at all`);
  assert.equal(keys.has('price_override'), true, `${MODAL} no longer sends price_override at all`);
});

test('BOTH are sent UNCONDITIONALLY, so a cleared box can reset either', () => {
  /**
   * A field an admin can SET must be one they can UNSET. The retired shapes
   * were `if (maxSeats) fd.set(…)` and `if (priceOverride !== '') fd.set(…)`.
   * Those guards were harmless while the writer clobbered everything — a
   * missing key nulled the field, which happened to be what clearing the box
   * meant. Now that an absent key means "leave alone", either guard would make
   * its field settable but never removable: clearing จำนวนที่นั่ง would fail to
   * restore ไม่จำกัด, and clearing ราคาต่อท่าน would fail to restore the
   * course's normal price. Both sets must be unguarded.
   */
  const code = readSource(MODAL).code;

  assert.match(
    code,
    /(?<!\)\s*)fd\.set\(\s*['"]max_seats['"]\s*,\s*maxSeats\s*\)/,
    'max_seats must be set unconditionally, not behind an emptiness guard',
  );
  assert.match(
    code,
    /(?<!\)\s*)fd\.set\(\s*['"]price_override['"]\s*,\s*priceOverride\s*\)/,
    'price_override must be set unconditionally, not behind an emptiness guard',
  );

  // The two retired guards, named so the probe fires on the real regression.
  assert.equal(
    /if\s*\([^)]*maxSeats[^)]*\)\s*fd\.set/.test(code),
    false,
    'the `if (maxSeats)` guard is back — a cleared seat count would no longer clear',
  );
  assert.equal(
    /if\s*\([^)]*priceOverride[^)]*\)\s*fd\.set/.test(code),
    false,
    "the `!== ''` guard is back — a cleared price would no longer reset the round",
  );
});

test('the max_seats INPUT is back in the JSX, wired to its state', () => {
  /**
   * A payload guard alone would pass on a modal that sends `maxSeats` from a
   * state nothing can edit — the field would be permanently whatever it loaded
   * as, which is the failure C1 exists to undo.
   */
  const code = readSource(MODAL).code;
  assert.match(code, /const \[maxSeats, setMaxSeats\] = useState\(/, 'the จำนวนที่นั่ง state is missing');
  assert.match(code, /value=\{maxSeats\}/, 'no input is bound to it');
  assert.match(code, /onChange=\{\(e\) => setMaxSeats\(e\.target\.value\)\}/, 'the input cannot be typed into');
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
  for (const present of ['course_id', 'dates_json', 'status', 'type', 'signup_url', 'schedule_id']) {
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

test('CONTROL: the guard probes DO fire on the two retired shapes', () => {
  /**
   * The unconditional-send assertions are two absences and one match each. The
   * absences are proved against the real retired lines, so "no guard" cannot
   * pass by the probe simply never matching anything.
   */
  const guardedSeats = "if (maxSeats) fd.set('max_seats', maxSeats);";
  const guardedPrice = "if (priceOverride !== '') fd.set('price_override', priceOverride);";
  assert.ok(/if\s*\([^)]*maxSeats[^)]*\)\s*fd\.set/.test(guardedSeats), 'the seats-guard probe is blind');
  assert.ok(/if\s*\([^)]*priceOverride[^)]*\)\s*fd\.set/.test(guardedPrice), 'the price-guard probe is blind');

  // …and do NOT fire on the unguarded form the modal actually ships.
  assert.equal(/if\s*\([^)]*maxSeats[^)]*\)\s*fd\.set/.test("fd.set('max_seats', maxSeats);"), false);
  assert.equal(
    /if\s*\([^)]*priceOverride[^)]*\)\s*fd\.set/.test("fd.set('price_override', priceOverride);"),
    false,
  );
});

test('CONTROL: the sweep is reading real code, not an empty string', () => {
  const src = readSource(MODAL);
  assert.ok(src.code.length > 5000, `${MODAL} was not actually read`);
  assert.ok(readSource('src/models/ScheduleLocal.js').code.length > 200);
});
