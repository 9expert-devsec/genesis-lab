/**
 * ROUND 46 — what is there to SEARCH on, and how well does a substring match
 * narrow 79 courses?
 *
 * The picker's search box is the whole of its filtering (the icon picker's
 * lesson: don't invent groups a list does not have). Whether one box is enough
 * depends on facts about the names, not on taste — how long they are, whether
 * they are Thai or English, whether the field CourseForm searches even exists
 * upstream, and how many results a typical query leaves.
 *
 * READ-ONLY, one upstream GET. Run:
 *   node --env-file=.env.local --import ./scripts/_probe-live-register.mjs \
 *        scripts/_probe-round46-search-shape.mjs
 */
const { listPublicCourses } = await import('@/lib/api/public-courses');

const { items } = await listPublicCourses({ includeHidden: true });
const hasThai = (s) => /[฀-๿]/.test(String(s ?? ''));

console.log('=== round 46 — search shape ===\n');
console.log(`  courses: ${items.length}\n`);

// ── which name fields actually exist upstream ─────────────────────────────
const present = (key) => items.filter((c) => c[key] !== undefined && c[key] !== null && c[key] !== '').length;
console.log('-- name-ish fields, and how many rows carry them --');
for (const k of ['course_id', 'course_name', 'course_name_th', 'course_name_en', 'course_teaser']) {
  console.log(`  ${k.padEnd(16)} ${String(present(k)).padStart(3)} / ${items.length}`);
}

// ── the shape of what a picker would show ─────────────────────────────────
const names = items.map((c) => String(c.course_name ?? ''));
const ids = items.map((c) => String(c.course_id ?? ''));
const len = (a) => ({
  min: Math.min(...a.map((s) => s.length)),
  max: Math.max(...a.map((s) => s.length)),
  mean: Math.round(a.reduce((n, s) => n + s.length, 0) / a.length),
});
console.log('\n-- lengths --');
console.log(`  course_id   ${JSON.stringify(len(ids))}`);
console.log(`  course_name ${JSON.stringify(len(names))}`);
console.log(`  course_name containing Thai : ${names.filter(hasThai).length} / ${names.length}`);
console.log(`  course_id containing Thai   : ${ids.filter(hasThai).length} / ${ids.length}`);
console.log(`  mixed-case course_id        : ${ids.filter((s) => s !== s.toUpperCase()).length} / ${ids.length}`);
console.log(`  duplicate course_id values  : ${ids.length - new Set(ids).size}`);

// ── does one substring box narrow the list usefully? ──────────────────────
/**
 * The REAL rule, not a re-implementation of it. `filterCourseOptions` is what
 * the admin course form's pickers already use — case-folded substring over
 * course_id + course_name + course_name_th, with the สระอำ fold. Measuring with
 * a hand-written match would have produced numbers about a rule nothing runs.
 */
const { filterCourseOptions, courseOptionLabel } = await import('@/lib/courses/courseOptionFilter');
const match = (c, q) => filterCourseOptions([c], q).length === 1;
console.log('\n-- how far a one-box substring search narrows 79 --');
for (const q of ['a', 'sql', 'excel', 'ai', 'power', 'copilot', 'vibe', 'ออกแบบ', 'zz']) {
  const n = items.filter((c) => match(c, q)).length;
  console.log(`  ${JSON.stringify(q).padEnd(12)} ${String(n).padStart(3)} match`);
}

// Worst case: the single character that matches the most rows. If even that
// leaves a list a person can scroll, no result cap is needed.
const chars = [...new Set('abcdefghijklmnopqrstuvwxyz0123456789-'.split(''))];
const worst = chars
  .map((ch) => ({ ch, n: items.filter((c) => match(c, ch)).length }))
  .sort((a, b) => b.n - a.n)[0];
console.log(`\n  worst single character: ${JSON.stringify(worst.ch)} matches ${worst.n} of ${items.length}`);
console.log(`  empty query shows      : ${filterCourseOptions(items, '').length}`);

// ── what a row would READ as, through the existing label helper ───────────
// courseOptionLabel prefers course_name_th, which no row carries (above), so
// every label falls through to course_name. Shown rather than asserted: the
// fallback is the point, and a sample is how you see it working.
console.log('\n-- rows, through courseOptionLabel --');
for (const c of items.slice(0, 5)) console.log(`  ${courseOptionLabel(c)}`);
const labels = items.map(courseOptionLabel);
console.log(`  longest label: ${Math.max(...labels.map((s) => s.length))} chars`);
console.log(`  empty labels : ${labels.filter((s) => !s).length}`);

const mongoose = (await import('mongoose')).default;
await mongoose.disconnect().catch(() => {});
