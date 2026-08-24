/**
 * ROUND 46 — how big is the course list, and how big is the projection?
 *
 * The course picker needs a catalogue in the browser. Whether it can HAVE one
 * turns on a number nobody in this repo had measured: the serialised size of
 * what would be handed down. This measures it against the real upstream
 * adapter, on this clone, today.
 *
 * ── EVERY READ HERE IS REAL, AND THAT IS THE WHOLE POINT ───────────────────
 * Both course stores fail OPEN — `loadHiddenCourseIds` catches and returns an
 * empty Set, `loadCourseOrder` catches and returns null. Under the verification
 * suite's loader, `@/lib/db/connect` is a no-op stub, so the hidden-set read
 * buffers against a connection that was never opened and comes back as
 * "0 courses are hidden" ten seconds later. Reporting that as "79 of 79 are
 * public" would be laundering a failure as a measurement.
 *
 * So this runs under scripts/_probe-live-hooks.mjs, which stubs nothing but
 * next/link, next/image and next/navigation, and it CHECKS both stores rather
 * than trusting them: each is called with its error/warn sink captured, and if
 * either fires, the run says the number is unusable instead of printing it.
 *
 * READ-ONLY. Two upstream GETs and one indexed Mongo find.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-live-register.mjs \
 *        scripts/_probe-round46-course-payload.mjs
 */
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const { listPublicCourses } = await import('@/lib/api/public-courses');
const { loadHiddenCourseIds } = await import('@/lib/courses/hiddenCourses');
const { loadCourseOrder } = await import('@/lib/courses/courseOrderStore');

// ── 1. the two stores, with their fail-open sinks captured ────────────────
const hiddenErrors = [];
const orderWarns = [];
const hidden = await loadHiddenCourseIds({ error: (m) => hiddenErrors.push(String(m)) });
const order = await loadCourseOrder({ warn: (m) => orderWarns.push(String(m)) });

// ── 2. the catalogue, unfiltered ──────────────────────────────────────────
const full = await listPublicCourses({ includeHidden: true });
const items = full.items ?? [];

// ── 3. the same call the public site makes ────────────────────────────────
const filtered = await listPublicCourses({});
const publicItems = filtered.items ?? [];

// ── 4. the projection a picker would actually need ────────────────────────
const projection = items.map((c) => ({ course_id: c.course_id, course_name: c.course_name }));

// Key census, so "the full payload" is a described object and not a number on
// its own: which keys carry the weight, and what a picker would be paying for.
const keyBytes = new Map();
for (const c of items) {
  for (const [k, v] of Object.entries(c)) {
    keyBytes.set(k, (keyBytes.get(k) ?? 0) + Buffer.byteLength(JSON.stringify(v ?? null), 'utf8'));
  }
}
const heaviest = [...keyBytes].sort((a, b) => b[1] - a[1]).slice(0, 8);

const fullBytes = bytes(items);
const projBytes = bytes(projection);

console.log('=== round 46 — course payload, measured live ===\n');

console.log('-- store health (a failure here invalidates the counts below) --');
console.log(`  loadHiddenCourseIds errors : ${hiddenErrors.length}`);
for (const e of hiddenErrors) console.log(`      ${e.slice(0, 200)}`);
console.log(`  loadCourseOrder warnings   : ${orderWarns.length}`);
for (const w of orderWarns) console.log(`      ${w.slice(0, 200)}`);
console.log(`  hidden-course set size     : ${hidden.size}`);
console.log(`  stored order seeded        : ${order === null ? 'NO (loadCourseOrder returned null)' : 'yes'}`);
console.log(`  COUNTS ARE USABLE          : ${hiddenErrors.length === 0 ? 'yes' : 'NO — the hidden-set read FAILED OPEN'}\n`);

console.log('-- counts --');
console.log(`  courses upstream (includeHidden: true) : ${items.length}`);
console.log(`  courses the public site lists          : ${publicItems.length}`);
console.log(`  difference                             : ${items.length - publicItems.length}`);
console.log(`  hidden ids                             : ${[...hidden].join(', ') || '(none)'}\n`);

console.log('-- serialised size --');
console.log(`  full list                     : ${fullBytes} bytes  (${kb(fullBytes)})`);
console.log(`  {course_id, course_name} only : ${projBytes} bytes  (${kb(projBytes)})`);
console.log(`  ratio                         : ${(fullBytes / projBytes).toFixed(1)}x`);
console.log(`  per course, full              : ${Math.round(fullBytes / (items.length || 1))} bytes`);
console.log(`  per course, projection        : ${Math.round(projBytes / (items.length || 1))} bytes\n`);

console.log('-- where the weight is (top 8 keys, whole catalogue) --');
for (const [k, n] of heaviest) {
  console.log(`  ${k.padEnd(24)} ${String(n).padStart(8)} bytes  ${((n / fullBytes) * 100).toFixed(1)}%`);
}

console.log('\n-- one row, for shape --');
const sample = items[0] ?? {};
console.log(`  keys per course: ${Object.keys(sample).length}`);
console.log(`  ${Object.keys(sample).join(', ')}`);

// The hidden-set read opens a real mongoose connection, and an open connection
// keeps the event loop alive. Closed explicitly rather than left to a
// process.exit(), which on Windows truncates buffered stdout — round 45's
// runner defect, in a smaller costume.
const mongoose = (await import('mongoose')).default;
await mongoose.disconnect().catch(() => {});
