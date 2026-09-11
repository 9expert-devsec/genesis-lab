import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { COURSE_LIST_ROW_KEYS, projectCourseListRows } from '@/lib/courses/courseListRow';
import { ROOT, readSource } from '../sourceScan.mjs';

/**
 * THE /training-course ROW IS TRIMMED TO WHAT THE PAGE READS — EXACTLY.
 *
 * ── THE MEASUREMENT ─────────────────────────────────────────────────────────
 * Prerendered /training-course, 77 courses, before this projection:
 *
 *     page                         1,826,208 bytes
 *     RSC flight (<script> chunks) 94% of it
 *     CourseListClient `items`       985,495 bytes serialised, 41 keys per row
 *       training_topics              369,252
 *       related_courses              211,625   (nested course objects)
 *       schedules                     63,474
 *       course_objectives             56,284
 *       course_target_audience        33,001
 *       …
 *
 * The cards read 17 of the 41 keys. This file pins three things about the
 * projection that does the trimming:
 *
 *   1. THE EXACT SET — not a lower bound. A key creeping back in goes red,
 *      and so does a key quietly dropped.
 *   2. THE SIZE — in the manner of test/pure/courseCatalogue: a ratio AND an
 *      absolute ceiling, on a fixture whose heavy keys carry realistic bulk.
 *   3. CONSUMER COVERAGE — every key a consumer READS is in the set, and every
 *      key in the set is read by some consumer. Derived from the consumers'
 *      source, not retyped here: the row reads (`c.x`, `course.x`, and
 *      CourseCard's destructure of `course`) are scanned out of every file in
 *      the route's _components/ plus the two helpers the card hands the whole
 *      row to. What the scan cannot see is stated at that test.
 */

// ── 1. the exact set ────────────────────────────────────────────────────────

/**
 * Retyped on purpose. This is the list Phase A justified consumer by
 * consumer; the module's own constant is what the code uses. If the two
 * disagree, one of them changed without the other, and that is the point.
 */
const JUSTIFIED = [
  '_id', 'course_id', 'course_name', 'urlAlias',
  'course_price', 'course_trainingdays', 'course_traininghours',
  'course_cover_url', 'course_teaser', 'course_levels',
  'course_workshop_status', 'course_certificate_status',
  'course_type_public', 'course_type_inhouse',
  'program', 'skills', 'schedules',
];

const bulk = (n, seed) => Array.from({ length: n }, (_, i) => `${seed} ข้อที่ ${i + 1}: เนื้อหาการอบรมโดยละเอียดสำหรับผู้เข้าอบรม`);

/** One enriched row in the shape enrichCoursesWithDetails returns — all 41 keys. */
const fullRow = (i) => ({
  _id: `69b25a3177e3680cba66${String(i).padStart(4, '0')}`,
  course_id: `COURSE-${i}`,
  course_name: `หลักสูตรที่ ${i}`,
  urlAlias: `/course-${i}-training-course`,
  course_price: 8900,
  course_netprice: 9523,
  course_trainingdays: 2,
  course_traininghours: 12,
  course_cover_url: 'https://res.cloudinary.com/x/cover.png',
  course_teaser: 'เรียนรู้การใช้งานจริง ' + 'x'.repeat(120),
  course_levels: '2',
  course_workshop_status: true,
  course_certificate_status: true,
  course_type_public: true,
  course_type_inhouse: true,
  course_promote_status: false,
  program: { _id: 'p1', program_id: 'PBI', program_name: 'Power BI', programiconurl: 'https://res.cloudinary.com/x/pbi.svg' },
  skills: [{ _id: 's1', skill_id: 'DATA', skill_name: 'Data', skilliconurl: 'https://res.cloudinary.com/x/d.svg', skillcolor: '#dee6f1' }],
  schedules: [{ _id: 'sch1', dates: ['2026-10-01', '2026-10-02'], status: 'open', type: 'classroom' }],
  // ── the 24 keys the page never reads ──
  training_topics: bulk(40, 'หัวข้อ'),
  related_courses: Array.from({ length: 4 }, (_, k) => ({ course_id: `REL-${k}`, course_name: 'หลักสูตรที่เกี่ยวข้อง', training_topics: bulk(20, 'หัวข้อ') })),
  course_objectives: bulk(8, 'วัตถุประสงค์'),
  course_target_audience: bulk(5, 'กลุ่มเป้าหมาย'),
  course_prerequisites: bulk(4, 'พื้นฐาน'),
  course_outline_th: bulk(3, 'โครงสร้าง'),
  course_outline_en: bulk(3, 'Outline'),
  course_system_requirements: bulk(2, 'ระบบ'),
  course_doc_paths: ['https://res.cloudinary.com/x/doc.pdf'],
  course_doc_paths_en: [],
  course_roadmap_desktop_url: 'https://res.cloudinary.com/x/rm-d.png',
  course_roadmap_mobile_url: 'https://res.cloudinary.com/x/rm-m.png',
  website_urls: ['https://www.9experttraining.com/course'],
  course_training_topics: bulk(2, 'หัวข้อ'),
  previous_course: { course_id: 'PREV', course_name: 'ก่อนหน้า' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  exam_links: [],
  course_lab_paths: [],
  course_case_study_paths: [],
  sort_order: i,
  __v: 0,
});

const CATALOG = Array.from({ length: 77 }, (_, i) => fullRow(i + 1));

test('the module and the justified list agree, key for key, in order', () => {
  assert.deepEqual([...COURSE_LIST_ROW_KEYS], JUSTIFIED);
});

test('a projected row carries EXACTLY the justified keys — no more, no fewer', () => {
  const [row] = projectCourseListRows([fullRow(1)]);
  assert.deepEqual(Object.keys(row).sort(), [...JUSTIFIED].sort());
  // …and the values are the source's own, untouched.
  assert.equal(row.course_name, 'หลักสูตรที่ 1');
  assert.deepEqual(row.program, fullRow(1).program);
  assert.deepEqual(row.schedules, fullRow(1).schedules);
});

test('the 41-key fixture really has every key the measured payload had', () => {
  // Without this the "24 keys cut" claim below could be true of a thin
  // fixture that never carried them.
  const keys = Object.keys(fullRow(1));
  assert.equal(keys.length, 41, `fixture has ${keys.length} keys`);
  for (const k of ['training_topics', 'related_courses', 'course_objectives', 'course_target_audience', 'course_prerequisites']) {
    assert.ok(keys.includes(k), `fixture lacks ${k}`);
  }
});

test('a key absent from the source row is absent from the projection, not undefined', () => {
  const { urlAlias, ...noAlias } = fullRow(1);
  void urlAlias;
  const [row] = projectCourseListRows([noAlias]);
  assert.equal('urlAlias' in row, false);
});

test('non-rows are dropped and a non-array projects to []', () => {
  assert.deepEqual(projectCourseListRows(null), []);
  assert.deepEqual(projectCourseListRows([null, 'x', fullRow(1)]).length, 1);
});

// ── 2. the size ─────────────────────────────────────────────────────────────

const bytes = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');

test('the projection is dramatically smaller than the enriched input', () => {
  const full = bytes(CATALOG);
  const projected = bytes(projectCourseListRows(CATALOG));
  const ratio = full / projected;
  assert.ok(ratio > 8, `the projection is only ${ratio.toFixed(1)}x smaller — a heavy key is crossing`);
  // An absolute ceiling as well as a ratio, as courseCatalogue does: a ratio
  // alone stays green if BOTH sides grow together.
  assert.ok(projected < 120_000, `the projection is ${projected.toLocaleString()} bytes for 77 rows`);
});

test('CONTROL: the fixture is heavy enough to demonstrate the cost', () => {
  const full = bytes(CATALOG);
  assert.ok(full > 900_000, `the fixture is only ${full.toLocaleString()} bytes; the measured page carried 985,495`);
});

// ── 3. consumer coverage, derived from the consumers' source ────────────────

const COMPONENTS_DIR = path.join(ROOT, 'src', 'app', '(public)', 'training-course', '_components');
/**
 * Helpers the card hands the WHOLE row to. The scan below sees `c.x` /
 * `course.x` inside a file; it cannot follow the row into a function in
 * another module, so those modules are named here. If CourseCard starts
 * passing `course` to a third helper, that helper's reads are invisible to
 * this test until it is added — that is the stated limit.
 */
const ROW_HELPERS = [
  'src/lib/courses/courseLinkHref.js',
  'src/lib/courses/courseCanonicalPath.js',
];

/** Top-level row keys a file reads through `c.` / `course.` / a destructure of `course`. */
function rowReads(code) {
  const keys = new Set();
  for (const m of code.matchAll(/\b(?:c|course)\??\.([A-Za-z_]\w*)/g)) keys.add(m[1]);
  // CourseCard: `const { course_id: id, …, schedules = [] } = course;`
  for (const m of code.matchAll(/const\s*\{([^}]*)\}\s*=\s*course\s*;/g)) {
    for (const part of m[1].split(',')) {
      const key = part.trim().split(/[:=\s]/)[0];
      if (key) keys.add(key);
    }
  }
  return keys;
}

const consumerFiles = readdirSync(COMPONENTS_DIR)
  .filter((n) => n.endsWith('.jsx'))
  .map((n) => `src/app/(public)/training-course/_components/${n}`)
  .concat(ROW_HELPERS);

const readsByFile = new Map(consumerFiles.map((rel) => [rel, rowReads(readSource(rel).code)]));
const allReads = new Set([...readsByFile.values()].flatMap((s) => [...s]));

test('the scan sees the reads it is built on', () => {
  // Controls for the scanner: the destructure, the dotted read, the optional
  // chain, and the helper's own read. A scanner that found none of these
  // would make the coverage assertions below pass on an empty set.
  assert.ok(readsByFile.get('src/app/(public)/training-course/_components/CourseCard.jsx').has('course_cover_url'), 'destructure not seen');
  assert.ok(readsByFile.get('src/app/(public)/training-course/_components/CourseListClient.jsx').has('program'), 'optional-chain read not seen');
  assert.ok(readsByFile.get('src/app/(public)/training-course/_components/CourseTableGroup.jsx').has('course_trainingdays'), 'dotted read not seen');
  assert.ok(readsByFile.get('src/lib/courses/courseCanonicalPath.js').has('course_id'), 'helper read not seen');
  assert.ok(readsByFile.get('src/lib/courses/courseLinkHref.js').has('urlAlias'), 'helper read not seen');
  assert.ok(consumerFiles.length >= 8, `only ${consumerFiles.length} consumer files scanned`);
});

test('every key a consumer reads is in the projected set — the cut cannot go too far', () => {
  const missing = [];
  for (const [rel, keys] of readsByFile) {
    for (const k of keys) if (!COURSE_LIST_ROW_KEYS.includes(k)) missing.push(`${k} (read by ${rel})`);
  }
  assert.deepEqual(missing, [],
    'a consumer reads a key the projection strips — add it to COURSE_LIST_ROW_KEYS with the reader named');
});

test('every key in the projected set is read by some consumer — nothing rides along unread', () => {
  const dead = [...COURSE_LIST_ROW_KEYS].filter((k) => !allReads.has(k));
  assert.deepEqual(dead, [],
    'a key in COURSE_LIST_ROW_KEYS has no reader in the route or its helpers — cut it, or name the reader');
});

test('CONTROL: a read the scan cannot see WOULD be reported if added', () => {
  // Splice a read of a stripped key into a consumer's code and watch the
  // coverage check name it — proof the assertion above is live.
  const rel = 'src/app/(public)/training-course/_components/CourseCardGroup.jsx';
  const poisoned = readSource(rel).code + '\nconst t = c.training_topics;';
  const keys = rowReads(poisoned);
  assert.ok(keys.has('training_topics'));
  assert.equal(COURSE_LIST_ROW_KEYS.includes('training_topics'), false);
});
