import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { attendeeSchema, coordinatorSchema } from '@/lib/schemas/register-public';

/**
 * T5 (Nutto ticket 5): attendee email/phone are optional; firstName/lastName
 * stay required; a non-blank value is still validated exactly as strictly
 * as before. Coordinator is the CONTROL that proves nothing weakened there.
 */

const VALID_BASE = { firstName: 'สมชาย', lastName: 'ใจดี' };

test('an attendee with blank email AND blank phone parses', () => {
  const r = attendeeSchema.safeParse({ ...VALID_BASE, email: '', phone: '' });
  assert.equal(r.success, true, r.success ? undefined : JSON.stringify(r.error.issues));
  assert.equal(r.data.email, '');
  assert.equal(r.data.phone, '');
});

test('an attendee with blank email only, or blank phone only, each parses', () => {
  const emailOnly = attendeeSchema.safeParse({ ...VALID_BASE, email: '', phone: '0812345678' });
  assert.equal(emailOnly.success, true);
  assert.equal(emailOnly.data.phone, '081-234-5678', 'a present phone must still be formatted');

  const phoneOnly = attendeeSchema.safeParse({ ...VALID_BASE, email: 'a@b.com', phone: '' });
  assert.equal(phoneOnly.success, true);
  assert.equal(phoneOnly.data.email, 'a@b.com');
});

test('a blank first or last name still FAILS', () => {
  assert.equal(attendeeSchema.safeParse({ ...VALID_BASE, firstName: '', email: '', phone: '' }).success, false);
  assert.equal(attendeeSchema.safeParse({ ...VALID_BASE, lastName: '', email: '', phone: '' }).success, false);
});

test('a malformed NON-BLANK email still FAILS, with the same message as before', () => {
  const r = attendeeSchema.safeParse({ ...VALID_BASE, email: 'not-an-email', phone: '' });
  assert.equal(r.success, false);
  assert.equal(r.error.issues[0].message, 'รูปแบบอีเมลไม่ถูกต้อง');
});

test('a NON-BLANK phone violating the landed format rules still FAILS, with the specific Thai message', () => {
  // 8 digits under a landline prefix, one short of the required 9 — a real,
  // deliberate violation of the landed phone rules, not merely "not a phone".
  const r = attendeeSchema.safeParse({ ...VALID_BASE, email: '', phone: '0221943' });
  assert.equal(r.success, false);
  assert.match(r.error.issues[0].message, /รูปแบบเบอร์โทรไม่ถูกต้อง/,
    'must be the specific validator message, not a generic "Invalid input" — see register-public.js\'s own comment on the union-wrapping trap'
  );
});

test('a present, valid phone is still FORMATTED — the transform still runs', () => {
  const r = attendeeSchema.safeParse({ ...VALID_BASE, email: '', phone: '0812345678' });
  assert.equal(r.success, true);
  assert.equal(r.data.phone, '081-234-5678');
});

test('CONTROL: coordinatorSchema is untouched — blank email/phone still FAIL there', () => {
  const coordBase = { firstName: 'สมชาย', lastName: 'ใจดี', isAttending: false };
  assert.equal(coordinatorSchema.safeParse({ ...coordBase, email: '', phone: '0812345678' }).success, false,
    'coordinator email became optional — it must not have');
  assert.equal(coordinatorSchema.safeParse({ ...coordBase, email: 'a@b.com', phone: '' }).success, false,
    'coordinator phone became optional — it must not have');
});

test('CONTROL: making the fields fully permissive reddens the malformed/invalid-format tests above', () => {
  // Reproduces "email/phone accept ANYTHING, not just blank-or-valid" as an
  // embedded fixture — the over-correction this ticket does NOT ask for.
  const permissive = z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string(), // no .email() check at all
    phone: z.string(), // no format check at all
  });
  const badEmail = permissive.safeParse({ ...VALID_BASE, email: 'not-an-email', phone: '' });
  const badPhone = permissive.safeParse({ ...VALID_BASE, email: '', phone: '0221943' });
  assert.equal(badEmail.success, true, 'the permissive fixture does not even accept the bad email — this control is not meaningful');
  assert.equal(badPhone.success, true, 'the permissive fixture does not even accept the bad phone — this control is not meaningful');
  // ...and the REAL schema, with its actual checks intact, disagrees:
  assert.equal(attendeeSchema.safeParse({ ...VALID_BASE, email: 'not-an-email', phone: '' }).success, false);
  assert.equal(attendeeSchema.safeParse({ ...VALID_BASE, email: '', phone: '0221943' }).success, false);
});
