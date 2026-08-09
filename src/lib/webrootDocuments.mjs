/**
 * THE THREE SITE-ROOT DOCUMENTS. One list, two consumers.
 *
 * ══ WHY THIS MODULE EXISTS ══════════════════════════════════════════════════
 *
 * The same three filenames were written out twice — once as literal rewrite
 * rules in next.config.mjs, once as a hardcoded array in
 * scripts/verify-legacy-delivery.mjs. Two copies of a list that must agree, with
 * nothing forcing agreement, is the shape of defect this repo has already been
 * bitten by twice (ADMIN_PAGES vs NAV_GROUPS, and the two audit classifiers).
 * The failure here would be quiet in the worst direction: the verifier would go
 * green over a document the rewrite no longer serves, because it would be
 * checking a list the rewrite had stopped using.
 *
 * ══ REPLACE-ONLY. ADDING A ROOT DOCUMENT STAYS A CODE CHANGE. ═══════════════
 *
 * This list is NOT an admin-editable registry and must not become one. The
 * ruling is next.config.mjs's and it is restated here because this is where
 * someone would try to relax it:
 *
 *   These URLs sit at the SITE ROOT, where every application page also lives.
 *   A catch-all like `/:file(.*\.pdf)` reads as equivalent and is one bad regex
 *   away from swallowing /promotions, /schedule or the whole [...slug] route.
 *   Each filename is named literally. A FOURTH DOCUMENT MEANS A FOURTH ENTRY
 *   HERE, written deliberately, in a diff someone reads.
 *
 * So the admin surface being built on top of this can REPLACE the bytes behind
 * an existing entry. It cannot introduce a new one, and it cannot be given a
 * pathname by whoever is using it.
 *
 * ══ WHY .mjs AND WHY NO IMPORTS ═════════════════════════════════════════════
 *
 * next.config.mjs is loaded by Next's own loader, OUTSIDE the app's module
 * resolution — no `@/` alias, no bundler. It already reaches src/ exactly one
 * way, by relative path to a `.mjs` file:
 *
 *     import { LEGACY_BLOB_FILES } from './src/lib/legacyBlobFiles.mjs';
 *
 * This file follows that mechanism rather than inventing a second one, and
 * imports nothing itself so it stays loadable from the config, from a script,
 * and from a test alike.
 */

/** The Blob store prefix these three live under. Also a URL segment. */
export const WEBROOT_BLOB_PREFIX = 'webroot-documents';

/**
 * The three, in the order the rules were originally written.
 *
 * Frozen: a consumer that mutated this array would change what the OTHER
 * consumer sees, which is precisely the coupling this module exists to make
 * safe rather than to hide.
 */
export const WEBROOT_DOCUMENTS = Object.freeze([
  'how-to-create-chatgpt-account.pdf',
  '9expert-company-profile.pdf',
  '9expert-training-course-catalog.pdf',
]);

/** The public URL path — the site-root URL a customer actually holds. */
export function webrootPublicPath(file) {
  return `/${file}`;
}

/** Where the object lives in the Blob store. */
export function webrootBlobPathname(file) {
  return `${WEBROOT_BLOB_PREFIX}/${file}`;
}

/**
 * The rewrite rules, or NONE when there is no store to point at.
 *
 * The empty-array branch is load-bearing and is not defensive coding: with
 * BLOB_PUBLIC_BASE unset there is nothing to rewrite TO, and emitting rules to
 * an undefined origin would turn three working legacy URLs into three broken
 * ones. Inert is the correct behaviour, not a degraded one.
 *
 * Returned as `{ source, destination }` objects because that is what
 * next.config.mjs needs; building them here rather than in the config is what
 * keeps the DESTINATION SHAPE single-sourced too, not just the filenames.
 */
export function webrootRewrites(blobBase) {
  if (!blobBase) return [];
  const base = String(blobBase).replace(/\/$/, '');
  return WEBROOT_DOCUMENTS.map((file) => ({
    source: webrootPublicPath(file),
    destination: `${base}/${webrootBlobPathname(file)}`,
  }));
}

/** Is this filename one of the three? The guard a replace-only upload needs. */
export function isWebrootDocument(file) {
  return WEBROOT_DOCUMENTS.includes(String(file ?? ''));
}

/**
 * Where a replaced object's PREVIOUS bytes are kept.
 *
 * ══ DELIBERATELY OUTSIDE webroot-documents/ ═════════════════════════════════
 *
 * An archive object under the served prefix would be one rewrite away from
 * being public, and the whole point of the site-root ruling is that only three
 * literal paths are reachable there. This prefix has no rewrite pointing at it
 * and must never get one.
 */
export const WEBROOT_ARCHIVE_PREFIX = 'webroot-archive';

/**
 * `webroot-archive/<name>/<stamp>-<name>.pdf`
 *
 * Grouped by document so "every previous edition of the catalog" is one listing
 * rather than a filter, and stamped so the ordering is readable without reading
 * metadata. The stamp is passed in rather than taken from the clock here: this
 * module is pure, and a caller that stamps its own can make the archive key and
 * the database row agree exactly instead of approximately.
 */
export function webrootArchivePathname(file, stamp) {
  const name = String(file ?? '');
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${WEBROOT_ARCHIVE_PREFIX}/${base}/${stamp}-${name}`;
}

/**
 * A TRIPWIRE, NOT A CAPACITY CLAIM.
 *
 * ── WHY IT IS NOT THE MEDIA CAP ─────────────────────────────────────────────
 * src/lib/legacyUploadPolicy.mjs caps raw uploads at RAW_MAX_BYTES (10 MB)
 * because that is CLOUDINARY's per-asset limit on this plan. These three
 * documents are on Vercel Blob precisely BECAUSE they exceed it. Applying the
 * media cap here would refuse the very file this feature exists to replace.
 * DO NOT "restore" RAW_MAX_BYTES for consistency — the failure would look like
 * a policy fix and would break the catalog and the company profile.
 *
 * ── WHAT THE NUMBER MEANS ───────────────────────────────────────────────────
 * ANCHORED, like ADMIN_LIST_LIMIT: the largest root document today is the
 * 42.6 MiB catalog, and 64 MiB is roughly 1.5× that. It is NOT a statement
 * that 64 MiB uploads reliably, and nothing has measured that. It is the point
 * at which a file is more likely to be the wrong file than a bigger edition —
 * a mis-picked video or disk image is refused in the browser instead of after
 * a 60-second upload.
 *
 * If a real edition ever approaches it, RAISE IT DELIBERATELY and re-anchor
 * this comment to the new largest document. Do not treat it as a limit that
 * was tested.
 */
export const WEBROOT_MAX_BYTES = 64 * 1024 * 1024;

/** The one content type. These are PDFs and nothing else. */
export const WEBROOT_CONTENT_TYPE = 'application/pdf';

/**
 * Resolve WHICH of the three the client asked for, into everything the server
 * needs. The client sends a NAME from the list — never a path.
 *
 * Returns `{ ok, filename, blobPathname, publicPath }` or `{ ok: false, reason }`.
 * The refusal names the offending value; a guard that will not say what it
 * refused sends an admin looking through a UI with three buttons on it.
 */
export function webrootUploadTarget(filename) {
  const name = typeof filename === 'string' ? filename.trim() : '';
  if (!name) return { ok: false, reason: 'ไม่ได้ระบุไฟล์ที่จะแทนที่' };
  if (!isWebrootDocument(name)) {
    return {
      ok: false,
      reason: `"${name}" ไม่ใช่เอกสารที่แทนที่ได้ — รองรับเฉพาะ ${WEBROOT_DOCUMENTS.join(', ')}`,
    };
  }
  return {
    ok: true,
    filename: name,
    blobPathname: webrootBlobPathname(name),
    publicPath: webrootPublicPath(name),
  };
}

/** Human size for a refusal message. A cap that will not say the numbers is a wall. */
const mib = (n) => `${(Number(n) / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Is this upload within the tripwire? Returns null when fine, else a reason
 * NAMING BOTH NUMBERS — the actual size and the cap.
 *
 * "ไฟล์ใหญ่เกินไป" tells an admin nothing: they cannot tell whether they are
 * 1 MB over or picked a video by mistake, and cannot decide whether to
 * re-export or to ask for the cap to be raised.
 */
export function refuseWebrootSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return 'ไม่ทราบขนาดไฟล์';
  if (size > WEBROOT_MAX_BYTES) {
    return `ไฟล์ขนาด ${mib(size)} เกินเพดาน ${mib(WEBROOT_MAX_BYTES)} `
      + '— ตรวจสอบว่าเลือกไฟล์ถูกต้องหรือไม่ ถ้าเป็นฉบับจริงให้แจ้งเพื่อปรับเพดาน';
  }
  return null;
}
