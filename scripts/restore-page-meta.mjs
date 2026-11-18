/**
 * Undo scripts/apply-page-meta.mjs from its backup file. DRY-RUN BY DEFAULT.
 *
 * ── THE DATABASE IS SHARED WITH PRODUCTION ─────────────────────────────────
 * Without --apply this only reads (findOne) and prints what it would put
 * back. With --apply it sets `metaTitle`, `metaDescription` and `updatedAt`
 * back to the backup's `before` values, then re-reads and verifies.
 *
 * Per document:
 *   RESTORE        current values equal the backup's `after` (what apply
 *                  wrote) → put `before` back
 *   ALREADY        current values already equal `before` → nothing to do
 *   CHANGED_SINCE  current values match neither → someone edited it after the
 *                  apply; SKIPPED so that edit is not clobbered
 *   NOT_FOUND      no document with that _id → SKIPPED
 *
 * Run: npm run restore:page-meta -- tmp/page-meta-backup-<ts>.json [--apply]
 */

import fs from 'node:fs';
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
if (!file) {
  console.error('usage: npm run restore:page-meta -- <backup.json> [--apply]');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = backup?.rows;
const ALLOWED = new Set(['course_extensions', 'program_page_configs', 'skill_page_configs']);
const bad = Array.isArray(rows)
  ? rows.filter((r) => !r?._id || !ALLOWED.has(r.collection) || !r.before || !r.after)
  : null;
if (!Array.isArray(rows) || bad.length) {
  console.error(`${file}: expected { rows: [{ _id, collection, before:{metaTitle,metaDescription}, after:{…} }] } `
    + `with collection one of ${[...ALLOWED].join(', ')}`);
  process.exit(1);
}

console.log(`=== restore-page-meta — ${APPLY ? 'APPLY (writes to the shared DB)' : 'DRY RUN (no writes)'} ===`);
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
const db = mongoose.connection.db;

const same = (d, v) => (d.metaTitle ?? '') === v.metaTitle && (d.metaDescription ?? '') === v.metaDescription;
const short = (v) => JSON.stringify(String(v ?? '').length > 70 ? `${String(v).slice(0, 70)}…` : String(v ?? ''));

const plan = [];
for (const r of rows) {
  const _id = new mongoose.Types.ObjectId(r._id);
  const d = await db.collection(r.collection).findOne({ _id });
  let status;
  if (!d) status = 'NOT_FOUND';
  else if (same(d, r.before)) status = 'ALREADY';
  else if (same(d, r.after)) status = 'RESTORE';
  else status = 'CHANGED_SINCE';
  plan.push({ r, _id, d, status });

  console.log(`  ${status.padEnd(13)} ${r.collection} ${r._id} ${r.key ?? ''}`);
  if (d) {
    console.log(`      metaTitle        now ${short(d.metaTitle)}  →  ${short(r.before.metaTitle)}`);
    console.log(`      metaDescription  now ${short(d.metaDescription)}  →  ${short(r.before.metaDescription)}`);
  }
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
  await db.collection(p.r.collection).updateOne(
    { _id: p._id },
    { $set: { metaTitle: p.r.before.metaTitle, metaDescription: p.r.before.metaDescription, updatedAt: new Date() } },
  );
  const d = await db.collection(p.r.collection).findOne({ _id: p._id });
  if (d && same(d, p.r.before)) pass += 1;
  else {
    fail += 1;
    console.log(`  VERIFY FAIL: ${p.r.collection} ${p.r._id}`);
  }
}
console.log(`restored + verified: pass ${pass}  fail ${fail}  (of ${todo.length})`);

await mongoose.disconnect();
process.exit(fail ? 1 : 0);
