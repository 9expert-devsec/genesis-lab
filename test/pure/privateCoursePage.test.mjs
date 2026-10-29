import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toPrivateCourseView, privateProgramView } from '@/lib/courses/privateCourseView';
import { courseSectionLinks } from '@/lib/courseSectionNav';
import { resolveCourse } from '@/lib/resolveCourse';
import { resolveHiddenCourseForAdmin } from '@/lib/courses/adminCoursePreview';
import { courseMetadata } from '@/lib/courses/courseMetadata';
import { outlineFromFormValue } from '@/lib/courses/courseOutline';

/**
 * The PUBLIC page of a genesis-only private course: what it resolves to, what
 * data it hands its components, which sidebar entries it shows, and what its
 * metadata says.
 *
 * Fixtures start from what is actually STORED: a `private_courses` document as
 * `.lean()` returns it (an ObjectId-ish `_id`, timestamps, every field the
 * create action writes, refs as course_id codes) and its CourseExtension row —
 * not from an already-reduced view.
 */

const PRIVATE_DOC = Object.freeze({
  _id: '6721aa00000000000000c0de',
  course_id: 'ZZTEST-PRIVATE-01',
  course_name: 'Private Excel for ACME',
  course_teaser: 'A course for one client.',
  course_trainingdays: 2,
  course_traininghours: 12,
  course_price: 12900,
  course_netprice: 9900,
  course_cover_url: 'https://res.cloudinary.com/x/zz.webp',
  course_roadmap_desktop_url: 'https://res.cloudinary.com/x/roadmap-d.svg',
  course_roadmap_mobile_url: 'https://res.cloudinary.com/x/roadmap-m.svg',
  course_levels: '2',
  course_type_public: true,
  course_type_inhouse: true,
  course_workshop_status: true,
  course_certificate_status: true,
  course_promote_status: true,
  sort_order: 3,
  program: '6650aa0000000000000000a1',
  skills: ['6650bb0000000000000000b1'],
  course_objectives: ['objective'],
  course_target_audience: ['finance team'],
  course_prerequisites: ['Excel basics'],
  course_system_requirements: ['Excel 365'],
  training_topics: [{ title: 'Topic 1', bullets: ['a'] }],
  course_outline_th: outlineFromFormValue('/files/course-outline/zztest-private-01-course-outline-th.pdf'),
  course_outline_en: outlineFromFormValue(''),
  previous_course: 'MSE-L1',
  related_courses: ['MSE-L2', 'MSE-L3'],
  privateProgram: null,
  privateSkills: ['6730cc0000000000000000c1'],
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  __v: 0,
});

const PRIVATE_EXT = Object.freeze({
  courseId: 'ZZTEST-PRIVATE-01',
  urlAlias: '/acme-excel',
  formerAliases: [],
  formerCodes: [],
  isPublished: true,
  metaTitle: 'Excel for ACME',
  metaDescription: 'Private training',
  ogImage: 'https://res.cloudinary.com/x/og.webp',
  upstreamId: '',
});

// What `/programs` returns for the program the course points at.
const PROGRAMS = [
  { _id: '6650aa0000000000000000a1', program_id: 'EXCEL', program_name: 'Excel', programcolor: '#1D6F42', programiconurl: 'https://x/excel.svg' },
];

// An MSDB detail row, for the "public path unchanged" pins.
const MSDB_COURSE = Object.freeze({ _id: 'oid-mse', course_id: 'MSE-L1', course_name: 'Excel L1', course_price: 4500 });
const MSDB_EXT = Object.freeze({ courseId: 'MSE-L1', urlAlias: '/excel-l1', isPublished: true });

const DROPPED = [
  'course_price', 'course_netprice', 'related_courses', 'previous_course',
  'course_roadmap_desktop_url', 'course_roadmap_mobile_url', 'skills',
  'sort_order', 'course_promote_status', '_id', 'createdAt', 'updatedAt', '__v',
  'schedules', 'earlyBird', 'promotions',
  // Round 2b's link fields — resolved through the program seam, never passed raw.
  'privateProgram', 'privateSkills',
];

// ── data minimisation ──────────────────────────────────────────────────────

test('toPrivateCourseView drops every field only a hidden section reads', () => {
  const view = toPrivateCourseView(PRIVATE_DOC, { programs: PROGRAMS });
  for (const key of DROPPED) assert.ok(!(key in view), `${key} reached the view`);
  const text = JSON.stringify(view);
  assert.ok(!text.includes('12900') && !text.includes('9900'), 'no price number anywhere in the payload');
  assert.ok(!text.includes('roadmap'), 'no roadmap URL');
  assert.ok(!text.includes('MSE-L2'), 'no related course code');
});

test('toPrivateCourseView keeps what the kept sections render', () => {
  const view = toPrivateCourseView(PRIVATE_DOC, { programs: PROGRAMS });
  for (const key of ['course_id', 'course_name', 'course_teaser', 'course_trainingdays',
    'course_traininghours', 'course_levels', 'course_type_public', 'course_type_inhouse', 'course_workshop_status',
    'course_certificate_status', 'course_cover_url', 'course_objectives', 'course_target_audience',
    'course_prerequisites', 'course_system_requirements', 'training_topics',
    'course_outline_th', 'course_outline_en']) {
    assert.deepEqual(view[key], PRIVATE_DOC[key], `${key} kept as stored`);
  }
  // THE PROGRAM SEAM: an MSDB program id string → what CourseHero reads, plus
  // the colour CourseDetail picks the hero background from (round 2b).
  assert.deepEqual(view.program, {
    _id: PROGRAMS[0]._id, program_name: 'Excel', programiconurl: 'https://x/excel.svg', programcolor: '#1D6F42',
  });
  assert.equal(privateProgramView('no-such-program', PROGRAMS), null);
});

// ── sidebar ────────────────────────────────────────────────────────────────

test('the private sidebar shows none of the four hidden sections', () => {
  // Exactly the inputs CourseDetail derives on a private page: no schedules,
  // related courses or FAQs were fetched, and the view has no roadmap URL.
  const view = toPrivateCourseView(PRIVATE_DOC, { programs: PROGRAMS });
  const shown = courseSectionLinks({ course: view, hasSchedules: false, hasRelated: false, hasFaqs: false })
    .filter((l) => l.show).map((l) => l.id);
  for (const id of ['schedule', 'roadmap', 'faq', 'related']) assert.ok(!shown.includes(id), `${id} is listed`);
  assert.deepEqual(shown, ['description', 'objective', 'target', 'prerequisite', 'requirement', 'outline']);

  // CONTROL: the STORED document would have listed Road Map.
  const raw = courseSectionLinks({ course: PRIVATE_DOC, hasSchedules: false, hasRelated: false, hasFaqs: false })
    .filter((l) => l.show).map((l) => l.id);
  assert.ok(raw.includes('roadmap'));
});

// ── resolution ─────────────────────────────────────────────────────────────

function deps({ ext = PRIVATE_EXT, calls = { msdb: 0, private: 0 } } = {}) {
  const exts = [ext, MSDB_EXT];
  return {
    calls,
    deps: {
      fetchExtensionByAlias: async (a) => exts.find((e) => e.urlAlias === a) ?? null,
      fetchExtension: async (code) => exts.find((e) => e.courseId === code) ?? null,
      fetchExtensionByFormerAlias: async () => null,
      fetchExtensionByFormerCode: async () => null,
      fetchCourse: async (code) => {
        calls.msdb += 1;
        return String(code).toUpperCase() === 'MSE-L1' ? MSDB_COURSE : null;
      },
      fetchPrivateCourse: async (code) => {
        calls.private += 1;
        return String(code).toUpperCase() === PRIVATE_DOC.course_id ? PRIVATE_DOC : null;
      },
    },
  };
}

test('a private course resolves by code path AND alias as kind private — with no MSDB call', async () => {
  const h = deps();
  const byCode = await resolveCourse('zztest-private-01-training-course', h.deps);
  assert.equal(byCode.kind, 'private');
  assert.equal(byCode.mode, 'code');
  assert.equal(byCode.course, PRIVATE_DOC);
  assert.equal(byCode.extension, PRIVATE_EXT);
  const byAlias = await resolveCourse('acme-excel', h.deps);
  assert.equal(byAlias.kind, 'private');
  assert.equal(byAlias.mode, 'alias');
  assert.equal(h.calls.msdb, 0, 'the private path never asked MSDB');
});

test('an MSDB course resolves exactly as before — one cheap private miss, no kind', async () => {
  const h = deps();
  assert.deepEqual(
    await resolveCourse('mse-l1-training-course', h.deps),
    { course: MSDB_COURSE, extension: MSDB_EXT, mode: 'code' }
  );
  assert.deepEqual(
    await resolveCourse('excel-l1', h.deps),
    { course: MSDB_COURSE, extension: MSDB_EXT, mode: 'alias' }
  );
  assert.equal(h.calls.private, 2, 'one private lookup per resolve');
});

test('an unpublished private course 404s on both URLs; includeHidden opens it', async () => {
  const hidden = { ...PRIVATE_EXT, isPublished: false };
  const h = deps({ ext: hidden });
  assert.equal(await resolveCourse('zztest-private-01-training-course', h.deps), null);
  assert.equal(await resolveCourse('acme-excel', h.deps), null);
  const opened = await resolveCourse('acme-excel', { ...h.deps, includeHidden: true });
  assert.equal(opened.kind, 'private');
});

test('?preview=1 with an admin session renders the hidden private course; without one it does not', async () => {
  const h = deps({ ext: { ...PRIVATE_EXT, isPublished: false } });
  const gate = (session) => ({
    findHidden: async () => PRIVATE_DOC.course_id,
    getSession: async () => session,
    resolve: (seg, opts) => resolveCourse(seg, { ...h.deps, ...opts }),
  });
  const admin = await resolveHiddenCourseForAdmin('acme-excel', { preview: '1' }, gate({ user: { id: 'a1' } }));
  assert.equal(admin?.kind, 'private');
  assert.equal(await resolveHiddenCourseForAdmin('acme-excel', { preview: '1' }, gate(null)), null, 'no session → nothing');
  assert.equal(await resolveHiddenCourseForAdmin('acme-excel', {}, gate({ user: { id: 'a1' } })), null, 'no ?preview=1 → nothing');
});

// ── metadata ───────────────────────────────────────────────────────────────

test('private metadata is noindex/nofollow with NORMAL OG; a normal course is unchanged', () => {
  const canonicalUrl = 'https://www.9experttraining.com/acme-excel';
  const priv = courseMetadata({ course: PRIVATE_DOC, extension: PRIVATE_EXT, canonicalUrl, isPrivate: true });
  assert.deepEqual(priv.robots, { index: false, follow: false });
  assert.equal(priv.openGraph.title, 'Excel for ACME', 'OG title present, from the SEO rail');
  assert.deepEqual(priv.openGraph.images, [{ url: PRIVATE_EXT.ogImage }]);
  assert.equal(priv.alternates.canonical, canonicalUrl, 'its own canonical, nothing else');

  const normalUrl = 'https://www.9experttraining.com/excel-l1';
  const normal = courseMetadata({
    course: { ...MSDB_COURSE, course_teaser: 'Learn Excel', course_cover_url: 'https://x/c.webp' },
    extension: MSDB_EXT,
    canonicalUrl: normalUrl,
  });
  // The exact object generateMetadata returned before this round.
  assert.deepEqual(normal, {
    title: 'Excel L1',
    description: 'Learn Excel',
    alternates: { canonical: normalUrl },
    openGraph: { title: 'Excel L1', description: 'Learn Excel', url: normalUrl, images: [{ url: 'https://x/c.webp' }] },
  });
});
