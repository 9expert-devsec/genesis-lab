// The customer note: ONE cap, ONE placeholder, enforced by every server-side rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_NOTE_MAX_LENGTH,
  CUSTOMER_NOTE_PLACEHOLDER,
  CUSTOMER_NOTE_TOO_LONG_MESSAGE,
  customerNoteCounterLabel,
  customerNoteFits,
} from '@/lib/registration/noteField';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';
import { bundleRegistrationSchema } from '@/lib/schemas/register-bundle';
import { inhouseRegistrationSchema } from '@/lib/schemas/register-inhouse';

const AT_CAP = 'ก'.repeat(CUSTOMER_NOTE_MAX_LENGTH);
const OVER = 'ก'.repeat(CUSTOMER_NOTE_MAX_LENGTH + 1);

test('the constants: 200, the exact placeholder, the message names the number', () => {
  assert.equal(CUSTOMER_NOTE_MAX_LENGTH, 200);
  assert.equal(CUSTOMER_NOTE_PLACEHOLDER, 'เช่น ต้องการใบแจ้งหนี้ (ไม่เกิน 200 ตัวอักษร)');
  assert.match(CUSTOMER_NOTE_TOO_LONG_MESSAGE, /200/);
});

test('the counter reads the live value; customerNoteFits is inclusive at the cap', () => {
  assert.equal(customerNoteCounterLabel(''), '0/200');
  assert.equal(customerNoteCounterLabel(undefined), '0/200');
  assert.equal(customerNoteCounterLabel('abc'), '3/200');
  assert.equal(customerNoteCounterLabel(AT_CAP), '200/200');
  assert.equal(customerNoteCounterLabel(OVER), '201/200', 'a truncated paste is visible as over');
  assert.ok(customerNoteFits('') && customerNoteFits(undefined) && customerNoteFits(null) && customerNoteFits(AT_CAP));
  assert.equal(customerNoteFits(OVER), false);
});

/**
 * Only the note field is under test, so each schema's other fields are probed
 * through `.shape` — the surrounding superRefines are someone else's tests.
 * A schema may be wrapped in several ZodEffects (in-house has two superRefines);
 * unwrap until the object is reached.
 */
function shapeOf(schema) {
  let s = schema;
  while (s?._def?.schema) s = s._def.schema;
  return s.shape;
}
for (const [name, schema, field] of [
  ['public', publicRegistrationSchema, 'notes'],
  ['bundle', bundleRegistrationSchema, 'notes'],
  ['in-house', inhouseRegistrationSchema, 'message'],
]) {
  test(`${name} schema: ${field} accepts 200, refuses 201 with the shared message, stays optional`, () => {
    const rule = shapeOf(schema)[field];
    assert.ok(rule, `${name} schema has no ${field} rule`);
    assert.equal(rule.safeParse(AT_CAP).success, true, 'exactly 200 is fine');
    const over = rule.safeParse(OVER);
    assert.equal(over.success, false, '201 is refused');
    assert.equal(over.error.issues[0].message, CUSTOMER_NOTE_TOO_LONG_MESSAGE, 'with the shared message, not zod\'s default');
    assert.equal(rule.safeParse('').success, true, 'empty stays legal');
    assert.equal(rule.safeParse(undefined).success, true, 'absent stays legal — the field is optional');
    // trim() runs before max(): 200 chars plus surrounding whitespace still fits.
    assert.equal(rule.safeParse(`  ${AT_CAP}  `).success, true);
  });
}

test('CONTROL: the shape probe reaches a real rule (a wrong field name would be caught, not vacuous)', () => {
  assert.equal(shapeOf(publicRegistrationSchema).notesDoesNotExist, undefined);
  assert.ok(shapeOf(publicRegistrationSchema).notes);
  assert.ok(shapeOf(inhouseRegistrationSchema).message, 'two ZodEffects deep, still reached');
});
