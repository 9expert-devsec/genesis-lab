/**
 * INTERNAL-NOTE BYLINES — READ-ONLY, DRY-RUN, NO --apply.
 *
 *   node --env-file=.env.local scripts/audit-internal-note-bylines.mjs
 *
 * ── THIS SCRIPT NEVER WRITES ────────────────────────────────────────────────
 * Not behind a flag, not with a prompt, not at all. There is no updateOne,
 * updateMany, bulkWrite, $set or $push anywhere in this file. It runs `find()`
 * and prints.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * A saved internal note renders its body and then a bare `—` where the author
 * and time belong. That has exactly two possible causes and they need opposite
 * fixes:
 *
 *   A. THE WRITE PATH lost `authorName` / `createdAt`, so the data is missing
 *      permanently on every note saved so far;
 *   B. THE READ PATH is looking at the wrong field or a stale shape, and the
 *      data is sitting there intact.
 *
 * Guessing between them is how a display "fix" ships over a silent data loss,
 * or a migration runs over data that was never broken. So this prints the RAW
 * SUBDOCUMENT KEYS of every stored note in both collections.
 *
 * It prints key NAMES and metadata, plus the first 40 characters of each body
 * so a human can recognise the note they are looking at. It does NOT dump whole
 * note bodies: internal notes are the field most likely to quote a customer
 * verbatim, which is why they are kept out of the audit trail in the first
 * place, and a terminal transcript is not a better home for that than the audit
 * log was.
 */
import mongoose from 'mongoose';

const die = (m) => { console.error(`\n${m}\n`); process.exit(1); };

/** The two collections that carry `adminNotes`. */
const COLLECTIONS = [
  ['register_public', 'public'],
  ['register_inhouse', 'in-house'],
];

const preview = (s) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  console.log('');
  console.log('══ INTERNAL NOTE BYLINES — READ ONLY, NOTHING WAS WRITTEN ══════════════════');

  let totalNotes = 0;
  let withAuthorName = 0;
  let withAuthorId = 0;
  let withCreatedAt = 0;
  const shapes = new Map();

  for (const [collection, label] of COLLECTIONS) {
    // Raw collection access — no model import chain, and a read-only find().
    const docs = await db.collection(collection)
      .find({}, { projection: { adminNotes: 1, status: 1, updatedAt: 1 } })
      .toArray();

    const withField = docs.filter((d) => d.adminNotes != null);
    console.log(`\n── ${collection} (${label}) ──`);
    console.log(`  documents: ${docs.length}`);
    console.log(`  carrying an adminNotes field at all: ${withField.length}`);

    const strings = withField.filter((d) => typeof d.adminNotes === 'string');
    const arrays = withField.filter((d) => Array.isArray(d.adminNotes));
    const other = withField.filter((d) => typeof d.adminNotes !== 'string' && !Array.isArray(d.adminNotes));
    console.log(`    legacy String shape: ${strings.length}`);
    console.log(`    Array shape:         ${arrays.length}`);
    if (other.length) console.log(`    NEITHER (unexpected): ${other.length}`);

    for (const doc of arrays) {
      for (const [i, note] of doc.adminNotes.entries()) {
        totalNotes += 1;
        const keys = note && typeof note === 'object' ? Object.keys(note).sort() : ['(not an object)'];
        const sig = keys.join(',');
        shapes.set(sig, (shapes.get(sig) ?? 0) + 1);

        const hasName = Boolean(note?.authorName);
        const hasId = Boolean(note?.authorId);
        const hasWhen = Boolean(note?.createdAt);
        if (hasName) withAuthorName += 1;
        if (hasId) withAuthorId += 1;
        if (hasWhen) withCreatedAt += 1;

        console.log(`\n    ${String(doc._id)} [${doc.status}] note #${i}`);
        console.log(`      keys        : ${sig}`);
        console.log(`      body        : "${preview(note?.body)}"`);
        console.log(`      authorName  : ${JSON.stringify(note?.authorName)}  ${hasName ? '' : '  <- EMPTY'}`);
        console.log(`      authorId    : ${JSON.stringify(note?.authorId)}  ${hasId ? '' : '  <- EMPTY'}`);
        console.log(`      createdAt   : ${JSON.stringify(note?.createdAt)}  ${hasWhen ? '' : '  <- EMPTY'}`);
        console.log(`      doc updatedAt: ${JSON.stringify(doc.updatedAt)}`);
      }
    }

    for (const doc of strings) {
      totalNotes += 1;
      shapes.set('(legacy String)', (shapes.get('(legacy String)') ?? 0) + 1);
      console.log(`\n    ${String(doc._id)} [${doc.status}] LEGACY STRING`);
      console.log(`      body        : "${preview(doc.adminNotes)}"`);
      console.log(`      doc updatedAt: ${JSON.stringify(doc.updatedAt)}`);
    }
  }

  console.log('\n══ SUMMARY ═════════════════════════════════════════════════════════════════');
  console.log(`  notes across both collections : ${totalNotes}`);
  console.log(`  carrying a non-empty authorName: ${withAuthorName}`);
  console.log(`  carrying a non-empty authorId  : ${withAuthorId}`);
  console.log(`  carrying a createdAt           : ${withCreatedAt}`);
  console.log('\n  distinct key signatures:');
  for (const [sig, n] of [...shapes].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${sig}`);
  }

  console.log('\n  READING THIS:');
  console.log('   · authorName present, byline blank  -> a READ defect');
  console.log('   · authorName absent on every note   -> a WRITE defect, and it is permanent');
  console.log('   · authorId present, authorName not  -> the write had a session but no name on it');
  console.log('');

  await mongoose.disconnect();
}

main().catch((e) => die(e?.stack ?? String(e)));
