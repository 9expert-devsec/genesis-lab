/**
 * ORIGIN-1 PHASE A — READ-ONLY. What database is this, and what is in it?
 *
 * No writes. There is no updateOne, no bulkWrite, no $set in this file.
 * It prints the resolved cluster host and db name (NEVER the credentials),
 * then every collection with its document count.
 *
 * Usage: node --env-file=.env.local scripts/_audit-origin1-inventory.mjs
 */
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI;
const DB  = process.env.MONGODB_DB_NAME;
if (!URI) { console.error('MONGODB_URI missing'); process.exit(1); }

// Host only. Credentials are stripped before anything is printed.
const safeHost = URI.replace(/^(mongodb(?:\+srv)?:\/\/)[^@]*@/, '$1<redacted>@')
                    .replace(/\?.*$/, '');
console.log('cluster :', safeHost);
console.log('dbName  :', DB ?? '(from URI path)');

await mongoose.connect(URI, { dbName: DB, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const db = mongoose.connection.db;
console.log('resolved:', db.databaseName);
console.log('');

const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
console.log('collections:', cols.length);
const rows = [];
for (const name of cols) {
  const n = await db.collection(name).estimatedDocumentCount();
  rows.push([name, n]);
}
const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, n] of rows) console.log('  ' + name.padEnd(w) + '  ' + String(n).padStart(7));
await mongoose.disconnect();
