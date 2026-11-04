/**
 * The route drive behind test/fs/allCoursesBoundary.test.mjs, in ITS OWN
 * PROCESS. Prints one JSON object on stdout and exits.
 *
 * Same idiom as test/bundleAttendeeSeed.case.mjs, for two reasons of its own:
 *
 *   · `aiFetch` reads AI_API_KEY into a constant when src/lib/api/client.js
 *     first loads. In the runner's one process that has already happened
 *     without a key, so a program or skill could never resolve there.
 *   · ProgramPageConfig, SkillPageConfig and RedirectRule are real mongoose
 *     models with no connection behind them. Their statics are replaced here,
 *     which is safe only because this process is nobody else's, and it keeps
 *     the drive off test/fakeDb.mjs and its shared store.
 *
 * ── WHAT IT DRIVES ────────────────────────────────────────────────────────────
 * The real `CatchAllPage`, one request per slug, reporting what came back: the
 * component it rendered, or the Next control-flow signal it threw. `fetched`
 * lists the upstream paths each request read, so a return of the unfiltered
 * catalog is visible as a read of /public-course.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  node test/allCoursesBoundary.case.mjs
 */
import { register } from 'node:module';

process.env.AI_API_KEY = 'case-key';
register(new URL('./loader.mjs', import.meta.url));

const HOST = 'www.9experttraining.com';

const PROGRAM_CONFIGS = [
  { programId: 'EXC', urlSlug: 'excel-all-courses', isPublished: true },
  { programId: 'OLD', urlSlug: 'hidden-all-courses', isPublished: false },
  { programId: 'GONE', urlSlug: 'gone-upstream-all-courses', isPublished: true },
];
const SKILL_CONFIGS = [{ skillId: 'DATA', urlSlug: 'data-all-courses', isPublished: true }];
const RULES = [
  { host: HOST, source: '/365-copilot-all-courses', destination: '/microsoft-copilot-all-courses', permanent: true, isActive: true },
  { host: HOST, source: '/moved-for-now-all-courses', destination: '/excel-all-courses', permanent: false, isActive: true },
  { host: HOST, source: '/excel-all-courses', destination: '/must-never-win', permanent: true, isActive: true },
];

const UPSTREAM = {
  '/programs': { items: [{ _id: 'p1', program_id: 'EXC', program_name: 'Excel' }, { _id: 'p2', program_id: 'OLD', program_name: 'Old' }] },
  '/skills': { items: [{ _id: 's1', skill_id: 'DATA', skill_name: 'Data' }] },
  '/public-course': { items: [{ course_id: 'C1', course_name: 'Any course' }] },
};

const query = (value) => ({
  select() { return this; },
  limit() { return this; },
  sort() { return this; },
  lean: async () => value,
});
const fieldsMatch = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v);
const modelOver = (rows) => ({
  findOne: (filter) => query(rows.find((r) => fieldsMatch(r, filter)) ?? null),
  find: (filter = {}) => query(rows.filter((r) => fieldsMatch(r, filter))),
});

// The models not replaced here (hidden courses, program order) have no
// connection either. Their readers degrade on a failed query, so make it fail
// now rather than after mongoose's ten-second buffer, once per request.
const { default: mongoose } = await import('mongoose');
mongoose.set('bufferCommands', false);

const { default: ProgramPageConfig } = await import('@/models/ProgramPageConfig');
const { default: SkillPageConfig } = await import('@/models/SkillPageConfig');
const { default: RedirectRule } = await import('@/models/RedirectRule');
const { default: NotFoundHit } = await import('@/models/NotFoundHit');
Object.assign(ProgramPageConfig, modelOver(PROGRAM_CONFIGS));
Object.assign(SkillPageConfig, modelOver(SKILL_CONFIGS));
Object.assign(RedirectRule, modelOver(RULES));

/** The 404 log: what the boundary recorded, because a soft 200 records nothing. */
const recorded = [];
NotFoundHit.updateOne = async (filter) => { recorded.push(filter.path); return {}; };

let fetched = [];
globalThis.fetch = async (url) => {
  const { pathname } = new URL(String(url));
  const path = pathname.replace(/^.*\/api\/ai/, '');
  fetched.push(path);
  return new Response(JSON.stringify(UPSTREAM[path] ?? { items: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const nextHeaders = await import('./stub-next-headers.mjs');
nextHeaders.setHeaders({ host: HOST });

const { default: CatchAllPage } = await import('@/app/(public)/[...slug]/page');
const { ProgramPageClient } = await import('@/app/(public)/program/[slug]/_components/ProgramPageClient');
const { SkillPageClient } = await import('@/app/(public)/skill/[slug]/_components/SkillPageClient');

async function drive(segment) {
  fetched = [];
  try {
    const element = await CatchAllPage({
      params: Promise.resolve({ slug: [segment] }),
      searchParams: Promise.resolve({}),
    });
    const props = element?.props ?? {};
    let rendered = 'other';
    if (element?.type === ProgramPageClient) rendered = 'program';
    if (element?.type === SkillPageClient) rendered = 'skill';
    return {
      rendered,
      entity: props.program?.program_id ?? props.skill?.skill_id ?? null,
      fetched: [...fetched],
    };
  } catch (err) {
    return { thrown: err?.digest ?? String(err?.message ?? err), fetched: [...fetched] };
  }
}

const SLUGS = [
  '365-copilot-all-courses',
  'moved-for-now-all-courses',
  'no-such-thing-all-courses',
  'hidden-all-courses',
  'gone-upstream-all-courses',
  'excel-all-courses',
  'data-all-courses',
];

const out = {};
for (const slug of SLUGS) out[slug] = await drive(slug);
await new Promise((resolve) => { setTimeout(resolve, 20); });
out.recorded = recorded;

console.log(JSON.stringify(out));
process.exit(0);
