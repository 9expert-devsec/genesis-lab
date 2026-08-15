/**
 * Legacy 9Expert file-URL inventory — READ-ONLY.
 *
 * ── FIRST RUN, 2026-08-06, db 9exp_genesis ──────────────────────────────────
 * 49 collections, 1453 documents, 71309 strings → 4791 references to 2139
 * unique URLs. Recorded here so a later run has something to diff against;
 * these are a MEASUREMENT OF ONE MOMENT on a live database, not constants.
 *
 *   sites-default-files  1615 unique / 1921 refs
 *   images                 72 /  261      files        16 /   30
 *   webroot-file           44 /   90      download      3 /    3
 *   file (SINGULAR)         0 /    0      other       389 / 2486
 *
 * Three things that came out of it and are not obvious from the brief:
 *
 *   1. `file` (singular) is EMPTY. It exists on the box; nothing in this
 *      database points at it. Do not spend migration effort on it without
 *      re-measuring first.
 *
 *   2. ALL 389 `other` URLs are extensionless — they are Drupal PAGES
 *      (/articles/…, course pages, /registration/public?…), not files. Zero
 *      unanticipated FILE roots. The file-root taxonomy in this script is
 *      complete for what the database actually holds. Those page links are
 *      still a redirect problem of the same shutdown, so they are reported
 *      separately in F2 rather than dropped.
 *
 *   3. THE ONE THAT CHANGES THE PLAN: 768 of the 2139 unique URLs point at
 *      /sites/default/files/styles/<style>/public/… — Drupal's GENERATED image
 *      cache, not uploaded files, 673 of them carrying an ?itok= HMAC. That
 *      includes 474 of the 478 article covers. See section G, and the header
 *      block below on why copying styles/ is copying a cache.
 *
 * The article-cover figure matched the claim in
 * src/components/articles/ArticleTaxonomyChips.jsx exactly: 479 legacy covers
 * on 479 of 487 active articles. The comment is accurate. It is also silent on
 * point 3, which is the part that costs work.
 *
 * ── THE SOURCE MANIFEST (added after the first run) ─────────────────────────
 * Point 3 above is why this script now resolves derivatives back to the files
 * they were generated from and emits a canonical SOURCE-file manifest. The
 * resolution, the confidence flags and the manifest writers live in
 * ./lib/legacy-source-manifest.mjs — the split is purely about file length;
 * there is still ONE scan, and every report a run writes shares its timestamp.
 *
 * First manifest run, same moment as the figures above:
 *
 *   2139 unique URLs  →  2085 unique source files  →  1686 in scope
 *   768 reached ONLY through a derivative
 *     0 reached BOTH directly and through one — the populations are disjoint
 *     3 low-confidence resolutions, all `ambiguous-appended-ext`
 *
 * The three low-confidence cases are filenames that already contain a dot
 * (`thailand-4.0.png`, `macro-excel.001.png`, `Exception ใน .NET-01.png`).
 * Nothing was stripped from them, which is almost certainly right — the flag
 * records that the stored path cannot PROVE it, not that the answer is wrong.
 *
 * None of these paths has been verified to exist. That needs --check.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The old Drupal box (webroot /opt/www, served as www.9experttraining.com) is
 * going away. Every file still served from it — article covers, course PDFs,
 * brochures, images pasted into rich-text bodies years ago — becomes a 404 the
 * day it is switched off. Nobody knows how many there are, which fields hold
 * them, or which of them are ALREADY broken.
 *
 * This is Phase 0: count the thing before touching it. The migration cannot be
 * planned, costed or verified against a number nobody has measured, and a
 * rewrite driven by a guess silently drops whatever the guess did not cover.
 * So this script produces the number, and produces it in a form a human can
 * argue with — every reference carries the collection, the _id and the dotted
 * field path it came from, so any row in the summary can be walked back to the
 * document that produced it.
 *
 * This script performs NO writes. Not behind a flag, not at all: `find()`
 * cursors, `listCollections()`, and files written under reports/. There is no
 * `insertOne`, `insertMany`, `updateOne`, `updateMany`, `findOneAndUpdate`,
 * `replaceOne`, `deleteOne`, `deleteMany`, `bulkWrite`, `$set`, `$inc`,
 * `createIndex` or `drop*` anywhere in this file.
 *
 * It also imports NOTHING from `src/`. Two reasons, and the second is the one
 * that matters. First, importing a model is a write: Mongoose runs
 * `createIndexes()` the first time a model is used, and an inventory must not
 * change the thing it is inventorying. Second — and this is the whole point of
 * the script — the models describe the collections we KNOW about. Legacy URLs
 * are most dangerous exactly where no model file looks. Collections are
 * therefore enumerated from the server via `listCollections()` and every
 * document is walked field by field, including fields no schema declares.
 *
 * ── WHAT COUNTS AS A LEGACY URL ─────────────────────────────────────────────
 * Three stored forms, all captured:
 *
 *   absolute            https://www.9experttraining.com/files/x.pdf
 *                       http://9experttraining.com/files/x.pdf
 *   protocol-relative   //www.9experttraining.com/files/x.pdf
 *   root-relative       /sites/default/files/articles/cover/x.png
 *
 * Host matching is APEX-AND-WWW ONLY. `academy.9experttraining.com` and
 * `reviews.9experttraining.com` are live, separate services (see
 * src/config/site.js and src/lib/api/reviews.js) that are NOT being shut down,
 * and sweeping them in here would inflate every figure with files that need no
 * migration at all.
 *
 * The Drupal webroot's public content lives under these roots:
 *
 *   /download/…
 *   /file/…                  SINGULAR — a genuinely different directory from
 *   /files/…                 the plural one. They are classified separately
 *   /images/…                because they are separate directories on disk.
 *   /sites/default/files/…   Drupal's public files dir. Article covers are at
 *                            /sites/default/files/articles/cover/… with a
 *                            sibling /sites/default/files/articles/files/….
 *   /some-file.pdf           a handful of PDFs sitting directly at the webroot,
 *                            e.g. /9expert-company-profile.pdf
 *
 * ── THE ONE DELIBERATE BLIND SPOT, STATED UP FRONT ──────────────────────────
 * For ROOT-RELATIVE values only, a bare webroot file (`/foo.ext`, no directory
 * segment) is matched only when `ext` is in WEBROOT_DOC_EXTENSIONS below —
 * documents, not images.
 *
 * That is not fussiness, it is a forced choice. A root-relative `/logo.svg` or
 * `/hero.jpg` is indistinguishable, from inside the database, from an asset in
 * this repo's own `public/` directory, and this app serves plenty of those.
 * Matching them would fill the report with local files that are not going
 * anywhere, and a report padded with false positives stops being read. The cost
 * is real and is reported explicitly in section G rather than buried here: a
 * bare-webroot IMAGE stored as a root-relative path is invisible to this scan.
 * The same file stored in its absolute or protocol-relative form IS caught,
 * because the host pins it to the legacy server beyond doubt.
 *
 * ── ENCODING: RAW IS KEPT, DECODED IS DERIVED ───────────────────────────────
 * Legacy filenames are a museum. Spaces, Thai script, parentheses, ampersands,
 * multiple dots, and any mixture of those percent-encoded or not, sometimes in
 * the same collection. The same file therefore appears under several different
 * stored strings.
 *
 * So: unique-ness is keyed on the DECODED path, and every distinct RAW stored
 * string that decoded to it is kept alongside in `rawForms`. Decoding is
 * derived and lossy; the raw string is what is actually in the database and is
 * never discarded. Nothing is normalised away that could not be reconstructed
 * from what is written out — the host is dropped from the key (every match is
 * on the legacy host by construction) but query strings and fragments are kept,
 * because those cannot be inferred back.
 *
 * `decodeURIComponent` throws on a malformed escape. When it does, the raw
 * string is used as its own decoded form and the entry is flagged
 * `decodeFailed` — a value we cannot decode is a value the migration will
 * struggle with, so it is surfaced, not swallowed.
 *
 * ── HOW STRINGS ARE SCANNED ─────────────────────────────────────────────────
 * Article bodies are rich text and routinely carry a dozen legacy `<img src>`
 * in one field, so every string is scanned for ALL matches, not the first. Four
 * passes, in this order, later passes skipping character ranges already claimed:
 *
 *   A. whole-value    the entire trimmed string is a legacy URL. This is the
 *                     `coverUrl` case, and it runs FIRST because it is the only
 *                     pass that can safely accept literal spaces — there is no
 *                     surrounding text for the match to run into.
 *   B. quoted attrs   src="…" / href='…' / poster= / content= …  The quotes
 *                     delimit the value exactly, so literal spaces and
 *                     parentheses inside a filename survive intact.
 *   C. css url(…)     background-image and friends, inline in style attributes.
 *   D. bare scan      everything else. This pass CANNOT allow whitespace — it
 *                     has no delimiter and would run off the end of the URL
 *                     into the prose after it — so a literal space in an
 *                     unquoted, non-attribute URL truncates the match. That is
 *                     the trade, and it is why A/B/C exist to catch the cases
 *                     where a delimiter does exist.
 *
 * Bare matches get trailing punctuation trimmed (sentence periods, commas,
 * unbalanced closing brackets, dangling HTML entities). This can in principle
 * clip a filename that genuinely ends in a period. Judged the better error:
 * over-trimming produces a path a human can spot, under-trimming produces a
 * URL that silently 404s on every check.
 *
 * ── `other` IS THE POINT ────────────────────────────────────────────────────
 * Section F lists, in full, every URL whose root is none of the ones above. A
 * non-empty section F is the single most valuable output of this script: it
 * means the legacy server serves content from a directory nobody in this
 * migration has accounted for. Everything else here confirms what we expected.
 * That section is the part that does not.
 *
 * ── --check ─────────────────────────────────────────────────────────────────
 * Without the flag the script makes NO network requests at all. With it, each
 * unique URL gets one HEAD against the legacy host — 8 at a time, 10s timeout,
 * redirects followed — and the status plus content-length land in the JSON.
 * Some Drupal/Apache configurations refuse HEAD outright, which would score a
 * perfectly healthy file as broken, so a 405/501 is retried once as a
 * single-byte ranged GET. Still read-only, still cheap.
 *
 * Non-2xx is summarised as "already broken", and that figure is a MIGRATION
 * SCOPE REDUCTION, not a bug report: a reference that is dead today cannot be
 * regressed by the shutdown, and may not be worth carrying across at all.
 *
 * ── SCALE ───────────────────────────────────────────────────────────────────
 * Documents stream through a cursor; no collection is ever pulled into an
 * array. What is held in memory is bounded by the number of UNIQUE URLs, not
 * by the number of documents — the per-URL reference site list is capped at
 * MAX_SITES_PER_URL, with the overflow counted rather than dropped silently.
 *
 * ── OUTPUT ──────────────────────────────────────────────────────────────────
 * A summary on stdout, plus a timestamped .json and .csv under reports/.
 * The reports name document _ids, so /reports/ is gitignored. The CSV is
 * written with a UTF-8 BOM, without which Excel renders every Thai filename in
 * it as mojibake.
 *
 * Usage:  node --env-file=.env.local scripts/audit-legacy-file-urls.mjs
 *   or:   npm run audit:legacy-urls
 *   with: npm run audit:legacy-urls -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import {
  pathOnly,
  extensionOf,
  csvCell,
  resolveDerivative,
  flagResolutionCollisions,
  buildSourceManifest,
  writeSourceManifest,
  SCOPE_FILTERS,
} from './lib/legacy-source-manifest.mjs';
// The URL extraction, path normalisation and document walker live in their own
// module because the REWRITE phase replaces the exact character ranges this
// reports. Two copies that drifted by one byte would let the rewrite corrupt a
// body the audit had already called safe.
import {
  LEGACY_HOST,
  LEGACY_PROBE_ORIGIN,
  WEBROOT_DOC_EXTENSIONS,
  MAX_DEPTH,
  mightContainLegacy,
  isWholeLegacyUrl,
  trimTrailingPunctuation,
  extractLegacyUrls,
  toPath,
  decodePath,
  classifyRoot,
  isArticleCoverPath,
  walkStrings,
} from './lib/legacy-url-extract.mjs';

// ── arguments ───────────────────────────────────────────────────────────────

const ARGV = process.argv.slice(2);
const argOf = (flag, fallback = null) => {
  const i = ARGV.indexOf(flag);
  return i === -1 ? fallback : ARGV[i + 1];
};

// ── configuration ───────────────────────────────────────────────────────────

// LEGACY_HOST, LEGACY_PROBE_ORIGIN and WEBROOT_DOC_EXTENSIONS are imported from
// ./lib/legacy-url-extract.mjs — see the import block above.

/** Per-URL reference sites retained. Overflow is counted, never silently cut. */
const MAX_SITES_PER_URL = 500;

/** Cursor batch size. Small enough to stay polite on a shared tier. */
const BATCH_SIZE = 200;

/** --check tuning. */
/**
 * --check tuning.
 *
 * ══ WHY THE DEFAULT IS 2 AND NOT 8 ══════════════════════════════════════════
 *
 * Measured 2026-08-07: a full sweep at concurrency 8 returned 704 responses of
 * HTTP 429 Too Many Requests. The legacy box throttles, and a throttled
 * response is not evidence about a file — it is evidence about the sweep.
 *
 * That matters far more than it sounds. Phase 2 skips references it believes
 * are dead. If a 429 were read as "gone", the rewrite would abandon hundreds of
 * LIVE references, leaving them pointed at a host that is about to be switched
 * off, and the run would look completely clean while doing it.
 *
 * So: two at a time, with a pause between requests, and a 429 escalates the
 * pause and retries rather than being recorded. Slower is the correct trade —
 * this is measured once and then acted on for years.
 *
 * Override with --concurrency and --delay when probing something else.
 */
const CHECK_CONCURRENCY = Number(argOf('--concurrency', '2'));
const CHECK_DELAY_MS = Number(argOf('--delay', '150'));
const CHECK_TIMEOUT_MS = 10_000;

/** A 429 is retried this many times, backing off, before it is recorded. */
const CHECK_429_RETRIES = 4;

/** Rows before the collection/field table starts summarising. */
const FIELD_TABLE_LIMIT = 60;

/**
 * The claim this run is measured against. src/components/articles/
 * ArticleTaxonomyChips.jsx states that of 487 active articles, 479 covers are
 * legacy files on www.9experttraining.com. Section G checks that, out loud.
 */
const CLAIMED_ACTIVE_ARTICLES = 487;
const CLAIMED_LEGACY_COVERS = 479;
/** How far section G may drift from the claim before it shouts. */
const COVER_TOLERANCE = 5;

const ROOTS = ['download', 'file', 'files', 'images', 'sites-default-files', 'webroot-file', 'other'];

// ── tiny formatting helpers, same shape as the other audit scripts ──────────

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const rule = (n) => '-'.repeat(n);

/** Truncate for table display only. Full values go to the JSON and CSV. */
function ellipsis(s, n) {
  const v = String(s);
  return v.length <= n ? v : `${v.slice(0, n - 1)}…`;
}

// ── the matcher ─────────────────────────────────────────────────────────────

// The matching rules (HOST_RE, LEGACY_DIRS, the four passes) and
// extractLegacyUrls() are imported from ./lib/legacy-url-extract.mjs.

// ── classification ──────────────────────────────────────────────────────────

// pathOnly() and extensionOf() live in ./lib/legacy-source-manifest.mjs — the
// manifest needs them for computed source paths, and one definition is better
// than two that can drift apart.

// Drupal image-style derivative resolution — resolveDerivative() and the
// confidence flags it produces — lives in ./lib/legacy-source-manifest.mjs.
// It is the manifest's core concern, and it is long enough to deserve its own
// file with its own header explaining what Drupal actually does.

// ── the document walker ─────────────────────────────────────────────────────

// walkStrings() — which visits every string in a BSON document with its dotted
// field path — is imported from ./lib/legacy-url-extract.mjs.

// ── the accumulator ─────────────────────────────────────────────────────────

/**
 * Keyed on the DECODED path, so the same file stored absolutely in one
 * collection and root-relatively in another collapses to one entry with two
 * `rawForms`. Counters beside it are plain integers — the tables never hold a
 * per-document object, only a tally.
 */
function createIndexStore() {
  return {
    byPath: new Map(),                    // decodedPath -> entry
    byCollectionField: new Map(),         // col+field composite key -> { refs, urls:Set }
    totalRefs: 0,
    docsScanned: 0,
    stringsTested: 0,
    depthTruncations: 0,
    sitesDropped: 0,
  };
}

function record(store, { collection, id, fieldPath, raw }) {
  const p = toPath(raw);
  const { decoded, decodeFailed } = decodePath(p);

  let entry = store.byPath.get(decoded);
  if (!entry) {
    entry = {
      decodedPath: decoded,
      decodeFailed,
      rawForms: new Set(),
      root: classifyRoot(decoded),
      extension: extensionOf(decoded),
      refCount: 0,
      siteCount: 0,
      sites: [],
      sitesTruncated: 0,
      // EVERY collection this URL was seen in, kept independently of `sites`
      // because that list is capped. The scope filter asks "is this referenced
      // ONLY from webhook_logs?", and answering it off a truncated list would
      // silently mis-scope the busiest URLs — exactly the ones that overflow.
      collections: new Set(),
    };
    store.byPath.set(decoded, entry);
  }
  entry.collections.add(collection);
  entry.rawForms.add(raw);
  entry.refCount += 1;
  entry.siteCount += 1;
  if (entry.decodeFailed !== true) entry.decodeFailed = decodeFailed;
  store.totalRefs += 1;

  if (entry.sites.length < MAX_SITES_PER_URL) {
    entry.sites.push({ collection, _id: String(id), fieldPath });
  } else {
    entry.sitesTruncated += 1;
    store.sitesDropped += 1;
  }

  // NUL separator: neither a collection name nor a field path can contain one,
  // so two different (collection, fieldPath) pairs can never collide on it.
  const key = `${collection}\u0000${fieldPath}`;
  let cf = store.byCollectionField.get(key);
  if (!cf) { cf = { collection, fieldPath, refs: 0, urls: new Set() }; store.byCollectionField.set(key, cf); }
  cf.refs += 1;
  cf.urls.add(decoded);
}

// ── --check ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How many times the server told us to slow down. Reported, not swallowed. */
let rateLimitHits = 0;

/**
 * One reachability probe. HEAD first; a server that refuses the method (405 /
 * 501) is retried once as a single-byte ranged GET, because "this Apache does
 * not do HEAD" and "this file is gone" are very different answers and only one
 * of them changes the migration.
 */
async function probe(url) {
  const attempt = async (method, extraHeaders) => {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      headers: { 'user-agent': '9exp-legacy-url-audit/1.0 (read-only inventory)', ...extraHeaders },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return {
      method,
      status: res.status,
      ok: res.ok,
      contentLength: res.headers.get('content-length'),
      contentType: res.headers.get('content-type'),
      finalUrl: res.url && res.url !== url ? res.url : null,
      retryAfter: res.headers.get('retry-after'),
      error: null,
    };
  };

  try {
    let head = await attempt('HEAD', {});

    // ── 429 IS NOT AN ANSWER ABOUT THE FILE ────────────────────────────────
    // It is the server saying "ask me later". Recording it as a result would
    // let the rate limiter decide which references Phase 2 abandons. Back off
    // and ask again; only a 429 that survives every retry is reported, and
    // even then it is reported as UNKNOWN, never as dead.
    for (let i = 0; head.status === 429 && i < CHECK_429_RETRIES; i += 1) {
      const retryAfter = Number(head.retryAfter) || 0;
      const wait = Math.max(retryAfter * 1000, CHECK_DELAY_MS * 8 * (2 ** i));
      rateLimitHits += 1;
      await sleep(wait);
      head = await attempt('HEAD', {});
    }

    if (head.status !== 405 && head.status !== 501) return head;
    try {
      return await attempt('GET', { range: 'bytes=0-0' });
    } catch {
      return head;                        // the ranged retry failed; report HEAD
    }
  } catch (err) {
    return {
      method: 'HEAD',
      status: null,
      ok: false,
      contentLength: null,
      contentType: null,
      finalUrl: null,
      error: err?.name === 'TimeoutError' ? `timeout after ${CHECK_TIMEOUT_MS}ms` : (err?.message ?? String(err)),
    };
  }
}

const UNBUILDABLE = (err) => ({
  method: null, status: null, ok: false, contentLength: null,
  contentType: null, finalUrl: null, error: `unbuildable URL: ${err?.message ?? err}`,
});

/**
 * Fixed pool of CHECK_CONCURRENCY workers over a flat target list.
 *
 * TWO targets exist for a derivative, and the distinction is the whole reason
 * this function got more complicated:
 *
 *   the STORED derivative URL — nearly useless as evidence. Drupal regenerates
 *     a missing derivative on demand, so a 200 here can be produced by a source
 *     file that is then immediately re-cached. It says the site is up, not that
 *     the file survives.
 *   the COMPUTED source path — the one that counts. A 200 means there is
 *     something to copy. A 404 means either the file is gone or the resolution
 *     is wrong, and the confidence flag says which is more likely.
 *
 * Source paths are deduped before probing: hundreds of derivatives can share a
 * source and re-requesting it once per derivative would multiply the load on a
 * machine that is already being retired for a reason.
 *
 * Returns a Map of source path -> probe result.
 */
async function runChecks(entries) {
  const derivativeEntries = entries.filter((e) => e.derivative);
  const sourcePaths = [...new Set(derivativeEntries.map((e) => e.derivative.sourcePath))];

  const targets = [
    ...entries.map((e) => ({ kind: 'stored', entry: e, path: e.decodedPath })),
    ...sourcePaths.map((p) => ({ kind: 'source', path: p })),
  ];

  const sourceChecks = new Map();
  let next = 0;
  let done = 0;
  const total = targets.length;
  const tty = Boolean(process.stdout.isTTY);

  const tick = () => {
    done += 1;
    if (tty) {
      process.stdout.write(`\r  checking ${done}/${total} …    `);
    } else if (done % 100 === 0 || done === total) {
      console.log(`  checking ${done}/${total} …`);
    }
  };

  const worker = async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= total) return;
      const t = targets[i];

      let url;
      try {
        // The URL constructor re-encodes Thai, spaces and parentheses correctly,
        // which is exactly what the browser would send for this stored value.
        url = new URL(t.path, LEGACY_PROBE_ORIGIN).href;
      } catch (err) {
        if (t.kind === 'stored') t.entry.check = UNBUILDABLE(err);
        else sourceChecks.set(t.path, UNBUILDABLE(err));
        tick();
        continue;
      }

      // Pace every request, not just the retries. The limiter reacts to rate,
      // so the cheapest way to never see a 429 is to never go fast.
      if (CHECK_DELAY_MS > 0) await sleep(CHECK_DELAY_MS);
      const result = await probe(url);
      if (t.kind === 'stored') {
        t.entry.checkUrl = url;
        t.entry.check = result;
      } else {
        sourceChecks.set(t.path, result);
      }
      tick();
    }
  };

  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, total || 1) }, worker));
  if (tty) process.stdout.write('\r');

  // Hand each derivative entry its source's result so the report can compare
  // the two side by side without re-deriving the mapping.
  for (const e of derivativeEntries) e.sourceCheck = sourceChecks.get(e.derivative.sourcePath) ?? null;

  return sourceChecks;
}

// ── report writers ──────────────────────────────────────────────────────────
// csvCell() is imported from ./lib/legacy-source-manifest.mjs so both reports
// quote identically.

function writeReports(entries, meta, checked, dir, stamp) {
  fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, `legacy-file-urls-${stamp}.json`);
  const csvPath = path.join(dir, `legacy-file-urls-${stamp}.csv`);

  const payload = {
    generatedAt: new Date().toISOString(),
    database: meta.database,
    checked,
    legacyHost: LEGACY_HOST,
    scan: {
      collectionsScanned: meta.collectionsScanned,
      collectionsSkipped: meta.collectionsSkipped,
      documentsScanned: meta.docsScanned,
      stringsTested: meta.stringsTested,
      depthTruncations: meta.depthTruncations,
      maxSitesPerUrl: MAX_SITES_PER_URL,
      referenceSitesDropped: meta.sitesDropped,
    },
    totals: { references: meta.totalRefs, uniqueUrls: entries.length },
    urls: entries.map((e) => ({
      decodedPath: e.decodedPath,
      decodeFailed: e.decodeFailed,
      rawForms: [...e.rawForms],
      root: e.root,
      extension: e.extension,
      refCount: e.refCount,
      collections: [...e.collections].sort(),
      // null unless the path is a /sites/default/files/styles/… derivative.
      // `sourcePath` is COMPUTED — read `confidence`/`reasons` beside it.
      derivative: e.derivative ?? null,
      sitesTruncated: e.sitesTruncated,
      sites: e.sites,
      ...(checked ? {
        checkUrl: e.checkUrl ?? null,
        check: e.check ?? null,
        // For a derivative, the check that actually matters — see runChecks().
        sourceCheck: e.sourceCheck ?? null,
      } : {}),
    })),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const header = [
    'decoded_path', 'root', 'extension', 'ref_count', 'raw_form_count', 'raw_forms',
    'decode_failed', 'is_derivative', 'image_style', 'source_path',
    'resolution_confidence', 'resolution_reasons', 'sites_truncated',
    'first_collection', 'first_field_path', 'first_id',
    ...(checked ? ['http_status', 'content_length', 'check_method', 'check_error',
      'source_http_status', 'source_check_error'] : []),
  ];
  const lines = [header.join(',')];
  for (const e of entries) {
    const s0 = e.sites[0] ?? {};
    lines.push([
      e.decodedPath, e.root, e.extension, e.refCount, e.rawForms.size, [...e.rawForms].join(' | '),
      e.decodeFailed ? 'yes' : '',
      e.derivative ? 'yes' : '', e.derivative?.style ?? '', e.derivative?.sourcePath ?? '',
      e.derivative?.confidence ?? '', (e.derivative?.reasons ?? []).join(' '),
      e.sitesTruncated || '',
      s0.collection ?? '', s0.fieldPath ?? '', s0._id ?? '',
      ...(checked ? [e.check?.status ?? '', e.check?.contentLength ?? '', e.check?.method ?? '', e.check?.error ?? '',
        e.sourceCheck?.status ?? '', e.sourceCheck?.error ?? ''] : []),
    ].map(csvCell).join(','));
  }
  // BOM: without it Excel decodes the file as the system codepage and every
  // Thai filename in it becomes mojibake.
  fs.writeFileSync(csvPath, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');

  return { jsonPath, csvPath, dir };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const check = process.argv.includes('--check');

  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME,
    maxPoolSize: 5,                       // shared tier — same cap as src/lib/db/connect.js
    serverSelectionTimeoutMS: 10_000,
  });
  const db = mongoose.connection.db;

  console.log('');
  console.log('══ legacy 9Expert file-URL inventory — READ-ONLY, NOTHING WAS WRITTEN ══');
  console.log(`   database   : ${db.databaseName}`);
  console.log(`   legacy host: ${LEGACY_HOST} (apex + www only — subdomains are separate services)`);
  console.log(`   --check    : ${check ? 'ON — HEAD requests will be issued' : 'off — no network activity'}`);
  console.log('');

  // ── enumerate ────────────────────────────────────────────────────────────
  const listed = await db.listCollections().toArray();
  const collections = listed.filter((c) => c.type !== 'view').map((c) => c.name).sort();
  const skipped = listed.filter((c) => c.type === 'view').map((c) => c.name);

  console.log(`  ${collections.length} collection(s) to scan` +
    (skipped.length ? `, ${skipped.length} view(s) skipped: ${skipped.join(', ')}` : ''));
  console.log('  (collections come from listCollections(), not from a hardcoded list and not');
  console.log('   from src/models — the references worth finding are the ones no model covers.)');
  console.log('');

  // ── scan ─────────────────────────────────────────────────────────────────
  const store = createIndexStore();
  const perCollection = new Map();
  const readErrors = [];

  for (const name of collections) {
    let docs = 0;
    let refs = 0;
    const before = store.totalRefs;
    try {
      const cursor = db.collection(name).find({}, { batchSize: BATCH_SIZE });
      for await (const doc of cursor) {
        docs += 1;
        store.docsScanned += 1;
        const id = doc?._id;
        walkStrings(doc, '', (str, fieldPath) => {
          store.stringsTested += 1;
          const hits = extractLegacyUrls(str);
          for (const h of hits) record(store, { collection: name, id, fieldPath, raw: h.url });
        }, 0, store);
      }
      refs = store.totalRefs - before;
    } catch (err) {
      // One unreadable collection must not abort a whole-database inventory.
      readErrors.push({ name, error: err?.message ?? String(err) });
    }
    perCollection.set(name, { docs, refs });
  }

  const entries = [...store.byPath.values()].sort((a, b) => b.refCount - a.refCount || a.decodedPath.localeCompare(b.decodedPath));

  // ── resolve derivatives ──────────────────────────────────────────────────
  // Before the check pass, because --check probes computed SOURCE paths as
  // well as stored ones and cannot know them until this has run.
  const derivatives = [];
  for (const e of entries) {
    const info = resolveDerivative(e.decodedPath);
    if (info) { e.derivative = info; derivatives.push(e); }
  }
  flagResolutionCollisions(derivatives);

  const manifest = buildSourceManifest(entries, { maxSites: MAX_SITES_PER_URL });

  // ── optional reachability pass ───────────────────────────────────────────
  if (check && entries.length) {
    const sourceTargets = new Set(derivatives.map((e) => e.derivative.sourcePath)).size;
    console.log(`── CHECKING ${entries.length} stored URL(s) + ${sourceTargets} computed source(s) against ${LEGACY_PROBE_ORIGIN} ──`);
    console.log(`   HEAD, ${CHECK_CONCURRENCY} at a time, ${CHECK_DELAY_MS}ms apart, ${CHECK_TIMEOUT_MS / 1000}s timeout, redirects followed.`);
    console.log('   Both are probed because a 200 on a derivative proves nothing: Drupal');
    console.log('   regenerates a missing one on demand. The SOURCE result is the evidence.');
    console.log('');
    const sourceChecks = await runChecks(entries);
    for (const s of manifest.sources) {
      s.sourceCheck = sourceChecks.get(s.sourcePath)
        ?? entries.find((e) => !e.derivative && pathOnly(e.decodedPath) === s.sourcePath)?.check
        ?? null;
    }
    console.log('');
  }

  // ── A. scope ─────────────────────────────────────────────────────────────
  console.log('── A. WHAT WAS SCANNED ─────────────────────────────────────────────────');
  console.log('');
  console.log(`  collections scanned : ${collections.length}`);
  console.log(`  documents scanned   : ${store.docsScanned}`);
  console.log(`  string values tested: ${store.stringsTested}`);
  if (store.depthTruncations) {
    console.log(`  ⚠ nesting deeper than ${MAX_DEPTH} was not walked, ${store.depthTruncations} time(s).`);
  }
  if (readErrors.length) {
    console.log('');
    console.log(`  ⚠ ${readErrors.length} collection(s) could not be read — anything they hold is MISSING`);
    console.log('    from every figure below:');
    for (const e of readErrors) console.log(`      ${e.name}: ${e.error}`);
  }
  console.log('');

  // ── B. totals ────────────────────────────────────────────────────────────
  console.log('── B. TOTALS ───────────────────────────────────────────────────────────');
  console.log('');
  console.log(`  references found : ${store.totalRefs}`);
  console.log(`  UNIQUE URLs      : ${entries.length}`);
  console.log('');
  console.log('  These differ on purpose. "references" counts every place a URL is stored;');
  console.log('  "unique" counts distinct files, keyed on the DECODED path — one file linked');
  console.log('  from thirty articles is thirty references and one file to migrate.');
  const multiForm = entries.filter((e) => e.rawForms.size > 1).length;
  const decodeFailed = entries.filter((e) => e.decodeFailed).length;
  if (multiForm) {
    console.log(`  ${multiForm} unique URL(s) are stored in MORE THAN ONE raw form (absolute in one`);
    console.log('  place, root-relative in another, or a different encoding). Every raw form is');
    console.log('  preserved in the JSON under `rawForms`.');
  }
  if (decodeFailed) {
    console.log(`  ⚠ ${decodeFailed} URL(s) could not be percent-decoded — malformed escapes. They are`);
    console.log('    flagged `decodeFailed` in the JSON and will need a human at migration time.');
  }
  if (store.sitesDropped) {
    console.log(`  ⚠ ${store.sitesDropped} reference site(s) were NOT written to the JSON: the per-URL site`);
    console.log(`    list is capped at ${MAX_SITES_PER_URL}. Counts above are complete; the site lists are not.`);
  }
  console.log('');

  // ── C. by root ───────────────────────────────────────────────────────────
  console.log('── C. UNIQUE URLs BY ROOT ──────────────────────────────────────────────');
  console.log('');
  console.log(`  ${pad('root', 24)} ${padL('unique', 8)} ${padL('refs', 8)}`);
  console.log(`  ${rule(24)} ${rule(8)} ${rule(8)}`);
  for (const root of ROOTS) {
    const rows = entries.filter((e) => e.root === root);
    if (!rows.length) { console.log(`  ${pad(root, 24)} ${padL(0, 8)} ${padL(0, 8)}`); continue; }
    console.log(`  ${pad(root, 24)} ${padL(rows.length, 8)} ${padL(rows.reduce((n, e) => n + e.refCount, 0), 8)}`);
  }
  console.log(`  ${rule(24)} ${rule(8)} ${rule(8)}`);
  console.log(`  ${pad('TOTAL', 24)} ${padL(entries.length, 8)} ${padL(store.totalRefs, 8)}`);
  console.log('');
  console.log('  `file` and `files` are DIFFERENT directories on the legacy box, not a');
  console.log('  pluralisation slip, and are counted separately for that reason.');
  console.log('');

  // ── D. by collection and field path ──────────────────────────────────────
  const cfRows = [...store.byCollectionField.values()]
    .sort((a, b) => b.refs - a.refs || a.collection.localeCompare(b.collection) || a.fieldPath.localeCompare(b.fieldPath));

  console.log('── D. BY COLLECTION AND FIELD PATH ─────────────────────────────────────');
  console.log('');
  if (!cfRows.length) {
    console.log('  (nothing found)');
  } else {
    console.log(`  ${pad('collection', 26)} ${pad('field path', 40)} ${padL('refs', 7)} ${padL('unique', 7)}`);
    console.log(`  ${rule(26)} ${rule(40)} ${rule(7)} ${rule(7)}`);
    for (const r of cfRows.slice(0, FIELD_TABLE_LIMIT)) {
      console.log(`  ${pad(ellipsis(r.collection, 26), 26)} ${pad(ellipsis(r.fieldPath, 40), 40)} ${padL(r.refs, 7)} ${padL(r.urls.size, 7)}`);
    }
    if (cfRows.length > FIELD_TABLE_LIMIT) {
      const rest = cfRows.slice(FIELD_TABLE_LIMIT);
      console.log(`  … ${rest.length} further field path(s), ${rest.reduce((n, r) => n + r.refs, 0)} refs — full list in the JSON.`);
    }
    console.log('');
    console.log('  Field paths are dotted and include array indices, e.g. `content.blocks.3.html`,');
    console.log('  so a row can be pasted straight into a query to find the document again.');
  }
  console.log('');

  // ── E. by extension ──────────────────────────────────────────────────────
  const byExt = new Map();
  for (const e of entries) {
    const cur = byExt.get(e.extension) ?? { unique: 0, refs: 0 };
    cur.unique += 1; cur.refs += e.refCount;
    byExt.set(e.extension, cur);
  }
  console.log('── E. BY FILE EXTENSION ────────────────────────────────────────────────');
  console.log('');
  if (!byExt.size) {
    console.log('  (nothing found)');
  } else {
    console.log(`  ${pad('ext', 12)} ${padL('unique', 8)} ${padL('refs', 8)}`);
    console.log(`  ${rule(12)} ${rule(8)} ${rule(8)}`);
    for (const [ext, v] of [...byExt.entries()].sort((a, b) => b[1].unique - a[1].unique || a[0].localeCompare(b[0]))) {
      console.log(`  ${pad(ext, 12)} ${padL(v.unique, 8)} ${padL(v.refs, 8)}`);
    }
  }
  console.log('');

  // ── F. other ─────────────────────────────────────────────────────────────
  //
  // Split by "does it have a file extension". Both halves are root=`other` and
  // both are listed in full, but they mean completely different things and
  // printing them as one list buries the half that matters: an extensionless
  // path on the legacy host is a PAGE, and pages are a redirect problem, while
  // an extension-bearing path under an unplanned root is a FILE nobody has
  // arranged to copy. One changes the file migration; the other does not.
  const others = entries.filter((e) => e.root === 'other');
  const otherFiles = others.filter((e) => e.extension !== '(none)');
  const otherPages = others.filter((e) => e.extension === '(none)');

  const printOther = (e) => {
    console.log(`  · ${e.decodedPath}`);
    console.log(`      ${e.refCount} ref(s), ext=${e.extension}` +
      (e.rawForms.size > 1 ? `, ${e.rawForms.size} raw forms` : '') +
      (e.decodeFailed ? ', DECODE FAILED' : ''));
    const s0 = e.sites[0];
    if (s0) console.log(`      first seen: ${s0.collection} _id=${s0._id} ${s0.fieldPath}`);
  };

  console.log('── F. ROOT = `other` — THE MOST IMPORTANT SECTION IN THIS REPORT ───────');
  console.log('');
  if (!others.length) {
    console.log('  NONE. Every reference found sits under a root this migration already knows');
    console.log('  about. That is the good outcome — but it is a statement about what is in the');
    console.log('  database today, not about what the legacy server serves.');
    console.log('');
  } else {
    console.log(`  ${others.length} URL(s) sit under a root this migration did NOT anticipate:`);
    console.log(`    ${padL(otherFiles.length, 5)} WITH a file extension  → unplanned FILES. F1 below.`);
    console.log(`    ${padL(otherPages.length, 5)} without one            → page links. F2 below.`);
    console.log('');

    console.log('  ── F1. UNANTICIPATED FILES ───────────────────────────────────────────');
    console.log('');
    if (!otherFiles.length) {
      console.log('    NONE. Every file-shaped reference in the database falls under a root the');
      console.log('    migration already knows about. This is the finding this script exists to');
      console.log('    produce, and it came back clean.');
    } else {
      console.log(`    ${otherFiles.length} file(s) live in a directory on the legacy box nobody has planned`);
      console.log('    for. Read every line — this is the part that changes the migration plan.');
      console.log('');
      for (const e of otherFiles) printOther(e);
    }
    console.log('');

    console.log('  ── F2. PAGE LINKS ON THE LEGACY HOST — NOT FILES ─────────────────────');
    console.log('');
    if (!otherPages.length) {
      console.log('    NONE.');
    } else {
      const pageRefs = otherPages.reduce((n, e) => n + e.refCount, 0);
      console.log(`    ${otherPages.length} extensionless path(s), ${pageRefs} reference(s) — /articles/…, course pages,`);
      console.log('    /registration/public?…, and the bare site root. These are Drupal PAGES,');
      console.log('    not files: no file migration will fix them, and they are out of scope for');
      console.log('    Phase 0 as specified.');
      console.log('');
      console.log('    They are printed anyway because they are a REDIRECT problem of the same');
      console.log('    shutdown, and this is the only inventory that has counted them. Most are');
      console.log('    stored as absolute https://www.9experttraining.com/… inside article bodies,');
      console.log('    so they will 404 on the same day the files do.');
      console.log('');
      for (const e of otherPages) printOther(e);
    }
    console.log('');
  }

  // ── G. drupal image-style derivatives ────────────────────────────────────
  //
  // Discovered by this scan, not anticipated by the brief. Big enough to change
  // what "migrate the files" means, so it gets its own section rather than a
  // line in a table. Resolution itself happened before the check pass, above.
  console.log('── G. DRUPAL IMAGE-STYLE DERIVATIVES — THESE ARE NOT SOURCE FILES ──────');
  console.log('');
  if (!derivatives.length) {
    console.log('  None found.');
  } else {
    const derivRefs = derivatives.reduce((n, e) => n + e.refCount, 0);
    const tokenised = derivatives.filter((e) => e.derivative.tokenised).length;
    const originals = new Set(derivatives.map((e) => e.derivative.sourcePath));

    console.log(`  ${derivatives.length} of the ${entries.length} unique URLs (${derivRefs} refs) point at`);
    console.log('  /sites/default/files/styles/<style>/public/… — Drupal\'s generated image');
    console.log('  cache, NOT the uploaded originals.');
    console.log('');
    console.log('  WHY THIS MATTERS MORE THAN ITS ROW IN SECTION C SUGGESTS:');
    console.log('   · These are derived files. Copying styles/ copies a CACHE; the originals it');
    console.log('     was generated from live elsewhere under /sites/default/files/ and are the');
    console.log('     things that actually have to survive the shutdown.');
    console.log(`   · ${tokenised} of them carry an ?itok= query. That is an HMAC signed with the site's`);
    console.log('     private key. Drupal REFUSES a derivative URL whose token does not verify,');
    console.log('     so these URLs cannot simply be re-pointed at another Drupal, and once this');
    console.log('     box is gone the token means nothing at all.');
    if (originals.size < derivatives.length) {
      console.log(`   · They collapse to ${originals.size} probable original file(s) — the real number to`);
      console.log('     migrate for this group is that one, not the derivative count.');
    } else {
      console.log(`   · They resolve to ${originals.size} probable originals — the SAME count, so there is no`);
      console.log('     saving here: each derivative has its own source file. What changes is the');
      console.log('     PATH. Every one of these stored URLs points somewhere that will not exist,');
      console.log('     even if the file it was generated from is copied across intact.');
    }
    console.log('');
    console.log('  sourcePath is COMPUTED, not observed. Drupal appends the new extension when a');
    console.log('  style converts format (foo.png → foo.png.webp) and leaves the name alone when');
    console.log('  it does not; the stored path does not say which happened. Without --check');
    console.log('  NOTHING here has been confirmed to exist on the legacy server.');
    console.log('');

    const byStyle = new Map();
    for (const e of derivatives) {
      const cur = byStyle.get(e.derivative.style) ?? { unique: 0, refs: 0 };
      cur.unique += 1; cur.refs += e.refCount;
      byStyle.set(e.derivative.style, cur);
    }
    console.log(`  ${pad('image style', 30)} ${padL('unique', 8)} ${padL('refs', 8)}`);
    console.log(`  ${rule(30)} ${rule(8)} ${rule(8)}`);
    for (const [style, v] of [...byStyle.entries()].sort((a, b) => b[1].unique - a[1].unique)) {
      console.log(`  ${pad(ellipsis(style, 30), 30)} ${padL(v.unique, 8)} ${padL(v.refs, 8)}`);
    }
    console.log('');
    console.log('  example resolution:');
    const ex = derivatives.find((e) => e.derivative.confidence === 'high') ?? derivatives[0];
    console.log(`    stored ${ex.decodedPath}`);
    console.log(`    source ${ex.derivative.sourcePath}   (computed, ${ex.derivative.confidence} confidence)`);
    console.log('');

    // ── G1. low-confidence resolutions, named individually ─────────────────
    const lowConf = derivatives.filter((e) => e.derivative.confidence === 'low');
    console.log('  ── G1. LOW-CONFIDENCE RESOLUTIONS ────────────────────────────────────');
    console.log('');
    if (!lowConf.length) {
      console.log(`    NONE. All ${derivatives.length} derivative paths matched the expected shape cleanly:`);
      console.log('    a styles/<style>/public/ prefix, and either no appended format extension or');
      console.log('    one sitting on top of a recognised image extension. That does NOT mean the');
      console.log('    computed sources exist — only that the arithmetic was unambiguous. Run with');
      console.log('    --check to find out whether the files are actually there.');
    } else {
      console.log(`    ${lowConf.length} of ${derivatives.length} derivative paths did not match the expected shape cleanly.`);
      console.log('    Each is listed in full rather than folded into a total, because a source');
      console.log('    path that is quietly wrong produces a migration that quietly loses a file.');
      console.log('');
      console.log('    LOW CONFIDENCE MEANS UNVERIFIABLE BY ARITHMETIC, NOT WRONG. The most');
      console.log('    common reason — ambiguous-appended-ext — fires on a filename that already');
      console.log('    contains a dot (`thailand-4.0.png`), where what sits under the final');
      console.log('    extension is not itself an image extension. In that case NOTHING was');
      console.log('    stripped, which for a genuinely dotted filename is the correct answer.');
      console.log('    The flag exists because the stored path cannot prove it. Eyeball them.');
      console.log('');

      const byReason = new Map();
      for (const e of lowConf) {
        for (const r of new Set(e.derivative.reasons)) byReason.set(r, (byReason.get(r) ?? 0) + 1);
      }
      console.log(`    ${pad('reason', 30)} ${padL('count', 7)}`);
      console.log(`    ${rule(30)} ${rule(7)}`);
      for (const [r, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${pad(r, 30)} ${padL(n, 7)}`);
      }
      console.log('');
      for (const e of lowConf) {
        console.log(`    · ${e.decodedPath}`);
        console.log(`        → ${e.derivative.sourcePath}`);
        console.log(`        style=${e.derivative.style} refs=${e.refCount} reasons=${[...new Set(e.derivative.reasons)].join(', ')}`);
        const s0 = e.sites[0];
        if (s0) console.log(`        first seen: ${s0.collection} _id=${s0._id} ${s0.fieldPath}`);
      }
    }
  }
  console.log('');

  // ── H. the sanity check ──────────────────────────────────────────────────
  console.log('── H. SANITY CHECK — ARTICLE COVERS vs THE CODEBASE COMMENT ────────────');
  console.log('');
  console.log(`  src/components/articles/ArticleTaxonomyChips.jsx claims: of ${CLAIMED_ACTIVE_ARTICLES} ACTIVE`);
  console.log(`  articles, ${CLAIMED_LEGACY_COVERS} covers are legacy files on www.${LEGACY_HOST}.`);
  console.log('');

  const coverRows = cfRows.filter((r) => r.collection === 'articles' && r.fieldPath === 'coverUrl');
  const coverRefs = coverRows.reduce((n, r) => n + r.refs, 0);
  const coverUnique = coverRows.reduce((n, r) => n + r.urls.size, 0);
  const coverEntries = entries.filter((e) =>
    e.sites.some((s) => s.collection === 'articles' && s.fieldPath === 'coverUrl'));
  const coverOriginals = coverEntries.filter((e) => isArticleCoverPath(e.decodedPath));
  const coverDerivatives = coverEntries.filter((e) => e.derivative);
  const coverElsewhere = coverEntries.length - coverOriginals.length - coverDerivatives.length;

  // A second, narrower read of the SAME question, so the comparison is not
  // hostage to the walker: count articles whose coverUrl is a legacy URL,
  // split by `active`, straight from the collection. Read-only, ~500 docs.
  let activeLegacyCovers = null;
  let inactiveLegacyCovers = null;
  let activeArticles = null;
  let totalArticles = null;
  // The handful of covers that are NOT derivatives. Named individually below —
  // they are few enough to look at one by one, and a count would hide the fact
  // that they are the only covers pointing at a file that actually exists as
  // stored.
  const nonDerivativeCovers = [];
  if (collections.includes('articles')) {
    activeLegacyCovers = 0; inactiveLegacyCovers = 0; activeArticles = 0; totalArticles = 0;
    const cursor = db.collection('articles').find(
      {},
      { projection: { active: 1, coverUrl: 1, title: 1, slug: 1 }, batchSize: BATCH_SIZE },
    );
    for await (const a of cursor) {
      totalArticles += 1;
      const isActive = a.active !== false;   // undefined reads as active, per the model default
      if (isActive) activeArticles += 1;
      const cover = typeof a.coverUrl === 'string' ? a.coverUrl.trim() : '';
      if (!cover || !isWholeLegacyUrl(cover)) continue;
      if (isActive) activeLegacyCovers += 1; else inactiveLegacyCovers += 1;

      const decoded = decodePath(toPath(cover)).decoded;
      if (!resolveDerivative(decoded)) {
        nonDerivativeCovers.push({
          _id: String(a._id),
          title: a.title ?? '(untitled)',
          slug: a.slug ?? '',
          active: isActive,
          coverUrl: cover,
          decodedPath: decoded,
        });
      }
    }
  }

  if (activeLegacyCovers === null) {
    console.log('  `articles` collection NOT PRESENT in this database. The claim cannot be');
    console.log('  checked here at all, and every figure above is from a different dataset than');
    console.log('  the one that comment was measured on.');
  } else {
    console.log(`  articles in this database        : ${totalArticles}   (active: ${activeArticles})`);
    console.log(`  articles.coverUrl legacy refs    : ${coverRefs}   (${coverUnique} unique cover files)`);
    console.log(`    of which on ACTIVE articles    : ${activeLegacyCovers}`);
    console.log(`    of which on INACTIVE articles  : ${inactiveLegacyCovers}`);
    console.log('');
    console.log('  where those cover files actually point:');
    console.log(`    original  /sites/default/files/articles/cover/…        : ${coverOriginals.length}`);
    console.log(`    DERIVED   /sites/default/files/styles/…/public/…       : ${coverDerivatives.length}`);
    console.log(`    anywhere else                                          : ${coverElsewhere}`);
    if (coverDerivatives.length) {
      const dOrig = new Set(coverDerivatives.map((e) => e.derivative.sourcePath));
      console.log('');
      console.log(`    The count MATCHES the comment, but ${coverDerivatives.length} of the ${coverEntries.length} covers are Drupal`);
      console.log('    image-style derivatives, not uploaded files — section G. The comment is');
      console.log('    right about the NUMBER and silent about the harder problem underneath it:');
      console.log(`    those ${coverDerivatives.length} URLs resolve to ${dOrig.size} probable originals under articles/cover/,`);
      console.log('    and every one of them is a path that will not exist after the cutover even');
      console.log('    if the source image is copied. They also carry itok tokens signed with the');
      console.log('    dying box\'s private key. Migrating "the covers" therefore means rewriting');
      console.log('    coverUrl on nearly every article, not just moving files.');
    }
    console.log('');

    // ── H1. the non-derivative covers, one by one ──────────────────────────
    console.log('  ── H1. COVERS THAT ARE NOT DERIVATIVES ───────────────────────────────');
    console.log('');
    if (!nonDerivativeCovers.length) {
      console.log('    NONE — every legacy cover in the collection is an image-style derivative.');
    } else {
      console.log(`    ${nonDerivativeCovers.length} article(s) store a cover that points straight at a file rather than`);
      console.log('    at the styles/ cache. These are the only covers whose stored URL names');
      console.log('    something that can be copied as-is, so they are listed rather than counted.');
      console.log('');
      for (const c of nonDerivativeCovers) {
        console.log(`    · _id=${c._id}${c.active ? '' : '   [INACTIVE]'}`);
        console.log(`        title : ${c.title}`);
        if (c.slug) console.log(`        slug  : ${c.slug}`);
        console.log(`        cover : ${c.coverUrl}`);
        if (c.decodedPath !== c.coverUrl) console.log(`        path  : ${c.decodedPath}`);
      }
    }
    console.log('');

    const drift = activeLegacyCovers - CLAIMED_LEGACY_COVERS;
    if (Math.abs(drift) <= COVER_TOLERANCE) {
      console.log(`  ✓ MATCHES. ${activeLegacyCovers} active legacy covers vs a claimed ${CLAIMED_LEGACY_COVERS}` +
        `${drift === 0 ? '' : ` (${drift > 0 ? '+' : ''}${drift})`}.`);
      console.log(`    Within the ±${COVER_TOLERANCE} tolerance this check allows for articles added or`);
      console.log('    retired since that comment was written. The scan is reading the field the');
      console.log('    comment was measured on.');
    } else {
      console.log(`  ⚠ DOES NOT MATCH. Measured ${activeLegacyCovers} active legacy covers against a claimed`);
      console.log(`    ${CLAIMED_LEGACY_COVERS} — a drift of ${drift > 0 ? '+' : ''}${drift}, outside the ±${COVER_TOLERANCE} tolerance.`);
      console.log('');
      console.log('    DO NOT paper over this. There are only two explanations and they lead to');
      console.log('    opposite actions:');
      console.log(`      (a) the comment is STALE — the article set has moved since it was written.`);
      console.log(`          Test: this database holds ${activeArticles} active articles against the ${CLAIMED_ACTIVE_ARTICLES}`);
      console.log('          it claims. If that has moved too, the comment is simply old.');
      console.log('      (b) this SCAN is wrong — reading the wrong field, or missing a form the');
      console.log('          covers are stored in. Test: compare the coverUrl row in section D');
      console.log('          against the article count above; a large gap means covers are stored');
      console.log('          somewhere this scan is not looking.');
    }
  }
  console.log('');

  // ── I. reachability ──────────────────────────────────────────────────────
  if (check) {
    console.log('── I. REACHABILITY (--check) ───────────────────────────────────────────');
    console.log('');
    const ok = entries.filter((e) => e.check?.ok).length;
    const broken = entries.filter((e) => e.check && !e.check.ok && e.check.status !== null);
    const errored = entries.filter((e) => e.check && e.check.status === null);
    const redirected = entries.filter((e) => e.check?.finalUrl).length;

    console.log(`  reachable (2xx)      : ${ok} / ${entries.length}`);
    console.log(`  ALREADY BROKEN (non-2xx) : ${broken.length}`);
    console.log(`  no answer (timeout / network) : ${errored.length}`);
    if (redirected) console.log(`  followed a redirect  : ${redirected}`);
    console.log('');

    const byStatus = new Map();
    for (const e of entries) {
      const k = e.check?.status ?? (e.check?.error ? 'error' : 'unchecked');
      byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
    }
    console.log(`  ${pad('status', 12)} ${padL('urls', 8)}`);
    console.log(`  ${rule(12)} ${rule(8)}`);
    for (const [k, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pad(k, 12)} ${padL(n, 8)}`);
    }
    console.log('');
    const brokenRefs = broken.reduce((n, e) => n + e.refCount, 0);
    console.log(`  The ${broken.length} already-broken URL(s) account for ${brokenRefs} reference(s). Those files are`);
    console.log('  404 TODAY — the shutdown cannot break them further, and they may not be worth');
    console.log('  migrating at all. Decide that before sizing the copy, not after.');
    console.log('');
    console.log('  A "no answer" is NOT the same as a 404 and must not be counted as one: it is');
    console.log('  this script failing to reach the host, which says nothing about the file.');
    console.log('');

    // ── I1. the check that actually matters ────────────────────────────────
    console.log('  ── I1. COMPUTED SOURCE PATHS — THE RESULT THAT COUNTS ────────────────');
    console.log('');
    const checkedSources = manifest.sources.filter((s) => s.sourceCheck);
    const srcOk = checkedSources.filter((s) => s.sourceCheck.ok);
    const srcMissing = checkedSources.filter((s) => s.sourceCheck.status !== null && !s.sourceCheck.ok);
    const srcNoAnswer = checkedSources.filter((s) => s.sourceCheck.status === null);

    console.log(`    source files probed  : ${checkedSources.length} of ${manifest.sources.length}`);
    console.log(`    PRESENT (2xx)        : ${srcOk.length}`);
    console.log(`    MISSING (non-2xx)    : ${srcMissing.length}`);
    console.log(`    no answer            : ${srcNoAnswer.length}`);
    console.log('');
    console.log('    Read this against section I above, not instead of it. A derivative that');
    console.log('    answers 200 while its source 404s means Drupal is still serving a cached');
    console.log('    file whose original is already gone — the cache dies with the box and');
    console.log('    there is nothing left to copy.');

    // `status !== null` matters: a TIMEOUT is not a missing source. Without it
    // this list quietly promoted "we could not reach the server in 10s" into
    // "the file is gone", which is a different fact leading to a different
    // decision. Timeouts are counted in srcNoAnswer above and nowhere else.
    const zombie = derivatives.filter(
      (e) => e.check?.ok && e.sourceCheck && e.sourceCheck.status !== null && !e.sourceCheck.ok,
    );
    if (zombie.length) {
      console.log('');
      console.log(`    ⚠ ${zombie.length} derivative(s) are exactly that case — live cache, CONFIRMED missing source:`);
      for (const e of zombie.slice(0, 40)) {
        console.log(`      ${e.decodedPath}`);
        console.log(`        source ${e.derivative.sourcePath} → ${e.sourceCheck.status ?? e.sourceCheck.error}`);
      }
      if (zombie.length > 40) console.log(`      … ${zombie.length - 40} more — full list in the JSON.`);
    }

    const lowConfMissing = manifest.sources.filter(
      (s) => s.confidence === 'low' && s.sourceCheck && !s.sourceCheck.ok,
    );
    if (lowConfMissing.length) {
      console.log('');
      console.log(`    ${lowConfMissing.length} MISSING source(s) came from a LOW-CONFIDENCE resolution. For these,`);
      console.log('    "missing" may mean the computed path is wrong rather than the file gone.');
      console.log('    Check the path before concluding anything about the file.');
    }
    console.log('');
  }

  // ── J. the canonical source-file manifest ────────────────────────────────
  console.log('── J. CANONICAL SOURCE-FILE MANIFEST ───────────────────────────────────');
  console.log('');
  console.log('  One entry per unique SOURCE file: derivatives collapsed onto the file they');
  console.log('  were generated from, and a file referenced both directly and through a');
  console.log('  derivative merged into a single entry.');
  console.log('');
  const mergedBoth = manifest.sources.filter((s) => s.directRefCount > 0 && s.derivativeRefCount > 0);
  console.log(`  unique URLs in the scan     : ${entries.length}`);
  console.log(`  unique SOURCE files         : ${manifest.stats.totalSources}`);
  console.log(`  reached ONLY via derivatives: ${manifest.stats.reachedOnlyViaDerivatives}`);
  console.log(`  reached BOTH ways           : ${mergedBoth.length}`);
  console.log(`  low-confidence resolutions  : ${manifest.stats.lowConfidence}`);
  console.log('');
  if (mergedBoth.length === 0 && manifest.stats.reachedOnlyViaDerivatives > 0) {
    console.log('  NOTHING is referenced both directly and through a derivative. The two');
    console.log('  populations are disjoint: no stored URL names a file that some other stored');
    console.log('  URL reaches via styles/. Worth knowing before a rewrite — there is no case');
    console.log('  where one file needs two different replacements.');
    console.log('');
  }

  console.log('  SCOPE FILTERS — applied as flags, not deletions. Both sets are written out,');
  console.log('  and every entry carries the reasons it was excluded, so reversing a decision');
  console.log('  means ignoring a flag rather than re-running the scan.');
  console.log('');
  console.log(`  ${pad('filter', 34)} ${padL('removed', 9)}  requested?`);
  console.log(`  ${rule(34)} ${rule(9)}  ${rule(10)}`);
  for (const f of SCOPE_FILTERS) {
    console.log(`  ${pad(ellipsis(f.label, 34), 34)} ${padL(manifest.removedBy.get(f.id) ?? 0, 9)}  ${f.requested ? 'yes' : 'NO — mine'}`);
  }
  console.log('');
  for (const f of SCOPE_FILTERS) {
    if (f.requested) continue;
    console.log(`  "${f.label}"`);
    console.log('  was NOT asked for — it is mine, and it is flagged as such so it can be');
    console.log('  overruled. A source-FILE manifest should not contain');
    console.log('  Drupal page URLs; if you want them in, ignore the flag rather than');
    console.log('  re-running anything. They are in the full set either way.');
  }
  console.log('');
  console.log('  A source caught by two filters is counted under both, so the removed column');
  console.log('  can sum to more than the difference between the two totals below.');
  console.log('');
  console.log(`  FULL manifest    : ${manifest.stats.totalSources} source file(s)`);
  console.log(`  IN-SCOPE manifest: ${manifest.stats.inScopeSources} source file(s)`);
  console.log('');

  const inScopeOnlyDeriv = manifest.inScope.filter((s) => s.reachedOnlyViaDerivatives).length;
  const inScopeLowConf = manifest.inScope.filter((s) => s.confidence === 'low').length;
  console.log('  Within the in-scope set:');
  console.log(`    reached ONLY via a derivative : ${inScopeOnlyDeriv}`);
  console.log(`    low-confidence resolution     : ${inScopeLowConf}`);
  console.log('');
  console.log('  top source files by reference count:');
  console.log(`  ${pad('source path', 62)} ${padL('refs', 6)} ${padL('via', 5)}`);
  console.log(`  ${rule(62)} ${rule(6)} ${rule(5)}`);
  for (const s of manifest.inScope.slice(0, 15)) {
    const via = s.reachedOnlyViaDerivatives ? 'deriv' : (s.derivativeRefCount ? 'both' : 'direct');
    console.log(`  ${pad(ellipsis(s.sourcePath, 62), 62)} ${padL(s.refCount, 6)} ${padL(via, 5)}`);
  }
  console.log('');

  // ── files ────────────────────────────────────────────────────────────────
  // One timestamp for every report a run produces, so the inventory and the
  // manifest it was derived from can never be mistaken for different scans.
  const reportDir = path.resolve(process.cwd(), 'reports', 'legacy-urls');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const written = writeReports(entries, {
    database: db.databaseName,
    collectionsScanned: collections,
    collectionsSkipped: skipped,
    docsScanned: store.docsScanned,
    stringsTested: store.stringsTested,
    depthTruncations: store.depthTruncations,
    sitesDropped: store.sitesDropped,
    totalRefs: store.totalRefs,
  }, check, reportDir, stamp);

  const manifestFiles = writeSourceManifest(
    manifest,
    { database: db.databaseName, legacyHost: LEGACY_HOST },
    check,
    reportDir,
    stamp,
  );

  console.log('── REPORTS WRITTEN ─────────────────────────────────────────────────────');
  console.log('');
  console.log('  URL inventory:');
  console.log(`    ${path.relative(process.cwd(), written.jsonPath)}`);
  console.log(`    ${path.relative(process.cwd(), written.csvPath)}`);
  console.log('  source manifest:');
  console.log(`    ${path.relative(process.cwd(), manifestFiles.jsonPath)}`);
  console.log(`    ${path.relative(process.cwd(), manifestFiles.csvPath)}`);
  console.log(`    ${path.relative(process.cwd(), manifestFiles.inScopeCsvPath)}`);
  console.log('');
  console.log('  /reports/ is gitignored — these name document _ids and do not belong in the');
  console.log('  repository. The CSVs carry a UTF-8 BOM so Excel renders Thai filenames.');
  console.log('');

  // ── J. what this did not look at ─────────────────────────────────────────
  console.log('── LIMITS OF THIS SCAN — READ BEFORE TREATING THE TOTAL AS COMPLETE ────');
  console.log('');
  console.log('  · A root-relative bare-webroot IMAGE (`/foo.jpg`, no directory) is NOT matched.');
  console.log('    From inside the database it is indistinguishable from an asset in this');
  console.log(`    repo's public/ directory. Only these extensions are matched bare at the`);
  console.log(`    webroot: ${WEBROOT_DOC_EXTENSIONS.join(', ')}.`);
  console.log('    The same file in absolute or protocol-relative form IS caught.');
  console.log('  · Subdomains (academy., reviews.) are deliberately excluded — separate live');
  console.log('    services, not the box being shut down.');
  console.log('  · An unquoted URL containing a literal space, outside an HTML attribute and');
  console.log('    not the whole field value, truncates at the space. There is no delimiter to');
  console.log('    tell the script where such a URL ends.');
  console.log('  · Legacy URLs stored inside a Binary/BSON blob, or built at render time from');
  console.log('    fragments, are invisible to a string scan by construction.');
  console.log('  · Without --check, nothing here says whether any of these files still exist.');
  console.log('  · Every derivative sourcePath is COMPUTED from the stored path. Only --check');
  console.log('    turns that arithmetic into evidence.');
  console.log('');

  // ── closing summary ──────────────────────────────────────────────────────
  console.log('══ SUMMARY ═════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  unique source files IN SCOPE      : ${manifest.stats.inScopeSources}`);
  console.log(`    of which reached ONLY via a derivative : ${inScopeOnlyDeriv}`);
  console.log(`    of which LOW-CONFIDENCE resolutions    : ${inScopeLowConf}`);
  console.log(`  excluded by the scope filters      : ${manifest.stats.totalSources - manifest.stats.inScopeSources}`);
  console.log(`  full manifest                      : ${manifest.stats.totalSources}`);
  console.log('');
  if (check) {
    const inScopeChecked = manifest.inScope.filter((s) => s.sourceCheck);
    const present = inScopeChecked.filter((s) => s.sourceCheck.ok).length;
    const missing = inScopeChecked.filter((s) => s.sourceCheck.status !== null && !s.sourceCheck.ok).length;
    const unknown = inScopeChecked.filter((s) => s.sourceCheck.status === null).length;
    // "missing" is deliberately split. A 404 is a fact about the file; a 429 or
    // a 403 is a fact about the sweep, and lumping them together is how a
    // rate-limited run comes to look like a pile of dead files.
    const gone = inScopeChecked.filter((s) => s.sourceCheck.status === 404 || s.sourceCheck.status === 410).length;
    const inconclusive = missing - gone;
    console.log(`  sources CONFIRMED PRESENT (2xx)    : ${present}`);
    console.log(`  sources CONFIRMED GONE (404/410)   : ${gone}`);
    if (inconclusive) console.log(`  sources INCONCLUSIVE (other non-2xx): ${inconclusive} — NOT evidence of absence`);
    if (unknown) console.log(`  sources with NO ANSWER             : ${unknown} — not the same as missing`);
    const unprobed = manifest.inScope.length - inScopeChecked.length;
    if (unprobed) console.log(`  not probed                         : ${unprobed}`);
    console.log('');
    if (rateLimitHits) {
      console.log(`  ⚠ RATE LIMITED ${rateLimitHits} time(s) — the server asked us to slow down.`);
      console.log(`    Each was retried after a backoff. If any 429 still appears in the`);
      console.log(`    results above, lower --concurrency (now ${CHECK_CONCURRENCY}) or raise --delay (now ${CHECK_DELAY_MS}ms).`);
    } else {
      console.log(`  ✓ NO RATE LIMITING at --concurrency ${CHECK_CONCURRENCY} --delay ${CHECK_DELAY_MS}ms.`);
      console.log('    Every non-2xx above is a fact about the file, not about the sweep.');
    }
  } else {
    console.log('  sources confirmed present          : NOT MEASURED — run with --check.');
    console.log('  Until then the manifest is a list of paths that SHOULD exist, computed from');
    console.log('  what the database stores. No byte of it has been verified against the server.');
  }
  console.log('');
  console.log('══ end of report. No documents, indexes or collections were modified. ═══');
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
