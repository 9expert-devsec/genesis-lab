/**
 * publishedAt timezone audit — DRY-RUN, READ-ONLY (b-001, Phase A).
 *
 * This script performs NO writes. Not behind a flag, not at all: one
 * `find()` and a report. There is no `updateOne`, no `bulkWrite`, no
 * `$set` anywhere in this file.
 *
 * ── WHY THERE IS NO MIGRATION HERE ──────────────────────────────────────────
 * The fix in src/lib/articlePublishTime.js corrects the write path from now on.
 * It does NOT correct history, and history cannot be corrected mechanically:
 *
 *   · Some existing `publishedAt` values were written by the buggy path (a
 *     wall-clock time read as UTC — 7 hours late).
 *   · Some were written correctly — by a seed, an import, an earlier code
 *     path, or by an admin who happened to pick a time whose intent survived.
 *   · NOTHING in the document records which. There is no `createdBy`, no schema
 *     version, no marker. `updatedAt` does not distinguish them either, because
 *     the buggy parser has been in place for the whole life of the collection.
 *
 * So a blanket `-7h` would silently corrupt every correctly-stored row, and the
 * corruption would be invisible: the page still renders, the date is merely
 * wrong. That is strictly worse than the current state, where the error is at
 * least consistent. The repair is a HUMAN decision made after reading this
 * report, and it belongs in a separate, later script.
 *
 * ── WHAT THIS LOOKS FOR ─────────────────────────────────────────────────────
 * The signature of the bug: an admin sitting in Bangkok picks an evening time,
 * and the stored instant lands in the 17:00-23:59 UTC band. Why that band —
 *
 *   A time picked as HH:mm Bangkok SHOULD store as (HH-7):mm UTC. Picked
 *   between 17:00 and 23:59 local, the correct instant is 10:00-16:59Z. The
 *   buggy path stored the wall-clock digits verbatim, i.e. 17:00-23:59Z.
 *   A CORRECT save can only land in 17:00-23:59Z if the admin picked
 *   00:00-06:59 the next morning — which is possible, but is not when anyone
 *   publishes an article. So the band is a strong signal, not a proof.
 *
 * Everything outside the band is ambiguous in the other direction and is
 * counted but not listed: a value there may still be wrong, it just carries no
 * evidence either way. The report says so rather than implying the rest is
 * clean.
 *
 * Usage:  node --env-file=.env.local scripts/audit-article-published-at.mjs
 */

import mongoose from 'mongoose';

const SITE_UTC_OFFSET_HOURS = 7; // Asia/Bangkok — see src/lib/articlePublishTime.js

// The suspect band, in UTC hours (inclusive).
const BAND_START_HOUR = 17;
const BAND_END_HOUR = 23;

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

/** Format an instant in Asia/Bangkok, for the "what the admin sees" column. */
const BKK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const inBangkok = (d) => BKK.format(d).replace(', ', ' ');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  // Raw collection access — no model import chain, and a read-only find().
  const docs = await db.collection('articles')
    .find({}, { projection: { slug: 1, title: 1, publishedAt: 1, active: 1 } })
    .toArray();

  const total = docs.length;
  const drafts = docs.filter((d) => !d.publishedAt).length;
  const dated = docs.filter((d) => d.publishedAt instanceof Date && !Number.isNaN(d.publishedAt.getTime()));
  const unparseable = docs.filter((d) => d.publishedAt && !(d.publishedAt instanceof Date));

  const suspect = [];
  for (const d of dated) {
    const h = d.publishedAt.getUTCHours();
    if (h >= BAND_START_HOUR && h <= BAND_END_HOUR) suspect.push(d);
  }
  suspect.sort((a, b) => a.publishedAt - b.publishedAt);

  console.log('');
  console.log('── publishedAt timezone audit — DRY RUN, NOTHING WAS WRITTEN ──────────');
  console.log('');
  console.log(`  articles scanned            : ${total}`);
  console.log(`  drafts (publishedAt null)   : ${drafts}`);
  console.log(`  with a usable date          : ${dated.length}`);
  if (unparseable.length) {
    console.log(`  ⚠ non-Date publishedAt      : ${unparseable.length}  (listed below)`);
  }
  console.log(`  in the suspect band ${BAND_START_HOUR}:00-${BAND_END_HOUR}:59 UTC : ${suspect.length}`);
  console.log('');

  if (suspect.length === 0) {
    console.log('  No article carries the signature. That is NOT the same as "no article');
    console.log('  is affected" — see the band note at the top of this file.');
  } else {
    console.log(`  Each row shows what it WOULD become if shifted -${SITE_UTC_OFFSET_HOURS}h. That shift is`);
    console.log('  a PROPOSAL for a human to judge, not a plan this script will run.');
    console.log('');
    const pad = (s, n) => String(s).padEnd(n);
    console.log(`  ${pad('slug', 44)} ${pad('stored (UTC)', 26)} ${pad('reads now (BKK)', 18)} ${pad('would become (UTC)', 26)} shows as (BKK)`);
    console.log(`  ${'-'.repeat(44)} ${'-'.repeat(26)} ${'-'.repeat(18)} ${'-'.repeat(26)} ${'-'.repeat(18)}`);
    for (const d of suspect) {
      const shifted = new Date(d.publishedAt.getTime() - SITE_UTC_OFFSET_HOURS * 3600 * 1000);
      const slug = String(d.slug ?? '(no slug)');
      console.log(
        `  ${pad(slug.length > 43 ? slug.slice(0, 42) + '…' : slug, 44)} ` +
        `${pad(d.publishedAt.toISOString(), 26)} ` +
        `${pad(inBangkok(d.publishedAt), 18)} ` +
        `${pad(shifted.toISOString(), 26)} ` +
        `${inBangkok(shifted)}`
      );
    }
  }

  if (unparseable.length) {
    console.log('');
    console.log('  ⚠ publishedAt present but not a Date — these need a look regardless:');
    for (const d of unparseable) {
      console.log(`    ${d.slug ?? '(no slug)'} → ${JSON.stringify(d.publishedAt)}`);
    }
  }

  console.log('');
  console.log('── end of report. No documents were modified. ─────────────────────────');
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
