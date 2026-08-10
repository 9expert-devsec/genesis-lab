/**
 * PUT A PREVIOUS EDITION BACK. The ordering, as a testable function.
 *
 * ══ A RESTORE IS ITSELF AN OVERWRITE ════════════════════════════════════════
 *
 * Blob keeps ONE version per pathname. Copying an archive onto the live key
 * destroys whatever is there now — so a restore that does not archive first
 * has not fixed the hole this phase exists to close, it has moved it. Restoring
 * the WRONG edition would then be unrecoverable, and the wrong edition is
 * exactly what an operator picks when they are rolling back in a hurry.
 *
 * So the order is fixed and every step gates the next:
 *
 *   1. derive the target from a NAME (never a path)
 *   2. refuse an archive key that does not belong to that name
 *   3. head() the SOURCE archive — never copy blind
 *   4. head() the live object, so there is something to protect
 *   5. archive the CURRENT bytes and VERIFY that archive          ← §2's rule
 *   6. only then copy the source archive over the live key
 *   7. VERIFY BY HASH, not by length
 *
 * ══ WHY NOT JUST REUSE runReplaceFlow ═══════════════════════════════════════
 *
 * Steps 1, 4 and 5 are literally what replacing does, and they ARE shared —
 * `archiveCurrentObject` in ./replaceFlow.mjs is the same code, called by both.
 * What is NOT shared is the rest, and forcing it would have distorted three
 * things:
 *
 *   · `authorise` is documented as "reaching this step IS the authorisation".
 *     Passing a restore-performing callback would make the function whose whole
 *     purpose is "no token without a backup" sometimes mean "overwrite the live
 *     object", and step 6's assertions — whose failure messages read A TOKEN WAS
 *     ISSUED DESPITE A FAILED ARCHIVE — would stop describing what they guard.
 *   · `refuseWebrootSize` is a tripwire about the file an ADMIN PICKED: is this
 *     the wrong file? A restore has no incoming file. Its size is an archive's,
 *     which by construction already passed that cap on the day it was made.
 *   · replace verifies the ARCHIVE by size, which is the cheapest evidence that
 *     a copy happened at all. Restore must verify the RESTORED OBJECT by
 *     sha256, because the whole risk here is a wrong version — and a wrong
 *     version can share a byte length with the right one.
 *
 * ══ NO RECEIPT HERE, DELIBERATELY ═══════════════════════════════════════════
 *
 * The receipt gate exists because a BROWSER can call the upload route, and a
 * browser is not trusted to say which document it is replacing. This runs
 * server-side, from a shell, holding the store credentials already. Adding a
 * receipt would be ceremony that protects nothing: whoever can run this can
 * mint receipts. The ARCHIVE gate still applies, for the reason at the top —
 * that one is not about trust, it is about Blob keeping one version.
 */

import { webrootArchivePathname, webrootUploadTarget } from '../webrootDocuments.mjs';
import { ARCHIVE_STEP, archiveCurrentObject } from './replaceFlow.mjs';

/** Outcomes, so a caller branches on a value rather than on a message. */
export const RESTORE = {
  REFUSED_NAME: 'refused-name',
  REFUSED_ARCHIVE_KEY: 'refused-archive-key',
  ARCHIVE_MISSING: 'archive-missing',
  LIVE_MISSING: 'live-missing',
  SAFETY_ARCHIVE_FAILED: 'safety-archive-failed',
  SAFETY_ARCHIVE_UNVERIFIED: 'safety-archive-unverified',
  /** Dry run. Everything was READ, nothing was written. */
  PLANNED: 'planned',
  RESTORE_FAILED: 'restore-failed',
  RESTORE_UNVERIFIED: 'restore-unverified',
  RESTORED: 'restored',
};

/**
 * The directory every archive of `filename` lives under.
 *
 * DERIVED by calling the same builder the archive step uses and dropping the
 * leaf, rather than re-composing `${PREFIX}/${base}` here. A second
 * construction of the same key is a second thing to keep in agreement, and this
 * one would fail OPEN — it decides which keys an operator may copy FROM.
 */
export function webrootArchiveDirFor(filename) {
  return webrootArchivePathname(filename, 'x').replace(/\/[^/]*$/, '');
}

/** Is this archive key one of `filename`'s own archives? */
export function isArchiveKeyFor(filename, archivePathname) {
  const key = String(archivePathname ?? '');
  return key.startsWith(`${webrootArchiveDirFor(filename)}/`);
}

/**
 * Run the restore. `deps` are all async:
 *
 *   headLive(blobPathname)    → { size } | null   the object being overwritten
 *   headArchive(pathname)     → { size } | null   both the SOURCE archive and
 *                                                 the verification of the new one
 *   copy(from, to)            → whatever
 *   hash(pathname)            → sha256 hex        content, never length
 *
 * `resolveTarget` is overridable ONLY so this flow can be rehearsed end to end
 * against a scratch pathname without touching any of the three real documents —
 * the same affordance, and the same rule, as `--backup-collection` in
 * scripts/rewrite-legacy-references.mjs. PRODUCTION MUST NEVER PASS IT, and
 * test/fs/webrootRestoreScriptWiring.test.mjs asserts the operator script does
 * not.
 *
 * Returns `{ status, ... }`. Only `restored` means bytes moved.
 */
export async function runRestoreFlow(
  { filename, archivePathname, stamp, commit = false },
  deps,
) {
  const {
    headLive, headArchive, copy, hash, resolveTarget = webrootUploadTarget,
  } = deps;

  // ── 1. the target comes from a NAME ─────────────────────────────────────
  const target = resolveTarget(filename);
  if (!target?.ok) return { status: RESTORE.REFUSED_NAME, error: target?.reason ?? 'unknown document' };

  // ── 2. and the source must be one of THAT name's archives ───────────────
  //
  // The operator picks from a listing, so this should never fire — which is
  // why it is here. A typo that reached the copy would read an arbitrary Blob
  // key and write it over a document the whole site serves.
  // Derived from `target.filename`, which is what the archive step itself uses,
  // so the check cannot disagree with the keys this system writes. It holds
  // under the rehearsal seam too — the derivation is a function of the name,
  // whatever the name is — so there is no case in which it is skipped.
  if (!isArchiveKeyFor(target.filename, archivePathname)) {
    return {
      status: RESTORE.REFUSED_ARCHIVE_KEY,
      error: `"${archivePathname}" ไม่ใช่ไฟล์สำรองของ ${target.filename} `
        + `— ต้องอยู่ใต้ ${webrootArchiveDirFor(target.filename)}/`,
    };
  }

  // ── 3. never copy blind ─────────────────────────────────────────────────
  let source = null;
  try {
    source = await headArchive(archivePathname);
  } catch {
    source = null;
  }
  if (!source) {
    return { status: RESTORE.ARCHIVE_MISSING, error: `ไม่พบไฟล์สำรองที่ ${archivePathname}` };
  }

  // ── 4. and there must be something to protect ───────────────────────────
  let live = null;
  try {
    live = await headLive(target.blobPathname);
  } catch {
    live = null;
  }
  if (!live) {
    // Deliberately a refusal rather than a convenience. A missing live object
    // means the document is not being served AT ALL, which is a different
    // incident from "the wrong edition is being served" — and it means step 5
    // has nothing to archive, so the safety net would be silently absent on the
    // one run where it mattered most.
    return {
      status: RESTORE.LIVE_MISSING,
      error: `ไม่พบไฟล์ปัจจุบันที่ ${target.blobPathname} — `
        + 'เอกสารนี้ไม่ได้ถูกให้บริการอยู่ ตรวจสอบก่อน อย่าเพิ่งกู้คืนทับ',
    };
  }

  const sourceSha256 = await hash(archivePathname);
  const liveSha256 = await hash(target.blobPathname);

  // ── DRY RUN STOPS HERE, having written nothing ──────────────────────────
  if (!commit) {
    return {
      status: RESTORE.PLANNED,
      target,
      archivePathname,
      sourceSha256,
      liveSha256,
      sourceBytes: Number(source.size),
      previousBytes: Number(live.size),
      alreadyIdentical: sourceSha256 === liveSha256,
    };
  }

  // ── 5. THE RULE: protect what is there now, and prove it ────────────────
  const safe = await archiveCurrentObject({ target, stamp }, { headLive, copy, headArchive });
  if (!safe.ok) {
    return {
      status: safe.reason === ARCHIVE_STEP.ARCHIVE_FAILED
        ? RESTORE.SAFETY_ARCHIVE_FAILED
        : (safe.reason === ARCHIVE_STEP.LIVE_MISSING ? RESTORE.LIVE_MISSING : RESTORE.SAFETY_ARCHIVE_UNVERIFIED),
      error: safe.error,
      safetyArchivePathname: safe.archivePathname,
    };
  }

  // ── 6. only now ─────────────────────────────────────────────────────────
  try {
    await copy(archivePathname, target.blobPathname);
  } catch (err) {
    return {
      status: RESTORE.RESTORE_FAILED,
      error: `กู้คืนไม่สำเร็จ — ${err?.message ?? err}`,
      safetyArchivePathname: safe.archivePathname,
    };
  }

  // ── 7. VERIFY BY CONTENT ────────────────────────────────────────────────
  const restoredSha256 = await hash(target.blobPathname);
  if (restoredSha256 !== sourceSha256) {
    return {
      status: RESTORE.RESTORE_UNVERIFIED,
      error: `กู้คืนแล้วแต่เนื้อหาไม่ตรง — ได้ ${restoredSha256} คาดว่า ${sourceSha256}`,
      safetyArchivePathname: safe.archivePathname,
      restoredSha256,
      sourceSha256,
    };
  }

  return {
    status: RESTORE.RESTORED,
    target,
    archivePathname,
    safetyArchivePathname: safe.archivePathname,
    previousBytes: safe.previousBytes,
    previousSha256: liveSha256,
    restoredSha256,
    sourceSha256,
    bytes: Number(source.size),
  };
}
