/**
 * ORIGIN-1 - DRY RUN. READ-ONLY. Exactly what the write pass WOULD change.
 *
 * No writes. There is no updateOne, no bulkWrite, no $set, and no msdbUpdate in
 * this file. It re-counts every target immediately before the write, because a
 * count taken at report time and a count taken at write time are not the same
 * number - D3 (banners) is admin-editable and can move underneath us.
 *
 * Every replacement is the EXACT stored string with one host swapped for
 * another. Nothing matches on a pattern, so a re-run finds zero and does
 * nothing: the operation is idempotent by construction rather than by a flag.
 *
 * Usage: node --env-file=.env.local scripts/_audit-origin1-dryrun.mjs
 */
import mongoose from 'mongoose';

const PREVIEW = 'https://genesis-lab.9expert.app';
const LOCAL   = 'http://localhost:3000';
const PROD    = 'https://www.9experttraining.com';
const BASE = process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai';
const KEY  = process.env.AI_API_KEY;

async function get(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-api-key': KEY, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} on ${path}`);
  return res.json();
}
const items = (j) => j.items ?? j.data?.items ?? j.data ?? [];
const today = new Date().toISOString().slice(0, 10);
const lastDay = (r) => (r.dates ?? []).map((d) => String(d).slice(0, 10)).sort().at(-1) ?? '';

console.log('=== D1/D2  MSDB schedules (upstream) ===');
const rounds = items(await get('/schedules', { from: '2000-01-01', limit: 5000 }));
const prev = rounds.filter((r) => String(r.signup_url ?? '').startsWith(PREVIEW));
const d1 = prev.filter((r) => !lastDay(r) || lastDay(r) >= today);
const d1skip = prev.filter((r) => lastDay(r) && lastDay(r) < today);
const d2 = rounds.filter((r) => String(r.signup_url ?? '').startsWith(LOCAL));
const google = rounds.filter((r) => String(r.signup_url ?? '').includes('google.com'));

console.log(`D1 WOULD UPDATE ${d1.length} current/upcoming rounds:`);
for (const r of d1) console.log(`   ${r._id ?? r.id}  last=${lastDay(r) || '(no dates)'}  ${r.signup_url}\n      -> ${r.signup_url.replace(PREVIEW, PROD)}`);
console.log(`\nD1 WOULD SKIP ${d1skip.length} finished rounds (approved skip):`);
for (const r of d1skip) console.log(`   ${r._id ?? r.id}  last=${lastDay(r)}  ${r.signup_url}`);
console.log(`\nD2 WOULD UPDATE ${d2.length} localhost rounds:`);
for (const r of d2) console.log(`   ${r._id ?? r.id}  course=${r.course_id ?? '?'}  last=${lastDay(r) || '(no dates)'}\n      ${r.signup_url}\n      -> ${r.signup_url.replace(LOCAL, PROD)}`);
console.log(`\nLEFT ALONE - google.com placeholders (${google.length}), reported not guessed:`);
for (const r of google) console.log(`   ${r._id ?? r.id}  course=${r.course_id ?? '?'}  last=${lastDay(r) || '(no dates)'}  ${r.signup_url}`);

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const db = mongoose.connection.db;

/** Count docs whose EXACT stored string at `field` contains the preview host. */
async function plan(label, coll, field) {
  const docs = await db.collection(coll).find({ [field]: { $regex: 'genesis-lab\.9expert\.app' } }).toArray();
  console.log(`\n=== ${label}  ${coll}.${field} ===`);
  console.log(`WOULD UPDATE ${docs.length} document(s)`);
  for (const d of docs) {
    const before = String(d[field]);
    const after = before.split(PREVIEW).join(PROD);
    const n = before.split(PREVIEW).length - 1;
    if (before.length < 160) console.log(`   ${d._id}  ${before}\n      -> ${after}`);
    else console.log(`   ${d._id}  ${n} occurrence(s) inside ${before.length} chars of stored HTML`);
  }
  return docs.length;
}

const d3 = await plan('D3', 'banners', 'link_url');
const d4 = await plan('D4', 'site_notifications', 'click_href');
const d5 = await plan('D5', 'articles', 'content');
const d6 = await plan('D6', 'local_faqs', 'answer_html');

console.log('\n=== D7  page_builder_pages (nested buttonHref) ===');
const pbs = (await db.collection('page_builder_pages').find({}).toArray())
  .filter((p) => JSON.stringify(p).includes('genesis-lab.9expert.app'));
console.log(`WOULD UPDATE ${pbs.length} document(s)`);
for (const p of pbs) {
  const n = JSON.stringify(p).split('genesis-lab.9expert.app').length - 1;
  console.log(`   ${p._id}  slug=${p.slug}  status=${p.status}  ${n} occurrence(s)`);
}

console.log('\n=== NOT WRITTEN, BY DECISION ===');
for (const [coll, why] of [
  ['promotion_banners', 'both rows is_active:false - dead, nothing a visitor sees'],
  ['page_versions', 'version history - rewriting a snapshot falsifies what the page was'],
  ['admin_audit_logs', 'audit log - history records what happened'],
  ['webhook_logs', 'webhook log - same'],
  ['not_found_hits', 'telemetry of what was actually requested'],
]) {
  const n = (await db.collection(coll).find({}).toArray()).filter((d) => JSON.stringify(d).includes('genesis-lab.9expert.app')).length;
  console.log(`   ${coll.padEnd(20)} ${String(n).padStart(4)} doc(s) left alone - ${why}`);
}

console.log('\n=== D8  landing_cache ===');
console.log('   no direct write; re-run the landing sync after D1/D3 so it regenerates');
console.log(`\nTOTAL Mongo docs this pass would touch: ${d3 + d4 + d5 + d6 + pbs.length}`);
console.log(`TOTAL MSDB rounds this pass would touch: ${d1.length + d2.length}`);
await mongoose.disconnect();
