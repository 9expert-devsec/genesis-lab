/**
 * LEGACY FILE MIGRATION — HANDOVER INVENTORY. READ-ONLY.
 *
 *   node --env-file=.env.local scripts/report-legacy-handover.mjs
 *   node --env-file=.env.local scripts/report-legacy-handover.mjs --no-verify
 *   node --env-file=.env.local scripts/report-legacy-handover.mjs --sample=200
 *
 * Writes ONE .xlsx under reports/legacy-handover/ and prints the summary to
 * stdout so the numbers can be quoted directly into a deck.
 *
 * ══ READ-ONLY, AND NOT ONLY BY INTENTION ════════════════════════════════════
 *
 * No `insertOne`, `insertMany`, `updateOne`, `updateMany`, `findOneAndUpdate`,
 * `replaceOne`, `deleteOne`, `deleteMany`, `bulkWrite`, `$set`, `createIndex`
 * or `drop*` appears in this file. It also imports NOTHING from `src/models`:
 * Mongoose runs `createIndexes()` the first time a model is used, so importing
 * one would be a write. The connection is a raw `mongoose.connect` and every
 * read goes through `mongoose.connection.db` — the same posture as
 * scripts/audit-storage-footprint.mjs, for the same reason.
 *
 * The HTTP half is HEAD requests only. Nothing is uploaded, deleted or purged.
 *
 * ══ WHAT "STILL RESOLVES" IS ALLOWED TO MEAN ════════════════════════════════
 *
 * This report is the evidence behind "every old URL keeps working after
 * cutover", so the number that matters is the one most likely to be challenged
 * in the room. It is therefore MEASURED, not read off a status field.
 *
 * A status of 'uploaded' says a copy was attempted and the byte count matched
 * AT THE TIME. It does not say the asset is there now, and it cannot say the
 * path still maps to it — that mapping is re-derived by the delivery rewrite on
 * every request. Two independent things have to hold, so both are checked:
 *
 *   1. THE MAPPING. `legacyPathToPublicId(sourcePath)` — the SAME function the
 *      uploader and the delivery layer use — is re-run here, and its result is
 *      compared to the `publicId` the row recorded. A mismatch means the URL
 *      derives an id that is not this file's, which is exactly the state the
 *      seven `superseded` rows are in and the only reason they do not resolve.
 *
 *   2. THE ASSET. A HEAD against the delivery origin for that id.
 *
 * Both must pass. Either alone is the kind of authoritative-looking wrong
 * answer this migration has already produced more than once.
 *
 * ── WHY THE PROBE IS THE UNTRANSFORMED URL ──────────────────────────────────
 * The deployed rewrite serves images through `f_auto,q_auto,w_1600,c_limit`.
 * Probing THAT would generate a derived asset per file — 6,000 transformations
 * on an account already over its plan credit, to answer a question about
 * whether the ORIGINAL is present. So the probe asks for the stored original.
 * The transformation layer is a separate claim, already covered end-to-end by
 * scripts/verify-legacy-delivery.mjs, and this script does not restate it.
 *
 * ── THE BLOB HALF ───────────────────────────────────────────────────────────
 * 19 files are too large for Cloudinary's 10 MB raw ceiling and live on Vercel
 * Blob. They are verified through the Blob API rather than by URL, because the
 * rewrite that serves them is INERT until `BLOB_PUBLIC_BASE` is set in the
 * deployment environment (next.config.mjs:287). That is a cutover prerequisite
 * rather than a migration gap, and the summary says so in those words instead
 * of quietly counting them as resolving.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import mongoose from 'mongoose';

import { buildXlsx, STYLE } from './lib/xlsx-writer.mjs';
import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '../src/lib/legacyPublicId.js';
import { LEGACY_BLOB_FILES } from '../src/lib/legacyBlobFiles.mjs';

// ── configuration ─────────────────────────────────────────────────────────

/** The public origin every legacy URL is quoted against. UNCHANGED by design. */
const PUBLIC_ORIGIN = 'https://www.9experttraining.com';

const COLLECTION = 'legacy_file_migrations';
const OUT_DIR = path.join('reports', 'legacy-handover');

/**
 * The roots the sheet groups by, in the order a reader should meet them.
 * `sites/default/files` is two segments deep, so it is matched as a PREFIX
 * before the generic first-segment rule — otherwise every one of its 5,575
 * rows would be filed under `sites`.
 */
const ROOTS = ['sites/default/files', 'images', 'files', 'download'];

/** Concurrency for the HEAD probe. Measured: 100 probes in ~7 s at 24. */
const PROBE_CONCURRENCY = 24;

/**
 * How many times a probe is retried before its answer is believed.
 *
 * MEASURED, and it changed the reported number. A first full run at concurrency
 * 32 returned 25 `fetch failed` results — no HTTP status at all, a connection
 * torn down under load. Every one of those 25 answered 200 when asked again
 * serially. Reported as-is they would have appeared in a management deck as 25
 * files that did not survive the migration, which is both false and exactly the
 * kind of number that ends a meeting.
 *
 * So a transport failure is NOT an answer. Network errors, 429 and 5xx are
 * retried with a widening backoff; a 404 is taken at face value on the first
 * reply, because that IS an answer — the origin looked and the asset is not
 * there. Retrying a 404 would only hide the failures this report exists to find.
 */
const PROBE_ATTEMPTS = 3;

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const value = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const VERIFY = !flag('no-verify');
const SAMPLE = Number(value('sample')) || 0;

// ── helpers ───────────────────────────────────────────────────────────────

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;

/** Which of the four legacy roots does this path belong to? */
function rootOf(sourcePath) {
  const s = String(sourcePath).replace(/^\//, '');
  for (const r of ROOTS) if (s.startsWith(`${r}/`)) return r;
  const cut = s.indexOf('/');
  return cut < 0 ? '(webroot)' : s.slice(0, cut);
}

/**
 * The delivery URL for the stored asset, UNTRANSFORMED.
 *
 * Raw keeps its extension in the id; image drops it and Cloudinary re-appends
 * the stored `format`. Using the stored format rather than the path extension
 * is deliberate — 5 files are PNGs named `.jpg`, and asking for the name would
 * make Cloudinary transcode, which is both a derived asset and a slower answer
 * to a question about whether the original exists.
 */
function deliveryUrl(row) {
  if (!row.publicId) return null;
  const id = encodeURI(row.publicId);
  return row.resourceType === 'raw'
    ? `https://res.cloudinary.com/${CLOUD}/raw/upload/${id}`
    : `https://res.cloudinary.com/${CLOUD}/image/upload/${id}.${row.format || 'png'}`;
}

/** Storage, with the schema's documented default applied to pre-field rows. */
function storageOf(row) {
  return row.storage === 'blob' ? 'blob' : 'cloudinary';
}

function gb(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(2);
}
function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(2)}%` : '—';
}

/** Run `task` over `items` with a fixed worker pool. */
async function pool(items, limit, task) {
  const queue = [...items];
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.pop();
      await task(item);
      done += 1;
      if (done % 500 === 0) process.stdout.write(`    …${done}/${items.length}\n`);
    }
  });
  await Promise.all(workers);
}

// ── 1. READ ───────────────────────────────────────────────────────────────

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Run with --env-file=.env.local');
  process.exit(1);
}

console.log('LEGACY FILE MIGRATION — HANDOVER INVENTORY');
console.log(`  origin   ${PUBLIC_ORIGIN}`);
console.log(`  database ${process.env.MONGODB_DB_NAME}`);
console.log(`  verify   ${VERIFY ? (SAMPLE ? `sample of ${SAMPLE}` : 'every row') : 'OFF (--no-verify)'}\n`);

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
const col = mongoose.connection.db.collection(COLLECTION);

const docs = await col.find({}, {
  projection: {
    _id: 0,
    sourcePath: 1, publicId: 1, resourceType: 1, format: 1, status: 1, storage: 1,
    blobPathname: 1, uploadedBytes: 1, sourceBytes: 1, supersededBy: 1,
    publicIdSubstituted: 1, formatDisagrees: 1, note: 1, error: 1,
  },
}).toArray();
await mongoose.disconnect();

console.log(`read ${docs.length} rows from ${COLLECTION} (connection closed)\n`);

// ── 2. CLASSIFY ───────────────────────────────────────────────────────────

/**
 * The four outcomes this report reports, derived from status + the mapping
 * check. Deliberately NOT a copy of the status enum: `uploaded` and `exists`
 * are the same fact to a visitor (the URL works), and lumping them keeps the
 * headline honest instead of inviting "so what is `exists`?" in the meeting.
 */
const OUTCOME = {
  RESOLVES: 'resolves (Cloudinary)',
  BLOB: 'resolves (Vercel Blob)',
  SUPERSEDED: 'superseded (duplicate — by design)',
  DEAD: 'dead before migration (404 at source)',
  DELETED: 'deleted by an admin after migration',
  UNKNOWN: 'needs review',
};

/**
 * The route for the 19 Blob files, checked rather than assumed.
 *
 * Cloudinary delivery is derived BY PATTERN, so "is this file reachable" is a
 * question about one function. Blob has no such property: each file needs its
 * own rewrite, generated into src/lib/legacyBlobFiles.mjs, and next.config.mjs
 * reads that array. A row whose `blobPathname` is not in the manifest has an
 * object in the store and no route to it — which is precisely the drift the
 * LegacyFileMigration docstring says should be findable by query rather than by
 * eye. This is that query.
 *
 * The three WEBROOT documents are the exception, and a real one: they are not
 * in the manifest because they sit at the site root, where a generated
 * catch-all would be one bad regex away from swallowing /promotions. They get
 * three hand-written rules in next.config.mjs instead, so they are matched by
 * their blobPathname prefix and counted separately.
 */
const BLOB_MANIFEST = new Set(LEGACY_BLOB_FILES.map((f) => f.publicPath));
const WEBROOT_PREFIX = 'webroot-documents/';

for (const d of docs) {
  d.root = rootOf(d.sourcePath);
  d.publicUrl = `${PUBLIC_ORIGIN}${d.sourcePath}`;
  d.storageResolved = storageOf(d);
  d.bytes = d.uploadedBytes ?? d.sourceBytes ?? 0;

  // THE MAPPING CHECK — how does a request for this URL find this file?
  if (d.storageResolved === 'blob') {
    d.routedBy = BLOB_MANIFEST.has(d.sourcePath)
      ? 'blob manifest rewrite'
      : (d.blobPathname?.startsWith(WEBROOT_PREFIX) ? 'webroot rule in next.config' : '');
    d.mappingOk = Boolean(d.routedBy);
    if (!d.mappingOk) d.mappingError = 'no rewrite points at this blob object';
  } else {
    // Re-derive the id from the URL, exactly as the delivery rewrite does, and
    // compare with what the row recorded.
    try {
      const { publicId } = legacyPathToPublicId(
        d.sourcePath, d.resourceType, LEGACY_PUBLIC_ID_PREFIX,
      );
      d.derivedPublicId = publicId;
      d.mappingOk = Boolean(d.publicId) && publicId === d.publicId;
      d.routedBy = d.mappingOk
        ? (d.publicIdSubstituted ? '/legacy-file resolver (substituted id)' : 'pattern rewrite')
        : '';
    } catch (err) {
      d.derivedPublicId = '';
      d.mappingOk = false;
      d.mappingError = err?.message ?? 'derivation threw';
    }
  }

  const live = d.status === 'uploaded' || d.status === 'exists';
  if (d.status === 'skipped-dead') d.outcome = OUTCOME.DEAD;
  else if (d.status === 'superseded') d.outcome = OUTCOME.SUPERSEDED;
  else if (d.status === 'deleted') d.outcome = OUTCOME.DELETED;
  else if (live && d.mappingOk) d.outcome = d.storageResolved === 'blob' ? OUTCOME.BLOB : OUTCOME.RESOLVES;
  else d.outcome = OUTCOME.UNKNOWN;
}

// ── 3. VERIFY ─────────────────────────────────────────────────────────────

const claimResolving = docs.filter((d) => d.outcome === OUTCOME.RESOLVES || d.outcome === OUTCOME.BLOB);
let probed = [];

if (VERIFY) {
  const cloud = claimResolving.filter((d) => d.storageResolved === 'cloudinary');
  probed = SAMPLE
    // Every Nth rather than the first N: the collection is ordered by source
    // path, so the first N would be one directory and would say nothing about
    // the rest of the tree.
    ? cloud.filter((_, i) => i % Math.max(1, Math.floor(cloud.length / SAMPLE)) === 0).slice(0, SAMPLE)
    : cloud;

  console.log(`probing ${probed.length} Cloudinary assets (HEAD, untransformed)…`);
  const t0 = Date.now();
  let retried = 0;
  await pool(probed, PROBE_CONCURRENCY, async (d) => {
    const url = deliveryUrl(d);
    for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt += 1) {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        // A 404 is an ANSWER — the origin looked. Anything 2xx/3xx/4xx other
        // than a throttle is likewise final. Only 429 and 5xx are the server
        // declining to answer.
        if (res.status < 500 && res.status !== 429) { d.probe = res.status; return; }
        d.probe = res.status;
      } catch (err) {
        // No status at all: the connection died. NOT evidence about the file.
        d.probe = `error: ${err?.message ?? 'fetch failed'}`;
      }
      if (attempt < PROBE_ATTEMPTS) {
        retried += 1;
        await new Promise((r) => { setTimeout(r, 500 * attempt * attempt); });
      }
    }
  });
  if (retried) console.log(`  ${retried} probe(s) retried after a transport failure or throttle`);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  // The Blob half, through the API rather than by URL — see the header.
  const blobRows = docs.filter((d) => d.storageResolved === 'blob');
  if (blobRows.length && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = await import('@vercel/blob');
      const present = new Set();
      let cursor;
      do {
        const page = await list({ limit: 1000, cursor, token: process.env.BLOB_READ_WRITE_TOKEN });
        for (const b of page.blobs) present.add(b.pathname);
        cursor = page.cursor;
      } while (cursor);
      for (const d of blobRows) d.probe = present.has(d.blobPathname) ? 'blob:present' : 'blob:MISSING';
      console.log(`Blob store: ${blobRows.filter((d) => d.probe === 'blob:present').length}/${blobRows.length} of the large files present\n`);
    } catch (err) {
      for (const d of blobRows) d.probe = 'blob:unchecked';
      console.log(`Blob store: NOT CHECKED — ${err?.message ?? err}\n`);
    }
  }
}

const probeOk = (d) => d.probe === 200 || d.probe === 'blob:present';
const verifiedCount = docs.filter(probeOk).length;
const probeFailures = docs.filter((d) => d.probe !== undefined && !probeOk(d));

// ── 4. SUMMARY NUMBERS ────────────────────────────────────────────────────

const byOutcome = new Map();
const byRoot = new Map();
const byStatus = new Map();
const byStorage = new Map();
for (const d of docs) {
  byOutcome.set(d.outcome, (byOutcome.get(d.outcome) ?? 0) + 1);
  byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
  byStorage.set(d.storageResolved, (byStorage.get(d.storageResolved) ?? 0) + 1);
  const r = byRoot.get(d.root) ?? { n: 0, bytes: 0, resolves: 0 };
  r.n += 1;
  r.bytes += d.bytes;
  if (d.outcome === OUTCOME.RESOLVES || d.outcome === OUTCOME.BLOB) r.resolves += 1;
  byRoot.set(d.root, r);
}

const totalBytes = docs.reduce((a, d) => a + d.bytes, 0);
const nCloudinary = byOutcome.get(OUTCOME.RESOLVES) ?? 0;
const nBlob = byOutcome.get(OUTCOME.BLOB) ?? 0;
const nResolves = nCloudinary + nBlob;
const nDead = byOutcome.get(OUTCOME.DEAD) ?? 0;
const nSuperseded = byOutcome.get(OUTCOME.SUPERSEDED) ?? 0;
const nDeleted = byOutcome.get(OUTCOME.DELETED) ?? 0;
const nUnknown = byOutcome.get(OUTCOME.UNKNOWN) ?? 0;

/**
 * THE HEADLINE.
 *
 * The denominator EXCLUDES the files that were already 404 on the legacy server
 * before anything was copied. That is not flattering the number — copying a
 * file that does not exist is not a migration failure, and counting it as one
 * would understate coverage of the thing the cutover is actually responsible
 * for. It is stated with its denominator everywhere it appears, so nobody has
 * to take the percentage on trust.
 */
const inScope = docs.length - nDead;
const coverage = pct(nResolves, inScope);

// ── 5. THE WORKBOOK ───────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, `legacy-file-handover-${stamp}.xlsx`);

const H = (cells) => ({ cells: cells.map((v) => ({ v, s: STYLE.HEADER })) });
const B = (cells) => ({ cells: cells.map((v) => ({ v, s: STYLE.BOLD })) });
const N = (v) => ({ v, s: STYLE.NUMBER });

const summaryRows = [
  B(['LEGACY FILE MIGRATION — HANDOVER SUMMARY']),
  { cells: [`generated ${new Date().toISOString()}`] },
  { cells: [`source: MongoDB ${process.env.MONGODB_DB_NAME}.${COLLECTION} (read-only)`] },
  { cells: [`public origin (UNCHANGED by design): ${PUBLIC_ORIGIN}`] },
  { cells: [] },

  { cells: [{ v: 'COVERAGE — the headline', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }] },
  { cells: ['Legacy URLs that still resolve', N(nResolves), coverage] },
  { cells: ['…served from Cloudinary (pattern rewrite)', N(nCloudinary), ''] },
  { cells: ['…served from Vercel Blob (needs BLOB_PUBLIC_BASE)', N(nBlob), ''] },
  { cells: ['…of files in scope (total minus already-dead)', N(inScope), ''] },
  { cells: ['…of every row on file', N(docs.length), pct(nResolves, docs.length)] },
  VERIFY
    ? { cells: ['Confirmed by live HEAD probe just now', N(verifiedCount), pct(verifiedCount, nResolves)] }
    : { cells: ['Live probe', 'SKIPPED (--no-verify)', ''] },
  { cells: ['Probe failures', N(probeFailures.length), probeFailures.length ? 'SEE INVENTORY' : 'none'] },
  { cells: [] },

  { cells: [{ v: 'THE REST, AND WHY', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }] },
  { cells: ['Dead before migration (404 on the legacy server)', N(nDead), 'no URL to keep working'] },
  { cells: ['Superseded duplicates (two encodings of one file)', N(nSuperseded), 'references point at the winner'] },
  { cells: ['Deleted by an admin after migration', N(nDeleted), 'intentional'] },
  { cells: ['Needs review', N(nUnknown), nUnknown ? 'SEE INVENTORY' : 'none'] },
  { cells: ['TOTAL rows', N(docs.length), ''] },
  { cells: [] },

  { cells: [{ v: 'VOLUME', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }] },
  { cells: ['Total bytes migrated', N(totalBytes), `${gb(totalBytes)} GB`] },
  ...[...byStorage].sort().map(([k, v]) => ({ cells: [`Files on ${k}`, N(v), ''] })),
  { cells: [] },

  { cells: [{ v: 'BY ROOT', s: STYLE.GROUP }, { v: 'FILES', s: STYLE.GROUP }, { v: 'RESOLVE', s: STYLE.GROUP }, { v: 'GB', s: STYLE.GROUP }] },
  ...[...byRoot].sort((a, b) => b[1].n - a[1].n).map(([root, v]) => ({
    cells: [root, N(v.n), N(v.resolves), Number(gb(v.bytes))],
  })),
  { cells: [] },

  { cells: [{ v: 'BY RECORDED STATUS', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }] },
  ...[...byStatus].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ cells: [k, N(v)] })),
  { cells: [] },

  { cells: [{ v: 'CUTOVER PREREQUISITE', s: STYLE.GROUP }, { v: '', s: STYLE.GROUP }] },
  {
    cells: [
      'BLOB_PUBLIC_BASE must be set in the deployment environment',
      process.env.BLOB_PUBLIC_BASE ? 'set here' : 'NOT set in this environment',
    ],
  },
  {
    cells: [
      `Without it the rewrite for the ${byStorage.get('blob') ?? 0} largest files is inert (next.config.mjs)`,
      '',
    ],
  },
];

const INVENTORY_HEADERS = [
  'Root', 'Source path', 'Public URL (unchanged)', 'Outcome', 'Recorded status',
  'Storage', 'Type', 'Bytes', 'Live check', 'Cloudinary public_id', 'Notes',
];

const inventoryRows = [H(INVENTORY_HEADERS)];
const groupOrder = [...byRoot.keys()].sort((a, b) => byRoot.get(b).n - byRoot.get(a).n);

for (const root of groupOrder) {
  const group = docs.filter((d) => d.root === root)
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  const res = group.filter((d) => d.outcome === OUTCOME.RESOLVES).length;

  // A banner row per root. This is the "group by root for readability" ask —
  // a real Excel outline would collapse the rows, but it also hides them from
  // anyone reading the file as CSV or in a viewer that ignores outlines, and
  // this file's job is to be readable by whoever opens it.
  inventoryRows.push({
    cells: [
      { v: `▼ ${root}`, s: STYLE.GROUP },
      { v: `${group.length} files`, s: STYLE.GROUP },
      { v: `${res} resolve (${pct(res, group.length)})`, s: STYLE.GROUP },
      ...Array.from({ length: 8 }, () => ({ v: '', s: STYLE.GROUP })),
    ],
  });

  for (const d of group) {
    inventoryRows.push({
      cells: [
        d.root,
        d.sourcePath,
        d.publicUrl,
        d.outcome,
        d.status,
        d.storageResolved,
        d.resourceType,
        N(d.bytes),
        d.probe === undefined ? '' : String(d.probe),
        d.publicId ?? '',
        [
          d.publicIdSubstituted ? 'id substituted (& / # / trailing space)' : '',
          d.formatDisagrees ? 'stored format differs from the name' : '',
          d.supersededBy ? `superseded by ${d.supersededBy}` : '',
          d.mappingOk === false && d.status !== 'skipped-dead' ? 'URL does not derive this id' : '',
          d.error || '',
          d.note || '',
        ].filter(Boolean).join(' · '),
      ],
    });
  }
}

const xlsx = buildXlsx([
  {
    name: 'Summary',
    rows: summaryRows,
    columns: [{ width: 52 }, { width: 16 }, { width: 30 }, { width: 12 }],
  },
  {
    name: 'Inventory by root',
    rows: inventoryRows,
    freezeHeader: true,
    autoFilter: true,
    columns: [
      { width: 20 }, { width: 62 }, { width: 72 }, { width: 22 }, { width: 14 },
      { width: 11 }, { width: 8 }, { width: 13 }, { width: 11 }, { width: 60 }, { width: 60 },
    ],
  },
]);

writeFileSync(outPath, xlsx);

// ── 6. SELF-CHECK ─────────────────────────────────────────────────────────
//
// A workbook Excel refuses to open is worse than no workbook: it is discovered
// by the person presenting it, in the room. So the file is read back off disk
// through a real inflate and its parts are checked before this script claims
// success. Cheap, and it turns a class of silent corruption into an exit code.

function selfCheck(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`bad central header #${i}`);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const local = buf.readUInt32LE(cursor + 42);
    const compSize = buf.readUInt32LE(cursor + 20);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLen);
    names.push(name);

    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = inflateRawSync(buf.subarray(start, start + compSize));
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      const text = raw.toString('utf8');
      if (!text.startsWith('<?xml')) throw new Error(`${name} is not XML`);
      // Every tag opened must close. A cheap structural check, not a parser —
      // it catches the failure that actually happens here (a truncated sheet).
      if ((text.match(/</g) || []).length !== (text.match(/>/g) || []).length) {
        throw new Error(`${name} has unbalanced angle brackets`);
      }
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  for (const required of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    if (!names.includes(required)) throw new Error(`missing part ${required}`);
  }
  return names.length;
}

let parts;
try {
  parts = selfCheck(xlsx);
} catch (err) {
  console.error(`\nSELF-CHECK FAILED — the .xlsx is malformed: ${err.message}`);
  process.exit(1);
}

// ── 7. STDOUT ─────────────────────────────────────────────────────────────

const line = (l, v, extra = '') => console.log(`  ${l.padEnd(50)}${String(v).padStart(9)}  ${extra}`);

console.log('════ COVERAGE ════════════════════════════════════════════════════════');
line('Legacy URLs that still resolve', nResolves.toLocaleString(), `${coverage} of files in scope`);
line('  served from Cloudinary (pattern rewrite)', nCloudinary.toLocaleString());
line('  served from Vercel Blob', nBlob.toLocaleString(), 'needs BLOB_PUBLIC_BASE at cutover');
line('  in scope (total minus already-dead)', inScope.toLocaleString());
line('  of every row on file', docs.length.toLocaleString(), pct(nResolves, docs.length));
if (VERIFY) {
  line('Confirmed by live HEAD probe just now', verifiedCount.toLocaleString(), pct(verifiedCount, nResolves));
  line('Probe failures', probeFailures.length, probeFailures.length ? 'LISTED BELOW' : 'none');
}
console.log('');
console.log('════ THE REST ════════════════════════════════════════════════════════');
line('Dead before migration (404 at source)', nDead, 'no URL to keep working');
line('Superseded duplicates (by design)', nSuperseded, 'references point at the winner');
line('Deleted by an admin after migration', nDeleted);
line('Needs review', nUnknown);
line('TOTAL rows', docs.length.toLocaleString());
console.log('');
console.log('════ VOLUME ══════════════════════════════════════════════════════════');
line('Total bytes migrated', totalBytes.toLocaleString(), `${gb(totalBytes)} GB`);
for (const [k, v] of [...byStorage].sort()) line(`  on ${k}`, v.toLocaleString());
console.log('');
console.log('════ BY ROOT ═════════════════════════════════════════════════════════');
for (const root of groupOrder) {
  const v = byRoot.get(root);
  line(`  ${root}`, v.n.toLocaleString(), `${v.resolves} resolve (${pct(v.resolves, v.n)}) · ${gb(v.bytes)} GB`);
}
console.log('');

if (probeFailures.length) {
  console.log('════ PROBE FAILURES ══════════════════════════════════════════════════');
  for (const d of probeFailures.slice(0, 40)) console.log(`  ${d.probe}  ${d.sourcePath}`);
  if (probeFailures.length > 40) console.log(`  …and ${probeFailures.length - 40} more (see the workbook)`);
  console.log('');
}

if (!process.env.BLOB_PUBLIC_BASE) {
  console.log('════ CUTOVER PREREQUISITE ════════════════════════════════════════════');
  console.log(`  BLOB_PUBLIC_BASE is NOT set in this environment. Until it is set in the`);
  console.log(`  DEPLOYMENT environment, the rewrite serving the ${byStorage.get('blob') ?? 0} largest files is inert`);
  console.log('  (next.config.mjs). Those files are present in the Blob store; the route to');
  console.log('  them is what needs configuring. Confirm before cutover.\n');
}

console.log(`workbook: ${outPath}`);
console.log(`  ${parts} parts, ${(xlsx.length / 1024).toFixed(0)} KB, self-check passed`);
console.log(`  sheet 1 "Summary" · sheet 2 "Inventory by root" (${inventoryRows.length - 1} rows incl. group banners)`);
