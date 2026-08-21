/**
 * ROUND 34 — how big is one PageVersion snapshot, and do any carry a draft?
 *
 * READ-ONLY. Every operation is a `find`/`countDocuments`/`aggregate` through
 * `mongoose.connection.db`. There is no insert, update, delete, createIndex or
 * drop anywhere in this file, and it imports nothing from `src/`.
 *
 * ── THE TWO QUESTIONS ──────────────────────────────────────────────────────
 *
 * 1. THE PAYLOAD (round 33 §B). The decision to build a FETCH-ONE action
 *    rather than widen `getPageVersions`' projection was argued from the shape
 *    of the data — "a snapshot is a whole page document" — and never measured.
 *    An argument from shape is worth exactly as much as the number under it, so
 *    this prints the real distribution and the real cost of the widen that was
 *    rejected: bytes(one snapshot) x MAX_VERSION_ROWS, per page.
 *
 * 2. THE DRAFT (round 34 §A). Round 2 strips `.draft` at write time — but only
 *    at ONE of the three `snapshotVersion` call sites. `updatePageBuilderPage`
 *    and `updatePageStatus` both snapshot `doc.toObject()` RAW, and rows they
 *    wrote before round 3 retired them are still stored. So "no snapshot
 *    carries a draft" is a claim about history, not about code, and the only
 *    honest way to hold it is to look.
 *
 *    If any row carries one, the fetch-one action must strip on READ — which is
 *    a different guarantee from stripping on write, and this is what decides
 *    whether it needs one.
 *
 * Sizes are measured with `BSON.calculateObjectSize` (what Mongo actually
 * stores and ships) and with `JSON.stringify().length` (what a server action
 * serialises across the RSC boundary — the number that decides the payload).
 * Both are printed because they are not the same number and the second is the
 * one the decision turns on.
 *
 * Run: node --env-file=.env.local scripts/_measure-round34-version-payload.mjs
 */
import mongoose from 'mongoose';
import { BSON } from 'mongodb';

const MAX_VERSION_ROWS = 20; // the display cap getPageVersions applies

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const pct = (a, b) => (b === 0 ? '—' : ((a / b) * 100).toFixed(1) + '%');

function die(msg) {
  console.error('FATAL: ' + msg);
  process.exit(1);
}

/** Percentile from a sorted numeric array. */
function at(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[i];
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const versions = db.collection('page_versions');
  const pages = db.collection('page_builder_pages');

  const totalRows = await versions.countDocuments({});
  const totalPages = await pages.countDocuments({});

  if (totalRows === 0) {
    console.log(JSON.stringify({
      note: 'page_versions is EMPTY — no snapshot has ever been written in this database',
      totalVersionRows: 0,
      totalBuilderPages: totalPages,
    }, null, 2));
    await mongoose.disconnect();
    return;
  }

  // Full scan. The collection is small by construction (one row per publish)
  // and every question here is about the distribution, not a sample.
  const rows = await versions.find({}).toArray();

  const snapshotBson = [];
  const snapshotJson = [];
  const metadataJson = [];
  const withDraft = [];
  const labels = new Map();
  const perPage = new Map();

  for (const row of rows) {
    labels.set(row.label ?? '', (labels.get(row.label ?? '') ?? 0) + 1);
    perPage.set(String(row.pageId), (perPage.get(String(row.pageId)) ?? 0) + 1);

    const snap = row.snapshot ?? null;
    const bson = snap == null ? 0 : BSON.calculateObjectSize(snap);
    const json = snap == null ? 0 : JSON.stringify(snap).length;
    snapshotBson.push(bson);
    snapshotJson.push(json);

    // What getPageVersions actually ships today, for the same row.
    metadataJson.push(JSON.stringify({
      _id: row._id, label: row.label, actor: row.actor, createdAt: row.createdAt,
    }).length);

    // THE DRAFT QUESTION. `draft: null` is not a draft (draftState.js treats
    // null, absent and {} identically), so only a non-empty object counts.
    const d = snap && typeof snap === 'object' ? snap.draft : undefined;
    const isDraft = d != null && typeof d === 'object' && !Array.isArray(d)
      && Object.keys(d).length > 0;
    if (isDraft) {
      withDraft.push({
        _id: String(row._id),
        pageId: String(row.pageId),
        label: row.label ?? '',
        createdAt: row.createdAt,
        draftKeys: Object.keys(d).sort(),
        draftBytes: BSON.calculateObjectSize(d),
      });
    }
  }

  const sortedJson = [...snapshotJson].sort((a, b) => a - b);
  const sumJson = snapshotJson.reduce((a, b) => a + b, 0);
  const sumMeta = metadataJson.reduce((a, b) => a + b, 0);
  const maxPerPage = Math.max(...perPage.values());
  const medianJson = at(sortedJson, 0.5);
  const maxJson = sortedJson[sortedJson.length - 1];

  // THE REJECTED WIDEN, priced. What one dialog open would ship if
  // getPageVersions selected `snapshot` too, for the worst page in the data.
  const widenWorst = maxJson * Math.min(maxPerPage, MAX_VERSION_ROWS);
  const widenTypical = medianJson * Math.min(maxPerPage, MAX_VERSION_ROWS);

  console.log(JSON.stringify({
    '── the collection ──': '',
    totalVersionRows: totalRows,
    totalBuilderPages: totalPages,
    pagesWithHistory: perPage.size,
    maxRowsOnOnePage: maxPerPage,
    labelHistogram: Object.fromEntries([...labels].sort()),

    '── ONE snapshot, as stored (BSON) ──': '',
    bsonMedian: kb(at([...snapshotBson].sort((a, b) => a - b), 0.5)),
    bsonMax: kb(Math.max(...snapshotBson)),

    '── ONE snapshot, as a server action would ship it (JSON) ──': '',
    jsonMin: kb(sortedJson[0]),
    jsonMedian: kb(medianJson),
    jsonP90: kb(at(sortedJson, 0.9)),
    jsonMax: kb(maxJson),

    '── what getPageVersions ships TODAY, same rows ──': '',
    metadataTotalForAllRows: kb(sumMeta),
    metadataMedianPerRow: metadataJson.length
      ? at([...metadataJson].sort((a, b) => a - b), 0.5) + ' B' : '—',
    snapshotTotalForAllRows: kb(sumJson),
    metadataAsShareOfSnapshot: pct(sumMeta, sumJson),

    '── THE REJECTED WIDEN, PRICED (one dialog open) ──': '',
    rowsOneDialogWouldReturn: Math.min(maxPerPage, MAX_VERSION_ROWS),
    widenTypicalPayload: kb(widenTypical),
    widenWorstPayload: kb(widenWorst),
    fetchOnePayloadWorst: kb(maxJson),
    widenCostMultiple: (widenWorst / Math.max(1, maxJson)).toFixed(1) + 'x',

    '── THE DRAFT QUESTION (round 34 A) ──': '',
    rowsWhoseSnapshotCarriesADraft: withDraft.length,
    ANY_STORED_ROW_CARRIES_A_DRAFT: withDraft.length > 0,
    offendingRows: withDraft.slice(0, 10),
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err?.message ?? err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
