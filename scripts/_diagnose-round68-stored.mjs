/** ROUND 68 §E/§H — what the failing page stores at the named path, and whether
 *  ANY stored document carries a non-plain value. READ-ONLY. */
import { MongoClient } from 'mongodb';
import { nonPlainValues, describeNonPlain } from '../test/plainValue.mjs';

const c = await new MongoClient(process.env.MONGODB_URI).connect();
const db = c.db(process.env.MONGODB_DB_NAME);
const pages = await db.collection('page_builder_pages').find({}).toArray();

console.log('=== §E  the failing page at sections[2].content.children[0] ===');
const p = pages.find((x) => x.slug === 'early-bird-claude-code');
const secs = p?.draft?.sections ?? p?.sections ?? [];
const s2 = secs[2];
console.log(`  sections[2] type = ${s2?.type}`);
const child = s2?.content?.children?.[0];
console.log(`  children[0] type = ${child?.type}`);
const doc = child?.content?.doc;
console.log(`  doc.content nodes = ${(doc?.content ?? []).map((n) => n.type).join(', ')}`);
const first = doc?.content?.[0];
console.log(`  doc.content[0] = ${JSON.stringify(first)?.slice(0, 220)}`);
console.log(`  doc.content[0].attrs = ${JSON.stringify(first?.attrs)}  proto=${
  first?.attrs === undefined ? '(absent)' : Object.getPrototypeOf(first.attrs) === null ? 'NULL' : 'Object.prototype'}`);

console.log('\n=== §H  every stored rich_text doc: any non-plain value? ===');
let docs = 0, dirty = 0, withAttrs = 0;
const walk = (arr, where) => {
  for (const s of Array.isArray(arr) ? arr : []) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'rich_text' && s.content?.doc) {
      docs += 1;
      const nodes = s.content.doc.content ?? [];
      const attrsBearing = nodes.filter((n) => n?.attrs !== undefined);
      withAttrs += attrsBearing.length;
      const hits = nonPlainValues(s.content.doc);
      if (hits.length) { dirty += 1; console.log(`  DIRTY ${where} ${s.id}`); console.log(describeNonPlain(hits)); }
    }
    for (const k of Object.keys(s.content ?? {})) if (Array.isArray(s.content[k])) walk(s.content[k], where);
  }
};
for (const d of pages) {
  walk(d.sections, `${d.slug}:live`);
  for (const k of ['draft']) if (d[k]?.sections) walk(d[k].sections, `${d.slug}:${k}`);
}
console.log(`  rich_text docs scanned: ${docs}`);
console.log(`  top-level nodes carrying an \`attrs\` key: ${withAttrs}`);
console.log(`  documents with a non-plain value: ${dirty}`);
await c.close();
