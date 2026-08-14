/**
 * Upstream course_id CASING audit — READ-ONLY.
 *
 * ── CONCLUSION (measured 2026-08-06 — DO NOT RE-RUN TO "CHECK") ─────────────
 * Upstream `?course_id=` is EXACT-MATCH CASE-SENSITIVE, and 5 of 77 public
 * courses carry mixed-case ids:
 *
 *   Power-Apps  SQL-PG-Query  SQL-ADM-Tuning  MS-SQL-19-Prov  SQL-ADM-Secure
 *
 * Every public URL is built from `course_id.toLowerCase()`, and both the
 * registration page and resolveCourse uppercase it back before looking it up,
 * so for those five NEITHER casing ever matched: the registration page bounced
 * to /training-course and the course detail page 404'd outright. Only
 * Power-Apps had open schedules, so it was the only broken REGISTRATION link —
 * but all five had a broken detail page, reachable straight from the catalog
 * grid, and none of them has a CourseExtension urlAlias to fall back on.
 *
 * Two things that are NOT the cause, both measured rather than assumed:
 *   - Not a fetch failure. 0 of 77 lookups threw.
 *   - Not an upstream visibility filter. All 77 list-view ids resolve via
 *     `?course_id=` when the case is left alone, so the two views apply the
 *     same filter. This is NOT the signup_url shape, where an upstream filter
 *     acted as a de facto publish flag.
 *
 * There is no case-insensitive upstream lookup to switch to: `?course=`
 * (getPublicCourse) is exact-match too, verified across all three casings for
 * all five ids.
 *
 * The list row was byte-identical to the detail response for all 37 keys, so
 * the fallback COULD return the list row directly; getCourseByCodeInsensitive
 * re-fetches anyway rather than couple itself to that staying true.
 *
 * ── WHAT THIS SCRIPT IS FOR NOW ────────────────────────────────────────────
 * src/lib/api/public-courses.js `getCourseByCodeInsensitive` makes these five
 * courses REACHABLE. It does not make their ids correct — it hides the symptom
 * behind a fallback and a console.warn. This script exists to keep the CAUSE
 * visible: it reports which course_ids are mixed-case UPSTREAM, so the number
 * can go to zero when someone fixes the data, and so a sixth one shows up here
 * rather than only in a production log line nobody reads.
 *
 * It therefore calls the RAW `getCourseByCode` deliberately — never the
 * case-tolerant helper. Routing it through the helper would make it report
 * "everything resolves" forever, which is exactly the blindness it guards
 * against. Do not "fix" that.
 *
 * ── COST — READ BEFORE RUNNING IN A LOOP ───────────────────────────────────
 * ~160 LIVE upstream requests per run: one list call, then up to two lookups
 * per course, plus the mixed-case cross-check. Outside Next there is no ISR
 * cache, so nothing is deduplicated and every invocation pays in full. This is
 * a "run it when you suspect the data changed" script, not a health check.
 *
 * ── WRITES ─────────────────────────────────────────────────────────────────
 * None. Not behind a flag, not at all: there is no --apply, and no write call
 * of any kind in this file — no POST, no PUT, no mongoose, no $set. It issues
 * HTTP GETs against the upstream read API and prints a report.
 *
 * Run: npm run audit:course-id-casing
 *
 * A note on the warning node prints: MODULE_TYPELESS_PACKAGE_JSON for the src
 * files it loads. The repo's package.json has no `"type"`, so Node sniffs and
 * reparses them as ESM. Cosmetic, and NOT worth "fixing" by adding
 * `"type": "module"` — that changes module resolution for the whole Next app to
 * satisfy one script.
 */

import { register } from 'node:module';

// src/lib/api/client.js imports '@/lib/fetchWithTimeout'. The verification
// suite's loader already resolves that alias; reuse it rather than duplicating
// the adapter, which would drift from the code under audit.
register(new URL('../test/loader.mjs', import.meta.url));

const { listPublicCourses, getCourseByCode, getPublicCourse } = await import(
  '@/lib/api/public-courses'
);

const CONCURRENCY = 5;

/** Map with bounded concurrency, preserving order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/** Resolve one id, separating "no match" from "the call itself failed". */
async function probe(fn, id) {
  try {
    const course = await fn(id);
    return { ok: true, hit: Boolean(course), id: course?.course_id ?? null };
  } catch (err) {
    return { ok: false, hit: false, error: String(err?.message ?? err).slice(0, 160) };
  }
}

console.log('=== upstream course_id casing audit (READ-ONLY) ===\n');

let list;
try {
  // includeHidden — this audits UPSTREAM's casing across the whole catalog. A
  // hidden course's id is exactly as capable of breaking a lookup as a visible
  // one's, and the audit would silently stop covering it.
  list = await listPublicCourses({ includeHidden: true });
} catch (err) {
  console.error('LIST CALL FAILED — cannot proceed:', err?.message ?? err);
  process.exit(1);
}

const courses = (list.items ?? []).filter((c) => c.course_id);
console.log(`GET /public-course (no params) → ${courses.length} courses (summary.total ${list.total})`);

const skipped = (list.items ?? []).length - courses.length;
if (skipped) console.log(`!! ${skipped} list entries have no course_id at all`);

// ── 1. Which ids are mixed-case upstream? ──────────────────────────────────
const mixed = courses.filter((c) => String(c.course_id) !== String(c.course_id).toUpperCase());
console.log(`\nmixed-case course_ids upstream: ${mixed.length} of ${courses.length}`);
for (const c of mixed) {
  console.log(`  ${String(c.course_id).padEnd(18)} _id=${c._id}  price=${c.course_price}`);
}

// ── 2. Confirm the mechanism: uppercase misses, verbatim hits ──────────────
// The RAW lookup, on purpose — see the header. This is what the app used to do
// and what upstream still does.
const rows = await mapLimit(courses, CONCURRENCY, async (c) => {
  const raw = String(c.course_id);
  const upper = await probe(getCourseByCode, raw.toUpperCase());
  const verbatim = upper.hit ? null : await probe(getCourseByCode, raw);
  return { raw, upper, verbatim };
});

const failed = rows.filter((r) => !r.upper.ok);
const hitUpper = rows.filter((r) => r.upper.hit);
const missUpper = rows.filter((r) => r.upper.ok && !r.upper.hit);
const caseOnly = missUpper.filter((r) => r.verbatim?.hit);
const absent = missUpper.filter((r) => r.verbatim?.ok && !r.verbatim.hit);

console.log('\n── raw ?course_id= behaviour ───────────────────────────────────');
console.log(`resolve when UPPERCASED     ${hitUpper.length}`);
console.log(`miss when uppercased        ${missUpper.length}`);
console.log(`  …but hit VERBATIM         ${caseOnly.length}   <- casing, not absence`);
console.log(`  …absent either way        ${absent.length}`);
console.log(`upstream call FAILED        ${failed.length}`);

if (absent.length) {
  console.log('\nABSENT from ?course_id= even verbatim (list/detail filters disagree):');
  for (const r of absent) console.log(`  ${r.raw}`);
}
if (failed.length) {
  console.log('\nCALL FAILURES:');
  for (const r of failed) console.log(`  ${r.raw}: ${r.upper.error}`);
}

// ── 3. Is there a case-insensitive upstream lookup we could switch to? ─────
console.log('\n── is any upstream param case-insensitive? ─────────────────────');
if (mixed.length === 0) {
  console.log('no mixed-case ids to test with — nothing to check');
} else {
  const sample = String(mixed[0].course_id);
  for (const v of [sample, sample.toUpperCase(), sample.toLowerCase()]) {
    const byId = await probe(getCourseByCode, v);
    const byCourse = await probe(getPublicCourse, v);
    console.log(
      `  ${v.padEnd(18)} ?course_id=${byId.hit ? 'HIT ' : byId.ok ? 'miss' : 'ERR '}` +
        `   ?course=${byCourse.hit ? 'HIT ' : byCourse.ok ? 'miss' : 'ERR '}`
    );
  }
  console.log('  (both exact-match as of 2026-08-06 — no case-insensitive param exists)');
}

// ── 4. Verdict ─────────────────────────────────────────────────────────────
console.log('\n── verdict ────────────────────────────────────────────────────');
if (mixed.length === 0) {
  console.log('CLEAN: every upstream course_id is uppercase. The fallback in');
  console.log('getCourseByCodeInsensitive is now inert and could be retired.');
} else {
  console.log(`${mixed.length} course_id(s) still need fixing UPSTREAM:`);
  console.log(`  ${mixed.map((c) => c.course_id).join(', ')}`);
  console.log('\nGenesis reaches them via getCourseByCodeInsensitive, which logs a');
  console.log('[courses] warning every time it has to. That is a workaround, not a');
  console.log('fix — the ids themselves are still wrong at the source.');
}
process.exitCode = 0; // reporting only; a finding is not a failure
