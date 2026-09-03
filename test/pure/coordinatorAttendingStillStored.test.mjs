import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordinatorSchema } from '@/lib/schemas/register-public';
import { readSource } from '../sourceScan.mjs';

/**
 * T2 (Nutto ticket 5 follow-up): removing the "ผู้ประสานงานเข้าอบรม" row from
 * the customer PREVIEW surfaces did not touch the underlying field —
 * coordinator.isAttending is still on the zod schema, still parses, and
 * still round-trips both true and false.
 */

const BASE = {
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  email: 'somchai@example.com',
  phone: '0812345678',
};

test('coordinator.isAttending: true still parses and is preserved in the output', () => {
  const r = coordinatorSchema.safeParse({ ...BASE, isAttending: true });
  assert.equal(r.success, true, r.success ? undefined : JSON.stringify(r.error.issues));
  assert.equal(r.data.isAttending, true);
});

test('coordinator.isAttending: false still parses and is preserved in the output', () => {
  const r = coordinatorSchema.safeParse({ ...BASE, isAttending: false });
  assert.equal(r.success, true);
  assert.equal(r.data.isAttending, false);
});

test('coordinator.isAttending: omitted still parses, defaulting to false', () => {
  const { isAttending, ...withoutField } = BASE;
  const r = coordinatorSchema.safeParse(withoutField);
  assert.equal(r.success, true);
  assert.equal(r.data.isAttending, false, 'the field must still carry its existing default');
});

test('CONTROL: the field really is declared in the schema source, not just accepted by accident (e.g. passthrough mode)', () => {
  const src = readSource('src/lib/schemas/register-public.js');
  assert.match(src.code, /isAttending:\s*z\.boolean\(\)\.default\(false\)/,
    'coordinatorSchema no longer explicitly declares isAttending — a passing safeParse above could otherwise mean zod is just not stripping unknown keys, not that the field is genuinely modelled');
});
