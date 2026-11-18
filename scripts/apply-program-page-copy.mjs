/**
 * Seed the approved program-page copy (introHeading … benefitCards) into
 * ProgramPageConfig. DRY-RUN BY DEFAULT.
 *
 * ── THE DATABASE IS SHARED WITH PRODUCTION ─────────────────────────────────
 * Without --apply this reads (find) and writes only tmp/program-copy-plan.csv.
 * With --apply it $sets the eight copy fields and `updatedAt` — nothing else —
 * on every WRITE row, after a verified backup.
 * Undo: scripts/restore-program-page-copy.mjs <backup.json>.
 *
 * Safe before the code that reads these fields is deployed: older code never
 * reads them, and the older admin save $sets only its own whitelisted keys.
 *
 * ── STEPS ──────────────────────────────────────────────────────────────────
 *  1. MATCH each sheet row to exactly one program_page_configs document by
 *     `urlSlug`. Zero or several → SKIPPED. Two sheet rows on one document →
 *     both SKIPPED.
 *  2. SHAPE every row with lib/pageConfigUpdate.shapeProgramCopy — the admin
 *     save's own rules (trim, empty rows dropped, ≤ 8 rows, preset icons,
 *     sanitizeRichHtml on introHtml). A row it refuses is SKIPPED, so the seed
 *     can never store what the form would reject. Any row the shaping CHANGES
 *     is listed (introHtml sanitiser changes called out separately).
 *  3. PLAN: WRITE when any of the eight fields differs from what is stored
 *     (absent counts as different), NOOP when all are identical.
 *  4. --apply only: backup (fsync + read back) → updateOne per document →
 *     re-read every written document and deep-compare with the plan.
 *
 * Run: npm run apply:program-copy -- prompts/program-page-copy-2026-11-17.json [--apply]
 */

import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

register(new URL('../test/loader.mjs', import.meta.url));

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
if (!inputPath) {
  console.error('usage: npm run apply:program-copy -- <sheet.json> [--apply]');
  process.exit(1);
}
const sheet = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(sheet?.programs) || sheet.programs.length !== sheet.count) {
  console.error(`${inputPath}: expected { count, programs: [...] } with programs.length === count`);
  process.exit(1);
}

const mongoose = (await import('mongoose')).default;
const { shapeProgramCopy, PROGRAM_COPY_KEYS } = await import('@/lib/pageConfigUpdate');
const { sanitizeRichHtml } = await import('@/lib/sanitizeRichHtml');

const COLLECTION = 'program_page_configs';
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const pick = (o) => Object.fromEntries(PROGRAM_COPY_KEYS.map((k) => [k, o?.[k]]));

// ── read ────────────────────────────────────────────────────────────────────
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (.env.local)');
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 3,
});
const db = mongoose.connection.db;
const col = db.collection(COLLECTION);

console.log(`=== apply-program-page-copy — ${APPLY ? 'APPLY (writes to the shared DB)' : 'DRY RUN (no writes)'} ===`);
console.log(`sheet: ${inputPath}  (${sheet.programs.length} programs)`);

// ── 1–2. match + shape ──────────────────────────────────────────────────────
const plan = [];
const sanitizerChanged = [];
const shapingChanged = [];
for (const [i, row] of sheet.programs.entries()) {
  const p = { row: i + 1, program: row.program, urlSlug: String(row.urlSlug ?? '').trim(), doc: null, skip: null };
  plan.push(p);

  const sanitized = sanitizeRichHtml(String(row.introHtml ?? ''));
  if (sanitized !== row.introHtml) sanitizerChanged.push({ p, before: row.introHtml, after: sanitized });

  try {
    p.after = shapeProgramCopy(row);
  } catch (err) {
    p.skip = `VALIDATION (${err.message})`;
    continue;
  }
  if (!isDeepStrictEqual(p.after, pick(row))) {
    const keys = PROGRAM_COPY_KEYS.filter((k) => !isDeepStrictEqual(p.after[k], row[k]));
    shapingChanged.push({ p, keys });
  }

  if (!p.urlSlug) { p.skip = 'NO_SLUG'; continue; }
  const docs = await col.find({ urlSlug: p.urlSlug }).toArray();
  if (docs.length !== 1) { p.skip = `MATCH ${docs.length} (urlSlug "${p.urlSlug}")`; continue; }
  p.doc = docs[0];
}

const byDoc = new Map();
for (const p of plan.filter((q) => q.doc && !q.skip)) {
  const k = String(p.doc._id);
  byDoc.set(k, [...(byDoc.get(k) ?? []), p]);
}
for (const group of byDoc.values()) {
  if (group.length < 2) continue;
  for (const p of group) p.skip = `DUPLICATE_TARGET (rows ${group.map((g) => g.row).join(', ')})`;
}

console.log(`\n── introHtml changed by sanitizeRichHtml: ${sanitizerChanged.length} ──`);
for (const { p, before, after } of sanitizerChanged) {
  console.log(`  row ${p.row} ${p.urlSlug}\n      ${JSON.stringify(before)}\n   →  ${JSON.stringify(after)}`);
}
console.log(`── rows changed by the admin-save shaping (trim / empty rows / sanitiser): ${shapingChanged.length} ──`);
for (const { p, keys } of shapingChanged) console.log(`  row ${p.row} ${p.urlSlug}: ${keys.join(', ')}`);

// ── 3. plan ─────────────────────────────────────────────────────────────────
for (const p of plan) {
  if (p.skip) { p.action = 'SKIPPED'; continue; }
  p.before = pick(p.doc);
  p.changed = PROGRAM_COPY_KEYS.filter((k) => !isDeepStrictEqual(p.doc[k], p.after[k]));
  p.action = p.changed.length ? 'WRITE' : 'NOOP';
}

const count = (a) => plan.filter((p) => p.action === a).length;
console.log(`\n── plan counts ──\n  n=${plan.length}  WRITE ${count('WRITE')}  NOOP ${count('NOOP')}  SKIPPED ${count('SKIPPED')}`);
console.log('── SKIPPED ──');
if (!count('SKIPPED')) console.log('  (none)');
for (const p of plan.filter((q) => q.action === 'SKIPPED')) console.log(`  row ${p.row} ${p.urlSlug}  ${p.skip}`);

// ── CSV ─────────────────────────────────────────────────────────────────────
const header = [
  'row', 'program', 'urlSlug', '_id', 'programId', 'action', 'changed_fields',
  'introHeading', 'introHtml_chars', 'whyHeading', 'whyItems', 'benefitHeading', 'benefitCard_icons',
];
const lines = [header.join(',')];
for (const p of plan) {
  const a = p.after ?? {};
  lines.push([
    p.row,
    p.program,
    p.urlSlug,
    p.doc?._id ?? '',
    p.doc?.programId ?? '',
    p.action === 'SKIPPED' ? `SKIPPED: ${p.skip}` : p.action,
    (p.changed ?? []).join(' '),
    a.introHeading ?? '',
    a.introHtml?.length ?? '',
    a.whyHeading ?? '',
    a.whyItems?.length ?? '',
    a.benefitHeading ?? '',
    (a.benefitCards ?? []).map((c) => c.icon).join(' '),
  ].map(csvCell).join(','));
}
const planPath = path.resolve('tmp/program-copy-plan.csv');
fs.mkdirSync(path.dirname(planPath), { recursive: true });
fs.writeFileSync(planPath, `﻿${lines.join('\r\n')}\r\n`, 'utf8');
console.log(`\nplan CSV: ${planPath} (${lines.length - 1} rows)`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing written to the database. Pass --apply to write.');
  await mongoose.disconnect();
  process.exit(0);
}

// ── 4. apply ────────────────────────────────────────────────────────────────
const writes = plan.filter((p) => p.action === 'WRITE');

// 4a. backup — "absent" recorded as absent, fsync'd and read back.
const backup = {
  createdAt: new Date().toISOString(),
  sheet: inputPath,
  collection: COLLECTION,
  fields: [...PROGRAM_COPY_KEYS],
  rows: writes.map((p) => ({
    _id: String(p.doc._id),
    programId: p.doc.programId,
    urlSlug: p.urlSlug,
    // Only the fields the document HAD; a field missing here was absent and
    // restore $unsets it.
    before: Object.fromEntries(PROGRAM_COPY_KEYS.filter((k) => k in p.doc).map((k) => [k, p.doc[k]])),
    absent: PROGRAM_COPY_KEYS.filter((k) => !(k in p.doc)),
    // What this run writes. restore only touches a document still equal to it.
    after: p.after,
  })),
};
const backupPath = path.resolve(`tmp/program-copy-backup-${backup.createdAt.replace(/[:.]/g, '-')}.json`);
const text = JSON.stringify(backup, null, 2);
const fd = fs.openSync(backupPath, 'wx');
fs.writeSync(fd, text, null, 'utf8');
fs.fsyncSync(fd);
fs.closeSync(fd);
const readBack = fs.readFileSync(backupPath, 'utf8');
if (readBack !== text || JSON.parse(readBack).rows.length !== writes.length) {
  console.error(`STOP: backup ${backupPath} did not read back intact. Nothing written.`);
  await mongoose.disconnect();
  process.exit(3);
}
console.log(`\nbackup: ${backupPath} (${writes.length} documents, read back OK)`);

// 4b. writes
let matched = 0;
for (const p of writes) {
  const res = await col.updateOne({ _id: p.doc._id }, { $set: { ...p.after, updatedAt: new Date() } });
  if (res.matchedCount === 1) matched += 1;
  else console.log(`  NOT MATCHED: ${p.urlSlug} _id ${p.doc._id}`);
}
console.log(`written (updateOne matched): ${matched} of ${writes.length}`);

// 4c. verify
let pass = 0;
let fail = 0;
for (const p of writes) {
  const d = await col.findOne({ _id: p.doc._id });
  if (d && isDeepStrictEqual(pick(d), p.after)) pass += 1;
  else {
    fail += 1;
    console.log(`  VERIFY FAIL: ${p.urlSlug} _id ${p.doc._id}`);
  }
}
console.log(`verified: ${pass} of ${writes.length}  (fail ${fail})`);
console.log(`undo:     npm run restore:program-copy -- ${path.relative(process.cwd(), backupPath)} [--apply]`);

await mongoose.disconnect();
process.exit(fail ? 1 : 0);
