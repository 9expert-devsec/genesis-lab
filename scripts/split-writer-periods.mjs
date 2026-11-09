/**
 * Split each writer section row's leading year into `period` — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING to the database unless `--apply` is passed. Without it this
 * script reads the writers, writes a CSV report to tmp/ and prints counts.
 *
 *   "2013 – Present · 9Expert Co., Ltd. — …"
 *     → { period: "2013 – Present", text: "9Expert Co., Ltd. — …" }
 *
 * The rule is src/lib/writers/splitWriterPeriod.js and nothing else: a row that
 * does not START with a period and " · " becomes `{ text }` unchanged. Rows
 * already in the object shape are skipped, so a re-run writes nothing.
 *
 * ── RAW DRIVER, NO WRITER MODEL, ON PURPOSE ────────────────────────────────
 * Same reason as scripts/seed-default-writer.mjs: dev and production share one
 * MongoDB, and a dry run must leave it exactly as it found it.
 *
 * Usage:
 *   node scripts/split-writer-periods.mjs            # dry run + CSV, writes nothing
 *   node scripts/split-writer-periods.mjs --apply    # writes
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { planWriterPeriodSplit } from '../src/lib/writers/splitWriterPeriod.js';

const APPLY = process.argv.includes('--apply');

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

if (!process.env.MONGODB_URI && existsSync('.env.local')) process.loadEnvFile('.env.local');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — run from the repo root, or pass --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const writers = mongoose.connection.db.collection('writers');

  console.log(`mode:       ${APPLY ? 'APPLY' : 'DRY RUN (nothing will be written)'}`);
  console.log(`database:   ${mongoose.connection.db.databaseName}`);

  const docs = await writers.find({}, { projection: { slug: 1, sections: 1 } }).sort({ slug: 1 }).toArray();
  const plans = docs.map((doc) => ({ doc, plan: planWriterPeriodSplit(doc) }));
  const rows = plans.flatMap(({ plan }) => plan.rows);

  const split = rows.filter((r) => r.action === 'split').length;
  const kept = rows.filter((r) => r.action === 'keep').length;
  const toWrite = plans.filter(({ plan }) => plan.changed);

  // The report, whatever the mode.
  mkdirSync('tmp', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = `tmp/split-writer-periods-${stamp}.csv`;
  const header = ['writer', 'section', 'action', 'before', 'period', 'text'];
  const csv = [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n');
  writeFileSync(csvPath, `﻿${csv}\n`, 'utf8');

  console.log(`writers:    ${docs.length} (${toWrite.length} with string rows)`);
  console.log(`split:      ${split}`);
  console.log(`left as-is: ${kept} (become { text } unchanged)`);
  for (const key of ['experience', 'education', 'certifications', 'recognition']) {
    const s = rows.filter((r) => r.section === key);
    console.log(`  ${key.padEnd(15)} split ${s.filter((r) => r.action === 'split').length} / ${s.length}`);
  }
  console.log(`report:     ${csvPath}`);

  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply to write.');
    await mongoose.disconnect();
    return;
  }

  let modified = 0;
  for (const { doc, plan } of toWrite) {
    // Guarded on the sections being what this run read, so a concurrent admin
    // save is never overwritten with a stale plan.
    const res = await writers.updateOne(
      { _id: doc._id, sections: doc.sections },
      { $set: { sections: plan.sections } },
    );
    if (res.modifiedCount === 1) modified += 1;
    else console.warn(`! ${doc.slug}: changed since it was read — skipped, re-run to pick it up`);
  }
  console.log(`\nwritten:    ${modified} writer(s)`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
