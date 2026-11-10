/**
 * Bind every article to its writer — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING unless `--apply` is passed.
 *
 * Raw driver and no models, as in scripts/seed-default-writer.mjs: dev and
 * production share one MongoDB, and loading src/models/Article.js on a connection
 * would build the `writerIds` index from wherever this happens to run.
 *
 * The write is a raw `updateOne` setting `writerIds` and nothing else, so
 * `updatedAt`, `contentUpdatedAt` and `author` all stay as they are. Safe to
 * re-run: an article with a writer is never touched. The mapping and the plan
 * are in src/lib/writers/articleWriterMigration.js.
 *
 * Usage:
 *   node scripts/migrate-article-writers.mjs            # dry run, writes nothing
 *   node scripts/migrate-article-writers.mjs --apply    # writes
 */

import { existsSync } from 'node:fs';
import mongoose from 'mongoose';
import {
  MIGRATION_WRITER_SLUGS,
  planArticleWriterMigration,
} from '../src/lib/writers/articleWriterMigration.js';

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
  const { db } = mongoose.connection;
  const articles = db.collection('articles');

  console.log(`mode:       ${APPLY ? 'APPLY' : 'DRY RUN (nothing will be written)'}`);
  console.log(`database:   ${db.databaseName}`);

  const writers = await db.collection('writers')
    .find({ slug: { $in: MIGRATION_WRITER_SLUGS } }, { projection: { slug: 1, isActive: 1 } })
    .toArray();
  const writerIdBySlug = new Map();
  for (const slug of MIGRATION_WRITER_SLUGS) {
    const writer = writers.find((row) => row.slug === slug);
    if (!writer || writer.isActive === false) {
      await mongoose.disconnect();
      die(`aborted: writer '${slug}' is missing or inactive. Nothing was written.`);
    }
    writerIdBySlug.set(slug, writer._id);
    console.log(`writer:     ${slug} → ${writer._id}`);
  }

  const rows = await articles
    .find({}, { projection: { author: 1, active: 1, writerIds: 1 } })
    .toArray();
  const plan = planArticleWriterMigration(rows, writerIdBySlug);

  console.log(`\narticles:   ${rows.length}`);
  console.log(`already set (skipped): ${plan.alreadySet}`);

  console.log('\nmapped:');
  for (const row of plan.mapped) {
    console.log(`  ${JSON.stringify(row.author)} → ${row.slug}: ${row.active} active, ${row.inactive} inactive`);
  }

  console.log('\nunmapped (reported and skipped):');
  if (plan.unmapped.length === 0) console.log('  none');
  for (const row of plan.unmapped) {
    console.log(`  ${JSON.stringify(row.author)}: ${row.ids.length} — ${row.ids.join(', ')}`);
  }

  console.log(`\n${APPLY ? 'to write' : 'would write'}: ${plan.writes.length}`);

  if (APPLY) {
    let modified = 0;
    for (const { _id, writerId } of plan.writes) {
      // The filter repeats the rule, so a save landing mid-run is not overwritten.
      const result = await articles.updateOne(
        { _id, 'writerIds.0': { $exists: false } },
        { $set: { writerIds: [writerId] } },
      );
      modified += result.modifiedCount;
    }
    console.log(`written:    ${modified}`);

    const bound = await articles.countDocuments({ 'writerIds.0': { $exists: true } });
    const expected = plan.alreadySet + plan.writes.length;
    console.log(`verified:   ${bound} articles have a writer (expected ${expected})`);
    if (bound !== expected) {
      await mongoose.disconnect();
      die(`count mismatch: ${bound} !== ${expected}. Re-run the dry run to see what is left.`);
    }
  } else {
    console.log('dry run: pass --apply to write this.');
  }

  console.log('\narticle pages cache for 1 hour — bylines update as pages revalidate, or redeploy');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  try { await mongoose.disconnect(); } catch { /* already down */ }
  die(err?.message ?? String(err));
});
