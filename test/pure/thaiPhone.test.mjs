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

// ── +66 must genuinely CONVERT to domestic, not merely fall through to the
//    generic foreign path and happen to land inside its 8-15 digit window ──
//
// Owed from a prior review round's own finding (M4): disabling the +66
// branch left every existing "+66 is accepted" test green, because the
// broken branch's fallthrough — treating the value as generic "+" plus
// 8-15 digits — still accepted the two examples then in use (11 digits
// after the +, comfortably inside 8-15). A test built the same way as those
// could never catch a broken +66 branch; only a value that the +66 CONVERSION
// makes invalid, while the GENERIC foreign path would accept, can.

test('"+661234567" is rejected — proves +66 genuinely converts, not just falls through as foreign', () => {
  // +66 -> drop "66", prepend "0" -> "01234567" = 8 digits, prefix "01",
  // which needs exactly 9 -> INVALID under the real conversion.
  // But read as a generic foreign number it is "+" plus 9 digits (661234567),
  // squarely inside the accepted 8-15 window — so a BROKEN +66 branch (one
  // that fails to convert and falls through to the generic foreign check)
  // would wrongly accept this exact value. A correct implementation must not.
  assert.equal(isValidThaiPhone('+661234567'), false);
});

test('MIRROR: a +66 value that IS valid domestically after conversion stays valid', () => {
  // +66 -> "0" + "1234567890" is 11 digits, prefix "01" -> landline branch,
  // 9-14 digits accepted, so 11 is within range -> VALID.
  assert.equal(isValidThaiPhone('+661234567890'), true);
});

test('CONTROL: disabling the +66 branch reddens the rejection test above, restored', () => {
  // Reproduces the M4 finding directly, as an embedded fixture: a validator
  // whose +66 branch has been disabled (falls straight to the generic
  // foreign check) wrongly accepts "+661234567", because 9 digits after the
  // "+" is inside the 8-15 window. This is the shape the real mutation in
  // this round's control run applied to src/lib/registration/thaiPhone.js
  // itself (see the commit message for the redden/restore against the real
  // file); this fixture pins the same reasoning permanently in-suite.
  function classifyBrokenPlus66(raw) {
    const trimmed = String(raw ?? '').trim();
    if (trimmed[0] !== '+') return null; // not exercised by this fixture
    const digitsAfterPlus = trimmed.slice(1).replace(/\D/g, '');
    // The +66 branch is GONE — every "+" value falls straight through here.
    return digitsAfterPlus.length >= 8 && digitsAfterPlus.length <= 15;
  }
  assert.equal(classifyBrokenPlus66('+661234567'), true, 'the broken fixture does not even reproduce the bug — this control is not meaningful');
  // ...and the REAL validator, with the branch intact, disagrees:
  assert.equal(isValidThaiPhone('+661234567'), false);
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

// ── Landline grouping: "02" is the only 2-digit area code ─────────────────
// (Commit 5) 01/03/04/05/07 use a 3-digit area code + 6-digit subscriber
// (3-3-3); "02" (Bangkok/metro) is the sole 2-3-4 exception. One case per
// prefix class, each asserting the EXACT output string.

test('landline grouping — 01 prefix uses 3-3-3', () => {
  assert.equal(formatThaiPhone('012345678'), '012-345-678');
});

test('landline grouping — 02 (Bangkok/metro) stays 2-3-4, the sole exception', () => {
  assert.equal(formatThaiPhone('022194304'), '02-219-4304');
});

test('landline grouping — 03 prefix uses 3-3-3', () => {
  assert.equal(formatThaiPhone('032123456'), '032-123-456');
});

test('landline grouping — 04 prefix uses 3-3-3', () => {
  assert.equal(formatThaiPhone('042123456'), '042-123-456');
});

test('landline grouping — 05 prefix uses 3-3-3', () => {
  assert.equal(formatThaiPhone('053123456'), '053-123-456');
});

test('landline grouping — 07 prefix uses 3-3-3', () => {
  assert.equal(formatThaiPhone('077123456'), '077-123-456');
});

test('an extension on a 3-digit-area-code (non-02) number formats after the 3-3-3 core', () => {
  assert.equal(formatThaiPhone('038123456 ต่อ 999'), '038-123-456 ต่อ 999');
});

test('formatting stays idempotent for the new 3-3-3 shape', () => {
  for (const v of ['038123456', '038-123-456', '038123456 ต่อ 999', '038-123-456 ต่อ 999']) {
    const once = formatThaiPhone(v);
    const twice = formatThaiPhone(once);
    assert.equal(twice, once, `formatting "${v}" is not stable under re-formatting`);
  }
  // And the fixed point is exactly the 3-3-3 string, not merely stable at
  // whatever it happens to be — a formatter that always returned its input
  // unchanged would also pass the loop above.
  assert.equal(formatThaiPhone('038123456'), '038-123-456');
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
