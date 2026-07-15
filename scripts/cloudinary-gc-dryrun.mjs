/**
 * Cloudinary GC — DRY-RUN AUDIT ONLY (item 5b, Parts 2+3, Phase A).
 *
 * READ-ONLY. This script performs NO deletion — not behind a flag, not at all.
 * It calls only Cloudinary Admin `api.resources` (list) and Mongo `find`. There
 * is no `destroy`, no `deleteMany`, no write anywhere. The delete path is a
 * SEPARATE, later prompt that only gets written after a human reads a real
 * dry-run from this script and confirms the reference set is complete.
 *
 * WHY audit-first (the asymmetry that makes 5b deferred, not squeezed in): an
 * orphan costs storage and nothing else; a wrong delete is silent and
 * irreversible — the page renders, the image 404s, no error fires. A reference
 * set that is even slightly incomplete does not fail loudly; it marks a live
 * asset as an orphan. So the set must be proven complete against real data by a
 * human BEFORE a delete exists. That is what this report is for.
 *
 * The reference set = the union of every Cloudinary reference reachable from
 * anything that pins an asset:
 *   - every live PageBuilder doc (sections + SEO OG),
 *   - every PageVersion snapshot (each is a full page doc and pins its own
 *     assets — orphan cause (a), the invisible one; a page with 20 snapshots
 *     pins from all 20),
 * counting BOTH content.src AND content.publicId (Part 1 strips publicId on a
 * copy but keeps src — see src/lib/pageBuilder/assetRefs.js).
 *
 * The pure reference walk lives in src/lib/pageBuilder/assetRefs.js (testable
 * without a DB); this file is the thin impure outer layer: DB + Cloudinary I/O
 * and the report.
 *
 * Usage:  node --env-file=.env.local scripts/cloudinary-gc-dryrun.mjs
 *         (or: npm run gc:dryrun)
 * Optional: GRACE_DAYS=7 (default), GC_SUBFOLDER=page-builder (default).
 */

import { register } from 'node:module';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

// The pure walk imports app modules via `@/` and omits file extensions — Node
// resolves neither natively. The suite's loader does both; reuse it (same move
// as test/smoke.mjs). It only rewrites files under src/, so mongoose/cloudinary
// resolve normally.
register(new URL('../test/loader.mjs', import.meta.url));
const { collectPageAssetRefs, makeRefAcc, computeOrphans } = await import('@/lib/pageBuilder/assetRefs');

const GRACE_DAYS = Number(process.env.GRACE_DAYS ?? 7);
const SUBFOLDER = process.env.GC_SUBFOLDER ?? 'page-builder';

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

// ── Step 1: confirm the exact, scoped folder prefix ─────────────────────────
// The status doc's "page-builder/ folder" is shorthand. The REAL prefix is
// <CLOUDINARY_UPLOAD_FOLDER>/<subfolder> (see src/lib/cloudinary.js). Refuse to
// list anything wider than that — a too-wide scope pulls in assets owned by other
// features (articles, banners, instructors, …) whose references this walk does
// NOT collect, so it would mark THOSE live assets as orphans. A too-wide scope is
// the single most dangerous mistake here, so we fail closed rather than guess.
const baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER;
if (baseFolder === undefined || baseFolder === '') {
  die('CLOUDINARY_UPLOAD_FOLDER is not set — cannot compute a scoped prefix. ' +
      'Builder uploads go to <CLOUDINARY_UPLOAD_FOLDER>/page-builder (see src/lib/cloudinary.js, ' +
      'and the folder="page-builder" passed by src/components/pageBuilder/editor/SectionContentEditor.jsx → /api/admin/upload). ' +
      'Refusing to list without the exact prefix.');
}
const PREFIX = `${baseFolder}/${SUBFOLDER}`;

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  die('Cloudinary Admin API credentials missing (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET). Pass --env-file=.env.local.');
}
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// ── List a resource_type under the scoped prefix, following next_cursor ─────
// api.resources is paginated; a folder can exceed one page. resource_type is a
// separate axis (image vs raw are listed separately) — the builder uploads only
// IMAGES to page-builder (verified: src/components/.../SectionContentEditor.jsx
// sends image/* to /api/admin/upload → folder 'page-builder'; the only 'raw'
// upload is schedule PDFs, which go to the 'schedule' subfolder). We list image
// as the scope and PROBE raw purely to surface anything unexpected.
async function listAll(resourceType) {
  const out = [];
  let cursor;
  let pages = 0;
  do {
    const res = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix: PREFIX,
      max_results: 500,
      next_cursor: cursor,
    });
    for (const r of res.resources ?? []) out.push({ public_id: r.public_id, created_at: r.created_at });
    cursor = res.next_cursor;
    pages += 1;
  } while (cursor);
  return { assets: out, pages };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  // Raw collections (mirrors scripts/migrate-local-faqs-per-course.mjs) — no model
  // import chain, and read-only find() only.
  const pages = await db.collection('page_builder_pages').find({}).toArray();
  const versions = await db.collection('page_versions').find({}).toArray();

  const liveIds = new Set(pages.map((p) => String(p._id)));

  // ── Step 2: build the reference set, by source ────────────────────────────
  // Each source accumulates BOTH resolved public_ids and the URLs we could not
  // parse (see assetRefs.js — fail loud, never guess an id).
  const accLive = makeRefAcc();
  for (const p of pages) collectPageAssetRefs(p, accLive);

  const accLiveSnap = makeRefAcc();     // snapshots of pages that still exist
  const accDeletedSnap = makeRefAcc();  // snapshots whose page has been deleted (leaked)
  let deletedSnapCount = 0;
  const deletedPageIds = new Set();
  for (const v of versions) {
    const belongsToLive = liveIds.has(String(v.pageId));
    if (!belongsToLive) { deletedSnapCount += 1; deletedPageIds.add(String(v.pageId)); }
    collectPageAssetRefs(v.snapshot, belongsToLive ? accLiveSnap : accDeletedSnap);
  }

  const refLive = accLive.refs;
  const refLiveSnap = accLiveSnap.refs;
  const refDeletedSnap = accDeletedSnap.refs;

  // The full reference set: everything that pins an asset TODAY, leaked snapshots
  // included (today they DO pin — that is exactly why an on-event delete can't be
  // trusted and the GC must be offline). `unparseable` is the union of every URL
  // no source could parse — each PINS conservatively (computeOrphans).
  const referenceSet = new Set([...refLive, ...refLiveSnap, ...refDeletedSnap]);
  const unparseable = new Set([
    ...accLive.unparseable, ...accLiveSnap.unparseable, ...accDeletedSnap.unparseable,
  ]);
  const fullAcc = { refs: referenceSet, unparseable };

  // ── Step 1 (cont.): list the scoped folder ────────────────────────────────
  const { assets, pages: listPages } = await listAll('image');
  const rawProbe = await listAll('raw'); // should be empty under page-builder

  const createdAt = new Map(assets.map((a) => [a.public_id, a.created_at]));

  // ── Step 3: diff + grace period ───────────────────────────────────────────
  // rawCandidates ignores unparseable refs (inspection only). candidates is the
  // CONSERVATIVE set computeOrphans returns — empty if ANY ref was unparseable,
  // because such a ref could point at any listed asset (protect everything).
  const listedIds = assets.map((a) => a.public_id);
  const rawCandidates = listedIds.filter((id) => !referenceSet.has(id));
  const candidates = computeOrphans(listedIds, fullAcc);

  const now = Date.now();
  const graceMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
  const isYoung = (id) => {
    const t = new Date(createdAt.get(id) ?? 0).getTime();
    return Number.isFinite(t) && (now - t) < graceMs;
  };
  const afterGrace = candidates.filter((id) => !isYoung(id));
  const withinGrace = candidates.filter(isYoung);

  // ── Part 3 sizing (REPORT ONLY — no deleteMany here) ──────────────────────
  // Assets currently pinned ONLY by snapshots of already-deleted pages. They are
  // NOT orphans today (a leaked snapshot still pins them). But Part 3's
  // PageVersion.deleteMany({pageId}) on page delete — which MUST land WITH the GC,
  // never before — would strand them into pure orphans. This figure is the size of
  // what Part 3 will govern, so the reviewer sees it before that coupling is built.
  const refLiveAll = new Set([...refLive, ...refLiveSnap]);
  const strandedByPart3 = assets
    .map((a) => a.public_id)
    .filter((id) => refDeletedSnap.has(id) && !refLiveAll.has(id));

  // ── Report ────────────────────────────────────────────────────────────────
  const L = (s = '') => console.log(s);
  L('════════════════════════════════════════════════════════════════════');
  L('  Cloudinary GC — DRY RUN (read-only; NO deletes performed)');
  L('════════════════════════════════════════════════════════════════════');
  L();
  L('Scope');
  L(`  cloud_name          : ${process.env.CLOUDINARY_CLOUD_NAME}`);
  L(`  base folder         : ${baseFolder}   (CLOUDINARY_UPLOAD_FOLDER)`);
  L(`  scoped prefix       : ${PREFIX}/   (builder section images only)`);
  L(`  resource_type       : image (primary)  ·  raw probed for anomalies`);
  L(`  grace period (N)    : ${GRACE_DAYS} days`);
  L();
  L('Cloudinary listing (Admin API, read-only)');
  L(`  image assets found  : ${assets.length}   (over ${listPages} page(s) of next_cursor)`);
  L(`  raw assets found    : ${rawProbe.assets.length}${rawProbe.assets.length ? '  ⚠ UNEXPECTED — builder uploads no raw here; investigate before any delete' : ''}`);
  L();
  L('Reference set (assets pinned by something) — by source');
  L(`  live PageBuilder docs        : ${refLive.size}`);
  L(`  snapshots of live pages      : ${refLiveSnap.size}`);
  L(`  snapshots of DELETED pages   : ${refDeletedSnap.size}   (leaked snapshots — orphan cause (a))`);
  L(`  UNION (full reference set)   : ${referenceSet.size}`);
  L(`  Mongo: ${pages.length} live page(s), ${versions.length} snapshot(s) (${deletedSnapCount} from ${deletedPageIds.size} deleted page(s))`);
  L();
  L('Unparseable references (a stored src URL we could NOT resolve — surfaced, never guessed)');
  L(`  unparseable references : ${unparseable.size}${unparseable.size ? '   ⚠ the safe orphan set is SUPPRESSED to ∅ while any exist (conservative: an unparseable ref could pin any asset)' : ''}`);
  if (unparseable.size) for (const raw of unparseable) L(`    - ${raw}`);
  L();
  L('Orphan candidates  =  listed image assets  −  reference set');
  L(`  raw (ignoring unparseable, INSPECTION ONLY) : ${rawCandidates.length}`);
  L(`  SAFE set (conservative — ∅ if any unparseable) : ${candidates.length}`);
  L(`  within grace (kept) : ${withinGrace.length}   (younger than ${GRACE_DAYS}d — upload-then-save / duplicate race)`);
  L(`  AFTER grace         : ${afterGrace.length}   ← what a future delete WOULD target`);
  L();
  if (afterGrace.length) {
    L('  Candidate orphans after grace (eyeball for any known-live asset):');
    for (const id of afterGrace) L(`    - ${id}    (created ${createdAt.get(id) ?? '?'})`);
    L();
  }
  if (withinGrace.length) {
    L('  Held by grace (would be candidates once older):');
    for (const id of withinGrace) L(`    - ${id}    (created ${createdAt.get(id) ?? '?'})`);
    L();
  }
  L('Part 3 sizing (REPORT ONLY — no snapshot deletion performed)');
  L(`  assets pinned ONLY by deleted-page snapshots : ${strandedByPart3.length}`);
  L('    → NOT orphans today; Part 3\'s PageVersion.deleteMany on page-delete would');
  L('      strand these into pure orphans, which is why Part 3 MUST land WITH the GC,');
  L('      never before (deleting the snapshots first strictly worsens the leak).');
  if (strandedByPart3.length) for (const id of strandedByPart3) L(`    - ${id}`);
  L();
  L('Uncounted reference sources (HONESTY LIST — this report is NOT a completeness');
  L('guarantee; each below could pin an asset the diff above does not credit):');
  L('  - rich_text inline <img>: a pasted image URL living inside a Tiptap doc\'s');
  L('    HTML/JSON is NOT extracted (status doc item 13). If any exist, their assets');
  L('    would wrongly appear as orphans above. Decide scope before enabling a delete.');
  L('  - background:\'image\' has no source field yet (status doc item 11) → pins');
  L('    nothing today; whoever adds that field MUST extend collectSectionAssetRefs.');
  L('  - raw resource_type is probed but NOT diffed (builder uploads only images');
  L('    here); a non-zero raw count above is an anomaly to investigate, not an orphan.');
  L('  - src→public_id extraction FAILS LOUD: a URL outside the known patterns');
  L('    (transform baked in, unknown delivery type, malformed) is NOT guessed — it');
  L('    is counted under "unparseable references" above and pins conservatively.');
  L('    A custom Cloudinary CNAME host would be treated as external (ignored) — the');
  L('    SDK secure_url always uses res.cloudinary.com, so owned uploads never do.');
  L();
  L('No assets were deleted. Wiring a delete is a separate decision that waits for a');
  L('human to read this report and confirm the reference set is complete.');
  L('════════════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('DRY-RUN ERROR:', e?.message ?? e);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
