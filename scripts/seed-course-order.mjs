/**
 * Seed ProgramOrder.courseOrder / SkillOrder.courseOrder from the order the
 * site renders today.
 *
 *   node --env-file=.env.local scripts/seed-course-order.mjs           # DRY RUN + proof
 *   node --env-file=.env.local scripts/seed-course-order.mjs --apply   # writes
 *
 * ── DRY RUN IS THE DEFAULT, AND IT PROVES R4 ──────────────────────────────
 * R4's claim is that nothing moves on the day this deploys. That is checkable
 * rather than hopeful: for every category, the seeded list is fed back through
 * the real comparator and the result must equal the order the catalogue already
 * renders in. The dry run does the whole comparison and writes nothing, so the
 * proof can be produced — and re-produced — without touching the database.
 *
 * ── WHAT --apply WRITES, AND WHAT IT CANNOT CLOBBER ───────────────────────
 * One `$set` per category document, touching `courseOrder` and
 * `courseOrderSource` only. It is NOT a whole-document write: nothing else on
 * the document is named, so no field can be reset to a default by omission —
 * the failure that lost a payment toggle through course-extensions.js:248-260.
 *
 * A category whose `courseOrderSource` is already 'arranged' is SKIPPED, so a
 * second run cannot overwrite an arrangement a person made.
 *
 * MSDB is never written. `sort_order` upstream is left exactly as it is; this
 * only captures the order it currently produces.
 */

import { register } from 'node:module';
import mongoose from 'mongoose';

register(new URL('../test/loader.mjs', import.meta.url));

const APPLY = process.argv.includes('--apply');

const { planCourseOrderSeed } = await import('@/lib/courses/seedCourseOrder');
const { orderCoursesInCategory } = await import('@/lib/courses/courseOrder');

const BASE = process.env.AI_API_BASE;
const KEY = process.env.AI_API_KEY;
if (!BASE || !KEY) { console.error('AI_API_BASE / AI_API_KEY not set'); process.exit(1); }
if (!process.env.MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

/**
 * The catalogue, UNSORTED and in the order upstream returned it. That sequence
 * is the thing being captured, so it must not be touched on the way in.
 */
const res = await fetch(`${BASE}/public-course`, { headers: { 'x-api-key': KEY } });
const body = await res.json();
const raw = body?.data?.items ?? body?.items ?? body?.data ?? body;
const courses = Array.isArray(raw) ? raw : [];
if (!courses.length) { console.error('upstream returned no courses'); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const programDocs = await db.collection('program_orders').find({}).toArray();
const skillDocs = await db.collection('skill_orders').find({}).toArray();

const plan = planCourseOrderSeed({ courses, programDocs, skillDocs });

console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} — ${courses.length} courses ===`);
console.log(`programme lists: ${plan.programs.length}   skill lists: ${plan.skills.length}   skipped (arranged): ${plan.skipped.length}`);
for (const s of plan.skipped) console.log(`   SKIPPED ${s.kind} ${s.id} — ${s.reason}`);

// ── THE R4 PROOF ───────────────────────────────────────────────────────────
let checked = 0;
let moved = 0;
const check = (label, rendered, codes) => {
  checked += 1;
  const after = orderCoursesInCategory(rendered, codes);
  const before = rendered.map((x) => x.course_id);
  const now = after.map((x) => x.course_id);
  if (JSON.stringify(before) !== JSON.stringify(now)) {
    moved += 1;
    console.log(`\n   *** ${label} MOVED`);
    console.log(`       was: ${before.join(' ')}`);
    console.log(`       now: ${now.join(' ')}`);
  }
};

for (const { programId, courseOrder } of plan.programs) {
  check(`program ${programId}`,
    courses.filter((x) => String(x?.program?.program_id ?? '') === programId),
    courseOrder);
}
for (const { skillId, courseOrder } of plan.skills) {
  check(`skill ${skillId}`,
    courses.filter((x) => (x?.skills ?? []).some((s) => String(s?.skill_id ?? '') === skillId)),
    courseOrder);
}

console.log(`\n=== R4 PROOF: ${checked} categories checked, ${moved} moved ===`);
console.log(moved === 0
  ? '    Every category renders in exactly the order it does today.'
  : '    *** SOMETHING MOVED — do not apply until this is understood.');

if (!APPLY) {
  console.log('\n(dry run — nothing written. Re-run with --apply to seed.)\n');
  await mongoose.disconnect();
  process.exit(moved === 0 ? 0 : 1);
}

if (moved !== 0) {
  console.error('\nrefusing to apply: the plan is not order-preserving.');
  await mongoose.disconnect();
  process.exit(1);
}

// Targeted $set only — never a whole-document write.
for (const { programId, courseOrder } of plan.programs) {
  await db.collection('program_orders').updateOne(
    { programId },
    { $set: { courseOrder, courseOrderSource: 'seeded' } },
    { upsert: true }
  );
}
for (const { skillId, courseOrder } of plan.skills) {
  await db.collection('skill_orders').updateOne(
    { skillId },
    { $set: { courseOrder, courseOrderSource: 'seeded' } },
    { upsert: true }
  );
}
console.log(`\napplied: ${plan.programs.length} programme lists, ${plan.skills.length} skill lists\n`);
await mongoose.disconnect();
