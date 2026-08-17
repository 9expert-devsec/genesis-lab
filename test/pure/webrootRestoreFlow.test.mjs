import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESTORE, isArchiveKeyFor, restoreDidWrite, runRestoreFlow, webrootArchiveDirFor,
  WEBROOT_RESTORE_OBSERVE_BUDGET_MS,
} from '@/lib/webroot/restoreFlow.mjs';
import { WEBROOT_DOCUMENTS, webrootArchivePathname } from '@/lib/webrootDocuments.mjs';

/**
 * A RESTORE IS ITSELF AN OVERWRITE, so the claims that matter are negative and
 * about ORDER: nothing is copied over the live key until the bytes it would
 * destroy are archived AND that archive is verified.
 *
 * ══ AND THE VERIFICATION HAS ITS OWN CLAIM, LEARNED THE HARD WAY ════════════
 *
 * On 2026-08-10 a REAL restore succeeded and this flow called it
 * `restore-unverified`, skipped the record and exited 1 — because it read the
 * public URL milliseconds after the copy and got the CDN's pre-copy bytes.
 *
 * So the rule these tests pin is: head() decides success (Blob API, not a
 * cache); the public read decides only the MESSAGE. A hash that does not match
 * from one PoP inside the budget is indistinguishable from staleness and must
 * never be reported as corruption.
 */

const FILE = WEBROOT_DOCUMENTS[1];
const LIVE = `webroot-documents/${FILE}`;
const STAMP = '2026-08-10T04-00-00Z';
const SOURCE_ARCHIVE = webrootArchivePathname(FILE, '2026-08-01T00-00-00Z');

const SHA_OLD = '1'.repeat(64);
const SHA_WANTED = '2'.repeat(64);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Dependencies that record every call in one ordered log.
 *
 * The fixture's "bytes" ARE the hash string and `sha256` is the identity, so a
 * case stays about WHICH bytes were seen rather than about digesting. `hashes`
 * is mutated by a successful copy, so the flow verifies what the copy actually
 * did rather than what the fixture wished had happened.
 */
function spies(overrides = {}) {
  const log = [];
  const objects = new Map([[LIVE, { size: 1000 }], [SOURCE_ARCHIVE, { size: 1000 }]]);
  const hashes = new Map([[LIVE, SHA_OLD], [SOURCE_ARCHIVE, SHA_WANTED]]);
  let clock = 0;
  const base = {
    headLive: async (p) => { log.push(`headLive:${p}`); return objects.get(p) ?? null; },
    headArchive: async (p) => { log.push(`headArchive:${p}`); return objects.get(p) ?? null; },
    copy: async (from, to) => {
      log.push(`copy:${from}->${to}`);
      objects.set(to, { ...(objects.get(from) ?? { size: 1000 }) });
      hashes.set(to, hashes.get(from));
    },
    fetchFreshBytes: async (p) => { log.push(`fetch:${p}`); return hashes.get(p) ?? null; },
    sha256: (v) => v,
    // Step 4½. It goes in the SAME log as the copies, which is the only way the
    // ordering claim below can be made about a position rather than a count.
    ensureRecordReachable: async () => { log.push('recordCheck'); return { ok: true }; },
    nowMs: () => clock,
    wait: async (ms) => { log.push(`wait:${ms}`); clock += ms; },
  };
  return { log, objects, hashes, deps: { ...base, ...overrides } };
}

const run = (deps, over = {}) => runRestoreFlow(
  { filename: FILE, archivePathname: SOURCE_ARCHIVE, stamp: STAMP, commit: true, ...over }, deps,
);

/**
 * The SCRIPT's composition, mirrored: run, then record iff the flow says bytes
 * were written. Kept here rather than inside the flow because recording is the
 * caller's job — test/fs/webrootRestoreScriptWiring.test.mjs asserts the real
 * script gates on the same helper.
 */
async function runAndRecord(deps, over = {}) {
  const recorded = [];
  const r = await run(deps, over);
  if (restoreDidWrite(r.status)) recorded.push(r.status);
  return { r, recordCount: recorded.length };
}

const firstIndex = (log, re) => log.findIndex((l) => re.test(l));

// ── ordering: the safety archive, then the restore ──────────────────────────

test('the happy path archives the current object, verifies it, THEN restores', async () => {
  const s = spies();
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RESTORED_VERIFIED);
  assert.equal(r.restoredSha256, SHA_WANTED);
  assert.equal(r.previousSha256, SHA_OLD);
  assert.ok(r.safetyArchivePathname.startsWith(`${webrootArchiveDirFor(FILE)}/`));

  const safetyCopy = firstIndex(s.log, new RegExp(`^copy:${esc(LIVE)}->`));
  const restoreCopy = firstIndex(s.log, new RegExp(`^copy:${esc(SOURCE_ARCHIVE)}->`));
  assert.ok(safetyCopy > -1 && restoreCopy > -1);
  assert.ok(safetyCopy < restoreCopy,
    `THE ORDER IS THE FEATURE. Log was:\n${s.log.join('\n')}`);
});

test('ORDERED CALL LOG: head() runs BEFORE the first public read of the restored key', async () => {
  // The fix, as an ordering claim. head() is authoritative and instant; the
  // public read is a cache. Asking the cache first is what produced a false
  // "unverified" on a restore that had actually succeeded.
  const s = spies();
  await run(s.deps);

  const restoreCopy = firstIndex(s.log, new RegExp(`^copy:${esc(SOURCE_ARCHIVE)}->`));
  const after = s.log.slice(restoreCopy + 1);
  const headAt = firstIndex(after, new RegExp(`^headLive:${esc(LIVE)}$`));
  const fetchAt = firstIndex(after, new RegExp(`^fetch:${esc(LIVE)}$`));
  assert.ok(headAt > -1, `no head() after the restore copy. Log:\n${s.log.join('\n')}`);
  assert.ok(fetchAt > -1, 'no public read after the restore copy');
  assert.ok(headAt < fetchAt,
    `head() must precede the public read. After-copy log was:\n${after.join('\n')}`);
});

// ── STEP 4½: THE RECORD IS REACHED BEFORE ANY BYTE MOVES ────────────────────
//
// The 2026-08-10 defect shape by a second route. Recording used to run AFTER
// both copies, and a Mongo connection from the operator script is MEASURED
// intermittently unreachable (>70 s twice, then 809 ms / 665 ms). An outage in
// the wrong 30 seconds therefore left BLOB CHANGED AND MONGO NOT — with no CDN
// involved at all.
//
// The claims are the same species as step 6's: negative, and about ORDER. A
// failing check must yield a copy count of ZERO, not merely a result that says
// it failed — which a flow could report having already overwritten the object.

test('the record check FAILS → ZERO Blob mutations', async () => {
  const s = spies({
    ensureRecordReachable: async () => { s.log.push('recordCheck'); return { ok: false, error: 'no primary' }; },
  });
  const { r, recordCount } = await runAndRecord(s.deps);

  assert.equal(r.status, RESTORE.RECORD_UNREACHABLE);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0,
    `THE RESTORE RAN WITH NO RECORD TO WRITE TO. Log was:\n${s.log.join('\n')}`);
  assert.equal(recordCount, 0);
  assert.equal(restoreDidWrite(r.status), false);
  assert.match(r.error, /no primary/, 'the refusal must carry the underlying reason');
});

test('CONTROL: the copy spy DOES count when the record check SUCCEEDS', async () => {
  // Without this the zero above is vacuous — it would pass just as well for a
  // fixture whose copy spy never records, or for a flow that copies nothing on
  // any input whatsoever.
  const s = spies();
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RESTORED_VERIFIED);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 2,
    'the same fixture, with the check passing, must reach BOTH copies');
});

test('ORDERED CALL LOG: the record check precedes the FIRST copy', async () => {
  // A count of 2 copies after a passing check does not say the check ran first.
  // Position does.
  const s = spies();
  await run(s.deps);
  const checkAt = firstIndex(s.log, /^recordCheck$/);
  const firstCopy = firstIndex(s.log, /^copy:/);
  assert.ok(checkAt > -1, `the check never ran. Log:\n${s.log.join('\n')}`);
  assert.ok(firstCopy > -1, 'nothing was copied, so the ordering claim is vacuous');
  assert.ok(checkAt < firstCopy,
    `THE ORDER IS THE FEATURE. Log was:\n${s.log.join('\n')}`);
});

test('CONTROL: a flow that copied BEFORE checking would be caught', async () => {
  // The defect, simulated: mutate first, discover the record is down after. It
  // still REPORTS a refusal — which is exactly why the assertions above are
  // about the log and not about the status.
  const log = ['copy:live->archive', 'recordCheck'];
  const r = { status: RESTORE.RECORD_UNREACHABLE };
  assert.equal(r.status, RESTORE.RECORD_UNREACHABLE, 'it still reports the refusal…');
  assert.notEqual(log.filter((l) => l.startsWith('copy:')).length, 0,
    '…while having already copied. The real test asserts zero copies');
  assert.ok(firstIndex(log, /^recordCheck$/) > firstIndex(log, /^copy:/),
    'and the ordering assertion rejects this log too');
});

test('a check that THROWS is a refusal, not a crash — still zero copies', async () => {
  // The real check talks to a network, so it throws as readily as it returns
  // false. Propagating would exit through main()'s catch with a stack trace
  // instead of the message an operator mid-incident needs.
  const s = spies({
    ensureRecordReachable: async () => { s.log.push('recordCheck'); throw new Error('ETIMEDOUT after 70s'); },
  });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RECORD_UNREACHABLE);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
  assert.match(r.error, /ETIMEDOUT after 70s/);
});

test('FAILS CLOSED: omitting the dependency entirely refuses, it does not skip the step', async () => {
  // The failure this defends against is a caller that simply forgets to wire
  // the check. Defaulting to "fine" would hand back the pre-fix behaviour with
  // every test in this file still green.
  const s = spies();
  delete s.deps.ensureRecordReachable;
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RECORD_UNREACHABLE);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
  assert.match(r.error, /ensureRecordReachable/,
    'the refusal must name the missing dependency, or a wiring mistake reads as an outage');
});

test('a DRY RUN does not need the record, and still writes nothing', async () => {
  // Deliberate: a dry run has nothing to be inconsistent with, and its whole
  // value is that it still works while the rest of the world is broken.
  const s = spies({
    ensureRecordReachable: async () => { s.log.push('recordCheck'); return { ok: false, error: 'down' }; },
  });
  const r = await run(s.deps, { commit: false });
  assert.equal(r.status, RESTORE.PLANNED);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
  assert.equal(firstIndex(s.log, /^recordCheck$/), -1,
    'the dry run must not even ask — it writes nothing either way');
});

// ── THE FALSE NEGATIVE — the bug this change exists to fix ──────────────────

test('stale reads for the WHOLE budget → not-yet-observable, and it RECORDS', async () => {
  // head().size agrees (the copy landed) but every public read returns the
  // pre-copy bytes. This is exactly what happened on 2026-08-10. The old code
  // called it corruption, refused to record, and exited 1.
  const s = spies({
    fetchFreshBytes: async (p) => {
      s.log.push(`fetch:${p}`);
      return p === LIVE ? SHA_OLD : SHA_WANTED;   // forever stale
    },
  });
  const { r, recordCount } = await runAndRecord(s.deps);

  assert.equal(r.status, RESTORE.RESTORED_UNOBSERVED);
  assert.equal(recordCount, 1, 'THE RECORD WAS SKIPPED — Blob and Mongo left inconsistent');
  assert.equal(restoreDidWrite(r.status), true);
  assert.ok(r.caveat, 'an operator needs to be told it is a cache, not a failure');
  assert.ok(r.observed.attempts > 1, 'it must actually retry, not give up on the first read');
  assert.equal(r.restoredSha256, SHA_OLD, 'it reports what it SAW, rather than hiding it');
});

test('CONTROL: a run that legitimately does NOT record', async () => {
  // Pairs with the case above: without a not-recorded case, "it records" would
  // pass for a composition that records unconditionally.
  const s = spies({ headArchive: async () => null });
  const { r, recordCount } = await runAndRecord(s.deps);
  assert.equal(r.status, RESTORE.ARCHIVE_MISSING);
  assert.equal(recordCount, 0);
});

// ── REAL failures: only head() may say so ───────────────────────────────────

test('head() finds NOTHING after the copy → real failure, record count 0', async () => {
  let copied = false;
  const s = spies({
    headLive: async (p) => {
      s.log.push(`headLive:${p}`);
      if (p === LIVE && copied) return null;      // vanished after the copy
      return s.objects.get(p) ?? null;
    },
    copy: async (from, to) => {
      s.log.push(`copy:${from}->${to}`);
      s.objects.set(to, { size: 1000 });
      s.hashes.set(to, s.hashes.get(from));
      if (from === SOURCE_ARCHIVE) copied = true;
    },
  });
  const { r, recordCount } = await runAndRecord(s.deps);
  assert.equal(r.status, RESTORE.RESTORE_NOT_PRESENT);
  assert.equal(recordCount, 0);
  assert.equal(restoreDidWrite(r.status), false);
});

test('head() reports the WRONG SIZE → real failure, record count 0', async () => {
  const s = spies({
    copy: async (from, to) => {
      s.log.push(`copy:${from}->${to}`);
      // ONLY the restore copy lands truncated. Truncating the safety archive
      // too would trip archiveCurrentObject's own size check first and this
      // case would never reach the step it is meant to exercise.
      s.objects.set(to, { size: from === SOURCE_ARCHIVE ? 7 : 1000 });
      s.hashes.set(to, s.hashes.get(from));
    },
  });
  const { r, recordCount } = await runAndRecord(s.deps);
  assert.equal(r.status, RESTORE.RESTORE_SIZE_MISMATCH);
  assert.equal(r.restoredBytes, 7);
  assert.equal(recordCount, 0, 'a size disagreement is authoritative — it must not record');
});

// ── the budget is a window, not a verdict ───────────────────────────────────

test('MATCH INSIDE THE BUDGET: first read stale, second matches → verified', async () => {
  // Without this, "it stopped waiting" would pass for a flow that never
  // verifies at all.
  // The counter must only see reads made by the POLL. The flow also reads the
  // live key during its pre-measurement, and counting that one would consume
  // the "first attempt" before the poll ever started.
  let copied = false;
  let pollReads = 0;
  const s = spies({
    copy: async (from, to) => {
      s.log.push(`copy:${from}->${to}`);
      s.objects.set(to, { size: 1000 });
      s.hashes.set(to, s.hashes.get(from));
      if (from === SOURCE_ARCHIVE) copied = true;
    },
    fetchFreshBytes: async (p) => {
      s.log.push(`fetch:${p}`);
      if (p !== LIVE || !copied) return s.hashes.get(p);
      pollReads += 1;
      return pollReads <= 1 ? SHA_OLD : SHA_WANTED;   // catches up on the 2nd look
    },
  });
  const { r, recordCount } = await runAndRecord(s.deps);
  assert.equal(r.status, RESTORE.RESTORED_VERIFIED);
  assert.equal(r.restoredSha256, SHA_WANTED);
  assert.equal(recordCount, 1);
  assert.ok(r.observed.attempts >= 2, 'it should have needed a second look');
});

test('the observe budget is anchored, and short because head() already decided', async () => {
  assert.equal(WEBROOT_RESTORE_OBSERVE_BUDGET_MS, 30_000);
  assert.ok(WEBROOT_RESTORE_OBSERVE_BUDGET_MS > 10_800 * 2,
    'real headroom over the ~10.8 s anchor, or normal restores report a caveat');
  assert.ok(WEBROOT_RESTORE_OBSERVE_BUDGET_MS < 60_000,
    'shorter than the browser budget: head() has already settled success, so a '
    + 'longer wait buys only a nicer message at the cost of refetching the object');
});

test('the enum has NO failure-from-absence member', async () => {
  // The structural expression of the rule. If someone reintroduces
  // `restore-unverified`, this is what says so.
  assert.equal('RESTORE_UNVERIFIED' in RESTORE, false,
    'a failure-from-absence status is back. One PoP cannot observe corruption; '
    + 'only head() disagreeing is a real failure');
  assert.equal(restoreDidWrite(RESTORE.RESTORED_VERIFIED), true);
  assert.equal(restoreDidWrite(RESTORE.RESTORED_UNOBSERVED), true);
  for (const s of [RESTORE.RESTORE_FAILED, RESTORE.RESTORE_NOT_PRESENT,
    RESTORE.RESTORE_SIZE_MISMATCH, RESTORE.ARCHIVE_MISSING, RESTORE.PLANNED,
    RESTORE.RECORD_UNREACHABLE]) {
    assert.equal(restoreDidWrite(s), false, `${s} must not record`);
  }
});

// ── EQUAL LENGTH, DIFFERENT CONTENT — real data made this necessary ─────────

test('two payloads of IDENTICAL length but different content: size cannot separate them, the hash can', async () => {
  // Not hypothetical: webroot-archive/ holds two archives of exactly 1,885,334
  // bytes whose contents had to be told apart by sha256 alone.
  const SHA_A = 'a'.repeat(64);
  const SHA_B = 'b'.repeat(64);
  assert.equal(SHA_A.length, SHA_B.length, 'the fixture must be equal-length');
  assert.notEqual(SHA_A, SHA_B, 'and different, or it tests nothing');

  const s = spies();
  s.hashes.set(SOURCE_ARCHIVE, SHA_A);
  const wrong = spies({
    // The copy "succeeds", lands the right NUMBER of bytes, and they are the
    // wrong bytes.
    copy: async (from, to) => {
      wrong.log.push(`copy:${from}->${to}`);
      wrong.objects.set(to, { size: 1000 });
      wrong.hashes.set(to, to === LIVE ? SHA_B : wrong.hashes.get(from));
    },
  });
  wrong.hashes.set(SOURCE_ARCHIVE, SHA_A);

  const r = await run(wrong.deps);

  // head() agrees, because the sizes ARE equal — the size check is blind here.
  assert.equal(wrong.objects.get(LIVE).size, wrong.objects.get(SOURCE_ARCHIVE).size);
  // The hash is what notices, and it is surfaced.
  assert.equal(r.sourceSha256, SHA_A);
  assert.equal(r.restoredSha256, SHA_B);
  assert.notEqual(r.restoredSha256, r.sourceSha256);
  // …and the VERDICT is deliberately not "corrupt". RULED: from one PoP this is
  // indistinguishable from staleness, so it reports the absence and records,
  // rather than accusing the store of corruption it cannot demonstrate.
  assert.equal(r.status, RESTORE.RESTORED_UNOBSERVED);
});

// ── the guards that run before any I/O ──────────────────────────────────────

test('a source archive that does not exist is refused before ANY copy', async () => {
  const s = spies({ headArchive: async () => null });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.ARCHIVE_MISSING);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
});

test('CONTROL: the same fixture WITH the archive present proceeds', async () => {
  const s = spies();
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RESTORED_VERIFIED);
  assert.ok(s.log.filter((l) => l.startsWith('copy:')).length >= 2);
});

test('the safety archive FAILS → the live key is never overwritten', async () => {
  let copies = 0;
  const s = spies({
    copy: async (from) => {
      copies += 1;
      if (from === LIVE) throw new Error('blob copy exploded');
    },
  });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.SAFETY_ARCHIVE_FAILED);
  assert.equal(copies, 1, 'THE RESTORE COPY RAN DESPITE AN UNARCHIVED LIVE OBJECT');
});

test('the safety archive cannot be VERIFIED → nothing is restored', async () => {
  const s = spies({ headArchive: async (p) => (p === SOURCE_ARCHIVE ? { size: 1000 } : null) });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.SAFETY_ARCHIVE_UNVERIFIED);
  assert.equal(s.log.filter((l) => l.startsWith(`copy:${SOURCE_ARCHIVE}`)).length, 0);
});

test('a missing LIVE object is refused — there would be nothing to protect', async () => {
  const s = spies({ headLive: async () => null });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.LIVE_MISSING);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
});

test('a filename outside the frozen three is refused before any I/O', async () => {
  const s = spies();
  const r = await runRestoreFlow(
    { filename: 'evil.pdf', archivePathname: SOURCE_ARCHIVE, stamp: STAMP, commit: true }, s.deps,
  );
  assert.equal(r.status, RESTORE.REFUSED_NAME);
  assert.deepEqual(s.log, []);
});

test('an archive key belonging to a DIFFERENT document is refused', async () => {
  const s = spies();
  const foreign = webrootArchivePathname(WEBROOT_DOCUMENTS[0], '2026-08-01T00-00-00Z');
  const r = await run(s.deps, { archivePathname: foreign });
  assert.equal(r.status, RESTORE.REFUSED_ARCHIVE_KEY);
  assert.deepEqual(s.log, []);
});

test('an arbitrary Blob key is refused', async () => {
  const s = spies();
  for (const bad of ['some-other-prefix/x.pdf', `webroot-documents/${FILE}`, '../etc/passwd', '']) {
    const r = await run(s.deps, { archivePathname: bad });
    assert.equal(r.status, RESTORE.REFUSED_ARCHIVE_KEY, `${bad} was not refused`);
  }
  assert.deepEqual(s.log, []);
});

test('CONTROL: the key check accepts THIS document\'s own archives', () => {
  assert.equal(isArchiveKeyFor(FILE, SOURCE_ARCHIVE), true);
  assert.equal(isArchiveKeyFor(FILE, webrootArchivePathname(FILE, 'another-stamp')), true);
  assert.equal(isArchiveKeyFor(FILE, webrootArchivePathname(WEBROOT_DOCUMENTS[0], 's')), false);
});

// ── dry run writes nothing ──────────────────────────────────────────────────

test('without commit NOTHING is written, and the plan is still reported', async () => {
  const s = spies();
  const { r, recordCount } = await runAndRecord(s.deps, { commit: false });
  assert.equal(r.status, RESTORE.PLANNED);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
  assert.equal(recordCount, 0);
  assert.equal(r.liveSha256, SHA_OLD);
  assert.equal(r.sourceSha256, SHA_WANTED);
  assert.equal(r.alreadyIdentical, false);
});

test('CONTROL: with commit the copy spy DOES fire on the same fixture', async () => {
  const s = spies();
  await run(s.deps, { commit: true });
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 2);
});

test('a dry run says so when the archive and the live object are already identical', async () => {
  const s = spies();
  s.hashes.set(LIVE, SHA_WANTED);
  const r = await run(s.deps, { commit: false });
  assert.equal(r.alreadyIdentical, true);
});

// ── the rehearsal seam ──────────────────────────────────────────────────────

test('resolveTarget redirects the flow for rehearsal, and the key check still applies', async () => {
  const scratchName = 'rehearsal-abc.pdf';
  const scratchLive = 'webroot-rehearsal/abc/live.pdf';
  const scratchArchive = webrootArchivePathname(scratchName, '2026-01-01');
  const objects = new Map([[scratchLive, { size: 5 }], [scratchArchive, { size: 5 }]]);
  const hashes = new Map([[scratchLive, SHA_OLD], [scratchArchive, SHA_WANTED]]);
  let clock = 0;
  const deps = {
    resolveTarget: () => ({ ok: true, filename: scratchName, blobPathname: scratchLive, publicPath: '/x' }),
    headLive: async (p) => objects.get(p) ?? null,
    headArchive: async (p) => objects.get(p) ?? null,
    copy: async (from, to) => { objects.set(to, objects.get(from)); hashes.set(to, hashes.get(from)); },
    fetchFreshBytes: async (p) => hashes.get(p) ?? null,
    sha256: (v) => v,
    ensureRecordReachable: async () => ({ ok: true }),
    nowMs: () => clock,
    wait: async (ms) => { clock += ms; },
  };

  const ok = await runRestoreFlow(
    { filename: scratchName, archivePathname: scratchArchive, stamp: STAMP, commit: true }, deps,
  );
  assert.equal(ok.status, RESTORE.RESTORED_VERIFIED);

  const refused = await runRestoreFlow(
    { filename: scratchName, archivePathname: 'anywhere/else.pdf', stamp: STAMP, commit: true }, deps,
  );
  assert.equal(refused.status, RESTORE.REFUSED_ARCHIVE_KEY,
    'the seam must not switch the archive-key check off');
});
