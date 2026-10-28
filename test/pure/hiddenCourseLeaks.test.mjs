import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getPublicCourseByCode } from '@/lib/api/public-courses';
import { dropHiddenCourses } from '@/lib/courses/hiddenCourses';
import { fetchCourses } from '@/lib/pageBuilder/resolveSectionData';
import { buildPromotionsCorpus } from '@/lib/corpus/promotions';
import { dropHiddenCurriculumCourses } from '@/lib/career-paths/dropHiddenCurriculum';
import { namesHiddenCourse } from '@/lib/registration/hiddenCourseGuard';
import { getCourseDetail } from '@/lib/mcp/tools/getCourseDetail';
import { listTrainingRounds } from '@/lib/mcp/tools/listTrainingRounds';

/**
 * The surfaces where a HIDDEN course (`CourseExtension.isPublished === false`)
 * still leaked after listPublicCourses learned to drop it: every one of them
 * reached course data WITHOUT going through that list — a by-code upstream
 * getter, a row embedded in another course, a synced career-path snapshot, a
 * promotion's stored course codes, a schedule row's populated course.
 *
 * Fixtures start from what upstream actually returns (a `/public-course` detail
 * row, a `/schedules` row with its populated `course`, a career_paths document
 * with curriculum snaps), not from a pre-shaped object. The hidden set is the
 * shape loadHiddenCourseIds returns: a Set of UPPERCASED codes.
 *
 * The wiring of each call site into these units is pinned in
 * test/fs/hiddenCourseLeaks; this file proves the units drop the course.
 */

/** A `/public-course` detail row, trimmed to the fields that matter here. */
function upstreamCourse(code, extra = {}) {
  return {
    _id: `oid-${code}`,
    course_id: code,
    course_name: `${code} course`,
    course_teaser: 'teaser',
    course_price: 12900,
    course_netprice: null,
    course_trainingdays: 2,
    course_traininghours: 12,
    course_cover_url: `https://res.cloudinary.com/x/${code}.webp`,
    course_type_public: true,
    course_type_inhouse: true,
    program: { _id: 'p1', program_id: 'POWER-BI', program_name: 'Power BI' },
    skills: [],
    related_courses: [],
    ...extra,
  };
}

const HIDDEN = () => new Set(['HIDDEN-1']);

function byCodeUpstream(rows) {
  return async (code) =>
    rows.find((c) => c.course_id.toLowerCase() === String(code).toLowerCase()) ?? null;
}

// ── 1. the shared PUBLIC by-code lookup ────────────────────────────────────

test('getPublicCourseByCode: a hidden course answers null, exactly like an unknown code', async () => {
  const fetchCourse = byCodeUpstream([upstreamCourse('HIDDEN-1'), upstreamCourse('SHOWN-1')]);
  const deps = { fetchCourse, loadHidden: async () => HIDDEN() };

  assert.equal(await getPublicCourseByCode('HIDDEN-1', deps), null, 'hidden → null');
  assert.equal(await getPublicCourseByCode('hidden-1', deps), null, 'any casing of it → null');
  assert.equal(await getPublicCourseByCode('NO-SUCH', deps), null, 'unknown → null, the same answer');
  assert.equal((await getPublicCourseByCode('SHOWN-1', deps))?.course_id, 'SHOWN-1', 'published → the course');
});

test('getPublicCourseByCode: the stored code may lag a rename — upstream\'s code is checked too', async () => {
  // Asked for by its OLD code, upstream answers with the new one; the
  // extension row was hidden under the new code.
  const deps = {
    fetchCourse: async () => upstreamCourse('HIDDEN-1'),
    loadHidden: async () => HIDDEN(),
  };
  assert.equal(await getPublicCourseByCode('OLD-CODE', deps), null);
});

// ── 2. related courses embedded in another course ──────────────────────────

test('related courses: a hidden course leaves another course\'s related rail', () => {
  // `related_courses` as /public-course populates it on the DETAIL row.
  const host = upstreamCourse('HOST', {
    related_courses: [
      { _id: 'oid-HIDDEN-1', course_id: 'HIDDEN-1', course_name: 'Hidden', course_price: 1 },
      { _id: 'oid-SHOWN-1', course_id: 'SHOWN-1', course_name: 'Shown', course_price: 2 },
    ],
  });
  const kept = dropHiddenCourses(host.related_courses, HIDDEN());
  assert.deepEqual(kept.map((c) => c.course_id), ['SHOWN-1']);
});

// ── 3. MCP ─────────────────────────────────────────────────────────────────

test('MCP get_course_detail: a hidden code gets the same "not found" as an unknown one', async () => {
  const rows = [upstreamCourse('HIDDEN-1'), upstreamCourse('SHOWN-1')];
  // Exactly what lib/mcp/register.js wires: the PUBLIC lookup as the dep.
  const deps = {
    getCourseByCodeInsensitive: (code) =>
      getPublicCourseByCode(code, { fetchCourse: byCodeUpstream(rows), loadHidden: async () => HIDDEN() }),
    listOnlineCourses: async () => ({ items: [] }),
  };
  const unknown = await getCourseDetail({ course_id: 'NO-SUCH' }, deps).catch((e) => e);
  const hidden = await getCourseDetail({ course_id: 'HIDDEN-1' }, deps).catch((e) => e);
  assert.ok(hidden instanceof Error, 'hidden throws');
  assert.equal(
    hidden.message.replace('HIDDEN-1', '<code>'),
    unknown.message.replace('NO-SUCH', '<code>'),
    'and the message is the unknown-code message'
  );
  const shown = await getCourseDetail({ course_id: 'SHOWN-1' }, deps);
  assert.equal(shown.course_id, 'SHOWN-1', 'CONTROL: a published course still resolves');
});

test('MCP list_training_rounds: with no course_id, a hidden course\'s rounds are not listed', async () => {
  const row = (id, code) => ({
    _id: id,
    course: { _id: `oid-${code}`, course_id: code, course_name: `${code} course` },
    dates: ['2026-12-01T00:00:00.000Z'],
    status: 'open',
    type: 'classroom',
  });
  const out = await listTrainingRounds({}, {
    listSchedules: async () => ({ items: [row('r1', 'HIDDEN-1'), row('r2', 'SHOWN-1')] }),
    getCourseByCodeInsensitive: async () => null,
    loadHiddenCourseIds: async () => HIDDEN(),
    todayKey: () => '2026-11-01',
    warn: () => {},
  });
  assert.deepEqual(out.rounds.map((r) => r.course_id), ['SHOWN-1']);
  assert.equal(out.total_matched, 1);
});

// ── 4. page-builder course cards / lists / bundles ─────────────────────────

test('page-builder fetchCourses: a hidden code resolves to nothing, one hidden read for the page', async () => {
  let reads = 0;
  const map = await fetchCourses(['HIDDEN-1', 'SHOWN-1', 'hidden-1'], {
    fetchCourse: byCodeUpstream([upstreamCourse('HIDDEN-1'), upstreamCourse('SHOWN-1')]),
    loadHidden: async () => { reads += 1; return HIDDEN(); },
  });
  assert.deepEqual([...map.keys()], ['SHOWN-1'], 'only the published course is in the map');
  assert.equal(reads, 1, 'ONE hidden-set read, not one per code');
});

// ── 5. promotions corpus (chat corpus + MCP list_live_promotions) ──────────

test('promotions corpus: a hidden course leaves bundles; a deal only on hidden courses leaves', async () => {
  const FUTURE = '2099-01-01T00:00:00.000Z';
  const out = await buildPromotionsCorpus({
    now: new Date('2026-10-01T00:00:00.000Z'),
    readMasterclass: async () => ({ batches: [], courses: [] }),
    readBuilderPages: async () => [],
    readEarlyBirdConfigs: async () => [
      { _id: 'eb-hidden', course_id: 'HIDDEN-1', special_price: 1, deadline: FUTURE, is_active: true },
      { _id: 'eb-shown', course_id: 'SHOWN-1', special_price: 1, deadline: FUTURE, is_active: true },
    ],
    loadHidden: async () => HIDDEN(),
    log: () => {},
  });
  const ids = out.items.map((i) => i.id);
  assert.deepEqual(ids, ['early_bird_config:eb-shown'], 'the hidden course\'s early-bird deal is gone');
  assert.ok(!JSON.stringify(out.items).includes('HIDDEN-1'), 'and its code appears nowhere in the items');
});

// ── 6. career paths ────────────────────────────────────────────────────────

test('career path: the hidden COURSE leaves the curriculum, the path stays', () => {
  // A career_paths document as syncCareerPaths stores it.
  const path = {
    api_slug: 'data-analyst-career-path',
    title: 'Data Analyst',
    curriculum: [
      {
        kind: 'required',
        title: 'Core',
        items: [
          { kind: 'course', course_id: 'HIDDEN-1', snap: { code: 'HIDDEN-1', name: 'Hidden', publicUrl: 'https://x/hidden' } },
          { kind: 'course', course_id: 'SHOWN-1', snap: { code: 'SHOWN-1', name: 'Shown', publicUrl: 'https://x/shown' } },
        ],
      },
      {
        kind: 'elective',
        title: 'Only hidden',
        items: [{ kind: 'course', snap: { code: 'hidden-1', name: 'Hidden again' } }],
      },
      { kind: 'note', title: 'Already empty', items: [] },
    ],
  };
  const out = dropHiddenCurriculumCourses(path, HIDDEN());
  assert.equal(out.title, 'Data Analyst', 'the path itself is kept');
  assert.deepEqual(out.curriculum.map((g) => g.title), ['Core', 'Already empty'],
    'a group left empty by hiding is dropped; one that was empty already is not');
  assert.deepEqual(out.curriculum[0].items.map((i) => i.snap.code), ['SHOWN-1']);
  assert.ok(!JSON.stringify(out).includes('https://x/hidden'), 'no publicUrl of the hidden course remains');
  assert.equal(path.curriculum[0].items.length, 2, 'the stored document is not mutated');
});

// ── 7. public registration POSTs ───────────────────────────────────────────

test('registration guard: a POST naming a hidden course is refused; a published one is not', async () => {
  let reads = 0;
  const loadHidden = async () => { reads += 1; return HIDDEN(); };
  assert.equal(await namesHiddenCourse(['hidden-1', undefined], { loadHidden }), true);
  assert.equal(await namesHiddenCourse(['SHOWN-1', 'OTHER'], { loadHidden }), false);
  assert.equal(await namesHiddenCourse('HIDDEN-1', { loadHidden }), true, 'a single code too');
  assert.equal(reads, 3, 'one read per request, however many codes');
  assert.equal(await namesHiddenCourse([], { loadHidden }), false, 'no code → no read, no refusal');
  assert.equal(reads, 3);
});
