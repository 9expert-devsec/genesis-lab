import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * A SETTLED CHARGE MUST NOT RESURRECT A CANCELLED REGISTRATION.
 *
 * ── THE CASE THIS EXISTS FOR ────────────────────────────────────────────────
 * It did not exist before cancellation became terminal. A customer opens a
 * PromptPay QR; an admin cancels the registration while it is still unpaid; the
 * customer pays anyway. The bank settles, the webhook fires, and the old code
 * wrote `status = 'paid'` over the cancelled document — producing a record in a
 * state the admin transition table has no edge out of, and a receipt for a seat
 * that no longer exists.
 *
 * ── WHAT IS DELIBERATELY *NOT* GUARDED ──────────────────────────────────────
 * The charge route and this webhook are SYSTEM actors: they are the only two
 * writers of `paid`, and they are deliberately NOT routed through the admin
 * transition table, which contains no edge into `paid` at all. Gating them on
 * it would break payment collection. The last test in this file pins that the
 * two sites say so, because the next reader's instinct will be to "finish the
 * job" by importing the table here.
 *
 * ── A SOURCE SCAN, AND WHAT THAT BUYS ───────────────────────────────────────
 * The route reaches mongoose and the live Omise SDK, so there is nothing this
 * suite can invoke. These are SHAPE checks on the branch and its ordering; that
 * a real cancelled document is skipped is click-tested against a test charge.
 */

const HOOK   = readSource('src/app/api/webhooks/omise/route.js');
const CHARGE = readSource('src/app/api/registration/public/charge/route.js');

/** The `charge.status === 'successful'` branch, up to the `failed` branch. */
function successfulBranch(code) {
  const start = code.indexOf("if (charge.status === 'successful')");
  assert.notEqual(start, -1, 'the successful branch is gone');
  const end = code.indexOf("if (charge.status === 'failed')", start);
  assert.notEqual(end, -1, 'the failed branch is gone — the slice would run to EOF');
  return code.slice(start, end);
}

const SUCCESS = successfulBranch(HOOK.code);

test('the cancelled check is INSIDE the successful branch', () => {
  assert.match(SUCCESS, /doc\.status === 'cancelled'/);
});

/**
 * ORDER IS THE WHOLE GUARD. A cancelled check that runs after `doc.status =
 * 'paid'` is not a guard, it is a comment. The document has already been
 * mutated in memory by then, and on this path `doc.save()` follows immediately.
 */
test('the cancelled check runs BEFORE the paid write', () => {
  const guard = SUCCESS.indexOf("doc.status === 'cancelled'");
  const write = SUCCESS.indexOf("doc.status = 'paid'");
  // BOTH markers asserted present first. `indexOf` returns -1 for a missing
  // marker, and -1 < anything — so a guard that was deleted outright would
  // satisfy the ordering comparison and this test would pass on the very defect
  // it is named after. Measured: it did, until these two lines were added.
  assert.notEqual(guard, -1, 'the cancelled check is gone — nothing to order');
  assert.notEqual(write, -1, 'the paid write is gone — this guard now proves nothing');
  assert.ok(guard < write, 'the cancelled check is positioned after the status write');
});

test('the guarded path writes neither the status nor the paid fields', () => {
  // The slice from the guard to its own `return` must contain no writes.
  const from = SUCCESS.indexOf("doc.status === 'cancelled'");
  assert.notEqual(from, -1, 'the cancelled check is gone — there is no guarded path to inspect');
  const to   = SUCCESS.indexOf('return NextResponse.json(', from);
  assert.notEqual(to, -1, 'the guarded path does not return');
  const body = SUCCESS.slice(from, to);
  assert.ok(!body.includes("doc.status = 'paid'"),   'the guarded path writes the status');
  assert.ok(!body.includes('paidAt'),               'the guarded path writes paidAt');
  assert.ok(!body.includes('omiseStatus'),          'the guarded path writes omiseStatus');
  assert.ok(!body.includes('doc.save()'),           'the guarded path saves the document');
  assert.ok(!body.includes('sendPaidReceipt'),      'the guarded path sends a receipt for a cancelled seat');
});

test('the log names the charge id AND the registration id', () => {
  const from = SUCCESS.indexOf("doc.status === 'cancelled'");
  const to   = SUCCESS.indexOf('return NextResponse.json(', from);
  const body = SUCCESS.slice(from, to);
  assert.match(body, /console\.error\(/, 'a refund-owed event must not be logged at console.log level');
  assert.ok(body.includes('chargeId'),        'the log omits the charge id');
  assert.ok(body.includes('String(doc._id)'), 'the log omits the registration id');
  // "loudly and unambiguously" — a reader grepping the logs must not have to
  // already know what this means.
  assert.match(body, /REFUND/, 'the log does not say a refund is owed');
});

/**
 * OMISE MUST STILL BE ACKNOWLEDGED. Returning an error makes it retry the event
 * forever, and Academy still needs the forward. This is the assertion that
 * would catch someone "hardening" the guard into a 409.
 */
test('the guarded path still acks and still forwards to legacy', () => {
  const from = SUCCESS.indexOf("doc.status === 'cancelled'");
  const to   = SUCCESS.indexOf('doc.status = ');
  const body = SUCCESS.slice(from, to);
  assert.match(body, /forwardToLegacy\(rawBody, omiseHeaders\)/, 'the forward is skipped');
  assert.match(body, /NextResponse\.json\(\{\s*ok:\s*true/, 'the guarded path does not ack ok:true');
  assert.ok(!/status:\s*(4|5)\d\d/.test(body), 'the guarded path returns an error status — Omise will retry forever');
});

test('masterclass is excluded — a different collection, out of scope', () => {
  assert.match(SUCCESS, /doc\.status === 'cancelled' && !isMasterclass/);
});

/**
 * THE SYSTEM-ACTOR NOTE IS AT BOTH SITES.
 *
 * Reads `raw`, NOT `code`: the subject IS a comment, and the scrubber deletes
 * comments before any matcher runs. That is the documented exception in
 * test/run.mjs — assert a comment against scrubbed source and it fails on a
 * completely correct file. The control below proves the two views differ here.
 */
test('both paid-writers carry the note explaining they bypass the admin table', () => {
  for (const f of [HOOK, CHARGE]) {
    assert.match(f.raw, /SYSTEM ACTOR/, `${f.rel} has no system-actor note`);
    assert.match(f.raw, /statuses.js/, `${f.rel} does not name the table it bypasses`);
  }
});

test('CONTROL: the note really is a comment, invisible to the CODE view', () => {
  // If this fails, the note leaked into a string literal (or the scrubber
  // stopped stripping), and the test above would be readable from `code` —
  // meaning it is no longer testing what it says it tests.
  assert.ok(!HOOK.code.includes('SYSTEM ACTOR'), 'the note survives scrubbing — it is not a comment');
  assert.ok(!CHARGE.code.includes('SYSTEM ACTOR'), 'the note survives scrubbing — it is not a comment');
});

test('neither paid-writer imports the admin transition table', () => {
  // withImports, because the rule IS about imports. The control above already
  // proves the two views differ on this file.
  for (const f of [HOOK, CHARGE]) {
    assert.ok(
      !/^\s*import[\s\S]*?from\s*'@\/lib\/registrations\/statuses'/m.test(f.withImports),
      `${f.rel} imports the admin transition table — that would break payment collection`
    );
  }
});

test('CONTROL: withImports would SEE such an import if one existed', () => {
  // Proves the assertion above is not passing merely because imports were
  // stripped. A real import in a sibling file is visible through the same view.
  const ACTIONS = readSource('src/lib/actions/registrations.js');
  assert.ok(
    /^\s*import[\s\S]*?from\s*'@\/lib\/registrations\/statuses'/m.test(ACTIONS.withImports),
    'the control is inert — nothing in the repo imports the module through withImports'
  );
});

// ── The expired branch, deliberately unchanged ──────────────────────────────

test('an expired charge still cancels, exactly as before', () => {
  // NOT changed this round, and worth a note: an expired PromptPay QR sets
  // `cancelled`, which is now TERMINAL. That is a real behaviour change arriving
  // from the transition table rather than from this file — an abandoned QR now
  // kills the registration permanently. Flagged to the user; unchanged here so
  // the ruling stays theirs.
  assert.match(HOOK.code, /if \(charge\.status === 'expired'\)[\s\S]*?doc\.status = 'cancelled'/);
});
