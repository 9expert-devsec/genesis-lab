import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import {
  PHASE, PROPAGATION, WEBROOT_POLL_SCHEDULE_MS, WEBROOT_PROPAGATION_BUDGET_MS,
  canStartUpload, fetchWebrootBytes, pollForPropagation, pollGapMs, remedyFor, sha256Hex,
} from '@/lib/webroot/propagation.mjs';

/**
 * THE POLL. Proven by call count and injected deps, not by messages.
 *
 * Every claim here is about something that CANNOT be checked by looking at the
 * screen: that success means the content matched rather than the length, that
 * the fetch really bypassed the cache, that a second upload is impossible while
 * the first is propagating, and that running out of budget is reported as
 * "unknown" rather than "failed".
 */

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

/** Injected deps that count their calls and run on a virtual clock. */
function harness({ responses = [], budgetMs = WEBROOT_PROPAGATION_BUDGET_MS } = {}) {
  const calls = { fetch: 0, hash: 0, wait: 0 };
  const waited = [];
  let clock = 0;
  const queue = [...responses];
  return {
    calls,
    waited,
    budgetMs,
    get elapsed() { return clock; },
    deps: {
      fetchBytes: async () => {
        calls.fetch += 1;
        // The LAST response repeats forever rather than draining to undefined —
        // a poll that ran out of fixtures would otherwise stop seeing anything
        // and the "it reports what it saw" assertions would test the harness.
        const next = queue.length > 1 ? queue.shift() : queue[0];
        if (next instanceof Error) throw next;
        return next;
      },
      hash: async (v) => { calls.hash += 1; return v; },
      nowMs: () => clock,
      wait: async (ms) => { calls.wait += 1; waited.push(ms); clock += ms; },
    },
  };
}

const run = (h, expectedSha256) => pollForPropagation(
  { url: '/x.pdf', expectedSha256, budgetMs: h.budgetMs }, h.deps,
);

// ── success means the CONTENT matched ───────────────────────────────────────

test('the poll reports VISIBLE only when the hash matches', async () => {
  const h = harness({ responses: [HASH_B, HASH_B, HASH_A] });
  const out = await run(h, HASH_A);
  assert.equal(out.status, PROPAGATION.VISIBLE);
  assert.equal(out.attempts, 3, 'it must keep looking while the old bytes are served');
  assert.equal(out.seenSha256, HASH_A);
});

test('CONTROL: same byte LENGTH, different bytes → still not success', async () => {
  // The false-green this exists to prevent. Both hashes are 64 chars and both
  // stand for payloads of identical size; only the content differs. A length
  // comparison would call this done.
  assert.equal(HASH_A.length, HASH_B.length, 'the fixture must not differ in length');
  const h = harness({ responses: [HASH_B] });
  const out = await run(h, HASH_A);
  assert.equal(out.status, PROPAGATION.NOT_VISIBLE_YET);
  assert.notEqual(out.status, PROPAGATION.VISIBLE);
  assert.equal(out.seenSha256, HASH_B, 'and it reports what it actually saw');
});

test('a fetch that throws is no evidence either way — the budget decides', async () => {
  const h = harness({ responses: [new Error('network'), new Error('network'), HASH_A] });
  const out = await run(h, HASH_A);
  assert.equal(out.status, PROPAGATION.VISIBLE);
  assert.equal(out.attempts, 3);
});

// ── the fetch must bypass every cache ───────────────────────────────────────

test('fetchWebrootBytes passes cache: no-store', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  const bytes = await fetchWebrootBytes('/catalog.pdf', fakeFetch);
  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].init?.cache, 'no-store',
    'without no-store the browser may answer from its own copy, held under the '
    + 'same 30-day max-age — the poll would confirm a file it never fetched');
});

test('CONTROL: an implementation that omits no-store fails the same check', async () => {
  // The control owns its own subject rather than filtering the real one. If the
  // assertion above could not tell these apart it would be decoration.
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array().buffer };
  };
  const withoutNoStore = async (url, impl) => {
    const res = await impl(url, {});          // <- the defect, verbatim
    await res.arrayBuffer();
  };
  await withoutNoStore('/catalog.pdf', fakeFetch);
  assert.notEqual(seen[0].init?.cache, 'no-store',
    'the cache-bypassing check cannot distinguish a fetch that omits the option');
});

test('a non-ok response throws rather than being hashed as content', async () => {
  const fakeFetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new Uint8Array().buffer });
  await assert.rejects(() => fetchWebrootBytes('/gone.pdf', fakeFetch), /404/);
});

// ── the budget, and what running out of it MEANS ────────────────────────────

test('running out of budget reports NOT_VISIBLE_YET — never a failure value', async () => {
  const h = harness({ responses: [HASH_B], budgetMs: 5_000 });
  const out = await run(h, HASH_A);
  assert.equal(out.status, PROPAGATION.NOT_VISIBLE_YET);
  // There is deliberately no FAILED outcome to assert against: the enum has two
  // values, because one machine cannot observe a failure — only an absence.
  assert.deepEqual(Object.values(PROPAGATION).sort(), ['not-visible-yet', 'visible']);
  assert.ok(out.elapsedMs >= 5_000);
});

test('the budget is a real bound — the poll does not run forever', async () => {
  const h = harness({ responses: [HASH_B], budgetMs: 60_000 });
  const out = await run(h, HASH_A);
  assert.equal(out.status, PROPAGATION.NOT_VISIBLE_YET);
  assert.ok(out.attempts <= 10, `ran ${out.attempts} attempts inside the budget`);
  assert.ok(h.calls.fetch === out.attempts, 'one fetch per attempt');
});

test('CONTROL: the budget assertion is not vacuous — a match inside it still wins', async () => {
  // Same budget, same schedule, one difference: the bytes flip. Without this,
  // "it stopped" would pass for a poll that never succeeds at all.
  const h = harness({ responses: [HASH_B, HASH_A], budgetMs: 60_000 });
  const out = await run(h, HASH_A);
  assert.equal(out.status, PROPAGATION.VISIBLE);
  assert.equal(out.attempts, 2);
});

test('the gap schedule backs off, so a 42.6 MiB object is not refetched every second', async () => {
  assert.deepEqual([...WEBROOT_POLL_SCHEDULE_MS], [1000, 2000, 3000, 5000, 8000, 13000, 21000]);
  assert.equal(pollGapMs(1), 1000);
  assert.equal(pollGapMs(7), 21000);
  assert.equal(pollGapMs(99), 21000, 'past the end it repeats rather than bursting');
  const total = WEBROOT_POLL_SCHEDULE_MS.reduce((a, b) => a + b, 0);
  assert.ok(total < WEBROOT_PROPAGATION_BUDGET_MS,
    'the whole schedule must fit inside the budget or the last gap is a formality');
});

test('the budget is anchored where the comment says it is', async () => {
  assert.equal(WEBROOT_PROPAGATION_BUDGET_MS, 60_000);
  assert.ok(WEBROOT_PROPAGATION_BUDGET_MS > 10_800 * 4,
    'the anchor is a ~10.8 s observation; a budget without real headroom over it '
    + 'reports "not visible yet" on normal replacements');
});

// ── re-upload is impossible while anything is in flight ─────────────────────

test('re-upload is DISABLED throughout prepare, upload and poll', () => {
  for (const p of [PHASE.PREPARING, PHASE.UPLOADING, PHASE.POLLING]) {
    assert.equal(canStartUpload(p), false, `${p} must not allow a second upload`);
  }
});

test('re-upload is RE-ENABLED on a hash flip and on budget expiry alike', () => {
  assert.equal(canStartUpload(PHASE.VISIBLE), true, 'after the flip');
  assert.equal(canStartUpload(PHASE.NOT_VISIBLE_YET), true,
    'and after a timeout — the state is "unknown", not "broken", and a page that '
    + 'locks itself forever on an unknown is a page nobody can use');
  assert.equal(canStartUpload(PHASE.IDLE), true);
  assert.equal(canStartUpload(PHASE.REFUSED), true);
});

test('CONTROL: the lock is real — not every phase is permitted', () => {
  // Without this, `canStartUpload` returning true for everything would satisfy
  // the re-enable test above and quietly remove the protection.
  const allowed = Object.values(PHASE).filter((p) => canStartUpload(p));
  const blocked = Object.values(PHASE).filter((p) => !canStartUpload(p));
  assert.ok(blocked.length >= 3, 'no phase blocks a second upload');
  assert.ok(allowed.length >= 3, 'every phase blocks it, which would be unusable');
});

test('the remedy for a timeout is RE-CHECK, never re-upload', () => {
  assert.equal(remedyFor(PHASE.NOT_VISIBLE_YET), 'recheck');
  assert.notEqual(remedyFor(PHASE.NOT_VISIBLE_YET), 'reupload');
  assert.equal(remedyFor(PHASE.VISIBLE), null, 'a success needs no remedy');
});

// ── the hash helper itself ──────────────────────────────────────────────────

test('sha256Hex agrees with a known vector', async () => {
  const empty = await sha256Hex(new Uint8Array(), webcrypto.subtle);
  assert.equal(empty, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('CONTROL: two payloads of the SAME length hash differently', async () => {
  // The property the whole poll rests on, asserted directly rather than assumed.
  const a = await sha256Hex(new Uint8Array([1, 2, 3, 4]), webcrypto.subtle);
  const b = await sha256Hex(new Uint8Array([1, 2, 3, 5]), webcrypto.subtle);
  assert.equal(a.length, b.length);
  assert.notEqual(a, b, 'equal-length payloads must not collide, or the poll is a length check');
});
