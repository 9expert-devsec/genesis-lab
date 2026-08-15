/**
 * READ-ONLY probe: exact histogram of RegisterInhouse.status.
 *
 * Runs a $group over the RAW `register_inhouse` collection — no mongoose model
 * is registered, so the enum cannot hide a value that is not in it. Missing and
 * non-string statuses are reported as their own buckets.
 *
 * Usage: node --env-file=.env.local scripts/_probe-inhouse-status-histogram.mjs
 */

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri) throw new Error('MONGODB_URI missing');

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection('register_inhouse');

const total = await col.countDocuments({});
const rows = await col
  .aggregate([
    {
      $group: {
        _id: { v: '$status', t: { $type: '$status' } },
        n: { $sum: 1 },
        oldest: { $min: '$createdAt' },
        newest: { $max: '$createdAt' },
      },
    },
    { $sort: { n: -1 } },
  ])
  .toArray();

const KNOWN = ['new', 'contacted', 'quoted', 'closed-won', 'closed-lost'];

console.log(`collection: ${db.databaseName}.register_inhouse`);
console.log(`TOTAL DOCUMENTS: ${total}\n`);
console.log('status'.padEnd(16), 'bsonType'.padEnd(10), 'count'.padStart(6), '  oldest      newest');
console.log('-'.repeat(70));
let sum = 0;
for (const r of rows) {
  sum += r.n;
  const v = r._id.v === undefined ? '(missing)' : JSON.stringify(r._id.v);
  const flag = KNOWN.includes(r._id.v) ? '' : '   <-- NOT IN CURRENT ENUM';
  const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '   -    ');
  console.log(
    String(v).padEnd(16),
    String(r._id.t).padEnd(10),
    String(r.n).padStart(6),
    ` ${d(r.oldest)}  ${d(r.newest)}${flag}`
  );
}
console.log('-'.repeat(70));
console.log('sum of buckets:', sum, sum === total ? '(matches total)' : '(MISMATCH vs total)');

console.log('\nzero-count check for every enum value:');
for (const k of KNOWN) {
  const hit = rows.find((r) => r._id.v === k);
  console.log(`  ${k.padEnd(12)} ${String(hit ? hit.n : 0).padStart(6)}`);
}

await client.close();
