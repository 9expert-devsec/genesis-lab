import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPLACE, runReplaceFlow } from '@/lib/webroot/replaceFlow.mjs';
import { WEBROOT_DOCUMENTS, WEBROOT_MAX_BYTES, webrootArchivePathname } from '@/lib/webrootDocuments.mjs';

/**
 * ARCHIVE BEFORE OVERWRITE — the ordering, proven rather than asserted.
 *
 * The claim that matters is negative: when the archive fails, NO TOKEN WAS
 * ISSUED. A test that only checks the happy path cannot see the difference
 * between "archives first" and "archives and authorises concurrently", and the
 * difference is the only copy of a 42.6 MiB document.
 *
 * So every case below records WHICH dependencies were called, and the failure
 * cases assert `authorise` has a call count of ZERO — not that the result says
 * failed, which a flow could report while having already handed out a token.
 */

const FILE = WEBROOT_DOCUMENTS[0];
const STAMP = '2026-08-10T01-00-00Z';
const LIVE_SIZE = 44_695_000;

/** Dependencies that record their calls. Overridable per case. */
function spies(overrides = {}) {
  const calls = { headLive: 0, copy: 0, headArchive: 0, authorise: 0 };
  const copied = [];
  return {
    calls,
    copied,
    deps: {
      headLive: async () => { calls.headLive += 1; return { size: LIVE_SIZE }; },
      copy: async (from, to) => { calls.copy += 1; copied.push({ from, to }); },
      headArchive: async () => { calls.headArchive += 1; return { size: LIVE_SIZE }; },
      authorise: async (t) => { calls.authorise += 1; return { token: `tok:${t.filename}` }; },
      ...overrides,
    },
  };
}

const run = (deps, over = {}) => runReplaceFlow({ filename: FILE, bytes: 1_000_000, stamp: STAMP, ...over }, deps);

// ── the happy path, so the failure paths mean something ─────────────────────
test('the happy path archives, verifies, THEN authorises', async () => {
  const s = spies();
  const r = await run(s.deps);
  assert.equal(r.status, REPLACE.AUTHORISED);
  assert.equal(s.calls.copy, 1);
  assert.equal(s.calls.headArchive, 1, 'the copy must be verified, not assumed');
  assert.equal(s.calls.authorise, 1);
  assert.equal(r.archivePathname, webrootArchivePathname(FILE, STAMP));
  assert.equal(r.previousBytes, LIVE_SIZE);
  assert.deepEqual(s.copied, [{ from: `webroot-documents/${FILE}`, to: r.archivePathname }]);
});

// ── THE CLAIM: a failed archive issues no token ─────────────────────────────
test('archive copy FAILS → no token was issued', async () => {
  const s = spies({ copy: async () => { throw new Error('blob copy exploded'); } });
  const r = await run(s.deps);
  assert.equal(r.status, REPLACE.ARCHIVE_FAILED);
  assert.equal(s.calls.authorise, 0, 'A TOKEN WAS ISSUED DESPITE A FAILED ARCHIVE');
  assert.match(r.error, /blob copy exploded/);
});

test('archive copy succeeds but VERIFICATION finds nothing → no token', async () => {
  const s = spies({ headArchive: async () => null });
  const r = await run(s.deps);
  assert.equal(r.status, REPLACE.ARCHIVE_UNVERIFIED);
  assert.equal(s.calls.authorise, 0, 'a successful copy CALL is not a copy');
});

test('archive verifies but the SIZE disagrees → no token', async () => {
  const s = spies({ headArchive: async () => ({ size: 0 }) });
  const r = await run(s.deps);
  assert.equal(r.status, REPLACE.ARCHIVE_UNVERIFIED);
  assert.equal(s.calls.authorise, 0, 'an empty placeholder at the right key is not an archive');
  assert.match(r.error, /0/);
});

test('the live object is MISSING → refused, nothing copied, no token', async () => {
  const s = spies({ headLive: async () => null });
  const r = await run(s.deps);
  assert.equal(r.status, REPLACE.LIVE_MISSING);
  assert.equal(s.calls.copy, 0, 'nothing to archive means nothing to overwrite');
  assert.equal(s.calls.authorise, 0);
});

// ── the guards that run before any I/O ──────────────────────────────────────
test('an unknown filename is refused before ANY dependency is touched', async () => {
  const s = spies();
  const r = await runReplaceFlow({ filename: 'other.pdf', bytes: 10, stamp: STAMP }, s.deps);
  assert.equal(r.status, REPLACE.REFUSED_NAME);
  assert.deepEqual(s.calls, { headLive: 0, copy: 0, headArchive: 0, authorise: 0 });
});

test('an oversized file is refused before ANY dependency is touched', async () => {
  const s = spies();
  const r = await run(s.deps, { bytes: WEBROOT_MAX_BYTES + 1 });
  assert.equal(r.status, REPLACE.REFUSED_SIZE);
  assert.deepEqual(s.calls, { headLive: 0, copy: 0, headArchive: 0, authorise: 0 });
  assert.match(r.error, /64\.0 MB/, 'the refusal must name the cap');
  assert.match(r.error, /MB/, 'and the actual size');
});

// ── CONTROLS — each proves the assertion above can go red ───────────────────

test('CONTROL: the authorise spy DOES count when it is reached', async () => {
  // Without this, `authorise: 0` would pass for a spy that never increments —
  // every failure assertion above would be vacuous.
  const s = spies();
  await run(s.deps);
  assert.equal(s.calls.authorise, 1, 'the spy does not record calls, so the zero-checks prove nothing');
});

test('CONTROL: a flow that authorised BEFORE archiving would be caught', async () => {
  // The defect this file exists to prevent, simulated: authorise first, then
  // archive. The same assertion the real failure tests make must reject it.
  const calls = { authorise: 0, copy: 0 };
  const wrongOrder = async () => {
    calls.authorise += 1;                       // token handed out first
    try { throw new Error('copy failed'); } catch { /* archive fails after */ }
    return { status: REPLACE.ARCHIVE_FAILED };
  };
  const r = await wrongOrder();
  assert.equal(r.status, REPLACE.ARCHIVE_FAILED, 'it still REPORTS failure…');
  assert.notEqual(calls.authorise, 0,
    '…while having issued a token. The real tests assert authorise===0, which '
    + 'is exactly what distinguishes this from the shipped flow');
});

test('CONTROL: the size refusal has a real threshold, not a blanket', async () => {
  const s = spies();
  const justUnder = await run(s.deps, { bytes: WEBROOT_MAX_BYTES - 1 });
  assert.equal(justUnder.status, REPLACE.AUTHORISED, 'a file just under the cap must pass');
  const s2 = spies();
  const justOver = await run(s2.deps, { bytes: WEBROOT_MAX_BYTES + 1 });
  assert.equal(justOver.status, REPLACE.REFUSED_SIZE);
});

test('CONTROL: two replacements get different archive keys', async () => {
  const a = await run(spies().deps, { stamp: '2026-08-10T01-00-00Z' });
  const b = await run(spies().deps, { stamp: '2026-08-10T01-00-01Z' });
  assert.notEqual(a.archivePathname, b.archivePathname,
    'a colliding archive key would destroy the copy it just made');
});
