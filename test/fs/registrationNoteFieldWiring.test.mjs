// Every registration flow's note field reads the ONE constant module — no
// flow spells the number or the placeholder itself, on either side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

const CONSTANTS = 'src/lib/registration/noteField.js';

/** Client textareas: [file, form field name, the live-value expression the counter must read]. */
const CLIENTS = [
  ['src/components/registration/RegisterWizard.jsx', 'notes', /customerNoteCounterLabel\(watched\.notes\)/],
  ['src/components/registration/BundleWizard.jsx', 'notes', /customerNoteCounterLabel\(watch\('notes'\)\)/],
  ['src/components/registration/InhouseForm.jsx', 'message', /customerNoteCounterLabel\(watched\.message\)/],
  ['src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx', 'notes', /customerNoteCounterLabel\(formState\.notes\)/],
  ['src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx', 'note', /customerNoteCounterLabel\(watch\('note'\)\)/],
];

/** Server-side zod rules. */
const SCHEMAS = [
  ['src/lib/schemas/register-public.js', 'notes'],
  ['src/lib/schemas/register-bundle.js', 'notes'],
  ['src/lib/schemas/register-inhouse.js', 'message'],
];

/** The two servers with no zod: an explicit check through the same module. */
const EXPLICIT = [
  'src/app/api/masterclass/register/route.js',
  'src/lib/actions/career-path-registrations.js',
];

test('exactly one definition of the cap and the placeholder in src', () => {
  const defs = walkSources('src').filter((s) => /\bCUSTOMER_NOTE_MAX_LENGTH\s*=/.test(s.code)).map((s) => s.rel);
  assert.deepEqual(defs, [CONSTANTS]);
  // The admin INTERNAL note (src/lib/registrations/internalNotes.js) has its own
  // NOTE_MAX_LENGTH = 2000 — a different field with a different cap. The
  // CUSTOMER_ prefix is what keeps the two from being confused; assert it stays.
  assert.equal(/\bNOTE_MAX_LENGTH\b/.test(readSource(CONSTANTS).code), false, 'the customer constant must not reuse the internal-note name');
  const placeholders = walkSources('src').filter((s) => s.raw.includes('ต้องการใบแจ้งหนี้ (ไม่เกิน')).map((s) => s.rel);
  assert.deepEqual(placeholders, [CONSTANTS], 'the placeholder text is spelled in one file');
  const { code } = readSource(CONSTANTS);
  assert.match(code, /export const CUSTOMER_NOTE_MAX_LENGTH = 200;/);
});

for (const [rel, field, counter] of CLIENTS) {
  test(`${rel}: ${field} textarea uses the shared placeholder, cap and a counter read from the live value`, () => {
    const { code, withImports } = readSource(rel);
    assert.match(withImports, /from ['"]@\/lib\/registration\/noteField['"]/, 'imports the constants module');
    assert.match(code, /placeholder=\{CUSTOMER_NOTE_PLACEHOLDER\}/);
    assert.match(code, /maxLength=\{CUSTOMER_NOTE_MAX_LENGTH\}/);
    assert.match(code, counter, 'the counter reads the form\'s live value, not separate state');
    assert.equal(/maxLength=\{\s*\d+\s*\}/.test(code), false, `${rel} still hardcodes a maxLength number`);
    assert.equal(/placeholder="[^"]*ตัวอักษร\)"/.test(code), false, `${rel} spells a limit placeholder itself`);
    assert.equal(/ไม่เกิน 500|ไม่เกิน 2000/.test(code), false, 'no stale limit text');
  });
}

for (const [rel, field] of SCHEMAS) {
  test(`${rel}: ${field} rule is .max(CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_TOO_LONG_MESSAGE) and stays optional`, () => {
    const { code, withImports } = readSource(rel);
    assert.match(withImports, /import \{ CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_TOO_LONG_MESSAGE \} from '@\/lib\/registration\/noteField'/);
    const re = new RegExp(`${field}:\\s*z\\.string\\(\\)\\.trim\\(\\)\\.max\\(CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_TOO_LONG_MESSAGE\\)\\.optional\\(\\)\\.or\\(z\\.literal\\(''\\)\\)`);
    assert.match(code, re);
  });
}

for (const rel of EXPLICIT) {
  test(`${rel}: refuses an over-cap note through customerNoteFits with the shared message`, () => {
    const { code, withImports } = readSource(rel);
    assert.match(withImports, /import \{ customerNoteFits, CUSTOMER_NOTE_TOO_LONG_MESSAGE \} from '@\/lib\/registration\/noteField'/);
    assert.match(code, /if \(!customerNoteFits\((notes|data\?\.note)\)\)/);
    assert.match(code, /CUSTOMER_NOTE_TOO_LONG_MESSAGE/);
  });
}

test('career-path client zod carries the same cap (its server has no zod of its own)', () => {
  const { code } = readSource(CLIENTS[4][0]);
  assert.match(code, /note: z\.string\(\)\.max\(CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_TOO_LONG_MESSAGE\)\.default\(''\)/);
});

test('CONTROL: the hardcoded-maxLength probe fires on the shape this round removed', () => {
  assert.equal(/maxLength=\{\s*\d+\s*\}/.test('<Textarea maxLength={500} />'), true);
  assert.equal(/maxLength=\{\s*\d+\s*\}/.test('<Textarea maxLength={CUSTOMER_NOTE_MAX_LENGTH} />'), false);
});
