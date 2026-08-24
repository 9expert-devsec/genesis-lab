/**
 * ROUND 63 — measure MSDB rounds the way round 46 measured courses.
 * READ-ONLY. Answers: how many rounds per course, what a round object holds,
 * its serialised size, and whether it carries a stable identifier.
 * Run: node --env-file=.env.local scripts/_measure-round63-rounds.mjs
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));

const { PUBLIC_SCHEDULE_STATUSES, listSchedulesByCourse, getAllSchedules } =
  await import('@/lib/api/schedules');
const { listPublicCourses } = await import('@/lib/api/public-courses');

const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');

const all = await getAllSchedules({ status: PUBLIC_SCHEDULE_STATUSES });
const items = all?.items ?? [];
console.log(`ALL UPCOMING ROUNDS (public statuses): ${items.length}`);
if (items.length) {
  const keys = Object.keys(items[0]);
  console.log(`KEYS on a round (${keys.length}): ${keys.join(', ')}`);
  console.log('SAMPLE:', JSON.stringify(items[0], null, 2));
  const sizes = items.map(bytes).sort((a, b) => a - b);
  const sum = sizes.reduce((a, b) => a + b, 0);
  console.log(`SIZE bytes: min=${sizes[0]} median=${sizes[Math.floor(sizes.length/2)]} max=${sizes[sizes.length-1]} mean=${Math.round(sum/sizes.length)}`);
  // key union / presence across all rounds
  const presence = new Map();
  for (const it of items) for (const k of Object.keys(it)) presence.set(k, (presence.get(k) ?? 0) + 1);
  console.log('KEY PRESENCE across all rounds:');
  for (const [k, n] of [...presence].sort((a,b)=>b[1]-a[1])) {
    const t = new Set(items.map((i) => (i[k] === undefined ? 'absent' : i[k] === null ? 'null' : Array.isArray(i[k]) ? 'array' : typeof i[k])));
    console.log(`   ${k.padEnd(22)} ${String(n).padStart(4)}/${items.length}  ${[...t].join('|')}`);
  }
  // rounds per course
  const perCourse = new Map();
  for (const it of items) {
    const c = String(it.course?._id ?? it.course ?? '?');
    perCourse.set(c, (perCourse.get(c) ?? 0) + 1);
  }
  const counts = [...perCourse.values()].sort((a,b)=>a-b);
  console.log(`\nCOURSES WITH >=1 UPCOMING ROUND: ${perCourse.size}`);
  console.log(`ROUNDS PER COURSE: min=${counts[0]} median=${counts[Math.floor(counts.length/2)]} max=${counts[counts.length-1]} mean=${(counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(2)}`);
  const hist = {};
  for (const n of counts) hist[n] = (hist[n] ?? 0) + 1;
  console.log('HISTOGRAM (rounds → #courses):', JSON.stringify(hist));
  // _id stability check surface
  const withId = items.filter((i) => i._id).length;
  console.log(`\nROUNDS WITH _id: ${withId}/${items.length}`);
  const ids = new Set(items.map((i) => String(i._id)));
  console.log(`DISTINCT _id: ${ids.size}`);
  // other candidate identifiers
  for (const k of ['schedule_id','class_id','code','round','name','title','signup_url']) {
    const have = items.filter((i) => i[k] !== undefined && i[k] !== null && i[k] !== '').length;
    console.log(`CANDIDATE ${k.padEnd(12)}: present on ${have}/${items.length}`);
  }
}

// course catalogue size for the picker question
const cat = await listPublicCourses({});
console.log(`\nPUBLIC COURSES (catalogue): ${cat?.items?.length ?? 0}`);

// one course, the per-course call the section actually makes
const first = items[0];
if (first?.course?._id) {
  const oid = String(first.course._id);
  const one = await listSchedulesByCourse(oid, { limit: 20, status: PUBLIC_SCHEDULE_STATUSES });
  const rows = one?.items ?? [];
  console.log();
  if (rows[0]) {
    console.log('PER-COURSE ROUND KEYS:', Object.keys(rows[0]).join(', '));
    console.log('PER-COURSE SAMPLE:', JSON.stringify(rows[0], null, 2));
    console.log();
  }
  const plain = await listSchedulesByCourse(oid, { limit: 20 });
  console.log();
}
