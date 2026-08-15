import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE dev-mark-paid ENDPOINTS REFUSE A CANCELLED DOCUMENT.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * Both endpoints gated on `doc.status !== 'paid'`, which MATCHES A CANCELLED
 * DOCUMENT. So either of them would write `paid` over a cancelled registration
 * — producing exactly the unreachable state the Omise webhook's own cancelled
 * guard exists to prevent: a record the admin transition table has no edge out
 * of, holding a payment nobody can correct from the screen.
 *
 * ── WHY "IT IS DEV-ONLY" IS NOT THE DECIDING FACT ───────────────────────────
 * The public route's OWN COMMENT says so:
 *
 *   "Allow this endpoint ONLY when PAYMENT_TEST_MODE=true is explicitly set,
 *    regardless of NODE_ENV. This lets us test on production with test keys
 *    without exposing it permanently."
 *
 * Reachable-from-production is the endpoint's documented design, not a
 * hypothetical, so the guard is not a nicety for a local-only tool. A test that
 * asserted "this is dev-only" would be pinning something the file contradicts.
 *
 * ── MASTERCLASS HAS THE IDENTICAL SHAPE, AND IS GUARDED ─────────────────────
 * `masterclass_registrations` has `cancelled` in its own status enum and the
 * masterclass endpoint has the same `!== 'paid'` gate. It is guarded here.
 *
 * That is NOT a reversal of the webhook's deliberate `&& !isMasterclass`
 * exclusion, which stands: masterclass is a different collection with its own
 * flow, and how it should handle a settled charge landing on a cancelled seat
 * is its owners' ruling. This is narrower — it refuses to CREATE the
 * unreachable state by hand from a test endpoint, which needs no ruling.
 *
 * ── A SOURCE SCAN, AND WHAT THAT BUYS ───────────────────────────────────────
 * Both routes reach mongoose and next/server at import. These are SHAPE checks
 * on the guard and its ORDER; that a real cancelled document is refused is
 * click-tested.
 */

const PUBLIC_ROUTE = readSource('src/app/api/registration/public/dev-mark-paid/route.js');
const MC_ROUTE     = readSource('src/app/api/masterclass/dev-mark-paid/route.js');

const ROUTES = [
  { name: 'public',      f: PUBLIC_ROUTE },
  { name: 'masterclass', f: MC_ROUTE },
];

// ── 1. The guard exists on both ─────────────────────────────────────────────

test('dev-mark-paid refuses a cancelled document (public)', () => {
  assert.match(PUBLIC_ROUTE.code, /if \(doc\.status === 'cancelled'\)/,
    'the public dev endpoint has no cancelled guard');
});

test('dev-mark-paid refuses a cancelled document (masterclass)', () => {
  assert.match(MC_ROUTE.code, /if \(doc\.status === 'cancelled'\)/,
    'the masterclass dev endpoint has no cancelled guard');
});

test('each guard returns a 409 rather than silently doing nothing', () => {
  // A silent no-op would leave the caller believing the mark succeeded. Nothing
  // is OWED here — no money moved — so a plain refusal is right, where the
  // webhook's equivalent logs at error level because a refund probably is.
  for (const { name, f } of ROUTES) {
    const at = f.code.indexOf("if (doc.status === 'cancelled')");
    assert.notEqual(at, -1, `${name}: the guard is gone`);
    const body = f.code.slice(at, at + 400);
    assert.match(body, /status:\s*409/, `${name}: the guard does not return 409`);
    assert.match(body, /error:\s*'cancelled'/, `${name}: the refusal does not name the reason`);
  }
});

// ── 2. ORDER IS THE WHOLE GUARD ─────────────────────────────────────────────

/**
 * A cancelled check that runs after the `paid` write is not a guard, it is a
 * comment. Both markers are asserted present FIRST: `indexOf` returns -1 for a
 * missing marker and -1 < anything, so a guard deleted outright would satisfy
 * the ordering comparison and this test would pass on the very defect it is
 * named after. That exact trap was measured in round 1's webhook guard.
 */
test('the cancelled check runs BEFORE the paid write, on both routes', () => {
  for (const { name, f } of ROUTES) {
    const guard = f.code.indexOf("doc.status === 'cancelled'");
    const write = f.code.indexOf("doc.status = 'paid'");
    assert.notEqual(guard, -1, `${name}: the cancelled check is gone — nothing to order`);
    assert.notEqual(write, -1, `${name}: the paid write is gone — this guard now proves nothing`);
    assert.ok(guard < write, `${name}: the cancelled check is positioned after the status write`);
  }
});

test('the guarded path writes nothing and sends no receipt', () => {
  for (const { name, f } of ROUTES) {
    const from = f.code.indexOf("if (doc.status === 'cancelled')");
    const to   = f.code.indexOf('}', f.code.indexOf('NextResponse.json(', from));
    const body = f.code.slice(from, to);
    assert.ok(!body.includes("doc.status = 'paid'"), `${name}: the guarded path writes the status`);
    assert.ok(!body.includes('paidAt'),              `${name}: the guarded path writes paidAt`);
    assert.ok(!body.includes('doc.save()'),          `${name}: the guarded path saves the document`);
    assert.ok(!/send\w*Receipt/.test(body),          `${name}: the guarded path sends a receipt`);
  }
});

// ── 3. The rest of the endpoint is unchanged ────────────────────────────────

test('the PAYMENT_TEST_MODE gate is still the outermost check', () => {
  // The cancelled guard is an ADDITION, not a replacement. If it were inserted
  // above the env check, an unauthenticated caller could probe whether a given
  // id is cancelled — a 409 and a 403 are distinguishable.
  for (const { name, f } of ROUTES) {
    const env    = f.code.indexOf("process.env.PAYMENT_TEST_MODE !== 'true'");
    const guard  = f.code.indexOf("doc.status === 'cancelled'");
    assert.notEqual(env, -1, `${name}: the PAYMENT_TEST_MODE gate is gone`);
    assert.ok(env < guard, `${name}: the cancelled guard is positioned above the env gate`);
  }
});

test('the not-found check still runs before the cancelled check', () => {
  // `doc.status` on a null doc throws. Order matters here for a plainer reason
  // than the one above.
  for (const { name, f } of ROUTES) {
    const notFound = f.code.indexOf("error: 'not_found'");
    const guard    = f.code.indexOf("doc.status === 'cancelled'");
    assert.notEqual(notFound, -1, `${name}: the not-found check is gone`);
    assert.ok(notFound < guard, `${name}: the cancelled guard reads doc.status before the null check`);
  }
});

test('the still-unpaid path is untouched — this endpoint still works', () => {
  // Without this, deleting the whole body would satisfy every absence assertion
  // above. The endpoint's actual job must survive the guard.
  for (const { name, f } of ROUTES) {
    assert.match(f.code, /if \(doc\.status !== 'paid'\)/, `${name}: the unpaid branch is gone`);
    assert.match(f.code, /doc\.status = 'paid'/, `${name}: the endpoint no longer marks anything paid`);
  }
});

// ── 4. CONTROL ──────────────────────────────────────────────────────────────

test('CONTROL: the two routes are genuinely different files', () => {
  // Every assertion above loops over both. If `readSource` had returned the
  // same file twice — a copy-paste in the paths at the top — the masterclass
  // half would be proving nothing.
  assert.notEqual(PUBLIC_ROUTE.rel, MC_ROUTE.rel);
  assert.notEqual(PUBLIC_ROUTE.code, MC_ROUTE.code);
  assert.ok(PUBLIC_ROUTE.code.includes('RegisterPublic'), 'the public route lost its model');
  assert.ok(MC_ROUTE.code.includes('MasterclassRegistration'), 'the masterclass route lost its model');
});

test('CONTROL: the `!== paid` gate really does admit a cancelled document', () => {
  // The defect, stated as an executable fact rather than as prose. This is why
  // the guard is needed at all: the pre-existing condition is TRUE for a
  // cancelled document, so the write ran.
  const cancelled = { status: 'cancelled' };
  assert.ok(cancelled.status !== 'paid', 'the original gate would have admitted a cancelled document');
});
