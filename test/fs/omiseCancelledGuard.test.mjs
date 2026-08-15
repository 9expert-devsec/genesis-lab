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

// ── The expired branch — REWRITTEN to pin the NEW behaviour ────────────────

/**
 * ── THIS TEST USED TO ASSERT THE OPPOSITE, AND WHY IT WAS INVERTED ──────────
 *
 * Round 1 left it reading:
 *
 *   test('an expired charge still cancels, exactly as before', () => {
 *     assert.match(HOOK.code,
 *       /if \(charge\.status === 'expired'\)[\s\S]*?doc\.status = 'cancelled'/);
 *   });
 *
 * with a note saying an abandoned QR now killed a registration permanently, that
 * this was a real behaviour change arriving from the transition table rather
 * than from the webhook, and that it was flagged to the user so the ruling
 * stayed theirs.
 *
 * The ruling came back: the branch writes only `payment.omiseStatus`. So the
 * test is INVERTED rather than deleted — the subject is the same line of code
 * and the same question, and deleting it would leave the new behaviour
 * unguarded while the old reasoning vanished from the file that recorded it.
 *
 * ── THE SLICE HAS TO BE BOUNDED, AND THE BOUND IS ASSERTED ─────────────────
 * `doc.status = 'cancelled'` appears elsewhere in this file — the successful
 * branch reads `doc.status === 'cancelled'`, and a slice running to EOF would
 * pick up the next branch's writes. So the branch is cut at its own closing
 * `return`, and both ends are asserted present: `indexOf` returns -1 for a
 * missing marker, and a slice built from -1 is a different string than intended
 * while still looking like a pass.
 */
function expiredBranch(code) {
  const start = code.indexOf("if (charge.status === 'expired')");
  assert.notEqual(start, -1, 'the expired branch is gone');
  const end = code.indexOf('return NextResponse.json(', start);
  assert.notEqual(end, -1, 'the expired branch does not return — the slice would run to EOF');
  return code.slice(start, end);
}

const EXPIRED = expiredBranch(HOOK.code);

test('the expired branch does NOT assign doc.status', () => {
  // The whole ruling in one line. An abandoned PromptPay QR is a failed payment
  // attempt, not a cancellation — and cancellation is terminal now, so writing
  // it here permanently killed a registration over a customer walking away.
  assert.ok(
    !/doc\.status\s*=/.test(EXPIRED),
    'the expired branch writes the registration status — an abandoned QR must not cancel'
  );
});

test('the expired branch writes ONLY the omise status', () => {
  // Stronger than the absence above: it says what the branch may do, so a
  // different field creeping in is caught too.
  assert.match(EXPIRED, /doc\.payment\.omiseStatus = 'expired'/, 'the omise status is not recorded');
  assert.ok(!EXPIRED.includes('paidAt'), 'the expired branch writes paidAt');
  assert.ok(!EXPIRED.includes('sendPaidReceipt'), 'the expired branch sends a receipt');
});

test('the expired branch has the same shape as the failed branch beside it', () => {
  // They are the same class of event and the `failed` branch has always done
  // only this. If the two ever diverge again, one of them is wrong.
  const failedStart = HOOK.code.indexOf("if (charge.status === 'failed')");
  assert.notEqual(failedStart, -1, 'the failed branch is gone');
  const failed = HOOK.code.slice(failedStart, HOOK.code.indexOf('return NextResponse.json(', failedStart));
  assert.ok(!/doc\.status\s*=/.test(failed), 'the failed branch now writes the status too');
  assert.match(failed, /doc\.payment\.omiseStatus = 'failed'/);
});

test('CONTROL: the slice CAN see a status write — it is not simply blind', () => {
  // Proves the two absence assertions above are doing real work. The same
  // matcher, run over the branch that legitimately DOES write the status, must
  // find it. Without this, a slice that had silently become empty would satisfy
  // every "does not contain" assertion in this section.
  assert.ok(EXPIRED.length > 40, 'the expired slice collapsed to near-nothing');
  assert.ok(/doc\.status\s*=/.test(SUCCESS), 'the control is inert — no branch writes doc.status at all');
  assert.match(SUCCESS, /doc\.status = 'paid'/);
});

/**
 * ── MATCHING PROSE INSIDE A BLOCK COMMENT NEEDS THE WRAPPING REMOVED ────────
 *
 * MEASURED. The first version of this test searched the raw preamble for "NOT A
 * CANCELLATION" and failed on a comment that says exactly that — because the
 * phrase is line-wrapped, so the stored text is `NOT A\n *     CANCELLATION`.
 * A matcher for a sentence has to see a sentence, which means stripping the
 * leading ` * ` of each line and collapsing the newlines first.
 *
 * This is the same lesson as sourceScan's header, applied to the one case that
 * header does not cover: there, matching text that is not code. Here, matching
 * PROSE that is genuinely the subject — and prose is wrapped.
 */
function commentProse(raw, from, back = 2000) {
  return raw
    .slice(Math.max(0, from - back), from)
    .split('\n')
    .map((line) => line.replace(/^\s*\*ic?\s?/, '').replace(/^\s*\*\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');
}

test('the reasons for the change are recorded AT the branch', () => {
  // Reads `raw`, NOT `code`: the subject IS a comment, and the scrubber deletes
  // comments before any matcher runs. This is the documented exception in
  // test/run.mjs. The next reader's instinct will be to "restore" the
  // cancellation, and the four reasons are what answers them.
  const rawStart = HOOK.raw.indexOf("if (charge.status === 'expired')");
  assert.notEqual(rawStart, -1, 'the expired branch is gone from the raw source');
  const prose = commentProse(HOOK.raw, rawStart);

  assert.match(prose, /FAILED PAYMENT ATTEMPT, NOT A CANCELLATION/,
    'the branch does not say why it stopped cancelling');
  assert.match(prose, /WROTE NO AUDIT ROW/,
    'the branch does not record that the old write had no author');
  assert.match(prose, /NO DUPLICATE GUARD/,
    'the branch does not say why a lingering pending row is harmless');
});

test('CONTROL: the prose helper is what makes those matches possible', () => {
  // Proves the unwrapping does real work rather than being decoration: the same
  // phrase must NOT be findable in the raw slice, because it is wrapped there.
  const rawStart = HOOK.raw.indexOf("if (charge.status === 'expired')");
  const rawSlice = HOOK.raw.slice(Math.max(0, rawStart - 2000), rawStart);
  assert.ok(
    !rawSlice.includes('FAILED PAYMENT ATTEMPT, NOT A CANCELLATION'),
    'the control is inert — the phrase is not actually wrapped, so the helper proves nothing'
  );
  assert.ok(
    commentProse(HOOK.raw, rawStart).includes('FAILED PAYMENT ATTEMPT, NOT A CANCELLATION'),
    'the helper failed to unwrap it'
  );
});

test('CONTROL: that reasoning really is a comment, invisible to the CODE view', () => {
  // If this fails, the note leaked into a string literal (or the scrubber
  // stopped stripping) and the test above is no longer testing what it says.
  assert.ok(!HOOK.code.includes('NO AUDIT ROW'), 'the note survives scrubbing — it is not a comment');
});
