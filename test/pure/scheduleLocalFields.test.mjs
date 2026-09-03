import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIDECAR_KEYS,
  sidecarSetFields,
  toNullableNum,
  toStrArr,
} from '@/lib/schedule/scheduleLocalFields';

/**
 * AN ABSENT FORM KEY MUST NOT OVERWRITE A STORED SIDECAR VALUE.
 *
 * ── WHY THIS IS THE ASSERTION THAT MATTERS ──────────────────────────────────
 * `upsertLocal` built its `$set` by reading all three sidecar keys off the
 * FormData unconditionally. `FormData.get` returns `null` for a key that was
 * never sent and `toNullableNum(null)` is `null`, so a save that did not
 * mention `max_seats` still wrote `max_seats: null` over whatever was stored.
 * The same for the roster, via `getAll` → `[]`.
 *
 * That was invisible while every sidecar input was on screen and every save
 * carried all three. Removing the จำนวนที่นั่ง and วิทยากร inputs from the
 * schedule modal makes it fire on EVERY edit: five rows currently hold a
 * `max_seats` and four hold an `instructor_ids` roster, and each would have
 * been erased the next time an admin changed a date.
 *
 * So the test is `'max_seats' in result === false` — the KEY, not its value. A
 * check that the value is null or falsy would pass on exactly the `$set` that
 * destroys the data, which is why every case below asserts membership.
 */

/**
 * The schedule modal's real payload.
 *
 * TWO sidecar keys, both sent unconditionally and both blank by default —
 * จำนวนที่นั่ง and ราคาต่อท่าน are the inputs on screen. `instructor_ids` is
 * NOT here, and its absence is the thing several cases below assert.
 */
function modalFormData({ seats = '', price = '' } = {}) {
  const fd = new FormData();
  fd.set('course_id', 'POWER-BI');
  fd.set('dates_json', JSON.stringify(['2026-09-16']));
  fd.set('status', 'open');
  fd.set('type', 'classroom');
  fd.set('signup_url', '');
  // Both on-screen sidecar inputs. Always sent, blank included — see the modal.
  fd.set('max_seats', seats);
  fd.set('price_override', price);
  return fd;
}

// ── the removed input ───────────────────────────────────────────────────────

test('a form with NO instructor_ids key produces NO instructor_ids in the $set', () => {
  /**
   * The one field with no input on the form. 4 stored rosters depend on this
   * being an absent KEY rather than an empty value.
   */
  const out = sidecarSetFields(modalFormData());
  assert.equal('instructor_ids' in out, false, 'an absent input would have emptied the stored roster');
  assert.equal(Object.hasOwn(out, 'instructor_ids'), false);
});

test('the modal\'s real payload touches max_seats and price_override, and NOTHING else', () => {
  /**
   * The whole shape in one assertion, so a future edit that re-adds
   * `instructor_ids` — even set to '' — reddens here rather than in production.
   */
  assert.deepEqual(sidecarSetFields(modalFormData({ seats: '30', price: '8500' })), {
    max_seats: 30,
    price_override: 8500,
  });
});

// ── the two inputs on screen ────────────────────────────────────────────────

test('max_seats IS present when sent, and a blank CLEARS it to null', () => {
  /**
   * THE C1 RULE. `max_seats` was briefly removed from the modal and is back,
   * and coming back it gained the property `price_override` already had: a
   * field an admin can SET must be one they can UNSET. Clearing จำนวนที่นั่ง
   * has to reach the database as null (= ไม่จำกัด).
   *
   * This is why the test is `has()` and not "is it empty". Reading a blank as
   * "leave alone" would make a seat cap settable but never removable; reading
   * an ABSENT key as "set null" is the clobber the writer exists to prevent.
   * Only both together are correct.
   */
  const cleared = sidecarSetFields(modalFormData({ seats: '' }));
  assert.equal('max_seats' in cleared, true, 'a cleared seat count must still be written');
  assert.equal(cleared.max_seats, null);

  const set = sidecarSetFields(modalFormData({ seats: '30' }));
  assert.equal(set.max_seats, 30);
});

test('price_override IS present when sent, and a blank clears it to null', () => {
  /**
   * The other half of the presence rule, and the reason the test is `has()` and
   * not "is it empty". `price_override`'s input is still on screen, so the form
   * is authoritative for it: an admin who clears the box means "use the
   * course's normal price", and that has to reach the database as null. If
   * emptiness were read as "leave alone", a per-round price could be set but
   * never unset.
   */
  const cleared = sidecarSetFields(modalFormData({ price: '' }));
  assert.equal('price_override' in cleared, true, 'a cleared price must still be written');
  assert.equal(cleared.price_override, null);

  const set = sidecarSetFields(modalFormData({ price: '12000' }));
  assert.equal(set.price_override, 12000);
});

// ── THE C1 ROUND-TRIP: a stored seat count, saved two ways ─────────────────

test('a stored max_seats saved AT ITS LOADED VALUE survives untouched', () => {
  /**
   * The ordinary edit. The modal seeds `maxSeats` from `existingLocal.max_seats`
   * and sends it straight back, so an admin who changes a DATE and nothing else
   * must find the seat count exactly as it was.
   *
   * Simulated as a Mongo `$set` merge, because that is what `upsertLocal`
   * actually does with this object — asserting the fragment alone would not
   * show what reaches the stored document.
   */
  const stored = { max_seats: 30, price_override: null, instructor_ids: ['i-1'] };
  const after = {
    ...stored,
    ...sidecarSetFields(modalFormData({ seats: '30', price: '' })),
  };
  assert.equal(after.max_seats, 30, 'a no-op save changed the seat count');
  assert.deepEqual(after.instructor_ids, ['i-1'], 'and it must not touch the roster either');
});

test('the same schedule saved with the input CLEARED loses the value', () => {
  /**
   * The other half, and the reason C1 changed `max_seats` from "send only when
   * truthy" to "always send". Under the old `if (maxSeats)` guard the key was
   * omitted when the box was empty, which the presence-based writer reads as
   * "leave alone" — so the seat cap could never be removed once set.
   */
  const stored = { max_seats: 30, price_override: null, instructor_ids: ['i-1'] };
  const after = {
    ...stored,
    ...sidecarSetFields(modalFormData({ seats: '', price: '' })),
  };
  assert.equal(after.max_seats, null, 'clearing the box did not clear the value');
  assert.deepEqual(after.instructor_ids, ['i-1'], 'clearing seats must not disturb the roster');
});

test('CONTROL: the retired `if (maxSeats)` guard makes the value UNCLEARABLE', () => {
  /**
   * The mutant, written out. Under it a cleared box omits the key, the writer
   * leaves the stored value alone, and the admin's edit silently does nothing —
   * which is exactly what the case above would stop meaning if the guard came
   * back.
   */
  const guarded = (seats) => {
    const fd = modalFormData({ price: '' });
    fd.delete('max_seats');
    if (seats) fd.set('max_seats', seats);
    return fd;
  };
  const stored = { max_seats: 30 };
  const after = { ...stored, ...sidecarSetFields(guarded('')) };
  assert.equal(after.max_seats, 30, 'the guarded form should fail to clear — that is the defect');

  // …and the shipped form does clear it.
  const now = { ...stored, ...sidecarSetFields(modalFormData({ seats: '' })) };
  assert.equal(now.max_seats, null);
});

// ── presence, when a form carries the roster too ────────────────────────────

test('a form that DOES carry instructor_ids still writes them', () => {
  /**
   * The positive half. Without it, a `sidecarSetFields` that returned `{}` for
   * everything would satisfy every absence assertion above — and would quietly
   * make both on-screen inputs dead too.
   */
  const fd = modalFormData({ seats: '30', price: '8500' });
  fd.append('instructor_ids', 'i-1');
  fd.append('instructor_ids', 'i-2');

  const out = sidecarSetFields(fd);
  assert.equal(out.max_seats, 30);
  assert.deepEqual(out.instructor_ids, ['i-1', 'i-2']);
  assert.equal(out.price_override, 8500);
});

test('a roster sent as a single repeated key keeps EVERY instructor', () => {
  // `getAll`, not `get` — `get` returns only the first value of a repeated
  // field, which would silently drop every instructor after the first.
  const fd = modalFormData();
  for (const id of ['a', 'b', 'c']) fd.append('instructor_ids', id);
  assert.deepEqual(sidecarSetFields(fd).instructor_ids, ['a', 'b', 'c']);
});

test('an EXPLICITLY EMPTIED roster is still an instruction to empty it', () => {
  /**
   * `fd.set('instructor_ids', '')` is a present key with a blank value — the
   * shape a future "clear all instructors" control would send. It must clear,
   * not be mistaken for absence, for the same reason a blank price clears.
   */
  const fd = modalFormData();
  fd.set('instructor_ids', '');
  const out = sidecarSetFields(fd);
  assert.equal('instructor_ids' in out, true);
  assert.deepEqual(out.instructor_ids, []);
});

// ── coercion, unchanged from the copy this replaced ─────────────────────────

test('toNullableNum keeps its exact previous behaviour', () => {
  // Byte-for-byte the old rule: blank/absent → null, and 0 or negative is "not
  // declared" rather than a real value.
  assert.equal(toNullableNum(''), null);
  assert.equal(toNullableNum(null), null);
  assert.equal(toNullableNum(undefined), null);
  assert.equal(toNullableNum('0'), null);
  assert.equal(toNullableNum('-5'), null);
  assert.equal(toNullableNum('abc'), null);
  assert.equal(toNullableNum('30'), 30);
  assert.equal(toNullableNum(30), 30);
});

test('toStrArr keeps its exact previous behaviour', () => {
  assert.deepEqual(toStrArr([]), []);
  assert.deepEqual(toStrArr(['a', '', ' b ']), ['a', 'b']);
  assert.deepEqual(toStrArr('a, b ,,c'), ['a', 'b', 'c']);
  assert.deepEqual(toStrArr(''), []);
  assert.deepEqual(toStrArr(null), []);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the OLD unconditional builder DOES destroy the stored roster', () => {
  /**
   * The exact code that was in `upsertLocal`, run against the modal's real
   * payload. Naming the defect as executable code is what stops this file from
   * reading as a tautology — and it is the shape a future "tidy-up" would most
   * plausibly reintroduce.
   *
   * `instructor_ids` is the field that shows it now: it is the one with no
   * input, so it is the one the form is silent about. The old builder answers
   * that silence with `[]` and wipes the 4 stored rosters. (`max_seats` no
   * longer demonstrates the bug, because its input is back and the form really
   * is authoritative for it — which is exactly why the two are tested
   * differently rather than as one rule.)
   */
  const fd = modalFormData({ seats: '30', price: '8500' });
  const oldBuilder = {
    max_seats: toNullableNum(fd.get('max_seats')),
    price_override: toNullableNum(fd.get('price_override')),
    instructor_ids: toStrArr(fd.getAll('instructor_ids')),
  };

  assert.equal('instructor_ids' in oldBuilder, true);
  assert.deepEqual(oldBuilder.instructor_ids, [], 'the old builder empties an untouched roster');

  // Which is precisely what the new one does not do.
  const now = sidecarSetFields(fd);
  assert.equal('instructor_ids' in now, false);
  // …while still writing the two fields the form DOES own.
  assert.equal(now.max_seats, 30);
  assert.equal(now.price_override, 8500);
});

test('CONTROL: a Mongo $set built from the result cannot reach the stored fields', () => {
  /**
   * One step closer to the database than the assertions above: the actual
   * spread `upsertLocal` performs. A stored row is simulated by merging, which
   * is what `$set` does to the fields it names.
   */
  const stored = { max_seats: 30, price_override: null, instructor_ids: ['i-1'] };
  const $set = {
    msdb_schedule_id: 'abc',
    course_id: 'POWER-BI',
    ...sidecarSetFields(modalFormData({ seats: '30', price: '' })),
  };
  const after = { ...stored, ...$set };

  assert.deepEqual(after.instructor_ids, ['i-1'], 'THE PROOF: the roster the form is silent about is intact');
  assert.equal(after.max_seats, 30, 'and the seat count sent back unchanged is still 30');
  assert.equal(after.price_override, null, 'while the fields the form owns were written');
  // The identity fields ride along unconditionally, as `upsertLocal` writes them.
  assert.equal(after.msdb_schedule_id, 'abc');
});

test('CONTROL: SIDECAR_KEYS still names the three fields the writer handles', () => {
  // The list exists so the writer, the audit snapshot and this file agree. If a
  // fourth sidecar field is added to the schema and not to the writer, the
  // mismatch shows up here rather than as a field that silently never saves.
  assert.deepEqual(SIDECAR_KEYS, ['max_seats', 'price_override', 'instructor_ids']);

  const fd = modalFormData({ seats: '10', price: '1' });
  fd.append('instructor_ids', 'x');
  assert.deepEqual(Object.keys(sidecarSetFields(fd)).sort(), [...SIDECAR_KEYS].sort());
});

test('CONTROL: a non-FormData argument returns an empty object, not a crash', () => {
  // `upsertLocal` spreads the result straight into a `$set`. A throw here would
  // fail a save; a null return would spread as nothing and be indistinguishable
  // from success. An empty object is the only safe answer.
  assert.deepEqual(sidecarSetFields(null), {});
  assert.deepEqual(sidecarSetFields(undefined), {});
  assert.deepEqual(sidecarSetFields({}), {});
});
