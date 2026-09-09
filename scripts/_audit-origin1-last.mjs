/** ORIGIN-1 - READ-ONLY. Preview-host 404 traffic window. */
import mongoose from 'mongoose';
const PREVIEW = 'genesis-lab.9expert.app';
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const hits = await mongoose.connection.db.collection('not_found_hits').find({ host: { $regex: PREVIEW } }).toArray();
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '?');
const seen = hits.map((h) => h.lastSeen).filter(Boolean).sort();
console.log(`preview-host 404s: ${hits.length} distinct paths, ${hits.reduce((a, h) => a + (h.count ?? 1), 0)} hits total`);
console.log(`first seen: ${iso(hits.map((h) => h.firstSeen).filter(Boolean).sort()[0])}   last seen: ${iso(seen.at(-1))}`);
console.log('\ntop paths by hit count:');
for (const h of hits.sort((a, b) => (b.count ?? 1) - (a.count ?? 1)).slice(0, 8)) {
  console.log(`  ${String(h.count ?? 1).padStart(4)}  ${h.path}   (last ${iso(h.lastSeen)})`);
}
await mongoose.disconnect();
