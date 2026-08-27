/**
 * Backfill `PageVersion.versionNumber` and seed `PageBuilder.publishedVersion`.
 *
 * Round 35. Every version row written before that round has no number, and
 * every page has no counter. This assigns both.
 *
 * ── DRY RUN BY DEFAULT. `--apply` IS THE ONLY THING THAT WRITES ───────────
 * With no flag this opens the database, computes the ENTIRE plan, prints it,
 * and disconnects without a single write. There is no `updateOne` reachable
 * from the default path — the writes are inside one `if (APPLY)` block, so
 * "read-only until asked" is a property of the control flow rather than of the
 * operator remembering a flag.
 *
 * ── IDEMPOTENT, AND SPECIFICALLY: IT NEVER RENUMBERS ──────────────────────
 * Running twice must not move a number that has already been handed out, or
 * every URL, log line and support conversation referring to "version 3" would
 * start meaning something else.
 *
 * The rule is: a row that ALREADY has a numeric `versionNumber` is never
 * touched, and the numbers it holds are RESERVED. Unnumbered rows are then
 * assigned from the free numbers that remain, in `createdAt` order. So a second
 * run finds nothing unnumbered and plans nothing; a run over a partially
 * backfilled page fills only the gaps and cannot collide with what is there.
 *
 * The counter is seeded to max(highest number on the page, existing counter) —
 * never lowered. Lowering it would let the next publish mint a number that
 * already exists, which is the one thing the whole design refuses.
 *
 * ── WHY createdAt ORDER, AND WHAT IT DOES NOT CLAIM ───────────────────────
 * The rows are immutable and `{ pageId: 1, createdAt: -1 }` is already indexed,
 * so the walk is cheap and stable. The numbers it produces are ORDINAL: they
 * say which publish came before which, which is true. They are NOT a record of
 * numbers that were assigned at the time — no such record exists, because the
 * feature did not. `_id` breaks ties, since an ObjectId is monotonic within a
 * second and two publishes inside one second are otherwise unordered.
 *
 * Run:
 *   node --env-file=.env.local scripts/backfill-page-version-numbers.mjs
 *   node --env-file=.env.local scripts/backfill-page-version-numbers.mjs --apply
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

function die(msg) {
  console.error('FATAL: ' + msg);
  process.exit(1);
}

/**
 * The plan for ONE page, from its rows (any order) and its current counter.
 *
 * Pure, exported, and covered by test/pure/backfillVersionNumbers — the
 * ordering, the reservation and the idempotence are all decided here, so they
 * can be proven without a database. `main()` below is the I/O around it.
 */
export function planForPage(rows, currentCounter = 0) {
  const sorted = [...rows].sort((a, b) => {
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    if (at !== bt) return at - bt;
    return String(a._id) < String(b._id) ? -1 : 1;   // ObjectId tiebreak
  });

  // Numbers already handed out are RESERVED — never reassigned, never reused.
  const taken = new Set(
    sorted.map((r) => r.versionNumber).filter((n) => Number.isInteger(n) && n > 0)
  );

  const assignments = [];
  let next = 1;
  for (const row of sorted) {
    if (Number.isInteger(row.versionNumber) && row.versionNumber > 0) continue;
    while (taken.has(next)) next += 1;
    taken.add(next);
    assignments.push({ _id: row._id, versionNumber: next, createdAt: row.createdAt });
    next += 1;
  }

  const highest = taken.size ? Math.max(...taken) : 0;
  // Never lowered: a counter below a number already in the history would let
  // the next publish mint a duplicate.
  const counter = Math.max(highest, Number.isInteger(currentCounter) ? currentCounter : 0);
  return { assignments, counter, highest, rowCount: sorted.length };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const versions = db.collection('page_versions');
  const pages = db.collection('page_builder_pages');

  console.log(`database: ${db.databaseName}`);
  console.log(`mode:     ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}\n`);

  // Only the fields the plan needs — never the snapshots, which are whole page
  // documents and would pull the entire history into memory for a renumber.
  const rows = await versions.find({}, {
    projection: { pageId: 1, createdAt: 1, versionNumber: 1 },
  }).toArray();

  const byPage = new Map();
  for (const r of rows) {
    const key = String(r.pageId);
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(r);
  }

  const counters = new Map();
  for (const page of await pages.find({}, { projection: { publishedVersion: 1 } }).toArray()) {
    counters.set(String(page._id), page.publishedVersion);
  }

  let rowsToNumber = 0;
  let pagesToSeed = 0;
  const writes = [];

  for (const [pageId, pageRows] of [...byPage].sort()) {
    const current = counters.get(pageId);
    const plan = planForPage(pageRows, current);
    const seedNeeded = plan.counter !== (Number.isInteger(current) ? current : null);

    rowsToNumber += plan.assignments.length;
    if (seedNeeded) pagesToSeed += 1;

    console.log(`page ${pageId}`);
    console.log(`  rows: ${plan.rowCount}   already numbered: ${plan.rowCount - plan.assignments.length}`);
    for (const a of plan.assignments) {
      console.log(`    row ${a._id}  ->  version ${a.versionNumber}   (${new Date(a.createdAt).toISOString()})`);
    }
    console.log(`  publishedVersion: ${current ?? '(absent)'} -> ${plan.counter}${seedNeeded ? '' : '  (unchanged)'}`);
    console.log('');

    writes.push({ pageId, plan, seedNeeded });
  }

  // A page with NO history still needs a counter, or its first publish would
  // $inc a missing field. Mongo treats that as 0 and mints 1, which is correct
  // — so this is reported rather than written, and named so the zero is not
  // mistaken for an oversight.
  const pagesWithoutHistory = [...counters.keys()].filter((id) => !byPage.has(id));
  if (pagesWithoutHistory.length) {
    console.log(`${pagesWithoutHistory.length} page(s) have no history at all — left alone.`);
    console.log('  $inc on a missing field starts at 0 and mints version 1, which is correct.\n');
  }

  console.log('── PLAN ──');
  console.log(`  version rows to number: ${rowsToNumber}`);
  console.log(`  pages to seed:          ${pagesToSeed}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to perform it.');
    await mongoose.disconnect();
    return;
  }

  let numbered = 0;
  let seeded = 0;
  for (const { pageId, plan, seedNeeded } of writes) {
    for (const a of plan.assignments) {
      // Guarded on the field still being unset: if another run (or a publish)
      // numbered this row between the plan and the write, that number stands.
      // eslint-disable-next-line no-await-in-loop
      const res = await versions.updateOne(
        { _id: a._id, versionNumber: { $not: { $type: 'number' } } },
        { $set: { versionNumber: a.versionNumber } }
      );
      numbered += res.modifiedCount;
    }
    if (seedNeeded) {
      // $max, not $set: concurrent publishes may have already pushed the
      // counter past the plan, and this must never pull it back down.
      // eslint-disable-next-line no-await-in-loop
      const res = await pages.updateOne({ _id: toId(pageId) }, { $max: { publishedVersion: plan.counter } });
      seeded += res.modifiedCount;
    }
  }

  console.log(`\nAPPLIED — rows numbered: ${numbered}, pages seeded: ${seeded}`);
  await mongoose.disconnect();
}

/** page_builder_pages._id is an ObjectId; page_versions.pageId is its string. */
function toId(pageId) {
  return mongoose.Types.ObjectId.isValid(pageId)
    ? new mongoose.Types.ObjectId(pageId)
    : pageId;
}

// Importable for the pure tests without running the migration.
if (process.argv[1] && process.argv[1].includes('backfill-page-version-numbers')) {
  main().catch(async (err) => {
    console.error(err?.message ?? err);
    try { await mongoose.disconnect(); } catch { /* already down */ }
    process.exit(1);
  });
}
