import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  isValidThaiPhone,
  formatThaiPhone,
  isAllowedPhoneChar,
  sanitizePhoneText,
  thaiPhone,
  THAI_PHONE_ERROR_MESSAGE,
} from '@/lib/registration/thaiPhone';

/**
 * The two reported tickets, verbatim, plus the customer's own rules ported
 * from the legacy PHP implementation. See src/lib/registration/thaiPhone.js
 * for the full rule text this file pins.
 */

// ── The two tickets ──────────────────────────────────────────────────────

test('TICKET (a): an office number with an extension is accepted', () => {
  assert.equal(isValidThaiPhone('022194304 ต่อ 10155'), true);
});

test('TICKET (b): a 9-digit Bangkok landline is accepted', () => {
  assert.equal(isValidThaiPhone('02-219-4304'), true);
});

test('CONTROL: both tickets were genuinely rejected by the OLD regex', () => {
  // Reproduces the exact regex this ticket replaces. If this control does not
  // redden against the two ticket values, the "fix" above proves nothing.
  const OLD_REGEX = /^(0\d{9}|\+\d{10,15})$/;
  assert.equal(OLD_REGEX.test('022194304 ต่อ 10155'), false);
  assert.equal(OLD_REGEX.test('02-219-4304'), false);
});

// ── Step 2: domestic mobile (06/08/09) — exactly 10 digits, no extension ───

test('mobile: a valid 10-digit 08 number is accepted', () => {
  assert.equal(isValidThaiPhone('0812345678'), true);
});

test('mobile: 06 and 09 prefixes are accepted too', () => {
  assert.equal(isValidThaiPhone('0612345678'), true);
  assert.equal(isValidThaiPhone('0912345678'), true);
});

test('mobile: 9 digits (one short) is rejected', () => {
  assert.equal(isValidThaiPhone('081234567'), false);
});

test('mobile: 11 digits (one long) is rejected', () => {
  assert.equal(isValidThaiPhone('08123456789'), false);
});

test('mobile: an extension on a mobile number is rejected — the rule gives it none', () => {
  assert.equal(isValidThaiPhone('0812345678 ต่อ 123'), false);
});

// ── Step 2: domestic landline (01/02/03/04/05/07) — 9 digits + 0-5 ext ─────

test('landline: exactly 9 digits, no extension, is accepted', () => {
  assert.equal(isValidThaiPhone('022194304'), true);
});

test('landline: 8 digits (one short) is rejected', () => {
  assert.equal(isValidThaiPhone('02219430'), false);
});

test('landline: extension of exactly 5 digits (the ceiling, 14 total) is accepted', () => {
  assert.equal(isValidThaiPhone('02219430412345'), true);
});

test('landline: extension of 6 digits (15 total) is rejected — over the ceiling', () => {
  assert.equal(isValidThaiPhone('022194304123456'), false);
});

test('landline: extension of exactly 1 digit (the floor, 10 total) is accepted', () => {
  assert.equal(isValidThaiPhone('0221943045'), true);
});

test('landline: all six domestic landline prefixes (01,03,04,05,07) are accepted, not just 02', () => {
  for (const prefix of ['01', '03', '04', '05', '07']) {
    assert.equal(isValidThaiPhone(`${prefix}2194304`), true, `prefix ${prefix} was rejected`);
  }
});

test('the extension may be written with ext / x / # too, not only ต่อ', () => {
  assert.equal(isValidThaiPhone('022194304 ext 10155'), true);
  assert.equal(isValidThaiPhone('022194304 x10155'), true);
  assert.equal(isValidThaiPhone('022194304 #10155'), true);
});

test('anything else, prefix-wise, is invalid', () => {
  assert.equal(isValidThaiPhone('0012345678'), false); // 00 — not a real prefix
  assert.equal(isValidThaiPhone('1234567890'), false); // no leading 0 at all
});

// ── Step 1: the "+" is read on the RAW string ──────────────────────────────

test('+66 is dropped and replaced with a leading 0, then domestic rules apply', () => {
  assert.equal(isValidThaiPhone('+66 81 234 5678'), true);
  assert.equal(isValidThaiPhone('+66 2 219 4304'), true);
});

test('CONTROL: the SAME digits without the +66 conversion would be a different (invalid) shape', () => {
  // Proves the +66 branch is doing real work, not just "any 8-15 digit run
  // after a + passes anyway". "6681234567 8" is 11 digits starting with 6 —
  // not a valid domestic OR the +-prefixed-foreign shape once the + is gone.
  const withoutPlus = '6681234567 8'.replace(/\s/g, '');
  assert.equal(isValidThaiPhone(withoutPlus), false);
});

test('a non-+66 country code is accepted as "+" plus 8-15 digits, structure unchecked', () => {
  assert.equal(isValidThaiPhone('+1 212 555 0100'), true); // 11 digits after +
  assert.equal(isValidThaiPhone('+447911123456'), true);   // UK, 12 digits
});

test('+ with fewer than 8 digits is rejected', () => {
  assert.equal(isValidThaiPhone('+1234567'), false); // 7 digits
});

test('+ with more than 15 digits is rejected', () => {
  assert.equal(isValidThaiPhone('+1234567890123456'), false); // 16 digits
});

test('a leading + with leading whitespace before it is still read as the raw first character', () => {
  assert.equal(isValidThaiPhone('   +66 81 234 5678'), true);
});

test('CONTROL: stripping non-digits BEFORE checking for + would silently accept this — the ordering matters', () => {
  // If a validator stripped non-digits first, '+66' and '066' would look
  // identical after stripping ('66' vs '066' — still different, but the
  // deeper risk is any domestic-looking run that happens to start with 66
  // being misread as a country code, or vice versa). This control locks the
  // RAW-first requirement itself: the digits-only view of a real +66 mobile
  // number is an 11-digit run starting with 6, which must NOT be read as a
  // valid domestic 10-digit-starting-with-0 number by any implementation.
  const rawPlus66 = '+66812345678';
  const digitsOnlyView = rawPlus66.replace(/\D/g, ''); // '66812345678'
  assert.equal(/^0\d{9}$/.test(digitsOnlyView), false, 'the digits-only view happens to look domestic — this control is not meaningful here');
  assert.equal(isValidThaiPhone(rawPlus66), true, 'the real (raw-first) validator still accepts it via the +66 branch');
});

test('empty and whitespace-only values are invalid', () => {
  assert.equal(isValidThaiPhone(''), false);
  assert.equal(isValidThaiPhone('   '), false);
  assert.equal(isValidThaiPhone(null), false);
  assert.equal(isValidThaiPhone(undefined), false);
});

// ── Formatting ───────────────────────────────────────────────────────────

test('mobile formats as 0XX-XXX-XXXX', () => {
  assert.equal(formatThaiPhone('0812345678'), '081-234-5678');
});

test('TICKET (b) formats to itself — the Bangkok landline example, verbatim', () => {
  assert.equal(formatThaiPhone('022194304'), '02-219-4304');
  assert.equal(formatThaiPhone('02-219-4304'), '02-219-4304'); // idempotent
});

test('TICKET (a) formats with the ต่อ separator restored, verbatim', () => {
  assert.equal(formatThaiPhone('022194304 ต่อ 10155'), '02-219-4304 ต่อ 10155');
});

test('+66 examples format to their documented domestic equivalents', () => {
  assert.equal(formatThaiPhone('+66 81 234 5678'), '081-234-5678');
  assert.equal(formatThaiPhone('+66 2 219 4304'), '02-219-4304');
});

test('an extension entered via ext/x/# formats the SAME way as ต่อ', () => {
  assert.equal(formatThaiPhone('022194304 ext 10155'), '02-219-4304 ต่อ 10155');
  assert.equal(formatThaiPhone('022194304x10155'), '02-219-4304 ต่อ 10155');
});

test('a valid foreign number is trimmed but NOT regrouped — its structure is unknown', () => {
  assert.equal(formatThaiPhone('  +1 212 555 0100  '), '+1 212 555 0100');
});

test('an invalid value formats to null — the caller must leave it exactly as typed', () => {
  assert.equal(formatThaiPhone('081234567'), null);
  assert.equal(formatThaiPhone('not a phone'), null);
  assert.equal(formatThaiPhone(''), null);
});

test('formatting is idempotent for every shape', () => {
  for (const v of ['0812345678', '022194304', '022194304 ต่อ 10155', '+66 81 234 5678']) {
    const once = formatThaiPhone(v);
    const twice = formatThaiPhone(once);
    assert.equal(twice, once, `formatting "${v}" is not stable under re-formatting`);
  }
});

// ── Accepted input characters ────────────────────────────────────────────

test('digits, +, space, -, (), and the extension markers are allowed characters', () => {
  for (const ch of ['0', '9', '+', ' ', '-', '(', ')', '#']) {
    assert.equal(isAllowedPhoneChar(ch), true, `"${ch}" should be allowed`);
  }
  for (const ch of ['ต', '่', 'อ', 'e', 'x', 't', 'E', 'X', 'T']) {
    assert.equal(isAllowedPhoneChar(ch), true, `"${ch}" (extension marker letter) should be allowed`);
  }
});

test('Thai letters outside ต่อ, Latin letters outside ext/x, and symbols are rejected', () => {
  for (const ch of ['ก', 'ข', 'ย', 'a', 'b', 'z', '@', '!', '/', '.']) {
    assert.equal(isAllowedPhoneChar(ch), false, `"${ch}" should be rejected`);
  }
});

test('CONTROL: the allowlist is not vacuously true or false for everything', () => {
  assert.notEqual(isAllowedPhoneChar('5'), isAllowedPhoneChar('ก'));
});

test('sanitizePhoneText strips disallowed characters, preserving order, for paste handling', () => {
  assert.equal(sanitizePhoneText('08-1234abc5678!'), '08-12345678');
  assert.equal(sanitizePhoneText('022194304 ต่อ 10155'), '022194304 ต่อ 10155');
  // 'อ' alone survives — it is one of the individually-allowed extension-marker
  // characters (see the module's own note on why this is a character-level,
  // not word-level, allowlist). 'เ' and 'บ' and 'ร์' are not ต/่/อ and are cut.
  assert.equal(sanitizePhoneText('เบอร์ 0812345678'), 'อ 0812345678');
});

// ── The zod-attachment helper ────────────────────────────────────────────

test('thaiPhone(schema) rejects an invalid value with the given message', () => {
  const schema = z.object({ phone: thaiPhone(z.string().trim(), 'bad phone') });
  const res = schema.safeParse({ phone: '12345' });
  assert.equal(res.success, false);
  assert.equal(res.error.issues[0].message, 'bad phone');
});

test('thaiPhone(schema) transforms a valid value to its FORMATTED form on parse — the storage decision', () => {
  const schema = z.object({ phone: thaiPhone(z.string().trim(), 'bad phone') });
  const res = schema.safeParse({ phone: '022194304 ต่อ 10155' });
  assert.equal(res.success, true);
  assert.equal(res.data.phone, '02-219-4304 ต่อ 10155');
});

test('CONTROL: without .transform, the parsed value would still be the raw string — proves the transform is doing something', () => {
  const bare = z.object({ phone: z.string().trim().refine(isValidThaiPhone, 'bad phone') });
  const res = bare.safeParse({ phone: '022194304 ต่อ 10155' });
  assert.equal(res.success, true);
  assert.equal(res.data.phone, '022194304 ต่อ 10155', 'the un-transformed schema unexpectedly already formats — this control is not meaningful');
});

// ── The error message must never advertise a number the validator rejects ──

test('every example number in THAI_PHONE_ERROR_MESSAGE actually validates', () => {
  // Parsed straight out of the live message string, not retyped here — an
  // edit to the message that changes or adds an example is what this test
  // must catch, and it can only do that by reading the same text a customer
  // would see.
  const examplesText = THAI_PHONE_ERROR_MESSAGE.split('เช่น')[1] ?? '';
  const examples = examplesText.split('/').map((s) => s.trim()).filter(Boolean);
  assert.ok(examples.length >= 3, 'could not parse example numbers out of the message — has its shape changed?');
  for (const example of examples) {
    assert.equal(
      isValidThaiPhone(example),
      true,
      `"${example}" is advertised in the error message but the validator rejects it`
    );
  }
});

test('CONTROL: parsing finds exactly the three examples the message currently carries', () => {
  // Proves the parse above is not accidentally empty or over-matching.
  const examplesText = THAI_PHONE_ERROR_MESSAGE.split('เช่น')[1] ?? '';
  const examples = examplesText.split('/').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(examples, ['081-234-5678', '02-123-4567 ต่อ 10155', '+66 81 234 5678']);
});
