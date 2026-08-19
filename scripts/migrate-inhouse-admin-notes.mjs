/**
 * In-house `adminNotes`: one String → an append-only ARRAY — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING unless `--apply` is passed.
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────
 *
 *     adminNotes: "คุยกับลูกค้าแล้ว"
 *       ↓
 *     adminNotes: [{ body: "คุยกับลูกค้าแล้ว",
 *                    authorId: "",
 *                    authorName: "ไม่ทราบผู้บันทึก (ก่อนระบบบันทึกภายใน)",
 *                    createdAt: <the document's updatedAt> }]
 *
 * ── THE TWO DECISIONS, ONE LINE EACH ────────────────────────────────────────
 *
 * They are decisions about ZERO DOCUMENTS (see below), so they get one line
 * each rather than a paragraph:
 *
 *   authorName — a NAMED PLACEHOLDER, not blank and not invented. The String
 *     field carried no author; attributing it to anyone would be a false
 *     statement, and a blank byline reads as a rendering bug rather than as
 *     "unknown".
 *   createdAt — the document's OWN `updatedAt`. It is the only true upper bound
 *     on when the note was written; `new Date()` would date a 2024 note to the
 *     day the migration ran, which is worse than approximate — it is wrong in a
 *     direction that looks precise.
 *
 * ── IT HAS ZERO ROWS, AND IT IS STILL WRITTEN ───────────────────────────────
 *
 * MEASURED, READ-ONLY, BEFORE THIS WAS WRITTEN: `adminNotes` is ABSENT on all 8
 * documents in `register_inhouse`. The field was declared on the Mongoose schema
 * and never written in production, so there is nothing to migrate.
 *
 * The script exists anyway for three reasons: the measurement was taken at one
 * moment and production is not frozen; a migration that is written and reports
 * zero is evidence, while one that was never written is an assumption; and the
 * expand/migrate/contract sequence needs a migrate step to point at before the
 * String branch of `readNotes` may be removed.
 *
 * ── EXPAND / MIGRATE / CONTRACT — THIS IS THE MIDDLE STEP ───────────────────
 *
 *   EXPAND    (landed) the model types adminNotes as an array, and `readNotes`
 *             in lib/registrations/internalNotes TOLERATES BOTH shapes, so the
 *             deploy and this script are independent and a rollback strands
 *             nothing.
 *   MIGRATE   this script, with --apply.
 *   CONTRACT  removing the String branch from `readNotes`. LAST, AND ALONE, in
 *             its own commit, after --apply has run and been confirmed. It is
 *             NOT in this round. Doing it in the same deploy as the expand is
 *             the classic mistake that leaves no rollback.
 *
 * ── THIS SCRIPT WRITES NO AUDIT ROWS, DELIBERATELY ──────────────────────────
 *
 * Same ruling as migrate-inhouse-status-vocabulary: `admin_audit_logs` is
 * evidence ONLY because every line is a real person doing a real thing. This is
 * a system migration with no actor, and inventing one — a "system" pseudo-actor,
 * or whoever happened to run it — would put rows in the trail that misrepresent
 * who changed a customer's record.
 *
 * The summary below goes to STDOUT and THAT IS THE RECORD. Capture it.
 *
 * Additionally, and specific to this migration: THE NOTE BODY IS NEVER PRINTED.
 * It is the field most likely to quote a customer verbatim, and a terminal
 * scrollback or a CI log is not a place for that. The report shows LENGTHS and
 * counts. That is enough to verify the migration and nothing more.
 *
 * ── IDEMPOTENT ──────────────────────────────────────────────────────────────
 *
 * The filter is `adminNotes: { $type: 'string' }`. After a successful --apply
 * nothing matches — the field is an array — so a second run reports 0
 * would-change and writes nothing. By construction, not by a flag.
 *
 * An EMPTY string is matched by that filter too and is handled separately: it
 * is `$unset` rather than converted, because a note with no body is a byline
 * attached to nothing and `readNotes` would drop it on read anyway. Converting
 * it would store a permanent empty entry in an append-only list.
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-inhouse-admin-notes.mjs
 *   node --env-file=.env.local scripts/migrate-inhouse-admin-notes.mjs --apply
 */

import { MongoClient } from 'mongodb';
import { LEGACY_AUTHOR_NAME, NOTE_MAX_LENGTH } from '../src/lib/registrations/internalNotes.js';

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'register_inhouse';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env.local …');
  process.exit(1);
}

/**
 * How many documents hold each SHAPE of `adminNotes`.
 *
 * Read with `$type` rather than by fetching and inspecting in JS: the whole
 * question is what BSON type the field is, and a `.find()` plus `typeof` would
 * be answering it through two layers of driver coercion.
 */
async function shapes(col) {
  const [missing, str, arr, other] = await Promise.all([
    col.countDocuments({ adminNotes: { $exists: false } }),
    col.countDocuments({ adminNotes: { $type: 'string' } }),
    col.countDocuments({ adminNotes: { $type: 'array' } }),
    col.countDocuments({ adminNotes: { $exists: true, $not: { $type: ['string', 'array'] } } }),
  ]);
  return { missing, str, arr, other };
}

function printShapes(title, s, total) {
  console.log(`\n${title}`);
  console.log('  ' + '─'.repeat(56));
  console.log(`  ${'absent'.padEnd(16)} ${String(s.missing).padStart(5)}   never written`);
  console.log(`  ${'string'.padEnd(16)} ${String(s.str).padStart(5)}   LEGACY — this migration's rows`);
  console.log(`  ${'array'.padEnd(16)} ${String(s.arr).padStart(5)}   already migrated`);
  console.log(`  ${'other'.padEnd(16)} ${String(s.other).padStart(5)}   *** unexpected type ***`);
  console.log('  ' + '─'.repeat(56));
  const sum = s.missing + s.str + s.arr + s.other;
  console.log(`  ${'TOTAL'.padEnd(16)} ${String(total).padStart(5)}` +
    (sum === total ? '   (buckets sum to total)' : `   *** MISMATCH: buckets sum to ${sum} ***`));
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection(COLLECTION);

console.log('═'.repeat(60));
console.log(' IN-HOUSE adminNotes MIGRATION — String → append-only Array');
console.log('═'.repeat(60));
console.log(`   DATABASE   : ${db.databaseName}.${COLLECTION}`);
console.log(`   MODE       : ${APPLY ? '--apply  (WILL WRITE)' : 'dry run  (writes nothing)'}`);
console.log('   AUDIT ROWS : none, deliberately — see the header');
console.log('   NOTE BODIES: never printed — lengths only. See the header.');

const total = await col.countDocuments({});
const before = await shapes(col);
printShapes('BEFORE', before, total);

// ── The plan ────────────────────────────────────────────────────────────────

/**
 * The legacy rows, with only the three fields this migration reads.
 *
 * The PROJECTION IS DELIBERATELY NARROW. These documents hold a contact name,
 * an email, a phone and a company; a bare `.find()` would pull all of it into a
 * process whose whole output is a terminal log. Ask for what is needed.
 */
const legacy = await col
  .find({ adminNotes: { $type: 'string' } })
  .project({ _id: 1, adminNotes: 1, updatedAt: 1 })
  .toArray();

const toConvert = legacy.filter((d) => String(d.adminNotes).trim().length > 0);
const toUnset   = legacy.filter((d) => String(d.adminNotes).trim().length === 0);

console.log('\nPLAN');
console.log('  ' + '─'.repeat(56));
console.log(`  convert to a 1-entry array   ${String(toConvert.length).padStart(5)}`);
console.log(`  $unset (empty string)        ${String(toUnset.length).padStart(5)}`);
console.log(`  leave alone (absent/array)   ${String(before.missing + before.arr).padStart(5)}`);
console.log('  ' + '─'.repeat(56));

if (toConvert.length) {
  console.log('\n  ROWS TO CONVERT — id, body LENGTH, and the timestamp the entry will carry');
  console.log('  ' + '─'.repeat(56));
  for (const d of toConvert) {
    const len = String(d.adminNotes).trim().length;
    const over = len > NOTE_MAX_LENGTH ? `  *** ${len - NOTE_MAX_LENGTH} chars will be TRUNCATED ***` : '';
    const stamp = d.updatedAt ? new Date(d.updatedAt).toISOString() : '(no updatedAt — will be null)';
    console.log(`  ${String(d._id)}  ${String(len).padStart(5)} chars  ${stamp}${over}`);
  }
  console.log('  ' + '─'.repeat(56));
}

if (!APPLY) {
  console.log('\n' + '═'.repeat(60));
  console.log(' DRY RUN. Nothing was written.');
  console.log(` Re-run with --apply to convert ${toConvert.length} and unset ${toUnset.length}.`);
  console.log(' No audit rows were written. This output is the record.');
  console.log('═'.repeat(60));
  await client.close();
  process.exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────

/**
 * ONE UPDATE PER DOCUMENT, not a bulkWrite.
 *
 * Each entry's `createdAt` is that document's own `updatedAt`, so there is no
 * single `$set` that covers the set. The same reasoning as the status
 * migration's per-value arm applies too: a partial failure leaves a state the
 * very same dry run can describe, and re-running finishes the job.
 *
 * `$set` here is NOT a violation of append-only. It is the CONVERSION of a
 * pre-existing single value into the one-entry list that represents it; the
 * append-only rule governs the application's writers, and this runs once,
 * outside the app, against documents whose list does not yet exist.
 */
let converted = 0;
for (const d of toConvert) {
  const body = String(d.adminNotes).trim().slice(0, NOTE_MAX_LENGTH);
  const res = await col.updateOne(
    // The filter re-states the type, so a document migrated by a concurrent run
    // of this same script is not converted twice into a nested mess.
    { _id: d._id, adminNotes: { $type: 'string' } },
    {
      $set: {
        adminNotes: [{
          body,
          authorId: '',
          authorName: LEGACY_AUTHOR_NAME,
          createdAt: d.updatedAt ? new Date(d.updatedAt) : null,
        }],
      },
    },
  );
  converted += res.modifiedCount;
}

let unset = 0;
if (toUnset.length) {
  const res = await col.updateMany(
    { _id: { $in: toUnset.map((d) => d._id) }, adminNotes: { $type: 'string' } },
    { $unset: { adminNotes: '' } },
  );
  unset = res.modifiedCount;
}

console.log('\nAPPLIED');
console.log('  ' + '─'.repeat(56));
console.log(`  converted   ${String(converted).padStart(5)}` +
  (converted === toConvert.length ? '' : `   *** expected ${toConvert.length} ***`));
console.log(`  unset       ${String(unset).padStart(5)}` +
  (unset === toUnset.length ? '' : `   *** expected ${toUnset.length} ***`));

// ── Re-verify, from the database rather than from the counters ──────────────

const totalAfter = await col.countDocuments({});
const after = await shapes(col);
printShapes('AFTER (measured)', after, totalAfter);

console.log('\n' + '═'.repeat(60));
if (totalAfter !== total) {
  console.log(` *** DOCUMENT COUNT CHANGED: ${total} → ${totalAfter}. Investigate. ***`);
} else if (after.str > 0) {
  console.log(` *** ${after.str} document(s) still hold a String. Re-run to finish. ***`);
} else if (after.other > 0) {
  console.log(` *** ${after.other} document(s) hold an unexpected type — not this migration's to fix. ***`);
} else {
  console.log(' DONE. No document holds adminNotes as a String.');
  console.log('');
  console.log(' THE CONTRACT STEP IS NOW UNBLOCKED — and is its own commit:');
  console.log('   remove the String branch from readNotes() in');
  console.log('   src/lib/registrations/internalNotes.js, alone, with its test.');
  console.log(' Do NOT bundle it with anything else. It is the step that has no');
  console.log(' rollback if the measurement above turns out to be wrong.');
}
console.log(' No audit rows were written. This output is the record.');
console.log('═'.repeat(60));

await client.close();
