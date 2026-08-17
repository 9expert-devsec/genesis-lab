/**
 * PUBLISHING A **NEW** FILE AT THE SITE ROOT — the policy half.
 *
 * ══ WHAT THIS IS, AND WHAT IT IS NOT ════════════════════════════════════════
 *
 * src/lib/webrootDocuments.mjs governs the THREE FROZEN root PDFs, which are
 * replace-only and served by static rewrites written literally in
 * next.config.mjs. This module governs a different thing: a registry of NEW
 * root files an admin can publish, served by a function.
 *
 * The two must not be confused, and the confusion is not hypothetical — the
 * numbers in this file exist precisely because the frozen three are far outside
 * them and are fine.
 *
 * ══ WHY .mjs AND WHY ZERO IMPORTS ═══════════════════════════════════════════
 *
 * MEASURED reason, not a style preference. next.config.mjs is loaded by Next's
 * own loader, outside the app's module resolution — no `@/` alias, no bundler —
 * and it already reaches src/ exactly one way:
 *
 *     import { LEGACY_BLOB_FILES } from './src/lib/legacyBlobFiles.mjs';
 *     import { WEBROOT_DOCUMENTS }  from './src/lib/webrootDocuments.mjs';
 *
 * next.config.mjs will consume this file the same way, so it follows the same
 * mechanism and imports nothing itself — it stays loadable from the config,
 * from a script, and from a test alike. An extensionless `@/lib/…` import does
 * not resolve under the test loader either.
 *
 * ══ DO NOT APPLY THAT REASONING TO THE MODEL ════════════════════════════════
 *
 * src/models/RootDocument.js is `.js` AND MUST STAY `.js`, for the opposite
 * measured reason: test/fs/auditCoverage.test.mjs walks named imports out of the
 * action modules to classify which exports mutate, and its `resolveSpec` follows
 * only `.js`/`.jsx`. Anything that writes to Mongo behind a `.mjs` file is
 * INVISIBLE to that walk and keeps reading as non-mutating — a hole in the
 * audit-coverage guard wearing a file-extension costume. That trap is already
 * documented on src/lib/webroot/receiptStore.js, which is `.js` for this reason.
 *
 * POLICY IS .mjs BECAUSE THE CONFIG READS IT. THE MODEL IS .js BECAUSE THE
 * AUDIT WALK READS IT. Both headers say so.
 */

/**
 * What may be published at the root, and NOTHING ELSE for now.
 *
 * ══ THE SUBSET RULE — THE REASON THIS LIST IS ONE ENTRY LONG ════════════════
 *
 * Every extension here MUST also be in NO_STORE_DOCUMENT_EXTENSIONS
 * (src/lib/legacyTransforms.mjs). That is asserted by a test, and it is not
 * bookkeeping:
 *
 *   An extension outside NO_STORE gets edge-cached. Vercel answers a Range
 *   request with 200 instead of 206 on a cache HIT, and a streaming client
 *   then treats the partial body as the whole file. A browser's PDF viewer
 *   reads the header, jumps to the xref table at the tail, and pulls page 1
 *   before the rest — so a truncated 200 is a document that opens broken.
 *
 * DO NOT derive this list from RAW_EXTENSION_LIST. That list means "Cloudinary
 * serves this as a raw asset"; it wrongly includes `txt`/`csv`/`rtf` (nothing
 * range-requests them, so they are deliberately NOT in NO_STORE) and wrongly
 * excludes `mp3` (which IS in NO_STORE, because a player seeks constantly).
 * src/lib/legacyDelivery.js:53 is already a second copy of RAW_EXTENSION_LIST;
 * this must not become a fourth.
 */
export const ROOT_FILE_EXTENSIONS = Object.freeze(['pdf']);

/**
 * A TRIPWIRE, NOT A CAPACITY CLAIM. Same species as WEBROOT_MAX_BYTES.
 *
 * ── IT IS NOT A CLAIM THAT A 10 MB FILE WORKS ───────────────────────────────
 * NOTHING HAS MEASURED THE CLIENT-DOWNLOAD LEG. No 10 MB file has been served
 * through this path to a real client on a real connection, and this number is
 * not evidence that one would arrive.
 *
 * ── WHAT THE BINDING CONSTRAINT ACTUALLY IS ─────────────────────────────────
 * NOT the upload, and not Blob's limits. These files are served by a FUNCTION
 * with `no-store` on every request (see the subset rule above — they must not be
 * edge-cached), so the function is held open for as long as the client takes to
 * download. A slow client on a large file is the failure, and it is a failure of
 * duration, not of size — which is why ROOT_FILE_MAX_DURATION_SECONDS below is
 * the other half of this cap and neither is meaningful alone.
 *
 * ── IT DOES NOT APPLY TO THE THREE FROZEN ROOT PDFs ─────────────────────────
 * They are 1.80 MB, 21.84 MB and 42.58 MB, and all three are fine.
 *
 * TWO of them are far above this cap; the smallest, at 1.80 MB, is comfortably
 * under it. THAT IS NOT THE POINT AND THE CAP IS NOT WHY ANY OF THEM WORK. They
 * are served by STATIC REWRITES in next.config.mjs and never touch a function at
 * all, so nothing is held open on their behalf and this reasoning does not reach
 * them in either direction. The 1.80 MB one is not evidence that the cap is
 * generous, and the 42.58 MB one is not evidence that it is wrong.
 *
 * So do not "fix" the apparent inconsistency by raising this number to 42.58 MB.
 * The two paths have different constraints because they are different paths.
 *
 * ── THE ESCAPE HATCH IS A REWRITE, NOT A BIGGER CAP ─────────────────────────
 * A legitimate file above this cap gets what the three got: a static rewrite
 * rule and a deploy. That is a code change somebody reads, and it moves the file
 * off the function path entirely — which is the actual fix. Raising the cap
 * would keep it on the path whose limit was the problem.
 */
export const ROOT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The `maxDuration` the serving route will declare.
 *
 * ANCHORED, and the anchor is a thing that exists: src/app/api/chat/route.js:62
 * already declares `export const maxDuration = 30` and the project builds. A
 * maxDuration the plan cannot honour FAILS THE BUILD — that is what makes the
 * anchor evidence rather than a hope — so 30 is demonstrably honoured here.
 *
 * The route will declare this EXPLICITLY rather than inherit a platform default.
 * What that default is on this plan is NOT ESTABLISHED, and an unstated ceiling
 * is one nobody can reason about when a download starts timing out.
 */
export const ROOT_FILE_MAX_DURATION_SECONDS = 30;

/** Human size for a refusal. A cap that will not say the numbers is a wall. */
const mib = (n) => `${(Number(n) / (1024 * 1024)).toFixed(1)} MB`;

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Is this upload within the tripwire? Returns null when fine, else a reason.
 *
 * Same shape and same rule as `refuseWebrootSize`: the message NAMES BOTH
 * NUMBERS — the actual size and the cap — and it names the escape hatch.
 * "ไฟล์ใหญ่เกินไป" tells an admin nothing: they cannot tell whether they are
 * 1 MB over or picked a video by mistake, and cannot tell that a legitimate
 * large file has a route at all.
 */
export function refuseRootFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return 'ไม่ทราบขนาดไฟล์';
  if (size > ROOT_FILE_MAX_BYTES) {
    return `ไฟล์ขนาด ${mib(size)} เกินเพดาน ${mib(ROOT_FILE_MAX_BYTES)} `
      + '— ไฟล์ที่ใหญ่กว่านี้ต้องเสิร์ฟผ่าน static rewrite ใน next.config.mjs '
      + 'และต้อง deploy แบบเดียวกับเอกสารสามไฟล์เดิม ไม่ใช่การขยายเพดาน';
  }
  return null;
}

/** The file's extension, lowercased, with no dot. `''` when there is none. */
export function rootFileExtension(filename) {
  const name = clean(filename);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Is this an extension the root registry accepts? */
export function isAllowedRootExtension(filename) {
  return ROOT_FILE_EXTENSIONS.includes(rootFileExtension(filename));
}

/**
 * The public URL path AS PUBLISHED — case preserved, for display.
 *
 * `Report-2026.pdf` → `/Report-2026.pdf`. Accepts either form; a leading slash
 * is tolerated so a caller that already has a path is not silently doubled.
 */
export function rootDocumentPublicPath(filename) {
  const name = clean(filename).replace(/^\/+/, '');
  return name ? `/${name}` : '';
}

/**
 * THE LOOKUP KEY: the same path, LOWERCASED. The unique index goes on this.
 *
 * ══ THE CASE RULE, AND IT IS LOAD-BEARING ═══════════════════════════════════
 *
 * `routes-manifest.json` carries `caseSensitive: false` (READ in phase 1 M5, not
 * assumed). So `/Foo.pdf` and `/foo.pdf` are THE SAME URL. Two registry rows
 * differing only in case would be two rows claiming one address, and which one
 * answers is decided by rule order rather than by anything anybody chose.
 *
 * ══ THE LOWERCASING HAPPENS IN APPLICATION CODE, DELIBERATELY ═══════════════
 *
 * NOT by a Mongo collation. Whether this deployment's collection carries a
 * case-insensitive collation is NOT ESTABLISHED — collation is a property of the
 * index and the query, it is not visible in the model, and a unique index that
 * silently compares case-sensitively would let the colliding pair through while
 * looking exactly like a working guard. So the key is computed here, stored as
 * its own field, and indexed as an ordinary unique index on an ordinary string.
 */
export function rootDocumentKey(filenameOrPath) {
  return rootDocumentPublicPath(filenameOrPath).toLowerCase();
}
