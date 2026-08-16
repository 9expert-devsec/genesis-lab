/**
 * CourseExtension.upstreamId backfill — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING unless `--apply` is passed. Without it this script reads both
 * sides, prints the whole plan, and exits.
 *
 * ── WHY THIS RUNS NOW AND NOT LATER ─────────────────────────────────────────
 * The anchor is the upstream `_id`, which survives a rename while the code does
 * not. It is what will let a rename guard tell "this course was renamed at
 * MSDB" from "this course was deleted upstream and an unrelated one was created
 * under the new code" — two situations that are the SAME observation from the
 * code alone, and whose difference is a silent merge of two courses' SEO,
 * gallery, early-bird price and schedule overrides, with no reverse.
 *
 * The mapping is only certain while every genesis code still matches an
 * upstream code. Measured 2026-08-16 by scripts/audit-extension-upstream-id:
 * 79 rows, 79 upstream courses, all 79 resolving to exactly one `_id`. After
 * the next rename, the row that most needs an anchor is the one that can no
 * longer be given one.
 *
 * ── THE TWO RULES, AND WHY THEY ARE NOT NEGOTIABLE ──────────────────────────
 *
 *   A ROW THAT DOES NOT RESOLVE IS LEFT EMPTY. Not filled with a best guess,
 *   not filled with the nearest match. A wrong anchor is indistinguishable from
 *   a right one afterwards, and it would be trusted by exactly the guard that
 *   exists to prevent the merge. An empty anchor is a state the guard can see
 *   and refuse on; a wrong one is not.
 *
 *   A STORED ANCHOR THAT DISAGREES IS REPORTED, NEVER OVERWRITTEN. If a row
 *   already carries an id and the code now resolves elsewhere, either the
 *   anchor is wrong or the code moved — and those are not separable from here.
 *   The stored value is the older claim, written while both sides agreed; the
 *   code is the thing known to drift. Last-write-wins on an identity field is
 *   how the merge happens quietly.
 *
 * Both decisions live in lib/courses/upstreamAnchorPlan and are driven against
 * fixtures in test/pure/upstreamAnchorPlan — neither has a live instance today,
 * and the second one must never have one.
 *
 * ── RE-RUNNABLE ─────────────────────────────────────────────────────────────
 * A second run over the same data writes nothing: every row it wrote is now
 * `alreadyAnchored`, which is a no-op bucket rather than a repeated `$set`. The
 * run reports that explicitly so "0 written" reads as "nothing left to do"
 * rather than "it did not work".
 *
 * ── WHAT IT WRITES ──────────────────────────────────────────────────────────
 * One field, `upstreamId`, on rows that have none. Nothing else on the
 * document is touched — the update is a `$set` of that single key, so no
 * schema default can reach a field this script did not mean to change.
 *
 * Run:
 *   npm run backfill:extension-anchor           # dry run, writes nothing
 *   npm run backfill:extension-anchor -- --apply
 */

import { register } from 'node:module';

register(new URL('../test/loader.mjs', import.meta.url));

const { listPublicCourses } = await import('@/lib/api/public-courses');
const { dbConnect } = await import('@/lib/db/connect');
const { CourseExtension } = await import('@/models/CourseExtension');
const { planAnchorBackfill, UNANCHORABLE } = await import('@/lib/courses/upstreamAnchorPlan');
const mongoose = (await import('mongoose')).default;

const APPLY = process.argv.includes('--apply');

const REASON_TEXT = {
  [UNANCHORABLE.NO_UPSTREAM_MATCH]: 'no upstream course carries this code',
  [UNANCHORABLE.AMBIGUOUS_UPSTREAM]: 'MORE THAN ONE upstream course carries this code',
  [UNANCHORABLE.UPSTREAM_HAS_NO_ID]: 'the one upstream match has no usable _id',
};

console.log('=== CourseExtension.upstreamId backfill ===');
console.log(APPLY ? '   MODE: --apply  (WILL WRITE)' : '   MODE: dry run  (writes nothing)');
console.log('');

// ── Read both sides ─────────────────────────────────────────────────────────
let list;
try {
  // includeHidden — a hidden course has an extension row like any other, and
  // filtering here would move it from "anchored" to "no upstream match", i.e.
  // manufacture the exact finding this script exists to report truthfully.
  list = await listPublicCourses({ includeHidden: true });
} catch (err) {
  console.error('UPSTREAM LIST FAILED — nothing read, nothing written:', err?.message ?? err);
  process.exit(1);
}
const upstream = list.items ?? [];

await dbConnect();
const rows = await CourseExtension.find({}, { courseId: 1, upstreamId: 1 }).lean();

console.log(`upstream courses : ${upstream.length}`);
console.log(`extension rows   : ${rows.length}\n`);

// ── Decide ──────────────────────────────────────────────────────────────────
const plan = planAnchorBackfill({ rows, upstream });

console.log('── plan ──');
console.log(`  to write (currently empty) : ${plan.counts.write}`);
console.log(`  already anchored, correct  : ${plan.counts.alreadyAnchored}`);
console.log(`  CONFLICT (left untouched)  : ${plan.counts.conflicts}`);
console.log(`  unanchorable (left EMPTY)  : ${plan.counts.unanchorable}`);

if (plan.conflicts.length) {
  console.log('\n  ⚠ CONFLICTS — reported, NOT corrected. Somebody has to look at these:');
  for (const c of plan.conflicts) {
    console.log(`    ${c.courseId}: stored=${c.stored}  code now resolves to=${c.upstreamId} (${c.upstreamCode})`);
  }
}

if (plan.unanchorable.length) {
  console.log('\n  ⚠ LEFT EMPTY — never guessed:');
  for (const u of plan.unanchorable) {
    const held = u.stored ? `  [keeps existing anchor ${u.stored}]` : '';
    console.log(`    ${u.courseId}: ${REASON_TEXT[u.reason] ?? u.reason}${held}`);
    for (const c of u.candidates) console.log(`        candidate: ${c.course_id} (${c._id})`);
  }
}

// ── Write ───────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log('\nDRY RUN — nothing was written.');
  if (plan.counts.write > 0) {
    console.log('  To apply, run it yourself:');
    console.log('    npm run backfill:extension-anchor -- --apply');
  } else {
    console.log('  Nothing to write: every resolvable row already carries its anchor.');
  }
  await mongoose.connection.close();
  process.exit(0);
}

let written = 0;
const failures = [];
for (const entry of plan.write) {
  try {
    /**
     * `$set` of ONE key, filtered on a row that still has no anchor.
     *
     * The filter is not decoration: the plan was computed from a read taken
     * moments ago, and re-checking emptiness in the write itself means a row
     * anchored in between (by an admin save on the course form) is skipped
     * rather than overwritten. That is the same rule the plan applies, enforced
     * where it cannot be raced.
     */
    const res = await CourseExtension.updateOne(
      { courseId: entry.courseId, $or: [{ upstreamId: { $exists: false } }, { upstreamId: '' }, { upstreamId: null }] },
      { $set: { upstreamId: entry.upstreamId } }
    );
    if (res.modifiedCount > 0) written += 1;
    else failures.push(`${entry.courseId}: matched ${res.matchedCount}, modified 0 — anchored by someone else in between?`);
  } catch (err) {
    failures.push(`${entry.courseId}: ${err?.message ?? err}`);
  }
}

console.log(`\nWROTE ${written} of ${plan.write.length} planned.`);
for (const f of failures) console.log(`  !! ${f}`);

// ── Verify by re-reading ────────────────────────────────────────────────────
// The write reported success; this is what the collection actually holds.
const after = await CourseExtension.find({}, { courseId: 1, upstreamId: 1 }).lean();
const anchored = after.filter((r) => String(r?.upstreamId ?? '').trim()).length;
console.log(`\nafter: ${anchored} of ${after.length} rows carry an anchor.`);
const stillEmpty = after.filter((r) => !String(r?.upstreamId ?? '').trim());
for (const r of stillEmpty) console.log(`  still empty: ${r.courseId}`);

await mongoose.connection.close();
