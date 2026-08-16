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
 *   7. verify: head() FIRST (authoritative), then observability
 *
 * ══ STEP 7 IS SHARED WITH THE BROWSER PATH, NOT FORKED ══════════════════════
 *
 * ./propagation.mjs's `pollForPropagation` is reused verbatim for 7b. It can be,
 * honestly: it is pure, every dependency is injected, and its verdict is already
 * the two-outcome shape this needs — visible, or not visible YET, with no
 * failure member. The only thing this module adds is the head() precondition,
 * which is the "share the STEP, not the FLOW" ruling from step 5.5 applied a
 * second time.
 *
 * The one adaptation is in the CALLER, not the poll: `fetchFreshBytes` must
 * defeat the cache on every call. See step 7b.
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
import { PROPAGATION, WEBROOT_POLL_SCHEDULE_MS, pollForPropagation } from './propagation.mjs';

/**
 * How long to keep LOOKING for the restored bytes from this one machine.
 *
 * A TRIPWIRE, NOT A CAPACITY CLAIM — same species as WEBROOT_MAX_BYTES and the
 * 60 s browser budget in ./propagation.mjs, and anchored on the same evidence:
 * a MEASURED ~10.8 s for a same-pathname Blob write to become visible, from TWO
 * samples on ONE CDN PoP. Two samples are an order of magnitude, not a
 * distribution, and one PoP says nothing about the others.
 *
 * ── WHY THIS IS SHORTER THAN THE BROWSER'S 60 s ─────────────────────────────
 * By the time this budget starts, head() has ALREADY proved the object is in
 * the store at the right size. The question that decides success is settled;
 * this window only buys a nicer message. Waiting longer would buy nothing and
 * would refetch the object several more times to get it.
 *
 * ~2.8x the anchor. If a real restore is ever observed taking longer, raise it
 * deliberately and re-anchor this comment. Do not treat it as tested.
 */
export const WEBROOT_RESTORE_OBSERVE_BUDGET_MS = 30_000;

/**
 * Outcomes, so a caller branches on a value rather than on a message.
 *
 * ══ THERE IS NO FAILURE-FROM-ABSENCE MEMBER, DELIBERATELY ═══════════════════
 *
 * `restore-unverified` used to live here and it was WRONG — it reported
 * corruption on evidence that could not distinguish corruption from staleness.
 * On 2026-08-10 a real restore succeeded and this flow called it unverified,
 * skipped the record, and exited 1: the post-copy read went through the CDN
 * milliseconds after the write and returned the pre-copy bytes.
 *
 * The rule that replaces it: ONE PoP CANNOT OBSERVE A FAILURE, ONLY AN ABSENCE.
 * A hash that does not match, from one machine, inside the budget, is
 * indistinguishable from a cache that has not caught up — so it must never be
 * reported as a bad copy. The only real failures after the copy are the ones
 * head() can see, because head() asks the Blob API rather than a cache:
 * the object is not there, or it is there at the wrong size.
 *
 * Same reasoning, and the same two-outcome shape, as PROPAGATION in
 * ./propagation.mjs — which had it right for the browser path from the start
 * and which this module now reuses rather than re-deriving.
 */
export const RESTORE = {
  REFUSED_NAME: 'refused-name',
  REFUSED_ARCHIVE_KEY: 'refused-archive-key',
  ARCHIVE_MISSING: 'archive-missing',
  LIVE_MISSING: 'live-missing',
  SAFETY_ARCHIVE_FAILED: 'safety-archive-failed',
  SAFETY_ARCHIVE_UNVERIFIED: 'safety-archive-unverified',
  /** Dry run. Everything was READ, nothing was written. */
  PLANNED: 'planned',

  // ── real failures: the copy did not happen, or did not land ──────────────
  /** The copy call threw. */
  RESTORE_FAILED: 'restore-failed',
  /** head() found nothing at the live key afterwards. */
  RESTORE_NOT_PRESENT: 'restore-not-present',
  /** head() found an object of the WRONG SIZE. Authoritative, not a cache. */
  RESTORE_SIZE_MISMATCH: 'restore-size-mismatch',

  // ── successes: both RECORD ────────────────────────────────────────────────
  /** head() agreed AND this machine read back the expected bytes. */
  RESTORED_VERIFIED: 'restored-verified',
  /** head() agreed; this PoP had not caught up inside the budget. NOT a failure. */
  RESTORED_UNOBSERVED: 'restored-not-yet-observable',
};

/** Did the restore put the bytes in place? Both success statuses must record. */
export function restoreDidWrite(status) {
  return status === RESTORE.RESTORED_VERIFIED || status === RESTORE.RESTORED_UNOBSERVED;
}

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
    headLive, headArchive, copy,
    fetchFreshBytes, sha256, nowMs, wait,
    budgetMs = WEBROOT_RESTORE_OBSERVE_BUDGET_MS,
    schedule = WEBROOT_POLL_SCHEDULE_MS,
    resolveTarget = webrootUploadTarget,
  } = deps;

  /**
   * Content hash of what a key HOLDS. Composed rather than injected separately
   * so the pre-measurements and the post-copy poll cannot disagree about what
   * "the hash of this object" means.
   */
  const hash = async (pathname) => sha256(await fetchFreshBytes(pathname));

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

  // ── 7a. THE AUTHORITATIVE CHECK, FIRST ──────────────────────────────────
  //
  // head() asks the Blob API. It is not a cache, it answers immediately, and it
  // is the ONLY thing here that can distinguish a bad copy from a slow one. So
  // it runs before any public fetch, and it is the only step whose disagreement
  // is allowed to mean failure.
  let after = null;
  try {
    after = await headLive(target.blobPathname);
  } catch {
    after = null;
  }
  const common = {
    target,
    archivePathname,
    safetyArchivePathname: safe.archivePathname,
    previousBytes: safe.previousBytes,
    previousSha256: liveSha256,
    sourceSha256,
    bytes: Number(source.size),
  };
  if (!after) {
    return { ...common, status: RESTORE.RESTORE_NOT_PRESENT, error: `กู้คืนแล้วแต่ไม่พบวัตถุที่ ${target.blobPathname}` };
  }
  if (Number(after.size) !== Number(source.size)) {
    return {
      ...common,
      status: RESTORE.RESTORE_SIZE_MISMATCH,
      error: `กู้คืนแล้วแต่ขนาดไม่ตรง — ได้ ${after.size} ไบต์ คาดว่า ${source.size} ไบต์`,
      restoredBytes: Number(after.size),
    };
  }

  // ── 7b. AND ONLY THEN, OBSERVABILITY ────────────────────────────────────
  //
  // Reused, not forked: ./propagation.mjs's poll already implements retry,
  // backoff, budget and — the part that matters — a two-outcome verdict with no
  // failure member, for exactly this reason. Re-deriving it here would have been
  // a second copy of a rule this project has already paid to learn once.
  //
  // ONE CONTRACT THE CALLER MUST HONOUR: `fetchFreshBytes` has to defeat the
  // cache on EVERY call, not once. The poll passes the same identifier each
  // attempt, so a nonce computed once by the caller would leave attempts 2..N
  // reading the CDN's copy of the first busted URL — a retry loop that can only
  // ever repeat its first answer.
  const observed = await pollForPropagation(
    { url: target.blobPathname, expectedSha256: sourceSha256, budgetMs, schedule },
    { fetchBytes: fetchFreshBytes, hash: sha256, nowMs, wait },
  );

  if (observed.status === PROPAGATION.VISIBLE) {
    return { ...common, status: RESTORE.RESTORED_VERIFIED, restoredSha256: observed.seenSha256, observed };
  }

  // NOT a failure, and the wording matters because an operator reading it
  // decides whether to touch the store again. head() has already said the bytes
  // are in place at the right size; what has not happened is this machine
  // seeing them. Re-running the restore here would archive the CORRECT object
  // and copy again for nothing.
  return {
    ...common,
    status: RESTORE.RESTORED_UNOBSERVED,
    restoredSha256: observed.seenSha256,
    observed,
    caveat: `กู้คืนแล้ว (head ยืนยันขนาด ${after.size} ไบต์) แต่เครื่องนี้ยังอ่านไม่เห็นภายใน `
      + `${Math.round(budgetMs / 1000)} วินาที — เป็นเรื่องแคช ไม่ใช่ความล้มเหลว อย่ากู้คืนซ้ำ`,
  };
}
