/**
 * ORIGIN-1 - READ-ONLY counts for sections 3 and 4b.
 *
 * GET only. No POST/PUT/PATCH/DELETE against MSDB, no write against Mongo.
 *
 * Answers three questions the sweep could not, because the authoritative rows
 * are NOT in our Mongo:
 *   1. how many MSDB schedule rounds carry a preview-origin signup_url, and how
 *      many of those are already in the past;
 *   2. how many courses are published (upstream list MINUS
 *      CourseExtension.isPublished === false, keys uppercased on both sides,
 *      which is lib/courses/hiddenCourses' own matching rule);
 *   3. how many masterclass courses there are.
 *
 * Usage: node --env-file=.env.local scripts/_audit-origin1-counts.mjs
 */
import mongoose from 'mongoose';

const PREVIEW = 'genesis-lab.9expert.app';
const BASE = process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai';
const KEY  = process.env.AI_API_KEY;
if (!KEY) { console.error('AI_API_KEY missing'); process.exit(1); }

async function get(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-api-key': KEY, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path} - ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const items = (j) => j.items ?? j.data?.items ?? j.data ?? [];

// ---- 1. schedules -----------------------------------------------------------
const sched = await get('/schedules', { from: '2000-01-01', limit: 5000 });
const rounds = items(sched);
console.log('=== SCHEDULES (MSDB upstream, NOT our Mongo) ===');
console.log('rounds returned          :', rounds.length);
console.log('reported total           :', sched.summary?.total ?? sched.total ?? '(none)');

const withUrl = rounds.filter((r) => typeof r.signup_url === 'string' && r.signup_url);
const preview = withUrl.filter((r) => r.signup_url.includes(PREVIEW));
console.log('rounds with a signup_url :', withUrl.length);
console.log('  -> preview origin      :', preview.length);
console.log('  -> production origin   :', withUrl.filter((r) => r.signup_url.includes('9experttraining.com')).length);
console.log('  -> some other origin   :', withUrl.filter((r) => !r.signup_url.includes(PREVIEW) && !r.signup_url.includes('9experttraining.com')).length);

const today = new Date().toISOString().slice(0, 10);
const lastDay = (r) => (r.dates ?? []).map((d) => String(d).slice(0, 10)).sort().at(-1) ?? '';
const past   = preview.filter((r) => lastDay(r) && lastDay(r) < today);
const future = preview.filter((r) => !lastDay(r) || lastDay(r) >= today);
console.log(`  -> of those, FINISHED (last day < ${today}) :`, past.length);
console.log('  -> of those, current/upcoming              :', future.length);

const numeric = preview.filter((r) => /[?&]class=\d+(&|$)/.test(r.signup_url));
console.log('  -> shape: numeric-id (MSDB upstream style) :', numeric.length);
console.log('  -> shape: slug+ObjectId (genesis-created)  :', preview.length - numeric.length);
console.log('  sample :', preview.slice(0, 3).map((r) => r.signup_url).join('\n           '));

// ---- 2. courses -------------------------------------------------------------
const courses = items(await get('/public-course', { limit: 5000 }));
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const db = mongoose.connection.db;
const exts = await db.collection('course_extensions').find({}, { projection: { courseId: 1, isPublished: 1 } }).toArray();
const hidden = new Set(exts.filter((e) => e.isPublished === false).map((e) => String(e.courseId ?? '').trim().toUpperCase()));

console.log('\n=== COURSES ===');
console.log('upstream /public-course rows      :', courses.length);
console.log('course_extensions rows            :', exts.length);
console.log('  of which isPublished === false  :', hidden.size);
const visible = courses.filter((c) => !hidden.has(String(c.course_id ?? c.courseId ?? '').trim().toUpperCase()));
console.log('PUBLISHED courses (upstream - hidden):', visible.length);

// ---- 3. masterclass ---------------------------------------------------------
const mc = await db.collection('masterclass_courses').find({}).toArray();
console.log('\n=== MASTERCLASS ===');
console.log('masterclass_courses documents :', mc.length);
for (const m of mc) {
  console.log(`  - ${m.slug ?? m._id}  isPublished=${m.isPublished ?? '(unset)'}  status=${m.status ?? '(unset)'}`);
}
console.log('\n=== TOTAL for the หลักสูตร stat ===');
console.log(`${visible.length} published + ${mc.length} masterclass = ${visible.length + mc.length}`);
await mongoose.disconnect();
