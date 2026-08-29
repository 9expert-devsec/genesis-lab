import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendeeBlocks } from '@/lib/email/models/labels';
import { NOT_SPECIFIED_LABEL } from '@/lib/orNotSpecified';

/**
 * T3 (Nutto ticket 5): buildAttendeeBlocks — the ONE model-builder function
 * shared by publicRegistrationModel and publicPaidReceiptModel (R4) — is
 * where a blank attendee email/phone becomes NOT_SPECIFIED_LABEL before the
 * Postmark payload is built. Still a plain STRING under the existing key,
 * never a shape change.
 */

const BASE_ARGS = {
  attendeesListProvided: true,
  attendeesCount: 2,
  coordinatorIsAttending: false,
};

test('a blank attendee email/phone becomes NOT_SPECIFIED_LABEL, as a plain string', () => {
  const result = buildAttendeeBlocks({
    ...BASE_ARGS,
    attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: '', phone: '' }],
  });
  const item = result.attendee_list.items[0];
  assert.equal(item.email, NOT_SPECIFIED_LABEL);
  assert.equal(item.phone, NOT_SPECIFIED_LABEL);
  // Guards a future object-or-false shape change (mirrors this file's own
  // documented "object or false, never null" convention for BLOCKS — the
  // same discipline applies to an individual FIELD here).
  assert.equal(typeof item.email, 'string');
  assert.equal(typeof item.phone, 'string');
});

test('null/undefined attendee email/phone (never even set) also become the label', () => {
  const result = buildAttendeeBlocks({
    ...BASE_ARGS,
    attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี' }], // no email/phone keys at all
  });
  const item = result.attendee_list.items[0];
  assert.equal(item.email, NOT_SPECIFIED_LABEL);
  assert.equal(item.phone, NOT_SPECIFIED_LABEL);
});

test('a real email/phone passes through unchanged', () => {
  const result = buildAttendeeBlocks({
    ...BASE_ARGS,
    attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '081-234-5678' }],
  });
  const item = result.attendee_list.items[0];
  assert.equal(item.email, 'somchai@example.com');
  assert.equal(item.phone, '081-234-5678');
  assert.equal(typeof item.email, 'string');
  assert.equal(typeof item.phone, 'string');
});

test('a mixed roster substitutes only the blank fields, per attendee', () => {
  const result = buildAttendeeBlocks({
    ...BASE_ARGS,
    attendeesCount: 2,
    attendees: [
      { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '' },
      { firstName: 'สมหญิง', lastName: 'ดีใจ', email: '', phone: '0898765432' },
    ],
  });
  const [first, second] = result.attendee_list.items;
  assert.equal(first.email, 'somchai@example.com');
  assert.equal(first.phone, NOT_SPECIFIED_LABEL);
  assert.equal(second.email, NOT_SPECIFIED_LABEL);
  assert.equal(second.phone, '0898765432');
});

test('CONTROL: removing the substitution reddens the blank-value tests above', () => {
  // Reproduces the pre-substitution shape (a?.email ?? '', a?.phone ?? '')
  // as an embedded fixture, permanently pinning the reasoning — the same
  // pattern this repo already uses for its other embedded redden fixtures.
  function buildAttendeeBlocksWithoutSubstitution({ attendeesListProvided, attendees = [], attendeesCount, coordinatorIsAttending = false }) {
    const list = Array.isArray(attendees) ? attendees : [];
    const showList = Boolean(attendeesListProvided) && list.length > 0;
    return {
      attendee_list: showList
        ? {
            count: attendeesCount ?? list.length,
            items: list.map((a, i) => ({
              index: i + 1,
              name: `${a?.firstName ?? ''} ${a?.lastName ?? ''}`.trim(),
              email: a?.email ?? '',
              phone: a?.phone ?? '',
              is_coordinator: i === 0 && Boolean(coordinatorIsAttending),
            })),
          }
        : false,
      attendee_later: attendeesListProvided === false ? { show: true } : false,
    };
  }
  const broken = buildAttendeeBlocksWithoutSubstitution({
    ...BASE_ARGS,
    attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: '', phone: '' }],
  });
  assert.notEqual(broken.attendee_list.items[0].email, NOT_SPECIFIED_LABEL,
    'the broken fixture does not even reproduce the pre-fix behaviour — this control is not meaningful');
  // ...and the REAL function, with the substitution intact, disagrees:
  const real = buildAttendeeBlocks({
    ...BASE_ARGS,
    attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: '', phone: '' }],
  });
  assert.equal(real.attendee_list.items[0].email, NOT_SPECIFIED_LABEL);
});
