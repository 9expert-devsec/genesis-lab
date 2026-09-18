// The customer note cap has ONE scope: the public registration form.
//
// Public reads the shared constants on both sides (textarea + zod). The other
// four flows keep the rules they had before the 200 sweep — pinned here BY
// VALUE, with the module's importer list pinned too, so a future sweep cannot
// quietly re-widen the scope (or quietly loosen a flow) without a test going
// red and saying which decision it is reversing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

const CONSTANTS = 'src/lib/registration/noteField.js';
const PUBLIC_FORM = 'src/components/registration/RegisterWizard.jsx';
const PUBLIC_SCHEMA = 'src/lib/schemas/register-public.js';

/** Every file allowed to import the constants module. */
const ALLOWED_IMPORTERS = [PUBLIC_FORM, PUBLIC_SCHEMA];

test('exactly one definition of the cap and the placeholder in src, under the CUSTOMER_ name', () => {
  const defs = walkSources('src').filter((s) => /\bCUSTOMER_NOTE_MAX_LENGTH\s*=/.test(s.code)).map((s) => s.rel);
  assert.deepEqual(defs, [CONSTANTS]);
  const placeholders = walkSources('src').filter((s) => s.raw.includes('ต้องการใบแจ้งหนี้ (ไม่เกิน')).map((s) => s.rel);
  assert.deepEqual(placeholders, [CONSTANTS], 'the placeholder text is spelled in one file');
  const { code } = readSource(CONSTANTS);
  assert.match(code, /export const CUSTOMER_NOTE_MAX_LENGTH = 200;/);
  // The admin INTERNAL note (src/lib/registrations/internalNotes.js) owns
  // NOTE_MAX_LENGTH = 2000 — a different field. The prefix keeps them apart.
  assert.equal(/\bNOTE_MAX_LENGTH\b/.test(code), false, 'the customer constant must not reuse the internal-note name');
});

test('the constants module has exactly the public form and the public schema as importers', () => {
  const importers = walkSources('src')
    .filter((s) => /from ['"]@\/lib\/registration\/noteField['"]/.test(s.withImports))
    .map((s) => s.rel)
    .sort();
  assert.deepEqual(importers, [...ALLOWED_IMPORTERS].sort(),
    'another flow imports the note constants — widening the scope is a decision, make it here');
});

test('PUBLIC form: notes textarea uses the shared placeholder, cap, and a counter read from the live value', () => {
  const { code, withImports } = readSource(PUBLIC_FORM);
  assert.match(withImports, /import \{ CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_PLACEHOLDER, customerNoteCounterLabel \} from ['"]@\/lib\/registration\/noteField['"]/);
  assert.match(code, /placeholder=\{CUSTOMER_NOTE_PLACEHOLDER\}/);
  assert.match(code, /maxLength=\{CUSTOMER_NOTE_MAX_LENGTH\}/);
  assert.match(code, /customerNoteCounterLabel\(watched\.notes\)/, 'the counter reads the form\'s live value, not separate state');
  assert.match(code, /data-testid="notes-counter"/);
  assert.equal(/maxLength=\{\s*\d+\s*\}/.test(code), false, 'the public form still hardcodes a maxLength number');
  assert.equal(/ไม่เกิน 500/.test(code), false, 'no stale 500 text');
});

test('PUBLIC schema: notes is .max(CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_TOO_LONG_MESSAGE) and stays optional', () => {
  const { code, withImports } = readSource(PUBLIC_SCHEMA);
  assert.match(withImports, /import \{ CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_TOO_LONG_MESSAGE \} from '@\/lib\/registration\/noteField'/);
  assert.match(code, /notes:\s*z\.string\(\)\.trim\(\)\.max\(CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_TOO_LONG_MESSAGE\)\.optional\(\)\.or\(z\.literal\(''\)\)/);
});

/**
 * The four OTHER flows, pinned to their pre-sweep values. Each entry says what
 * the textarea and the server rule must read; none may import the module.
 */
const OTHERS = [
  {
    name: 'bundle',
    client: 'src/components/registration/BundleWizard.jsx',
    clientPins: [
      /placeholder="เช่น ต้องการใบเสนอราคาในนามบริษัท หรือวันที่ที่ต้องการให้ออกเอกสาร \(ไม่เกิน 500 ตัวอักษร\)"/,
      /maxLength=\{500\}/,
    ],
    server: 'src/lib/schemas/register-bundle.js',
    serverPins: [/notes:\s*z\.string\(\)\.trim\(\)\.max\(500\)\.optional\(\)\.or\(z\.literal\(''\)\)/],
  },
  {
    name: 'in-house',
    client: 'src/components/registration/InhouseForm.jsx',
    clientPins: [/\{\.\.\.register\('message'\)\}\s*rows=\{4\}\s*placeholder="ระบุข้อมูลเพิ่มเติม"\s*\/>/],
    server: 'src/lib/schemas/register-inhouse.js',
    serverPins: [/message:\s*z\.string\(\)\.trim\(\)\.max\(2000\)\.optional\(\)\.or\(z\.literal\(''\)\)/],
  },
  {
    name: 'masterclass',
    client: 'src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx',
    clientPins: [/maxLength=\{500\}\s*placeholder="หมายเหตุ"/],
    server: 'src/app/api/masterclass/register/route.js',
    serverPins: [/notes:\s*notes\?\.trim\(\) \|\| null/],
    serverForbidden: [/customerNoteFits|note_too_long/],
  },
  {
    name: 'career path',
    client: 'src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx',
    clientPins: [/note: z\.string\(\)\.default\(''\)/, /placeholder="ระบุข้อมูลเพิ่มเติม \(ถ้ามี\)"/],
    server: 'src/lib/actions/career-path-registrations.js',
    serverPins: [/const doc = await CareerPathRegistration\.create\(data\);/],
    serverForbidden: [/customerNoteFits/],
  },
];

for (const o of OTHERS) {
  test(`${o.name}: keeps its own textarea values and its own server rule; imports nothing from the module`, () => {
    const client = readSource(o.client);
    const server = readSource(o.server);
    for (const re of o.clientPins) assert.match(client.code, re, `${o.client} lost its pre-sweep textarea value`);
    for (const re of o.serverPins) assert.match(server.code, re, `${o.server} lost its pre-sweep rule`);
    for (const re of o.serverForbidden ?? []) assert.doesNotMatch(server.code, re, `${o.server} carries the public cap`);
    for (const f of [client, server]) {
      assert.equal(/registration\/noteField/.test(f.withImports), false, `${f.rel} imports the public note constants`);
      assert.equal(/notes-counter|customerNoteCounterLabel/.test(f.code), false, `${f.rel} renders the public counter`);
      assert.equal(/CUSTOMER_NOTE_/.test(f.code), false, `${f.rel} references the public constants`);
    }
  });
}

test('in-house scheduleNote is untouched (it was never in scope)', () => {
  const { code } = readSource('src/lib/schemas/register-inhouse.js');
  assert.match(code, /scheduleNote:\s*z\.string\(\)\.trim\(\)\.max\(500\)\.optional\(\)\.or\(z\.literal\(''\)\)/);
});

test('CONTROL: the probes fire on the sweep shapes this round removed', () => {
  assert.equal(/maxLength=\{\s*\d+\s*\}/.test('<Textarea maxLength={500} />'), true);
  assert.equal(/maxLength=\{\s*\d+\s*\}/.test('<Textarea maxLength={CUSTOMER_NOTE_MAX_LENGTH} />'), false);
  assert.equal(/registration\/noteField/.test("import { x } from '@/lib/registration/noteField';"), true);
  assert.equal(/customerNoteFits|note_too_long/.test("if (!customerNoteFits(notes)) return NextResponse.json({ error: 'note_too_long' })"), true);
});
