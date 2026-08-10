#!/usr/bin/env node
/**
 * REHEARSE THE RESTORE AGAINST REAL BLOB, ON SCRATCH OBJECTS ONLY.
 *
 * ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 *
 * scripts/restore-webroot-document.mjs is unproven until it has actually moved
 * bytes. The pure tests prove the ORDERING with fakes; they cannot prove that
 * @vercel/blob's copy/head behave the way the flow assumes, or that a restored
 * object really hashes to the archive it came from.
 *
 * So this drives the SAME `runRestoreFlow` with the SAME real Blob deps, and
 * differs in exactly one place: `resolveTarget` points at a scratch pathname
 * under `webroot-rehearsal/` instead of one of the three real documents. That
 * override is the reason the seam exists, and
 * test/fs/webrootRestoreScriptWiring.test.mjs asserts the production script
 * does not use it.
 *
 * ══ WHAT IT PROVES, IN ORDER ════════════════════════════════════════════════
 *
 *   1. create scratch v1, hash it
 *   2. overwrite with v2 — DIFFERENT CONTENT, IDENTICAL BYTE LENGTH. That is
 *      the case a content-length check passes and a hash check catches, and it
 *      is the whole reason the verification is a hash.
 *   3. restore v1 through the real flow
 *   4. assert the live object hashes to v1 AND that an archive of v2 now
 *      exists — §2's rule actually holding, not merely being coded
 *   5. delete every scratch object and confirm each is gone with head()
 *
 * NOTHING under webroot-documents/ is read, written or listed. The scratch
 * objects live under `webroot-rehearsal/<run>/`; the safety archives the flow
 * makes land under `webroot-archive/<scratch name>/`, which has no rewrite
 * pointing at it and is deleted here too.
 *
 * Usage:
 *   node --env-file=.env.local scripts/_rehearse-webroot-restore.mjs
 */

import { createHash, randomUUID } from 'node:crypto';
import { copy, del, head, put } from '@vercel/blob';

import { webrootArchivePathname } from '../src/lib/webrootDocuments.mjs';
import { RESTORE, restoreDidWrite, runRestoreFlow } from '../src/lib/webroot/restoreFlow.mjs';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) { console.error('✖ BLOB_READ_WRITE_TOKEN not set — pass --env-file=.env.local'); process.exit(1); }

const RUN = randomUUID().slice(0, 8);
/** A name that could never be mistaken for one of the three. */
const SCRATCH_NAME = `rehearsal-${RUN}.pdf`;
const SCRATCH_LIVE = `webroot-rehearsal/${RUN}/live.pdf`;

const created = new Set();
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const ok = (b) => (b ? '✓' : '✖');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`   ${ok(condition)} ${label}${detail ? ` — ${detail}` : ''}`);
}

const headOrNull = async (p) => { try { return await head(p, { token: TOKEN }); } catch { return null; } };

/** A NEW nonce on EVERY call — see the contract note in restoreFlow.mjs step 7b. */
async function fetchFresh(pathname) {
  const meta = await head(pathname, { token: TOKEN });
  const bust = `${meta.url}${meta.url.includes('?') ? '&' : '?'}__verify=${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const res = await fetch(bust, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} reading ${pathname}`);
  return Buffer.from(await res.arrayBuffer());
}

const hashOf = async (pathname) => sha(await fetchFresh(pathname));

/**
 * `allowOverwrite: true` is REQUIRED, and finding that out here is part of the
 * point of rehearsing: without it @vercel/blob refuses a second put at the same
 * pathname ("This blob already exists"). The upload route passes the same flag
 * for the same reason — these objects are served from a FIXED key, so every
 * replacement is an overwrite by construction.
 */
async function putScratch(pathname, buf) {
  await put(pathname, buf, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/pdf',
    token: TOKEN,
  });
  created.add(pathname);
}

console.log('');
console.log('══ REHEARSAL — restore, on scratch objects only ═════════════════════════');
console.log(`   run          : ${RUN}`);
console.log(`   scratch live : ${SCRATCH_LIVE}`);
console.log('   NOTHING under webroot-documents/ is touched.');
console.log('');

try {
  // ── 1. v1 ───────────────────────────────────────────────────────────────
  const v1 = Buffer.from(`%PDF-1.4 REHEARSAL v1 ${RUN} ${'A'.repeat(512)}\n`);
  const v1sha = sha(v1);
  await putScratch(SCRATCH_LIVE, v1);
  console.log(`1. created v1  ${v1.length} bytes  sha256 ${v1sha}`);

  // Archive v1 the way a replacement would, so there is something to restore.
  const v1Archive = webrootArchivePathname(SCRATCH_NAME, '2026-08-10T00-00-00Z');
  await copy(SCRATCH_LIVE, v1Archive, { access: 'public', addRandomSuffix: false, token: TOKEN });
  created.add(v1Archive);
  console.log(`   archived v1 to ${v1Archive}`);

  // ── 2. v2 — different content, IDENTICAL LENGTH ─────────────────────────
  const v2 = Buffer.from(`%PDF-1.4 REHEARSAL v2 ${RUN} ${'B'.repeat(512)}\n`);
  const v2sha = sha(v2);
  check('v2 is the SAME LENGTH as v1', v1.length === v2.length, `${v1.length} vs ${v2.length}`);
  check('v2 has DIFFERENT content', v1sha !== v2sha);
  await putScratch(SCRATCH_LIVE, v2);
  const liveAfterV2 = await hashOf(SCRATCH_LIVE);
  check('the live object now serves v2', liveAfterV2 === v2sha, liveAfterV2);
  console.log(`2. overwrote with v2  ${v2.length} bytes  sha256 ${v2sha}`);

  // ── 3. restore v1 through the real flow ─────────────────────────────────
  console.log('3. restoring v1 through runRestoreFlow (commit)…');
  const result = await runRestoreFlow(
    {
      filename: SCRATCH_NAME,
      archivePathname: v1Archive,
      stamp: '2026-08-10T05-00-00Z',
      commit: true,
    },
    {
      // THE ONE DIFFERENCE from production. See the header.
      resolveTarget: () => ({
        ok: true, filename: SCRATCH_NAME, blobPathname: SCRATCH_LIVE, publicPath: `/${SCRATCH_NAME}`,
      }),
      headLive: headOrNull,
      headArchive: headOrNull,
      copy: async (from, to) => {
        await copy(from, to, { access: 'public', addRandomSuffix: false, token: TOKEN });
        created.add(to);
      },
      fetchFreshBytes: fetchFresh,
      sha256: sha,
      nowMs: () => Date.now(),
      wait: (ms) => new Promise((r) => { setTimeout(r, ms); }),
    },
  );

  console.log(`   status: ${result.status}`);
  check('the flow reports a written restore', restoreDidWrite(result.status), result.status + ' ' + (result.error ?? ''));
  if (result.status === RESTORE.RESTORED_UNOBSERVED) console.log('   (verified by head(); this PoP had not caught up — not a failure)');

  // ── 4. the assertions that matter ───────────────────────────────────────
  const liveNow = await hashOf(SCRATCH_LIVE);
  check('the live object now hashes to v1', liveNow === v1sha, liveNow);
  check('...and NOT to v2', liveNow !== v2sha);

  const safety = result.safetyArchivePathname;
  const safetyMeta = safety ? await headOrNull(safety) : null;
  check('a safety archive of v2 EXISTS', Boolean(safetyMeta), safety ?? '(none)');
  if (safetyMeta) {
    const safetySha = await hashOf(safety);
    check('the safety archive holds v2, not v1', safetySha === v2sha, safetySha);
    check('§2 HOLDS: the bytes destroyed by the restore are recoverable', safetySha === v2sha);
  }

  // The length-vs-content point, made explicit on real objects.
  check(
    'v1 and v2 are indistinguishable by LENGTH alone',
    (await headOrNull(SCRATCH_LIVE))?.size === v2.length,
    'a content-length check would have called this restore a no-op',
  );
} catch (err) {
  failures += 1;
  console.error(`✖ rehearsal threw: ${err?.stack ?? err}`);
} finally {
  // ── 5. delete everything, and CONFIRM ───────────────────────────────────
  console.log('');
  console.log('5. cleanup — deleting every scratch object and confirming with head()');
  for (const pathname of created) {
    try { await del(pathname, { token: TOKEN }); } catch (err) {
      console.log(`   ✖ delete failed for ${pathname} — ${err?.message ?? err}`);
      failures += 1;
      continue;
    }
    const still = await headOrNull(pathname);
    check(`gone: ${pathname}`, still === null, still ? `STILL PRESENT (${still.size} bytes)` : '');
  }

  console.log('');
  console.log(failures === 0
    ? '══ REHEARSAL PASSED. Every scratch object deleted and confirmed gone. ═══'
    : `══ REHEARSAL had ${failures} failure(s) — read the ✖ lines above. ═══`);
  console.log('');
  process.exit(failures === 0 ? 0 : 1);
}
