/**
 * Can every CourseExtension row be anchored to exactly one upstream course?
 * READ-ONLY.
 *
 * ── WHY THIS HAS TO BE MEASURED BEFORE ANYTHING IS WRITTEN ──────────────────
 * The rename screen cannot tell a course that was RENAMED at MSDB from a course
 * that was DELETED upstream while an unrelated new one was created — both leave
 * genesis holding a code upstream no longer has. The signal that would separate
 * them is the upstream `_id`, which survives a rename; genesis does not store
 * it. Establishing the mapping is only certain while every genesis code still
 * matches an upstream code, and that window closes at the next rename.
 *
 * So this script answers the one question a backfill depends on: IS THE MAPPING
 * UNAMBIGUOUS TODAY? A backfill that guesses is worse than no backfill — a
 * wrong anchor is indistinguishable from a right one afterwards, and it would
 * be trusted by exactly the guard that exists to prevent a merge.
 *
 * ── WRITES ──────────────────────────────────────────────────────────────────
 * None. Not behind a flag, not at all: no --apply, no $set, no updateOne, no
 * bulkWrite, no msdbCreate/Update/Delete anywhere in this file. It runs one
 * upstream GET and one `find()` and prints.
 *
 * ── CASE ────────────────────────────────────────────────────────────────────
 * Matching is CASE-INSENSITIVE, and that is the point rather than a
 * convenience: upstream `course_id` has no canonical casing (five live courses
 * are not fully uppercase — see audit-course-id-casing), and `Power-Apps` and
 * `POWER-APPS` are one identity. An exact-only match would report those rows as
 * unresolvable and leave them un-anchored for no reason. Exact vs case-only is
 * reported separately so the distinction stays visible.
 *
 * Run: npm run audit:extension-anchor
 */

import { register } from 'node:module';

register(new URL('../test/loader.mjs', import.meta.url));

const { listPublicCourses } = await import('@/lib/api/public-courses');
const { dbConnect } = await import('@/lib/db/connect');
const { CourseExtension } = await import('@/models/CourseExtension');
const { RENAME_STORES } = await import('@/lib/courses/renameCoursePreview');
const mongoose = (await import('mongoose')).default;

const norm = (v) => String(v ?? '').trim().toLowerCase();

console.log('=== CourseExtension → upstream _id anchor feasibility (READ-ONLY) ===\n');

// ── Upstream ────────────────────────────────────────────────────────────────
let list;
try {
  // includeHidden — a hidden course still has an extension row and still needs
  // an anchor. Filtering here would under-report the unresolvable set.
  list = await listPublicCourses({ includeHidden: true });
} catch (err) {
  console.error('LIST CALL FAILED — cannot proceed:', err?.message ?? err);
  process.exit(1);
}
const upstream = list.items ?? [];
console.log(`upstream courses (includeHidden): ${upstream.length}   [summary.total ${list.total}]`);

// ── Q2. Is the upstream _id usable as an anchor at all? ─────────────────────
const missingId = upstream.filter((c) => !c?._id);
const missingCode = upstream.filter((c) => !String(c?.course_id ?? '').trim());

const idCount = new Map();
for (const c of upstream) {
  const k = String(c?._id ?? '');
  if (k) idCount.set(k, (idCount.get(k) ?? 0) + 1);
}
const dupIds = [...idCount.entries()].filter(([, n]) => n > 1);

console.log('\n── Q2. upstream _id as an identifier ──');
console.log(`  distinct _id values : ${idCount.size}`);
console.log(`  rows with NO _id    : ${missingId.length}`);
console.log(`  rows with NO code   : ${missingCode.length}`);
console.log(`  DUPLICATE _id values: ${dupIds.length}`);
for (const [id, n] of dupIds) {
  const who = upstream.filter((c) => String(c._id) === id).map((c) => c.course_id);
  console.log(`    ${id} ×${n} → ${who.join(', ')}`);
}
for (const c of missingId) console.log(`    NO _id: course_id=${c?.course_id}`);
for (const c of missingCode) console.log(`    NO code: _id=${c?._id}`);

// Also: is the CODE unique upstream? A duplicated code is what makes a
// code→_id mapping ambiguous, and it is the failure this whole script guards.
const codeCount = new Map();
for (const c of upstream) {
  const k = norm(c?.course_id);
  if (k) codeCount.set(k, (codeCount.get(k) ?? 0) + 1);
}
const dupCodes = [...codeCount.entries()].filter(([, n]) => n > 1);
console.log(`  duplicate course_id (case-insensitive): ${dupCodes.length}`);
for (const [code, n] of dupCodes) {
  const who = upstream.filter((c) => norm(c.course_id) === code);
  console.log(`    "${code}" ×${n} → ${who.map((c) => `${c.course_id}(${c._id})`).join(', ')}`);
}

// ── Genesis ─────────────────────────────────────────────────────────────────
await dbConnect();
const rows = await CourseExtension.find({}).lean();
console.log(`\ngenesis CourseExtension rows: ${rows.length}`);

// ── Q3. Does a row already carry an upstream identifier under another name? ─
// Read from the RAW collection, not through the schema: a field Mongoose does
// not declare is invisible to a projection but present in the document, and
// "we already store it somewhere" is exactly the kind of thing a schema listing
// would hide.
const rawRows = await mongoose.connection.db.collection('course_extensions').find({}).toArray();
const keyCount = new Map();
for (const r of rawRows) {
  for (const k of Object.keys(r)) keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
}
console.log(`\n── Q3. every key present on any raw document (${rawRows.length} docs) ──`);
for (const [k, n] of [...keyCount.entries()].sort()) {
  console.log(`  ${k.padEnd(24)} on ${n}/${rawRows.length}`);
}
const OID_LIKE = /^[0-9a-f]{24}$/i;
const suspects = [...keyCount.keys()].filter((k) => {
  if (k === '_id') return false;
  return rawRows.some((r) => {
    const v = r[k];
    return (v && typeof v === 'object' && v._bsontype === 'ObjectId')
      || (typeof v === 'string' && OID_LIKE.test(v));
  });
});
console.log(`  fields holding an ObjectId-shaped value (excluding genesis _id): ${suspects.length ? suspects.join(', ') : 'none'}`);

// ── Q1. Does every row resolve to exactly one upstream course? ──────────────
const byCode = new Map();
for (const c of upstream) {
  const k = norm(c?.course_id);
  if (!k) continue;
  if (!byCode.has(k)) byCode.set(k, []);
  byCode.get(k).push(c);
}

const exactSet = new Set(upstream.map((c) => String(c?.course_id ?? '').trim()).filter(Boolean));

const resolved = [];
const unresolved = [];
const ambiguous = [];
const caseOnly = [];

for (const r of rows) {
  const code = String(r?.courseId ?? '').trim();
  const hits = byCode.get(norm(code)) ?? [];
  if (hits.length === 1) {
    resolved.push({ code, id: String(hits[0]._id), upstreamCode: hits[0].course_id });
    if (!exactSet.has(code)) caseOnly.push({ code, upstreamCode: hits[0].course_id });
  } else if (hits.length === 0) {
    unresolved.push({ code, _id: String(r._id) });
  } else {
    ambiguous.push({ code, hits: hits.map((h) => `${h.course_id}(${h._id})`) });
  }
}

console.log('\n── Q1. code → upstream course, per genesis row ──');
console.log(`  resolve to EXACTLY ONE : ${resolved.length} / ${rows.length}`);
console.log(`  resolve to ZERO        : ${unresolved.length}`);
console.log(`  resolve to MORE THAN 1 : ${ambiguous.length}`);
console.log(`  (of the resolved, matched only case-insensitively: ${caseOnly.length})`);
for (const c of caseOnly) console.log(`    genesis "${c.code}" ↔ upstream "${c.upstreamCode}"`);
for (const u of unresolved) console.log(`    ZERO  : courseId="${u.code}"  (genesis _id ${u._id})`);
for (const a of ambiguous) console.log(`    MANY  : courseId="${a.code}" → ${a.hits.join(', ')}`);

// Upstream courses with NO genesis extension row — not a blocker, but it is
// the number that says how many rows a future create path has to carry.
const extCodes = new Set(rows.map((r) => norm(r?.courseId)).filter(Boolean));
const upstreamWithoutExt = upstream.filter((c) => !extCodes.has(norm(c?.course_id)));
console.log(`\n  upstream courses with no extension row: ${upstreamWithoutExt.length}`);
for (const c of upstreamWithoutExt) console.log(`    ${c.course_id}`);

// ── Q4. Which OTHER genesis stores could carry the same anchor? ─────────────
// REPORTED, NOT BUILT. Listed from the rename plan's own store table so this
// cannot drift from the set the rename actually has to move.
console.log('\n── Q4. other genesis stores keyed on the CODE (report only) ──');
for (const s of RENAME_STORES) {
  console.log(
    `  ${String(s.key).padEnd(24)} ${String(s.model).padEnd(28)} ${String(s.field).padEnd(30)}`
    + `${s.historical ? 'historical' : ''}`
  );
}

// ── Verdict ─────────────────────────────────────────────────────────────────
const blocking = unresolved.length + ambiguous.length + dupCodes.length + dupIds.length + missingId.length;
console.log('\n=== VERDICT ===');
console.log(
  blocking === 0
    ? `UNAMBIGUOUS TODAY — all ${rows.length} rows anchor to exactly one upstream _id.`
    : `NOT FULLY UNAMBIGUOUS — ${unresolved.length} unresolvable, ${ambiguous.length} ambiguous, `
      + `${dupCodes.length} duplicate upstream codes, ${dupIds.length} duplicate upstream _ids, `
      + `${missingId.length} upstream rows with no _id. Those rows must be LEFT EMPTY.`
);

await mongoose.connection.close();
