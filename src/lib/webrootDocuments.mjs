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
