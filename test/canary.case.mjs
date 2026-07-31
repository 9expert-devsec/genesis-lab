import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * THE CANARY — the runner's own control (item 1: "every check needs a control
 * proving it CAN fail" — extended to the runner itself).
 *
 * This test FAILS on purpose. It is included ONLY when the suite is run with
 * CANARY=1. The affordance is manual by design: a human runs `CANARY=1 npm test`
 * before trusting a green run and confirms they see EXACTLY ONE failure (this
 * one) and a non-zero exit. If a `CANARY=1` run comes back GREEN, the runner has
 * stopped reporting failures — a loader that swallows errors, a reporter that
 * drops events, a run() that isolated the file away — and no green run can be
 * trusted until that is fixed.
 *
 * It is NOT wired into any automated pipeline on purpose: automating "assert the
 * canary went red" just moves the unread-badge problem down a level (see the CI
 * row in docs/page-builder-status.md). The value is that a PERSON reads it.
 */
test('CANARY (intentional failure — proves the runner reports failures)', () => {
  assert.equal(1, 2, 'This failure is intentional. Seeing it means the runner works.');
});
