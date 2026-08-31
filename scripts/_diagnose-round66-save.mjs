/**
 * ROUND 66 §D/§E — did the draft save LAND, and is anything the resolver
 * returns non-plain?
 *
 * READ-ONLY. Writes nothing, has no --apply.
 * Run: node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs scripts/_diagnose-round66-save.mjs
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const client = await new MongoClient(uri).connect();
const db = client.db(process.env.MONGODB_DB_NAME);

console.log('=== §D  page_builder_pages: draft.savedAt per page ===');
const pages = await db.collection('page_builder_pages').find({}).toArray();
for (const p of pages) {
  const types = [];
  const walk = (a) => { for (const s of Array.isArray(a) ? a : []) {
    if (!s || typeof s !== 'object') continue;
    types.push(s.type);
    for (const k of Object.keys(s.content ?? {})) if (Array.isArray(s.content[k])) walk(s.content[k]);
  } };
  walk(p.draft?.sections ?? p.sections);
  const has = types.includes('course_schedule');
  console.log(`  ${String(p._id)}  slug=${String(p.slug).padEnd(26)}`);
  console.log(`     draft.savedAt : ${p.draft?.savedAt ? new Date(p.draft.savedAt).toISOString() : '(no draft)'}`);
  console.log(`     updatedAt     : ${p.updatedAt ? new Date(p.updatedAt).toISOString() : '-'}`);
  console.log(`     course_schedule present: ${has ? 'YES' : 'no'}   sections: ${types.length}  [${[...new Set(types)].join(', ')}]`);
}

console.log('\n=== §D  audit rows for draft.save / page.publish, newest first ===');
const auditNames = (await db.listCollections().toArray()).map((c) => c.name)
  .filter((n) => /audit/i.test(n));
console.log('  audit collections:', auditNames.join(', ') || '(none)');
for (const name of auditNames) {
  const rows = await db.collection(name)
    .find({ action: { $in: ['draft.save', 'page.publish', 'draft.discard'] } })
    .sort({ createdAt: -1 }).limit(12).toArray();
  for (const r of rows) {
    console.log(`  ${new Date(r.createdAt ?? r.at ?? 0).toISOString()}  ${String(r.action).padEnd(14)} page=${r.pageId}  actor=${r.actor?.name ?? r.actor ?? '-'}`);
  }
}
await client.close();
