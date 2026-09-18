// The customer note cap: PUBLIC on the shared constants; the other flows on
// their own, unchanged rules. Both halves are pinned so a future sweep cannot
// quietly widen the scope in either direction.
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
import RegisterPublic from '@/models/RegisterPublic';

/** A schema may be wrapped in several ZodEffects; unwrap until the object. */
function shapeOf(schema) {
  let s = schema;
  while (s?._def?.schema) s = s._def.schema;
  return s.shape;
}

/** The `max` a zod string rule carries, through optional/union wrappers. */
function maxOf(rule) {
  let node = rule;
  for (let i = 0; i < 10 && node && !node._def?.checks; i++) {
    node = node._def?.innerType ?? node._def?.options?.[0] ?? null;
  }
  return node?._def?.checks?.find((c) => c.kind === 'max')?.value ?? null;
}

test('the constants: 200, the exact placeholder, the message names the number', () => {
  assert.equal(CUSTOMER_NOTE_MAX_LENGTH, 200);
  assert.equal(CUSTOMER_NOTE_PLACEHOLDER, 'เช่น ต้องการใบแจ้งหนี้ (ไม่เกิน 200 ตัวอักษร)');
  assert.match(CUSTOMER_NOTE_TOO_LONG_MESSAGE, /200/);
});

test('the counter reads the live value; customerNoteFits is inclusive at the cap', () => {
  assert.equal(customerNoteCounterLabel(''), '0/200');
  assert.equal(customerNoteCounterLabel(undefined), '0/200');
  assert.equal(customerNoteCounterLabel('abc'), '3/200');
  assert.equal(customerNoteCounterLabel('ก'.repeat(200)), '200/200');
  assert.equal(customerNoteCounterLabel('ก'.repeat(201)), '201/200', 'a truncated paste is visible as over');
  assert.ok(customerNoteFits('') && customerNoteFits(undefined) && customerNoteFits(null) && customerNoteFits('ก'.repeat(200)));
  assert.equal(customerNoteFits('ก'.repeat(201)), false);
});

test('PUBLIC schema: notes accepts 200, refuses 201 with the shared message, stays optional', () => {
  const rule = shapeOf(publicRegistrationSchema).notes;
  assert.ok(rule);
  assert.equal(maxOf(rule), CUSTOMER_NOTE_MAX_LENGTH, 'the public rule reads the shared constant');
  assert.equal(rule.safeParse('ก'.repeat(200)).success, true);
  const over = rule.safeParse('ก'.repeat(201));
  assert.equal(over.success, false);
  assert.equal(over.error.issues[0].message, CUSTOMER_NOTE_TOO_LONG_MESSAGE);
  assert.equal(rule.safeParse('').success, true, 'empty stays legal');
  assert.equal(rule.safeParse(undefined).success, true, 'absent stays legal');
  assert.equal(rule.safeParse(`  ${'ก'.repeat(200)}  `).success, true, 'trim runs before max');
});

/**
 * The OTHER zod flows keep the caps they had before the 200 sweep and do not
 * read the shared constant. Pinned by value, in both directions: a sweep that
 * puts them on 200 goes red here, and so does one that silently widens them.
 */
for (const [name, schema, field, cap] of [
  ['bundle', bundleRegistrationSchema, 'notes', 500],
  ['in-house', inhouseRegistrationSchema, 'message', 2000],
]) {
  test(`${name} schema: ${field} keeps its own cap of ${cap}, not the public 200`, () => {
    const rule = shapeOf(schema)[field];
    assert.ok(rule, `${name} has no ${field} rule`);
    assert.equal(maxOf(rule), cap);
    assert.notEqual(maxOf(rule), CUSTOMER_NOTE_MAX_LENGTH);
    assert.equal(rule.safeParse('ก'.repeat(cap)).success, true);
    assert.equal(rule.safeParse('ก'.repeat(cap + 1)).success, false);
    assert.equal(rule.safeParse('ก'.repeat(201)).success, true, `${name} must still accept a 201-character note`);
    assert.equal(rule.safeParse('').success, true);
    assert.equal(rule.safeParse(undefined).success, true);
  });
}

/**
 * ── THE STORAGE FLOOR STAYS WIDER THAN THE TYPING CAP ────────────────────────
 * Moved here from test/pure/legacyImportDedup (no change of meaning): the
 * RegisterPublic `notes` column takes 2000 because the legacy import carries
 * customer remarks up to 559 characters and 46 stored rows already exceed
 * 200; the WIZARD takes CUSTOMER_NOTE_MAX_LENGTH because that is a product
 * decision about typing, not a fact about storage. Pinned TOGETHER so that
 * "tidying" either side into agreement goes red rather than silently changing
 * the other decision.
 */
test('storage floor > typing cap: RegisterPublic.notes keeps 2000 while the public wizard rule is the shared constant', () => {
  const notes = RegisterPublic.schema.path('notes');
  assert.equal(notes.instance, 'String');
  assert.equal(notes.options.maxlength, 2000, 'the storage floor no longer accepts what the legacy import writes (max 559 chars)');
  assert.equal(maxOf(shapeOf(publicRegistrationSchema).notes), CUSTOMER_NOTE_MAX_LENGTH,
    "the WIZARD's note rule no longer reads the shared constant");
  assert.ok(notes.options.maxlength > CUSTOMER_NOTE_MAX_LENGTH,
    'the storage floor must stay wider than the wizard cap: imported and pre-cap rows are longer than what a customer may now type');
});

test('CONTROL: the shape and max probes reach real rules (a wrong name is caught, not vacuous)', () => {
  assert.equal(shapeOf(publicRegistrationSchema).notesDoesNotExist, undefined);
  assert.ok(shapeOf(inhouseRegistrationSchema).message, 'two ZodEffects deep, still reached');
  assert.equal(maxOf(shapeOf(publicRegistrationSchema).requestInvoice), null, 'a rule with no max reads as null');
});
