/**
 * Storage footprint probe — READ-ONLY.
 *
 * This script performs NO writes. Not behind a flag, not at all: it runs
 * `dbStats`, `$collStats`, a handful of `$group` aggregations and two counts,
 * then prints. There is no `insertOne`, `insertMany`, `updateOne`,
 * `updateMany`, `findOneAndUpdate`, `replaceOne`, `deleteOne`, `deleteMany`,
 * `bulkWrite`, `$set`, `$inc`, `createIndex` or `drop*` anywhere in this file.
 *
 * It also imports NOTHING from `src/`. Importing a model would be a write:
 * Mongoose runs `createIndexes()` on a model the first time it is used, and
 * this probe must not change the thing it is measuring. Connection is a raw
 * `mongoose.connect` and every read goes through `mongoose.connection.db`.
 *
 * ── WHAT IS MEASURED AND WHAT IS ASSUMED ────────────────────────────────────
 * Measured: every byte figure below comes from the server.
 *
 * Assumed: `M0_STORAGE_LIMIT_MB`. The cluster tier is NOT readable from a
 * plain connection — no command exposes it — so the 512 MB ceiling is a
 * constant typed by a human from src/lib/db/connect.js, which documents the
 * cluster as Atlas M0. If the cluster has been upgraded, every headroom figure
 * in section A is wrong and nothing in this script would notice. That is why
 * the assumption is printed on the same line as the headroom rather than
 * buried in a comment.
 *
 * Extrapolated: section G. `page_audit_logs` is the only collection in this
 * database that records how fast admins actually mutate things, so it is the
 * best available proxy for what `admin_audit_logs` will cost — but it covers
 * ONE menu (the page builder) out of 36, and the coming sweep instruments
 * roughly 159 actions. The projection is therefore a floor of unknown
 * tightness, not a forecast, and it is labelled that way in the output.
 *
 * ── WHY THE RATE FIGURE CAN REFUSE TO PRINT ─────────────────────────────────
 * `count / spanDays` over a two-day window is arithmetic, not evidence: it
 * turns a burst of setup activity into a confident-looking annual number. The
 * retention decision will be made from that number, and a wrong one is worse
 * than none — a missing figure prompts a question, a wrong one ends the
 * conversation. So below MIN_SAMPLE_DAYS the rate and the whole of section G
 * print UNRELIABLE instead of a value.
 *
 * ── COST ────────────────────────────────────────────────────────────────────
 * This is a shared tier with maxPoolSize 5, so the probe stays cheap: the size
 * table uses the metadata count from `$collStats` (the same O(1) figure
 * `estimatedDocumentCount()` reads), and exact `countDocuments()` is reserved
 * for the two small collections in sections D and E.
 *
 * MB throughout means MiB (1024 × 1024), the same unit Atlas quotes its
 * storage limit in.
 *
 * Usage:  node --env-file=.env.local scripts/audit-storage-footprint.mjs
 *   or:   npm run audit:storage
 */

import mongoose from 'mongoose';

/**
 * ASSUMPTION, not a measurement — see the header. Atlas M0, per the pool notes
 * in src/lib/db/connect.js.
 */
const M0_STORAGE_LIMIT_MB = 512;

/** Below this many days of history, the rows/day figure refuses to print. */
const MIN_SAMPLE_DAYS = 14;

/** The writer's per-payload-field ceiling — src/lib/audit/recordAdminAction.js. */
const PESSIMISTIC_ROW_BYTES = 2048;

/** How many collections get a per-index breakdown in section C. */
const INDEX_BREAKDOWN_TOP_N = 5;

const DAYS_PER_YEAR = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;

const UNRELIABLE = 'UNRELIABLE — sample too small';
const MISSING = 'MISSING';

/** Collections this report names by hand. Absent ≠ empty; each prints MISSING. */
const PAGE_AUDIT = 'page_audit_logs';
const PAGE_VERSIONS = 'page_versions';
const ADMIN_AUDIT = 'admin_audit_logs';

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const toMB = (bytes) => bytes / BYTES_PER_MB;
const fmtMB = (bytes) => toMB(bytes).toFixed(2);
const fmtPct = (bytes) => ((toMB(bytes) / M0_STORAGE_LIMIT_MB) * 100).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const rule = (n) => '-'.repeat(n);

const isDate = (v) => v instanceof Date && !Number.isNaN(v.getTime());
const iso = (d) => (isDate(d) ? d.toISOString() : '(none)');

/**
 * Per-collection storage stats, with a fallback and no throw.
 *
 * `$collStats` is the current path; the older `collStats` command is tried
 * second because shared tiers have historically restricted one or the other.
 * If both fail the collection returns `ok: false` with the error text — one
 * unreadable collection must not abort a whole-database report.
 */
async function collectionStats(db, name) {
  const shape = (s, source) => ({
    name,
    ok: true,
    source,
    // Metadata count — the same O(1) figure estimatedDocumentCount() reads.
    count: s.count ?? 0,
    avgObjSize: s.avgObjSize ?? 0,
    dataSize: s.size ?? 0,
    storageSize: s.storageSize ?? 0,
    indexSize: s.totalIndexSize ?? 0,
    indexSizes: s.indexSizes ?? {},
    nindexes: s.nindexes ?? 0,
  });

  let aggError;
  try {
    // M0 is a single replica set, so this yields exactly one document.
    const docs = await db
      .collection(name)
      .aggregate([{ $collStats: { storageStats: {} } }])
      .toArray();
    const s = docs[0]?.storageStats;
    if (!s) throw new Error('$collStats returned no storageStats');
    return shape(s, '$collStats');
  } catch (err) {
    aggError = err?.message ?? String(err);
  }

  try {
    const s = await db.command({ collStats: name });
    return shape(s, 'collStats');
  } catch (err) {
    return {
      name,
      ok: false,
      error: `$collStats: ${aggError} | collStats: ${err?.message ?? String(err)}`,
    };
  }
}

/** Median of a numeric array. Returns null for an empty one. */
function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Section D's sample. Exact counts here — this collection is small. */
async function samplePageAuditLogs(db, present) {
  if (!present) return { present: false };

  const col = db.collection(PAGE_AUDIT);
  const count = await col.countDocuments();

  const [span] = await col
    .aggregate([{ $group: { _id: null, oldest: { $min: '$createdAt' }, newest: { $max: '$createdAt' } } }])
    .toArray();

  const actions = await col
    .aggregate([{ $group: { _id: '$action', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }])
    .toArray();

  const oldest = span?.oldest;
  const newest = span?.newest;
  const spanDays =
    isDate(oldest) && isDate(newest) ? (newest.getTime() - oldest.getTime()) / MS_PER_DAY : null;

  // Both gates matter: an empty collection has no span at all, and a short
  // span turns a setup burst into a confident annual figure.
  const reliable = count > 0 && spanDays !== null && spanDays >= MIN_SAMPLE_DAYS;

  return {
    present: true,
    count,
    oldest,
    newest,
    spanDays,
    reliable,
    rowsPerDay: reliable ? count / spanDays : null,
    actions,
  };
}

/** Section E. Exact count and a per-page grouping — also a small collection. */
async function samplePageVersions(db, present) {
  if (!present) return { present: false };

  const col = db.collection(PAGE_VERSIONS);
  const count = await col.countDocuments();
  const perPage = await col
    .aggregate([{ $group: { _id: '$pageId', n: { $sum: 1 } } }])
    .toArray();

  const counts = perPage.map((r) => r.n);
  return {
    present: true,
    count,
    pages: perPage.length,
    maxPerPage: counts.length ? Math.max(...counts) : null,
    medianPerPage: median(counts),
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME,
    maxPoolSize: 5,               // shared tier — same cap as src/lib/db/connect.js
    serverSelectionTimeoutMS: 10000,
  });
  const db = mongoose.connection.db;

  // ── gather ────────────────────────────────────────────────────────────────
  const listed = await db.listCollections().toArray();
  const collectionNames = listed.filter((c) => c.type !== 'view').map((c) => c.name).sort();
  const viewNames = listed.filter((c) => c.type === 'view').map((c) => c.name);
  const exists = (name) => collectionNames.includes(name);

  let dbStats = null;
  let dbStatsError = null;
  try {
    dbStats = await db.command({ dbStats: 1 });
  } catch (err) {
    dbStatsError = err?.message ?? String(err);
  }

  const stats = [];
  for (const name of collectionNames) {
    stats.push(await collectionStats(db, name));
  }
  const okStats = stats.filter((s) => s.ok);
  const failedStats = stats.filter((s) => !s.ok);
  const total = (s) => s.storageSize + s.indexSize;
  const bySize = [...okStats].sort((a, b) => total(b) - total(a));

  const pageAudit = await samplePageAuditLogs(db, exists(PAGE_AUDIT));
  const pageVersions = await samplePageVersions(db, exists(PAGE_VERSIONS));
  const pageAuditStats = okStats.find((s) => s.name === PAGE_AUDIT) ?? null;
  const adminAuditExists = exists(ADMIN_AUDIT);

  // ── A. database totals ────────────────────────────────────────────────────
  console.log('');
  console.log('══ storage footprint — READ-ONLY PROBE, NOTHING WAS WRITTEN ═════════════');
  console.log(`   database: ${db.databaseName}   collections: ${collectionNames.length}` +
    (viewNames.length ? `   views (not sized): ${viewNames.length}` : ''));
  console.log('');
  console.log('── A. DATABASE TOTALS ──────────────────────────────────────────────────');
  console.log('');

  // The sum that matters is storageSize + indexSize: what the cluster actually
  // holds on disk. dataSize is the same documents measured uncompressed, so
  // adding it to storageSize would double-count them.
  let sumStorage;
  let sumIndex;
  let sumData;
  let totalsSource;

  if (dbStats) {
    sumData = dbStats.dataSize ?? 0;
    sumStorage = dbStats.storageSize ?? 0;
    sumIndex = dbStats.indexSize ?? 0;
    totalsSource = 'dbStats';
  } else {
    console.log(`  ⚠ dbStats failed: ${dbStatsError}`);
    console.log('    Totals below are DERIVED by summing the per-collection stats, which');
    console.log('    excludes anything a failed collection would have contributed.');
    console.log('');
    sumData = okStats.reduce((n, s) => n + s.dataSize, 0);
    sumStorage = okStats.reduce((n, s) => n + s.storageSize, 0);
    sumIndex = okStats.reduce((n, s) => n + s.indexSize, 0);
    totalsSource = 'derived from $collStats';
  }

  const onDisk = sumStorage + sumIndex;
  const remainingMB = M0_STORAGE_LIMIT_MB - toMB(onDisk);

  console.log(`  source                        : ${totalsSource}`);
  console.log(`  dataSize    (docs, uncompressed) : ${padL(fmtMB(sumData), 9)} MB`);
  console.log(`  storageSize (docs, on disk)      : ${padL(fmtMB(sumStorage), 9)} MB`);
  console.log(`  indexSize   (indexes, on disk)   : ${padL(fmtMB(sumIndex), 9)} MB`);
  console.log(`  ${rule(70)}`);
  console.log(`  ON DISK  = storageSize + indexSize : ${padL(fmtMB(onDisk), 9)} MB`);
  console.log('  (dataSize is excluded from that sum — it is the same documents measured');
  console.log('   uncompressed, so adding it would count them twice.)');
  console.log('');
  console.log(`  used   : ${fmtPct(onDisk)}% of an ASSUMED ${M0_STORAGE_LIMIT_MB} MB budget`);
  console.log(`  free   : ${remainingMB.toFixed(2)} MB remaining — ASSUMING Atlas M0 (512 MB).`);
  console.log('           The tier CANNOT be read from this connection; 512 is a constant');
  console.log('           typed from src/lib/db/connect.js. If the cluster was upgraded,');
  console.log('           this headroom figure is wrong and this script cannot tell.');
  console.log('');

  if (failedStats.length) {
    console.log(`  ⚠ ${failedStats.length} collection(s) could not be sized — listed in section B.`);
    console.log('');
  }

  // ── B. every collection ───────────────────────────────────────────────────
  console.log('── B. EVERY COLLECTION, largest first ──────────────────────────────────');
  console.log('');
  console.log(
    `  ${pad('collection', 30)} ${padL('docs', 8)} ${padL('avgObj', 9)} ` +
    `${padL('data MB', 9)} ${padL('index MB', 9)} ${padL('total MB', 9)} ${padL('% budget', 9)}`
  );
  console.log(
    `  ${rule(30)} ${rule(8)} ${rule(9)} ${rule(9)} ${rule(9)} ${rule(9)} ${rule(9)}`
  );
  for (const s of bySize) {
    console.log(
      `  ${pad(s.name, 30)} ${padL(s.count, 8)} ${padL(Math.round(s.avgObjSize), 9)} ` +
      `${padL(fmtMB(s.storageSize), 9)} ${padL(fmtMB(s.indexSize), 9)} ` +
      `${padL(fmtMB(total(s)), 9)} ${padL(fmtPct(total(s)), 9)}`
    );
  }
  for (const s of failedStats) {
    console.log(`  ${pad(s.name, 30)} ✖ stats failed — ${s.error}`);
  }
  console.log('');
  console.log('  data MB = storageSize (compressed, on disk), NOT the uncompressed');
  console.log('  dataSize. docs = the metadata count, same as estimatedDocumentCount().');
  console.log('');

  // ── C. index breakdown ────────────────────────────────────────────────────
  console.log(`── C. INDEX BREAKDOWN — ${INDEX_BREAKDOWN_TOP_N} largest collections ─────────────────────────`);
  console.log('');
  const topN = bySize.slice(0, INDEX_BREAKDOWN_TOP_N);
  if (topN.length === 0) {
    console.log('  (nothing to break down — no collection could be sized)');
  }
  for (const s of topN) {
    const ratio = s.storageSize > 0 ? (s.indexSize / s.storageSize).toFixed(2) : 'n/a';
    console.log(`  ${s.name} — ${s.nindexes} index(es), ${fmtMB(s.indexSize)} MB total`);
    console.log(`    index bytes per byte of document data: ${ratio}`);
    const entries = Object.entries(s.indexSizes).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      console.log('    (server reported no per-index sizes)');
    }
    for (const [idx, bytes] of entries) {
      console.log(`    ${pad(idx, 44)} ${padL(fmtMB(bytes), 9)} MB`);
    }
    console.log('');
  }

  // ── D. page_audit_logs, the sample ────────────────────────────────────────
  console.log('── D. page_audit_logs — THE RATE SAMPLE ────────────────────────────────');
  console.log('');
  if (!pageAudit.present) {
    console.log(`  ${PAGE_AUDIT} : ${MISSING} — the collection does not exist.`);
    console.log('  That is not the same as empty. With no sample there is no rate, and');
    console.log('  section G cannot be computed at all.');
  } else {
    console.log(`  documents        : ${pageAudit.count}`);
    console.log(`  avgObjSize       : ${pageAuditStats ? `${Math.round(pageAuditStats.avgObjSize)} bytes` : `${MISSING} — stats unavailable`}`);
    console.log(`  oldest createdAt : ${iso(pageAudit.oldest)}`);
    console.log(`  newest createdAt : ${iso(pageAudit.newest)}`);
    console.log(`  span             : ${pageAudit.spanDays === null ? `${MISSING} — no usable createdAt` : `${pageAudit.spanDays.toFixed(1)} days`}`);
    console.log('');
    if (pageAudit.reliable) {
      console.log(`  rows per day     : ${pageAudit.rowsPerDay.toFixed(2)}`);
    } else {
      console.log(`  rows per day     : ${UNRELIABLE}`);
      console.log(`                     (need ${MIN_SAMPLE_DAYS}+ days and at least one row; dividing by a`);
      console.log('                      short window manufactures a confident figure out of');
      console.log('                      nothing, and the retention decision rests on it.)');
    }
    console.log('');
    console.log('  distinct `action` values:');
    if (pageAudit.actions.length === 0) {
      console.log('    (none — the collection holds no rows)');
    }
    for (const a of pageAudit.actions) {
      console.log(`    ${pad(a._id ?? '(null)', 34)} ${padL(a.n, 7)}`);
    }
  }
  console.log('');

  // ── E. page_versions ──────────────────────────────────────────────────────
  console.log('── E. page_versions ────────────────────────────────────────────────────');
  console.log('');
  if (!pageVersions.present) {
    console.log(`  ${PAGE_VERSIONS} : ${MISSING} — the collection does not exist.`);
  } else {
    const pvStats = okStats.find((s) => s.name === PAGE_VERSIONS) ?? null;
    console.log(`  documents               : ${pageVersions.count}`);
    console.log(`  distinct pageId         : ${pageVersions.pages}`);
    console.log(`  avgObjSize              : ${pvStats ? `${Math.round(pvStats.avgObjSize)} bytes` : `${MISSING} — stats unavailable`}`);
    console.log(`  total size (data+index) : ${pvStats ? `${fmtMB(total(pvStats))} MB` : `${MISSING} — stats unavailable`}`);
    console.log(`  max snapshots per page  : ${pageVersions.maxPerPage ?? '(no rows)'}`);
    console.log(`  median snapshots / page : ${pageVersions.medianPerPage ?? '(no rows)'}`);
    console.log('');
    console.log('  The writer caps history at 20 snapshots per page (src/models/PageVersion.js),');
    console.log('  so a max above 20 means the prune is not keeping up.');
  }
  console.log('');

  // ── F. admin_audit_logs ───────────────────────────────────────────────────
  console.log('── F. admin_audit_logs ─────────────────────────────────────────────────');
  console.log('');
  if (adminAuditExists) {
    const s = okStats.find((c) => c.name === ADMIN_AUDIT);
    console.log('  EXISTS. That is unexpected — the model has zero call sites today, so');
    console.log('  something outside the sweep has created or written it. Worth a look');
    console.log('  before Phase 2 assumes a clean slate.');
    if (s) {
      console.log(`    documents : ${s.count}   total : ${fmtMB(total(s))} MB`);
    }
  } else {
    console.log(`  ${MISSING} — the collection does not exist yet. Expected: the model is`);
    console.log('  defined (src/models/AdminAuditLog.js) but nothing calls the writer, and');
    console.log('  Mongo creates a collection on first write, not on model definition.');
  }
  console.log('');

  // ── G. projection ─────────────────────────────────────────────────────────
  console.log('── G. PROJECTION — EXTRAPOLATION FROM ONE MENU, NOT A MEASUREMENT ──────');
  console.log('');
  console.log('  READ THIS BEFORE THE NUMBERS. The rate below is measured on');
  console.log('  page_audit_logs, which instruments the PAGE-BUILDER MENU ONLY. The');
  console.log('  planned sweep instruments roughly 159 actions across 36 menus. The real');
  console.log('  rate is therefore HIGHER than this by an unknown factor — this is a');
  console.log('  floor, not a forecast, and multiplying it by 36 would be just as made up.');
  console.log('');

  if (!pageAudit.present || !pageAudit.reliable) {
    console.log(`  ${UNRELIABLE}`);
    console.log('');
    console.log(`  No projection is printed. ${!pageAudit.present
      ? `${PAGE_AUDIT} does not exist`
      : pageAudit.count === 0
        ? `${PAGE_AUDIT} holds no rows`
        : `${PAGE_AUDIT} spans ${pageAudit.spanDays === null ? 'an unknown number of' : pageAudit.spanDays.toFixed(1)} days, under the ${MIN_SAMPLE_DAYS}-day floor`}.`);
    console.log('  A number here would be arithmetic dressed as evidence, and the retention');
    console.log('  decision would be made from it. Re-run once the sample is older.');
  } else {
    const rowsPerYear = pageAudit.rowsPerDay * DAYS_PER_YEAR;
    const measuredBytes = pageAuditStats?.avgObjSize ?? 0;
    const measuredMB = toMB(rowsPerYear * measuredBytes);
    const pessimisticMB = toMB(rowsPerYear * PESSIMISTIC_ROW_BYTES);

    console.log(`  measured rate            : ${pageAudit.rowsPerDay.toFixed(2)} rows/day over ${pageAudit.spanDays.toFixed(1)} days`);
    console.log(`  → rows per year          : ${Math.round(rowsPerYear)}`);
    console.log('');
    console.log(`  at the MEASURED row size (${Math.round(measuredBytes)} bytes):`);
    console.log(`    ${padL(measuredMB.toFixed(2), 9)} MB/year   = ${((measuredMB / M0_STORAGE_LIMIT_MB) * 100).toFixed(2)}% of the assumed budget`);
    console.log('');
    console.log(`  at a PESSIMISTIC ${PESSIMISTIC_ROW_BYTES}-byte row (MAX_PAYLOAD_CHARS, the writer's`);
    console.log('  per-payload-field cap — a row carrying three capped fields is larger still):');
    console.log(`    ${padL(pessimisticMB.toFixed(2), 9)} MB/year   = ${((pessimisticMB / M0_STORAGE_LIMIT_MB) * 100).toFixed(2)}% of the assumed budget`);
    console.log('');
    console.log('  WHAT THESE TWO NUMBERS DO NOT INCLUDE');
    if (pageAuditStats && pageAuditStats.dataSize > 0) {
      const compression = pageAuditStats.storageSize / pageAuditStats.dataSize;
      console.log(`    · compression. avgObjSize is uncompressed BSON. On ${PAGE_AUDIT} the`);
      console.log(`      measured on-disk ratio is ${compression.toFixed(2)}× — apply it to shrink the figures.`);
    } else {
      console.log(`    · compression. avgObjSize is uncompressed BSON; the on-disk ratio could`);
      console.log(`      not be measured (${PAGE_AUDIT} reported no data size).`);
    }
    console.log('    · indexes. AdminAuditLog declares FOUR indexes to PageAuditLog\'s one');
    console.log('      (createdAt, menu+createdAt, actor.id+createdAt, recordId+createdAt).');
    console.log('      Section C shows what indexes cost on this database; on a small-row,');
    console.log('      heavily-indexed collection they can exceed the documents.');
    console.log('    · the other 35 menus. See the header of this section.');
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
