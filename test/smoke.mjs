// SMOKE tier (item 1) — NOT part of `npm test`. Needs a live MSDB upstream and a
// server API key, so it is a different animal from the pure/fs/render invariants:
// it can go red because a third party is down or a secret is missing, neither of
// which is a code defect. Run it deliberately: `npm run test:smoke` (which passes
// --env-file=.env.local). It never gates the suite and is never in CI.
//
// What it proves that the gated suite cannot: the fetch-hoist actually resolves
// against real MSDB — a real course_id → a real course, a bogus one → null
// (fail-closed) — end to end through the same resolveSectionData the public page
// awaits.
process.env.NODE_ENV = 'production';
import { register } from 'node:module';
register(new URL('./loader.mjs', import.meta.url));

const { listPublicCourses } = await import('@/lib/api/public-courses');
const { resolveSectionData } = await import('@/lib/pageBuilder/resolveSectionData');

let failed = false;
const check = (name, cond) => { if (!cond) failed = true; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

try {
  const { items } = await listPublicCourses();
  const realId = items?.[0]?.course_id;
  check(`catalog returned courses (${items?.length ?? 0})`, Boolean(realId));

  const map = await resolveSectionData([
    { id: 'good', type: 'course_card', content: { courseId: realId } },
    { id: 'bad', type: 'course_card', content: { courseId: 'NOPE-ZZZ-999' } },
  ]);
  check(`real course_id "${realId}" resolves to a course (${map.good?.course_name ?? '—'})`, Boolean(map.good));
  check('bogus course_id resolves to null (fail-closed)', map.bad === null);
} catch (e) {
  failed = true;
  console.log('SMOKE ERROR (upstream/key?):', e?.message);
}

console.log(`\n[smoke] ${failed ? 'FAILED' : 'ok'}`);
process.exit(failed ? 1 : 0);
