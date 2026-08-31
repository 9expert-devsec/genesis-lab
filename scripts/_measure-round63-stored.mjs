/**
 * ROUND 63 (part 3) — what course_schedule sections are STORED today.
 * READ-ONLY. Establishes the migration surface for a chosen-rounds mode.
 */
import { MongoClient } from 'mongodb';
const uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB_NAME;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
const client = await new MongoClient(uri).connect();
const db = client.db(dbName);
const names = (await db.listCollections().toArray()).map((c) => c.name);
const target = names.filter((n) => /page.?builder|pagebuilder/i.test(n));
console.log('COLLECTIONS matching pagebuilder:', target.join(', ') || '(none)');

let total = 0, sched = 0, withLimit = 0, limitVals = {}, courseIds = new Set();
const walk = (arr, out) => {
  for (const s of Array.isArray(arr) ? arr : []) {
    if (!s || typeof s !== 'object') continue;
    out.total++;
    if (s.type === 'course_schedule') {
      out.sched++;
      const c = s.content ?? {};
      const L = c.limit;
      limitVals[L === undefined ? 'ABSENT' : String(L)] = (limitVals[L === undefined ? 'ABSENT' : String(L)] ?? 0) + 1;
      if (Number(L) > 0) out.withLimit++;
      if (c.courseId) courseIds.add(String(c.courseId));
      console.log(`   course_schedule id=${s.id} content=${JSON.stringify(c)}`);
    }
    for (const k of Object.keys(s.content ?? {})) {
      if (Array.isArray(s.content[k])) walk(s.content[k], out);
    }
  }
};
const acc = { total: 0, sched: 0, withLimit: 0 };
for (const name of target) {
  const docs = await db.collection(name).find({}).toArray();
  console.log(`\n${name}: ${docs.length} docs`);
  for (const d of docs) {
    walk(d.sections, acc);
    // versions / drafts too
    for (const key of ['draft', 'live', 'versions']) {
      const v = d[key];
      if (Array.isArray(v)) for (const one of v) walk(one?.sections, acc);
      else if (v?.sections) walk(v.sections, acc);
    }
  }
}
console.log(`\nTOTAL sections walked: ${acc.total}`);
console.log(`course_schedule sections stored: ${acc.sched}`);
console.log(`  with limit > 0: ${acc.withLimit}`);
console.log(`  limit value distribution: ${JSON.stringify(limitVals)}`);
console.log(`  distinct courseIds: ${[...courseIds].join(', ') || '(none)'}`);
await client.close();
