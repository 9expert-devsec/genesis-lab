/**
 * ROUND 81 §K — every stored `course_schedule` section, in all three places a
 * page's sections are kept. READ-ONLY: find() only, no writes.
 *
 * Round 64 counted three and reported all three resolving to `open` rounds, and
 * used that to argue its byte-identity proof could not see this round's defect.
 * This re-counts so the claim "no stored page changes today" is measured.
 *
 * ── THE NAMES THAT HAVE BEEN GOT WRONG BEFORE, AND ONE MORE ────────────────
 * The collection is `page_builder_pages`, NOT `pagebuilders`. A version's
 * sections are at `snapshot.sections`, NOT `content.sections` — and `snapshot`
 * lives in `page_versions` (PageVersion.snapshot is a whole page document), not
 * on the page itself. On the page document the PUBLISHED sections are the
 * top-level `sections` array and the in-progress ones are `draft.sections`.
 *
 * Every wrong name here returns an empty result rather than an error, so a run
 * against any of them reports "zero stored sections" and reads as good news.
 * The walk therefore asserts it found sections at all before reporting a count.
 *
 * Run:  node --env-file=.env.local scripts/_measure-round81-stored.mjs
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

const client = await new MongoClient(uri).connect();
const db = client.db(process.env.MONGODB_DB_NAME);
console.log(`DATABASE: ${db.databaseName}`);

/** Every section node, however deeply nested inside container children. */
function walk(arr, out = []) {
  for (const s of Array.isArray(arr) ? arr : []) {
    if (!s || typeof s !== 'object') continue;
    out.push(s);
    for (const k of Object.keys(s.content ?? {})) {
      if (Array.isArray(s.content[k])) walk(s.content[k], out);
    }
  }
  return out;
}

const found = [];
let walked = 0;
const record = (where, label, sections) => {
  const nodes = walk(sections);
  walked += nodes.length;
  for (const s of nodes) {
    if (s.type === 'course_schedule') found.push({ where, label, id: s.id, content: s.content ?? {} });
  }
};

for (const d of await db.collection('page_builder_pages').find({}).toArray()) {
  record('published', d.slug, d.sections);          // top-level = what /[...slug] renders
  record('draft', d.slug, d?.draft?.sections);
}
for (const v of await db.collection('page_versions').find({}).toArray()) {
  record('version', `${v.pageSlug ?? v.page ?? v._id}@v${v.version ?? '?'}`, v?.snapshot?.sections);
}

console.log(`sections walked: ${walked}`);
if (walked === 0) {
  console.error('X walked zero sections — a PATH is wrong, not the data');
  process.exit(1);
}

console.log(`\ncourse_schedule sections stored: ${found.length}`);
for (const s of found) {
  console.log(`  ${s.where.padEnd(10)} ${String(s.label).padEnd(34)} course=${s.content.courseId} `
    + `source=${s.content.source ?? 'ABSENT'} limit=${s.content.limit ?? 'ABSENT'} `
    + `roundIds=${JSON.stringify(s.content.roundIds ?? null)}`);
}
const by = (k) => found.reduce((a, s) => ((a[k(s)] = (a[k(s)] ?? 0) + 1), a), {});
console.log(`\n  by location: ${JSON.stringify(by((s) => s.where))}`);
console.log(`  by mode:     ${JSON.stringify(by((s) => s.content.source ?? 'ABSENT (upcoming)'))}`);
console.log(`  courseIds:   ${[...new Set(found.map((s) => String(s.content.courseId ?? '')))].join(', ')}`);

await client.close();
