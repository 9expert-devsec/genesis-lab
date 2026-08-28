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

/** A form carrying only the fields the modal still sends. */
function modalFormData({ price = '' } = {}) {
  const fd = new FormData();
  fd.set('course_id', 'POWER-BI');
  fd.set('dates_json', JSON.stringify(['2026-09-16']));
  fd.set('status', 'open');
  fd.set('type', 'classroom');
  fd.set('signup_url', '');
  // The one sidecar input the modal still has. Always sent, blank included.
  fd.set('price_override', price);
  return fd;
}

// ── the removed inputs ──────────────────────────────────────────────────────

test('a form with NO max_seats key produces NO max_seats in the $set', () => {
  const out = sidecarSetFields(modalFormData());
  assert.equal('max_seats' in out, false, 'an absent input would have nulled the stored seat count');
  assert.equal(Object.hasOwn(out, 'max_seats'), false);
});

test('a form with NO instructor_ids key produces NO instructor_ids in the $set', () => {
  const out = sidecarSetFields(modalFormData());
  assert.equal('instructor_ids' in out, false, 'an absent input would have emptied the stored roster');
  assert.equal(Object.hasOwn(out, 'instructor_ids'), false);
});

test('the modal\'s real payload touches ONLY price_override', () => {
  /**
   * The whole shape in one assertion, so a future edit that re-adds a key —
   * even one set to '' — reddens here rather than in production.
   */
  assert.deepEqual(sidecarSetFields(modalFormData({ price: '8500' })), {
    price_override: 8500,
  });
});

// ── the input that stays ────────────────────────────────────────────────────

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

// ── presence, when a form does carry the other two ──────────────────────────

test('a form that DOES carry the other two still writes them', () => {
  /**
   * The positive half. Without it, a `sidecarSetFields` that returned `{}` for
   * everything would satisfy every absence assertion above — and would quietly
   * make the price input dead too.
   */
  const fd = modalFormData({ price: '8500' });
  fd.set('max_seats', '30');
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

test('CONTROL: the OLD unconditional builder DOES destroy the stored values', () => {
  /**
   * The exact code that was in `upsertLocal`, run against the modal's real
   * payload. Naming the defect as executable code is what stops this file from
   * reading as a tautology — and it is the shape a future "tidy-up" would most
   * plausibly reintroduce.
   */
  const fd = modalFormData({ price: '8500' });
  const oldBuilder = {
    max_seats: toNullableNum(fd.get('max_seats')),
    price_override: toNullableNum(fd.get('price_override')),
    instructor_ids: toStrArr(fd.getAll('instructor_ids')),
  };

  // Every key present, and two of them carrying an erase.
  assert.equal('max_seats' in oldBuilder, true);
  assert.equal(oldBuilder.max_seats, null, 'the old builder nulls an untouched seat count');
  assert.deepEqual(oldBuilder.instructor_ids, [], 'and empties an untouched roster');

  // Which is precisely what the new one does not do.
  const now = sidecarSetFields(fd);
  assert.equal('max_seats' in now, false);
  assert.equal('instructor_ids' in now, false);
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
    ...sidecarSetFields(modalFormData({ price: '' })),
  };
  const after = { ...stored, ...$set };

  assert.equal(after.max_seats, 30, 'THE PROOF: a no-op save left the seat count intact');
  assert.deepEqual(after.instructor_ids, ['i-1'], 'and left the roster intact');
  assert.equal(after.price_override, null, 'while the field the form owns was still written');
});

test('CONTROL: SIDECAR_KEYS still names the three fields the writer handles', () => {
  // The list exists so the writer, the audit snapshot and this file agree. If a
  // fourth sidecar field is added to the schema and not to the writer, the
  // mismatch shows up here rather than as a field that silently never saves.
  assert.deepEqual(SIDECAR_KEYS, ['max_seats', 'price_override', 'instructor_ids']);

  const fd = modalFormData({ price: '1' });
  fd.set('max_seats', '10');
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
