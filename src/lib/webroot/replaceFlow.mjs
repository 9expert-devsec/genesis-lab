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

  // ── the object we are about to destroy ──────────────────────────────────
  let live = null;
  try {
    live = await headLive(target.blobPathname);
  } catch {
    live = null;
  }
  if (!live) {
    return {
      status: REPLACE.LIVE_MISSING,
      error: `ไม่พบไฟล์ปัจจุบันที่ ${target.blobPathname} — `
        + 'เอกสารนี้อาจไม่ได้ถูกให้บริการอยู่ ตรวจสอบก่อนแทนที่',
    };
  }

  // ── 3. archive ──────────────────────────────────────────────────────────
  const archivePathname = webrootArchivePathname(target.filename, stamp);
  try {
    await copy(target.blobPathname, archivePathname);
  } catch (err) {
    return {
      status: REPLACE.ARCHIVE_FAILED,
      error: `สำรองไฟล์เดิมไม่สำเร็จ จึงไม่แทนที่ — ${err?.message ?? err}`,
      archivePathname,
    };
  }

  // ── 4. VERIFY. A successful call is not a copy. ──────────────────────────
  let archived = null;
  try {
    archived = await headArchive(archivePathname);
  } catch {
    archived = null;
  }
  if (!archived) {
    return {
      status: REPLACE.ARCHIVE_UNVERIFIED,
      error: `สำรองไฟล์แล้วแต่ตรวจสอบไม่พบที่ ${archivePathname} จึงไม่แทนที่`,
      archivePathname,
    };
  }
  // Size equality is the cheapest evidence the copy is the same object rather
  // than an empty placeholder at the right key.
  if (Number(archived.size) !== Number(live.size)) {
    return {
      status: REPLACE.ARCHIVE_UNVERIFIED,
      error: `สำรองไฟล์ได้ขนาด ${archived.size} ไบต์ แต่ไฟล์เดิม ${live.size} ไบต์ จึงไม่แทนที่`,
      archivePathname,
    };
  }

  // ── 5. only now ─────────────────────────────────────────────────────────
  //
  // The archive key is handed to `authorise` rather than left for the caller to
  // recompute. The receipt it issues is BOUND to this key, and a caller that
  // rebuilt the key from (filename, stamp) on its own would be a second
  // derivation of the same value — the shape that has to agree with this one
  // and has nothing forcing it to.
  const token = await authorise(target, { archivePathname, previousBytes: Number(live.size) });
  return {
    status: REPLACE.AUTHORISED,
    target,
    archivePathname,
    previousBytes: Number(live.size),
    token,
  };
}
