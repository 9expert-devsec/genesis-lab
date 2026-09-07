/**
 * ARTICLE IMAGE COVERAGE — do we actually hold every image an article points at?
 * READ-ONLY. Mongo reads plus HTTP HEADs. Writes nothing but files under reports/.
 *
 *   node --env-file=.env.local scripts/audit-article-image-coverage.mjs
 *   … --concurrency 3 --delay 120 --origin https://genesis-lab.9expert.app
 *   … --no-probe            skip the network entirely (registry-only, WEAKER)
 *
 * ══ THE QUESTION THIS ANSWERS, AND THE ONE IT DOES NOT ══════════════════════
 *
 * At cutover www.9experttraining.com repoints at this app. Every absolute
 * legacy URL sitting inside an article body then resolves through OUR delivery
 * layer instead of the old Drupal box. A file we do not hold stops being a
 * historical curiosity at that moment and becomes a 404 on a live page.
 *
 * So the question is narrow: for the ARTICLES COLLECTION, is every image
 * reference backed by bytes we hold? Not "did the backfill report success" —
 * the backfill measured /opt/www, a disk mirror taken in August. This measures
 * the database as it stands today against the delivery layer as it stands
 * today, and those can disagree in both directions.
 *
 * ── WHY NOTHING HERE RE-IMPLEMENTS THE MATCHING RULES ───────────────────────
 * Extraction, host matching, percent-decoding, the trailing-punctuation trim
 * and the styles/ derivative resolution all come from
 * scripts/lib/legacy-url-extract.mjs and scripts/lib/legacy-source-manifest.mjs
 * — the same modules the inventory and the rewrite share. The public_id
 * derivation comes from src/lib/legacyPublicId.js, the same function the
 * uploader used. The delivery transformation comes from
 * src/lib/legacyTransforms.mjs, the same constants next.config.mjs builds its
 * rewrites from.
 *
 * A second regex over article HTML would be subtly wrong within a week — the
 * `&`→`and` and `#`→`sharp` substitutions and the trailing-space trim are not
 * things anyone re-derives correctly from memory. If a rule needs changing,
 * change it in the shared module and every consumer moves together.
 *
 * ── A STATUS FIELD IS A CLAIM. A 200 IS EVIDENCE. ───────────────────────────
 * legacy_file_migrations.status says what a run believed in August. Assets can
 * be destroyed from /admin/media afterwards (there is a `deleted` status for
 * exactly that), a public_id can have been folded onto another file's id by
 * Cloudinary's case-insensitivity, and a rewrite rule can fail to cover a path
 * whose bytes are present. None of those change the row.
 *
 * So every source file is MEASURED, at two different origins, because they
 * answer two different questions and the difference is the interesting part:
 *
 *   STORAGE   res.cloudinary.com, at the public_id re-derived here from the
 *             source path. Answers: DO WE HOLD THE BYTES?
 *   CUTOVER   this app's origin, at the STORED path exactly as an article
 *             emits it, derivative and ?itok= and all. Answers: WILL THE LIVE
 *             ARTICLE 404 THE DAY WWW REPOINTS?
 *
 * A file can pass STORAGE and fail CUTOVER (bytes present, no rewrite rule
 * reaches them) and that is a delivery defect, not a migration gap. The report
 * keeps them apart rather than merging them into one "broken" number.
 *
 * ── TRANSPORT IS NOT TRUTH ──────────────────────────────────────────────────
 * A 429, a 5xx, a timeout or a `fetch failed` says nothing about whether a file
 * exists; it says the network was busy. Counting one as missing has already
 * produced two false alarms on this migration. Those are retried with backoff
 * at low concurrency and, if they never resolve, reported in their OWN
 * category — never folded into missing.
 *
 * A 404 is believed the first time and never retried. Retrying 404s until one
 * of them 200s is how an audit built to find missing files stops finding them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

import {
  extractLegacyUrls,
  toPath,
  decodePath,
  classifyRoot,
  walkStrings,
  LEGACY_MATCH_HOST,
} from './lib/legacy-url-extract.mjs';
import {
  resolveDerivative,
  pathOnly,
  extensionOf,
  csvCell,
} from './lib/legacy-source-manifest.mjs';
import {
  IMAGE_EXTENSIONS,
  transformForExtension,
  deliveryUrl,
} from '../src/lib/legacyTransforms.mjs';
import {
  legacyPathToPublicId,
  LEGACY_PUBLIC_ID_PREFIX,
} from '../src/lib/legacyPublicId.js';

// ── arguments ───────────────────────────────────────────────────────────────

const ARGV = process.argv.slice(2);
const argOf = (flag, fallback = null) => {
  const i = ARGV.indexOf(flag);
  return i === -1 ? fallback : ARGV[i + 1];
};
const has = (flag) => ARGV.includes(flag);

const COLLECTION = 'articles';
const ORIGIN = argOf('--origin', 'https://genesis-lab.9expert.app').replace(/\/$/, '');
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME ?? 'ddva7xvdt';
const CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUD}`;
const BLOB_BASE = (process.env.BLOB_PUBLIC_BASE ?? '').replace(/\/$/, '');

const CONCURRENCY = Number(argOf('--concurrency', '3'));
const DELAY_MS = Number(argOf('--delay', '120'));
const TIMEOUT_MS = Number(argOf('--timeout', '15000'));
/** Attempts for a TRANSPORT failure only. A 404 gets exactly one. */
const TRANSPORT_ATTEMPTS = 5;
const PROBE = !has('--no-probe');

const REPORT_DIR = path.join('reports', 'article-image-coverage');

/**
 * WHEN THE FULL-DISK BACKFILL RAN. Read from the data rather than typed in:
 * it is the createdAt/updatedAt envelope of legacy_file_migrations, which is
 * what actually bounds "the mirror knew about this file". A literal date here
 * would be a second copy of a fact the database already holds, and the whole
 * missing-file diagnosis turns on comparing article timestamps against it.
 */
let BACKFILL_WINDOW = { start: null, end: null };

const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── URL construction ────────────────────────────────────────────────────────

/**
 * Encode a decoded path PER SEGMENT, so the separators survive and everything
 * else is escaped the way a browser would escape it.
 *
 * `new URL(path, origin)` is NOT good enough here and the reason is `#`: a
 * literal hash is the fragment delimiter, so `…/Programming in C#.png` would be
 * truncated to `…/Programming in C` and probed as a path that matches nothing.
 * Thirteen real files carry it. encodeURIComponent turns it into %23, which is
 * both what a browser sends and what the resolver rewrite in next.config.mjs
 * matches on.
 *
 * The query string is split off first and re-attached untouched — `?itok=` is
 * an HMAC that must ride along verbatim.
 */
function encodeForRequest(decodedPath) {
  const cut = decodedPath.search(/[?#]/);
  const hasQuery = cut !== -1 && decodedPath[cut] === '?';
  const bare = cut === -1 ? decodedPath : decodedPath.slice(0, cut);
  const query = hasQuery ? decodedPath.slice(cut) : '';
  return bare.split('/').map(encodeURIComponent).join('/') + query;
}

/**
 * The Cloudinary URL for a re-derived public_id — built the same way
 * next.config.mjs builds its rewrite destination, from the same constants.
 * SVG and GIF are delivered untransformed; everything else gets the default
 * fixed transformation.
 */
function storageUrlFor({ publicId, ext }) {
  const transform = transformForExtension(ext, 'default');
  const encodedId = publicId.split('/').map(encodeURIComponent).join('/');
  return deliveryUrl(CLOUDINARY_BASE, transform, `${encodedId}.${ext}`);
}

// ── probing ─────────────────────────────────────────────────────────────────

let transportRetries = 0;
let rateLimitHits = 0;

/**
 * Classify one HTTP outcome into the only three things it can honestly mean.
 *
 * `retryable` is the whole point of the split. Everything in it is the network
 * declining to answer; nothing in it is a statement about the file.
 */
function classify(res) {
  if (res.error) return { verdict: 'transport', retryable: true };
  if (res.status >= 200 && res.status < 400) return { verdict: 'present', retryable: false };
  if (res.status === 404 || res.status === 410) return { verdict: 'missing', retryable: false };
  if (res.status === 408 || res.status === 429 || res.status >= 500) {
    if (res.status === 429) rateLimitHits += 1;
    return { verdict: 'transport', retryable: true };
  }
  // 400 / 401 / 403 and friends. A real answer, but not one of the two above —
  // Cloudinary returns 400 for a public_id it refuses. Reported on its own so
  // it cannot be read as either "held" or "gone".
  return { verdict: 'unexpected', retryable: false };
}

async function attempt(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': '9exp-article-image-coverage/1.0 (read-only audit)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      retryAfter: res.headers.get('retry-after'),
      finalUrl: res.url && res.url !== url ? res.url : null,
      error: null,
    };
  } catch (err) {
    return {
      status: null,
      contentType: null,
      contentLength: null,
      retryAfter: null,
      finalUrl: null,
      error: err?.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS}ms` : (err?.message ?? String(err)),
    };
  }
}

/**
 * One probe, with backoff on TRANSPORT outcomes only.
 *
 * The asymmetry is deliberate and is the single most important line in this
 * file: a transport failure is retried up to TRANSPORT_ATTEMPTS times, a 404 is
 * believed immediately and returned. Retrying a 404 would eventually turn a
 * genuinely missing file into a transient blip nobody chases.
 */
async function probe(url) {
  let last = null;
  for (let i = 0; i < TRANSPORT_ATTEMPTS; i += 1) {
    last = await attempt(url);
    const { verdict, retryable } = classify(last);
    if (!retryable) return { ...last, verdict, attempts: i + 1 };
    if (i < TRANSPORT_ATTEMPTS - 1) {
      transportRetries += 1;
      const retryAfter = Number(last.retryAfter) || 0;
      await sleep(Math.max(retryAfter * 1000, DELAY_MS * 6 * (2 ** i)));
    }
  }
  return { ...last, verdict: 'transport', attempts: TRANSPORT_ATTEMPTS };
}

/** Fixed worker pool over a flat target list. Paced, not just on retry. */
async function runProbes(targets, label) {
  if (!targets.length) return;
  let next = 0;
  let done = 0;
  const tty = Boolean(process.stdout.isTTY);
  const worker = async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= targets.length) return;
      const t = targets[i];
      if (DELAY_MS > 0) await sleep(DELAY_MS);
      t.result = await probe(t.url);
      done += 1;
      if (tty) process.stdout.write(`\r  ${label} ${done}/${targets.length} …    `);
      else if (done % 200 === 0 || done === targets.length) console.log(`  ${label} ${done}/${targets.length} …`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  if (tty) process.stdout.write('\r');
  console.log(`  ${label}: ${targets.length} probed`);
}

// ── the non-legacy host census ──────────────────────────────────────────────

/**
 * WHAT THE SHARED EXTRACTOR CANNOT TELL US, BY DESIGN.
 *
 * extractLegacyUrls returns legacy URLs and nothing else — that is its job. So
 * it cannot answer "how many article images point somewhere that is not the old
 * box at all", which is one of the candidate causes for a reference we do not
 * hold.
 *
 * This pass therefore does NOT classify anything as legacy. It reads image
 * reference values out of markup and buckets them BY HOST, and every legacy-host
 * hit it sees is discarded here because the shared extractor already owns those.
 * It is a census of the remainder, not a second matcher.
 */
const IMG_ATTR_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CSS_BG_RE = /background-image\s*:\s*url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi;

function hostCensus(article) {
  const out = [];
  const consider = (value, field) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    if (v.startsWith('data:')) { out.push({ field, host: '(data: URI)', value: 'data:…' }); return; }
    let host;
    try {
      host = new URL(v, 'https://placeholder.invalid').hostname;
    } catch {
      out.push({ field, host: '(unparseable)', value: v.slice(0, 160) });
      return;
    }
    if (host === 'placeholder.invalid') host = '(root-relative)';
    out.push({ field, host, value: v.slice(0, 240) });
  };

  consider(article.coverUrl, 'coverUrl');
  const content = String(article.content ?? '');
  IMG_ATTR_RE.lastIndex = 0;
  for (let m; (m = IMG_ATTR_RE.exec(content)) !== null;) consider(m[1] ?? m[2], 'content:img@src');
  CSS_BG_RE.lastIndex = 0;
  for (let m; (m = CSS_BG_RE.exec(content)) !== null;) consider(m[1] ?? m[2] ?? m[3], 'content:css-url');
  return out;
}

const isLegacyHost = (h) => h === LEGACY_MATCH_HOST || h === LEGACY_MATCH_HOST.replace(/^www\./, '');
const isOurDeliveryHost = (h) => /(^|\.)res\.cloudinary\.com$/i.test(h)
  || Boolean(BLOB_BASE && h && BLOB_BASE.includes(h));

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = new Date();

  // ── the backfill envelope, read from the data ────────────────────────────
  const lm = db.collection('legacy_file_migrations');
  const [oldest] = await lm.find({}).sort({ createdAt: 1 }).limit(1).project({ createdAt: 1 }).toArray();
  const [newest] = await lm.find({}).sort({ updatedAt: -1 }).limit(1).project({ updatedAt: 1 }).toArray();
  BACKFILL_WINDOW = { start: oldest?.createdAt ?? null, end: newest?.updatedAt ?? null };
  const afterBackfill = (d) => Boolean(d && BACKFILL_WINDOW.end && new Date(d) > new Date(BACKFILL_WINDOW.end));

  const registryTotals = await lm.aggregate([
    { $group: { _id: { status: '$status', storage: '$storage' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();

  // ── extract ──────────────────────────────────────────────────────────────
  console.log(`\nscanning ${COLLECTION} …`);
  const articles = await db.collection(COLLECTION).find({}).toArray();

  const walkStats = { depthTruncations: 0 };
  /** every legacy reference found, image or not */
  const refs = [];
  /** dotted field path → image ref count, array indices collapsed to `#` */
  const fieldCounts = new Map();
  const censusByHost = new Map();
  const articlesWithLegacyImage = new Set();

  for (const a of articles) {
    walkStrings(a, '', (str, fieldPath) => {
      for (const hit of extractLegacyUrls(str)) {
        const { decoded, decodeFailed } = decodePath(toPath(hit.url));
        const derivative = resolveDerivative(decoded);
        const sourcePath = derivative ? derivative.sourcePath : pathOnly(decoded);
        const ext = extensionOf(sourcePath);
        const isImage = IMAGE_EXTENSIONS.has(ext);
        const norm = fieldPath.replace(/(^|\.)\d+(?=\.|$)/g, '$1#');

        refs.push({
          articleId: String(a._id),
          title: a.title ?? '',
          slug: a.slug ?? '',
          createdAt: a.createdAt ?? null,
          updatedAt: a.updatedAt ?? null,
          active: a.active !== false,
          fieldPath: norm,
          raw: hit.url,
          decodedPath: decoded,
          decodeFailed,
          root: classifyRoot(decoded),
          derivative,
          sourcePath,
          ext,
          isImage,
        });
        if (isImage) {
          fieldCounts.set(norm, (fieldCounts.get(norm) ?? 0) + 1);
          articlesWithLegacyImage.add(String(a._id));
        }
      }
    }, 0, walkStats);

    for (const c of hostCensus(a)) {
      if (isLegacyHost(c.host)) continue;              // owned by the shared extractor
      if (!censusByHost.has(c.host)) censusByHost.set(c.host, { host: c.host, n: 0, samples: [] });
      const e = censusByHost.get(c.host);
      e.n += 1;
      if (e.samples.length < 6) {
        e.samples.push({ articleId: String(a._id), title: a.title ?? '', field: c.field, value: c.value });
      }
    }
  }

  const imageRefs = refs.filter((r) => r.isImage);
  const nonImageRefs = refs.filter((r) => !r.isImage);
  const derivRefs = imageRefs.filter((r) => r.derivative);

  // ── collapse onto unique source files ────────────────────────────────────
  const bySource = new Map();
  for (const r of imageRefs) {
    let s = bySource.get(r.sourcePath);
    if (!s) {
      s = {
        sourcePath: r.sourcePath,
        ext: r.ext,
        refs: 0,
        derivativeRefs: 0,
        articles: new Map(),
        storedPaths: new Set(),
        roots: new Set(),
        styles: new Set(),
        lowConfidence: false,
        confidenceReasons: new Set(),
      };
      bySource.set(r.sourcePath, s);
    }
    s.refs += 1;
    s.roots.add(r.root);
    s.storedPaths.add(r.decodedPath);
    if (r.derivative) {
      s.derivativeRefs += 1;
      s.styles.add(r.derivative.style);
      if (r.derivative.confidence === 'low') {
        s.lowConfidence = true;
        for (const x of r.derivative.reasons) s.confidenceReasons.add(x);
      }
    }
    if (!s.articles.has(r.articleId)) {
      s.articles.set(r.articleId, {
        articleId: r.articleId,
        title: r.title,
        slug: r.slug,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        active: r.active,
        fields: new Set(),
      });
    }
    s.articles.get(r.articleId).fields.add(r.fieldPath);
  }

  const sources = [...bySource.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  console.log(`  ${articles.length} articles → ${refs.length} legacy refs (${imageRefs.length} image / ${nonImageRefs.length} non-image)`);
  console.log(`  ${sources.length} unique image source files`);

  // ── registry lookup + public_id re-derivation ────────────────────────────
  const rows = await lm.find({ sourcePath: { $in: sources.map((s) => s.sourcePath) } }).toArray();
  const rowBySource = new Map(rows.map((r) => [r.sourcePath, r]));

  for (const s of sources) {
    s.row = rowBySource.get(s.sourcePath) ?? null;
    try {
      const info = legacyPathToPublicId(s.sourcePath, 'image', LEGACY_PUBLIC_ID_PREFIX);
      s.derivedPublicId = info.publicId;
      s.substitutionRules = info.rules;
      s.deriveError = null;
    } catch (err) {
      s.derivedPublicId = null;
      s.substitutionRules = [];
      s.deriveError = err?.message ?? String(err);
    }
    s.rowPublicId = s.row?.publicId ?? null;
    s.publicIdAgrees = Boolean(s.derivedPublicId) && s.derivedPublicId === s.rowPublicId;
    s.status = s.row?.status ?? '(no row)';
    s.storage = s.row ? (s.row.storage ?? 'cloudinary') : null;
    s.storageProbe = { verdict: 'not-probed' };
    s.storageUrl = null;
  }

  // ── measure ──────────────────────────────────────────────────────────────
  let storedPaths = [];
  if (PROBE) {
    // STORAGE: one target per unique source, at the RE-DERIVED public_id.
    // Blob-held rows are probed at the blob origin instead — Cloudinary does
    // not have them and a 404 there would be a correct answer to the wrong
    // question.
    const storageTargets = [];
    for (const s of sources) {
      if (!s.derivedPublicId) {
        s.storageProbe = { verdict: 'underivable', error: s.deriveError };
        continue;
      }
      if (s.storage === 'blob') {
        if (!BLOB_BASE || !s.row?.blobPathname) {
          s.storageProbe = { verdict: 'unprobeable', error: 'blob row without BLOB_PUBLIC_BASE or blobPathname' };
          continue;
        }
        storageTargets.push({ s, url: `${BLOB_BASE}/${s.row.blobPathname}` });
        continue;
      }
      storageTargets.push({ s, url: storageUrlFor({ publicId: s.derivedPublicId, ext: s.ext }) });
    }
    console.log(`\nprobing STORAGE (do we hold the bytes) — ${storageTargets.length} targets`);
    await runProbes(storageTargets, 'storage');
    for (const t of storageTargets) { t.s.storageProbe = t.result; t.s.storageUrl = t.url; }

    // CUTOVER: one target per unique STORED path, at this app's origin — the
    // exact string the article emits, derivative prefix and ?itok= intact.
    const storedIndex = new Map();
    for (const r of imageRefs) {
      let e = storedIndex.get(r.decodedPath);
      if (!e) {
        e = {
          decodedPath: r.decodedPath,
          sourcePath: r.sourcePath,
          refs: 0,
          isDerivative: Boolean(r.derivative),
        };
        storedIndex.set(r.decodedPath, e);
      }
      e.refs += 1;
    }
    storedPaths = [...storedIndex.values()];
    const cutoverTargets = storedPaths.map((e) => ({ e, url: `${ORIGIN}${encodeForRequest(e.decodedPath)}` }));
    console.log(`\nprobing CUTOVER (will the live article 404) — ${cutoverTargets.length} stored paths at ${ORIGIN}`);
    await runProbes(cutoverTargets, 'cutover');
    for (const t of cutoverTargets) { t.e.probe = t.result; t.e.url = t.url; }
  }

  // ── the diagnosis ────────────────────────────────────────────────────────
  //
  // A file is NOT HELD when the storage probe says so. The cause is then read
  // off the evidence already gathered rather than guessed: the registry row,
  // the owning articles' timestamps against the backfill envelope, and the
  // superseding ruling where one exists.
  for (const s of sources) {
    const v = s.storageProbe?.verdict ?? 'not-probed';
    s.held = v === 'present';
    if (s.held) { s.cause = null; continue; }
    if (v !== 'missing') { s.cause = v === 'transport' ? 'transport-failure — NOT a verdict about the file' : v; continue; }

    const owners = [...s.articles.values()];
    if (!s.row) {
      const newestTouch = owners.reduce((acc, o) => {
        const t = o.updatedAt ? new Date(o.updatedAt) : null;
        return t && (!acc || t > acc) ? t : acc;
      }, null);
      s.cause = afterBackfill(newestTouch)
        ? 'no registry row — owning article was touched AFTER the backfill window'
        : 'no registry row — article predates the backfill, so the disk mirror never saw this path';
      continue;
    }
    if (s.row.status === 'skipped-dead') { s.cause = 'dead on the old box before migration'; continue; }
    if (s.row.status === 'superseded') {
      s.cause = /case-fold/i.test(s.row.note ?? '')
        ? 'superseded — case-fold collision loser'
        : 'superseded — human ruling';
      continue;
    }
    if (s.row.status === 'deleted') { s.cause = 'destroyed from /admin/media after the migration'; continue; }
    if (!s.publicIdAgrees) { s.cause = `registry says ${s.row.status}, but its stored publicId disagrees with the re-derivation`; continue; }
    s.cause = `registry says ${s.row.status} yet the storage origin does not have it — UNEXPLAINED`;
  }

  // ── assemble ─────────────────────────────────────────────────────────────
  const tally = (list, key) => {
    const m = new Map();
    for (const x of list) { const k = key(x); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const verdictIs = (v) => (s) => (s.storageProbe?.verdict ?? '') === v;

  const held = sources.filter((s) => s.held);
  const notHeld = sources.filter(verdictIs('missing'));
  const transportOnly = sources.filter(verdictIs('transport'));
  const unexpected = sources.filter(verdictIs('unexpected'));

  const causeGroups = new Map();
  for (const s of sources.filter((x) => !x.held && x.cause)) {
    if (!causeGroups.has(s.cause)) causeGroups.set(s.cause, []);
    causeGroups.get(s.cause).push(s);
  }
  const causesRanked = [...causeGroups.entries()].sort((a, b) => b[1].length - a[1].length);

  const cutoverMissing = storedPaths.filter((e) => e.probe?.verdict === 'missing');
  const cutoverTransport = storedPaths.filter((e) => e.probe?.verdict === 'transport');
  const cutoverUnexpected = storedPaths.filter((e) => e.probe?.verdict === 'unexpected');

  const meta = {
    script: 'scripts/audit-article-image-coverage.mjs',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    db: process.env.MONGODB_DB_NAME ?? '(default)',
    collection: COLLECTION,
    deliveryOrigin: ORIGIN,
    storageOrigin: CLOUDINARY_BASE,
    blobBase: BLOB_BASE || null,
    probed: PROBE,
    concurrency: CONCURRENCY,
    delayMs: DELAY_MS,
    transportAttempts: TRANSPORT_ATTEMPTS,
    backfillWindow: BACKFILL_WINDOW,
    transportRetries,
    rateLimitHits,
    depthTruncations: walkStats.depthTruncations,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const base = path.join(REPORT_DIR, `${stamp}-articles`);

  // ── JSON: everything, for anyone who wants to re-cut it ──────────────────
  const serialiseSource = (s) => ({
    sourcePath: s.sourcePath,
    ext: s.ext,
    refs: s.refs,
    derivativeRefs: s.derivativeRefs,
    articleCount: s.articles.size,
    roots: [...s.roots],
    styles: [...s.styles],
    storedPaths: [...s.storedPaths],
    derivativeConfidence: s.lowConfidence ? 'low' : 'high',
    confidenceReasons: [...s.confidenceReasons],
    derivedPublicId: s.derivedPublicId,
    substitutionRules: s.substitutionRules,
    deriveError: s.deriveError,
    registry: s.row
      ? {
        status: s.row.status,
        storage: s.row.storage ?? 'cloudinary',
        publicId: s.row.publicId,
        resourceType: s.row.resourceType,
        supersededBy: s.row.supersededBy || null,
        note: s.row.note || null,
        error: s.row.error || null,
        refCount: s.row.refCount ?? null,
      }
      : null,
    publicIdAgrees: s.publicIdAgrees,
    storageUrl: s.storageUrl,
    storageProbe: s.storageProbe,
    held: s.held,
    cause: s.cause,
    articles: [...s.articles.values()].map((o) => ({
      articleId: o.articleId,
      title: o.title,
      slug: o.slug,
      active: o.active,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      createdAfterBackfill: afterBackfill(o.createdAt),
      updatedAfterBackfill: afterBackfill(o.updatedAt),
      fields: [...o.fields],
    })),
  });

  fs.writeFileSync(`${base}.json`, JSON.stringify({
    meta,
    totals: {
      articles: articles.length,
      articlesWithLegacyImage: articlesWithLegacyImage.size,
      legacyRefsAllKinds: refs.length,
      imageRefs: imageRefs.length,
      nonImageRefs: nonImageRefs.length,
      uniqueImageSources: sources.length,
      uniqueStoredImagePaths: new Set(imageRefs.map((r) => r.decodedPath)).size,
      derivativeImageRefs: derivRefs.length,
      tokenisedImageRefs: derivRefs.filter((r) => r.derivative.tokenised).length,
    },
    fieldsCarryingImages: [...fieldCounts.entries()].sort((a, b) => b[1] - a[1]),
    registryTotals,
    hostCensus: [...censusByHost.values()].sort((a, b) => b.n - a.n),
    sources: sources.map(serialiseSource),
    cutover: storedPaths.map((e) => ({
      decodedPath: e.decodedPath,
      sourcePath: e.sourcePath,
      refs: e.refs,
      isDerivative: e.isDerivative,
      url: e.url ?? null,
      probe: e.probe ?? null,
    })),
  }, null, 2), 'utf8');

  // ── CSV: one row per unique image source ─────────────────────────────────
  const csv = [
    ['sourcePath', 'ext', 'refs', 'derivativeRefs', 'articles', 'registryStatus', 'storage',
      'derivedPublicId', 'publicIdAgrees', 'storageVerdict', 'storageStatus', 'held', 'cause'].join(','),
    ...sources.map((s) => [
      s.sourcePath, s.ext, s.refs, s.derivativeRefs, s.articles.size,
      s.status, s.storage ?? '', s.derivedPublicId ?? '', s.publicIdAgrees,
      s.storageProbe?.verdict ?? '', s.storageProbe?.status ?? '', s.held, s.cause ?? '',
    ].map(csvCell).join(',')),
  ].join('\n');
  fs.writeFileSync(`${base}.csv`, csv, 'utf8');

  // ── Markdown ─────────────────────────────────────────────────────────────
  const L = [];
  const p = (s = '') => L.push(s);
  const iso = (d) => (d ? new Date(d).toISOString() : '—');

  p(`# Article image coverage — \`${COLLECTION}\``);
  p();
  p(`Run ${meta.startedAt} → ${meta.finishedAt} against db \`${meta.db}\`.`);
  p();
  p(`- delivery origin (cutover probe): \`${ORIGIN}\``);
  p(`- storage origin (holding probe): \`${CLOUDINARY_BASE}\``);
  p(`- backfill envelope, read from \`legacy_file_migrations\` rather than typed in: **${iso(BACKFILL_WINDOW.start)} → ${iso(BACKFILL_WINDOW.end)}**`);
  p(`- extraction, derivative resolution and public_id derivation all reused from the existing modules; nothing re-implemented here.`);
  p();

  p('## a. Articles');
  p();
  p('| | count |');
  p('|---|---|');
  p(`| articles in collection | ${articles.length} |`);
  p(`| active | ${articles.filter((a) => a.active !== false).length} |`);
  p(`| carrying ≥1 legacy-host image reference | ${articlesWithLegacyImage.size} |`);
  p(`| carrying none | ${articles.length - articlesWithLegacyImage.size} |`);
  p();
  p('Fields found carrying legacy IMAGE references (array indices collapsed to `#`):');
  p();
  p('| field | image refs |');
  p('|---|---|');
  for (const [f, n] of [...fieldCounts.entries()].sort((a, b) => b[1] - a[1])) p(`| \`${f}\` | ${n} |`);
  p();

  p('## b. References');
  p();
  p('| | count |');
  p('|---|---|');
  p(`| legacy references of every kind | ${refs.length} |`);
  p(`| …that are IMAGES (judged on the resolved SOURCE extension) | ${imageRefs.length} |`);
  p(`| …that are not (documents, extensionless Drupal page links) | ${nonImageRefs.length} |`);
  p(`| distinct stored image URLs | ${new Set(imageRefs.map((r) => r.decodedPath)).size} |`);
  p(`| distinct image SOURCE files behind them | ${sources.length} |`);
  p();

  p('## e. Drupal image-style derivatives');
  p();
  p('| | count |');
  p('|---|---|');
  p(`| image refs that are \`/sites/default/files/styles/<style>/public/…\` | ${derivRefs.length} |`);
  p(`| …of those carrying an \`?itok=\` HMAC | ${derivRefs.filter((r) => r.derivative.tokenised).length} |`);
  p(`| image refs pointing straight at a source file | ${imageRefs.length - derivRefs.length} |`);
  p(`| unique sources reached ONLY through a derivative | ${sources.filter((s) => s.derivativeRefs === s.refs).length} |`);
  p(`| unique sources reached BOTH ways | ${sources.filter((s) => s.derivativeRefs > 0 && s.derivativeRefs < s.refs).length} |`);
  p(`| unique sources with a LOW-confidence derivative resolution | ${sources.filter((s) => s.lowConfidence).length} |`);
  p();
  p('Every derivative is judged on its resolved SOURCE path, never on the derivative path itself: Drupal regenerates a missing derivative on demand, so a 200 on a `styles/` URL says the old site is up, not that the file survives.');
  p();

  p('## c. What the registry CLAIMS (not evidence)');
  p();
  p('| status / storage | unique sources | image refs |');
  p('|---|---|---|');
  for (const [k, n] of tally(sources, (s) => `${s.status} / ${s.storage ?? '—'}`)) {
    const g = sources.filter((s) => `${s.status} / ${s.storage ?? '—'}` === k);
    p(`| ${k} | ${n} | ${g.reduce((acc, s) => acc + s.refs, 0)} |`);
  }
  p();
  p(`public_id re-derived with \`legacyPathToPublicId(sourcePath, 'image')\` and compared against the stored row: **${sources.filter((s) => s.publicIdAgrees).length} agree**, **${sources.filter((s) => s.row && !s.publicIdAgrees).length} disagree**, **${sources.filter((s) => !s.row).length} have no row at all**.`);
  p();
  const disagree = sources.filter((s) => s.row && !s.publicIdAgrees);
  if (disagree.length) {
    p('| source | re-derived | stored on row | status |');
    p('|---|---|---|---|');
    for (const s of disagree) {
      p(`| \`${s.sourcePath}\` | \`${s.derivedPublicId ?? '—'}\` | \`${s.rowPublicId || '(empty)'}\` | ${s.status} |`);
    }
    p();
  }

  p('## d. What was MEASURED');
  p();
  if (!PROBE) {
    p('`--no-probe` was passed. **Nothing below is measured.** The registry claims in §c are all this run establishes, and they are claims.');
    p();
  } else {
    p('### STORAGE — one HEAD per unique source file, at the re-derived public_id');
    p();
    p('| verdict | unique sources | image refs behind them |');
    p('|---|---|---|');
    for (const v of ['present', 'missing', 'transport', 'unexpected', 'underivable', 'unprobeable']) {
      const g = sources.filter(verdictIs(v));
      if (!g.length) continue;
      p(`| **${v}** | ${g.length} | ${g.reduce((n, s) => n + s.refs, 0)} |`);
    }
    p();
    p('### CUTOVER — one HEAD per distinct stored URL, at this app origin');
    p();
    p('The exact string an article emits, `styles/` prefix and `?itok=` intact. This is the request a browser makes the day www repoints.');
    p();
    p('| verdict | stored URLs | refs behind them |');
    p('|---|---|---|');
    for (const v of ['present', 'missing', 'transport', 'unexpected']) {
      const g = storedPaths.filter((e) => (e.probe?.verdict ?? '') === v);
      if (!g.length) continue;
      p(`| **${v}** | ${g.length} | ${g.reduce((n, e) => n + e.refs, 0)} |`);
    }
    p();
    if (cutoverMissing.length) {
      p('Stored URLs that 404 at the delivery origin:');
      p();
      p('| stored path | refs | derivative? | source held? |');
      p('|---|---|---|---|');
      for (const e of cutoverMissing.sort((a, b) => b.refs - a.refs).slice(0, 100)) {
        p(`| \`${e.decodedPath}\` | ${e.refs} | ${e.isDerivative ? 'yes' : 'no'} | ${bySource.get(e.sourcePath)?.held ? 'yes' : 'no'} |`);
      }
      p();
    }
    p(`Transport retries performed: ${transportRetries}. 429s seen: ${rateLimitHits}. A 429/5xx/timeout/network error is retried up to ${TRANSPORT_ATTEMPTS}× with exponential backoff at concurrency ${CONCURRENCY} and, if it never resolves, reported in its own category. A 404 is believed the first time and is never retried.`);
    p();
  }

  p('## The diagnosis — every source we do NOT hold, and why');
  p();
  if (!causesRanked.length) {
    p('**No gaps.** Every unique image source an article references answered 200 at the storage origin under the public_id re-derived in this run.');
    p();
  } else {
    p('| cause | unique sources | image refs | articles affected |');
    p('|---|---|---|---|');
    for (const [cause, group] of causesRanked) {
      const arts = new Set(group.flatMap((s) => [...s.articles.keys()]));
      p(`| ${cause} | ${group.length} | ${group.reduce((n, s) => n + s.refs, 0)} | ${arts.size} |`);
    }
    p();
    for (const [cause, group] of causesRanked) {
      p(`### ${cause}`);
      p();
      for (const s of group.sort((a, b) => b.refs - a.refs)) {
        p(`#### \`${s.sourcePath}\``);
        p();
        p(`- ${s.refs} reference(s) across ${s.articles.size} article(s); ${s.derivativeRefs} of them through a \`styles/\` derivative`);
        p(`- registry: \`${s.status}\`${s.row?.error ? ` — \`${s.row.error}\`` : ''}${s.row?.supersededBy ? ` — superseded by \`${s.row.supersededBy}\`` : ''}`);
        p(`- re-derived public_id: \`${s.derivedPublicId ?? '(underivable)'}\``);
        if (s.storageUrl) p(`- probed: \`${s.storageUrl}\` → ${s.storageProbe?.status ?? s.storageProbe?.error ?? '—'}`);
        if (s.row?.note) { p(); p(`> ${s.row.note}`); }
        p();
        p('| article | id | createdAt | updatedAt | vs backfill | field(s) |');
        p('|---|---|---|---|---|---|');
        for (const o of [...s.articles.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)))) {
          const flag = afterBackfill(o.createdAt) ? '**CREATED after**'
            : afterBackfill(o.updatedAt) ? '**UPDATED after**'
              : 'predates it';
          p(`| ${String(o.title).replace(/\|/g, '\\|')} | \`${o.articleId}\` | ${iso(o.createdAt)} | ${iso(o.updatedAt)} | ${flag} | ${[...o.fields].join(', ')} |`);
        }
        p();
      }
    }
  }

  p('## Hosts other than the legacy box');
  p();
  p('A census of image reference values in `coverUrl`, `<img src>` and CSS `background-image`, grouped by host, with legacy-host hits removed because the shared extractor already owns those. This is what separates "we never held it" from "it was never ours".');
  p();
  p('| host | refs | verdict |');
  p('|---|---|---|');
  for (const h of [...censusByHost.values()].sort((a, b) => b.n - a.n)) {
    const verdict = h.host === '(root-relative)' ? 'app-local, or a legacy root-relative path already counted above'
      : isOurDeliveryHost(h.host) ? 'already on our delivery layer'
        : h.host === '(data: URI)' ? 'inline bytes — nothing to hold'
          : h.host === '(unparseable)' ? 'not a URL'
            : 'THIRD-PARTY — never ours, not migrating, unaffected by cutover';
    p(`| \`${h.host}\` | ${h.n} | ${verdict} |`);
  }
  p();
  for (const h of [...censusByHost.values()].sort((a, b) => b.n - a.n)) {
    if (h.host === '(root-relative)' || isOurDeliveryHost(h.host)) continue;
    p(`**\`${h.host}\`** samples:`);
    p();
    for (const s of h.samples) p(`- ${s.field} — \`${s.value}\` — ${s.title} \`${s.articleId}\``);
    p();
  }

  p('## What these numbers do and do not prove');
  p();
  p('- STORAGE is measured against **res.cloudinary.com**, at a public_id **re-derived in this run** by `legacyPathToPublicId`. A 200 proves bytes exist under the id our delivery layer will ask for. It does **not** prove they are the RIGHT bytes: Cloudinary folds public_id case, so a case-fold collision loser resolves to the winner\'s file and answers 200 with somebody else\'s image.');
  p('- CUTOVER is measured against **this app origin**, at the stored path verbatim. A 200 proves the rewrite rules in `next.config.mjs` reach it today.');
  p('- Neither column reads `status` off a row. §c prints the registry only so the claim and the measurement can be compared.');
  p('- **Nothing here probes the legacy box.** A source we do not hold may or may not still be alive on the old server; this run cannot say, and after cutover the old server\'s answer stops mattering.');
  p('- HEAD is not a byte check. It proves a resolvable asset of some size, not integrity. `scripts/verify-legacy-delivery.mjs` is what checks magic bytes, Range behaviour and SVG rasterisation.');
  p('- Scope is the `articles` collection only. A source counted as held here may also be referenced from collections this run never read, and a source NOT held here may be referenced elsewhere too.');
  p('- Root-relative bare-webroot IMAGES (`/hero.jpg`, no directory segment) are invisible to the shared extractor by design — see the blind-spot note in `scripts/audit-legacy-file-urls.mjs`. The host census above is what would surface them.');
  p();

  fs.writeFileSync(`${base}.md`, L.join('\n'), 'utf8');

  // ── console summary ──────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(74)}`);
  console.log(`articles ${articles.length} · with ≥1 legacy image ${articlesWithLegacyImage.size}`);
  console.log(`image refs ${imageRefs.length} · distinct stored URLs ${new Set(imageRefs.map((r) => r.decodedPath)).size} · distinct sources ${sources.length}`);
  console.log(`derivatives ${derivRefs.length} (itok ${derivRefs.filter((r) => r.derivative.tokenised).length}) · direct ${imageRefs.length - derivRefs.length}`);
  console.log(`STORAGE  held ${held.length} · missing ${notHeld.length} · transport ${transportOnly.length} · unexpected ${unexpected.length}`);
  if (PROBE) console.log(`CUTOVER  missing ${cutoverMissing.length} · transport ${cutoverTransport.length} · unexpected ${cutoverUnexpected.length} of ${storedPaths.length}`);
  for (const [cause, group] of causesRanked) {
    console.log(`  cause: ${cause} → ${group.length} source(s), ${group.reduce((n, s) => n + s.refs, 0)} ref(s)`);
  }
  console.log(`${'─'.repeat(74)}`);
  console.log(`reports:\n  ${base}.md\n  ${base}.json\n  ${base}.csv\n`);

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
