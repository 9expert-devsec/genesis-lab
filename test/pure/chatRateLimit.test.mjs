import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, rateLimitKeyFrom } from '@/lib/chat/rateLimit';

// The /api/chat rate limiter, driven directly.
//
// WHY THIS FILE EXISTS, and it is a specific incident rather than a general
// wish for coverage. The limiter was first verified by bursting 17 requests at
// a dev server. It did not refuse a single one. The module logic turned out to
// be correct — an identical burst refused correctly minutes later, once an
// `x-ratelimit-remaining` header made the counter observable — so the real
// cause was almost certainly the dev server re-evaluating the module and
// resetting the Map mid-burst. ALMOST CERTAINLY is the problem: that could not
// be proven after the fact, and the report had to say so.
//
// An HTTP burst cannot separate "the arithmetic is wrong" from "the process
// dropped its memory", because both look like a 200 that should have been a
// 429. Calling the function in one process, with time supplied rather than
// waited for, answers the arithmetic question on its own. The other half —
// whether the counters survive in a real serverless runtime — is NOT tested
// here and cannot be: per-instance state is the documented, accepted weakness
// of this design (see the module header), not a defect a test could catch.
//
// ── TIME IS INJECTED, NEVER SLEPT ───────────────────────────────────────────
// `checkRateLimit` already takes a `now`, so no seam had to be added. Using it
// is mandatory, not stylistic: test/run.mjs drives the runner with
// isolation:'none' and concurrency:true, so every tier shares one process and
// one wall clock. A real `setTimeout` here would stall unrelated files, and the
// resulting flake would show up in whichever test happened to be running — the
// last place anyone would look for it.
//
// ── KEYS ARE UNIQUE PER TEST, DELIBERATELY ──────────────────────────────────
// The bucket Map is module-global and this suite shares one process, so a key
// reused across two tests would carry the first one's count into the second.
// Each test below owns its key. `prune()` also deletes buckets whose window has
// passed relative to the `now` it is handed, which is a second reason not to
// share: a test that jumps the clock forward would silently evict another's
// state and the failure would read as an off-by-one in the counter.

const W = 60_000; // window used throughout, in ms
const T0 = 1_700_000_000_000; // fixed epoch base; nothing here reads the real clock

/** Run `n` requests against a fresh key at a fixed instant. */
function burst(key, n, { max, now = T0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(checkRateLimit(key, { max, windowMs: W, now }));
  return out;
}

// ── The boundary ────────────────────────────────────────────────────────────

test('the refusal boundary is EXACT: request `max` passes, request max+1 does not', () => {
  // The whole sequence is asserted, not a count of how many passed. "at least 3
  // passed" is satisfied by a limiter that never refuses anything — the exact
  // shape is the claim, and the flip has to land between index 2 and index 3.
  const verdicts = burst('boundary-3', 5, { max: 3 }).map((r) => r.allowed);
  assert.deepEqual(verdicts, [true, true, true, false, false]);
});

test('the boundary tracks `max` rather than a hardcoded number', () => {
  // Without this, the test above passes for an implementation that ignores the
  // option and happens to refuse after 3.
  assert.deepEqual(
    burst('boundary-1', 3, { max: 1 }).map((r) => r.allowed),
    [true, false, false],
  );
  assert.deepEqual(
    burst('boundary-5', 7, { max: 5 }).map((r) => r.allowed),
    [true, true, true, true, true, false, false],
  );
});

test('`remaining` counts down exactly and floors at zero', () => {
  assert.deepEqual(
    burst('remaining-3', 5, { max: 3 }).map((r) => r.remaining),
    [2, 1, 0, 0, 0],
  );
});

// ── The window ──────────────────────────────────────────────────────────────

test('the window releases at exactly resetAt, not before', () => {
  const key = 'window';
  burst(key, 4, { max: 3 }); // exhausted at T0; resetAt is T0 + W
  // one millisecond short of the boundary: still refused
  assert.equal(
    checkRateLimit(key, { max: 3, windowMs: W, now: T0 + W - 1 }).allowed,
    false,
    'the window must not release early',
  );
  // at the boundary: a fresh bucket, and this request is its first
  const released = checkRateLimit(key, { max: 3, windowMs: W, now: T0 + W });
  assert.equal(released.allowed, true, 'the window must release at resetAt');
  assert.equal(released.remaining, 2, 'and it must be a NEW bucket, not a decremented old one');
});

test('retryAfterSeconds reports the real remainder and never rounds down to zero', () => {
  const key = 'retry-after';
  burst(key, 4, { max: 3 });
  assert.equal(
    checkRateLimit(key, { max: 3, windowMs: W, now: T0 + 50_000 }).retryAfterSeconds,
    10,
    '10s left in the window → retry after 10s',
  );
  // A sub-second remainder must still be at least 1: telling a client to retry
  // after 0 seconds invites the retry that is still inside the window.
  assert.equal(
    checkRateLimit(key, { max: 3, windowMs: W, now: T0 + W - 1 }).retryAfterSeconds,
    1,
  );
});

// ── Key precedence ──────────────────────────────────────────────────────────

test('the forwarded IP wins over a client-supplied sessionId', () => {
  // Observed at runtime — two bursts with DIFFERENT sessionIds shared one
  // counter because both came from the same address — and pinned here, because
  // an observation nothing asserts decays. It is also the security-relevant
  // half: sessionId is minted by the browser, so a limiter keyed on it is
  // bypassed by generating a new one.
  assert.equal(
    rateLimitKeyFrom({ forwardedFor: '203.0.113.7', sessionId: 'sid-a' }),
    'ip:203.0.113.7',
  );
  assert.equal(
    rateLimitKeyFrom({ forwardedFor: '203.0.113.7', sessionId: 'sid-b' }),
    'ip:203.0.113.7',
    'a different sessionId behind the same address must NOT open a second bucket',
  );
});

test('only the first hop of an x-forwarded-for chain is used, whitespace trimmed', () => {
  assert.equal(
    rateLimitKeyFrom({ forwardedFor: '203.0.113.7, 70.41.3.18, 150.172.238.178' }),
    'ip:203.0.113.7',
  );
  assert.equal(rateLimitKeyFrom({ forwardedFor: '  203.0.113.7  ' }), 'ip:203.0.113.7');
});

test('the fallback ladder is exactly forwardedFor → realIp → sessionId → anon', () => {
  // Asserted as the complete ladder rather than one rung at a time: the failure
  // that matters is a rung silently swapping order or being skipped.
  assert.deepEqual(
    [
      rateLimitKeyFrom({ forwardedFor: '203.0.113.7', realIp: '198.51.100.4', sessionId: 's' }),
      rateLimitKeyFrom({ realIp: '198.51.100.4', sessionId: 's' }),
      rateLimitKeyFrom({ sessionId: 's' }),
      rateLimitKeyFrom({}),
      rateLimitKeyFrom(),
    ],
    ['ip:203.0.113.7', 'ip:198.51.100.4', 'sid:s', 'anon', 'anon'],
  );
  // An empty header is absent, not an identity — otherwise every caller whose
  // proxy sends a blank x-forwarded-for shares one bucket named `ip:`.
  assert.equal(rateLimitKeyFrom({ forwardedFor: '', sessionId: 's' }), 'sid:s');
});

// ── CONTROLS: the two claims are SEPARABLE ──────────────────────────────────
// Each control replicates the single predicate a break would change and shows
// it disagrees with the correct one on THIS test's case while agreeing on the
// other's. That is what makes the boundary tests and the window test
// independent evidence rather than two views of one assertion.

test('CONTROL: an off-by-one refusal reddens the boundary and leaves the window green', () => {
  // The break: `existing.count > max` → `existing.count >= max`.
  const refuses = (count, max) => count > max;
  const refusesBroken = (count, max) => count >= max;

  // The boundary test's case — request number `max` — is where they DIVERGE.
  assert.equal(refuses(3, 3), false, 'correct: the 3rd of 3 is allowed');
  assert.equal(refusesBroken(3, 3), true, 'broken: refuses one request early → boundary goes red');

  // The window test's case — the first request into a fresh bucket — is where
  // they AGREE, so that claim survives this break untouched.
  assert.equal(refuses(1, 3), false);
  assert.equal(refusesBroken(1, 3), false, 'window claim stays green under this break');
});

test('CONTROL: a bucket that never expires reddens the window and leaves the boundary green', () => {
  // The break: dropping `|| existing.resetAt <= now` from the fresh-bucket test.
  const isFresh = (existing, now) => !existing || existing.resetAt <= now;
  const isFreshBroken = (existing) => !existing;
  const stale = { count: 4, resetAt: T0 + W };

  // The window test's case — a bucket whose window has elapsed — DIVERGES.
  assert.equal(isFresh(stale, T0 + W), true, 'correct: at resetAt the bucket is replaced');
  assert.equal(isFreshBroken(stale), false, 'broken: it never releases → window goes red');

  // The boundary tests never advance the clock, so every one of their requests
  // hits the same live bucket and both predicates answer identically.
  assert.equal(isFresh(stale, T0), false);
  assert.equal(isFreshBroken(stale), false, 'boundary claims stay green under this break');
  // …and the very first request of a run, where there is no bucket at all.
  assert.equal(isFresh(undefined, T0), true);
  assert.equal(isFreshBroken(undefined), true);
});
