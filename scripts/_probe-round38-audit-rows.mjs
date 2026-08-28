/**
 * Round 38 D/N — READ-ONLY census of page_audit_logs. Nothing is written.
 */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
console.log('database:', db.databaseName);
const c = db.collection('page_audit_logs');
console.log('total rows:', await c.countDocuments({}));
const perPage = await c.aggregate([
  { $group: { _id: { pageId: '$pageId', pageType: '$pageType' }, n: { $sum: 1 },
              oldest: { $min: '$createdAt' }, newest: { $max: '$createdAt' } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('pages with rows:', perPage.length);
for (const p of perPage) {
  console.log(`  ${p._id.pageType} ${p._id.pageId}: ${p.n} rows  ${p.oldest?.toISOString?.() ?? '-'} .. ${p.newest?.toISOString?.() ?? '-'}`);
}
const byAction = await c.aggregate([{ $group: { _id: '$action', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
console.log('stored action values:', JSON.stringify(byAction));
console.log('distinct actor names:', JSON.stringify(await c.distinct('actor.name')));
const sample = await c.find({}).sort({ createdAt: -1 }).limit(4).toArray();
console.log('newest 4 rows:', JSON.stringify(sample, null, 1));
// size per row, for the projection argument
const stats = await db.command({ collStats: 'page_audit_logs' }).catch((e) => ({ err: e.message }));
console.log('avgObjSize:', stats.avgObjSize, 'storageSize:', stats.storageSize, 'count:', stats.count);
console.log('indexes:', JSON.stringify((await c.indexes()).map((i) => i.name)));
// versions, for the D comparison
console.log('page_versions total:', await db.collection('page_versions').countDocuments({}));
await mongoose.disconnect();
