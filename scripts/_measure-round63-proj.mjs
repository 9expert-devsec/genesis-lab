/**
 * ROUND 63 (part 5) — what a round costs, projected.
 *
 * Round 46 measured the course payload and found two of 37 keys carrying 68.6%
 * of it. The equivalent here: the POPULATED course sub-object is repeated once
 * per round. Sizes the four candidate shapes (id-only, picker option, orphan
 * snapshot, full row) that sections F and G of the brief choose between.
 *
 * READ-ONLY. Writes nothing.
 * Run: node --env-file=.env.local scripts/_measure-round63-proj.mjs
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));
const { PUBLIC_SCHEDULE_STATUSES, getAllSchedules } = await import('@/lib/api/schedules');
const b = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');
const { items = [] } = await getAllSchedules({ status: PUBLIC_SCHEDULE_STATUSES });
console.log(`full rows, all 88:            ${b(items)} bytes`);
const noCourse = items.map(({ course, __v, createdAt, updatedAt, ...r }) => r);
console.log(`minus course/__v/timestamps:  ${b(noCourse)} bytes`);
const snap = items.map((r) => ({ _id: r._id, dates: r.dates, type: r.type, signup_url: r.signup_url }));
console.log(`ORPHAN SNAPSHOT shape:        ${b(snap)} bytes  (mean ${Math.round(b(snap)/snap.length)}/round)`);
const idOnly = items.map((r) => String(r._id));
console.log(`ID-ONLY (what F proposes):    ${b(idOnly)} bytes  (mean ${Math.round(b(idOnly)/idOnly.length)}/round)`);
const pick = items.map((r) => ({ _id: r._id, dates: r.dates, status: r.status, type: r.type }));
console.log(`PICKER OPTION row:            ${b(pick)} bytes  (mean ${Math.round(b(pick)/pick.length)}/round)`);
// what the course sub-object costs, repeated per round
const courseBytes = items.reduce((a, r) => a + b(r.course ?? {}), 0);
console.log(`\ncourse sub-object repeats:    ${courseBytes} bytes = ${(100*courseBytes/b(items)).toFixed(1)}% of the payload`);
// worst-case course
const per = new Map();
for (const r of items) { const k = String(r.course?.course_id); per.set(k, (per.get(k) ?? 0) + 1); }
const worst = [...per].sort((a,b2)=>b2[1]-a[1])[0];
console.log(`WORST course by round count:  ${worst[0]} with ${worst[1]} rounds`);
