import { WEBROOT_DOCUMENTS } from '@/lib/webrootDocuments.mjs';
import { isAllowedRootExtension, rootDocumentKey } from '@/lib/rootDocuments.mjs';
import { documentContentType, extensionOf, proxyUpstream } from '@/lib/legacyDelivery';

/**
 * SERVE A FILE PUBLISHED AT THE SITE ROOT — the decision, with its I/O injected.
 *
 * ══ WHAT HAS NOT HAPPENED YET, SAID PLAINLY ═════════════════════════════════
 *
 * NO BYTE HAS EVER BEEN SERVED FROM A REAL REGISTRY ROW. There is no rewrite
 * rule pointing at this route, no publish UI, and not one row in
 * `root_documents`. Everything below is proved against injected fakes, which
 * establishes the ORDER and the REFUSALS and nothing whatever about Blob
 * answering a real Range request for a real published file. The end-to-end
 * proof needs a row, a row needs the UI, and the UI is a later round — so the
 * first real byte is served when a human clicks, not before.
 *
 * ══ WHY THE LOOKUP IS INJECTED ══════════════════════════════════════════════
 *
 * Same reason, and the same shape, as src/lib/rootPathCollision.mjs taking its
 * manifest and its slug lookup: the alternative is a test that must WRITE a row
 * to read one back. This module never touches mongoose; the route wires the
 * real query in, and every case below is driven with a function.
 *
 * ══ CACHING IS NOT SET HERE, DELIBERATELY ═══════════════════════════════════
 *
 * MEASURED: `no-store` for these paths comes from the `headers()` rule in
 * next.config.mjs, keyed on NO_STORE_DOCUMENT_EXTENSIONS and matched BY REQUEST
 * PATH. So this handler passes `cacheControl: null` and sets no `cache-control`
 * at all. Setting one here would not "reinforce" that rule, it would create a
 * second claim about the same response — and `proxyUpstream`'s default is a
 * 24-hour shared cache, which is the exact opposite of what these paths need.
 *
 * Why they need it: an extension outside NO_STORE gets edge-cached, and Vercel
 * answers a Range request with 200 instead of 206 on a cache HIT, so a PDF
 * viewer that seeks to the xref table gets a truncated body with a success
 * status. That is why ROOT_FILE_EXTENSIONS must stay a subset of NO_STORE — a
 * property proved once in test/pure/rootDocumentsPolicy.test.mjs and not
 * re-proved here.
 */

/** This route's delivery tag. MUST differ from the legacy route's. */
export const ROOT_FILE_TAG = 'root-file';

/**
 * One outcome per branch, so a test asserts on a value rather than on a string.
 * Exported because the refusals are the interesting half of this module.
 */
export const ROOT_FILE = Object.freeze({
  /** The path names one of the frozen three. Never served from the registry. */
  REFUSED_FROZEN: 'refused-frozen',
  /** The extension is not one this registry publishes. */
  REFUSED_EXTENSION: 'refused-extension',
  /** No published row answers this path. Covers withdrawn, deliberately. */
  NOT_FOUND: 'not-found',
  /** The registry could not be read. NOT a 404 — see below. */
  LOOKUP_FAILED: 'lookup-failed',
  /** Handed to the proxy. */
  SERVED: 'served',
});

/** The frozen three, matched the way the URL matches them: case-insensitively. */
const FROZEN_KEYS = new Set(WEBROOT_DOCUMENTS.map((f) => rootDocumentKey(f)));

const fail = (status, body, outcome) => {
  const res = new Response(body, {
    status,
    headers: { 'x-legacy-delivery': `${ROOT_FILE_TAG}-${outcome}` },
  });
  return res;
};

/**
 * Decide, then delegate.
 *
 * @param {Request} request
 * @param {object} input
 * @param {string} input.requestPath  the path as requested, e.g. `/Report.pdf`
 * @param {string} [input.method]     'GET' or 'HEAD'
 * @param {object} deps
 * @param {(key: string) => Promise<object|null>} deps.lookup  by LOWERCASED key
 * @param {string} deps.blobBase      public base of the Blob store
 * @param {Function} [deps.proxy]     defaults to the shared streaming proxy
 * @param {Function} [deps.fetchImpl] handed to the proxy, so a test needs no network
 * @returns {Promise<{outcome: string, response: Response, key: string}>}
 */
export async function serveRootFile(request, { requestPath, method = 'GET' }, deps) {
  const { lookup, blobBase, proxy = proxyUpstream, fetchImpl } = deps;

  const key = rootDocumentKey(requestPath);
  if (!key) {
    return { outcome: ROOT_FILE.NOT_FOUND, key, response: fail(404, 'root-file: no path', ROOT_FILE.NOT_FOUND) };
  }

  // ── 1. THE FROZEN THREE ARE NOT SERVED FROM HERE ──────────────────────────
  //
  // DEFENCE IN DEPTH, and it should be unreachable: once the rewrite rule
  // exists it will sit BELOW the three literal webroot rules in
  // next.config.mjs, so these names are claimed before anything reaches this
  // handler. It is here anyway because the measured failure was exactly a rule
  // ORDER problem — M4: a document-extension rule placed ABOVE the three
  // webroot rules once STOLE a published PDF. A refusal that costs one Set
  // lookup is cheaper than discovering that again in production.
  //
  // This is the READ-side half. The write-side half is the validator on
  // src/models/RootDocument.js, which refuses to register these names at all.
  if (FROZEN_KEYS.has(key)) {
    return {
      outcome: ROOT_FILE.REFUSED_FROZEN,
      key,
      response: fail(404, `root-file: ${key} is served by a static rewrite`, ROOT_FILE.REFUSED_FROZEN),
    };
  }

  // ── 2. only extensions this registry publishes ────────────────────────────
  //
  // Also defence in depth: publish-time policy should never have written a row
  // with another extension. It matters because of the cache rule in the header
  // — an extension outside NO_STORE would be edge-cached and Range would break.
  if (!isAllowedRootExtension(key)) {
    return {
      outcome: ROOT_FILE.REFUSED_EXTENSION,
      key,
      response: fail(404, `root-file: ${key} is not a published document type`, ROOT_FILE.REFUSED_EXTENSION),
    };
  }

  // ── 3. the registry, by LOWERCASED key ────────────────────────────────────
  let row;
  try {
    row = await lookup(key);
  } catch (err) {
    // A registry problem must not masquerade as a missing file: a 404 would
    // send somebody hunting for a document that is published and fine. Same
    // ruling as the legacy resolver's 503.
    return {
      outcome: ROOT_FILE.LOOKUP_FAILED,
      key,
      response: fail(503, `root-file: lookup failed — ${err?.message ?? err}`, ROOT_FILE.LOOKUP_FAILED),
    };
  }

  // ── 4. published, or it does not exist ────────────────────────────────────
  //
  // A WITHDRAWN ROW IS INDISTINGUISHABLE FROM A MISSING ONE — same status, same
  // body, same tag. That is the point of withdrawing something: 403 would
  // confirm the file exists and 301 would keep serving a pointer to it, and
  // both leak exactly what an operator withdrew it to stop publishing.
  if (!row || row.status !== 'published' || !row.blobPathname) {
    return {
      outcome: ROOT_FILE.NOT_FOUND,
      key,
      response: fail(404, `root-file: nothing published at ${key}`, ROOT_FILE.NOT_FOUND),
    };
  }

  // ── 5. stream it ──────────────────────────────────────────────────────────
  const base = String(blobBase ?? '').replace(/\/$/, '');
  const upstream = `${base}/${row.blobPathname}`;

  const response = await proxy(request, upstream, {
    fileName: row.publicPath ? row.publicPath.replace(/^\/+/, '') : key.replace(/^\/+/, ''),
    forceContentType: row.contentType || documentContentType(extensionOf(key)),
    method,
    // See the header: the headers() rule owns cache-control for these paths.
    cacheControl: null,
    tag: ROOT_FILE_TAG,
    fetchImpl,
  });

  return { outcome: ROOT_FILE.SERVED, key, response, upstream };
}
