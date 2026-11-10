/**
 * Seed the default writer (9Expert Academy) — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING unless `--apply` is passed. Without it this script performs
 * reads and prints what it would do.
 *
 * ── RAW DRIVER, NO WRITER MODEL, ON PURPOSE ────────────────────────────────
 * dev and production share one MongoDB, and loading src/models/Writer.js on a
 * connection creates the `writers` collection and its indexes through Mongoose's
 * autoCreate/autoIndex. A dry run has to leave the database as it found it, so
 * this script never registers the model. Reading a collection that does not
 * exist yet returns nothing and does not create it.
 *
 * Safe to re-run: the plan in src/lib/writers/defaultWriter.js is a no-op once
 * the row is right, and it never overwrites text an admin has since edited.
 *
 * Usage:
 *   node scripts/seed-default-writer.mjs            # dry run, writes nothing
 *   node scripts/seed-default-writer.mjs --apply    # writes
 */

import { existsSync } from 'node:fs';
import mongoose from 'mongoose';
import { DEFAULT_WRITER_SLUG, planDefaultWriterSeed } from '../src/lib/writers/defaultWriter.js';

const APPLY = process.argv.includes('--apply');

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!process.env.MONGODB_URI && existsSync('.env.local')) process.loadEnvFile('.env.local');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — run from the repo root, or pass --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const writers = mongoose.connection.db.collection('writers');

  console.log(`mode:       ${APPLY ? 'APPLY' : 'DRY RUN (nothing will be written)'}`);
  console.log(`database:   ${mongoose.connection.db.databaseName}`);

  const [existing, otherDefault] = await Promise.all([
    writers.findOne({ slug: DEFAULT_WRITER_SLUG }),
    writers.findOne({ isDefault: true, slug: { $ne: DEFAULT_WRITER_SLUG } }),
  ]);
  console.log(`row '${DEFAULT_WRITER_SLUG}': ${existing ? 'exists' : 'not found'}`);

  const plan = planDefaultWriterSeed({ existing, otherDefault, now: new Date() });

  if (plan.action === 'refuse') {
    await mongoose.disconnect();
    die(`refused: '${plan.otherDefault.slug}' is already the default writer. Nothing was written.`);
  }

  if (plan.action === 'noop') {
    console.log('plan:       nothing to do');
  } else if (plan.action === 'insert') {
    console.log('plan:       insert');
    console.log(JSON.stringify(plan.doc, null, 2));
    if (APPLY) await writers.insertOne(plan.doc);
  } else {
    console.log('plan:       repair flags on the existing row');
    console.log(JSON.stringify(plan.$set, null, 2));
    if (APPLY) await writers.updateOne({ _id: existing._id }, { $set: plan.$set });
  }

  if (plan.action !== 'noop') {
    console.log(APPLY ? 'applied.' : 'dry run: pass --apply to write this.');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  try { await mongoose.disconnect(); } catch { /* already down */ }
  die(err?.message ?? String(err));
});
