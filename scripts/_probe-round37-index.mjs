/**
 * Round 37 A — does a numberless row collide under round 35's partial unique
 * index? Verified against a SCRATCH collection created and dropped here; the
 * real page_versions collection is never written.
 */
import mongoose from 'mongoose';
const SCRATCH = '_round37_index_scratch';
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
console.log('database:', db.databaseName, '| scratch collection:', SCRATCH);
try { await db.collection(SCRATCH).drop(); } catch { /* absent */ }
const c = db.collection(SCRATCH);
// The EXACT index round 35 declared on page_versions.
await c.createIndex({ pageId: 1, versionNumber: 1 },
  { unique: true, partialFilterExpression: { versionNumber: { $type: 'number' } } });
console.log('index:', JSON.stringify((await c.indexes()).map(i => ({ n: i.name, u: !!i.unique, p: i.partialFilterExpression }))));

const results = {};
const tryInsert = async (name, docs) => {
  try { await c.insertMany(docs, { ordered: true }); results[name] = 'ACCEPTED'; }
  catch (e) { results[name] = 'REJECTED: ' + (e.message.split('\n')[0]).slice(0, 90); }
};
await tryInsert('two null-versionNumber rows, same pageId', [
  { pageId: 'p1', versionNumber: null, label: 'draft-backup' },
  { pageId: 'p1', versionNumber: null, label: 'draft-backup' },
]);
await tryInsert('a third with the field ABSENT entirely', [{ pageId: 'p1', label: 'draft-backup' }]);
await tryInsert('a numbered row beside them', [{ pageId: 'p1', versionNumber: 1, label: 'publish' }]);
await tryInsert('a DUPLICATE numbered row (must be refused)', [{ pageId: 'p1', versionNumber: 1, label: 'publish' }]);
await tryInsert('same number on a DIFFERENT page', [{ pageId: 'p2', versionNumber: 1, label: 'publish' }]);
console.log(JSON.stringify(results, null, 2));
console.log('rows left in scratch:', await c.countDocuments({}));
await c.drop();
console.log('scratch dropped:', !(await db.listCollections({ name: SCRATCH }).toArray()).length);
await mongoose.disconnect();
