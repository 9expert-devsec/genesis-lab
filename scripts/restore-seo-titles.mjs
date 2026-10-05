/**
 * Undo for scripts/cleanup-seo-titles.mjs (SITE-13 / R2).
 *
 * Reads a backup-<ts>.json written by the cleanup's --apply and puts each
 * `seoTitle_before` back, ONLY where the document still holds the
 * `seoTitle_after` the cleanup wrote. A title an admin edited since then is
 * reported as a mismatch and left alone.
 *
 * DRY RUN unless --apply is passed, like the cleanup: without it, the script
 * only counts how many rows would be restored. Raw driver updateOne, so
 * `updatedAt` is not bumped (it feeds the sitemap's lastModified). Touches
 * `seoTitle` only.
 *
 * Dev and production share ONE MongoDB — --apply is a production write.
 *
 * Usage: node --env-file=.env.local scripts/restore-seo-titles.mjs <backup.json> [--apply]
 */
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: restore-seo-titles.mjs <backup.json> [--apply]');
  process.exit(1);
}
const backup = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(backup)) {
  console.error(`${file}: expected an array of { _id, slug, seoTitle_before, seoTitle_after }`);
  process.exit(1);
}

console.log(APPLY ? `RESTORING ${backup.length} rows from ${file}` : `DRY RUN - ${backup.length} rows in ${file} (pass --apply)`);

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 3,
});
const articles = mongoose.connection.db.collection('articles');

let restorable = 0;
let restored = 0;
let mismatched = 0;
for (const row of backup) {
  const filter = { _id: new mongoose.Types.ObjectId(row._id), seoTitle: row.seoTitle_after };
  if (!APPLY) {
    if (await articles.countDocuments(filter)) restorable += 1;
    else mismatched += 1;
    continue;
  }
  const res = await articles.updateOne(filter, { $set: { seoTitle: row.seoTitle_before } });
  if (res.modifiedCount === 1) restored += 1;
  else {
    mismatched += 1;
    console.log(`  mismatch (changed since cleanup, skipped): ${row._id} ${row.slug}`);
  }
}

if (APPLY) console.log(`restored: ${restored}   mismatched/skipped: ${mismatched}`);
else console.log(`would restore: ${restorable}   mismatched: ${mismatched}`);
console.log('Article pages are ISR (revalidate = 3600): restored titles appear within an hour.');

await mongoose.disconnect();
