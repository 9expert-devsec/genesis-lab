/**
 * ROUND 63 (part 2) — is a round's identifier STABLE?
 * READ-ONLY. Evidence for the identifier verdict in docs/course-schedule-selection.md.
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));
const { PUBLIC_SCHEDULE_STATUSES, getAllSchedules } = await import('@/lib/api/schedules');
const { listPublicCourses } = await import('@/lib/api/public-courses');

const { items = [] } = await getAllSchedules({ status: PUBLIC_SCHEDULE_STATUSES });

// 1. Was the doc EDITED IN PLACE (updatedAt > createdAt, __v > 0)? An in-place
//    edit keeps _id; a delete+recreate would not.
let edited = 0; const vs = {};
for (const r of items) {
  if (new Date(r.updatedAt) - new Date(r.createdAt) > 1000) edited++;
  vs[r.__v] = (vs[r.__v] ?? 0) + 1;
}
console.log(`EDITED IN PLACE (updatedAt > createdAt): ${edited}/${items.length}`);
console.log(`__v DISTRIBUTION (mongoose version key = #in-place array mutations):`, JSON.stringify(vs));

// 2. Do the DATES uniquely identify a round within its course?
const byCourse = new Map();
for (const r of items) {
  const k = String(r.course?._id ?? '?');
  if (!byCourse.has(k)) byCourse.set(k, []);
  byCourse.get(k).push(r);
}
let dupDates = 0, dupFirstDate = 0;
for (const [, rows] of byCourse) {
  const seen = new Set(), seenFirst = new Set();
  for (const r of rows) {
    const key = (r.dates ?? []).join('|');
    if (seen.has(key)) dupDates++; seen.add(key);
    const f = (r.dates ?? [])[0] ?? '';
    if (seenFirst.has(f)) dupFirstDate++; seenFirst.add(f);
  }
}
console.log(`COLLISIONS if identified by FULL DATE ARRAY within a course: ${dupDates}`);
console.log(`COLLISIONS if identified by FIRST DATE within a course: ${dupFirstDate}`);

// 3. Do dates ever change? Can't diff over time from one read — report what the
//    stored timestamps allow us to say, plus how many rounds were touched
//    AFTER creation at all.
const recent = items.filter((r) => new Date(r.updatedAt) > new Date('2026-01-01')).length;
console.log(`ROUNDS TOUCHED SINCE 2026-01-01: ${recent}/${items.length}`);

// 4. The signup_url's LEGACY id space.
const legacy = items.filter((r) => /class=(\d+)/.test(r.signup_url ?? '')).length;
console.log(`signup_url CARRIES a legacy numeric class id: ${legacy}/${items.length}`);
const noUrl = items.filter((r) => !r.signup_url).length;
console.log(`signup_url EMPTY: ${noUrl}/${items.length}`);

// 5. How many public courses have NO upcoming round at all — the empty case (H).
const cat = await listPublicCourses({});
const codes = (cat?.items ?? []).map((c) => String(c.course_id ?? '').toUpperCase()).filter(Boolean);
const withRounds = new Set(items.map((r) => String(r.course?.course_id ?? '').toUpperCase()));
const without = codes.filter((c) => !withRounds.has(c));
console.log(`\nPUBLIC COURSES: ${codes.length}; WITH >=1 upcoming round: ${codes.length - without.length}; WITH NONE: ${without.length}`);
console.log(`EXAMPLES WITH NONE: ${without.slice(0, 8).join(', ')}`);

// 6. status distribution — what a stored snapshot could not keep true.
const st = {}; for (const r of items) st[r.status] = (st[r.status] ?? 0) + 1;
console.log(`STATUS DISTRIBUTION:`, JSON.stringify(st));
const types = {}; for (const r of items) types[r.type] = (types[r.type] ?? 0) + 1;
console.log(`TYPE DISTRIBUTION:`, JSON.stringify(types));
