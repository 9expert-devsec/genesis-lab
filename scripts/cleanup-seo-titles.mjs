/**
 * SITE-13 / R2 — clean stored article `seoTitle` values.
 *
 * DRY RUN unless --apply is passed. Classification is the pure module
 * src/lib/articles/seoTitleCleanup.js; this file only reads rows, calls it,
 * writes a CSV and (with --apply) the guarded updates.
 *
 * -- WHAT A DRY RUN DOES -----------------------------------------------------
 * One `find` over `articles` (all of them, active or not), then a CSV of every
 * row that is not `ok` to tmp/seo-title-cleanup/dry-run-<ts>.csv (UTF-8 with
 * BOM, so Excel/Sheets read the Thai), then a console summary. The only call
 * that writes to Mongo is inside applyChanges(), which is reached solely
 * through the `if (APPLY)` branch at the bottom.
 *
 * -- WHAT --apply DOES -------------------------------------------------------
 *   1. Writes tmp/seo-title-cleanup/backup-<ts>.json of every
 *      { _id, slug, seoTitle_before, seoTitle_after } it means to change, and
 *      aborts before any write if that file cannot be written.
 *   2. For each target: updateOne({ _id, seoTitle: <exact stored value> },
 *      { $set: { seoTitle: <proposed> } }). A document an admin edited since
 *      the read no longer matches and is COUNTED as a mismatch, never
 *      overwritten. Re-running finds nothing to do.
 *   3. Raw driver collection, not the Mongoose model, so `updatedAt` is NOT
 *      bumped. app/sitemap.js emits `lastModified: a.updatedAt ?? publishedAt`
 *      for articles, so bumping it would tell crawlers ~300 old articles were
 *      just edited, and would reshuffle the admin list.
 *   4. Only rows with a proposed change: `brand-suffix`, `cut-prefix`,
 *      `brand-suffix+cut-prefix`. Never `ok`, `empty` or `needs-human`.
 *   5. Touches `seoTitle` only.
 *
 * Undo: scripts/restore-seo-titles.mjs <backup.json>.
 *
 * Dev and production share ONE MongoDB — an --apply here is a production
 * write. Run it only on an explicit go-ahead.
 *
 * Usage: node --env-file=.env.local scripts/cleanup-seo-titles.mjs [--apply]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { classifySeoTitle } from '../src/lib/articles/seoTitleCleanup.js';

const APPLY = process.argv.includes('--apply');
const OUT_DIR = path.resolve('tmp/seo-title-cleanup');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CATEGORIES = ['empty', 'brand-suffix', 'cut-prefix', 'brand-suffix+cut-prefix', 'needs-human', 'ok'];

console.log('='.repeat(72));
console.log(APPLY ? 'APPLYING WRITES to articles.seoTitle' : 'DRY RUN - nothing will be written (pass --apply)');
console.log('='.repeat(72));

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 3,
});
const articles = mongoose.connection.db.collection('articles');

const docs = await articles
  .find({}, { projection: { slug: 1, active: 1, seoTitle: 1, title: 1, excerpt: 1 } })
  .toArray();

const rows = docs.map((d) => ({ doc: d, ...classifySeoTitle(d) }));
const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
for (const r of rows) counts[r.category] += 1;
const targets = rows.filter((r) => r.proposed !== null);

// -- CSV of every non-ok row -------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const header = ['_id', 'slug', 'active', 'category', 'current_seoTitle', 'proposed_seoTitle', 'title', 'length_before', 'length_after'];
const lines = [header.join(',')];
for (const r of rows) {
  if (r.category === 'ok') continue;
  lines.push([
    String(r.doc._id), r.doc.slug, r.doc.active === true, r.category,
    r.doc.seoTitle ?? '', r.proposed ?? '', r.doc.title ?? '', r.lengthBefore, r.lengthAfter,
  ].map(csvCell).join(','));
}
const csvPath = path.join(OUT_DIR, `dry-run-${STAMP}.csv`);
writeFileSync(csvPath, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');

console.log(`articles:        ${docs.length}`);
for (const c of CATEGORIES) console.log(`  ${c.padEnd(26)} ${counts[c]}`);
console.log(`proposed changes: ${targets.length}`);
console.log(`lengths in graphemes (Intl.Segmenter)`);
console.log(`csv: ${csvPath}`);

/** The ONLY function that writes to Mongo. Called solely under `if (APPLY)`. */
async function applyChanges() {
  const backupPath = path.join(OUT_DIR, `backup-${STAMP}.json`);
  const backup = targets.map((r) => ({
    _id: String(r.doc._id),
    slug: r.doc.slug,
    seoTitle_before: r.doc.seoTitle,
    seoTitle_after: r.proposed,
  }));
  try {
    writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  } catch (e) {
    console.error(`ABORT: could not write backup ${backupPath}: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`backup: ${backupPath} (${backup.length} rows)`);

  let written = 0;
  let mismatched = 0;
  for (const r of targets) {
    // Filter on the EXACT stored value seen at classification: an admin edit
    // since the read makes this match nothing, and it is counted, not clobbered.
    const res = await articles.updateOne(
      { _id: r.doc._id, seoTitle: r.doc.seoTitle },
      { $set: { seoTitle: r.proposed } }
    );
    if (res.modifiedCount === 1) written += 1;
    else {
      mismatched += 1;
      console.log(`  mismatch (changed since read, skipped): ${r.doc._id} ${r.doc.slug}`);
    }
  }
  console.log(`written: ${written}   mismatched/skipped: ${mismatched}`);
  console.log('Article pages are ISR (revalidate = 3600): new titles appear within an hour.');
  console.log('No revalidation call was made by this script.');
}

if (APPLY) await applyChanges();

await mongoose.disconnect();
