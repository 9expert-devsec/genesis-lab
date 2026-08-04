import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentFanOut } from '@/components/payment/consent';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';

// ReviewAndPayStep shows ONE consent checkbox but the charge endpoint runs the
// body through publicRegistrationSchema, whose superRefine rejects a
// card/promptpay charge unless all FOUR consent flags are true. These assert
// the fan-out against the real schema, not against a hand-written shape.

const BODY = {
  courseId: 'DA-PBI',
  courseCode: 'DA-PBI',
  courseName: 'Power BI Essentials',
  classId: 'sch-1',
  classDate: '10-11 ส.ค. 2569',
  scheduleType: 'classroom',
  coordinator: {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    email: 'somchai@example.com',
    phone: '0812345678',
    isAttending: false,
  },
  attendeesCount: 1,
  attendeesListProvided: false,
  attendees: [],
  requestInvoice: false,
  invoice: null,
  notes: '',
};

const withConsent = (consent, extra = {}) => ({
  ...BODY,
  paymentMethod: 'promptpay',
  consent,
  ...extra,
});

const consentIssues = (result) =>
  result.success ? [] : result.error.issues.filter((i) => i.path[0] === 'consent');

// ── The fan-out itself ──────────────────────────────────────────────────────

test('consentFanOut(true) sets all four flags true', () => {
  assert.deepEqual(consentFanOut(true), {
    dataChecked: true,
    noRefund: true,
    changePolicy: true,
    termsAccepted: true,
  });
});

test('CONTROL: consentFanOut(false) sets all four flags false', () => {
  // Without this the deepEqual above would also pass for a function that
  // ignored its argument and always returned true.
  assert.deepEqual(consentFanOut(false), {
    dataChecked: false,
    noRefund: false,
    changePolicy: false,
    termsAccepted: false,
  });
});

// ── Against the real schema ─────────────────────────────────────────────────

test('a promptpay body carrying consentFanOut(true) passes the schema', () => {
  const result = publicRegistrationSchema.safeParse(withConsent(consentFanOut(true)));
  assert.equal(result.success, true, JSON.stringify(result.success ? [] : result.error.issues));
});

test('a credit_card body carrying consentFanOut(true) + a token passes the schema', () => {
  const result = publicRegistrationSchema.safeParse(
    withConsent(consentFanOut(true), { paymentMethod: 'credit_card', omiseToken: 'tokn_test_1' }),
  );
  assert.equal(result.success, true, JSON.stringify(result.success ? [] : result.error.issues));
});

test('CONTROL: the same body with consentFanOut(false) is rejected on consent', () => {
  const result = publicRegistrationSchema.safeParse(withConsent(consentFanOut(false)));
  assert.equal(result.success, false, 'an unticked checkbox must not reach Omise');
  assert.equal(consentIssues(result).length, 1, 'rejected specifically on consent');
});

test('CONTROL: three-of-four is still rejected — the fan-out is load-bearing', () => {
  // If the schema only demanded one flag, fanning out would be pointless and
  // the passing test above would prove nothing about the other three.
  for (const missing of ['dataChecked', 'noRefund', 'changePolicy', 'termsAccepted']) {
    const partial = { ...consentFanOut(true), [missing]: false };
    const result = publicRegistrationSchema.safeParse(withConsent(partial));
    assert.equal(result.success, false, `missing ${missing} must be rejected`);
    assert.equal(consentIssues(result).length, 1, `${missing}: rejected on consent`);
  }
});

test('CONTROL: consent is NOT required when no payment method is set (quote path)', () => {
  // Proves the rejections above come from the payment branch, not from consent
  // being unconditionally mandatory — the quote path still posts consent: null.
  const result = publicRegistrationSchema.safeParse({ ...BODY, consent: null });
  assert.equal(result.success, true, JSON.stringify(result.success ? [] : result.error.issues));
});
