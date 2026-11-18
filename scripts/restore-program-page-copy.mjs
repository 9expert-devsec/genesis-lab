/**
 * Undo scripts/apply-program-page-copy.mjs from its backup file. DRY-RUN BY
 * DEFAULT.
 *
 * ── THE DATABASE IS SHARED WITH PRODUCTION ─────────────────────────────────
 * Without --apply this only reads (findOne) and prints what it would put back.
 * With --apply it puts the backup's `before` values back — $set for fields the
 * document had, $unset for fields that were absent — plus `updatedAt`, then
 * re-reads and verifies.
 *
 * Per document:
 *   RESTORE        all eight fields equal the backup's `after` (what apply
 *                  wrote) → put `before` back
 *   ALREADY        the fields already equal `before` → nothing to do
 *   CHANGED_SINCE  matches neither → edited after the apply; SKIPPED so that
 *                  edit is not clobbered
 *   NOT_FOUND      no document with that _id → SKIPPED
 *
 * Run: npm run restore:program-copy -- tmp/program-copy-backup-<ts>.json [--apply]
 */

import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
if (!file) {
  console.error('usage: npm run restore:program-copy -- <backup.json> [--apply]');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
const FIELDS = backup?.fields;
const rows = backup?.rows;
const ok =
  backup?.collection === 'program_page_configs' &&
  Array.isArray(FIELDS) && FIELDS.length === 8 &&
  Array.isArray(rows) &&
  rows.every((r) => r?._id && r.before && Array.isArray(r.absent) && r.after);
if (!ok) {
  console.error(`${file}: expected a program-copy backup { collection: "program_page_configs", fields[8], rows: [{ _id, before, absent, after }] }`);
  process.exit(1);
}

console.log(`=== restore-program-page-copy — ${APPLY ? 'APPLY (writes to the shared DB)' : 'DRY RUN (no writes)'} ===`);
console.log(`backup: ${file}  (created ${backup.createdAt ?? '?'}, ${rows.length} rows)\n`);

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (.env.local)');
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 3,
});
const col = mongoose.connection.db.collection(backup.collection);

/** The eight fields as stored; an absent field stays absent (undefined). */
const fieldsOf = (d) => Object.fromEntries(FIELDS.filter((k) => k in d).map((k) => [k, d[k]]));
const equalsAfter = (d, r) => FIELDS.every((k) => isDeepStrictEqual(d[k], r.after[k]));
const equalsBefore = (d, r) => isDeepStrictEqual(fieldsOf(d), r.before) && r.absent.every((k) => !(k in d));

const plan = [];
for (const r of rows) {
  const _id = new mongoose.Types.ObjectId(r._id);
  const d = await col.findOne({ _id });
  let status;
  if (!d) status = 'NOT_FOUND';
  else if (equalsBefore(d, r)) status = 'ALREADY';
  else if (equalsAfter(d, r)) status = 'RESTORE';
  else status = 'CHANGED_SINCE';
  plan.push({ r, _id, status });
  console.log(`  ${status.padEnd(13)} ${r._id} ${r.urlSlug ?? ''}  (absent before: ${r.absent.length ? r.absent.join(' ') : 'none'})`);
}

const count = (st) => plan.filter((p) => p.status === st).length;
console.log(`\nRESTORE ${count('RESTORE')}  ALREADY ${count('ALREADY')}  CHANGED_SINCE ${count('CHANGED_SINCE')}  NOT_FOUND ${count('NOT_FOUND')}`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Pass --apply to restore the RESTORE rows.');
  await mongoose.disconnect();
  process.exit(0);
}

const todo = plan.filter((p) => p.status === 'RESTORE');
let pass = 0;
let fail = 0;
for (const p of todo) {
  const update = { $set: { ...p.r.before, updatedAt: new Date() } };
  if (p.r.absent.length) update.$unset = Object.fromEntries(p.r.absent.map((k) => [k, '']));
  await col.updateOne({ _id: p._id }, update);
  const d = await col.findOne({ _id: p._id });
  if (d && equalsBefore(d, p.r)) pass += 1;
  else {
    fail += 1;
    console.log(`  VERIFY FAIL: ${p.r._id}`);
  }
}
console.log(`restored + verified: pass ${pass}  fail ${fail}  (of ${todo.length})`);

await mongoose.disconnect();
process.exit(fail ? 1 : 0);
