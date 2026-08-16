/**
 * ARCHIVE BEFORE OVERWRITE. The ordering, as a testable function.
 *
 * ══ THE CONTRACT ════════════════════════════════════════════════════════════
 *
 * Same shape as the reference-rewrite revert: THE BACKUP EXISTS BEFORE THE
 * SOURCE IS TOUCHED. A site-root document is served from a fixed Blob key, so
 * a replacement re-puts over it and Blob keeps exactly one version. Without an
 * archive taken first, the overwrite destroys the only copy and the version
 * counter records an event nobody can undo.
 *
 * So the order is fixed and every step gates the next:
 *
 *   1. derive the target from a NAME (never a path)
 *   2. refuse on size
 *   3. copy the live object to the archive key
 *   4. VERIFY the copy is really there — a successful call is not a copy
 *   5. only then authorise the upload
 *
 * ── WHY THIS IS A FUNCTION WITH INJECTED DEPS ───────────────────────────────
 *
 * The ordering is the whole feature, and "we call them in the right order" is
 * an argument, not evidence. With `copy`, `headArchive` and `authorise` passed
 * in, a test can make the copy FAIL and assert that `authorise` was never
 * called — which is the only way to prove no token could have been issued. A
 * server action wired straight to the Blob SDK could only be tested against
 * real Blob, and never for the failure path that matters most.
 *
 * ── FIRST REPLACEMENT OF A DOCUMENT ─────────────────────────────────────────
 *
 * The three objects already exist (uploaded by scripts/upload-webroot-
 * documents.mjs), so there is always something to archive. If the live object
 * is genuinely MISSING, that is not a first-run convenience — it means the
 * document is not being served at all, and overwriting silently would hide
 * that. It is reported and refused.
 */

import { webrootArchivePathname, webrootUploadTarget, refuseWebrootSize } from '../webrootDocuments.mjs';

/** Outcomes, so a caller branches on a value rather than on a message. */
export const REPLACE = {
  REFUSED_NAME: 'refused-name',
  REFUSED_SIZE: 'refused-size',
  LIVE_MISSING: 'live-missing',
  ARCHIVE_FAILED: 'archive-failed',
  ARCHIVE_UNVERIFIED: 'archive-unverified',
  AUTHORISED: 'authorised',
};

/**
 * THE SHARED STEP: put the CURRENT bytes somewhere safe, and prove they landed.
 *
 * ══ WHY THIS IS EXTRACTED ═══════════════════════════════════════════════════
 *
 * A RESTORE is itself an overwrite — copying an archive onto the live key
 * destroys whatever is there now — so restoring has to take the same precaution
 * in the same order as replacing. That is the ordering this whole phase exists
 * to guarantee, and it is now needed twice.
 *
 * It is extracted rather than copied because two implementations of one
 * ordering rule is the shape of defect this repo has been bitten by repeatedly.
 * It is NOT extracted far enough to let a caller reorder it: the caller supplies
 * I/O and receives a verdict, and cannot interleave anything.
 *
 * Returns `{ ok: true, archivePathname, previousBytes }`, or
 * `{ ok: false, reason, error, archivePathname }` where `reason` is one of
 * ARCHIVE_STEP. Each caller maps that onto its own status vocabulary rather
 * than sharing one enum, because "we refused to hand out a token" and "we
 * refused to restore" are different sentences to the person reading them.
 */
export const ARCHIVE_STEP = {
  LIVE_MISSING: 'live-missing',
  ARCHIVE_FAILED: 'archive-failed',
  ARCHIVE_UNVERIFIED: 'archive-unverified',
};

export async function archiveCurrentObject({ target, stamp }, { headLive, copy, headArchive }) {
  // ── the object we are about to destroy ──────────────────────────────────
  let live = null;
  try {
    live = await headLive(target.blobPathname);
  } catch {
    live = null;
  }
  if (!live) {
    return {
      ok: false,
      reason: ARCHIVE_STEP.LIVE_MISSING,
      error: `ไม่พบไฟล์ปัจจุบันที่ ${target.blobPathname} — `
        + 'เอกสารนี้อาจไม่ได้ถูกให้บริการอยู่ ตรวจสอบก่อนแทนที่',
    };
  }

  // ── archive ─────────────────────────────────────────────────────────────
  const archivePathname = webrootArchivePathname(target.filename, stamp);
  try {
    await copy(target.blobPathname, archivePathname);
  } catch (err) {
    return {
      ok: false,
      reason: ARCHIVE_STEP.ARCHIVE_FAILED,
      error: `สำรองไฟล์เดิมไม่สำเร็จ จึงไม่แทนที่ — ${err?.message ?? err}`,
      archivePathname,
    };
  }

  // ── VERIFY. A successful call is not a copy. ─────────────────────────────
  let archived = null;
  try {
    archived = await headArchive(archivePathname);
  } catch {
    archived = null;
  }
  if (!archived) {
    return {
      ok: false,
      reason: ARCHIVE_STEP.ARCHIVE_UNVERIFIED,
      error: `สำรองไฟล์แล้วแต่ตรวจสอบไม่พบที่ ${archivePathname} จึงไม่แทนที่`,
      archivePathname,
    };
  }
  // Size equality is the cheapest evidence the copy is the same object rather
  // than an empty placeholder at the right key.
  if (Number(archived.size) !== Number(live.size)) {
    return {
      ok: false,
      reason: ARCHIVE_STEP.ARCHIVE_UNVERIFIED,
      error: `สำรองไฟล์ได้ขนาด ${archived.size} ไบต์ แต่ไฟล์เดิม ${live.size} ไบต์ จึงไม่แทนที่`,
      archivePathname,
    };
  }

  return { ok: true, archivePathname, previousBytes: Number(live.size) };
}

/**
 * Run the flow. `deps` are all async:
 *
 *   headLive(blobPathname)   → { size, url } | null   the object being replaced
 *   copy(from, to)           → whatever              archive it
 *   headArchive(pathname)    → { size } | null       verification read
 *   authorise(target, { archivePathname, previousBytes })
 *                            → token/permission      ONLY reached on success
 *
 * Returns `{ status, ... }`. `authorised` is the only status carrying a token.
 */
export async function runReplaceFlow({ filename, bytes, stamp }, deps) {
  const { headLive, copy, headArchive, authorise } = deps;

  const target = webrootUploadTarget(filename);
  if (!target.ok) return { status: REPLACE.REFUSED_NAME, error: target.reason };

  const sizeRefusal = refuseWebrootSize(bytes);
  if (sizeRefusal) return { status: REPLACE.REFUSED_SIZE, error: sizeRefusal };

  // ── 3 + 4. archive the current bytes, and prove they landed ─────────────
  const safe = await archiveCurrentObject({ target, stamp }, { headLive, copy, headArchive });
  if (!safe.ok) {
    const status = safe.reason === ARCHIVE_STEP.LIVE_MISSING
      ? REPLACE.LIVE_MISSING
      : (safe.reason === ARCHIVE_STEP.ARCHIVE_FAILED ? REPLACE.ARCHIVE_FAILED : REPLACE.ARCHIVE_UNVERIFIED);
    return { status, error: safe.error, ...(safe.archivePathname ? { archivePathname: safe.archivePathname } : {}) };
  }
  const { archivePathname, previousBytes } = safe;

  // ── 5. only now ─────────────────────────────────────────────────────────
  //
  // The archive key is handed to `authorise` rather than left for the caller to
  // recompute. The receipt it issues is BOUND to this key, and a caller that
  // rebuilt the key from (filename, stamp) on its own would be a second
  // derivation of the same value — the shape that has to agree with this one
  // and has nothing forcing it to.
  const token = await authorise(target, { archivePathname, previousBytes });
  return {
    status: REPLACE.AUTHORISED,
    target,
    archivePathname,
    previousBytes,
    token,
  };
}
