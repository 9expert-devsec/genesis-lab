/**
 * ROUND 47 — how big is the prop the builder routes actually hand down?
 *
 * Round 46 measured the projection in the abstract: map the live catalogue to
 * two keys and serialise it (`scripts/_probe-round46-course-payload.mjs`).
 * This measures the thing that now exists — `catalogueOrEmpty()`, the function
 * both routes call — so the number is about shipped code rather than about an
 * expression written in a probe.
 *
 * It runs under scripts/_probe-live-hooks.mjs, which stubs nothing that reads
 * data; see that file for why the verification suite's loader cannot be used
 * for a measurement (its db stub makes both course stores fail open).
 *
 * READ-ONLY, one upstream GET plus the hidden-set read the adapter performs.
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-live-register.mjs \
 *        scripts/_probe-round47-catalogue-prop.mjs
 */
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const { catalogueOrEmpty, CATALOGUE_KEYS } = await import('@/lib/pageBuilder/courseCatalogue');
const { listPublicCourses } = await import('@/lib/api/public-courses');

// The prop, exactly as a route computes it.
const courses = await catalogueOrEmpty();

// The payload it was projected from, for the ratio. Same call, same options.
const { items } = await listPublicCourses({ includeHidden: true });

const propBytes = bytes(courses);
const fullBytes = bytes(items ?? []);

console.log('=== round 47 — the catalogue prop, measured live ===\n');
console.log(`  catalogueOrEmpty() returned : ${courses.length} rows`);
console.log(`  listPublicCourses returned  : ${(items ?? []).length} rows`);
console.log(`  rows dropped (no course_id) : ${(items ?? []).length - courses.length}\n`);

console.log(`  THE PROP                    : ${propBytes} bytes  (${kb(propBytes)})`);
console.log(`  the payload it came from    : ${fullBytes} bytes  (${kb(fullBytes)})`);
console.log(`  ratio                       : ${(fullBytes / propBytes).toFixed(1)}x`);
console.log(`  per row                     : ${Math.round(propBytes / (courses.length || 1))} bytes\n`);

// The key set actually present, read off the data rather than off the constant
// — a projection that had quietly gained a key would still satisfy a check
// against CATALOGUE_KEYS if that check read the constant on both sides.
const keys = new Set();
for (const row of courses) for (const k of Object.keys(row)) keys.add(k);
console.log(`  keys present across all rows : ${[...keys].sort().join(', ')}`);
console.log(`  declared CATALOGUE_KEYS      : ${[...CATALOGUE_KEYS].sort().join(', ')}`);
console.log(`  they agree                   : ${[...keys].sort().join() === [...CATALOGUE_KEYS].sort().join()}`);

const heavy = ['related_courses', 'training_topics', 'course_teaser'];
const json = JSON.stringify(courses);
console.log(`\n  heavy keys absent from the prop : ${heavy.every((k) => !json.includes(k))}`);
console.log(`  heavy keys present upstream     : ${heavy.every((k) => JSON.stringify(items ?? []).includes(k))}`);

console.log('\n-- the first three rows, verbatim --');
for (const row of courses.slice(0, 3)) console.log(`  ${JSON.stringify(row)}`);

const mongoose = (await import('mongoose')).default;
await mongoose.disconnect().catch(() => {});
