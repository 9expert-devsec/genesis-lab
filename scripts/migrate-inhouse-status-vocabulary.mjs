/**
 * In-house status vocabulary: five values → three — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING unless `--apply` is passed.
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────
 *
 *     new         → pending      (รอดำเนินการ)
 *     contacted   → pending
 *     quoted      → quoted       (unchanged — not a key in the map, not touched)
 *     closed-won  → quoted
 *     closed-lost → cancelled    (ยกเลิก)
 *
 * The mapping is NOT written out here. It is imported from
 * src/lib/registrations/statuses.js, which is the same constant the application
 * reads to widen its filters and to render legacy labels. A second copy in this
 * file is how the script and the product would come to disagree about what a
 * document means — and this script is the thing that makes the product's
 * assumption true.
 *
 * ── TWO OF THESE EDGES ARE LOSSY, AND THAT WAS ACCEPTED EXPLICITLY ──────────
 * `contacted` and `closed-won` are GONE, not renamed. After this there is no
 * place to record that a lead was contacted or that a deal was won. If the
 * sales team wants that back, the correct shape is a SEPARATE FIELD
 * (contactedAt / wonAt) and NOT a re-expanded status enum. The full reasoning,
 * including why `closed-won → quoted` is right rather than a mistake, is in the
 * module's header — read it before undoing anything here.
 *
 * ── THIS SCRIPT WRITES NO AUDIT ROWS, DELIBERATELY ──────────────────────────
 * `admin_audit_logs` is evidence ONLY because every line in it is a real person
 * doing a real thing at a real time. This is a SYSTEM MIGRATION: there is no
 * actor, and inventing one — a "system" pseudo-actor, or the operator who
 * happened to run the script — would put rows in the trail that misrepresent
 * who changed six customers' records. Six rows attributed to nobody make every
 * other row in the collection slightly less trustworthy.
 *
 * So the summary below goes to STDOUT and that is the record. Capture it if you
 * need one. The audit trail's own history of these documents is untouched and
 * still holds the retired values — which is why the app has a legacy label map
 * (see LEGACY_STATUS_LABELS) rather than migrating those rows too.
 *
 * ── IDEMPOTENT ──────────────────────────────────────────────────────────────
 * The filter is `status: { $in: [...retired values] }`. After a successful
 * --apply nothing matches, so a second run reports 0 would-change and writes
 * nothing. Running it twice is a no-op, by construction rather than by a flag.
 *
 * ── ORDERING. READ THIS BEFORE RUNNING IT ───────────────────────────────────
 * The Mongoose enum on RegisterInhouse is currently the UNION of both
 * vocabularies, on purpose. It must NOT be narrowed to the three until AFTER
 * this has been applied: `enum` is a validator that runs on create/save, so a
 * narrowed enum with `new` still in the collection breaks the one write that
 * validates (the in-house API route) and any status-filtered query written
 * against the new vocabulary. The narrowing is its own separate commit.
 *
 * This script does not touch the enum and cannot: it writes through the raw
 * driver, not through Mongoose, precisely so that validation state cannot
 * affect whether the data migrates.
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-inhouse-status-vocabulary.mjs
 *   node --env-file=.env.local scripts/migrate-inhouse-status-vocabulary.mjs --apply
 */

import { MongoClient } from 'mongodb';
import {
  INHOUSE_LEGACY_STATUS_MAP,
  INHOUSE_STATUS_VALUES,
  statusLabel,
} from '../src/lib/registrations/statuses.js';

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'register_inhouse';
const SAMPLE_SIZE = 10;

const RETIRED = Object.keys(INHOUSE_LEGACY_STATUS_MAP);

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env.local …');
  process.exit(1);
}

/** Every distinct stored status and its count, straight off the collection. */
async function histogram(col) {
  const rows = await col
    .aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  return new Map(rows.map((r) => [r._id === undefined ? '(missing)' : r._id, r.n]));
}

function printHistogram(title, hist, total) {
  console.log(`\n${title}`);
  console.log('  ' + '─'.repeat(56));
  let sum = 0;
  // Live values first, in pipeline order, then anything else — so the shape of
  // the collection is readable rather than sorted by an accident of counts.
  const ordered = [
    ...INHOUSE_STATUS_VALUES.filter((v) => hist.has(v)),
    ...[...hist.keys()].filter((k) => !INHOUSE_STATUS_VALUES.includes(k)),
  ];
  for (const value of ordered) {
    const n = hist.get(value) ?? 0;
    sum += n;
    const retired = RETIRED.includes(value) ? '  ← RETIRED' : '';
    console.log(`  ${String(value).padEnd(16)} ${String(n).padStart(5)}   ${statusLabel(value)}${retired}`);
  }
  console.log('  ' + '─'.repeat(56));
  console.log(`  ${'TOTAL'.padEnd(16)} ${String(total).padStart(5)}` +
    (sum === total ? '   (buckets sum to total)' : `   *** MISMATCH: buckets sum to ${sum} ***`));
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection(COLLECTION);

console.log('═'.repeat(60));
console.log(' IN-HOUSE STATUS VOCABULARY MIGRATION — five values → three');
console.log('═'.repeat(60));
console.log(`   DATABASE   : ${db.databaseName}.${COLLECTION}`);
console.log(`   MODE       : ${APPLY ? '--apply  (WILL WRITE)' : 'dry run  (writes nothing)'}`);
console.log('   AUDIT ROWS : none, deliberately — see the header');

const total = await col.countDocuments({});
const before = await histogram(col);
printHistogram('BEFORE', before, total);

// ── The plan, per retired value ─────────────────────────────────────────────

console.log('\nPLAN');
console.log('  ' + '─'.repeat(56));

const plan = [];
for (const [from, to] of Object.entries(INHOUSE_LEGACY_STATUS_MAP)) {
  const n = await col.countDocuments({ status: from });
  plan.push({ from, to, n });
  const lossy = (from === 'contacted' || from === 'closed-won') ? '   (LOSSY — see header)' : '';
  console.log(`  ${from.padEnd(13)} → ${to.padEnd(11)} ${String(n).padStart(5)} document(s)${lossy}`);
}
const wouldChange = plan.reduce((s, p) => s + p.n, 0);
console.log('  ' + '─'.repeat(56));
console.log(`  WOULD CHANGE  ${String(wouldChange).padStart(5)} document(s)`);

/**
 * A SAMPLE OF AFFECTED _ids, so the operator can spot-check a few records in
 * the admin before and after rather than trusting a count.
 */
if (wouldChange > 0) {
  const sample = await col
    .find({ status: { $in: RETIRED } }, { projection: { status: 1, companyName: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(SAMPLE_SIZE)
    .toArray();
  console.log(`\nSAMPLE (${sample.length} of ${wouldChange})`);
  console.log('  ' + '─'.repeat(56));
  for (const d of sample) {
    const when = d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : '    -     ';
    console.log(
      `  ${String(d._id)}  ${String(d.status).padEnd(12)} → ${INHOUSE_LEGACY_STATUS_MAP[d.status].padEnd(10)}` +
      `  ${when}  ${(d.companyName ?? '').slice(0, 22)}`
    );
  }
}

// ── AFTER, projected ────────────────────────────────────────────────────────

const projected = new Map();
for (const [value, n] of before) {
  const target = INHOUSE_LEGACY_STATUS_MAP[value] ?? value;
  projected.set(target, (projected.get(target) ?? 0) + n);
}
printHistogram('AFTER (projected)', projected, total);

// ── Apply, or stop ──────────────────────────────────────────────────────────

if (!APPLY) {
  console.log('\n' + '═'.repeat(60));
  if (wouldChange === 0) {
    console.log(' NOTHING TO DO — no document holds a retired status.');
    console.log(' (This is also what a second run looks like: the migration is');
    console.log('  idempotent, so re-running it after --apply reports 0 here.)');
  } else {
    console.log(' DRY RUN — nothing was written.');
    console.log('');
    console.log(' To apply, run it yourself:');
    console.log('   node --env-file=.env.local \\');
    console.log('     scripts/migrate-inhouse-status-vocabulary.mjs --apply');
    console.log('');
    console.log(' THEN, and only then, land the commit that narrows the Mongoose');
    console.log(' enum on RegisterInhouse to the three live values.');
  }
  console.log('═'.repeat(60));
  await client.close();
  process.exit(0);
}

console.log('\n' + '═'.repeat(60));
console.log(' APPLYING');
console.log('═'.repeat(60));

/**
 * ONE updateMany PER RETIRED VALUE, not one bulk pass.
 *
 * Each write is filtered on the exact `from` value, so a document can only be
 * touched by the arm that names its current status. A single bulkWrite over the
 * whole set would be marginally faster and would make a partial failure much
 * harder to read: with one call per value, a failure leaves a state the very
 * same dry run can describe, and re-running finishes the job.
 */
let changed = 0;
for (const { from, to, n } of plan) {
  if (n === 0) {
    console.log(`  ${from.padEnd(13)} → ${to.padEnd(11)}      skipped (0 documents)`);
    continue;
  }
  const res = await col.updateMany({ status: from }, { $set: { status: to } });
  changed += res.modifiedCount;
  const warn = res.modifiedCount === n ? '' : `   *** expected ${n} ***`;
  console.log(`  ${from.padEnd(13)} → ${to.padEnd(11)} ${String(res.modifiedCount).padStart(5)} modified${warn}`);
}

console.log('  ' + '─'.repeat(56));
console.log(`  CHANGED       ${String(changed).padStart(5)} document(s)`);

// ── Re-verify, from the database rather than from the counters ──────────────

const totalAfter = await col.countDocuments({});
const after = await histogram(col);
printHistogram('AFTER (measured)', after, totalAfter);

const stragglers = RETIRED.filter((v) => (after.get(v) ?? 0) > 0);
const unexpected = [...after.keys()].filter((v) => !INHOUSE_STATUS_VALUES.includes(v));

console.log('\n' + '═'.repeat(60));
if (totalAfter !== total) {
  console.log(` *** DOCUMENT COUNT CHANGED: ${total} → ${totalAfter}. Investigate. ***`);
} else if (stragglers.length) {
  console.log(` *** ${stragglers.join(', ')} still present. Re-run to finish. ***`);
} else if (unexpected.length) {
  console.log(` *** values outside the live vocabulary remain: ${unexpected.join(', ')} ***`);
  console.log(' These were never in the mapping — they are not this migration\'s to fix.');
} else {
  console.log(' DONE. Every document holds a live status.');
  console.log('');
  console.log(' NOW land the commit that narrows the Mongoose enum on');
  console.log(' RegisterInhouse to the three live values. It was held back for');
  console.log(' this moment: narrowing it earlier would have failed validation');
  console.log(' on the one write that validates.');
}
console.log(' No audit rows were written. This output is the record.');
console.log('═'.repeat(60));

await client.close();
