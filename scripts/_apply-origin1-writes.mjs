/**
 * ORIGIN-1 - THE WRITE PASS. Swaps the preview origin for production.
 *
 * Runs a DRY RUN unless --apply is passed. The dry count is re-taken inside
 * this process immediately before each write, not read from an earlier report:
 * banners are admin-editable and can move between the report and the write.
 *
 * -- WHAT MAKES EVERY WRITE SAFE TO RE-RUN -----------------------------------
 * Nothing matches on a pattern. Each Mongo update filters on the EXACT string
 * currently stored, so a document edited by an admin since the read no longer
 * matches and is skipped rather than overwritten with a stale value. A second
 * run finds zero and does nothing: idempotent by construction, not by a flag.
 *
 * -- WHY THE MSDB WRITE SENDS FIVE FIELDS ------------------------------------
 * msdbUpdate is a PUT, and lib/actions/schedules.js's shapeMsdbPayload sends
 * { course, dates, status, type, signup_url }. A PUT carrying only signup_url
 * risks blanking the rest, so each round is re-read and PUT back with exactly
 * those five, only signup_url changed - byte-identical in shape to a normal
 * admin save. `course` is sent as its ObjectId because the READ populates it
 * as an object and the WRITE wants the id.
 *
 * The first round is written ALONE and re-read, and every field except
 * signup_url and updatedAt must be unchanged or the run aborts before touching
 * the other 33. A clobber is discovered on one row, not on all of them.
 *
 * NOT WRITTEN, BY DECISION: admin_audit_logs, webhook_logs, page_versions,
 * not_found_hits, promotion_banners. History records what happened.
 *
 * Usage: node --env-file=.env.local scripts/_apply-origin1-writes.mjs [--apply]
 */
import mongoose from 'mongoose';

const APPLY   = process.argv.includes('--apply');
const PREVIEW = 'https://genesis-lab.9expert.app';
const LOCAL   = 'http://localhost:3000';
const PROD    = 'https://www.9experttraining.com';
const BASE    = process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai';
const KEY     = process.env.AI_API_KEY;
const tag = APPLY ? 'APPLY' : 'DRY  ';
const log = (...a) => console.log(`[${tag}]`, ...a);
let written = 0;
let skipped = 0;

async function msdb(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'x-api-key': KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!res.ok || parsed?.ok === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${parsed?.error ?? text.slice(0, 200)}`);
  }
  return parsed;
}

const today = new Date().toISOString().slice(0, 10);
const lastDay = (r) => (r.dates ?? []).map((d) => String(d).slice(0, 10)).sort().at(-1) ?? '';

/** The exact five fields shapeMsdbPayload sends, only signup_url changed. */
const payload = (r, url) => ({
  course: r.course?._id ?? r.course,
  dates: r.dates,
  status: r.status,
  type: r.type,
  signup_url: url,
});

console.log('='.repeat(72));
console.log(APPLY ? 'APPLYING WRITES' : 'DRY RUN - nothing will be written (pass --apply)');
console.log('='.repeat(72));

const readAll = async () => (await msdb('GET', '/schedules?from=2000-01-01&limit=5000')).items ?? [];

const all = await readAll();
const previewAll = all.filter((r) => String(r.signup_url ?? '').startsWith(PREVIEW));
const d1 = previewAll.filter((r) => !lastDay(r) || lastDay(r) >= today);
const d1skip = previewAll.filter((r) => lastDay(r) && lastDay(r) < today);
const d2 = all.filter((r) => String(r.signup_url ?? '').startsWith(LOCAL));

log(`D1 current/upcoming preview rounds : ${d1.length}`);
log(`D1 finished rounds SKIPPED         : ${d1skip.length}`);
log(`D2 localhost rounds                : ${d2.length}  (both written - localhost is broken, not merely off-origin)`);

for (const r of d2) {
  log(`   D2 ${r._id}  course=${r.course?.course_id ?? '?'}  created=${r.createdAt}  updated=${r.updatedAt}`);
}

/**
 * ORPHANED ROUNDS ARE NOT WRITTEN, AND THIS IS A CLOBBER GUARD.
 *
 * 13 of the 34 rounds come back with `course: null`. That is a POPULATE
 * failure, not necessarily an empty field: the read resolves the reference and
 * hands back null when the referenced course document is gone, while the stored
 * field may still hold the ObjectId. PUTting `course: null` back would then
 * erase a reference that is currently recoverable - turning a broken round into
 * an unrecoverable one, to fix a hostname.
 *
 * Nothing is lost by skipping them. All four course codes behind these rounds
 * (EXCEL-HR-02, ZZTEST-CANVA-01/02, ZZTEST-AUTO-03) are absent from
 * /public-course, so every one of these signup_urls resolves to a course that
 * does not exist. The link is dead on either origin; the host is not what is
 * wrong with it.
 *
 * The app cannot repair them either: updateSchedule refuses to write without a
 * resolvable course. Fixing them means restoring or re-pointing the course
 * upstream, which is a data question for a human, not a find-and-replace.
 */
const orphans = [...d1, ...d2].filter((r) => !r.course);
const withCourse = (rows) => rows.filter((r) => r.course);

const targets = [
  ...withCourse(d2).map((r) => ({ r, next: String(r.signup_url).replace(LOCAL, PROD), why: 'D2 localhost' })),
  ...withCourse(d1).map((r) => ({ r, next: String(r.signup_url).replace(PREVIEW, PROD), why: 'D1 preview' })),
];

log(`\nORPHANED - NOT WRITTEN (course reference does not resolve): ${orphans.length}`);
for (const r of orphans) log(`   ${r._id}  last=${lastDay(r) || '(none)'}  ${r.signup_url}`);
log(`\nwrite set after the orphan guard: ${targets.length}`);

if (APPLY && targets.length) {
  // THE CANARY. One round, then a full re-read and field-by-field comparison.
  const first = targets[0];
  log(`\ncanary: ${first.r._id} (${first.why})`);
  const before = JSON.parse(JSON.stringify(first.r));
  await msdb('PUT', `/schedules/${first.r._id}`, payload(first.r, first.next));
  const after = (await readAll()).find((x) => String(x._id) === String(first.r._id));
  if (!after) throw new Error('CANARY LOST: the round vanished from the read after the write. STOPPING.');
  const drift = [];
  for (const k of ['status', 'type', '__v', 'createdAt']) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      drift.push(`${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`);
    }
  }
  if (JSON.stringify(before.dates) !== JSON.stringify(after.dates)) drift.push('dates CHANGED');
  const bC = before.course?._id ?? before.course;
  const aC = after.course?._id ?? after.course;
  if (String(bC) !== String(aC)) drift.push(`course: ${bC} -> ${aC}`);
  if (after.signup_url !== first.next) drift.push(`signup_url NOT APPLIED: ${after.signup_url}`);
  if (drift.length) {
    console.error('\n*** CANARY FAILED - a field other than signup_url moved. NOT writing the rest. ***');
    for (const d of drift) console.error('   ' + d);
    process.exit(1);
  }
  log('canary OK - only signup_url moved; course, dates, status, type, createdAt, __v all intact');
  written++;
}

for (const t of (APPLY ? targets.slice(1) : targets)) {
  if (!APPLY) {
    log(`would PUT ${t.r._id}  ${t.why}\n            ${t.r.signup_url}\n         -> ${t.next}`);
    continue;
  }
  await msdb('PUT', `/schedules/${t.r._id}`, payload(t.r, t.next));
  written++;
  log(`PUT ${t.r._id}  ${t.why}  -> ${t.next}`);
}

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 3,
});
const db = mongoose.connection.db;

async function flat(label, coll, field) {
  const docs = await db.collection(coll).find({ [field]: { $regex: 'genesis-lab\\.9expert\\.app' } }).toArray();
  log(`\n${label}  ${coll}.${field}  -> ${docs.length} document(s)`);
  for (const d of docs) {
    const before = String(d[field]);
    const after = before.split(PREVIEW).join(PROD);
    if (!APPLY) { log(`   would set ${d._id}`); continue; }
    // Exact-value filter: an admin edit since the read means no match, no write.
    const res = await db.collection(coll).updateOne(
      { _id: d._id, [field]: before },
      { $set: { [field]: after } }
    );
    if (res.modifiedCount === 1) { written++; log(`   set ${d._id}`); }
    else { skipped++; console.warn(`   SKIPPED ${d._id} - the stored value changed since the read`); }
  }
}

await flat('D3', 'banners', 'link_url');
await flat('D4', 'site_notifications', 'click_href');
await flat('D5', 'articles', 'content');
await flat('D6', 'local_faqs', 'answer_html');

// D7: nested. Replace the exact host inside `sections`, guarded on the whole
// subtree being unchanged since the read.
const pbs = (await db.collection('page_builder_pages').find({}).toArray())
  .filter((p) => JSON.stringify(p.sections ?? []).includes('genesis-lab.9expert.app'));
log(`\nD7  page_builder_pages.sections  -> ${pbs.length} document(s)`);
for (const p of pbs) {
  const beforeJson = JSON.stringify(p.sections);
  const afterSections = JSON.parse(beforeJson.split(PREVIEW).join(PROD));
  if (!APPLY) { log(`   would set ${p._id} (slug=${p.slug}, status=${p.status})`); continue; }
  const res = await db.collection('page_builder_pages').updateOne(
    { _id: p._id, sections: p.sections },
    { $set: { sections: afterSections } }
  );
  if (res.modifiedCount === 1) { written++; log(`   set ${p._id} (slug=${p.slug})`); }
  else { skipped++; console.warn(`   SKIPPED ${p._id} - sections changed since the read`); }
}

console.log('\n' + '='.repeat(72));
log(`writes: ${written}   skipped (changed underneath us): ${skipped}`);
if (!APPLY) log('nothing was written. re-run with --apply');
await mongoose.disconnect();
