/** ROUND 58 — READ-ONLY. Dump every stored price_card section (live, draft,
 * versions) with its page slug, so §B/§E can name which FIELD carries which
 * original element. No writes.
 * Usage: node --env-file=.env.local scripts/_probe-round58-repro.mjs
 */
import mongoose from 'mongoose';
function die(m) { console.error('✖ ' + m); process.exit(1); }
const SLOTS = ['children', 'left', 'right'];
function walk(sections, where, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'price_card') out.push({ where, depth, style: s.style ?? null, content: s.content });
    for (const slot of SLOTS) walk(s?.content?.[slot], where, out, depth + 1);
  }
}
async function req(db, n) {
  const f = await db.listCollections({ name: n }).toArray();
  if (!f.length) die(`collection "${n}" does not exist`);
  return db.collection(n);
}
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const out = [];
  for (const d of await (await req(db, 'page_builder_pages')).find({}).toArray()) {
    walk(d.sections, `live:${d.slug}`, out);
    walk(d?.draft?.sections, `draft:${d.slug}`, out);
  }
  for (const v of await (await req(db, 'page_versions')).find({}).toArray()) {
    walk(v?.snapshot?.sections, `v${v.versionNumber}:${v.pageId}`, out);
  }
  console.log(`price_card sections: ${out.length}`);
  for (const c of out) console.log('\n--- ' + c.where + ' depth=' + c.depth +
    '\n  style: ' + JSON.stringify(c.style) +
    '\n  content: ' + JSON.stringify(c.content, null, 2).replace(/\n/g, '\n  '));
  await mongoose.disconnect();
}
main().catch((e) => die(e?.stack || String(e)));
