import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESTORE, isArchiveKeyFor, runRestoreFlow, webrootArchiveDirFor,
} from '@/lib/webroot/restoreFlow.mjs';
import { WEBROOT_DOCUMENTS, webrootArchivePathname } from '@/lib/webrootDocuments.mjs';

/**
 * A RESTORE IS ITSELF AN OVERWRITE, so the claims that matter are negative and
 * about ORDER: that nothing is copied over the live key until the bytes it
 * would destroy are archived AND that archive is verified.
 *
 * Every case records WHICH dependency was called and IN WHAT ORDER, because
 * "we archive first" is an argument and a call log is evidence.
 */

const FILE = WEBROOT_DOCUMENTS[1];
const LIVE = `webroot-documents/${FILE}`;
const STAMP = '2026-08-10T04-00-00Z';
const SOURCE_ARCHIVE = webrootArchivePathname(FILE, '2026-08-01T00-00-00Z');

const SHA_OLD = '1'.repeat(64);
const SHA_WANTED = '2'.repeat(64);

/**
 * Dependencies that record every call in one ordered log.
 *
 * `hashes` maps pathname → hash and is MUTATED by a successful copy, so the
 * flow's own verification reads what the copy actually did rather than what the
 * fixture wishes had happened.
 */
function spies(overrides = {}) {
  const log = [];
  const objects = new Map([
    [LIVE, { size: 1000 }],
    [SOURCE_ARCHIVE, { size: 1000 }],
  ]);
  const hashes = new Map([[LIVE, SHA_OLD], [SOURCE_ARCHIVE, SHA_WANTED]]);
  const base = {
    headLive: async (p) => { log.push(`headLive:${p}`); return objects.get(p) ?? null; },
    headArchive: async (p) => { log.push(`headArchive:${p}`); return objects.get(p) ?? null; },
    copy: async (from, to) => {
      log.push(`copy:${from}->${to}`);
      objects.set(to, { ...(objects.get(from) ?? { size: 1000 }) });
      hashes.set(to, hashes.get(from));
    },
    hash: async (p) => { log.push(`hash:${p}`); return hashes.get(p) ?? null; },
  };
  return { log, objects, hashes, deps: { ...base, ...overrides } };
}

const run = (deps, over = {}) => runRestoreFlow(
  { filename: FILE, archivePathname: SOURCE_ARCHIVE, stamp: STAMP, commit: true, ...over }, deps,
);

const firstIndex = (log, re) => log.findIndex((l) => re.test(l));

// ── the happy path, so the refusals mean something ──────────────────────────

test('the happy path archives the current object, verifies it, THEN restores', async () => {
  const s = spies();
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RESTORED);
  assert.equal(r.restoredSha256, SHA_WANTED);
  assert.equal(r.previousSha256, SHA_OLD);
  assert.ok(r.safetyArchivePathname.startsWith(`${webrootArchiveDirFor(FILE)}/`));

  const safetyCopy = firstIndex(s.log, new RegExp(`^copy:${LIVE}->`));
  const restoreCopy = firstIndex(s.log, new RegExp(`^copy:${SOURCE_ARCHIVE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}->`));
  assert.ok(safetyCopy > -1, 'the current object was never archived');
  assert.ok(restoreCopy > -1, 'nothing was restored');
  assert.ok(safetyCopy < restoreCopy,
    'THE ORDER IS THE FEATURE: the safety archive must be copied before the '
    + `restore overwrites the live key. Log was:\n${s.log.join('\n')}`);
});

// ── THE CLAIM: no restore without a verified safety archive ─────────────────

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
  // The copy call succeeds and the object is simply not there afterwards.
  const s = spies({ headArchive: async (p) => (p === SOURCE_ARCHIVE ? { size: 1000 } : null) });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.SAFETY_ARCHIVE_UNVERIFIED);
  assert.equal(s.log.filter((l) => l.startsWith(`copy:${SOURCE_ARCHIVE}`)).length, 0,
    'a successful copy CALL is not a copy, and the restore proceeded anyway');
});

// ── never copy blind ────────────────────────────────────────────────────────

test('a source archive that does not exist is refused before ANY copy', async () => {
  const s = spies({ headArchive: async () => null });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.ARCHIVE_MISSING);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
});

test('CONTROL: the same fixture WITH the archive present proceeds', async () => {
  // Without this, "archive missing → refused" would pass for a flow that
  // refuses everything.
  const s = spies();
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RESTORED);
  assert.ok(s.log.filter((l) => l.startsWith('copy:')).length >= 2);
});

test('a missing LIVE object is refused — there would be nothing to protect', async () => {
  const s = spies({ headLive: async () => null });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.LIVE_MISSING);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0);
});

// ── the target is derived, never typed ──────────────────────────────────────

test('a filename outside the frozen three is refused before any I/O', async () => {
  const s = spies();
  const r = await runRestoreFlow(
    { filename: 'evil.pdf', archivePathname: SOURCE_ARCHIVE, stamp: STAMP, commit: true }, s.deps,
  );
  assert.equal(r.status, RESTORE.REFUSED_NAME);
  assert.deepEqual(s.log, [], 'it touched the store before deciding the name was legal');
});

test('an archive key belonging to a DIFFERENT document is refused', async () => {
  // The typo that matters: a real archive, a real target, and they are not each
  // other's. Reaching the copy would write one document over another.
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

test('CONTROL: the key check accepts THIS document\'s own archives', async () => {
  // Otherwise every refusal above would pass for a check that rejects everything.
  assert.equal(isArchiveKeyFor(FILE, SOURCE_ARCHIVE), true);
  assert.equal(isArchiveKeyFor(FILE, webrootArchivePathname(FILE, 'another-stamp')), true);
  assert.equal(isArchiveKeyFor(FILE, webrootArchivePathname(WEBROOT_DOCUMENTS[0], 's')), false);
});

// ── verification is by CONTENT ──────────────────────────────────────────────

test('a copy that lands the WRONG bytes at the SAME LENGTH is caught', async () => {
  // The case a content-length check passes. The copy "succeeds" and the object
  // is the right size — and it is the wrong file.
  const s = spies({
    copy: async (from, to) => {
      s.log.push(`copy:${from}->${to}`);
      s.objects.set(to, { size: 1000 });
      // same length, different content
      s.hashes.set(to, to === LIVE ? '9'.repeat(64) : s.hashes.get(from));
    },
  });
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RESTORE_UNVERIFIED);
  assert.equal(r.restoredSha256, '9'.repeat(64));
  assert.equal(r.sourceSha256, SHA_WANTED);
  assert.equal(s.objects.get(LIVE).size, s.objects.get(SOURCE_ARCHIVE).size,
    'the fixture must match on LENGTH, or this is not the case being tested');
});

test('CONTROL: the correct copy verifies clean on the same fixture shape', async () => {
  const s = spies();
  const r = await run(s.deps);
  assert.equal(r.status, RESTORE.RESTORED);
  assert.equal(r.restoredSha256, r.sourceSha256);
});

// ── dry run writes nothing ──────────────────────────────────────────────────

test('without commit NOTHING is written, and the plan is still reported', async () => {
  const s = spies();
  const r = await run(s.deps, { commit: false });
  assert.equal(r.status, RESTORE.PLANNED);
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 0, 'a dry run copied something');
  assert.equal(r.liveSha256, SHA_OLD);
  assert.equal(r.sourceSha256, SHA_WANTED);
  assert.equal(r.alreadyIdentical, false);
});

test('CONTROL: with commit the write spy DOES fire on the same fixture', async () => {
  // The zero above is only meaningful if the same setup can produce copies.
  const s = spies();
  await run(s.deps, { commit: true });
  assert.equal(s.log.filter((l) => l.startsWith('copy:')).length, 2,
    'the copy spy does not record, so the dry-run zero proves nothing');
});

test('a dry run says so when the archive and the live object are already identical', async () => {
  const s = spies();
  s.hashes.set(LIVE, SHA_WANTED);
  const r = await run(s.deps, { commit: false });
  assert.equal(r.status, RESTORE.PLANNED);
  assert.equal(r.alreadyIdentical, true, 'restoring identical bytes changes nothing and should say so');
});

// ── the rehearsal seam ──────────────────────────────────────────────────────

test('resolveTarget can redirect the flow for rehearsal, and the key check still applies', async () => {
  // The seam exists so this flow can move real bytes against a scratch pathname
  // without touching any of the three. It must NOT become a way to disable the
  // archive-key check — the check derives from whatever name it is given.
  const scratchName = 'rehearsal-abc.pdf';
  const scratchTarget = {
    ok: true, filename: scratchName, blobPathname: 'webroot-rehearsal/abc/live.pdf', publicPath: '/x',
  };
  const scratchArchive = webrootArchivePathname(scratchName, '2026-01-01');
  const objects = new Map([['webroot-rehearsal/abc/live.pdf', { size: 5 }], [scratchArchive, { size: 5 }]]);
  const hashes = new Map([['webroot-rehearsal/abc/live.pdf', SHA_OLD], [scratchArchive, SHA_WANTED]]);
  const deps = {
    resolveTarget: () => scratchTarget,
    headLive: async (p) => objects.get(p) ?? null,
    headArchive: async (p) => objects.get(p) ?? null,
    copy: async (from, to) => { objects.set(to, objects.get(from)); hashes.set(to, hashes.get(from)); },
    hash: async (p) => hashes.get(p) ?? null,
  };

  const ok = await runRestoreFlow(
    { filename: scratchName, archivePathname: scratchArchive, stamp: STAMP, commit: true }, deps,
  );
  assert.equal(ok.status, RESTORE.RESTORED);

  const refused = await runRestoreFlow(
    { filename: scratchName, archivePathname: 'anywhere/else.pdf', stamp: STAMP, commit: true }, deps,
  );
  assert.equal(refused.status, RESTORE.REFUSED_ARCHIVE_KEY,
    'the seam must not switch the archive-key check off');
});
