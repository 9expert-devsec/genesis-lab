/**
 * ORIGIN-1 PHASE B - READ-ONLY. Every collection, every document, every field
 * path that carries the preview hostname.
 *
 * No writes. There is no updateOne, no bulkWrite, no $set in this file.
 *
 * WHY A FULL SCAN AND NOT A QUERY. A $regex on a named field only finds the
 * shapes we already guessed, and section 3 of the round says explicitly not to
 * assume the two known shapes are the only ones. So every document is walked
 * and every string value tested, which is what makes a per-collection ZERO mean
 * "not present" rather than "not looked for".
 *
 * THE CONTROL: the same walker also counts the PRODUCTION host. A walk that
 * resolved nothing reports zero of both; a walk that works reports a spread.
 * If production URLs come back zero everywhere too, the walk is broken and the
 * preview zeros prove nothing.
 *
 * Usage: node --env-file=.env.local scripts/_audit-origin1-sweep.mjs
 */
import mongoose from 'mongoose';

const PREVIEW = 'genesis-lab.9expert.app';
const PROD    = 'www.9experttraining.com';

const URI = process.env.MONGODB_URI;
await mongoose.connect(URI, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const db = mongoose.connection.db;

/** Walk a document, yielding [path, string] for every string value. */
function* walk(value, path = '') {
  if (typeof value === 'string') { yield [path, value]; return; }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* walk(value[i], `${path}[]`);
    return;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value._bsontype) return;
    for (const [k, v] of Object.entries(value)) yield* walk(v, path ? `${path}.${k}` : k);
  }
}

const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
const report = [];
let prodTotal = 0;

for (const name of cols) {
  const cur = db.collection(name).find({}, { batchSize: 200 });
  let docs = 0, prod = 0;
  const paths = new Map();          // path -> doc count
  const ids   = [];                 // ids of preview-carrying docs
  for await (const doc of cur) {
    let hit = false;
    const seen = new Set();
    for (const [p, s] of walk(doc)) {
      if (s.includes(PREVIEW)) { hit = true; seen.add(p); }
      if (s.includes(PROD))    prod++;
    }
    if (hit) {
      docs++;
      ids.push(String(doc._id));
      for (const p of seen) paths.set(p, (paths.get(p) ?? 0) + 1);
    }
  }
  prodTotal += prod;
  if (docs || prod) report.push({ name, docs, prod, paths, ids });
}

console.log('=== COLLECTIONS CARRYING THE PREVIEW HOST ===');
for (const r of report.filter((r) => r.docs)) {
  console.log(`\n${r.name}  -  ${r.docs} document(s)`);
  for (const [p, n] of [...r.paths].sort((a, b) => b[1] - a[1])) console.log(`    ${p}  x${n}`);
  console.log(`    ids: ${r.ids.slice(0, 40).join(', ')}${r.ids.length > 40 ? ` ... (+${r.ids.length - 40})` : ''}`);
}

console.log('\n=== CONTROL: collections carrying the PRODUCTION host ===');
console.log(`(if this is empty the walker is broken and every zero above is meaningless)`);
for (const r of report.filter((r) => r.prod)) console.log(`  ${r.name}  ${r.prod} string(s)`);
console.log(`  TOTAL production-host strings seen: ${prodTotal}`);

const clean = cols.filter((c) => !report.some((r) => r.docs && r.name === c));
console.log(`\n=== NO PREVIEW HOST (${clean.length}/${cols.length} collections) ===`);
console.log('  ' + clean.join(', '));
await mongoose.disconnect();
